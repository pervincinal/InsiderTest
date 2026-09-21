import type { Palette } from './palette';
import { shade } from './palette';
import type { Rect, Segment } from './widgets';
import { BUTTON_EDGE, PRESS_DROP, SHADOW_INK, drawButton, font, inRect, innerHighlight, roundRect } from './widgets';
import { t } from '../ui/i18n';

/*
 * Widgets only the lazily loaded menu screens use (settings, shop, level map): kept out of
 * widgets.ts so they stay off the eager chunk (scripts/checkBundle.mjs budget, PERF-1 / PERF-3 /
 * PERF-5). `drawStar` stays eager: the HUD's result stars (`drawStarPop`) draw through it.
 */

/**
 * Segmented control on a clay button face: `active` segment is a raised blue pill with paper
 * text, the rest are dim labels. Segments split `r` evenly; hit-test with `segmentAt`.
 */
export function drawSegmented(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, segments: readonly Segment[], active: number, fontPx = 22): void {
  drawButton(ctx, pal, r, '');
  const segW = (r.w - 8) / segments.length;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  segments.forEach((seg, i) => {
    const sr: Rect = {
      x: r.x + 4 + i * segW,
      y: r.y + 6,
      w: segW,
      h: r.h - BUTTON_EDGE - 12,
    };
    const on = i === active;
    if (on) {
      roundRect(ctx, { x: sr.x, y: sr.y + 2, w: sr.w, h: sr.h }, 12);
      ctx.fillStyle = shade(pal.owners.player, -0.4);
      ctx.fill();
      roundRect(ctx, sr, 12);
      ctx.fillStyle = pal.owners.player;
      ctx.fill();
      innerHighlight(ctx, sr, 12, 0.45);
    }
    ctx.fillStyle = on ? pal.paper : pal.textDim;
    ctx.font = font(fontPx);
    ctx.fillText(seg.label, sr.x + sr.w / 2, sr.y + sr.h / 2 + 1, sr.w - 6);
  });
  ctx.restore();
}

/** Index of the segment under logical x for a control drawn with `drawSegmented` (-1 outside). */
export function segmentAt(r: Rect, count: number, x: number, y: number): number {
  if (!inRect(r, x, y)) return -1;
  return Math.max(0, Math.min(count - 1, Math.floor(((x - r.x - 4) / (r.w - 8)) * count)));
}

/** ON/OFF toggle: clay track (blue when on) with a paper knob that slides right when on. */
export function drawToggle(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, on: boolean, pressed = false): void {
  const track = on ? pal.owners.player : shade(pal.panel, -0.12);
  drawButton(ctx, pal, r, '', { fill: on ? track : undefined, pressed });
  const faceH = r.h - BUTTON_EDGE;
  const knobR = faceH / 2 - 8;
  const kx = on ? r.x + r.w - 8 - knobR : r.x + 8 + knobR;
  const ky = r.y + faceH / 2 + (pressed ? PRESS_DROP : 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(kx + 1, ky + 3, knobR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${SHADOW_INK}, 0.25)`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(kx, ky, knobR, 0, Math.PI * 2);
  ctx.fillStyle = pal.paper;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(kx - knobR * 0.25, ky - knobR * 0.4, knobR * 0.35, knobR * 0.18, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = on ? pal.paper : pal.textDim;
  ctx.font = font(20);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelX = on ? r.x + (r.w - knobR * 2 - 16) / 2 : r.x + knobR * 2 + 16 + (r.w - knobR * 2 - 16) / 2;
  ctx.fillText(on ? t('common.on') : t('common.off'), labelX, ky + 1, r.w - knobR * 2 - 20);
  ctx.restore();
}

/* ---------- glyphs for the settings row ---------- */

/** Three owner-coloured clay dots: the colour-blind palette toggle. */
export function paletteGlyph(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, s: number): void {
  const colours = [pal.owners.player, pal.owners.enemy1, pal.owners.enemy2];
  colours.forEach((c, i) => {
    const x = cx + (i - 1) * s * 0.85;
    ctx.fillStyle = shade(c, -0.35);
    ctx.beginPath();
    ctx.arc(x + 1, cy + 2, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, cy, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(x - s * 0.12, cy - s * 0.14, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ---------- level map glyphs (PERF-5: moved from widgets.ts) ---------- */

/** Clay padlock centred at (cx, cy); `size` is the body width. */
export function drawLock(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, size: number): void {
  const bodyH = size * 0.78;
  const bodyY = cy - bodyH / 2 + size * 0.22;
  ctx.save();
  ctx.strokeStyle = shade(color, -0.25);
  ctx.lineWidth = Math.max(3, size * 0.15);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, bodyY, size * 0.3, Math.PI, 0);
  ctx.stroke();
  roundRect(ctx, { x: cx - size / 2, y: bodyY + size * 0.06, w: size, h: bodyH }, size * 0.18);
  ctx.fillStyle = shade(color, -0.3);
  ctx.fill();
  roundRect(ctx, { x: cx - size / 2, y: bodyY, w: size, h: bodyH }, size * 0.18);
  ctx.fillStyle = color;
  ctx.fill();
  innerHighlight(ctx, { x: cx - size / 2, y: bodyY, w: size, h: bodyH }, size * 0.18, 0.5);
  ctx.fillStyle = shade(color, -0.45);
  ctx.beginPath();
  ctx.arc(cx, bodyY + bodyH * 0.42, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - size * 0.05, bodyY + bodyH * 0.45, size * 0.1, bodyH * 0.25);
  ctx.restore();
}

/** Small triangular pennant on a pole (level-select "you are here", HUD flourishes). */
export function drawFlag(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, h: number, wave = 0): void {
  ctx.save();
  ctx.strokeStyle = '#6b5a45';
  ctx.lineWidth = Math.max(2, h * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  const w = h * 0.7;
  const fh = h * 0.42;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + w * 0.5, y - h + wave, x + w, y - h + fh * 0.5 + wave);
  ctx.quadraticCurveTo(x + w * 0.5, y - h + fh + wave, x, y - h + fh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + w * 0.5, y - h + wave, x + w, y - h + fh * 0.5 + wave);
  ctx.lineTo(x + w * 0.5, y - h + fh * 0.35 + wave * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
