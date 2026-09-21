import type { GameState, LevelDef } from './sim/types';
import { LEVEL_META, getLoadedLevel, levelChunkKey, levelIndex, loadLevel } from './levels/index';
import { chunkFailures, chunkRecoverable, loadChunk, reloadOnce } from './lazyChunk';
import type { Palette } from './render/palette';
import { getPalette } from './render/palette';
import type { View } from './render/view';
import { createView, resize, toClient } from './render/view';
import { blankLayer, createLayers } from './render/layers';
import { preloadCosmetics, warmCosmetics } from './render/cosmetics';
import { equippedSkin } from './economy/entitlements';
import { attachPointer } from './input/pointer';
import type { PointerPoint } from './input/pointer';
import type { SaveData } from './ui/save';
import { currentLevelIndex, isLevelUnlocked, loadSave, writeSave } from './ui/save';
import type { App, NativeInfoOverride, Screen, StartOptions } from './ui/screens';
import { ResultScreen, TitleScreen, beginMapFrame, endMapFrame } from './ui/screens';
import { PlayScreen } from './ui/play';
import { applyMotionPref } from './ui/motion';
import type { Language, TranslationKey } from './ui/i18n';
import { browserLanguages, currentLanguage, detectLanguage, onLanguageChange, setLanguage, t } from './ui/i18n';
import { drawSpinner } from './render/economyWidgets';
import { initAudio, toggleMuted, unlockAudio } from './audio/index';
import { initNative } from './native/index';
import type { ShopTab } from './render/layout';
import type { AdSession, FakeAdsProvider } from './economy/adsFlow';
import { createAdSession, createFakeAds, setAdsProvider } from './economy/adsFlow';
import { getStore } from './economy/store';
import { getAds } from './economy/ads';
import type { FakeStoreOptions } from './economy/providers/fakeStore';
import { configureFakeStore } from './economy/providers/fakeStore';
import { grantProduct } from './economy/wallet';
import type { GrantResult } from './economy/wallet';
import type { DailyChallenge, WeeklyChallenge } from './daily/challenge';
import { challengeFor, dayKeyOf, weekKeyOf, weeklyFor } from './daily/challenge';
import { challengeDone, challengeUnlocked, shownStreak } from './ui/daily';
import { shownWeekStreak, weeklyDone, weeklyTargetDone, weeklyUnlocked } from './ui/weekly';

/**
 * The level map, shop, achievements and settings screens (and the menu drawing they need) are a
 * separate chunk (PERF-1): `import()` on demand, preloaded once the first frame is on screen.
 * Only types cross this boundary statically — see scripts/checkBundle.mjs.
 */
type LazyScreens = typeof import('./ui/lazyScreens');
const LAZY_SCREENS_KEY = 'lazyScreens';
/**
 * Longest a level start waits for the equipped cosmetic chunks (PERF-5). They are small and usually
 * warm (idle preload / shop), so the wait is normally nil; on a stalled connection the level starts
 * with the default look and the skins land later, as before.
 */
const COSMETIC_WAIT_MS = 2000;

/** `p`, or undefined once `ms` have passed — whichever comes first. */
function within<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/** Test/debug surface for Playwright. */
export interface TowerClashDebug {
  getState(): GameState | null;
  getScreen(): Screen['name'];
  /**
   * Start a level; `seed` (optional) makes the run reproducible for tests. Resolves true once the
   * play screen is up (the level chunk may have to download first — PERF-2), false for an unknown
   * id or when another navigation won meanwhile. `autoplay()`, `setSpeed()` and `economy.autoLose()`
   * may be called right after it without awaiting: they apply to the level being started.
   */
  loadLevel(id: number, seed?: number): Promise<boolean>;
  /** Hand the running (or starting) level to the reference player; false when no level is up. */
  autoplay(): boolean;
  setSpeed(n: number): void;
  getSpeed(): number;
  toClient(x: number, y: number): { x: number; y: number };
  /** Text of the tutorial hint on screen, or null. */
  getTutorialHint(): string | null;
  /** Text of the link-limit refusal bubble while it is on screen (rules v2), or null. */
  getLimitHint(): string | null;
  /** Current UI language code and a translation lookup (I18N e2e). */
  getLanguage(): string;
  getText(key: string): string;
  /** Text of the current screen's toast while it is on screen, or null. */
  getToast(): string | null;
  /** Result screen numbers, or null when not on the result screen. */
  getResult(): { outcome: string; stars: number; coinsEarned: number; coinsTotal: number; crystalsEarned: number; achievements: string[] } | null;
  /** Level-select lock state for a level id (undefined id → false). */
  isLevelUnlocked(id: number): boolean;
  /** Level-select path map scroll (logical px); setting is a no-op on other screens. */
  setLevelSelectScroll(y: number): void;
  getLevelSelectScroll(): number;
  /** Coin balance of the live save. */
  getCoins(): number;
  /** Simulate the platform back button (Android); true when a screen handled it. */
  back(): boolean;
  /** Open the shop (default tab: crystals) from the current screen; resolves once it is on screen (perf/e2e hook). */
  openShop(tab?: ShopTab): Promise<void>;
  aiAvailable: boolean;
  /** Override "today" (UTC `YYYY-MM-DD`) for the Daily Challenge; null returns to the real clock. */
  setDayKey(key: string | null): void;
  /** Daily Challenge (GDD §7) test surface. */
  daily: {
    /** The challenge for `dayKey` (default: today / the override) and the save's progress on it. */
    get(dayKey?: string): DailyDebugInfo;
    /** Start the challenge for `dayKey` (default: today / the override); resolves like `loadLevel`. */
    start(dayKey?: string): Promise<boolean>;
  };
  /** Override "this week" (a Monday UTC `YYYY-MM-DD`; any day is mapped to its Monday) for the Weekly Challenge; null returns to the real clock. */
  setWeekKey(key: string | null): void;
  /** Weekly Challenge (GDD §8) test surface. */
  weekly: {
    /** The weekly for `weekKey` (default: this week / the override) and the save's progress on it. */
    get(weekKey?: string): WeeklyDebugInfo;
    /** Start the weekly for `weekKey` (default: this week / the override); resolves like `loadLevel`. */
    start(weekKey?: string): Promise<boolean>;
    /** The level-map card's active tab, or null when the map is not open. */
    tab(): 'daily' | 'weekly' | null;
  };
  /** Economy test surface (Phase A): the live save, direct grants, fake ads, fake-store knobs. */
  economy: {
    getSave(): SaveData;
    /** Apply a catalog product's grants as if bought (dedupes like a real transaction). */
    grant(productId: string): GrantResult | null;
    /** Install (true) or remove (false) an always-available fake ads provider that rewards at once. */
    setAdsAvailable(on: boolean): void;
    configureFakeStore(opts: FakeStoreOptions): void;
    /** Session ad counters + what the fake provider showed. */
    getAdStats(): { interstitialsShown: number; rewardedShown: number; fakeInterstitials: number; fakeRewarded: number };
    /** Open the shop on a tab (from the current screen); resolves once it is on screen. */
    openShop(tab: ShopTab): Promise<void>;
    /** Lose the running level as fast as the sim allows (every garrison marches into the enemy). */
    autoLose(): boolean;
    /** Tap-equivalents on the result screen (economy offers). */
    resultAction(action: 'doubleGold' | 'continueCrystals' | 'continueAd' | 'skip'): boolean;
    /** Continue clock of the current attempt (ECONOMY.md §3.5): sim time, star-clock time, whether the continue was used. */
    getClock(): { timeMs: number; elapsedMs: number; continued: boolean } | null;
    /** Shop scroll (logical px, clamped); `y` omitted = read only. -1 when the shop is not open. */
    shopScroll(y?: number): number;
    /** Open the achievements screen (from the current screen); resolves once it is on screen. */
    openAchievements(): Promise<void>;
    /** Pretend the native providers report this support id / privacy requirement (settings → About). */
    setNativeInfo(info: NativeInfoOverride | null): void;
    /** What the settings About block shows, or null when not on the settings screen. */
    getAboutInfo(): { version: string; supportId: string | null; privacyOptions: boolean } | null;
  };
}

export interface DailyDebugInfo {
  challenge: DailyChallenge;
  unlocked: boolean;
  done: boolean;
  streak: number;
  lastWinDay: string | null;
  best: { stars: number; timeMs: number } | null;
}

export interface WeeklyDebugInfo {
  challenge: WeeklyChallenge;
  unlocked: boolean;
  done: boolean;
  /** The 3★ target crystals of this week are paid. */
  target: boolean;
  streak: number;
  lastWinWeek: string | null;
  best: { stars: number; timeMs: number; target: boolean } | null;
}

declare global {
  interface Window {
    __towerclash: TowerClashDebug;
  }
}

/**
 * Placeholder while a lazy chunk downloads: the map background with a small spinner that fades
 * in, so a fast load (the usual case after the idle preload) shows nothing at all. No input.
 */
class LoadingScreen implements Screen {
  readonly name = 'loading' as const;
  private shownAt = 0;

  constructor(private readonly app: App) {}

  draw(view: View, nowMs: number): void {
    if (!this.shownAt) this.shownAt = nowMs;
    const pal = this.app.palette();
    beginMapFrame(view, pal);
    const alpha = Math.max(0, Math.min(1, (nowMs - this.shownAt - 80) / 200));
    if (alpha > 0) {
      view.ctx.save();
      view.ctx.globalAlpha = alpha;
      drawSpinner(view.ctx, pal.paper, 360, 640, 18, nowMs);
      view.ctx.restore();
    }
    endMapFrame(view);
  }
}

/** Run `fn` when the browser is idle (after the first frame); falls back to a short timeout. */
function whenIdle(fn: () => void): void {
  const w = window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 1500 });
  else setTimeout(fn, 50);
}

class TowerClashApp implements App {
  readonly view: View;
  readonly save: SaveData;
  readonly ads: AdSession = createAdSession();
  private current: Screen;
  private lastFrame = 0;
  private speed = 1;
  private play: PlayScreen | null = null;
  private fakeAds: FakeAdsProvider | null = null;
  private lazy: LazyScreens | null = null;
  private lazyPromise: Promise<LazyScreens> | null = null;
  private preloadQueued = false;
  /** Level start in flight (its chunk downloading), so debug hooks can target the coming play screen. */
  private pendingStart: Promise<PlayScreen | null> | null = null;
  private startSeq = 0;
  nativeInfo?: NativeInfoOverride;
  /** Debug override of the Daily Challenge day (e2e determinism). */
  private dayKeyOverride: string | null = null;
  /** Debug override of the Weekly Challenge week (a Monday key). */
  private weekKeyOverride: string | null = null;

  constructor(canvas: HTMLCanvasElement, save: SaveData) {
    this.view = createView(canvas);
    this.view.layers = createLayers(canvas);
    resize(this.view);
    this.save = save;
    this.current = new TitleScreen(this);
    initAudio(this.save);
    applyMotionPref(this.save.settings.reducedMotion);
    // Store / ads providers (fake store on the web; `?fakeads=1` installs the dev ads provider).
    void getStore().init();
    void getAds().init();
    if (new URLSearchParams(window.location.search).get('fakeads') === '1') this.setFakeAds(true, 1000);
    void initNative({ onBack: () => this.onBack(), isTitleScreen: () => this.current.name === 'title' });

    const forward = <K extends 'down' | 'move' | 'up'>(k: K) => (p: PointerPoint) => this.current[k]?.(p);
    attachPointer(canvas, this.view, {
      down: forward('down'),
      move: forward('move'),
      up: forward('up'),
      cancel: () => this.current.cancel?.(),
    });
    // WebAudio may only start inside a user gesture (iOS/Android WebView): unlock on the first
    // pointer/key, and keep trying on later gestures in case the context was suspended again.
    canvas.addEventListener('pointerdown', () => unlockAudio());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const lines = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1;
        this.current.wheel?.((e.deltaY * lines) / this.view.scale);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      unlockAudio();
      if (e.key === ' ') e.preventDefault();
      if (e.key === 'm' || e.key === 'M') {
        toggleMuted();
        return;
      }
      this.current.key?.(e);
    });
    const onResize = (): void => resize(this.view);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    // Background/tab switch: freeze the sim so the player never returns to a lost game.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.play?.pause();
      else this.lastFrame = 0; // drop the hidden interval instead of feeding it to the loop
    });

    requestAnimationFrame((t) => this.frame(t));
  }

  palette(): Palette {
    return getPalette(this.save.settings.colorBlind);
  }

  go(screen: Screen): void {
    this.current.exit?.();
    this.current = screen;
    screen.enter?.();
  }

  goTitle(): void {
    this.play = null;
    this.go(new TitleScreen(this));
  }

  /* ----- lazy screens (PERF-1) ----- */

  /** The lazy chunk, fetched once; a failed fetch is retried on the next call (src/lazyChunk.ts). */
  private loadLazy(): Promise<LazyScreens> {
    if (!this.lazyPromise) {
      this.lazyPromise = loadChunk(LAZY_SCREENS_KEY, () => import('./ui/lazyScreens'))
        .then((m) => {
          this.lazy = m;
          return m;
        })
        .catch((err: unknown) => {
          this.lazyPromise = null;
          throw err;
        });
    }
    return this.lazyPromise;
  }

  /**
   * Navigate to a lazily loaded screen: at once when the chunk is in, otherwise through the
   * spinner. A navigation that happened meanwhile wins; a failed download returns to `from`.
   * Resolves once the target screen is current (or the navigation was abandoned).
   */
  private goLazy(make: (screens: LazyScreens) => Screen): Promise<void> {
    if (this.lazy) {
      this.go(make(this.lazy));
      return Promise.resolve();
    }
    const from = this.current;
    const loading = new LoadingScreen(this);
    this.go(loading);
    return this.loadLazy().then(
      (screens) => {
        if (this.current === loading) this.go(make(screens));
      },
      () => {
        if (this.current !== loading) return;
        this.current = from; // no enter(): the screen never left
        this.chunkFailed(LAZY_SCREENS_KEY, from);
      },
    );
  }

  /**
   * A user-initiated chunk download failed (BUG-8): tell the player on the screen they are back
   * on — the next tap re-fetches. When the chunk keeps failing and the browser never named its URL
   * (the module map keeps the first failure, so a plain retry can never succeed), reload the page
   * once per session — only from the title / level map, never over a match or a result.
   */
  private chunkFailed(key: string, from: Screen): void {
    const idle = from.name === 'title' || from.name === 'levelSelect';
    if (idle && chunkFailures(key) > 1 && !chunkRecoverable(key) && navigator.onLine !== false && reloadOnce()) {
      location.reload();
      return;
    }
    from.toast?.show(t('common.loadFailed'), 'error');
  }

  /**
   * Warm the lazy chunk and the player's current level once the first frame is painted, so the
   * first tap on SHOP / settings and the first PLAY are instant.
   */
  private preloadLazy(): void {
    if (this.preloadQueued) return;
    this.preloadQueued = true;
    whenIdle(() => {
      void this.loadLazy().catch(() => undefined);
      this.preloadLevel(LEVEL_META[currentLevelIndex(this.save, LEVEL_META)]?.id);
      void this.preloadCosmetics(); // equipped skins / theme, so the title and the first PLAY are already skinned
    });
  }

  /** Start the lazy chunks the equipped skins draw with (PERF-5); null when they are all in. Never rejects. */
  private preloadCosmetics(): Promise<void> | null {
    return preloadCosmetics(equippedSkin(this.save));
  }

  /** Fetch a level chunk in the background (no-op for unknown ids; errors are swallowed, `startLevel` retries). */
  private preloadLevel(id: number | undefined): void {
    if (id !== undefined) void loadLevel(id).catch(() => undefined);
  }

  openSettings(from: Screen): void {
    void this.goLazy((L) => new L.SettingsScreen(this, () => this.go(from)));
  }

  setLanguage(code: Language): void {
    this.save.settings.language = code;
    writeSave(this.save);
    void setLanguage(code);
  }

  /**
   * Platform back button: pause during play (a second press leaves to the level map), otherwise
   * step back one screen. False on the title so the OS may close the app.
   */
  onBack(): boolean {
    const cur = this.current;
    if (cur instanceof PlayScreen) {
      if (!cur.loop.paused && !cur.loop.finished) cur.pause();
      else this.goLevels();
      return true;
    }
    if (cur.name === 'loading') return true; // swallowed: the pending screen arrives in a moment
    if (cur.name === 'settings' || cur.name === 'result' || cur.name === 'levelSelect' || cur.name === 'shop' || cur.name === 'achievements') {
      cur.key?.(new KeyboardEvent('keydown', { key: 'Escape' }));
      return true;
    }
    return false;
  }

  goLevels(notice?: string): void {
    this.play = null;
    void this.goLazy((L) => {
      const map = new L.LevelSelectScreen(this);
      if (notice) map.toast.show(notice, 'ok', performance.now(), 3500);
      return map;
    });
  }

  goShop(tab: ShopTab = 'crystals', back: () => void = () => this.goTitle()): void {
    void this.openShop(tab, back);
  }

  goAchievements(back: () => void = () => this.goTitle()): void {
    void this.openAchievements(back);
  }

  private openShop(tab: ShopTab, back: () => void): Promise<void> {
    warmCosmetics(); // the shop previews every roof / helmet / theme: fetch both chunks alongside the screen
    return this.goLazy((L) => new L.ShopScreen(this, tab, back));
  }

  private openAchievements(back: () => void): Promise<void> {
    return this.goLazy((L) => new L.AchievementsScreen(this, back));
  }

  setSpeed(n: number): void {
    this.speed = Math.max(0.1, Math.min(20, n));
    this.play?.setSpeed(this.speed);
  }

  /** Today's UTC day key (the UI's only clock read for the challenge), or the debug override. */
  dayKey(): string {
    return this.dayKeyOverride ?? dayKeyOf(new Date());
  }

  /** Start the Daily Challenge of `dayKey` (default: today) with its fixed seed and twist. */
  startChallenge(dayKey = this.dayKey()): Promise<boolean> {
    const challenge = challengeFor(dayKey);
    return this.startLevel(challenge.levelId, challenge.seed, { challenge });
  }

  /** This week's Monday UTC key (the UI's only clock read for the weekly), or the debug override. */
  weekKey(): string {
    return this.weekKeyOverride ?? weekKeyOf(new Date());
  }

  /** Start the Weekly Challenge of `weekKey` (default: this week) with its fixed seed and twist. */
  startWeekly(weekKey = this.weekKey()): Promise<boolean> {
    const weekly = weeklyFor(weekKey);
    return this.startLevel(weekly.levelId, weekly.seed, { weekly });
  }

  /**
   * Start a level: at once when its chunk is in (the usual case — the current level is preloaded
   * after the first frame and the next one when a level starts), otherwise through the spinner.
   * The cosmetic chunks the equipped skins need (PERF-5) are requested first and awaited alongside
   * the level (bounded by `COSMETIC_WAIT_MS`), so the first frame is already skinned / themed.
   * A navigation or another start that happened meanwhile wins; a failed download returns to the
   * screen the player was on. Resolves true once the play screen is current.
   */
  startLevel(levelId: number, seed?: number, opts?: StartOptions): Promise<boolean> {
    const seq = ++this.startSeq;
    if (levelIndex(levelId) < 0) return Promise.resolve(false);
    const cosmetics = this.preloadCosmetics(); // kicked off before the level chunk
    const cached = getLoadedLevel(levelId);
    if (cached && !cosmetics) {
      this.enterLevel(cached, seed, opts);
      return Promise.resolve(true);
    }
    const from = this.current;
    const loading = new LoadingScreen(this);
    this.go(loading);
    const levelChunk = cached ? Promise.resolve(cached) : loadLevel(levelId);
    const start = Promise.all([levelChunk, cosmetics ? within(cosmetics, COSMETIC_WAIT_MS) : undefined]).then(
      ([level]) => {
        if (seq !== this.startSeq || this.current !== loading) return null; // superseded
        if (!level) {
          this.current = from; // no enter(): the screen never left
          return null;
        }
        return this.enterLevel(level, seed, opts);
      },
      () => {
        if (seq === this.startSeq && this.current === loading) {
          this.current = from;
          this.chunkFailed(levelChunkKey(levelId), from);
        }
        return null;
      },
    );
    this.pendingStart = start;
    void start.finally(() => {
      if (this.pendingStart === start) this.pendingStart = null;
    });
    return start.then((play) => play !== null);
  }

  private enterLevel(level: LevelDef, seed: number | undefined, opts: StartOptions | undefined): PlayScreen {
    const play = new PlayScreen(this, level, seed, this.speed, opts);
    this.play = play;
    this.go(play);
    whenIdle(() => this.preloadLevel(LEVEL_META[levelIndex(level.id) + 1]?.id)); // NEXT is instant
    return play;
  }

  /**
   * Debug helper: run `fn` on the current play screen, or on the one a pending `startLevel` is
   * about to create (Playwright calls `loadLevel(); autoplay()` back to back without awaiting).
   * False when there is neither.
   */
  private withPlay(fn: (play: PlayScreen) => void): boolean {
    if (this.pendingStart) {
      void this.pendingStart.then((play) => play && fn(play));
      return true;
    }
    if (!this.play) return false;
    fn(this.play);
    return true;
  }

  private setFakeAds(on: boolean, delayMs = 0): void {
    this.fakeAds = on ? createFakeAds(delayMs) : null;
    setAdsProvider(this.fakeAds);
  }

  /** The shop returns to the screen that opened it (result screens stay alive underneath). */
  private backFromShop(): () => void {
    const from = this.current;
    if (from.name === 'shop') return () => this.goTitle();
    if (from instanceof ResultScreen) return () => this.go(from);
    if (from.name === 'levelSelect') return () => this.goLevels();
    return () => this.goTitle();
  }

  private frame(now: number): void {
    const dt = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    this.current.update?.(dt, now);
    if (this.current.name !== 'play') {
      // menus paint their own background; nothing may paint over them, and a stale ground (old level /
      // theme) must not survive into the next match
      blankLayer(this.view.layers?.hud);
      blankLayer(this.view.layers?.ground);
    }
    this.current.draw(this.view, now);
    this.preloadLazy(); // after the first paint; a no-op from then on
    requestAnimationFrame((f) => this.frame(f));
  }

  debug(): TowerClashDebug {
    return {
      getState: () => this.play?.state ?? null,
      getScreen: () => this.current.name,
      loadLevel: (id, seed) => this.startLevel(id, seed),
      autoplay: () => this.withPlay((play) => play.setAutoplay(true)),
      setSpeed: (n) => this.setSpeed(n),
      getSpeed: () => this.play?.loop.speed ?? this.speed,
      toClient: (x, y) => toClient(this.view, x, y),
      getTutorialHint: () => (this.current === this.play ? (this.play?.tutorialStep()?.text ?? null) : null),
      getLimitHint: () => (this.current === this.play && this.play?.gestures.limitHint ? this.play.gestures.limitHintText : null),
      getLanguage: () => currentLanguage(),
      getText: (key) => t(key as TranslationKey),
      getToast: () => this.current.toast?.opts(performance.now())?.text ?? null,
      getResult: () => {
        if (!(this.current instanceof ResultScreen)) return null;
        const { outcome, stars, coinsEarned, coinsTotal } = this.current.info.ui;
        const { earnings, achievements } = this.current.info;
        return { outcome, stars, coinsEarned, coinsTotal, crystalsEarned: earnings.crystals, achievements: achievements.unlocked.map((a) => a.id) };
      },
      isLevelUnlocked: (id) => isLevelUnlocked(this.save, LEVEL_META, levelIndex(id)),
      setLevelSelectScroll: (y) => {
        const L = this.lazy;
        if (L && this.current instanceof L.LevelSelectScreen) this.current.setScroll(y);
      },
      getLevelSelectScroll: () => {
        const L = this.lazy;
        return L && this.current instanceof L.LevelSelectScreen ? this.current.getScroll() : 0;
      },
      getCoins: () => this.save.gold,
      back: () => this.onBack(),
      openShop: (tab = 'crystals') => this.openShop(tab, this.backFromShop()),
      aiAvailable: true,
      setDayKey: (key) => {
        this.dayKeyOverride = key;
      },
      daily: {
        get: (dayKey = this.dayKey()) => {
          const challenge = challengeFor(dayKey);
          const c = this.save.challenge;
          return { challenge, unlocked: challengeUnlocked(this.save), done: challengeDone(this.save, dayKey), streak: shownStreak(this.save, dayKey), lastWinDay: c.lastWinDay, best: c.best[dayKey] ?? null };
        },
        start: (dayKey) => this.startChallenge(dayKey),
      },
      setWeekKey: (key) => {
        this.weekKeyOverride = key === null ? null : weekKeyOf(new Date(`${key}T12:00:00Z`));
      },
      weekly: {
        get: (weekKey = this.weekKey()) => {
          const challenge = weeklyFor(weekKey);
          const w = this.save.weekly;
          return { challenge, unlocked: weeklyUnlocked(this.save), done: weeklyDone(this.save, weekKey), target: weeklyTargetDone(this.save, weekKey), streak: shownWeekStreak(this.save, weekKey), lastWinWeek: w.lastWinWeek, best: w.best[weekKey] ?? null };
        },
        start: (weekKey) => this.startWeekly(weekKey),
        tab: () => {
          const L = this.lazy;
          return L && this.current instanceof L.LevelSelectScreen ? this.current.getCardTab() : null;
        },
      },
      economy: {
        getSave: () => this.save,
        grant: (productId) => grantProduct(this.save, productId, `debug-${Date.now()}-${Math.random()}`),
        setAdsAvailable: (on) => this.setFakeAds(on),
        configureFakeStore: (opts) => configureFakeStore(opts),
        getAdStats: () => ({
          interstitialsShown: this.ads.interstitialsShown,
          rewardedShown: this.ads.rewardedShown,
          fakeInterstitials: this.fakeAds?.interstitials ?? 0,
          fakeRewarded: this.fakeAds?.rewarded ?? 0,
        }),
        openShop: (tab) => this.openShop(tab, this.backFromShop()),
        autoLose: () => {
          if (!this.pendingStart && this.current !== this.play) return false;
          return this.withPlay((play) => play.setSuicide(true));
        },
        resultAction: (action) => {
          const cur = this.current;
          if (!(cur instanceof ResultScreen)) return false;
          if (action === 'doubleGold') cur.doubleGold();
          else if (action === 'continueCrystals') cur.continueWithCrystals();
          else if (action === 'continueAd') cur.continueWithAd();
          else cur.skipLevel();
          return true;
        },
        getClock: () => (this.play ? { timeMs: this.play.state.time, elapsedMs: this.play.elapsedMs(), continued: this.play.hasContinued } : null),
        shopScroll: (y) => {
          const L = this.lazy;
          if (!L || !(this.current instanceof L.ShopScreen)) return -1;
          if (y !== undefined) this.current.setScroll(y);
          return this.current.scrollY;
        },
        openAchievements: () => this.openAchievements(this.backFromShop()),
        setNativeInfo: (info) => {
          this.nativeInfo = info ?? undefined;
        },
        getAboutInfo: () => {
          const L = this.lazy;
          return L && this.current instanceof L.SettingsScreen ? this.current.aboutInfo : null;
        },
      },
    };
  }
}

/** True inside a Capacitor native shell (the global is injected by the native bridge). */
function insideCapacitor(): boolean {
  return Boolean((window as { Capacitor?: unknown }).Capacitor);
}

/** Offline shell for the PWA build; native apps ship their own bundle and skip it. */
function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || insideCapacitor()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* e.g. insecure context or file:// — the game runs fine without it */
    });
  });
}

/**
 * Wait for the bundled faces (index.html @font-face) so the first canvas frame is not painted in
 * the fallback face: Fredoka 500/700, plus the Nunito Cyrillic face when the UI is Russian
 * (Fredoka ships no Cyrillic; `unicode-range` only fetches Nunito when Cyrillic text is drawn).
 * Bounded by a timeout: a missing/slow font must never block the game.
 */
async function waitForFonts(language: Language, timeoutMs = 1500): Promise<void> {
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const loads = [fonts.load('700 32px Fredoka'), fonts.load('500 32px Fredoka')];
  if (language === 'ru') loads.push(fonts.load('700 32px Nunito', 'Пауза'), fonts.load('500 32px Nunito', 'Пауза'));
  const load = Promise.all(loads).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([load, timeout]).catch(() => undefined);
}

/**
 * UI language: the persisted choice, else the browser's preference on the first run (persisted so
 * a later browser change does not silently switch the game). The dictionary is awaited so the
 * title never flashes English.
 */
async function bootLanguage(save: SaveData): Promise<Language> {
  let code = save.settings.language;
  if (!code) {
    code = detectLanguage(browserLanguages());
    save.settings.language = code;
    writeSave(save);
  }
  await setLanguage(code);
  return code;
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas missing');
  const save = loadSave();
  const language = await bootLanguage(save);
  await waitForFonts(language);
  onLanguageChange((code) => void waitForFonts(code, 800)); // warm the Cyrillic face when switching to Russian
  const app = new TowerClashApp(canvas, save);
  window.__towerclash = app.debug();
  registerServiceWorker();
}

void boot();
