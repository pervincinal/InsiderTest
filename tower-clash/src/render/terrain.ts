import { C } from '../sim/constants';
import { HUD } from './layout';
import type { Biome, GroundLight, Palette, TerrainTheme, Tones } from './palette';
import { BIOME_LIGHT, shade, themeFor, themedBiome, withAlpha } from './palette';
import type { View } from './view';
import type { Camera } from './camera';
import { FLAT, depth, horizonY, jacY, proj, projY, unprojY } from './camera';
import { hazeColour, paintHaze } from './sea';

/*
 * Ground layer (ART_DIRECTION §3 "island"), rendered once per (level, palette, canvas resolution)
 * into an offscreen canvas: water gradient, the island's soft blue drop shadow and foam line, a
 * three-band cliff bevel under a rounded plateau whose edge is lit from the upper-left, sun
 * patches, biome decorations, the level's obstacles (rules v3 §2.0b: stone walls, rivers,
 * boulders — there are no roads any more, every clear pair of towers is a lane) and its mines
 * (a spent mine leaves a crater; `TerrainSpec.variant` re-keys the cache when one is spent).
 * `drawTerrainOverlay` adds the only animated part — two or three drifting cloud shadows and
 * water sparkles — cheaply every frame.
 */

export type TerrainObstacleKind = 'wall' | 'water' | 'rock';

/** An obstacle as the sim stores it (`state.obstacles`): a polyline (or a single point for a rock) with a thickness. */
export interface TerrainObstacle {
  kind: TerrainObstacleKind;
  points: { x: number; y: number }[];
  width: number;
}

/** A mine point (`state.mines[i]`); `charges` 0 = spent → crater. */
export interface TerrainMine {
  x: number;
  y: number;
  charges: number;
}

export interface TerrainSpec {
  /** Level identity, e.g. `level:9` or `title` (also keys the ambient clouds / sparkles). */
  key: string;
  /** Extra cache discriminator for state that changes the ground mid-match (spent mines). */
  variant?: string;
  /** Seed for the deterministic decoration scatter. */
  seed: number;
  obstacles: TerrainObstacle[];
  mines: TerrainMine[];
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

/**
 * Where `render` draws (ART-21). Flat map: everything on the one canvas. Tilted camera: `render`'s
 * ctx is a map-space canvas of the ground (warped into the cache afterwards, "mode 7"), `sea` is the
 * cache in the logical frame (sea gradient, horizon haze, distant islets — under the warped ground)
 * and `up` draws a standing prop upright and depth-scaled at its projected anchor on a props canvas
 * laid over the warped ground.
 */
interface Stage {
  cam: Camera;
  sea: CanvasRenderingContext2D;
  up(x: number, y: number, draw: (c: CanvasRenderingContext2D) => void): void;
}

function flatStage(ctx: CanvasRenderingContext2D): Stage {
  return { cam: FLAT, sea: ctx, up: (_x, _y, draw) => draw(ctx) };
}

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

/** Distance from a point to the nearest obstacle *edge* (polyline distance minus half its width) or mine. */
function distToObstacles(spec: TerrainSpec, x: number, y: number): number {
  let best = Infinity;
  for (const ob of spec.obstacles) {
    const pts = ob.points;
    if (pts.length === 0) continue;
    let d = Infinity;
    if (pts.length === 1) d = Math.hypot(pts[0]!.x - x, pts[0]!.y - y);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      d = Math.min(d, segDist(x, y, a.x, a.y, b.x, b.y));
    }
    best = Math.min(best, d - ob.width / 2);
  }
  for (const m of spec.mines) best = Math.min(best, Math.hypot(m.x - x, m.y - y) - 18);
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
function strokeBevel(ctx: CanvasRenderingContext2D, pts: Pt[], tones: Tones, width: number, batched = false): void {
  const n = pts.length;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  if (batched && typeof Path2D === 'function') {
    // BUG-40: one path per tone (two strokes instead of ~60 — 13 ms of a 4×-throttled tilted build);
    // only where a lit run meets a shaded one does the other tone's round cap now sit on top
    const lit = new Path2D();
    const dark = new Path2D();
    for (let i = 0; i < n; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % n]!;
      const c = pts[(i + 2) % n]!;
      const m0x = (a.x + b.x) / 2;
      const m0y = (a.y + b.y) / 2;
      const m1x = (b.x + c.x) / 2;
      const m1y = (b.y + c.y) / 2;
      const len = Math.hypot(m1x - m0x, m1y - m0y) || 1;
      const facing = ((m1y - m0y) / len) * LIGHT_X - ((m1x - m0x) / len) * LIGHT_Y;
      const path = facing > 0.25 ? lit : facing < -0.3 ? dark : null;
      if (!path) continue;
      path.moveTo(m0x, m0y);
      path.quadraticCurveTo(b.x, b.y, m1x, m1y);
    }
    ctx.strokeStyle = tones.lit;
    ctx.stroke(lit);
    ctx.strokeStyle = tones.shade;
    ctx.stroke(dark);
    return;
  }
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

/**
 * The sea under the island. Tilted camera (ART-21): the gradient and the horizon haze go on the
 * logical-frame cache (`stage.sea`) exactly like sea.ts paints the full-bleed margins (no seam at the
 * map edge); the wave bands lie on the map-space water and are warped with it (closer together in
 * the distance), none in the hazy distance.
 */
function drawWater(ctx: CanvasRenderingContext2D, pal: Palette, rng: () => number, theme: TerrainTheme, stage: Stage): void {
  const cam = stage.cam;
  const sea = cam.flat ? ctx : stage.sea;
  const g = sea.createLinearGradient(0, 0, 0, C.MAP_H);
  g.addColorStop(0, theme.waterTop);
  g.addColorStop(1, theme.waterBottom);
  sea.fillStyle = g;
  sea.fillRect(0, 0, C.MAP_W, C.MAP_H);
  const horizon = horizonY(cam);
  if (horizon !== undefined) paintHaze(sea, theme.waterTop, horizon, 0, 0, C.MAP_W);
  // gentle wave bands, faint. Tilted camera: drawn straight onto the cache through the camera (the
  // map-space canvas only holds the island, BUG-40), across the screen width at their depth
  const out = cam.flat ? ctx : sea;
  out.strokeStyle = theme.tintAmount > 0 ? shade(theme.waterBottom, 0.35) : pal.waterLight;
  out.lineCap = 'round';
  out.globalAlpha = 0.28;
  out.lineWidth = 4;
  for (let band = 0; band < 14; band++) {
    const y = 40 + band * 92 + rng() * 30;
    const amp = 3 + rng() * 4;
    const len = 70 + rng() * 40;
    if (horizon !== undefined && projY(cam, y) < horizon) continue; // calm, hazy distance (rng already drawn)
    out.beginPath();
    if (cam.flat) {
      for (let x = -20; x <= C.MAP_W + 20; x += 8) {
        const yy = y + Math.sin((x / len) * Math.PI * 2) * amp;
        if (x === -20) out.moveTo(x, yy);
        else out.lineTo(x, yy);
      }
    } else {
      const d = depth(cam, y);
      const xa = Math.floor(cam.cx - (cam.cx + 20) / d);
      const xb = cam.cx + (C.MAP_W - cam.cx + 20) / d;
      out.lineWidth = 4 * d;
      for (let x = xa; x <= xb; x += 8) {
        const p = proj(cam, x, y + Math.sin((x / len) * Math.PI * 2) * amp);
        if (x === xa) out.moveTo(p.x, p.y);
        else out.lineTo(p.x, p.y);
      }
    }
    out.stroke();
  }
  out.globalAlpha = 1;
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

function drawRock(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, s: number, rng: () => number, dark: boolean, squash = 0.75): void {
  propShadow(ctx, pal, x, y + s * 0.3, s, s * 0.9);
  const tones: Tones = dark ? { lit: '#8a7f8c', mid: '#5c5361', shade: '#3a333f' } : { lit: '#f2ede2', mid: pal.rock, shade: pal.rockDark };
  const n = 6;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = s * (0.8 + rng() * 0.3);
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * squash });
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

/* ---------- obstacles (rules v3 §2.0b) ---------- */

function tracePolyline(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath();
  if (pts.length === 1) {
    // a lone point: zero-length segment so round caps make a disc of the stroke width
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    ctx.lineTo(pts[0]!.x + 0.01, pts[0]!.y);
    return;
  }
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
}

/** Unit tangent and the unit normal that faces the key light for one polyline segment. */
function segmentFrame(a: Pt, b: Pt): { tx: number; ty: number; nx: number; ny: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  let nx = ty;
  let ny = -tx;
  if (nx * LIGHT_X + ny * LIGHT_Y < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { tx, ty, nx, ny, len };
}

/** Visible height of a stone wall in screen logical px: a 4 px lip on the flat map, a standing block under the tilted camera. */
export function wallHeight(k: number): number {
  return 4 + (1 - k) * 50;
}

/** One path holding the polyline at every vertical offset from `from` to `to` (map units): stroked once, it is a solid extruded band. */
function traceExtruded(ctx: CanvasRenderingContext2D, pts: Pt[], from: number, to: number, step: number): void {
  ctx.beginPath();
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / step));
  for (let i = 0; i <= n; i++) {
    const d = from + ((to - from) * i) / n;
    if (pts.length === 1) {
      ctx.moveTo(pts[0]!.x, pts[0]!.y + d);
      ctx.lineTo(pts[0]!.x + 0.01, pts[0]!.y + d);
      continue;
    }
    pts.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y + d) : ctx.lineTo(p.x, p.y + d)));
  }
}

/**
 * Stone wall band of the obstacle's width: long ground shadow, ink contour, a shaded side face,
 * the lit top face, a darker cap line along the walkway and battlement merlons (7 × 6 px) on the
 * light-facing edge every 16 px. Reads at 360 px width (merlons ≈ 3 px). On the flat map the side
 * face is a 4 px lip under the top face; under the tilted camera (ART-21, drawn in the ground frame)
 * the wall stands `wallHeight` px tall: the top face is lifted, the front face below it is a darker
 * two-tone band with a mortar course, so the wall reads as a standing block.
 */
function drawWall(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, ob: TerrainObstacle, cam: Camera = FLAT): void {
  const pts = ob.points;
  if (pts.length === 0) return;
  const w = Math.max(10, ob.width);
  const k = cam.k;
  const height = wallHeight(k);
  // map units per screen px of height at the wall's depth, so it stands `height × depth` px on screen
  const ym = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const jy = cam.flat ? 1 : jacY(cam, ym) / depth(cam, ym);
  /** Top face offset and the side face's foot, in map units (the warp maps them to screen px). */
  const top = -(height - 4) / jy;
  const base = 4 / jy;
  const step = 1.5 / jy;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // ground shadow to the lower-right (longer for a taller wall; it lies on the ground, so map units)
  tracePolyline(ctx, pts);
  ctx.save();
  ctx.translate(4 + (height - 4) * SHADOW_DX, 8 + (height - 4) * SHADOW_DY);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = pal.groundShadow;
  ctx.lineWidth = w + 4;
  ctx.stroke();
  ctx.restore();
  // ink contour (so the wall reads on snow and sand), then the side face, then the top face
  traceExtruded(ctx, pts, base, k < 1 ? top : base, step);
  ctx.strokeStyle = withAlpha(pal.ink, 0.4);
  ctx.lineWidth = w + 3;
  ctx.stroke();
  ctx.strokeStyle = tones.shade;
  ctx.lineWidth = w;
  ctx.stroke();
  if (k < 1) {
    // front face: darker foot, one mortar course at mid height
    traceExtruded(ctx, pts, base, base + (top - base) * 0.4, step);
    ctx.strokeStyle = shade(tones.shade, -0.2);
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.save();
    ctx.translate(0, base + (top - base) * 0.55);
    tracePolyline(ctx, pts);
    ctx.strokeStyle = withAlpha(shade(tones.shade, -0.35), 0.8);
    ctx.lineWidth = w + 1;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
    ctx.restore();
    // the side face again over the course, leaving only a thin line at the bottom edge of the top face's shadow side
    ctx.save();
    ctx.translate(0, base + (top - base) * 0.55 - 1.2 / k);
    tracePolyline(ctx, pts);
    ctx.strokeStyle = tones.shade;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.translate(0, top);
  tracePolyline(ctx, pts);
  ctx.strokeStyle = tones.mid;
  ctx.lineWidth = w;
  ctx.stroke();
  // darker cap line along the walkway
  ctx.strokeStyle = withAlpha(shade(tones.shade, -0.25), 0.7);
  ctx.lineWidth = 2;
  ctx.stroke();
  // lit edge + merlons on the light-facing side, per segment
  const segs: [Pt, Pt][] = pts.length === 1 ? [[pts[0]!, { x: pts[0]!.x + 0.01, y: pts[0]!.y }]] : [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1]!, pts[i]!]);
  const half = w / 2;
  for (const [a, b] of segs) {
    const f = segmentFrame(a, b);
    ctx.strokeStyle = withAlpha(tones.lit, 0.85);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(a.x + f.nx * (half - 2), a.y + f.ny * (half - 2));
    ctx.lineTo(b.x + f.nx * (half - 2), b.y + f.ny * (half - 2));
    ctx.stroke();
    const pitch = 16;
    const count = Math.max(1, Math.floor(f.len / pitch));
    const start = (f.len - (count - 1) * pitch) / 2;
    const ang = Math.atan2(f.ty, f.tx);
    for (let m = 0; m < count; m++) {
      const d = start + m * pitch;
      const cx = a.x + f.tx * d + f.nx * (half - 1);
      const cy = a.y + f.ty * d + f.ny * (half - 1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      // the merlon sticks 4 px out past the top face on the lit side (local y of the normal after the rotation)
      const outward = f.ny * f.tx - f.nx * f.ty;
      const y0 = outward > 0 ? -1 : -5;
      ctx.fillStyle = tones.lit;
      ctx.fillRect(-3.5, y0, 7, 6);
      ctx.strokeStyle = withAlpha(pal.ink, 0.35);
      ctx.lineWidth = 1;
      ctx.strokeRect(-3.5, y0, 7, 6);
      ctx.restore();
    }
  }
  ctx.restore();
}

/**
 * River band: dark grass bank lip, pale wet rim, water body (theme water, lightened), a deeper
 * centre and a lighter wavy ripple line drawn slightly off-centre so the current reads.
 */
function drawRiver(ctx: CanvasRenderingContext2D, pal: Palette, theme: TerrainTheme, grass: Tones, ob: TerrainObstacle, rng: () => number): void {
  const pts = ob.points;
  if (pts.length === 0) return;
  const w = Math.max(10, ob.width);
  const body = shade(theme.waterBottom, 0.18);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  tracePolyline(ctx, pts);
  ctx.strokeStyle = grass.shade;
  ctx.lineWidth = w + 8;
  ctx.stroke();
  ctx.strokeStyle = shade(body, 0.5);
  ctx.lineWidth = w + 2;
  ctx.stroke();
  ctx.strokeStyle = body;
  ctx.lineWidth = w - 2;
  ctx.stroke();
  ctx.strokeStyle = theme.waterBottom;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(3, w * 0.45);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // ripple: a sine wobble along each segment, offset toward the shaded bank
  const ripple = theme.tintAmount > 0 ? theme.waterSparkle : pal.waterLight;
  ctx.strokeStyle = ripple;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  const segs: [Pt, Pt][] = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1]!, pts[i]!]);
  if (pts.length === 1) segs.push([pts[0]!, { x: pts[0]!.x + 0.01, y: pts[0]!.y }]);
  ctx.beginPath();
  for (const [a, b] of segs) {
    const f = segmentFrame(a, b);
    const off = -w * 0.14;
    const wave = 18 + rng() * 8;
    const amp = Math.min(3, w * 0.09);
    for (let d = 6; d <= f.len - 6; d += 4) {
      const s = Math.sin((d / wave) * Math.PI * 2) * amp + off;
      const x = a.x + f.tx * d + f.nx * s;
      const y = a.y + f.ty * d + f.ny * s;
      if (d === 6) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Boulder(s): a single point is one big rock of the obstacle's radius, a polyline a chain of them. */
function drawBoulders(ctx: CanvasRenderingContext2D, pal: Palette, ob: TerrainObstacle, rng: () => number, dark: boolean, stage: Stage): void {
  const pts = ob.points;
  if (pts.length === 0) return;
  const r = Math.max(8, ob.width / 2);
  const rocks: { x: number; y: number; s: number }[] = [];
  if (pts.length === 1) rocks.push({ x: pts[0]!.x, y: pts[0]!.y, s: r * 0.95 });
  else {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const f = segmentFrame(a, b);
      const step = r * 1.15;
      const n = Math.max(1, Math.round(f.len / step));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const d = (f.len * k) / n;
        const j = (rng() - 0.5) * r * 0.35;
        rocks.push({ x: a.x + f.tx * d + f.nx * j, y: a.y + f.ty * d + f.ny * j, s: r * (0.7 + rng() * 0.25) });
      }
    }
  }
  rocks.sort((p, q) => p.y - q.y);
  for (const k of rocks) stage.up(k.x, k.y, (c) => drawRock(c, pal, k.x, k.y, k.s, rng, dark, 0.85));
}

/** Mine body (the blinking lamp and the charge chip are dynamic: `draw.ts`). */
function drawMineBody(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number): void {
  ctx.fillStyle = pal.groundShadow;
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 6, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.metal.shade;
  ctx.beginPath();
  ctx.ellipse(x, y, 15, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.metal.mid;
  ctx.beginPath();
  ctx.ellipse(x, y - 3, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = pal.gold;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.ellipse(x, y - 3, 12, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Scorched crater where a mine went off. */
function drawCrater(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, rng: () => number): void {
  ctx.fillStyle = pal.groundShadow;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.ellipse(x, y, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal.contactShadow;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(pal.paper, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y - 1, 16, 8, 0, Math.PI * 1.05, Math.PI * 1.75);
  ctx.stroke();
  ctx.fillStyle = pal.ink;
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const d = 18 + rng() * 10;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.5, 1.5 + rng(), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawObstacles(ctx: CanvasRenderingContext2D, pal: Palette, theme: TerrainTheme, grass: Tones, wall: Tones, spec: TerrainSpec, rng: () => number, dark: boolean, stage: Stage): void {
  // rivers are ground: under everything; walls and boulders sorted by their lowest point
  for (const ob of spec.obstacles) if (ob.kind === 'water') drawRiver(ctx, pal, theme, grass, ob, rng);
  const solid = spec.obstacles.filter((ob) => ob.kind !== 'water');
  const low = (ob: TerrainObstacle): number => ob.points.reduce((m, p) => Math.max(m, p.y), -Infinity);
  solid.sort((p, q) => low(p) - low(q));
  for (const ob of solid) {
    if (ob.kind === 'wall') drawWall(ctx, pal, wall, ob, stage.cam);
    else drawBoulders(ctx, pal, ob, rng, dark, stage);
  }
}

/** `a` blended toward `b` by t (0..1), both `#rrggbb`; anything else returns `b`. */
function mixHex(a: string, b: string, t: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b;
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (sh: number): number => Math.round(((x >> sh) & 0xff) * (1 - t) + ((y >> sh) & 0xff) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/**
 * Tilted camera (ART-21): a few low islets out in the hazy distance above the island's far shore
 * (`far`, screen logical y), smaller and paler the farther up they sit, so the sea above the island
 * reads as a horizon and not as empty margin. Logical frame; own rng (the level scatter is untouched).
 */
function drawDistantIslets(ctx: CanvasRenderingContext2D, theme: TerrainTheme, grass: Tones, cliff: { shade: string }, seed: number, far: number): void {
  const rng = makeRng(seed * 3301 + 17);
  const haze = hazeColour(theme.waterTop);
  const y0 = Math.max(8, far - 100);
  const y1 = far - 26;
  if (y1 <= y0) return;
  const islets: { x: number; y: number; w: number; d: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const d = rng(); // 0 = farthest
    const y = y0 + d * (y1 - y0);
    const w = (60 + rng() * 80) * (0.4 + 0.6 * d);
    const x = ((i + 0.15 + rng() * 0.7) / 4) * C.MAP_W;
    islets.push({ x, y, w, d });
  }
  islets.sort((a, b) => a.y - b.y);
  for (const it of islets) {
    const fade = 0.78 - it.d * 0.38; // how much of the haze tone covers the islet
    const h = it.w * 0.2;
    const cliffH = Math.max(2, it.w * 0.06);
    ctx.fillStyle = withAlpha(haze, 0.55);
    ctx.beginPath();
    ctx.ellipse(it.x, it.y + cliffH, it.w * 0.56, Math.max(1.5, cliffH * 0.9), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mixHex(cliff.shade, haze, fade);
    ctx.beginPath();
    ctx.ellipse(it.x, it.y, it.w * 0.5, cliffH * 1.6, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = mixHex(grass.mid, haze, fade);
    ctx.beginPath();
    ctx.moveTo(it.x - it.w * 0.5, it.y);
    ctx.bezierCurveTo(it.x - it.w * 0.32, it.y - h * 1.1, it.x + it.w * 0.18, it.y - h * 1.25, it.x + it.w * 0.5, it.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mixHex(grass.lit, haze, fade);
    ctx.beginPath();
    ctx.moveTo(it.x - it.w * 0.42, it.y - h * 0.08);
    ctx.bezierCurveTo(it.x - it.w * 0.3, it.y - h * 0.95, it.x - it.w * 0.05, it.y - h * 1.05, it.x + it.w * 0.05, it.y - h * 0.82);
    ctx.bezierCurveTo(it.x - it.w * 0.12, it.y - h * 0.6, it.x - it.w * 0.28, it.y - h * 0.3, it.x - it.w * 0.42, it.y - h * 0.08);
    ctx.fill();
  }
}

/**
 * ART-23 baked key light over the plateau (inside its clip, under the sun patches): a warm pool of
 * sunlight over the upper-left of the playfield (two nested ellipses, the clay look's stepped pools,
 * not the far hazy corner), a cool wash of blue ink from beyond the near / lower-right corner (one
 * ellipse) and a vignette (one wide translucent stroke of the outline darkens the rim). Four solid
 * translucent fills: a gradient or a scaled image over the island costs 5–10× a solid fill in the
 * software rasteriser, and every fill under the plateau clip ≈ 3× an unclipped one (perf.spec.ts
 * ground build at 4× CPU).
 */
function lightPlateau(ctx: CanvasRenderingContext2D, outline: Pt[], light: GroundLight, top: number, bottom: number): void {
  const h = bottom - top;
  for (const [x, y, r, c, a] of [
    [0.3 * C.MAP_W, top + 0.4 * h, 0.58 * h, light.warm, light.warmAlpha * 0.5],
    [0.28 * C.MAP_W, top + 0.38 * h, 0.34 * h, light.warm, light.warmAlpha * 0.5],
    [C.MAP_W + 90, bottom + 120, 0.55 * h, light.cool, light.coolAlpha],
  ] as const) {
    ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.8, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = light.cool;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = light.vignette;
  ctx.lineWidth = 90;
  smoothClosedPath(ctx, outline, 0, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * ART-23 sun glitter (baked with the sea, under the island): the key light sits beyond the upper-left
 * horizon, so the sea between it and the viewer sparkles in a column on the left — short warm-white
 * dashes, densest near the horizon, smaller with distance. Logical frame under a
 * tilted camera (the wedge of sea left of the far shore), map frame on the flat map. Own rng.
 */
function paintGlitter(ctx: CanvasRenderingContext2D, theme: TerrainTheme, seed: number, cam: Camera, top: number): void {
  const rng = makeRng(seed * 7717 + 5);
  const y0 = cam.flat ? Math.max(0, top - 90) : Math.max(40, projY(cam, top) - 60);
  const y1 = cam.flat ? C.MAP_H : projY(cam, top) + 760;
  const colX = 64;
  const color = theme.tintAmount > 0 ? '#e8fbff' : '#fff6dc';
  ctx.fillStyle = color;
  for (let i = 0; i < 46; i++) {
    const f = rng() ** 1.6; // denser toward the horizon
    const y = y0 + f * (y1 - y0);
    const len = (5 + rng() * 9) * (0.55 + 0.45 * f);
    ctx.globalAlpha = 0.9 - f * 0.5;
    ctx.fillRect(colX + (22 + f * 50) * (rng() + rng() - 1) - len / 2, y, len, 2);
  }
  ctx.globalAlpha = 1;
}

/** Cliff face height (screen logical px): the tilted camera sees more of the island's front face. */
export function cliffDepth(k: number): number {
  return CLIFF_DEPTH * (1 + (1 - k) * 1.8);
}

/**
 * Paint the ground. With a tilted camera (ART-21) the water gradient, the horizon haze and the distant
 * islets go on the logical-frame cache (`stage.sea`), the island (outline, cliff, foam, sun patches,
 * bevel, rivers, walls, craters, aerial haze) on the map-space canvas `ctx` that is warped afterwards —
 * vertical faces (cliff, foam line, wall height) are screen-sized offsets divided by the warp's
 * vertical scale there — and the props (bushes, pines, cacti, rocks, boulders, flower dots, mine
 * bodies) upright and depth-scaled through `stage.up`. The rng is consumed in the same order either
 * way, so a level's scatter is identical with the camera on or off.
 */
function render(ctx: CanvasRenderingContext2D, pal: Palette, spec: TerrainSpec, stage: Stage = flatStage(ctx)): void {
  const cam = stage.cam;
  const rng = makeRng(spec.seed * 104729 + 7);
  const top = spec.top ?? HUD.mapTop + 12;
  const bottom = spec.bottom ?? HUD.mapBottom + 18;
  const theme = themeFor(spec.theme);
  const biome = themedBiome(pal.biomes[spec.biome ?? 'grass'], theme, spec.biome ?? 'grass');
  const grass = biome.grass;
  const k = cam.k;
  /** A vertical screen-px offset at the near shore, in map units (the warp's vertical scale there). */
  const nearJ = jacY(cam, bottom);
  const v = (px: number): number => px / nearJ;
  const cliff = cliffDepth(k);
  drawWater(ctx, pal, rng, theme, stage);
  if (k < 1) drawDistantIslets(stage.sea, theme, biome.grass, biome.cliff, spec.seed, projY(cam, top));

  const outline = plateauPoints(spec.seed, top, bottom);
  const light = BIOME_LIGHT[spec.biome ?? 'grass'];
  paintGlitter(stage.sea, theme, spec.seed, cam, top);
  ctx.save();

  // soft drop shadow on the water (stacked, growing, fading)
  ctx.fillStyle = pal.groundShadow;
  for (const [dx, dy, a] of [
    [10, 34, 0.5],
    [18, 46, 0.35],
    // ART-23: the outer pass reaches further out on the island's shadow side (lower-right): deeper water there
    [36, 68, 0.22],
  ] as const) {
    ctx.globalAlpha = a;
    smoothClosedPath(ctx, outline, dx, v(dy + cliff - CLIFF_DEPTH));
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // foam hugging the whole coast: drawn under the island so only the outer half of each stroke shows
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.foam;
  for (const [dy, w, a] of [
    [cliff, 16, 0.5],
    [cliff, 6, 1],
    [0, 14, 0.5],
    [0, 5, 1],
  ] as const) {
    smoothClosedPath(ctx, outline, 0, v(dy));
    ctx.lineWidth = w;
    ctx.globalAlpha = a;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // three-band cliff bevel: dark under-cliff, mid cliff, lit cliff top
  smoothClosedPath(ctx, outline, 0, v(cliff));
  ctx.fillStyle = shade(biome.cliff.shade, -0.28);
  ctx.fill();
  smoothClosedPath(ctx, outline, 0, v(cliff * 0.66));
  ctx.fillStyle = biome.cliff.shade;
  ctx.fill();
  if (k < 1) {
    // strata line across the cliff face (under the lit band, which covers its upper half)
    smoothClosedPath(ctx, outline, 0, v(cliff * 0.5));
    ctx.strokeStyle = withAlpha(shade(biome.cliff.shade, -0.2), 0.35);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  smoothClosedPath(ctx, outline, 0, v(cliff * 0.3));
  ctx.fillStyle = biome.cliff.lit;
  ctx.fill();
  // ART-23: the cliff face warm on the light's side, cool on the far side (one gradient wash clipped to
  // the near shore's band, the only place a cliff face shows), and its lit top edge, a bright line just
  // under the grass lip
  const face = ctx.createLinearGradient(0, 0, C.MAP_W, 0);
  face.addColorStop(0, withAlpha(light.warm, 0.3));
  face.addColorStop(0.45, withAlpha(light.warm, 0));
  face.addColorStop(0.6, withAlpha(light.cool, 0));
  face.addColorStop(1, withAlpha(light.cool, 0.32));
  ctx.save();
  ctx.beginPath();
  ctx.rect(-220, bottom - 124, C.MAP_W + 440, 136 + v(cliff));
  ctx.clip();
  smoothClosedPath(ctx, outline, 0, v(cliff));
  ctx.fillStyle = face;
  ctx.fill();
  ctx.restore();
  smoothClosedPath(ctx, outline, 0, v(6));
  ctx.strokeStyle = withAlpha(shade(biome.cliff.lit, 0.5), 0.85);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // dark grass lip over the cliff
  smoothClosedPath(ctx, outline, 0, v(4));
  ctx.fillStyle = grass.shade;
  ctx.fill();
  // plateau: the ground mid tone under the ART-23 key light (warm toward the light, cool toward the
  // near / lower-right rim), one blit of a small pre-lit image inside the plateau clip (flat fill without it)
  smoothClosedPath(ctx, outline, 0, 0);
  ctx.fillStyle = grass.mid;
  ctx.fill();

  // everything else stays inside the plateau
  ctx.save();
  smoothClosedPath(ctx, outline, 0, 0);
  ctx.clip();

  // ART-23 key light over the plateau (warm toward the light, cool toward the near / lower-right rim)
  lightPlateau(ctx, outline, light, top, bottom);

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
  strokeBevel(ctx, outline, grass, 9, !cam.flat);

  // obstacles (walls / rivers / boulders) under the props; ash and the twilight moor get dark boulders
  const kind = spec.biome ?? 'grass';
  const darkRocks = kind === 'volcanic' || kind === 'twilight';
  drawObstacles(ctx, pal, theme, grass, biome.wall, spec, rng, darkRocks, stage);

  // decorations: keep off obstacles, mines and towers
  const place = (minObstacle: number, minTower: number): Pt | null => {
    for (let tries = 0; tries < 24; tries++) {
      const x = 60 + rng() * (C.MAP_W - 120);
      const y = top + 40 + rng() * (bottom - top - 80);
      if (distToObstacles(spec, x, y) < minObstacle || distToTowers(spec, x, y) < minTower) continue;
      return { x, y };
    }
    return null;
  };
  const clumps = kind === 'sand' ? 7 : kind === 'volcanic' ? 6 : kind === 'twilight' ? 8 : 10;
  const items: { p: Pt; s: number; f: (c: CanvasRenderingContext2D, p: Pt, s: number) => void }[] = [];
  for (let i = 0; i < clumps; i++) {
    const p = place(44, 100);
    if (!p) continue;
    const s = 12 + rng() * 7;
    const alt = rng() < 0.35;
    const f = (c: CanvasRenderingContext2D, q: Pt, ss: number): void => {
      if (kind === 'snow') drawPine(c, pal, biome.bush, q.x, q.y, ss);
      else if (kind === 'sand') drawCactus(c, pal, biome.bush, q.x, q.y, ss * 0.9);
      else if (kind === 'volcanic') drawRock(c, pal, q.x, q.y, ss, rng, true);
      else if (kind === 'twilight' && alt) drawRock(c, pal, q.x, q.y, ss * 0.7, rng, true, 1.9); // standing stone
      else drawBush(c, pal, kind === 'autumn' && alt ? pal.biomes.grass.bush : biome.bush, q.x, q.y, ss);
    };
    items.push({ p, s, f });
  }
  for (let i = 0; i < 3; i++) {
    const p = place(40, 92);
    if (p) items.push({ p, s: 11 + rng() * 8, f: (c, q, ss) => drawRock(c, pal, q.x, q.y, ss, rng, darkRocks) });
  }
  items.sort((a, b) => a.p.y - b.p.y);
  for (const it of items) stage.up(it.p.x, it.p.y, (c) => it.f(c, it.p, it.s));
  for (let i = 0; i < 5; i++) {
    const p = place(30, 84);
    if (p) stage.up(p.x, p.y, (c) => drawDots(c, biome.dots, p.x, p.y, rng));
  }
  // mines on top of the props: live body (a standing drum) or crater (in the ground)
  const mineRng = makeRng(spec.seed * 7 + 3);
  for (const m of spec.mines) {
    if (m.charges > 0) stage.up(m.x, m.y, (c) => drawMineBody(c, pal, m.x, m.y));
    else drawCrater(ctx, pal, m.x, m.y, mineRng);
  }
  if (k < 1) {
    // aerial perspective: the far side of the plateau fades a little into the horizon haze
    const haze = hazeColour(theme.waterTop);
    const g = ctx.createLinearGradient(0, top - 20, 0, top + AERIAL_DEPTH);
    g.addColorStop(0, withAlpha(haze, AERIAL_ALPHA));
    g.addColorStop(1, withAlpha(haze, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-200, top - 40, C.MAP_W + 400, AERIAL_DEPTH + 60);
  }
  ctx.restore();
  ctx.restore();
}

/** Aerial perspective over the far side of the plateau under a tilted camera: strength at the far shore, and how far (map px) it fades out. */
const AERIAL_ALPHA = 0.36;
const AERIAL_DEPTH = 520;

/**
 * The cached ground image for `spec` at the current canvas resolution. Re-rendered when the
 * level, palette or device pixel size changes (rotation / resize).
 */
export function getTerrain(view: View, pal: Palette, spec: TerrainSpec, cam: Camera = FLAT): HTMLCanvasElement {
  const s = view.dpr * view.scale;
  const pxW = Math.max(1, Math.ceil(C.MAP_W * s));
  const pxH = Math.max(1, Math.ceil(C.MAP_H * s));
  const key = `${spec.key}|${spec.variant ?? ''}|${spec.biome ?? 'grass'}|${themeFor(spec.theme).id}|${pal.owners.enemy1}|${pxW}x${pxH}|${cam.k}`;
  const hit = cache.get(key);
  if (hit) return hit.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(pxW / C.MAP_W, 0, 0, pxH / C.MAP_H, 0, 0);
    if (cam.flat) render(ctx, pal, spec);
    else renderTilted(ctx, pxW, pxH, pal, spec, cam);
  }
  if (cache.size >= MAX_CACHED) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { canvas, pxW, pxH });
  return canvas;
}

/**
 * BUG-40 (QA-23: level 40's tilted ground built in 247–275 ms at 4× CPU against a 120 ms gate; the
 * per-row warp itself was never the cost): what a build pays is allocating and rasterising the
 * transient map-space canvas, so it holds only the island (wave bands go through the camera straight
 * onto the cache), at one device px per map px (the far two thirds are drawn smaller than that anyway), and the standing props draw straight onto the
 * cache in a second, rng-identical pass instead of through a third full-size canvas. The warp runs in
 * bands of `WARP_BAND_ROWS` device rows (the depth scale changes < 0.1 % across a band) with medium
 * smoothing.
 */
/** Device px per map px of the map-space ground canvas (capped: transient, rasterised on every level build). */
const WARP_SOURCE_MAX_SCALE = 1;
/**
 * Map px of the map-space canvas around the plateau box (x 26..694, y top..bottom, ±8 px outline
 * jitter): the foam line's outer half (8) on every side, the drop shadow on the water (up to 24 right,
 * ≈ 52 down at the near shore) and the cliff face (≈ 35 down) with its foam.
 */
const WARP_MARGIN_LEFT = 12;
const WARP_MARGIN_RIGHT = 44;
const WARP_MARGIN_TOP = 24;
const WARP_MARGIN_BELOW = 76;
/** Device rows per warp `drawImage`. */
const WARP_BAND_ROWS = 3;
const WARP_SMOOTHING: ImageSmoothingQuality = 'low';

/**
 * The transient map-space canvas, reused by back-to-back builds (level restart, next level, a resize)
 * and released `WARP_SOURCE_KEEP_MS` after the last one: allocating and dropping a few MB of backing
 * store per build was a third of a 4×-throttled build in allocation and GC.
 */
let warpSource: HTMLCanvasElement | null = null;
let warpRelease: ReturnType<typeof setTimeout> | undefined;
const WARP_SOURCE_KEEP_MS = 4000;

function warpCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (warpRelease !== undefined) clearTimeout(warpRelease);
  warpRelease = setTimeout(() => {
    warpRelease = undefined;
    if (warpSource) warpSource.width = warpSource.height = 0; // free the backing store
  }, WARP_SOURCE_KEEP_MS);
  warpSource ??= document.createElement('canvas');
  const canvas = warpSource;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; // resizing also clears
    canvas.height = h;
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return { canvas, ctx };
}

let noopCtx: CanvasRenderingContext2D | null = null;

/**
 * A context that draws nothing (the props pass's ground, the ground pass's props): a plain object with
 * every 2D-context method as a no-op (a Proxy trap per call cost ≈ 10 ms of a 4×-throttled build);
 * gradients come back as a no-op gradient, `measureText` as a zero width.
 */
function noop(): CanvasRenderingContext2D {
  if (noopCtx) return noopCtx;
  const out: Record<string, unknown> = {};
  const gradient = { addColorStop: (): void => undefined };
  const proto = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype : {};
  for (const name of Object.getOwnPropertyNames(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, name);
    if (d && typeof d.value === 'function') out[name] = (): undefined => undefined;
  }
  out.createLinearGradient = out.createRadialGradient = out.createConicGradient = (): unknown => gradient;
  out.createPattern = (): null => null;
  out.measureText = (): { width: number } => ({ width: 0 });
  noopCtx = out as unknown as CanvasRenderingContext2D;
  return noopCtx;
}

/**
 * The tilted camera's ground (ART-21), once per level: the island is painted flat on a map-space
 * canvas, then warped into the cache in bands of device rows — each band takes the map rows it shows,
 * stretched across by its depth scale about the centre column ("mode 7"; a one-off cost per level,
 * nothing per frame). The sea, haze, glitter, wave bands and islets are painted on the cache first
 * (logical frame, through the camera); the standing props last, upright and depth-scaled, from a
 * second pass of the same seeded `render` (same rng order, so the same scatter) with the ground muted.
 */
function renderTilted(ctx: CanvasRenderingContext2D, pxW: number, pxH: number, pal: Palette, spec: TerrainSpec, cam: Camera): void {
  const sx = pxW / C.MAP_W;
  const sy = pxH / C.MAP_H;
  const dev = Math.min(WARP_SOURCE_MAX_SCALE, Math.max(sx, sy));
  const islandTop = spec.top ?? HUD.mapTop + 12;
  const islandBottom = spec.bottom ?? HUD.mapBottom + 18;
  const yTop = Math.max(Math.floor(unprojY(cam, -2)) - 8, islandTop - WARP_MARGIN_TOP);
  const yBot = Math.min(Math.ceil(unprojY(cam, C.MAP_H + 2)) + 8, islandBottom + WARP_MARGIN_BELOW);
  const xL = -WARP_MARGIN_LEFT;
  const xR = C.MAP_W + WARP_MARGIN_RIGHT;
  const src = warpCanvas(Math.max(1, Math.ceil((xR - xL) * dev)), Math.max(1, Math.ceil((yBot - yTop) * dev)));
  if (!src) return;
  const ground = src.canvas;
  const gctx = src.ctx;
  gctx.setTransform(dev, 0, 0, dev, -xL * dev, -yTop * dev);
  // pass 1: the sea onto the cache, the island onto the map-space canvas, props muted
  render(gctx, pal, spec, { cam, sea: ctx, up: (_x, _y, draw) => draw(noop()) });
  // warp: device rows r .. r + n of the cache show map rows unprojY(r / sy) .. unprojY((r + n) / sy)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = WARP_SMOOTHING;
  const rFrom = Math.max(0, Math.floor(projY(cam, yTop) * sy));
  const rTo = Math.min(pxH, Math.ceil(projY(cam, yBot) * sy));
  for (let r = rFrom; r < rTo; r += WARP_BAND_ROWS) {
    const rows = Math.min(WARP_BAND_ROWS, rTo - r);
    const ya = unprojY(cam, r / sy);
    const yb = unprojY(cam, (r + rows) / sy);
    let top = (ya - yTop) * dev;
    let h = (yb - ya) * dev;
    if (top < 0) {
      h += top;
      top = 0;
    }
    if (top + h > ground.height) h = ground.height - top;
    if (!(h > 0)) continue;
    const s = depth(cam, (ya + yb) / 2);
    // only the source columns this band shows on the screen
    const x0 = Math.max(xL, cam.cx - (cam.cx + 2) / s);
    const x1 = Math.min(xR, cam.cx + (C.MAP_W - cam.cx + 2) / s);
    if (!(x1 > x0)) continue;
    ctx.drawImage(ground, (x0 - xL) * dev, top, (x1 - x0) * dev, h, (cam.cx + (x0 - cam.cx) * s) * sx, r, (x1 - x0) * s * sx, rows);
  }
  ctx.restore();
  // pass 2: the same seeded render with the ground and sea muted — only the props, onto the cache
  render(noop(), pal, spec, {
    cam,
    sea: noop(),
    up: (x, y, draw) => {
      const p = proj(cam, x, y);
      ctx.save();
      ctx.translate(p.x - x * p.s, p.y - y * p.s);
      ctx.scale(p.s, p.s);
      draw(ctx);
      ctx.restore();
    },
  });
}

/**
 * Blit the cached ground onto the logical map (call with the logical transform active, not the ground
 * frame: a tilted camera is baked into the image).
 */
export function drawTerrain(ctx: CanvasRenderingContext2D, view: View, pal: Palette, spec: TerrainSpec, cam: Camera = FLAT): void {
  const img = getTerrain(view, pal, spec, cam);
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
 * primitives), no gradients. With `motion` false everything stays put but still draws. Under a tilted
 * camera (ART-21) the sparkles and glow specks sit at their projected points (none in the hazy
 * distance) and the cloud shadows drift along their projected rows, narrowed and flattened with depth;
 * call in the logical frame.
 */
export function drawTerrainOverlay(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  spec: TerrainSpec,
  nowMs: number,
  motion: boolean,
  /** Horizontal extent the clouds drift across (BUG-34: a wide screen's side margins); default the map. */
  across: { left: number; right: number } = { left: 0, right: C.MAP_W },
  cam: Camera = FLAT,
): void {
  const amb = ambientFor(spec);
  const theme = themeFor(spec.theme);
  const t = motion ? nowMs / 1000 : 0;
  if (theme.ambient) {
    // theme wash over the cached ground only: buildings, units and badges stay untinted
    ctx.fillStyle = theme.ambient;
    ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  }
  const horizon = horizonY(cam);
  ctx.fillStyle = theme.waterSparkle;
  for (let i = 0; i < amb.sparkles.length; i++) {
    const s = amb.sparkles[i]!;
    const tw = 0.5 + 0.5 * Math.sin(t * 1.6 + s.phase);
    if (tw < 0.15) continue;
    const x = ((s.x + t * 6 + i * 0.1) % (C.MAP_W + 20)) - 10;
    if (cam.flat) {
      ctx.globalAlpha = tw;
      ctx.fillRect(x - s.len / 2, s.y, s.len, 2.5);
      continue;
    }
    const p = proj(cam, x, s.y);
    if (horizon !== undefined && p.y < horizon) continue;
    ctx.globalAlpha = tw;
    ctx.fillRect(p.x - (s.len * p.s) / 2, p.y, s.len * p.s, 2.5 * p.s);
  }
  if (theme.drawGlow) theme.drawGlow(ctx, cam.flat ? amb.specks : projectedSpecks(spec, amb, cam), t); // fireflies / snow motes / neon dust (theme chunk)
  ctx.globalAlpha = theme.cloudAlpha;
  ctx.fillStyle = pal.groundShadow;
  const span = across.right - across.left + 560;
  for (const c of amb.clouds) {
    const x = ((c.x0 + t * c.speed) % span) - 280 + across.left;
    ctx.beginPath();
    if (cam.flat) {
      for (const l of c.lobes) {
        ctx.moveTo(x + l.dx + l.rx, c.y + l.dy);
        ctx.ellipse(x + l.dx, c.y + l.dy, l.rx, l.ry, 0, 0, Math.PI * 2);
      }
    } else {
      // the cloud drifts across the screen along its projected row; its shadow lies on the ground
      const s = depth(cam, c.y);
      const cy = projY(cam, c.y);
      const j = jacY(cam, c.y);
      for (const l of c.lobes) {
        const lx = x + l.dx * s;
        const ly = cy + l.dy * j;
        ctx.moveTo(lx + l.rx * s, ly);
        ctx.ellipse(lx, ly, l.rx * s, l.ry * j, 0, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const speckCache = new Map<string, Sparkle[]>();

/** The theme's glow specks at their projected points, size scaled with depth (static: cached per level and camera). */
function projectedSpecks(spec: TerrainSpec, amb: Ambient, cam: Camera): Sparkle[] {
  const key = `${spec.key}|${cam.k}`;
  let out = speckCache.get(key);
  if (!out) {
    out = amb.specks.map((sp) => {
      const p = proj(cam, sp.x, sp.y);
      return { x: p.x, y: p.y, len: sp.len * p.s, phase: sp.phase };
    });
    if (speckCache.size > 8) speckCache.clear();
    speckCache.set(key, out);
  }
  return out;
}
