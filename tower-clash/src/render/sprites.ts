import type { Owner, TowerKind, UnitKind } from '../sim/types';
import type { Palette, Tones } from './palette';
import { shade } from './palette';
import { TANK_RADIUS } from './layout';
import { font, roundRect } from './widgets';
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
}

const RIM = 'rgba(255, 250, 240, 0.55)';
const INK_LINE = 'rgba(30, 42, 68, 0.18)';

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
function cone(ctx: CanvasRenderingContext2D, tones: Tones, x: number, base: number, apex: number, rx: number, ry: number): void {
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
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 1, apex + 2);
  ctx.lineTo(x - rx + 2, base - 1);
  ctx.stroke();
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
  cone(ctx, tones, x, y - 50, y - 50 - rh, 30 * pulse, 9 * pulse);
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
  cone(ctx, tones, x, y - 50, y - 50 - 34 * pulse, 21 * pulse, 7 * pulse);
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
  // dome in owner colour: three facets
  const rx = 22 * pulse;
  const ry = 17 * pulse;
  const dy = y - 20;
  ctx.fillStyle = tones.mid;
  ctx.beginPath();
  ctx.ellipse(x, dy, rx, ry, 0, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tones.shade;
  ctx.beginPath();
  ctx.ellipse(x, dy, rx, ry, 0, -Math.PI * 0.35, 0, false);
  ctx.lineTo(x, dy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = tones.lit;
  ctx.beginPath();
  ctx.ellipse(x, dy, rx, ry, 0, Math.PI, Math.PI * 1.4, false);
  ctx.lineTo(x, dy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, dy, rx - 2, ry - 2, 0, Math.PI * 1.05, Math.PI * 1.45, false);
  ctx.stroke();
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
  // saw-tooth roof in owner colour
  const teeth = 3;
  const tw = 64 / teeth;
  for (let i = 0; i < teeth; i++) {
    const sx = x - 32 + i * tw;
    ctx.fillStyle = tones.mid;
    ctx.beginPath();
    ctx.moveTo(sx, y - 40);
    ctx.lineTo(sx + tw * 0.4, y - 40 - 16 * pulse);
    ctx.lineTo(sx + tw, y - 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tones.lit;
    ctx.beginPath();
    ctx.moveTo(sx, y - 40);
    ctx.lineTo(sx + tw * 0.4, y - 40 - 16 * pulse);
    ctx.lineTo(sx + tw * 0.4, y - 40);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x - 32, y - 41, 64, 3);
  // chimney + smoke
  ctx.fillStyle = st.shade;
  ctx.fillRect(x + 16, y - 70, 12, 32);
  ctx.fillStyle = st.mid;
  ctx.fillRect(x + 16, y - 70, 5, 32);
  ctx.fillStyle = tones.shade;
  ctx.fillRect(x + 14, y - 74, 16, 6);
  const drift = o.motion ? (o.nowMs / 40) % 30 : 12;
  ctx.fillStyle = `rgba(255,250,240,${0.8 - drift / 45})`;
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
}
