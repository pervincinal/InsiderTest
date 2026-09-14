import type { GameState } from './sim/types';
import { LEVELS, getLevel } from './levels/index';
import type { Palette } from './render/palette';
import { getPalette } from './render/palette';
import type { View } from './render/view';
import { createView, resize, toClient } from './render/view';
import { attachPointer } from './input/pointer';
import type { PointerPoint } from './input/pointer';
import type { SaveData } from './ui/save';
import { isLevelUnlocked, loadSave } from './ui/save';
import type { App, NativeInfoOverride, Screen, StartOptions } from './ui/screens';
import { AchievementsScreen, LevelSelectScreen, ResultScreen, SettingsScreen, TitleScreen } from './ui/screens';
import { PlayScreen } from './ui/play';
import { ShopScreen } from './ui/shop';
import { applyMotionPref } from './ui/motion';
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

/** Test/debug surface for Playwright. */
export interface TowerClashDebug {
  getState(): GameState | null;
  getScreen(): Screen['name'];
  /** Start a level; `seed` (optional) makes the run reproducible for tests. */
  loadLevel(id: number, seed?: number): boolean;
  autoplay(): boolean;
  setSpeed(n: number): void;
  getSpeed(): number;
  toClient(x: number, y: number): { x: number; y: number };
  /** Text of the tutorial hint on screen, or null. */
  getTutorialHint(): string | null;
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
  /** Open the shop (default tab: crystals) from the current screen; perf/e2e hook. */
  openShop(tab?: ShopTab): void;
  aiAvailable: boolean;
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
    /** Open the shop on a tab (from the current screen). */
    openShop(tab: ShopTab): void;
    /** Lose the running level as fast as the sim allows (every garrison marches into the enemy). */
    autoLose(): boolean;
    /** Tap-equivalents on the result screen (economy offers). */
    resultAction(action: 'doubleGold' | 'continueCrystals' | 'continueAd' | 'skip'): boolean;
    /** Open the achievements screen (from the current screen). */
    openAchievements(): void;
    /** Pretend the native providers report this support id / privacy requirement (settings → About). */
    setNativeInfo(info: NativeInfoOverride | null): void;
    /** What the settings About block shows, or null when not on the settings screen. */
    getAboutInfo(): { version: string; supportId: string | null; privacyOptions: boolean } | null;
  };
}

declare global {
  interface Window {
    __towerclash: TowerClashDebug;
  }
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
  nativeInfo?: NativeInfoOverride;

  constructor(canvas: HTMLCanvasElement) {
    this.view = createView(canvas);
    this.save = loadSave();
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

  openSettings(from: Screen): void {
    this.go(new SettingsScreen(this, () => this.go(from)));
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
    if (
      cur instanceof SettingsScreen ||
      cur instanceof ResultScreen ||
      cur instanceof LevelSelectScreen ||
      cur instanceof ShopScreen ||
      cur instanceof AchievementsScreen
    ) {
      cur.key(new KeyboardEvent('keydown', { key: 'Escape' }));
      return true;
    }
    return false;
  }

  goLevels(): void {
    this.play = null;
    this.go(new LevelSelectScreen(this));
  }

  goShop(tab: ShopTab = 'crystals', back: () => void = () => this.goTitle()): void {
    this.go(new ShopScreen(this, tab, back));
  }

  goAchievements(back: () => void = () => this.goTitle()): void {
    this.go(new AchievementsScreen(this, back));
  }

  setSpeed(n: number): void {
    this.speed = Math.max(0.1, Math.min(20, n));
    this.play?.setSpeed(this.speed);
  }

  startLevel(levelId: number, seed?: number, opts?: StartOptions): boolean {
    const level = getLevel(levelId);
    if (!level) return false;
    const play = new PlayScreen(this, level, seed, this.speed, opts);
    this.play = play;
    this.go(play);
    return true;
  }

  private setFakeAds(on: boolean, delayMs = 0): void {
    this.fakeAds = on ? createFakeAds(delayMs) : null;
    setAdsProvider(this.fakeAds);
  }

  /** The shop returns to the screen that opened it (result screens stay alive underneath). */
  private backFromShop(): () => void {
    const from = this.current;
    if (from instanceof ShopScreen) return () => this.goTitle();
    if (from instanceof ResultScreen) return () => this.go(from);
    if (from instanceof LevelSelectScreen) return () => this.goLevels();
    return () => this.goTitle();
  }

  private frame(now: number): void {
    const dt = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    this.current.update?.(dt, now);
    this.current.draw(this.view, now);
    requestAnimationFrame((t) => this.frame(t));
  }

  debug(): TowerClashDebug {
    return {
      getState: () => this.play?.state ?? null,
      getScreen: () => this.current.name,
      loadLevel: (id, seed) => this.startLevel(id, seed),
      autoplay: () => {
        this.play?.setAutoplay(true);
        return this.play !== null;
      },
      setSpeed: (n) => this.setSpeed(n),
      getSpeed: () => this.play?.loop.speed ?? this.speed,
      toClient: (x, y) => toClient(this.view, x, y),
      getTutorialHint: () => (this.current === this.play ? (this.play?.tutorialStep()?.text ?? null) : null),
      getResult: () => {
        if (!(this.current instanceof ResultScreen)) return null;
        const { outcome, stars, coinsEarned, coinsTotal } = this.current.info.ui;
        const { earnings, achievements } = this.current.info;
        return { outcome, stars, coinsEarned, coinsTotal, crystalsEarned: earnings.crystals, achievements: achievements.unlocked.map((a) => a.id) };
      },
      isLevelUnlocked: (id) => isLevelUnlocked(this.save, LEVELS, LEVELS.findIndex((l) => l.id === id)),
      setLevelSelectScroll: (y) => {
        if (this.current instanceof LevelSelectScreen) this.current.setScroll(y);
      },
      getLevelSelectScroll: () => (this.current instanceof LevelSelectScreen ? this.current.getScroll() : 0),
      getCoins: () => this.save.gold,
      back: () => this.onBack(),
      openShop: (tab = 'crystals') => this.goShop(tab, this.backFromShop()),
      aiAvailable: true,
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
        openShop: (tab) => this.goShop(tab, this.backFromShop()),
        autoLose: () => {
          if (!this.play || this.current !== this.play) return false;
          this.play.setSuicide(true);
          return true;
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
        openAchievements: () => this.goAchievements(this.backFromShop()),
        setNativeInfo: (info) => {
          this.nativeInfo = info ?? undefined;
        },
        getAboutInfo: () => (this.current instanceof SettingsScreen ? this.current.aboutInfo : null),
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
 * Wait for the bundled Fredoka faces (index.html @font-face) so the first canvas frame is not
 * painted in the fallback face. Bounded by a timeout: a missing/slow font must never block the game.
 */
async function waitForFonts(timeoutMs = 1500): Promise<void> {
  const fonts = (document as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const load = Promise.all([fonts.load('700 32px Fredoka'), fonts.load('500 32px Fredoka')]).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  await Promise.race([load, timeout]).catch(() => undefined);
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas missing');
  await waitForFonts();
  const app = new TowerClashApp(canvas);
  window.__towerclash = app.debug();
  registerServiceWorker();
}

void boot();
