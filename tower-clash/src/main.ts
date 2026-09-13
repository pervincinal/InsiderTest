import type { GameState } from './sim/types';
import { getLevel } from './levels/index';
import type { Palette } from './render/palette';
import { getPalette } from './render/palette';
import type { View } from './render/view';
import { createView, resize, toClient } from './render/view';
import { attachPointer } from './input/pointer';
import type { PointerPoint } from './input/pointer';
import type { SaveData } from './ui/save';
import { loadSave } from './ui/save';
import type { App, Screen } from './ui/screens';
import { LevelSelectScreen, TitleScreen } from './ui/screens';
import { PlayScreen } from './ui/play';

/** Test/debug surface for Playwright. */
export interface TowerClashDebug {
  getState(): GameState | null;
  getScreen(): Screen['name'];
  loadLevel(id: number): boolean;
  autoplay(): boolean;
  setSpeed(n: number): void;
  toClient(x: number, y: number): { x: number; y: number };
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

    const forward = <K extends 'down' | 'move' | 'up'>(k: K) => (p: PointerPoint) => this.current[k]?.(p);
    attachPointer(canvas, this.view, {
      down: forward('down'),
      move: forward('move'),
      up: forward('up'),
      cancel: () => this.current.cancel?.(),
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') e.preventDefault();
      this.current.key?.(e);
    });
    const onResize = (): void => resize(this.view);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);

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
      setSpeed: (n) => {
        this.speed = Math.max(0.1, Math.min(20, n));
        this.play?.setSpeed(this.speed);
      },
      toClient: (x, y) => toClient(this.view, x, y),
      aiAvailable: true,
    };
  }
}

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#game canvas missing');
  const app = new TowerClashApp(canvas);
  window.__towerclash = app.debug();
}

boot();
