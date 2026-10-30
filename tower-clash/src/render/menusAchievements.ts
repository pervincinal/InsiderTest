import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { hudAnchors } from './view';
import type { Rect } from './widgets';
import { clipText, drawButton, drawCard, drawExtrudedText, drawGlassBand, drawPill, drawRoundButton, drawTrophyGlyph, fitFontPx, font, roundRect } from './widgets';
import { ACHIEVEMENTS_LAYOUT, bandedContentBottom } from './menuLayout';
import type { ToastOpts } from './economyWidgets';
import { drawToast } from './economyWidgets';
import { drawCrystal } from './sprites';
import { beginFrame, drawWater, headerBand } from './menus';
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
  const textX = r.x + 104;
  const barW = 290;
  ctx.font = font(fitFontPx(ctx, a.label, 22, r.w - 104 - 170), 'bold', undefined, 28);
  ctx.fillText(clipText(ctx, a.label, r.w - 104 - 170), textX, r.y + 30);
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
  const progress = `${a.current}/${a.target}`;
  ctx.font = font(fitFontPx(ctx, progress, 22, 70, '500'), '500', undefined, 24); // AUD-U2 (was 15 px)
  ctx.fillText(progress, bar.x + bar.w + 10, bar.y + bar.h / 2 + 1);
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
  const reward = `+${a.crystals}`;
  ctx.font = font(fitFontPx(ctx, reward, 22, pill.w - 50), 'bold', undefined, 30);
  ctx.textAlign = 'center';
  ctx.fillText(reward, pill.x + 24 + (pill.w - 24) / 2 - 2, pill.y + pill.h / 2 + 1);
  if (a.unlocked) {
    drawCrystal(ctx, pal, pill.x + pill.w - 22, pill.y + pill.h / 2, 9);
  }
}

export function drawAchievements(view: View, pal: Palette, o: AchievementsOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, o.scroll * 0.4);
  const L = ACHIEVEMENTS_LAYOUT;
  // FE-11: on a tall screen the header and the summary sit on the top safe-area edge (a.top ≤ 0), the
  // rows follow them up and their viewport runs on to 18 layout px above the bottom safe edge
  const a = hudAnchors(view);
  ctx.save();
  ctx.translate(0, a.top);
  ctx.beginPath();
  ctx.rect(0, L.contentTop, C.MAP_W, bandedContentBottom(L.contentBottom, a) - L.contentTop);
  ctx.clip();
  ctx.translate(0, -o.scroll);
  for (const row of o.rows) drawAchievementRow(ctx, pal, row);
  ctx.restore();
  // fixed chrome: header + summary pill
  drawGlassBand(ctx, headerBand(view, L.summary.y + L.summary.h + 12 + a.top)); // up to the screen's top edge (BUG-34)
  ctx.save();
  ctx.translate(0, a.top);
  drawButton(ctx, pal, o.backRect, t('common.back'), { fontPx: 24, pressed: o.pressed === o.backRect });
  const title = t('achievements.title');
  drawExtrudedText(ctx, title, 430, 50, fitFontPx(ctx, title, 34, 500), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  drawPill(ctx, L.summary, pal.paper);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const summary = t('achievements.summary', { unlocked: o.unlockedCount, total: o.total, crystals: o.crystalsEarned });
  ctx.font = font(fitFontPx(ctx, summary, 22, L.summary.w - 60, '500'), '500', undefined, L.summary.h - 14);
  const summaryText = clipText(ctx, summary, L.summary.w - 60);
  const summaryW = ctx.measureText(summaryText).width;
  ctx.fillText(summaryText, 360 + 10, L.summary.y + L.summary.h / 2 + 1);
  drawCrystal(ctx, pal, 360 + 10 + summaryW / 2 + 16, L.summary.y + L.summary.h / 2, 9);
  ctx.restore();
  if (o.toast) drawToast(ctx, pal, { ...o.toast, y: (o.toast.y ?? 1210) + a.bottom });
  ctx.restore();
}
