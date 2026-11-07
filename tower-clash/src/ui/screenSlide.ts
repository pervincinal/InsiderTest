import type { View } from '../render/view';
import { prefersReducedMotion } from '../render/particles';
import { repaintTitleNext } from '../render/titleIdle';
import type { FocusHost } from './focus';
import { drawFocus, focusKey } from './focus';
import type { Screen } from './screens';

/*
 * FEEL-1-6 (feel pass 2026-11-06): the title and the menu screens hard-cut into each other. Between the
 * title and a menu (level map, shop, settings, achievements — both directions) the app shell now runs a
 * SLIDE_MS ease-out slide + fade, implemented once here and driven by src/main.ts (`go` → `startSlide`,
 * every frame → `afterDraw`, input → `slideHeld` / `keyIn`):
 *
 *   - `startSlide` (before the switch) flattens the outgoing frame — the ground, game and HUD canvases
 *     (PERF-3 layers) as the player sees them — into an offscreen canvas;
 *   - every frame the incoming screen draws itself as usual, then `afterDraw` flattens it too and repaints
 *     the game canvas: the outgoing frame, under the incoming one at `alpha` and `dy` (`slidePose`: an
 *     ease-out cubic; into a menu it rises from SLIDE_PX below, back to the title it comes down from
 *     SLIDE_PX above). The HUD layer is hidden meanwhile (its pixels are in the composite);
 *   - the first frame where SLIDE_MS have passed draws the incoming screen alone: the slide has settled,
 *     the HUD layer is back, the two offscreen canvases are released (they are viewport-sized).
 *
 * Time 0 is the outgoing frame (one nominal frame before the first composite), so at 60 Hz the slide shows
 * 7 composites and settles on the 8th frame (≈ 133 ms after the tap's frame). Input while a slide runs is
 * not delivered: a press that starts during it is dropped with its moves / release, keys and wheel are
 * swallowed — the incoming screen gets input only once it has settled where it is drawn. Never between
 * play and result (the result timeline owns that cut), never on the lesson card or the how-to card (not
 * title ↔ menu pairs), never through the loading spinner; off under reduced motion (a cut, as before).
 * Nothing here is eager: the hooks in main.ts call through the lazy screens chunk, which is in whenever a
 * menu can be shown without the spinner.
 */

/** Length of the slide (ms from the outgoing frame to the settled incoming one). */
export const SLIDE_MS = 120;
/** How far (logical px) the incoming screen travels. */
export const SLIDE_PX = 40;
/** The outgoing frame is time 0, one nominal frame before the first composite. */
const FRAME_MS = 1000 / 60;

type ScreenName = Screen['name'];
const MENUS: ReadonlySet<ScreenName> = new Set<ScreenName>(['levelSelect', 'shop', 'settings', 'achievements']);

/** Title ↔ menu only: never play / result, the how-to card, the spinner. */
export function slides(from: ScreenName, to: ScreenName): boolean {
  return from === 'title' ? MENUS.has(to) : to === 'title' && MENUS.has(from);
}

/** Ease-out cubic on 0..1. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}

/** The incoming screen `ms` into a slide: its opacity and its offset (logical px; `dir` 1 = rising from below). */
export function slidePose(ms: number, dir: 1 | -1): { alpha: number; dy: number } {
  const e = easeOutCubic(ms / SLIDE_MS);
  return { alpha: e, dy: dir * SLIDE_PX * (1 - e) };
}

type Surface = Pick<HTMLCanvasElement, 'width' | 'height' | 'getContext'>;
let makeSurface = (): Surface => document.createElement('canvas');

/** Test hook: where the offscreen canvases come from (Vitest runs without a DOM). */
export function setSlideSurfaceForTests(make: (() => Surface) | null): void {
  makeSurface = make ?? (() => document.createElement('canvas'));
}

interface Slide {
  dir: 1 | -1;
  /** Frame clock of the outgoing frame, set by the first `afterDraw`. */
  start: number;
  out: Surface;
  inc: Surface;
}

let slide: Slide | null = null;
/** The current press began while a slide ran: its moves and release are not delivered either. */
let pressHeld = false;

/** The canvases the player sees, bottom to top. */
function stack(view: View): CanvasImageSource[] {
  const L = view.layers;
  return L ? [L.ground.canvas, view.canvas, L.hud.canvas] : [view.canvas];
}

/** Flatten `from` into `dst` at the game canvas' pixel size. */
function flatten(view: View, dst: Surface, from: CanvasImageSource[]): void {
  const w = view.canvas.width;
  const h = view.canvas.height;
  if (dst.width !== w) dst.width = w;
  if (dst.height !== h) dst.height = h;
  const c = dst.getContext('2d') as CanvasRenderingContext2D | null;
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.clearRect(0, 0, w, h);
  for (const el of from) c.drawImage(el, 0, 0);
}

function hud(view: View): { style: { visibility: string } } | undefined {
  return view.layers?.hud.canvas;
}

/** End the running slide (settled, or replaced by another navigation): the HUD layer back, the canvases freed. */
function end(view: View): void {
  const s = slide;
  if (!s) return;
  slide = null;
  const h = hud(view);
  if (h) h.style.visibility = '';
  s.out.width = s.out.height = s.inc.width = s.inc.height = 0;
  repaintTitleNext(); // the game canvas holds a composite: an idle title must not keep it for a skipped beat
}

/**
 * Called by the app shell before `host.current` becomes `to`: start a slide when the pair slides (and motion
 * is allowed), after ending any slide still running (another navigation won).
 */
export function startSlide(host: FocusHost, to: Pick<Screen, 'name'>): void {
  const view = host.view;
  const midway = slide !== null; // the game canvas holds the last composite and the HUD layer is hidden
  if (!slides(host.current.name, to.name) || prefersReducedMotion()) {
    end(view);
    return;
  }
  const out = slide?.out ?? makeSurface();
  const inc = slide?.inc ?? makeSurface();
  flatten(view, out, midway ? [view.canvas] : stack(view));
  slide = { dir: to.name === 'title' ? -1 : 1, start: Number.NaN, out, inc };
  const h = hud(view);
  if (h) h.style.visibility = 'hidden';
}

/** Composite this frame of the slide over what the incoming screen drew (no-op without one). */
export function drawSlide(view: View, nowMs: number): void {
  const s = slide;
  if (!s) return;
  if (Number.isNaN(s.start)) s.start = nowMs - FRAME_MS;
  const ms = nowMs - s.start;
  if (ms >= SLIDE_MS) {
    end(view);
    return;
  }
  const pose = slidePose(ms, s.dir);
  flatten(view, s.inc, stack(view));
  const ctx = view.ctx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(s.out as CanvasImageSource, 0, 0);
  ctx.globalAlpha = pose.alpha;
  ctx.drawImage(s.inc as CanvasImageSource, 0, Math.round(pose.dy * view.scale * view.dpr));
  ctx.restore();
  repaintTitleNext();
}

/** The app shell's per-frame hook after the screen drew: the slide's composite, then the keyboard focus ring (AUD-U27). */
export function afterDraw(host: FocusHost, nowMs: number): void {
  drawSlide(host.view, nowMs);
  drawFocus(host);
}

/**
 * Input gate (app shell): true = do not deliver. A press that starts while a slide runs is held back with its
 * moves and its release (or cancel); the wheel is held back while a slide runs.
 */
export function slideHeld(kind: 'down' | 'move' | 'up' | 'cancel' | 'wheel'): boolean {
  if (kind === 'wheel') return slide !== null;
  if (kind === 'down') return (pressHeld = slide !== null);
  const held = pressHeld;
  if (kind !== 'move') pressHeld = false;
  return held;
}

/** Keys (app shell): swallowed while a slide runs, else the menus' focus ring (src/ui/focus.ts `focusKey`). */
export function keyIn(host: FocusHost, e: KeyboardEvent): boolean {
  return slide !== null || focusKey(host, e);
}

/** No slide is running (e2e `transitionDone()`: input reaches the current screen). */
export function slideDone(): boolean {
  return slide === null;
}

/** Test hook: drop any slide and held press. */
export function resetSlideForTests(): void {
  slide = null;
  pressHeld = false;
}
