import type { Owner, Road, TowerKind } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, clipToMap } from './view';
import type { Rect } from './widgets';
import {
  drawButton,
  drawCard,
  drawCoin,
  drawExtrudedText,
  drawFlag,
  drawGearGlyph,
  drawGlassBand,
  drawLock,
  drawPill,
  drawSegmented,
  drawSpeakerGlyph,
  drawStars,
  drawToggle,
  font,
  roundRect,
  withShadow,
} from './widgets';
import type { ShopTab } from './layout';
import { LEVEL_MAP, SETTINGS, SHOP, SHOP_TABS, levelNodeCentre, levelNodeRect, shopBuyRect, shopRowBuyRect } from './layout';
import type { TerrainSpec } from './terrain';
import { drawTerrain } from './terrain';
import type { UpgradeKind } from './sprites';
import type { ToastOpts } from './economyWidgets';
import { drawSpinner, drawToast, drawWallet, formatAmount } from './economyWidgets';
import {
  badgeY,
  drawBadge,
  drawCrownBadge,
  drawCrystal,
  drawCrystalCluster,
  drawGoldCoin,
  drawNoAdsBadge,
  drawSkinPreview,
  drawTowerShadow,
  drawTowerSprite,
  drawTreasureChest,
  drawUnitSprite,
  drawUpgradeGlyph,
  drawVideoGlyph,
} from './sprites';
import { roadPoseAt } from './draw';
import { prefersReducedMotion } from './particles';
import { reducedMotionOverride } from '../ui/motion';
import type { MotionPref } from '../ui/save';

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
  const override = reducedMotionOverride();
  if (override !== null) return !override;
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

export interface DailyChestOpts {
  /** Streak reward not yet claimed today. */
  claimable: boolean;
  /** Day 1..7 of the reward on offer (or claimed today). */
  day: number;
  gold: number;
  crystals: number;
  /** Streak claimed; a rewarded video for the crystal chest is on offer instead. */
  adChest: boolean;
}

export interface TitleOpts {
  playRect: Rect;
  settingsRect: Rect;
  soundRect: Rect;
  shopRect: Rect;
  dailyRect: Rect;
  walletRect: Rect;
  soundOn: boolean;
  totalStars: number;
  gold: number;
  crystals: number;
  daily: DailyChestOpts;
  nowMs: number;
  /** Rect currently held down (pressed look), if any. */
  pressed?: Rect | null;
  toast?: ToastOpts | null;
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

  // settings row: gear · sound
  drawButton(ctx, pal, o.settingsRect, '', { pressed: o.pressed === o.settingsRect });
  drawGearGlyph(ctx, pal.ink, o.settingsRect.x + 38, o.settingsRect.y + o.settingsRect.h / 2 - 1, 14);
  ctx.textAlign = 'left';
  ctx.fillStyle = pal.ink;
  ctx.font = font(19);
  ctx.fillText('Settings', o.settingsRect.x + 68, o.settingsRect.y + o.settingsRect.h / 2 - 1, o.settingsRect.w - 78);
  drawButton(ctx, pal, o.soundRect, '', { pressed: o.pressed === o.soundRect });
  drawSpeakerGlyph(ctx, o.soundOn ? pal.ink : pal.textDim, o.soundRect.x + 38, o.soundRect.y + o.soundRect.h / 2 - 1, 17, o.soundOn);
  ctx.fillStyle = o.soundOn ? pal.ink : pal.textDim;
  ctx.font = font(19);
  ctx.fillText(o.soundOn ? 'Sound on' : 'Sound off', o.soundRect.x + 68, o.soundRect.y + o.soundRect.h / 2 - 1, o.soundRect.w - 78);

  // shop: crystal glyph + label
  drawButton(ctx, pal, o.shopRect, '', { pressed: o.pressed === o.shopRect });
  drawCrystal(ctx, pal, o.shopRect.x + 40, o.shopRect.y + o.shopRect.h / 2 - 1, 15);
  ctx.fillStyle = pal.ink;
  ctx.font = font(24);
  ctx.textAlign = 'center';
  ctx.fillText('SHOP', o.shopRect.x + o.shopRect.w / 2 + 12, o.shopRect.y + o.shopRect.h / 2 - 1);

  // daily reward chest (top-right): open + pulsing when claimable, closed once claimed
  drawDailyChest(ctx, pal, o.dailyRect, o.daily, o.nowMs, o.pressed === o.dailyRect);

  // wallet footer: stars · gold · crystals (tap → shop)
  drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals, { stars: o.totalStars, pressed: o.pressed === o.walletRect });
  if (o.toast) drawToast(ctx, pal, o.toast);
  ctx.restore();
}

/** Treasure chest button with a "DAY n" tag and the reward on offer underneath. */
function drawDailyChest(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, d: DailyChestOpts, nowMs: number, pressed: boolean): void {
  const anim = motion();
  const hot = d.claimable || d.adChest;
  const bob = hot && anim ? Math.sin(nowMs / 320) * 3 : 0;
  const cx = r.x + r.w / 2;
  if (hot) {
    // gold pulse halo behind the chest
    const pulse = anim ? (Math.sin(nowMs / 300) + 1) / 2 : 0.5;
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.2 * pulse;
    ctx.fillStyle = pal.gold;
    ctx.beginPath();
    ctx.arc(cx, r.y + 58, 46 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (pressed) ctx.translate(0, 3);
  drawTreasureChest(ctx, pal, cx, r.y + 58 + bob, 84, d.claimable);
  if (d.adChest) drawVideoGlyph(ctx, pal, cx + 30, r.y + 26 + bob, 14);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tag: Rect = { x: r.x + 14, y: r.y + r.h - 34, w: r.w - 28, h: 30 };
  drawPill(ctx, tag, hot ? pal.gold : pal.paper, hot ? pal.goldShade : undefined, 2);
  ctx.fillStyle = pal.ink;
  ctx.font = font(15);
  const label = d.adChest ? `+${d.crystals}` : d.claimable ? `DAY ${d.day}` : 'DONE';
  ctx.fillText(label, tag.x + tag.w / 2 + (d.adChest ? 8 : 0), tag.y + tag.h / 2 + 1, tag.w - 8);
  if (d.adChest) drawCrystal(ctx, pal, tag.x + tag.w / 2 - 18, tag.y + tag.h / 2, 8);
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
  walletRect: Rect;
  commanderRect: Rect;
  gold: number;
  crystals: number;
  /** One-line commander summary, or null when no upgrade is owned. */
  commander: string | null;
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

  // fixed header: glass band, back, title, wallet
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: LEVEL_MAP.headerH });
  drawButton(ctx, pal, o.backRect, 'BACK', { fontPx: 24, pressed: o.pressed === o.backRect });
  drawExtrudedText(ctx, 'LEVELS', 290, 50, 40, { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals, { pressed: o.pressed === o.walletRect });
  // commander summary chip (tap → upgrades)
  const cr = o.commanderRect;
  drawButton(ctx, pal, cr, '', { fontPx: 18, pressed: o.pressed === cr, flat: true });
  drawUpgradeGlyph(ctx, pal, cr.x + 30, cr.y + (cr.h - 4) / 2, 17, 'production');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(18);
  ctx.fillText('COMMANDER', cr.x + 58, cr.y + (cr.h - 4) / 2 + 1);
  ctx.fillStyle = o.commander ? pal.ink : pal.textDim;
  ctx.font = font(17, '500');
  ctx.fillText(o.commander ?? 'No upgrades yet · tap to train', cr.x + 190, cr.y + (cr.h - 4) / 2 + 1, cr.w - 204);
  ctx.restore();
}

/* ---------- Settings (M3-3) ---------- */

export interface SettingsOpts {
  soundOn: boolean;
  colorBlind: boolean;
  reducedMotion: MotionPref;
  sendRatio: number;
  /** Reset-progress confirm card is open. */
  confirming: boolean;
  totalStars: number;
  coins: number;
  nowMs: number;
  pressed?: Rect | null;
}

export const MOTION_SEGMENTS: readonly { label: string; value: MotionPref }[] = [
  { label: 'AUTO', value: 'auto' },
  { label: 'ON', value: 'on' },
  { label: 'OFF', value: 'off' },
];
export const RATIO_SEGMENTS: readonly { label: string; value: number }[] = [
  { label: '100%', value: 1 },
  { label: '50%', value: 0.5 },
];

function settingsRow(ctx: CanvasRenderingContext2D, pal: Palette, control: Rect, title: string, sub: string): void {
  const cy = control.y + (control.h - 4) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(26);
  ctx.fillText(title, SETTINGS.labelX, cy - 12, control.x - SETTINGS.labelX - 16);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(17, '500');
  ctx.fillText(sub, SETTINGS.labelX, cy + 16, control.x - SETTINGS.labelX - 16);
  // hairline separator under the row
  ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
  ctx.fillRect(SETTINGS.card.x + 28, control.y + SETTINGS.rowH - 22, SETTINGS.card.w - 56, 2);
}

export function drawSettings(view: View, pal: Palette, o: SettingsOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, 0);
  const card = SETTINGS.card;
  drawCard(ctx, pal, card);
  // rows
  settingsRow(ctx, pal, SETTINGS.sound, 'Sound', 'Synth effects and jingles');
  drawToggle(ctx, pal, SETTINGS.sound, o.soundOn, o.pressed === SETTINGS.sound);
  settingsRow(ctx, pal, SETTINGS.colorBlind, 'Colour-blind', 'Distinct owner colours');
  ctx.font = font(26);
  paletteGlyph(ctx, pal, SETTINGS.labelX + ctx.measureText('Colour-blind').width + 40, SETTINGS.colorBlind.y + (SETTINGS.colorBlind.h - 4) / 2 - 13, 15);
  drawToggle(ctx, pal, SETTINGS.colorBlind, o.colorBlind, o.pressed === SETTINGS.colorBlind);
  settingsRow(ctx, pal, SETTINGS.motion, 'Reduced motion', 'Auto follows the system setting');
  drawSegmented(ctx, pal, SETTINGS.motion, MOTION_SEGMENTS, MOTION_SEGMENTS.findIndex((m) => m.value === o.reducedMotion), 20);
  settingsRow(ctx, pal, SETTINGS.sendRatio, 'Default send', 'Share of a garrison per tap');
  drawSegmented(ctx, pal, SETTINGS.sendRatio, RATIO_SEGMENTS, RATIO_SEGMENTS.findIndex((r) => r.value === o.sendRatio), 20);
  // progress summary + reset
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.font = font(20, '500');
  const summary = `${o.totalStars} stars  ·  ${o.coins} coins`;
  ctx.fillText(summary, 360 + 12, SETTINGS.reset.y - 44);
  const sw = ctx.measureText(summary).width;
  drawStars(ctx, pal, 360 + 12 - sw / 2 - 22, SETTINGS.reset.y - 44, 1, 10, [1, 0, 0]);
  drawCoin(ctx, pal, 360 + 12 + sw / 2 + 22, SETTINGS.reset.y - 44, 11);
  drawButton(ctx, pal, SETTINGS.reset, 'RESET PROGRESS', { fontPx: 24, border: pal.owners.enemy1, text: pal.owners.enemy1, pressed: o.pressed === SETTINGS.reset });

  // header
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: SETTINGS.headerH });
  drawButton(ctx, pal, SETTINGS.back, 'BACK', { fontPx: 24, pressed: o.pressed === SETTINGS.back });
  drawExtrudedText(ctx, 'SETTINGS', 360, 50, 40, { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });

  if (o.confirming) {
    ctx.fillStyle = 'rgba(26, 58, 90, 0.5)';
    ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
    const c = SETTINGS.confirm;
    drawCard(ctx, pal, c.card);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.ink;
    ctx.font = font(34);
    ctx.fillText('Reset progress?', 360, c.card.y + 62);
    ctx.fillStyle = pal.textDim;
    ctx.font = font(21, '500');
    ctx.fillText('All stars and coins will be lost.', 360, c.card.y + 116);
    ctx.fillText('Settings are kept.', 360, c.card.y + 146);
    drawButton(ctx, pal, c.yes, 'RESET', { fill: pal.owners.enemy1, fontPx: 26, pressed: o.pressed === c.yes });
    drawButton(ctx, pal, c.no, 'CANCEL', { fontPx: 26, pressed: o.pressed === c.no });
  }
  ctx.restore();
}

/* ---------- Shop (ECONOMY.md §4, Phase A) ---------- */

export interface ShopPackCard {
  id: string;
  rect: Rect;
  crystals: number;
  bonusPct: number;
  price: string;
  /** Cluster size 1..5. */
  count: number;
}

export interface ShopBundleCard {
  id: string;
  rect: Rect;
  title: string;
  lines: string[];
  price: string;
  owned: boolean;
  glyph: 'chest' | 'noads' | 'crown';
}

export interface ShopSkinCard {
  id: string;
  rect: Rect;
  label: string;
  /** Sprite skin id for `drawSkinPreview`. */
  spriteId: string;
  /** 0 = pack exclusive. */
  cost: number;
  owned: boolean;
  equipped: boolean;
  /** Exclusive to a pack the player does not own. */
  locked: boolean;
}

export interface ShopUpgradeCard {
  id: string;
  rect: Rect;
  label: string;
  glyph: UpgradeKind;
  tier: number;
  maxTier: number;
  /** Gold for the next tier, null when maxed. */
  cost: number | null;
  effectNow: string;
  effectNext: string;
  affordable: boolean;
}

export interface ShopOpts {
  tab: ShopTab;
  tabsRect: Rect;
  backRect: Rect;
  walletRect: Rect;
  scroll: number;
  gold: number;
  crystals: number;
  packs: ShopPackCard[];
  bundles: ShopBundleCard[];
  skinHeaders: { label: string; y: number }[];
  skins: ShopSkinCard[];
  upgrades: ShopUpgradeCard[];
  /** Restore-purchases button (content space), on the store tabs. */
  restoreRect: Rect | null;
  storeAvailable: boolean;
  /** Card / button id with the spinner (purchase in flight). */
  pending: string | null;
  /** Rect (content space) held down. */
  pressed: Rect | null;
  nowMs: number;
  toast?: ToastOpts | null;
  /** Painted after the content in logical space (coin / crystal bursts). */
  particles?: { draw(ctx: CanvasRenderingContext2D, nowMs: number): void };
}

const TAB_LABELS: Record<ShopTab, string> = { crystals: 'CRYSTALS', bundles: 'BUNDLES', skins: 'SKINS', upgrades: 'UPGRADES' };

/** Price / action button: label with an optional currency glyph; spinner when pending. */
function drawBuyButton(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: Rect,
  label: string,
  o: { glyph?: 'gold' | 'crystal'; fill?: string; disabled?: boolean; pressed?: boolean; pending?: boolean; fontPx?: number; nowMs?: number },
): void {
  drawButton(ctx, pal, r, '', { fill: o.fill, disabled: o.disabled, pressed: o.pressed, fontPx: o.fontPx, flat: true });
  const cy = r.y + (r.h - 4) / 2 + (o.pressed ? 3 : 0);
  const onColour = o.fill !== undefined && !o.disabled;
  const text = o.disabled ? pal.textDim : onColour ? pal.paper : pal.ink;
  if (o.pending) {
    drawSpinner(ctx, text, r.x + r.w / 2, cy, Math.min(12, r.h * 0.25), o.nowMs ?? 0);
    return;
  }
  ctx.font = font(o.fontPx ?? 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  const glyphR = o.glyph ? Math.min(11, r.h * 0.2) : 0;
  const total = tw + (o.glyph ? glyphR * 2 + 8 : 0);
  const x0 = r.x + r.w / 2 - total / 2;
  if (o.glyph === 'gold') drawGoldCoin(ctx, pal, x0 + glyphR, cy, glyphR);
  else if (o.glyph === 'crystal') drawCrystal(ctx, pal, x0 + glyphR, cy, glyphR * 1.05);
  ctx.fillStyle = text;
  ctx.font = font(o.fontPx ?? 22);
  ctx.textAlign = 'left';
  ctx.fillText(label, x0 + (o.glyph ? glyphR * 2 + 8 : 0), cy + 1, r.w - 16);
}

function drawPackCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopPackCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  drawCrystalCluster(ctx, pal, r.x + r.w / 2, r.y + 78, 96, c.count);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(34);
  ctx.fillText(formatAmount(c.crystals), r.x + r.w / 2 + 10, r.y + 154);
  drawCrystal(ctx, pal, r.x + r.w / 2 - ctx.measureText(formatAmount(c.crystals)).width / 2 - 10, r.y + 154, 13);
  if (c.bonusPct > 0) {
    // bonus ribbon, top-right corner
    const label = `+${Math.round(c.bonusPct * 100)}%`;
    ctx.font = font(16);
    const w = ctx.measureText(label).width + 22;
    const tag: Rect = { x: r.x + r.w - w - 12, y: r.y + 12, w, h: 30 };
    drawPill(ctx, tag, pal.owners.enemy2, shade(pal.owners.enemy2, -0.35), 2);
    ctx.fillStyle = pal.paper;
    ctx.fillText(label, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  }
  const buy = shopBuyRect(r);
  drawBuyButton(ctx, pal, buy, c.price, {
    fill: pal.owners.player,
    disabled: !o.storeAvailable,
    pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
    pending: o.pending === c.id,
    fontPx: 24,
    nowMs: o.nowMs,
  });
}

/** Pressed rects are rebuilt every frame by the shop screen, so compare by value. */
function rectEq(a: Rect | null, b: Rect): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function bundleGlyph(ctx: CanvasRenderingContext2D, pal: Palette, kind: ShopBundleCard['glyph'], x: number, y: number): void {
  if (kind === 'chest') drawTreasureChest(ctx, pal, x, y + 4, 92, true);
  else if (kind === 'noads') drawNoAdsBadge(ctx, pal, x, y, 40);
  else drawCrownBadge(ctx, pal, x, y, 40);
}

function drawBundleCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopBundleCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  bundleGlyph(ctx, pal, c.glyph, r.x + 70, r.y + r.h / 2 - 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(26);
  const textX = r.x + 136;
  const textW = r.w - 136 - SHOP.buyW - 40;
  ctx.fillText(c.title, textX, r.y + 40, textW);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(17, '500');
  c.lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, textX, r.y + 72 + i * 24, textW));
  const buy = shopRowBuyRect(r);
  if (c.owned) {
    drawBuyButton(ctx, pal, buy, 'OWNED', { fill: pal.owners.enemy2, fontPx: 22 });
  } else {
    drawBuyButton(ctx, pal, buy, c.price, {
      fill: pal.owners.player,
      disabled: !o.storeAvailable,
      pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
      pending: o.pending === c.id,
      fontPx: 24,
      nowMs: o.nowMs,
    });
  }
}

function drawSkinCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopSkinCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 20, edge: 5 });
  if (c.equipped) {
    ctx.save();
    roundRect(ctx, { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 12 }, 18);
    ctx.strokeStyle = pal.selection;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  roundRect(ctx, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 14 }, 18);
  ctx.clip();
  drawSkinPreview(ctx, pal, r.x + r.w / 2, r.y + 68, 110, c.spriteId);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(19);
  ctx.fillText(c.label, r.x + r.w / 2, r.y + 142, r.w - 20);
  const buy = shopBuyRect(r, r.w - 36, 54);
  const pressed = rectEq(o.pressed, buy) || rectEq(o.pressed, r);
  if (c.equipped) drawBuyButton(ctx, pal, buy, 'EQUIPPED', { fill: pal.owners.enemy2, pressed, fontPx: 18 });
  else if (c.owned) drawBuyButton(ctx, pal, buy, 'EQUIP', { pressed, fontPx: 20 });
  else if (c.locked) {
    drawBuyButton(ctx, pal, buy, 'PACK ONLY', { disabled: true, fontPx: 17 });
  } else {
    drawBuyButton(ctx, pal, buy, String(c.cost), { glyph: 'crystal', fill: pal.owners.player, disabled: o.crystals < c.cost, pressed, fontPx: 22 });
  }
}

/** Five tier pips: filled up to `tier`. */
function drawTierPips(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, tier: number, max: number): void {
  for (let i = 0; i < max; i++) {
    const px = x + i * 24;
    const on = i < tier;
    ctx.fillStyle = on ? shade(pal.gold, -0.35) : shade(pal.panelBorder, -0.1);
    ctx.beginPath();
    ctx.arc(px + 1, y + 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? pal.gold : pal.paper;
    ctx.beginPath();
    ctx.arc(px, y, 8, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(px - 2.5, y - 2.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawUpgradeCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopUpgradeCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  drawUpgradeGlyph(ctx, pal, r.x + 66, r.y + r.h / 2 - 2, 42, c.glyph);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(25);
  const textX = r.x + 130;
  const textW = r.w - 130 - SHOP.buyW - 36;
  ctx.fillText(c.label, textX, r.y + 36, textW);
  drawTierPips(ctx, pal, textX + 10, r.y + 70, c.tier, c.maxTier);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(16, '500');
  ctx.fillText(`Tier ${c.tier}/${c.maxTier}`, textX + c.maxTier * 24 + 8, r.y + 70, 90);
  ctx.fillStyle = pal.ink;
  ctx.font = font(18, '500');
  ctx.fillText(c.tier > 0 ? `Now ${c.effectNow}` : 'Not trained yet', textX, r.y + 104, textW);
  ctx.fillStyle = c.cost === null ? pal.textDim : shade(pal.owners.enemy2, -0.25);
  ctx.font = font(17, '500');
  ctx.fillText(c.cost === null ? 'Fully trained' : `Next ${c.effectNext}`, textX, r.y + 132, textW);
  const buy = shopRowBuyRect(r);
  const pressed = rectEq(o.pressed, buy) || rectEq(o.pressed, r);
  if (c.cost === null) drawBuyButton(ctx, pal, buy, 'MAX', { fill: pal.owners.enemy2, fontPx: 22 });
  else drawBuyButton(ctx, pal, buy, String(c.cost), { glyph: 'gold', fill: pal.owners.player, disabled: !c.affordable, pressed, fontPx: 24 });
}

export function drawShop(view: View, pal: Palette, o: ShopOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, o.scroll * 0.4);

  // scrolled content, clipped under the tab row
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SHOP.contentTop, C.MAP_W, SHOP.contentBottom - SHOP.contentTop);
  ctx.clip();
  ctx.translate(0, -o.scroll);
  for (const c of o.packs) drawPackCard(ctx, pal, c, o);
  for (const c of o.bundles) drawBundleCard(ctx, pal, c, o);
  for (const h of o.skinHeaders) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(22);
    const w = ctx.measureText(h.label).width + 40;
    const pill: Rect = { x: SHOP.skin.x0, y: h.y, w, h: 36 };
    drawPill(ctx, pill, pal.paper);
    ctx.fillStyle = pal.ink;
    ctx.fillText(h.label, pill.x + 20, pill.y + pill.h / 2 + 1);
  }
  for (const c of o.skins) drawSkinCard(ctx, pal, c, o);
  for (const c of o.upgrades) drawUpgradeCard(ctx, pal, c, o);
  if (o.restoreRect) {
    const rr = o.restoreRect;
    drawButton(ctx, pal, rr, o.pending === 'restore' ? '' : 'RESTORE PURCHASES', { fontPx: 20, flat: true, pressed: rectEq(o.pressed, rr), disabled: !o.storeAvailable });
    if (o.pending === 'restore') drawSpinner(ctx, pal.ink, rr.x + rr.w / 2, rr.y + (rr.h - 4) / 2, 11, o.nowMs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.textDim;
    ctx.font = font(15, '500');
    ctx.fillText(
      o.storeAvailable ? 'Test store: purchases are free and local to this device.' : 'Store unavailable on this platform.',
      360,
      rr.y + rr.h + 22,
      640,
    );
  }
  if (o.tab === 'upgrades') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.textDim;
    ctx.font = font(15, '500');
    const last = o.upgrades[o.upgrades.length - 1];
    if (last) ctx.fillText('Permanent bonuses for your towers and soldiers · paid with gold', 360, last.rect.y + last.rect.h + 26, 640);
  }
  o.particles?.draw(ctx, o.nowMs);
  ctx.restore();

  // fixed chrome: header + tabs
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: SHOP.tabs.y + SHOP.tabs.h + 12 });
  drawButton(ctx, pal, o.backRect, 'BACK', { fontPx: 24, pressed: o.pressed === o.backRect });
  drawExtrudedText(ctx, 'SHOP', 280, 50, 40, { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals);
  drawSegmented(ctx, pal, o.tabsRect, SHOP_TABS.map((t) => ({ label: TAB_LABELS[t], value: t })), SHOP_TABS.indexOf(o.tab), 19);
  if (o.toast) drawToast(ctx, pal, { ...o.toast, y: o.toast.y ?? 1210 });
  ctx.restore();
}
