/**
 * Silhouette skins (backlog M3-2): two tower shapes and two unit shapes that replace the whole
 * building / soldier instead of only its roof or helmet. Lazy chunk — sprites.ts imports this module
 * on first use (`loadShapeSkins`) so the eager bundle stays under its 80 kB budget.
 *
 * Same clay recipe as sprites.ts: three tones + rim light, key light upper-left, no gradients.
 * Ownership stays in the owner tones of whichever palette is active (belts, caps, hip roofs, flags,
 * shields, torsos), and the level silhouette is kept — L1 small, L2 taller with a storey and a
 * banner, L3 wide with a double roof / battlements — inside the same height envelope as the default
 * buildings (`towerTop` is skin-independent, so the badge never collides). Kind signatures are kept
 * too: barracks awning, artillery barrel + sandbags, factory chimney smoke, fortress wall ring.
 */
import type { TowerKind, UnitKind } from '../sim/types';
import type { Palette, Tones } from './palette';
import { shade } from './palette';
import { TANK_RADIUS } from './layout';
import { roundRect } from './widgets';
import type { RoofStyle, ShapeSkinDrawers, TowerDrawOptions, UnitStyle } from './sprites';
import { INK_LINE, RIM, STRIPE, TAU, awning, banner, barrel, capsule, chimney, cone, crenelsHalf, cylinder, dome, door, flag, gems, helmetCap, ledge, plinth, tier, wallRing } from './sprites';

type T3 = readonly [number, number, number];

/* ---------- shared clay parts ---------- */

/** Owner-coloured belt around a drum just under its rim (front half): shade under mid, lit sliver on the left. */
function belt(ctx: CanvasRenderingContext2D, tones: Tones, x: number, y: number, r: number, ry: number): void {
  ctx.lineCap = 'butt';
  ctx.strokeStyle = tones.shade;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(x, y + 1.5, r, ry, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = tones.mid;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y, r, ry, 0, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = tones.lit;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y - 1, r - 0.5, ry - 0.5, 0, Math.PI * 0.55, Math.PI * 0.95);
  ctx.stroke();
}

/** Crenellated stone drum with an owner belt and (optionally) a shallow owner cap inside the merlons. */
function drum(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, bottom: number, r: number, rows: number, cap: { h: number; rx: number } | null, merlon = 9): void {
  const ry = r * 0.36;
  cylinder(ctx, pal.stoneTones, x, top, bottom, r, ry, rows);
  belt(ctx, tones, x, top + 7, r, ry);
  const n = Math.max(4, Math.round(r / 5));
  crenelsHalf(ctx, pal, x, top, r, ry, n, true, merlon);
  if (cap) cone(ctx, tones, x, top - 2, top - 2 - cap.h, cap.rx, cap.rx * 0.36);
  crenelsHalf(ctx, pal, x, top, r, ry, n, false, merlon);
}

/** Small corner turret of the L3 keep: stone post with an owner cone. */
function turret(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, bottom: number, r: number): void {
  cylinder(ctx, pal.stoneTones, x, top, bottom, r, r * 0.4, 0, 0.15);
  cone(ctx, tones, x, top - 1, top - 1 - r * 1.3, r + 2, (r + 2) * 0.4);
}

/** Square clay shaft: front (mid), right side (shade), lit left strip, rim light. */
function box(ctx: CanvasRenderingContext2D, tones: Tones, x: number, top: number, bottom: number, hw: number): void {
  const h = bottom - top;
  ctx.fillStyle = tones.mid;
  ctx.fillRect(x - hw, top, hw * 2, h);
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x + hw * 0.45, top, hw * 0.55, h);
  ctx.fillStyle = tones.lit;
  ctx.fillRect(x - hw, top, hw * 0.36, h);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - hw + 1.5, top);
  ctx.lineTo(x - hw + 1.5, bottom - 1);
  ctx.stroke();
}

/** Hip roof: eave underside, mid front face, lit facet left, shade facet right, rim light. Returns the apex y. */
function hipRoof(ctx: CanvasRenderingContext2D, tones: Tones, x: number, base: number, h: number, hw: number): number {
  const apex = base - h;
  ctx.fillStyle = tones.shade;
  roundRect(ctx, { x: x - hw - 3, y: base - 3, w: hw * 2 + 6, h: 6 }, 2);
  ctx.fill();
  const facet = (x0: number, x1: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x0, base);
    ctx.lineTo(x1, base);
    ctx.closePath();
    ctx.fill();
  };
  facet(x - hw, x + hw, tones.mid);
  facet(x - hw, x - hw * 0.34, tones.lit);
  facet(x + hw * 0.4, x + hw, tones.shade);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 1, apex + 2);
  ctx.lineTo(x - hw + 2, base - 1);
  ctx.stroke();
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.arc(x, apex - 1.5, 2.5, 0, TAU);
  ctx.fill();
  return apex;
}

/** Timber gallery on a shaft: overhanging deck, plank walls with arrow slits. */
function gallery(ctx: CanvasRenderingContext2D, pal: Palette, x: number, top: number, bottom: number, hw: number, slits: number): void {
  const w = pal.woodTones;
  ctx.fillStyle = w.shade;
  ctx.fillRect(x - hw - 4, bottom - 2, hw * 2 + 8, 7);
  ctx.fillStyle = w.mid;
  ctx.fillRect(x - hw - 4, bottom - 4, hw * 2 + 8, 4);
  box(ctx, w, x, top, bottom - 2, hw);
  ctx.strokeStyle = INK_LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let yy = top + 6; yy < bottom - 5; yy += 6) {
    ctx.moveTo(x - hw + 2, yy);
    ctx.lineTo(x + hw - 2, yy);
  }
  ctx.stroke();
  ctx.fillStyle = shade(w.shade, -0.35);
  const step = (hw * 2) / (slits + 1);
  for (let i = 1; i <= slits; i++) ctx.fillRect(x - hw + step * i - 2, top + 4, 4, (bottom - top) * 0.45);
}

/** Wooden balcony ring at the storey line of a shaft (L2 / L3 watchtower). */
function balcony(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, hw: number): void {
  const w = pal.woodTones;
  ctx.fillStyle = w.shade;
  ctx.fillRect(x - hw, y, hw * 2, 5);
  ctx.fillStyle = w.lit;
  ctx.fillRect(x - hw, y - 1.5, hw * 2, 2.5);
}

/** Stone merlon blocks at the two ends of a deck (L3 battlements of the watchtower). */
function cornerMerlons(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, hw: number): void {
  const st = pal.stoneTones;
  for (const cx of [x - hw - 4, x + hw - 4]) {
    ctx.fillStyle = st.shade;
    roundRect(ctx, { x: cx + 1, y: y - 9, w: 9, h: 10 }, 2);
    ctx.fill();
    ctx.fillStyle = st.lit;
    roundRect(ctx, { x: cx, y: y - 10, w: 8, h: 8 }, 2);
    ctx.fill();
  }
}

/** Sky-blue windows with a paper glint. */
function windows(ctx: CanvasRenderingContext2D, y: number, xs: readonly number[]): void {
  ctx.fillStyle = '#bfe8ff';
  for (const wx of xs) ctx.fillRect(wx, y, 9, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const wx of xs) ctx.fillRect(wx, y, 4, 3);
}

/** Sandbags along the front of a gun position (artillery signature). */
function sandbags(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const bx = x - n * 6 + i * 12;
    ctx.fillStyle = pal.pathShade;
    roundRect(ctx, { x: bx, y: y + 2, w: 13, h: 9 }, 4);
    ctx.fill();
    ctx.fillStyle = pal.pathLit;
    roundRect(ctx, { x: bx + 1, y: y + 2, w: 10, h: 5 }, 3);
    ctx.fill();
  }
}

/* ---------- Round keep ---------- */

interface KeepDims {
  /** Drum radius / height per level. */
  r: T3;
  h: T3;
  /** Cap height per level; L3's cap sits on the upper drum. */
  cap: T3;
  /** Height of the L3 upper drum. */
  upper: number;
  /** Arched door on the ground drum. */
  door: boolean;
}

/** Drum stack from `base` (ground line of the body) up; flag on the right side of the top drum. */
function keepBody(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, base: number, k: 0 | 1 | 2, o: TowerDrawOptions, d: KeepDims): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  const r = d.r[k];
  const top = base - d.h[k];
  if (k === 0) {
    drum(ctx, pal, tones, x, top, base, r, 2, { h: d.cap[k] * pulse, rx: r * 0.72 * pulse });
    if (d.door) door(ctx, pal, x, base, 5.5, 13);
    flag(ctx, pal, tones, x + r + 2, top - 26, 26, o.nowMs, o.motion);
  } else if (k === 1) {
    drum(ctx, pal, tones, x, top, base, r, 3, { h: d.cap[k] * pulse, rx: r * 0.74 * pulse });
    ledge(ctx, pal, x, base - d.h[k] * 0.45, r + 2.5, r * 0.36 + 1);
    banner(ctx, pal, tones, x, top + 12, 12, 18, o.nowMs, o.motion);
    if (d.door) door(ctx, pal, x, base, 6, 14);
    flag(ctx, pal, tones, x + r + 3, top - 30, 30, o.nowMs, o.motion);
  } else {
    drum(ctx, pal, tones, x, top, base, r, 3, null, 10);
    if (d.door) door(ctx, pal, x, base, 7, 17);
    for (const tx of [x - r + 5, x + r - 5]) turret(ctx, pal, tones, tx, top - 12, top + 8, 7);
    const ur = r * 0.6;
    const utop = top - 4 - d.upper;
    drum(ctx, pal, tones, x, utop, top - 4, ur, 2, { h: d.cap[k] * pulse, rx: ur * 0.74 * pulse }, 8);
    flag(ctx, pal, tones, x + ur + 3, utop - 28, 28, o.nowMs, o.motion);
  }
}

const KEEP_BARRACKS: KeepDims = { r: [24, 27, 36], h: [36, 52, 44], cap: [14, 18, 18], upper: 40, door: true };
const KEEP_FORTRESS: KeepDims = { r: [26, 29, 34], h: [32, 46, 48], cap: [14, 16, 16], upper: 34, door: false };
const KEEP_FACTORY: KeepDims = { r: [26, 30, 38], h: [26, 34, 36], cap: [12, 14, 14], upper: 30, door: true };

function drawKeep(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, kind: TowerKind, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const k = tier(level);
  const { nowMs, motion } = o;
  switch (kind) {
    case 'artillery': {
      // squat crenellated gun drum with an owner-coloured turret drum carrying the barrel
      const pulse = 1 + (o.pulse ?? 0) * 0.15;
      const br = ([28, 32, 38] as const)[k];
      const bh = ([16, 20, 24] as const)[k];
      const ry = br * 0.37;
      cylinder(ctx, pal.stoneTones, x, y - bh, y + 2, br, ry, k === 2 ? 2 : 1);
      belt(ctx, tones, x, y - bh + 6, br, ry);
      const n = ([6, 7, 8] as const)[k];
      crenelsHalf(ctx, pal, x, y - bh, br, ry, n, true, 7);
      sandbags(ctx, pal, x, y, ([4, 5, 6] as const)[k]);
      if (k >= 1) banner(ctx, pal, tones, x - br * 0.62, y - bh + 2, 9, bh - 4, nowMs, motion);
      const tr = ([15, 18, 21] as const)[k] * pulse;
      const th = ([10, 12, 14] as const)[k] * pulse;
      cylinder(ctx, tones, x, y - bh - th, y - bh + 1, tr, tr * 0.36, 0, 0.15);
      crenelsHalf(ctx, pal, x, y - bh, br, ry, n, false, 7);
      barrel(ctx, pal, x, y - bh - th - 2, o.aim ?? -0.6, ([26, 30, 36] as const)[k], ([9, 10, 12] as const)[k]);
      gems(ctx, pal, x - 2, y - bh * 0.45, level, nowMs, motion);
      flag(ctx, pal, tones, x - br + 3, y - bh - ([26, 30, 34] as const)[k], ([22, 26, 28] as const)[k], nowMs, motion);
      return;
    }
    case 'fortress': {
      const rx = ([44, 48, 54] as const)[k];
      const ry = ([18, 19.5, 22] as const)[k];
      wallRing(ctx, pal, x, y, false, rx, ry);
      ctx.fillStyle = pal.pathShade;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, rx - 6, ry - 4, 0, 0, TAU);
      ctx.fill();
      keepBody(ctx, pal, tones, x, y - 4, k, o, { ...KEEP_FORTRESS, door: k === 2 });
      wallRing(ctx, pal, x, y, true, rx, ry);
      gems(ctx, pal, x, y + 12, level, nowMs, motion);
      return;
    }
    case 'tankFactory': {
      const d = KEEP_FACTORY;
      const r = d.r[k];
      const top = y - 4 - d.h[k];
      plinth(ctx, pal, x, y, ([34, 40, 48] as const)[k], ([7, 8, 10] as const)[k]);
      keepBody(ctx, pal, tones, x, y - 4, k, o, d);
      windows(ctx, y - 4 - d.h[k] * 0.55, [x - r * 0.7, x + r * 0.3]);
      const cw = ([10, 12, 11] as const)[k];
      const ch = ([28, 32, 38] as const)[k];
      chimney(ctx, pal, tones, x + r * 0.55, top - ch + 8, top + 6, cw, nowMs, motion);
      if (k === 2) chimney(ctx, pal, tones, x + r * 0.55 + 14, top - ch + 14, top + 6, cw, nowMs, motion, 14);
      gems(ctx, pal, x - r * 0.55, y - ([3, 4, 5] as const)[k], level, nowMs, motion);
      return;
    }
    default: {
      const ph = ([8, 10, 12] as const)[k];
      plinth(ctx, pal, x, y, ([30, 34, 44] as const)[k], ph);
      keepBody(ctx, pal, tones, x, y - ph, k, o, KEEP_BARRACKS);
      awning(ctx, tones, x - (k === 2 ? 8 : 0), y, ([0.9, 1, 1.05] as const)[k]);
      gems(ctx, pal, x, y - 2 - k, level, nowMs, motion);
    }
  }
}

/* ---------- Watchtower ---------- */

interface WatchDims {
  /** Shaft half width / height per level. */
  hw: T3;
  h: T3;
  /** Gallery half width / height per level. */
  gw: T3;
  gh: T3;
  /** Roof height per level (L3: the lower skirt when `lantern`). */
  roof: T3;
  /** L3 double roof: lantern storey through the skirt. */
  lantern: boolean;
}

/** Shaft + gallery + hip roof from `base` up; returns the gallery deck line (for chimneys). */
function watchBody(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, base: number, k: 0 | 1 | 2, o: TowerDrawOptions, d: WatchDims, slits: number): number {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  const st = pal.stoneTones;
  const hw = d.hw[k];
  const shaftTop = base - d.h[k];
  box(ctx, st, x, shaftTop, base, hw);
  if (k >= 1) balcony(ctx, pal, x, base - d.h[k] * 0.5, hw + 4);
  const gw = d.gw[k];
  const galleryTop = shaftTop - d.gh[k];
  gallery(ctx, pal, x, galleryTop, shaftTop, gw, slits);
  if (k >= 1) banner(ctx, pal, tones, x, shaftTop + 4, 12, 18, o.nowMs, o.motion);
  if (k === 2) cornerMerlons(ctx, pal, x, shaftTop + 5, gw + 4);
  const apex = hipRoof(ctx, tones, x, galleryTop - 2, d.roof[k] * pulse, gw + 4);
  if (k === 2 && d.lantern) {
    const lb = galleryTop - 10;
    box(ctx, st, x, lb - 22, lb, 10);
    hipRoof(ctx, tones, x, lb - 24, 18 * pulse, 15);
  }
  flag(ctx, pal, tones, x + gw + 5, Math.min(galleryTop - 12, apex + 6), shaftTop - Math.min(galleryTop - 12, apex + 6) - 2, o.nowMs, o.motion);
  return shaftTop;
}

const WATCH_BARRACKS: WatchDims = { hw: [11, 13, 16], h: [26, 46, 50], gw: [20, 24, 28], gh: [16, 18, 20], roof: [18, 24, 14], lantern: true };
const WATCH_FORTRESS: WatchDims = { hw: [12, 14, 16], h: [26, 40, 46], gw: [20, 24, 28], gh: [16, 18, 20], roof: [18, 22, 14], lantern: true };
const WATCH_FACTORY: WatchDims = { hw: [22, 26, 32], h: [26, 34, 44], gw: [18, 22, 28], gh: [14, 16, 18], roof: [14, 16, 18], lantern: false };

function drawWatchtower(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, kind: TowerKind, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const k = tier(level);
  const { nowMs, motion } = o;
  switch (kind) {
    case 'artillery': {
      // gun platform on timber stilts with an owner-coloured parapet
      const w = pal.woodTones;
      const hw = ([22, 26, 30] as const)[k];
      const ph = ([14, 22, 28] as const)[k];
      plinth(ctx, pal, x, y, ([24, 28, 32] as const)[k], 6);
      for (const px of [x - hw * 0.7, x + hw * 0.7]) {
        ctx.fillStyle = w.shade;
        ctx.fillRect(px - 3, y - ph, 6, ph + 2);
        ctx.fillStyle = w.lit;
        ctx.fillRect(px - 3, y - ph, 2, ph + 2);
      }
      ctx.strokeStyle = w.mid;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - hw * 0.7, y - 2);
      ctx.lineTo(x + hw * 0.7, y - ph + 4);
      ctx.stroke();
      if (k >= 1) banner(ctx, pal, tones, x - hw * 0.25, y - ph + 8, 9, ph - 10, nowMs, motion);
      ctx.fillStyle = w.shade;
      ctx.fillRect(x - hw - 2, y - ph, hw * 2 + 4, 6);
      ctx.fillStyle = w.mid;
      ctx.fillRect(x - hw - 2, y - ph - 2, hw * 2 + 4, 4);
      box(ctx, tones, x, y - ph - 12, y - ph - 2, hw);
      if (k === 2) cornerMerlons(ctx, pal, x, y - ph - 2, hw);
      sandbags(ctx, pal, x, y, ([4, 5, 6] as const)[k]);
      barrel(ctx, pal, x, y - ph - 12, o.aim ?? -0.6, ([26, 30, 36] as const)[k], ([9, 10, 12] as const)[k]);
      gems(ctx, pal, x, y - 2, level, nowMs, motion);
      flag(ctx, pal, tones, x - hw - 2, y - ph - ([26, 30, 34] as const)[k], ([22, 26, 28] as const)[k], nowMs, motion);
      return;
    }
    case 'fortress': {
      const rx = ([44, 48, 54] as const)[k];
      const ry = ([18, 19.5, 22] as const)[k];
      wallRing(ctx, pal, x, y, false, rx, ry);
      ctx.fillStyle = pal.pathShade;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, rx - 6, ry - 4, 0, 0, TAU);
      ctx.fill();
      watchBody(ctx, pal, tones, x, y - 4, k, o, WATCH_FORTRESS, k + 1);
      wallRing(ctx, pal, x, y, true, rx, ry);
      gems(ctx, pal, x, y + 12, level, nowMs, motion);
      return;
    }
    case 'tankFactory': {
      const d = WATCH_FACTORY;
      const hw = d.hw[k];
      plinth(ctx, pal, x, y, ([34, 40, 48] as const)[k], ([7, 8, 10] as const)[k]);
      const deck = watchBody(ctx, pal, tones, x, y - 4, k, o, d, k + 2);
      const dh = ([14, 18, 20] as const)[k];
      ctx.fillStyle = pal.stoneTones.shade;
      roundRect(ctx, { x: x - dh / 2, y: y - 4 - dh, w: dh, h: dh }, 3);
      ctx.fill();
      windows(ctx, y - 4 - dh + 2, [x - hw + 6, x + dh / 2 + 4]);
      const cw = ([10, 12, 11] as const)[k];
      const ch = ([26, 30, 36] as const)[k];
      chimney(ctx, pal, tones, x + hw * 0.55, deck - ch, deck + 2, cw, nowMs, motion);
      if (k === 2) chimney(ctx, pal, tones, x + hw * 0.55 + 15, deck - ch + 6, deck + 2, cw, nowMs, motion, 14);
      gems(ctx, pal, x - hw * 0.55, y - ([3, 4, 5] as const)[k], level, nowMs, motion);
      return;
    }
    default: {
      const ph = ([8, 10, 12] as const)[k];
      plinth(ctx, pal, x, y, ([22, 26, 32] as const)[k], ph);
      watchBody(ctx, pal, tones, x, y - ph, k, o, WATCH_BARRACKS, k + 1);
      door(ctx, pal, x, y - ph, ([5, 5.5, 6.5] as const)[k], ([12, 13, 15] as const)[k]);
      awning(ctx, tones, x - (k === 2 ? 6 : 0), y, ([0.85, 0.95, 1] as const)[k]);
      gems(ctx, pal, x, y - 2 - k, level, nowMs, motion);
    }
  }
}

/* ---------- units ---------- */

/** Long lower-right ground shadow shared by both soldier shapes. */
function unitShadow(ctx: CanvasRenderingContext2D, st: UnitStyle, x: number, y: number, scale: number): void {
  ctx.fillStyle = st.shadow;
  ctx.beginPath();
  ctx.ellipse(x + 2.5, y + 3.5, 6.5 * scale, 2.8 * scale, 0, 0, TAU);
  ctx.fill();
}

/**
 * Shield bearer: the clay soldier under a steel great helm with an owner crest, carrying a kite
 * shield in owner colour on the travel side (≈ 11 fills; skins are player-only, so at most half
 * the column pays for it).
 */
function shieldSoldier(ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, x: number, y: number, dx: number, id: number, nowMs: number, motion: boolean, s: number): void {
  const ph = motion ? Math.sin(nowMs / 95 + id * 1.7) : 0;
  const stretch = 1 + ph * 0.09;
  const hop = Math.max(0, ph) * 1.6;
  const r = 4.4 * s * (2 - stretch);
  const bodyTop = y - 12.5 * s * stretch - hop;
  const bodyBottom = y - 4 * s - hop;
  const lean = dx * 1.3;
  unitShadow(ctx, st, x, y, s);
  ctx.fillStyle = st.shade;
  capsule(ctx, x + 1.4 - dx * 1.2, bodyTop + 1.5, bodyBottom + 1, r);
  ctx.fill();
  ctx.fillStyle = st.mid;
  capsule(ctx, x + lean * 0.3, bodyTop, bodyBottom, r);
  ctx.fill();
  ctx.fillStyle = st.lit;
  capsule(ctx, x + lean * 0.3 - r * 0.45, bodyTop + 0.5, bodyTop + (bodyBottom - bodyTop) * 0.55, r * 0.32);
  ctx.fill();
  // great helm over the face: steel dome, visor slit, lit rim, owner crest
  const hx = x + lean * 0.6;
  const hy = bodyTop - 3.2 * s;
  const m = pal.metal;
  ctx.fillStyle = m.mid;
  ctx.beginPath();
  ctx.arc(hx, hy - 0.3 * s, 4.7 * s, 0, TAU);
  ctx.fill();
  ctx.fillStyle = m.shade;
  ctx.fillRect(hx - 3.6 * s, hy - 0.9 * s, 7.2 * s, 1.5 * s);
  ctx.strokeStyle = m.lit;
  ctx.lineWidth = 1.3 * s;
  ctx.beginPath();
  ctx.arc(hx, hy - 0.3 * s, 3.6 * s, Math.PI * 1.02, Math.PI * 1.6);
  ctx.stroke();
  ctx.fillStyle = st.mid;
  ctx.fillRect(hx - 0.9 * s, hy - 6.6 * s, 1.8 * s, 2.8 * s);
  // kite shield on the travel side: shade rim, owner face, paper boss
  const sx = x + dx * 4 * s + lean * 0.3;
  const top = bodyTop + 0.5 * s;
  const bot = bodyBottom + 3 * s;
  const sw = 3.4 * s;
  const kite = (ox: number, oy: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx - sw + ox, top + 1.5 * s + oy);
    ctx.quadraticCurveTo(sx + ox, top - 1 * s + oy, sx + sw + ox, top + 1.5 * s + oy);
    ctx.lineTo(sx + sw + ox, top + (bot - top) * 0.45 + oy);
    ctx.quadraticCurveTo(sx + sw * 0.6 + ox, bot + oy, sx + ox, bot + 0.8 * s + oy);
    ctx.quadraticCurveTo(sx - sw * 0.6 + ox, bot + oy, sx - sw + ox, top + (bot - top) * 0.45 + oy);
    ctx.closePath();
    ctx.fill();
  };
  kite(0.8, 0.8, st.shade);
  kite(0, 0, st.mid);
  ctx.fillStyle = STRIPE.lit;
  ctx.beginPath();
  ctx.arc(sx - 0.3 * s, top + (bot - top) * 0.42, 1.2 * s, 0, TAU);
  ctx.fill();
}

/**
 * Clockwork robot: boxy owner-coloured torso on piston legs, steel cube head with a glowing visor
 * and an owner antenna light; a stiff piston march instead of squash-and-stretch (≈ 10 fills).
 */
function robotSoldier(ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, x: number, y: number, dx: number, id: number, nowMs: number, motion: boolean, s: number): void {
  const ph = motion ? Math.sin(nowMs / 110 + id * 1.7) : 0;
  const hop = Math.abs(ph) * 1.4;
  const tilt = ph * 0.6 * dx;
  const w = 4.2 * s;
  const top = y - 12 * s - hop;
  const bottom = y - 4 * s - hop;
  unitShadow(ctx, st, x, y, s);
  // piston legs, alternating
  ctx.fillStyle = pal.metal.shade;
  ctx.beginPath();
  ctx.rect(x - 2.8 * s + tilt, bottom - 1, 2.2 * s, 4.6 * s + (ph > 0 ? 1 : 0));
  ctx.rect(x + 0.6 * s - tilt, bottom - 1, 2.2 * s, 4.6 * s - (ph > 0 ? 1 : 0));
  ctx.fill();
  // torso: shade offset, mid, lit strip
  ctx.fillStyle = st.shade;
  roundRect(ctx, { x: x - w + 1.2, y: top + 1.2, w: w * 2, h: bottom - top }, 1.5);
  ctx.fill();
  ctx.fillStyle = st.mid;
  roundRect(ctx, { x: x - w, y: top, w: w * 2, h: bottom - top }, 1.5);
  ctx.fill();
  ctx.fillStyle = st.lit;
  ctx.fillRect(x - w + 0.6 * s, top + 0.6 * s, w * 0.6, (bottom - top) * 0.5);
  // head: steel cube, lit top, glowing visor, antenna
  const hx = x + tilt * 0.5;
  const hy = top - 4.4 * s;
  ctx.fillStyle = pal.metal.mid;
  roundRect(ctx, { x: hx - 3.6 * s, y: hy - 3.2 * s, w: 7.2 * s, h: 6.4 * s }, 1.2 * s);
  ctx.fill();
  ctx.fillStyle = pal.metal.lit;
  ctx.fillRect(hx - 3.6 * s, hy - 3.2 * s, 7.2 * s, 1.2 * s);
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(hx - 2.6 * s, hy - 1 * s, 5.2 * s, 1.8 * s);
  ctx.strokeStyle = st.shade;
  ctx.lineWidth = 1 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx + 2 * s, hy - 3.2 * s);
  ctx.lineTo(hx + 2.6 * s, hy - 6.4 * s);
  ctx.stroke();
  ctx.fillStyle = st.lit;
  ctx.beginPath();
  ctx.arc(hx + 2.6 * s, hy - 6.8 * s, 1.2 * s, 0, TAU);
  ctx.fill();
}

/** Treads + hull shared by both tank shapes; `corner` is the hull radius (3 clay, 1 robot). */
function tankBase(ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, x: number, y: number, s: number, rock: number, corner: number): void {
  ctx.fillStyle = st.shadow;
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 5, s + 3, s * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = pal.metal.shade;
  roundRect(ctx, { x: x - s - 1, y: y - s * 0.55 + rock * 0.3, w: s * 2 + 2, h: s * 1.2 }, 3);
  ctx.fill();
  ctx.fillStyle = st.shade;
  roundRect(ctx, { x: x - s + 3.5, y: y - s * 0.85 + rock + 1.5, w: s * 2 - 4, h: s * 1.25 }, corner);
  ctx.fill();
  ctx.fillStyle = st.mid;
  roundRect(ctx, { x: x - s + 2, y: y - s * 0.85 + rock, w: s * 2 - 4, h: s * 1.25 }, corner);
  ctx.fill();
  ctx.fillStyle = st.lit;
  roundRect(ctx, { x: x - s + 2, y: y - s * 0.85 + rock, w: s * 2 - 4, h: s * 0.35 }, corner);
  ctx.fill();
}

/** War wagon: the clay tank with three owner shield plates hung on the hull and a pennant on the turret. */
function shieldTank(ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, x: number, y: number, dx: number, dy: number, id: number, nowMs: number, motion: boolean, scale: number): void {
  const s = TANK_RADIUS * scale;
  const rock = motion ? Math.sin(nowMs / 160 + id) * 0.9 : 0;
  tankBase(ctx, pal, st, x, y, s, rock, 3);
  for (let i = 0; i < 3; i++) {
    const px = x - s + 3 + i * s * 0.62;
    const py = y - s * 0.2 + rock;
    ctx.fillStyle = st.shade;
    roundRect(ctx, { x: px + 0.6, y: py + 0.6, w: s * 0.5, h: s * 0.62 }, 2);
    ctx.fill();
    ctx.fillStyle = st.lit;
    roundRect(ctx, { x: px, y: py, w: s * 0.5, h: s * 0.62 }, 2);
    ctx.fill();
    ctx.fillStyle = STRIPE.lit;
    ctx.beginPath();
    ctx.arc(px + s * 0.25, py + s * 0.28, s * 0.09, 0, TAU);
    ctx.fill();
  }
  const ty = y - s * 0.45 + rock;
  ctx.fillStyle = st.shade;
  ctx.beginPath();
  ctx.arc(x, ty, s * 0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.metal.shade;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, ty);
  ctx.lineTo(x + dx * s * 1.35, ty + dy * s * 1.35);
  ctx.stroke();
  // pennant
  ctx.strokeStyle = pal.stoneTones.shade;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 1, ty);
  ctx.lineTo(x - 1, ty - s * 0.9);
  ctx.stroke();
  ctx.fillStyle = st.lit;
  ctx.beginPath();
  ctx.moveTo(x - 1, ty - s * 0.9);
  ctx.lineTo(x + s * 0.45, ty - s * 0.72);
  ctx.lineTo(x - 1, ty - s * 0.54);
  ctx.closePath();
  ctx.fill();
}

/** Crawler: squared hull, cube turret with twin barrels, a glowing sensor bar and an antenna light. */
function robotTank(ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, x: number, y: number, dx: number, dy: number, id: number, nowMs: number, motion: boolean, scale: number): void {
  const s = TANK_RADIUS * scale;
  const rock = motion ? Math.sin(nowMs / 160 + id) * 0.9 : 0;
  tankBase(ctx, pal, st, x, y, s, rock, 1);
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(x - s * 0.55, y + rock, s * 1.1, s * 0.16);
  const ty = y - s * 0.5 + rock;
  ctx.fillStyle = st.shade;
  roundRect(ctx, { x: x - s * 0.5, y: ty - s * 0.4, w: s, h: s * 0.8 }, 1.5);
  ctx.fill();
  ctx.fillStyle = pal.metal.lit;
  ctx.fillRect(x - s * 0.5, ty - s * 0.4, s, s * 0.14);
  // twin barrels either side of the heading
  const nx = -dy * s * 0.2;
  const ny = dx * s * 0.2;
  ctx.strokeStyle = pal.metal.shade;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + nx, ty + ny);
  ctx.lineTo(x + nx + dx * s * 1.3, ty + ny + dy * s * 1.3);
  ctx.moveTo(x - nx, ty - ny);
  ctx.lineTo(x - nx + dx * s * 1.3, ty - ny + dy * s * 1.3);
  ctx.stroke();
  ctx.fillStyle = st.lit;
  ctx.beginPath();
  ctx.arc(x - s * 0.3, ty - s * 0.6, s * 0.14, 0, TAU);
  ctx.fill();
}

/* ---------- registry ---------- */

/* ---------- cosmetic roof parts and helmets (moved from sprites.ts: only equipped skins draw them) ---------- */

/**
 * Owner-coloured trim under a skinned roof's eave (drawn before the roof, so only its front rim
 * shows): a shade ellipse with a mid ellipse on top and a lit sliver on the upper-left.
 */
function ownerBand(ctx: CanvasRenderingContext2D, tones: Tones, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.ellipse(x, y + 3, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = tones.lit;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, rx - 1, ry - 1, 0, Math.PI * 0.6, Math.PI * 1.1);
  ctx.stroke();
}

/**
 * Tent skin: every other wedge of a cone's front half in canvas, lit on the left and shaded on the
 * right (same facet construction as `cone` in sprites.ts, drawn over its three facets).
 */
function coneStripes(ctx: CanvasRenderingContext2D, x: number, base: number, apex: number, rx: number, ry: number, stripes: Tones): void {
  const n = 6;
  for (let i = 1; i < n; i += 2) {
    const a0 = Math.PI - (i / n) * Math.PI;
    const a1 = Math.PI - ((i + 1) / n) * Math.PI;
    ctx.fillStyle = a0 > Math.PI * 0.6 ? stripes.lit : a0 > Math.PI * 0.4 ? stripes.mid : stripes.shade;
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x + Math.cos(a0) * rx, base + Math.sin(a0) * ry);
    ctx.ellipse(x, base, rx, ry, 0, a0, a1, true);
    ctx.closePath();
    ctx.fill();
  }
}

/** Tent skin on a half-dome (artillery): alternate canvas wedges over the dome's facets. */
function domeStripes(ctx: CanvasRenderingContext2D, x: number, base: number, rx: number, ry: number, stripes: Tones): void {
  const n = 6;
  for (let i = 1; i < n; i += 2) {
    const a0 = Math.PI + (i / n) * Math.PI;
    const a1 = Math.PI + ((i + 1) / n) * Math.PI;
    ctx.fillStyle = i < 2 ? stripes.lit : i < 4 ? stripes.mid : stripes.shade;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.ellipse(x, base, rx, ry, 0, a0, a1, false);
    ctx.closePath();
    ctx.fill();
  }
}

/** Blue-grey slate tiles (lighter and bluer than the gun-metal iron roof). */
const SLATE: Tones = { lit: '#b3bede', mid: '#7481ad', shade: '#4d5578' };

/** How a roof material changes the owner-coloured roof (`sprites.ts roofStyle` for the default look). */
function roofStyle(pal: Palette, owner: Tones, id: string): RoofStyle {
  switch (id) {
    case 'roof.gold':
      return { tones: pal.goldTones, shape: 'dome', rivets: false, shingles: false, band: true };
    case 'roof.iron':
      return { tones: pal.metal, shape: 'cone', rivets: true, shingles: false, band: true };
    case 'roof.slate':
      return { tones: SLATE, shape: 'cone', rivets: false, shingles: true, band: true };
    case 'roof.tent':
      return { tones: owner, stripes: STRIPE, shape: 'cone', rivets: false, shingles: false, band: false };
    case 'roof.pagoda':
      return { tones: owner, shape: 'pagoda', rivets: false, shingles: false, band: false };
    case 'roof.onion':
      return { tones: owner, shape: 'onion', rivets: false, shingles: false, band: false };
    default:
      return { tones: owner, shape: 'cone', rivets: false, shingles: false, band: false };
  }
}

/** Gold skin on a tower: eave in the roof material, then the half-dome, then a finial ball. */
function domeRoof(ctx: CanvasRenderingContext2D, tones: Tones, x: number, base: number, height: number, rx: number, ry: number, stripes?: Tones): void {
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.ellipse(x, base, rx + 3, ry + 1.5, 0, 0, TAU);
  ctx.fill();
  dome(ctx, tones, x, base, rx * 0.9, height * 0.95, stripes);
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.arc(x, base - height * 0.95 - 2, 3.5, 0, TAU);
  ctx.fill();
}

/** Onion skin on a factory: a flat deck strip with the bulb off-centre on it. */
function factoryOnion(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, pulse: number, hw: number): void {
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x - hw, top - 4, hw * 2, 4);
  ctx.fillStyle = tones.mid;
  ctx.fillRect(x - hw, top - 6, hw * 2, 4);
  onion(ctx, pal, tones, x - hw * 0.19, top - 6, 22 * pulse * (hw / 32), 15 * pulse * (hw / 32), 5 * (hw / 32));
}

/** Iron skin on a factory: four rivet dots along the deck strip. */
function factoryRivets(ctx: CanvasRenderingContext2D, tones: Tones, x: number, top: number, hw: number): void {
  ctx.fillStyle = tones.lit;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x - hw * 0.75 + i * hw * 0.5, top - 5, 1.6, 0, TAU);
    ctx.fill();
  }
}

/** Saw-tooth roof row across a factory deck in a skin material: `n` teeth over `x-hw..x+hw` rising `h` from `top`, tent stripes on every other tooth, slate courses across them (the default teeth: sprites.ts). */
function sawTeeth(ctx: CanvasRenderingContext2D, style: RoofStyle, x: number, top: number, hw: number, n: number, h: number, dim = false): void {
  const rt = style.tones;
  const tw = (hw * 2) / n;
  for (let i = 0; i < n; i++) {
    const sx = x - hw + i * tw;
    const striped = style.stripes && i % 2 === 1;
    ctx.fillStyle = dim ? rt.shade : striped ? style.stripes!.mid : rt.mid;
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + tw * 0.4, top - h);
    ctx.lineTo(sx + tw, top);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dim ? rt.mid : striped ? style.stripes!.lit : rt.lit;
    ctx.beginPath();
    ctx.moveTo(sx, top);
    ctx.lineTo(sx + tw * 0.4, top - h);
    ctx.lineTo(sx + tw * 0.4, top);
    ctx.closePath();
    ctx.fill();
    if (style.shingles && !dim) {
      ctx.strokeStyle = INK_LINE;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const hh of [h * 0.3, h * 0.6]) {
        ctx.moveTo(sx + (tw * 0.4 * hh) / h, top - hh);
        ctx.lineTo(sx + tw - (tw * 0.6 * hh) / h, top - hh);
      }
      ctx.stroke();
    }
  }
}

/** Bronze helmet clay. */
const BRONZE: Tones = { lit: '#f0c070', mid: '#c98a3e', shade: '#8a5a24' };

/** Rivet dots along an eave (iron skin). */
function rivets(ctx: CanvasRenderingContext2D, tones: Tones, x: number, y: number, rx: number, ry: number): void {
  ctx.fillStyle = tones.lit;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + ((i + 0.5) / 5) * Math.PI;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * rx * 0.85, y + Math.sin(a) * ry * 0.85 - 2, 1.6, 0, TAU);
    ctx.fill();
  }
}

/** Tile courses across the front of a cone (slate skin): ink lines with a lit edge on the left. */
function shingles(ctx: CanvasRenderingContext2D, tones: Tones, x: number, base: number, height: number, rx: number, ry: number): void {
  ctx.lineCap = 'butt';
  for (const f of [0.22, 0.44, 0.66]) {
    const k = 1 - f;
    const cy = base - height * f;
    ctx.strokeStyle = tones.shade;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(x, cy, rx * k, ry * k, 0, 0.05, Math.PI - 0.05);
    ctx.stroke();
    ctx.strokeStyle = tones.lit;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, cy - 1.5, rx * k, ry * k, 0, Math.PI * 0.5, Math.PI * 0.95);
    ctx.stroke();
  }
}

/** Gold finial: short spike topped by a ball (pagoda / onion). */
function finial(ctx: CanvasRenderingContext2D, pal: Palette, x: number, apex: number, size: number): void {
  ctx.strokeStyle = pal.goldShade;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, size * 0.5);
  ctx.beginPath();
  ctx.moveTo(x, apex + 1);
  ctx.lineTo(x, apex - size * 1.6);
  ctx.stroke();
  ctx.fillStyle = pal.goldShade;
  ctx.beginPath();
  ctx.arc(x + size * 0.15, apex - size * 1.6 + size * 0.2, size, 0, TAU);
  ctx.fill();
  ctx.fillStyle = pal.gold;
  ctx.beginPath();
  ctx.arc(x, apex - size * 1.6, size, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(x - size * 0.3, apex - size * 1.6 - size * 0.3, size * 0.35, 0, TAU);
  ctx.fill();
}

/** Front eave lip whose ends curl upward (pagoda): shade lip, then a lit rim just above it. */
function eaveLip(ctx: CanvasRenderingContext2D, tones: Tones, x: number, b: number, rx: number, ry: number): void {
  ctx.lineCap = 'round';
  for (const [dy, w, color] of [
    [0, 3.2, tones.shade],
    [-1.2, 1.4, tones.lit],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x - rx - 4, b - 5 + dy);
    ctx.quadraticCurveTo(x - rx + 2, b + ry * 1.05 + dy, x, b + ry + 1 + dy);
    ctx.quadraticCurveTo(x + rx - 2, b + ry * 1.05 + dy, x + rx + 4, b - 5 + dy);
    ctx.stroke();
  }
}

/**
 * Pagoda: `tiers` stacked cone eaves shrinking upward with short stone walls between them, the
 * eave ends curling up, a gold finial on top. Total height ≈ `height` × 1.05, so the badge clears it.
 */
function pagoda(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, base: number, height: number, rx: number, ry: number, tiers = 3): void {
  const step = tiers === 2 ? 0.4 : 0.27;
  const eave = tiers === 2 ? 0.42 : 0.26;
  const shrink = tiers === 2 ? 0.34 : 0.28;
  let apex = base;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * shrink;
    const b = base - i * height * step;
    const trx = rx * k + 2;
    const try_ = Math.max(2, ry * k);
    apex = b - height * eave;
    cone(ctx, tones, x, b, apex, trx, try_);
    eaveLip(ctx, tones, x, b, trx, try_);
    if (i < tiers - 1) {
      // wall stub carrying the next tier
      const nrx = (rx * (1 - (i + 1) * shrink) + 2) * 0.78;
      cylinder(ctx, pal.stoneTones, x, b - height * step - 1, b - height * eave * 0.55, nrx, Math.max(1.5, try_ * 0.6), 0, 0.15);
    }
  }
  finial(ctx, pal, x, apex + 1, Math.max(2.2, rx * 0.11));
}

/**
 * Onion dome: a bulb that swells past the eave then draws to a point, three vertical tone bands,
 * faint rib lines, a rim light on the upper-left and a gold finial. Height ≈ `height` × 1.05.
 */
function onion(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, base: number, height: number, rx: number, ry: number): void {
  const h = height * 0.98;
  const bulge = rx * 1.2;
  const rb = rx * 0.9;
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(x - rb, base);
    ctx.bezierCurveTo(x - bulge * 1.2, base - h * 0.4, x - rx * 0.36, base - h * 0.74, x, base - h);
    ctx.bezierCurveTo(x + rx * 0.36, base - h * 0.74, x + bulge * 1.2, base - h * 0.4, x + rb, base);
    ctx.ellipse(x, base, rb, ry, 0, 0, Math.PI, false);
    ctx.closePath();
  };
  // eave underside
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.ellipse(x, base, rx + 3, ry + 1.5, 0, 0, TAU);
  ctx.fill();
  trace();
  ctx.fillStyle = tones.mid;
  ctx.fill();
  ctx.save();
  trace();
  ctx.clip();
  ctx.fillStyle = tones.lit;
  ctx.fillRect(x - bulge - 4, base - h - 4, bulge + 4 - rx * 0.42, h + ry + 8);
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x + rx * 0.3, base - h - 4, bulge + 4, h + ry + 8);
  // ribs
  ctx.strokeStyle = INK_LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const f of [-0.5, 0, 0.5]) {
    ctx.moveTo(x, base - h + 2);
    ctx.quadraticCurveTo(x + bulge * f * 1.3, base - h * 0.45, x + rb * f, base + ry * 0.9);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 2, base - h + 4);
  ctx.bezierCurveTo(x - rx * 0.4, base - h * 0.72, x - bulge * 1.05, base - h * 0.42, x - rb + 2, base - 1);
  ctx.stroke();
  finial(ctx, pal, x, base - h + 1, Math.max(2.2, rx * 0.11));
}

/** Two-tier hip roof with curling eaves across the factory deck (pagoda skin); `hw` = deck half width. */
function factoryPagoda(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, pulse: number, hw = 32): void {
  const tier_ = (b: number, w0: number, w1: number, h: number): void => {
    // underside lip, mid face, lit left facet, shade right facet
    ctx.fillStyle = tones.shade;
    ctx.fillRect(x - w0 - 2, b - 1, (w0 + 2) * 2, 4);
    ctx.fillStyle = tones.mid;
    ctx.beginPath();
    ctx.moveTo(x - w0, b);
    ctx.lineTo(x - w1, b - h);
    ctx.lineTo(x + w1, b - h);
    ctx.lineTo(x + w0, b);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tones.lit;
    ctx.beginPath();
    ctx.moveTo(x - w0, b);
    ctx.lineTo(x - w1, b - h);
    ctx.lineTo(x - w1 + 8, b - h);
    ctx.lineTo(x - w0 + 10, b);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tones.shade;
    ctx.beginPath();
    ctx.moveTo(x + w0, b);
    ctx.lineTo(x + w1, b - h);
    ctx.lineTo(x + w1 - 6, b - h);
    ctx.lineTo(x + w0 - 8, b);
    ctx.closePath();
    ctx.fill();
    // curling eave ends
    ctx.lineCap = 'round';
    ctx.strokeStyle = tones.shade;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(x - w0 - 5, b - 5);
    ctx.quadraticCurveTo(x - w0 + 1, b + 2, x, b + 2);
    ctx.quadraticCurveTo(x + w0 - 1, b + 2, x + w0 + 5, b - 5);
    ctx.stroke();
    ctx.strokeStyle = tones.lit;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - w0 - 5, b - 6);
    ctx.quadraticCurveTo(x - w0 + 1, b + 1, x, b + 1);
    ctx.stroke();
  };
  const s = hw / 32;
  tier_(top, 38 * s, 26 * s, 11 * pulse * s);
  // wall stub
  ctx.fillStyle = pal.stoneTones.mid;
  ctx.fillRect(x - 20 * s, top - 16 * pulse * s, 40 * s, 6 * pulse * s);
  ctx.fillStyle = pal.stoneTones.lit;
  ctx.fillRect(x - 20 * s, top - 16 * pulse * s, 6 * s, 6 * pulse * s);
  tier_(top - 15 * pulse * s, 24 * s, 10 * s, 10 * pulse * s);
  // ridge + finial
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x - 11 * s, top - 27 * pulse * s, 22 * s, 3);
  finial(ctx, pal, x, top - 26 * pulse * s, 2.4 * s);
}

/** Cream plume trailing back from the crest (2 strokes: shade outline + paper). */
function plume(ctx: CanvasRenderingContext2D, outline: string, px: number, py: number, back: number, s: number, big = 1): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 3.6 * s * big;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.quadraticCurveTo(px + back * 0.3, py - 5 * s * big, px + back, py - 3 * s * big);
  ctx.stroke();
  ctx.strokeStyle = STRIPE.lit;
  ctx.lineWidth = 2 * s * big;
  ctx.stroke();
}

/**
 * Helmet skins at soldier scale (`s` = 1 is a 20 px soldier, ≈ 10 px on a 360 px phone), so each
 * one is a colour plus a single silhouette feature: bronze = bronze cap + nose guard, viking =
 * cream horns, knight = steel great helm with a visor slit, samurai = wide brim + gold crest,
 * royal = gold rim + plume. Bodies stay owner-coloured so ownership never depends on the helmet.
 */
function drawHelmet(ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, id: string, hx: number, hy: number, s: number, dx: number): void {
  const capY = hy - 0.8 * s;
  const cap = (color: string, r = 4.5 * s): void => helmetCap(ctx, color, hx, capY, r);
  switch (id) {
    case 'helmet.plume':
      cap(st.helmet);
      plume(ctx, st.shade, hx, hy - 5 * s, -dx * 6 * s, s);
      break;
    case 'helmet.bronze':
      cap(BRONZE.mid);
      ctx.strokeStyle = BRONZE.lit;
      ctx.lineWidth = 1.3 * s;
      ctx.beginPath();
      ctx.arc(hx, capY, 3.4 * s, Math.PI * 1.05, Math.PI * 1.6);
      ctx.stroke();
      // nose guard
      ctx.fillStyle = BRONZE.shade;
      ctx.fillRect(hx - 0.6 * s, capY - 0.5 * s, 1.2 * s, 3.4 * s);
      break;
    case 'helmet.viking': {
      cap(st.helmet);
      // two cream horns curving outward and up
      ctx.lineCap = 'round';
      for (const [w, color] of [
        [2.6 * s, st.shade],
        [1.4 * s, STRIPE.lit],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(hx - 3.4 * s, capY - 1.2 * s);
        ctx.quadraticCurveTo(hx - 6.2 * s, capY - 2.2 * s, hx - 5.2 * s, capY - 6 * s);
        ctx.moveTo(hx + 3.4 * s, capY - 1.2 * s);
        ctx.quadraticCurveTo(hx + 6.2 * s, capY - 2.2 * s, hx + 5.2 * s, capY - 6 * s);
        ctx.stroke();
      }
      break;
    }
    case 'helmet.knight': {
      // full steel helm over the face, dark visor slit, lit rim, owner-coloured crest ridge
      const m = pal.metal;
      ctx.fillStyle = m.mid;
      ctx.beginPath();
      ctx.arc(hx, hy - 0.3 * s, 4.7 * s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = m.shade;
      ctx.fillRect(hx - 3.6 * s, hy - 0.9 * s, 7.2 * s, 1.5 * s);
      ctx.strokeStyle = m.lit;
      ctx.lineWidth = 1.3 * s;
      ctx.beginPath();
      ctx.arc(hx, hy - 0.3 * s, 3.6 * s, Math.PI * 1.02, Math.PI * 1.6);
      ctx.stroke();
      ctx.fillStyle = st.mid;
      ctx.fillRect(hx - 0.9 * s, hy - 6.4 * s, 1.8 * s, 2.6 * s);
      break;
    }
    case 'helmet.samurai': {
      // wide flared brim under the cap and a gold crescent crest above it
      ctx.fillStyle = st.shade;
      ctx.beginPath();
      ctx.ellipse(hx, capY + 0.9 * s, 6.4 * s, 1.7 * s, 0, 0, TAU);
      ctx.fill();
      cap(st.helmet);
      ctx.strokeStyle = st.lit;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      ctx.ellipse(hx, capY + 0.5 * s, 6 * s, 1.5 * s, 0, Math.PI * 1.05, Math.PI * 1.5);
      ctx.stroke();
      ctx.lineCap = 'round';
      for (const [w, color] of [
        [2.4 * s, pal.goldShade],
        [1.2 * s, pal.gold],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(hx, capY - 3 * s);
        ctx.quadraticCurveTo(hx - 2.6 * s, capY - 4.4 * s, hx - 4 * s, capY - 7.2 * s);
        ctx.moveTo(hx, capY - 3 * s);
        ctx.quadraticCurveTo(hx + 2.6 * s, capY - 4.4 * s, hx + 4 * s, capY - 7.2 * s);
        ctx.stroke();
      }
      break;
    }
    case 'helmet.royal':
      cap(st.helmet);
      // gold rim along the cap edge (shade under, gold on top) and a taller plume
      ctx.lineCap = 'butt';
      ctx.strokeStyle = pal.goldShade;
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(hx, capY + 0.4 * s, 4.2 * s, Math.PI * 0.98, Math.PI * 2.02);
      ctx.stroke();
      ctx.strokeStyle = pal.gold;
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.arc(hx, capY, 4.2 * s, Math.PI * 0.98, Math.PI * 2.02);
      ctx.stroke();
      plume(ctx, pal.goldShade, hx, hy - 5.2 * s, -dx * 7 * s, s, 1.2);
      break;
    default:
      cap(st.helmet);
  }
}

export const SHAPE_SKINS: ShapeSkinDrawers = {
  roofStyle,
  ownerBand,
  coneStripes,
  domeStripes,
  pagoda,
  onion,
  factoryPagoda,
  factoryOnion,
  factoryRivets,
  domeRoof,
  sawTeeth,
  shingles,
  rivets,
  helmet: drawHelmet,
  tower(ctx, pal, tones, kind, x, y, level, o, skinId) {
    if (skinId === 'tower.watchtower') drawWatchtower(ctx, pal, tones, kind, x, y, level, o);
    else drawKeep(ctx, pal, tones, kind, x, y, level, o);
  },
  unit(ctx, pal, st, x, y, kind: UnitKind, dx, dy, id, nowMs, motion, scale, skinId) {
    const robots = skinId === 'unit.robots';
    if (kind === 'tank') {
      if (robots) robotTank(ctx, pal, st, x, y, dx, dy, id, nowMs, motion, scale);
      else shieldTank(ctx, pal, st, x, y, dx, dy, id, nowMs, motion, scale);
    } else if (robots) robotSoldier(ctx, pal, st, x, y, dx, id, nowMs, motion, scale);
    else shieldSoldier(ctx, pal, st, x, y, dx, id, nowMs, motion, scale);
  },
};
