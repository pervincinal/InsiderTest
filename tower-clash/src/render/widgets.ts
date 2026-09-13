import type { Palette } from './palette';

/** Axis-aligned rectangle in logical units. Shared between drawing and hit-testing. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function font(px: number, weight: 'normal' | 'bold' | '900' = 'bold'): string {
  return `${weight} ${px}px ${FONT}`;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.lineTo(r.x + r.w - rad, r.y);
  ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + rad);
  ctx.lineTo(r.x + r.w, r.y + r.h - rad);
  ctx.quadraticCurveTo(r.x + r.w, r.y + r.h, r.x + r.w - rad, r.y + r.h);
  ctx.lineTo(r.x + rad, r.y + r.h);
  ctx.quadraticCurveTo(r.x, r.y + r.h, r.x, r.y + r.h - rad);
  ctx.lineTo(r.x, r.y + rad);
  ctx.quadraticCurveTo(r.x, r.y, r.x + rad, r.y);
  ctx.closePath();
}

export interface ButtonStyle {
  fill?: string;
  border?: string;
  text?: string;
  fontPx?: number;
  disabled?: boolean;
}

/** Canvas-drawn button: rounded panel with centred label. Hit-test with `inRect`. */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: Rect,
  label: string,
  style: ButtonStyle = {},
): void {
  ctx.save();
  ctx.globalAlpha = style.disabled ? 0.4 : 1;
  roundRect(ctx, r, 14);
  ctx.fillStyle = style.fill ?? pal.panel;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = style.border ?? pal.panelBorder;
  ctx.stroke();
  ctx.fillStyle = style.text ?? pal.text;
  ctx.font = font(style.fontPx ?? 28);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.restore();
}

/** Five-point star centred at (cx, cy). */
export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number): void {
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function drawStars(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, count: number, size: number): void {
  const gap = size * 2.6;
  for (let i = 0; i < 3; i++) {
    starPath(ctx, cx + (i - 1) * gap, cy, size);
    ctx.fillStyle = i < count ? pal.star : pal.starOff;
    ctx.fill();
  }
}

/** Text with a dark outline so numerals stay legible on any owner colour. */
export function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, px: number): void {
  ctx.font = font(px, '900');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, px * 0.18);
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** Gold coin glyph centred at (cx, cy). */
export function drawCoin(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = pal.star;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.6)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  ctx.stroke();
}

/** Padlock glyph centred at (cx, cy); `size` is the body width. */
export function drawLock(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, size: number): void {
  const bodyH = size * 0.78;
  const bodyY = cy - bodyH / 2 + size * 0.22;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, size * 0.14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, bodyY, size * 0.3, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = color;
  roundRect(ctx, { x: cx - size / 2, y: bodyY, w: size, h: bodyH }, size * 0.16);
  ctx.fill();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.7)';
  ctx.beginPath();
  ctx.arc(cx, bodyY + bodyH * 0.45, size * 0.11, 0, Math.PI * 2);
  ctx.fill();
}
