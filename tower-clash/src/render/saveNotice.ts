import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyTransform } from './view';
import { titleShifts } from './titleLayout';
import { drawPill, fitTextLines } from './widgets';
import { t } from '../ui/i18n';

/*
 * Read-only save notice (AUD-Q3). Lazy: reached only through src/ui/lazyScreens.ts, so the code and
 * its English string (src/ui/locales/enMenus.ts) stay out of the eager bundle; the app draws it as
 * soon as that chunk is in, a moment after the title's first paint.
 */

/**
 * Title notice pill (AUD-Q3), layout px: drawn over the tagline pill (menus.ts drawTitle, y 548, h 46,
 * ≤ 600 wide) and moved with it (the `logo` group) — the one title slot that covers no tower, badge or
 * button on 9:16 and on tall phones alike.
 */
export const SAVE_NOTICE = Object.freeze({ y: 546, h: 50, maxW: 640, pad: 28, px: 22 });

/**
 * The persistent "Update Tower Clash to keep your progress" pill over the title while the save is
 * read-only (a newer build wrote it). Drawn by the app after the title screen's own frame.
 */
export function drawSaveNotice(view: View, pal: Palette, text: string = t('save.updateToKeep')): void {
  const ctx = view.ctx;
  ctx.save();
  applyTransform(view);
  ctx.translate(0, titleShifts(view).logo);
  const n = SAVE_NOTICE;
  // AUD-U2: 22 px (× text size), wrapped into the pill — which grows downwards — rather than squeezed
  const fit = fitTextLines(ctx, text, n.px, n.maxW - n.pad * 2, 3, '700', 1.2);
  const w = Math.min(n.maxW, Math.max(...fit.lines.map((l) => ctx.measureText(l).width)) + n.pad * 2);
  const h = Math.max(n.h, fit.lines.length * fit.lineH + 18);
  drawPill(ctx, { x: 360 - w / 2, y: n.y, w, h }, pal.toastError.face, shade(pal.toastError.face, -0.35));
  ctx.fillStyle = pal.toastError.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = n.y + (h - fit.lines.length * fit.lineH) / 2;
  fit.lines.forEach((l, i) => ctx.fillText(l, 360, top + fit.lineH * (i + 0.5) + 1));
  ctx.restore();
}
