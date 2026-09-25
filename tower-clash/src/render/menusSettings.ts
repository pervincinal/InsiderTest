import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import type { Rect } from './widgets';
import { drawButton, drawCard, drawCoin, drawExtrudedText, drawGlassBand, drawStars, fitFontPx, font } from './widgets';
import { drawChevronDisc, drawSegmented, drawToggle, paletteGlyph } from './menuWidgets';
import type { SettingsAboutLayout } from './menuLayout';
import { SETTINGS } from './layout';
import type { ToastOpts } from './economyWidgets';
import { drawToast } from './economyWidgets';
import { beginFrame, drawWater } from './menus';
import type { MotionPref } from '../ui/save';
import type { Language } from '../ui/i18n';
import { LANGUAGES, t } from '../ui/i18n';

/*
 * Settings screen drawing (M3-3 + I18N). Loaded lazily with `SettingsScreen` (PERF-1); the hit
 * rectangles are `SETTINGS` in layout.ts. Reads its options only.
 */

export interface SettingsOpts {
  soundOn: boolean;
  colorBlind: boolean;
  reducedMotion: MotionPref;
  language: Language;
  /** Reset-progress confirm card is open. */
  confirming: boolean;
  totalStars: number;
  coins: number;
  /** About card: app version, optional support id (tap COPY) and the native privacy-options entry. */
  about: SettingsAboutLayout;
  version: string;
  supportId: string | null;
  nowMs: number;
  pressed?: Rect | null;
  toast?: ToastOpts | null;
}

export const MOTION_SEGMENTS: readonly { key: 'settings.motionAuto' | 'common.on' | 'common.off'; value: MotionPref }[] = [
  { key: 'settings.motionAuto', value: 'auto' },
  { key: 'common.on', value: 'on' },
  { key: 'common.off', value: 'off' },
];
/** Picker order = `LANGUAGES` (one segment each). */
export const LANGUAGE_SEGMENTS = LANGUAGES;

function settingsRow(ctx: CanvasRenderingContext2D, pal: Palette, control: Rect, title: string, sub: string, separator = true): void {
  const cy = control.y + (control.h - 4) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(26);
  ctx.fillText(title, SETTINGS.labelX, cy - 12, control.x - SETTINGS.labelX - 16);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(17, '500');
  ctx.fillText(sub, SETTINGS.labelX, cy + 16, control.x - SETTINGS.labelX - 16);
  // hairline separator under the row
  if (separator) {
    ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
    ctx.fillRect(SETTINGS.card.x + 28, control.y + SETTINGS.rowH - 22, SETTINGS.card.w - 56, 2);
  }
}

/** About: "Tower Clash · Version x.y.z", the store support id with a COPY button, PRIVACY OPTIONS when the ads SDK asks for it. */
function drawAboutCard(ctx: CanvasRenderingContext2D, pal: Palette, o: SettingsOpts): void {
  const ab = o.about;
  drawCard(ctx, pal, ab.card);
  const x = SETTINGS.labelX;
  const right = ab.card.x + ab.card.w - 36;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = pal.ink;
  ctx.font = font(26);
  ctx.fillText('Tower Clash', x, ab.versionY - 12);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(17, '500');
  ctx.fillText(t('settings.aboutSub'), x, ab.versionY + 16, ab.card.w - 260);
  ctx.textAlign = 'right';
  ctx.fillStyle = pal.ink;
  ctx.font = font(20, '500');
  ctx.fillText(t('settings.version', { v: o.version }), right, ab.versionY + 2, 220);
  if (ab.supportY !== null && ab.copy && o.supportId !== null) {
    ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
    ctx.fillRect(ab.card.x + 28, ab.supportY - SETTINGS.aboutRowH / 2 - 2, ab.card.w - 56, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.ink;
    ctx.font = font(22);
    ctx.fillText(t('settings.supportId'), x, ab.supportY - 12, ab.copy.x - x - 16);
    ctx.fillStyle = pal.textDim;
    ctx.font = font(16, '500');
    ctx.fillText(o.supportId, x, ab.supportY + 15, ab.copy.x - x - 16);
    drawButton(ctx, pal, ab.copy, t('settings.copy'), { fontPx: 19, flat: true, pressed: o.pressed === ab.copy });
  }
  if (ab.privacy) {
    ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
    ctx.fillRect(ab.card.x + 28, ab.privacy.y - 12, ab.card.w - 56, 2);
    drawButton(ctx, pal, ab.privacy, t('settings.privacy'), { fontPx: 22, pressed: o.pressed === ab.privacy });
  }
}

export function drawSettings(view: View, pal: Palette, o: SettingsOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, 0);
  const card = SETTINGS.card;
  drawCard(ctx, pal, card);
  // rows
  settingsRow(ctx, pal, SETTINGS.sound, t('settings.sound'), t('settings.soundSub'));
  drawToggle(ctx, pal, SETTINGS.sound, o.soundOn, o.pressed === SETTINGS.sound);
  const cbLabel = t('settings.colorBlind');
  settingsRow(ctx, pal, SETTINGS.colorBlind, cbLabel, t('settings.colorBlindSub'));
  ctx.font = font(26);
  paletteGlyph(ctx, pal, SETTINGS.labelX + Math.min(ctx.measureText(cbLabel).width, 230) + 40, SETTINGS.colorBlind.y + (SETTINGS.colorBlind.h - 4) / 2 - 13, 15);
  drawToggle(ctx, pal, SETTINGS.colorBlind, o.colorBlind, o.pressed === SETTINGS.colorBlind);
  settingsRow(ctx, pal, SETTINGS.motion, t('settings.motion'), t('settings.motionSub'));
  drawSegmented(
    ctx,
    pal,
    SETTINGS.motion,
    MOTION_SEGMENTS.map((m) => ({ label: t(m.key) })),
    MOTION_SEGMENTS.findIndex((m) => m.value === o.reducedMotion),
    20,
  );
  // "How to play" (FE-3): the whole row opens the card; a chevron disc at the right says so
  const howtoLabel: Rect = { x: SETTINGS.howto.x + SETTINGS.howto.w - 70, y: SETTINGS.howto.y + 4, w: 70, h: 56 };
  settingsRow(ctx, pal, howtoLabel, t('settings.howto'), t('settings.howtoSub'));
  drawChevronDisc(ctx, pal, SETTINGS.howto.x + SETTINGS.howto.w - 36, SETTINGS.howto.y + SETTINGS.howto.h / 2 - 2, 24, o.pressed === SETTINGS.howto);
  // language: label line, then a full-width picker (I18N)
  const langLabel: Rect = { x: card.x + card.w - 36, y: SETTINGS.languageLabelY, w: 0, h: 56 };
  settingsRow(ctx, pal, langLabel, t('settings.language'), t('settings.languageSub'), false);
  drawSegmented(
    ctx,
    pal,
    SETTINGS.language,
    LANGUAGE_SEGMENTS.map((l) => ({ label: l.label })),
    LANGUAGE_SEGMENTS.findIndex((l) => l.code === o.language),
    17,
  );
  // progress summary + reset
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.font = font(20, '500');
  const summary = t('settings.summary', { stars: o.totalStars, coins: o.coins });
  ctx.fillText(summary, 360 + 12, SETTINGS.reset.y - 44);
  const sw = ctx.measureText(summary).width;
  drawStars(ctx, pal, 360 + 12 - sw / 2 - 22, SETTINGS.reset.y - 44, 1, 10, [1, 0, 0]);
  drawCoin(ctx, pal, 360 + 12 + sw / 2 + 22, SETTINGS.reset.y - 44, 11);
  drawButton(ctx, pal, SETTINGS.reset, t('settings.reset'), { fontPx: 24, border: pal.owners.enemy1, text: pal.owners.enemy1, pressed: o.pressed === SETTINGS.reset });
  drawAboutCard(ctx, pal, o);

  // header
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: SETTINGS.headerH });
  drawButton(ctx, pal, SETTINGS.back, t('common.back'), { fontPx: 24, pressed: o.pressed === SETTINGS.back });
  const title = t('settings.title');
  drawExtrudedText(ctx, title, 360, 50, fitFontPx(ctx, title, 40, 380), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });

  if (o.confirming) {
    ctx.fillStyle = 'rgba(26, 58, 90, 0.5)';
    ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
    const c = SETTINGS.confirm;
    drawCard(ctx, pal, c.card);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.ink;
    ctx.font = font(34);
    ctx.fillText(t('settings.resetTitle'), 360, c.card.y + 62, c.card.w - 40);
    ctx.fillStyle = pal.textDim;
    ctx.font = font(21, '500');
    ctx.fillText(t('settings.resetLine1'), 360, c.card.y + 116, c.card.w - 40);
    ctx.fillText(t('settings.resetLine2'), 360, c.card.y + 146, c.card.w - 40);
    drawButton(ctx, pal, c.yes, t('settings.resetYes'), { fill: pal.owners.enemy1, fontPx: 26, pressed: o.pressed === c.yes });
    drawButton(ctx, pal, c.no, t('common.cancel'), { fontPx: 26, pressed: o.pressed === c.no });
  }
  if (o.toast) drawToast(ctx, pal, o.toast);
  ctx.restore();
}
