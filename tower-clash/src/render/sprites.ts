import type { Owner, TowerKind, UnitKind } from '../sim/types';
import type { Palette, Tones } from './palette';
import { shade } from './palette';
import { TANK_RADIUS } from './layout';
import { drawBoltGlyph, font, roundRect } from './widgets';
import { SHADOW_DX, SHADOW_DY } from './terrain';

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

/** Shop skins: `roof.default | roof.gold | roof.iron | roof.tent`, `helmet.default | helmet.plume`. */
export interface TowerSkin {
  roof?: string;
  helmet?: string;
}

export const ROOF_SKINS = ['roof.default', 'roof.gold', 'roof.iron', 'roof.tent'] as const;
export const HELMET_SKINS = ['helmet.default', 'helmet.plume'] as const;

const RIM = 'rgba(255, 250, 240, 0.55)';
const INK_LINE = 'rgba(30, 42, 68, 0.18)';
const TAU = Math.PI * 2;
/** Cream canvas stripes of the tent skin (paper, and paper in shadow). */
const STRIPE: Tones = { lit: '#fffaf0', mid: '#fff3dc', shade: '#e2d3b8' };

/**
 * How a skin changes the owner-coloured roof. Every non-default material keeps an owner-coloured
 * band at the roof base (and the flag) so ownership still reads at a glance in both palettes.
 */
interface RoofStyle {
  tones: Tones;
  /** Alternate facets in these tones (tent). */
  stripes?: Tones;
  /** Half-dome instead of a cone (gold). */
  dome: boolean;
  /** Rivet dots along the eave (iron). */
  rivets: boolean;
  /** Owner band under the roof. */
  band: boolean;
}

function roofStyle(pal: Palette, owner: Tones, skin?: TowerSkin): RoofStyle {
  switch (skin?.roof) {
    case 'roof.gold':
      return { tones: pal.goldTones, dome: true, rivets: false, band: true };
    case 'roof.iron':
      return { tones: pal.metal, dome: false, rivets: true, band: true };
    case 'roof.tent':
      return { tones: owner, stripes: STRIPE, dome: false, rivets: false, band: false };
    default:
      return { tones: owner, dome: false, rivets: false, band: false };
  }
}

/** Top of the sprite above the anchor, per kind (badge sits above this). */
export function towerTop(kind: TowerKind): number {
  switch (kind) {
    case 'artillery':
      return 56;
    case 'tankFactory':
      return 74;
    case 'fortress':
      return 86;
    default:
      return 94;
  }
}

/** Centre of the unit-count badge for a tower. */
export function badgeY(kind: TowerKind): number {
  return -towerTop(kind) - 18;
}

/** Radius / height used for the ground shadow of each kind. */
function footprint(kind: TowerKind): { r: number; h: number } {
  switch (kind) {
    case 'artillery':
      return { r: 40, h: 34 };
    case 'tankFactory':
      return { r: 38, h: 52 };
    case 'fortress':
      return { r: 46, h: 62 };
    default:
      return { r: 32, h: 70 };
  }
}

/** Long directional shadow + contact shadow, as one path so the overlap stays a single tone. */
export function drawTowerShadow(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, kind: TowerKind): void {
  const { r, h } = footprint(kind);
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
function cylinder(ctx: CanvasRenderingContext2D, tones: Tones, x: number, top: number, bottom: number, r: number, ry: number, rows = 2, topLift = 0.25): void {
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
function cone(ctx: CanvasRenderingContext2D, tones: Tones, x: number, base: number, apex: number, rx: number, ry: number, stripes?: Tones): void {
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

/** Cone or dome roof per skin, with its owner band / rivets / finial. */
function roof(ctx: CanvasRenderingContext2D, pal: Palette, owner: Tones, style: RoofStyle, x: number, base: number, height: number, rx: number, ry: number): void {
  if (style.band) ownerBand(ctx, owner, x, base + 2, rx + 4, ry + 2);
  if (style.dome) {
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
  } else {
    cone(ctx, style.tones, x, base, base - height, rx, ry, style.stripes);
  }
  if (style.rivets) rivets(ctx, style.tones, x, base, rx, ry);
}

/** Flag on a pole; the free edge waves. */
function flag(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, top: number, height: number, nowMs: number, motion: boolean): void {
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
function gems(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, level: number, nowMs: number, motion: boolean): void {
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
function plinth(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, h: number): void {
  cylinder(ctx, pal.stoneTones, x, y - h, y + 2, r, r * 0.4, 0, 0);
}

function drawBarracks(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  plinth(ctx, pal, x, y, 28, 9);
  cylinder(ctx, pal.stoneTones, x, y - 48, y - 8, 22, 8, 3);
  // door
  ctx.fillStyle = pal.stoneTones.shade;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 8);
  ctx.lineTo(x - 6, y - 22);
  ctx.arc(x, y - 22, 6, Math.PI, 0);
  ctx.lineTo(x + 6, y - 8);
  ctx.closePath();
  ctx.fill();
  // tent awning at the base (left front)
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.moveTo(x - 48, y + 10);
  ctx.lineTo(x - 32, y - 14);
  ctx.lineTo(x - 14, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  ctx.moveTo(x - 48, y + 10);
  ctx.lineTo(x - 32, y - 14);
  ctx.lineTo(x - 26, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.moveTo(x - 48, y + 10);
  ctx.lineTo(x - 32, y - 14);
  ctx.lineTo(x - 37, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(tones.shade, -0.35);
  ctx.beginPath();
  ctx.moveTo(x - 37, y + 10);
  ctx.lineTo(x - 32, y - 2);
  ctx.lineTo(x - 27, y + 10);
  ctx.closePath();
  ctx.fill();
  // roof
  const rh = 40 * pulse;
  roof(ctx, pal, tones, roofStyle(pal, tones, o.skin), x, y - 50, rh, 30 * pulse, 9 * pulse);
  gems(ctx, pal, x, y - 2, level, o.nowMs, o.motion);
  flag(ctx, pal, tones, x + 27, y - 76, 30, o.nowMs, o.motion);
}

function crenels(ctx: CanvasRenderingContext2D, pal: Palette, x: number, top: number, r: number, ry: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.PI + ((i + 0.5) / n) * Math.PI;
    const cx = x + Math.cos(a) * r;
    const cy = top + Math.sin(a) * ry;
    ctx.fillStyle = pal.stoneTones.shade;
    roundRect(ctx, { x: cx - 5, y: cy - 9, w: 11, h: 11 }, 2);
    ctx.fill();
    ctx.fillStyle = pal.stoneTones.lit;
    roundRect(ctx, { x: cx - 6, y: cy - 10, w: 10, h: 9 }, 2);
    ctx.fill();
  }
}

/** Half of the fortress wall ring (back half behind the keep, front half in front of it). */
function wallRing(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, front: boolean): void {
  const st = pal.stoneTones;
  const rx = 46;
  const ry = 19;
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
  const n = 7;
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
  wallRing(ctx, pal, x, y, false);
  // courtyard floor
  ctx.fillStyle = pal.pathShade;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 40, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  cylinder(ctx, pal.stoneTones, x, y - 46, y - 4, 28, 10, 3);
  crenels(ctx, pal, x, y - 46, 28, 10, 6);
  roof(ctx, pal, tones, roofStyle(pal, tones, o.skin), x, y - 50, 34 * pulse, 21 * pulse, 7 * pulse);
  flag(ctx, pal, tones, x + 32, y - 76, 30, o.nowMs, o.motion);
  wallRing(ctx, pal, x, y, true);
  gems(ctx, pal, x, y + 12, level, o.nowMs, o.motion);
}

function drawArtillery(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  cylinder(ctx, pal.stoneTones, x, y - 20, y + 2, 32, 12, 1);
  // sandbags along the front
  for (let i = 0; i < 5; i++) {
    const bx = x - 30 + i * 12;
    ctx.fillStyle = pal.pathShade;
    roundRect(ctx, { x: bx, y: y + 2, w: 13, h: 9 }, 4);
    ctx.fill();
    ctx.fillStyle = pal.pathLit;
    roundRect(ctx, { x: bx + 1, y: y + 2, w: 10, h: 5 }, 3);
    ctx.fill();
  }
  // dome in owner colour (or the skin material over an owner band): three facets
  const rx = 22 * pulse;
  const ry = 17 * pulse;
  const dy = y - 20;
  const style = roofStyle(pal, tones, o.skin);
  if (style.band) ownerBand(ctx, tones, x, dy, rx + 2, 6);
  dome(ctx, style.tones, x, dy, rx, ry, style.stripes);
  if (style.rivets) rivets(ctx, style.tones, x, dy, rx, ry);
  // barrel tracks the last target
  const a = o.aim ?? -0.6;
  const bx = x + Math.cos(a) * 30;
  const by = dy - 6 + Math.sin(a) * 22;
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.metal.shade;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x, dy - 6);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = pal.metal.mid;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = pal.metal.lit;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * 6 - 1, dy - 8 + Math.sin(a) * 4);
  ctx.lineTo(bx - 1, by - 2);
  ctx.stroke();
  ctx.fillStyle = pal.metal.shade;
  ctx.beginPath();
  ctx.arc(x, dy - 6, 6, 0, Math.PI * 2);
  ctx.fill();
  gems(ctx, pal, x - 2, y - 8, level, o.nowMs, o.motion);
  flag(ctx, pal, tones, x - 28, y - 50, 26, o.nowMs, o.motion);
}

function drawFactory(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.15;
  const st = pal.stoneTones;
  plinth(ctx, pal, x, y, 40, 8);
  // boxy body: front (mid), right side (shade), lit left strip, rim
  ctx.fillStyle = st.mid;
  ctx.fillRect(x - 32, y - 40, 64, 36);
  ctx.fillStyle = st.shade;
  ctx.fillRect(x + 14, y - 40, 18, 36);
  ctx.fillStyle = st.lit;
  ctx.fillRect(x - 32, y - 40, 12, 36);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 30.5, y - 40);
  ctx.lineTo(x - 30.5, y - 5);
  ctx.stroke();
  // door + windows
  ctx.fillStyle = st.shade;
  roundRect(ctx, { x: x - 8, y: y - 22, w: 16, h: 18 }, 3);
  ctx.fill();
  ctx.fillStyle = '#bfe8ff';
  ctx.fillRect(x - 24, y - 32, 9, 8);
  ctx.fillRect(x + 4, y - 32, 9, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(x - 24, y - 32, 4, 3);
  ctx.fillRect(x + 4, y - 32, 4, 3);
  // saw-tooth roof in owner colour (or the skin material over an owner strip)
  const style = roofStyle(pal, tones, o.skin);
  const rt = style.tones;
  const teeth = 3;
  const tw = 64 / teeth;
  for (let i = 0; i < teeth; i++) {
    const sx = x - 32 + i * tw;
    const striped = style.stripes && i === 1;
    ctx.fillStyle = striped ? style.stripes!.mid : rt.mid;
    ctx.beginPath();
    ctx.moveTo(sx, y - 40);
    ctx.lineTo(sx + tw * 0.4, y - 40 - 16 * pulse);
    ctx.lineTo(sx + tw, y - 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = striped ? style.stripes!.lit : rt.lit;
    ctx.beginPath();
    ctx.moveTo(sx, y - 40);
    ctx.lineTo(sx + tw * 0.4, y - 40 - 16 * pulse);
    ctx.lineTo(sx + tw * 0.4, y - 40);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = style.band ? tones.mid : rt.shade;
  ctx.fillRect(x - 32, y - 41, 64, 3);
  if (style.rivets) {
    ctx.fillStyle = rt.lit;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x - 24 + i * 16, y - 45, 1.6, 0, TAU);
      ctx.fill();
    }
  }
  // chimney + smoke
  ctx.fillStyle = st.shade;
  ctx.fillRect(x + 16, y - 70, 12, 32);
  ctx.fillStyle = st.mid;
  ctx.fillRect(x + 16, y - 70, 5, 32);
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x + 14, y - 74, 16, 6);
  const drift = o.motion ? (o.nowMs / 40) % 30 : 12;
  // cool grey smoke reads on cream, sand, snow and dark rock alike
  ctx.fillStyle = `rgba(190, 200, 214, ${0.85 - drift / 45})`;
  ctx.beginPath();
  ctx.arc(x + 22, y - 78 - drift * 0.35, 4 + drift * 0.12, 0, Math.PI * 2);
  ctx.arc(x + 27 + drift * 0.25, y - 84 - drift * 0.45, 5 + drift * 0.14, 0, Math.PI * 2);
  ctx.fill();
  gems(ctx, pal, x - 18, y - 4, level, o.nowMs, o.motion);
  flag(ctx, pal, tones, x - 36, y - 62, 24, o.nowMs, o.motion);
}

function drawKind(ctx: CanvasRenderingContext2D, pal: Palette, tones: Tones, kind: TowerKind, x: number, y: number, level: number, o: TowerDrawOptions): void {
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
    ctx.arc(t.x, y - towerTop(t.kind) * 0.55, 8 + wipe.t * 90, 0, Math.PI * 2);
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
}

/**
 * Paper pill with an owner-coloured stroke, soft shadow and ink numerals (≥ 26 px logical so the
 * count reads at 360 px). `full` tints the paper gold when the tower is at capacity.
 */
export function drawBadge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, text: string, full = false, style: BadgeStyle = {}): void {
  const px = 26;
  const s = style.scale ?? 1;
  ctx.font = font(px, '900');
  const w = Math.max(50, ctx.measureText(text).width + 24) * s;
  const h = 36 * s;
  const r: { x: number; y: number; w: number; h: number } = { x: x - w / 2, y: y - h / 2, w, h };
  ctx.fillStyle = pal.groundShadow;
  roundRect(ctx, { x: r.x + 2, y: r.y + 5, w, h }, h / 2);
  ctx.fill();
  roundRect(ctx, r, h / 2);
  ctx.fillStyle = full ? pal.badgeFull : pal.paper;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = style.stroke ?? pal.ink;
  ctx.stroke();
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

/** Small cone-roof icon (level tiles, legend). */
export function drawRoofIcon(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, y: number, s: number): void {
  const st = pal.stoneTones;
  ctx.fillStyle = st.mid;
  ctx.fillRect(x - s * 0.5, y - s * 0.2, s, s * 0.9);
  ctx.fillStyle = st.shade;
  ctx.fillRect(x + s * 0.15, y - s * 0.2, s * 0.35, s * 0.9);
  ctx.fillStyle = st.lit;
  ctx.fillRect(x - s * 0.5, y - s * 0.2, s * 0.2, s * 0.9);
  cone(ctx, { lit: shade(color, 0.3), mid: color, shade: shade(color, -0.3) }, x, y - s * 0.2, y - s * 1.1, s * 0.7, s * 0.2);
}

/* ---------- units ---------- */

interface UnitStyle {
  lit: string;
  mid: string;
  shade: string;
  helmet: string;
  face: string;
  shadow: string;
}

const styleCache = new WeakMap<Palette, Map<Owner, UnitStyle>>();

/** Pre-tinted colours per owner (computed once per palette; no per-frame colour maths on units). */
function unitStyle(pal: Palette, owner: Owner): UnitStyle {
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

function capsule(ctx: CanvasRenderingContext2D, x: number, top: number, bottom: number, r: number): void {
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
  // 6 helmet in owner colour (band + cap)
  ctx.fillStyle = st.helmet;
  ctx.beginPath();
  ctx.arc(x + lean * 0.6, hy - 0.8 * scale, 4.5 * scale, Math.PI * 0.95, Math.PI * 2.05);
  ctx.closePath();
  ctx.fill();
  if (helmet === 'helmet.plume') {
    // 7 cream plume trailing back from the crest (2 strokes: shade outline + paper)
    const px = x + lean * 0.6;
    const py = hy - 5 * scale;
    const back = -dx * 6 * scale;
    ctx.lineCap = 'round';
    ctx.strokeStyle = st.shade;
    ctx.lineWidth = 3.6 * scale;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + back * 0.3, py - 5 * scale, px + back, py - 3 * scale);
    ctx.stroke();
    ctx.strokeStyle = STRIPE.lit;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
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

function poly(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[], x: number, y: number, s: number, close = true): void {
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
function clayDisc(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, tones: Tones): void {
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
const PILE: readonly { r: number; at: readonly (readonly [number, number])[] }[] = [
  { r: 0.5, at: [[0, 0]] },
  { r: 0.33, at: [[0.62, -0.12], [-0.62, 0.12]] },
  { r: 0.27, at: [[0, -0.6], [0.98, 0.55], [-0.98, 0.55]] },
  { r: 0.22, at: [[0, -0.8], [1.95, 0.7], [0, 0.7], [-1.95, 0.7]] },
  { r: 0.22, at: [[0.98, -0.75], [-0.98, -0.75], [1.95, 0.7], [0, 0.7], [-1.95, 0.7]] },
];

/** Pile of `count` (1–5) gold coins inside a `size` × `size` tile centred on (x, y). */
export function drawGoldPile(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, count: number): void {
  const spec = PILE[Math.max(1, Math.min(5, Math.round(count))) - 1]!;
  const r = spec.r * size;
  if (spec.at.length > 1) {
    ctx.fillStyle = pal.groundShadow;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.04, y + size * 0.42, size * 0.5, size * 0.13, 0, 0, TAU);
    ctx.fill();
  }
  for (const [cx, cy] of spec.at) drawGoldCoin(ctx, pal, x + cx * r, y + cy * r, r);
}

/** Gem positions (in gem radii), tilt (radians) and radius (in `size`) for 1–5 gems. */
const CLUSTER: readonly { r: number; at: readonly (readonly [number, number, number])[] }[] = [
  { r: 0.48, at: [[0, 0, 0]] },
  { r: 0.36, at: [[-0.6, 0.1, -0.35], [0.6, 0.05, 0.3]] },
  { r: 0.3, at: [[-0.95, 0.45, -0.45], [0.95, 0.45, 0.45], [0, -0.35, 0]] },
  { r: 0.26, at: [[-1.4, 0.55, -0.55], [1.4, 0.55, 0.55], [-0.45, -0.4, -0.15], [0.55, -0.35, 0.2]] },
  { r: 0.24, at: [[-1.6, 0.7, -0.6], [1.6, 0.7, 0.6], [-0.75, 0.1, -0.3], [0.8, 0.1, 0.3], [0, -0.7, 0]] },
];

/** Cluster of `count` (1–5) crystals inside a `size` × `size` tile centred on (x, y). */
export function drawCrystalCluster(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, count: number): void {
  const spec = CLUSTER[Math.max(1, Math.min(5, Math.round(count))) - 1]!;
  const r = spec.r * size;
  if (spec.at.length > 1) {
    ctx.fillStyle = pal.groundShadow;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.04, y + size * 0.42, size * 0.5, size * 0.13, 0, 0, TAU);
    ctx.fill();
  }
  for (const [cx, cy, tilt] of spec.at) {
    if (tilt === 0) {
      drawCrystal(ctx, pal, x + cx * r, y + cy * r, r);
      continue;
    }
    ctx.save();
    ctx.translate(x + cx * r, y + cy * r);
    ctx.rotate(tilt);
    drawCrystal(ctx, pal, 0, 0, r);
    ctx.restore();
  }
}

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

/** Paper disc with an ink television, crossed out in red: "remove ads". */
export function drawNoAdsBadge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  clayDisc(ctx, pal, x, y, r, { lit: '#ffffff', mid: pal.paper, shade: pal.panelBorder });
  // television: antenna, ink body, sky screen, feet
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.5, r * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.28, y - r * 0.62);
  ctx.lineTo(x, y - r * 0.3);
  ctx.lineTo(x + r * 0.28, y - r * 0.62);
  ctx.stroke();
  ctx.fillStyle = pal.ink;
  roundRect(ctx, { x: x - r * 0.52, y: y - r * 0.32, w: r * 1.04, h: r * 0.78 }, r * 0.12);
  ctx.fill();
  ctx.fillStyle = '#bfe8ff';
  roundRect(ctx, { x: x - r * 0.42, y: y - r * 0.22, w: r * 0.84, h: r * 0.58 }, r * 0.08);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  roundRect(ctx, { x: x - r * 0.4, y: y - r * 0.2, w: r * 0.3, h: r * 0.18 }, r * 0.05);
  ctx.fill();
  ctx.fillStyle = pal.ink;
  ctx.fillRect(x - r * 0.3, y + r * 0.46, r * 0.14, r * 0.1);
  ctx.fillRect(x + r * 0.16, y + r * 0.46, r * 0.14, r * 0.1);
  // prohibition ring + slash (shade offset under it for the clay lift)
  const ring = (dx: number, dy: number, color: string): void => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.17);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r * 0.78, 0, TAU);
    ctx.moveTo(x + dx - r * 0.55, y + dy - r * 0.55);
    ctx.lineTo(x + dx + r * 0.55, y + dy + r * 0.55);
    ctx.stroke();
  };
  ring(r * 0.04, r * 0.07, shade(pal.forbid, -0.35));
  ring(0, 0, pal.forbid);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, Math.PI * 0.95, Math.PI * 1.5);
  ctx.stroke();
}

/** Gold clay crown on a blue disc: the premium bundle. */
export function drawCrownBadge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  clayDisc(ctx, pal, x, y, r, pal.ownerTones.player);
  const g = pal.goldTones;
  const crown: readonly (readonly [number, number])[] = [
    [-0.6, 0.4],
    [-0.6, -0.35],
    [-0.28, -0.05],
    [0, -0.6],
    [0.28, -0.05],
    [0.6, -0.35],
    [0.6, 0.4],
  ];
  ctx.lineJoin = 'round';
  // shade copy offset, then mid, then the lit left third
  ctx.fillStyle = g.shade;
  poly(ctx, crown, x + r * 0.05, y + r * 0.1, r);
  ctx.fill();
  ctx.fillStyle = g.mid;
  poly(ctx, crown, x, y, r);
  ctx.fill();
  ctx.fillStyle = g.lit;
  poly(ctx, [[-0.6, 0.4], [-0.6, -0.35], [-0.28, -0.05], [-0.1, -0.4], [-0.14, 0.4]], x, y, r);
  ctx.fill();
  ctx.fillStyle = g.shade;
  poly(ctx, [[0.6, 0.4], [0.6, -0.35], [0.4, -0.15], [0.42, 0.4]], x, y, r);
  ctx.fill();
  // base band
  ctx.fillStyle = g.shade;
  ctx.fillRect(x - r * 0.6, y + r * 0.22, r * 1.2, r * 0.18);
  ctx.fillStyle = g.lit;
  ctx.fillRect(x - r * 0.6, y + r * 0.2, r * 1.2, r * 0.05);
  // pearls on the points and a crystal in the band
  ctx.fillStyle = g.lit;
  for (const px of [-0.6, 0, 0.6]) {
    ctx.beginPath();
    ctx.arc(x + px * r, y + (px === 0 ? -0.6 : -0.35) * r, r * 0.09, 0, TAU);
    ctx.fill();
  }
  drawCrystal(ctx, pal, x, y + r * 0.03, r * 0.16);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.57, y + r * 0.3);
  ctx.lineTo(x - r * 0.57, y - r * 0.3);
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

/** Small gold "+" bubble (upper-right of an upgrade glyph). */
function plusBubble(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  const g = pal.goldTones;
  ctx.fillStyle = g.shade;
  ctx.beginPath();
  ctx.arc(x + r * 0.08, y + r * 0.12, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = g.mid;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = Math.max(1.5, r * 0.28);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y);
  ctx.lineTo(x + r * 0.5, y);
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x, y + r * 0.5);
  ctx.stroke();
}

/** Thick clay arrow pointing up (shade offset, mid, lit edge). */
function upArrow(ctx: CanvasRenderingContext2D, tones: Tones, x: number, y: number, r: number): void {
  const pts: readonly (readonly [number, number])[] = [
    [0, -0.5],
    [0.5, 0.05],
    [0.2, 0.05],
    [0.2, 0.5],
    [-0.2, 0.5],
    [-0.2, 0.05],
    [-0.5, 0.05],
  ];
  ctx.lineJoin = 'round';
  ctx.fillStyle = tones.shade;
  poly(ctx, pts, x + r * 0.08, y + r * 0.12, r);
  ctx.fill();
  ctx.fillStyle = tones.mid;
  poly(ctx, pts, x, y, r);
  ctx.fill();
  ctx.fillStyle = tones.lit;
  poly(ctx, [[0, -0.5], [-0.5, 0.05], [-0.2, 0.05], [-0.2, 0.5], [-0.05, 0.5], [-0.05, -0.2]], x, y, r);
  ctx.fill();
}

/**
 * Commander upgrade icons on a paper disc: production = cog with a gold up-arrow, capacity = tower
 * with a "+" bubble, garrison = three soldiers, booster = gold bolt, speed = double chevron.
 */
export function drawUpgradeGlyph(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, kind: UpgradeKind): void {
  clayDisc(ctx, pal, x, y, r, { lit: '#ffffff', mid: pal.paper, shade: pal.panelBorder });
  const blue = pal.ownerTones.player;
  switch (kind) {
    case 'production': {
      // cog: 8 teeth as thick radial strokes, shade copy offset, then the wheel
      const m = pal.metal;
      const teeth = (dx: number, dy: number, color: string): void => {
        ctx.strokeStyle = color;
        ctx.lineWidth = r * 0.26;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU + Math.PI / 8;
          ctx.moveTo(x + dx + Math.cos(a) * r * 0.42, y + dy + Math.sin(a) * r * 0.42);
          ctx.lineTo(x + dx + Math.cos(a) * r * 0.66, y + dy + Math.sin(a) * r * 0.66);
        }
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r * 0.5, 0, TAU);
        ctx.fill();
      };
      teeth(r * 0.06, r * 0.1, m.shade);
      teeth(0, 0, m.mid);
      ctx.strokeStyle = m.lit;
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.42, Math.PI * 0.9, Math.PI * 1.6);
      ctx.stroke();
      ctx.fillStyle = pal.paper;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.3, 0, TAU);
      ctx.fill();
      upArrow(ctx, pal.goldTones, x, y, r * 0.5);
      break;
    }
    case 'capacity':
      drawRoofIcon(ctx, pal, blue.mid, x - r * 0.12, y + r * 0.2, r * 0.62);
      plusBubble(ctx, pal, x + r * 0.42, y - r * 0.4, r * 0.26);
      break;
    case 'garrison': {
      const s = r / 17;
      drawUnitSprite(ctx, pal, x - r * 0.42, y + r * 0.42, 'player', 'infantry', 1, 0, 1, 0, false, s);
      drawUnitSprite(ctx, pal, x + r * 0.42, y + r * 0.42, 'player', 'infantry', 1, 0, 2, 0, false, s);
      drawUnitSprite(ctx, pal, x, y + r * 0.55, 'player', 'infantry', 1, 0, 3, 0, false, s);
      break;
    }
    case 'booster':
      drawBoltGlyph(ctx, pal.gold, x + r * 0.05, y + r * 0.1, r * 0.62, pal.goldShade);
      drawBoltGlyph(ctx, pal.gold, x, y, r * 0.62, pal.goldShade);
      break;
    case 'speed': {
      // double chevron: shade copy, mid, thin lit edge
      const chev = (dx: number, dy: number, color: string, wdt: number): void => {
        ctx.strokeStyle = color;
        ctx.lineWidth = wdt;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (const ox of [-0.42, 0.1]) {
          ctx.moveTo(x + dx + ox * r, y + dy - r * 0.45);
          ctx.lineTo(x + dx + (ox + 0.4) * r, y + dy);
          ctx.lineTo(x + dx + ox * r, y + dy + r * 0.45);
        }
        ctx.stroke();
      };
      chev(r * 0.06, r * 0.1, blue.shade, r * 0.26);
      chev(0, 0, blue.mid, r * 0.26);
      chev(-r * 0.04, -r * 0.05, blue.lit, r * 0.08);
      break;
    }
  }
}

/**
 * Skin card preview inside a `size` × `size` tile centred on (x, y). `roof.*` ids draw a player
 * barracks wearing that roof; `helmet.*` ids draw a large player soldier wearing that helmet.
 * Unknown ids fall back to the default of their family.
 */
export function drawSkinPreview(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, size: number, skinId: string): void {
  ctx.save();
  if (skinId.startsWith('helmet.')) {
    const s = size / 30;
    ctx.translate(x + size * 0.02, y + size * 0.36);
    ctx.scale(s, s);
    drawUnitSprite(ctx, pal, 0, 0, 'player', 'infantry', 1, 0, 0, 0, false, 1, skinId);
  } else {
    const s = size / 128;
    ctx.translate(x + size * 0.06, y + size * 0.4);
    ctx.scale(s, s);
    drawTowerShadow(ctx, pal, 0, 0, 'barracks');
    drawTowerSprite(ctx, pal, { x: 0, y: 0, owner: 'player', kind: 'barracks', level: 1 }, { nowMs: 0, motion: false, skin: { roof: skinId } });
  }
  ctx.restore();
}
