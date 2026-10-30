import type { GameState } from '../sim/types';
import { C } from '../sim/constants';
import { chunkBackoff, loadChunk } from '../lazyChunk';
import { shade } from './palette';
import type { HudAnchors, View } from './view';
import { bleed, bleedRect, hudAnchors } from './view';
import { BOOSTERS, HUD, PAUSE, RESULT, WORLD_ZOOM } from './layout';
import type { Rect } from './widgets';
import {
  drawBoltGlyph,
  drawButton,
  drawCard,
  drawCoin,
  drawCooldownRing,
  drawCrosshairGlyph,
  drawGlassBand,
  drawPill,
  drawRoundButton,
  drawSnowflakeGlyph,
  drawSpeakerGlyph,
  clipText,
  drawStars,
  exemptFont,
  fitFontPx,
  fitTextLines,
  font,
  formatTime,
  getTextScale,
  roundRect,
  textPx,
  wrapText,
} from './widgets';
import type { PlayUi } from './draw';
import { prefersReducedMotion } from './particles';
import { reducedMotionOverride } from '../ui/motion';
import type { BoosterKind, BoosterStatus } from '../ui/boosters';
import { drawVideoGlyph } from './sprites';
import type { Camera } from './camera';
import { playCamera, proj } from './camera';
import type { WorldLayout } from './worldChips';
import { drawStreamArrow, frameWorldLayout, overlaps, selectedFootprint } from './worldChips';
import type { ToastOpts } from './economyWidgets';
import { drawToast, drawWallet } from './economyWidgets';
import type { HudOverlayDrawers } from './hudOverlays';
import { ENGLISH_MENUS_CHUNK, currentLanguage, levelLesson, levelName, loadEnglishMenus, t } from '../ui/i18n';

/*
 * In-game HUD (ART_DIRECTION §4): glass paper bands top and bottom, level chip, timer pill, pause
 * button, the active-streams pill (rules v2), MENU; the pause card and the result card (slide-up, sequential
 * star pops, extruded VICTORY / DEFEAT, coins counting up). Drawn by draw.ts after the world with
 * the logical (720×1280) transform active and no clip. Reads state only.
 *
 * Full bleed (BUG-34): on a screen taller than 9:16 the bands do not sit on the map rect's edges —
 * the top band's content moves up to the top safe-area edge and the bottom band's down to the bottom
 * one (`hudAnchors`), and their glass reaches the screen edges (`bleed`). The HUD rects in layout.ts
 * stay the layout positions; the play / result screens map taps through `toHudSpace`.
 */

let reducedMotion: boolean | null = null;
function motionAllowed(): boolean {
  const override = reducedMotionOverride();
  if (override !== null) return !override;
  if (reducedMotion === null) reducedMotion = prefersReducedMotion();
  return !reducedMotion;
}

/**
 * Extra HUD inputs that the play screen attaches to the frame's PlayUi (booster bar, airstrike
 * targeting, mute). Optional so menus/tests can draw a plain PlayUi; the cast in `extrasOf` is the
 * only place that reads it. (Producer: lift `hud?: HudExtras` into PlayUi in draw.ts when convenient.)
 */
export interface HudExtras {
  boosters: readonly BoosterStatus[];
  /** Airstrike targeting mode: tap an enemy tower, tap elsewhere to cancel. */
  targeting: boolean;
  muted: boolean;
  /** Booster currently held down (pressed look). */
  pressedBooster?: BoosterKind | null;
  /** Number of the player's active attack streams (`state.links` owned by the player), rules v2. */
  streams?: number;
  /** Gold + crystal balances (drawn over the booster bar once the level is over; tap → shop). */
  wallet?: { gold: number; crystals: number };
  /** Economy rows on the result card (ECONOMY.md §3.4, §3.5, §5.2). */
  result?: ResultExtras;
  /** Result-card rect currently held down. */
  pressed?: Rect | null;
  toast?: ToastOpts | null;
  /** Daily / Weekly Challenge match (GDD §7, §8): the level chip reads "Daily · name" / "Weekly · name" over the twist's name. */
  challenge?: { twist: string; weekly?: boolean };
}

export interface ResultExtras {
  crystalsEarned: number;
  /** Reasons for the crystals ("10 levels cleared"). */
  notes: readonly string[];
  /** Replay gold withheld by the daily cap. */
  replayCapped: boolean;
  /** Gold a rewarded video would add (null = button hidden). */
  doubleGold: number | null;
  /** The ×2 video was already watched for this result. */
  doubled: boolean;
  /** Crystal price of "Reinforcements" (null = not offered). */
  continueCrystals: number | null;
  /** Rewarded-video continue on offer. */
  continueAd: boolean;
  /** Crystal price of the level skip (null = not offered). */
  skipCrystals: number | null;
  /** An ad / purchase is in flight: buttons show a spinner and ignore taps. */
  pending: boolean;
  /** Defeat tip (FE-4): the level's lesson in the UI language; null on a win. */
  tip: string | null;
  /** "HOW TO PLAY" link under the tip (second consecutive defeat of the same level in this session). */
  howto: boolean;
  /** SHARE row (SHARE-1): every result but a Yesterday's-map practice run; the card grows to `RESULT.cardShare`. */
  share?: boolean;
  /** The share image is being drawn / the share sheet is open: the SHARE button shows a spinner. */
  sharing?: boolean;
  /** AUD-U5: a crystal spend waiting on the confirm card (`CONFIRM`): what, its price, the balance now. */
  confirm?: { kind: 'continue' | 'skip'; crystals: number; have: number } | null;
  /** Daily Challenge result (GDD §7): the reward line (first win) or the day's best (replay). */
  daily?: {
    won: boolean;
    firstWin: boolean;
    gold: number;
    crystals: number;
    streak: number;
    best: { stars: number; timeMs: number } | null;
    /** Yesterday's map (DAILY-6): the line reads "Yesterday's map — no reward". */
    practice?: boolean;
  };
  /** Weekly Challenge result (GDD §8): the gold line (first win of the week) or the week's best. */
  weekly?: {
    firstWin: boolean;
    gold: number;
    streak: number;
    best: { stars: number; timeMs: number } | null;
  };
}

export type HudPlayUi = PlayUi & {
  hud?: HudExtras;
  /**
   * Match clock for the timer pill and the result cards. Defaults to `state.time`; after a
   * "Reinforcements" rewind it keeps the original start (`state.time` + rewound ms) so the clock
   * on screen matches the one the stars are scored on (ECONOMY.md §3.5).
   */
  clockMs?: number;
  /**
   * AUD-B11 (GDD §4): the lesson card holds the match (no first input yet). Undefined = a frame
   * without a play screen behind it (tests, tools): the card is drawn as if held.
   */
  cardUp?: boolean;
  /** The lesson card's opacity once dismissed (1 → 0 over the play screen's fade; 0 = gone). */
  cardFade?: number;
  /** AUD-F4: the outcome is decided but the result beat is still running — no dim, no card yet. */
  resultBeat?: boolean;
};

/** The stalemate card's window in seconds (GDD §2.4; play.ts `STALEMATE_CARD_MS` is this × 1000), for its body text. */
export const STALEMATE_CARD_S = 45;

/**
 * AUD-B2 / A11 "Nothing is changing" card (GDD §2.4): title, body, KEEP PLAYING over RESTART · RETREAT.
 * Row centres 98 apart, columns 220 apart, so the ≥ 44 pt tap areas (`hitRect`) never overlap.
 */
export const STALL = Object.freeze({
  card: { x: 90, y: 420, w: 540, h: 440 } as Rect,
  keep: { x: 150, y: 650, w: 420, h: 80 } as Rect,
  restart: { x: 150, y: 752, w: 200, h: 72 } as Rect,
  retreat: { x: 370, y: 752, w: 200, h: 72 } as Rect,
});

/**
 * Result card rect and SHARE rect (SHARE-1): SHARE takes the ×2 gold / skip slot when nothing else
 * is there (the "Gold doubled" note counts as something), else a row of its own under it on the
 * taller card. `share` is null when the button is not offered (practice run).
 */
export function resultShareLayout(ex: Pick<ResultExtras, 'share' | 'doubleGold' | 'doubled' | 'skipCrystals'> | undefined, won: boolean): { card: Rect; share: Rect | null } {
  if (!ex?.share) return { card: RESULT.card, share: null };
  const slotUsed = won ? ex.doubled || ex.doubleGold !== null : ex.skipCrystals !== null;
  return slotUsed ? { card: RESULT.cardShare, share: RESULT.share } : { card: RESULT.card, share: RESULT.shareInline };
}

function extrasOf(ui: PlayUi): HudExtras | undefined {
  return (ui as HudPlayUi).hud;
}

function clockOf(ui: PlayUi, state: Pick<GameState, 'time'>): number {
  return (ui as HudPlayUi).clockMs ?? state.time;
}

/** The play screen's HUD extras on `ui`, for the lazy overlay chunk (src/render/hudOverlays.ts). */
export function hudExtrasOf(ui: PlayUi): HudExtras | undefined {
  return extrasOf(ui);
}

/** The match clock the overlay chunk shows (see `HudPlayUi.clockMs`). */
export function hudClockOf(ui: PlayUi, state: Pick<GameState, 'time'>): number {
  return clockOf(ui, state);
}

/** Booster accent colours: gold bolt, ice snowflake, red crosshair (all from the active palette). */
export function boosterColor(pal: PlayUi['palette'], kind: BoosterKind): string {
  return kind === 'overdrive' ? pal.gold : kind === 'freeze' ? pal.sky : pal.owners.enemy1;
}

/* ---------- HUD ---------- */

function pauseGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, paused: boolean): void {
  ctx.fillStyle = color;
  if (paused) {
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 12);
    ctx.lineTo(cx + 12, cy);
    ctx.lineTo(cx - 8, cy + 12);
    ctx.closePath();
    ctx.fill();
  } else {
    roundRect(ctx, { x: cx - 12, y: cy - 12, w: 8, h: 24 }, 3);
    ctx.fill();
    roundRect(ctx, { x: cx + 4, y: cy - 12, w: 8, h: 24 }, 3);
    ctx.fill();
  }
}

/**
 * Active-streams pill (rules v2, where the SEND toggle used to be): caption, then "⇢ n". AUD-U2: the
 * caption at the 22 px floor (fitted to the pill, never squeezed); the pill sits in the bottom band,
 * so at a bigger text size the caption stops at 24 px and the number at 30.
 */
function drawStreamsPill(ctx: CanvasRenderingContext2D, ui: PlayUi, n: number): void {
  const pal = ui.palette;
  const r = HUD.streams;
  drawButton(ctx, pal, r, '');
  const cy = r.y + (r.h - 4) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  const caption = t('hud.streams');
  ctx.font = font(fitFontPx(ctx, caption, 22, r.w - 32, '500'), '500', undefined, 24);
  ctx.fillText(caption, r.x + 16, cy - 13);
  const color = n > 0 ? pal.owners.player : pal.textDim;
  drawStreamArrow(ctx, color, r.x + 28, cy + 13, 12, 3);
  ctx.fillStyle = n > 0 ? pal.ink : pal.textDim;
  ctx.font = font(26, 'bold', undefined, 30);
  ctx.fillText(String(n), r.x + 48, cy + 14);
}

/**
 * The booster cost chip under a disc (AUD-U2): 76 wide and 28 tall, overlapping the disc's foot by 8
 * so a 22 px price fits inside the bottom band (it ends where the 22 px chip under the disc did).
 */
export const BOOSTER_CHIP = Object.freeze({ w: 76, h: 28, overlap: 8 });

function boosterGlyph(ctx: CanvasRenderingContext2D, kind: BoosterKind, color: string, cx: number, cy: number, s: number, outline: string): void {
  if (kind === 'overdrive') drawBoltGlyph(ctx, color, cx, cy, s, outline);
  else if (kind === 'freeze') drawSnowflakeGlyph(ctx, color, cx, cy, s);
  else drawCrosshairGlyph(ctx, color, cx, cy, s);
}

/**
 * Booster bar (M3-1): round clay buttons with an icon, a coin cost chip underneath, a cooldown
 * ring while the timed booster runs and a dimmed face when unaffordable / active.
 */
function drawBoosterBar(ctx: CanvasRenderingContext2D, ui: PlayUi, hud: HudExtras, nowMs: number): void {
  const pal = ui.palette;
  const r = BOOSTERS.disc / 2;
  for (const st of hud.boosters) {
    const rect = BOOSTERS[st.kind];
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + r;
    const color = boosterColor(pal, st.kind);
    const targeting = st.kind === 'airstrike' && hud.targeting;
    const usable = st.affordable && !st.active;
    const pressed = hud.pressedBooster === st.kind;
    drawRoundButton(ctx, pal, cx, cy, r - 2, {
      fill: targeting ? color : undefined,
      border: targeting ? shade(color, -0.35) : undefined,
      disabled: !usable && !targeting,
      pressed,
    });
    const gy = cy + (pressed ? 3 : 0);
    const face = targeting ? pal.paper : usable ? color : shade(pal.panel, -0.45);
    boosterGlyph(ctx, st.kind, face, cx, gy, 17, targeting ? 'rgba(0,0,0,0)' : shade(color, -0.45));
    if (st.active && st.durationMs > 0) {
      const pulse = motionAllowed() ? 0.85 + 0.15 * Math.sin(nowMs / 160) : 1;
      ctx.save();
      ctx.globalAlpha = pulse;
      drawCooldownRing(ctx, cx, cy, r + 2, st.remainingMs / st.durationMs, color);
      ctx.restore();
    }
    // cost chip under the disc: charges ("×2" on gold), a video glyph when a free charge is on offer,
    // otherwise the gold price
    const chip: Rect = { x: cx - BOOSTER_CHIP.w / 2, y: rect.y + BOOSTERS.disc - BOOSTER_CHIP.overlap, w: BOOSTER_CHIP.w, h: BOOSTER_CHIP.h };
    roundRect(ctx, chip, chip.h / 2);
    const chipFill = st.charges > 0 ? pal.gold : st.adOffer ? pal.owners.player : st.affordable ? pal.paper : shade(pal.panel, -0.1);
    ctx.fillStyle = chipFill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = st.charges > 0 ? pal.goldShade : st.adOffer ? shade(pal.owners.player, -0.35) : st.affordable ? shade(pal.gold, -0.2) : pal.textDim;
    ctx.stroke();
    // the chip is a fixed box in the band: 22 px at any text size (it cannot grow)
    const chipFont = font(22, 'bold', undefined, 22);
    ctx.font = chipFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const my = chip.y + chip.h / 2 + 1;
    if (st.charges > 0) {
      ctx.fillStyle = pal.ink;
      ctx.fillText(`×${st.charges}`, chip.x + chip.w / 2, my);
    } else if (st.adOffer) {
      // "▶ FREE" where the word fits beside the video glyph at 22 px, else the glyph alone. Measured
      // 2026-10-30: no language fits the 76-wide chip (FREE 53, PULSUZ 80, BEDAVA 80, БЕСПЛ. 82 px; room 40),
      // so the chip shows the video glyph alone (BACKLOG AUD-U2 note)
      const free = t('hud.free');
      const tw = ctx.measureText(free).width;
      if (tw + 26 <= chip.w - 10) {
        const x0 = chip.x + (chip.w - (tw + 26)) / 2;
        drawVideoGlyph(ctx, pal, x0 + 8, chip.y + chip.h / 2, 8);
        ctx.fillStyle = pal.paper;
        ctx.textAlign = 'left';
        ctx.fillText(free, x0 + 26, my);
      } else drawVideoGlyph(ctx, pal, chip.x + chip.w / 2, chip.y + chip.h / 2, 10);
    } else {
      const cost = String(st.cost);
      const tw = ctx.measureText(cost).width;
      const x0 = chip.x + (chip.w - (tw + 24)) / 2;
      drawCoin(ctx, pal, x0 + 8, chip.y + chip.h / 2, 8);
      ctx.fillStyle = st.affordable ? pal.ink : pal.textDim;
      ctx.textAlign = 'left';
      ctx.fillText(cost, x0 + 24, my);
    }
  }
}

/** Coin balance pill (bottom band, right of the boosters). */
function drawCoinPill(ctx: CanvasRenderingContext2D, ui: PlayUi): void {
  const pal = ui.palette;
  const r = HUD.coins;
  drawPill(ctx, r, pal.paper);
  drawCoin(ctx, pal, r.x + 22, r.y + r.h / 2, 13);
  ctx.fillStyle = pal.ink;
  const coins = String(ui.coinsTotal);
  ctx.font = font(fitFontPx(ctx, coins, 24, r.w - 50), 'bold', undefined, 30);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(coins, r.x + r.w - 14, r.y + r.h / 2 + 1);
}

/** Airstrike targeting: pulsing crosshair rings on every enemy tower and an instruction pill (just above the bottom band, moved by `dy`). */
function drawTargeting(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi, nowMs: number, dy: number): void {
  const pal = ui.palette;
  const color = boosterColor(pal, 'airstrike');
  const pulse = motionAllowed() ? (Math.sin(nowMs / 200) + 1) / 2 : 0.5;
  ctx.save();
  const cam = playCamera(); // rings around the tower where it stands (ART-21 projected anchor, depth-scaled)
  for (const id in state.towers) {
    const tw = state.towers[id]!;
    if (tw.owner === 'player' || tw.owner === 'neutral') continue;
    const t = proj(cam, tw.x, tw.y);
    ctx.globalAlpha = 0.55 + 0.45 * (1 - pulse);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = motionAllowed() ? -(nowMs / 30) % 24 : 0;
    ctx.beginPath();
    ctx.arc(t.x, t.y, (52 + pulse * 6) * t.s * WORLD_ZOOM.tower, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawCrosshairGlyph(ctx, color, t.x, t.y - 70 * t.s * WORLD_ZOOM.tower, 14);
  }
  ctx.restore();
  // AUD-U2: 22 px, wrapped (never squeezed); the pill grows upwards from its foot at 1168
  const fit = fitTextLines(ctx, t('hud.airstrikeHint'), 22, 656, 3);
  const w = Math.min(700, Math.max(...fit.lines.map((l) => ctx.measureText(l).width)) + 44);
  const h = fit.lines.length * fit.lineH + 16;
  const pill: Rect = { x: 360 - w / 2, y: 1168 - h + dy, w, h };
  drawPill(ctx, pill, color, shade(color, -0.35));
  ctx.fillStyle = pal.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fit.lines.forEach((l, i) => ctx.fillText(l, 360, pill.y + 8 + fit.lineH * (i + 0.5) + 1));
}

/** The lesson card's layout (HUD layout space: the top band's frame, shift by `hudAnchors().top` for the screen). */
export interface LessonCard {
  rect: Rect;
  lines: string[];
  px: number;
  lineH: number;
  captionH: number;
}

/**
 * AUD-B11 (GDD §4): the lesson card's opacity — 1 while it holds the match, then the play screen's fade
 * after the first input, 0 once gone. It no longer times out: the hold ends only with the player's
 * first input. A frame that does not say (`HudPlayUi.cardUp` undefined: tests, tools) shows it only at
 * sim time 0 — a held match never leaves 0, a running one has.
 */
export function lessonCardAlpha(ui: PlayUi, state: Pick<GameState, 'time'>): number {
  const u = ui as HudPlayUi;
  if (u.cardUp === undefined) return state.time === 0 ? 1 : 0;
  return u.cardUp ? 1 : Math.max(0, Math.min(1, u.cardFade ?? 0));
}

/**
 * The lesson hint while the card holds the match and during its fade (a small "LESSON" caption over
 * the lesson text, both in the UI language), or null when it is not shown. Up to three lines at 20 px;
 * longer lessons (band finales, translations) drop to 18 px and up to five lines rather than being
 * cut with an ellipsis. AUD-U2: the lines are a documented exemption from the 22 px floor
 * (`exemptFont('lessonCard')`, guarded by e2e/lessonFit.spec.ts at 100 %) but follow the text size:
 * at 125 / 150 % the lesson takes up to eight lines of the bigger text (then the 18 px step) and the
 * card grows downwards. `px` is the 100 % size (drawn: `px` × text size); the caption is floor text.
 * Leaves a lesson font set on `ctx`. The world clamps badges below it (ART-22, draw.ts).
 */
export function lessonCardLayout(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi): LessonCard | null {
  if (ui.outcome !== 'playing' || lessonCardAlpha(ui, state) <= 0) return null;
  const lesson = levelLesson(ui.level);
  const k = getTextScale();
  const steps: readonly (readonly [number, number, number])[] = k === 1 ? [[20, 620, 3], [18, 640, 5]] : [[20, 620, 3], [20, 640, 8], [18, 640, 8]];
  let px = 20;
  let lines: string[] = [];
  for (const [p, wrapW, max] of steps) {
    px = p;
    ctx.font = exemptFont('lessonCard', px, '500');
    lines = wrapText(ctx, lesson, wrapW, max);
    if (!lines[lines.length - 1]?.endsWith('…')) break;
  }
  const lineH = Math.round(px * k) + 6;
  const captionH = Math.round(textPx(22)) + 4;
  const h = lines.length * lineH + 18 + captionH;
  const w = Math.min(690, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48);
  return { rect: { x: 360 - w / 2, y: 108, w, h }, lines, px, lineH, captionH };
}

/**
 * The select hint pill's height, the gap above it / below the top band or the lesson card's clay edge
 * when it moves up (GD-5d), the clear space it keeps from every tower body, ring, badge and chip, and
 * the room it leaves above and below the tower a tutorial step points at (BUG-57: the bubble's arrow
 * tip gap 8 + reach 54 + bob 8 + a one-line bubble 56 + 3, render/tutorialBubble.ts TUTORIAL_BUBBLE).
 * AUD-U2 / U12: `h` / `y` are the one-line pill at 100 % text size; the text is `px` (the 22 px floor;
 * at a bigger text size at most `maxPx`: the pill must still find room between the towers of a dense
 * map, tests/render/selectHint.test.ts) in lines of at most `maxW` − 2 × `padX` (`selectHintBox`), the
 * pill `padY` taller than its lines, its low spot `bottomGap` above the bottom band.
 */
export const SELECT_HINT = Object.freeze({ h: 38, y: 1128, gap: 10, clear: 3, tutorialRoom: 130, px: 22, maxPx: 26, maxW: 700, padX: 20, padY: 12, bottomGap: 14 });

/** The select hint's lines and pill size (`selectHintBox`). */
export interface SelectHintBox {
  lines: string[];
  lineH: number;
  w: number;
  h: number;
}

const hintBoxes = new WeakMap<CanvasRenderingContext2D, { key: string; box: SelectHintBox }>();

/**
 * AUD-U2 / U12: which half of the select hint ("start a stream · … to stop", one " · " in every
 * language) applies to the selected tower: 0 (start) while it sends no stream, 1 (stop) once it does.
 * At the 22 px floor the whole sentence no longer fits one line (and a two-line pill finds no clear
 * spot on a dense map), so the hint says the half the player can act on.
 */
export function selectHintPart(state: Pick<GameState, 'links' | 'towers'>, selectedId: string): 0 | 1 {
  const owner = state.towers[selectedId]?.owner;
  return state.links.some((l) => l.from === selectedId && l.owner === owner) ? 1 : 0;
}

/** The select hint's text for `part` (`selectHintPart`): that half of `hud.selectHint`, capitalised. */
export function selectHintText(part: 0 | 1): string {
  const parts = t('hud.selectHint').split(' · ');
  const s = (parts.length > 1 ? parts[part] : parts[0]) ?? '';
  return s.charAt(0).toLocaleUpperCase(currentLanguage()) + s.slice(1);
}

/**
 * AUD-U2 / U12: the select hint (`selectHintText`) at 22 px (× text size), never squeezed: one line
 * where it fits the 660 px text width, else wrapped between words; the pill is the widest line +
 * 2 × `padX` (≤ 700) by lines × pitch + `padY`. Memoised per canvas on the font and text (drawn every
 * frame while a tower is selected). Leaves the hint font set on `ctx`.
 */
export function selectHintBox(ctx: CanvasRenderingContext2D, part: 0 | 1 = 0): SelectHintBox {
  const text = selectHintText(part);
  const f = font(SELECT_HINT.px, '500', undefined, SELECT_HINT.maxPx);
  ctx.font = f;
  const key = `${f}|${text}`;
  const hit = hintBoxes.get(ctx);
  if (hit?.key === key) return hit.box;
  const maxText = SELECT_HINT.maxW - 2 * SELECT_HINT.padX;
  const lines = wrapText(ctx, text, maxText, 8);
  const lineH = Math.round(textPx(SELECT_HINT.px, SELECT_HINT.maxPx) * 1.18);
  const w = Math.min(SELECT_HINT.maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 2 * SELECT_HINT.padX);
  const box = { lines, lineH, w, h: lines.length * lineH + SELECT_HINT.padY };
  hintBoxes.set(ctx, { key, box });
  return box;
}

/** Layout y of the select hint's low spot (just above the bottom band) for a pill `h` tall. */
export const selectHintLowY = (h: number, a: HudAnchors): number => HUD.mapBottom - SELECT_HINT.bottomGap - h + a.bottom;

/** BUG-57 tutorial room above and below the focus tower at the current text size (the one-line bubble grows with it). */
export const selectHintTutorialRoom = (): number => SELECT_HINT.tutorialRoom + Math.round(56 * (getTextScale() - 1));

/**
 * The select hint's two home spots for its pill size `box` (pure): `low` centred just above the
 * bottom band, `top` at the top of the map band, under the top HUD band or, while it is up, the lesson
 * card (`card`, logical frame; its clay edge is 4 px under its rect).
 */
export function selectHintSpots(box: { w: number; h: number }, a: HudAnchors, card: Rect | null): { low: Rect; top: Rect } {
  const { w, h } = box;
  const low = { x: 360 - w / 2, y: selectHintLowY(h, a), w, h };
  return { low, top: { ...low, y: card ? card.y + card.h + 4 + SELECT_HINT.gap : Math.max(0, HUD.mapTop + a.top) + SELECT_HINT.gap } };
}

/**
 * The select hint without a laid-out frame (pure; GD-5d): the low spot unless it touches one of `avoid`
 * (the selected tower's footprint and badge, `selectHintAvoid`), then the top spot. The play frame
 * places it with draw.ts `playLayout` (BUG-57) and `selectHintPill` returns that one.
 */
export function selectHintRect(box: { w: number; h: number }, a: HudAnchors, card: Rect | null, avoid: readonly Rect[]): Rect {
  const { low, top } = selectHintSpots(box, a, card);
  return avoid.some((r) => overlaps(r, low)) ? top : low;
}

/** What the select hint keeps clear of in one layout (`selectHintObstacles`). */
export interface HintObstacles {
  /** What no other placement moves: every tower's drawn body (the selected one's with its selection ring) and the selected tower's badge. */
  fixed: Rect[];
  /** Every other tower's badge. */
  badges: Rect[];
  /** Every stream / mine chip (`selectHintScore` counts them at 1 %: covered only when nothing else is clear). */
  chips: Rect[];
  /** The selected tower's footprint and badge (`selectHintAvoid`): never covered. */
  own: Rect[];
}

/** BUG-57: what the select hint keeps SELECT_HINT.clear from in `layout` (`HintObstacles`). */
export function selectHintObstacles(state: GameState, selectedId: string, cam: Camera, layout: WorldLayout): HintObstacles {
  const own = selectHintAvoid(state, selectedId, cam, layout);
  const fixed = [...own];
  for (const [id, body] of layout.bodies) if (id !== selectedId) fixed.push(body);
  const badges: Rect[] = [];
  for (const [id, b] of layout.badges) if (id !== selectedId) badges.push(b.rect);
  return { fixed, badges, chips: layout.chips.map((c) => c.rect), own };
}

/** BUG-57: how much of `obs` a select hint at `r` covers (`selectHintCover`; chips at 1 % of their area); 0 = clear, Infinity = on the selected tower. */
export function selectHintScore(r: Rect, obs: HintObstacles): number {
  if (obs.own.some((o) => overlaps(r, o))) return Infinity;
  return selectHintCover(r, obs.fixed) + selectHintCover(r, obs.badges) + selectHintCover(r, obs.chips) / 100;
}

/** BUG-57: how much of `obstacles` lies within SELECT_HINT.clear of `r` (summed overlap area, logical px²; 0 = clear). */
export function selectHintCover(r: Rect, obstacles: readonly Rect[]): number {
  const g = SELECT_HINT.clear;
  let sum = 0;
  for (const o of obstacles) {
    const ox = Math.min(r.x + r.w + g, o.x + o.w) - Math.max(r.x - g, o.x);
    const oy = Math.min(r.y + r.h + g, o.y + o.h) - Math.max(r.y - g, o.y);
    if (ox > 1e-6 && oy > 1e-6) sum += ox * oy;
  }
  return sum;
}

/**
 * BUG-57: spots for the select hint `w` wide with y in `y0`…`y1`, rows from the top down and on a row
 * the column nearest the centre first. Rows start at `y0`, `y1`, or SELECT_HINT.clear under or over one
 * of `obstacles`; columns are centred or SELECT_HINT.clear beside an obstacle of the row, inside the
 * map's width less 4 px — so the first spot of the band clear of `obstacles` is among them.
 */
export function* selectHintScan(w: number, y0: number, y1: number, obstacles: readonly Rect[], h: number = SELECT_HINT.h): Generator<Rect> {
  const g = SELECT_HINT.clear;
  const cx = 360 - w / 2;
  const edges = obstacles.flatMap((o) => [Math.ceil(o.y + o.h + g), Math.floor(o.y - g - h)]);
  const ys = [...new Set([y0, y1, ...edges])].filter((y) => y >= y0 && y <= y1).sort((p, q) => p - q);
  for (const y of ys) {
    const row = obstacles.filter((o) => o.y < y + h + g && y - g < o.y + o.h);
    const xs = [...new Set([cx, ...row.flatMap((o) => [Math.ceil(o.x + o.w + g), Math.floor(o.x - g - w)])])].filter((x) => x >= 4 && x + w <= C.MAP_W - 4);
    for (const x of xs.sort((p, q) => Math.abs(p - cx) - Math.abs(q - cx))) yield { x, y, w, h };
  }
}

/** What the select hint keeps clear of: the selected tower's drawn footprint (body + selection ring) and its badge, as `layout` (default: this frame's world layout) has them. */
export function selectHintAvoid(state: GameState, selectedId: string, cam: Camera = playCamera(), layout: WorldLayout | null = frameWorldLayout(state)): Rect[] {
  const tw = state.towers[selectedId];
  const body = layout?.bodies.get(selectedId);
  if (!layout || !tw || !body) return [];
  const out = [selectedFootprint(body, proj(cam, tw.x, tw.y))];
  const badge = layout.badges.get(selectedId);
  if (badge) out.push(badge.rect);
  return out;
}

/**
 * The select hint pill for the `selectedId` tower: the one `layout` (default this frame's) was laid out
 * with (draw.ts `playLayout`, BUG-57), else `selectHintRect` against it. Sets the hint font on `ctx`.
 * `card`: the lesson card in the logical frame, or null.
 */
export function selectHintPill(ctx: CanvasRenderingContext2D, state: GameState, selectedId: string, a: HudAnchors, card: Rect | null, cam: Camera = playCamera(), layout: WorldLayout | null = frameWorldLayout(state)): Rect {
  const box = selectHintBox(ctx, selectHintPart(state, selectedId));
  if (layout?.hint?.id === selectedId) return layout.hint.rect;
  return selectHintRect(box, a, card, selectHintAvoid(state, selectedId, cam, layout));
}

/** Whether `drawHud` shows the select hint this frame: a tower selected while playing, and no airstrike targeting under way. */
export function selectHintShown(ui: PlayUi): boolean {
  return ui.selectedTowerId !== null && ui.outcome === 'playing' && !(extrasOf(ui)?.targeting && !ui.paused);
}

/** Whether `pill` (`selectHintPill`) moved up from its spot over the bottom band (GD-5d). */
export const selectHintMoved = (pill: Rect, a: HudAnchors): boolean => pill.y !== selectHintLowY(pill.h, a);

/** The two glass bands, from the screen edges to the anchored band edges (exactly `HUD.topBar` / `HUD.bottomBar` on a 9:16 screen). */
export function hudBandRects(view: View, a: HudAnchors = hudAnchors(view)): { top: Rect; bottom: Rect } {
  const b = bleed(view);
  const pad = 1 / (view.scale > 0 ? view.scale : 1);
  const x = b.left;
  const w = b.right - b.left + (b.right > C.MAP_W ? pad : 0);
  const topEnd = HUD.topBar.y + HUD.topBar.h + a.top;
  const bottomStart = HUD.bottomBar.y + a.bottom;
  const bottomEnd = b.bottom > C.MAP_H ? b.bottom + pad : b.bottom;
  return { top: { x, y: b.top, w, h: topEnd - b.top }, bottom: { x, y: bottomStart, w, h: bottomEnd - bottomStart } };
}

export function drawHud(ctx: CanvasRenderingContext2D, state: GameState, view: View, ui: PlayUi, nowMs: number): void {
  const pal = ui.palette;
  const hud = extrasOf(ui);
  const a = hudAnchors(view);
  ctx.save();
  // glass bands, out to the screen edges (BUG-34)
  const bands = hudBandRects(view, a);
  drawGlassBand(ctx, bands.top);
  drawGlassBand(ctx, bands.bottom);

  // top band content, anchored to the top safe-area edge
  ctx.save();
  ctx.translate(0, a.top);
  // level chip: small "LEVEL n" over the name (a challenge: the twist's name over "Daily · name")
  const chip = HUD.levelChip;
  drawPill(ctx, chip, pal.paper, hud?.challenge ? pal.gold : undefined);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hud?.challenge ? pal.goldShade : pal.textDim;
  // AUD-U2: caption at the 22 px floor over a 24 px title, both fitted to the chip (never squeezed;
  // "…" only past the floor); the chip is a fixed box in the band, so 24 / 28 px at most
  const chipW = chip.w - 40;
  const caption = hud?.challenge ? hud.challenge.twist : t('hud.level', { n: ui.level.id });
  ctx.font = font(fitFontPx(ctx, caption, 22, chipW, '500'), '500', undefined, 24);
  ctx.fillText(clipText(ctx, caption, chipW), chip.x + 22, chip.y + 17);
  ctx.fillStyle = pal.ink;
  const chipTitle = hud?.challenge ? t(hud.challenge.weekly ? 'weekly.chip' : 'daily.chip', { name: levelName(ui.level) }) : levelName(ui.level);
  ctx.font = font(fitFontPx(ctx, chipTitle, 24, chipW), 'bold', undefined, 28);
  ctx.fillText(clipText(ctx, chipTitle, chipW), chip.x + 22, chip.y + 42);

  // timer pill (+ speed tag)
  const timer = HUD.timer;
  drawPill(ctx, timer, pal.paper);
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink;
  ctx.font = font(34, 'bold', undefined, 40); // the pill is a fixed box in the band
  ctx.fillText(formatTime(clockOf(ui, state)), timer.x + timer.w / 2, timer.y + timer.h / 2 + 2);
  if (ui.speed !== 1) {
    const tag = HUD.speedTag;
    drawPill(ctx, tag, pal.accent);
    ctx.fillStyle = pal.paper;
    const speed = `×${ui.speed}`;
    ctx.font = font(fitFontPx(ctx, speed, 22, tag.w - 12), 'bold', undefined, 26);
    ctx.fillText(speed, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  }

  // mute + pause buttons
  const mb = HUD.mute;
  const muted = hud?.muted ?? false;
  drawButton(ctx, pal, mb, '');
  drawSpeakerGlyph(ctx, muted ? pal.textDim : pal.ink, mb.x + mb.w / 2 - 2, mb.y + (mb.h - 4) / 2, 15, !muted);
  const pb = HUD.pause;
  drawButton(ctx, pal, pb, '');
  pauseGlyph(ctx, pal.ink, pb.x + pb.w / 2, pb.y + (pb.h - 4) / 2, ui.paused);

  // lesson hint until the first input, then its short fade (`lessonCardLayout`, AUD-B11)
  const card = lessonCardLayout(ctx, state, ui);
  if (card) {
    const { rect, lines, px, lineH, captionH } = card;
    ctx.save();
    ctx.globalAlpha = lessonCardAlpha(ui, state);
    drawCard(ctx, pal, rect, { radius: 18, edge: 4 });
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textDim;
    const caption = t('hud.lesson');
    ctx.font = font(fitFontPx(ctx, caption, 22, rect.w - 24, '500'), '500');
    ctx.fillText(caption, 360, rect.y + 6 + captionH / 2);
    ctx.fillStyle = pal.ink;
    ctx.font = exemptFont('lessonCard', px, '500');
    lines.forEach((l, i) => ctx.fillText(l, 360, rect.y + 20 + captionH + i * lineH));
    ctx.restore();
  }
  ctx.restore();

  // bottom band content, anchored to the bottom safe-area edge
  ctx.save();
  ctx.translate(0, a.bottom);
  // bottom bar: streams · boosters · coins · menu (wallet replaces boosters + coins once the level is over)
  drawStreamsPill(ctx, ui, hud?.streams ?? 0);
  if (ui.outcome !== 'playing' && hud?.wallet) {
    drawWallet(ctx, pal, HUD.wallet, hud.wallet.gold, hud.wallet.crystals, { pressed: hud.pressed === HUD.wallet });
  } else {
    if (hud) drawBoosterBar(ctx, ui, hud, nowMs);
    drawCoinPill(ctx, ui);
  }
  drawButton(ctx, pal, HUD.menu, t('common.menu'), { fontPx: 22 });
  ctx.restore();

  if (hud?.targeting && ui.outcome === 'playing' && !ui.paused) drawTargeting(ctx, state, ui, nowMs, a.bottom);
  // selection hint: just above the bottom band, or where this frame's layout moved it off the towers (GD-5d, BUG-57)
  else if (ui.selectedTowerId && ui.outcome === 'playing') {
    const pill = selectHintPill(ctx, state, ui.selectedTowerId, a, card ? { ...card.rect, y: card.rect.y + a.top } : null);
    const box = selectHintBox(ctx, selectHintPart(state, ui.selectedTowerId));
    drawPill(ctx, pill, pal.paper);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    const top = pill.y + (pill.h - box.lines.length * box.lineH) / 2;
    box.lines.forEach((l, i) => ctx.fillText(l, pill.x + pill.w / 2, top + box.lineH * (i + 0.5) + 1));
  }
  // transient status while playing (free charge added, "not in the daily challenge"); overlays draw their own.
  // It sits over the bottom band, so it moves with it.
  if (hud?.toast && ui.outcome === 'playing' && !ui.paused) drawToast(ctx, pal, { ...hud.toast, y: (hud.toast.y ?? 1090) + a.bottom });
  ctx.restore();
}

/**
 * Cache key of everything `drawHud` paints (PERF-3 HUD layer): changes exactly when the HUD would
 * look different — clock once a second, counts / balances / booster states on change, per frame
 * only while something animates (cooldown ring pulse, targeting rings, a toast).
 */
export function hudKey(state: GameState, ui: PlayUi, nowMs: number): string {
  const hud = extrasOf(ui);
  let k =
    `${currentLanguage()}|${getTextScale()}|${ui.palette.owners.enemy1}|${ui.level.id}|${hud?.challenge?.twist ?? ''}|${formatTime(clockOf(ui, state))}|${ui.speed}|` +
    `${hud?.muted ? 1 : 0}${ui.paused ? 1 : 0}${Math.round(lessonCardAlpha(ui, state) * 32)}${ui.selectedTowerId ? 1 : 0}|${ui.outcome}|${hud?.streams ?? 0}|${ui.coinsTotal}|${hud?.pressedBooster ?? ''}`;
  // GD-5d / BUG-57: the select hint's spot, as this frame's world layout placed it (draw.ts `playLayout`)
  const hint = ui.selectedTowerId ? frameWorldLayout(state)?.hint : undefined;
  if (ui.selectedTowerId) k += `|p${selectHintPart(state, ui.selectedTowerId)}`; // AUD-U2: which half of the hint
  if (hint?.id === ui.selectedTowerId) k += `|s${Math.round(hint.rect.x)},${Math.round(hint.rect.y)}`;
  else if (ui.selectedTowerId) for (const r of selectHintAvoid(state, ui.selectedTowerId)) k += `|s${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;
  if (hud) {
    for (const b of hud.boosters) {
      k += `|${b.kind}${b.affordable ? 1 : 0}${b.active ? 1 : 0}${b.adOffer ? 1 : 0}:${b.charges}:${b.cost}`;
      if (b.active && b.durationMs > 0) k += `:${nowMs}`;
    }
    if (hud.targeting) k += `|T${nowMs}`;
    if (hud.toast) k += `|toast:${hud.toast.kind}:${hud.toast.t}:${hud.toast.y ?? ''}:${hud.toast.text}`;
    if (hud.wallet && ui.outcome !== 'playing') k += `|w${hud.wallet.gold}:${hud.wallet.crystals}:${hud.pressed === HUD.wallet ? 1 : 0}`;
  }
  return k;
}

/* ---------- overlays ---------- */

const overlayShownAt = new WeakMap<GameState, number>();

function dimWorld(ctx: CanvasRenderingContext2D, view: View, lost: boolean): void {
  // victory: blue-ink dim; defeat: a greyer, slightly desaturating veil — over the whole screen (BUG-34)
  ctx.fillStyle = lost ? 'rgba(70, 80, 100, 0.58)' : 'rgba(26, 58, 90, 0.5)';
  const r = bleedRect(view);
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/*
 * The pause menu and the result card live in a lazy chunk (PERF-6, src/render/hudOverlays.ts): the
 * play screen warms it at level start, on the first capture and when the outcome is decided
 * (`warmHudOverlays`), so the card is normally in long before it is needed. Until it lands — or when
 * it never does — a plain card with the same buttons keeps the match readable and leaves the player
 * a way out; draw time backs off a few seconds after a failure instead of hitting the network every
 * frame, and a failed download is retried under a fresh URL (src/lazyChunk.ts).
 */
const OVERLAY_CHUNK = 'hudOverlays';
let overlays: HudOverlayDrawers | null = null;
let overlaysPromise: Promise<HudOverlayDrawers> | null = null;

/** Load the pause / result card drawers (idempotent; a failed download is forgotten so the next call retries). */
export function loadHudOverlays(): Promise<HudOverlayDrawers> {
  // with the card's English strings (PERF-8, a chunk of their own): the card is in once both are
  overlaysPromise ??= Promise.all([loadChunk(OVERLAY_CHUNK, () => import('./hudOverlays')), loadEnglishMenus()])
    .then(([m]) => (overlays = m.HUD_OVERLAYS))
    .catch((err: unknown) => {
      overlaysPromise = null;
      throw err;
    });
  return overlaysPromise;
}

/** True once the overlay chunk is in (synchronous check for the play screen's preload). */
export function hudOverlaysLoaded(): boolean {
  return overlays !== null;
}

/** Start the overlay download unless one failed a moment ago (draw-time / event-time back-off). Never rejects. */
export function warmHudOverlays(): void {
  if (!overlays && !chunkBackoff(OVERLAY_CHUNK) && !chunkBackoff(ENGLISH_MENUS_CHUNK)) void loadHudOverlays().catch(() => undefined);
}

/** Plain pause card while the chunk is missing: title, subtitle and the same buttons at the same rects. */
function drawPlainPauseCard(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi): void {
  const pal = ui.palette;
  const card = PAUSE.card;
  drawCard(ctx, pal, card);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const title = t('pause.title');
  ctx.font = font(fitFontPx(ctx, title, 60, 460));
  ctx.fillText(title, 360, card.y + 72);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(24, '500');
  ctx.fillText(t('pause.subtitle', { n: ui.level.id, time: formatTime(clockOf(ui, state)) }), 360, card.y + 136, card.w - 40);
  const rows: [Rect, string][] = [
    [PAUSE.resume, t('pause.resume')],
    [PAUSE.speed, t('pause.speed', { n: ui.speed })],
    [PAUSE.sound, extrasOf(ui)?.muted ? t('pause.muted') : t('pause.sound')],
    [PAUSE.settings, t('pause.settings')],
    [PAUSE.retry, t('common.retry')],
    [PAUSE.menu, t('common.menu')],
    [PAUSE.howto, t('pause.howto')],
  ];
  for (const [r, label] of rows) drawButton(ctx, pal, r, label, { fill: r === PAUSE.resume ? pal.owners.player : undefined, fontPx: 24 });
}

/** Plain result card while the chunk is missing: outcome, time, stars and NEXT / RETRY / MENU (no offers, no tip). */
function drawPlainResultCard(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi): void {
  const pal = ui.palette;
  const won = ui.outcome === 'won';
  const layout = resultShareLayout(extrasOf(ui)?.result, won);
  const card = layout.card;
  const pressed = extrasOf(ui)?.pressed ?? null;
  drawCard(ctx, pal, card);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = won ? pal.gold : pal.ink;
  const title = won ? t('result.victory') : t('result.defeat');
  ctx.font = font(fitFontPx(ctx, title, 92, card.w - 60));
  ctx.fillText(title, 360, card.y + 82);
  ctx.fillStyle = pal.ink;
  ctx.font = font(30);
  ctx.fillText(t('result.time', { time: formatTime(clockOf(ui, state)) }), 360, card.y + (won ? 200 : 190), card.w - 60);
  if (won) drawStars(ctx, pal, 360, card.y + 272, ui.stars, 38);
  drawButton(ctx, pal, RESULT.next, t('common.next'), { fill: won ? pal.owners.player : undefined, disabled: !won || !ui.hasNext, fontPx: 26, pressed: pressed === RESULT.next });
  drawButton(ctx, pal, RESULT.retry, t('common.retry'), { fontPx: 26, pressed: pressed === RESULT.retry });
  drawButton(ctx, pal, RESULT.menu, t('common.menu'), { fontPx: 26, pressed: pressed === RESULT.menu });
  // the offers the result screen hit-tests (ResultScreen.rects) stay visible as plain buttons
  const ex = extrasOf(ui)?.result;
  if (!ex) return;
  const both = ex.continueCrystals !== null && ex.continueAd;
  const offers: [Rect, string][] = [];
  if (ex.continueCrystals !== null) offers.push([both ? RESULT.continueCrystals : RESULT.continueSolo, `${t('common.continue')} · ${ex.continueCrystals}`]);
  if (ex.continueAd) offers.push([both ? RESULT.continueAd : RESULT.continueSolo, `${t('common.continue')} · ${t('common.watch')}`]);
  if (won && ex.doubleGold !== null && !ex.doubled) offers.push([RESULT.extra, `${t('result.doubleGold', { n: ex.doubleGold })} · ${t('common.watch')}`]);
  else if (!won && ex.skipCrystals !== null) offers.push([RESULT.extra, `${t('result.skipLevel')} · ${ex.skipCrystals}`]);
  if (ex.howto) offers.push([RESULT.howto, t('result.howto')]);
  if (layout.share) offers.push([layout.share, t('result.share')]);
  for (const [r, label] of offers) drawButton(ctx, pal, r, label, { fontPx: 22, flat: true, pressed: pressed === r });
}

/**
 * Pause menu (while playing and paused) or the result card (won / lost). Call only when one applies.
 * Draws through the lazy overlay chunk once it is in, the plain cards until then.
 */
export function drawOverlays(ctx: CanvasRenderingContext2D, state: GameState, view: View, ui: PlayUi, nowMs: number): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ov = overlays;
  if (!ov) warmHudOverlays();
  // AUD-F4: during the result beat the world (the last capture) stays undimmed
  if (ui.outcome !== 'playing' && (ui as HudPlayUi).resultBeat) {
    ctx.restore();
    return;
  }
  if (ui.outcome === 'playing') {
    dimWorld(ctx, view, false);
    if (ov) ov.pause(ctx, state, ui);
    else drawPlainPauseCard(ctx, state, ui);
    ctx.restore();
    return;
  }
  dimWorld(ctx, view, ui.outcome === 'lost');
  let shown = overlayShownAt.get(state);
  if (shown === undefined) {
    shown = nowMs;
    overlayShownAt.set(state, nowMs);
  }
  const since = nowMs > 0 && motionAllowed() ? nowMs - shown : 10_000;
  if (ov) ov.result(ctx, state, ui, since, bleed(view).bottom);
  else drawPlainResultCard(ctx, state, ui);
  const toast = extrasOf(ui)?.toast;
  if (toast) drawToast(ctx, ui.palette, toast);
  ctx.restore();
}

/**
 * AUD-B2 / A11: the "Nothing is changing" card over a dimmed world (logical transform active), drawn by
 * the overlay chunk. The play screen raises the card only once that chunk is in (`hudOverlaysLoaded`).
 */
export function drawStallCard(ctx: CanvasRenderingContext2D, view: View, ui: PlayUi, pressed: Rect | null): void {
  const ov = overlays;
  if (!ov) return;
  ctx.save();
  dimWorld(ctx, view, false);
  ov.stall(ctx, ui, pressed);
  ctx.restore();
}
