import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import type { Rect } from './widgets';
import { drawButton, drawExtrudedText, drawFlag, drawGlassBand, drawLock, drawPill, drawStars, fitFontPx, font, withShadow } from './widgets';
import { LEVEL_MAP, levelNodeCentre, levelNodeRect } from './layout';
import { drawWallet } from './economyWidgets';
import { drawUpgradeGlyph } from './sprites';
import { beginFrame, drawWater, motion } from './menus';
import { t } from '../ui/i18n';

/*
 * Level select drawing: a long clay island with a winding cream path and round level nodes that
 * scroll under a glass header. Loaded lazily with `LevelSelectScreen` (PERF-1).
 */

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
  drawButton(ctx, pal, o.backRect, t('common.back'), { fontPx: 24, pressed: o.pressed === o.backRect });
  const title = t('levels.title');
  drawExtrudedText(ctx, title, 290, 50, fitFontPx(ctx, title, 40, 220), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals, { pressed: o.pressed === o.walletRect });
  // commander summary chip (tap → upgrades)
  const cr = o.commanderRect;
  drawButton(ctx, pal, cr, '', { fontPx: 18, pressed: o.pressed === cr, flat: true });
  drawUpgradeGlyph(ctx, pal, cr.x + 30, cr.y + (cr.h - 4) / 2, 17, 'production');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(18);
  ctx.fillText(t('levels.commander'), cr.x + 58, cr.y + (cr.h - 4) / 2 + 1);
  ctx.fillStyle = o.commander ? pal.ink : pal.textDim;
  ctx.font = font(17, '500');
  ctx.fillText(o.commander ?? t('levels.noUpgrades'), cr.x + 190, cr.y + (cr.h - 4) / 2 + 1, cr.w - 204);
  ctx.restore();
}
