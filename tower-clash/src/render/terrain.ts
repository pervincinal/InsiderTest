import { C } from '../sim/constants';
import { HUD } from './layout';
import type { Palette } from './palette';
import type { View } from './view';

/*
 * Static ground layer, rendered once per (level, palette, canvas resolution) into an offscreen
 * canvas: water with wave bands, a grassy plateau with a beige cliff under its bottom edge,
 * lighter grass patches, bushes, rocks and flowers scattered deterministically from the level id,
 * and the sandy paths. Everything dynamic (bridges, hazards, towers, units) is drawn per frame on
 * top by draw.ts.
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

/** Tiny deterministic generator (mulberry32) so decorations never depend on the sim RNG. */
function makeRng(seed: number): () => number {
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
function plateauPoints(seed: number, top: number, bottom: number): { x: number; y: number }[] {
  const rng = makeRng(seed * 7919 + 13);
  const x0 = 26;
  const x1 = C.MAP_W - 26;
  const y0 = top;
  const y1 = bottom;
  const rad = 96;
  const pts: { x: number; y: number }[] = [];
  const push = (x: number, y: number, nx: number, ny: number): void => {
    const j = (rng() - 0.5) * 18;
    pts.push({ x: x + nx * j, y: y + ny * j });
  };
  const stepLen = 44;
  // top edge
  for (let x = x0 + rad; x < x1 - rad; x += stepLen) push(x, y0, 0, 1);
  // top-right corner
  for (let a = -Math.PI / 2; a < 0; a += Math.PI / 8) push(x1 - rad + Math.cos(a) * rad, y0 + rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  for (let y = y0 + rad; y < y1 - rad; y += stepLen) push(x1, y, -1, 0);
  for (let a = 0; a < Math.PI / 2; a += Math.PI / 8) push(x1 - rad + Math.cos(a) * rad, y1 - rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  for (let x = x1 - rad; x > x0 + rad; x -= stepLen) push(x, y1, 0, -1);
  for (let a = Math.PI / 2; a < Math.PI; a += Math.PI / 8) push(x0 + rad + Math.cos(a) * rad, y1 - rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  for (let y = y1 - rad; y > y0 + rad; y -= stepLen) push(x0, y, 1, 0);
  for (let a = Math.PI; a < Math.PI * 1.5; a += Math.PI / 8) push(x0 + rad + Math.cos(a) * rad, y0 + rad + Math.sin(a) * rad, -Math.cos(a), -Math.sin(a));
  return pts;
}

function smoothClosedPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], dy = 0): void {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2 + dy;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(p.x, p.y + dy, mx, my);
  }
  const p0 = pts[0]!;
  const p1 = pts[1 % n]!;
  ctx.quadraticCurveTo(p0.x, p0.y + dy, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + dy);
  ctx.closePath();
}

function drawWater(ctx: CanvasRenderingContext2D, pal: Palette, rng: () => number): void {
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  // gentle wave bands
  ctx.strokeStyle = pal.waterLight;
  ctx.lineCap = 'round';
  for (let band = 0; band < 14; band++) {
    const y = 40 + band * 92 + rng() * 30;
    const amp = 4 + rng() * 4;
    const len = 60 + rng() * 40;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = -20; x <= C.MAP_W + 20; x += 8) {
      const yy = y + Math.sin((x / len) * Math.PI * 2) * amp;
      if (x === -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // sparkles
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 26; i++) {
    const x = rng() * C.MAP_W;
    const y = rng() * C.MAP_H;
    ctx.fillRect(x, y, 8 + rng() * 10, 3);
  }
  ctx.globalAlpha = 1;
}

function drawBush(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(25,45,70,0.16)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + s * 0.55, s * 1.25, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.bush;
  ctx.beginPath();
  ctx.arc(x - s * 0.55, y + s * 0.1, s * 0.7, 0, Math.PI * 2);
  ctx.arc(x + s * 0.5, y + s * 0.15, s * 0.65, 0, Math.PI * 2);
  ctx.arc(x, y - s * 0.25, s * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.bushLight;
  ctx.beginPath();
  ctx.arc(x - s * 0.2, y - s * 0.45, s * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

function drawRock(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, s: number, rng: () => number): void {
  ctx.fillStyle = 'rgba(25,45,70,0.16)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + s * 0.45, s * 1.15, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  const n = 6;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = s * (0.8 + rng() * 0.3);
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.75 });
  }
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = pal.rock;
  ctx.fill();
  // darker lower half
  ctx.save();
  ctx.clip();
  ctx.fillStyle = pal.rockDark;
  ctx.fillRect(x - s * 1.5, y + s * 0.15, s * 3, s);
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = pal.rockDark;
  ctx.stroke();
}

function drawFlowers(ctx: CanvasRenderingContext2D, x: number, y: number, rng: () => number): void {
  const colors = ['#ffffff', '#ffe066', '#ff8fa3'];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = colors[i % colors.length]!;
    ctx.beginPath();
    ctx.arc(x + (rng() - 0.5) * 30, y + (rng() - 0.5) * 22, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Sandy path with a darker edge and rounded ends. Used for the cache and the title backdrop. */
export function drawPath(ctx: CanvasRenderingContext2D, pal: Palette, points: { x: number; y: number }[]): void {
  if (points.length < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = pal.roadDim;
  ctx.lineWidth = 30;
  ctx.stroke();
  ctx.strokeStyle = pal.road;
  ctx.lineWidth = 22;
  ctx.stroke();
}

function render(ctx: CanvasRenderingContext2D, pal: Palette, spec: TerrainSpec): void {
  const rng = makeRng(spec.seed * 104729 + 7);
  const top = spec.top ?? HUD.mapTop + 12;
  const bottom = spec.bottom ?? HUD.mapBottom + 18;
  drawWater(ctx, pal, rng);

  const outline = plateauPoints(spec.seed, top, bottom);
  // cliff (two bands) then the grass top
  smoothClosedPath(ctx, outline, CLIFF_DEPTH);
  ctx.fillStyle = pal.cliffDark;
  ctx.fill();
  smoothClosedPath(ctx, outline, CLIFF_DEPTH * 0.55);
  ctx.fillStyle = pal.cliff;
  ctx.fill();
  smoothClosedPath(ctx, outline, 0);
  ctx.fillStyle = pal.grass;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = pal.grassLight;
  ctx.stroke();

  // everything else stays inside the plateau
  ctx.save();
  smoothClosedPath(ctx, outline, 0);
  ctx.clip();

  // lighter patches
  ctx.fillStyle = pal.grassLight;
  for (let i = 0; i < 9; i++) {
    const x = 40 + rng() * (C.MAP_W - 80);
    const y = top + rng() * (bottom - top);
    ctx.beginPath();
    ctx.ellipse(x, y, 60 + rng() * 90, 30 + rng() * 40, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // paths
  for (const road of spec.roads) if (road.kind === 'road') drawPath(ctx, pal, road.points);

  // decorations: keep off paths and towers
  const place = (minRoad: number, minTower: number): { x: number; y: number } | null => {
    for (let tries = 0; tries < 24; tries++) {
      const x = 60 + rng() * (C.MAP_W - 120);
      const y = top + 40 + rng() * (bottom - top - 80);
      if (distToRoads(spec, x, y) < minRoad || distToTowers(spec, x, y) < minTower) continue;
      return { x, y };
    }
    return null;
  };
  for (let i = 0; i < 11; i++) {
    const p = place(42, 96);
    if (p) drawBush(ctx, pal, p.x, p.y, 12 + rng() * 8);
  }
  for (let i = 0; i < 3; i++) {
    const p = place(38, 90);
    if (p) drawRock(ctx, pal, p.x, p.y, 12 + rng() * 8, rng);
  }
  for (let i = 0; i < 5; i++) {
    const p = place(30, 80);
    if (p) drawFlowers(ctx, p.x, p.y, rng);
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
  const key = `${spec.key}|${pal.owners.enemy1}|${pxW}x${pxH}`;
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
