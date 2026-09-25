import type { GameState, LevelDef, Outcome, Owner, Road, Tower, Unit } from '../sim/types';
import { C } from '../sim/constants';
import { roadIdFor } from '../sim/create';
import { capacityOf, isUnderFire, linksFrom } from '../sim/step';
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

/** Small paper chip with ink numerals for mine charges / queued sends. */
function chip(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, text: string, stroke: string): void {
  drawBadge(ctx, pal, x, y, text, false, { stroke, scale: 0.72 });
}

/** Blinking lamp and charge chip over every live mine (the body sits in the cached terrain). */
function drawMineLights(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, nowMs: number): void {
  const mines = state.mines;
  if (mines.length === 0) return;
  const blink = motionAllowed() ? 0.55 + 0.45 * Math.sin(nowMs / 160) : 1;
  for (const m of mines) {
    if (m.charges <= 0) continue;
    ctx.fillStyle = pal.mine;
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.arc(m.x, m.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    chip(ctx, pal, m.x, m.y - 30, String(m.charges), pal.mine);
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
  const a = ribbonPose(road, forward, s0, off);
  const b = ribbonPose(road, forward, s1, off);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
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
 */
export function drawLinks(ctx: CanvasRenderingContext2D, pal: Palette, state: LinkedState, nowMs: number, motion: boolean): void {
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
    if (!road) continue;
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
    // ribbon: thin ink outline (every owner), then the translucent body
    traceRibbon(ctx, road, forward, s0, s1, off);
    ctx.globalAlpha = mine ? 0.6 : 0.5;
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = LINK_WIDTH + 2;
    ctx.stroke();
    ctx.globalAlpha = mine ? 0.72 : 0.68;
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

/** Guide line look (ART-7): 2 px owner colour at 45 %, dashed 10 on / 8 off in map units so it still reads at a 360 px viewport (map × 0.5). */
export const GUIDE_LINE_ALPHA = 0.45;
export const GUIDE_LINE_WIDTH = 2;
export const GUIDE_LINE_DASH: readonly number[] = Object.freeze([10, 8]);

/**
 * Rules v3 §2.0b(8): while a player tower is selected, a thin dashed line (owner colour, 45 % alpha,
 * 2 px, 10/8 dashes) from it to every tower it has a clear lane to, skipping targets it already
 * streams into. Blocked towers get nothing, so the player sees at a glance what is reachable.
 */
export function drawGuideLines(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, sel: Tower): void {
  if (sel.owner !== 'player') return;
  const linked = new Set<string>();
  for (const l of linksFrom(state, sel.id)) linked.add(l.to);
  const r0 = towerFootprintRadius(sel.kind, sel.level) + 6;
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
    const r1 = towerFootprintRadius(t.kind, t.level) + 6;
    if (len <= r0 + r1) continue;
    ctx.moveTo(sel.x + (dx / len) * r0, sel.y + (dy / len) * r0);
    ctx.lineTo(t.x - (dx / len) * r1, t.y - (dy / len) * r1);
  }
  ctx.stroke();
  ctx.restore();
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
    drawGuideLines(ctx, pal, state, sel);
    const pulse = motion ? (Math.sin(nowMs / 180) + 1) / 2 : 0.5;
    selectionRing(ctx, pal, sel.x, sel.y, 54 + pulse * 4);
  }
  if (hov && sel && hov.id !== sel.id) {
    const road = state.roads[roadIdFor(sel.id, hov.id)];
    if (road) {
      ctx.lineCap = 'round';
      ctx.setLineDash([16, 14]);
      ctx.lineDashOffset = motion ? -(nowMs / 25) % 30 : 0;
      ctx.beginPath();
      ctx.moveTo(sel.x, sel.y);
      ctx.lineTo(hov.x, hov.y);
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

/** Round a logical offset to whole device pixels (`dev` = device px per logical px) so a shaking tower keeps its sprite-cache phase (PERF-4). */
function snapToDevice(v: number, dev: number): number {
  return dev > 0 ? Math.round(v * dev) / dev : v;
}

function drawWorld(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number, biome: Biome, dev: number): void {
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
    const shake = hint && ui.selectedTowerId === t.id && motion ? snapToDevice(hint.shake, dev) : 0;
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
  const dev = view.dpr * view.scale;
  const raw = motion ? (ui.particles?.shake(nowMs) ?? { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
  const shake = { dx: snapToDevice(raw.dx, dev), dy: snapToDevice(raw.dy, dev) };
  const layers = layered && ui.outcome === 'playing' && !ui.paused ? view.layers : undefined;

  // Letterbox bars in device space (deep water, themed), then the map in logical space.
  applyDeviceTransform(view);
  if (layers) {
    paintGround(layers.ground, view, pal, spec, letterbox);
    ctx.clearRect(0, 0, view.cssW, view.cssH);
  } else {
    ctx.fillStyle = letterbox;
    ctx.fillRect(0, 0, view.cssW + 1, view.cssH + 1); // +1: cover the rounded-up last pixel column / row (layers.ts)
  }

  ctx.save();
  applyTransform(view);
  clipToMap(view);
  ctx.save();
  if (shake.dx || shake.dy) ctx.translate(shake.dx, shake.dy);
  // a shaking frame re-blits the ground here so the whole world moves together (the layer stays put)
  if (!layers || shake.dx || shake.dy) drawTerrain(ctx, view, pal, spec);
  drawTerrainOverlay(ctx, pal, spec, nowMs, motion);

  drawLinks(ctx, pal, state, nowMs, motion);
  drawMineLights(ctx, pal, state, nowMs);
  drawGroundMarks(ctx, pal, state, ui, nowMs);
  drawWorld(ctx, pal, state, ui, nowMs, spec.biome ?? 'grass', dev);
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
