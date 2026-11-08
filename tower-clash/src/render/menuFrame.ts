import { C } from '../sim/constants';
import type { Palette } from './palette';
import type { View } from './view';
import { applyTransform, bleed } from './view';
import type { SeaColors } from './sea';
import { drawSea, menuSea } from './sea';
import type { Rect } from './widgets';
import { motion } from './menus';

/*
 * The lazy menu screens' frame (level map, settings, How to play, shop, achievements): the sea, the
 * glass header band and the menus' water. Only the menus*.ts drawings of the lazy screens chunk use it,
 * so it is out of the eager bundle (PERF-12: it was in menus.ts, which the title needs at boot).
 */

/**
 * Full-bleed sea (BUG-34) + logical transform; the caller ends the frame with `ctx.restore()`. No map
 * clip: the screen's content may run on into the margins of a tall / wide screen (the level map's
 * path, the shop list), which `toLogical` maps linearly, so whatever shows there is tappable too.
 */
export function beginFrame(view: View, pal: Palette, sea: SeaColors = menuSea(pal)): CanvasRenderingContext2D {
  const ctx = view.ctx;
  ctx.save();
  applyTransform(view);
  drawSea(ctx, view, sea);
  return ctx;
}

/** A menu's glass header band of layout height `h`, grown up to the screen's top edge and across its width (BUG-34). */
export function headerBand(view: View, h: number): Rect {
  const b = bleed(view);
  const pad = b.right > C.MAP_W ? 1 / (view.scale > 0 ? view.scale : 1) : 0;
  return { x: b.left, y: b.top, w: b.right - b.left + pad, h: h - b.top };
}

/** Gradient water with drifting sparkles (menus background; `scroll` parallaxes the sparkles). */
export function drawWater(ctx: CanvasRenderingContext2D, pal: Palette, nowMs: number, scroll: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, C.MAP_H);
  g.addColorStop(0, pal.waterTop);
  g.addColorStop(1, pal.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  // drifting sparkle dots (parallax: half the scroll speed)
  const drift = motion() ? nowMs / 1000 : 0;
  ctx.fillStyle = pal.waterSparkle;
  for (let i = 0; i < 26; i++) {
    const seed = i * 97.31;
    const x = ((seed * 7.3 + drift * (6 + (i % 4) * 3)) % 760) - 20;
    const y = (((seed * 3.7 - scroll * 0.5) % 1320) + 1320) % 1320 - 20;
    const w = 10 + (i % 3) * 6;
    ctx.beginPath();
    ctx.ellipse(x, y, w, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
