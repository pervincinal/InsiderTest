import type { Palette } from './palette';
import { shade } from './palette';
import type { Rect } from './widgets';
import { drawPill, drawStars, font } from './widgets';
import { drawCrystal, drawGoldCoin } from './sprites';
import { prefersReducedMotion } from './particles';
import { reducedMotionOverride } from '../ui/motion';

/*
 * Economy widgets shared by the HUD (result card) and the menus (title, level map, shop): the
 * gold + crystal wallet pill, transient toasts and the purchase spinner. Kept out of menus.ts /
 * hud.ts so neither has to import the other.
 */

let reduced: boolean | null = null;
function motion(): boolean {
  const override = reducedMotionOverride();
  if (override !== null) return !override;
  if (reduced === null) reduced = prefersReducedMotion();
  return !reduced;
}

export interface WalletStyle {
  /** Prefix a star count (title footer). */
  stars?: number;
  pressed?: boolean;
}

/**
 * Gold + crystal balances as two clay pills side by side inside `r` (one hit rect: tap → shop).
 * Numbers are right-aligned so a growing balance never pushes the glyph around.
 */
export function drawWallet(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, gold: number, crystals: number, style: WalletStyle = {}): void {
  ctx.save();
  if (style.pressed) ctx.translate(0, 2);
  ctx.textBaseline = 'middle';
  const cells: { glyph: 'star' | 'gold' | 'crystal'; value: number }[] = [];
  if (style.stars !== undefined) cells.push({ glyph: 'star', value: style.stars });
  cells.push({ glyph: 'gold', value: gold }, { glyph: 'crystal', value: crystals });
  const gap = 8;
  const cellW = (r.w - gap * (cells.length - 1)) / cells.length;
  const fontPx = Math.min(24, Math.round(r.h * 0.46));
  cells.forEach((c, i) => {
    const cell: Rect = { x: r.x + i * (cellW + gap), y: r.y, w: cellW, h: r.h };
    drawPill(ctx, cell, pal.paper, style.pressed ? pal.panelBorder : undefined);
    const gx = cell.x + cell.h / 2 + 2;
    const gy = cell.y + cell.h / 2;
    if (c.glyph === 'gold') drawGoldCoin(ctx, pal, gx, gy, cell.h * 0.3);
    else if (c.glyph === 'crystal') drawCrystal(ctx, pal, gx, gy, cell.h * 0.32);
    else drawStars(ctx, pal, gx, gy, 1, cell.h * 0.24, [1, 0, 0]);
    ctx.fillStyle = pal.ink;
    ctx.font = font(fontPx);
    ctx.textAlign = 'right';
    ctx.fillText(formatAmount(c.value), cell.x + cell.w - 14, gy + 1, cell.w - cell.h - 10);
  });
  ctx.restore();
}

/** 12 345 → "12.3k" past five digits so the pills never overflow. */
export function formatAmount(n: number): string {
  if (n >= 100_000) return `${Math.floor(n / 1000)}k`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export interface ToastOpts {
  text: string;
  kind: 'ok' | 'error';
  /** 0..1 progress of the toast's lifetime (fades in the first 10 % and out in the last 20 %). */
  t: number;
  /** Logical y of the pill centre (default 1090). */
  y?: number;
}

/** Transient status pill (purchase result, reward claimed, "not enough crystals"). */
export function drawToast(ctx: CanvasRenderingContext2D, pal: Palette, o: ToastOpts): void {
  const fadeIn = Math.min(1, o.t / 0.1);
  const fadeOut = Math.min(1, (1 - o.t) / 0.2);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font(21, '500');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(660, ctx.measureText(o.text).width + 56);
  const y = (o.y ?? 1090) - (1 - fadeIn) * 12;
  const pill: Rect = { x: 360 - w / 2, y: y - 24, w, h: 48 };
  const fill = o.kind === 'ok' ? pal.owners.player : pal.owners.enemy1;
  drawPill(ctx, pill, fill, shade(fill, -0.35));
  ctx.fillStyle = pal.paper;
  ctx.fillText(o.text, 360, y + 1, w - 24);
  ctx.restore();
}


/** Rotating arc inside a button while a purchase / ad is in flight. */
export function drawSpinner(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, r: number, nowMs: number): void {
  const a0 = motion() ? (nowMs / 160) % (Math.PI * 2) : 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, r * 0.3);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a0 + Math.PI * 1.4);
  ctx.stroke();
}
