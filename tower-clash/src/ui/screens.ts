import type { GameState, LevelDef } from '../sim/types';
import { C } from '../sim/constants';
import { LEVELS } from '../levels/index';
import type { Palette } from '../render/palette';
import type { View } from '../render/view';
import { applyDeviceTransform, applyTransform, clipToMap } from '../render/view';
import { RESULT } from '../render/layout';
import type { Rect } from '../render/widgets';
import { inRect } from '../render/widgets';
import { drawLevelSelect, drawTitle } from '../render/menus';
import type { PointerPoint } from '../input/pointer';
import type { PlayUi } from '../render/draw';
import { drawGame } from '../render/draw';
import type { SaveData } from './save';
import { isLevelUnlocked, writeSave } from './save';

/** A screen owns drawing and input while it is current. */
export interface Screen {
  readonly name: 'title' | 'levelSelect' | 'play' | 'result';
  enter?(): void;
  exit?(): void;
  update?(dtMs: number, nowMs: number): void;
  draw(view: View, nowMs: number): void;
  down?(p: PointerPoint): void;
  move?(p: PointerPoint): void;
  up?(p: PointerPoint): void;
  cancel?(): void;
  key?(e: KeyboardEvent): void;
}

/** What screens may ask of the application shell. */
export interface App {
  readonly view: View;
  readonly save: SaveData;
  palette(): Palette;
  goTitle(): void;
  goLevels(): void;
  startLevel(levelId: number): void;
  go(screen: Screen): void;
  /** Sim speed multiplier for this and future levels (pause-menu toggle, debug). */
  setSpeed(n: number): void;
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

const TITLE_PLAY: Rect = { x: 180, y: 640, w: 360, h: 96 };
const TITLE_CB: Rect = { x: 180, y: 780, w: 360, h: 64 };

export class TitleScreen implements Screen {
  readonly name = 'title' as const;
  constructor(private readonly app: App) {}

  draw(view: View, nowMs: number): void {
    const total = Object.values(this.app.save.stars).reduce((a, b) => a + b, 0);
    drawTitle(view, this.app.palette(), {
      playRect: TITLE_PLAY,
      cbRect: TITLE_CB,
      colorBlind: this.app.save.settings.colorBlind,
      totalStars: total,
      coins: this.app.save.coins,
      nowMs,
    });
  }

  up(p: PointerPoint): void {
    if (inRect(TITLE_PLAY, p.x, p.y)) this.app.goLevels();
    else if (inRect(TITLE_CB, p.x, p.y)) {
      this.app.save.settings.colorBlind = !this.app.save.settings.colorBlind;
      writeSave(this.app.save);
    }
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') this.app.goLevels();
  }
}

/* ---------- Level select ---------- */

const GRID_COLS = 3;
const CARD = 200;
const GAP = 20;
const GRID_TOP = 250;
const GRID_LEFT = (C.MAP_W - GRID_COLS * CARD - (GRID_COLS - 1) * GAP) / 2;
const BACK: Rect = { x: 18, y: 18, w: 140, h: 60 };

export function levelCardRect(index: number): Rect {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return { x: GRID_LEFT + col * (CARD + GAP), y: GRID_TOP + row * (CARD + GAP), w: CARD, h: CARD };
}

export class LevelSelectScreen implements Screen {
  readonly name = 'levelSelect' as const;
  private scroll = 0;
  private downY = 0;
  private scrollAtDown = 0;
  private dragging = false;

  constructor(private readonly app: App) {}

  private maxScroll(): number {
    const rows = Math.ceil(LEVELS.length / GRID_COLS);
    const contentBottom = GRID_TOP + rows * (CARD + GAP) + 40;
    return Math.max(0, contentBottom - C.MAP_H);
  }

  draw(view: View, nowMs: number): void {
    drawLevelSelect(view, this.app.palette(), {
      cards: LEVELS.map((level, i) => ({
        rect: levelCardRect(i),
        id: level.id,
        name: level.name,
        stars: this.app.save.stars[String(level.id)] ?? 0,
        unlocked: isLevelUnlocked(this.app.save, LEVELS, i),
      })),
      scroll: this.scroll,
      backRect: BACK,
      coins: this.app.save.coins,
      nowMs,
      headerH: 200,
    });
  }

  down(p: PointerPoint): void {
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
  }

  move(p: PointerPoint): void {
    if (Math.abs(p.y - this.downY) > 14) this.dragging = true;
    if (this.dragging) this.scroll = Math.max(0, Math.min(this.maxScroll(), this.scrollAtDown - (p.y - this.downY)));
  }

  up(p: PointerPoint): void {
    if (this.dragging) return;
    if (inRect(BACK, p.x, p.y)) {
      this.app.goTitle();
      return;
    }
    if (p.y < 200) return;
    const y = p.y + this.scroll;
    for (let i = 0; i < LEVELS.length; i++) {
      const level = LEVELS[i];
      if (level && inRect(levelCardRect(i), p.x, y)) {
        if (isLevelUnlocked(this.app.save, LEVELS, i)) this.app.startLevel(level.id);
        return; // locked: the tap does nothing
      }
    }
  }

  cancel(): void {
    this.dragging = false;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.app.goTitle();
  }
}

/* ---------- Result ---------- */

export interface ResultInfo {
  state: GameState;
  level: LevelDef;
  ui: PlayUi;
}

/** Shows the frozen final frame under the win/lose overlay (drawn by drawGame). */
export class ResultScreen implements Screen {
  readonly name = 'result' as const;
  constructor(
    private readonly app: App,
    readonly info: ResultInfo,
  ) {}

  draw(view: View, nowMs: number): void {
    drawGame(view.ctx, this.info.state, view, this.info.ui, nowMs);
  }

  up(p: PointerPoint): void {
    const { ui, level } = this.info;
    if (inRect(RESULT.retry, p.x, p.y)) this.app.startLevel(level.id);
    else if (inRect(RESULT.menu, p.x, p.y)) this.app.goLevels();
    else if (inRect(RESULT.next, p.x, p.y) && ui.outcome === 'won' && ui.hasNext) {
      const idx = LEVELS.findIndex((l) => l.id === level.id);
      const next = LEVELS[idx + 1];
      if (next) this.app.startLevel(next.id);
    }
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.app.goLevels();
    else if (e.key === 'Enter') {
      const { ui, level } = this.info;
      if (ui.outcome === 'won' && ui.hasNext) {
        const idx = LEVELS.findIndex((l) => l.id === level.id);
        const next = LEVELS[idx + 1];
        if (next) this.app.startLevel(next.id);
      } else this.app.startLevel(level.id);
    }
  }
}
