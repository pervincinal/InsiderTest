import { C } from '../sim/constants';
import type { Owner } from '../sim/types';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import type { Rect } from './widgets';
import { drawButton, drawCard, drawExtrudedText, drawGlassBand, fitFontPx, font, roundRect, wrapText } from './widgets';
import { badgeY, drawBadge, drawSwordsPip, drawTowerShadow, drawTowerSprite } from './sprites';
import { HOWTO, howtoIconRect, howtoRowRect } from './menuLayout';
import { beginFrame, drawWater } from './menus';
import type { TranslationKey } from '../ui/i18n';
import { t } from '../ui/i18n';

/*
 * "How to play" card drawing (FE-3). Loaded lazily with `HowToScreen` (PERF-1); the hit rectangles
 * are `HOWTO` in menuLayout.ts. Five rows: an icon drawn with the game's own sprite / primitive
 * helpers (mini towers at `ICON_SCALE`, straight ribbons like draw.ts drawLinks, a wall block) and
 * one sentence wrapped into the text column. Reads its options only.
 */

export interface HowToOpts {
  nowMs: number;
  pressed?: Rect | null;
}

/** Translation keys of the five rules, in row order. */
export const HOWTO_KEYS: readonly TranslationKey[] = ['howto.1', 'howto.2', 'howto.3', 'howto.4', 'howto.5'];

/**
 * Mini towers are the real sprites under a uniform scale; one scale for every icon so the sprite
 * cache (keyed by the transform's scale) is not cleared between icons of the same frame.
 */
const ICON_SCALE = 0.5;

function miniTower(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, owner: Owner, level: number, nowMs: number, badge?: string, underFire?: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(ICON_SCALE, ICON_SCALE);
  drawTowerShadow(ctx, pal, 0, 0, 'barracks', level);
  drawTowerSprite(ctx, pal, { x: 0, y: 0, owner, kind: 'barracks', level }, { nowMs, motion: false });
  if (badge !== undefined) {
    const style = underFire ? { underFire, scale: 1.15 } : { scale: 1.15 };
    drawBadge(ctx, pal, 0, badgeY('barracks', level), badge, false, style);
  }
  ctx.restore();
}

/** Straight stream ribbon (draw.ts drawLinks look): ink-outlined owner body, paper chevrons, arrowhead at (x1, y1). */
function ribbon(ctx: CanvasRenderingContext2D, pal: Palette, x0: number, y0: number, x1: number, y1: number, owner: Owner): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 4) return;
  const dx = (x1 - x0) / len;
  const dy = (y1 - y0) / len;
  const nx = -dy;
  const ny = dx;
  const mine = owner === 'player';
  const tones = pal.ownerTones[owner];
  const body = mine ? tones.lit : tones.mid;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = (): void => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1 - dx * 8, y1 - dy * 8);
  };
  trace();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 8;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  trace();
  ctx.strokeStyle = body;
  ctx.lineWidth = 6;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  // chevrons
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = pal.paper;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let s = 9; s < len - 14; s += 9) {
    const px = x0 + dx * s;
    const py = y0 + dy * s;
    ctx.moveTo(px - dx * 2.2 + nx * 2.4, py - dy * 2.2 + ny * 2.4);
    ctx.lineTo(px + dx * 1.8, py + dy * 1.8);
    ctx.lineTo(px - dx * 2.2 - nx * 2.4, py - dy * 2.2 - ny * 2.4);
  }
  ctx.stroke();
  // arrowhead
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - dx * 12 + nx * 7, y1 - dy * 12 + ny * 7);
  ctx.lineTo(x1 - dx * 9, y1 - dy * 9);
  ctx.lineTo(x1 - dx * 12 - nx * 7, y1 - dy * 12 - ny * 7);
  ctx.closePath();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();
}

/** Thin guide line between two towers (the reachable-set line of rules v3, owner colour at 45 %). */
function guideLine(ctx: CanvasRenderingContext2D, pal: Palette, x0: number, y0: number, x1: number, y1: number, blocked = false): void {
  ctx.save();
  ctx.strokeStyle = blocked ? pal.owners.enemy1 : pal.owners.player;
  ctx.globalAlpha = blocked ? 0.55 : 0.5;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  if (blocked) ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}

/** Short stone wall with battlement caps (terrain.ts drawWall look, horizontal). */
function wallBlock(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, w: number): void {
  const h = 14;
  ctx.save();
  ctx.fillStyle = pal.stoneDark;
  roundRect(ctx, { x, y: y - h / 2 + 4, w, h }, 4);
  ctx.fill();
  ctx.fillStyle = pal.stone;
  roundRect(ctx, { x, y: y - h / 2, w, h }, 4);
  ctx.fill();
  ctx.fillStyle = pal.stoneLight;
  for (let cx = x + 3; cx < x + w - 6; cx += 10) ctx.fillRect(cx, y - h / 2 - 5, 6, 6);
  ctx.strokeStyle = pal.ink;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  roundRect(ctx, { x, y: y - h / 2, w, h }, 4);
  ctx.stroke();
  ctx.restore();
}

/** Red "×" (blocked line / cancelled units). */
function crossMark(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s, y + s);
  ctx.stroke();
  ctx.restore();
}

/** Clash puff where two equal streams meet: a paper burst with an ink outline. */
function clashPuff(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 === 0 ? r : r * 0.55;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  crossMark(ctx, pal.owners.enemy1, x, y, r * 0.3);
}

/* ---------- the five icons ---------- */

/** 1. Line of sight: a clear straight line to one tower; a wall blocks the line to another. */
function iconLine(ctx: CanvasRenderingContext2D, pal: Palette, b: Rect, nowMs: number): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const home = { x: cx - 36, y: cy + 44 };
  const clear = { x: cx + 36, y: cy - 14 };
  const behind = { x: cx + 30, y: cy + 50 };
  guideLine(ctx, pal, home.x, home.y - 10, clear.x, clear.y - 10);
  guideLine(ctx, pal, home.x, home.y - 6, cx + 2, behind.y - 8, true);
  crossMark(ctx, pal.owners.enemy1, cx - 4, behind.y - 18, 5);
  miniTower(ctx, pal, clear.x, clear.y, 'neutral', 1, nowMs);
  wallBlock(ctx, pal, cx - 2, cy + 36, 30);
  miniTower(ctx, pal, behind.x, behind.y, 'enemy1', 1, nowMs);
  miniTower(ctx, pal, home.x, home.y, 'player', 1, nowMs);
}

/** 2. A stream carries production: the streaming tower keeps its number. */
function iconKeep(ctx: CanvasRenderingContext2D, pal: Palette, b: Rect, nowMs: number): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const home = { x: cx - 32, y: cy + 40 };
  ribbon(ctx, pal, home.x + 16, home.y - 8, cx + 54, cy + 4, 'player');
  miniTower(ctx, pal, home.x, home.y, 'player', 1, nowMs, '25');
  // the "growth paused, number kept" ring of a streaming source (draw.ts)
  ctx.save();
  ctx.strokeStyle = pal.owners.player;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(home.x, home.y + 4, 24, 10, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 3. Level up: L1 / L2 / L3 side by side, with 1 / 2 / 3 stream arrows under them. */
function iconLevels(ctx: CanvasRenderingContext2D, pal: Palette, b: Rect, nowMs: number): void {
  const cx = b.x + b.w / 2;
  const base = b.y + b.h - 26;
  const xs = [cx - 40, cx, cx + 40];
  xs.forEach((x, i) => miniTower(ctx, pal, x, base, 'player', i + 1, nowMs));
  ctx.save();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  xs.forEach((x, i) => {
    const n = i + 1;
    for (let k = 0; k < n; k++) {
      const ax = x + (k - (n - 1) / 2) * 9;
      const ay = base + 12;
      ctx.beginPath();
      ctx.moveTo(ax - 3, ay);
      ctx.lineTo(ax, ay + 5);
      ctx.lineTo(ax + 3, ay);
      ctx.stroke();
    }
  });
  ctx.restore();
}

/** 4. Equal streams cancel: head-to-head on one lane; a second lane from another side lands. */
function iconCancel(ctx: CanvasRenderingContext2D, pal: Palette, b: Rect, nowMs: number): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const left = { x: cx - 42, y: cy + 46 };
  const right = { x: cx + 42, y: cy + 46 };
  const top = { x: cx + 6, y: cy - 22 };
  const laneY = cy + 38;
  ribbon(ctx, pal, left.x + 14, laneY, cx - 10, laneY, 'player');
  ribbon(ctx, pal, right.x - 14, laneY, cx + 10, laneY, 'enemy1');
  ribbon(ctx, pal, top.x + 2, top.y + 8, right.x - 6, right.y - 30, 'player');
  clashPuff(ctx, pal, cx, laneY, 12);
  miniTower(ctx, pal, top.x, top.y, 'player', 1, nowMs);
  miniTower(ctx, pal, left.x, left.y, 'player', 1, nowMs);
  miniTower(ctx, pal, right.x, right.y, 'enemy1', 1, nowMs);
}

/** 5. Under fire: an enemy (red) stream lands on the tower; its badge shows the crossed swords. */
function iconFire(ctx: CanvasRenderingContext2D, pal: Palette, b: Rect, nowMs: number): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const home = { x: cx - 18, y: cy + 44 };
  ribbon(ctx, pal, cx + 52, cy - 34, home.x + 14, home.y - 10, 'enemy1');
  miniTower(ctx, pal, home.x, home.y, 'player', 1, nowMs, '12', pal.owners.enemy1);
  drawSwordsPip(ctx, cx + 30, cy + 30, 7, pal.owners.enemy1, pal.ink);
}

const ICONS: readonly ((ctx: CanvasRenderingContext2D, pal: Palette, b: Rect, nowMs: number) => void)[] = [iconLine, iconKeep, iconLevels, iconCancel, iconFire];

export function drawHowTo(view: View, pal: Palette, o: HowToOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, 0);
  drawCard(ctx, pal, HOWTO.card);
  for (let i = 0; i < HOWTO.rows; i++) {
    const row = howtoRowRect(i);
    const box = howtoIconRect(i);
    // icon plate
    ctx.fillStyle = shade(pal.panel, -0.06);
    roundRect(ctx, box, 22);
    ctx.fill();
    ctx.save();
    roundRect(ctx, box, 22);
    ctx.clip();
    ICONS[i]?.(ctx, pal, box, o.nowMs);
    ctx.restore();
    // number pip on the plate
    ctx.fillStyle = pal.owners.player;
    ctx.beginPath();
    ctx.arc(box.x + 16, box.y + 16, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.paper;
    ctx.font = font(17, '900');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), box.x + 16, box.y + 17);
    // sentence, wrapped and vertically centred in the row
    ctx.fillStyle = pal.ink;
    ctx.font = font(HOWTO.textPx, '500');
    ctx.textAlign = 'left';
    const lines = wrapText(ctx, t(HOWTO_KEYS[i]!), HOWTO.text.w, HOWTO.maxLines);
    const y0 = row.y + row.h / 2 - ((lines.length - 1) * HOWTO.lineH) / 2;
    lines.forEach((line, k) => ctx.fillText(line, HOWTO.text.x, y0 + k * HOWTO.lineH, HOWTO.text.w));
    if (i < HOWTO.rows - 1) {
      ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
      ctx.fillRect(row.x, row.y + row.h - 1, row.w, 2);
    }
  }
  drawButton(ctx, pal, HOWTO.close, t('howto.close'), { fill: pal.owners.player, fontPx: 26, pressed: o.pressed === HOWTO.close });

  // header
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: HOWTO.headerH });
  drawButton(ctx, pal, HOWTO.back, t('common.back'), { fontPx: 24, pressed: o.pressed === HOWTO.back });
  const title = t('howto.title');
  drawExtrudedText(ctx, title, 360, 50, fitFontPx(ctx, title, 40, 380), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  ctx.restore();
}
