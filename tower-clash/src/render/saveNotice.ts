import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { applyTransform, hudAnchors } from './view';
import { titleShifts } from './titleLayout';
import { drawPill, fitTextLines } from './widgets';
import { HUD } from './layout';
import { C } from '../sim/constants';
import { t } from '../ui/i18n';
import { isSaveFailing } from '../ui/save';

/*
 * Save notices over the title and the result screen: read-only (AUD-Q3, "Update Tower Clash…") and
 * failing writes (AUD-Q10, "Progress could not be saved…"). Lazy: reached only through
 * src/ui/lazyScreens.ts, so the code and the English strings (src/ui/locales/enMenus.ts) stay out of
 * the eager bundle; the app draws it as soon as that chunk is in, a moment after the title's first
 * paint (src/main.ts `frame`, every frame the condition holds).
 */

/**
 * Title notice pill (AUD-Q3), layout px: drawn over the tagline pill (menus.ts drawTitle, y 548, h 46,
 * ≤ 600 wide) and moved with it (the `logo` group) — the one title slot that covers no tower, badge or
 * button on 9:16 and on tall phones alike.
 */
export const SAVE_NOTICE = Object.freeze({ y: 546, h: 50, maxW: 640, pad: 28, px: 22 });

/** Where the notice goes: over the title's tagline, or the result screen's footer (the dimmed bottom band). */
export type SaveNoticeScreen = 'title' | 'result';

/** The last notice drawn (QA surface `window.__towerclash.save.notice()`): which screen, the text and its pill, in layout px. */
export interface SaveNoticeRecord {
  screen: SaveNoticeScreen;
  text: string;
  y: number;
  h: number;
  /** `performance.now()` of the frame. */
  at: number;
}

let last: SaveNoticeRecord | null = null;

/** The most recent `drawSaveNotice` call, or null before the first. */
export function lastSaveNotice(): SaveNoticeRecord | null {
  return last;
}

/**
 * The persistent notice pill: "Progress could not be saved — free up space or check storage settings"
 * while writes fail (AUD-Q10; on the title and on the result screen's footer, so a win that did not
 * land is explained where it is celebrated), else "Update Tower Clash to keep your progress" while the
 * save is read-only (AUD-Q3; title only, as before). Drawn by the app after the screen's own frame on
 * `view.ctx` (the result screen draws unlayered — draw.ts `drawGame` uses the HUD layer only while
 * playing — so the game canvas is the top one there; the HUD layer is blank and must stay untouched,
 * `blankLayer` never clears a layer whose key is ''): on the title over the tagline (moved with the
 * `logo` group); on the result screen over the dimmed bottom band (whose MENU / wallet are disabled
 * there, AUD-U10), centred in it and kept above the screen's bottom edge when the text size wraps it
 * taller (AUD-U2).
 */
export function drawSaveNotice(view: View, pal: Palette, screen: SaveNoticeScreen = 'title', nowMs = performance.now()): void {
  const failing = isSaveFailing();
  if (screen === 'result' && !failing) return;
  const text = t(failing ? 'save.writeFailed' : 'save.updateToKeep');
  const ctx = view.ctx;
  ctx.save();
  applyTransform(view);
  const n = SAVE_NOTICE;
  // AUD-U2: 22 px (× text size), wrapped into the pill — which grows downwards — rather than squeezed
  const fit = fitTextLines(ctx, text, n.px, n.maxW - n.pad * 2, 3, '700', 1.2);
  const w = Math.min(n.maxW, Math.max(...fit.lines.map((l) => ctx.measureText(l).width)) + n.pad * 2);
  const h = Math.max(n.h, fit.lines.length * fit.lineH + 18);
  let y: number = n.y;
  if (screen === 'result') {
    const below = hudAnchors(view).bottom; // the band follows the safe-area bottom on a tall phone (FE-11)
    y = Math.min(HUD.mapBottom + below + (C.MAP_H - HUD.mapBottom - h) / 2, C.MAP_H + below - 8 - h);
  } else ctx.translate(0, titleShifts(view).logo);
  drawPill(ctx, { x: 360 - w / 2, y, w, h }, pal.toastError.face, shade(pal.toastError.face, -0.35));
  ctx.fillStyle = pal.toastError.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const top = y + (h - fit.lines.length * fit.lineH) / 2;
  fit.lines.forEach((l, i) => ctx.fillText(l, 360, top + fit.lineH * (i + 0.5) + 1));
  ctx.restore();
  last = { screen, text, y, h, at: nowMs };
}
