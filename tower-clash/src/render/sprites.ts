import type { Owner, TowerKind, UnitKind } from '../sim/types';
import type { Palette, Tones } from './palette';
import { shade } from './palette';
import { TANK_RADIUS } from './layout';
import { font, roundRect } from './widgets';
import { SHADOW_DX, SHADOW_DY } from './terrain';
import { chunkBackoff, loadChunk } from '../lazyChunk';

/*
 * Clay building and soldier sprites (ART_DIRECTION §3), canvas primitives only. Anchor (x, y) is
 * the ground point the sim uses; buildings rise above it, shadows fall to the lower-right from the
 * upper-left key light. Every material is three flat tones + a rim light on the lit edge — no
 * gradients, so 400 units stay cheap. Used by draw.ts (play) and menus.ts (title ambience).
 */

export interface TowerLook {
  x: number;
  y: number;
  owner: Owner;
  kind: TowerKind;
  level: number;
}

export interface TowerDrawOptions {
  nowMs: number;
  /** Animate flags / smoke / glints (false under prefers-reduced-motion). */
  motion: boolean;
  /** Lift the building a few px (selected). */
  raised?: boolean;
  /** 0..1 roof pulse (upgrade: roof scales 1.15 → 1). */
  pulse?: number;
  /** Vertical squash factor (capture: 0.85 then back to 1). */
  squash?: number;
  /** Capture wipe: previous owner and 0..1 progress of the radial colour swap. */
  wipe?: { from: Owner; t: number };
  /** Artillery barrel direction (radians, screen space). Defaults to upper-right. */
  aim?: number;
  /** Cosmetic skin ids (shop). Unknown / missing ids draw the default look. */
  skin?: TowerSkin;
}

/**
 * Equipped cosmetics as the renderer wants them (`ROOF_SKINS`, `HELMET_SKINS`, `THEME_IDS`).
 * Catalog → sprite: roof_slate → roof.slate, roof_pagoda → roof.pagoda, roof_onion → roof.onion,
 * roof_gold → roof.gold; helmet_bronze / viking / knight / samurai / royal → helmet.<same>;
 * theme_dusk → theme.dusk, theme_winter_night → theme.winter_night, theme_neon → theme.neon.
 * Unknown / missing ids draw the default look.
 */
export interface TowerSkin {
  roof?: string;
  helmet?: string;
  /** Terrain theme id, applied through `TerrainSpec.theme`. */
  theme?: string;
}

/** Values of `TowerSkin.roof`: roof materials, plus the tower silhouettes (`tower.*`, M3-2) that replace the whole building. */
export const ROOF_SKINS = ['roof.default', 'roof.gold', 'roof.iron', 'roof.slate', 'roof.tent', 'roof.pagoda', 'roof.onion', 'tower.keep', 'tower.watchtower'] as const;
/** Values of `TowerSkin.helmet`: helmets, plus the unit silhouettes (`unit.*`, M3-2) that reshape soldiers and tanks. */
export const HELMET_SKINS = ['helmet.default', 'helmet.plume', 'helmet.bronze', 'helmet.viking', 'helmet.knight', 'helmet.samurai', 'helmet.royal', 'unit.shieldwall', 'unit.robots'] as const;
export { THEME_IDS } from './palette';

/*
 * Silhouette skins (`tower.*` / `unit.*`) are drawn by src/render/skinShapes.ts, a lazy chunk
 * (the eager bundle sits on its 80 kB budget). The first draw that needs one kicks off the import
 * and falls back to the default look until it lands — a frame or two on first use; the shop preview
 * and `loadShapeSkins()` warm it earlier.
 */
export interface ShapeSkinDrawers {
  tower: (ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, kind: TowerKind, x: number, y: number, level: number, o: TowerDrawOptions, skinId: string) => void;
  unit: (ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, x: number, y: number, kind: UnitKind, dx: number, dy: number, id: number, nowMs: number, motion: boolean, scale: number, skinId: string) => void;
}

const SKIN_CHUNK = 'skinShapes';
let shapeSkins: ShapeSkinDrawers | null = null;
let shapeSkinsPromise: Promise<ShapeSkinDrawers> | null = null;

/** True for the silhouette skin ids that live in the lazy chunk. */
export function isShapeSkin(id: string | undefined): id is string {
  return id !== undefined && (id.startsWith('tower.') || id.startsWith('unit.'));
}

/**
 * Load the silhouette skin drawers (idempotent; resolves immediately once loaded; a failed fetch
 * is retried on the next call — src/lazyChunk.ts re-fetches under a fresh URL).
 */
export function loadShapeSkins(): Promise<ShapeSkinDrawers> {
  shapeSkinsPromise ??= loadChunk(SKIN_CHUNK, () => import('./skinShapes'))
    .then((m) => (shapeSkins = m.SHAPE_SKINS))
    .catch((err: unknown) => {
      shapeSkinsPromise = null; // a failed download is forgotten so the next draw / call retries
      throw err;
    });
  return shapeSkinsPromise;
}

/**
 * The drawers if loaded; otherwise starts the load and returns null (caller draws the default
 * look). Draw time backs off for a few seconds after a failure instead of hitting the network
 * every frame.
 */
function shapeSkinsNow(): ShapeSkinDrawers | null {
  if (!shapeSkins && !chunkBackoff(SKIN_CHUNK)) void loadShapeSkins().catch(() => undefined);
  return shapeSkins;
}

export const RIM = 'rgba(255, 250, 240, 0.55)';
export const INK_LINE = 'rgba(30, 42, 68, 0.18)';
export const TAU = Math.PI * 2;
/** Cream canvas stripes of the tent skin (paper, and paper in shadow). */
export const STRIPE: Tones = { lit: '#fffaf0', mid: '#fff3dc', shade: '#e2d3b8' };
/** Blue-grey slate tiles (lighter and bluer than the gun-metal iron roof). */
const SLATE: Tones = { lit: '#b3bede', mid: '#7481ad', shade: '#4d5578' };
/** Bronze helmet clay. */
const BRONZE: Tones = { lit: '#f0c070', mid: '#c98a3e', shade: '#8a5a24' };

/**
 * How a skin changes the owner-coloured roof. Every non-default material keeps an owner-coloured
 * band at the roof base (and the flag) so ownership still reads at a glance in both palettes.
 */
type RoofShape = 'cone' | 'dome' | 'pagoda' | 'onion';

interface RoofStyle {
  tones: Tones;
  /** Alternate facets in these tones (tent). */
  stripes?: Tones;
  /** Silhouette: cone (default / iron / slate / tent), half-dome (gold), tiered eaves, onion bulb. */
  shape: RoofShape;
  /** Rivet dots along the eave (iron). */
  rivets: boolean;
  /** Tile course lines (slate). */
  shingles: boolean;
  /** Owner band under the roof. */
  band: boolean;
}

function roofStyle(pal: Palette, owner: Tones, skin?: TowerSkin): RoofStyle {
  switch (skin?.roof) {
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

/** Level index 0..2 clamped, for the per-level geometry tables. */
export function tier(level: number): 0 | 1 | 2 {
  return level >= 3 ? 2 : level === 2 ? 1 : 0;
}

/**
 * Top of the sprite above the anchor, per kind and level (badge sits above this). Rules v2: L1 is
 * a small single tower, L2 taller with a storey ledge and a banner, L3 a keep with battlements
 * and a double roof — so the silhouette alone tells the level at a glance.
 */
const TOWER_TOP: Record<TowerKind, readonly [number, number, number]> = {
  barracks: [80, 110, 136],
  fortress: [74, 94, 134],
  artillery: [44, 58, 70],
  tankFactory: [66, 78, 96],
};

export function towerTop(kind: TowerKind, level = 1): number {
  return TOWER_TOP[kind][tier(level)];
}

/** Centre of the unit-count badge for a tower. */
export function badgeY(kind: TowerKind, level = 1): number {
  return -towerTop(kind, level) - 18;
}

/** Radius / height used for the ground shadow of each kind and level. */
function footprint(kind: TowerKind, level: number): { r: number; h: number } {
  const k = tier(level);
  switch (kind) {
    case 'artillery':
      return { r: [36, 40, 46][k]!, h: [26, 34, 42][k]! };
    case 'tankFactory':
      return { r: [34, 38, 46][k]!, h: [40, 52, 66][k]! };
    case 'fortress':
      return { r: [44, 46, 52][k]!, h: [50, 62, 88][k]! };
    default:
      return { r: [28, 32, 40][k]!, h: [54, 70, 92][k]! };
  }
}

/** Ground radius of a building's base (plinth / wall ring), so ribbons and rings can clear it. */
export function towerFootprintRadius(kind: TowerKind, level = 1): number {
  return footprint(kind, level).r;
}

/** Long directional shadow + contact shadow, as one path so the overlap stays a single tone. */
export function drawTowerShadow(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, kind: TowerKind, level = 1): void {
  const { r, h } = footprint(kind, level);
  const ry = r * 0.42;
  const dx = h * SHADOW_DX;
  const dy = h * SHADOW_DY;
  const r2 = r * 0.62;
  const ry2 = ry * 0.62;
  ctx.fillStyle = pal.objectShadow;
  ctx.beginPath();
  ctx.moveTo(x + r, y + 6);
  ctx.ellipse(x, y + 6, r, ry, 0, 0, Math.PI * 2);
  ctx.moveTo(x + dx + r2, y + 6 + dy);
  ctx.ellipse(x + dx, y + 6 + dy, r2, ry2, 0, 0, Math.PI * 2);
  // tapered body between the two discs
  ctx.moveTo(x - r * 0.15, y + 6 - ry);
  ctx.lineTo(x + dx - r2 * 0.2, y + 6 + dy - ry2);
  ctx.lineTo(x + dx + r2 * 0.2, y + 6 + dy + ry2);
  ctx.lineTo(x + r * 0.15, y + 6 + ry);
  ctx.closePath();
  ctx.fill();
  // contact shadow, darker and tight
  ctx.fillStyle = pal.contactShadow;
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 5, r * 0.78, ry * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Clay cylinder: three vertical tone bands, rim light on the left edge, lit top disc. */
export function cylinder(ctx: CanvasRenderingContext2D, tones: Tones, x: number, top: number, bottom: number, r: number, ry: number, rows = 2, topLift = 0.25): void {
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  ctx.moveTo(x - r, top);
  ctx.lineTo(x - r, bottom);
  ctx.ellipse(x, bottom, r, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + r, top);
  ctx.closePath();
  ctx.fill();
  // shade band (right)
  const sx = 0.3;
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.moveTo(x + r * sx, top);
  ctx.lineTo(x + r * sx, bottom + ry * Math.sqrt(1 - sx * sx));
  ctx.ellipse(x, bottom, r, ry, 0, Math.acos(sx), 0, true);
  ctx.lineTo(x + r, top);
  ctx.closePath();
  ctx.fill();
  // lit band (left)
  const lx = -0.5;
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.moveTo(x - r, top);
  ctx.lineTo(x - r, bottom);
  ctx.ellipse(x, bottom, r, ry, 0, Math.PI, Math.acos(lx), true);
  ctx.lineTo(x + r * lx, top);
  ctx.closePath();
  ctx.fill();
  // faint course lines
  if (rows > 0) {
    ctx.strokeStyle = INK_LINE;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i <= rows; i++) {
      const yy = top + ((bottom - top) * i) / (rows + 1);
      ctx.moveTo(x - r + 3, yy);
      ctx.lineTo(x + r - 3, yy);
    }
    ctx.stroke();
  }
  // rim light
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r + 1.5, top + 1);
  ctx.lineTo(x - r + 1.5, bottom);
  ctx.stroke();
  // top disc
  ctx.fillStyle = topLift > 0 ? shade(tones.lit, topLift) : tones.lit;
  ctx.beginPath();
  ctx.ellipse(x, top, r, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Owner-coloured cone roof: three facets, shaded underside, rim light on the lit edge. */
export function cone(ctx: CanvasRenderingContext2D, tones: Tones, x: number, base: number, apex: number, rx: number, ry: number, stripes?: Tones): void {
  // overhang underside
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.ellipse(x, base, rx + 3, ry + 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const facet = (a0: number, a1: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, apex);
    ctx.lineTo(x + Math.cos(a0) * rx, base + Math.sin(a0) * ry);
    ctx.ellipse(x, base, rx, ry, 0, a0, a1, true);
    ctx.closePath();
    ctx.fill();
  };
  facet(Math.PI, 0, tones.mid);
  facet(Math.PI, Math.PI * 0.68, tones.lit);
  facet(Math.PI * 0.3, 0, tones.shade);
  if (stripes) {
    // every other wedge of the front half in canvas, lit on the left and shaded on the right
    const n = 6;
    for (let i = 1; i < n; i += 2) {
      const a0 = Math.PI - (i / n) * Math.PI;
      const a1 = Math.PI - ((i + 1) / n) * Math.PI;
      facet(a0, a1, a0 > Math.PI * 0.6 ? stripes.lit : a0 > Math.PI * 0.4 ? stripes.mid : stripes.shade);
    }
  }
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 1, apex + 2);
  ctx.lineTo(x - rx + 2, base - 1);
  ctx.stroke();
}

/** Half-dome (gold skin, artillery bunker): three facets and a rim arc on the upper-left. */
function dome(ctx: CanvasRenderingContext2D, tones: Tones, x: number, base: number, rx: number, ry: number, stripes?: Tones): void {
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  ctx.ellipse(x, base, rx, ry, 0, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.ellipse(x, base, rx, ry, 0, -Math.PI * 0.35, 0, false);
  ctx.lineTo(x, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.ellipse(x, base, rx, ry, 0, Math.PI, Math.PI * 1.4, false);
  ctx.lineTo(x, base);
  ctx.closePath();
  ctx.fill();
  if (stripes) {
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
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, base, rx - 2, ry - 2, 0, Math.PI * 1.05, Math.PI * 1.45, false);
  ctx.stroke();
}

/**
 * Owner-coloured trim under a skinned roof's eave (drawn before the roof, so only its front rim
 * shows): a shade ellipse with a mid ellipse on top and a lit sliver on the upper-left.
 */
export function ownerBand(ctx: CanvasRenderingContext2D, tones: Tones, x: number, y: number, rx: number, ry: number): void {
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

/** Cone, dome, pagoda or onion roof per skin, with its owner band / rivets / shingles. */
function roof(ctx: CanvasRenderingContext2D, pal: Palette, owner: Tones, style: RoofStyle, x: number, base: number, height: number, rx: number, ry: number): void {
  if (style.band) ownerBand(ctx, owner, x, base + 2, rx + 4, ry + 2);
  switch (style.shape) {
    case 'dome':
      // eave in the roof material, then the dome, then a finial ball
      ctx.fillStyle = style.tones.shade;
      ctx.beginPath();
      ctx.ellipse(x, base, rx + 3, ry + 1.5, 0, 0, TAU);
      ctx.fill();
      dome(ctx, style.tones, x, base, rx * 0.9, height * 0.95, style.stripes);
      ctx.fillStyle = style.tones.lit;
      ctx.beginPath();
      ctx.arc(x, base - height * 0.95 - 2, 3.5, 0, TAU);
      ctx.fill();
      break;
    case 'pagoda':
      pagoda(ctx, pal, style.tones, x, base, height, rx, ry);
      break;
    case 'onion':
      onion(ctx, pal, style.tones, x, base, height, rx, ry);
      break;
    default:
      cone(ctx, style.tones, x, base, base - height, rx, ry, style.stripes);
      if (style.shingles) shingles(ctx, style.tones, x, base, height, rx, ry);
  }
  if (style.rivets) rivets(ctx, style.tones, x, base, rx, ry);
}

/** Flag on a pole; the free edge waves. */
export function flag(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, height: number, nowMs: number, motion: boolean): void {
  ctx.strokeStyle = pal.stoneTones.shade;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, top + height);
  ctx.lineTo(x, top);
  ctx.stroke();
  const w = motion ? Math.sin(nowMs / 140 + x * 0.3) * 3 : 0;
  const w2 = motion ? Math.cos(nowMs / 140 + x * 0.3) * 2 : 0;
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  ctx.moveTo(x + 1, top);
  ctx.quadraticCurveTo(x + 12, top + 3 + w, x + 23, top + 1 + w2);
  ctx.lineTo(x + 23, top + 13 + w2);
  ctx.quadraticCurveTo(x + 12, top + 15 + w, x + 1, top + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.moveTo(x + 1, top);
  ctx.quadraticCurveTo(x + 8, top + 2 + w * 0.6, x + 12, top + 3 + w);
  ctx.lineTo(x + 12, top + 6 + w);
  ctx.quadraticCurveTo(x + 8, top + 5 + w * 0.6, x + 1, top + 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.gold;
  ctx.beginPath();
  ctx.arc(x, top - 1.5, 3, 0, Math.PI * 2);
  ctx.fill();
}

/** 1–3 gold gems set into a plinth front, with a travelling glint. */
export function gems(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, level: number, nowMs: number, motion: boolean): void {
  const glint = motion ? ((nowMs / 1400 + x * 0.01) % 1) * (level + 1) - 0.5 : -1;
  for (let i = 0; i < level; i++) {
    const px = x + (i - (level - 1) / 2) * 14;
    ctx.fillStyle = pal.goldShade;
    ctx.beginPath();
    ctx.moveTo(px, y - 6);
    ctx.lineTo(px + 6, y);
    ctx.lineTo(px, y + 6);
    ctx.lineTo(px - 6, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.gold;
    ctx.beginPath();
    ctx.moveTo(px, y - 6);
    ctx.lineTo(px + 6, y);
    ctx.lineTo(px - 6, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.moveTo(px, y - 6);
    ctx.lineTo(px - 6, y);
    ctx.lineTo(px - 2, y - 1.5);
    ctx.closePath();
    ctx.fill();
    const g = 1 - Math.min(1, Math.abs(glint - i) * 2.5);
    if (g > 0) {
      ctx.fillStyle = `rgba(255,255,255,${g})`;
      ctx.beginPath();
      ctx.arc(px + 1, y - 1, 2.2 + g, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Short wide stone base; gems live on its front. */
export function plinth(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, h: number): void {
  cylinder(ctx, pal.stoneTones, x, y - h, y + 2, r, r * 0.4, 0, 0);
}

/** Arched doorway in the body's shade tone. */
export function door(ctx: CanvasRenderingContext2D, pal: Palette, x: number, bottom: number, hw: number, h: number): void {
  ctx.fillStyle = pal.stoneTones.shade;
  ctx.beginPath();
  ctx.moveTo(x - hw, bottom);
  ctx.lineTo(x - hw, bottom - h + hw);
  ctx.arc(x, bottom - h + hw, hw, Math.PI, 0);
  ctx.lineTo(x + hw, bottom);
  ctx.closePath();
  ctx.fill();
}

/** Tent awning at the base (left front) in owner cloth, `s` scales it. */
export function awning(ctx: CanvasRenderingContext2D, tones: Tones, x: number, y: number, s: number): void {
  const tri = (ax: number, bx: number, cx: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + ax * s, y + 10);
    ctx.lineTo(x + bx * s, y - 14 * s + 10 * (1 - s));
    ctx.lineTo(x + cx * s, y + 10);
    ctx.closePath();
    ctx.fill();
  };
  tri(-48, -32, -14, tones.shade);
  tri(-48, -32, -26, tones.mid);
  tri(-48, -32, -37, tones.lit);
  // dark opening
  ctx.fillStyle = shade(tones.shade, -0.35);
  ctx.beginPath();
  ctx.moveTo(x - 37 * s, y + 10);
  ctx.lineTo(x - 32 * s, y - 2 * s + 10 * (1 - s));
  ctx.lineTo(x - 27 * s, y + 10);
  ctx.closePath();
  ctx.fill();
}

/** Stone ledge ring where the second storey starts (L2): underside shade, mid, lit top, rim. */
export function ledge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, ry: number): void {
  const st = pal.stoneTones;
  ctx.fillStyle = st.shade;
  ctx.beginPath();
  ctx.ellipse(x, y + 3.5, r, ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = st.mid;
  ctx.beginPath();
  ctx.ellipse(x, y + 1.5, r, ry, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(st.lit, 0.12);
  ctx.beginPath();
  ctx.ellipse(x, y, r, ry, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y, r - 1, ry - 1, 0, Math.PI * 0.85, Math.PI * 1.45);
  ctx.stroke();
}

/**
 * Hanging owner-coloured banner on a gold rod (L2): swallowtail hem that sways, lit stripe on the
 * left, a paper emblem dot. Reads as "second storey" even at phone size.
 */
export function banner(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, w: number, h: number, nowMs: number, motion: boolean): void {
  const sway = motion ? Math.sin(nowMs / 320 + x * 0.05) * 1.6 : 0;
  const hw = w / 2;
  const cloth = (ox: number, oy: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - hw + ox, top + oy);
    ctx.lineTo(x + hw + ox, top + oy);
    ctx.lineTo(x + hw + sway + ox, top + h + oy);
    ctx.lineTo(x + sway * 0.6 + ox, top + h - hw * 0.8 + oy);
    ctx.lineTo(x - hw + sway + ox, top + h + oy);
    ctx.closePath();
    ctx.fill();
  };
  cloth(1.5, 2, withAlphaInk(0.22));
  cloth(0, 0, tones.mid);
  // lit stripe on the left third
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.moveTo(x - hw, top);
  ctx.lineTo(x - hw + w * 0.32, top);
  ctx.lineTo(x - hw + w * 0.32 + sway, top + h - 2);
  ctx.lineTo(x - hw + sway, top + h);
  ctx.closePath();
  ctx.fill();
  // emblem
  ctx.fillStyle = pal.paper;
  ctx.beginPath();
  ctx.arc(x + sway * 0.3, top + h * 0.42, hw * 0.42, 0, TAU);
  ctx.fill();
  // rod
  ctx.strokeStyle = pal.goldShade;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x - hw - 3, top);
  ctx.lineTo(x + hw + 3, top);
  ctx.stroke();
  ctx.strokeStyle = pal.gold;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - hw - 3, top - 0.8);
  ctx.lineTo(x + hw + 3, top - 0.8);
  ctx.stroke();
}

function withAlphaInk(alpha: number): string {
  return `rgba(30, 42, 68, ${alpha})`;
}

/**
 * Merlons along one half of a rim (`back` = the far half, drawn before whatever stands on the rim;
 * front half drawn after so it overlaps the roof skirt). Battlements of the L3 keep.
 */
export function crenelsHalf(ctx: CanvasRenderingContext2D, pal: Palette, x: number, top: number, r: number, ry: number, n: number, back: boolean, size = 10): void {
  const a0 = back ? Math.PI : 0;
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + 0.5) / n) * Math.PI;
    const cx = x + Math.cos(a) * r;
    const cy = top + Math.sin(a) * ry;
    const w = size;
    const h = size + 1;
    ctx.fillStyle = pal.stoneTones.shade;
    roundRect(ctx, { x: cx - w / 2 + 1, y: cy - h + 1, w, h }, 2);
    ctx.fill();
    ctx.fillStyle = Math.cos(a) < -0.2 ? pal.stoneTones.lit : pal.stoneTones.mid;
    roundRect(ctx, { x: cx - w / 2, y: cy - h, w: w - 1, h: h - 2 }, 2);
    ctx.fill();
  }
}

/**
 * Lower skirt roof of the L3 double roof: a shallow cone in the roof material that the turret
 * stands through. Tent stripes carry over; band skins get the owner band under it.
 */
function skirtRoof(ctx: CanvasRenderingContext2D, owner: Tones, style: RoofStyle, x: number, base: number, rx: number, ry: number, height: number): void {
  if (style.band) ownerBand(ctx, owner, x, base + 2, rx + 3, ry + 1.5);
  cone(ctx, style.tones, x, base, base - height, rx, ry, style.stripes);
  if (style.shingles) shingles(ctx, style.tones, x, base, height, rx, ry);
  if (style.rivets) rivets(ctx, style.tones, x, base, rx, ry);
}

function drawBarracks(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  const style = roofStyle(pal, tones, o.skin);
  const st = pal.stoneTones;
  switch (tier(level)) {
    case 0:
      // L1: small single tower
      plinth(ctx, pal, x, y, 26, 8);
      cylinder(ctx, st, x, y - 42, y - 8, 20, 7.5, 2);
      door(ctx, pal, x, y - 8, 5.5, 13);
      awning(ctx, tones, x, y, 0.9);
      roof(ctx, pal, tones, style, x, y - 44, 32 * pulse, 26 * pulse, 8 * pulse);
      gems(ctx, pal, x, y - 2, level, o.nowMs, o.motion);
      flag(ctx, pal, tones, x + 24, y - 66, 26, o.nowMs, o.motion);
      break;
    case 1:
      // L2: taller, storey ledge, banner
      plinth(ctx, pal, x, y, 30, 10);
      cylinder(ctx, st, x, y - 62, y - 8, 23, 8.5, 4);
      door(ctx, pal, x, y - 8, 6, 14);
      ledge(ctx, pal, x, y - 36, 25.5, 9.5);
      banner(ctx, pal, tones, x - 1, y - 60, 12, 20, o.nowMs, o.motion);
      awning(ctx, tones, x, y, 1);
      roof(ctx, pal, tones, style, x, y - 64, 42 * pulse, 31 * pulse, 9 * pulse);
      gems(ctx, pal, x, y - 3, level, o.nowMs, o.motion);
      flag(ctx, pal, tones, x + 28, y - 92, 32, o.nowMs, o.motion);
      break;
    default:
      // L3: wide keep with battlements, skirt roof and a tall turret
      plinth(ctx, pal, x, y, 40, 12);
      cylinder(ctx, st, x, y - 50, y - 10, 32, 11, 3);
      door(ctx, pal, x, y - 10, 7, 17);
      awning(ctx, tones, x - 8, y, 1.05);
      crenelsHalf(ctx, pal, x, y - 50, 32, 11, 7, true);
      skirtRoof(ctx, tones, style, x, y - 52, 26 * pulse, 8.5 * pulse, 16 * pulse);
      cylinder(ctx, st, x, y - 86, y - 60, 18, 6.5, 2);
      crenelsHalf(ctx, pal, x, y - 50, 32, 11, 7, false);
      roof(ctx, pal, tones, style, x, y - 88, 44 * pulse, 24 * pulse, 7.5 * pulse);
      gems(ctx, pal, x, y - 4, level, o.nowMs, o.motion);
      flag(ctx, pal, tones, x + 22, y - 116, 30, o.nowMs, o.motion);
  }
}

function crenels(ctx: CanvasRenderingContext2D, pal: Palette, x: number, top: number, r: number, ry: number, n: number): void {
  crenelsHalf(ctx, pal, x, top, r, ry, n, true, 9);
}

/** Half of the fortress wall ring (back half behind the keep, front half in front of it). */
export function wallRing(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, front: boolean, rx = 46, ry = 19): void {
  const st = pal.stoneTones;
  const a0 = front ? 0 : Math.PI;
  const a1 = front ? Math.PI : Math.PI * 2;
  // wall face: shade band, then mid, then lit top rim on the left
  ctx.lineCap = 'butt';
  ctx.strokeStyle = st.shade;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.ellipse(x, y + 6, rx, ry, 0, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = st.mid;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, rx, ry, 0, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = st.lit;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(x, y - 3, rx, ry, 0, a0, a1);
  ctx.stroke();
  // crenels along the top
  const n = Math.round(rx / 6.5);
  for (let i = 0; i < n; i++) {
    const a = a0 + ((i + 0.5) / n) * Math.PI;
    const cx = x + Math.cos(a) * rx;
    const cy = y - 3 + Math.sin(a) * ry;
    ctx.fillStyle = st.shade;
    roundRect(ctx, { x: cx - 4, y: cy - 8, w: 9, h: 9 }, 2);
    ctx.fill();
    ctx.fillStyle = st.lit;
    roundRect(ctx, { x: cx - 5, y: cy - 9, w: 8, h: 8 }, 2);
    ctx.fill();
  }
}

function drawFortress(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  const style = roofStyle(pal, tones, o.skin);
  const st = pal.stoneTones;
  const k = tier(level);
  const rx = [44, 48, 54][k]!;
  const ry = [18, 19.5, 22][k]!;
  wallRing(ctx, pal, x, y, false, rx, ry);
  // courtyard floor
  ctx.fillStyle = pal.pathShade;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, rx - 6, ry - 4, 0, 0, Math.PI * 2);
  ctx.fill();
  switch (k) {
    case 0:
      cylinder(ctx, st, x, y - 38, y - 4, 24, 9, 2);
      crenels(ctx, pal, x, y - 38, 24, 9, 5);
      roof(ctx, pal, tones, style, x, y - 42, 28 * pulse, 18 * pulse, 6 * pulse);
      flag(ctx, pal, tones, x + 26, y - 64, 26, o.nowMs, o.motion);
      break;
    case 1:
      cylinder(ctx, st, x, y - 52, y - 4, 28, 10, 3);
      ledge(ctx, pal, x, y - 30, 30, 10.5);
      banner(ctx, pal, tones, x, y - 50, 12, 18, o.nowMs, o.motion);
      crenels(ctx, pal, x, y - 52, 28, 10, 6);
      roof(ctx, pal, tones, style, x, y - 56, 34 * pulse, 21 * pulse, 7 * pulse);
      flag(ctx, pal, tones, x + 31, y - 84, 30, o.nowMs, o.motion);
      break;
    default:
      cylinder(ctx, st, x, y - 54, y - 4, 32, 11, 3);
      door(ctx, pal, x, y - 4, 6, 14);
      crenelsHalf(ctx, pal, x, y - 54, 32, 11, 7, true);
      skirtRoof(ctx, tones, style, x, y - 56, 26 * pulse, 8.5 * pulse, 16 * pulse);
      cylinder(ctx, st, x, y - 88, y - 64, 18, 6.5, 2);
      crenelsHalf(ctx, pal, x, y - 54, 32, 11, 7, false);
      roof(ctx, pal, tones, style, x, y - 90, 40 * pulse, 22 * pulse, 7 * pulse);
      flag(ctx, pal, tones, x + 25, y - 116, 30, o.nowMs, o.motion);
  }
  wallRing(ctx, pal, x, y, true, rx, ry);
  gems(ctx, pal, x, y + 12, level, o.nowMs, o.motion);
}

function drawArtillery(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  const k = tier(level);
  const st = pal.stoneTones;
  // bunker: wider and taller per level, with a raised gun deck from L2 and battlements at L3
  const br = [28, 32, 38][k]!;
  const bh = [16, 20, 24][k]!;
  cylinder(ctx, st, x, y - bh, y + 2, br, br * 0.37, k === 2 ? 2 : 1);
  if (k === 2) crenelsHalf(ctx, pal, x, y - bh, br, br * 0.37, 8, true, 8);
  // sandbags along the front
  const bags = [4, 5, 6][k]!;
  for (let i = 0; i < bags; i++) {
    const bx = x - bags * 6 + i * 12;
    ctx.fillStyle = pal.pathShade;
    roundRect(ctx, { x: bx, y: y + 2, w: 13, h: 9 }, 4);
    ctx.fill();
    ctx.fillStyle = pal.pathLit;
    roundRect(ctx, { x: bx + 1, y: y + 2, w: 10, h: 5 }, 3);
    ctx.fill();
  }
  let dy = y - bh;
  if (k >= 1) {
    // raised gun deck (second storey) with a banner on the bunker wall
    const dr = [0, 26, 30][k]!;
    const dh = [0, 10, 14][k]!;
    cylinder(ctx, st, x, dy - dh, dy, dr, dr * 0.35, 0, 0.15);
    banner(ctx, pal, tones, x - br * 0.62, dy + 2, 9, bh - 4, o.nowMs, o.motion);
    dy -= dh;
  }
  // dome in owner colour (or the skin material over an owner band): three facets
  const rx = [19, 22, 25][k]! * pulse;
  const ry = [14, 17, 19][k]! * pulse;
  const style = roofStyle(pal, tones, o.skin);
  if (style.band) ownerBand(ctx, tones, x, dy, rx + 2, 6);
  if (style.shape === 'pagoda') pagoda(ctx, pal, style.tones, x, dy, ry * 1.3, rx, 7, 2);
  else if (style.shape === 'onion') onion(ctx, pal, style.tones, x, dy, ry * 1.5, rx, 7);
  else {
    dome(ctx, style.tones, x, dy, rx, ry, style.stripes);
    if (style.shingles) shingles(ctx, style.tones, x, dy, ry, rx, rx * 0.5);
    if (k === 2) {
      // L3 double roof: observation cupola on the dome
      dome(ctx, style.tones, x, dy - ry + 3, rx * 0.34, ry * 0.36);
      ctx.fillStyle = style.tones.lit;
      ctx.beginPath();
      ctx.arc(x, dy - ry + 3 - ry * 0.36 - 1, 2.2, 0, TAU);
      ctx.fill();
    }
  }
  if (style.rivets) rivets(ctx, style.tones, x, dy, rx, ry);
  // barrel tracks the last target; longer and heavier per level
  barrel(ctx, pal, x, dy - 6, o.aim ?? -0.6, [26, 30, 36][k]!, [9, 10, 12][k]!);
  gems(ctx, pal, x + (k >= 1 ? 4 : -2), y - bh * 0.45, level, o.nowMs, o.motion);
  flag(ctx, pal, tones, x - br + 3, y - bh - [26, 30, 34][k]!, [22, 26, 28][k]!, o.nowMs, o.motion);
}

/** Gun barrel from the pivot (x, y) along `a` (screen radians): metal shade under mid, lit line, pivot cap. */
export function barrel(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, a: number, len: number, bw: number): void {
  const bx = x + Math.cos(a) * len;
  const by = y + Math.sin(a) * len * 0.73;
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.metal.shade;
  ctx.lineWidth = bw;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = pal.metal.mid;
  ctx.lineWidth = bw * 0.6;
  ctx.stroke();
  ctx.strokeStyle = pal.metal.lit;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * 6 - 1, y - 2 + Math.sin(a) * 4);
  ctx.lineTo(bx - 1, by - 2);
  ctx.stroke();
  ctx.fillStyle = pal.metal.shade;
  ctx.beginPath();
  ctx.arc(x, y, bw * 0.6, 0, Math.PI * 2);
  ctx.fill();
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

/** Saw-tooth roof row across a factory deck: `n` teeth over `x-hw..x+hw` rising `h` from `top`. */
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

/** Chimney with a drifting smoke puff (cool grey reads on cream, sand, snow and dark rock alike). */
export function chimney(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, bottom: number, w: number, nowMs: number, motion: boolean, phase = 0): void {
  const st = pal.stoneTones;
  ctx.fillStyle = st.shade;
  ctx.fillRect(x, top, w, bottom - top);
  ctx.fillStyle = st.mid;
  ctx.fillRect(x, top, w * 0.42, bottom - top);
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x - 2, top - 4, w + 4, 6);
  const drift = motion ? (nowMs / 40 + phase) % 30 : 12;
  ctx.fillStyle = `rgba(190, 200, 214, ${0.85 - drift / 45})`;
  ctx.beginPath();
  ctx.arc(x + w / 2, top - 8 - drift * 0.35, 4 + drift * 0.12, 0, Math.PI * 2);
  ctx.arc(x + w / 2 + 5 + drift * 0.25, top - 14 - drift * 0.45, 5 + drift * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function drawFactory(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  const st = pal.stoneTones;
  const k = tier(level);
  const hw = [28, 32, 40][k]!; // half width of the box
  const top = y - [32, 40, 52][k]!; // deck line
  plinth(ctx, pal, x, y, [34, 40, 48][k]!, [7, 8, 10][k]!);
  // boxy body: front (mid), right side (shade), lit left strip, rim
  ctx.fillStyle = st.mid;
  ctx.fillRect(x - hw, top, hw * 2, y - 4 - top);
  ctx.fillStyle = st.shade;
  ctx.fillRect(x + hw * 0.45, top, hw * 0.55, y - 4 - top);
  ctx.fillStyle = st.lit;
  ctx.fillRect(x - hw, top, hw * 0.36, y - 4 - top);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - hw + 1.5, top);
  ctx.lineTo(x - hw + 1.5, y - 5);
  ctx.stroke();
  // storey band from L2: a shade strip with a lit line above it, across the whole front
  if (k >= 1) {
    const ly = y - [0, 22, 28][k]!;
    ctx.fillStyle = st.shade;
    ctx.fillRect(x - hw, ly, hw * 2, 3);
    ctx.fillStyle = shade(st.lit, 0.12);
    ctx.fillRect(x - hw, ly - 2, hw * 2, 2);
    // upper-storey windows
    ctx.fillStyle = '#bfe8ff';
    for (const wx of k === 2 ? [-30, -14, 2] : [-24, 4]) ctx.fillRect(x + wx, ly - 12, 9, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const wx of k === 2 ? [-30, -14, 2] : [-24, 4]) ctx.fillRect(x + wx, ly - 12, 4, 3);
    banner(ctx, pal, tones, x + hw * 0.72, top + 3, [0, 10, 12][k]!, [0, 20, 24][k]!, o.nowMs, o.motion);
  }
  // door + ground-floor windows
  ctx.fillStyle = st.shade;
  const dh = [14, 18, 20][k]!;
  roundRect(ctx, { x: x - dh / 2, y: y - 4 - dh, w: dh, h: dh }, 3);
  ctx.fill();
  const wy = k === 0 ? top + 6 : y - 4 - dh + 2;
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(x - hw + 6, wy, 9, 8);
  ctx.fillRect(x + dh / 2 + 4, wy, 9, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(x - hw + 6, wy, 4, 3);
  ctx.fillRect(x + dh / 2 + 4, wy, 4, 3);
  // saw-tooth roof in owner colour (or the skin material over an owner strip); pagoda and onion
  // skins swap the teeth for a tiered hip roof / a bulb on a flat deck
  const style = roofStyle(pal, tones, o.skin);
  const rt = style.tones;
  const teeth = style.shape === 'pagoda' || style.shape === 'onion' ? 0 : [3, 3, 4][k]!;
  const th = [13, 16, 18][k]! * pulse;
  if (style.shape === 'pagoda') factoryPagoda(ctx, pal, rt, x, top, pulse, hw);
  else if (style.shape === 'onion') {
    ctx.fillStyle = rt.shade;
    ctx.fillRect(x - hw, top - 4, hw * 2, 4);
    ctx.fillStyle = rt.mid;
    ctx.fillRect(x - hw, top - 6, hw * 2, 4);
    onion(ctx, pal, rt, x - hw * 0.19, top - 6, 22 * pulse * (hw / 32), 15 * pulse * (hw / 32), 5 * (hw / 32));
  }
  if (teeth) {
    if (k === 2) {
      // L3 double roof: a second row of teeth stepped back and up, peaks showing between the front ones
      sawTeeth(ctx, style, x + 8, top - 9, hw, teeth, th * 0.9, true);
      ctx.fillStyle = st.mid;
      ctx.fillRect(x - hw + 8, top - 9, hw * 2, 9);
      // corner merlons (battlements) at both ends of the deck
      for (const cx of [x - hw + 2, x + hw - 10]) {
        ctx.fillStyle = st.shade;
        roundRect(ctx, { x: cx + 1, y: top - 9, w: 9, h: 10 }, 2);
        ctx.fill();
        ctx.fillStyle = st.lit;
        roundRect(ctx, { x: cx, y: top - 10, w: 8, h: 8 }, 2);
        ctx.fill();
      }
    }
    sawTeeth(ctx, style, x, top, hw, teeth, th);
    ctx.fillStyle = style.band ? tones.mid : rt.shade;
    ctx.fillRect(x - hw, top - 1, hw * 2, 3);
  }
  if (style.rivets) {
    ctx.fillStyle = rt.lit;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x - hw * 0.75 + i * hw * 0.5, top - 5, 1.6, 0, TAU);
      ctx.fill();
    }
  }
  // chimney(s) + smoke: one from L1, twin stacks at L3
  const cw = [10, 12, 11][k]!;
  const ch = [28, 32, 38][k]!;
  chimney(ctx, pal, tones, x + hw * 0.5, top - ch, top + 2, cw, o.nowMs, o.motion);
  if (k === 2) chimney(ctx, pal, tones, x + hw * 0.5 + 15, top - ch + 6, top + 2, cw, o.nowMs, o.motion, 14);
  gems(ctx, pal, x - hw * 0.55, y - [3, 4, 5][k]!, level, o.nowMs, o.motion);
  flag(ctx, pal, tones, x - hw - 4, top - [20, 22, 24][k]!, [22, 24, 26][k]!, o.nowMs, o.motion);
}

function drawKind(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, kind: TowerKind, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const shape = o.skin?.roof;
  if (isShapeSkin(shape)) {
    const drawers = shapeSkinsNow();
    if (drawers) {
      drawers.tower(ctx, pal, tones, kind, x, y, level, o, shape);
      return;
    }
  }
  switch (kind) {
    case 'fortress':
      drawFortress(ctx, pal, tones, x, y, level, o);
      break;
    case 'artillery':
      drawArtillery(ctx, pal, tones, x, y, level, o);
      break;
    case 'tankFactory':
      drawFactory(ctx, pal, tones, x, y, level, o);
      break;
    default:
      drawBarracks(ctx, pal, tones, x, y, level, o);
  }
}

/** Draw one building (without its shadow — call drawTowerShadow earlier so units walk over it). */
export function drawTowerSprite(ctx: CanvasRenderingContext2D, pal: Palette, t: TowerLook, o: TowerDrawOptions): void {
  const tones = pal.ownerTones[t.owner];
  const y = t.y - (o.raised ? 4 : 0);
  const squash = o.squash ?? 1;
  const transformed = squash !== 1;
  if (transformed) {
    ctx.save();
    ctx.translate(t.x, y);
    ctx.scale(1 + (1 - squash) * 0.7, squash);
    ctx.translate(-t.x, -y);
  }
  const wipe = o.wipe;
  if (wipe && wipe.t < 1) {
    drawKind(ctx, pal, pal.ownerTones[wipe.from], t.kind, t.x, y, t.level, o);
    ctx.save();
    ctx.beginPath();
    ctx.arc(t.x, y - towerTop(t.kind, t.level) * 0.55, 8 + wipe.t * 90, 0, Math.PI * 2);
    ctx.clip();
    drawKind(ctx, pal, tones, t.kind, t.x, y, t.level, o);
    ctx.restore();
  } else {
    drawKind(ctx, pal, tones, t.kind, t.x, y, t.level, o);
  }
  if (transformed) ctx.restore();
}

export interface BadgeStyle {
  /** Owner colour ring (2 px). */
  stroke?: string;
  /** Scale pop for count changes (1 = rest). */
  scale?: number;
  /**
   * Rules v2.1 "under fire": the attacker's colour. The pill turns warm alert paper with a
   * thicker stroke in that colour and a crossed-swords pip before the number, so "this tower is
   * not growing" reads by shape as well as colour (colour-blind palette). Numerals stay ink.
   */
  underFire?: string;
  /** Horizontal jolt in px (each hostile landing; 0 under reduced motion). */
  shake?: number;
}

/**
 * Crossed-swords pip: two blades crossing at (x, y) with a small guard each, `s` = half-length.
 * Blades in `color`, guards and a thin ink outline so it holds up at 8 px on every paper tone.
 */
export function drawSwordsPip(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, ink: string): void {
  ctx.save();
  ctx.lineCap = 'round';
  for (const dir of [1, -1]) {
    // blade: lower-left → upper-right (dir = 1) and mirrored
    ctx.strokeStyle = ink;
    ctx.lineWidth = s * 0.62;
    ctx.beginPath();
    ctx.moveTo(x - dir * s, y + s);
    ctx.lineTo(x + dir * s, y - s);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.34;
    ctx.beginPath();
    ctx.moveTo(x - dir * s, y + s);
    ctx.lineTo(x + dir * s, y - s);
    ctx.stroke();
    // guard: a short bar across the blade near the grip
    const gx = x - dir * s * 0.55;
    const gy = y + s * 0.55;
    ctx.strokeStyle = ink;
    ctx.lineWidth = s * 0.34;
    ctx.beginPath();
    ctx.moveTo(gx - s * 0.38, gy - dir * s * 0.38);
    ctx.lineTo(gx + s * 0.38, gy + dir * s * 0.38);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Paper pill with an owner-coloured stroke, soft shadow and ink numerals (≥ 26 px logical so the
 * count reads at 360 px). `full` tints the paper gold when the tower is at capacity.
 */
export function drawBadge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, text: string, full = false, style: BadgeStyle = {}): void {
  const px = 26;
  const s = style.scale ?? 1;
  const fire = style.underFire;
  x += style.shake ?? 0;
  ctx.font = font(px, '900');
  // under fire the pill widens to the left for the crossed-swords pip; the number keeps its size
  const pipW = fire ? 20 * s : 0;
  const w = Math.max(50, ctx.measureText(text).width + 24) * s + pipW;
  const h = 36 * s;
  const r: { x: number; y: number; w: number; h: number } = { x: x - w / 2, y: y - h / 2, w, h };
  ctx.fillStyle = pal.groundShadow;
  roundRect(ctx, { x: r.x + 2, y: r.y + 5, w, h }, h / 2);
  ctx.fill();
  roundRect(ctx, r, h / 2);
  ctx.fillStyle = fire ? pal.badgeAlert : full ? pal.badgeFull : pal.paper;
  ctx.fill();
  ctx.lineWidth = fire ? 3.5 : 2.5;
  ctx.strokeStyle = fire ?? style.stroke ?? pal.ink;
  ctx.stroke();
  if (fire) {
    // the pip sits in the widened left end; text is centred in the remaining width below
    drawSwordsPip(ctx, r.x + h * 0.5 + 2 * s, y + 1, 6 * s, fire, pal.ink);
    x += pipW / 2;
  }
  // inner top highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(r.x + h * 0.5, r.y + 3);
  ctx.lineTo(r.x + w - h * 0.5, r.y + 3);
  ctx.stroke();
  ctx.fillStyle = pal.ink;
  ctx.font = font(px * s, '900');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

/* ---------- units ---------- */

export interface UnitStyle {
  lit: string;
  mid: string;
  shade: string;
  helmet: string;
  face: string;
  shadow: string;
}

const styleCache = new WeakMap<Palette, Map<Owner, UnitStyle>>();

/** Pre-tinted colours per owner (computed once per palette; no per-frame colour maths on units). */
export function unitStyle(pal: Palette, owner: Owner): UnitStyle {
  let m = styleCache.get(pal);
  if (!m) {
    m = new Map();
    styleCache.set(pal, m);
  }
  let s = m.get(owner);
  if (!s) {
    const t = pal.ownerTones[owner];
    s = { lit: t.lit, mid: t.mid, shade: t.shade, helmet: shade(t.shade, -0.15), face: pal.skin, shadow: pal.groundShadow };
    m.set(owner, s);
  }
  return s;
}

export function capsule(ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r, top);
  ctx.arc(x, top, r, Math.PI, 0);
  ctx.lineTo(x + r, bottom);
  ctx.arc(x, bottom, r, 0, Math.PI);
  ctx.closePath();
}

/**
 * Clay soldier or tank. (dx, dy) is the unit direction of travel; the squash-and-stretch bob uses
 * `id` so a column does not march in lock-step. `scale` < 1 for the spawn scale-in. Cheap: no
 * gradients, no transforms, ≤ 6 fills per soldier.
 */
export function drawUnitSprite(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  x: number,
  y: number,
  owner: Owner,
  kind: UnitKind,
  dx: number,
  dy: number,
  id: number,
  nowMs: number,
  motion: boolean,
  scale = 1,
  helmet?: string,
): void {
  const st = unitStyle(pal, owner);
  if (isShapeSkin(helmet)) {
    const drawers = shapeSkinsNow();
    if (drawers) {
      drawers.unit(ctx, pal, st, x, y, kind, dx, dy, id, nowMs, motion, scale, helmet);
      return;
    }
  }
  if (kind === 'tank') {
    const s = TANK_RADIUS * scale;
    const rock = motion ? Math.sin(nowMs / 160 + id) * 0.9 : 0;
    ctx.fillStyle = st.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, s + 3, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    // treads
    ctx.fillStyle = pal.metal.shade;
    roundRect(ctx, { x: x - s - 1, y: y - s * 0.55 + rock * 0.3, w: s * 2 + 2, h: s * 1.2 }, 3);
    ctx.fill();
    // hull: shade (offset) then mid then lit top strip
    ctx.fillStyle = st.shade;
    roundRect(ctx, { x: x - s + 3.5, y: y - s * 0.85 + rock + 1.5, w: s * 2 - 4, h: s * 1.25 }, 3);
    ctx.fill();
    ctx.fillStyle = st.mid;
    roundRect(ctx, { x: x - s + 2, y: y - s * 0.85 + rock, w: s * 2 - 4, h: s * 1.25 }, 3);
    ctx.fill();
    ctx.fillStyle = st.lit;
    roundRect(ctx, { x: x - s + 2, y: y - s * 0.85 + rock, w: s * 2 - 4, h: s * 0.35 }, 3);
    ctx.fill();
    // turret + barrel
    ctx.fillStyle = st.shade;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.45 + rock, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.metal.shade;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.45 + rock);
    ctx.lineTo(x + dx * s * 1.35, y - s * 0.45 + rock + dy * s * 1.35);
    ctx.stroke();
    return;
  }
  // squash & stretch: stretched tall at the top of the hop, squashed on landing
  const ph = motion ? Math.sin(nowMs / 95 + id * 1.7) : 0;
  const stretch = 1 + ph * 0.09;
  const hop = Math.max(0, ph) * 1.6;
  const r = 4.4 * scale * (2 - stretch);
  const bodyTop = y - (12.5 * scale) * stretch - hop;
  const bodyBottom = y - 4 * scale - hop;
  const lean = dx * 1.3;
  // 1 shadow (long, to the lower-right)
  ctx.fillStyle = st.shadow;
  ctx.beginPath();
  ctx.ellipse(x + 2.5, y + 3.5, 6.5 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  // 2 shade side / backpack (offset away from the light and opposite to travel)
  ctx.fillStyle = st.shade;
  capsule(ctx, x + 1.4 - dx * 1.2, bodyTop + 1.5, bodyBottom + 1, r);
  ctx.fill();
  // 3 body
  ctx.fillStyle = st.mid;
  capsule(ctx, x + lean * 0.3, bodyTop, bodyBottom, r);
  ctx.fill();
  // 4 lit facet (upper-left)
  ctx.fillStyle = st.lit;
  capsule(ctx, x + lean * 0.3 - r * 0.45, bodyTop + 0.5, bodyTop + (bodyBottom - bodyTop) * 0.55, r * 0.32);
  ctx.fill();
  // 5 face
  const hy = bodyTop - 3.2 * scale;
  ctx.fillStyle = st.face;
  ctx.beginPath();
  ctx.arc(x + lean * 0.6, hy, 4.2 * scale, 0, Math.PI * 2);
  ctx.fill();
  // 6 helmet: owner-coloured cap by default, or the equipped skin
  drawHelmet(ctx, pal, st, helmet, x + lean * 0.6, hy, scale, dx);
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
function drawHelmet(ctx: CanvasRenderingContext2D, pal: Palette, st: UnitStyle, id: string | undefined, hx: number, hy: number, s: number, dx: number): void {
  const capY = hy - 0.8 * s;
  const cap = (color: string, r = 4.5 * s): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(hx, capY, r, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();
  };
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

/* ---------- economy & shop glyphs ---------- */

/*
 * Currency and shop icons, same clay recipe as the buildings (three tones + rim light, key light
 * upper-left, flat blue-ink drop shadow to the lower-right). All are centred on (x, y) and sized by
 * a radius `r` or a tile `size`; everything scales so the same glyph works at HUD (r ≈ 7) and card
 * (r ≈ 24–48) sizes. Text belongs to the screens (widgets / menus), not here.
 */

const GLINT = 'rgba(255, 255, 255, 0.85)';

export function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], x: number, y: number, s: number, close = true): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (i === 0) ctx.moveTo(x + p[0] * s, y + p[1] * s);
    else ctx.lineTo(x + p[0] * s, y + p[1] * s);
  }
  if (close) ctx.closePath();
}

/** Flat drop shadow of a round-ish glyph (upper-left key light → lower-right). */
function glyphShadow(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, rx: number, ry = rx): void {
  ctx.fillStyle = pal.objectShadow;
  ctx.beginPath();
  ctx.ellipse(x + rx * 0.14, y + ry * 0.24, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** Clay disc: shaded rim below, coloured face, inner top highlight. Base of the badges. */
export function clayDisc(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, tones: Tones): void {
  glyphShadow(ctx, pal, x, y, r);
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.1, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = tones.lit;
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, Math.PI * 0.85, Math.PI * 1.65);
  ctx.stroke();
}

/** Gold clay coin: thick edge, lit / shade crescents, embossed inner disc, rim light and glint. */
export function drawGoldCoin(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  const g = pal.goldTones;
  glyphShadow(ctx, pal, x, y, r);
  // thickness edge
  ctx.fillStyle = shade(g.shade, -0.3);
  ctx.beginPath();
  ctx.arc(x + r * 0.08, y + r * 0.14, r, 0, TAU);
  ctx.fill();
  // face + crescents
  ctx.fillStyle = g.mid;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.lineCap = 'butt';
  ctx.lineWidth = r * 0.3;
  ctx.strokeStyle = g.shade;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.85, -Math.PI * 0.2, Math.PI * 0.7);
  ctx.stroke();
  ctx.strokeStyle = g.lit;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.85, Math.PI * 0.8, Math.PI * 1.7);
  ctx.stroke();
  // embossed inner disc (shade ring under it, lit arc on top-left)
  ctx.fillStyle = g.shade;
  ctx.beginPath();
  ctx.arc(x + r * 0.04, y + r * 0.07, r * 0.56, 0, TAU);
  ctx.fill();
  ctx.fillStyle = g.mid;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.52, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = g.lit;
  ctx.lineWidth = r * 0.14;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.4, Math.PI * 0.9, Math.PI * 1.6);
  ctx.stroke();
  // rim light + glint
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.94, Math.PI * 0.95, Math.PI * 1.5);
  ctx.stroke();
  ctx.fillStyle = GLINT;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.36, y - r * 0.4, r * 0.16, r * 0.1, -0.7, 0, TAU);
  ctx.fill();
}

/** Gem outline (elongated hexagon) and its table facet, in unit coordinates. */
const GEM_OUTER: readonly (readonly [number, number])[] = [
  [0, -1],
  [0.72, -0.42],
  [0.72, 0.42],
  [0, 1],
  [-0.72, 0.42],
  [-0.72, -0.42],
];
const GEM_TABLE: readonly (readonly [number, number])[] = GEM_OUTER.map(([a, b]) => [a * 0.48, b * 0.48] as const);

/**
 * Faceted crystal (hard currency): cyan-violet by default, or `tint` (a mid hex, or full tones).
 * Six side facets around a lit table, violet outline so the silhouette holds on paper and on grass.
 */
export function drawCrystal(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, tint?: string | Tones): void {
  const t: Tones = typeof tint === 'string' ? { lit: shade(tint, 0.5), mid: tint, shade: shade(tint, -0.35) } : (tint ?? pal.crystal);
  const ink = tint ? shade(t.shade, -0.35) : pal.crystalInk;
  glyphShadow(ctx, pal, x, y, r * 0.8, r);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  poly(ctx, GEM_OUTER, x, y, r);
  ctx.stroke();
  ctx.fillStyle = t.mid;
  ctx.fill();
  // side facets: lit on the upper-left, violet shade on the lower-right
  const facetColors = [shade(t.mid, 0.25), t.shade, shade(t.shade, -0.2), t.mid, t.lit, t.lit];
  for (let i = 0; i < 6; i++) {
    const o0 = GEM_OUTER[i]!;
    const o1 = GEM_OUTER[(i + 1) % 6]!;
    const t1 = GEM_TABLE[(i + 1) % 6]!;
    const t0 = GEM_TABLE[i]!;
    ctx.fillStyle = facetColors[i]!;
    poly(ctx, [o0, o1, t1, t0], x, y, r);
    ctx.fill();
  }
  // table catches the light
  ctx.fillStyle = shade(t.mid, 0.45);
  poly(ctx, GEM_TABLE, x, y, r);
  ctx.fill();
  // rim light along the two upper-left edges + glint
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.lineCap = 'round';
  poly(ctx, [GEM_OUTER[4]!, GEM_OUTER[5]!, GEM_OUTER[0]!], x, y, r * 0.9, false);
  ctx.stroke();
  ctx.fillStyle = GLINT;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.42, r * 0.14, r * 0.09, -0.9, 0, TAU);
  ctx.fill();
}

/** Coin positions (in coin radii) and the coin radius (in `size`) for 1–5 coins. */
/**
 * Wooden treasure chest with gold straps; `size` is its width. Open: the lid tips back and coins +
 * a crystal show over the rim (starter pack / reward). The anchor (x, y) is the chest centre.
 */
export function drawTreasureChest(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, open: boolean): void {
  const w = size;
  const h = size * 0.72;
  const wood = pal.woodTones;
  const gold = pal.goldTones;
  const bx = x - w / 2;
  const by = y - h * 0.12;
  const bh = h * 0.58;
  const lidH = h * 0.42;
  const rad = w * 0.08;
  // ground shadow
  ctx.fillStyle = pal.objectShadow;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.08, y + bh * 0.82, w * 0.58, h * 0.16, 0, 0, TAU);
  ctx.fill();
  if (open) {
    // lid tipped back: inside (shade) then its lit top edge; loot peeks over the rim
    ctx.fillStyle = wood.shade;
    roundRect(ctx, { x: bx + w * 0.04, y: by - lidH * 1.15, w: w * 0.92, h: lidH * 1.05 }, rad);
    ctx.fill();
    ctx.fillStyle = wood.mid;
    roundRect(ctx, { x: bx + w * 0.04, y: by - lidH * 1.15, w: w * 0.92, h: lidH * 0.28 }, rad);
    ctx.fill();
    ctx.fillStyle = gold.shade;
    ctx.fillRect(bx + w * 0.22, by - lidH * 1.15, w * 0.1, lidH * 1.05);
    ctx.fillRect(bx + w * 0.68, by - lidH * 1.15, w * 0.1, lidH * 1.05);
    const cr = w * 0.13;
    drawGoldCoin(ctx, pal, x - w * 0.24, by - cr * 0.55, cr);
    drawGoldCoin(ctx, pal, x + w * 0.26, by - cr * 0.45, cr);
    drawGoldCoin(ctx, pal, x + w * 0.02, by - cr * 0.35, cr);
    drawCrystal(ctx, pal, x - w * 0.02, by - cr * 1.25, cr * 1.05);
  }
  // body: shade (right side), mid front, lit left strip, rim light
  ctx.fillStyle = wood.shade;
  roundRect(ctx, { x: bx + w * 0.06, y: by + h * 0.05, w, h: bh }, rad);
  ctx.fill();
  ctx.fillStyle = wood.mid;
  roundRect(ctx, { x: bx, y: by, w, h: bh }, rad);
  ctx.fill();
  ctx.fillStyle = wood.lit;
  roundRect(ctx, { x: bx, y: by, w: w * 0.18, h: bh }, rad);
  ctx.fill();
  ctx.fillStyle = wood.mid;
  ctx.fillRect(bx + w * 0.12, by, w * 0.06, bh);
  // plank lines
  ctx.strokeStyle = INK_LINE;
  ctx.lineWidth = Math.max(1, w * 0.02);
  ctx.beginPath();
  ctx.moveTo(bx + rad, by + bh * 0.5);
  ctx.lineTo(bx + w - rad, by + bh * 0.5);
  ctx.stroke();
  // rim of the body (lit lip)
  ctx.fillStyle = wood.lit;
  ctx.fillRect(bx, by, w, h * 0.05);
  // gold straps + lock plate
  const strap = (sx: number): void => {
    ctx.fillStyle = gold.shade;
    ctx.fillRect(sx + w * 0.02, by + h * 0.01, w * 0.1, bh - h * 0.01);
    ctx.fillStyle = gold.mid;
    ctx.fillRect(sx, by, w * 0.1, bh);
    ctx.fillStyle = gold.lit;
    ctx.fillRect(sx, by, w * 0.035, bh);
  };
  strap(bx + w * 0.22);
  strap(bx + w * 0.68);
  ctx.fillStyle = gold.shade;
  roundRect(ctx, { x: x - w * 0.09, y: by + h * 0.02, w: w * 0.2, h: h * 0.26 }, rad * 0.6);
  ctx.fill();
  ctx.fillStyle = gold.mid;
  roundRect(ctx, { x: x - w * 0.1, y: by, w: w * 0.2, h: h * 0.26 }, rad * 0.6);
  ctx.fill();
  ctx.fillStyle = pal.ink;
  ctx.beginPath();
  ctx.arc(x, by + h * 0.11, w * 0.035, 0, TAU);
  ctx.fill();
  ctx.fillRect(x - w * 0.015, by + h * 0.11, w * 0.03, h * 0.1);
  if (!open) {
    // closed lid: domed top, lit facet on the left, gold straps carried over
    ctx.fillStyle = wood.shade;
    roundRect(ctx, { x: bx + w * 0.04, y: by - lidH + h * 0.04, w, h: lidH }, rad * 1.8);
    ctx.fill();
    ctx.fillStyle = wood.mid;
    roundRect(ctx, { x: bx, y: by - lidH, w, h: lidH + h * 0.02 }, rad * 1.8);
    ctx.fill();
    ctx.fillStyle = wood.lit;
    roundRect(ctx, { x: bx, y: by - lidH, w: w * 0.36, h: lidH * 0.55 }, rad * 1.8);
    ctx.fill();
    ctx.fillStyle = gold.shade;
    ctx.fillRect(bx + w * 0.24, by - lidH + h * 0.02, w * 0.1, lidH);
    ctx.fillRect(bx + w * 0.7, by - lidH + h * 0.02, w * 0.1, lidH);
    ctx.fillStyle = gold.mid;
    ctx.fillRect(bx + w * 0.22, by - lidH, w * 0.1, lidH);
    ctx.fillRect(bx + w * 0.68, by - lidH, w * 0.1, lidH);
    ctx.fillStyle = gold.lit;
    ctx.fillRect(bx + w * 0.22, by - lidH, w * 0.035, lidH);
    ctx.fillRect(bx + w * 0.68, by - lidH, w * 0.035, lidH);
    ctx.strokeStyle = RIM;
    ctx.lineWidth = Math.max(1, w * 0.025);
    ctx.beginPath();
    ctx.moveTo(bx + rad * 1.8, by - lidH + 1);
    ctx.lineTo(bx + w - rad * 1.8, by - lidH + 1);
    ctx.stroke();
  }
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, w * 0.025);
  ctx.beginPath();
  ctx.moveTo(bx + 1, by + rad);
  ctx.lineTo(bx + 1, by + bh - rad);
  ctx.stroke();
}

/** Film frame with a paper play triangle: "watch an ad for a reward". */
export function drawVideoGlyph(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  const w = r * 2;
  const h = r * 1.5;
  const fx = x - w / 2;
  const fy = y - h / 2;
  const rad = r * 0.18;
  glyphShadow(ctx, pal, x, y, r, r * 0.75);
  ctx.fillStyle = shade(pal.ink, -0.3);
  roundRect(ctx, { x: fx + r * 0.05, y: fy + r * 0.1, w, h }, rad);
  ctx.fill();
  ctx.fillStyle = pal.ink;
  roundRect(ctx, { x: fx, y: fy, w, h }, rad);
  ctx.fill();
  // sprocket holes top and bottom
  ctx.fillStyle = pal.paper;
  const holes = 4;
  for (let i = 0; i < holes; i++) {
    const hx = fx + w * ((i + 0.5) / holes) - r * 0.11;
    ctx.fillRect(hx, fy + r * 0.08, r * 0.22, r * 0.14);
    ctx.fillRect(hx, fy + h - r * 0.22, r * 0.22, r * 0.14);
  }
  // screen in player blue with a paper play button
  const t = pal.ownerTones.player;
  ctx.fillStyle = t.shade;
  roundRect(ctx, { x: fx + r * 0.16, y: fy + r * 0.3, w: w - r * 0.32, h: h - r * 0.6 }, rad * 0.5);
  ctx.fill();
  ctx.fillStyle = t.mid;
  roundRect(ctx, { x: fx + r * 0.16, y: fy + r * 0.3, w: w - r * 0.32, h: h - r * 0.7 }, rad * 0.5);
  ctx.fill();
  ctx.fillStyle = t.lit;
  roundRect(ctx, { x: fx + r * 0.16, y: fy + r * 0.3, w: r * 0.5, h: r * 0.3 }, rad * 0.5);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.fillStyle = shade(t.shade, -0.2);
  poly(ctx, [[-0.2, -0.32], [0.3, 0], [-0.2, 0.32]], x + r * 0.06, y + r * 0.05, r);
  ctx.fill();
  ctx.fillStyle = pal.paper;
  poly(ctx, [[-0.2, -0.32], [0.3, 0], [-0.2, 0.32]], x, y, r);
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(fx + rad, fy + 1);
  ctx.lineTo(fx + w - rad, fy + 1);
  ctx.stroke();
}

export type UpgradeKind = 'production' | 'capacity' | 'garrison' | 'booster' | 'speed';
