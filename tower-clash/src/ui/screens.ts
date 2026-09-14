import type { GameState, LevelDef } from '../sim/types';
import { C } from '../sim/constants';
import { LEVELS } from '../levels/index';
import type { Palette } from '../render/palette';
import type { View } from '../render/view';
import { applyDeviceTransform, applyTransform, clipToMap } from '../render/view';
import type { SettingsAboutLayout, ShopTab } from '../render/layout';
import {
  ACHIEVEMENTS_LAYOUT,
  HUD,
  LEVEL_MAP,
  RESULT,
  SETTINGS,
  TITLE,
  achievementRowRect,
  achievementsMaxScroll,
  levelMapMaxScroll,
  levelNodeCentre,
  levelNodeRect,
  settingsAboutLayout,
} from '../render/layout';
import type { Rect } from '../render/widgets';
import { inRect, segmentAt } from '../render/widgets';
import type { AchievementRow } from '../render/menus';
import { MOTION_SEGMENTS, RATIO_SEGMENTS, drawAchievements, drawLevelSelect, drawSettings, drawTitle } from '../render/menus';
import type { ToastOpts } from '../render/economyWidgets';
import type { PointerPoint } from '../input/pointer';
import { drawGame } from '../render/draw';
import type { HudPlayUi, ResultExtras } from '../render/hud';
import type { SaveData } from './save';
import { isLevelUnlocked, resetProgress, writeSave } from './save';
import { applyMotionPref } from './motion';
import { isMuted, playSfx, toggleMuted } from '../audio/index';
import type { AdSession } from '../economy/adsFlow';
import { canShowRewarded, maybeShowInterstitial, onResultShown, showRewarded } from '../economy/adsFlow';
import type { ResultEarnings } from '../economy/wallet';
import { bandOf, claimDaily, dailyStatus, earnCrystals, earnGold, payMilestones, spendCrystals } from '../economy/wallet';
import { ACHIEVEMENTS, AD_PLACEMENTS, CRYSTAL_SERVICES } from '../economy/catalog';
import type { AchievementGrant } from '../economy/achievements';
import { achievementCrystalsEarned, achievementProgress, achievementToast, evaluateAchievements } from '../economy/achievements';
import type { AdsProvider } from '../economy/ads';
import { getAds } from '../economy/ads';
import type { StoreProvider } from '../economy/store';
import { getStore } from '../economy/store';
import { commanderSummary } from './upgrades';
import { equippedSkin } from '../economy/entitlements';

/** A screen owns drawing and input while it is current. */
export interface Screen {
  readonly name: 'title' | 'levelSelect' | 'play' | 'result' | 'settings' | 'shop' | 'achievements';
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
}

/** Per-attempt options for `App.startLevel`. */
export interface StartOptions {
  /**
   * Fallback "Reinforcements" continue (ECONOMY.md §3.5) when no snapshot can be resumed: restart
   * with +15 starting infantry on every player tower; the new attempt offers no second continue.
   */
  reinforcements?: boolean;
}

/** What screens may ask of the application shell. */
export interface App {
  readonly view: View;
  readonly save: SaveData;
  /** Session-scoped ad counters (interstitial cadence, rewarded cooldowns). */
  readonly ads: AdSession;
  palette(): Palette;
  goTitle(): void;
  goLevels(): void;
  /** Open the shop on `tab`; BACK runs `back` (default: the title). */
  goShop(tab?: ShopTab, back?: () => void): void;
  /** Open the achievements screen; BACK runs `back` (default: the title). */
  goAchievements(back?: () => void): void;
  /** Overrides for the About block (e2e / dev): undefined = ask the providers. */
  readonly nativeInfo?: NativeInfoOverride;
  startLevel(levelId: number, seed?: number, opts?: StartOptions): boolean;
  go(screen: Screen): void;
  /** Open the settings screen; BACK returns to `from` (title, or the paused play screen). */
  openSettings(from: Screen): void;
  /** Sim speed multiplier for this and future levels (pause-menu toggle, debug). */
  setSpeed(n: number): void;
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

/* Optional provider extensions the Mobile Engineer is adding (feature-checked so the build stays green either way). */
interface PrivacyOptionsExt {
  privacyOptionsRequired?: () => Promise<boolean> | boolean;
  showPrivacyOptions?: () => Promise<void> | void;
}
interface SupportIdExt {
  getSupportId?: () => Promise<string | null> | string | null;
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
  ctx.fillRect(0, 0, view.cssW, view.cssH);
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
  private readonly toast = new Toast();
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
    for (const r of [TITLE_PLAY, TITLE_SETTINGS, TITLE_SOUND, TITLE.shop, TITLE.daily, TITLE.achievements, TITLE.wallet]) if (inRect(r, p.x, p.y)) return r;
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
  }

  /** Achievements are re-evaluated on every claim (ECON-4); the toast names what unlocked. */
  private withAchievements(text: string): string {
    const extra = achievementToast(evaluateAchievements(this.app.save));
    return extra ? `${text} · ${extra}` : text;
  }

  /** Streak reward first; once claimed, the rewarded crystal chest (when a video is available). */
  claimChest(): void {
    const save = this.app.save;
    const claimed = claimDaily(save, Date.now());
    if (claimed) {
      playSfx('upgrade');
      const parts = [claimed.gold > 0 ? `+${claimed.gold} gold` : '', claimed.crystals > 0 ? `+${claimed.crystals} crystals` : ''].filter(Boolean);
      this.toast.show(this.withAchievements(`Day ${claimed.day} reward: ${parts.join(' · ')}`), 'ok', this.nowMs);
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
        this.toast.show(this.withAchievements(`Crystal chest: +${amount} crystals`), 'ok', this.nowMs);
      });
      return;
    }
    this.toast.show('Come back tomorrow for the next reward', 'ok', this.nowMs);
  }

  cancel(): void {
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') this.app.goLevels();
  }
}

/* ---------- Settings (M3-3) ---------- */

/**
 * Sound, colour-blind palette, reduced motion (auto/on/off override), default send ratio and a
 * two-step reset of the progress. Every change persists immediately; BACK returns to the screen
 * that opened it (title, or the paused play screen).
 */
export class SettingsScreen implements Screen {
  readonly name = 'settings' as const;
  private pressed: Rect | null = null;
  private confirming = false;
  private nowMs = 0;
  private readonly toast = new Toast();
  /** About block: support id from the store and the ads SDK's privacy-options requirement (native only). */
  private supportId: string | null = null;
  private privacyRequired = false;
  private about: SettingsAboutLayout = settingsAboutLayout(false, false);
  private privacyPending = false;

  constructor(
    private readonly app: App,
    private readonly back: () => void,
  ) {
    void this.probeNative();
  }

  get isConfirming(): boolean {
    return this.confirming;
  }

  /** What the About block currently shows (e2e). */
  get aboutInfo(): { version: string; supportId: string | null; privacyOptions: boolean } {
    return { version: appVersion(), supportId: this.supportId, privacyOptions: this.privacyRequired };
  }

  /**
   * Ask the providers (feature-checked: the web providers have neither method) — or take the
   * app's override. Never throws; a failing provider just leaves the row hidden.
   */
  private async probeNative(): Promise<void> {
    const over = this.app.nativeInfo;
    const ads = getAds() as AdsProvider & PrivacyOptionsExt;
    const store = getStore() as StoreProvider & SupportIdExt;
    let privacy = false;
    let id: string | null = null;
    try {
      if (over?.privacyOptionsRequired !== undefined) privacy = over.privacyOptionsRequired;
      else if (typeof ads.privacyOptionsRequired === 'function') privacy = (await ads.privacyOptionsRequired()) === true;
    } catch {
      privacy = false;
    }
    try {
      if (over?.supportId !== undefined) id = over.supportId;
      else if (typeof store.getSupportId === 'function') id = await store.getSupportId();
    } catch {
      id = null;
    }
    this.supportId = typeof id === 'string' && id.length > 0 ? id : null;
    this.privacyRequired = privacy;
    this.about = settingsAboutLayout(this.supportId !== null, this.privacyRequired);
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const s = this.app.save.settings;
    const total = Object.values(this.app.save.stars).reduce((a, b) => a + b, 0);
    drawSettings(view, this.app.palette(), {
      soundOn: !isMuted(),
      colorBlind: s.colorBlind,
      reducedMotion: s.reducedMotion,
      sendRatio: s.sendRatio,
      confirming: this.confirming,
      totalStars: total,
      coins: this.app.save.gold,
      about: this.about,
      version: appVersion(),
      supportId: this.supportId,
      nowMs,
      pressed: this.pressed,
      toast: this.toast.opts(nowMs),
    });
  }

  private rects(): Rect[] {
    if (this.confirming) return [SETTINGS.confirm.yes, SETTINGS.confirm.no];
    const list = [SETTINGS.back, SETTINGS.sound, SETTINGS.colorBlind, SETTINGS.motion, SETTINGS.sendRatio, SETTINGS.reset];
    if (this.about.copy) list.push(this.about.copy);
    if (this.about.privacy) list.push(this.about.privacy);
    return list;
  }

  /** Copy the support id to the clipboard (toast either way). */
  copySupportId(): void {
    const id = this.supportId;
    if (!id) return;
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip || typeof clip.writeText !== 'function') {
      this.toast.show('Copy is not available here', 'error', this.nowMs);
      return;
    }
    clip.writeText(id).then(
      () => this.toast.show('Support ID copied', 'ok', this.nowMs),
      () => this.toast.show('Could not copy the Support ID', 'error', this.nowMs),
    );
  }

  /** Open the ads SDK's privacy options form (UMP); no-op when the provider has none. */
  openPrivacyOptions(): void {
    if (this.privacyPending) return;
    const ads = getAds() as AdsProvider & PrivacyOptionsExt;
    if (typeof ads.showPrivacyOptions !== 'function') {
      this.toast.show('Privacy options are not available here', 'error', this.nowMs);
      return;
    }
    this.privacyPending = true;
    Promise.resolve()
      .then(() => ads.showPrivacyOptions?.())
      .catch(() => this.toast.show('Could not open privacy options', 'error', this.nowMs))
      .finally(() => {
        this.privacyPending = false;
      });
  }

  down(p: PointerPoint): void {
    this.pressed = this.rects().find((r) => inRect(r, p.x, p.y)) ?? null;
  }

  move(p: PointerPoint): void {
    if (this.pressed && !inRect(this.pressed, p.x, p.y)) this.pressed = null;
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || !inRect(hit, p.x, p.y)) return;
    const save = this.app.save;
    if (this.confirming) {
      if (hit === SETTINGS.confirm.yes) resetProgress(save);
      this.confirming = false;
      playSfx('button');
      return;
    }
    if (hit === SETTINGS.back) {
      this.back();
      return;
    }
    if (hit === SETTINGS.sound) {
      toggleMuted();
      playSfx('button');
      return;
    }
    if (hit === this.about.copy) {
      playSfx('button');
      this.copySupportId();
      return;
    }
    if (hit === this.about.privacy) {
      playSfx('button');
      this.openPrivacyOptions();
      return;
    }
    playSfx('button');
    if (hit === SETTINGS.colorBlind) {
      save.settings.colorBlind = !save.settings.colorBlind;
    } else if (hit === SETTINGS.motion) {
      const seg = MOTION_SEGMENTS[segmentAt(SETTINGS.motion, MOTION_SEGMENTS.length, p.x, p.y)];
      if (seg) {
        save.settings.reducedMotion = seg.value;
        applyMotionPref(seg.value);
      }
    } else if (hit === SETTINGS.sendRatio) {
      const seg = RATIO_SEGMENTS[segmentAt(SETTINGS.sendRatio, RATIO_SEGMENTS.length, p.x, p.y)];
      if (seg) save.settings.sendRatio = seg.value;
    } else if (hit === SETTINGS.reset) {
      this.confirming = true;
      return;
    }
    writeSave(save);
  }

  cancel(): void {
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.confirming) this.confirming = false;
      else this.back();
    }
  }
}

/* ---------- Achievements (ECON-4) ---------- */

/**
 * Every catalog achievement with a progress bar and its crystal reward; unlocked rows are marked.
 * Entering re-evaluates the save (a migrated save with 3★ levels gets its star goals paid here).
 */
export class AchievementsScreen implements Screen {
  readonly name = 'achievements' as const;
  private scroll = 0;
  private downY = 0;
  private scrollAtDown = 0;
  private held = false;
  private dragging = false;
  private pressed: Rect | null = null;
  private nowMs = 0;
  private readonly toast = new Toast();

  constructor(
    private readonly app: App,
    private readonly back: () => void = () => app.goTitle(),
  ) {}

  enter(): void {
    const text = achievementToast(evaluateAchievements(this.app.save));
    if (text) {
      playSfx('upgrade');
      this.toast.show(text, 'ok', performance.now(), 3500);
    }
  }

  rows(): AchievementRow[] {
    return achievementProgress(this.app.save).map((p, i) => ({ ...p, rect: achievementRowRect(i) }));
  }

  private maxScroll(): number {
    return achievementsMaxScroll(ACHIEVEMENTS.length);
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const save = this.app.save;
    drawAchievements(view, this.app.palette(), {
      rows: this.rows(),
      unlockedCount: save.achievements.unlocked.length,
      total: ACHIEVEMENTS.length,
      crystalsEarned: achievementCrystalsEarned(save),
      scroll: this.scroll,
      backRect: ACHIEVEMENTS_LAYOUT.back,
      nowMs,
      pressed: this.pressed,
      toast: this.toast.opts(nowMs),
    });
  }

  down(p: PointerPoint): void {
    this.held = true;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
    this.pressed = inRect(ACHIEVEMENTS_LAYOUT.back, p.x, p.y) ? ACHIEVEMENTS_LAYOUT.back : null;
  }

  move(p: PointerPoint): void {
    if (!this.held) return;
    if (Math.abs(p.y - this.downY) > 14) {
      this.dragging = true;
      this.pressed = null;
    }
    if (this.dragging) this.setScroll(this.scrollAtDown - (p.y - this.downY));
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag) return;
    if (hit === ACHIEVEMENTS_LAYOUT.back && inRect(hit, p.x, p.y)) this.back();
  }

  wheel(dy: number): void {
    this.setScroll(this.scroll + dy);
  }

  cancel(): void {
    this.held = false;
    this.dragging = false;
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.back();
    else if (e.key === 'ArrowDown') this.setScroll(this.scroll + 120);
    else if (e.key === 'ArrowUp') this.setScroll(this.scroll - 120);
  }
}

/* ---------- Level select: winding path map ---------- */

const BACK = LEVEL_MAP.back;

/** Index of the level the player is "on": first unlocked level without a clear, else the last. */
export function currentLevelIndex(save: SaveData): number {
  for (let i = 0; i < LEVELS.length; i++) {
    const level = LEVELS[i]!;
    if (isLevelUnlocked(save, LEVELS, i) && (save.stars[String(level.id)] ?? 0) === 0) return i;
  }
  return Math.max(0, LEVELS.length - 1);
}

export class LevelSelectScreen implements Screen {
  readonly name = 'levelSelect' as const;
  private scroll = 0;
  private downY = 0;
  private scrollAtDown = 0;
  /** Pointer currently held (mouse hover also produces move events; those must not scroll). */
  private held = false;
  private dragging = false;
  private pressed: Rect | null = null;
  private readonly current: number;

  constructor(private readonly app: App) {
    this.current = currentLevelIndex(app.save);
    // open centred on the current level
    this.setScroll(levelNodeCentre(this.current).y - C.MAP_H * 0.5);
  }

  private maxScroll(): number {
    return levelMapMaxScroll(LEVELS.length, C.MAP_H);
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  getScroll(): number {
    return this.scroll;
  }

  draw(view: View, nowMs: number): void {
    drawLevelSelect(view, this.app.palette(), {
      nodes: LEVELS.map((level, i) => ({
        id: level.id,
        name: level.name,
        stars: this.app.save.stars[String(level.id)] ?? 0,
        unlocked: isLevelUnlocked(this.app.save, LEVELS, i),
      })),
      current: this.current,
      scroll: this.scroll,
      backRect: BACK,
      walletRect: LEVEL_MAP.wallet,
      commanderRect: LEVEL_MAP.commander,
      gold: this.app.save.gold,
      crystals: this.app.save.crystals,
      commander: commanderSummary(this.app.save),
      nowMs,
      pressed: this.pressed,
    });
  }

  down(p: PointerPoint): void {
    this.held = true;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
    this.pressed = [BACK, LEVEL_MAP.wallet, LEVEL_MAP.commander].find((r) => inRect(r, p.x, p.y)) ?? null;
  }

  move(p: PointerPoint): void {
    if (!this.held) return;
    if (Math.abs(p.y - this.downY) > 14) {
      this.dragging = true;
      this.pressed = null;
    }
    if (this.dragging) this.setScroll(this.scrollAtDown - (p.y - this.downY));
  }

  up(p: PointerPoint): void {
    this.pressed = null;
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag) return;
    if (inRect(BACK, p.x, p.y)) {
      this.app.goTitle();
      return;
    }
    if (inRect(LEVEL_MAP.wallet, p.x, p.y)) {
      this.app.goShop('crystals', () => this.app.goLevels());
      return;
    }
    if (inRect(LEVEL_MAP.commander, p.x, p.y)) {
      this.app.goShop('upgrades', () => this.app.goLevels());
      return;
    }
    if (p.y < LEVEL_MAP.headerH || p.y >= LEVEL_MAP.commander.y - 10) return;
    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      if (level && inRect(levelNodeRect(i, this.scroll), p.x, p.y)) {
        if (isLevelUnlocked(this.app.save, LEVELS, i)) this.app.startLevel(level.id);
        return; // locked: the tap does nothing
      }
    }
  }

  wheel(dy: number): void {
    this.setScroll(this.scroll + dy);
  }

  cancel(): void {
    this.held = false;
    this.dragging = false;
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.app.goTitle();
    else if (e.key === 'ArrowDown') this.setScroll(this.scroll + LEVEL_MAP.step);
    else if (e.key === 'ArrowUp') this.setScroll(this.scroll - LEVEL_MAP.step);
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
}

const DOUBLE_GOLD = AD_PLACEMENTS.find((p) => p.id === 'rv_double_gold')!;
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
  private readonly toast = new Toast();

  constructor(
    private readonly app: App,
    readonly info: ResultInfo,
  ) {}

  enter(): void {
    onResultShown(this.app.ads);
    const text = achievementToast(this.info.achievements);
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
    const continueOffered = !this.won && !this.info.continued;
    return {
      crystalsEarned: e.crystals,
      notes: e.notes,
      replayCapped: e.replayCapped,
      doubleGold: this.won && e.gold > 0 && canShowRewarded(this.app.ads, save, DOUBLE_GOLD.id) ? e.gold : null,
      doubled: this.doubled,
      continueCrystals: continueOffered ? CRYSTAL_SERVICES.continue.costCrystals : null,
      continueAd: continueOffered && canShowRewarded(this.app.ads, save, CONTINUE_AD.id),
      skipCrystals: this.skipOffered() ? CRYSTAL_SERVICES.levelSkip.costCrystals : null,
      pending: this.pending,
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
    const idx = LEVELS.findIndex((l) => l.id === this.info.level.id);
    const next = LEVELS[idx + 1];
    if (next) this.app.startLevel(next.id);
    else this.app.goLevels();
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || !inRect(hit, p.x, p.y) || this.pending || this.leaving) return;
    const { ui, level } = this.info;
    if (hit === RESULT.retry) this.leave(() => this.app.startLevel(level.id));
    else if (hit === RESULT.menu || hit === HUD.menu) this.leave(() => this.app.goLevels());
    else if (hit === RESULT.next && ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
    else if (hit === HUD.wallet) this.app.goShop('crystals', () => this.app.go(this));
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
        this.toast.show('No video available right now', 'error', this.nowMs);
        return;
      }
      const gained = ex.doubleGold ?? 0;
      earnGold(this.app.save, gained);
      this.doubled = true;
      this.info.ui.coinsEarned += gained;
      this.info.ui.coinsTotal = this.app.save.gold;
      this.info.ui.particles?.coinBurst(360, RESULT.extra.y, 14, this.app.palette());
      playSfx('upgrade');
      this.toast.show(`+${gained} gold`, 'ok', this.nowMs);
    });
  }

  /** Paid continue: rewind and resume; if the snapshot ring cannot serve one, restart with the bonus garrison. */
  private reinforce(): void {
    if (this.info.resume?.()) return;
    playSfx('upgrade');
    this.app.startLevel(this.info.level.id, undefined, { reinforcements: true });
  }

  continueWithCrystals(): void {
    if (this.won || this.info.continued || this.pending) return;
    if (!spendCrystals(this.app.save, CRYSTAL_SERVICES.continue.costCrystals)) {
      this.toast.show('Not enough crystals · tap the wallet to get more', 'error', this.nowMs);
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
      else this.toast.show('No video available right now', 'error', this.nowMs);
    });
  }

  /** Level skip: 1★, next level unlocked, no gold, counts toward milestones; once per band. */
  skipLevel(): void {
    if (!this.skipOffered() || this.pending) return;
    const save = this.app.save;
    if (!spendCrystals(save, CRYSTAL_SERVICES.levelSkip.costCrystals)) {
      this.toast.show('Not enough crystals · tap the wallet to get more', 'error', this.nowMs);
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
      const { ui, level } = this.info;
      if (ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
      else this.leave(() => this.app.startLevel(level.id));
    }
  }
}
