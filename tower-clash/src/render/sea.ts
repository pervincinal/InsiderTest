import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade, themeFor, withAlpha } from './palette';
import type { View } from './view';
import { bleed } from './view';

/*
 * Full-bleed sea (BUG-34). The logical map is letterboxed into the canvas; on a phone taller than
 * 9:16 (19.5:9 iPhones) or with safe-area insets the canvas reaches past it, and those margins used
 * to be a flat, darker "letterbox" blue that read as a broken frame around a lighter sea. Every screen
 * now paints this first: the map's own water gradient over the whole canvas — clamped past the map,
 * so the top margin continues the gradient's top colour and the bottom margin its bottom colour with
 * no seam at the map edge — plus the terrain's faint wave bands in the margins. Static (no motion, so
 * reduced motion needs nothing), from the active palette / terrain theme (colour-blind palette and
 * cosmetic themes included). Cost: one gradient fill (the old flat fill's area) and a few strokes; the
 * play screen bakes it into the cached ground layer (layers.ts), menus repaint it with their frame.
 */

export interface SeaColors {
  /** Gradient colour at the map's top edge (and above it). */
  top: string;
  /** Gradient colour at the map's bottom edge (and below it). */
  bottom: string;
  /** Wave band colour (drawn at 28 % alpha); undefined = flat water, no bands. */
  wave?: string;
  /** Theme wash (rgba) the play screen lays over the island every frame; baked into the margins. */
  ambient?: string;
}

/** The terrain's sea for an equipped theme (title / play): same colours as terrain.ts `drawWater`. */
export function terrainSea(pal: Palette, theme: string | undefined, withAmbient = false): SeaColors {
  const th = themeFor(theme);
  return {
    top: th.waterTop,
    bottom: th.waterBottom,
    wave: th.tintAmount > 0 ? shade(th.waterBottom, 0.35) : pal.waterLight,
    ambient: withAmbient ? th.ambient : undefined,
  };
}

/** The menus' sea (menus.ts `drawWater`: the palette's water gradient). */
export function menuSea(pal: Palette): SeaColors {
  return { top: pal.waterTop, bottom: pal.waterBottom, wave: pal.waterLight };
}

/*
 * ART-21 horizon (play screen only): with the tilted camera (camera.ts) the island's far shore
 * recedes and the sea above it is the distance — it fades into a pale, hazy sky tone toward the top
 * of the screen (aerial perspective), while the near sea under the island keeps the saturated
 * gradient. `paintHaze` is shared with the terrain cache (terrain.ts) so the map rows and the
 * full-bleed margins get identical pixels and no seam shows at the map's top edge.
 */

/** How far the haze colour lifts the sea's top colour toward white. */
export const HAZE_LIFT = 0.62;
/** Haze opacity where it is full (at and above `HAZE_FULL_Y`). */
export const HAZE_ALPHA = 0.72;
/** Logical y where the haze reaches full strength (clamped above, i.e. in the top margin). */
export const HAZE_FULL_Y = 40;

/** The hazy sky tone over the far sea. */
export function hazeColour(seaTop: string): string {
  return shade(seaTop, HAZE_LIFT);
}

/**
 * Haze over the rectangle (x0, y0, w) from y0 down to `horizonY`: full at `HAZE_FULL_Y` and above,
 * clear at `horizonY` (just past the island's far shore). Call in the logical frame.
 */
export function paintHaze(ctx: CanvasRenderingContext2D, seaTop: string, horizonY: number, x0: number, y0: number, w: number): void {
  if (!(horizonY > y0)) return;
  const c = hazeColour(seaTop);
  const g = ctx.createLinearGradient(0, horizonY, 0, Math.min(HAZE_FULL_Y, horizonY - 1));
  g.addColorStop(0, withAlpha(c, 0));
  g.addColorStop(0.45, withAlpha(c, HAZE_ALPHA * 0.42));
  g.addColorStop(1, withAlpha(c, HAZE_ALPHA));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, horizonY - y0);
}

/** Wave band spacing / first offset past a map edge (logical px), matching the terrain's 92 px bands. */
const BAND = 92;
const EDGE = 46;

/** Deterministic 0..1 per band index (amplitude / wavelength jitter without an rng stream). */
function jitter(k: number, salt: number): number {
  const v = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function waveBand(ctx: CanvasRenderingContext2D, y: number, x0: number, x1: number, k: number): void {
  const amp = 3 + jitter(k, 1) * 4;
  const len = 70 + jitter(k, 2) * 40;
  ctx.beginPath();
  ctx.moveTo(x0, y + Math.sin((x0 / len) * Math.PI * 2) * amp);
  for (let x = x0 + 8; x <= x1; x += 8) ctx.lineTo(x, y + Math.sin((x / len) * Math.PI * 2) * amp);
  ctx.stroke();
}

/**
 * Paint the sea over the whole canvas. Call with the logical transform active (`applyTransform`) and
 * no clip; the screen then draws its map content over (0,0)-(720,1280) as before. `horizonY` (play
 * screen with the tilted camera, ART-21): the haze over the far sea above that logical y, and no wave
 * bands in the top margin (the distance is calm).
 */
export function drawSea(ctx: CanvasRenderingContext2D, view: View, sea: SeaColors, horizonY?: number): void {
  const b = bleed(view);
  const pad = 1 / (view.scale > 0 ? view.scale : 1); // one CSS px past the rounded-up last column / row
  const x0 = b.left;
  const y0 = b.top;
  const w = b.right - b.left + pad;
  const h = b.bottom - b.top + pad;
  if (sea.top === sea.bottom) ctx.fillStyle = sea.top;
  else {
    const g = ctx.createLinearGradient(0, 0, 0, C.MAP_H);
    g.addColorStop(0, sea.top);
    g.addColorStop(1, sea.bottom);
    ctx.fillStyle = g;
  }
  ctx.fillRect(x0, y0, w, h);
  if (horizonY !== undefined) paintHaze(ctx, sea.top, horizonY, x0, y0, w);
  const margins = b.top < 0 || b.bottom > C.MAP_H || b.left < 0 || b.right > C.MAP_W;
  if (!margins) return; // 9:16: the map covers the canvas, nothing else shows
  if (sea.wave) {
    ctx.save();
    ctx.strokeStyle = sea.wave;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 4;
    const xa = b.left - 20;
    const xb = b.right + 20;
    // above the map: bands from 46 px over its top edge upwards; below: from 46 px under its bottom edge
    if (horizonY === undefined) for (let k = 0, y = -EDGE; y > b.top - 10; k++, y -= BAND) waveBand(ctx, y, xa, xb, -1 - k);
    for (let k = 0, y = C.MAP_H + EDGE; y < b.bottom + 10; k++, y += BAND) waveBand(ctx, y, xa, xb, 100 + k);
    // beside the map (wide screens): the terrain's band rhythm, only in the side margins
    if (b.left < 0 || b.right > C.MAP_W) {
      for (let k = 0, y = EDGE; y < C.MAP_H; k++, y += BAND) {
        if (horizonY !== undefined && y < horizonY) continue;
        if (b.left < 0) waveBand(ctx, y, xa, -12, 200 + k);
        if (b.right > C.MAP_W) waveBand(ctx, y, C.MAP_W + 12, xb, 300 + k);
      }
    }
    ctx.restore();
  }
  if (sea.ambient) {
    ctx.fillStyle = sea.ambient;
    ctx.fillRect(x0, y0, w, h);
  }
}
