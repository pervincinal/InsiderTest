import type { Owner, TowerKind, UnitKind } from '../sim/types';
import type { Palette } from './palette';
import { shade } from './palette';
import { TANK_RADIUS } from './layout';
import { font, roundRect } from './widgets';

/*
 * Toy-style building and soldier sprites, drawn with canvas primitives only. Anchor (x, y) is the
 * ground point the sim uses for the tower / unit; buildings rise above it, shadows sit under it.
 * Used by draw.ts (play) and menus.ts (title ambience, level tiles).
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
  /** Animate flags (false under prefers-reduced-motion). */
  motion: boolean;
  /** Lift the building a few px (selected). */
  raised?: boolean;
  /** 0..1 roof pulse (upgrade sparkle). */
  pulse?: number;
}

/** Top of the sprite above the anchor, per kind (badge sits above this). */
export function towerTop(kind: TowerKind): number {
  switch (kind) {
    case 'artillery':
      return 46;
    case 'tankFactory':
      return 62;
    case 'fortress':
      return 64;
    default:
      return 66;
  }
}

/** Centre of the unit-count badge for a tower. */
export function badgeY(kind: TowerKind): number {
  return -towerTop(kind) - 22;
}

export function drawTowerShadow(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, kind: TowerKind): void {
  const wide = kind === 'fortress' || kind === 'artillery' ? 1.25 : 1;
  ctx.fillStyle = pal.shadow;
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 8, 34 * wide, 14 * wide, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Stone cylinder: body with a shaded right third, brick hint lines, lighter elliptical top. */
function cylinder(ctx: CanvasRenderingContext2D, pal: Palette, x: number, top: number, bottom: number, r: number, ry: number): void {
  ctx.fillStyle = pal.stone;
  ctx.beginPath();
  ctx.moveTo(x - r, top);
  ctx.lineTo(x - r, bottom);
  ctx.ellipse(x, bottom, r, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + r, top);
  ctx.closePath();
  ctx.fill();
  // shaded right side
  ctx.fillStyle = pal.stoneDark;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.35, top);
  ctx.lineTo(x + r * 0.35, bottom + ry * 0.94);
  ctx.ellipse(x, bottom, r, ry, 0, Math.acos(0.35), 0, true);
  ctx.lineTo(x + r, top);
  ctx.closePath();
  ctx.fill();
  // brick hints
  ctx.strokeStyle = 'rgba(80, 70, 55, 0.22)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const rows = Math.max(1, Math.floor((bottom - top) / 12));
  for (let i = 1; i <= rows; i++) {
    const yy = top + ((bottom - top) * i) / (rows + 1);
    ctx.moveTo(x - r + 2, yy);
    ctx.lineTo(x + r - 2, yy);
    const off = i % 2 ? -r * 0.3 : r * 0.3;
    ctx.moveTo(x + off, yy);
    ctx.lineTo(x + off, yy - 5);
  }
  ctx.stroke();
  // outline
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r, top);
  ctx.lineTo(x - r, bottom);
  ctx.ellipse(x, bottom, r, ry, 0, Math.PI, 0, true);
  ctx.lineTo(x + r, top);
  ctx.stroke();
  // top rim
  ctx.fillStyle = pal.stoneLight;
  ctx.beginPath();
  ctx.ellipse(x, top, r, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Cone roof with a shaded right half and a darker rim. */
function cone(ctx: CanvasRenderingContext2D, color: string, x: number, base: number, apex: number, rx: number, ry: number): void {
  const light = shade(color, 0.12);
  const dark = shade(color, -0.28);
  const rim = shade(color, -0.45);
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.moveTo(x, apex);
  ctx.lineTo(x + rx, base);
  ctx.ellipse(x, base, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(x, apex);
  ctx.lineTo(x + rx, base);
  ctx.ellipse(x, base, rx, ry, 0, 0, Math.PI / 2, false);
  ctx.lineTo(x, apex);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, apex);
  ctx.lineTo(x + rx, base);
  ctx.ellipse(x, base, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.stroke();
}

function flag(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, top: number, height: number, nowMs: number, motion: boolean): void {
  ctx.strokeStyle = pal.stoneDark;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, top + height);
  ctx.lineTo(x, top);
  ctx.stroke();
  // two-frame flutter
  const frame = motion ? Math.floor(nowMs / 220 + x) % 2 : 0;
  const w = frame ? 3 : -3;
  ctx.fillStyle = color;
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 1, top);
  ctx.lineTo(x + 12, top + 2 + w);
  ctx.lineTo(x + 22, top + 1);
  ctx.lineTo(x + 22, top + 13);
  ctx.lineTo(x + 12, top + 14 + w);
  ctx.lineTo(x + 1, top + 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = pal.star;
  ctx.beginPath();
  ctx.arc(x, top - 1, 3, 0, Math.PI * 2);
  ctx.fill();
}

function pips(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, level: number): void {
  for (let i = 0; i < level; i++) {
    const px = x + (i - (level - 1) / 2) * 13;
    ctx.fillStyle = pal.star;
    ctx.strokeStyle = shade(pal.star, -0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 5, y + 4);
    ctx.lineTo(px - 5, y - 3);
    ctx.lineTo(px - 2, y);
    ctx.lineTo(px, y - 5);
    ctx.lineTo(px + 2, y);
    ctx.lineTo(px + 5, y - 3);
    ctx.lineTo(px + 5, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawBarracks(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.18;
  cylinder(ctx, pal, x, y - 26, y + 6, 22, 8);
  // tent / awning at the base (left front)
  ctx.fillStyle = shade(color, 0.05);
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 44, y + 12);
  ctx.lineTo(x - 30, y - 10);
  ctx.lineTo(x - 14, y + 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = shade(color, -0.35);
  ctx.beginPath();
  ctx.moveTo(x - 30, y - 10);
  ctx.lineTo(x - 14, y + 12);
  ctx.lineTo(x - 22, y + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, -0.6);
  ctx.beginPath();
  ctx.moveTo(x - 34, y + 12);
  ctx.lineTo(x - 30, y + 2);
  ctx.lineTo(x - 26, y + 12);
  ctx.closePath();
  ctx.fill();
  // roof
  cone(ctx, color, x, y - 30, y - 30 - 36 * pulse, 30 * pulse, 9 * pulse);
  pips(ctx, pal, x, y - 40, level);
  flag(ctx, pal, color, x + 24, y - 56, 28, o.nowMs, o.motion);
}

function drawFortress(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.18;
  // stone wall ring
  ctx.strokeStyle = pal.stoneDark;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 44, 17, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = pal.stone;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 44, 17, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = pal.stoneLight;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(x + Math.cos(a) * 44 - 3, y + Math.sin(a) * 17 - 4, 6, 5);
  }
  cylinder(ctx, pal, x, y - 24, y + 6, 30, 10);
  // crenellations
  ctx.fillStyle = pal.stoneLight;
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.45)';
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    const cx = x + i * 13;
    const cy = y - 24 - Math.sqrt(Math.max(0, 1 - ((i * 13) / 30) ** 2)) * 10;
    roundRect(ctx, { x: cx - 5, y: cy - 8, w: 10, h: 10 }, 2);
    ctx.fill();
    ctx.stroke();
  }
  cone(ctx, color, x, y - 30, y - 30 - 32 * pulse, 21 * pulse, 7 * pulse);
  pips(ctx, pal, x, y - 40, level);
  flag(ctx, pal, color, x + 32, y - 52, 26, o.nowMs, o.motion);
}

function drawArtillery(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.18;
  cylinder(ctx, pal, x, y - 12, y + 6, 30, 11);
  // sandbags
  ctx.fillStyle = pal.roadDim;
  for (let i = 0; i < 5; i++) {
    roundRect(ctx, { x: x - 30 + i * 12, y: y + 4, w: 12, h: 8 }, 4);
    ctx.fill();
  }
  // dome in owner colour
  ctx.fillStyle = shade(color, 0.1);
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 22 * pulse, 16 * pulse, 0, Math.PI, 0, false);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, -0.28);
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 22 * pulse, 16 * pulse, 0, -Math.PI / 2, 0, false);
  ctx.lineTo(x, y - 12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = shade(color, -0.45);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(x, y - 12, 22 * pulse, 16 * pulse, 0, Math.PI, 0, false);
  ctx.closePath();
  ctx.stroke();
  // cannon barrel to the upper right
  ctx.strokeStyle = '#3f4650';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 22);
  ctx.lineTo(x + 30, y - 40);
  ctx.stroke();
  ctx.strokeStyle = '#6b7380';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 26);
  ctx.lineTo(x + 28, y - 39);
  ctx.stroke();
  pips(ctx, pal, x - 4, y - 4, level);
  flag(ctx, pal, color, x - 26, y - 40, 24, o.nowMs, o.motion);
}

function drawFactory(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, y: number, level: number, o: TowerDrawOptions): void {
  const pulse = 1 + (o.pulse ?? 0) * 0.18;
  // boxy body
  ctx.fillStyle = pal.stone;
  ctx.fillRect(x - 30, y - 30, 60, 38);
  ctx.fillStyle = pal.stoneDark;
  ctx.fillRect(x + 12, y - 30, 18, 38);
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 30, y - 30, 60, 38);
  // door + windows
  ctx.fillStyle = '#4b5563';
  roundRect(ctx, { x: x - 8, y: y - 10, w: 16, h: 18 }, 3);
  ctx.fill();
  ctx.fillStyle = '#9fd4ff';
  ctx.fillRect(x - 24, y - 22, 8, 8);
  ctx.fillRect(x + 16, y - 22, 8, 8);
  // saw-tooth roof in owner colour
  ctx.fillStyle = shade(color, 0.1);
  ctx.strokeStyle = shade(color, -0.45);
  ctx.beginPath();
  ctx.moveTo(x - 32, y - 30);
  for (let i = 0; i < 3; i++) {
    const sx = x - 32 + i * 21.3;
    ctx.lineTo(sx + 8, y - 30 - 14 * pulse);
    ctx.lineTo(sx + 21.3, y - 30);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // chimney + smoke
  ctx.fillStyle = pal.stoneDark;
  ctx.fillRect(x + 14, y - 58, 11, 30);
  ctx.fillStyle = shade(color, -0.3);
  ctx.fillRect(x + 12, y - 62, 15, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  const drift = o.motion ? ((o.nowMs / 40) % 30) : 0;
  ctx.beginPath();
  ctx.arc(x + 20, y - 66 - drift * 0.3, 4 + drift * 0.1, 0, Math.PI * 2);
  ctx.arc(x + 25 + drift * 0.2, y - 72 - drift * 0.4, 5 + drift * 0.12, 0, Math.PI * 2);
  ctx.fill();
  pips(ctx, pal, x - 18, y - 4, level);
  flag(ctx, pal, color, x - 30, y - 56, 26, o.nowMs, o.motion);
}

/** Draw one building (without its shadow — call drawTowerShadow earlier so units walk over it). */
export function drawTowerSprite(ctx: CanvasRenderingContext2D, pal: Palette, t: TowerLook, o: TowerDrawOptions): void {
  const color = pal.owners[t.owner];
  const y = t.y - (o.raised ? 4 : 0);
  switch (t.kind) {
    case 'fortress':
      drawFortress(ctx, pal, color, t.x, y, t.level, o);
      break;
    case 'artillery':
      drawArtillery(ctx, pal, color, t.x, y, t.level, o);
      break;
    case 'tankFactory':
      drawFactory(ctx, pal, color, t.x, y, t.level, o);
      break;
    default:
      drawBarracks(ctx, pal, color, t.x, y, t.level, o);
  }
}

/** White rounded badge with a dark outline and bold navy text (≥ 22 px logical so it reads at 360 px). */
export function drawBadge(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, text: string, full = false): void {
  const px = 26;
  ctx.font = font(px, '900');
  const w = Math.max(48, ctx.measureText(text).width + 22);
  const h = 36;
  roundRect(ctx, { x: x - w / 2, y: y - h / 2, w, h }, 13);
  ctx.fillStyle = full ? pal.badgeFull : pal.badge;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.badgeEdge;
  ctx.stroke();
  ctx.fillStyle = pal.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 1);
}

/** Small cone-roof icon (level tiles, legend). */
export function drawRoofIcon(ctx: CanvasRenderingContext2D, pal: Palette, color: string, x: number, y: number, s: number): void {
  ctx.fillStyle = pal.stone;
  ctx.strokeStyle = 'rgba(60, 50, 40, 0.45)';
  ctx.lineWidth = 2;
  ctx.fillRect(x - s * 0.5, y - s * 0.2, s, s * 0.9);
  ctx.strokeRect(x - s * 0.5, y - s * 0.2, s, s * 0.9);
  ctx.fillStyle = pal.stoneDark;
  ctx.fillRect(x + s * 0.15, y - s * 0.2, s * 0.35, s * 0.9);
  cone(ctx, color, x, y - s * 0.2, y - s * 1.1, s * 0.7, s * 0.2);
}

/* ---------- units ---------- */

/**
 * Little soldier or tank. (dx, dy) is the unit direction of travel; bobbing uses `id` so a column
 * does not march in lock-step. Cheap: no gradients, no shadows blur, ~5 fills per soldier.
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
): void {
  const color = pal.owners[owner];
  const dark = shade(color, -0.35);
  if (kind === 'tank') {
    const s = TANK_RADIUS;
    ctx.fillStyle = pal.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 5, s + 2, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // treads
    ctx.fillStyle = '#3f4650';
    roundRect(ctx, { x: x - s - 1, y: y - s * 0.55, w: s * 2 + 2, h: s * 1.2 }, 3);
    ctx.fill();
    // hull
    ctx.fillStyle = color;
    roundRect(ctx, { x: x - s + 2, y: y - s * 0.85, w: s * 2 - 4, h: s * 1.25 }, 3);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.fillRect(x - s + 2, y - s * 0.85 + s * 0.8, s * 2 - 4, s * 0.45);
    // turret + barrel
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(x, y - s * 0.4, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2d3340';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.4);
    ctx.lineTo(x + dx * s * 1.3, y - s * 0.4 + dy * s * 1.3);
    ctx.stroke();
    return;
  }
  const bob = motion ? Math.sin(nowMs / 95 + id * 1.7) * 1.4 : 0;
  const lean = dx * 1.6;
  // shadow
  ctx.fillStyle = pal.shadow;
  ctx.beginPath();
  ctx.ellipse(x + 1, y + 4, 6, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const by = y + bob;
  // legs / lower body (darker)
  ctx.fillStyle = dark;
  ctx.fillRect(x - 4.5 - lean * 0.5, by - 4, 9, 7);
  // torso (owner colour)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, by - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  // head + helmet band
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.arc(x + lean * 0.6, by - 12, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x + lean * 0.6, by - 12.6, 4.6, Math.PI, Math.PI * 2);
  ctx.fill();
}
