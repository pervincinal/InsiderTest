/**
 * AUD-U27 (2026-11-05): desktop keyboard focus for the menus (game-ui-ux pattern 4). A focus ring walks
 * the current screen's tappable rects; nothing here changes a layout or a touch path.
 *
 * - Items: the screen's `focusRects()` (screen logical px, in reading order — rows top to bottom, each
 *   row left to right; a segmented control is one item per segment; a confirm card lists its safe
 *   answer first). The title and the pause card are listed here, from their eager layout tables, so
 *   the eager screens carry no focus code.
 * - Keys: Tab / Shift+Tab = next / previous (wrapping); ← / → the same; ↑ / ↓ = the nearest item in the
 *   row above / below (wrapping to the last / first item); Enter / Space = a tap at the item's centre
 *   (the screen's own `down` + `up`, the very path a finger takes); Escape stays the screen's back
 *   (`screen.key`). While the ring is hidden, Enter / Space / arrows keep their per-screen shortcuts
 *   (title Enter = PLAY, the level map / shop / achievements arrows scroll, shop ← / → switch tabs, the
 *   result's Enter = NEXT / RETRY): Tab brings the ring up, and so do arrows on screens that bind none.
 * - The ring shows only after such a key press and hides on any pointer press (main.ts `pointerdown`);
 *   touch never shows it. Keyboard mode carries over to the next screen, which opens on its first item.
 * - Lazy: this module is part of the lazy screens chunk (src/ui/lazyScreens.ts); main.ts calls it
 *   through `app.lazy`, so before the chunk is in the keys keep their old meaning.
 */
import type { View } from '../render/view';
import { applyTransform } from '../render/view';
import type { Rect } from '../render/widgets';
import { roundRect } from '../render/widgets';
import { PAUSE, TITLE } from '../render/layout';
import { titleRectShift, titleShifts } from '../render/titleLayout';
import type { PointerPoint } from '../input/pointer';
import type { Screen } from './screens';

/** A focusable rect (screen logical px). `band`: the screen y range it must lie in to be seen (a scrolling list); outside it the screen's `wheel` brings it in. */
export interface FocusItem extends Rect {
  band?: readonly [number, number];
}

/** What the focus model reads of the app shell. */
export interface FocusHost {
  readonly current: Screen;
  readonly view: View;
}

/** Ring geometry (logical px): gap outside the rect, corner radius, the ink under-stroke and the gold stroke over it. */
export const FOCUS_RING = Object.freeze({ pad: 6, radius: 16, inkPx: 9, goldPx: 5, ink: '#1e2a44', gold: '#ffcf3f' });

/** Screens whose own `key` binds the arrows (scroll, tabs): there the arrows move the ring only once Tab has brought it up. */
const ARROW_SCREENS: ReadonlySet<Screen['name']> = new Set(['levelSelect', 'shop', 'achievements']);

/** Room kept between a revealed item and its band's edges (logical px). */
const REVEAL_PAD = 24;

let shown = false;
let index = -1;
let owner: Screen | null = null;
let count = 0;

/** Rows top to bottom (an item joins a row when its centre is within half the smaller height of the row's first), each row left to right. */
export function readingOrder<T extends Rect>(rects: readonly T[]): T[] {
  const rows: T[][] = [];
  for (const r of [...rects].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2))) {
    const row = rows[rows.length - 1];
    const first = row?.[0];
    if (row && first && Math.abs(r.y + r.h / 2 - (first.y + first.h / 2)) < Math.min(first.h, r.h) / 2) row.push(r);
    else rows.push([r]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/** The `n` segments of a segmented control (menuWidgets `segmentAt` geometry: 4 px inset each side). */
export function segmentRects(r: Rect, n: number): Rect[] {
  const w = (r.w - 8) / n;
  return Array.from({ length: n }, (_, i) => ({ x: r.x + 4 + i * w, y: r.y, w, h: r.h }));
}

/** Layout rect `r` of screen `s` where it is drawn: moved with the band its centre lies in (`fromLayout`). */
export function onScreen(s: Pick<Screen, 'fromLayout'>, r: Rect, band?: readonly [number, number]): FocusItem {
  const c = s.fromLayout?.(r.x + r.w / 2, r.y + r.h / 2) ?? { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const out: FocusItem = { x: c.x - r.w / 2, y: c.y - r.h / 2, w: r.w, h: r.h };
  if (band) out.band = band;
  return out;
}

/** Screen y range of layout band [`top`, `bottom`) of a banded menu (the content viewport of its scrolling list). */
export function screenBand(s: Pick<Screen, 'fromLayout'>, top: number, bottom: number): readonly [number, number] {
  const map = (y: number): number => s.fromLayout?.(0, y).y ?? y;
  return [map(top), map(bottom - 0.001)];
}

/** The play screen's state as the focus model reads it (structurally: play.ts stays out of this chunk's imports). */
interface PlayLike {
  readonly loop: { readonly paused: boolean };
  readonly over: boolean;
}

/** The focus items of `s` on `view`, in order. */
export function focusItems(s: Screen, view: View): readonly FocusItem[] {
  if (s.name === 'title') {
    const sh = titleShifts(view);
    const list = [TITLE.play, TITLE.settings, TITLE.sound, TITLE.shop, TITLE.daily, TITLE.achievements, TITLE.wallet, TITLE.lang];
    return readingOrder(list).map((r) => ({ ...r, y: r.y + titleRectShift(sh, r) }));
  }
  if (s.name === 'play') {
    const p = s as unknown as PlayLike;
    // the pause card (identity coordinates; play.ts `cardButtonAt`)
    return p.loop.paused && !p.over ? readingOrder([PAUSE.resume, PAUSE.speed, PAUSE.sound, PAUSE.settings, PAUSE.retry, PAUSE.menu, PAUSE.howto]) : [];
  }
  const list = s.focusRects?.() ?? [];
  // the result card (its own lazy chunk, which imports nothing of this one) lists its buttons unordered; its spend card has two
  return s.name === 'result' && list.length > 2 ? readingOrder(list) : list;
}

/** Index after `i` going `dir` (±1) through `n` items, wrapping. */
export function step(i: number, dir: number, n: number): number {
  return (((i + dir) % n) + n) % n;
}

/** The nearest item in the row below (`dir` 1) / above (−1) item `i`: distance down the axis + 2 × across it; none → the first / last item. */
export function vertical(items: readonly Rect[], i: number, dir: 1 | -1): number {
  const c = items[i];
  if (!c) return 0;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  let best = -1;
  let score = Infinity;
  items.forEach((r, j) => {
    const dy = (r.y + r.h / 2 - cy) * dir;
    if (j === i || dy < Math.min(r.h, c.h) / 2) return;
    const sc = dy + 2 * Math.abs(r.x + r.w / 2 - cx);
    if (sc < score) {
      score = sc;
      best = j;
    }
  });
  return best >= 0 ? best : dir > 0 ? 0 : items.length - 1;
}

/** A tap at the centre of `r`: the screen's own `down` + `up` (no `move`), as a finger lifting where it landed. */
export function activate(s: Screen, r: Rect, nowMs: number = performance.now()): void {
  const p: PointerPoint = { id: -1, x: r.x + r.w / 2, y: r.y + r.h / 2, timeMs: nowMs };
  s.down?.(p);
  s.up?.(p);
}

/** Scroll a list item into its band through the screen's `wheel` (positive = content moves up). */
function reveal(s: Screen, it: FocusItem | undefined): void {
  if (!it?.band || !s.wheel) return;
  const [top, bottom] = it.band;
  const dy = it.y < top + REVEAL_PAD ? it.y - top - REVEAL_PAD : it.y + it.h > bottom - REVEAL_PAD ? it.y + it.h - bottom + REVEAL_PAD : 0;
  if (dy !== 0) s.wheel(dy);
}

/** Follow the host's current screen (a new one opens with no item, so its first key lands on its first item). */
function sync(host: FocusHost): readonly FocusItem[] {
  const s = host.current;
  const items = focusItems(s, host.view);
  if (s !== owner || items.length !== count) {
    owner = s;
    count = items.length;
    index = shown && items.length > 0 ? 0 : -1;
  }
  return items;
}

/**
 * A key press: true when the focus model took it (main.ts then skips the screen's `key`). Tab and the
 * arrows move (and first show) the ring, Enter / Space activate the ringed item while it shows.
 */
export function focusKey(host: FocusHost, e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const items = sync(host);
  const n = items.length;
  if (n === 0) return false;
  const s = host.current;
  const k = e.key;
  const arrow = k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight';
  if (k === 'Tab' || (arrow && (shown || !ARROW_SCREENS.has(s.name)))) {
    e.preventDefault();
    const back = k === 'ArrowLeft' || k === 'ArrowUp' || (k === 'Tab' && e.shiftKey);
    if (!shown || index < 0) {
      // the first press shows the ring: where it was before a pointer hid it, else on the first (last) item
      if (index < 0 || index >= n) index = back ? n - 1 : 0;
    } else if (k === 'ArrowUp' || k === 'ArrowDown') index = vertical(items, index, k === 'ArrowDown' ? 1 : -1);
    else index = step(index, back ? -1 : 1, n);
    shown = true;
    reveal(s, items[index]);
    return true;
  }
  if ((k === 'Enter' || k === ' ') && shown && index >= 0 && index < n) {
    e.preventDefault();
    activate(s, items[index]!);
    return true;
  }
  return false;
}

/** A pointer press: the ring hides (its item is kept for the next key press on this screen). */
export function hideFocus(): void {
  shown = false;
}

/** The ring's state for tests / e2e: shown, the item index, the item count and the ringed rect (screen logical px). */
export function focusState(host: FocusHost): { shown: boolean; index: number; count: number; rect: Rect | null } {
  const items = sync(host);
  const it = shown && index >= 0 ? items[index] : undefined;
  return { shown, index, count: items.length, rect: it ? { x: it.x, y: it.y, w: it.w, h: it.h } : null };
}

/** Draw the ring over the frame (after the screen drew): an ink stroke under a gold one, `FOCUS_RING.pad` outside the item. */
export function drawFocus(host: FocusHost): void {
  if (!shown) return;
  const items = sync(host);
  const it = index >= 0 ? items[index] : undefined;
  if (!it) return;
  const view = host.view;
  const ctx = view.ctx;
  const R = FOCUS_RING;
  ctx.save();
  applyTransform(view);
  const r: Rect = { x: it.x - R.pad, y: it.y - R.pad, w: it.w + 2 * R.pad, h: it.h + 2 * R.pad };
  roundRect(ctx, r, R.radius);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = R.ink;
  ctx.lineWidth = R.inkPx;
  ctx.stroke();
  ctx.strokeStyle = R.gold;
  ctx.lineWidth = R.goldPx;
  ctx.stroke();
  ctx.restore();
}

/** Tests: forget the ring (hidden, no item, no screen). */
export function resetFocusForTests(): void {
  shown = false;
  index = -1;
  owner = null;
  count = 0;
}
