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
import type { App, Screen } from './ui/screens';
import { LevelSelectScreen, ResultScreen, TitleScreen } from './ui/screens';
import { PlayScreen } from './ui/play';
import { initAudio, toggleMuted, unlockAudio } from './audio/index';

/** Test/debug surface for Playwright. */
export interface TowerClashDebug {
  getState(): GameState | null;
  getScreen(): Screen['name'];
  loadLevel(id: number): boolean;
  autoplay(): boolean;
  setSpeed(n: number): void;
  getSpeed(): number;
  toClient(x: number, y: number): { x: number; y: number };
  /** Text of the tutorial hint on screen, or null. */
  getTutorialHint(): string | null;
  /** Result screen numbers, or null when not on the result screen. */
  getResult(): { outcome: string; stars: number; coinsEarned: number; coinsTotal: number } | null;
  /** Level-select lock state for a level id (undefined id → false). */
  isLevelUnlocked(id: number): boolean;
  aiAvailable: boolean;
}

declare global {
  interface Window {
    __towerclash: TowerClashDebug;
  }
}

class TowerClashApp implements App {
  readonly view: View;
  readonly save: SaveData;
  private current: Screen;
  private lastFrame = 0;
  private speed = 1;
  private play: PlayScreen | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.view = createView(canvas);
    this.save = loadSave();
    this.current = new TitleScreen(this);
    initAudio(this.save);

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

  goLevels(): void {
    this.play = null;
    this.go(new LevelSelectScreen(this));
  }

  setSpeed(n: number): void {
    this.speed = Math.max(0.1, Math.min(20, n));
    this.play?.setSpeed(this.speed);
  }

  startLevel(levelId: number): boolean {
    const level = getLevel(levelId);
    if (!level) return false;
    const play = new PlayScreen(this, level, undefined, this.speed);
    this.play = play;
    this.go(play);
    return true;
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
      loadLevel: (id) => this.startLevel(id),
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
        return { outcome, stars, coinsEarned, coinsTotal };
      },
      isLevelUnlocked: (id) => isLevelUnlocked(this.save, LEVELS, LEVELS.findIndex((l) => l.id === id)),
      aiAvailable: true,
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

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas missing');
  const app = new TowerClashApp(canvas);
  window.__towerclash = app.debug();
  registerServiceWorker();
}

boot();
