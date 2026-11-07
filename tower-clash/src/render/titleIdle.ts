import type { Palette } from './palette';
import { shade, themeFor } from './palette';
import type { View } from './view';
import { blankLayer, viewKey } from './layers';
import type { TitleOpts } from './menus';
import { drawTitle, motion } from './menus';
import { titleShifts } from './titleLayout';
import { FONT, drawExtrudedText, getTextScale, withShadow } from './widgets';
import { isSaveFailing, isSaveReadOnly } from '../ui/save';

/*
 * AUD-Q11: the idle title at the least cost per frame. The title is the screen players idle on, and
 * its whole frame — full-bleed sea, island, demo battle, the extruded wordmark (≈ 140 large glyph
 * strokes and fills a frame), every label — used to be repainted on every frame. While nothing is
 * held and no toast shows, `paintTitle` spreads `drawTitle`'s parts over the three canvases
 * (PERF-3, layers.ts): the static ground on the ground layer and the static UI on the HUD layer,
 * both repainted only when their key changes, and the moving part (marching columns, towers, badges,
 * the bobbing wordmark, the daily chest) on the cleared game canvas between them, 30 times a second
 * (TITLE_IDLE_FRAME_MS). Of that part the wordmark cost the most by far (its words are stroked and
 * filled nine times over, under three shadow copies): its two words are baked at rest with the static
 * layers (`drawWord`, one device-pixel crop each) and blitted every paint, each lifted by its bob
 * rounded to whole device pixels (so the bitmap is never resampled). Under reduced motion nothing
 * moves: the single-canvas frame is painted once per key and the following frames are skipped.
 *
 * Lazy (src/ui/lazyScreens.ts; the eager bundle holds the hook only, src/ui/screens.ts): until the
 * chunk is in — a moment after the first paint — the title draws its whole frame every frame, as it
 * did before.
 */

/**
 * The moving part's beat while the title idles: 30 paints a second on a 30 Hz grid, whatever the display
 * rate (every other frame at 60 Hz, two of three at 45 Hz, every third at 90 / 120 Hz, every frame at
 * 30 Hz or under) — never under 30 fps, never more work than that.
 */
export const TITLE_IDLE_FRAME_MS = 1000 / 30;
/** A frame paints once this much of the beat has passed (clear of one 60 Hz frame plus jitter, of three 120 Hz frames minus rounding). */
const BEAT_SLACK_MS = 22;

/** Grid time of the last paint of the moving part (falls back to the frame time after a stall or a repaint). */
let worldAt = -1e9;

/**
 * FEEL-1-6: the next `paintTitle` paints the moving part whatever the beat — the menu slide (src/ui/screenSlide.ts)
 * draws over the game canvas, so while it runs (and on the frame it settles) the title must not keep a skipped frame.
 */
export function repaintTitleNext(): void {
  worldAt = -1e9;
}

/**
 * Everything a still title frame is drawn from, `nowMs` aside: the viewport, the resolved theme (a lazy
 * theme that lands repaints the ground), the tones, the text size, the font loads (a face that arrives
 * after the first paint repaints the labels), reduced motion and the screen's inputs.
 */
export function titleKey(view: View, pal: Palette, o: TitleOpts): string {
  return JSON.stringify([viewKey(view), themeFor(o.theme).id, pal.owners, getTextScale(), globalThis.document?.fonts?.status, motion(), { ...o, nowMs: 0 }]);
}

/** The wordmark's lift at `nowMs` (logical px) for word 0 (TOWER) / 1 (CLASH): menus.ts `drawTitle`'s `bob` / `bob2`. */
export function wordBob(nowMs: number, word: number): number {
  return Math.sin(nowMs / 900 + word * 0.8) * 6;
}

/** Wordmark rows baked per word, logical px around its centre line: the glyphs, their outline and extrusion, the shadow copies below. */
const WORD_ROWS = { above: 100, below: 130 } as const;

/** One word of the wordmark at rest with its three shadow copies, exactly as `drawTitle` part 8 draws it (tests/render/titleIdle.test.ts). */
export function drawWord(ctx: CanvasRenderingContext2D, pal: Palette, word: number): void {
  const blue = pal.owners.player;
  withShadow(
    ctx,
    () =>
      word
        ? drawExtrudedText(ctx, 'CLASH', 360, 474, 112, { face: blue, side: shade(blue, -0.45), outline: pal.ink, depth: 8, family: FONT, exempt: 'wordmark' })
        : drawExtrudedText(ctx, 'TOWER', 360, 372, 112, { face: pal.paper, side: shade(blue, -0.25), outline: pal.ink, depth: 8, family: FONT, exempt: 'wordmark' }),
    14,
    18,
    0.22,
  );
}

/** The two words baked for the current key: a crop of the game canvas' width each, and the device row it starts at. */
let words: { img: HTMLCanvasElement; y: number }[] = [];

/** Bake the words at rest in the logo group's place (`titleShifts` `logo`), keeping the frame's sub-pixel phase; none without a DOM. */
function bakeWords(view: View, pal: Palette): void {
  words = [];
  if (typeof document === 'undefined') return;
  const s = view.dpr * view.scale;
  const y0 = view.dpr * view.offsetY + s * titleShifts(view).logo;
  for (const [word, cy] of [372, 474].entries()) {
    const img = document.createElement('canvas');
    const ctx = img.getContext('2d');
    if (!ctx) return void (words = []);
    const y = Math.floor(y0 + s * (cy - WORD_ROWS.above));
    img.width = view.canvas.width;
    img.height = Math.ceil(s * (WORD_ROWS.above + WORD_ROWS.below)) + 1;
    ctx.setTransform(s, 0, 0, s, view.dpr * view.offsetX, y0 - y);
    drawWord(ctx, pal, word);
    words.push({ img, y });
  }
}

/** One part of the title on a cleared canvas. */
function paintPart(view: View, pal: Palette, o: TitleOpts, part: number, ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawTitle(view, pal, o, part, ctx);
}

/**
 * The title frame. A button held, a toast, `o.over` (the app draws over this frame: the frame-time
 * overlay; the save notice, read here) or no layers: the whole frame on the game canvas every frame, the
 * layers blank. Reduced motion: that frame, painted again only when `titleKey` changes (the key is kept
 * on the blank HUD layer, so a resize or another screen's frame — both reset it — repaints it). Else the
 * layered idle frame described above.
 */
export function paintTitle(view: View, pal: Palette, o: TitleOpts): void {
  const L = view.layers;
  const key = o.over || o.pressed || o.toast || !L || isSaveReadOnly() || isSaveFailing() ? '' : titleKey(view, pal, o);
  if (!key || !motion()) {
    if (key && L!.hud.key === key) return;
    blankLayer(L?.ground);
    blankLayer(L?.hud);
    words = [];
    drawTitle(view, pal, o);
    if (key) L!.hud.key = key;
    return;
  }
  if (L!.hud.key !== key) {
    paintPart(view, pal, o, 1, L!.ground.ctx);
    paintPart(view, pal, o, 4, L!.hud.ctx);
    bakeWords(view, pal);
    L!.ground.key = L!.hud.key = key;
    worldAt = -1e9;
  }
  const since = o.nowMs - worldAt;
  if (since < BEAT_SLACK_MS) return;
  worldAt = since < 2 * TITLE_IDLE_FRAME_MS ? worldAt + TITLE_IDLE_FRAME_MS : o.nowMs;
  const ctx = view.ctx;
  paintPart(view, pal, o, words.length ? 2 : 10, ctx);
  // the baked words over the rest of the moving part (the chest, drawn after the wordmark on one canvas, is clear of it)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const [i, w] of words.entries()) ctx.drawImage(w.img, 0, w.y + Math.round(wordBob(o.nowMs, i) * view.dpr * view.scale));
}
