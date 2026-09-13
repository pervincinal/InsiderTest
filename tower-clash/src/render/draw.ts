import type { GameState, LevelDef, Outcome, Road, Tower, Unit } from '../sim/types';
import { C } from '../sim/constants';
import { capacityOf, roadPointAt } from '../sim/step';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, clipToMap } from './view';
import { HUD, RESULT, TANK_RADIUS, TOWER_RADIUS, UNIT_RADIUS } from './layout';
import { drawButton, drawStars, font, formatTime, outlinedText, roundRect } from './widgets';

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
}

/* ---------- roads ---------- */

function tracePolyline(ctx: CanvasRenderingContext2D, road: Road, t0: number, t1: number): void {
  const steps = Math.max(2, Math.ceil((road.length * (t1 - t0)) / 24));
  for (let i = 0; i <= steps; i++) {
    const p = roadPointAt(road, t0 + ((t1 - t0) * i) / steps);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
}

function drawRoad(ctx: CanvasRenderingContext2D, pal: Palette, road: Road, pressing: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (road.kind === 'bridge' && road.cut) {
    // Broken bridge: two dim stubs with a gap in the middle.
    ctx.strokeStyle = pal.roadDim;
    ctx.lineWidth = 10;
    ctx.setLineDash([]);
    ctx.beginPath();
    tracePolyline(ctx, road, 0, 0.36);
    ctx.stroke();
    ctx.beginPath();
    tracePolyline(ctx, road, 0.64, 1);
    ctx.stroke();
    const m = roadPointAt(road, 0.5);
    ctx.strokeStyle = pal.mine;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(m.x - 12, m.y - 12);
    ctx.lineTo(m.x + 12, m.y + 12);
    ctx.moveTo(m.x + 12, m.y - 12);
    ctx.lineTo(m.x - 12, m.y + 12);
    ctx.stroke();
    return;
  }
  ctx.lineWidth = 10;
  if (road.kind === 'bridge') {
    ctx.strokeStyle = pal.bridge;
    ctx.setLineDash([18, 12]);
  } else {
    ctx.strokeStyle = pal.road;
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  tracePolyline(ctx, road, 0, 1);
  ctx.stroke();
  ctx.setLineDash([]);

  if (road.kind === 'bridge' && pressing > 0) {
    // Long-press progress ring at the midpoint.
    const m = roadPointAt(road, 0.5);
    ctx.strokeStyle = pal.mine;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pressing);
    ctx.stroke();
  }
}

function drawHazards(ctx: CanvasRenderingContext2D, pal: Palette, road: Road): void {
  if (road.cut) return;
  const m = roadPointAt(road, 0.5);
  if (road.mine > 0) {
    ctx.fillStyle = pal.mine;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - 14);
    ctx.lineTo(m.x + 14, m.y);
    ctx.lineTo(m.x, m.y + 14);
    ctx.lineTo(m.x - 14, m.y);
    ctx.closePath();
    ctx.fill();
    outlinedText(ctx, String(road.mine), m.x, m.y + 1, pal.text, 16);
  }
  if (road.barrier > 0) {
    const a = roadPointAt(road, 0.47);
    const b = roadPointAt(road, 0.53);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(ang);
    ctx.fillStyle = pal.barrier;
    roundRect(ctx, { x: -26, y: -8, w: 52, h: 16 }, 5);
    ctx.fill();
    ctx.restore();
    outlinedText(ctx, String(road.barrier), m.x, m.y + 1, pal.text, 18);
  }
}

/* ---------- towers ---------- */

function drawTower(ctx: CanvasRenderingContext2D, pal: Palette, tower: Tower, ui: PlayUi): void {
  const base = pal.owners[tower.owner];
  const { x, y } = tower;
  const r = TOWER_RADIUS;

  // Selection / hover ring
  if (ui.selectedTowerId === tower.id) {
    ctx.strokeStyle = pal.selection;
    ctx.lineWidth = 5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, r + 9, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ui.hoverTowerId === tower.id) {
    ctx.strokeStyle = pal.selection;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(x, y, r + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Fortress: thick outer ring
  if (tower.kind === 'fortress') {
    ctx.strokeStyle = shade(base, -0.35);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Body
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = shade(base, -0.4);
  ctx.lineWidth = 3;
  ctx.stroke();
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.35, r * 0.62, 0, Math.PI * 2);
  ctx.fill();

  // Kind glyph (top-right of the body)
  const gx = x + r * 0.62;
  const gy = y - r * 0.62;
  if (tower.kind === 'artillery') {
    ctx.fillStyle = pal.text;
    ctx.strokeStyle = shade(base, -0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx, gy - 11);
    ctx.lineTo(gx + 10, gy + 7);
    ctx.lineTo(gx - 10, gy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (tower.kind === 'tankFactory') {
    ctx.fillStyle = pal.text;
    ctx.strokeStyle = shade(base, -0.5);
    ctx.lineWidth = 2;
    ctx.fillRect(gx - 9, gy - 9, 18, 18);
    ctx.strokeRect(gx - 9, gy - 9, 18, 18);
  }

  // Garrison number
  const cap = capacityOf(tower);
  const numColor = tower.units >= cap ? pal.star : pal.text;
  outlinedText(ctx, String(tower.units), x, y + 1, numColor, 30);

  // Level pips above the tower: tiny crowns (triangle-topped dots)
  const pipY = y - r - 14;
  const pipGap = 16;
  for (let i = 0; i < tower.level; i++) {
    const px = x + (i - (tower.level - 1) / 2) * pipGap;
    ctx.fillStyle = pal.star;
    ctx.beginPath();
    ctx.moveTo(px - 6, pipY + 5);
    ctx.lineTo(px - 6, pipY - 3);
    ctx.lineTo(px - 2, pipY + 1);
    ctx.lineTo(px, pipY - 6);
    ctx.lineTo(px + 2, pipY + 1);
    ctx.lineTo(px + 6, pipY - 3);
    ctx.lineTo(px + 6, pipY + 5);
    ctx.closePath();
    ctx.fill();
  }
}

/* ---------- units ---------- */

function unitDrawPosition(state: GameState, unit: Unit, alpha: number): { x: number; y: number } {
  const road = state.roads[unit.roadId];
  if (!road) return { x: 0, y: 0 };
  const advance = road.length > 0 ? (unit.speed * alpha * C.TICK_MS) / 1000 / road.length : 0;
  const progress = Math.min(1, unit.progress + advance);
  const t = unit.from === road.a ? progress : 1 - progress;
  return roadPointAt(road, t);
}

function drawUnits(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, alpha: number): void {
  ctx.lineWidth = 2;
  for (const unit of state.units) {
    const p = unitDrawPosition(state, unit, alpha);
    const color = pal.owners[unit.owner];
    ctx.fillStyle = color;
    ctx.strokeStyle = shade(color, -0.5);
    if (unit.kind === 'tank') {
      const s = TANK_RADIUS;
      ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
      ctx.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, UNIT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Small "N queued" badge near a tower that still has units waiting to leave. */
function drawQueues(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState): void {
  const perTower = new Map<string, number>();
  for (const q of state.queues) perTower.set(q.from, (perTower.get(q.from) ?? 0) + q.remaining);
  for (const [id, n] of perTower) {
    const t = state.towers[id];
    if (!t || n <= 0) continue;
    outlinedText(ctx, `+${n}`, t.x + TOWER_RADIUS + 18, t.y + TOWER_RADIUS + 10, pal.textDim, 18);
  }
}

/* ---------- HUD ---------- */

function drawHud(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi): void {
  // Top bar
  ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
  ctx.fillRect(HUD.topBar.x, HUD.topBar.y, HUD.topBar.w, HUD.topBar.h);

  ctx.fillStyle = pal.textDim;
  ctx.font = font(20);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LEVEL ${ui.level.id}`, 20, 32);
  ctx.fillStyle = pal.text;
  ctx.font = font(26);
  ctx.fillText(ui.level.name, 20, 64);

  ctx.textAlign = 'center';
  ctx.font = font(40);
  ctx.fillText(formatTime(state.time), 430, 48);
  if (ui.speed !== 1) {
    ctx.font = font(18);
    ctx.fillStyle = pal.accent;
    ctx.fillText(`×${ui.speed}`, 430, 82);
  }

  // Pause button
  const pb = HUD.pause;
  roundRect(ctx, pb, 12);
  ctx.fillStyle = pal.panel;
  ctx.fill();
  ctx.strokeStyle = pal.panelBorder;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = pal.text;
  const cx = pb.x + pb.w / 2;
  const cy = pb.y + pb.h / 2;
  if (ui.paused) {
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 13);
    ctx.lineTo(cx + 13, cy);
    ctx.lineTo(cx - 9, cy + 13);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(cx - 12, cy - 13, 8, 26);
    ctx.fillRect(cx + 4, cy - 13, 8, 26);
  }

  // Lesson hint during the first seconds
  if (state.time < 8000 && ui.outcome === 'playing') {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20, 'normal');
    ctx.textAlign = 'center';
    ctx.fillText(ui.level.lesson, 360, 122);
  }

  // Bottom bar: send ratio + menu
  const ratioLabel = `SEND ${Math.round(ui.sendRatio * 100)}%`;
  drawButton(ctx, pal, HUD.ratio, ratioLabel, { fontPx: 22, border: ui.sendRatio < 1 ? pal.accent : undefined });
  drawButton(ctx, pal, HUD.menu, 'MENU', { fontPx: 24 });

  // Selection hint
  if (ui.selectedTowerId && ui.outcome === 'playing') {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20, 'normal');
    ctx.textAlign = 'center';
    ctx.fillText('Tap a connected tower to send · tap again to upgrade', 360, 1176);
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, pal: Palette, state: GameState, ui: PlayUi): void {
  ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (ui.outcome === 'playing') {
    // Paused
    ctx.fillStyle = pal.text;
    ctx.font = font(72, '900');
    ctx.fillText('PAUSED', 360, 560);
    drawButton(ctx, pal, RESULT.resume, 'RESUME', { fill: pal.owners.player, border: shade(pal.owners.player, 0.3) });
    drawButton(ctx, pal, RESULT.retry, 'RETRY');
    drawButton(ctx, pal, RESULT.menu, 'MENU');
    return;
  }

  const won = ui.outcome === 'won';
  ctx.fillStyle = won ? pal.star : pal.mine;
  ctx.font = font(84, '900');
  ctx.fillText(won ? 'VICTORY' : 'DEFEAT', 360, 470);
  ctx.fillStyle = pal.text;
  ctx.font = font(32);
  ctx.fillText(`Time ${formatTime(state.time)}`, 360, 560);
  drawStars(ctx, pal, 360, 660, won ? ui.stars : 0, 34);
  if (won) {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20, 'normal');
    const s3 = formatTime(ui.level.star3);
    const s2 = formatTime(ui.level.star2);
    ctx.fillText(`3★ under ${s3} · 2★ under ${s2}`, 360, 722);
  }
  drawButton(ctx, pal, RESULT.next, 'NEXT', {
    fill: won ? pal.owners.player : undefined,
    border: won ? shade(pal.owners.player, 0.3) : undefined,
    disabled: !won || !ui.hasNext,
  });
  drawButton(ctx, pal, RESULT.retry, 'RETRY');
  drawButton(ctx, pal, RESULT.menu, 'MENU');
}

/* ---------- entry ---------- */

/** Draw one frame. Reads state and ui; never mutates either. */
export function drawGame(ctx: CanvasRenderingContext2D, state: GameState, view: View, ui: PlayUi): void {
  const pal = ui.palette;

  // Letterbox bars in device space, then the map in logical space.
  applyDeviceTransform(view);
  ctx.fillStyle = pal.letterbox;
  ctx.fillRect(0, 0, view.cssW, view.cssH);

  ctx.save();
  applyTransform(view);
  clipToMap(view);
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);

  for (const road of Object.values(state.roads)) {
    drawRoad(ctx, pal, road, ui.pressRoadId === road.id ? ui.pressProgress : 0);
  }
  for (const road of Object.values(state.roads)) drawHazards(ctx, pal, road);
  drawUnits(ctx, pal, state, ui.alpha);
  for (const tower of Object.values(state.towers)) drawTower(ctx, pal, tower, ui);
  drawQueues(ctx, pal, state);
  drawHud(ctx, pal, state, ui);
  if (ui.outcome !== 'playing' || ui.paused) drawOverlay(ctx, pal, state, ui);

  ctx.restore();
}
