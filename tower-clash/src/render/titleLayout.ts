import { C } from '../sim/constants';
import type { View } from './view';
import { hudAnchors } from './view';
import type { Rect } from './widgets';
import { TITLE } from './layout';

/*
 * FE-12 (TestFlight build 12, iPhone 430×932: "on the main screen the sea part is too big"). The
 * title island is authored inside the 720×1280 map, which a 19.5:9 phone letterboxes: ~17 % of the
 * screen above the island and ~15 % below it was plain sea. On a screen taller than 9:16 the island
 * now grows to the safe-area edges (a thin sea rim of `TITLE_RIM_CSS` stays), and the title's
 * groups move with the part of the island they sit on:
 *
 *   group    | layout content                                   | shift (logical px)
 *   ---------+--------------------------------------------------+------------------------------
 *   top      | island top edge, the two top demo towers         | `top`    (≤ 0, rim to the safe top)
 *   logo     | wordmark, its shadow, tagline pill               | `logo` = top / 2
 *   mid      | PLAY, settings · sound, SHOP                     | `mid`  = 0 (PLAY stays put)
 *   bottom   | bottom tower, trophy, chest, wallet, island foot | `bottom` (≥ 0, rim / wallet gap)
 *   safeTop  | language chip                                    | the top safe edge (`hudAnchors.top`)
 *
 * Nothing scales: the groups translate, and the island's ground image stretches only in three bands
 * of plain grass between the groups (`TITLE_GROUND_BANDS`). Drawing and hit tests use the same
 * shifts (`titleRectShift`); `titleToScreen` / `screenToTitle` are the continuous layout ↔ screen
 * map behind the e2e hook `layoutToClient`. On 9:16 (and on wide screens) every shift is 0 and the
 * title draws exactly as before.
 */

/** Island band of the title terrain (menus.ts DEMO_TERRAIN): grass top edge, and the cliff foot (bottom 1150 + CLIFF_DEPTH 30). */
export const TITLE_ISLAND = Object.freeze({ top: 120, bottom: 1150, foot: 1180 });

/** Sea left between the island and the safe-area edge on a tall screen, CSS px. */
export const TITLE_RIM_CSS = 24;
/** Gap kept between the wallet footer and the bottom safe edge, CSS px (the wallet hangs below the island foot). */
export const TITLE_WALLET_GAP_CSS = 12;
/** Extra room past the map (logical px, per edge) over which the island grows from its 9:16 shape to the full rim fit. */
export const TITLE_RAMP = 60;

export interface TitleShifts {
  top: number;
  logo: number;
  mid: number;
  bottom: number;
  /** The language chip: the top safe-area edge (`hudAnchors(view).top`). */
  safeTop: number;
}

export const NO_TITLE_SHIFTS: TitleShifts = Object.freeze({ top: 0, logo: 0, mid: 0, bottom: 0, safeTop: 0 });

export type TitleGroup = Exclude<keyof TitleShifts, 'safeTop'>;

/**
 * The title's group shifts on `view`. Top: the island's top edge `TITLE_RIM_CSS` under the top safe
 * edge. Bottom: its foot as far down, but the wallet footer (which hangs below the foot) stays
 * `TITLE_WALLET_GAP_CSS` over the bottom safe edge. Both ramp in over the first `TITLE_RAMP` px of
 * extra room, so a screen a little taller than 9:16 changes a little. Rounded to whole device pixels:
 * the moved pieces of the ground image keep the pixel phase of the unmoved one (no resampling blur).
 */
export function titleShifts(view: Pick<View, 'cssW' | 'cssH' | 'scale' | 'offsetX' | 'offsetY' | 'insets' | 'dpr'>): TitleShifts {
  const a = hudAnchors(view);
  const s = view.scale;
  if (!(s > 0) || (a.top === 0 && a.bottom === 0)) return NO_TITLE_SHIFTS;
  const rim = TITLE_RIM_CSS / s;
  const rampTop = Math.min(1, -a.top / TITLE_RAMP);
  const rampBottom = Math.min(1, a.bottom / TITLE_RAMP);
  const top = a.top - Math.max(0, TITLE_ISLAND.top - rim) * rampTop;
  const walletRoom = C.MAP_H - (TITLE.wallet.y + TITLE.wallet.h) - TITLE_WALLET_GAP_CSS / s;
  const bottom = a.bottom + Math.max(0, Math.min(C.MAP_H - TITLE_ISLAND.foot - rim, walletRoom)) * rampBottom;
  const px = 1 / (s * (view.dpr > 0 ? view.dpr : 1));
  const snap = (v: number): number => Math.round(v / px) * px;
  return { top: snap(top), logo: snap(top / 2), mid: 0, bottom: snap(bottom), safeTop: a.top };
}

/**
 * Layout knots of the continuous layout → screen map: below `y0` a group's shift, above `y1` the
 * next one's, linear in between (`y0 === y1`: a step — the screen gap it opens maps back onto `y0`,
 * where no button is). The bands lie between the groups' drawings: under the top towers' feet and
 * over the wordmark; under the tagline and over PLAY; under SHOP and over the bottom tower's badge.
 */
const UI_KNOTS: readonly { y0: number; y1: number; from: TitleGroup; to: TitleGroup }[] = [
  { y0: 280, y1: 310, from: 'top', to: 'logo' },
  { y0: 598, y1: 636, from: 'logo', to: 'mid' },
  { y0: 929, y1: 929, from: 'mid', to: 'bottom' },
];

/**
 * Rows of the title ground image (layout y) that stretch on a tall screen: plain grass and the
 * straight stretch of the coast, no bush, rock or flower patch (DEMO_TERRAIN seed 42, measured
 * row-to-row in the 720×1280 render). Everything else of the image moves rigidly with its group.
 */
export const TITLE_GROUND_BANDS: readonly { y0: number; y1: number; from: TitleGroup; to: TitleGroup }[] = [
  { y0: 212, y1: 364, from: 'top', to: 'logo' },
  { y0: 700, y1: 776, from: 'logo', to: 'mid' },
  { y0: 890, y1: 994, from: 'mid', to: 'bottom' },
];

/** Shift of a title rect (TITLE in layout.ts) where it is drawn and hit-tested. */
export function titleRectShift(sh: TitleShifts, r: Rect): number {
  if (r === TITLE.lang) return sh.safeTop;
  if (r === TITLE.daily || r === TITLE.achievements || r === TITLE.wallet) return sh.bottom;
  return sh.mid;
}

/** Layout y → screen logical y of the title's continuous map (`UI_KNOTS`). */
function mapY(sh: TitleShifts, y: number): number {
  let shift = sh.top;
  for (const k of UI_KNOTS) {
    if (y < k.y0) break;
    if (y >= k.y1) {
      shift = sh[k.to];
      continue;
    }
    const f = (y - k.y0) / (k.y1 - k.y0);
    return y + sh[k.from] + (sh[k.to] - sh[k.from]) * f;
  }
  return y + shift;
}

/** Inverse of `mapY` (monotone; a step's screen gap maps onto its knot). */
function unmapY(sh: TitleShifts, y: number): number {
  let shift = sh.top;
  for (const k of UI_KNOTS) {
    const s0 = k.y0 + sh[k.from];
    const s1 = k.y1 + sh[k.to];
    if (y < s0) break;
    if (y >= s1) {
      shift = sh[k.to];
      continue;
    }
    return s1 > s0 ? k.y0 + ((y - s0) / (s1 - s0)) * (k.y1 - k.y0) : k.y0;
  }
  return y - shift;
}

/** Where title layout point (x, y) is drawn (screen logical). The language chip follows the top safe edge. */
export function titleToScreen(sh: TitleShifts, x: number, y: number): { x: number; y: number } {
  const l = TITLE.lang;
  if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return { x, y: y + sh.safeTop };
  return { x, y: mapY(sh, y) };
}

/** The title layout point under screen logical point (x, y) — the inverse of `titleToScreen`. */
export function screenToTitle(sh: TitleShifts, x: number, y: number): { x: number; y: number } {
  const l = TITLE.lang;
  const ly = y - sh.safeTop;
  if (x >= l.x && x <= l.x + l.w && ly >= l.y && ly <= l.y + l.h) return { x, y: ly };
  return { x, y: unmapY(sh, y) };
}
