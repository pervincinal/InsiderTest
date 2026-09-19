import { C } from '../sim/constants';
import { isNative } from '../native';
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

/** Client (CSS px, relative to viewport) → logical map coordinates. May fall outside 0..720/0..1280. */
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

/** Reset the matrix to device pixels (for painting the letterbox bars). */
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
