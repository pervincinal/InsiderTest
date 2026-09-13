import type { Palette } from './palette';
import { shade } from './palette';

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
  /** Face colour (default white). A coloured face gets white text automatically. */
  fill?: string;
  /** Outline ring drawn around the face (used for "active" states). */
  border?: string;
  /** Bottom "3D" edge colour (default derived from the face). */
  edge?: string;
  text?: string;
  fontPx?: number;
  disabled?: boolean;
  /** Pressed look: face drops onto the edge. */
  pressed?: boolean;
}

/** Depth of the 3D bottom edge below a button face. */
export const BUTTON_EDGE = 6;

/** True when the colour is light enough for dark text. */
export function isLight(hex: string): boolean {
  if (hex.length !== 7 || hex[0] !== '#') return true;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

/**
 * Chunky toy button: rounded white (or coloured) face standing on a darker bottom edge, bold navy
 * text. `r` is the hit rectangle; the edge is drawn inside it so hit-testing stays unchanged.
 */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: Rect,
  label: string,
  style: ButtonStyle = {},
): void {
  const fill = style.fill ?? pal.panel;
  const edge = style.edge ?? (style.fill ? shade(fill, -0.38) : pal.panelBorder);
  const press = style.pressed ? BUTTON_EDGE - 2 : 0;
  const radius = Math.min(18, r.h / 2 - 2);
  ctx.save();
  ctx.globalAlpha = style.disabled ? 0.45 : 1;
  // bottom edge
  roundRect(ctx, { x: r.x, y: r.y + BUTTON_EDGE, w: r.w, h: r.h - BUTTON_EDGE }, radius);
  ctx.fillStyle = edge;
  ctx.fill();
  // face
  const face: Rect = { x: r.x, y: r.y + press, w: r.w, h: r.h - BUTTON_EDGE };
  roundRect(ctx, face, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (style.border) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = style.border;
    ctx.stroke();
  }
  // soft top highlight
  ctx.globalAlpha *= 0.35;
  roundRect(ctx, { x: face.x + 6, y: face.y + 4, w: face.w - 12, h: Math.max(4, face.h * 0.28) }, radius * 0.7);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.globalAlpha = style.disabled ? 0.45 : 1;
  if (label) {
    ctx.fillStyle = style.text ?? (isLight(fill) ? pal.text : '#ffffff');
    ctx.font = font(style.fontPx ?? 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, face.x + face.w / 2, face.y + face.h / 2 + 1, face.w - 16);
  }
  ctx.restore();
}

/** Rounded pill panel (HUD chips, hints). */
export function drawPill(ctx: CanvasRenderingContext2D, r: Rect, fill: string, stroke?: string, lineWidth = 3): void {
  roundRect(ctx, r, r.h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
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

/** One gold (or grey, when off) star with a dark outline; `scale` lets the result screen pop them in. */
export function drawStar(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, size: number, on: boolean, scale = 1): void {
  if (scale <= 0) return;
  const s = size * scale;
  starPath(ctx, cx, cy, s);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.strokeStyle = on ? shade(pal.star, -0.5) : shade(pal.starOff, -0.3);
  ctx.stroke();
  ctx.fillStyle = on ? pal.star : pal.starOff;
  ctx.fill();
  if (on) {
    // small highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.arc(cx - s * 0.2, cy - s * 0.25, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawStars(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, count: number, size: number, scales?: readonly number[]): void {
  const gap = size * 2.6;
  for (let i = 0; i < 3; i++) drawStar(ctx, pal, cx + (i - 1) * gap, cy, size, i < count, scales?.[i] ?? 1);
}

/** Text with an outline so numerals stay legible on any colour. Default outline is dark navy. */
export function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  px: number,
  outline = 'rgba(20, 30, 55, 0.9)',
  weight: 'bold' | '900' = '900',
): void {
  ctx.font = font(px, weight);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, px * 0.18);
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Greedy word wrap for the current ctx.font. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(probe).width <= maxWidth) line = probe;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
  return kept;
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
  ctx.strokeStyle = shade(pal.star, -0.5);
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.beginPath();
  ctx.arc(cx, bodyY + bodyH * 0.45, size * 0.11, 0, Math.PI * 2);
  ctx.fill();
}

/** Ease-out with overshoot, for pop-in animations. t in 0..1. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Math.max(0, Math.min(1, t)) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
