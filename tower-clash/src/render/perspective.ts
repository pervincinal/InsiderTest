import { C } from '../sim/constants';
import type { Camera, Projected } from './camera';
import { ISLAND_FAR_Y } from './camera';
import { HUD, WORLD_ZOOM } from './layout';
import type { Palette, TerrainTheme, Tones } from './palette';
import { shade, withAlpha } from './palette';
import type { Cloud, Pt, Sparkle, Stage, TerrainSpec } from './terrain';
import { LIGHT_X, LIGHT_Y, makeRng, render, strokeBevel, traceExtruded, tracePolyline } from './terrain';

/*
 * PERF-9: the ART-21 perspective play camera as a lazy chunk. Since ART-24 the default play view is
 * the flat map (camera.ts `FLAT`, the identity); this module is only fetched for the `?tilt=0.72`
 * override or `setTilt()` (camera.ts `loadCamera`, preloaded by main.ts before a level starts), so
 * none of it is in the eager bundle. It holds the homography (`makeCamera`) and every painter only
 * the tilted view uses, reached through `Camera.tilt`: the ground warp ("mode 7", `renderTilted`),
 * the horizon haze and distant islets, the wave bands / sparkles / cloud shadows through the camera,
 * the batched cliff bevel, the standing walls' front face, the aerial perspective over the far
 * plateau and the tutorial's side bubble. The eager modules keep the flat paths untouched.
 *
 * The map → screen map is a plane homography (lines stay lines, so a stream ribbon, a guide line or
 * the drag band is straight between its projected end points, and a unit walking the lane stays on
 * its ribbon). With the depth scale
 *
 *   s(y) = 1 / (1 + g · (nearY − y))          (1 at the near edge, `k` at the far edge HUD.mapTop)
 *
 * a map point (x, y) is drawn at
 *
 *   X = cx + (x − cx) · s(y)                  (narrows toward the far edge, about the centre column)
 *   Y = horizon + span · s(y)                 (the vanishing line `horizon` is far above the screen)
 *
 * and the inverse is exact: s = (Y − horizon) / span, y = nearY − (1/s − 1) / g, x = cx + (X − cx)/s.
 * `horizon` is chosen so the island's far shore lands at FAR_SHORE_Y (a horizon band of sea with the
 * distant islets above it, not a void) and the near edge stays where the flat map had it.
 */

/**
 * Where the far shore is drawn (screen logical y): ≈ 70 CSS px of horizon sea under the lesson card
 * on a 430 × 932 phone (was ≈ 160 with the v1 squash), under the card on 9:16.
 */
export const FAR_SHORE_Y = 190;
/** The horizon haze over the sea clears this far (screen logical px) below the projected far shore. */
const HORIZON_PAST_SHORE = 30;
/** Centre column the far side narrows toward. */
const CX = 360;

/** A tutorial bubble box (logical px). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The perspective camera's painters (`Camera.tilt`), bound to its projection. */
export interface TiltPainters {
  /** The tilted ground image (terrain.ts `getTerrain`): sea, haze, islets, the warped island, standing props. */
  ground(ctx: CanvasRenderingContext2D, pxW: number, pxH: number, pal: Palette, spec: TerrainSpec): void;
  /** Horizon haze over the rectangle (x0, y0, w) down to the camera's horizon (logical frame). */
  haze(ctx: CanvasRenderingContext2D, seaTop: string, x0: number, y0: number, w: number): void;
  /** One terrain wave band at map y through the camera (none in the hazy distance). */
  waveBand(ctx: CanvasRenderingContext2D, y: number, amp: number, len: number): void;
  /** A few low islets in the hazy distance above the far shore (`far`, screen logical y). */
  islets(ctx: CanvasRenderingContext2D, theme: TerrainTheme, grass: Tones, cliff: { shade: string }, seed: number, far: number): void;
  /** The plateau's directional edge bevel, one path per tone (BUG-40). */
  bevel(ctx: CanvasRenderingContext2D, pts: Pt[], tones: Tones, width: number): void;
  /** A standing wall's front face (darker foot, mortar course), between `base` and `top` (map units). */
  wallFace(ctx: CanvasRenderingContext2D, pts: Pt[], tones: Tones, w: number, base: number, top: number, step: number): void;
  /** Aerial perspective: the far side of the plateau fades into the horizon haze (map frame). */
  aerial(ctx: CanvasRenderingContext2D, theme: TerrainTheme, top: number): void;
  /** One water sparkle at map (x, s.y), projected and depth-sized (logical frame). */
  sparkle(ctx: CanvasRenderingContext2D, x: number, s: Sparkle, alpha: number): void;
  /** The theme's glow specks at their projected points (static: cached per level and camera). */
  specks(key: string, specks: readonly Sparkle[]): Sparkle[];
  /** A cloud shadow's lobes along its projected row (adds to the current path). */
  cloud(ctx: CanvasRenderingContext2D, x: number, c: Cloud): void;
}

/** The perspective camera with far-edge scale `k` (0 < k < 1). */
export function makeCamera(k: number): Camera {
  const nearY = HUD.mapBottom;
  const g = (1 / k - 1) / (nearY - HUD.mapTop);
  const sShore = 1 / (1 + g * (nearY - ISLAND_FAR_Y));
  const horizon = (FAR_SHORE_Y - nearY * sShore) / (1 - sShore);
  const span = nearY - horizon;
  const depth = (y: number): number => 1 / (1 + g * (nearY - y));
  const projY = (y: number): number => horizon + span * depth(y);
  const proj = (x: number, y: number): Projected => {
    const s = depth(y);
    return { x: CX + (x - CX) * s, y: horizon + span * s, s };
  };
  const unprojY = (y: number): number => nearY - (1 / ((y - horizon) / span) - 1) / g;
  /** Screen logical y where the far-sea haze clears. */
  const horizonLine = projY(ISLAND_FAR_Y) + HORIZON_PAST_SHORE;
  const cam: { -readonly [K in keyof Camera]: Camera[K] } = {
    k,
    flat: false,
    depth,
    projY,
    proj,
    unprojY,
    unproj: (x: number, y: number) => {
      const s = (y - horizon) / span;
      return { x: CX + (x - CX) / s, y: nearY - (1 / s - 1) / g };
    },
    jacY: (y: number) => {
      const s = depth(y);
      return span * g * s * s;
    },
    projDir: (x: number, y: number, dx: number, dy: number) => {
      const a = proj(x, y);
      const b = proj(x + dx, y + dy);
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey) || 1;
      return { dx: ex / len, dy: ey / len };
    },
    horizonY: () => horizonLine,
  };
  cam.tilt = painters(cam, horizonLine);
  return Object.freeze(cam);
}

/* ---------- horizon haze ---------- */

/*
 * ART-21 horizon (play screen only): with the tilted camera the island's far shore recedes and the sea
 * above it is the distance — it fades into a pale, hazy sky tone toward the top of the screen (aerial
 * perspective), while the near sea under the island keeps the saturated gradient. `paintHaze` serves
 * both the terrain cache and the full-bleed margins (sea.ts), so they get identical pixels and no seam
 * shows at the map's top edge.
 */

/** How far the haze colour lifts the sea's top colour toward white. */
const HAZE_LIFT = 0.62;
/** Haze opacity where it is full (at and above `HAZE_FULL_Y`). */
const HAZE_ALPHA = 0.72;
/** Logical y where the haze reaches full strength (clamped above, i.e. in the top margin). */
const HAZE_FULL_Y = 40;

/** The hazy sky tone over the far sea. */
function hazeColour(seaTop: string): string {
  return shade(seaTop, HAZE_LIFT);
}

/**
 * Haze over the rectangle (x0, y0, w) from y0 down to `horizonY`: full at `HAZE_FULL_Y` and above,
 * clear at `horizonY` (just past the island's far shore). Call in the logical frame.
 */
function paintHaze(ctx: CanvasRenderingContext2D, seaTop: string, horizonY: number, x0: number, y0: number, w: number): void {
  if (!(horizonY > y0)) return;
  const c = hazeColour(seaTop);
  const g = ctx.createLinearGradient(0, horizonY, 0, Math.min(HAZE_FULL_Y, horizonY - 1));
  g.addColorStop(0, withAlpha(c, 0));
  g.addColorStop(0.45, withAlpha(c, HAZE_ALPHA * 0.42));
  g.addColorStop(1, withAlpha(c, HAZE_ALPHA));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, horizonY - y0);
}

/** `a` blended toward `b` by t (0..1), both `#rrggbb`; anything else returns `b`. */
function mixHex(a: string, b: string, t: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b;
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (sh: number): number => Math.round(((x >> sh) & 0xff) * (1 - t) + ((y >> sh) & 0xff) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Aerial perspective over the far side of the plateau: strength at the far shore, and how far (map px) it fades out. */
const AERIAL_ALPHA = 0.36;
const AERIAL_DEPTH = 520;

/* ---------- the painters ---------- */

function painters(cam: Camera, horizon: number): TiltPainters {
  const speckCache = new Map<string, Sparkle[]>();
  return {
    ground: (ctx, pxW, pxH, pal, spec) => renderTilted(ctx, pxW, pxH, pal, spec, cam),
    haze: (ctx, seaTop, x0, y0, w) => paintHaze(ctx, seaTop, horizon, x0, y0, w),
    waveBand(ctx, y, amp, len) {
      if (cam.projY(y) < horizon) return; // calm, hazy distance (the caller drew the rng already)
      ctx.beginPath();
      const d = cam.depth(y);
      const xa = Math.floor(CX - (CX + 20) / d);
      const xb = CX + (C.MAP_W - CX + 20) / d;
      ctx.lineWidth = 4 * d;
      for (let x = xa; x <= xb; x += 8) {
        const p = cam.proj(x, y + Math.sin((x / len) * Math.PI * 2) * amp);
        if (x === xa) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    },
    islets: drawDistantIslets,
    bevel(ctx, pts, tones, width) {
      if (typeof Path2D !== 'function') {
        strokeBevel(ctx, pts, tones, width);
        return;
      }
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      // BUG-40: one path per tone (two strokes instead of ~60 — 13 ms of a 4×-throttled tilted build);
      // only where a lit run meets a shaded one does the other tone's round cap now sit on top
      const lit = new Path2D();
      const dark = new Path2D();
      const n = pts.length;
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
    },
    wallFace(ctx, pts, tones, w, base, top, step) {
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
      ctx.translate(0, base + (top - base) * 0.55 - 1.2 / cam.k);
      tracePolyline(ctx, pts);
      ctx.strokeStyle = tones.shade;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.restore();
    },
    aerial(ctx, theme, top) {
      const haze = hazeColour(theme.waterTop);
      const g = ctx.createLinearGradient(0, top - 20, 0, top + AERIAL_DEPTH);
      g.addColorStop(0, withAlpha(haze, AERIAL_ALPHA));
      g.addColorStop(1, withAlpha(haze, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-200, top - 40, C.MAP_W + 400, AERIAL_DEPTH + 60);
    },
    sparkle(ctx, x, s, alpha) {
      const p = cam.proj(x, s.y);
      if (p.y < horizon) return;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - (s.len * p.s) / 2, p.y, s.len * p.s, 2.5 * p.s);
    },
    specks(key, specks) {
      let list = speckCache.get(key);
      if (!list) {
        list = specks.map((sp) => {
          const p = cam.proj(sp.x, sp.y);
          return { x: p.x, y: p.y, len: sp.len * p.s, phase: sp.phase };
        });
        if (speckCache.size > 8) speckCache.clear();
        speckCache.set(key, list);
      }
      return list;
    },
    cloud(ctx, x, c) {
      // the cloud drifts across the screen along its projected row; its shadow lies on the ground
      const s = cam.depth(c.y);
      const cy = cam.projY(c.y);
      const j = cam.jacY(c.y);
      for (const l of c.lobes) {
        const lx = x + l.dx * s;
        const ly = cy + l.dy * j;
        ctx.moveTo(lx + l.rx * s, ly);
        ctx.ellipse(lx, ly, l.rx * s, l.ry * j, 0, 0, Math.PI * 2);
      }
    },
  };
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

/* ---------- the tilted ground ("mode 7") ---------- */

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
  const yTop = Math.max(Math.floor(cam.unprojY(-2)) - 8, islandTop - WARP_MARGIN_TOP);
  const yBot = Math.min(Math.ceil(cam.unprojY(C.MAP_H + 2)) + 8, islandBottom + WARP_MARGIN_BELOW);
  const xL = -WARP_MARGIN_LEFT;
  const xR = C.MAP_W + WARP_MARGIN_RIGHT;
  const src = warpCanvas(Math.max(1, Math.ceil((xR - xL) * dev)), Math.max(1, Math.ceil((yBot - yTop) * dev)));
  if (!src) return;
  const ground = src.canvas;
  const gctx = src.ctx;
  gctx.setTransform(dev, 0, 0, dev, -xL * dev, -yTop * dev);
  // pass 1: the sea onto the cache, the island onto the map-space canvas, props muted
  const prop = spec.zoom === true ? WORLD_ZOOM.prop : 1;
  const wall = spec.zoom === true ? WORLD_ZOOM.wall : 1;
  const muted: Stage = { cam, sea: ctx, prop, wall, up: (_x, _y, draw) => draw(noop()) };
  render(gctx, pal, spec, muted);
  // warp: device rows r .. r + n of the cache show map rows unprojY(r / sy) .. unprojY((r + n) / sy)
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = WARP_SMOOTHING;
  const rFrom = Math.max(0, Math.floor(cam.projY(yTop) * sy));
  const rTo = Math.min(pxH, Math.ceil(cam.projY(yBot) * sy));
  for (let r = rFrom; r < rTo; r += WARP_BAND_ROWS) {
    const rows = Math.min(WARP_BAND_ROWS, rTo - r);
    const ya = cam.unprojY(r / sy);
    const yb = cam.unprojY((r + rows) / sy);
    let top = (ya - yTop) * dev;
    let h = (yb - ya) * dev;
    if (top < 0) {
      h += top;
      top = 0;
    }
    if (top + h > ground.height) h = ground.height - top;
    if (!(h > 0)) continue;
    const s = cam.depth((ya + yb) / 2);
    // only the source columns this band shows on the screen
    const x0 = Math.max(xL, CX - (CX + 2) / s);
    const x1 = Math.min(xR, CX + (C.MAP_W - CX + 2) / s);
    if (!(x1 > x0)) continue;
    ctx.drawImage(ground, (x0 - xL) * dev, top, (x1 - x0) * dev, h, (CX + (x0 - CX) * s) * sx, r, (x1 - x0) * s * sx, rows);
  }
  ctx.restore();
  // pass 2: the same seeded render with the ground and sea muted — only the props, onto the cache
  render(noop(), pal, spec, {
    cam,
    sea: noop(),
    prop,
    wall,
    up: (x, y, draw, zoom = prop) => {
      const p = cam.proj(x, y);
      const s = p.s * zoom;
      ctx.save();
      ctx.translate(p.x - x * s, p.y - y * s);
      ctx.scale(s, s);
      draw(ctx);
      ctx.restore();
    },
  });
}
