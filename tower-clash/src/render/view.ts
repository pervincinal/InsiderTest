import { C } from '../sim/constants';

/**
 * Letterbox fit of the 720×1280 logical map into the canvas.
 * Everything is drawn in logical units; `applyTransform` sets the canvas matrix so that
 * (0,0)-(720,1280) maps to the centred, aspect-preserving rectangle inside the canvas.
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
}

export function createView(canvas: HTMLCanvasElement): View {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context not available');
  const view: View = { canvas, ctx, dpr: 1, cssW: 1, cssH: 1, scale: 1, offsetX: 0, offsetY: 0 };
  resize(view);
  return view;
}

/** Re-measure the window and re-fit the logical map. Call on load, resize and orientation change. */
export function resize(view: View): void {
  const cssW = Math.max(1, window.innerWidth);
  const cssH = Math.max(1, window.innerHeight);
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  view.cssW = cssW;
  view.cssH = cssH;
  view.dpr = dpr;
  view.scale = Math.min(cssW / C.MAP_W, cssH / C.MAP_H);
  view.offsetX = (cssW - C.MAP_W * view.scale) / 2;
  view.offsetY = (cssH - C.MAP_H * view.scale) / 2;
  const pxW = Math.round(cssW * dpr);
  const pxH = Math.round(cssH * dpr);
  if (view.canvas.width !== pxW) view.canvas.width = pxW;
  if (view.canvas.height !== pxH) view.canvas.height = pxH;
  view.canvas.style.width = `${cssW}px`;
  view.canvas.style.height = `${cssH}px`;
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
