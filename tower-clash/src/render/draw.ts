import type { GameState, LevelDef, Outcome, Owner, Road, Tower, Unit } from '../sim/types';
import { C } from '../sim/constants';
import { capacityOf, isUnderFire, roadPointAt } from '../sim/step';
import type { Biome, Palette } from './palette';
import { biomeFor, themeFor, withAlpha } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, clipToMap } from './view';
import { HUD } from './layout';
import { font, roundRect } from './widgets';
import { drawHud, drawOverlays } from './hud';
import { blankLayer, paintGround, paintHud } from './layers';
import type { TerrainSpec } from './terrain';
import { drawTerrain, drawTerrainOverlay } from './terrain';
import type { TowerSkin } from './sprites';
import { badgeY, drawBadge, drawTowerShadow, drawTowerSprite, drawUnitSprite, towerFootprintRadius } from './sprites';
import type { ParticleSystem } from './particles';
import { hostileAttackers, prefersReducedMotion } from './particles';

/** Everything the renderer needs beyond the sim state. Owned by the play screen; read-only here. */
export interface PlayUi {
  level: LevelDef;
  palette: Palette;
  /** 0..1 fraction of a tick elapsed since the last step, for unit interpolation. */
  alpha: number;
  selectedTowerId: string | null;
  hoverTowerId: string | null;
  /** Bridge currently being long-pressed and how far along (0..1) the press is. */
  pressRoadId: string | null;
  pressProgress: number;
  paused: boolean;
  outcome: Outcome;
  stars: number; // only meaningful when outcome === 'won'
  hasNext: boolean;
  speed: number;
  /** Coins awarded by this clear (first-clear stars × COINS_PER_STAR) and the save total. */
  coinsEarned: number;
  coinsTotal: number;
  /** Visual effects fed from sim events (optional: menus / tests draw without them). */
  particles?: ParticleSystem;
  /** Equipped cosmetic skins; roof / helmet apply to the player's towers and soldiers only, the theme re-lights the ground. */
  skin?: TowerSkin;
  /**
   * Rules v2 link-limit refusal: the selected tower shakes briefly and a paper hint bubble shows
   * `limitHintText` until `until` (same clock as `nowMs`). The play screen sets a fresh object per
   * refusal; the text is already localised by the UI.
   */
  limitHint?: { until: number };
  limitHintText?: string;
}

/**
 * Structural stand-in for the sim's `Link` (GDD §2.0 attack streams) so the renderer builds
 * before `src/sim/types.ts` exports it; `GameState.links` is read as `state.links ?? []`.
 */
export interface LinkLike {
  owner: Owner;
  from: string;
  to: string;
  roadId: string;
}

type LinkedState = Pick<GameState, 'roads' | 'towers'> & { links?: readonly LinkLike[] };

let reducedMotion = false;
let reducedMotionCheckedAt = -1;
/** Re-evaluated at most every 500 ms so a settings change applies without a reload. */
function motionAllowed(): boolean {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - reducedMotionCheckedAt > 500) {
    reducedMotion = prefersReducedMotion();
    reducedMotionCheckedAt = now;
  }
  return !reducedMotion;
}

/* ---------- roads ---------- */

export interface Pose {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Point and unit tangent at fraction `t` along a road's polyline (measured from road.a). */
export function roadPoseAt(road: Road, t: number): Pose {
  const pts = road.points;
  const n = pts.length;
  if (n < 2) {
    const p = pts[0] ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y, dx: 1, dy: 0 };
  }
  let remaining = Math.max(0, Math.min(1, t)) * road.length;
  for (let i = 1; i < n; i++) {
    const p = pts[i - 1]!;
    const q = pts[i]!;
    const sx = q.x - p.x;
    const sy = q.y - p.y;
    const seg = Math.hypot(sx, sy);
    if (remaining <= seg || i === n - 1) {
      const k = seg === 0 ? 0 : Math.min(1, remaining / seg);
      const inv = seg === 0 ? 0 : 1 / seg;
      return { x: p.x + sx * k, y: p.y + sy * k, dx: sx * inv, dy: sy * inv };
    }
    remaining -= seg;
  }
  const last = pts[n - 1]!;
  return { x: last.x, y: last.y, dx: 1, dy: 0 };
}

function tracePolyline(ctx: CanvasRenderingContext2D, road: Road, t0: number, t1: number): void {
  const steps = Math.max(2, Math.ceil((road.length * (t1 - t0)) / 24));
  for (let i = 0; i <= steps; i++) {
    const p = roadPointAt(road, t0 + ((t1 - t0) * i) / steps);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

/** Small paper chip with ink numerals for hazard counts / queued sends. */
function chip(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, text: string, stroke: string): void {
  drawBadge(ctx, pal, x, y, text, false, { stroke, scale: 0.72 });
}

/** Plank bridge with rope rails (dynamic: it can be cut). Static roads live in the terrain cache. */
function drawBridge(ctx: CanvasRenderingContext2D, pal: Palette, road: Road, pressing: number): void {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  const spans: [number, number][] = road.cut
    ? [
        [0, 0.36],
        [0.64, 1],
      ]
    : [[0, 1]];
  const wood = pal.woodTones;
  for (const [t0, t1] of spans) {
    // shadow on the water / ground, then the deck
    ctx.strokeStyle = pal.groundShadow;
    ctx.lineWidth = 30;
    ctx.beginPath();
    tracePolyline(ctx, road, t0, t1);
    ctx.save();
    ctx.translate(4, 7);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = wood.shade;
    ctx.lineWidth = 28;
    ctx.stroke();
    ctx.strokeStyle = wood.mid;
    ctx.lineWidth = 22;
    ctx.stroke();
    // planks: lit top edge + shade gap
    const count = Math.max(1, Math.floor((road.length * (t1 - t0)) / 12));
    ctx.lineWidth = 3;
    ctx.strokeStyle = wood.shade;
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const p = roadPoseAt(road, t0 + ((t1 - t0) * i) / count);
      ctx.moveTo(p.x - p.dy * 11, p.y + p.dx * 11);
      ctx.lineTo(p.x + p.dy * 11, p.y - p.dx * 11);
    }
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = wood.lit;
    ctx.beginPath();
    for (let i = 0; i <= count; i++) {
      const p = roadPoseAt(road, t0 + ((t1 - t0) * i) / count);
      ctx.moveTo(p.x - p.dy * 11 - 2, p.y + p.dx * 11 - 2);
      ctx.lineTo(p.x + p.dy * 11 - 2, p.y - p.dx * 11 - 2);
    }
    ctx.stroke();
    // rope rails on both sides, with posts
    ctx.strokeStyle = pal.rope;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const posts = Math.max(2, Math.floor((road.length * (t1 - t0)) / 48));
    for (const side of [-1, 1]) {
      for (let i = 0; i <= posts; i++) {
        const p = roadPoseAt(road, t0 + ((t1 - t0) * i) / posts);
        const px = p.x - p.dy * 14 * side;
        const py = p.y + p.dx * 14 * side;
        if (i === 0) ctx.moveTo(px, py - 8);
        else ctx.lineTo(px, py - 8);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = wood.shade;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const side of [-1, 1]) {
      for (let i = 0; i <= posts; i++) {
        const p = roadPoseAt(road, t0 + ((t1 - t0) * i) / posts);
        const px = p.x - p.dy * 14 * side;
        const py = p.y + p.dx * 14 * side;
        ctx.moveTo(px, py + 1);
        ctx.lineTo(px, py - 9);
      }
    }
    ctx.stroke();
  }
  if (road.cut) {
    // splintered ends over the gap
    ctx.fillStyle = wood.shade;
    for (const t of [0.36, 0.64]) {
      const p = roadPoseAt(road, t);
      ctx.beginPath();
      ctx.moveTo(p.x - p.dy * 11, p.y + p.dx * 11);
      ctx.lineTo(p.x + p.dx * (t < 0.5 ? 10 : -10), p.y + p.dy * (t < 0.5 ? 10 : -10));
      ctx.lineTo(p.x + p.dy * 11, p.y - p.dx * 11);
      ctx.closePath();
      ctx.fill();
    }
    // fallen planks scattered in the gap (deterministic per road)
    for (let i = 0; i < 4; i++) {
      const p = roadPoseAt(road, 0.41 + i * 0.06);
      const side = (i % 2 ? 1 : -1) * (5 + i * 3);
      const x = p.x - p.dy * side;
      const y = p.y + p.dx * side + 3;
      const ang = Math.atan2(p.dy, p.dx) + (i - 1.5) * 0.75;
      const len = 6 + (i % 3) * 2;
      const c = Math.cos(ang) * len;
      const sn = Math.sin(ang) * len;
      ctx.lineCap = 'butt';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = pal.groundShadow;
      ctx.beginPath();
      ctx.moveTo(x - c + 2, y - sn + 3);
      ctx.lineTo(x + c + 2, y + sn + 3);
      ctx.stroke();
      ctx.strokeStyle = i % 2 ? wood.mid : wood.shade;
      ctx.beginPath();
      ctx.moveTo(x - c, y - sn);
      ctx.lineTo(x + c, y + sn);
      ctx.stroke();
    }
    return;
  }
  if (pressing > 0) {
    const m = roadPointAt(road, 0.5);
    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(pal.ink, 0.25);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = pal.mine;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pressing);
    ctx.stroke();
  }
}

/** Initial hazard strength from the level definition (the sim only keeps the remainder). */
function initialHazard(level: LevelDef, road: Road, key: 'barrier' | 'mine'): number {
  for (const r of level.roads) {
    if ((r.a === road.a && r.b === road.b) || (r.a === road.b && r.b === road.a)) return r[key] ?? 0;
  }
  return 0;
}

function drawHazards(ctx: CanvasRenderingContext2D, pal: Palette, level: LevelDef, road: Road, nowMs: number): void {
  if (road.cut) return;
  const m = roadPoseAt(road, 0.5);
  if (road.barrier > 0) {
    // clay wall blocks across the path; cracks grow as hp drains
    const nx = -m.dy;
    const ny = m.dx;
    const initial = Math.max(road.barrier, initialHazard(level, road, 'barrier'));
    const damage = 1 - road.barrier / initial;
    ctx.fillStyle = pal.groundShadow;
    ctx.beginPath();
    ctx.ellipse(m.x + 8, m.y + 9, 34, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    const st = pal.barrierTones;
    ctx.lineJoin = 'round';
    for (let i = -2; i <= 2; i++) {
      const cx = m.x + nx * i * 12;
      const cy = m.y + ny * i * 12;
      const h = 18 + (i % 2 ? 0 : 4);
      ctx.fillStyle = st.shade;
      roundRect(ctx, { x: cx - 6, y: cy - h + 3, w: 13, h }, 3);
      ctx.fill();
      ctx.fillStyle = st.mid;
      roundRect(ctx, { x: cx - 7, y: cy - h, w: 13, h }, 3);
      ctx.fill();
      ctx.fillStyle = st.lit;
      roundRect(ctx, { x: cx - 6, y: cy - h + 1, w: 11, h: 4 }, 2);
      ctx.fill();
      // ink contour so the wall reads on every ground colour
      ctx.strokeStyle = withAlpha(pal.ink, 0.35);
      ctx.lineWidth = 1.5;
      roundRect(ctx, { x: cx - 7, y: cy - h, w: 13, h }, 3);
      ctx.stroke();
      // cracks proportional to damage
      const cracks = Math.round(damage * 3);
      if (cracks > 0 && (i + 2) % Math.max(1, 4 - cracks) === 0) {
        ctx.strokeStyle = withAlpha(pal.ink, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - h + 4);
        ctx.lineTo(cx + 1, cy - h / 2);
        ctx.lineTo(cx - 2, cy - 3);
        ctx.stroke();
      }
    }
    chip(ctx, pal, m.x, m.y - 36, String(road.barrier), pal.ink);
  }
  if (road.mine > 0) {
    const blink = motionAllowed() ? 0.55 + 0.45 * Math.sin(nowMs / 160) : 1;
    ctx.fillStyle = pal.groundShadow;
    ctx.beginPath();
    ctx.ellipse(m.x + 4, m.y + 6, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.metal.shade;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 15, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.metal.mid;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 3, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // stripe ring
    ctx.strokeStyle = pal.gold;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 3, 12, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pal.mine;
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.arc(m.x, m.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    chip(ctx, pal, m.x, m.y - 30, String(road.mine), pal.mine);
  }
}

/* ---------- attack streams (rules v2 links) ---------- */

const LINK_WIDTH = 10;
/** Chevron pitch along the ribbon and their speed toward the target (px / s). */
const CHEVRON_PITCH = 26;
const CHEVRON_SPEED = 90;
/** Ribbon starts this far inside the source's base and its arrowhead tip lands just past the target's base. */
const LINK_START_PX = 30;
const LINK_END_PAD = 14;
/** Two opposite links on one road sit ±this many px off the centre line (each keeps to its right). */
const LINK_SIDE_PX = 4;

interface RibbonPt {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Pose at `s` px from the source along the direction of travel, shifted `off` px to its right. */
function ribbonPose(road: Road, forward: boolean, s: number, off: number): RibbonPt {
  const t = road.length > 0 ? s / road.length : 0;
  const p = roadPoseAt(road, forward ? t : 1 - t);
  const dx = forward ? p.dx : -p.dx;
  const dy = forward ? p.dy : -p.dy;
  return { x: p.x - dy * off, y: p.y + dx * off, dx, dy };
}

function traceRibbon(ctx: CanvasRenderingContext2D, road: Road, forward: boolean, s0: number, s1: number, off: number): void {
  const steps = Math.max(2, Math.ceil((s1 - s0) / 10));
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const p = ribbonPose(road, forward, s0 + ((s1 - s0) * i) / steps, off);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function linkRoad(state: LinkedState, link: LinkLike): Road | undefined {
  const byId = state.roads[link.roadId];
  if (byId) return byId;
  const [a, b] = link.from < link.to ? [link.from, link.to] : [link.to, link.from];
  return state.roads[`${a}-${b}`];
}

/**
 * Every active link as a road-following ribbon in the owner's colour (mid tone, 55 %; the player's
 * in the lit tone with a 1 px ink outline so their own streams read first), chevrons marching
 * toward the target (frozen under reduced motion) and an arrowhead at the target end. Opposite
 * links on one road are offset to their right so both read. Sources with ≥ 1 link get a soft
 * pulsing "draining" ring on the ground. Drawn over roads, under hazards / units / towers.
 */
export function drawLinks(ctx: CanvasRenderingContext2D, pal: Palette, state: LinkedState, nowMs: number, motion: boolean): void {
  const links = state.links ?? [];
  if (links.length === 0) return;
  // which roads carry traffic both ways, and which towers are draining
  const dirs = new Map<string, number>();
  const draining = new Map<string, Owner>();
  for (const l of links) {
    const road = linkRoad(state, l);
    if (!road) continue;
    dirs.set(road.id, (dirs.get(road.id) ?? 0) | (l.from === road.a ? 1 : 2));
    draining.set(l.from, l.owner);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [id, owner] of draining) {
    const t = state.towers[id];
    if (!t) continue;
    const tones = pal.ownerTones[owner];
    const pulse = motion ? 0.5 + 0.5 * Math.sin(nowMs / 260 + t.x * 0.02) : 0.5;
    const r = towerFootprintRadius(t.kind, t.level) + 10 + pulse * 5;
    ctx.strokeStyle = withAlpha(tones.mid, 0.3 + pulse * 0.25);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 8, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = withAlpha(tones.lit, 0.35 + pulse * 0.25);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y + 8, r - 6, (r - 6) * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const phase = motion ? ((nowMs / 1000) * CHEVRON_SPEED) % CHEVRON_PITCH : 0;
  for (const l of links) {
    const road = linkRoad(state, l);
    if (!road || road.cut) continue;
    const forward = l.from === road.a;
    const off = dirs.get(road.id) === 3 ? LINK_SIDE_PX : 0;
    const len = road.length;
    const target = state.towers[l.to];
    const endPx = (target ? towerFootprintRadius(target.kind, target.level) : 32) + LINK_END_PAD;
    const s0 = Math.min(LINK_START_PX, len * 0.45);
    const s1 = Math.max(len - endPx, len * 0.55);
    const mine = l.owner === 'player';
    const tones = pal.ownerTones[l.owner];
    const body = mine ? tones.lit : tones.mid;
    // ribbon: ink outline for the player, then the translucent body
    traceRibbon(ctx, road, forward, s0, s1, off);
    if (mine) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = LINK_WIDTH + 2;
      ctx.stroke();
    }
    ctx.globalAlpha = mine ? 0.72 : 0.55;
    ctx.strokeStyle = body;
    ctx.lineWidth = LINK_WIDTH;
    ctx.stroke();
    // chevrons pointing at the target
    ctx.globalAlpha = mine ? 0.9 : 0.75;
    ctx.strokeStyle = pal.paper;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let sPos = s0 + 8 + phase; sPos < s1 - 6; sPos += CHEVRON_PITCH) {
      const p = ribbonPose(road, forward, sPos, off);
      const nx = -p.dy;
      const ny = p.dx;
      ctx.moveTo(p.x - p.dx * 3 + nx * 3.4, p.y - p.dy * 3 + ny * 3.4);
      ctx.lineTo(p.x + p.dx * 2.5, p.y + p.dy * 2.5);
      ctx.lineTo(p.x - p.dx * 3 - nx * 3.4, p.y - p.dy * 3 - ny * 3.4);
    }
    ctx.stroke();
    // arrowhead at the target end
    const e = ribbonPose(road, forward, s1, off);
    const nx = -e.dy;
    const ny = e.dx;
    ctx.beginPath();
    ctx.moveTo(e.x + e.dx * 12, e.y + e.dy * 12);
    ctx.lineTo(e.x - e.dx * 5 + nx * 10, e.y - e.dy * 5 + ny * 10);
    ctx.lineTo(e.x - e.dx * 1, e.y - e.dy * 1);
    ctx.lineTo(e.x - e.dx * 5 - nx * 10, e.y - e.dy * 5 - ny * 10);
    ctx.closePath();
    ctx.globalAlpha = 1;
    if (mine) {
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = mine ? tones.lit : tones.mid;
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.fillStyle = pal.paper;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(e.x + e.dx * 8, e.y + e.dy * 8);
    ctx.lineTo(e.x - e.dx * 3 + nx * 5, e.y - e.dy * 3 + ny * 5);
    ctx.lineTo(e.x - e.dx * 1, e.y - e.dy * 1);
    ctx.lineTo(e.x - e.dx * 3 - nx * 5, e.y - e.dy * 3 - ny * 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ---------- ground marks (under towers/units) ---------- */

/** Gold clay ring on the ground with a soft outer glow. */
function selectionRing(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, dash?: number[], offset = 0): void {
  const ry = r * 0.42;
  ctx.setLineDash(dash ?? []);
  ctx.lineDashOffset = offset;
  ctx.strokeStyle = withAlpha(pal.gold, 0.22);
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, r, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = pal.goldShade;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.ellipse(x, y + 10, r, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = pal.gold;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(x, y + 8, r, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,240,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 6, r, ry, 0, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function drawGroundMarks(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number): void {
  const motion = motionAllowed();
  // artillery ranges (the sim measures a circle in map units)
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.kind !== 'artillery' || t.owner === 'neutral') continue;
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = pal.ownerTones[t.owner].shade;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.arc(t.x, t.y, C.ARTILLERY_RANGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  const sel = ui.selectedTowerId ? state.towers[ui.selectedTowerId] : undefined;
  const hov = ui.hoverTowerId ? state.towers[ui.hoverTowerId] : undefined;
  if (sel) {
    const pulse = motion ? (Math.sin(nowMs / 180) + 1) / 2 : 0.5;
    selectionRing(ctx, pal, sel.x, sel.y, 54 + pulse * 4);
  }
  if (hov && sel && hov.id !== sel.id) {
    const [a, b] = sel.id < hov.id ? [sel.id, hov.id] : [hov.id, sel.id];
    const road = state.roads[`${a}-${b}`];
    if (road) {
      ctx.lineCap = 'round';
      ctx.setLineDash([16, 14]);
      ctx.lineDashOffset = motion ? -(nowMs / 25) % 30 : 0;
      ctx.beginPath();
      tracePolyline(ctx, road, 0, 1);
      ctx.strokeStyle = pal.goldShade;
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.strokeStyle = pal.gold;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    selectionRing(ctx, pal, hov.x, hov.y, 56, [12, 9], motion ? -(nowMs / 40) % 21 : 0);
  } else if (hov && !sel) {
    selectionRing(ctx, pal, hov.x, hov.y, 56, [12, 9]);
  }
}

/* ---------- units & towers ---------- */

interface UnitDraw {
  x: number;
  y: number;
  dx: number;
  dy: number;
  scale: number;
  unit: Unit;
}

function unitDraws(state: GameState, alpha: number, out: UnitDraw[]): void {
  for (const unit of state.units) {
    const road = state.roads[unit.roadId];
    if (!road) continue;
    const advance = road.length > 0 ? (unit.speed * alpha * C.TICK_MS) / 1000 / road.length : 0;
    const progress = Math.min(1, unit.progress + advance);
    const forward = unit.from === road.a;
    const p = roadPoseAt(road, forward ? progress : 1 - progress);
    // spawn scale-in over the first 28 px out of the gate
    const scale = Math.min(1, 0.35 + (progress * road.length) / 28);
    out.push({ x: p.x, y: p.y, dx: forward ? p.dx : -p.dx, dy: forward ? p.dy : -p.dy, scale, unit });
  }
  out.sort((a, b) => a.y - b.y);
}

/** Last seen garrison per tower, for the badge scale pop on change. */
const badgeMemory = new WeakMap<GameState, Map<string, { n: number; at: number }>>();

function badgePop(state: GameState, id: string, n: number, nowMs: number, motion: boolean): number {
  if (!motion) return 1;
  let mem = badgeMemory.get(state);
  if (!mem) {
    mem = new Map();
    badgeMemory.set(state, mem);
  }
  const prev = mem.get(id);
  if (!prev) {
    mem.set(id, { n, at: -Infinity });
    return 1;
  }
  if (prev.n !== n) {
    prev.n = n;
    prev.at = nowMs;
  }
  const t = (nowMs - prev.at) / 220;
  if (t >= 1) return 1;
  return 1 + 0.18 * Math.sin(t * Math.PI);
}

/** Dust behind the rearmost soldier of every marching column (sand only; rate-limited in the system). */
function spawnDust(fx: ParticleSystem, pal: Palette, units: UnitDraw[], nowMs: number): void {
  const rear = new Map<string, UnitDraw>();
  for (const u of units) {
    const key = `${u.unit.roadId}|${u.unit.from}`;
    const prev = rear.get(key);
    if (!prev || u.unit.progress < prev.unit.progress) rear.set(key, u);
  }
  for (const [key, u] of rear) {
    if (u.scale < 1) continue; // still leaving the gate
    fx.dust(key, u.x - u.dx * 8, u.y + 2, pal.dust, nowMs);
  }
}

function drawWorld(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number, biome: Biome): void {
  const motion = motionAllowed();
  const towers = Object.values(state.towers).sort((a, b) => a.y - b.y);
  for (const t of towers) drawTowerShadow(ctx, pal, t.x, t.y, t.kind, t.level);

  const units: UnitDraw[] = [];
  unitDraws(state, ui.alpha, units);
  if (motion && biome === 'sand' && ui.particles && units.length) spawnDust(ui.particles, pal, units, nowMs);
  // painter's order: everything sorted by ground y so units walk in front of / behind buildings
  let ui_ = 0;
  const skin = ui.skin;
  const drawUnit = (u: UnitDraw): void =>
    drawUnitSprite(ctx, pal, u.x, u.y, u.unit.owner, u.unit.kind, u.dx, u.dy, u.unit.id, nowMs, motion, u.scale, u.unit.owner === 'player' ? skin?.helmet : undefined);
  const fx = ui.particles;
  const hint = limitHintState(ui, nowMs);
  // rules v2.1 "under fire": who is landing on whom (badge tint + impact rings, see particles.ts)
  const attackers = hostileAttackers(state);
  fx?.landings(state, attackers, pal, nowMs);
  for (const t of towers) {
    while (ui_ < units.length && units[ui_]!.y <= t.y + 4) drawUnit(units[ui_++]!);
    const shake = hint && ui.selectedTowerId === t.id && motion ? hint.shake : 0;
    if (shake) ctx.translate(shake, 0);
    drawTowerSprite(ctx, pal, t, {
      nowMs,
      motion,
      raised: ui.selectedTowerId === t.id,
      pulse: fx?.towerPulse(t.id, nowMs) ?? 0,
      squash: fx?.towerSquash(t.id, nowMs) ?? 1,
      wipe: fx?.towerWipe(t.id, nowMs) ?? undefined,
      aim: fx?.aimOf(t.id),
      skin: t.owner === 'player' ? skin : undefined,
    });
    if (shake) ctx.translate(-shake, 0);
  }
  while (ui_ < units.length) drawUnit(units[ui_++]!);

  // badges on top of everything in the world
  const queued = new Map<string, number>();
  for (const q of state.queues) queued.set(q.from, (queued.get(q.from) ?? 0) + q.remaining);
  for (const t of towers) {
    const raise = ui.selectedTowerId === t.id ? 4 : 0;
    const by = Math.max(HUD.mapTop + 26, t.y + badgeY(t.kind, t.level) - raise);
    const pop = badgePop(state, t.id, t.units, nowMs, motion);
    const by_ = isUnderFire(state, t) ? attackers.get(t.id) : undefined;
    drawBadge(ctx, pal, t.x, by, String(t.units), t.units >= capacityOf(t), {
      stroke: pal.ownerTones[t.owner].shade,
      scale: pop,
      underFire: isUnderFire(state, t) ? (by_ ? pal.owners[by_] : pal.ink) : undefined,
      shake: motion ? (fx?.badgeHit(t.id, nowMs) ?? 0) : 0,
    });
    const n = queued.get(t.id) ?? 0;
    if (n > 0) chip(ctx, pal, t.x + 46, by + 2, `+${n}`, pal.ownerTones[t.owner].mid);
  }
  if (hint && ui.limitHintText && ui.selectedTowerId) {
    const t = state.towers[ui.selectedTowerId];
    if (t) drawHintBubble(ctx, pal, t, Math.max(HUD.mapTop + 26, t.y + badgeY(t.kind, t.level) - 4), ui.limitHintText, hint.alpha);
  }
}

/* ---------- link-limit hint ---------- */

const HINT_SHAKE_MS = 380;
const HINT_FADE_MS = 160;
/** First frame each hint object was seen, so the shake starts when the refusal happens. */
const hintSeen = new WeakMap<object, number>();

function limitHintState(ui: PlayUi, nowMs: number): { shake: number; alpha: number } | null {
  const h = ui.limitHint;
  if (!h || nowMs >= h.until) return null;
  let start = hintSeen.get(h);
  if (start === undefined) {
    start = nowMs;
    hintSeen.set(h, start);
  }
  const age = nowMs - start;
  const k = Math.max(0, 1 - age / HINT_SHAKE_MS);
  const shake = Math.sin(nowMs / 18) * 4 * k;
  const alpha = Math.min(1, age / HINT_FADE_MS, (h.until - nowMs) / HINT_FADE_MS);
  return { shake, alpha };
}

/**
 * Paper speech bubble with ink text above (or, near the map top, below) a tower. Text ≥ 22 px
 * logical; the bubble stays inside the map horizontally.
 */
function drawHintBubble(ctx: CanvasRenderingContext2D, pal: Palette, t: Tower, badgeTop: number, text: string, alpha: number): void {
  const px = 22;
  ctx.font = font(px, '700');
  const w = Math.min(C.MAP_W - 24, ctx.measureText(text).width + 30);
  const h = 42;
  const below = badgeTop - 22 - h < HUD.mapTop + 6;
  const cy = below ? t.y + 34 + h / 2 : badgeTop - 30 - h / 2;
  const cx = Math.max(12 + w / 2, Math.min(C.MAP_W - 12 - w / 2, t.x));
  const r = { x: cx - w / 2, y: cy - h / 2, w, h };
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pal.groundShadow;
  roundRect(ctx, { x: r.x + 2, y: r.y + 5, w, h }, 14);
  ctx.fill();
  const body = (): void => {
    roundRect(ctx, r, 14);
    // tail toward the tower
    const tx = Math.max(r.x + 20, Math.min(r.x + w - 20, t.x));
    if (below) {
      ctx.moveTo(tx - 8, r.y + 1);
      ctx.lineTo(tx, r.y - 9);
      ctx.lineTo(tx + 8, r.y + 1);
    } else {
      ctx.moveTo(tx - 8, r.y + h - 1);
      ctx.lineTo(tx, r.y + h + 9);
      ctx.lineTo(tx + 8, r.y + h - 1);
    }
  };
  ctx.fillStyle = pal.paper;
  body();
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  body();
  ctx.stroke();
  // paper over the tail seam
  ctx.fillStyle = pal.paper;
  roundRect(ctx, { x: r.x + 2, y: r.y + 2, w: w - 4, h: h - 4 }, 12);
  ctx.fill();
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1, w - 16);
  ctx.globalAlpha = 1;
}

/* ---------- entry ---------- */

const specCache = new WeakMap<GameState, TerrainSpec>();

function terrainSpec(state: GameState, theme: string | undefined): TerrainSpec {
  let spec = specCache.get(state);
  if (spec && spec.theme === theme) return spec;
  spec = {
    key: `level:${state.levelId}`,
    seed: state.levelId,
    biome: biomeFor(state.levelId),
    theme,
    roads: Object.values(state.roads).map((r) => ({ points: r.points, kind: r.kind })),
    towers: Object.values(state.towers).map((t) => ({ x: t.x, y: t.y })),
  };
  specCache.set(state, spec);
  return spec;
}


/**
 * Draw one frame. Reads state and ui; never mutates either. `nowMs` drives purely visual motion.
 * With `layered` (play screen, no tutorial) and `view.layers` present, the ground and the HUD live
 * on their own static canvases (PERF-3) while the level is running: this canvas is cleared, the
 * world is drawn transparent over the ground layer and `drawHud` only repaints when its inputs
 * change. Overlays (pause / result) dim the HUD, so those frames fall back to the single canvas.
 */
export function drawGame(ctx: CanvasRenderingContext2D, state: GameState, view: View, ui: PlayUi, nowMs = 0, layered = false): void {
  const pal = ui.palette;
  const theme = ui.skin?.theme;
  const letterbox = theme ? themeFor(theme).letterbox : pal.letterbox;
  const motion = motionAllowed();
  const spec = terrainSpec(state, theme);
  // capture shake moves the whole world (not the HUD)
  const shake = motion ? (ui.particles?.shake(nowMs) ?? { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
  const layers = layered && ui.outcome === 'playing' && !ui.paused ? view.layers : undefined;

  // Letterbox bars in device space (deep water, themed), then the map in logical space.
  applyDeviceTransform(view);
  if (layers) {
    paintGround(layers.ground, view, pal, spec, letterbox);
    ctx.clearRect(0, 0, view.cssW, view.cssH);
  } else {
    ctx.fillStyle = letterbox;
    ctx.fillRect(0, 0, view.cssW, view.cssH);
  }

  ctx.save();
  applyTransform(view);
  clipToMap(view);
  ctx.save();
  if (shake.dx || shake.dy) ctx.translate(shake.dx, shake.dy);
  // a shaking frame re-blits the ground here so the whole world moves together (the layer stays put)
  if (!layers || shake.dx || shake.dy) drawTerrain(ctx, view, pal, spec);
  drawTerrainOverlay(ctx, pal, spec, nowMs, motion);

  for (const road of Object.values(state.roads)) {
    if (road.kind === 'bridge') drawBridge(ctx, pal, road, ui.pressRoadId === road.id ? ui.pressProgress : 0);
  }
  drawLinks(ctx, pal, state, nowMs, motion);
  for (const road of Object.values(state.roads)) drawHazards(ctx, pal, ui.level, road, nowMs);
  drawGroundMarks(ctx, pal, state, ui, nowMs);
  drawWorld(ctx, pal, state, ui, nowMs, spec.biome ?? 'grass');
  ui.particles?.draw(ctx, nowMs);
  ctx.restore();
  if (ui.outcome === 'lost') {
    // defeat: the world goes a little grey and cold under the card
    ctx.fillStyle = 'rgba(120, 130, 150, 0.28)';
    ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  }
  if (layers) paintHud(layers.hud, view, state, ui, nowMs);
  else {
    blankLayer(view.layers?.hud);
    drawHud(ctx, state, view, ui, nowMs);
    if (ui.outcome !== 'playing' || ui.paused) drawOverlays(ctx, state, view, ui, nowMs);
  }

  ctx.restore();
}
