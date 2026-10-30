import type { GameState, LevelDef } from '../sim/types';
import { LEVEL_META, levelIndex } from '../levels/index';
import type { Palette } from '../render/palette';
import type { View } from '../render/view';
import { applyTransform, clipToMap, hudAnchors, toHudSpace } from '../render/view';
import { drawSea } from '../render/sea';
import type { ShopTab } from '../render/menuLayout';
import { CONFIRM, HUD, RESULT, TITLE } from '../render/layout';
import type { Rect } from '../render/widgets';
import { hitRect } from '../render/widgets';
import { drawTitle } from '../render/menus';
import { screenToTitle, titleRectShift, titleShifts, titleToScreen } from '../render/titleLayout';
import type { ToastOpts } from '../render/economyWidgets';
import type { PointerPoint } from '../input/pointer';
import { drawGame } from '../render/draw';
import type { HudPlayUi, ResultExtras } from '../render/hud';
import { hudOverlaysLoaded, resultShareLayout } from '../render/hud';
import type { SaveData } from './save';
import { writeSave } from './save';
import { isMuted, playSfx, toggleMuted } from '../audio/index';
import type { AdSession } from '../economy/adsFlow';
import { canShowRewarded, maybeShowInterstitial, onResultShown, showRewarded } from '../economy/adsFlow';
import type { ResultEarnings } from '../economy/wallet';
import { bandOf, claimDaily, dailyStatus, earnCrystals, earnGold, payMilestones, spendCrystals } from '../economy/wallet';
import { ACHIEVEMENTS, AD_PLACEMENTS, CRYSTAL_SERVICES } from '../economy/catalog';
import type { AchievementGrant } from '../economy/achievements';
import { evaluateAchievements } from '../economy/achievements';
import { equippedSkin } from '../economy/entitlements';
import type { Language } from './i18n';
import { currentLanguage, levelLesson, loadEnglishMenus, nextLanguage, t } from './i18n';
import { achievementName } from './catalogText';
import type { DailyChallenge, WeeklyChallenge } from '../daily/challenge';
import type { DailyOutcome } from './daily';
import { restartLevel } from './daily';
import type { WeeklyOutcome } from './weekly';
import type { PreparedShare, ShareRecord } from './share';
import { loadChunk } from '../lazyChunk';
import { maybeAskForReview } from '../native/review';

/** A screen owns drawing and input while it is current. */
export interface Screen {
  readonly name: 'title' | 'levelSelect' | 'play' | 'result' | 'settings' | 'howto' | 'shop' | 'achievements' | 'loading';
  enter?(): void;
  exit?(): void;
  update?(dtMs: number, nowMs: number): void;
  draw(view: View, nowMs: number): void;
  down?(p: PointerPoint): void;
  move?(p: PointerPoint): void;
  up?(p: PointerPoint): void;
  /** The press ended without an `up` (`at`: the pointer's last known position on a platform `pointercancel`). */
  cancel?(at?: PointerPoint): void;
  key?(e: KeyboardEvent): void;
  /** Mouse wheel / trackpad scroll in logical px (positive = content moves up). */
  wheel?(dy: number): void;
  /** Status pill of the screen, when it has one (the app shell reports a failed chunk download on it). */
  readonly toast?: Toast;
  /**
   * FE-11: menus whose header / bottom chrome is anchored to the safe-area edges of a tall screen map
   * a layout point (their 9:16 rects) to where it is drawn, and back. Absent = the identity.
   */
  fromLayout?(x: number, y: number): { x: number; y: number };
  toLayout?(x: number, y: number): { x: number; y: number };
}

/** Per-attempt options for `App.startLevel`. */
export interface StartOptions {
  /**
   * Fallback "Reinforcements" continue (ECONOMY.md §3.5) when no snapshot can be resumed: restart
   * with +15 starting infantry on every player tower; the new attempt offers no second continue.
   */
  reinforcements?: boolean;
  /**
   * Daily Challenge (GDD §7): the twist's modifiers replace the commander upgrades, boosters and
   * continues are off, the result goes through `recordChallengeResult` instead of `recordResult`.
   * `App.startLevel` is called with the challenge's own seed.
   */
  challenge?: DailyChallenge;
  /**
   * Yesterday's map (DAILY-6): with `challenge` (yesterday's), a practice run — same fixed-match
   * rules, but the result writes nothing (`practiceResult`: no reward, streak, best or milestone).
   */
  practice?: boolean;
  /** Weekly Challenge (GDD §8): as `challenge`, booked by `recordWeeklyResult` against its Monday key. */
  weekly?: WeeklyChallenge;
}

/** What screens may ask of the application shell. */
export interface App {
  readonly view: View;
  readonly save: SaveData;
  /** Session-scoped ad counters (interstitial cadence, rewarded cooldowns). */
  readonly ads: AdSession;
  palette(): Palette;
  goTitle(): void;
  /** Open the level map; `notice` is shown as a toast on it (e.g. a stale Daily Challenge, BUG-9). */
  goLevels(notice?: string): void;
  /** Open the shop on `tab`; BACK runs `back` (default: the title). */
  goShop(tab?: ShopTab, back?: () => void): void;
  /** Open the achievements screen; BACK runs `back` (default: the title). */
  goAchievements(back?: () => void): void;
  /** Overrides for the About block (e2e / dev): undefined = ask the providers. */
  readonly nativeInfo?: NativeInfoOverride;
  /** Start a level (its chunk may have to download first); resolves true once the play screen is up. */
  startLevel(levelId: number, seed?: number, opts?: StartOptions): Promise<boolean>;
  go(screen: Screen): void;
  /** Open the settings screen; BACK returns to `from` (title, or the paused play screen). */
  openSettings(from: Screen): void;
  /** Open the "How to play" card (FE-3); CLOSE / BACK / ESC return to `from` (settings, or the paused play screen). */
  openHowTo(from: Screen): void;
  /** Sim speed multiplier for this and future levels (pause-menu toggle, debug). */
  setSpeed(n: number): void;
  /** Switch the UI language and persist it (settings picker, title chip). */
  setLanguage(code: Language): void;
  /** Today's UTC day key for the Daily Challenge (`dayKeyOf(new Date())`, or the debug override). */
  dayKey(): string;
  /** This week's Monday UTC key for the Weekly Challenge (`weekKeyOf(new Date())`, or the debug override). */
  weekKey(): string;
}

/** Test/dev override of what the native providers report for the settings About block. */
export interface NativeInfoOverride {
  supportId?: string | null;
  privacyOptionsRequired?: boolean;
}

/** `__APP_VERSION__` / `__APP_BUILD__` are injected by vite.config.ts; "dev" when absent (Vitest). */
export function appVersion(): string {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  const build = typeof __APP_BUILD__ === 'string' && __APP_BUILD__ ? ` (build ${__APP_BUILD__})` : '';
  return `${version}${build}`;
}

/** Toast text for freshly unlocked achievements (translated names, src/ui/catalogText.ts), or null. */
export function achievementToastText(grant: AchievementGrant): string | null {
  if (!grant.unlocked.length) return null;
  const names = grant.unlocked.length <= 2 ? grant.unlocked.map((a) => achievementName(a)).join(', ') : t('achievements.many', { n: grant.unlocked.length });
  return t('achievements.unlocked', { names, crystals: grant.crystals });
}

/** How long an achievement toast stays up (result screen, title claim follow-up). */
export const ACHIEVEMENT_TOAST_MS = 3500;

/** A toast waiting for its turn (`Toast.enqueue`). */
export interface QueuedToast {
  readonly text: string;
  readonly kind: ToastOpts['kind'];
  readonly durationMs: number;
}

/**
 * Transient status pill shared by the screens (purchase results, rewards, errors). `show` replaces
 * the pill on screen; `enqueue` lines a toast up behind it (FE-9: a daily reward and the
 * achievements it unlocked are two toasts one after the other, not one four-line pill). A queued
 * toast starts on the first `opts` call after the one before it ended, so its full time is seen.
 * When the player leaves the screen first, the app shell hands the queue to the next menu screen
 * (`takeQueued` / `adopt`, src/main.ts `go`).
 */
export class Toast {
  private text = '';
  private kind: ToastOpts['kind'] = 'ok';
  private bornMs = 0;
  private durationMs = 0;
  private queue: QueuedToast[] = [];

  show(text: string, kind: ToastOpts['kind'] = 'ok', nowMs = performance.now(), durationMs = 2400): void {
    this.text = text;
    this.kind = kind;
    this.bornMs = nowMs;
    this.durationMs = durationMs;
  }

  /** Show `text` after the toasts on screen and in the queue; at once when there are none. */
  enqueue(text: string, kind: ToastOpts['kind'] = 'ok', nowMs = performance.now(), durationMs = 2400): void {
    if (this.queue.length === 0 && !this.showing(nowMs)) this.show(text, kind, nowMs, durationMs);
    else this.queue.push({ text, kind, durationMs });
  }

  /** Toasts still waiting (oldest first). */
  queued(): readonly QueuedToast[] {
    return this.queue;
  }

  /** Remove and return the waiting toasts (the screen is being left; the one on screen stays). */
  takeQueued(): QueuedToast[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  /** Line up toasts handed over from another screen, in order, behind whatever this one shows. */
  adopt(items: readonly QueuedToast[], nowMs = performance.now()): void {
    for (const q of items) this.enqueue(q.text, q.kind, nowMs, q.durationMs);
  }

  /** The current toast has been shown and has not ended yet at `nowMs` (or has not started). */
  private showing(nowMs: number): boolean {
    return this.durationMs > 0 && nowMs - this.bornMs < this.durationMs;
  }

  opts(nowMs: number): ToastOpts | null {
    if (this.queue.length > 0 && !this.showing(nowMs)) {
      const next = this.queue.shift()!;
      this.show(next.text, next.kind, nowMs, next.durationMs);
    }
    if (!this.durationMs) return null;
    const t = (nowMs - this.bornMs) / this.durationMs;
    if (t < 0 || t >= 1) return null;
    return { text: this.text, kind: this.kind, t };
  }
}

/**
 * FE-9 hand-over: toasts queued on a screen the player left (`carried`) go to `to` when it is a
 * menu screen with a toast — behind that screen's own toast — and the result is empty. The spinner
 * screen keeps them waiting (returned as they are); a match start drops them (no status pills over
 * the first seconds of play — what they named is paid and listed on its own screen either way).
 */
export function handOverToasts(carried: readonly QueuedToast[], to: Pick<Screen, 'name' | 'toast'>, nowMs = performance.now()): QueuedToast[] {
  if (carried.length === 0) return [];
  if (to.name === 'loading') return [...carried];
  if (to.name !== 'play') to.toast?.adopt(carried, nowMs);
  return [];
}

/** Fill the whole screen with the map background (BUG-34: full bleed, no bars), and leave the context in logical units + clipped. */
export function beginMapFrame(view: View, pal: Palette): void {
  const ctx = view.ctx;
  ctx.save();
  applyTransform(view);
  drawSea(ctx, view, { top: pal.background, bottom: pal.background });
  clipToMap(view);
}

export function endMapFrame(view: View): void {
  view.ctx.restore();
}

/* ---------- Title ---------- */

export const TITLE_PLAY: Rect = TITLE.play;
export const TITLE_SETTINGS: Rect = TITLE.settings;
export const TITLE_SOUND: Rect = TITLE.sound;

const DAILY_CHEST_PLACEMENT = AD_PLACEMENTS.find((p) => p.id === 'rv_daily_chest')!;

export class TitleScreen implements Screen {
  readonly name = 'title' as const;
  private pressed: Rect | null = null;
  readonly toast = new Toast();
  private nowMs = 0;
  private pendingAd = false;
  constructor(private readonly app: App) {}

  /** Rewarded crystal chest: streak already claimed today and a video is available (ECONOMY.md §5.2). */
  private adChestOffered(): boolean {
    return dailyStatus(this.app.save, Date.now()).claimed && canShowRewarded(this.app.ads, this.app.save, DAILY_CHEST_PLACEMENT.id);
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const save = this.app.save;
    const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
    const daily = dailyStatus(save, Date.now());
    const adChest = this.adChestOffered();
    drawTitle(view, this.app.palette(), {
      playRect: TITLE_PLAY,
      settingsRect: TITLE_SETTINGS,
      soundRect: TITLE_SOUND,
      shopRect: TITLE.shop,
      dailyRect: TITLE.daily,
      achievementsRect: TITLE.achievements,
      achievements: { unlocked: save.achievements.unlocked.length, total: ACHIEVEMENTS.length },
      walletRect: TITLE.wallet,
      langRect: TITLE.lang,
      language: currentLanguage(),
      soundOn: !isMuted(),
      totalStars: total,
      gold: save.gold,
      crystals: save.crystals,
      daily: {
        claimable: !daily.claimed,
        day: daily.day,
        gold: daily.gold,
        crystals: adChest && DAILY_CHEST_PLACEMENT.reward.kind === 'crystals' ? DAILY_CHEST_PLACEMENT.reward.amount : daily.crystals,
        adChest,
      },
      theme: equippedSkin(save).theme,
      nowMs,
      pressed: this.pressed,
      toast: this.toast.opts(nowMs),
    });
  }

  /**
   * FE-12: on a tall screen the title's groups move with the island (src/render/titleLayout.ts); a
   * rect is hit where it is drawn — its layout rect moved by the same shift the renderer applies.
   */
  private on(r: Rect, p: { x: number; y: number }): boolean {
    return hitRect(this.app.view, r, p.x, p.y - titleRectShift(titleShifts(this.app.view), r));
  }

  /** Screen logical point → title layout point (e2e: `logicalToLayout`). */
  toLayout(x: number, y: number): { x: number; y: number } {
    return screenToTitle(titleShifts(this.app.view), x, y);
  }

  /** Where title layout point (x, y) is drawn (e2e: `layoutToClient`). */
  fromLayout(x: number, y: number): { x: number; y: number } {
    return titleToScreen(titleShifts(this.app.view), x, y);
  }

  private hit(p: PointerPoint): Rect | null {
    for (const r of [TITLE_PLAY, TITLE_SETTINGS, TITLE_SOUND, TITLE.shop, TITLE.daily, TITLE.achievements, TITLE.wallet, TITLE.lang]) if (this.on(r, p)) return r;
    return null;
  }

  down(p: PointerPoint): void {
    this.pressed = this.hit(p);
  }

  move(p: PointerPoint): void {
    if (this.pressed && !this.on(this.pressed, p)) this.pressed = null;
  }

  up(p: PointerPoint): void {
    this.pressed = null;
    if (this.on(TITLE_PLAY, p)) this.app.goLevels();
    else if (this.on(TITLE_SETTINGS, p)) this.app.openSettings(this);
    else if (this.on(TITLE_SOUND, p)) toggleMuted(); // persists settings.sound via the audio facade
    else if (this.on(TITLE.shop, p) || this.on(TITLE.wallet, p)) this.app.goShop('crystals', () => this.app.goTitle());
    else if (this.on(TITLE.daily, p)) this.claimChest();
    else if (this.on(TITLE.achievements, p)) this.app.goAchievements(() => this.app.goTitle());
    else if (this.on(TITLE.lang, p)) {
      playSfx('button');
      this.app.setLanguage(nextLanguage(currentLanguage()));
    }
  }

  /**
   * Toast a claimed reward. Achievements are re-evaluated on every claim (ECON-4); what unlocked is
   * its own toast right after the reward's (FE-9 — one combined toast filled all four lines in
   * Russian). Leaving the title before it shows hands it to the next menu screen (src/main.ts `go`).
   */
  private toastClaim(text: string): void {
    this.toast.show(text, 'ok', this.nowMs);
    const extra = achievementToastText(evaluateAchievements(this.app.save));
    if (extra) this.toast.enqueue(extra, 'ok', this.nowMs, ACHIEVEMENT_TOAST_MS);
  }

  /** Streak reward first; once claimed, the rewarded crystal chest (when a video is available). */
  claimChest(): void {
    const save = this.app.save;
    const claimed = claimDaily(save, Date.now());
    if (claimed) {
      playSfx('upgrade');
      const parts = [claimed.gold > 0 ? t('amount.gold', { n: claimed.gold }) : '', claimed.crystals > 0 ? t('amount.crystals', { n: claimed.crystals }) : ''].filter(Boolean);
      this.toastClaim(t('title.dailyReward', { day: claimed.day, parts: parts.join(' · ') }));
      return;
    }
    if (this.adChestOffered() && !this.pendingAd) {
      this.pendingAd = true;
      void showRewarded(this.app.ads, save, DAILY_CHEST_PLACEMENT.id).then((ok) => {
        this.pendingAd = false;
        if (!ok) return;
        const amount = DAILY_CHEST_PLACEMENT.reward.kind === 'crystals' ? DAILY_CHEST_PLACEMENT.reward.amount : 0;
        earnCrystals(save, amount);
        playSfx('upgrade');
        this.toastClaim(t('title.crystalChest', { n: amount }));
      });
      return;
    }
    this.toast.show(t('title.comeBack'), 'ok', this.nowMs);
  }

  cancel(): void {
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') this.app.goLevels();
  }
}

/* ---------- Result ---------- */

export interface ResultInfo {
  state: GameState;
  level: LevelDef;
  ui: HudPlayUi;
  earnings: ResultEarnings;
  /** This attempt already used the "Reinforcements" continue (offered once per attempt). */
  continued: boolean;
  /** Achievements this result unlocked (toasted on enter). */
  achievements: AchievementGrant;
  /**
   * Rewind the play screen ~20 s and resume with the reinforcements (`PlayScreen.resumeFromSnapshot`).
   * False = no usable snapshot; the result screen then restarts the level with the bonus garrison.
   */
  resume?: () => boolean;
  /** Daily Challenge match (GDD §7): NEXT returns to the map, RETRY keeps the seed and twist. */
  challenge?: DailyChallenge;
  /** What the challenge result did (reward paid once, streak, best of the day). */
  daily?: DailyOutcome;
  /** Weekly Challenge match (GDD §8): same buttons as a daily; `weeklyOutcome` is what the result did. */
  weekly?: WeeklyChallenge;
  weeklyOutcome?: WeeklyOutcome;
}

const DOUBLE_GOLD = AD_PLACEMENTS.find((p) => p.id === 'rv_double_gold')!;

/**
 * Consecutive defeats of one level in this app session (FE-4 defeat tip): the HOW TO PLAY link
 * appears from the second one. A win, or a result on another level, clears it. Never saved.
 */
let defeatStreak: { levelId: number; count: number } | null = null;

/** Book a result; returns the level's consecutive-defeat count after it (0 after a win). */
export function noteResult(levelId: number, won: boolean): number {
  if (won) {
    defeatStreak = null;
    return 0;
  }
  defeatStreak = defeatStreak?.levelId === levelId ? { levelId, count: defeatStreak.count + 1 } : { levelId, count: 1 };
  return defeatStreak.count;
}

export function resetDefeatStreakForTests(): void {
  defeatStreak = null;
}

/** Wallet notes are plain English data (`"10 levels cleared"`, `"Band 1 at 3★"`); render them in the UI language. */
export function translateNote(note: string): string {
  const levels = /^(\d+) levels cleared$/.exec(note);
  if (levels) return t('result.note.levels', { n: levels[1]! });
  const band = /^Band (\d+) at 3★$/.exec(note);
  if (band) return t('result.note.band', { n: band[1]! });
  return note;
}
const CONTINUE_AD = AD_PLACEMENTS.find((p) => p.id === 'rv_continue')!;

/* ---------- Share card (SHARE-1): the flow and the drawing are a lazy chunk (src/ui/share.ts) ---------- */

type ShareChunk = typeof import('./share');
let shareChunk: Promise<ShareChunk> | null = null;
let lastShare: ShareRecord | null = null;

/** Load the share chunk (idempotent; a failed download is forgotten so the next tap retries). */
function loadShareChunk(): Promise<ShareChunk> {
  // with the card's English strings (PERF-8, a chunk of their own)
  shareChunk ??= Promise.all([loadChunk('share', () => import('./share')), loadEnglishMenus()]).then(([m]) => m).catch((err: unknown) => {
    shareChunk = null;
    throw err;
  });
  return shareChunk;
}

/** What the last SHARE tap did (debug surface `lastShare`, e2e), or null. */
export function lastShareRecord(): ShareRecord | null {
  return lastShare;
}

/**
 * Shows the frozen final frame under the win/lose overlay (drawn by drawGame) with the economy
 * offers: ×2 gold (rewarded), Reinforcements (crystals or rewarded), level skip (crystals) and the
 * wallet. Leaving the screen is where the level-break interstitial may fire (ECONOMY.md §5.1).
 */
export class ResultScreen implements Screen {
  readonly name = 'result' as const;
  private pressed: Rect | null = null;
  private pending = false;
  private doubled = false;
  private leaving = false;
  private nowMs = 0;
  readonly toast = new Toast();
  /** A SHARE tap is being served (card drawing / share sheet open): further taps are ignored. */
  private sharing = false;
  /** The card for this result, drawn once (started on the SHARE press). */
  private sharePrep: Promise<PreparedShare | null> | null = null;
  /** Consecutive defeats of this level in the session, this one included (0 on a win). */
  private readonly defeatCount: number;
  /** AUD-U5: the crystal spend waiting on the confirm card (`CONFIRM`), or null. */
  private ask: 'continue' | 'skip' | null = null;

  constructor(
    private readonly app: App,
    readonly info: ResultInfo,
  ) {
    this.defeatCount = noteResult(info.level.id, info.ui.outcome === 'won');
  }

  enter(): void {
    onResultShown(this.app.ads);
    const d = this.info.daily;
    const w = this.info.weeklyOutcome;
    // the daily result line (hud.ts) carries the crystal total; the milestone itself is named by a toast
    // (the weekly's week-streak bonus (WK-1) and 3★ target bonus take the same slot, GDD §8.2) —
    // priority: achievement > daily milestone > week-streak milestone > 3★ target
    const text =
      achievementToastText(this.info.achievements) ??
      (d?.milestone
        ? t('daily.milestone', { day: d.streak, crystals: d.milestone })
        : w?.milestone
          ? t('weekly.resultMilestone', { n: w.streak, crystals: w.milestone })
          : w?.targetHit
            ? t('weekly.resultTarget', { crystals: w.crystals - w.milestone })
            : null);
    if (text) this.toast.show(text, 'ok', performance.now(), ACHIEVEMENT_TOAST_MS);
    if (this.shareOffered()) void loadShareChunk().catch(() => undefined); // warm: the tap's activation must not wait on the network
    void maybeAskForReview(this.info, this.app.save); // MM-9 rating prompt: off by default, never rejects
  }

  /** SHARE (SHARE-1) is on every result except Yesterday's map — a practice run has no reward and nothing to prove. */
  shareOffered(): boolean {
    return this.info.daily?.practice !== true;
  }

  private prepareShare(): Promise<PreparedShare | null> {
    if (!this.sharePrep) {
      const p = loadShareChunk().then((m) => m.prepareShare(this.info, this.app.palette(), appVersion()));
      this.sharePrep = p;
      p.catch(() => {
        if (this.sharePrep === p) this.sharePrep = null; // retried on the next tap
      });
    }
    return this.sharePrep;
  }

  /**
   * Draw the share card and hand it to the platform (native sheet → Web Share with the PNG → Web
   * Share text-only → PNG download); toast "Shared" / "Saved" / "Sharing not available".
   * Resolves the record (null when not offered or already running). Never rejects.
   */
  share(): Promise<ShareRecord | null> {
    if (!this.shareOffered() || this.sharing) return Promise.resolve(null);
    this.sharing = true;
    playSfx('button');
    return this.prepareShare()
      .then(async (prep) => {
        if (!prep) return null;
        const m = await loadShareChunk();
        const rec = await m.sendShare(prep);
        lastShare = rec;
        const text = m.shareToastText(rec.result);
        if (text) this.toast.show(text, rec.result === 'unavailable' ? 'error' : 'ok', this.nowMs);
        return rec;
      })
      .catch(() => {
        this.toast.show(t('share.unavailable'), 'error', this.nowMs);
        return null;
      })
      .finally(() => {
        this.sharing = false;
      });
  }

  private get won(): boolean {
    return this.info.ui.outcome === 'won';
  }

  /** Level skip (ECONOMY.md §3.4): after 3 straight defeats, uncleared level, once per band. */
  private skipOffered(): boolean {
    const save = this.app.save;
    const id = this.info.level.id;
    const band = bandOf(id);
    return (
      !this.won &&
      (save.defeats[String(id)] ?? 0) >= CRYSTAL_SERVICES.levelSkip.offerAfterDefeats &&
      (save.stars[String(id)] ?? 0) === 0 &&
      band >= 0 &&
      !save.skips.includes(band)
    );
  }

  extras(): ResultExtras {
    const save = this.app.save;
    const e = this.info.earnings;
    const fixed = !!(this.info.challenge ?? this.info.weekly);
    const continueOffered = !this.won && !this.info.continued && !fixed;
    const d = this.info.daily;
    const w = this.info.weeklyOutcome;
    return {
      daily: d ? { won: d.won, firstWin: d.firstWin, gold: d.gold, crystals: d.crystals, streak: d.streak, best: d.best, practice: d.practice } : undefined,
      weekly: w ? { firstWin: w.firstWin, gold: w.gold, streak: w.streak, best: w.best } : undefined,
      crystalsEarned: e.crystals,
      notes: e.notes.map(translateNote),
      replayCapped: e.replayCapped,
      doubleGold: this.won && e.gold > 0 && canShowRewarded(this.app.ads, save, DOUBLE_GOLD.id) ? e.gold : null,
      doubled: this.doubled,
      continueCrystals: continueOffered ? CRYSTAL_SERVICES.continue.costCrystals : null,
      continueAd: continueOffered && canShowRewarded(this.app.ads, save, CONTINUE_AD.id),
      skipCrystals: this.skipOffered() && !fixed ? CRYSTAL_SERVICES.levelSkip.costCrystals : null,
      pending: this.pending,
      tip: this.won ? null : levelLesson(this.info.level),
      howto: !this.won && this.defeatCount >= 2,
      share: this.shareOffered(),
      sharing: this.sharing,
      confirm: this.ask && { kind: this.ask, crystals: this.cost(this.ask), have: save.crystals },
    };
  }

  private cost(kind: 'continue' | 'skip'): number {
    return (kind === 'skip' ? CRYSTAL_SERVICES.levelSkip : CRYSTAL_SERVICES.continue).costCrystals;
  }

  /** AUD-U5: CONTINUE / SKIP LEVEL tapped — the confirm card, or the "not enough crystals" toast. */
  private askSpend(kind: 'continue' | 'skip'): void {
    const msg = this.app.save.crystals < this.cost(kind) ? 'result.notEnoughCrystals' : hudOverlaysLoaded() ? null : 'common.loadFailed';
    if (msg) this.toast.show(t(msg), 'error', this.nowMs);
    else {
      playSfx('button');
      this.ask = kind;
    }
  }

  /** The confirm card's YES (`yes`) or CANCEL. */
  answer(yes: boolean): void {
    const kind = this.ask;
    this.ask = null;
    if (yes && kind === 'skip') this.skipLevel();
    else if (yes && kind) this.continueWithCrystals();
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const ui = this.info.ui;
    const hud = ui.hud;
    if (hud) {
      hud.result = this.extras();
      hud.wallet = { gold: this.app.save.gold, crystals: this.app.save.crystals };
      hud.pressed = this.pressed;
      hud.toast = this.toast.opts(nowMs);
    }
    drawGame(view.ctx, this.info.state, view, ui, nowMs);
  }

  private rects(): Rect[] {
    if (this.ask) return [CONFIRM.yes, CONFIRM.no];
    const ex = this.extras();
    const list: Rect[] = [RESULT.retry, RESULT.menu, HUD.wallet, HUD.menu];
    if (this.won && this.info.ui.hasNext) list.push(RESULT.next);
    if (ex.doubleGold !== null && !ex.doubled) list.push(RESULT.extra);
    if (ex.skipCrystals !== null) list.push(RESULT.extra);
    const both = ex.continueCrystals !== null && ex.continueAd;
    if (ex.continueCrystals !== null) list.push(both ? RESULT.continueCrystals : RESULT.continueSolo);
    if (ex.continueAd) list.push(both ? RESULT.continueAd : RESULT.continueSolo);
    if (ex.howto) list.push(RESULT.howto);
    const share = resultShareLayout(ex, this.won).share;
    if (share) list.push(share);
    return list;
  }

  /** `r` holds the point: the bottom band's rects (wallet, MENU) through `toHudSpace` — the band is anchored to the screen edge (BUG-34) — the card's as they are. */
  private hits(r: Rect, p: PointerPoint): boolean {
    const h = r === HUD.wallet || r === HUD.menu ? toHudSpace(hudAnchors(this.app.view), p.x, p.y) : p;
    return hitRect(this.app.view, r, h.x, h.y);
  }

  down(p: PointerPoint): void {
    this.pressed = this.rects().find((r) => this.hits(r, p)) ?? null;
    // draw the card while the finger is down, so the share sheet opens inside the tap's user activation
    if (this.pressed !== null && this.pressed === resultShareLayout(this.extras(), this.won).share && !this.sharing) void this.prepareShare().catch(() => undefined);
  }

  move(p: PointerPoint): void {
    if (this.pressed && !this.hits(this.pressed, p)) this.pressed = null;
  }

  cancel(): void {
    this.pressed = null;
  }

  /** Run the level-break interstitial policy, then navigate. Double taps are ignored. */
  private leave(go: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    void maybeShowInterstitial(this.app.ads, this.app.save, Date.now()).then(go, go);
  }

  private nextLevel(): void {
    const next = LEVEL_META[levelIndex(this.info.level.id) + 1];
    if (next && !this.info.challenge && !this.info.weekly) void this.app.startLevel(next.id);
    else this.app.goLevels();
  }

  /** Same level again; a challenge keeps its seed and twist (unless its UTC day / week has passed — `restartLevel`). */
  private retry(): void {
    restartLevel(this.app, this.info.level.id, this.info.challenge, this.info.weekly, this.info.daily?.practice);
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || !this.hits(hit, p) || this.pending || this.leaving) return;
    const { ui } = this.info;
    if (this.ask) this.answer(hit === CONFIRM.yes);
    else if (hit === RESULT.retry) this.leave(() => this.retry());
    else if (hit === RESULT.menu || hit === HUD.menu) this.leave(() => this.app.goLevels());
    else if (hit === RESULT.next && ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
    else if (hit === HUD.wallet) this.app.goShop('crystals', () => this.app.go(this));
    else if (hit === RESULT.share || hit === RESULT.shareInline) void this.share();
    else if (hit === RESULT.howto) {
      playSfx('button');
      this.app.openHowTo(this); // the card's CLOSE / BACK / ESC return to this result screen
    }
    else if (hit === RESULT.extra) {
      if (this.won) this.doubleGold();
      else this.askSpend('skip');
    } else if (hit === RESULT.continueCrystals || (hit === RESULT.continueSolo && !this.extras().continueAd)) this.askSpend('continue');
    else if (hit === RESULT.continueAd || hit === RESULT.continueSolo) this.continueWithAd();
  }

  /** Rewarded ×2 gold: pays the result's gold once more (ECONOMY.md §5.2). */
  doubleGold(): void {
    const ex = this.extras();
    if (ex.doubleGold === null || ex.doubled || this.pending) return;
    this.pending = true;
    void showRewarded(this.app.ads, this.app.save, DOUBLE_GOLD.id).then((ok) => {
      this.pending = false;
      if (!ok) {
        this.toast.show(t('result.noVideo'), 'error', this.nowMs);
        return;
      }
      const gained = ex.doubleGold ?? 0;
      earnGold(this.app.save, gained);
      this.doubled = true;
      this.info.ui.coinsEarned += gained;
      this.info.ui.coinsTotal = this.app.save.gold;
      this.info.ui.particles?.coinBurst(360, RESULT.extra.y, 14, this.app.palette());
      playSfx('upgrade');
      this.toast.show(t('amount.gold', { n: gained }), 'ok', this.nowMs);
    });
  }

  /** Paid continue: rewind and resume; if the snapshot ring cannot serve one, restart with the bonus garrison. */
  private reinforce(): void {
    if (this.info.resume?.()) return;
    playSfx('upgrade');
    void this.app.startLevel(this.info.level.id, undefined, { reinforcements: true });
  }

  continueWithCrystals(): void {
    if (this.won || this.info.continued || this.pending) return;
    if (!spendCrystals(this.app.save, CRYSTAL_SERVICES.continue.costCrystals)) {
      this.toast.show(t('result.notEnoughCrystals'), 'error', this.nowMs);
      return;
    }
    this.reinforce();
  }

  continueWithAd(): void {
    if (this.won || this.info.continued || this.pending) return;
    if (!canShowRewarded(this.app.ads, this.app.save, CONTINUE_AD.id)) return;
    this.pending = true;
    void showRewarded(this.app.ads, this.app.save, CONTINUE_AD.id).then((ok) => {
      this.pending = false;
      if (ok) this.reinforce();
      else this.toast.show(t('result.noVideo'), 'error', this.nowMs);
    });
  }

  /** Level skip: 1★, next level unlocked, no gold, counts toward milestones; once per band. */
  skipLevel(): void {
    if (!this.skipOffered() || this.pending) return;
    const save = this.app.save;
    if (!spendCrystals(save, CRYSTAL_SERVICES.levelSkip.costCrystals)) {
      this.toast.show(t('result.notEnoughCrystals'), 'error', this.nowMs);
      return;
    }
    const key = String(this.info.level.id);
    save.stars[key] = Math.max(save.stars[key] ?? 0, CRYSTAL_SERVICES.levelSkip.starsGranted);
    save.skips.push(bandOf(this.info.level.id));
    delete save.defeats[key];
    payMilestones(save);
    writeSave(save);
    evaluateAchievements(save); // a skip changes the star table (never to 3★, but the rule is "after each result")
    playSfx('upgrade');
    this.leave(() => this.nextLevel());
  }

  key(e: KeyboardEvent): void {
    if (this.pending || this.leaving) return;
    if (this.ask) {
      if (e.key === 'Escape' || e.key === 'Enter') this.answer(e.key === 'Enter');
    } else if (e.key === 'Escape') this.leave(() => this.app.goLevels());
    else if (e.key === 'Enter') {
      const { ui } = this.info;
      if (ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
      else this.leave(() => this.retry());
    }
  }
}
