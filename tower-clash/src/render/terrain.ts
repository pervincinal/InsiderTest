import { C } from '../sim/constants';
import { HUD } from './layout';
import type { Biome, BiomeColors, Palette, TerrainTheme, Tones } from './palette';
import { shade, themeFor, themedBiome, withAlpha } from './palette';
import type { View } from './view';

/*
 * Ground layer (ART_DIRECTION §3 "island"), rendered once per (level, palette, canvas resolution)
 * into an offscreen canvas: water gradient, the island's soft blue drop shadow and foam line, a
 * three-band cliff bevel under a rounded plateau whose edge is lit from the upper-left, sun
 * patches, biome decorations and the roads. `drawTerrainOverlay` adds the only animated part —
 * two or three drifting cloud shadows and water sparkles — cheaply every frame.
 */

export interface TerrainRoad {
  points: { x: number; y: number }[];
  kind: 'road' | 'bridge';
}

export interface TerrainSpec {
  /** Cache key, e.g. `level:9` or `title`. */
  key: string;
  /** Seed for the deterministic decoration scatter. */
  seed: number;
  roads: TerrainRoad[];
  towers: { x: number; y: number }[];
  /** Vertical band the plateau should cover (defaults to the play area). */
  top?: number;
  bottom?: number;
  /** Level band look (defaults to grass). */
  biome?: Biome;
  /** Equipped terrain theme (`THEME_IDS` in palette.ts); undefined / unknown = untinted. */
  theme?: string;
}

interface CacheEntry {
  canvas: HTMLCanvasElement;
  pxW: number;
  pxH: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHED = 4;

/** Plateau extrusion: how far the cliff shows below the grass edge. */
export const CLIFF_DEPTH = 30;

/** Key light direction (upper-left, §1), unit vector pointing *toward* the light. */
const LIGHT_X = -0.62;
const LIGHT_Y = -0.78;
/** Ground shadow offset per unit of object height (long, to the lower-right). */
export const SHADOW_DX = 0.72;
export const SHADOW_DY = 0.4;

type Pt = { x: number; y: number };

/** Tiny deterministic generator (mulberry32) so decorations never depend on the sim RNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function distToRoads(spec: TerrainSpec, x: number, y: number): number {
  let best = Infinity;
  for (const road of spec.roads) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1]!;
      const b = road.points[i]!;
      best = Math.min(best, segDist(x, y, a.x, a.y, b.x, b.y));
    }
  }
  return best;
}

function distToTowers(spec: TerrainSpec, x: number, y: number): number {
  let best = Infinity;
  for (const t of spec.towers) best = Math.min(best, Math.hypot(t.x - x, t.y - y));
  return best;
}

/** Wobbly rounded-rectangle outline of the plateau (closed, smooth). */
function plateauPoints(seed: number, top: number, bottom: number): Pt[] {
  const rng = makeRng(seed * 7919 + 13);
  const x0 = 26;
  const x1 = C.MAP_W - 26;
  const y0 = top;
  const y1 = bottom;
  const rad = 110;
  const pts: Pt[] = [];
  const push = (x: number, y: number, nx: number, ny: number): void => {
    const j = (rng() - 0.5) * 16;
    pts.push({ x: x + nx * j, y: y + ny * j });
  };
  const stepLen = 44;
  for (let x = x0 + rad; x < x1 - rad; x += stepLen) push(x, y0, 0, 1);
  for (let a = -Math.PI / 2; a < 0; a += Math.PI / 8) push(x1 - rad + Math.cos(a) * rad, y0 + rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  for (let y = y0 + rad; y < y1 - rad; y += stepLen) push(x1, y, -1, 0);
  for (let a = 0; a < Math.PI / 2; a += Math.PI / 8) push(x1 - rad + Math.cos(a) * rad, y1 - rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  for (let x = x1 - rad; x > x0 + rad; x -= stepLen) push(x, y1, 0, -1);
  for (let a = Math.PI / 2; a < Math.PI; a += Math.PI / 8) push(x0 + rad + Math.cos(a) * rad, y1 - rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  for (let y = y1 - rad; y > y0 + rad; y -= stepLen) push(x0, y, 1, 0);
  for (let a = Math.PI; a < Math.PI * 1.5; a += Math.PI / 8) push(x0 + rad + Math.cos(a) * rad, y0 + rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  return pts;
}

function smoothClosedPath(ctx: CanvasRenderingContext2D, pts: Pt[], dx = 0, dy = 0): void {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const mx = (p.x + q.x) / 2 + dx;
    const my = (p.y + q.y) / 2 + dy;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p.x + dx, p.y + dy, mx, my);
  }
  const p0 = pts[0]!;
  const p1 = pts[1 % n]!;
  ctx.quadraticCurveTo(p0.x + dx, p0.y + dy, (p0.x + p1.x) / 2 + dx, (p0.y + p1.y) / 2 + dy);
  ctx.closePath();
}

/**
 * Directional bevel: stroke each smoothed segment of the outline in the lit, mid or shade colour
 * depending on how its outward normal faces the key light. Call inside a clip to the outline so
 * only the inner half of the stroke shows.
 */
function strokeBevel(ctx: CanvasRenderingContext2D, pts: Pt[], tones: Tones, width: number): void {
  const n = pts.length;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  // outward normal: the outline runs clockwise (top edge left→right), so outward = (dy, -dx)
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    const c = pts[(i + 2) % n]!;
    const m0x = (a.x + b.x) / 2;
    const m0y = (a.y + b.y) / 2;
    const m1x = (b.x + c.x) / 2;
    const m1y = (b.y + c.y) / 2;
    const tx = m1x - m0x;
    const ty = m1y - m0y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = ty / len;
    const ny = -tx / len;
    const facing = nx * LIGHT_X + ny * LIGHT_Y;
    if (facing > 0.25) ctx.strokeStyle = tones.lit;
    else if (facing < -0.3) ctx.strokeStyle = tones.shade;
    else continue;
    ctx.beginPath();
    ctx.moveTo(m0x, m0y);
    ctx.quadraticCurveTo(b.x, b.y, m1x, m1y);
    ctx.stroke();
  }
}

function drawWater(ctx: CanvasRenderingContext2D, pal: Palette, rng: () => number, theme: TerrainTheme): void {
  const g = ctx.createLinearGradient(0, 0, 0, C.MAP_H);
  g.addColorStop(0, theme.waterTop);
  g.addColorStop(1, theme.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  // gentle wave bands, faint
  ctx.strokeStyle = theme.tintAmount > 0 ? shade(theme.waterBottom, 0.35) : pal.waterLight;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 4;
  for (let band = 0; band < 14; band++) {
    const y = 40 + band * 92 + rng() * 30;
    const amp = 3 + rng() * 4;
    const len = 70 + rng() * 40;
    ctx.beginPath();
    for (let x = -20; x <= C.MAP_W + 20; x += 8) {
      const yy = y + Math.sin((x / len) * Math.PI * 2) * amp;
      if (x === -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Long soft blue-tinted ground shadow of a roundish object of radius r and height h. */
function propShadow(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, h: number): void {
  ctx.fillStyle = pal.objectShadow;
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 2, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
  ctx.ellipse(x + h * SHADOW_DX, y + h * SHADOW_DY, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBush(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, s: number): void {
  propShadow(ctx, pal, x, y + s * 0.5, s * 1.1, s * 1.4);
  const lobes: [number, number, number][] = [
    [-s * 0.55, s * 0.1, s * 0.7],
    [s * 0.5, s * 0.15, s * 0.65],
    [0, -s * 0.25, s * 0.8],
  ];
  // shade (offset lower-right), mid, lit facet, rim
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  for (const [lx, ly, lr] of lobes) {
    ctx.moveTo(x + lx + lr + 2, y + ly + 3);
    ctx.arc(x + lx + 2, y + ly + 3, lr, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  for (const [lx, ly, lr] of lobes) {
    ctx.moveTo(x + lx + lr, y + ly);
    ctx.arc(x + lx, y + ly, lr, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.arc(x - s * 0.25, y - s * 0.5, s * 0.42, 0, Math.PI * 2);
  ctx.arc(x - s * 0.75, y - s * 0.1, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(tones.lit, 0.7);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.25, s * 0.8, Math.PI * 1.05, Math.PI * 1.55);
  ctx.stroke();
}

function drawPine(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, s: number): void {
  propShadow(ctx, pal, x, y, s * 0.8, s * 2.6);
  const tiers = 3;
  for (let i = tiers - 1; i >= 0; i--) {
    const w = s * (0.6 + i * 0.35);
    const base = y - i * s * 0.75;
    const apex = base - s * 1.2;
    ctx.fillStyle = tones.shade;
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x + w, base);
    ctx.lineTo(x - w, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tones.mid;
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x + w * 0.2, base);
    ctx.lineTo(x - w, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tones.lit;
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x - w * 0.55, base);
    ctx.lineTo(x - w, base);
    ctx.closePath();
    ctx.fill();
    // snow cap
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x + w * 0.3, apex + s * 0.45);
    ctx.lineTo(x - w * 0.3, apex + s * 0.45);
    ctx.closePath();
    ctx.fill();
  }
}

function drawCactus(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, s: number): void {
  propShadow(ctx, pal, x, y, s * 0.6, s * 2.4);
  const capsule = (cx: number, top: number, bottom: number, r: number): void => {
    ctx.beginPath();
    ctx.moveTo(cx - r, top);
    ctx.arc(cx, top, r, Math.PI, 0);
    ctx.lineTo(cx + r, bottom);
    ctx.arc(cx, bottom, r, 0, Math.PI);
    ctx.closePath();
  };
  ctx.fillStyle = tones.shade;
  capsule(x + 2, y - s * 2 + 2, y - s * 0.4, s * 0.5);
  ctx.fill();
  ctx.fillStyle = tones.mid;
  capsule(x, y - s * 2, y - s * 0.4, s * 0.5);
  ctx.fill();
  capsule(x - s * 0.85, y - s * 1.5, y - s * 1.1, s * 0.3);
  ctx.fill();
  ctx.fillStyle = tones.lit;
  capsule(x - s * 0.22, y - s * 1.95, y - s * 0.6, s * 0.16);
  ctx.fill();
}

function drawRock(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, s: number, rng: () => number, dark: boolean): void {
  propShadow(ctx, pal, x, y + s * 0.3, s, s * 0.9);
  const tones: Tones = dark ? { lit: '#8a7f8c', mid: '#5c5361', shade: '#3a333f' } : { lit: '#f2ede2', mid: pal.rock, shade: pal.rockDark };
  const n = 6;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = s * (0.8 + rng() * 0.3);
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.75 });
  }
  const trace = (): void => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };
  trace();
  ctx.fillStyle = tones.mid;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x - s * 1.5, y + s * 0.1, s * 3, s);
  ctx.fillRect(x + s * 0.35, y - s, s, s * 2);
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.ellipse(x - s * 0.35, y - s * 0.4, s * 0.5, s * 0.28, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawDots(ctx: CanvasRenderingContext2D, colors: readonly string[], x: number, y: number, rng: () => number): void {
  for (let i = 0; i < 4; i++) {
    const px = x + (rng() - 0.5) * 30;
    const py = y + (rng() - 0.5) * 22;
    ctx.fillStyle = 'rgba(26,58,90,0.14)';
    ctx.beginPath();
    ctx.arc(px + 1.5, py + 1.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Cream path with a soft darker edge and a faint lit centre line. Also used by the title backdrop. */
export function drawPath(ctx: CanvasRenderingContext2D, pal: Palette, points: Pt[], colors?: BiomeColors['path']): void {
  if (points.length < 2) return;
  const col = colors ?? { lit: pal.pathLit, shade: pal.pathShade };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  // soft shadow on the lower-right edge
  ctx.strokeStyle = pal.groundShadow;
  ctx.lineWidth = 32;
  ctx.save();
  ctx.translate(2, 3);
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = col.shade;
  ctx.lineWidth = 30;
  ctx.stroke();
  ctx.strokeStyle = col.lit;
  ctx.lineWidth = 22;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 250, 240, 0.32)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function render(ctx: CanvasRenderingContext2D, pal: Palette, spec: TerrainSpec): void {
  const rng = makeRng(spec.seed * 104729 + 7);
  const top = spec.top ?? HUD.mapTop + 12;
  const bottom = spec.bottom ?? HUD.mapBottom + 18;
  const theme = themeFor(spec.theme);
  const biome = themedBiome(pal.biomes[spec.biome ?? 'grass'], theme, spec.biome ?? 'grass');
  const grass = biome.grass;
  drawWater(ctx, pal, rng, theme);

  const outline = plateauPoints(spec.seed, top, bottom);

  // soft drop shadow on the water (stacked, growing, fading)
  ctx.fillStyle = pal.groundShadow;
  for (const [dx, dy, a] of [
    [10, 34, 0.5],
    [16, 42, 0.35],
    [24, 52, 0.22],
  ] as const) {
    ctx.globalAlpha = a;
    smoothClosedPath(ctx, outline, dx, dy);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // foam hugging the whole coast: drawn under the island so only the outer half of each stroke shows
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.foam;
  for (const [dy, w, a] of [
    [CLIFF_DEPTH, 16, 0.5],
    [CLIFF_DEPTH, 6, 1],
    [0, 14, 0.5],
    [0, 5, 1],
  ] as const) {
    smoothClosedPath(ctx, outline, 0, dy);
    ctx.lineWidth = w;
    ctx.globalAlpha = a;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // three-band cliff bevel: dark under-cliff, mid cliff, lit cliff top
  smoothClosedPath(ctx, outline, 0, CLIFF_DEPTH);
  ctx.fillStyle = shade(biome.cliff.shade, -0.28);
  ctx.fill();
  smoothClosedPath(ctx, outline, 0, CLIFF_DEPTH * 0.66);
  ctx.fillStyle = biome.cliff.shade;
  ctx.fill();
  smoothClosedPath(ctx, outline, 0, CLIFF_DEPTH * 0.3);
  ctx.fillStyle = biome.cliff.lit;
  ctx.fill();
  // dark grass lip over the cliff
  smoothClosedPath(ctx, outline, 0, 4);
  ctx.fillStyle = grass.shade;
  ctx.fill();
  // plateau
  smoothClosedPath(ctx, outline, 0, 0);
  ctx.fillStyle = grass.mid;
  ctx.fill();

  // everything else stays inside the plateau
  ctx.save();
  smoothClosedPath(ctx, outline, 0, 0);
  ctx.clip();

  // sun patches: soft lighter pools, edges broken by a second smaller ellipse
  ctx.fillStyle = grass.lit;
  for (let i = 0; i < 6; i++) {
    const x = 40 + rng() * (C.MAP_W - 80);
    const y = top + rng() * (bottom - top);
    const rx = 70 + rng() * 90;
    const ryy = 34 + rng() * 40;
    const rot = rng() * Math.PI;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * 1.25, ryy * 1.25, rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ryy, rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // directional edge bevel (lit upper-left, shaded lower-right), inner half visible
  strokeBevel(ctx, outline, grass, 9);

  // paths
  for (const road of spec.roads) if (road.kind === 'road') drawPath(ctx, pal, road.points, biome.path);

  // decorations: keep off paths and towers
  const place = (minRoad: number, minTower: number): Pt | null => {
    for (let tries = 0; tries < 24; tries++) {
      const x = 60 + rng() * (C.MAP_W - 120);
      const y = top + 40 + rng() * (bottom - top - 80);
      if (distToRoads(spec, x, y) < minRoad || distToTowers(spec, x, y) < minTower) continue;
      return { x, y };
    }
    return null;
  };
  const kind = spec.biome ?? 'grass';
  const clumps = kind === 'sand' ? 7 : kind === 'volcanic' ? 6 : 10;
  const items: { p: Pt; s: number; f: (p: Pt, s: number) => void }[] = [];
  for (let i = 0; i < clumps; i++) {
    const p = place(44, 100);
    if (!p) continue;
    const s = 12 + rng() * 7;
    const alt = rng() < 0.35;
    const f = (q: Pt, ss: number): void => {
      if (kind === 'snow') drawPine(ctx, pal, biome.bush, q.x, q.y, ss);
      else if (kind === 'sand') drawCactus(ctx, pal, biome.bush, q.x, q.y, ss * 0.9);
      else if (kind === 'volcanic') drawRock(ctx, pal, q.x, q.y, ss, rng, true);
      else drawBush(ctx, pal, kind === 'autumn' && alt ? pal.biomes.grass.bush : biome.bush, q.x, q.y, ss);
    };
    items.push({ p, s, f });
  }
  for (let i = 0; i < 3; i++) {
    const p = place(40, 92);
    if (p) items.push({ p, s: 11 + rng() * 8, f: (q, ss) => drawRock(ctx, pal, q.x, q.y, ss, rng, kind === 'volcanic') });
  }
  items.sort((a, b) => a.p.y - b.p.y);
  for (const it of items) it.f(it.p, it.s);
  for (let i = 0; i < 5; i++) {
    const p = place(30, 84);
    if (p) drawDots(ctx, biome.dots, p.x, p.y, rng);
  }
  ctx.restore();
}

/**
 * The cached ground image for `spec` at the current canvas resolution. Re-rendered when the
 * level, palette or device pixel size changes (rotation / resize).
 */
export function getTerrain(view: View, pal: Palette, spec: TerrainSpec): HTMLCanvasElement {
  const s = view.dpr * view.scale;
  const pxW = Math.max(1, Math.ceil(C.MAP_W * s));
  const pxH = Math.max(1, Math.ceil(C.MAP_H * s));
  const key = `${spec.key}|${spec.biome ?? 'grass'}|${themeFor(spec.theme).id}|${pal.owners.enemy1}|${pxW}x${pxH}`;
  const hit = cache.get(key);
  if (hit) return hit.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(pxW / C.MAP_W, 0, 0, pxH / C.MAP_H, 0, 0);
    render(ctx, pal, spec);
  }
  if (cache.size >= MAX_CACHED) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { canvas, pxW, pxH });
  return canvas;
}

/** Blit the cached ground onto the logical map (call with the logical transform active). */
export function drawTerrain(ctx: CanvasRenderingContext2D, view: View, pal: Palette, spec: TerrainSpec): void {
  const img = getTerrain(view, pal, spec);
  ctx.drawImage(img, 0, 0, C.MAP_W, C.MAP_H);
}

/* ---------- animated layer: cloud shadows + water sparkles ---------- */

interface Cloud {
  y: number;
  x0: number;
  speed: number;
  lobes: { dx: number; dy: number; rx: number; ry: number }[];
}

interface Sparkle {
  x: number;
  y: number;
  len: number;
  phase: number;
}

interface Ambient {
  clouds: Cloud[];
  sparkles: Sparkle[];
  /** Specks over the plateau, only drawn for themes with `glow` (`TerrainTheme.drawGlow`). */
  specks: Sparkle[];
}

const ambientCache = new Map<string, Ambient>();

function ambientFor(spec: TerrainSpec): Ambient {
  const hit = ambientCache.get(spec.key);
  if (hit) return hit;
  const rng = makeRng(spec.seed * 31337 + 99);
  const top = spec.top ?? HUD.mapTop + 12;
  const bottom = spec.bottom ?? HUD.mapBottom + 18;
  const clouds: Cloud[] = [];
  for (let i = 0; i < 3; i++) {
    const lobes: Cloud['lobes'] = [];
    const n = 3 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      lobes.push({ dx: (k - (n - 1) / 2) * 70 + (rng() - 0.5) * 30, dy: (rng() - 0.5) * 40, rx: 70 + rng() * 60, ry: 40 + rng() * 30 });
    }
    clouds.push({ y: top + 80 + ((i + rng() * 0.6) / 3) * (bottom - top - 160), x0: rng() * (C.MAP_W + 500), speed: 7 + rng() * 5, lobes });
  }
  const sparkles: Sparkle[] = [];
  const waterAt = (x: number, y: number): boolean => y < top - 12 || y > bottom + CLIFF_DEPTH + 16 || x < 18 || x > C.MAP_W - 18;
  let guard = 0;
  while (sparkles.length < 30 && guard++ < 400) {
    const x = rng() * C.MAP_W;
    const y = rng() * C.MAP_H;
    if (!waterAt(x, y)) continue;
    sparkles.push({ x, y, len: 5 + rng() * 9, phase: rng() * Math.PI * 2 });
  }
  const specks: Sparkle[] = [];
  for (let i = 0; i < 26; i++) {
    specks.push({ x: 40 + rng() * (C.MAP_W - 80), y: top + 30 + rng() * (bottom - top - 60), len: 1.6 + rng() * 1.4, phase: rng() * Math.PI * 2 });
  }
  const out = { clouds, sparkles, specks };
  ambientCache.set(spec.key, out);
  return out;
}

/**
 * Drifting cloud shadows and twinkling water sparkles over the cached ground. Cheap (≈ 40
 * primitives), no gradients. With `motion` false everything stays put but still draws.
 */
export function drawTerrainOverlay(ctx: CanvasRenderingContext2D, pal: Palette, spec: TerrainSpec, nowMs: number, motion: boolean): void {
  const amb = ambientFor(spec);
  const theme = themeFor(spec.theme);
  const t = motion ? nowMs / 1000 : 0;
  if (theme.ambient) {
    // theme wash over the cached ground only: buildings, units and badges stay untinted
    ctx.fillStyle = theme.ambient;
    ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  }
  ctx.fillStyle = theme.waterSparkle;
  for (let i = 0; i < amb.sparkles.length; i++) {
    const s = amb.sparkles[i]!;
    const tw = 0.5 + 0.5 * Math.sin(t * 1.6 + s.phase);
    if (tw < 0.15) continue;
    ctx.globalAlpha = tw;
    const x = ((s.x + t * 6 + i * 0.1) % (C.MAP_W + 20)) - 10;
    ctx.fillRect(x - s.len / 2, s.y, s.len, 2.5);
  }
  if (theme.drawGlow) theme.drawGlow(ctx, amb.specks, t); // fireflies / snow motes / neon dust (theme chunk)
  ctx.globalAlpha = theme.cloudAlpha;
  ctx.fillStyle = pal.groundShadow;
  const span = C.MAP_W + 560;
  for (const c of amb.clouds) {
    const x = ((c.x0 + t * c.speed) % span) - 280;
    ctx.beginPath();
    for (const l of c.lobes) {
      ctx.moveTo(x + l.dx + l.rx, c.y + l.dy);
      ctx.ellipse(x + l.dx, c.y + l.dy, l.rx, l.ry, 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
