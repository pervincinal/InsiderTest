import type { Palette, ToneSet } from './palette';
import { TONE_SETS, shade } from './palette';
import type { View } from './view';
import { bleedRect, hudAnchors } from './view';
import type { Rect, TextScale } from './widgets';
import { MIN_TEXT_PX, TEXT_SCALES, clipText, drawButton, drawCard, drawCoin, drawExtrudedText, drawGlassBand, drawStars, exemptFont, fitFontPx, fitTextLines, font, getTextScale } from './widgets';
import { drawChevronDisc, drawSegmented, drawToggle, paletteGlyph } from './menuWidgets';
import type { SettingsAboutLayout } from './menuLayout';
import { SETTINGS } from './menuLayout';
import type { ToastOpts } from './economyWidgets';
import { drawToast } from './economyWidgets';
import { beginFrame, drawWater, headerBand } from './menus';
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
  /** AUD-U2: the saved text size (`settings.textScale`, absent = 1) — the picker's selection. */
  textScale?: TextScale;
  /** The body's scroll (layout px; `SettingsScreen` scrolls it when it is taller than the screen). */
  scroll?: number;
  /** FE-14: the player's team-colour set (`settings.tones`; absent = classic) — the picker's selection. */
  tones?: ToneSet;
  /** The page's `?tones=` override when there is one (it wins over the setting: a dim note next to the title). */
  toneOverride?: ToneSet | null;
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
/** FE-14 "Team colours" picker: one segment per set, `TONE_SETS` order. */
export const TONE_SEGMENTS: readonly { key: 'settings.tonesClassic' | 'settings.tonesVivid' | 'settings.tonesRoyal' | 'settings.tonesPastel'; value: ToneSet }[] = TONE_SETS.map((value) => ({
  key: value === 'classic' ? 'settings.tonesClassic' : value === 'vivid' ? 'settings.tonesVivid' : value === 'royal' ? 'settings.tonesRoyal' : 'settings.tonesPastel',
  value,
}));
/** Label size of the team-colour segments (tests/render/contrast.test.ts fits every locale's names at it; AUD-U2: the 22 px floor). */
export const TONE_SEGMENT_PX = 22;
/** AUD-U2 "Text size" picker: one segment per `TEXT_SCALES` step (100 / 125 / 150 %). */
export const TEXT_SIZE_SEGMENTS: readonly TextScale[] = TEXT_SCALES;
/** Swatch strip of the "Team colours" title line: dot radius and centre step (logical px). */
export const TONE_SWATCH = Object.freeze({ r: 12, step: 30 });

/**
 * The live set's four team colours as small clay dots (shade drop, mid body, lit highlight), the last
 * one's right edge at `right`: what the picker's choice looks like without leaving the screen.
 */
function teamSwatches(ctx: CanvasRenderingContext2D, pal: Palette, right: number, cy: number): number {
  const { r, step } = TONE_SWATCH;
  const owners = ['player', 'enemy1', 'enemy2', 'enemy3'] as const;
  owners.forEach((o, i) => {
    const t = pal.ownerTones[o];
    const x = right - r - (owners.length - 1 - i) * step;
    ctx.fillStyle = t.shade;
    ctx.beginPath();
    ctx.arc(x + 1, cy + 2.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.mid;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.lit;
    ctx.beginPath();
    ctx.arc(x - r * 0.3, cy - r * 0.34, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
  });
  return right - (owners.length - 1) * step - 2 * r;
}

/**
 * A row's title over its grey line, left of `control` (AUD-U2): the line at the 22 px floor (was 17),
 * on one line where it fits (≤ 26 px at a bigger text size), else wrapped to two 22 px lines with the
 * title moved up; the title 26 px (≤ 36, ≤ 30 over two lines). Fitted, never squeezed. Returns the
 * title's drawn width.
 */
function settingsRow(ctx: CanvasRenderingContext2D, pal: Palette, control: Rect, title: string, sub: string, separator = true): number {
  const cy = control.y + (control.h - 4) / 2;
  const w = control.x - SETTINGS.labelX - 16;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const subFont = font(fitFontPx(ctx, sub, 22, w, '500'), '500', undefined, 26);
  ctx.font = subFont;
  const one = ctx.measureText(sub).width <= w;
  const two = one ? null : fitTextLines(ctx, sub, MIN_TEXT_PX / getTextScale(), w, 2, '500', 1.1);
  ctx.fillStyle = pal.ink;
  ctx.font = font(fitFontPx(ctx, title, 26, w), 'bold', undefined, one ? 36 : 30);
  const shown = clipText(ctx, title, w);
  const titleW = ctx.measureText(shown).width;
  ctx.fillText(shown, SETTINGS.labelX, one ? cy - 16 : cy - 24);
  ctx.fillStyle = pal.textDim;
  if (two) {
    // the wrap was measured in the subtitle font: set it again (the title's bold font is still on `ctx`)
    ctx.font = font(two.px, '500');
    two.lines.forEach((l, i) => ctx.fillText(l, SETTINGS.labelX, cy + 4 + i * two.lineH));
  } else {
    ctx.font = subFont;
    ctx.fillText(sub, SETTINGS.labelX, cy + 19);
  }
  // hairline separator under the row
  if (separator) {
    ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
    ctx.fillRect(SETTINGS.card.x + 28, control.y + SETTINGS.rowH - 22, SETTINGS.card.w - 56, 2);
  }
  return titleW;
}

/** One line fitted to `w` from `px` down to the floor (≤ `maxPx` drawn), "…" only past the floor (AUD-U2: never squeezed). */
function fitLine(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, px: number, weight: '500' | '700', maxPx: number): number {
  ctx.font = font(fitFontPx(ctx, text, px, w, weight), weight, undefined, maxPx);
  const shown = clipText(ctx, text, w);
  ctx.fillText(shown, x, y);
  return ctx.measureText(shown).width;
}

/**
 * About: "Tower Clash" with the version at the right of its line, "Progress is stored on this device"
 * under both (AUD-U2: the full card width, so the 22 px line fits every language), the store support
 * id with a COPY button, PRIVACY OPTIONS when the ads SDK asks for it.
 */
function drawAboutCard(ctx: CanvasRenderingContext2D, pal: Palette, o: SettingsOpts): void {
  const ab = o.about;
  drawCard(ctx, pal, ab.card);
  const x = SETTINGS.labelX;
  const right = ab.card.x + ab.card.w - 36;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = pal.ink;
  const nameW = fitLine(ctx, 'Tower Clash', x, ab.versionY - 16, right - x, 26, '700', 32);
  ctx.fillStyle = pal.textDim;
  fitLine(ctx, t('settings.aboutSub'), x, ab.versionY + 18, right - x, 22, '500', 26);
  ctx.textAlign = 'right';
  ctx.fillStyle = pal.ink;
  fitLine(ctx, t('settings.version', { v: o.version }), right, ab.versionY - 15, right - x - nameW - 20, 22, '500', 28);
  if (ab.supportY !== null && ab.copy && o.supportId !== null) {
    ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
    ctx.fillRect(ab.card.x + 28, ab.supportY - SETTINGS.aboutRowH / 2 - 2, ab.card.w - 56, 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.ink;
    fitLine(ctx, t('settings.supportId'), x, ab.supportY - 13, ab.copy.x - x - 16, 22, '700', 28);
    ctx.fillStyle = pal.textDim;
    fitLine(ctx, o.supportId, x, ab.supportY + 15, ab.copy.x - x - 16, 22, '500', 24);
    drawButton(ctx, pal, ab.copy, t('settings.copy'), { fontPx: 22, flat: true, pressed: o.pressed === ab.copy });
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
  // FE-11: on a tall screen the header sits on the top safe-area edge (a.top ≤ 0) and the cards follow it up
  const a = hudAnchors(view);
  ctx.save();
  ctx.translate(0, a.top - (o.scroll ?? 0)); // AUD-U2: the body scrolls when it is taller than the screen
  const card = SETTINGS.card;
  drawCard(ctx, pal, card);
  // rows
  settingsRow(ctx, pal, SETTINGS.sound, t('settings.sound'), t('settings.soundSub'));
  drawToggle(ctx, pal, SETTINGS.sound, o.soundOn, o.pressed === SETTINGS.sound);
  const cbLabel = t('settings.colorBlind');
  const cbW = settingsRow(ctx, pal, SETTINGS.colorBlind, cbLabel, t('settings.colorBlindSub'));
  // the palette dots after the title, kept clear of the toggle
  paletteGlyph(ctx, pal, Math.min(SETTINGS.labelX + cbW + 40, SETTINGS.colorBlind.x - 44), SETTINGS.colorBlind.y + (SETTINGS.colorBlind.h - 4) / 2 - 15, 15);
  drawToggle(ctx, pal, SETTINGS.colorBlind, o.colorBlind, o.pressed === SETTINGS.colorBlind);
  settingsRow(ctx, pal, SETTINGS.motion, t('settings.motion'), t('settings.motionSub'));
  drawSegmented(
    ctx,
    pal,
    SETTINGS.motion,
    MOTION_SEGMENTS.map((m) => ({ label: t(m.key) })),
    MOTION_SEGMENTS.findIndex((m) => m.value === o.reducedMotion),
    22,
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
    22,
  );
  // team colours (FE-14): hairline under the language picker, title line + live swatches, full-width picker
  ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
  ctx.fillRect(card.x + 28, SETTINGS.tonesLabelY - 2, card.w - 56, 2);
  const tonesCy = SETTINGS.tonesLabelY + 26;
  let titleRight = teamSwatches(ctx, pal, card.x + card.w - 36, tonesCy) - 16;
  ctx.textBaseline = 'middle';
  if (o.toneOverride) {
    // dev / A-B: the page URL decides this load; the picker still shows (and saves) the player's set
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.textDim;
    ctx.font = exemptFont('devNote', 15, '500'); // AUD-U2 exemption: a dev / A-B URL note, not player text
    const note = `?tones=${o.toneOverride}`;
    ctx.fillText(note, titleRight, tonesCy + 1);
    titleRight -= ctx.measureText(note).width + 12;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = pal.ink;
  fitLine(ctx, t('settings.tones'), SETTINGS.labelX, tonesCy, titleRight - SETTINGS.labelX, 26, '700', 36);
  drawSegmented(
    ctx,
    pal,
    SETTINGS.tones,
    TONE_SEGMENTS.map((s) => ({ label: t(s.key) })),
    TONE_SETS.indexOf(o.tones ?? 'classic'),
    TONE_SEGMENT_PX,
  );
  // text size (AUD-U2): hairline under the team colours, then a row like Reduced motion
  ctx.fillStyle = 'rgba(30, 42, 68, 0.1)';
  ctx.fillRect(card.x + 28, SETTINGS.textSizeSepY, card.w - 56, 2);
  settingsRow(ctx, pal, SETTINGS.textSize, t('settings.textSize'), t('settings.textSizeSub'), false);
  drawSegmented(
    ctx,
    pal,
    SETTINGS.textSize,
    TEXT_SIZE_SEGMENTS.map((k) => ({ label: t('settings.textSizePct', { n: Math.round(k * 100) }) })),
    TEXT_SIZE_SEGMENTS.indexOf(o.textScale ?? 1),
    22,
  );
  // progress summary + reset
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  const summary = t('settings.summary', { stars: o.totalStars, coins: o.coins });
  ctx.font = font(fitFontPx(ctx, summary, 22, 480, '500'), '500', undefined, 28);
  ctx.fillText(summary, 360 + 12, SETTINGS.summaryY);
  const sw = ctx.measureText(summary).width;
  drawStars(ctx, pal, 360 + 12 - sw / 2 - 22, SETTINGS.summaryY, 1, 10, [1, 0, 0]);
  drawCoin(ctx, pal, 360 + 12 + sw / 2 + 22, SETTINGS.summaryY, 11);
  // the danger red is a UI token (`toastError.face` = the classic / colour-blind owner-1 mid), so a team-colour set never recolours it (FE-14)
  const danger = pal.toastError.face;
  drawButton(ctx, pal, SETTINGS.reset, t('settings.reset'), { fontPx: 24, border: danger, text: danger, pressed: o.pressed === SETTINGS.reset });
  drawAboutCard(ctx, pal, o);
  ctx.restore();

  // header
  drawGlassBand(ctx, headerBand(view, SETTINGS.headerH + a.top)); // up to the screen's top edge (BUG-34)
  ctx.save();
  ctx.translate(0, a.top);
  drawButton(ctx, pal, SETTINGS.back, t('common.back'), { fontPx: 24, pressed: o.pressed === SETTINGS.back });
  const title = t('settings.title');
  drawExtrudedText(ctx, title, 360, 50, fitFontPx(ctx, title, 40, 380), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  ctx.restore();

  if (o.confirming) {
    ctx.fillStyle = 'rgba(26, 58, 90, 0.5)';
    const dim = bleedRect(view); // the whole screen (BUG-34)
    ctx.fillRect(dim.x, dim.y, dim.w, dim.h);
    const c = SETTINGS.confirm;
    drawCard(ctx, pal, c.card);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.ink;
    fitLine(ctx, t('settings.resetTitle'), 360, c.card.y + 62, c.card.w - 40, 34, '700', 44);
    ctx.fillStyle = pal.textDim;
    fitLine(ctx, t('settings.resetLine1'), 360, c.card.y + 114, c.card.w - 40, 22, '500', 28);
    fitLine(ctx, t('settings.resetLine2'), 360, c.card.y + 148, c.card.w - 40, 22, '500', 28);
    drawButton(ctx, pal, c.yes, t('settings.resetYes'), { fill: pal.toastError.face, fontPx: 26, pressed: o.pressed === c.yes });
    drawButton(ctx, pal, c.no, t('common.cancel'), { fontPx: 26, pressed: o.pressed === c.no });
  }
  if (o.toast) drawToast(ctx, pal, { ...o.toast, y: (o.toast.y ?? 1090) + a.bottom });
  ctx.restore();
}
