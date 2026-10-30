import type { Command, GameState, LevelDef, Link, SimEvent } from '../sim/types';
import { Rng } from '../sim/rng';
import { C } from '../sim/constants';
import { SnapshotRing, applyContinue } from '../sim/snapshot';
import { createState } from '../sim/create';
import { linksFrom } from '../sim/step';
import { laneStalemate } from '../sim/index';
import { TRIPLE_STREAM_LINKS } from '../economy/achievements';
import { getOutcome } from '../sim/outcome';
import { LEVEL_META, levelIndex } from '../levels/index';
import { aiModule } from './ai';
import type { View } from '../render/view';
import { applyTransform, clipToMap, hudAnchors, toHudSpace } from '../render/view';
import { drawGame } from '../render/draw';
import { BOOSTERS, HUD, PAUSE, TOWER_HIT_RADIUS } from '../render/layout';
import { playCamera, proj, unproj } from '../render/camera';
import type { Rect } from '../render/widgets';
import { hitRect } from '../render/widgets';
import { ParticleSystem } from '../render/particles';
import type { HudPlayUi } from '../render/hud';
import { boosterColor, warmHudOverlays } from '../render/hud';
import type { PointerPoint } from '../input/pointer';
import { PlayGestures, hitTower } from '../input/pointer';
import { GameLoop } from './loop';
import { starsFor, writeSave } from './save';
import type { App, Screen, StartOptions } from './screens';
import { ResultScreen, Toast } from './screens';
import type { Tutorial, TutorialStep } from './tutorial';
import { stepTowerId, tutorialFor } from './tutorial';
import { drawTutorial } from '../render/tutorialDraw';
import { TUTORIAL_CHUNK, loadTutorialSteps, needsTutorialSteps, tutorialStepsLoaded } from './tutorialChunk';
import { chunkBackoff } from '../lazyChunk';
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
import { practiceResult, recordChallengeResult, restartLevel } from './daily';
import { recordWeeklyResult } from './weekly';
import { isMuted, onSimEvents, onSimFrame, playSfx, resetAudioLevel, toggleMuted } from '../audio/index';
import { hapticCapture } from '../native/index';
import { t } from './i18n';

/** Player-side bot for the debug autoplay (the reference player's signature). */
export type PlayerBot = (state: GameState, rng: Rng) => Command[];

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
 * BUG-14: when the opposing stream meets the player's units on the spawn tick, they die before
 * `laneStalemate` (which reads surviving units at tick end) can see them — so a clash death of a
 * player unit on the link's lane (`onClash`) counts as "opposing stream seen" for the next check.
 * Disabled on the tutorial's first level. Pure bookkeeping: the sim is only read.
 */
export class StalemateWatch {
  private readonly lanes = new Map<string, { to: string; since: number; shown: boolean }>();
  /** Lanes on which a player unit died in a clash since the last `check`. */
  private readonly clashed = new Set<string>();

  constructor(
    private readonly enabled: boolean,
    private readonly isStalemate: (state: GameState, link: Link) => boolean = laneStalemate,
  ) {}

  /** Something of the player's landed on `towerId` at sim time `time`: the windows of the links into it restart. */
  onLanded(towerId: string, time: number): void {
    for (const w of this.lanes.values()) if (w.to === towerId) w.since = time;
  }

  /** A player unit died in a clash on `roadId`: the lane carries an opposing stream even if nothing survives the tick. */
  onClash(roadId: string): void {
    this.clashed.add(roadId);
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
      if (this.clashed.has(link.roadId) || this.isStalemate(state, link)) {
        w.shown = true;
        fire = link;
      }
    }
    for (const key of this.lanes.keys()) if (!live.has(key)) this.lanes.delete(key); // the link ended: forget it
    this.clashed.clear();
    return fire;
  }
}

/**
 * Tappable things on the play HUD bands (BUG-36: each acts only for a press that began on it). The
 * STREAMS and coin pills are labels (no tap area); a press on them is still the band's, never the world's.
 */
type HudButton = 'pause' | 'mute' | 'menu' | BoosterKind;

export class PlayScreen implements Screen {
  readonly name = 'play' as const;
  readonly loop: GameLoop;
  readonly gestures: PlayGestures;
  private readonly effects: Effect[] = [];
  /** Toy-look particles (render/particles.ts); fed straight from the loop's event hook. */
  private readonly particles = new ParticleSystem();
  private enemyRngs = new Map<string, Rng>();
  private playerRng: Rng;
  /** Debug-only command sources (src/debug.ts): the reference player (autoplay) and "auto lose"; null when off. */
  private playerBot: PlayerBot | null = null;
  private loseBot: ((state: GameState) => Command[]) | null = null;
  private finishedHandled = false;
  private nowMs = 0;
  private earnings: ResultEarnings = { stars: 0, gold: 0, crystals: 0, notes: [], replayCapped: false };
  private tutorial: Tutorial | null;
  /** PERF-10: a first play of levels 2–4 whose tutorial-steps chunk was not in at the start (`lateTutorial`). */
  private tutorialLate: boolean;
  private tutorialLoading = false;
  /** GD-5f: `hint.supplyLine` was shown this match (or the tutorial's supply-line step taught that link). */
  private supplyHintDone = false;
  /** BUG-50 / BUG-51: the last tutorial step whose `select` was applied. */
  private selectedFor: TutorialStep | null = null;
  /** Airstrike targeting mode (M3-1): the next tap on an enemy tower fires, anywhere else cancels. */
  targeting = false;
  private pressedBooster: BoosterKind | null = null;
  /**
   * Where the current press began (BUG-36 / BUG-37): `world` = handed to the gestures (a tap / drag /
   * swipe there always ends through `gestures.up` / `cancel`, wherever the finger lifts); `hud` = on
   * the HUD bands, with the button it started on (null once the finger left it); `target` = an
   * airstrike-targeting tap; `card` = while paused, with the pause card's button it started on
   * (AUD-U7); null = no press (hover moves, a lift whose down was never seen).
   */
  private press: { kind: 'world' } | { kind: 'hud'; button: HudButton | null } | { kind: 'target' } | { kind: 'card'; button: Rect | null } | null = null;
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
  /** Facts about this match for the achievement rules (ECON-4), collected from sim events. */
  readonly match: MatchSummary = emptyMatch();
  /** Daily Challenge match (GDD §7): fixed twist modifiers, no upgrades, boosters and continues off. */
  readonly challenge: DailyChallenge | null;
  /** Weekly Challenge match (GDD §8): the same fixed-match rules as `challenge`, booked per week. */
  readonly weekly: WeeklyChallenge | null;
  /** Yesterday's map (DAILY-6): `challenge` is yesterday's and the result writes nothing. */
  readonly practice: boolean;

  constructor(
    private readonly app: App,
    readonly level: LevelDef,
    seed: number = (Date.now() >>> 0) || 1,
    speed = 1,
    opts: StartOptions = {},
  ) {
    this.challenge = opts.challenge ?? null;
    this.weekly = opts.weekly ?? null;
    this.practice = opts.practice === true && this.challenge !== null;
    if (this.practice) this.toast.show(t('daily.yesterdayNoReward'), 'ok', performance.now(), 3200);
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
    const rngs = aiModule().rngsFor(seed, level.enemies);
    this.playerRng = rngs.player;
    rngs.enemies.forEach((rng, owner) => this.enemyRngs.set(owner, rng));
    const stars = app.save.stars[String(level.id)] ?? 0;
    this.tutorial = tutorialFor(level.id, stars);
    this.tutorialLate = this.tutorial === null && needsTutorialSteps(level.id, stars);
    this.stalemate = new StalemateWatch(level.id !== 1); // the first tutorial level teaches one stream, no hint there
    this.gestures = new PlayGestures({
      getState: () => (this.loop.finished ? null : this.loop.state),
      limitHintText: (n) => t('hint.linkLimit', { n }),
      blockedHintText: () => t('hint.blocked'),
      emptyHintText: () => t('hint.empty'),
      fullTopHintText: () => t('hint.fullTop'),
      viewScale: () => this.app.view.scale, // AUD-U3: the drag slop is measured on the screen
      // the drawn-building capsule on the flat map too (ART-24: the roof of a zoomed tower takes a tap)
      hitProjection: () => {
        const cam = playCamera();
        return (x, y) => proj(cam, x, y);
      },
      onCommand: (cmd) => {
        const step = this.tutorialStep();
        this.tutorial?.onCommand(cmd, this.state);
        // GD-5f: the link that completes the supply-line step raises no `hint.supplyLine` (the step was the lesson)
        if (step?.supplyLine && cmd.type === 'link' && this.tutorialStep() !== step) this.supplyHintDone = true;
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
    const ai = aiModule();
    if (!ai.isAiTick(state)) return undefined;
    const cmds: Command[] = [];
    for (const enemy of state.enemies) {
      const rng = this.enemyRngs.get(enemy.owner);
      if (rng) cmds.push(...ai.enemyCommands(state, enemy, rng));
    }
    if (this.playerBot) cmds.push(...this.playerBot(state, this.playerRng));
    if (this.loseBot) cmds.push(...this.loseBot(state));
    return cmds;
  }

  /** Debug (e2e autoplay): a bot that issues the player's commands on every AI tick, or null to stop. */
  setPlayerBot(bot: PlayerBot | null): void {
    this.playerBot = bot;
  }

  /** Debug (e2e "auto lose"): a command source that throws the level, or null to stop. */
  setLoseBot(bot: ((state: GameState) => Command[]) | null): void {
    this.loseBot = bot;
  }

  setSpeed(n: number): void {
    this.loop.speed = Math.max(0.1, Math.min(20, n));
  }

  private onEvents(events: SimEvent[]): void {
    const pal = this.app.palette();
    const m = this.match;
    for (const ev of events) {
      if (ev.type === 'capture') {
        warmHudOverlays(); // the result card's chunk (PERF-6): a capture means an outcome is on its way
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
        if (ev.owner === 'player' && ev.cause === 'clash') this.stalemate.onClash(ev.roadId);
      } else if (ev.type === 'upgrade') {
        const t = this.state.towers[ev.towerId];
        if (t?.owner === 'player' && ev.level >= L3_LEVEL) m.upgradedToL3 = true;
        if (t) this.effects.push({ x: t.x, y: t.y, color: pal.star, bornMs: this.nowMs, lifeMs: 350, kind: 'ring' });
      } else if (ev.type === 'linked') {
        if (ev.owner === 'player') {
          playSfx('send'); // one tick per stream started (manual or autoplay)
          if (linksFrom(this.state, ev.from).length >= TRIPLE_STREAM_LINKS) m.tripleStream = true;
          this.confirmSupplyLine(ev.from, ev.to);
        }
      } else if (ev.type === 'unlinked') {
        if (ev.owner === 'player' && ev.reason === 'manual') playSfx('button'); // auto-ends (target full, source empty / lost) stay silent
      } else if (ev.type === 'landed') {
        if (ev.owner === 'player') this.stalemate.onLanded(ev.towerId, this.state.time);
      }
    }
    onSimEvents(events, this.state);
  }

  /**
   * GD-5f (GDD §3.11 b): the first player supply line of the match — a link the sim made a relay
   * (rule 13) — is confirmed once in the hint bubble over the full tower it runs into. Not while the
   * tutorial's supply-line step (level 2) is on screen: that step already asks for it.
   */
  private confirmSupplyLine(from: string, to: string): void {
    if (this.supplyHintDone || !this.state.links.some((l) => l.owner === 'player' && l.from === from && l.to === to && l.relay)) return;
    this.supplyHintDone = true;
    if (!this.tutorialStep()?.supplyLine) this.gestures.notify(t('hint.supplyLine'), to, this.nowMs);
  }

  /**
   * BUG-50 / BUG-51: a step's `select` sets the selection its instruction assumes, once — the first frame
   * the step is on screen while no press is under way (a press keeps the selection it started with).
   */
  private applyStepSelection(): void {
    const step = this.tutorialStep();
    if (!step?.select || step === this.selectedFor || this.press !== null) return;
    this.selectedFor = step;
    const id = step.select(this.state);
    this.gestures.selectedTowerId = id !== null && this.state.towers[id]?.owner === 'player' ? id : null;
  }

  /** PERF-10: the level 2–4 steps arrived after the start (late or failed chunk): the tutorial begins now. */
  private lateTutorial(): void {
    if (tutorialStepsLoaded()) {
      this.tutorialLate = false;
      this.tutorial = tutorialFor(this.level.id, 0);
    } else if (!this.tutorialLoading && !chunkBackoff(TUTORIAL_CHUNK)) {
      this.tutorialLoading = true;
      const done = (): void => {
        this.tutorialLoading = false;
      };
      loadTutorialSteps().then(done, done);
    }
  }

  update(dtMs: number, nowMs: number): void {
    this.nowMs = nowMs;
    this.gestures.tick(nowMs);
    if (this.tutorialLate) this.lateTutorial();
    this.tutorial?.onSelect(this.gestures.selectedTowerId, this.state);
    // a step on screen for TUTORIAL_STEP_TIMEOUT_MS without completion gives way (BUG-33: no overlay softlock)
    if (!this.loop.paused && !this.loop.finished) this.tutorial?.elapse(dtMs, this.state);
    this.applyStepSelection();
    if (this.loop.advance(dtMs) > 0) {
      this.ring.record(this.snapshot()); // the ring clones at most once per interval
      if (this.stalemate.check(this.state)) {
        this.toast.show(t('hint.stalemate'), 'error', nowMs, 3200);
        playSfx('stalemate');
      }
    }
    onSimFrame(this.state); // own-unit arrivals are detected by diffing units (no sim event for them)
    if (this.loop.finished && !this.finishedHandled) {
      this.finishedHandled = true;
      warmHudOverlays(); // outcome decided: a last chance for the result card to land before its first frame
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
      drag: this.gestures.drag ?? undefined,
      swipeTrail: this.gestures.trail,
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
    if (this.challenge && this.practice) {
      // Yesterday's map (DAILY-6, ECONOMY.md §6.1): practice — no reward, streak, best, milestone or
      // achievement; nothing is written, so the save stays byte-identical.
      const daily = practiceResult(this.challenge, this.level, outcome, elapsed);
      this.earnings = { stars: daily.stars, gold: 0, crystals: 0, notes: [], replayCapped: false };
      const ui = this.buildUi();
      this.gestures.reset();
      this.app.go(new ResultScreen(this.app, { state: this.state, level: this.level, ui, earnings: this.earnings, continued: this.continued, achievements: { unlocked: [], crystals: 0 }, challenge: this.challenge, daily }));
      return;
    }
    if (this.challenge) {
      // Separate path (GDD §7): no level stars, first-clear gold or milestones — the daily reward is
      // paid once per day by `recordChallengeResult`. Achievements run without the match (ECONOMY.md
      // §6.3): only the save counters (`challenge_streak_7`, `challenge_wins_30`, …) can fire here, the
      // match facts (`first_win`, `flawless`, …) stay campaign-only; the grant rides on `achievements`,
      // not on `daily.crystals`.
      const daily = recordChallengeResult(this.app.save, this.challenge, this.level, outcome, elapsed);
      const achievements = evaluateAchievements(this.app.save);
      this.earnings = { stars: daily.stars, gold: daily.gold, crystals: daily.crystals, notes: [], replayCapped: false };
      const ui = this.buildUi();
      this.gestures.reset();
      this.app.go(new ResultScreen(this.app, { state: this.state, level: this.level, ui, earnings: this.earnings, continued: this.continued, achievements, challenge: this.challenge, daily }));
      return;
    }
    if (this.weekly) {
      // Same separate path for the weekly (GDD §8): gold once per week, crystals once at the 3★ target.
      const weeklyOutcome = recordWeeklyResult(this.app.save, this.weekly, this.level, outcome, elapsed);
      const achievements = evaluateAchievements(this.app.save); // save counters only (`weekly_streak_4`), no match
      this.earnings = { stars: weeklyOutcome.stars, gold: weeklyOutcome.gold, crystals: weeklyOutcome.crystals, notes: [], replayCapped: false };
      const ui = this.buildUi();
      this.gestures.reset();
      this.app.go(new ResultScreen(this.app, { state: this.state, level: this.level, ui, earnings: this.earnings, continued: this.continued, achievements, weekly: this.weekly, weeklyOutcome }));
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
    restartLevel(this.app, this.level.id, this.challenge, this.weekly, this.practice);
  }

  draw(view: View, nowMs: number): void {
    const ui = this.buildUi();
    const step = this.tutorialStep();
    // BUG-57: the select hint leaves the bubble room round the step's tower
    if (step) ui.tutorialTowerId = stepTowerId(step, this.state);
    // the tutorial bubble paints over the HUD, so those frames keep the single-canvas path
    drawGame(view.ctx, this.state, view, ui, nowMs, !step);
    this.effects.length = 0; // legacy flat ring/puff list: particles.ts renders these now
    if (step) {
      const ctx = view.ctx;
      ctx.save();
      applyTransform(view);
      clipToMap(view);
      // GD-5c: the bubble keeps clear of every badge, chip and tower body of this frame (render/tutorialBubble.ts)
      drawTutorial(ctx, this.state, view, ui, step, nowMs, playCamera());
      ctx.restore();
    }
  }

  /* ----- boosters (M3-1) ----- */

  /**
   * `p` in HUD layout coordinates (BUG-34): the bands are anchored to the screen's safe-area edges, so
   * a tap on them is mapped back onto the layout.ts rects; a point on the world comes back unchanged.
   */
  private hudPoint(p: PointerPoint): { x: number; y: number } {
    return toHudSpace(hudAnchors(this.app.view), p.x, p.y);
  }

  /**
   * ART-21: a screen logical point on the world → map coordinates (the camera undone, exactly). The
   * gestures, the hit tests and the drag / swipe previews all work in map coordinates; the renderer
   * draws them back through the same camera, so the line still ends under the finger.
   */
  private toWorld(p: PointerPoint): PointerPoint {
    const cam = playCamera();
    return cam.flat ? p : { ...p, ...unproj(cam, p.x, p.y) };
  }

  /**
   * Layout point → screen logical point (Screen.fromLayout; the debug hooks `toClient` /
   * `layoutToClient` use it): while the world takes input, a point of the map's band
   * (HUD.mapTop..HUD.mapBottom) is a map point and goes through the camera (ART-21); the HUD
   * bands, the pause card and anything else are drawn untilted and come back unchanged.
   */
  fromLayout(x: number, y: number): { x: number; y: number } {
    if (this.loop.paused || y < HUD.mapTop || y > HUD.mapBottom) return { x, y };
    const p = proj(playCamera(), x, y);
    return { x: p.x, y: p.y };
  }

  /** Inverse of `fromLayout` for a point on the world's screen band. */
  toLayout(x: number, y: number): { x: number; y: number } {
    if (this.loop.paused || !this.inWorld({ id: 0, x, y, timeMs: 0 })) return { x, y };
    return unproj(playCamera(), x, y);
  }

  /** Between the two (anchored) HUD bands: where gestures act on the world. */
  private inWorld(p: PointerPoint): boolean {
    const a = hudAnchors(this.app.view);
    return p.y >= HUD.mapTop + a.top && p.y <= HUD.mapBottom + a.bottom;
  }

  private boosterAt(p: PointerPoint): BoosterKind | null {
    const h = this.hudPoint(p);
    for (const k of BOOSTER_KINDS) if (hitRect(this.app.view, BOOSTERS[k], h.x, h.y)) return k;
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

  /** The HUD button under `p` (moved bands mapped back, BUG-34), or null. */
  private hudButtonAt(p: PointerPoint): HudButton | null {
    const h = this.hudPoint(p);
    const v = this.app.view;
    if (hitRect(v, HUD.pause, h.x, h.y)) return 'pause';
    if (hitRect(v, HUD.mute, h.x, h.y)) return 'mute';
    if (hitRect(v, HUD.menu, h.x, h.y)) return 'menu';
    return this.boosterAt(p);
  }

  /** A tap on HUD button `b` (pressed and released on it). AUD-U4: MENU opens the pause card (its MENU leaves). */
  private hudAction(b: HudButton): void {
    if (b === 'pause' || b === 'menu') this.togglePause();
    else if (b === 'mute') toggleMuted();
    else this.useBooster(b);
  }

  /**
   * The pause card's button under `p`, as its PAUSE rect; the band's pause and MENU close the card
   * (RESUME), its mute is SOUND. AUD-U7: the card acts only for a press that began on the button.
   */
  private cardButtonAt(p: PointerPoint): Rect | null {
    const b = this.hudButtonAt(p);
    if (b === 'pause' || b === 'menu') return PAUSE.resume;
    if (b === 'mute') return PAUSE.sound;
    for (const r of [PAUSE.resume, PAUSE.speed, PAUSE.sound, PAUSE.settings, PAUSE.retry, PAUSE.menu, PAUSE.howto]) if (hitRect(this.app.view, r, p.x, p.y)) return r;
    return null;
  }

  private cardAction(r: Rect): void {
    if (r === PAUSE.resume) this.togglePause();
    else if (r === PAUSE.speed) this.toggleSpeed();
    else if (r === PAUSE.sound) toggleMuted();
    else if (r === PAUSE.settings) this.app.openSettings(this);
    else if (r === PAUSE.howto) this.app.openHowTo(this);
    else if (r === PAUSE.retry) this.restart();
    else if (r === PAUSE.menu) this.app.goLevels();
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
    this.press = null;
    if (this.loop.paused) {
      this.press = { kind: 'card', button: this.cardButtonAt(p) };
      return;
    }
    this.pressedBooster = this.loop.finished ? null : this.boosterAt(p);
    if (!this.inWorld(p)) {
      this.press = { kind: 'hud', button: this.hudButtonAt(p) };
      return;
    }
    if (this.targeting) {
      this.press = { kind: 'target' }; // the tap resolves on up: fire or cancel
      return;
    }
    this.press = { kind: 'world' };
    this.gestures.down(this.toWorld(p));
  }

  move(p: PointerPoint): void {
    const press = this.press;
    // a card / HUD press that slides off its button no longer taps it (BUG-36, AUD-U7)
    if (press?.kind === 'card' && press.button && this.cardButtonAt(p) !== press.button) press.button = null;
    if (this.loop.paused) return;
    if (this.pressedBooster && this.boosterAt(p) !== this.pressedBooster) this.pressedBooster = null;
    if (press?.kind === 'hud' && press.button && this.hudButtonAt(p) !== press.button) press.button = null;
    if (this.targeting || press?.kind === 'hud') return;
    this.gestures.move(this.toWorld(p)); // a world press, or a hover (no press: the gestures only update the hover)
  }

  up(p: PointerPoint): void {
    this.pressedBooster = null;
    const press = this.press;
    this.press = null;
    if (this.loop.paused) {
      // AUD-U7 (BUG-36's rule on the card): pressed and released on the same button
      const b = press?.kind === 'card' ? press.button : null;
      if (b && this.cardButtonAt(p) === b) this.cardAction(b);
      return;
    }
    if (!press || press.kind === 'card') return; // BUG-37: a lift whose press nobody saw (or that began while paused) does nothing
    if (press.kind === 'target') {
      if (this.targeting && this.inWorld(p)) {
        const w = this.toWorld(p);
        const cam = playCamera();
        const t = hitTower(this.state, w.x, w.y, TOWER_HIT_RADIUS, (x, y) => proj(cam, x, y));
        if (!t || !this.airstrike(t.id)) this.targeting = false; // tap elsewhere (or a non-enemy tower) cancels
      }
      return;
    }
    if (press.kind === 'hud') {
      // BUG-36: a HUD button acts only for a press that began on it and lifts on it; a press that began
      // on the bands never reaches the gestures (BUG-37), wherever it lifts
      const b = press.button;
      if (b && this.hudButtonAt(p) === b) this.hudAction(b);
      return;
    }
    // a world press ends through the gestures, wherever the finger lifts (BUG-36: never a HUD button)
    const hintBefore = this.gestures.limitHint;
    this.gestures.up(this.toWorld(p));
    // A refusal (link limit / blocked lane / empty source) is a fresh `limitHint` object: one thud per refused tap.
    if (this.gestures.limitHint && this.gestures.limitHint !== hintBefore) playSfx('refuse');
  }

  /** `at` (platform `pointercancel` only) lets a drag from an own tower finish there (BUG-33, `PlayGestures.cancel`). */
  cancel(at?: PointerPoint): void {
    this.pressedBooster = null;
    const press = this.press;
    this.press = null;
    if (this.loop.paused || this.targeting || press?.kind !== 'world') {
      // BUG-37: only a press the gestures saw may finish a drag at `at`
      this.gestures.cancel();
      return;
    }
    const hintBefore = this.gestures.limitHint;
    this.gestures.cancel(at ? this.toWorld(at) : undefined);
    if (this.gestures.limitHint && this.gestures.limitHint !== hintBefore) playSfx('refuse');
  }

  /** AUD-U4: Esc opens / closes the pause card (never leaves); R opens it, R on the card restarts. */
  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.targeting) this.targeting = false;
      else this.togglePause();
    } else if (e.key === 'p' || e.key === 'P' || e.key === ' ') this.togglePause();
    else if (e.key === 'r' || e.key === 'R') {
      if (this.loop.paused) this.restart();
      else this.pause();
    }
    else if (e.key === '1') this.useBooster('overdrive');
    else if (e.key === '2') this.useBooster('freeze');
    else if (e.key === '3') this.useBooster('airstrike');
  }
}
