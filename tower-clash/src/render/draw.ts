import type { GameState, LevelDef, Outcome, Owner, Road, Tower, Unit } from '../sim/types';
import { C } from '../sim/constants';
import { roadIdFor } from '../sim/create';
import { capacityOf, isUnderFire, linksFrom } from '../sim/step';
import type { Biome, Palette } from './palette';
import { BIOME_DUST, biomeFor, withAlpha } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, bleed, bleedRect, hudAnchors } from './view';
import { HUD, SOLDIER_DRAW_SCALE, SWIPE_TRAIL_MS, TANK_DRAW_SCALE, WORLD_ZOOM } from './layout';
import { font, roundRect } from './widgets';
type XY = { x: number; y: number };
import { drawHud, drawOverlays, lessonCardLayout } from './hud';
import type { BadgeBox } from './worldChips';
import { badgeBox, badgeCentre, badgeMinY, badgeScale, chipMinTop, drawWorldChips } from './worldChips';
import { blankLayer, paintGround, paintHud } from './layers';
import { drawSea, terrainSea } from './sea';
import type { TerrainSpec } from './terrain';
import { drawTerrain, drawTerrainOverlay } from './terrain';
import type { Camera } from './camera';
import { FLAT, horizonY, playCamera, proj, projAngle, projDir, standingAt } from './camera';
import type { TowerLook, TowerSkin } from './sprites';
import { STRIDE_SWING, badgeY, drawBadge, drawTowerShadow, drawTowerSprite, drawUnitSprite, pushOffDistance, stridePhase, towerFootprintRadius } from './sprites';
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
  /** A drag from an own tower in progress: a line from that tower follows the finger (`PlayGestures.drag`). */
  drag?: { fromId: string; x: number; y: number };
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
   * Refused gesture (link limit, or a tap on a tower with no clear lane — rules v3 §2.0b): the
   * selected tower shakes briefly and a paper hint bubble shows `limitHintText` until `until`
   * (same clock as `nowMs`). The play screen sets a fresh object per refusal; the text is already
   * localised by the UI.
   */
  limitHint?: { until: number };
  limitHintText?: string;
  /**
   * Swipe-to-cut slash trail (BUG-33), oldest point first; `t` is on the same clock as `nowMs`. The
   * input layer drops points older than `SWIPE_TRAIL_MS`; the renderer fades them over that span.
   */
  swipeTrail?: readonly { x: number; y: number; t: number }[];
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

/* ---------- lanes (rules v3: always a straight segment a → b) ---------- */

export interface Pose {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Point and unit tangent at fraction `t` along a lane (measured from road.a; lanes are straight). */
export function roadPoseAt(road: Road, t: number): Pose {
  const pts = road.points;
  const p = pts[0] ?? { x: 0, y: 0 };
  const q = pts[pts.length - 1] ?? p;
  const sx = q.x - p.x;
  const sy = q.y - p.y;
  const seg = Math.hypot(sx, sy);
  if (seg === 0) return { x: p.x, y: p.y, dx: 1, dy: 0 };
  const k = Math.max(0, Math.min(1, t));
  return { x: p.x + sx * k, y: p.y + sy * k, dx: sx / seg, dy: sy / seg };
}

/** Blinking lamp over every live mine (the body sits in the cached terrain); upright at the projected anchor, depth-scaled (ART-21). The charge chip is laid out with the badges (worldChips.ts, ART-22). */
function drawMineLights(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, nowMs: number, cam: Camera = FLAT): void {
  const mines = state.mines;
  if (mines.length === 0) return;
  const blink = motionAllowed() ? 0.55 + 0.45 * Math.sin(nowMs / 160) : 1;
  for (const m of mines) {
    if (m.charges <= 0) continue;
    const p = proj(cam, m.x, m.y);
    const k = p.s * WORLD_ZOOM.prop; // ART-24: the lamp sits on the zoomed mine body
    ctx.fillStyle = pal.mine;
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 4 * k, 4 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- attack streams (rules v2 links) ---------- */

const LINK_WIDTH = 10;
/** ART-23: the stream's glow — one wide translucent stroke in the owner's lit tone under the ribbon. */
export const LINK_GLOW_PX = 16;
export const LINK_GLOW_ALPHA = 0.2;
/** ART-23 stream start: a paper pulse runs down a new ribbon once, this long (wall clock). */
export const STREAM_PULSE_MS = 380;
const linkSeen = new WeakMap<object, number>();

/** 0..1 progress of a link's one-shot start pulse (from the first frame it is drawn), ≥ 1 once done. */
export function linkPulse(link: object, nowMs: number): number {
  let born = linkSeen.get(link);
  if (born === undefined) linkSeen.set(link, (born = nowMs));
  return (nowMs - born) / STREAM_PULSE_MS;
}
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

/** A ribbon pose where it is drawn (ART-21 camera): projected point, screen direction, depth scale `s`. */
function screenPose(cam: Camera, p: RibbonPt): RibbonPt & { s: number } {
  if (cam.flat) return { x: p.x, y: p.y, dx: p.dx, dy: p.dy, s: 1 };
  const q = proj(cam, p.x, p.y);
  const d = projDir(cam, p.x, p.y, p.dx, p.dy);
  return { x: q.x, y: q.y, dx: d.dx, dy: d.dy, s: q.s };
}

/** Trace the ribbon's centre line (straight on the screen too: the camera is a plane homography); returns the mean depth scale of its ends. */
function traceRibbon(ctx: CanvasRenderingContext2D, road: Road, forward: boolean, s0: number, s1: number, off: number, cam: Camera): number {
  const a = screenPose(cam, ribbonPose(road, forward, s0, off));
  const b = screenPose(cam, ribbonPose(road, forward, s1, off));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  return (a.s + b.s) / 2;
}

function linkRoad(state: LinkedState, link: LinkLike): Road | undefined {
  const byId = state.roads[link.roadId];
  if (byId) return byId;
  const [a, b] = link.from < link.to ? [link.from, link.to] : [link.to, link.from];
  return state.roads[`${a}-${b}`];
}

/**
 * Every active link as a straight ribbon along its lane in the owner's colour with a 1 px ink
 * outline so it reads on every ground (ART-7: an outline-less 55 % coral turned tan over grass).
 * The player's is the lit tone at 72 % with a heavier arrowhead stroke so their own streams read
 * first; foreign ones the mid tone at 68 %. Paper chevrons march toward the target (frozen under
 * reduced motion) and an arrowhead sits at the target end.
 * Opposite links on one lane are offset to their right so both read. Sources with ≥ 1 link get a
 * soft pulsing "streaming" ring on the ground (growth paused, rules v3). Drawn under units / towers.
 * Under the tilted camera (ART-21) everything is drawn at projected points, sized by depth (the
 * ribbon by the mean depth of its ends); the rings keep the building's own base perspective and
 * scale (`standingAt`) so they hug its plinth.
 */
export function drawLinks(ctx: CanvasRenderingContext2D, pal: Palette, state: LinkedState, nowMs: number, motion: boolean, cam: Camera = FLAT): void {
  const links = state.links ?? [];
  if (links.length === 0) return;
  // which lanes carry traffic both ways, and which towers are streaming
  const dirs = new Map<string, number>();
  const streaming = new Map<string, Owner>();
  for (const l of links) {
    const road = linkRoad(state, l);
    if (!road) continue;
    dirs.set(road.id, (dirs.get(road.id) ?? 0) | (l.from === road.a ? 1 : 2));
    streaming.set(l.from, l.owner);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [id, owner] of streaming) {
    const t = state.towers[id];
    if (!t) continue;
    const tones = pal.ownerTones[owner];
    const pulse = motion ? 0.5 + 0.5 * Math.sin(nowMs / 260 + t.x * 0.02) : 0.5;
    const r = towerFootprintRadius(t.kind, t.level) + 10 + pulse * 5;
    standingAt(ctx, cam, t.x, t.y, () => {
      ctx.strokeStyle = withAlpha(tones.mid, 0.42 + pulse * 0.3);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 8, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = withAlpha(tones.lit, 0.5 + pulse * 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 8, r - 6, (r - 6) * 0.42, 0, 0, Math.PI * 2);
      ctx.stroke();
    }, WORLD_ZOOM.tower);
  }
  // ART-24 zoom: the ribbon, its chevrons and arrowhead × WORLD_ZOOM.link; its ends clear the zoomed bases
  const zl = WORLD_ZOOM.link;
  const zt = WORLD_ZOOM.tower;
  const pitch = CHEVRON_PITCH * zl;
  const phase = motion ? ((nowMs / 1000) * CHEVRON_SPEED * zl) % pitch : 0;
  for (const l of links) {
    const road = linkRoad(state, l);
    if (!road) continue;
    const forward = l.from === road.a;
    const off = dirs.get(road.id) === 3 ? LINK_SIDE_PX * zl : 0;
    const len = road.length;
    const target = state.towers[l.to];
    const endPx = (target ? towerFootprintRadius(target.kind, target.level) : 32) * zt + LINK_END_PAD;
    const s0 = Math.min(LINK_START_PX * zt, len * 0.45);
    const s1 = Math.max(len - endPx, len * 0.55);
    const mine = l.owner === 'player';
    const tones = pal.ownerTones[l.owner];
    const body = mine ? tones.lit : tones.mid;
    // ribbon: a faint wide owner-lit glow under it (ART-23: a stream reads as light on the ground,
    // not tape), the thin ink outline (every owner), then the translucent body
    const ws = traceRibbon(ctx, road, forward, s0, s1, off, cam) * zl;
    ctx.globalAlpha = LINK_GLOW_ALPHA;
    ctx.strokeStyle = tones.lit;
    ctx.lineWidth = (LINK_WIDTH + LINK_GLOW_PX) * ws;
    ctx.stroke();
    ctx.globalAlpha = mine ? 0.6 : 0.5;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = (LINK_WIDTH + 2) * ws;
    ctx.stroke();
    ctx.globalAlpha = mine ? 0.72 : 0.68;
    ctx.strokeStyle = body;
    ctx.lineWidth = LINK_WIDTH * ws;
    ctx.stroke();
    // ART-23 stream start: one bright pulse runs from the source to the target (STREAM_PULSE_MS)
    const k = motion ? linkPulse(l, nowMs) : 1;
    if (k < 1) {
      const head = s0 + (s1 - s0) * (1 - (1 - k) * (1 - k));
      traceRibbon(ctx, road, forward, Math.max(s0, head - 70), head, off, cam);
      ctx.globalAlpha = 0.95 * (1 - k * 0.5);
      ctx.strokeStyle = pal.paper;
      ctx.lineWidth = LINK_WIDTH * 0.7 * ws;
      ctx.stroke();
    }
    // chevrons pointing at the target (each sized by its own depth)
    ctx.globalAlpha = mine ? 0.9 : 0.75;
    ctx.strokeStyle = pal.paper;
    ctx.lineWidth = 2.4 * ws;
    ctx.beginPath();
    for (let sPos = s0 + 8 * zl + phase; sPos < s1 - 6 * zl; sPos += pitch) {
      const p = screenPose(cam, ribbonPose(road, forward, sPos, off));
      const k = p.s * zl;
      const nx = -p.dy * k;
      const ny = p.dx * k;
      ctx.moveTo(p.x - p.dx * 3 * k + nx * 3.4, p.y - p.dy * 3 * k + ny * 3.4);
      ctx.lineTo(p.x + p.dx * 2.5 * k, p.y + p.dy * 2.5 * k);
      ctx.lineTo(p.x - p.dx * 3 * k - nx * 3.4, p.y - p.dy * 3 * k - ny * 3.4);
    }
    ctx.stroke();
    // arrowhead at the target end
    const ep = screenPose(cam, ribbonPose(road, forward, s1, off));
    const ek = ep.s * zl;
    const e = { x: ep.x, y: ep.y, dx: ep.dx * ek, dy: ep.dy * ek };
    const nx = -e.dy;
    const ny = e.dx;
    ctx.beginPath();
    ctx.moveTo(e.x + e.dx * 12, e.y + e.dy * 12);
    ctx.lineTo(e.x - e.dx * 5 + nx * 10, e.y - e.dy * 5 + ny * 10);
    ctx.lineTo(e.x - e.dx * 1, e.y - e.dy * 1);
    ctx.lineTo(e.x - e.dx * 5 - nx * 10, e.y - e.dy * 5 - ny * 10);
    ctx.closePath();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = mine ? 3 : 2;
    ctx.stroke();
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

/** Gold clay ring on the ground with a soft outer glow (in the building's base perspective and depth scale: `standingAt`, ART-21). */
function selectionRing(ctx: CanvasRenderingContext2D, pal: Palette, cam: Camera, x: number, y: number, r: number, dash?: number[], offset = 0): void {
  standingAt(ctx, cam, x, y, () => selectionRingFlat(ctx, pal, x, y, r, dash, offset), WORLD_ZOOM.tower);
}

function selectionRingFlat(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number, dash?: number[], offset = 0): void {
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

/** Guide line look (ART-7): 2 px owner colour at 45 %, dashed 10 on / 8 off in map units so it still reads at a 360 px viewport (map × 0.5). */
export const GUIDE_LINE_ALPHA = 0.45;
/** 2 px at design size × the ART-24 guide zoom (2.5 px). */
export const GUIDE_LINE_WIDTH = 2 * WORLD_ZOOM.guide;
export const GUIDE_LINE_DASH: readonly number[] = Object.freeze([10, 8]);

/**
 * Rules v3 §2.0b(8): while a player tower is selected, a thin dashed line (owner colour, 45 % alpha,
 * 2 px, 10/8 dashes) from it to every tower it has a clear lane to, skipping targets it already
 * streams into. Blocked towers get nothing, so the player sees at a glance what is reachable.
 * ART-21: trimmed in map units, drawn between the projected ends (straight under the camera).
 */
export function drawGuideLines(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, sel: Tower, cam: Camera = FLAT): void {
  if (sel.owner !== 'player') return;
  const linked = new Set<string>();
  for (const l of linksFrom(state, sel.id)) linked.add(l.to);
  const r0 = towerFootprintRadius(sel.kind, sel.level) * WORLD_ZOOM.tower + 6;
  ctx.save();
  ctx.globalAlpha = GUIDE_LINE_ALPHA;
  ctx.strokeStyle = pal.owners[sel.owner];
  ctx.lineWidth = GUIDE_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.setLineDash([...GUIDE_LINE_DASH]);
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  for (const id in state.towers) {
    if (id === sel.id || linked.has(id) || !state.roads[roadIdFor(sel.id, id)]) continue;
    const t = state.towers[id]!;
    const dx = t.x - sel.x;
    const dy = t.y - sel.y;
    const len = Math.hypot(dx, dy);
    const r1 = towerFootprintRadius(t.kind, t.level) * WORLD_ZOOM.tower + 6;
    if (len <= r0 + r1) continue;
    const a = proj(cam, sel.x + (dx / len) * r0, sel.y + (dy / len) * r0);
    const b = proj(cam, t.x - (dx / len) * r1, t.y - (dy / len) * r1);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawGroundMarks(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number, cam: Camera): void {
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
    if (cam.flat) ctx.arc(t.x, t.y, C.ARTILLERY_RANGE, 0, Math.PI * 2);
    else {
      // ART-21: the range circle on the ground, through the camera (a narrowing oval)
      for (let i = 0; i <= RANGE_SEGMENTS; i++) {
        const a = (i / RANGE_SEGMENTS) * Math.PI * 2;
        const p = proj(cam, t.x + Math.cos(a) * C.ARTILLERY_RANGE, t.y + Math.sin(a) * C.ARTILLERY_RANGE);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  const sel = ui.selectedTowerId ? state.towers[ui.selectedTowerId] : undefined;
  const hov = ui.hoverTowerId ? state.towers[ui.hoverTowerId] : undefined;
  // While the finger drags from an own tower, that tower is the line's origin even before it is selected.
  const dragSrc = ui.drag ? state.towers[ui.drag.fromId] : undefined;
  const origin = dragSrc ?? sel;
  if (sel) {
    drawGuideLines(ctx, pal, state, sel, cam);
    const pulse = motion ? (Math.sin(nowMs / 180) + 1) / 2 : 0.5;
    selectionRing(ctx, pal, cam, sel.x, sel.y, 54 + pulse * 4);
  }
  if (dragSrc && dragSrc.id !== sel?.id) selectionRing(ctx, pal, cam, dragSrc.x, dragSrc.y, 56);
  if (hov && origin && hov.id !== origin.id) {
    const road = state.roads[roadIdFor(origin.id, hov.id)];
    if (road) drawRubberBand(ctx, pal, proj(cam, origin.x, origin.y), proj(cam, hov.x, hov.y), nowMs, motion, true);
    selectionRing(ctx, pal, cam, hov.x, hov.y, 56, [12, 9], motion ? -(nowMs / 40) % 21 : 0);
  } else if (ui.drag && dragSrc) {
    // No target under the finger yet: the line follows the finger (BUG-35 "xətt gəlsin mənlə").
    drawRubberBand(ctx, pal, proj(cam, dragSrc.x, dragSrc.y), proj(cam, ui.drag.x, ui.drag.y), nowMs, motion, false);
  } else if (hov && !sel) {
    selectionRing(ctx, pal, cam, hov.x, hov.y, 56, [12, 9]);
  }
}

/** Segments of an artillery range drawn through the tilted camera. */
const RANGE_SEGMENTS = 64;

/**
 * The drag / target preview line from `from` to `to` (screen points: the camera already applied):
 * solid gold once it snaps onto a reachable target (`snapped`), thinner and translucent while it just
 * follows the finger.
 */
function drawRubberBand(ctx: CanvasRenderingContext2D, pal: Palette, from: XY, to: XY, nowMs: number, motion: boolean, snapped: boolean): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([16, 14]);
  ctx.lineDashOffset = motion ? -(nowMs / 25) % 30 : 0;
  if (!snapped) ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.strokeStyle = pal.goldShade;
  ctx.lineWidth = snapped ? 12 : 9;
  ctx.stroke();
  ctx.strokeStyle = pal.gold;
  ctx.lineWidth = snapped ? 8 : 5;
  ctx.stroke();
  ctx.restore();
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

/**
 * Ground cues of marching columns: footstep puffs on every biome in its dust colour (ART-20) where a
 * soldier's back foot pushes off (its stride phase, sprites.ts) or behind a tank's tracks, plus the
 * bigger wake puff behind the rearmost unit on sand (`wake`; on a ribbon elsewhere it read as a
 * blot). Both are rate-limited per column in the particle system, so 400 units cost a few puffs per frame.
 */
function spawnDust(fx: ParticleSystem, color: string, units: UnitDraw[], nowMs: number, wake: boolean): void {
  const rear = new Map<string, UnitDraw>();
  for (const u of units) {
    const key = `${u.unit.roadId}|${u.unit.from}`;
    const prev = rear.get(key);
    if (!prev || u.unit.progress < prev.unit.progress) rear.set(key, u);
    if (u.scale < 1) continue; // still leaving the gate
    if (u.unit.kind === 'tank') fx.step(key, u.x - u.dx * 14, u.y + 4, color, nowMs);
    else if (pushOffDistance(stridePhase(u.unit.id, nowMs, true)) < 0.45) {
      const back = STRIDE_SWING * SOLDIER_DRAW_SCALE;
      fx.step(key, u.x - u.dx * back, u.y - u.dy * back * 0.5, color, nowMs);
    }
  }
  if (!wake) return;
  for (const [key, u] of rear) {
    if (u.scale < 1) continue; // still leaving the gate
    fx.dust(key, u.x - u.dx * 8, u.y + 2 - u.dy * 4, color, nowMs);
  }
}

/** Round a logical offset to whole device pixels (`dev` = device px per logical px) so a shaking tower keeps its sprite-cache phase (PERF-4). */
function snapToDevice(v: number, dev: number): number {
  return dev > 0 ? Math.round(v * dev) / dev : v;
}

/** Every building's ground shadow, under all buildings and units (ART-21: at the projected anchor, depth-scaled, in the sprite's own perspective). */
function drawTowerShadows(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, cam: Camera): void {
  for (const id in state.towers) {
    const t = state.towers[id]!;
    standingAt(ctx, cam, t.x, t.y, () => drawTowerShadow(ctx, pal, t.x, t.y, t.kind, t.level), WORLD_ZOOM.tower);
  }
}

/**
 * A badge centre's offset above its building's anchor at depth 1 (negative = up): the roof top of the
 * zoomed building (`towerTop × WORLD_ZOOM.tower`, `raise` px lifted with it) plus the zoomed badge's
 * 18 px clearance (ART-24; sprites.ts `badgeY` at zoom 1).
 */
function badgeLift(t: Tower, raise: number): number {
  return (badgeY(t.kind, t.level) + 18 - raise) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge;
}

/**
 * A tower's badge centre (worldChips.ts `badgeCentre`): above the zoomed roof, clamped under the top HUD
 * band / the lesson card — or, when that clamp would sit it on the tower's own body, below the plinth.
 */
function badgeSpot(t: Tower, look: { y: number; s: number }, raise: number, bs: number, cardBottom: number | null): { y: number; below: boolean } {
  const plinth = towerFootprintRadius(t.kind, t.level) * WORLD_ZOOM.tower * look.s;
  return badgeCentre(look.y + badgeLift(t, raise) * look.s, badgeMinY(cardBottom, bs), look.y, plinth, bs);
}

/** Where a building stands on the screen (ART-21): its projected ground anchor and depth scale. */
function standing(cam: Camera, t: Tower): TowerLook & { s: number } {
  const p = proj(cam, t.x, t.y);
  return { x: p.x, y: p.y, s: p.s, owner: t.owner, kind: t.kind, level: t.level };
}

/**
 * Units, buildings, badges and the refusal bubble, upright in the logical frame at their projected
 * anchors and scaled by depth (ART-21): buildings through the PERF-4 sprite cache's draw-time scale,
 * units through their size, badges no smaller than BADGE_MIN_SCALE (24 px numerals). Sorting by map
 * y and by screen y is the same order (the camera keeps y monotonic). Units stay in map coordinates
 * for the dust (particles are projected when drawn). `cardBottom`: the lesson card's bottom (logical
 * screen y) while it is up, else null — badges and chips stay below it (ART-22).
 */
function drawWorld(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number, biome: Biome, dev: number, cam: Camera, cardBottom: number | null): void {
  const motion = motionAllowed();
  const towers = Object.values(state.towers).sort((a, b) => a.y - b.y);

  const units: UnitDraw[] = [];
  unitDraws(state, ui.alpha, units);
  if (motion && ui.particles && units.length) spawnDust(ui.particles, BIOME_DUST[biome], units, nowMs, biome === 'sand');
  // painter's order: everything sorted by ground y so units walk in front of / behind buildings
  let ui_ = 0;
  const skin = ui.skin;
  // BUG-39: play-size units (larger than the sprite's design size, see layout.ts)
  const drawUnit = (u: UnitDraw): void => {
    // ART-21: upright at the projected anchor, depth-scaled, heading along the lane as it appears on the screen
    const p = proj(cam, u.x, u.y);
    const d = projDir(cam, u.x, u.y, u.dx, u.dy);
    const size = u.scale * (u.unit.kind === 'tank' ? TANK_DRAW_SCALE : SOLDIER_DRAW_SCALE) * p.s;
    drawUnitSprite(ctx, pal, p.x, p.y, u.unit.owner, u.unit.kind, d.dx, d.dy, u.unit.id, nowMs, motion, size, u.unit.owner === 'player' ? skin?.helmet : undefined);
  };
  const fx = ui.particles;
  const hint = limitHintState(ui, nowMs);
  // rules v2.1 "under fire": who is landing on whom (badge tint + impact rings, see particles.ts)
  const attackers = hostileAttackers(state);
  fx?.landings(state, attackers, pal, nowMs);
  for (const t of towers) {
    while (ui_ < units.length && units[ui_]!.y <= t.y + 4) drawUnit(units[ui_++]!);
    const shake = hint && ui.selectedTowerId === t.id && motion ? snapToDevice(hint.shake, dev) : 0;
    if (shake) ctx.translate(shake, 0);
    const aim = fx?.aimOf(t.id);
    const look = standing(cam, t);
    // ART-24 zoom about the anchor through the canvas transform: on the flat map the PERF-4 cache bakes
    // every building at the one zoomed scale (crisp, no new keys); camera depth stays a draw-time scale
    ctx.save();
    ctx.translate(look.x, look.y);
    ctx.scale(WORLD_ZOOM.tower, WORLD_ZOOM.tower);
    ctx.translate(-look.x, -look.y);
    drawTowerSprite(ctx, pal, look, {
      nowMs,
      motion,
      raised: ui.selectedTowerId === t.id,
      pulse: fx?.towerPulse(t.id, nowMs) ?? 0,
      squash: fx?.towerSquash(t.id, nowMs) ?? 1,
      wipe: fx?.towerWipe(t.id, nowMs) ?? undefined,
      aim: aim === undefined ? undefined : projAngle(cam, t.x, t.y, aim),
      skin: t.owner === 'player' ? skin : undefined,
      scale: look.s === 1 ? undefined : look.s,
    });
    ctx.restore();
    if (shake) ctx.translate(-shake, 0);
  }
  while (ui_ < units.length) drawUnit(units[ui_++]!);

  // badges on top of everything in the world (ART-22: below the lesson card while it is up), then the
  // stream / mine chips laid out against them (worldChips.ts)
  const badges = new Map<string, BadgeBox>();
  for (const t of towers) {
    const raise = ui.selectedTowerId === t.id ? 4 : 0;
    const look = standing(cam, t);
    const bs = badgeScale(look.s);
    const by = badgeSpot(t, look, raise, bs, cardBottom).y;
    const pop = badgePop(state, t.id, t.units, nowMs, motion);
    const fire = isUnderFire(state, t);
    const by_ = fire ? attackers.get(t.id) : undefined;
    const text = String(t.units);
    drawBadge(ctx, pal, look.x, by, text, t.units >= capacityOf(t), {
      stroke: pal.ownerTones[t.owner].shade,
      scale: pop * bs,
      underFire: fire ? (by_ ? pal.owners[by_] : pal.ink) : undefined,
      shake: motion ? (fx?.badgeHit(t.id, nowMs) ?? 0) : 0,
      // ART-23: a just-captured tower's badge flashes paper-white with a halo in the new owner's lit tone
      flash: motion ? (fx?.captureFlash(t.id, nowMs) ?? 0) : 0,
      flashColor: pal.ownerTones[t.owner].lit,
    });
    badges.set(t.id, badgeBox(ctx, look.x, by, text, bs, fire));
  }
  drawWorldChips(ctx, pal, state, cam, badges, chipMinTop(cardBottom), ui.outcome === 'playing');
  if (hint && ui.limitHintText && ui.selectedTowerId) {
    const t = state.towers[ui.selectedTowerId];
    if (t) {
      const look = standing(cam, t);
      const bs = badgeScale(look.s);
      const spot = badgeSpot(t, look, 4, bs, cardBottom);
      // a badge flipped below the tower: the bubble goes under the badge (an anchor at its bottom edge, "below" forced)
      if (spot.below) drawHintBubble(ctx, pal, { x: look.x, y: spot.y + 18 * bs - 30 }, -Infinity, ui.limitHintText, hint.alpha);
      else drawHintBubble(ctx, pal, look, spot.y, ui.limitHintText, hint.alpha);
    }
  }
}

/* ---------- swipe-to-cut trail (BUG-33) ---------- */

/**
 * A short slash following the finger: a tapering paper stroke with a player-tone edge, each piece
 * fading over `SWIPE_TRAIL_MS` from when it was drawn. Reduced motion: a plain constant stroke (no
 * taper or fade animation); it still disappears once the input layer drops its points. The points
 * are map coordinates (ART-21): drawn at their projections, i.e. under the finger.
 */
export function drawSwipeTrail(ctx: CanvasRenderingContext2D, pal: Palette, trail: readonly { x: number; y: number; t: number }[], nowMs: number, motion: boolean, cam: Camera = FLAT): void {
  if (trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const edge = pal.ownerTones.player.lit;
  for (let i = 1; i < trail.length; i++) {
    const b = trail[i]!;
    const a = proj(cam, trail[i - 1]!.x, trail[i - 1]!.y);
    const bp = proj(cam, b.x, b.y);
    const k = motion ? Math.max(0, Math.min(1, 1 - (nowMs - b.t) / SWIPE_TRAIL_MS)) : 1;
    if (k <= 0) continue;
    ctx.globalAlpha = 0.85 * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(bp.x, bp.y);
    ctx.strokeStyle = edge;
    ctx.lineWidth = 4 + 10 * k;
    ctx.stroke();
    ctx.strokeStyle = pal.paper;
    ctx.lineWidth = 1.5 + 4 * k;
    ctx.stroke();
  }
  ctx.restore();
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
function drawHintBubble(ctx: CanvasRenderingContext2D, pal: Palette, t: XY, badgeTop: number, text: string, alpha: number): void {
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

/** Which mines are spent — the only ground state that changes mid-match (re-keys the terrain cache). */
function mineVariant(state: GameState): string {
  let out = '';
  for (let i = 0; i < state.mines.length; i++) if (state.mines[i]!.charges <= 0) out += `${i},`;
  return out;
}

function terrainSpec(state: GameState, theme: string | undefined): TerrainSpec {
  const variant = mineVariant(state);
  let spec = specCache.get(state);
  if (spec && spec.theme === theme && spec.variant === variant) return spec;
  spec = {
    key: `level:${state.levelId}`,
    variant,
    seed: state.levelId,
    biome: biomeFor(state.levelId),
    theme,
    obstacles: state.obstacles.map((o) => ({ kind: o.kind, points: o.points, width: o.width })),
    mines: state.mines.map((m) => ({ x: m.x, y: m.y, charges: m.charges })),
    towers: Object.values(state.towers).map((t) => ({ x: t.x, y: t.y })),
    zoom: true, // ART-24: the play world's props / walls drawn larger (the title island keeps design size)
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
  const sea = terrainSea(pal, theme, true);
  const motion = motionAllowed();
  const spec = terrainSpec(state, theme);
  // capture shake moves the whole world (not the HUD)
  const dev = view.dpr * view.scale;
  const raw = motion ? (ui.particles?.shake(nowMs) ?? { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
  const shake = { dx: snapToDevice(raw.dx, dev), dy: snapToDevice(raw.dy, dev) };
  const layers = layered && ui.outcome === 'playing' && !ui.paused ? view.layers : undefined;
  // ART-21: the tilted play camera (`?tilt=` override); the HUD and the overlays are not tilted
  const cam = playCamera();

  // The sea over the whole canvas (BUG-34: full bleed, themed; cached on the ground layer while
  // layered), then the world clipped to the map, then veil / HUD / overlays out to the screen edges.
  applyDeviceTransform(view);
  if (layers) {
    paintGround(layers.ground, view, pal, spec, sea, cam);
    ctx.clearRect(0, 0, view.cssW, view.cssH);
  }

  ctx.save();
  applyTransform(view);
  if (!layers) drawSea(ctx, view, sea, horizonY(cam));
  // the world is clipped to the map's rows; across, it spans the screen (a wide screen's side margins
  // are sea, so the drifting cloud shadows cross them instead of being cut at the map edge)
  const screen = bleed(view);
  ctx.save();
  ctx.beginPath();
  ctx.rect(screen.left, 0, screen.right - screen.left, C.MAP_H);
  ctx.clip();
  ctx.save();
  if (shake.dx || shake.dy) ctx.translate(shake.dx, shake.dy);
  // a shaking frame re-blits the ground here so the whole world moves together (the layer stays put)
  if (!layers || shake.dx || shake.dy) drawTerrain(ctx, view, pal, spec, cam);

  // ART-21 (camera.ts): everything is drawn in the logical frame at projected map points — first what
  // lies on the ground, then what stands on it (upright, depth-scaled)
  drawTerrainOverlay(ctx, pal, spec, nowMs, motion, screen, cam);
  drawLinks(ctx, pal, state, nowMs, motion, cam);
  drawMineLights(ctx, pal, state, nowMs, cam);
  drawGroundMarks(ctx, pal, state, ui, nowMs, cam);
  drawTowerShadows(ctx, pal, state, cam);
  // ART-22: while the lesson card is up (drawn with the HUD, moved with the top band) badges stay below it
  const card = lessonCardLayout(ctx, state, ui);
  const cardBottom = card ? card.rect.y + card.rect.h + hudAnchors(view).top : null;
  drawWorld(ctx, pal, state, ui, nowMs, spec.biome ?? 'grass', dev, cam, cardBottom);
  // effects are spawned in map coordinates (particles.ts): each drawn upright at its projected point
  ui.particles?.draw(ctx, nowMs, cam.flat ? undefined : (x, y) => proj(cam, x, y));
  ctx.restore();
  // the slash follows the finger, not the shaking world (its points are map coordinates)
  if (ui.swipeTrail && ui.outcome === 'playing') drawSwipeTrail(ctx, pal, ui.swipeTrail, nowMs, motion, cam);
  ctx.restore(); // map clip off: the veil, the HUD bands and the overlays reach the screen edges
  if (ui.outcome === 'lost') {
    // defeat: the world goes a little grey and cold under the card (the margins' sea too)
    ctx.fillStyle = 'rgba(120, 130, 150, 0.28)';
    const r = bleedRect(view);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  if (layers) paintHud(layers.hud, view, state, ui, nowMs);
  else {
    blankLayer(view.layers?.hud);
    drawHud(ctx, state, view, ui, nowMs);
    if (ui.outcome !== 'playing' || ui.paused) drawOverlays(ctx, state, view, ui, nowMs);
  }

  ctx.restore();
}
