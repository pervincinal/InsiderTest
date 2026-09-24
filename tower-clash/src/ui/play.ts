import type { Command, GameState, LevelDef, Link, SimEvent, Tower } from '../sim/types';
import { Rng } from '../sim/rng';
import { C } from '../sim/constants';
import { SnapshotRing, applyContinue } from '../sim/snapshot';
import { createState } from '../sim/create';
import { linksFrom, maxLinksOf } from '../sim/step';
import { laneStalemate } from '../sim/index';
import { TRIPLE_STREAM_LINKS } from '../economy/achievements';
import { getOutcome } from '../sim/outcome';
import { LEVEL_META, levelIndex } from '../levels/index';
import { enemyCommands, isAiTick, referencePlayerCommands, rngsFor } from '../ai/index';
import type { View } from '../render/view';
import { applyTransform, clipToMap } from '../render/view';
import { drawGame } from '../render/draw';
import { BOOSTERS, HUD, PAUSE } from '../render/layout';
import { inRect } from '../render/widgets';
import { ParticleSystem } from '../render/particles';
import type { HudPlayUi } from '../render/hud';
import { boosterColor } from '../render/hud';
import type { PointerPoint } from '../input/pointer';
import { PlayGestures, hitTower } from '../input/pointer';
import { GameLoop } from './loop';
import { starsFor, writeSave } from './save';
import type { App, Screen, StartOptions } from './screens';
import { ResultScreen, Toast } from './screens';
import type { Tutorial, TutorialStep } from './tutorial';
import { drawTutorial, tutorialFor } from './tutorial';
import type { BoosterKind, BoosterWallet } from './boosters';
import { BOOSTER_KINDS, allBoosterStatus, boosterStatus, canUseBooster } from './boosters';
import { modifiersFromSave } from './upgrades';
import { boosterPrice, equippedSkin } from '../economy/entitlements';
import { canShowRewarded, showRewarded } from '../economy/adsFlow';
import type { ResultEarnings } from '../economy/wallet';
import { recordResult, spendGold } from '../economy/wallet';
import type { MatchSummary } from '../economy/achievements';
import { L3_LEVEL, emptyMatch, evaluateAchievements } from '../economy/achievements';
import { CRYSTAL_SERVICES } from '../economy/catalog';
import type { DailyChallenge, WeeklyChallenge } from '../daily/challenge';
import { recordChallengeResult, restartLevel } from './daily';
import { recordWeeklyResult } from './weekly';
import { isMuted, onSimEvents, onSimFrame, playSfx, resetAudioLevel, toggleMuted } from '../audio/index';
import { hapticCapture } from '../native/index';
import { t } from './i18n';

/** Transient visual effect driven by sim events (capture flash / death puff). */
interface Effect {
  x: number;
  y: number;
  color: string;
  bornMs: number;
  lifeMs: number;
  kind: 'ring' | 'puff';
}

/**
 * One entry of the continue ring (ECONOMY.md §3.5): the sim state plus the AI / autoplay rng
 * streams, which live outside `GameState` and must rewind with it so a replayed stretch stays
 * deterministic. `time` mirrors `state.time` for `SnapshotRing`.
 */
interface Snapshot {
  time: number;
  state: GameState;
  rng: { player: number; enemies: Record<string, number> };
}

/** Sim ms a player stream may run without landing anything before the stalemate hint may fire (FE-1 / BUG-13). */
export const STALEMATE_HINT_MS = 8000;

/**
 * Stalemate hint (FE-1, GDD §2.0b "Structural consequence"): equal streams on one lane cancel
 * forever, and a first-time player does not realise the stream must be stopped and re-aimed.
 * One window per player link (keyed `from->to`): it opens at the link's creation and restarts on
 * every `landed` event of the player's on the link's target; once it has run `STALEMATE_HINT_MS`
 * of sim time and the sim reports the lane as a stalemate (`laneStalemate`), the hint fires — once
 * per link. A link that ends drops its window, so a re-created link gets a fresh chance.
 * Disabled on the tutorial's first level. Pure bookkeeping: the sim is only read.
 */
export class StalemateWatch {
  private readonly lanes = new Map<string, { to: string; since: number; shown: boolean }>();

  constructor(
    private readonly enabled: boolean,
    private readonly isStalemate: (state: GameState, link: Link) => boolean = laneStalemate,
  ) {}

  /** Something of the player's landed on `towerId` at sim time `time`: the windows of the links into it restart. */
  onLanded(towerId: string, time: number): void {
    for (const w of this.lanes.values()) if (w.to === towerId) w.since = time;
  }

  /** Once per tick. Returns the (at most one) player link whose hint fires now, or null. */
  check(state: GameState): Link | null {
    const live = new Set<string>();
    let fire: Link | null = null;
    for (const link of state.links) {
      if (link.owner !== 'player') continue;
      const key = `${link.from}->${link.to}`;
      live.add(key);
      let w = this.lanes.get(key);
      if (!w) {
        w = { to: link.to, since: link.createdMs, shown: false };
        this.lanes.set(key, w);
      }
      if (!this.enabled || w.shown || fire !== null || state.time - w.since < STALEMATE_HINT_MS) continue;
      if (this.isStalemate(state, link)) {
        w.shown = true;
        fire = link;
      }
    }
    for (const key of this.lanes.keys()) if (!live.has(key)) this.lanes.delete(key); // the link ended: forget it
    return fire;
  }
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
  private earnings: ResultEarnings = { stars: 0, gold: 0, crystals: 0, notes: [], replayCapped: false };
  private readonly tutorial: Tutorial | null;
  /** Airstrike targeting mode (M3-1): the next tap on an enemy tower fires, anywhere else cancels. */
  targeting = false;
  private pressedBooster: BoosterKind | null = null;
  /** This attempt already used its "Reinforcements" continue (ECONOMY.md §3.5) — offered once per attempt. */
  private continued: boolean;
  /** State + rng snapshots of the last `C.SNAPSHOT_CAPACITY_MS` of sim time, one per `C.SNAPSHOT_INTERVAL_MS`. */
  private readonly ring = new SnapshotRing<Snapshot>();
  /** Sim ms discarded by continues: the star clock is `state.time + rewoundMs` (continuing never improves it). */
  private rewoundMs = 0;
  /** A rewarded video for a free booster charge is in flight (sim paused meanwhile). */
  private adPending = false;
  readonly toast = new Toast();
  /** Stalemate hint bookkeeping (FE-1): fed by `landed` events, checked after every sim frame. */
  private readonly stalemate: StalemateWatch;
  /** Debug (e2e): throw every garrison at the enemy each AI tick so the level is lost quickly. */
  private suicide = false;
  /** Facts about this match for the achievement rules (ECON-4), collected from sim events. */
  readonly match: MatchSummary = emptyMatch();
  /** Daily Challenge match (GDD §7): fixed twist modifiers, no upgrades, boosters and continues off. */
  readonly challenge: DailyChallenge | null;
  /** Weekly Challenge match (GDD §8): the same fixed-match rules as `challenge`, booked per week. */
  readonly weekly: WeeklyChallenge | null;

  constructor(
    private readonly app: App,
    readonly level: LevelDef,
    seed: number = (Date.now() >>> 0) || 1,
    speed = 1,
    opts: StartOptions = {},
  ) {
    this.challenge = opts.challenge ?? null;
    this.weekly = opts.weekly ?? null;
    this.continued = opts.reinforcements === true && !this.fixed;
    this.loop = new GameLoop({
      beforeTick: (s) => this.runAi(s),
      onEvents: (ev) => {
        this.particles.onEvents(ev, this.state, this.app.palette(), this.nowMs);
        this.onEvents(ev);
      },
    });
    this.loop.speed = speed;
    // Commander upgrades are sim input, fixed for the whole match. The bonus garrison is only the
    // fallback continue (no usable snapshot): the normal continue rewinds instead (`resumeFromSnapshot`).
    // A challenge is equal for everyone: the twist's modifiers stand in for the commander upgrades.
    const twist = this.challenge?.twist ?? this.weekly?.twist;
    const modifiers = twist ? { ...twist.modifiers } : modifiersFromSave(app.save, this.continued ? CRYSTAL_SERVICES.continue.bonusInfantry : 0);
    this.loop.load(createState(level, seed, modifiers));
    resetAudioLevel();
    const rngs = rngsFor(seed, level.enemies);
    this.playerRng = rngs.player;
    rngs.enemies.forEach((rng, owner) => this.enemyRngs.set(owner, rng));
    this.tutorial = tutorialFor(level.id, app.save.stars[String(level.id)] ?? 0);
    this.stalemate = new StalemateWatch(level.id !== 1); // the first tutorial level teaches one stream, no hint there
    this.gestures = new PlayGestures({
      getState: () => (this.loop.finished ? null : this.loop.state),
      limitHintText: (n) => t('hint.linkLimit', { n }),
      blockedHintText: () => t('hint.blocked'),
      emptyHintText: () => t('hint.empty'),
      onCommand: (cmd) => {
        this.tutorial?.onCommand(cmd, this.state);
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

  /** Match clock for stars and results: sim time plus whatever the continue rewound (ECONOMY.md §3.5). */
  elapsedMs(): number {
    return this.state.time + this.rewoundMs;
  }

  /** Whether the once-per-attempt "Reinforcements" continue was already used. */
  get hasContinued(): boolean {
    return this.continued;
  }

  private snapshot(): Snapshot {
    const enemies: Record<string, number> = {};
    for (const [owner, rng] of this.enemyRngs) enemies[owner] = rng.state;
    return { time: this.state.time, state: this.state, rng: { player: this.playerRng.state, enemies } };
  }

  /**
   * "Reinforcements" continue (ECONOMY.md §3.5): rewind to the snapshot `C.CONTINUE_REWIND_MS` before
   * the defeat, restore the rng streams, grant the free Freeze + infantry (`applyContinue`) and resume
   * on this screen with the tutorial and HUD intact. Returns false — and changes nothing — when the
   * continue was used, the level is still running, or no snapshot with a player tower exists (the
   * caller then falls back to a restart with the bonus garrison).
   */
  resumeFromSnapshot(): boolean {
    if (this.continued || !this.loop.finished) return false;
    const snap = this.ring.rewind(C.CONTINUE_REWIND_MS);
    if (!snap) return false;
    const restored = applyContinue(snap.state);
    if (!restored) return false;
    this.rewoundMs += this.state.time - restored.time;
    this.playerRng.state = snap.rng.player;
    for (const [owner, rng] of this.enemyRngs) {
      const saved = snap.rng.enemies[owner];
      if (saved !== undefined) rng.state = saved;
    }
    this.continued = true;
    this.finishedHandled = false;
    this.targeting = false;
    this.pressedBooster = null;
    this.effects.length = 0;
    this.gestures.reset();
    this.loop.load(restored); // also drops queued commands and unpauses
    this.ring.record(this.snapshot()); // the abandoned future is forgotten; the rewound state is the new base
    resetAudioLevel();
    playSfx('upgrade');
    this.app.go(this);
    return true;
  }

  /* ----- AI wiring: every C.AI_TICK_MS of sim time the loop applies these right before the tick ----- */
  private runAi(state: GameState): Command[] | undefined {
    if (!isAiTick(state)) return undefined;
    const cmds: Command[] = [];
    for (const enemy of state.enemies) {
      const rng = this.enemyRngs.get(enemy.owner);
      if (rng) cmds.push(...enemyCommands(state, enemy, rng));
    }
    if (this.autoplay) {
      cmds.push(...referencePlayerCommands(state, this.playerRng));
    }
    if (this.suicide) cmds.push(...this.suicideCommands(state));
    return cmds;
  }

  /**
   * Debug helper (e2e "auto lose"): a stream never drains its source under rules v3 and nothing
   * the player does can weaken an own tower, so the fastest defeat is to stop growing and let the
   * enemy come: every player tower with a free link streams into the strongest hostile tower it
   * has a clear lane to that is not already streaming back on that lane (a counter-stream would
   * cancel the attack 1:1 and protect us), else into a player neighbour. Growth pauses either way.
   */
  private suicideCommands(state: GameState): Command[] {
    const cmds: Command[] = [];
    const neighbours = (id: string): Tower[] => {
      const out: Tower[] = [];
      for (const r of Object.values(state.roads)) {
        const otherId = r.a === id ? r.b : r.b === id ? r.a : null;
        const other = otherId ? state.towers[otherId] : undefined;
        if (other) out.push(other);
      }
      return out;
    };
    const streamsInto = (from: string, to: string): boolean => state.links.some((l) => l.from === from && l.to === to);
    for (const t of Object.values(state.towers)) {
      if (t.owner !== 'player' || t.units <= 0 || linksFrom(state, t.id).length >= maxLinksOf(t)) continue;
      let best: { to: string; score: number } | null = null;
      for (const other of neighbours(t.id)) {
        if (streamsInto(t.id, other.id) || streamsInto(other.id, t.id)) continue;
        // a hostile target first (the strongest, so our trickle matters least); a player neighbour only pauses growth
        const score = other.owner === 'player' ? -1 : (other.owner === 'neutral' ? 0 : 1000) + other.units;
        if (!best || score > best.score) best = { to: other.id, score };
      }
      if (best) cmds.push({ type: 'link', owner: 'player', from: t.id, to: best.to });
    }
    return cmds;
  }

  setAutoplay(on: boolean): void {
    this.autoplay = on;
  }

  /** Debug (e2e): lose the level as fast as the sim allows. */
  setSuicide(on: boolean): void {
    this.suicide = on;
  }

  setSpeed(n: number): void {
    this.loop.speed = Math.max(0.1, Math.min(20, n));
  }

  private onEvents(events: SimEvent[]): void {
    const pal = this.app.palette();
    const m = this.match;
    for (const ev of events) {
      if (ev.type === 'capture') {
        if (ev.by === 'player') hapticCapture();
        if (ev.from === 'player') m.lostTower = true;
        const t = this.state.towers[ev.towerId];
        if (t && ev.by === 'player') {
          if (t.kind === 'fortress') m.capturedFortress = true;
          if (t.kind === 'tankFactory') m.capturedTankFactory = true;
        }
        if (t) this.effects.push({ x: t.x, y: t.y, color: pal.owners[ev.by], bornMs: this.nowMs, lifeMs: 450, kind: 'ring' });
      } else if (ev.type === 'unitDied') {
        this.effects.push({ x: ev.x, y: ev.y, color: pal.owners[ev.owner], bornMs: this.nowMs, lifeMs: 300, kind: 'puff' });
      } else if (ev.type === 'upgrade') {
        const t = this.state.towers[ev.towerId];
        if (t?.owner === 'player' && ev.level >= L3_LEVEL) m.upgradedToL3 = true;
        if (t) this.effects.push({ x: t.x, y: t.y, color: pal.star, bornMs: this.nowMs, lifeMs: 350, kind: 'ring' });
      } else if (ev.type === 'linked') {
        if (ev.owner === 'player') {
          playSfx('send'); // one tick per stream started (manual or autoplay)
          if (linksFrom(this.state, ev.from).length >= TRIPLE_STREAM_LINKS) m.tripleStream = true;
        }
      } else if (ev.type === 'unlinked') {
        if (ev.owner === 'player' && ev.reason === 'manual') playSfx('button'); // auto-ends (target full, source empty / lost) stay silent
      } else if (ev.type === 'landed') {
        if (ev.owner === 'player') this.stalemate.onLanded(ev.towerId, this.state.time);
      }
    }
    onSimEvents(events, this.state);
  }

  update(dtMs: number, nowMs: number): void {
    this.nowMs = nowMs;
    this.gestures.tick(nowMs);
    this.tutorial?.onSelect(this.gestures.selectedTowerId, this.state);
    if (this.loop.advance(dtMs) > 0) {
      this.ring.record(this.snapshot()); // the ring clones at most once per interval
      if (this.stalemate.check(this.state)) this.toast.show(t('hint.stalemate'), 'error', nowMs, 3200);
    }
    onSimFrame(this.state); // own-unit arrivals are detected by diffing units (no sim event for them)
    if (this.loop.finished && !this.finishedHandled) {
      this.finishedHandled = true;
      this.finish();
    }
  }

  /** Gold, discounted prices, pre-paid charges and the free-charge video offer for the booster bar. */
  private wallet(): BoosterWallet {
    const save = this.app.save;
    return {
      gold: save.gold,
      prices: { overdrive: boosterPrice(save, 'overdrive'), freeze: boosterPrice(save, 'freeze'), airstrike: boosterPrice(save, 'airstrike') },
      charges: save.charges,
      adOffer: !this.adPending && canShowRewarded(this.app.ads, save, 'rv_free_booster'),
    };
  }

  /** A daily or weekly challenge: equal for everyone (no upgrades, boosters, continue, skip; NEXT → the map). */
  private get fixed(): boolean {
    return this.challenge !== null || this.weekly !== null;
  }

  private buildUi(): HudPlayUi {
    const outcome = getOutcome(this.state);
    const idx = levelIndex(this.level.id);
    const twist = this.challenge?.twist ?? this.weekly?.twist;
    return {
      hud: {
        boosters: this.fixed ? [] : allBoosterStatus(this.state, this.wallet()),
        challenge: twist ? { twist: t(`daily.twist.${twist.id}`), weekly: this.weekly !== null } : undefined,
        targeting: this.targeting,
        muted: isMuted(),
        pressedBooster: this.pressedBooster,
        streams: this.state.links.filter((l) => l.owner === 'player').length,
        wallet: { gold: this.app.save.gold, crystals: this.app.save.crystals },
        toast: this.toast.opts(this.nowMs),
      },
      skin: equippedSkin(this.app.save),
      clockMs: this.elapsedMs(),
      level: this.level,
      palette: this.app.palette(),
      alpha: this.loop.alpha,
      selectedTowerId: this.gestures.selectedTowerId,
      hoverTowerId: this.gestures.hoverTowerId,
      paused: this.loop.paused,
      limitHint: this.gestures.limitHint ?? undefined,
      limitHintText: this.gestures.limitHintText || undefined,
      outcome,
      stars: outcome === 'won' ? starsFor(this.level, this.elapsedMs()) : 0,
      hasNext: this.fixed ? true : idx >= 0 && idx + 1 < LEVEL_META.length,
      speed: this.loop.speed,
      coinsEarned: this.earnings.gold,
      coinsTotal: this.app.save.gold,
      particles: this.particles,
    };
  }

  private finish(): void {
    const outcome = getOutcome(this.state);
    if (outcome === 'playing') return;
    const elapsed = this.elapsedMs();
    this.match.outcome = outcome;
    this.match.levelId = this.level.id;
    this.match.timeMs = elapsed;
    if (this.challenge) {
      // Separate path (GDD §7): no level stars, first-clear gold, milestones or achievements — the
      // daily reward is paid once per day by `recordChallengeResult`.
      const daily = recordChallengeResult(this.app.save, this.challenge, this.level, outcome, elapsed);
      this.earnings = { stars: daily.stars, gold: daily.gold, crystals: daily.crystals, notes: [], replayCapped: false };
      const ui = this.buildUi();
      this.gestures.reset();
      this.app.go(new ResultScreen(this.app, { state: this.state, level: this.level, ui, earnings: this.earnings, continued: this.continued, achievements: { unlocked: [], crystals: 0 }, challenge: this.challenge, daily }));
      return;
    }
    if (this.weekly) {
      // Same separate path for the weekly (GDD §8): gold once per week, crystals once at the 3★ target.
      const weeklyOutcome = recordWeeklyResult(this.app.save, this.weekly, this.level, outcome, elapsed);
      this.earnings = { stars: weeklyOutcome.stars, gold: weeklyOutcome.gold, crystals: weeklyOutcome.crystals, notes: [], replayCapped: false };
      const ui = this.buildUi();
      this.gestures.reset();
      this.app.go(new ResultScreen(this.app, { state: this.state, level: this.level, ui, earnings: this.earnings, continued: this.continued, achievements: { unlocked: [], crystals: 0 }, weekly: this.weekly, weeklyOutcome }));
      return;
    }
    this.earnings = recordResult(this.app.save, this.level, outcome, elapsed);
    const achievements = evaluateAchievements(this.app.save, this.match);
    const ui = this.buildUi(); // after recordResult so the totals are final
    this.gestures.reset();
    this.app.go(
      new ResultScreen(this.app, {
        state: this.state,
        level: this.level,
        ui,
        earnings: this.earnings,
        continued: this.continued,
        achievements,
        resume: () => this.resumeFromSnapshot(),
      }),
    );
  }

  /** Restart this level; a challenge keeps its seed and twist. */
  restart(): void {
    restartLevel(this.app, this.level.id, this.challenge, this.weekly);
  }

  draw(view: View, nowMs: number): void {
    const ui = this.buildUi();
    const step = this.tutorialStep();
    // the tutorial bubble paints over the HUD, so those frames keep the single-canvas path
    drawGame(view.ctx, this.state, view, ui, nowMs, !step);
    this.effects.length = 0; // legacy flat ring/puff list: particles.ts renders these now
    if (step) {
      const ctx = view.ctx;
      ctx.save();
      applyTransform(view);
      clipToMap(view);
      drawTutorial(ctx, ui.palette, this.state, step, nowMs);
      ctx.restore();
    }
  }

  /* ----- boosters (M3-1) ----- */

  private boosterAt(p: PointerPoint): BoosterKind | null {
    for (const k of BOOSTER_KINDS) if (inRect(BOOSTERS[k], p.x, p.y)) return k;
    return null;
  }

  /** Pay for one booster use: a pre-paid charge first, else the discounted gold price. */
  private payBooster(kind: BoosterKind): boolean {
    const save = this.app.save;
    if (save.charges[kind] > 0) {
      save.charges[kind] -= 1;
      writeSave(save);
      return true;
    }
    return spendGold(save, boosterPrice(save, kind));
  }

  /**
   * Buy and fire a booster. Overdrive/freeze apply at once; airstrike only enters targeting mode
   * (paid when a tower is hit). Returns false when unaffordable / already active. An unaffordable
   * booster with a rewarded video on offer starts the "free charge" flow instead (ECONOMY.md §5.2).
   */
  useBooster(kind: BoosterKind): boolean {
    if (this.loop.paused || this.loop.finished) return false;
    if (this.fixed) {
      this.toast.show(t(this.weekly ? 'weekly.noBoosters' : 'daily.noBoosters'), 'error', this.nowMs);
      return false;
    }
    const status = boosterStatus(this.state, kind, this.wallet());
    if (status.adOffer && !status.active) {
      void this.freeCharge(kind);
      return false;
    }
    if (!canUseBooster(this.state, kind, this.wallet())) return false;
    if (kind === 'airstrike') {
      this.targeting = !this.targeting;
      this.gestures.reset();
      playSfx('button');
      return this.targeting;
    }
    this.targeting = false;
    if (!this.payBooster(kind)) return false;
    this.loop.enqueue({ type: 'booster', owner: 'player', booster: kind });
    playSfx('upgrade');
    return true;
  }

  /** Rewarded video → +1 charge of `kind`. The sim pauses while the video plays. */
  async freeCharge(kind: BoosterKind): Promise<boolean> {
    if (this.adPending || this.loop.finished) return false;
    this.adPending = true;
    const wasPaused = this.loop.paused;
    this.loop.paused = true;
    const ok = await showRewarded(this.app.ads, this.app.save, 'rv_free_booster');
    this.loop.paused = wasPaused;
    this.adPending = false;
    if (ok) {
      this.app.save.charges[kind] += 1;
      writeSave(this.app.save);
      playSfx('upgrade');
      this.toast.show(t('play.freeCharge', { kind: t(`booster.${kind}`) }), 'ok', this.nowMs);
    }
    return ok;
  }

  /** Airstrike on `towerId` (must be enemy-owned). Spends the charge / gold and leaves targeting mode. */
  airstrike(towerId: string): boolean {
    const t = this.state.towers[towerId];
    if (!t || t.owner === 'player' || t.owner === 'neutral') return false;
    if (!canUseBooster(this.state, 'airstrike', this.wallet())) return false;
    if (!this.payBooster('airstrike')) return false;
    this.loop.enqueue({ type: 'booster', owner: 'player', booster: 'airstrike', towerId });
    this.targeting = false;
    const color = boosterColor(this.app.palette(), 'airstrike');
    this.particles.shot(t.x + 40, t.y - 420, t.x, t.y - 30, color);
    this.particles.shot(t.x - 30, t.y - 420, t.x + 6, t.y - 26, color);
    for (let i = 0; i < 4; i++) this.particles.death(t.x + (i - 1.5) * 14, t.y - 10 - (i % 2) * 12);
    playSfx('artillery');
    return true;
  }

  /* ----- input ----- */

  private hudHit(p: PointerPoint): boolean {
    if (inRect(HUD.pause, p.x, p.y)) {
      this.togglePause();
      return true;
    }
    if (inRect(HUD.mute, p.x, p.y)) {
      toggleMuted();
      return true;
    }
    const booster = this.boosterAt(p);
    if (booster) {
      this.useBooster(booster);
      return true;
    }
    if (inRect(HUD.coins, p.x, p.y) || inRect(HUD.streams, p.x, p.y)) return true;
    if (inRect(HUD.menu, p.x, p.y)) {
      this.app.goLevels();
      return true;
    }
    return false;
  }

  togglePause(): void {
    this.loop.paused = !this.loop.paused;
    this.targeting = false;
    this.pressedBooster = null;
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
    this.pressedBooster = this.loop.finished ? null : this.boosterAt(p);
    if (this.pressedBooster) return;
    if (p.y < HUD.mapTop || p.y > HUD.mapBottom) return;
    if (this.targeting) return; // the tap resolves on up: fire or cancel
    this.gestures.down(p);
  }

  move(p: PointerPoint): void {
    if (this.loop.paused) return;
    if (this.pressedBooster && !inRect(BOOSTERS[this.pressedBooster], p.x, p.y)) this.pressedBooster = null;
    if (this.targeting) return;
    this.gestures.move(p);
  }

  up(p: PointerPoint): void {
    this.pressedBooster = null;
    if (this.loop.paused) {
      if (inRect(PAUSE.resume, p.x, p.y) || inRect(HUD.pause, p.x, p.y)) this.togglePause();
      else if (inRect(PAUSE.speed, p.x, p.y)) this.toggleSpeed();
      else if (inRect(PAUSE.sound, p.x, p.y) || inRect(HUD.mute, p.x, p.y)) toggleMuted();
      else if (inRect(PAUSE.settings, p.x, p.y)) this.app.openSettings(this);
      else if (inRect(PAUSE.retry, p.x, p.y)) this.restart();
      else if (inRect(PAUSE.menu, p.x, p.y) || inRect(HUD.menu, p.x, p.y)) this.app.goLevels();
      return;
    }
    if (this.targeting && p.y >= HUD.mapTop && p.y <= HUD.mapBottom) {
      const t = hitTower(this.state, p.x, p.y);
      if (!t || !this.airstrike(t.id)) this.targeting = false; // tap elsewhere (or a non-enemy tower) cancels
      return;
    }
    if (this.hudHit(p)) {
      this.gestures.cancel();
      return;
    }
    this.gestures.up(p);
  }

  cancel(): void {
    this.pressedBooster = null;
    this.gestures.cancel();
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.targeting) this.targeting = false;
      else this.app.goLevels();
    } else if (e.key === 'p' || e.key === 'P' || e.key === ' ') this.togglePause();
    else if (e.key === 'r' || e.key === 'R') this.restart();
    else if (e.key === '1') this.useBooster('overdrive');
    else if (e.key === '2') this.useBooster('freeze');
    else if (e.key === '3') this.useBooster('airstrike');
  }
}
