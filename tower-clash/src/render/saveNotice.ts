import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyTransform } from './view';
import { titleShifts } from './titleLayout';
import { drawPill, fitFontPx, font } from './widgets';
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
export const SAVE_NOTICE = Object.freeze({ y: 546, h: 50, maxW: 640, pad: 28, px: 20 });

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
  const px = Math.max(15, fitFontPx(ctx, text, n.px, n.maxW - n.pad * 2, '700'));
  ctx.font = font(px, '700');
  const w = Math.min(n.maxW, ctx.measureText(text).width + n.pad * 2);
  drawPill(ctx, { x: 360 - w / 2, y: n.y, w, h: n.h }, pal.toastError.face, shade(pal.toastError.face, -0.35));
  ctx.fillStyle = pal.toastError.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 360, n.y + n.h / 2 + 1, n.maxW - n.pad * 2);
  ctx.restore();
}
