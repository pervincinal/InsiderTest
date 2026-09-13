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
import { HUD, RESULT } from '../render/layout';
import { inRect } from '../render/widgets';
import type { PointerPoint } from '../input/pointer';
import { PlayGestures } from '../input/pointer';
import { GameLoop } from './loop';
import { recordWin, starsFor, writeSave } from './save';
import type { App, Screen } from './screens';
import { ResultScreen } from './screens';


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
  private enemyRngs = new Map<string, Rng>();
  private playerRng: Rng;
  private autoplay = false;
  private finishedHandled = false;
  private nowMs = 0;

  constructor(
    private readonly app: App,
    readonly level: LevelDef,
    seed: number = (Date.now() >>> 0) || 1,
    speed = 1,
  ) {
    this.loop = new GameLoop({
      beforeTick: (s) => this.runAi(s),
      onEvents: (ev) => this.onEvents(ev),
    });
    this.loop.speed = speed;
    this.loop.load(createState(level, seed));
    this.playerRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    level.enemies.forEach((e, i) => this.enemyRngs.set(e.owner, new Rng((seed + 1013904223 * (i + 1)) >>> 0)));
    this.gestures = new PlayGestures({
      getState: () => (this.loop.finished ? null : this.loop.state),
      getSendRatio: () => this.app.save.settings.sendRatio,
      onCommand: (cmd) => this.loop.enqueue(cmd),
    });
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
    // TODO(audio): forward `events` to the WebAudio synth once src/audio exists.
  }

  update(dtMs: number, nowMs: number): void {
    this.nowMs = nowMs;
    this.gestures.tick(nowMs);
    this.loop.advance(dtMs);
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
    };
  }

  private finish(): void {
    const ui = this.buildUi();
    if (ui.outcome === 'won') recordWin(this.app.save, this.level.id, ui.stars, C.COINS_PER_STAR);
    this.gestures.reset();
    this.app.go(new ResultScreen(this.app, { state: this.state, level: this.level, ui }));
  }

  draw(view: View, nowMs: number): void {
    const ui = this.buildUi();
    drawGame(view.ctx, this.state, view, ui);
    this.drawEffects(view, nowMs);
  }

  private drawEffects(view: View, nowMs: number): void {
    if (!this.effects.length) return;
    const ctx = view.ctx;
    ctx.save();
    applyTransform(view);
    clipToMap(view);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]!;
      const t = (nowMs - fx.bornMs) / fx.lifeMs;
      if (t >= 1) {
        this.effects.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = fx.color;
      ctx.fillStyle = fx.color;
      if (fx.kind === 'ring') {
        ctx.lineWidth = 6 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 36 + 40 * t, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 5 + 14 * t, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ----- input ----- */

  private hudHit(p: PointerPoint): boolean {
    if (inRect(HUD.pause, p.x, p.y)) {
      this.togglePause();
      return true;
    }
    if (inRect(HUD.ratio, p.x, p.y)) {
      this.app.save.settings.sendRatio = this.app.save.settings.sendRatio === 1 ? 0.5 : 1;
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
      if (inRect(RESULT.resume, p.x, p.y) || inRect(HUD.pause, p.x, p.y)) this.togglePause();
      else if (inRect(RESULT.retry, p.x, p.y)) this.app.startLevel(this.level.id);
      else if (inRect(RESULT.menu, p.x, p.y) || inRect(HUD.menu, p.x, p.y)) this.app.goLevels();
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
