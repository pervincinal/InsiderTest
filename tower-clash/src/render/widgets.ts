import type { Palette } from './palette';
import { shade } from './palette';
import { currentLanguage } from '../ui/i18n';

/*
 * Claymorphic UI primitives (ART_DIRECTION §4): paper faces with an inner top highlight, a soft
 * blue-ink drop shadow to the lower right (key light upper-left) and a coloured bottom edge.
 * Everything is canvas primitives; text is Fredoka (index.html @font-face), or Nunito while the UI
 * is Russian (`uiFont()`).
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

/**
 * Russian UI stack (ART-13): Nunito first, so a Russian line is one family — its Cyrillic letters
 * and its digits / punctuation (Nunito's Latin subset) alike. With Fredoka first, per-glyph
 * fallback would set "Уровень 3" in Nunito letters and a Fredoka "3". Fredoka stays behind it for
 * anything Nunito lacks.
 */
export const FONT_RU = "'Nunito', 'Fredoka', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** The game's text stack for the current UI language: `FONT_RU` in Russian, `FONT` (Fredoka) otherwise. */
export function uiFont(): string {
  return currentLanguage() === 'ru' ? FONT_RU : FONT;
}

export type FontWeight = 'normal' | 'bold' | '900' | '500' | '700';

/** Fredoka ships as 500 (labels) and 700 (numerals, headings); legacy names map onto those two. */
function weightOf(weight: FontWeight): 500 | 700 {
  return weight === 'normal' || weight === '500' ? 500 : 700;
}

/* ---------- text sizes (AUD-U2 / Q7, ART_DIRECTION "Text sizes") ---------- */

/**
 * Smallest layout px of any text a player must read. The 720 × 1280 layout is drawn at 0.5 CSS px
 * per layout px on a 360-wide phone (0.6 at 430), so 22 layout px = 11 CSS px = 11 pt there (13 at
 * 430). `font()` never returns less; the only texts below it are `TEXT_EXEMPTIONS` (`exemptFont`).
 * Guards: tests/render/contrast.test.ts (tight lines, settings rows), tests/render/badgeLayout.test.ts
 * and selectHint.test.ts (at 100 and 150 %); the 2026-10-30 probe measured every fillText of the
 * title, level map, settings and play screens at 360 × 640 and 430 × 932 against it (BACKLOG AUD-U2).
 */
export const MIN_TEXT_PX = 22;

/** The Settings "Text size" steps (save `settings.textScale`): 100 / 125 / 150 %. */
export const TEXT_SCALES = [1, 1.25, 1.5] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/**
 * The map's count badges and stream / mine chips follow the text size up to 125 % only: towers stand
 * ≥ 150 px apart and a 150 % badge (56 tall) would cover its neighbour's (QA-24 guard). Their numerals
 * are 30 layout px (15 CSS px at 360) at 100 % already.
 */
export const WORLD_TEXT_MAX = 1.25;

/** The text size a badge / chip on the map follows (≤ WORLD_TEXT_MAX). */
export const worldScale = (): number => Math.min(textScale, WORLD_TEXT_MAX);

/** `font(px, '900')` for a badge / chip on the map: grows no further than WORLD_TEXT_MAX. */
export const worldFont = (px: number): string => font(px, '900', uiFont(), px * WORLD_TEXT_MAX);

/** True for one of the `TEXT_SCALES` steps (the save's read keeps nothing else). */
export function isTextScale(v: unknown): v is TextScale {
  return typeof v === 'number' && (TEXT_SCALES as readonly number[]).includes(v);
}

let textScale: TextScale = 1;

/** Apply the player's text size (anything but a `TEXT_SCALES` step falls back to 100 %). */
export function setTextScale(k: unknown): void {
  textScale = isTextScale(k) ? k : 1;
}

/** The text size in force (1 = 100 %). */
export function getTextScale(): TextScale {
  return textScale;
}

/**
 * Drawn layout px of a player-facing text set at `px`: scaled by the text size, at most `maxPx` (a box
 * that cannot grow: a HUD band pill, a price chip), never under MIN_TEXT_PX.
 */
export function textPx(px: number, maxPx = Infinity): number {
  return Math.max(MIN_TEXT_PX, Math.min(Math.round(px * textScale * 100) / 100, maxPx));
}

/**
 * The documented exemptions from MIN_TEXT_PX (ART_DIRECTION "Text sizes"), drawn through `exemptFont`:
 *   lessonCard  the lesson card's 20 / 18 px lines (hud.ts `lessonCardLayout`): a guarded system of its
 *               own (e2e/lessonFit.spec.ts asserts every level × language at 20 px in ≤ 3 lines); it
 *               still scales with the text size.
 *   image       pictures that are not the screen: the 1080 × 1350 share card (shareCard.ts), sized
 *               for the image; never scaled.
 *   devNote     the dim `?tones=` URL-override note on Settings (dev / A-B builds only); never scaled.
 *   wordmark    the title's TOWER / CLASH logo (112 px, far above the floor): brand art, so it keeps
 *               its size at every text size.
 */
export const TEXT_EXEMPTIONS = Object.freeze({ lessonCard: { scaled: true }, image: { scaled: false }, devNote: { scaled: false }, wordmark: { scaled: false } });
export type TextExemption = keyof typeof TEXT_EXEMPTIONS;

/**
 * CSS font shorthand for a player-facing text: `px` scaled by the text size and floored at
 * MIN_TEXT_PX (`textPx`), capped at `maxPx` when given. `family` defaults to the UI language's stack
 * (`uiFont()`).
 */
export function font(px: number, weight: FontWeight = 'bold', family: string = uiFont(), maxPx = Infinity): string {
  return `${weightOf(weight)} ${textPx(px, maxPx)}px ${family}`;
}

/** Font of an exempt text (`TEXT_EXEMPTIONS`): no floor; scaled by the text size only where the exemption says so. */
export function exemptFont(kind: TextExemption, px: number, weight: FontWeight = 'bold', family: string = uiFont()): string {
  const k = TEXT_EXEMPTIONS[kind].scaled ? textScale : 1;
  return `${weightOf(weight)} ${Math.round(px * k * 100) / 100}px ${family}`;
}

/**
 * Largest size ≤ `px` at which `text` fits `maxWidth` (translated headings vary a lot in length,
 * e.g. "LEVELS" → "SƏVİYYƏLƏR"), as the size to hand to `font()`: measures once at the drawn size
 * (`textPx`) and scales linearly, but never below MIN_TEXT_PX drawn — a text still too wide there
 * must wrap or get a bigger box (`fitTextLines`). Leaves `ctx.font` set.
 */
export function fitFontPx(ctx: CanvasRenderingContext2D, text: string, px: number, maxWidth: number, weight: FontWeight = '700', family: string = uiFont()): number {
  ctx.font = font(px, weight, family);
  const w = ctx.measureText(text).width;
  if (w <= maxWidth || w <= 0) return px;
  return Math.max(MIN_TEXT_PX, Math.floor((textPx(px) * maxWidth) / w)) / textScale;
}

/**
 * A glyph and a label centred as one group on button `r` (AUD-U2): the label at `px` (22 px floor,
 * ≤ `maxPx` drawn) fitted to what the button leaves beside a `glyphW` glyph, "…" only past the floor.
 * `glyph` draws at the given centre. Leaves the label font set and `textAlign` left.
 */
export function drawGlyphLabel(ctx: CanvasRenderingContext2D, r: Rect, label: string, glyphW: number, glyph: (cx: number, cy: number) => void, colour: string, px = 22, maxPx = 32, cy = r.y + (r.h - 4) / 2): void {
  const gap = 8;
  const room = r.w - 16 - glyphW - gap;
  ctx.font = font(fitFontPx(ctx, label, px, room), 'bold', undefined, maxPx);
  const shown = clipText(ctx, label, room);
  const w = ctx.measureText(shown).width;
  const x0 = r.x + (r.w - (glyphW + gap + w)) / 2;
  glyph(x0 + glyphW / 2, cy);
  ctx.fillStyle = colour;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(shown, x0 + glyphW + gap, cy + 1);
}

/**
 * `text` as it fits `maxWidth` in the current font: whole, or cut at a word (else a letter) with "…" —
 * the last resort of a fixed box once its text is at the floor (AUD-U2: never squeezed).
 */
export function clipText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.lastIndexOf(' ') > 0 && ctx.measureText(`${s.slice(0, s.lastIndexOf(' '))}…`).width <= maxWidth ? s.slice(0, s.lastIndexOf(' ')) : s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** `fitTextLines` result: the lines, the size to hand to `font()`, the drawn size and the line pitch (layout px). */
export interface FittedLines {
  lines: string[];
  px: number;
  drawnPx: number;
  lineH: number;
}

/**
 * Re-flow for a box of `maxWidth` that may take up to `maxLines` lines (AUD-U2: never squeezed with
 * `fillText`'s maxWidth). One line at full size if it fits, else the fewest lines (≤ `maxLines`) at
 * full size, else the size shrinks step by step down to MIN_TEXT_PX drawn at `maxLines`; past that the
 * last line ends with "…". `lineH` is `drawnPx × lineGap`. Leaves the chosen font set on `ctx`.
 */
export function fitTextLines(ctx: CanvasRenderingContext2D, text: string, px: number, maxWidth: number, maxLines: number, weight: FontWeight = '500', lineGap = 1.2): FittedLines {
  const at = (p: number): FittedLines => {
    ctx.font = font(p, weight);
    const drawnPx = textPx(p);
    return { lines: wrapText(ctx, text, maxWidth, maxLines), px: p, drawnPx, lineH: Math.round(drawnPx * lineGap) };
  };
  const fits = (f: FittedLines): boolean => !f.lines[f.lines.length - 1]?.endsWith('…') && f.lines.every((l) => ctx.measureText(l).width <= maxWidth);
  let f = at(px);
  for (let p = px; !fits(f) && textPx(p) > MIN_TEXT_PX; ) {
    p = Math.max(MIN_TEXT_PX / textScale, p - 1 / textScale);
    f = at(p);
  }
  return f;
}

/* ---------- numerals in translated lines (ART-15 / ART-16) ---------- */

/**
 * Size of a number the player reads (ART_DIRECTION §6, BUG-22 / ART-15): prices, pack sizes, the
 * upgrades "Now" / "Next" values, the streak pill, toast amounts. Only a fit pass may go below it.
 */
export const NUMERAL_PX = 24;

/**
 * A number inside a translated line: "+10 %", "−20 %", "+3", "2.5k", "1,200", "7." (an ordinal),
 * and (ART-17) a clock or a fraction as one run — "12:34", "00:00", "5/5" — so the separator is not
 * set at word size between two bold halves. A comma or a full stop is only part of the number when
 * a digit follows it, a trailing full stop being the ordinal mark ("8. bölümü"): RU "8, чтобы" keeps
 * its comma at word size.
 */
const NUMERAL_RUN = /[+\-−]?\d+(?:[.,:/]\d+)*\.?(?:\s?%)?k?/g;

/** One run of a numeral line: a number (bold, NUMERAL_PX) or the words between numbers. */
export interface NumeralRun {
  s: string;
  num: boolean;
}

/** Recently split lines: the card redraws the same few strings every frame (ART-17). */
const runsMemo = new Map<string, NumeralRun[]>();
const RUNS_MEMO_MAX = 128;

/** Split a translated line into word and number runs ("Need 200 gold" → "Need ", "200", " gold"). */
export function numeralRuns(text: string): NumeralRun[] {
  const hit = runsMemo.get(text);
  if (hit) return hit;
  const runs: NumeralRun[] = [];
  let at = 0;
  for (const m of text.matchAll(NUMERAL_RUN)) {
    if (m.index > at) runs.push({ s: text.slice(at, m.index), num: false });
    runs.push({ s: m[0], num: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) runs.push({ s: text.slice(at), num: false });
  if (runsMemo.size >= RUNS_MEMO_MAX) runsMemo.clear();
  runsMemo.set(text, runs);
  return runs;
}

/*
 * ART-17: run widths are memoised per canvas, keyed by the font shorthand and the run text, so a
 * numeral line drawn every frame (the challenge card's countdown, the shop's upgrade rows) measures
 * each run once instead of three times a frame, and sets `ctx.font` only where it changes. A
 * countdown that ticks every second adds one new key a second ("59:59" → "59:58"); the map is
 * dropped when it grows past RUN_WIDTHS_MAX. A web font that finishes loading (the Fredoka
 * latin-ext face on the first AZ / TR "ə" / "ğ", Nunito on the switch to Russian) changes the
 * metrics behind a key, so every cache is dropped on `document.fonts` "loadingdone".
 */
let runWidths = new WeakMap<CanvasRenderingContext2D, Map<string, number>>();
const RUN_WIDTHS_MAX = 256;
const fontSet = (globalThis as { document?: { fonts?: { addEventListener?: (type: string, fn: () => void) => void } } }).document?.fonts;
fontSet?.addEventListener?.('loadingdone', () => {
  runWidths = new WeakMap();
});

/** Width of `s` set in the CSS font `f`, memoised per canvas. Sets `ctx.font` (to `f`) only on a miss. */
export function runWidth(ctx: CanvasRenderingContext2D, f: string, s: string): number {
  let widths = runWidths.get(ctx);
  if (!widths) {
    widths = new Map();
    runWidths.set(ctx, widths);
  }
  const key = `${f}\n${s}`;
  let w = widths.get(key);
  if (w === undefined) {
    ctx.font = f;
    w = ctx.measureText(s).width;
    if (widths.size >= RUN_WIDTHS_MAX) widths.clear();
    widths.set(key, w);
  }
  return w;
}

/** Width of `text` set as a numeral line (words at `wordPx` 500, numbers at `numPx` 700). May change `ctx.font`. */
export function numeralLineWidth(ctx: CanvasRenderingContext2D, text: string, wordPx: number, numPx: number = NUMERAL_PX, maxPx = Infinity): number {
  let w = 0;
  for (const r of numeralRuns(text)) w += runWidth(ctx, font(r.num ? numPx : wordPx, r.num ? '700' : '500', undefined, maxPx), r.s);
  return w;
}

/**
 * One line (alphabetic baseline at `y`) whose numbers are drawn bold at NUMERAL_PX and the words at
 * `wordPx` (ART-15: numerals ≥ 24 px where a number is read, the translated words keep their size).
 * `x` is the left edge, or the centre with `align: 'center'`. A line too wide for `maxW` shrinks its
 * words first and its numbers only as a last resort, neither below MIN_TEXT_PX drawn (AUD-U2), so
 * `fillText` never squeezes the glyphs (BUG-21); a caller whose line can still be too wide there
 * wraps first (`wrapNumeralText`). Returns the drawn width.
 */
export function drawNumeralLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  colour: string,
  wordPx: number,
  align: 'left' | 'center' = 'left',
  /** AUD-U2: the drawn size never exceeds this (a fixed box: a pill, the challenge card), whatever the text size. */
  maxPx = Infinity,
): number {
  ctx.save();
  const runs = numeralRuns(text);
  const widthOf = (num: boolean, px: number): number => {
    const f = font(px, num ? '700' : '500', undefined, maxPx);
    let sum = 0;
    for (const r of runs) if (r.num === num) sum += runWidth(ctx, f, r.s);
    return sum;
  };
  let numPx = NUMERAL_PX;
  const numW = widthOf(true, numPx);
  let wordW = widthOf(false, wordPx);
  const minPx = MIN_TEXT_PX / textScale;
  if (numW + wordW > maxW && wordW > 0) {
    wordPx = Math.max(minPx, Math.floor((wordPx * Math.max(0, maxW - numW)) / wordW));
    wordW = widthOf(false, wordPx);
  }
  let total = numW + wordW;
  if (total > maxW) {
    const k = maxW / total;
    numPx = Math.max(minPx, Math.floor(numPx * k));
    wordPx = Math.max(minPx, Math.floor(wordPx * k));
    total = widthOf(true, numPx) + widthOf(false, wordPx);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colour;
  let cx = align === 'center' ? x - total / 2 : x;
  // runs are drawn in reading order; the font is set only where it changes (widths come from the memo)
  const numFont = font(numPx, '700', undefined, maxPx);
  const wordFont = font(wordPx, '500', undefined, maxPx);
  let set = '';
  for (const r of runs) {
    const f = r.num ? numFont : wordFont;
    if (f !== set) {
      ctx.font = f;
      set = f;
    }
    ctx.fillText(r.s, cx, y);
    cx += runWidth(ctx, f, r.s);
  }
  ctx.restore();
  return total;
}

/** Result of `wrapNumeralText`: the lines and the word size they were laid out at. */
export interface NumeralWrap {
  lines: string[];
  wordPx: number;
  /** Widest line in px (words at `wordPx`, numbers at NUMERAL_PX). */
  width: number;
}

/**
 * Break a translated line into at most `maxLines` numeral lines no wider than `maxW` (ART-16 toast
 * fit pass). " · " is the preferred break (the separator is dropped at a line end: "Need 200 gold ·
 * earn stars …" → "Need 200 gold" / "earn stars …"); a part still too wide breaks between words. If
 * the text needs more lines than `maxLines`, the words shrink a pixel at a time (≥ `minWordPx`, by
 * default MIN_TEXT_PX drawn) and the numbers stay at NUMERAL_PX; past that `drawNumeralLine` shrinks a
 * line as its last resort.
 */
export function wrapNumeralText(ctx: CanvasRenderingContext2D, text: string, maxW: number, wordPx: number, maxLines: number, minWordPx = MIN_TEXT_PX / textScale): NumeralWrap {
  for (let px = wordPx; ; px--) {
    const lines = wrapAt(ctx, text, maxW, px);
    if (lines.length <= maxLines || px <= minWordPx) {
      const width = lines.reduce((m, l) => Math.max(m, numeralLineWidth(ctx, l, px)), 0);
      return { lines, wordPx: px, width };
    }
  }
}

function wrapAt(ctx: CanvasRenderingContext2D, text: string, maxW: number, wordPx: number): string[] {
  const fits = (s: string): boolean => numeralLineWidth(ctx, s, wordPx) <= maxW;
  const lines: string[] = [];
  let line = '';
  for (const part of text.split(' · ')) {
    const joined = line ? `${line} · ${part}` : part;
    if (fits(joined)) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    if (fits(part)) {
      line = part;
      continue;
    }
    for (const word of part.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (!line || fits(next)) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * AUD-U1 touch targets: a tap area is at least 44 CSS px (= pt) both ways on screen, i.e.
 * `44 / view.scale` layout px (88 at 360 wide, 74 at 430). Capped at 88: the layouts keep every
 * pair of neighbours' hit areas apart at that size (tests/ui/touchTargets.test.ts), so a screen
 * narrower than 360 gets no larger areas rather than overlapping ones.
 */
export function minHit(view: { scale: number }): number {
  return Math.min(88, 44 / (view.scale > 0 ? view.scale : 1));
}

/** `r` grown about its centre to at least `min` layout px each way (never shrunk): its tap area. */
export function hitArea(r: Rect, min: number): Rect {
  const w = Math.max(r.w, min);
  const h = Math.max(r.h, min);
  return { x: r.x - (w - r.w) / 2, y: r.y - (h - r.h) / 2, w, h };
}

/** Hit test of a button: the point is on `r`'s tap area (`hitArea` at `minHit(view)`). Every button press goes through this. */
export function hitRect(view: { scale: number }, r: Rect, x: number, y: number): boolean {
  return inRect(hitArea(r, minHit(view)), x, y);
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
    // AUD-U2: fitted to the face (never squeezed), at most the face's height less its padding at any text size
    const px = Math.min(fitFontPx(ctx, label, style.fontPx ?? 28, face.w - 16), (face.h - 14) / textScale);
    ctx.font = font(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, face.x + face.w / 2, face.y + face.h / 2 + 1);
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
  /** Font family stack (default the UI language's, `uiFont()`). */
  family?: string;
  /** A `TEXT_EXEMPTIONS` kind (the share card's `image`, the title's `wordmark`): drawn with `exemptFont`. */
  exempt?: TextExemption;
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
  ctx.font = s.exempt ? exemptFont(s.exempt, px, s.weight ?? '700', s.family) : font(px, s.weight ?? '700', s.family);
  px = s.exempt ? Number(/([\d.]+)px/.exec(ctx.font)?.[1] ?? px) : textPx(px);
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
