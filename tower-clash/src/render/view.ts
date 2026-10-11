import { C } from '../sim/constants';
import { isNative } from '../native';
import { HUD } from './layout';
import type { Layers } from './layers';
import { resizeLayers } from './layers';

/** Device safe-area insets in CSS px (notch / home indicator / rounded corners). */
export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Letterbox fit of the 720×1280 logical map into the canvas.
 * Everything is drawn in logical units; `applyTransform` sets the canvas matrix so that
 * (0,0)-(720,1280) maps to the centred, aspect-preserving rectangle inside the canvas,
 * *excluding* the safe-area insets so the HUD never sits under a notch or the home indicator.
 * The rest of the canvas is not a bar (BUG-34): the sea and the HUD glass are painted full bleed
 * (`bleed`), and the play HUD's bands move out to the safe-area edges (`hudAnchors`).
 */
export interface View {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dpr: number;
  cssW: number; // canvas size in CSS px
  cssH: number;
  scale: number; // CSS px per logical px
  offsetX: number; // CSS px, left edge of the logical map
  offsetY: number;
  insets: SafeInsets;
  /** Static ground / HUD canvases stacked with the game canvas (PERF-3); absent in tests. */
  layers?: Layers;
}

/**
 * Device-pixel-ratio cap (MM-4). Every viewport canvas (ground / game / HUD, PERF-3) holds
 * cssW × cssH × dpr² × 4 bytes and the terrain cache another 720 × 1280 × (dpr · scale)² × 4 per
 * level (up to four levels). Measured headless at 390 × 844 CSS px (iPhone-class, 1170 × 2532
 * device px): DPR 3 → 3 × 11.3 MB + 9.7 MB terrain ≈ 44 MB; DPR 2.5 → 3 × 7.8 + 6.7 ≈ 30 MB;
 * DPR 2 → 3 × 5.0 + 4.3 ≈ 19 MB. The map is authored at 720 × 1280 logical px, so on a 390 px wide
 * phone DPR 2 still gives 1.08 device px per logical px (the art is never downsampled).
 *   native (Capacitor shell): 2 — the WebView shares the app process' memory budget and low-end
 *     GPUs are fill-rate bound compositing three full-screen layers every frame;
 *   web / PWA: 2.5 — browsers manage canvas memory themselves; keep DPR-3 phones sharper;
 *   max: hard ceiling either way (DPR 3.5 phones such as the Pixel 9 Pro XL were already clamped).
 * `?dprcap=N` in the page URL overrides the cap (1..max) for an on-device A/B without a rebuild;
 * `setDprCap` does the same from code (tests / debug console), followed by `resize(view)`.
 */
export const DPR_CAP = { native: 2, web: 2.5, max: 3 } as const;

let dprCapOverride: number | undefined;

/** Force a cap (undefined = back to the platform default). Call `resize(view)` afterwards. */
export function setDprCap(cap: number | undefined): void {
  dprCapOverride = cap === undefined || !Number.isFinite(cap) ? undefined : Math.min(DPR_CAP.max, Math.max(1, cap));
}

/** `?dprcap=N` from the page URL, or undefined. Read once per resize; cheap. */
function urlDprCap(): number | undefined {
  if (typeof location === 'undefined' || !location.search) return undefined;
  const v = parseFloat(new URLSearchParams(location.search).get('dprcap') ?? '');
  return Number.isFinite(v) && v > 0 ? Math.min(DPR_CAP.max, Math.max(1, v)) : undefined;
}

/**
 * The backing-store scale for a reported `devicePixelRatio`: clamped to 1..DPR_CAP.max, then to
 * the platform cap (`native` inside a Capacitor shell, `web` otherwise) unless overridden.
 */
export function effectiveDpr(devicePixelRatio: number, native: boolean = isNative(), override = dprCapOverride ?? urlDprCap()): number {
  const raw = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const cap = override ?? (native ? DPR_CAP.native : DPR_CAP.web);
  return Math.max(1, Math.min(DPR_CAP.max, cap, raw));
}

/** Bytes held by one viewport canvas at `dpr` (Σ over the three layers = 3 × this). */
export function canvasBytes(cssW: number, cssH: number, dpr: number): number {
  return Math.round(cssW * dpr) * Math.round(cssH * dpr) * 4;
}

export function createView(canvas: HTMLCanvasElement): View {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context not available');
  const view: View = {
    canvas,
    ctx,
    dpr: 1,
    cssW: 1,
    cssH: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  resize(view);
  return view;
}

const INSET_VARS: Record<keyof SafeInsets, string> = {
  top: '--safe-top',
  right: '--safe-right',
  bottom: '--safe-bottom',
  left: '--safe-left',
};

/**
 * Read `env(safe-area-inset-*)` through the custom properties index.html sets on the canvas'
 * parent (`#app`). Browsers without env() support (or desktop) resolve them to 0px.
 */
export function readSafeInsets(el: Element | null): SafeInsets {
  const out: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!el || typeof getComputedStyle !== 'function') return out;
  const style = getComputedStyle(el);
  for (const key of Object.keys(INSET_VARS) as (keyof SafeInsets)[]) {
    const v = parseFloat(style.getPropertyValue(INSET_VARS[key]));
    if (Number.isFinite(v) && v > 0) out[key] = v;
  }
  return out;
}

/** Re-measure the window and re-fit the logical map. Call on load, resize and orientation change. */
export function resize(view: View): void {
  const cssW = Math.max(1, window.innerWidth);
  const cssH = Math.max(1, window.innerHeight);
  const dpr = effectiveDpr(window.devicePixelRatio || 1);
  const insets = readSafeInsets(view.canvas.parentElement);
  // Never let insets eat more than half the viewport (defensive against bogus values).
  const usableW = Math.max(cssW / 2, cssW - insets.left - insets.right);
  const usableH = Math.max(cssH / 2, cssH - insets.top - insets.bottom);
  view.cssW = cssW;
  view.cssH = cssH;
  view.dpr = dpr;
  view.insets = insets;
  view.scale = Math.min(usableW / C.MAP_W, usableH / C.MAP_H);
  view.offsetX = Math.min(insets.left, cssW - usableW) + (usableW - C.MAP_W * view.scale) / 2;
  view.offsetY = Math.min(insets.top, cssH - usableH) + (usableH - C.MAP_H * view.scale) / 2;
  const pxW = Math.round(cssW * dpr);
  const pxH = Math.round(cssH * dpr);
  if (view.canvas.width !== pxW) view.canvas.width = pxW;
  if (view.canvas.height !== pxH) view.canvas.height = pxH;
  view.canvas.style.width = `${cssW}px`;
  view.canvas.style.height = `${cssH}px`;
  if (view.layers) resizeLayers(view.layers, view.canvas);
}

function sameInsets(a: SafeInsets, b: SafeInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * Re-read the safe-area insets and, only if they changed, run the same relayout as `resize` (MM-7).
 * WKWebView can deliver `env(safe-area-inset-*)` (Dynamic Island / home indicator) after the first
 * layout without firing a resize event; one getComputedStyle read per call. Returns true on relayout.
 */
export function refreshSafeInsets(view: View): boolean {
  if (sameInsets(readSafeInsets(view.canvas.parentElement), view.insets)) return false;
  resize(view);
  return true;
}

/** Frames after boot during which `insetProbe` re-reads the insets every frame. */
export const INSET_PROBE_FRAMES = 10;

/**
 * Per-frame hook for the first `frames` frames after boot: calls `refreshSafeInsets` each frame,
 * then becomes a no-op. `rearm()` restarts the window (e.g. when the page becomes visible again).
 */
export function insetProbe(view: View, frames: number = INSET_PROBE_FRAMES): { tick(): boolean; rearm(): void } {
  let left = frames;
  return {
    tick(): boolean {
      if (left <= 0) return false;
      left--;
      return refreshSafeInsets(view);
    },
    rearm(): void {
      left = frames;
    },
  };
}

/**
 * Full bleed (BUG-34): the whole canvas in logical units. The map rect is (0,0)-(720,1280); on any
 * aspect ratio other than 9:16 (or with safe-area insets) the canvas reaches past it — `top` < 0 and
 * `bottom` > 1280 on a tall phone, `left` < 0 and `right` > 720 on a wide screen. Backgrounds (the
 * sea), modal dims and the HUD's glass bands paint out to these edges so nothing reads as a frame.
 */
export interface Bleed {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

type Fit = Pick<View, 'cssW' | 'cssH' | 'scale' | 'offsetX' | 'offsetY'>;

export function bleed(view: Fit): Bleed {
  const s = view.scale > 0 ? view.scale : 1;
  return {
    left: view.offsetX > 0 ? -view.offsetX / s : 0,
    top: view.offsetY > 0 ? -view.offsetY / s : 0,
    right: Math.max(C.MAP_W, (view.cssW - view.offsetX) / s),
    bottom: Math.max(C.MAP_H, (view.cssH - view.offsetY) / s),
  };
}

/** `bleed` as a rect, padded by one CSS px on the far edges (the canvas is `round(css × dpr)` px; layers.ts). */
export function bleedRect(view: Fit): { x: number; y: number; w: number; h: number } {
  const b = bleed(view);
  const pad = 1 / (view.scale > 0 ? view.scale : 1);
  return { x: b.left, y: b.top, w: b.right - b.left + pad, h: b.bottom - b.top + pad };
}

/**
 * Where the play HUD's bands sit (BUG-34), as logical offsets from their layout positions
 * (`HUD.topBar` at y 0, `HUD.bottomBar` at y 1180): the top band moves up to the top safe-area edge
 * of the screen (`top` ≤ 0) and the bottom band down to the bottom safe-area edge (`bottom` ≥ 0).
 * Their glass reaches the screen edge (under the notch / home indicator); their content stays inside
 * the safe area. Both are 0 on a 9:16 screen without insets, where the map fills the screen.
 */
export interface HudAnchors {
  top: number;
  bottom: number;
}

export function hudAnchors(view: Fit & Pick<View, 'insets'>): HudAnchors {
  const s = view.scale;
  if (!(s > 0) || !view.insets) return { top: 0, bottom: 0 }; // not laid out yet (stub views in tests)
  const top = Math.min(0, (view.insets.top - view.offsetY) / s);
  const bottom = Math.max(0, (view.cssH - view.insets.bottom - view.offsetY) / s - C.MAP_H);
  return { top: Number.isFinite(top) ? top : 0, bottom: Number.isFinite(bottom) ? bottom : 0 };
}

/**
 * Screen logical point → HUD layout coordinates (the rects in layout.ts `HUD` / `BOOSTERS`): a point
 * on the moved top band (above its bottom edge) is shifted by `-a.top`, one on the moved bottom band
 * by `-a.bottom`, anything in between (the world) is returned as it is. Hit tests of the HUD rects
 * use this; the world (towers) uses the plain logical point.
 */
export function toHudSpace(a: HudAnchors, x: number, y: number): { x: number; y: number } {
  if (y < HUD.mapTop + a.top) return { x, y: y - a.top };
  if (y >= HUD.mapBottom + a.bottom) return { x, y: y - a.bottom };
  return { x, y };
}

/** Inverse of `toHudSpace` for a point on a HUD rect: where it is drawn on the screen (logical). */
export function fromHudSpace(a: HudAnchors, x: number, y: number): { x: number; y: number } {
  if (y < HUD.mapTop) return { x, y: y + a.top };
  if (y >= HUD.mapBottom) return { x, y: y + a.bottom };
  return { x, y };
}

/**
 * Client (CSS px, relative to viewport) → logical map coordinates. Linear over the whole canvas, so
 * it falls outside 0..720 / 0..1280 in the full-bleed margins (BUG-34): a tap on the moved HUD band
 * above the map has y < 0 — `toHudSpace` maps it back onto the HUD rects.
 */
export function toLogical(view: View, clientX: number, clientY: number): { x: number; y: number } {
  const rect = view.canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - view.offsetX) / view.scale,
    y: (clientY - rect.top - view.offsetY) / view.scale,
  };
}

/** Logical → client CSS px (used by tests / debugging). */
export function toClient(view: View, x: number, y: number): { x: number; y: number } {
  const rect = view.canvas.getBoundingClientRect();
  return { x: rect.left + view.offsetX + x * view.scale, y: rect.top + view.offsetY + y * view.scale };
}

/** Reset the matrix to device pixels (CSS px × dpr). */
export function applyDeviceTransform(view: View): void {
  view.ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}

/** Set the matrix so drawing happens in logical map units. */
export function applyTransform(view: View): void {
  const s = view.dpr * view.scale;
  view.ctx.setTransform(s, 0, 0, s, view.dpr * view.offsetX, view.dpr * view.offsetY);
}

/** Clip drawing to the logical map rectangle (call after applyTransform, inside save/restore). */
export function clipToMap(view: View): void {
  view.ctx.beginPath();
  view.ctx.rect(0, 0, C.MAP_W, C.MAP_H);
  view.ctx.clip();
}
