import type { Owner } from '../sim/types';
import type { Tones } from './palette';
import { DEFAULT_PALETTE, shade, withAlpha } from './palette';
import { bush, clashStar, heroTower, island, rays, sword } from './appIcon';
import type { Ground } from './appIcon';
import { drawBadge, drawUnitSprite, TAU } from './sprites';
import { drawExtrudedText, FONT } from './widgets';

/*
 * Google Play feature graphic (ART-19), 1024 × 500. Not part of the game bundle:
 * store/tools/renderStoreShots.mjs bundles this module for headless Chromium (like
 * scripts/renderIcons.ts does with appIcon.ts) and writes store/feature-graphic.png from it.
 *
 * It is the app icon "Sunburst" (ART-18, docs/ART_DIRECTION.md §7) opened up into a scene: the same
 * gold-amber rays around a pale sun core, the same chunky clay hero tower (appIcon.ts `heroTower`,
 * built from sprites.ts plinth / cylinder / cone / flag / gems) with its ink sticker outline, and a
 * clash — blue towers against a coral tower, the game's own clay soldiers (sprites.ts
 * `drawUnitSprite`) marching along owner-coloured stream ribbons, a gold clash star where the
 * columns meet, the target's count badge "under fire" (`drawBadge`). The wordmark is the in-game logo (`drawExtrudedText`,
 * Fredoka 700: paper "TOWER" over blue "CLASH", ink contour, blue extrusion) with a thicker contour
 * so it still reads at 50 %.
 *
 * Play may crop the edges and overlays a play button in the middle when the listing has a video,
 * so the centre third (x 341–683) carries no text and the title stays ≥ 32 px inside every edge.
 * The caller must load Fredoka 700 before drawing.
 */

export const FEATURE_W = 1024;
export const FEATURE_H = 500;

export const FEATURE_VARIANTS = ['duel', 'hero'] as const;
export type FeatureVariant = (typeof FEATURE_VARIANTS)[number];
/** The variant written to store/feature-graphic.png (ART-19). */
export const DEFAULT_FEATURE: FeatureVariant = 'duel';

/** Horizontal band (x0..x1) of the centre third that must stay free of text. */
export const FEATURE_TEXT_FREE: readonly [number, number] = [FEATURE_W / 3, (FEATURE_W * 2) / 3];

/**
 * Wordmark placement per variant: centre x, top y, font size before fitting and the width both
 * lines are fitted into (contour included). The extrusion and the field shadow add at most
 * `WORDMARK_SPILL` px to the right / bottom. tests/release/featureGraphic.test.ts keeps every box
 * out of the centre third and ≥ 32 px inside the edges.
 */
export const FEATURE_TITLE: Readonly<Record<FeatureVariant, { cx: number; top: number; px: number; maxW: number }>> = {
  duel: { cx: 182, top: 92, px: 104, maxW: 284 },
  hero: { cx: 834, top: 112, px: 104, maxW: 270 },
};
/** Extrusion depth (0.09 em) at the largest size: what the lettering adds right of / under its box. */
export const WORDMARK_SPILL = 10;

export interface FeatureOptions {
  variant?: FeatureVariant;
  /** Wordmark lines (default the brand, which is never translated). */
  title?: readonly [string, string];
  /** Font stack for the wordmark and badges (default the game's Fredoka stack). */
  family?: string;
}

const PAL = DEFAULT_PALETTE;
const PLAYER = PAL.ownerTones.player;
const ENEMY = PAL.ownerTones.enemy1;
const INK = PAL.ink;
const W = FEATURE_W;
const H = FEATURE_H;
/** `heroTower` takes the device size of a 1024 design square; this canvas is drawn 1:1. */
const DEVICE = 1024;

/** Draws the feature graphic into a 1024 × 500 canvas (origin top-left, no transform). */
export function drawFeatureGraphic(ctx: CanvasRenderingContext2D, o: FeatureOptions = {}): void {
  const variant = o.variant ?? DEFAULT_FEATURE;
  const family = o.family ?? FONT;
  const title = o.title ?? ['TOWER', 'CLASH'];
  ctx.save();
  if (variant === 'hero') drawHero(ctx, family, title);
  else drawDuel(ctx, family, title);
  ctx.restore();
}

/* ---------------------------------------------------------------- shared pieces */

/** The icon's "Sunburst" field, widened: amber → orange, gold rays and a pale core at (sx, sy). */
function sunburst(ctx: CanvasRenderingContext2D, sx: number, sy: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffb21e');
  g.addColorStop(1, '#ff7a1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.55;
  rays(ctx, sx, sy, 26, '#ffd84a', 0.3);
  ctx.restore();
  const core = ctx.createRadialGradient(sx, sy, 30, sx, sy, 330);
  core.addColorStop(0, 'rgba(255, 250, 225, 1)');
  core.addColorStop(0.35, 'rgba(255, 236, 150, 0.75)');
  core.addColorStop(1, 'rgba(255, 200, 60, 0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, W, H);
  // deepen the corners to orange (the icon's edge burn), so the eye lands on the light
  const burn = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 640);
  burn.addColorStop(0, 'rgba(232, 80, 20, 0)');
  burn.addColorStop(1, 'rgba(200, 60, 20, 0.42)');
  ctx.fillStyle = burn;
  ctx.fillRect(0, 0, W, H);
}

/**
 * The in-game wordmark (menus.ts title: paper "TOWER" over blue "CLASH", blue extrusion, ink
 * contour), fitted to `maxW`, with a soft shadow on the field. Returns the font size used.
 */
function wordmark(ctx: CanvasRenderingContext2D, family: string, title: readonly [string, string], cx: number, top: number, px: number, maxW: number): number {
  ctx.save();
  ctx.font = `700 ${px}px ${family}`;
  const wide = Math.max(ctx.measureText(title[0]).width, ctx.measureText(title[1]).width) + px * 0.2;
  ctx.restore();
  if (wide > maxW) px = Math.floor((px * maxW) / wide);
  const lineH = px * 1.02;
  // the depth spills right / down by ≤ WORDMARK_SPILL; the soft field shadow is not lettering
  const y0 = top + px * 0.5;
  const blue = PLAYER.mid;
  const depth = Math.round(px * 0.09);
  // soft shadow on the field, to the lower-right like every clay object
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.font = `700 ${px}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = px * 0.3;
  ctx.strokeStyle = '#8a2c08';
  ctx.fillStyle = '#8a2c08';
  for (const [i, line] of title.entries()) {
    ctx.strokeText(line, cx + depth + 6, y0 + i * lineH + depth + 10);
    ctx.fillText(line, cx + depth + 6, y0 + i * lineH + depth + 10);
  }
  ctx.restore();
  // a heavier ink contour than the title screen's (0.12) so the letters hold at 50 % on the rays
  drawExtrudedText(ctx, title[0], cx, y0, px, { face: PAL.paper, side: shade(blue, -0.25), outline: INK, depth, family, outlineFrac: 0.18 });
  drawExtrudedText(ctx, title[1], cx, y0 + lineH, px, { face: blue, side: shade(blue, -0.45), outline: INK, depth, family, outlineFrac: 0.18 });
  return px;
}

/**
 * A stream lane in the draw.ts look: owner ribbon with an ink contour and paper chevrons
 * marching from (ax, ay) to (bx, by); `head` adds the arrowhead at the target end.
 */
function stream(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, tones: Tones, w: number, head: boolean): void {
  const len = Math.hypot(bx - ax, by - ay);
  const dx = (bx - ax) / len;
  const dy = (by - ay) / len;
  const nx = -dy;
  const ny = dx;
  const end = head ? len - w * 1.1 : len;
  const ex = ax + dx * end;
  const ey = ay + dy * end;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = withAlpha(INK, 0.75);
  ctx.lineWidth = w + 4;
  ctx.stroke();
  ctx.strokeStyle = tones.lit;
  ctx.lineWidth = w;
  ctx.stroke();
  if (head) {
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex - dx * w * 0.4 + nx * w * 1.15, ey - dy * w * 0.4 + ny * w * 1.15);
    ctx.lineTo(ex - dx * w * 0.4 - nx * w * 1.15, ey - dy * w * 0.4 - ny * w * 1.15);
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = tones.mid;
    ctx.fill();
  }
  ctx.strokeStyle = PAL.paper;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(2, w * 0.18);
  ctx.beginPath();
  const c = w * 0.3;
  for (let d = w * 1.4; d < end - w * 0.8; d += w * 2.2) {
    const px = ax + dx * d;
    const py = ay + dy * d;
    ctx.moveTo(px - dx * c + nx * c, py - dy * c + ny * c);
    ctx.lineTo(px + dx * c * 0.8, py + dy * c * 0.8);
    ctx.lineTo(px - dx * c - nx * c, py - dy * c - ny * c);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * A column of the game's clay soldiers walking from (ax, ay) towards (bx, by), `n` of them `gap`
 * apart starting `from` px along the lane, `k` × map size. Alternate soldiers step 4 px off the
 * centre line so the column reads as a crowd, not a bead string. Painted back-to-front.
 */
function column(ctx: CanvasRenderingContext2D, owner: Owner, ax: number, ay: number, bx: number, by: number, from: number, n: number, gap: number, k: number): void {
  const len = Math.hypot(bx - ax, by - ay);
  const dx = (bx - ax) / len;
  const dy = (by - ay) / len;
  const pts: Array<{ x: number; y: number; id: number }> = [];
  for (let i = 0; i < n; i++) {
    const d = from + i * gap;
    const off = (i % 2 === 0 ? -1 : 1) * 4 * k * 0.5;
    pts.push({ x: ax + dx * d - dy * off, y: ay + dy * d + dx * off, id: i });
  }
  pts.sort((a, b) => a.y - b.y);
  for (const p of pts) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(k, k);
    drawUnitSprite(ctx, PAL, 0, 0, owner, 'infantry', dx, dy, p.id, 0, false);
    ctx.restore();
  }
}

/**
 * Count badge (sprites.ts `drawBadge`), `k` × its map size, centred at (x, y), drawn "under fire"
 * by `attacker` (alert paper, attacker-coloured stroke, crossed-swords pip — rules v2.1).
 */
function badge(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, n: number, attacker: Tones): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  // drawBadge sets its own font from the UI stack (English: Fredoka first)
  drawBadge(ctx, PAL, 0, 0, String(n), false, { underFire: attacker.mid });
  ctx.restore();
}

/** Small impact sparks around a point (gold dashes), the landing / clash accent. */
function sparks(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = PAL.goldTones.lit;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.35;
    ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8);
    ctx.lineTo(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4 * 0.8);
  }
  ctx.stroke();
  ctx.restore();
}

/** Clay tower with ground shadow + ink sticker outline at `s` × map size (appIcon.ts heroTower). */
function tower(ctx: CanvasRenderingContext2D, ground: Ground, x: number, y: number, s: number, tones: Tones, level: number): void {
  heroTower(ctx, DEVICE, ground, x, y, s, { tones, level, flagScale: 1.5 }, 3.4 * s);
}

/* ---------------------------------------------------------------- A "duel" */

/**
 * A: wordmark in the left third; in the light, two blue towers on an island hold off a coral tower
 * on the right. One blue column and one coral column meet mid-lane under a clash star; the second
 * blue tower's stream lands on the coral keep. The hero tower stands in the sun core like the icon.
 */
function drawDuel(ctx: CanvasRenderingContext2D, family: string, title: readonly [string, string]): void {
  sunburst(ctx, 640, 200);
  const ground = island(ctx, 668, 384, 330, 74, 40);
  bush(ctx, 392, 392, 16);
  bush(ctx, 958, 380, 14);
  bush(ctx, 760, 444, 13);
  bush(ctx, 640, 322, 11);

  const blueA = { x: 482, y: 418 };
  const blueB = { x: 604, y: 328 };
  const red = { x: 878, y: 372 };
  const meet = { x: 716, y: 398 };
  // lanes: hero ↔ coral keep (two columns meet), second blue tower → coral keep (lands)
  stream(ctx, blueA.x + 34, blueA.y - 6, meet.x - 18, meet.y - 2, PLAYER, 12, false);
  stream(ctx, red.x - 40, red.y + 8, meet.x + 18, meet.y + 2, ENEMY, 12, false);
  stream(ctx, blueB.x + 30, blueB.y, red.x - 46, red.y - 22, PLAYER, 12, true);
  column(ctx, 'player', blueB.x + 30, blueB.y, red.x - 46, red.y - 22, 30, 4, 44, 1.9);
  column(ctx, 'player', blueA.x + 34, blueA.y - 6, meet.x, meet.y, 34, 5, 37, 2.1);
  column(ctx, 'enemy1', red.x - 40, red.y + 8, meet.x, meet.y, 30, 4, 37, 2.1);

  tower(ctx, ground, blueB.x, blueB.y, 1.2, PLAYER, 1);
  tower(ctx, ground, red.x, red.y, 1.45, ENEMY, 2);
  tower(ctx, ground, blueA.x, blueA.y, 1.75, PLAYER, 3);
  sparks(ctx, red.x - 50, red.y - 24, 16);
  ctx.save();
  ctx.translate(meet.x, meet.y - 30);
  ctx.scale(0.5, 0.5);
  clashStar(ctx, 0, 0, 62, 8, 0.2);
  ctx.restore();

  badge(ctx, red.x + 8, red.y - 268, 1.35, 18, PLAYER);

  const t = FEATURE_TITLE.duel;
  wordmark(ctx, family, title, t.cx, t.top, t.px, t.maxW);
}

/* ---------------------------------------------------------------- B "hero" */

/**
 * B: the icon itself opened up — the hero tower with its crossed swords in the sun core on the
 * left, a blue column storming a coral tower in the middle, wordmark in the right third.
 */
function drawHero(ctx: CanvasRenderingContext2D, family: string, title: readonly [string, string]): void {
  sunburst(ctx, 268, 200);
  // the icon's crossed swords behind the hero roof (icon geometry at 0.42 ×)
  for (const rot of [-0.8, 0.8]) {
    ctx.save();
    ctx.translate(262, 326);
    ctx.scale(0.43, 0.43);
    ctx.rotate(rot);
    ctx.translate(0, 90);
    sword(ctx, 560, null);
    ctx.restore();
  }
  const ground = island(ctx, 380, 392, 330, 72, 40);
  bush(ctx, 98, 398, 16);
  bush(ctx, 690, 392, 13);
  bush(ctx, 470, 448, 12);

  const hero = { x: 258, y: 420 };
  const blueB = { x: 420, y: 330 };
  const red = { x: 612, y: 372 };
  stream(ctx, hero.x + 40, hero.y - 8, red.x - 46, red.y + 2, PLAYER, 12, true);
  stream(ctx, blueB.x + 28, blueB.y + 4, red.x - 40, red.y - 18, PLAYER, 11, true);
  column(ctx, 'player', blueB.x + 28, blueB.y + 4, red.x - 40, red.y - 18, 34, 3, 42, 1.8);
  column(ctx, 'player', hero.x + 40, hero.y - 8, red.x - 46, red.y + 2, 40, 6, 42, 2.1);

  tower(ctx, ground, blueB.x, blueB.y, 1.1, PLAYER, 1);
  tower(ctx, ground, red.x, red.y, 1.4, ENEMY, 2);
  tower(ctx, ground, hero.x, hero.y, 1.85, PLAYER, 3);
  sparks(ctx, red.x - 50, red.y - 8, 18);
  ctx.save();
  ctx.translate(red.x - 46, red.y - 34);
  ctx.scale(0.42, 0.42);
  clashStar(ctx, 0, 0, 70, 8, 0.2);
  ctx.restore();

  badge(ctx, red.x, red.y - 238, 1.35, 9, PLAYER);

  const t = FEATURE_TITLE.hero;
  wordmark(ctx, family, title, t.cx, t.top, t.px, t.maxW);
}
