import type { GameState } from '../sim/types';
import { C } from '../sim/constants';
import { chunkBackoff, loadChunk } from '../lazyChunk';
import { shade } from './palette';
import type { View } from './view';
import { BOOSTERS, HUD, PAUSE, RESULT } from './layout';
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
  drawStars,
  fitFontPx,
  font,
  formatTime,
  roundRect,
  wrapText,
} from './widgets';
import type { PlayUi } from './draw';
import { prefersReducedMotion } from './particles';
import { reducedMotionOverride } from '../ui/motion';
import type { BoosterKind, BoosterStatus } from '../ui/boosters';
import { badgeY, drawVideoGlyph } from './sprites';
import type { ToastOpts } from './economyWidgets';
import { drawToast, drawWallet } from './economyWidgets';
import type { HudOverlayDrawers } from './hudOverlays';
import { currentLanguage, levelLesson, levelName, t } from '../ui/i18n';

/*
 * In-game HUD (ART_DIRECTION §4): glass paper bands top and bottom, level chip, timer pill, pause
 * button, the active-streams pill (rules v2), MENU; the pause card and the result card (slide-up, sequential
 * star pops, extruded VICTORY / DEFEAT, coins counting up). Drawn by draw.ts after the world with
 * the logical (720×1280) transform active and the canvas clipped to the map. Reads state only.
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
};

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

/** Active-streams pill (rules v2, where the SEND toggle used to be): small caption, then "⇢ n". */
function drawStreamsPill(ctx: CanvasRenderingContext2D, ui: PlayUi, n: number): void {
  const pal = ui.palette;
  const r = HUD.streams;
  drawButton(ctx, pal, r, '');
  const cy = r.y + (r.h - 4) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.font = font(14, '500');
  ctx.fillText(t('hud.streams'), r.x + 16, cy - 13, 120);
  const color = n > 0 ? pal.owners.player : pal.textDim;
  drawStreamArrow(ctx, color, r.x + 28, cy + 12, 12, 3);
  ctx.fillStyle = n > 0 ? pal.ink : pal.textDim;
  ctx.font = font(26);
  ctx.fillText(String(n), r.x + 48, cy + 13);
}

/** A stroked "⇢" (shaft + chevron head) pointing right, centred on (cx, cy). */
function drawStreamArrow(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, len: number, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - len / 2, cy);
  ctx.lineTo(cx + len / 2, cy);
  ctx.moveTo(cx + len / 2 - len * 0.4, cy - len * 0.4);
  ctx.lineTo(cx + len / 2, cy);
  ctx.lineTo(cx + len / 2 - len * 0.4, cy + len * 0.4);
  ctx.stroke();
}

/**
 * Per-tower stream count (rules v2): a small "⇢n" chip left of the garrison badge of every tower
 * that currently streams through ≥ 1 link (growth paused, rules v3), in the owner's tone so enemy streams read too.
 */
function drawStreamChips(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi): void {
  const pal = ui.palette;
  const counts = new Map<string, number>();
  for (const l of state.links) counts.set(l.from, (counts.get(l.from) ?? 0) + 1);
  if (counts.size === 0) return;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const [id, n] of counts) {
    const tw = state.towers[id];
    if (!tw) continue;
    const raise = ui.selectedTowerId === tw.id ? 4 : 0;
    const by = Math.max(HUD.mapTop + 26, tw.y + badgeY(tw.kind, tw.level) - raise);
    const tones = pal.ownerTones[tw.owner];
    const chip: Rect = { x: tw.x - 72, y: by - 11, w: 46, h: 24 };
    ctx.fillStyle = pal.groundShadow;
    roundRect(ctx, { x: chip.x + 1, y: chip.y + 3, w: chip.w, h: chip.h }, 12);
    ctx.fill();
    roundRect(ctx, chip, 12);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = tones.shade;
    ctx.stroke();
    drawStreamArrow(ctx, tones.mid, chip.x + 14, chip.y + chip.h / 2, 10, 2.5);
    ctx.fillStyle = pal.ink;
    ctx.font = font(16, '900');
    ctx.fillText(String(n), chip.x + 25, chip.y + chip.h / 2 + 1);
  }
  ctx.restore();
}

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
    const chip: Rect = { x: rect.x + 6, y: rect.y + BOOSTERS.disc + 4, w: rect.w - 12, h: BOOSTERS.chipH };
    roundRect(ctx, chip, chip.h / 2);
    const chipFill = st.charges > 0 ? pal.gold : st.adOffer ? pal.owners.player : st.affordable ? pal.paper : shade(pal.panel, -0.1);
    ctx.fillStyle = chipFill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = st.charges > 0 ? pal.goldShade : st.adOffer ? shade(pal.owners.player, -0.35) : st.affordable ? shade(pal.gold, -0.2) : pal.textDim;
    ctx.stroke();
    ctx.font = font(16);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (st.charges > 0) {
      ctx.fillStyle = pal.ink;
      ctx.textAlign = 'center';
      ctx.fillText(`×${st.charges}`, chip.x + chip.w / 2, chip.y + chip.h / 2 + 1);
    } else if (st.adOffer) {
      drawVideoGlyph(ctx, pal, chip.x + 13, chip.y + chip.h / 2, 7);
      ctx.fillStyle = pal.paper;
      const free = t('hud.free');
      ctx.font = font(free.length > 4 ? 11 : 14);
      ctx.fillText(free, chip.x + 24, chip.y + chip.h / 2 + 1, chip.w - 26);
    } else {
      drawCoin(ctx, pal, chip.x + 12, chip.y + chip.h / 2, 7);
      ctx.fillStyle = st.affordable ? pal.ink : pal.textDim;
      ctx.fillText(String(st.cost), chip.x + 23, chip.y + chip.h / 2 + 1);
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
  ctx.font = font(24);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(ui.coinsTotal), r.x + r.w - 14, r.y + r.h / 2 + 1, r.w - 50);
}

/** Airstrike targeting: pulsing crosshair rings on every enemy tower and an instruction pill. */
function drawTargeting(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi, nowMs: number): void {
  const pal = ui.palette;
  const color = boosterColor(pal, 'airstrike');
  const pulse = motionAllowed() ? (Math.sin(nowMs / 200) + 1) / 2 : 0.5;
  ctx.save();
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.owner === 'player' || t.owner === 'neutral') continue;
    ctx.globalAlpha = 0.55 + 0.45 * (1 - pulse);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 10]);
    ctx.lineDashOffset = motionAllowed() ? -(nowMs / 30) % 24 : 0;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 52 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawCrosshairGlyph(ctx, color, t.x, t.y - 70, 14);
  }
  ctx.restore();
  ctx.font = font(20, '500');
  const text = t('hud.airstrikeHint');
  const w = Math.min(700, ctx.measureText(text).width + 44);
  const pill: Rect = { x: 360 - w / 2, y: 1126, w, h: 42 };
  drawPill(ctx, pill, color, shade(color, -0.35));
  ctx.fillStyle = pal.paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 360, pill.y + pill.h / 2 + 1, w - 20);
}

export function drawHud(ctx: CanvasRenderingContext2D, state: GameState, _view: View, ui: PlayUi, nowMs: number): void {
  const pal = ui.palette;
  const hud = extrasOf(ui);
  ctx.save();
  // stream counters sit on the world, just under the bands
  if (ui.outcome === 'playing') drawStreamChips(ctx, state, ui);
  // glass bands
  drawGlassBand(ctx, HUD.topBar);
  drawGlassBand(ctx, HUD.bottomBar);

  // level chip: small "LEVEL n" over the name (a challenge: the twist's name over "Daily · name")
  const chip = HUD.levelChip;
  drawPill(ctx, chip, pal.paper, hud?.challenge ? pal.gold : undefined);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = hud?.challenge ? pal.goldShade : pal.textDim;
  ctx.font = font(14, '500');
  ctx.fillText(hud?.challenge ? hud.challenge.twist : t('hud.level', { n: ui.level.id }), chip.x + 24, chip.y + 19, chip.w - 44);
  ctx.fillStyle = pal.ink;
  const chipTitle = hud?.challenge ? t(hud.challenge.weekly ? 'weekly.chip' : 'daily.chip', { name: levelName(ui.level) }) : levelName(ui.level);
  ctx.font = font(fitFontPx(ctx, chipTitle, 24, chip.w - 44));
  ctx.fillText(chipTitle, chip.x + 24, chip.y + 41, chip.w - 44);

  // timer pill (+ speed tag)
  const timer = HUD.timer;
  drawPill(ctx, timer, pal.paper);
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink;
  ctx.font = font(34);
  ctx.fillText(formatTime(clockOf(ui, state)), timer.x + timer.w / 2, timer.y + timer.h / 2 + 2);
  if (ui.speed !== 1) {
    const tag = HUD.speedTag;
    drawPill(ctx, tag, pal.accent);
    ctx.fillStyle = pal.paper;
    ctx.font = font(20);
    ctx.fillText(`×${ui.speed}`, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  }

  // mute + pause buttons
  const mb = HUD.mute;
  const muted = hud?.muted ?? false;
  drawButton(ctx, pal, mb, '');
  drawSpeakerGlyph(ctx, muted ? pal.textDim : pal.ink, mb.x + mb.w / 2 - 2, mb.y + (mb.h - 4) / 2, 15, !muted);
  const pb = HUD.pause;
  drawButton(ctx, pal, pb, '');
  pauseGlyph(ctx, pal.ink, pb.x + pb.w / 2, pb.y + (pb.h - 4) / 2, ui.paused);

  // lesson hint during the first seconds (a small "LESSON" caption over the lesson text, both in the
  // UI language). Up to three lines at 20 px; longer lessons (band finales, translations) drop to
  // 18 px and up to five lines rather than being cut with an ellipsis.
  if (state.time < 8000 && ui.outcome === 'playing') {
    const lesson = levelLesson(ui.level);
    ctx.font = font(20, '500');
    let lines = wrapText(ctx, lesson, 620, 3);
    let px = 20;
    if (lines[lines.length - 1]?.endsWith('…')) {
      px = 18;
      ctx.font = font(px, '500');
      lines = wrapText(ctx, lesson, 640, 5);
    }
    const lineH = px + 6;
    const captionH = 18;
    const h = lines.length * lineH + 18 + captionH;
    const w = Math.min(690, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48);
    drawCard(ctx, pal, { x: 360 - w / 2, y: 108, w, h }, { radius: 18, edge: 4 });
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textDim;
    ctx.font = font(13, '500');
    ctx.fillText(t('hud.lesson'), 360, 108 + 14, w - 24);
    ctx.fillStyle = pal.ink;
    ctx.font = font(px, '500');
    lines.forEach((l, i) => ctx.fillText(l, 360, 108 + 20 + captionH + i * lineH));
  }

  // bottom bar: streams · boosters · coins · menu (wallet replaces boosters + coins once the level is over)
  drawStreamsPill(ctx, ui, hud?.streams ?? 0);
  if (ui.outcome !== 'playing' && hud?.wallet) {
    drawWallet(ctx, pal, HUD.wallet, hud.wallet.gold, hud.wallet.crystals, { pressed: hud.pressed === HUD.wallet });
  } else {
    if (hud) drawBoosterBar(ctx, ui, hud, nowMs);
    drawCoinPill(ctx, ui);
  }
  drawButton(ctx, pal, HUD.menu, t('common.menu'), { fontPx: 22 });

  if (hud?.targeting && ui.outcome === 'playing' && !ui.paused) drawTargeting(ctx, state, ui, nowMs);
  // selection hint (just above the bottom band)
  else if (ui.selectedTowerId && ui.outcome === 'playing') {
    ctx.font = font(19, '500');
    const text = t('hud.selectHint');
    const w = Math.min(700, ctx.measureText(text).width + 40);
    const pill: Rect = { x: 360 - w / 2, y: 1128, w, h: 38 };
    drawPill(ctx, pill, pal.paper);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.fillText(text, 360, pill.y + pill.h / 2 + 1, w - 20);
  }
  // transient status while playing (free charge added, "not in the daily challenge"); overlays draw their own
  if (hud?.toast && ui.outcome === 'playing' && !ui.paused) drawToast(ctx, pal, hud.toast);
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
    `${currentLanguage()}|${ui.palette.owners.enemy1}|${ui.level.id}|${hud?.challenge?.twist ?? ''}|${formatTime(clockOf(ui, state))}|${ui.speed}|` +
    `${hud?.muted ? 1 : 0}${ui.paused ? 1 : 0}${state.time < 8000 ? 1 : 0}${ui.selectedTowerId ? 1 : 0}|${ui.outcome}|${hud?.streams ?? 0}|${ui.coinsTotal}|${hud?.pressedBooster ?? ''}`;
  if (hud) {
    for (const b of hud.boosters) {
      k += `|${b.kind}${b.affordable ? 1 : 0}${b.active ? 1 : 0}${b.adOffer ? 1 : 0}:${b.charges}:${b.cost}`;
      if (b.active && b.durationMs > 0) k += `:${nowMs}`;
    }
    if (hud.targeting) k += `|T${nowMs}`;
    if (hud.toast) k += `|toast:${hud.toast.kind}:${hud.toast.t}:${hud.toast.y ?? ''}:${hud.toast.text}`;
    if (hud.wallet && ui.outcome !== 'playing') k += `|w${hud.wallet.gold}:${hud.wallet.crystals}:${hud.pressed === HUD.wallet ? 1 : 0}`;
  }
  for (const l of state.links) {
    const tw = state.towers[l.from];
    if (tw) k += `|${l.from}:${tw.owner}:${tw.kind}:${tw.level}${ui.selectedTowerId === tw.id ? '*' : ''}`;
  }
  return k;
}

/* ---------- overlays ---------- */

const overlayShownAt = new WeakMap<GameState, number>();

function dimWorld(ctx: CanvasRenderingContext2D, lost: boolean): void {
  // victory: blue-ink dim; defeat: a greyer, slightly desaturating veil
  ctx.fillStyle = lost ? 'rgba(70, 80, 100, 0.58)' : 'rgba(26, 58, 90, 0.5)';
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
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
  overlaysPromise ??= loadChunk(OVERLAY_CHUNK, () => import('./hudOverlays'))
    .then((m) => (overlays = m.HUD_OVERLAYS))
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
  if (!overlays && !chunkBackoff(OVERLAY_CHUNK)) void loadHudOverlays().catch(() => undefined);
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
  for (const [r, label] of offers) drawButton(ctx, pal, r, label, { fontPx: 18, flat: true, pressed: pressed === r });
}

/**
 * Pause menu (while playing and paused) or the result card (won / lost). Call only when one applies.
 * Draws through the lazy overlay chunk once it is in, the plain cards until then.
 */
export function drawOverlays(ctx: CanvasRenderingContext2D, state: GameState, _view: View, ui: PlayUi, nowMs: number): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ov = overlays;
  if (!ov) warmHudOverlays();
  if (ui.outcome === 'playing') {
    dimWorld(ctx, false);
    if (ov) ov.pause(ctx, state, ui);
    else drawPlainPauseCard(ctx, state, ui);
    ctx.restore();
    return;
  }
  dimWorld(ctx, ui.outcome === 'lost');
  let shown = overlayShownAt.get(state);
  if (shown === undefined) {
    shown = nowMs;
    overlayShownAt.set(state, nowMs);
  }
  const since = nowMs > 0 && motionAllowed() ? nowMs - shown : 10_000;
  if (ov) ov.result(ctx, state, ui, since);
  else drawPlainResultCard(ctx, state, ui);
  const toast = extrasOf(ui)?.toast;
  if (toast) drawToast(ctx, ui.palette, toast);
  ctx.restore();
}
