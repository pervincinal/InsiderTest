import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import type { Rect } from './widgets';
import { drawButton, drawCard, drawExtrudedText, drawGlassBand, drawPill, drawRoundButton, drawTrophyGlyph, fitFontPx, font, roundRect } from './widgets';
import { ACHIEVEMENTS_LAYOUT } from './layout';
import type { ToastOpts } from './economyWidgets';
import { drawToast } from './economyWidgets';
import { drawCrystal } from './sprites';
import { beginFrame, drawWater } from './menus';
import { t } from '../ui/i18n';

/*
 * Achievements screen drawing (ECONOMY.md §2.1). Loaded lazily with `AchievementsScreen` (PERF-1).
 */

export interface AchievementRow {
  id: string;
  /** Content-space rect. */
  rect: Rect;
  label: string;
  current: number;
  target: number;
  crystals: number;
  unlocked: boolean;
}

export interface AchievementsOpts {
  rows: AchievementRow[];
  unlockedCount: number;
  total: number;
  crystalsEarned: number;
  scroll: number;
  backRect: Rect;
  nowMs: number;
  pressed?: Rect | null;
  toast?: ToastOpts | null;
}

function checkGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, s * 0.35);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, cy);
  ctx.lineTo(cx - s * 0.15, cy + s * 0.45);
  ctx.lineTo(cx + s * 0.65, cy - s * 0.5);
  ctx.stroke();
}

function drawAchievementRow(ctx: CanvasRenderingContext2D, pal: Palette, a: AchievementRow): void {
  const r = a.rect;
  drawCard(ctx, pal, r, { radius: 20, edge: 5 });
  // medal
  const mx = r.x + 52;
  const my = r.y + 44;
  drawRoundButton(ctx, pal, mx, my, 31, { fill: a.unlocked ? pal.gold : pal.panelBorder });
  drawTrophyGlyph(ctx, a.unlocked ? pal.paper : pal.textDim, mx, my - 3, 15, a.unlocked ? pal.goldShade : undefined);
  // label + progress bar
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(22);
  const textX = r.x + 104;
  const barW = 290;
  ctx.fillText(a.label, textX, r.y + 30, r.w - 104 - 170);
  const bar: Rect = { x: textX, y: r.y + 54, w: barW, h: 14 };
  roundRect(ctx, bar, 7);
  ctx.fillStyle = 'rgba(30, 42, 68, 0.12)';
  ctx.fill();
  const frac = a.target > 0 ? Math.max(0, Math.min(1, a.current / a.target)) : 0;
  if (frac > 0) {
    roundRect(ctx, { x: bar.x, y: bar.y, w: Math.max(14, bar.w * frac), h: bar.h }, 7);
    ctx.fillStyle = a.unlocked ? pal.gold : pal.owners.player;
    ctx.fill();
  }
  ctx.fillStyle = pal.textDim;
  ctx.font = font(15, '500');
  ctx.fillText(`${a.current}/${a.target}`, bar.x + bar.w + 12, bar.y + bar.h / 2 + 1, 60);
  // reward pill
  const pill: Rect = { x: r.x + r.w - 148, y: r.y + 24, w: 128, h: 42 };
  if (a.unlocked) {
    drawPill(ctx, pill, pal.owners.enemy2, shade(pal.owners.enemy2, -0.35), 2);
    checkGlyph(ctx, pal.paper, pill.x + 24, pill.y + pill.h / 2, 12);
    ctx.fillStyle = pal.paper;
  } else {
    drawPill(ctx, pill, pal.paper, pal.panelBorder, 2);
    drawCrystal(ctx, pal, pill.x + 24, pill.y + pill.h / 2, 10);
    ctx.fillStyle = pal.ink;
  }
  ctx.font = font(20);
  ctx.textAlign = 'center';
  ctx.fillText(`+${a.crystals}`, pill.x + 24 + (pill.w - 24) / 2 - 2, pill.y + pill.h / 2 + 1, pill.w - 50);
  if (a.unlocked) {
    drawCrystal(ctx, pal, pill.x + pill.w - 22, pill.y + pill.h / 2, 9);
  }
}

export function drawAchievements(view: View, pal: Palette, o: AchievementsOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, o.scroll * 0.4);
  const L = ACHIEVEMENTS_LAYOUT;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, L.contentTop, C.MAP_W, L.contentBottom - L.contentTop);
  ctx.clip();
  ctx.translate(0, -o.scroll);
  for (const row of o.rows) drawAchievementRow(ctx, pal, row);
  ctx.restore();
  // fixed chrome: header + summary pill
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: L.summary.y + L.summary.h + 12 });
  drawButton(ctx, pal, o.backRect, t('common.back'), { fontPx: 24, pressed: o.pressed === o.backRect });
  const title = t('achievements.title');
  drawExtrudedText(ctx, title, 430, 50, fitFontPx(ctx, title, 34, 500), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  drawPill(ctx, L.summary, pal.paper);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(19, '500');
  const summary = t('achievements.summary', { unlocked: o.unlockedCount, total: o.total, crystals: o.crystalsEarned });
  const summaryW = Math.min(ctx.measureText(summary).width, L.summary.w - 60);
  ctx.fillText(summary, 360 + 10, L.summary.y + L.summary.h / 2 + 1, L.summary.w - 60);
  drawCrystal(ctx, pal, 360 + 10 + summaryW / 2 + 16, L.summary.y + L.summary.h / 2, 9);
  if (o.toast) drawToast(ctx, pal, { ...o.toast, y: o.toast.y ?? 1210 });
  ctx.restore();
}
