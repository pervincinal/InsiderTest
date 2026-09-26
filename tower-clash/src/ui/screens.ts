import type { GameState, LevelDef } from '../sim/types';
import { C } from '../sim/constants';
import { LEVEL_META, levelIndex } from '../levels/index';
import type { Palette } from '../render/palette';
import type { View } from '../render/view';
import { applyDeviceTransform, applyTransform, clipToMap } from '../render/view';
import type { ShopTab } from '../render/layout';
import { HUD, RESULT, TITLE } from '../render/layout';
import type { Rect } from '../render/widgets';
import { inRect } from '../render/widgets';
import { drawTitle } from '../render/menus';
import type { ToastOpts } from '../render/economyWidgets';
import type { PointerPoint } from '../input/pointer';
import { drawGame } from '../render/draw';
import type { HudPlayUi, ResultExtras } from '../render/hud';
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
import { currentLanguage, levelLesson, nextLanguage, t } from './i18n';
import { achievementName } from './catalogText';
import type { DailyChallenge, WeeklyChallenge } from '../daily/challenge';
import type { DailyOutcome } from './daily';
import { restartLevel } from './daily';
import type { WeeklyOutcome } from './weekly';

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
  cancel?(): void;
  key?(e: KeyboardEvent): void;
  /** Mouse wheel / trackpad scroll in logical px (positive = content moves up). */
  wheel?(dy: number): void;
  /** Status pill of the screen, when it has one (the app shell reports a failed chunk download on it). */
  readonly toast?: Toast;
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

/** Transient status pill shared by the screens (purchase results, rewards, errors). */
export class Toast {
  private text = '';
  private kind: ToastOpts['kind'] = 'ok';
  private bornMs = 0;
  private durationMs = 0;

  show(text: string, kind: ToastOpts['kind'] = 'ok', nowMs = performance.now(), durationMs = 2400): void {
    this.text = text;
    this.kind = kind;
    this.bornMs = nowMs;
    this.durationMs = durationMs;
  }

  opts(nowMs: number): ToastOpts | null {
    if (!this.durationMs) return null;
    const t = (nowMs - this.bornMs) / this.durationMs;
    if (t < 0 || t >= 1) return null;
    return { text: this.text, kind: this.kind, t };
  }
}

/** Fill the letterbox and the map background, and leave the context in logical units + clipped. */
export function beginMapFrame(view: View, pal: Palette): void {
  const ctx = view.ctx;
  applyDeviceTransform(view);
  ctx.fillStyle = pal.letterbox;
  ctx.fillRect(0, 0, view.cssW + 1, view.cssH + 1); // +1: cover the rounded-up last pixel column / row (layers.ts)
  ctx.save();
  applyTransform(view);
  clipToMap(view);
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
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

  private hit(p: PointerPoint): Rect | null {
    for (const r of [TITLE_PLAY, TITLE_SETTINGS, TITLE_SOUND, TITLE.shop, TITLE.daily, TITLE.achievements, TITLE.wallet, TITLE.lang]) if (inRect(r, p.x, p.y)) return r;
    return null;
  }

  down(p: PointerPoint): void {
    this.pressed = this.hit(p);
  }

  move(p: PointerPoint): void {
    if (this.pressed && !inRect(this.pressed, p.x, p.y)) this.pressed = null;
  }

  up(p: PointerPoint): void {
    this.pressed = null;
    if (inRect(TITLE_PLAY, p.x, p.y)) this.app.goLevels();
    else if (inRect(TITLE_SETTINGS, p.x, p.y)) this.app.openSettings(this);
    else if (inRect(TITLE_SOUND, p.x, p.y)) toggleMuted(); // persists settings.sound via the audio facade
    else if (inRect(TITLE.shop, p.x, p.y) || inRect(TITLE.wallet, p.x, p.y)) this.app.goShop('crystals', () => this.app.goTitle());
    else if (inRect(TITLE.daily, p.x, p.y)) this.claimChest();
    else if (inRect(TITLE.achievements, p.x, p.y)) this.app.goAchievements(() => this.app.goTitle());
    else if (inRect(TITLE.lang, p.x, p.y)) {
      playSfx('button');
      this.app.setLanguage(nextLanguage(currentLanguage()));
    }
  }

  /** Achievements are re-evaluated on every claim (ECON-4); the toast names what unlocked. */
  private withAchievements(text: string): string {
    const extra = achievementToastText(evaluateAchievements(this.app.save));
    return extra ? `${text} · ${extra}` : text;
  }

  /** Streak reward first; once claimed, the rewarded crystal chest (when a video is available). */
  claimChest(): void {
    const save = this.app.save;
    const claimed = claimDaily(save, Date.now());
    if (claimed) {
      playSfx('upgrade');
      const parts = [claimed.gold > 0 ? t('amount.gold', { n: claimed.gold }) : '', claimed.crystals > 0 ? t('amount.crystals', { n: claimed.crystals }) : ''].filter(Boolean);
      this.toast.show(this.withAchievements(t('title.dailyReward', { day: claimed.day, parts: parts.join(' · ') })), 'ok', this.nowMs);
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
        this.toast.show(this.withAchievements(t('title.crystalChest', { n: amount })), 'ok', this.nowMs);
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
  /** Consecutive defeats of this level in the session, this one included (0 on a win). */
  private readonly defeatCount: number;

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
    // (the weekly's 3★ target bonus takes the same slot, GDD §8.2)
    const text =
      achievementToastText(this.info.achievements) ??
      (d?.milestone ? t('daily.milestone', { day: d.streak, crystals: d.milestone }) : w?.targetHit ? t('weekly.resultTarget', { crystals: w.crystals }) : null);
    if (text) this.toast.show(text, 'ok', performance.now(), 3500);
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
      daily: d ? { won: d.won, firstWin: d.firstWin, gold: d.gold, crystals: d.crystals, streak: d.streak, best: d.best } : undefined,
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
    };
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
    const ex = this.extras();
    const list: Rect[] = [RESULT.retry, RESULT.menu, HUD.wallet, HUD.menu];
    if (this.won && this.info.ui.hasNext) list.push(RESULT.next);
    if (ex.doubleGold !== null && !ex.doubled) list.push(RESULT.extra);
    if (ex.skipCrystals !== null) list.push(RESULT.extra);
    const both = ex.continueCrystals !== null && ex.continueAd;
    if (ex.continueCrystals !== null) list.push(both ? RESULT.continueCrystals : RESULT.continueSolo);
    if (ex.continueAd) list.push(both ? RESULT.continueAd : RESULT.continueSolo);
    if (ex.howto) list.push(RESULT.howto);
    return list;
  }

  down(p: PointerPoint): void {
    this.pressed = this.rects().find((r) => inRect(r, p.x, p.y)) ?? null;
  }

  move(p: PointerPoint): void {
    if (this.pressed && !inRect(this.pressed, p.x, p.y)) this.pressed = null;
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
    restartLevel(this.app, this.info.level.id, this.info.challenge, this.info.weekly);
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || !inRect(hit, p.x, p.y) || this.pending || this.leaving) return;
    const { ui } = this.info;
    if (hit === RESULT.retry) this.leave(() => this.retry());
    else if (hit === RESULT.menu || hit === HUD.menu) this.leave(() => this.app.goLevels());
    else if (hit === RESULT.next && ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
    else if (hit === HUD.wallet) this.app.goShop('crystals', () => this.app.go(this));
    else if (hit === RESULT.howto) {
      playSfx('button');
      this.app.openHowTo(this); // the card's CLOSE / BACK / ESC return to this result screen
    }
    else if (hit === RESULT.extra) {
      if (this.won) this.doubleGold();
      else this.skipLevel();
    } else if (hit === RESULT.continueCrystals || (hit === RESULT.continueSolo && !this.extras().continueAd)) this.continueWithCrystals();
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
    if (e.key === 'Escape') this.leave(() => this.app.goLevels());
    else if (e.key === 'Enter') {
      const { ui } = this.info;
      if (ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
      else this.leave(() => this.retry());
    }
  }
}
