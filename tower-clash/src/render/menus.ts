import type { Owner, Road, TowerKind } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, clipToMap } from './view';
import type { Rect } from './widgets';
import { drawButton, drawCoin, drawExtrudedText, drawFlag, drawGlassBand, drawLock, drawPill, drawStars, font, withShadow } from './widgets';
import { LEVEL_MAP, levelNodeCentre, levelNodeRect } from './layout';
import type { TerrainSpec } from './terrain';
import { drawTerrain } from './terrain';
import { badgeY, drawBadge, drawTowerShadow, drawTowerSprite, drawUnitSprite } from './sprites';
import { roadPoseAt } from './draw';
import { prefersReducedMotion } from './particles';

/*
 * Title and level-select visuals (ART_DIRECTION §4). Title: the game's island with three demo
 * towers and marching columns under an extruded clay logo. Level select: a long clay island with
 * a winding cream path and round level nodes that scroll under a glass header. Hit rectangles are
 * owned by src/render/layout.ts + src/ui/screens.ts and passed in.
 */

interface DemoTower {
  x: number;
  y: number;
  owner: Owner;
  kind: TowerKind;
  level: number;
  units: number;
}

const DEMO_TOWERS: DemoTower[] = [
  { x: 130, y: 250, owner: 'player', kind: 'barracks', level: 2, units: 24 },
  { x: 590, y: 250, owner: 'enemy1', kind: 'fortress', level: 1, units: 18 },
  { x: 360, y: 1040, owner: 'neutral', kind: 'barracks', level: 1, units: 7 },
];

function demoRoad(a: number, b: number): Road {
  const p = DEMO_TOWERS[a]!;
  const q = DEMO_TOWERS[b]!;
  return {
    id: `d${a}-d${b}`,
    a: `d${a}`,
    b: `d${b}`,
    kind: 'road',
    points: [
      { x: p.x, y: p.y },
      { x: q.x, y: q.y },
    ],
    length: Math.hypot(q.x - p.x, q.y - p.y),
    mine: 0,
    barrier: 0,
    cut: false,
  };
}

const DEMO_ROADS: Road[] = [demoRoad(0, 1), demoRoad(0, 2), demoRoad(1, 2)];

const DEMO_TERRAIN: TerrainSpec = {
  key: 'title',
  seed: 42,
  roads: DEMO_ROADS.map((r) => ({ points: r.points, kind: r.kind })),
  towers: DEMO_TOWERS,
  top: 120,
  bottom: 1150,
};

/** Marching columns: (road index, forward?, owner, count, phase). */
const DEMO_COLUMNS: { road: number; forward: boolean; owner: Owner; count: number; phase: number }[] = [
  { road: 0, forward: true, owner: 'player', count: 7, phase: 0 },
  { road: 1, forward: true, owner: 'player', count: 6, phase: 0.4 },
  { road: 2, forward: true, owner: 'enemy1', count: 6, phase: 0.2 },
];

let reduced: boolean | null = null;
function motion(): boolean {
  if (reduced === null) reduced = prefersReducedMotion();
  return !reduced;
}

function beginFrame(view: View, pal: Palette): CanvasRenderingContext2D {
  const ctx = view.ctx;
  applyDeviceTransform(view);
  ctx.fillStyle = pal.letterbox;
  ctx.fillRect(0, 0, view.cssW, view.cssH);
  ctx.save();
  applyTransform(view);
  clipToMap(view);
  return ctx;
}

function drawDemoWorld(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number, withBadges: boolean): void {
  const anim = motion();
  for (const t of DEMO_TOWERS) drawTowerShadow(ctx, pal, t.x, t.y, t.kind);
  const t0 = anim ? nowMs / 1000 : 0;
  for (const col of DEMO_COLUMNS) {
    const road = DEMO_ROADS[col.road]!;
    const speed = C.UNIT_SPEED / road.length;
    for (let i = 0; i < col.count; i++) {
      const f = (((t0 * speed + col.phase + i * 0.06) % 1) + 1) % 1;
      const p = roadPoseAt(road, col.forward ? f : 1 - f);
      const s = col.forward ? 1 : -1;
      drawUnitSprite(ctx, pal, p.x, p.y, col.owner, 'infantry', p.dx * s, p.dy * s, i + col.road * 10, nowMs, anim);
    }
  }
  for (const t of DEMO_TOWERS) drawTowerSprite(ctx, pal, t, { nowMs, motion: anim });
  if (withBadges) for (const t of DEMO_TOWERS) drawBadge(ctx, pal, t.x, t.y + badgeY(t.kind), String(t.units));
}

/* ---------- glyphs for the settings row ---------- */

function speakerGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number, on: boolean): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy - s * 0.3);
  ctx.lineTo(cx - s * 0.3, cy - s * 0.3);
  ctx.lineTo(cx + s * 0.15, cy - s * 0.7);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.7);
  ctx.lineTo(cx - s * 0.3, cy + s * 0.3);
  ctx.lineTo(cx - s * 0.7, cy + s * 0.3);
  ctx.closePath();
  ctx.fill();
  if (on) {
    ctx.beginPath();
    ctx.arc(cx + s * 0.2, cy, s * 0.45, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 0.2, cy, s * 0.8, -0.9, 0.9);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.4, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.95, cy + s * 0.35);
    ctx.moveTo(cx + s * 0.95, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

/** Three owner-coloured clay dots: the colour-blind palette toggle. */
function paletteGlyph(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, s: number): void {
  const colours = [pal.owners.player, pal.owners.enemy1, pal.owners.enemy2];
  colours.forEach((c, i) => {
    const x = cx + (i - 1) * s * 0.85;
    ctx.fillStyle = shade(c, -0.35);
    ctx.beginPath();
    ctx.arc(x + 1, cy + 2, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, cy, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(x - s * 0.12, cy - s * 0.14, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ---------- Title ---------- */

export interface TitleOpts {
  playRect: Rect;
  cbRect: Rect;
  soundRect: Rect;
  colorBlind: boolean;
  soundOn: boolean;
  totalStars: number;
  coins: number;
  nowMs: number;
  /** Rect currently held down (pressed look), if any. */
  pressed?: Rect | null;
}

export function drawTitle(view: View, pal: Palette, o: TitleOpts): void {
  const ctx = beginFrame(view, pal);
  drawTerrain(ctx, view, pal, DEMO_TERRAIN);
  drawDemoWorld(ctx, pal, o.nowMs, true);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const anim = motion();
  const bob = anim ? Math.sin(o.nowMs / 900) * 6 : 0;
  const bob2 = anim ? Math.sin(o.nowMs / 900 + 0.8) * 6 : 0;
  const blue = pal.owners.player;
  // floating logo: the ground shadow shrinks as the letters lift
  ctx.save();
  ctx.fillStyle = pal.groundShadow;
  ctx.beginPath();
  ctx.ellipse(370, 540, 250 - bob * 3, 22 - bob * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  withShadow(
    ctx,
    () => {
      drawExtrudedText(ctx, 'TOWER', 360, 372 + bob, 112, { face: pal.paper, side: shade(blue, -0.25), outline: pal.ink, depth: 8 });
      drawExtrudedText(ctx, 'CLASH', 360, 474 + bob2, 112, { face: blue, side: shade(blue, -0.45), outline: pal.ink, depth: 8 });
    },
    14,
    18,
    0.22,
  );
  const sub: Rect = { x: 214, y: 548, w: 292, h: 46 };
  drawPill(ctx, sub, pal.paper);
  ctx.fillStyle = pal.ink;
  ctx.font = font(22, '500');
  ctx.fillText('Capture every tower', 360, sub.y + sub.h / 2 + 1);

  drawButton(ctx, pal, o.playRect, 'PLAY', { fill: blue, fontPx: 46, pressed: o.pressed === o.playRect });

  // settings row: colour-blind palette · sound
  // colour-blind palette: blue face when on, paper when off
  drawButton(ctx, pal, o.cbRect, '', { fill: o.colorBlind ? pal.accent : undefined, pressed: o.pressed === o.cbRect });
  paletteGlyph(ctx, pal, o.cbRect.x + 38, o.cbRect.y + o.cbRect.h / 2 - 1, 18);
  ctx.textAlign = 'left';
  ctx.fillStyle = o.colorBlind ? pal.paper : pal.ink;
  ctx.font = font(19);
  ctx.fillText(o.colorBlind ? 'CB colours' : 'Colour-blind', o.cbRect.x + 68, o.cbRect.y + o.cbRect.h / 2 - 1, o.cbRect.w - 78);
  drawButton(ctx, pal, o.soundRect, '', { pressed: o.pressed === o.soundRect });
  speakerGlyph(ctx, o.soundOn ? pal.ink : pal.textDim, o.soundRect.x + 38, o.soundRect.y + o.soundRect.h / 2 - 1, 17, o.soundOn);
  ctx.fillStyle = o.soundOn ? pal.ink : pal.textDim;
  ctx.font = font(19);
  ctx.fillText(o.soundOn ? 'Sound on' : 'Sound off', o.soundRect.x + 68, o.soundRect.y + o.soundRect.h / 2 - 1, o.soundRect.w - 78);

  // progress footer
  ctx.textAlign = 'center';
  ctx.font = font(21);
  const label = `${o.totalStars}   ·   ${o.coins}`;
  const w = ctx.measureText(label).width + 110;
  const foot: Rect = { x: 360 - w / 2, y: 1176, w, h: 48 };
  drawPill(ctx, foot, pal.paper);
  ctx.fillStyle = pal.ink;
  ctx.fillText(label, 360 + 8, foot.y + foot.h / 2 + 1);
  const starX = 360 + 8 - ctx.measureText(label).width / 2 - 20;
  drawStars(ctx, pal, starX, foot.y + foot.h / 2, 1, 11, [1, 0, 0]);
  drawCoin(ctx, pal, 360 + 8 + ctx.measureText(label).width / 2 + 22, foot.y + foot.h / 2, 12);
  ctx.restore();
}

/* ---------- Level select: winding path map ---------- */

export interface LevelNode {
  id: number;
  name: string;
  stars: number;
  unlocked: boolean;
}

export interface LevelSelectOpts {
  nodes: LevelNode[];
  /** Index of the "current" level (first unlocked without a clear, or the last level). */
  current: number;
  scroll: number;
  backRect: Rect;
  coins: number;
  nowMs: number;
  pressed?: Rect | null;
}

/** Content-space bottom of the island for `count` nodes. */
function islandBottom(count: number): number {
  return LEVEL_MAP.top + Math.max(0, count - 1) * LEVEL_MAP.step + LEVEL_MAP.tail - 60;
}

/**
 * Organic plateau outline: a tall squircle with a deterministic edge wobble. Vertices are cached
 * per node count; the path is rebuilt each frame at the given offset (cheap: ~140 lineTo).
 */
let islandCacheKey = -1;
let islandVerts: { x: number; y: number }[] = [];

function islandOutline(count: number): { x: number; y: number }[] {
  if (islandCacheKey === count) return islandVerts;
  const top = 150;
  const bottom = islandBottom(count);
  const cx = 360;
  const cy = (top + bottom) / 2;
  const hw = 312;
  const hh = (bottom - top) / 2;
  const n = 160;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // superellipse (n = 3.2) → rounded ends, straight-ish sides
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / 3.2);
    const ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / 3.2);
    const wob = 9 * Math.sin(a * 9 + 0.7) + 6 * Math.sin(a * 17 + 2.1) + 4 * Math.sin(a * 29);
    pts.push({ x: cx + ex * (hw + wob), y: cy + ey * (hh + wob * 1.4) });
  }
  islandCacheKey = count;
  islandVerts = pts;
  return pts;
}

function tracePolygon(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], ox: number, oy: number): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x + ox, p.y + oy) : ctx.lineTo(p.x + ox, p.y + oy)));
  ctx.closePath();
}

function drawWater(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number, scroll: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, C.MAP_H);
  g.addColorStop(0, pal.waterTop);
  g.addColorStop(1, pal.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  // drifting sparkle dots (parallax: half the scroll speed)
  const drift = motion() ? nowMs / 1000 : 0;
  ctx.fillStyle = pal.waterSparkle;
  for (let i = 0; i < 26; i++) {
    const seed = i * 97.31;
    const x = ((seed * 7.3 + drift * (6 + (i % 4) * 3)) % 760) - 20;
    const y = (((seed * 3.7 - scroll * 0.5) % 1320) + 1320) % 1320 - 20;
    const w = 10 + (i % 3) * 6;
    ctx.beginPath();
    ctx.ellipse(x, y, w, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLongIsland(ctx: CanvasRenderingContext2D, pal: Palette, count: number): void {
  const pts = islandOutline(count);
  // soft ground shadow onto the water (lower-right)
  tracePolygon(ctx, pts, 14, 22);
  ctx.fillStyle = pal.groundShadow;
  ctx.fill();
  // 3-band bevel: under-cliff, cliff, grass
  tracePolygon(ctx, pts, 0, 34);
  ctx.fillStyle = pal.cliffShade;
  ctx.fill();
  // foam where water meets the cliff
  ctx.strokeStyle = pal.foam;
  ctx.lineWidth = 5;
  ctx.stroke();
  tracePolygon(ctx, pts, 0, 20);
  ctx.fillStyle = pal.cliffLit;
  ctx.fill();
  tracePolygon(ctx, pts, 0, 0);
  ctx.fillStyle = pal.grassTones.mid;
  ctx.fill();
  // lit top-left edge (inset stroke, clipped to the plateau) and a darker lower-right rim
  ctx.save();
  ctx.clip();
  tracePolygon(ctx, pts, 4, 5);
  ctx.strokeStyle = pal.grassTones.lit;
  ctx.lineWidth = 12;
  ctx.stroke();
  tracePolygon(ctx, pts, -4, -5);
  ctx.strokeStyle = pal.grassTones.shade;
  ctx.lineWidth = 10;
  ctx.stroke();
  // sun patches
  ctx.fillStyle = pal.grassTones.lit;
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < count + 2; i++) {
    const y = 200 + i * 230;
    const x = 360 + Math.sin(i * 2.3) * 210;
    ctx.beginPath();
    ctx.ellipse(x, y, 120 + (i % 3) * 30, 60 + (i % 2) * 20, (i % 5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Clay bush: three overlapping domes (shade / mid / lit). */
function drawBush(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, s: number): void {
  ctx.fillStyle = pal.groundShadow;
  ctx.beginPath();
  ctx.ellipse(x + s * 0.3, y + s * 0.5, s * 1.3, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const lobes: [number, number, number][] = [
    [-s * 0.6, 0.1, 0.8],
    [s * 0.6, 0.15, 0.75],
    [0, -0.3, 1],
  ];
  for (const [dx, dy, k] of lobes) {
    ctx.fillStyle = pal.biomes.grass.bush.shade;
    ctx.beginPath();
    ctx.arc(x + dx + 2, y + dy * s + 3, s * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.biomes.grass.bush.mid;
    ctx.beginPath();
    ctx.arc(x + dx, y + dy * s, s * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.biomes.grass.bush.lit;
    ctx.beginPath();
    ctx.arc(x + dx - s * k * 0.3, y + dy * s - s * k * 0.35, s * k * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWindingPath(ctx: CanvasRenderingContext2D, pal: Palette, count: number): void {
  if (count < 2) return;
  const trace = (): void => {
    ctx.beginPath();
    const p0 = levelNodeCentre(0);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < count; i++) {
      const a = levelNodeCentre(i - 1);
      const b = levelNodeCentre(i);
      const k = LEVEL_MAP.step * 0.55;
      ctx.bezierCurveTo(a.x, a.y + k, b.x, b.y - k, b.x, b.y);
    }
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  trace();
  ctx.strokeStyle = pal.pathShade;
  ctx.lineWidth = 40;
  ctx.stroke();
  ctx.strokeStyle = pal.pathLit;
  ctx.lineWidth = 32;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 22]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawNode(ctx: CanvasRenderingContext2D, pal: Palette, node: LevelNode, index: number, current: boolean, nowMs: number): void {
  const c = levelNodeCentre(index);
  const r = current ? LEVEL_MAP.nodeR + 4 : LEVEL_MAP.nodeR;
  const anim = motion();
  const base = !node.unlocked ? pal.owners.neutral : node.stars > 0 ? pal.gold : pal.owners.player;
  const pulse = current && anim ? (Math.sin(nowMs / 260) + 1) / 2 : 0.5;
  if (current) {
    // gold pulse ring under the node
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.3 * (1 - pulse);
    ctx.strokeStyle = pal.selection;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r + 10 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // clay disc: shadow, side, face, highlight
  withShadow(
    ctx,
    () => {
      ctx.beginPath();
      ctx.arc(c.x, c.y + 6, r, 0, Math.PI * 2);
      ctx.fillStyle = shade(base, -0.4);
      ctx.fill();
    },
    8,
    12,
    0.18,
  );
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(c.x - r, c.y - r, c.x + r * 0.5, c.y + r);
  g.addColorStop(0, shade(base, 0.28));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = shade(base, -0.45);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(c.x - r * 0.35, c.y - r * 0.45, r * 0.3, r * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (!node.unlocked) {
    drawLock(ctx, shade(pal.owners.neutral, -0.35), c.x, c.y + 2, 30);
    return;
  }
  const inkOnGold = node.stars > 0;
  ctx.fillStyle = inkOnGold ? pal.ink : pal.paper;
  ctx.font = font(40);
  ctx.fillText(String(node.id), c.x, c.y + 3);
  if (node.stars > 0) drawStars(ctx, pal, c.x, c.y + r + 18, node.stars, 12);
  if (current) {
    const wave = anim ? Math.sin(nowMs / 220) * 3 : 0;
    drawFlag(ctx, pal.owners.enemy1, c.x + r * 0.62, c.y - r * 0.55, 44, wave);
    // level name pill under the current node
    ctx.font = font(20);
    const w = ctx.measureText(node.name).width + 36;
    const pill: Rect = { x: c.x - w / 2, y: c.y + r + (node.stars > 0 ? 36 : 14), w, h: 38 };
    drawPill(ctx, pill, pal.paper);
    ctx.fillStyle = pal.ink;
    ctx.fillText(node.name, c.x, pill.y + pill.h / 2 + 1);
  }
}

export function drawLevelSelect(view: View, pal: Palette, o: LevelSelectOpts): void {
  const ctx = beginFrame(view, pal);
  const count = o.nodes.length;
  drawWater(ctx, pal, o.nowMs, o.scroll);

  ctx.save();
  ctx.translate(0, -o.scroll);
  drawLongIsland(ctx, pal, count);
  // bushes on the side the path swings away from
  for (let i = 0; i < count; i++) {
    const c = levelNodeCentre(i);
    const side = c.x < 360 ? 1 : -1;
    drawBush(ctx, pal, 360 + side * 250 + ((i * 37) % 40), c.y + 40 + ((i * 53) % 50), 14 + (i % 3) * 3);
    if (i % 2 === 0) drawBush(ctx, pal, 360 + side * 150 + ((i * 29) % 60), c.y - 60, 11);
  }
  drawWindingPath(ctx, pal, count);
  // nodes: only those near the viewport (cheap culling)
  const minY = o.scroll - 120;
  const maxY = o.scroll + C.MAP_H + 120;
  o.nodes.forEach((node, i) => {
    const y = levelNodeRect(i, 0).y;
    if (y < minY || y > maxY) return;
    drawNode(ctx, pal, node, i, i === o.current, o.nowMs);
  });
  ctx.restore();

  // fixed header: glass band, back, title, coins
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: LEVEL_MAP.headerH });
  drawButton(ctx, pal, o.backRect, 'BACK', { fontPx: 24, pressed: o.pressed === o.backRect });
  drawExtrudedText(ctx, 'LEVELS', 360, 50, 40, { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  ctx.font = font(26);
  const coins = String(o.coins);
  const w = ctx.measureText(coins).width + 72;
  const pill: Rect = { x: 702 - w, y: 26, w, h: 48 };
  drawPill(ctx, pill, pal.paper);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.fillText(coins, 686, pill.y + pill.h / 2 + 1);
  drawCoin(ctx, pal, pill.x + 26, pill.y + pill.h / 2, 14);
  ctx.restore();
}
