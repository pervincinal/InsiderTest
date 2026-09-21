import type { Palette } from './palette';
import { shade } from './palette';

/*
 * Claymorphic UI primitives (ART_DIRECTION §4): paper faces with an inner top highlight, a soft
 * blue-ink drop shadow to the lower right (key light upper-left) and a coloured bottom edge.
 * Everything is canvas primitives; the only text face is Fredoka (index.html @font-face).
 */

/** Axis-aligned rectangle in logical units. Shared between drawing and hit-testing. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fredoka (latin, latin-ext) first; Nunito covers Cyrillic (index.html @font-face, unicode-range) since Fredoka has none. */
export const FONT = "'Fredoka', 'Nunito', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type FontWeight = 'normal' | 'bold' | '900' | '500' | '700';

/** Fredoka ships as 500 (labels) and 700 (numerals, headings); legacy names map onto those two. */
function weightOf(weight: FontWeight): 500 | 700 {
  return weight === 'normal' || weight === '500' ? 500 : 700;
}

export function font(px: number, weight: FontWeight = 'bold'): string {
  return `${weightOf(weight)} ${px}px ${FONT}`;
}

/**
 * Largest size ≤ `px` at which `text` fits `maxWidth` (translated headings vary a lot in length,
 * e.g. "LEVELS" → "SƏVİYYƏLƏR"). Measures once at `px` and scales linearly; leaves `ctx.font` set.
 */
export function fitFontPx(ctx: CanvasRenderingContext2D, text: string, px: number, maxWidth: number, weight: FontWeight = '700'): number {
  ctx.font = font(px, weight);
  const w = ctx.measureText(text).width;
  if (w <= maxWidth || w <= 0) return px;
  return Math.max(8, Math.floor((px * maxWidth) / w));
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.max(0, Math.min(radius, r.w / 2, r.h / 2));
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

/** Ink used for every soft shadow (§2 "shadow": blue-ink, never black). */
export const SHADOW_INK = '26, 58, 90';

/**
 * Run `paint` with a soft drop shadow (blue ink, lower-right). `ctx.shadowBlur` costs a full
 * Gaussian pass per call — ≈ 26 ms of fixed raster time per frame on the play HUD alone — so the
 * shadow is built from primitives instead: the shape is painted three times in shadow ink at
 * growing offsets along the shadow vector with falling alpha (umbra + directional gradation), and
 * the path `paint` leaves behind gets one wide, round-joined stroke for the penumbra. `paint`
 * chooses its own colours, so the fill/stroke style setters are shadowed on the context instance
 * for the ink passes and removed again before the real paint. `blur` still scales the penumbra.
 */
export function withShadow(ctx: CanvasRenderingContext2D, paint: () => void, dy = 6, blur = 12, alpha = 0.12): void {
  const ink = `rgba(${SHADOW_INK}, 1)`;
  const base = ctx.globalAlpha;
  const dx = dy * 0.35;
  ctx.save();
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  const own = ctx as unknown as Record<string, unknown>;
  for (const key of ['fillStyle', 'strokeStyle'] as const) {
    Object.defineProperty(own, key, { configurable: true, enumerable: false, get: () => ink, set: () => undefined });
  }
  try {
    // [offset factor, share of alpha]: the three copies overlap to ≈ alpha in the umbra
    for (const [k, share] of [
      [0.7, 0.5],
      [1, 0.34],
      [1.3, 0.22],
    ] as const) {
      ctx.save();
      ctx.translate(dx * k, dy * k);
      ctx.globalAlpha = base * alpha * share;
      ctx.beginPath(); // never stroke a stale path when paint() only uses fillText
      paint();
      if (k === 1 && blur > 0) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = blur * 0.8;
        ctx.globalAlpha = base * alpha * 0.25;
        ctx.stroke();
      }
      ctx.restore();
    }
  } finally {
    delete own.fillStyle;
    delete own.strokeStyle;
  }
  ctx.restore();
  paint();
}

/** Thin lighter line just inside the top of a rounded shape: the clay "inner highlight". */
export function innerHighlight(ctx: CanvasRenderingContext2D, r: Rect, radius: number, alpha = 0.6, width = 2): void {
  ctx.save();
  roundRect(ctx, r, radius);
  ctx.clip();
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r.x + radius * 0.8, r.y + width * 0.75);
  ctx.lineTo(r.x + r.w - radius * 0.8, r.y + width * 0.75);
  ctx.stroke();
  ctx.restore();
}

export interface ButtonStyle {
  /** Face colour (default paper). A coloured face gets paper text automatically. */
  fill?: string;
  /** Outline ring drawn around the face (used for "active" states). */
  border?: string;
  /** Bottom edge colour (default: derived from the face; ink shade on paper). */
  edge?: string;
  text?: string;
  fontPx?: number;
  disabled?: boolean;
  /** Pressed look: face drops 3 px onto a shrunken edge. */
  pressed?: boolean;
  /** Skip the drop shadow (e.g. many small buttons in a list). */
  flat?: boolean;
}

/** Height of the coloured bottom edge below a button face (§4: 4 px). */
export const BUTTON_EDGE = 4;
export const PRESS_DROP = 3;

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
 * Clay button: paper (or coloured) face, inner top highlight, soft outer shadow and a coloured
 * 4 px bottom edge. `r` is the hit rectangle; the edge is drawn inside it so hit-testing is stable.
 */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: Rect,
  label: string,
  style: ButtonStyle = {},
): void {
  const fill = style.fill ?? pal.panel;
  const light = isLight(fill);
  const edge = style.edge ?? (style.fill ? shade(fill, -0.38) : shade(pal.panel, -0.22));
  const press = style.pressed ? PRESS_DROP : 0;
  const radius = Math.min(18, r.h / 2 - 2);
  const face: Rect = { x: r.x, y: r.y + press, w: r.w, h: r.h - BUTTON_EDGE };
  ctx.save();
  ctx.globalAlpha = style.disabled ? 0.45 : 1;
  // shadow + edge (one shape so the shadow reads as a single object)
  const paintEdge = (): void => {
    roundRect(ctx, { x: r.x, y: r.y + press, w: r.w, h: r.h - press }, radius);
    ctx.fillStyle = edge;
    ctx.fill();
  };
  if (style.flat || style.pressed) paintEdge();
  else withShadow(ctx, paintEdge, 6, 12, 0.14);
  // face with a gentle lit→mid gradient (clay, not plastic)
  roundRect(ctx, face, radius);
  const g = ctx.createLinearGradient(0, face.y, 0, face.y + face.h);
  g.addColorStop(0, shade(fill, light ? 0.1 : 0.16));
  g.addColorStop(1, fill);
  ctx.fillStyle = g;
  ctx.fill();
  if (style.border) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = style.border;
    ctx.stroke();
  }
  innerHighlight(ctx, face, radius, light ? 0.9 : 0.45);
  if (label) {
    ctx.fillStyle = style.text ?? (light ? pal.text : pal.panel);
    ctx.font = font(style.fontPx ?? 28);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, face.x + face.w / 2, face.y + face.h / 2 + 1, face.w - 16);
  }
  ctx.restore();
}

/** Rounded clay pill (HUD chips, hints): soft shadow, fill, inner highlight, optional stroke. */
export function drawPill(ctx: CanvasRenderingContext2D, r: Rect, fill: string, stroke?: string, lineWidth = 3): void {
  const radius = r.h / 2;
  withShadow(
    ctx,
    () => {
      roundRect(ctx, r, radius);
      ctx.fillStyle = fill;
      ctx.fill();
    },
    4,
    8,
    0.12,
  );
  if (stroke) {
    roundRect(ctx, r, radius);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
  innerHighlight(ctx, r, radius, 0.7);
}

export interface CardStyle {
  fill?: string;
  radius?: number;
  /** Bottom edge height (default 6). */
  edge?: number;
}

/** Clay card: big radius, soft shadow, paper face, inner top highlight, shaded bottom edge. */
export function drawCard(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, style: CardStyle = {}): void {
  const fill = style.fill ?? pal.panel;
  const radius = style.radius ?? 28;
  const edge = style.edge ?? 6;
  withShadow(
    ctx,
    () => {
      roundRect(ctx, r, radius);
      ctx.fillStyle = shade(fill, -0.18);
      ctx.fill();
    },
    12,
    24,
    0.2,
  );
  roundRect(ctx, { x: r.x, y: r.y, w: r.w, h: r.h - edge }, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  innerHighlight(ctx, { x: r.x, y: r.y, w: r.w, h: r.h - edge }, radius, 0.95, 3);
}

/** Translucent paper band with a lighter top edge: the "glass" HUD strip that reads over any biome. */
export function drawGlassBand(ctx: CanvasRenderingContext2D, r: Rect, radius = 0): void {
  roundRect(ctx, r, radius);
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  g.addColorStop(0, 'rgba(255, 250, 240, 0.82)');
  g.addColorStop(1, 'rgba(255, 250, 240, 0.62)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = `rgba(${SHADOW_INK}, 0.1)`;
  ctx.fillRect(r.x, r.y + r.h - 3, r.w, 3);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(r.x, r.y, r.w, 2);
}

export interface ExtrudeStyle {
  /** Face colour (default paper). */
  face: string;
  /** Side (extrusion) colour. */
  side: string;
  /** Contour colour (default ink). */
  outline?: string;
  /** Extrusion depth in px (default 6). */
  depth?: number;
  /** Extrusion direction (default lower-right, matching the key light). */
  dx?: number;
  dy?: number;
  weight?: FontWeight;
  /** Outline width as a fraction of px (default 0.12). */
  outlineFrac?: number;
}

/**
 * 3D clay lettering: the text is stacked `depth` times towards the lower-right in the side colour,
 * each layer contoured, then capped with the face (lit→mid gradient) and an ink outline.
 */
export function drawExtrudedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, s: ExtrudeStyle): void {
  const depth = s.depth ?? 6;
  const dx = s.dx ?? 1;
  const dy = s.dy ?? 1;
  const outline = s.outline ?? '#1e2a44';
  ctx.save();
  ctx.font = font(px, s.weight ?? '700');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, px * (s.outlineFrac ?? 0.12));
  ctx.strokeStyle = outline;
  for (let i = depth; i >= 1; i--) {
    const ox = x + dx * i;
    const oy = y + dy * i;
    ctx.strokeText(text, ox, oy);
    ctx.fillStyle = s.side;
    ctx.fillText(text, ox, oy);
  }
  ctx.strokeText(text, x, y);
  const g = ctx.createLinearGradient(0, y - px * 0.5, 0, y + px * 0.45);
  g.addColorStop(0, shade(s.face, 0.22));
  g.addColorStop(0.55, s.face);
  g.addColorStop(1, shade(s.face, -0.08));
  ctx.fillStyle = g;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Five-point star centred at (cx, cy). */
export function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number): void {
  const inner = outer * 0.47;
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

/** One clay star (gold, or grey when off) with a shaded underside; `scale` lets result screens pop them in. */
export function drawStar(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, size: number, on: boolean, scale = 1): void {
  if (scale <= 0) return;
  const s = size * scale;
  const base = on ? pal.star : pal.starOff;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, s * 0.14);
  ctx.strokeStyle = on ? shade(pal.star, -0.55) : shade(pal.starOff, -0.35);
  // extruded underside
  starPath(ctx, cx + s * 0.06, cy + s * 0.12, s);
  ctx.stroke();
  ctx.fillStyle = shade(base, -0.3);
  ctx.fill();
  // face
  starPath(ctx, cx, cy, s);
  ctx.stroke();
  const g = ctx.createLinearGradient(cx - s, cy - s, cx + s * 0.6, cy + s);
  g.addColorStop(0, shade(base, 0.35));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.12));
  ctx.fillStyle = g;
  ctx.fill();
  if (on) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.22, cy - s * 0.22, s * 0.16, s * 0.1, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawStars(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, count: number, size: number, scales?: readonly number[]): void {
  const gap = size * 2.6;
  for (let i = 0; i < 3; i++) drawStar(ctx, pal, cx + (i - 1) * gap, cy, size, i < count, scales?.[i] ?? 1);
}

/**
 * Star pop-in: `t` is the animation progress (0 = not started, ≥1 = settled). The star scales in
 * with overshoot while a gold glow burst expands and fades behind it.
 */
export function drawStarPop(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, size: number, on: boolean, t: number): void {
  if (t <= 0) return;
  const u = Math.min(1, t);
  if (on && u < 1) {
    const burst = 1 - u;
    ctx.save();
    ctx.globalAlpha = burst * 0.55;
    ctx.fillStyle = pal.star;
    ctx.beginPath();
    ctx.arc(cx, cy, size * (1.2 + u * 1.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = burst * 0.9;
    ctx.strokeStyle = shade(pal.star, 0.4);
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const r0 = size * (1.3 + u * 1.2);
      const r1 = r0 + size * 0.45 * (1 - u);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawStar(ctx, pal, cx, cy, size, on, easeOutBack(u));
}

/** Text with an outline so numerals stay legible on any colour. Default outline is ink. */
export function outlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  px: number,
  outline = 'rgba(30, 42, 68, 0.9)',
  weight: FontWeight = '700',
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

/** Clay gold coin centred at (cx, cy): shaded rim, lit face, inner ring, top-left glint. */
export function drawCoin(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, r: number): void {
  const gold = pal.star;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + r * 0.08, cy + r * 0.16, r, 0, Math.PI * 2);
  ctx.fillStyle = shade(gold, -0.45);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, shade(gold, 0.35));
  g.addColorStop(0.55, gold);
  g.addColorStop(1, shade(gold, -0.18));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.12);
  ctx.strokeStyle = shade(gold, -0.45);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
  ctx.strokeStyle = shade(gold, -0.3);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.35, cy - r * 0.38, r * 0.22, r * 0.13, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ease-out with overshoot, for pop-in animations. t in 0..1. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Math.max(0, Math.min(1, t)) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** Smooth ease-out (cubic). t in 0..1. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}

/* ---------- M3 widgets: round buttons, segmented control, toggle, cooldown ring ---------- */

export interface RoundButtonStyle {
  fill?: string;
  border?: string;
  disabled?: boolean;
  pressed?: boolean;
}

/**
 * Round clay button (booster bar): shaded underside as the "edge", lit face gradient, top-left
 * glint. `cx, cy` is the face centre, `r` its radius; the edge hangs BUTTON_EDGE px below.
 */
export function drawRoundButton(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, r: number, style: RoundButtonStyle = {}): void {
  const fill = style.fill ?? pal.panel;
  const light = isLight(fill);
  const press = style.pressed ? PRESS_DROP : 0;
  ctx.save();
  ctx.globalAlpha = style.disabled ? 0.45 : 1;
  const paintEdge = (): void => {
    ctx.beginPath();
    ctx.arc(cx, cy + BUTTON_EDGE, r, 0, Math.PI * 2);
    ctx.fillStyle = style.fill ? shade(fill, -0.38) : shade(pal.panel, -0.22);
    ctx.fill();
  };
  if (style.pressed) paintEdge();
  else withShadow(ctx, paintEdge, 6, 12, 0.14);
  ctx.beginPath();
  ctx.arc(cx, cy + press, r, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.4, cy + r);
  g.addColorStop(0, shade(fill, light ? 0.1 : 0.2));
  g.addColorStop(1, shade(fill, light ? 0 : -0.05));
  ctx.fillStyle = g;
  ctx.fill();
  if (style.border) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = style.border;
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(255,255,255,${light ? 0.75 : 0.45})`;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.3, cy + press - r * 0.5, r * 0.32, r * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ring arc around a round button showing `fraction` (0..1) of a cooldown left, clockwise from 12 o'clock. */
export function drawCooldownRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fraction: number, color: string, track = 'rgba(30,42,68,0.18)'): void {
  const f = Math.max(0, Math.min(1, fraction));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = track;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (f > 0) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
    ctx.stroke();
  }
  ctx.restore();
}

export interface Segment {
  label: string;
}

/* ---------- glyphs (all canvas primitives, centred at cx/cy, `s` ≈ half size) ---------- */

export function drawSpeakerGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number, on: boolean): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy - s * 0.3);
  ctx.lineTo(cx - s * 0.3, cy - s * 0.3);
  ctx.lineTo(cx + s * 0.15, cy - s * 0.7);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.7);
  ctx.lineTo(cx - s * 0.3, cy + s * 0.3);
  ctx.lineTo(cx - s * 0.7, cy + s * 0.3);
  ctx.closePath();
  ctx.fill();
  if (on) {
    ctx.beginPath();
    ctx.arc(cx + s * 0.2, cy, s * 0.45, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + s * 0.2, cy, s * 0.8, -0.9, 0.9);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.4, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.95, cy + s * 0.35);
    ctx.moveTo(cx + s * 0.95, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.35);
    ctx.stroke();
  }
  ctx.restore();
}

/** Cog: ring with eight teeth and a hollow hub. */
export function drawGearGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.28;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55);
    ctx.lineTo(cx + Math.cos(a) * s * 0.95, cy + Math.sin(a) * s * 0.95);
    ctx.stroke();
  }
  ctx.lineWidth = s * 0.34;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Lightning bolt (overdrive). */
export function drawBoltGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number, outline?: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.25, cy - s);
  ctx.lineTo(cx - s * 0.55, cy + s * 0.15);
  ctx.lineTo(cx - s * 0.02, cy + s * 0.15);
  ctx.lineTo(cx - s * 0.3, cy + s);
  ctx.lineTo(cx + s * 0.55, cy - s * 0.2);
  ctx.lineTo(cx + s * 0.02, cy - s * 0.2);
  ctx.closePath();
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, s * 0.22);
    ctx.strokeStyle = outline;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/** Six-armed snowflake with short branches (freeze). */
export function drawSnowflakeGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.16);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * s, cy + dy * s);
    ctx.stroke();
    // two branches at 60 % of the arm
    const bx = cx + dx * s * 0.6;
    const by = cy + dy * s * 0.6;
    for (const side of [-1, 1]) {
      const b = a + (side * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(b) * s * 0.3, by + Math.sin(b) * s * 0.3);
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Crosshair: ring, four ticks, centre dot (airstrike). */
export function drawCrosshairGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.4);
    ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Trophy cup (achievements): bowl with two handles on a stem and base. `s` ≈ half the cup height. */
export function drawTrophyGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number, outline?: string): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const paint = (): void => {
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(2, s * 0.14);
      ctx.stroke();
    }
  };
  // bowl: flat top, rounded bottom
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.8, cy - s);
  ctx.lineTo(cx + s * 0.8, cy - s);
  ctx.lineTo(cx + s * 0.62, cy + s * 0.05);
  ctx.quadraticCurveTo(cx + s * 0.45, cy + s * 0.55, cx, cy + s * 0.6);
  ctx.quadraticCurveTo(cx - s * 0.45, cy + s * 0.55, cx - s * 0.62, cy + s * 0.05);
  ctx.closePath();
  paint();
  // handles
  ctx.beginPath();
  ctx.arc(cx - s * 0.85, cy - s * 0.45, s * 0.34, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(cx + s * 0.85, cy - s * 0.45, s * 0.34, Math.PI * 1.5, Math.PI * 0.5);
  ctx.strokeStyle = outline ?? color;
  ctx.lineWidth = Math.max(3, s * 0.22);
  ctx.stroke();
  if (outline) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, s * 0.1);
    ctx.stroke();
  }
  // stem + base
  ctx.beginPath();
  ctx.rect(cx - s * 0.16, cy + s * 0.55, s * 0.32, s * 0.4);
  paint();
  roundRect(ctx, { x: cx - s * 0.55, y: cy + s * 0.9, w: s * 1.1, h: s * 0.3 }, s * 0.1);
  paint();
  // glint
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.4, cy - s * 0.55, s * 0.12, s * 0.28, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
