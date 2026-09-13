import type { GameState, LevelDef, Outcome, Road, Unit } from '../sim/types';
import { C } from '../sim/constants';
import { capacityOf, roadPointAt } from '../sim/step';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, clipToMap } from './view';
import { HUD, PAUSE, RESULT } from './layout';
import type { Rect } from './widgets';
import { drawButton, drawCoin, drawPill, drawStars, easeOutBack, font, formatTime, outlinedText, roundRect, wrapText } from './widgets';
import type { TerrainSpec } from './terrain';
import { drawTerrain } from './terrain';
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
}

let reducedMotion: boolean | null = null;
function motionAllowed(): boolean {
  if (reducedMotion === null) reducedMotion = prefersReducedMotion();
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

/** Wooden plank bridge (dynamic: it can be cut). Static roads live in the terrain cache. */
function drawBridge(ctx: CanvasRenderingContext2D, pal: Palette, road: Road, pressing: number): void {
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  const spans: [number, number][] = road.cut
    ? [
        [0, 0.36],
        [0.64, 1],
      ]
    : [[0, 1]];
  for (const [t0, t1] of spans) {
    ctx.strokeStyle = pal.woodDark;
    ctx.lineWidth = 28;
    ctx.beginPath();
    tracePolyline(ctx, road, t0, t1);
    ctx.stroke();
    ctx.strokeStyle = pal.bridge;
    ctx.lineWidth = 22;
    ctx.stroke();
    // slats
    ctx.strokeStyle = pal.woodDark;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const count = Math.max(1, Math.floor((road.length * (t1 - t0)) / 12));
    for (let i = 0; i <= count; i++) {
      const p = roadPoseAt(road, t0 + ((t1 - t0) * i) / count);
      ctx.moveTo(p.x - p.dy * 10, p.y + p.dx * 10);
      ctx.lineTo(p.x + p.dy * 10, p.y - p.dx * 10);
    }
    ctx.stroke();
  }
  if (road.cut) {
    // splintered ends over the gap
    ctx.fillStyle = pal.woodDark;
    for (const t of [0.36, 0.64]) {
      const p = roadPoseAt(road, t);
      ctx.beginPath();
      ctx.moveTo(p.x - p.dy * 11, p.y + p.dx * 11);
      ctx.lineTo(p.x + p.dx * (t < 0.5 ? 10 : -10), p.y + p.dy * (t < 0.5 ? 10 : -10));
      ctx.lineTo(p.x + p.dy * 11, p.y - p.dx * 11);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }
  if (pressing > 0) {
    const m = roadPointAt(road, 0.5);
    ctx.strokeStyle = pal.mine;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pressing);
    ctx.stroke();
  }
}

function drawHazards(ctx: CanvasRenderingContext2D, pal: Palette, road: Road, nowMs: number): void {
  if (road.cut) return;
  const m = roadPoseAt(road, 0.5);
  if (road.barrier > 0) {
    // stone wall across the path
    const nx = -m.dy;
    const ny = m.dx;
    ctx.fillStyle = pal.shadow;
    ctx.beginPath();
    ctx.ellipse(m.x + 2, m.y + 6, 30, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -2; i <= 2; i++) {
      const cx = m.x + nx * i * 12;
      const cy = m.y + ny * i * 12;
      ctx.fillStyle = i % 2 ? pal.stoneDark : pal.barrier;
      ctx.strokeStyle = 'rgba(60, 50, 40, 0.5)';
      ctx.lineWidth = 2;
      roundRect(ctx, { x: cx - 7, y: cy - 12, w: 14, h: 18 }, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = pal.stoneLight;
      ctx.fillRect(cx - 5, cy - 11, 10, 4);
    }
    outlinedText(ctx, String(road.barrier), m.x, m.y - 24, '#ffffff', 20);
  }
  if (road.mine > 0) {
    const blink = motionAllowed() ? 0.55 + 0.45 * Math.sin(nowMs / 160) : 1;
    ctx.fillStyle = pal.shadow;
    ctx.beginPath();
    ctx.ellipse(m.x + 2, m.y + 5, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f3540';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4b5361';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 3, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.mine;
    ctx.globalAlpha = blink;
    ctx.beginPath();
    ctx.arc(m.x, m.y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    outlinedText(ctx, String(road.mine), m.x, m.y - 24, '#ffffff', 18);
  }
}

/* ---------- ground marks (under towers/units) ---------- */

function groundRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number, dash?: number[]): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash ?? []);
  ctx.beginPath();
  ctx.ellipse(x, y + 8, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGroundMarks(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number): void {
  const motion = motionAllowed();
  // artillery ranges (the sim measures a circle in map units)
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.kind !== 'artillery' || t.owner === 'neutral') continue;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = pal.owners[t.owner];
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
    groundRing(ctx, sel.x, sel.y, 52 + pulse * 5, shade(pal.selection, -0.45), 9);
    groundRing(ctx, sel.x, sel.y, 52 + pulse * 5, pal.selection, 5);
  }
  if (hov && sel && hov.id !== sel.id) {
    const [a, b] = sel.id < hov.id ? [sel.id, hov.id] : [hov.id, sel.id];
    const road = state.roads[`${a}-${b}`];
    if (road) {
      ctx.strokeStyle = shade(pal.selection, -0.45);
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.setLineDash([16, 14]);
      ctx.lineDashOffset = motion ? -(nowMs / 25) % 30 : 0;
      ctx.beginPath();
      tracePolyline(ctx, road, 0, 1);
      ctx.stroke();
      ctx.strokeStyle = pal.selection;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    groundRing(ctx, hov.x, hov.y, 54, pal.selection, 5, [10, 8]);
  } else if (hov && !sel) {
    groundRing(ctx, hov.x, hov.y, 54, pal.selection, 4, [10, 8]);
  }
}

/* ---------- units & towers ---------- */

interface UnitDraw {
  x: number;
  y: number;
  dx: number;
  dy: number;
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
    out.push({ x: p.x, y: p.y, dx: forward ? p.dx : -p.dx, dy: forward ? p.dy : -p.dy, unit });
  }
  out.sort((a, b) => a.y - b.y);
}

function drawWorld(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number): void {
  const motion = motionAllowed();
  const towers = Object.values(state.towers).sort((a, b) => a.y - b.y);
  for (const t of towers) drawTowerShadow(ctx, pal, t.x, t.y, t.kind);

  const units: UnitDraw[] = [];
  unitDraws(state, ui.alpha, units);
  // painter's order: everything sorted by ground y so units walk in front of / behind buildings
  let ui_ = 0;
  const drawUnit = (u: UnitDraw): void =>
    drawUnitSprite(ctx, pal, u.x, u.y, u.unit.owner, u.unit.kind, u.dx, u.dy, u.unit.id, nowMs, motion);
  for (const t of towers) {
    while (ui_ < units.length && units[ui_]!.y <= t.y + 4) drawUnit(units[ui_++]!);
    drawTowerSprite(ctx, pal, t, {
      nowMs,
      motion,
      raised: ui.selectedTowerId === t.id,
      pulse: ui.particles?.towerPulse(t.id, nowMs) ?? 0,
    });
  }
  while (ui_ < units.length) drawUnit(units[ui_++]!);

  // badges on top of everything in the world
  const queued = new Map<string, number>();
  for (const q of state.queues) queued.set(q.from, (queued.get(q.from) ?? 0) + q.remaining);
  for (const t of towers) {
    const raise = ui.selectedTowerId === t.id ? 4 : 0;
    drawBadge(ctx, pal, t.x, t.y + badgeY(t.kind) - raise, String(t.units), t.units >= capacityOf(t));
    const n = queued.get(t.id) ?? 0;
    if (n > 0) outlinedText(ctx, `+${n}`, t.x + 44, t.y + 22, '#ffffff', 18);
  }
}

/* ---------- HUD ---------- */

const LEVEL_CHIP: Rect = { x: 18, y: 20, w: 292, h: 58 };
const TIMER_PILL: Rect = { x: 336, y: 24, w: 168, h: 50 };

function drawHud(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi): void {
  const chipFill = 'rgba(255,255,255,0.9)';
  // level chip
  drawPill(ctx, LEVEL_CHIP, chipFill, pal.panelBorder);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.font = font(15);
  ctx.fillText(`LEVEL ${ui.level.id}`, 40, 37);
  ctx.fillStyle = pal.text;
  ctx.font = font(24);
  ctx.fillText(ui.level.name, 40, 60, LEVEL_CHIP.w - 44);

  // timer pill (+ speed tag)
  drawPill(ctx, TIMER_PILL, chipFill, pal.panelBorder);
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.text;
  ctx.font = font(34, '900');
  ctx.fillText(formatTime(state.time), TIMER_PILL.x + TIMER_PILL.w / 2, TIMER_PILL.y + TIMER_PILL.h / 2 + 1);
  if (ui.speed !== 1) {
    const tag: Rect = { x: 522, y: 30, w: 92, h: 38 };
    drawPill(ctx, tag, pal.accent);
    ctx.fillStyle = '#ffffff';
    ctx.font = font(20);
    ctx.fillText(`×${ui.speed}`, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  }

  // pause button
  const pb = HUD.pause;
  drawButton(ctx, pal, pb, '', { edge: pal.accent });
  ctx.fillStyle = pal.text;
  const cx = pb.x + pb.w / 2;
  const cy = pb.y + (pb.h - 6) / 2;
  if (ui.paused) {
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 12);
    ctx.lineTo(cx + 12, cy);
    ctx.lineTo(cx - 8, cy + 12);
    ctx.closePath();
    ctx.fill();
  } else {
    roundRect(ctx, { x: cx - 12, y: cy - 12, w: 8, h: 24 }, 2);
    ctx.fill();
    roundRect(ctx, { x: cx + 4, y: cy - 12, w: 8, h: 24 }, 2);
    ctx.fill();
  }

  // lesson hint during the first seconds
  if (state.time < 8000 && ui.outcome === 'playing') {
    ctx.font = font(20);
    const lines = wrapText(ctx, ui.level.lesson, 620, 3);
    const h = lines.length * 26 + 16;
    const w = Math.min(680, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 44);
    roundRect(ctx, { x: 360 - w / 2, y: 104, w, h }, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fill();
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, 360, 104 + 21 + i * 26));
  }

  // bottom bar: send ratio + menu
  const ratioLabel = `SEND ${Math.round(ui.sendRatio * 100)}%`;
  drawButton(ctx, pal, HUD.ratio, ratioLabel, { fontPx: 22, border: ui.sendRatio < 1 ? pal.accent : undefined, edge: pal.accent });
  drawButton(ctx, pal, HUD.menu, 'MENU', { fontPx: 24 });

  // selection hint
  if (ui.selectedTowerId && ui.outcome === 'playing') {
    outlinedText(ctx, 'Tap a connected tower to send · tap again to upgrade', 360, 1176, pal.text, 20, 'rgba(255,255,255,0.9)', 'bold');
  }
}

/* ---------- overlays ---------- */

const overlayShownAt = new WeakMap<GameState, number>();

function drawCard(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect): void {
  roundRect(ctx, { x: r.x, y: r.y + 8, w: r.w, h: r.h }, 28);
  ctx.fillStyle = pal.panelBorder;
  ctx.fill();
  roundRect(ctx, r, 28);
  ctx.fillStyle = pal.panel;
  ctx.fill();
}

function drawOverlay(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi, nowMs: number): void {
  ctx.fillStyle = 'rgba(15, 35, 70, 0.55)';
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (ui.outcome === 'playing') {
    // Pause menu
    drawCard(ctx, pal, { x: 110, y: 390, w: 500, h: 530 });
    ctx.fillStyle = pal.text;
    ctx.font = font(64, '900');
    ctx.fillText('PAUSED', 360, 470);
    ctx.fillStyle = pal.textDim;
    ctx.font = font(24);
    ctx.fillText(`Level ${ui.level.id} · ${formatTime(state.time)}`, 360, 536);
    drawButton(ctx, pal, PAUSE.resume, 'RESUME', { fill: pal.owners.player });
    const fast = ui.speed !== 1;
    drawButton(ctx, pal, PAUSE.speed, `SPEED ×${ui.speed}`, { fontPx: 24, border: fast ? pal.accent : undefined, text: fast ? pal.accent : undefined });
    drawButton(ctx, pal, PAUSE.retry, 'RETRY');
    drawButton(ctx, pal, PAUSE.menu, 'MENU');
    return;
  }

  const won = ui.outcome === 'won';
  let shown = overlayShownAt.get(state);
  if (shown === undefined) {
    shown = nowMs;
    overlayShownAt.set(state, nowMs);
  }
  const since = nowMs > 0 && motionAllowed() ? nowMs - shown : 10_000;
  const cardScale = easeOutBack(Math.min(1, since / 320));
  ctx.save();
  ctx.translate(360, 620);
  ctx.scale(cardScale, cardScale);
  ctx.translate(-360, -620);
  drawCard(ctx, pal, { x: 70, y: 350, w: 580, h: 540 });
  // banner
  roundRect(ctx, { x: 70, y: 350, w: 580, h: 150 }, 28);
  ctx.fillStyle = won ? shade(pal.owners.player, 0.75) : '#fde2e2';
  ctx.fill();
  ctx.fillStyle = pal.panel;
  ctx.fillRect(70, 470, 580, 40);
  outlinedText(ctx, won ? 'VICTORY' : 'DEFEAT', 360, 430, won ? pal.star : pal.mine, 84, pal.text);
  ctx.fillStyle = pal.text;
  ctx.font = font(30);
  ctx.textAlign = 'center';
  ctx.fillText(`Time ${formatTime(state.time)}`, 360, 520);
  const scales = [0, 1, 2].map((i) => easeOutBack((since - 200 - i * 220) / 360));
  drawStars(ctx, pal, 360, 594, won ? ui.stars : 0, 38, scales);
  if (won) {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20);
    const s3 = formatTime(ui.level.star3);
    const s2 = formatTime(ui.level.star2);
    ctx.fillText(`3★ under ${s3} · 2★ under ${s2}`, 360, 650);
    ctx.font = font(30);
    const labelW = ctx.measureText(`+${ui.coinsEarned} coins`).width;
    drawCoin(ctx, pal, 360 - labelW / 2 - 22, 698, 15);
    ctx.fillStyle = shade(pal.star, -0.35);
    ctx.font = font(30);
    ctx.fillText(`+${ui.coinsEarned} coins`, 360 + 6, 698);
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20);
    ctx.fillText(ui.coinsEarned > 0 ? `${ui.coinsTotal} coins total` : `already cleared · ${ui.coinsTotal} coins total`, 360, 742);
  } else {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(22);
    ctx.fillText('Every tower was lost. Try again!', 360, 690);
  }
  drawButton(ctx, pal, RESULT.next, 'NEXT', { fill: won ? pal.owners.player : undefined, disabled: !won || !ui.hasNext });
  drawButton(ctx, pal, RESULT.retry, 'RETRY');
  drawButton(ctx, pal, RESULT.menu, 'MENU');
  ctx.restore();
}

/* ---------- entry ---------- */

const specCache = new WeakMap<GameState, TerrainSpec>();

function terrainSpec(state: GameState): TerrainSpec {
  let spec = specCache.get(state);
  if (spec) return spec;
  spec = {
    key: `level:${state.levelId}`,
    seed: state.levelId,
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
  drawTerrain(ctx, view, pal, terrainSpec(state));

  for (const road of Object.values(state.roads)) {
    if (road.kind === 'bridge') drawBridge(ctx, pal, road, ui.pressRoadId === road.id ? ui.pressProgress : 0);
  }
  for (const road of Object.values(state.roads)) drawHazards(ctx, pal, road, nowMs);
  drawGroundMarks(ctx, pal, state, ui, nowMs);
  drawWorld(ctx, pal, state, ui, nowMs);
  ui.particles?.draw(ctx, nowMs);
  drawHud(ctx, pal, state, ui);
  if (ui.outcome !== 'playing' || ui.paused) drawOverlay(ctx, pal, state, ui, nowMs);

  ctx.restore();
}
