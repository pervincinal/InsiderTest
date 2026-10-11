import type { Tones } from './palette';
import { DEFAULT_PALETTE, withAlpha } from './palette';
import { cone, cylinder, door, drawTowerShadow, flag, gems, plinth, RIM, TAU } from './sprites';

/*
 * App icon and launch-screen art (ART-18). Not part of the game bundle: scripts/renderIcons.ts
 * bundles this module for headless Chromium and writes every platform icon from it (PWA, iOS
 * AppIcon, Android legacy + adaptive layers, Play store, splash). The tower is built from the
 * game's own clay primitives (sprites.ts: plinth, cylinder, cone, door, flag, gems, ground shadow)
 * and palette (ART_DIRECTION §2), only bigger and chunkier, so the icon is the game's tower.
 *
 * Design space: a 1024 × 1024 square; `drawAppIcon` scales it to any size. The background layer
 * is full-bleed; the foreground art is kept inside a circle of radius `ART_RADIUS` around the
 * centre so a mask (Android circle / squircle, PWA maskable 80 % zone) never cuts the tower.
 *
 * Readability brief (stakeholder, 2026-10-11): one bold silhouette at 60 px on a busy wallpaper,
 * high contrast, warm saturated colours, no text or numbers.
 */

const PAL = DEFAULT_PALETTE;
const PLAYER = PAL.ownerTones.player;
const ENEMY = PAL.ownerTones.enemy1;
const INK = PAL.ink;
const D = 1024;
/**
 * Radius (design units, from the centre) every foreground variant stays inside, outline included
 * (cast shadows aside). tests/release/appIcons.test.ts checks it on the shipped adaptive layer. Android's adaptive safe zone is a 66 dp circle in the
 * 72 dp visible window, i.e. 469 units at full tile size; the PWA maskable zone is 40 % of the
 * icon, so the maskable target zooms by `MASKABLE_ZOOM`.
 */
export const ART_RADIUS = 460;
/** Android adaptive layers are 108 dp, of which the centre 72 dp is visible: the tile sits at 2/3. */
export const ADAPTIVE_ZOOM = 72 / 108;
/** PWA maskable: art inside the 80 % safe circle (0.4 × 1024 = 410 units ≥ ART_RADIUS × zoom). */
export const MASKABLE_ZOOM = 0.88;

export const APP_ICON_VARIANTS = ['sunburst', 'island', 'duel'] as const;
export type AppIconVariant = (typeof APP_ICON_VARIANTS)[number];
/** The variant every shipped icon uses (ART-18, docs/ART_DIRECTION.md §7). */
export const DEFAULT_APP_ICON: AppIconVariant = 'sunburst';

/** `full` = background + art; the two layers alone are Android's adaptive background / foreground. */
export type AppIconLayer = 'full' | 'background' | 'foreground';

export interface AppIconOptions {
  variant?: AppIconVariant;
  layer?: AppIconLayer;
  /**
   * Scale of the whole composition about the centre (1 = the 1024 tile). Backgrounds paint well past
   * the tile, so a zoom below 1 (adaptive layers, maskable) never leaves an empty border.
   */
  zoom?: number;
  /** Clip to this shape (transparent outside); default `square` (full-bleed). */
  shape?: 'square' | 'rounded' | 'circle';
}

/** Draws the app icon into a `size` × `size` square at the current transform's origin. */
export function drawAppIcon(ctx: CanvasRenderingContext2D, size: number, o: AppIconOptions = {}): void {
  const variant = o.variant ?? DEFAULT_APP_ICON;
  const layer = o.layer ?? 'full';
  const zoom = o.zoom ?? 1;
  ctx.save();
  ctx.scale(size / D, size / D);
  if (o.shape === 'rounded') {
    ctx.beginPath();
    ctx.roundRect(0, 0, D, D, D * 0.2237);
    ctx.clip();
  } else if (o.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(D / 2, D / 2, D / 2, 0, TAU);
    ctx.clip();
  }
  ctx.translate(D / 2, D / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-D / 2, -D / 2);
  if (layer !== 'foreground') BACKGROUNDS[variant](ctx);
  if (layer !== 'background') ARTS[variant](ctx, size * zoom);
  ctx.restore();
}

export interface SplashOptions {
  variant?: AppIconVariant;
  /** Launch colour (the native shells' `backgroundColor`). */
  background: string;
  title: string;
  /** CSS font family list for the title (the caller has loaded the face). */
  font: string;
}

/**
 * Launch screen: the icon tile (rounded, soft drop shadow) centred on the flat launch colour
 * with the title under it. Everything stays inside the centre 42 % of the shorter side's width, so
 * iOS's aspect-fill crop of the 2732 square on a 19.5:9 phone (≈ 46 % visible) keeps it whole.
 */
export function drawSplash(ctx: CanvasRenderingContext2D, w: number, h: number, o: SplashOptions): void {
  ctx.save();
  ctx.fillStyle = o.background;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  const tile = Math.round(m * 0.3);
  const x = Math.round((w - tile) / 2);
  const y = Math.round(h / 2 - tile * 0.66);
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = tile * 0.08;
  ctx.shadowOffsetY = tile * 0.03;
  ctx.fillStyle = o.background;
  ctx.beginPath();
  ctx.roundRect(x, y, tile, tile, tile * 0.2237);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  drawAppIcon(ctx, tile, { variant: o.variant, shape: 'rounded' });
  ctx.restore();
  let px = Math.round(m * 0.06);
  ctx.font = `700 ${px}px ${o.font}`;
  const maxW = m * 0.42;
  const tw = ctx.measureText(o.title).width;
  if (tw > maxW) {
    px = Math.floor((px * maxW) / tw);
    ctx.font = `700 ${px}px ${o.font}`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAL.paper;
  ctx.fillText(o.title, w / 2, y + tile + px * 1.3);
  ctx.restore();
}

/* ---------------------------------------------------------------- shared pieces */

/** A blank canvas the size of `ctx`'s, carrying the same transform. */
function layerLike(ctx: CanvasRenderingContext2D): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = ctx.canvas.width;
  canvas.height = ctx.canvas.height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2d context');
  g.setTransform(ctx.getTransform());
  return { canvas, g };
}

/**
 * Sticker outline: paints `draw` offscreen, stamps its silhouette 32 times around a circle of
 * `px` device pixels, tints the stamp with `color`, then lays the art on top.
 */
function outlined(ctx: CanvasRenderingContext2D, px: number, color: string, draw: (g: CanvasRenderingContext2D) => void): void {
  const art = layerLike(ctx);
  draw(art.g);
  const rim = layerLike(ctx);
  rim.g.setTransform(1, 0, 0, 1, 0, 0);
  const n = 32;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    rim.g.drawImage(art.canvas, Math.cos(a) * px, Math.sin(a) * px);
  }
  rim.g.globalCompositeOperation = 'source-in';
  rim.g.fillStyle = color;
  rim.g.fillRect(0, 0, rim.canvas.width, rim.canvas.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(rim.canvas, 0, 0);
  ctx.drawImage(art.canvas, 0, 0);
  ctx.restore();
}

/** Vertical gradient fill of the whole square. */
function vertical(ctx: CanvasRenderingContext2D, stops: ReadonlyArray<readonly [number, string]>): void {
  const g = ctx.createLinearGradient(0, 0, 0, D);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(-D, -D, 3 * D, 3 * D);
}

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, stops: ReadonlyArray<readonly [number, string]>): void {
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(-D, -D, 3 * D, 3 * D);
}

/** Alternating rays from (x, y), `n` pairs, slightly turned so no ray points straight up. */
function rays(ctx: CanvasRenderingContext2D, x: number, y: number, n: number, color: string, turn = 0.5): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  const step = TAU / n;
  for (let i = 0; i < n; i++) {
    const a0 = (i + turn) * step;
    const a1 = a0 + step / 2;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a0) * D * 3, y + Math.sin(a0) * D * 3);
    ctx.lineTo(x + Math.cos(a1) * D * 3, y + Math.sin(a1) * D * 3);
    ctx.closePath();
  }
  ctx.fill();
}

/** Calm sea with a few paper sparkle dashes (the map water look). */
function sea(ctx: CanvasRenderingContext2D, top: number): void {
  const g = ctx.createLinearGradient(0, top, 0, D);
  g.addColorStop(0, PAL.waterBottom);
  g.addColorStop(0.18, PAL.waterTop);
  g.addColorStop(1, PAL.sky);
  ctx.fillStyle = g;
  ctx.fillRect(-D, top, 3 * D, 2 * D);
  ctx.strokeStyle = PAL.waterSparkle;
  ctx.lineCap = 'round';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (const [x, y, w] of [
    [120, top + 70, 70],
    [820, top + 50, 90],
    [220, top + 170, 60],
    [760, top + 190, 70],
  ] as const) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
  }
  ctx.stroke();
}

/**
 * Island plateau (ART_DIRECTION §3 world): soft shadow on the water, cliff band (lit / shade),
 * three-tone grass top with a sun patch, foam where water meets cliff.
 */
interface Ground {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Draws the plateau and returns its grass top (cast shadows are clipped to it). */
function island(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, depth: number): Ground {
  const grass = PAL.grassTones;
  ctx.fillStyle = PAL.groundShadow;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.08, cy + depth + ry * 0.35, rx * 1.02, ry * 1.05, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = PAL.foam;
  ctx.beginPath();
  ctx.ellipse(cx, cy + depth, rx + 14, ry + 10, 0, 0, TAU);
  ctx.fill();
  // cliff: shade body, lit left half
  ctx.fillStyle = PAL.cliffShade;
  ctx.beginPath();
  ctx.ellipse(cx, cy + depth, rx, ry, 0, 0, Math.PI);
  ctx.lineTo(cx - rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.cliffLit;
  ctx.beginPath();
  ctx.ellipse(cx, cy + depth, rx, ry, 0, Math.PI * 0.62, Math.PI);
  ctx.lineTo(cx - rx, cy);
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 0.62, true);
  ctx.closePath();
  ctx.fill();
  // grass top: shade rim, mid, lit sun patch upper-left
  ctx.fillStyle = grass.shade;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = grass.mid;
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.02, cy - ry * 0.06, rx * 0.97, ry * 0.9, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = grass.lit;
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.3, cy - ry * 0.3, rx * 0.5, ry * 0.42, -0.12, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 6, ry - 5, 0, Math.PI * 1.05, Math.PI * 1.55);
  ctx.stroke();
  return { cx, cy, rx, ry };
}

/** A round clay bush (the biome props): shade, mid, lit puff. */
function bush(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const b = PAL.biomes.grass.bush;
  ctx.fillStyle = PAL.objectShadow;
  ctx.beginPath();
  ctx.ellipse(x + r * 0.5, y + r * 0.35, r * 1.2, r * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = b.shade;
  ctx.beginPath();
  ctx.arc(x, y - r * 0.6, r, 0, TAU);
  ctx.arc(x + r * 0.9, y - r * 0.4, r * 0.75, 0, TAU);
  ctx.fill();
  ctx.fillStyle = b.mid;
  ctx.beginPath();
  ctx.arc(x - r * 0.08, y - r * 0.72, r * 0.86, 0, TAU);
  ctx.arc(x + r * 0.8, y - r * 0.5, r * 0.6, 0, TAU);
  ctx.fill();
  ctx.fillStyle = b.lit;
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.95, r * 0.42, 0, TAU);
  ctx.fill();
}

interface TowerLookOpts {
  tones: Tones;
  /** Gold gems on the plinth (the game's tower level). */
  level: number;
  /** Flag on the roof apex, waving to the right. */
  flagScale: number;
}

/**
 * The hero tower, in map units with the anchor at the ground point (like `drawBarracks`): stone
 * plinth with gold level gems, squat cream body with a door, an oversized owner-coloured cone roof
 * and a big flag on the apex. Total height ≈ 150 units including the flag.
 */
function clayTower(ctx: CanvasRenderingContext2D, t: TowerLookOpts): void {
  const st = PAL.stoneTones;
  plinth(ctx, PAL, 0, 0, 36, 11);
  cylinder(ctx, st, 0, -46, -10, 27, 9.5, 2);
  door(ctx, PAL, 0, -10, 7.5, 18);
  gems(ctx, PAL, 0, -3, t.level, 0, false);
  // roof: wide overhang, tall cone (the game's cone primitive, 3 facets + rim light)
  cone(ctx, t.tones, 0, -48, -112, 42, 12.5);
  // apex cap so the tip stays round at icon sizes
  ctx.fillStyle = t.tones.lit;
  ctx.beginPath();
  ctx.arc(-1, -111, 3.2, 0, TAU);
  ctx.fill();
  // flag: the game's waving flag, scaled up, pole planted in the apex
  ctx.save();
  ctx.translate(0, -110);
  ctx.scale(t.flagScale, t.flagScale);
  flag(ctx, PAL, t.tones, 0, -30, 30, 0, false);
  ctx.restore();
}

/**
 * Draws a tower with the game's long ground shadow (clipped to the island top), an ink sticker outline (so the silhouette holds
 * on any wallpaper) and the clay body. `s` = design units per map unit.
 */
function heroTower(ctx: CanvasRenderingContext2D, deviceSize: number, ground: Ground, x: number, y: number, s: number, t: TowerLookOpts, outline = 16): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ground.cx, ground.cy, ground.rx, ground.ry, 0, 0, TAU);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(s, s);
  drawTowerShadow(ctx, PAL, 0, 0, 'barracks', 1);
  ctx.restore();
  outlined(ctx, Math.max(0.6, (outline * deviceSize) / D), INK, (g) => {
    g.translate(x, y);
    g.scale(s, s);
    clayTower(g, t);
  });
}

/**
 * Owner stream ribbon (draw.ts drawLinks look): translucent owner body with an ink outline, paper
 * chevrons marching to the target and an arrowhead at the target end. Design units.
 */
function ribbon(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, tones: Tones, w: number): void {
  const len = Math.hypot(bx - ax, by - ay);
  const dx = (bx - ax) / len;
  const dy = (by - ay) / len;
  const nx = -dy;
  const ny = dx;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = w + 14;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx - dx * w * 0.8, by - dy * w * 0.8);
  ctx.stroke();
  ctx.strokeStyle = tones.mid;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.strokeStyle = withAlpha(tones.lit, 0.9);
  ctx.lineWidth = w * 0.28;
  ctx.beginPath();
  ctx.moveTo(ax + nx * w * 0.2, ay + ny * w * 0.2);
  ctx.lineTo(bx - dx * w * 1.6 + nx * w * 0.2, by - dy * w * 1.6 + ny * w * 0.2);
  ctx.stroke();
  // arrowhead
  const hx = bx + dx * w * 0.6;
  const hy = by + dy * w * 0.6;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(bx - dx * w * 0.9 + nx * w * 1.05, by - dy * w * 0.9 + ny * w * 1.05);
  ctx.lineTo(bx - dx * w * 0.9 - nx * w * 1.05, by - dy * w * 0.9 - ny * w * 1.05);
  ctx.closePath();
  ctx.lineWidth = 14;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = tones.mid;
  ctx.fill();
  // chevrons
  ctx.strokeStyle = PAL.paper;
  ctx.lineWidth = w * 0.2;
  ctx.beginPath();
  const c = w * 0.32;
  for (let d = w * 1.2; d < len - w * 1.8; d += w * 1.25) {
    const px = ax + dx * d;
    const py = ay + dy * d;
    ctx.moveTo(px - dx * c + nx * c, py - dy * c + ny * c);
    ctx.lineTo(px + dx * c * 0.8, py + dy * c * 0.8);
    ctx.lineTo(px - dx * c - nx * c, py - dy * c - ny * c);
  }
  ctx.stroke();
  ctx.restore();
}

/** Spiky impact star (gold with a paper core), the "clash" accent. */
function clashStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points: number, rot: number): void {
  const star = (rr: number, inner: number): void => {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (i * Math.PI) / points;
      const q = i % 2 === 0 ? rr : rr * inner;
      ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  star(r, 0.5);
  ctx.lineWidth = 14;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = PAL.goldTones.mid;
  ctx.fill();
  star(r * 0.62, 0.5);
  ctx.fillStyle = '#fff3c4';
  ctx.fill();
  ctx.restore();
}

/** One sword (blade up from the guard at the origin, length `len`), ink-outlined; `hilt` = grip colour, or no grip. */
function sword(ctx: CanvasRenderingContext2D, len: number, hilt: Tones | null): void {
  const bw = len * 0.075;
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(-bw, 0);
    ctx.lineTo(-bw, -len * 0.82);
    ctx.lineTo(0, -len);
    ctx.lineTo(bw, -len * 0.82);
    ctx.lineTo(bw, 0);
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  path();
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = '#dfe7f2';
  ctx.fill();
  // lit half of the blade + fuller
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-bw, 0);
  ctx.lineTo(-bw, -len * 0.82);
  ctx.lineTo(0, -len);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#9fb0c2';
  ctx.lineWidth = bw * 0.35;
  ctx.beginPath();
  ctx.moveTo(bw * 0.35, -len * 0.08);
  ctx.lineTo(bw * 0.35, -len * 0.78);
  ctx.stroke();
  // cross-guard, grip, pommel
  const gw = len * 0.15;
  const gh = len * 0.07;
  ctx.beginPath();
  ctx.roundRect(-gw, -gh / 2, gw * 2, gh, gh / 2);
  ctx.lineWidth = 14;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = PAL.goldTones.mid;
  ctx.fill();
  if (!hilt) {
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.roundRect(-bw * 0.9, gh / 2, bw * 1.8, len * 0.2, bw * 0.5);
  ctx.stroke();
  ctx.fillStyle = hilt.mid;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, gh / 2 + len * 0.24, bw * 1.25, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = PAL.goldTones.mid;
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------------- candidates */

/**
 * A "sunburst": warm gold-amber rays around a pale sun core, deepening to orange at the edges —
 * the complementary warm field makes the blue roof the brightest-contrast thing on a home screen.
 */
function sunburstBackground(ctx: CanvasRenderingContext2D): void {
  vertical(ctx, [
    [0, '#ffb21e'],
    [1, '#ff7a1a'],
  ]);
  ctx.save();
  ctx.globalAlpha = 0.55;
  rays(ctx, 512, 430, 18, '#ffd84a');
  ctx.restore();
  radial(ctx, 512, 430, 40, 520, [
    [0, 'rgba(255, 250, 225, 1)'],
    [0.35, 'rgba(255, 236, 150, 0.75)'],
    [1, 'rgba(255, 200, 60, 0)'],
  ]);
  radial(ctx, 512, 512, 430, 760, [
    [0, 'rgba(232, 80, 20, 0)'],
    [1, 'rgba(200, 60, 20, 0.45)'],
  ]);
}

function sunburstArt(ctx: CanvasRenderingContext2D, deviceSize: number): void {
  // crossed swords behind the tower (the clash): guards tucked under the roof, blades fanning out
  // past it towards the upper corners
  for (const rot of [-0.8, 0.8]) {
    ctx.save();
    ctx.translate(512, 590);
    ctx.rotate(rot);
    ctx.translate(0, 90);
    sword(ctx, 560, null);
    ctx.restore();
  }
  const ground = island(ctx, 512, 784, 288, 86, 48);
  bush(ctx, 306, 786, 28);
  bush(ctx, 722, 794, 24);
  heroTower(ctx, deviceSize, ground, 502, 812, 4.3, { tones: PLAYER, level: 3, flagScale: 1.55 });
}

/** B "island": bright sky over the sea, the tower alone on its plateau, a red stream striking it. */
function islandBackground(ctx: CanvasRenderingContext2D): void {
  vertical(ctx, [
    [0, '#2fb4f0'],
    [0.55, '#9fe6ff'],
    [0.66, '#fff1c4'],
  ]);
  radial(ctx, 230, 220, 20, 420, [
    [0, 'rgba(255, 252, 230, 1)'],
    [0.25, 'rgba(255, 240, 170, 0.8)'],
    [1, 'rgba(255, 220, 120, 0)'],
  ]);
  sea(ctx, 660);
}

function islandArt(ctx: CanvasRenderingContext2D, deviceSize: number): void {
  const ground = island(ctx, 500, 770, 296, 92, 50);
  bush(ctx, 282, 776, 32);
  bush(ctx, 690, 800, 26);
  ribbon(ctx, 900, 590, 640, 704, ENEMY, 52);
  heroTower(ctx, deviceSize, ground, 470, 806, 4.4, { tones: PLAYER, level: 3, flagScale: 1.55 });
  clashStar(ctx, 640, 694, 78, 8, 0.2);
}

/** C "duel": a blue and a red tower face off across the island, a gold clash star between them. */
function duelBackground(ctx: CanvasRenderingContext2D): void {
  vertical(ctx, [
    [0, '#ff9a3c'],
    [0.5, '#ffd36b'],
    [0.62, '#fff0bf'],
  ]);
  radial(ctx, 512, 520, 30, 460, [
    [0, 'rgba(255, 255, 240, 0.95)'],
    [1, 'rgba(255, 240, 180, 0)'],
  ]);
  sea(ctx, 640);
}

function duelArt(ctx: CanvasRenderingContext2D, deviceSize: number): void {
  const ground = island(ctx, 516, 752, 310, 98, 46);
  heroTower(ctx, deviceSize, ground, 716, 770, 3.2, { tones: ENEMY, level: 1, flagScale: 1.4 }, 14);
  heroTower(ctx, deviceSize, ground, 352, 806, 3.8, { tones: PLAYER, level: 3, flagScale: 1.5 });
  clashStar(ctx, 528, 600, 96, 9, 0.1);
}

const BACKGROUNDS: Record<AppIconVariant, (ctx: CanvasRenderingContext2D) => void> = {
  sunburst: sunburstBackground,
  island: islandBackground,
  duel: duelBackground,
};

const ARTS: Record<AppIconVariant, (ctx: CanvasRenderingContext2D, deviceSize: number) => void> = {
  sunburst: sunburstArt,
  island: islandArt,
  duel: duelArt,
};

/** Dominant colour of each variant's field (Android `ic_launcher_background` colour resource). */
export const APP_ICON_FIELD: Record<AppIconVariant, string> = {
  sunburst: '#ff9a1e',
  island: '#2fb4f0',
  duel: '#ffb347',
};
