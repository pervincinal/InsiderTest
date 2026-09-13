import type { Command, GameState, LevelDef, SimEvent } from '../sim/types';
import { C } from '../sim/constants';
import { Rng } from '../sim/rng';
import { createState } from '../sim/create';
import { getOutcome } from '../sim/outcome';
import { LEVELS } from '../levels/index';
import { enemyCommands, isAiTick, referencePlayerCommands } from '../ai/index';
import type { View } from '../render/view';
import { applyTransform, clipToMap } from '../render/view';
import type { PlayUi } from '../render/draw';
import { drawGame } from '../render/draw';
import { HUD, PAUSE } from '../render/layout';
import { inRect } from '../render/widgets';
import { ParticleSystem } from '../render/particles';
import type { PointerPoint } from '../input/pointer';
import { PlayGestures } from '../input/pointer';
import { GameLoop } from './loop';
import { recordWin, starsFor, writeSave } from './save';
import type { App, Screen } from './screens';
import { ResultScreen } from './screens';
import type { Tutorial, TutorialStep } from './tutorial';
import { drawTutorial, tutorialFor } from './tutorial';
import { onPlayerCommand, onSimEvents, onSimFrame, resetAudioLevel } from '../audio/index';

/** Transient visual effect driven by sim events (capture flash / death puff). */
interface Effect {
  x: number;
  y: number;
  color: string;
  bornMs: number;
  lifeMs: number;
  kind: 'ring' | 'puff';
}

export class PlayScreen implements Screen {
  readonly name = 'play' as const;
  readonly loop: GameLoop;
  readonly gestures: PlayGestures;
  private readonly effects: Effect[] = [];
  /** Toy-look particles (render/particles.ts); fed straight from the loop's event hook. */
  private readonly particles = new ParticleSystem();
  private enemyRngs = new Map<string, Rng>();
  private playerRng: Rng;
  private autoplay = false;
  private finishedHandled = false;
  private nowMs = 0;
  private coinsEarned = 0;
  private readonly tutorial: Tutorial | null;

  constructor(
    private readonly app: App,
    readonly level: LevelDef,
    seed: number = (Date.now() >>> 0) || 1,
    speed = 1,
  ) {
    this.loop = new GameLoop({
      beforeTick: (s) => this.runAi(s),
      onEvents: (ev) => {
        this.particles.onEvents(ev, this.state, this.app.palette(), this.nowMs);
        this.onEvents(ev);
      },
    });
    this.loop.speed = speed;
    this.loop.load(createState(level, seed));
    resetAudioLevel();
    this.playerRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    level.enemies.forEach((e, i) => this.enemyRngs.set(e.owner, new Rng((seed + 1013904223 * (i + 1)) >>> 0)));
    this.tutorial = tutorialFor(level.id, app.save.stars[String(level.id)] ?? 0);
    this.gestures = new PlayGestures({
      getState: () => (this.loop.finished ? null : this.loop.state),
      getSendRatio: () => this.app.save.settings.sendRatio,
      onCommand: (cmd) => {
        this.tutorial?.onCommand(cmd, this.state);
        onPlayerCommand(cmd, this.state); // `send` has no sim event, so the tick is keyed off the command
        this.loop.enqueue(cmd);
      },
    });
  }

  /** The tutorial step currently on screen (null when none / paused / finished). */
  tutorialStep(): TutorialStep | null {
    if (!this.tutorial || this.loop.paused || this.loop.finished) return null;
    return this.tutorial.current(this.state);
  }

  get state(): GameState {
    return this.loop.state!;
  }

  /* ----- AI wiring: every C.AI_TICK_MS of sim time the loop applies these right before the tick ----- */
  private runAi(state: GameState): Command[] | undefined {
    if (!isAiTick(state)) return undefined;
    const cmds: Command[] = [];
    for (const enemy of state.enemies) {
      const rng = this.enemyRngs.get(enemy.owner);
      if (rng) cmds.push(...enemyCommands(state, enemy, rng));
    }
    if (this.autoplay) cmds.push(...referencePlayerCommands(state, this.playerRng));
    return cmds;
  }

  setAutoplay(on: boolean): void {
    this.autoplay = on;
  }

  setSpeed(n: number): void {
    this.loop.speed = Math.max(0.1, Math.min(20, n));
  }

  private onEvents(events: SimEvent[]): void {
    const pal = this.app.palette();
    for (const ev of events) {
      if (ev.type === 'capture') {
        const t = this.state.towers[ev.towerId];
        if (t) this.effects.push({ x: t.x, y: t.y, color: pal.owners[ev.by], bornMs: this.nowMs, lifeMs: 450, kind: 'ring' });
      } else if (ev.type === 'unitDied') {
        this.effects.push({ x: ev.x, y: ev.y, color: pal.owners[ev.owner], bornMs: this.nowMs, lifeMs: 300, kind: 'puff' });
      } else if (ev.type === 'upgrade') {
        const t = this.state.towers[ev.towerId];
        if (t) this.effects.push({ x: t.x, y: t.y, color: pal.star, bornMs: this.nowMs, lifeMs: 350, kind: 'ring' });
      }
    }
    onSimEvents(events, this.state);
  }

  update(dtMs: number, nowMs: number): void {
    this.nowMs = nowMs;
    this.gestures.tick(nowMs);
    this.tutorial?.onSelect(this.gestures.selectedTowerId, this.state);
    this.loop.advance(dtMs);
    onSimFrame(this.state); // own-unit arrivals are detected by diffing units (no sim event for them)
    if (this.loop.finished && !this.finishedHandled) {
      this.finishedHandled = true;
      this.finish();
    }
  }

  private buildUi(): PlayUi {
    const outcome = getOutcome(this.state);
    const idx = LEVELS.findIndex((l) => l.id === this.level.id);
    return {
      level: this.level,
      palette: this.app.palette(),
      alpha: this.loop.alpha,
      selectedTowerId: this.gestures.selectedTowerId,
      hoverTowerId: this.gestures.hoverTowerId,
      pressRoadId: this.gestures.pressRoadId,
      pressProgress: this.gestures.pressProgress,
      paused: this.loop.paused,
      sendRatio: this.app.save.settings.sendRatio,
      outcome,
      stars: outcome === 'won' ? starsFor(this.level, this.state.time) : 0,
      hasNext: idx >= 0 && idx + 1 < LEVELS.length,
      speed: this.loop.speed,
      coinsEarned: this.coinsEarned,
      coinsTotal: this.app.save.coins,
      particles: this.particles,
    };
  }

  private finish(): void {
    if (getOutcome(this.state) === 'won') {
      const stars = starsFor(this.level, this.state.time);
      this.coinsEarned = recordWin(this.app.save, this.level.id, stars, C.COINS_PER_STAR);
    }
    const ui = this.buildUi(); // after recordWin so the coin totals are final
    this.gestures.reset();
    this.app.go(new ResultScreen(this.app, { state: this.state, level: this.level, ui }));
  }

  draw(view: View, nowMs: number): void {
    const ui = this.buildUi();
    drawGame(view.ctx, this.state, view, ui, nowMs);
    this.effects.length = 0; // legacy flat ring/puff list: particles.ts renders these now
    const step = this.tutorialStep();
    if (step) {
      const ctx = view.ctx;
      ctx.save();
      applyTransform(view);
      clipToMap(view);
      drawTutorial(ctx, ui.palette, this.state, step, nowMs);
      ctx.restore();
    }
  }

  /* ----- input ----- */

  private hudHit(p: PointerPoint): boolean {
    if (inRect(HUD.pause, p.x, p.y)) {
      this.togglePause();
      return true;
    }
    if (inRect(HUD.ratio, p.x, p.y)) {
      // segmented control: left half = 100 %, right half = 50 %
      this.app.save.settings.sendRatio = p.x < HUD.ratio.x + HUD.ratio.w / 2 ? 1 : 0.5;
      writeSave(this.app.save);
      return true;
    }
    if (inRect(HUD.menu, p.x, p.y)) {
      this.app.goLevels();
      return true;
    }
    return false;
  }

  togglePause(): void {
    this.loop.paused = !this.loop.paused;
    this.gestures.cancel();
  }

  /** ×1 ↔ ×2 (any other speed, e.g. the debug ×10, drops back to ×1). Persists via the app. */
  toggleSpeed(): void {
    this.app.setSpeed(this.loop.speed === 1 ? 2 : 1);
  }

  /** Pause if the game is still running (app went to background). */
  pause(): void {
    if (this.loop.paused || this.loop.finished) return;
    this.togglePause();
  }

  down(p: PointerPoint): void {
    if (this.loop.paused) return;
    if (p.y < HUD.mapTop || p.y > HUD.mapBottom) return;
    this.gestures.down(p);
  }

  move(p: PointerPoint): void {
    if (this.loop.paused) return;
    this.gestures.move(p);
  }

  up(p: PointerPoint): void {
    if (this.loop.paused) {
      if (inRect(PAUSE.resume, p.x, p.y) || inRect(HUD.pause, p.x, p.y)) this.togglePause();
      else if (inRect(PAUSE.speed, p.x, p.y)) this.toggleSpeed();
      else if (inRect(PAUSE.retry, p.x, p.y)) this.app.startLevel(this.level.id);
      else if (inRect(PAUSE.menu, p.x, p.y) || inRect(HUD.menu, p.x, p.y)) this.app.goLevels();
      return;
    }
    if (this.hudHit(p)) {
      this.gestures.cancel();
      return;
    }
    this.gestures.up(p);
  }

  cancel(): void {
    this.gestures.cancel();
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.app.goLevels();
    else if (e.key === 'p' || e.key === 'P' || e.key === ' ') this.togglePause();
    else if (e.key === 'r' || e.key === 'R') this.app.startLevel(this.level.id);
  }
}
