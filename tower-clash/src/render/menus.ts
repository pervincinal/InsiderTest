import type { Owner, Road, TowerKind } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyDeviceTransform, applyTransform, clipToMap } from './view';
import type { Rect } from './widgets';
import { drawButton, drawCoin, drawLock, drawPill, drawStars, font, outlinedText, roundRect, wrapText } from './widgets';
import type { TerrainSpec } from './terrain';
import { drawTerrain } from './terrain';
import { badgeY, drawBadge, drawRoofIcon, drawTowerShadow, drawTowerSprite, drawUnitSprite } from './sprites';
import { roadPoseAt } from './draw';
import { prefersReducedMotion } from './particles';

/*
 * Title and level-select visuals: the same grass-over-water ground as the game, three demo towers
 * with columns of soldiers marching between them, and toy-style cards. Hit rectangles stay owned
 * by src/ui/screens.ts and are passed in.
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
  drawTerrain(ctx, view, pal, DEMO_TERRAIN);
  return ctx;
}

function drawDemoWorld(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number, withBadges: boolean): void {
  const anim = motion();
  for (const t of DEMO_TOWERS) drawTowerShadow(ctx, pal, t.x, t.y, t.kind);
  // soldiers
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

/* ---------- Title ---------- */

export interface TitleOpts {
  playRect: Rect;
  cbRect: Rect;
  colorBlind: boolean;
  totalStars: number;
  coins: number;
  nowMs: number;
}

export function drawTitle(view: View, pal: Palette, o: TitleOpts): void {
  const ctx = beginFrame(view, pal);
  drawDemoWorld(ctx, pal, o.nowMs, true);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bob = motion() ? Math.sin(o.nowMs / 700) * 4 : 0;
  outlinedText(ctx, 'TOWER', 360, 380 + bob, '#ffffff', 96, pal.text);
  outlinedText(ctx, 'CLASH', 360, 472 + bob, pal.selection, 96, pal.text);
  const sub: Rect = { x: 210, y: 524, w: 300, h: 44 };
  drawPill(ctx, sub, 'rgba(255,255,255,0.9)', pal.panelBorder);
  ctx.fillStyle = pal.text;
  ctx.font = font(22);
  ctx.fillText('Capture every tower', 360, 547);

  drawButton(ctx, pal, o.playRect, 'PLAY', { fill: pal.owners.player, fontPx: 42 });
  drawButton(ctx, pal, o.cbRect, `Colour-blind palette: ${o.colorBlind ? 'ON' : 'OFF'}`, {
    fontPx: 22,
    border: o.colorBlind ? pal.accent : undefined,
  });

  const foot: Rect = { x: 220, y: 1178, w: 280, h: 44 };
  drawPill(ctx, foot, 'rgba(255,255,255,0.9)', pal.panelBorder);
  ctx.fillStyle = pal.text;
  ctx.font = font(20);
  ctx.fillText(`${o.totalStars} ★ · ${o.coins} coins`, 360, 1201);
  ctx.restore();
}

/* ---------- Level select ---------- */

export interface LevelCard {
  rect: Rect;
  id: number;
  name: string;
  stars: number;
  unlocked: boolean;
}

export interface LevelSelectOpts {
  cards: LevelCard[];
  scroll: number;
  backRect: Rect;
  coins: number;
  nowMs: number;
  /** Height of the fixed header band (cards scroll under it). */
  headerH: number;
}

function drawCardTile(ctx: CanvasRenderingContext2D, pal: Palette, card: LevelCard): void {
  const r = card.rect;
  const roof = !card.unlocked ? pal.owners.neutral : card.stars > 0 ? pal.owners.player : pal.star;
  drawButton(ctx, pal, r, '', card.unlocked ? {} : { fill: '#e6eaf0', edge: '#c3cbd7' });
  ctx.save();
  // roof-coloured top band
  ctx.save();
  roundRect(ctx, { x: r.x, y: r.y, w: r.w, h: r.h - 6 }, 18);
  ctx.clip();
  ctx.fillStyle = roof;
  ctx.fillRect(r.x, r.y, r.w, 64);
  ctx.fillStyle = shade(roof, -0.25);
  ctx.fillRect(r.x, r.y + 58, r.w, 6);
  ctx.restore();
  drawRoofIcon(ctx, pal, roof, r.x + 30, r.y + 36, 26);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  outlinedText(ctx, String(card.id), r.x + r.w / 2 + 12, r.y + 33, '#ffffff', 40, shade(roof, -0.5));
  if (!card.unlocked) {
    drawLock(ctx, pal.textDim, r.x + r.w / 2, r.y + 130, 40);
    ctx.restore();
    return;
  }
  ctx.fillStyle = pal.text;
  ctx.font = font(19);
  const lines = wrapText(ctx, card.name, r.w - 24, 2);
  lines.forEach((l, i) => ctx.fillText(l, r.x + r.w / 2, r.y + 96 + i * 24 - (lines.length - 1) * 10));
  drawStars(ctx, pal, r.x + r.w / 2, r.y + 160, card.stars, 14);
  ctx.restore();
}

export function drawLevelSelect(view: View, pal: Palette, o: LevelSelectOpts): void {
  const ctx = beginFrame(view, pal); // ground only: towers behind a grid of tiles just add noise

  ctx.save();
  ctx.translate(0, -o.scroll);
  for (const card of o.cards) drawCardTile(ctx, pal, card);
  ctx.restore();

  // header band (on top of cards when scrolled): water-coloured so the cards slide under it
  ctx.fillStyle = pal.background;
  ctx.fillRect(0, 0, C.MAP_W, o.headerH);
  ctx.fillStyle = shade(pal.background, -0.15);
  ctx.fillRect(0, o.headerH - 5, C.MAP_W, 5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  outlinedText(ctx, 'SELECT LEVEL', 360, 130, '#ffffff', 52, pal.text);
  drawButton(ctx, pal, o.backRect, 'BACK', { fontPx: 24 });
  // coin total, top-right (opposite BACK)
  ctx.font = font(26);
  const coins = String(o.coins);
  const w = ctx.measureText(coins).width + 66;
  drawPill(ctx, { x: 702 - w, y: 24, w, h: 48 }, 'rgba(255,255,255,0.9)', pal.panelBorder);
  ctx.textAlign = 'right';
  ctx.fillStyle = pal.text;
  ctx.fillText(coins, 690, 49);
  drawCoin(ctx, pal, 702 - w + 24, 48, 14);
  ctx.restore();
}
