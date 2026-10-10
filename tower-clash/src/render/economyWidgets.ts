import type { Palette } from './palette';
import { shade } from './palette';
import type { NumeralWrap, Rect } from './widgets';
import { drawNumeralLine, drawPill, drawStars, font, wrapNumeralText } from './widgets';
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

/** Toast type sizes (ART-16): words 21 px, numbers NUMERAL_PX (24 px), up to four lines in a ≤ 660 px pill. */
export const TOAST = Object.freeze({ wordPx: 21, maxW: 660, pad: 28, maxLines: 4, lineH: 30, h: 48 });

let lastWrap: { key: string; wrap: NumeralWrap } | null = null;

/** Lines of a toast (memoised on the text and the language's font stack: toasts redraw every frame). */
export function toastLines(ctx: CanvasRenderingContext2D, text: string): NumeralWrap {
  const key = `${font(TOAST.wordPx)}|${text}`;
  if (lastWrap?.key !== key) lastWrap = { key, wrap: wrapNumeralText(ctx, text, TOAST.maxW - TOAST.pad * 2, TOAST.wordPx, TOAST.maxLines) };
  return lastWrap.wrap;
}

/**
 * Transient status pill (purchase result, reward claimed, "not enough crystals").
 * ART-16 ruling: the amounts a toast carries ("Need 200 gold", "+150 gold · +20 crystals") are drawn
 * as their own bold 24 px runs inside the 21 px words (`drawNumeralLine`), not the whole toast at
 * 24 px. Every RU / AZ / TR toast with a long tail ("· earn stars or watch ×2 gold after a win")
 * is wider than the 604 px text column at 21 px already (RU 788 px), so a 24 px toast would have to
 * wrap anyway and would wrap twice as often; the numeral runs add ≤ 20 px to a line. Long toasts
 * break at " · " (then between words) into up to four lines instead of being squeezed by
 * `fillText`'s maxWidth; the pill grows upwards from its bottom edge so it never nears the screen foot.
 */
export function drawToast(ctx: CanvasRenderingContext2D, pal: Palette, o: ToastOpts): void {
  const fadeIn = Math.min(1, o.t / 0.1);
  const fadeOut = Math.min(1, (1 - o.t) / 0.2);
  const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const wrap = toastLines(ctx, o.text);
  const textW = TOAST.maxW - TOAST.pad * 2;
  const w = Math.min(TOAST.maxW, wrap.width + TOAST.pad * 2);
  const h = TOAST.h + (wrap.lines.length - 1) * TOAST.lineH;
  const bottom = (o.y ?? 1090) + TOAST.h / 2 - (1 - fadeIn) * 12;
  const pill: Rect = { x: 360 - w / 2, y: bottom - h, w, h };
  // ART-15: info / success toasts on the active-choice blue (paper 7.1:1; the owner mid blue was
  // 4.35:1), errors on the alarm red with ink text (4.7:1; paper on it was 2.9:1)
  const ink = o.kind === 'ok' ? pal.shopBuy : pal.toastError;
  drawPill(ctx, pill, ink.face, shade(ink.face, -0.35));
  // alphabetic baseline ≈ half the words' cap height under each line's centre (Fredoka caps ≈ 0.7 em)
  const base = Math.round(wrap.wordPx * 0.33);
  wrap.lines.forEach((line, i) => {
    const cy = pill.y + TOAST.h / 2 + i * TOAST.lineH;
    drawNumeralLine(ctx, line, 360, cy + base, textW, ink.text, wrap.wordPx, 'center');
  });
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
