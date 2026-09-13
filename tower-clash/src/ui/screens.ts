import type { GameState, LevelDef } from '../sim/types';
import { C } from '../sim/constants';
import { LEVELS } from '../levels/index';
import type { Palette } from '../render/palette';
import { shade } from '../render/palette';
import type { View } from '../render/view';
import { applyDeviceTransform, applyTransform, clipToMap } from '../render/view';
import { RESULT } from '../render/layout';
import type { Rect } from '../render/widgets';
import { drawButton, drawStars, font, inRect } from '../render/widgets';
import type { PointerPoint } from '../input/pointer';
import type { PlayUi } from '../render/draw';
import { drawGame } from '../render/draw';
import type { SaveData } from './save';
import { writeSave } from './save';

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

/** Decorative background: a few dim towers and roads so menus feel like the game. */
function drawBackdropArt(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number): void {
  const pts = [
    { x: 120, y: 300 },
    { x: 600, y: 240 },
    { x: 360, y: 520 },
    { x: 140, y: 900 },
    { x: 580, y: 980 },
  ];
  ctx.strokeStyle = pal.roadDim;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
    [2, 3],
    [2, 4],
    [3, 4],
  ];
  for (const [a, b] of edges) {
    const p = pts[a]!;
    const q = pts[b]!;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
  const owners: (keyof Palette['owners'])[] = ['player', 'enemy1', 'neutral', 'neutral', 'enemy1'];
  pts.forEach((p, i) => {
    const wob = Math.sin(nowMs / 900 + i) * 3;
    ctx.fillStyle = shade(pal.owners[owners[i] ?? 'neutral'], -0.55);
    ctx.beginPath();
    ctx.arc(p.x, p.y + wob, 30, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ---------- Title ---------- */

const TITLE_PLAY: Rect = { x: 180, y: 640, w: 360, h: 96 };
const TITLE_CB: Rect = { x: 180, y: 780, w: 360, h: 64 };

export class TitleScreen implements Screen {
  readonly name = 'title' as const;
  constructor(private readonly app: App) {}

  draw(view: View, nowMs: number): void {
    const pal = this.app.palette();
    const ctx = view.ctx;
    beginMapFrame(view, pal);
    drawBackdropArt(ctx, pal, nowMs);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.text;
    ctx.font = font(92, '900');
    ctx.fillText('TOWER', 360, 380);
    ctx.fillStyle = pal.owners.player;
    ctx.fillText('CLASH', 360, 470);
    ctx.fillStyle = pal.textDim;
    ctx.font = font(24, 'normal');
    ctx.fillText('Capture every tower', 360, 545);

    drawButton(ctx, pal, TITLE_PLAY, 'PLAY', { fill: pal.owners.player, border: shade(pal.owners.player, 0.3), fontPx: 40 });
    const cb = this.app.save.settings.colorBlind;
    drawButton(ctx, pal, TITLE_CB, `Colour-blind palette: ${cb ? 'ON' : 'OFF'}`, { fontPx: 22, border: cb ? pal.accent : undefined });

    const total = Object.values(this.app.save.stars).reduce((a, b) => a + b, 0);
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20, 'normal');
    ctx.fillText(`${total} ★ · ${this.app.save.coins} coins`, 360, 1200);
    endMapFrame(view);
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
    const pal = this.app.palette();
    const ctx = view.ctx;
    beginMapFrame(view, pal);
    drawBackdropArt(ctx, pal, nowMs);

    ctx.save();
    ctx.translate(0, -this.scroll);
    LEVELS.forEach((level, i) => {
      const r = levelCardRect(i);
      const stars = this.app.save.stars[String(level.id)] ?? 0;
      drawButton(ctx, pal, r, '', { border: stars > 0 ? shade(pal.owners.player, 0.2) : undefined });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = pal.text;
      ctx.font = font(56, '900');
      ctx.fillText(String(level.id), r.x + r.w / 2, r.y + 62);
      ctx.fillStyle = pal.textDim;
      ctx.font = font(20);
      ctx.fillText(level.name, r.x + r.w / 2, r.y + 120, r.w - 20);
      drawStars(ctx, pal, r.x + r.w / 2, r.y + 162, stars, 13);
    });
    ctx.restore();

    // Header (on top of cards when scrolled)
    ctx.fillStyle = pal.background;
    ctx.fillRect(0, 0, C.MAP_W, 200);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.text;
    ctx.font = font(48, '900');
    ctx.fillText('SELECT LEVEL', 360, 130);
    drawButton(ctx, pal, BACK, 'BACK', { fontPx: 24 });
    endMapFrame(view);
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
        this.app.startLevel(level.id);
        return;
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
    private readonly info: ResultInfo,
  ) {}

  draw(view: View): void {
    drawGame(view.ctx, this.info.state, view, this.info.ui);
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
