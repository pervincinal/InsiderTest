import type { GameState, LevelDef, Outcome, Road, Unit } from '../sim/types';
import { C } from '../sim/constants';
import { capacityOf, roadPointAt } from '../sim/step';
import type { Biome, Palette } from './palette';
import { biomeFor, withAlpha } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, clipToMap } from './view';
import { HUD } from './layout';
import { roundRect } from './widgets';
import { drawHud, drawOverlays } from './hud';
import type { TerrainSpec } from './terrain';
import { drawTerrain, drawTerrainOverlay } from './terrain';
import type { TowerSkin } from './sprites';
import { badgeY, drawBadge, drawTowerShadow, drawTowerSprite, drawUnitSprite } from './sprites';
import type { ParticleSystem } from './particles';
import { prefersReducedMotion } from './particles';

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
  sendRatio: number;
  outcome: Outcome;
  stars: number; // only meaningful when outcome === 'won'
  hasNext: boolean;
  speed: number;
  /** Coins awarded by this clear (first-clear stars × COINS_PER_STAR) and the save total. */
  coinsEarned: number;
  coinsTotal: number;
  /** Visual effects fed from sim events (optional: menus / tests draw without them). */
  particles?: ParticleSystem;
  /** Equipped cosmetic skins; applied to the player's towers and soldiers only. */
  skin?: TowerSkin;
}

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
  for (const t of towers) drawTowerShadow(ctx, pal, t.x, t.y, t.kind);

  const units: UnitDraw[] = [];
  unitDraws(state, ui.alpha, units);
  if (motion && biome === 'sand' && ui.particles && units.length) spawnDust(ui.particles, pal, units, nowMs);
  // painter's order: everything sorted by ground y so units walk in front of / behind buildings
  let ui_ = 0;
  const skin = ui.skin;
  const drawUnit = (u: UnitDraw): void =>
    drawUnitSprite(ctx, pal, u.x, u.y, u.unit.owner, u.unit.kind, u.dx, u.dy, u.unit.id, nowMs, motion, u.scale, u.unit.owner === 'player' ? skin?.helmet : undefined);
  const fx = ui.particles;
  for (const t of towers) {
    while (ui_ < units.length && units[ui_]!.y <= t.y + 4) drawUnit(units[ui_++]!);
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
  }
  while (ui_ < units.length) drawUnit(units[ui_++]!);

  // badges on top of everything in the world
  const queued = new Map<string, number>();
  for (const q of state.queues) queued.set(q.from, (queued.get(q.from) ?? 0) + q.remaining);
  for (const t of towers) {
    const raise = ui.selectedTowerId === t.id ? 4 : 0;
    const by = Math.max(HUD.mapTop + 26, t.y + badgeY(t.kind) - raise);
    const pop = badgePop(state, t.id, t.units, nowMs, motion);
    drawBadge(ctx, pal, t.x, by, String(t.units), t.units >= capacityOf(t), { stroke: pal.ownerTones[t.owner].shade, scale: pop });
    const n = queued.get(t.id) ?? 0;
    if (n > 0) chip(ctx, pal, t.x + 46, by + 2, `+${n}`, pal.ownerTones[t.owner].mid);
  }
}

/* ---------- entry ---------- */

const specCache = new WeakMap<GameState, TerrainSpec>();

function terrainSpec(state: GameState): TerrainSpec {
  let spec = specCache.get(state);
  if (spec) return spec;
  spec = {
    key: `level:${state.levelId}`,
    seed: state.levelId,
    biome: biomeFor(state.levelId),
    roads: Object.values(state.roads).map((r) => ({ points: r.points, kind: r.kind })),
    towers: Object.values(state.towers).map((t) => ({ x: t.x, y: t.y })),
  };
  specCache.set(state, spec);
  return spec;
}

/** Draw one frame. Reads state and ui; never mutates either. `nowMs` drives purely visual motion. */
export function drawGame(ctx: CanvasRenderingContext2D, state: GameState, view: View, ui: PlayUi, nowMs = 0): void {
  const pal = ui.palette;

  // Letterbox bars in device space (deep water), then the map in logical space.
  applyDeviceTransform(view);
  ctx.fillStyle = pal.letterbox;
  ctx.fillRect(0, 0, view.cssW, view.cssH);

  ctx.save();
  applyTransform(view);
  clipToMap(view);
  const motion = motionAllowed();
  const spec = terrainSpec(state);
  // capture shake moves the whole world (not the HUD)
  const shake = motion ? (ui.particles?.shake(nowMs) ?? { dx: 0, dy: 0 }) : { dx: 0, dy: 0 };
  ctx.save();
  if (shake.dx || shake.dy) ctx.translate(shake.dx, shake.dy);
  drawTerrain(ctx, view, pal, spec);
  drawTerrainOverlay(ctx, pal, spec, nowMs, motion);

  for (const road of Object.values(state.roads)) {
    if (road.kind === 'bridge') drawBridge(ctx, pal, road, ui.pressRoadId === road.id ? ui.pressProgress : 0);
  }
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
  drawHud(ctx, state, view, ui, nowMs);
  if (ui.outcome !== 'playing' || ui.paused) drawOverlays(ctx, state, view, ui, nowMs);

  ctx.restore();
}
