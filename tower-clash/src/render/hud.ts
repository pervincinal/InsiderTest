import type { GameState } from '../sim/types';
import { C } from '../sim/constants';
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
  drawExtrudedText,
  drawGearGlyph,
  drawGlassBand,
  drawPill,
  drawRoundButton,
  drawSnowflakeGlyph,
  drawSpeakerGlyph,
  drawStarPop,
  easeOutBack,
  easeOutCubic,
  fitFontPx,
  font,
  formatTime,
  innerHighlight,
  roundRect,
  wrapText,
} from './widgets';
import type { PlayUi } from './draw';
import { prefersReducedMotion } from './particles';
import { reducedMotionOverride } from '../ui/motion';
import type { BoosterKind, BoosterStatus } from '../ui/boosters';
import type { Palette } from './palette';
import { drawCrystal, drawGoldCoin, drawVideoGlyph } from './sprites';
import type { ToastOpts } from './economyWidgets';
import { drawSpinner, drawToast, drawWallet } from './economyWidgets';
import { t } from '../ui/i18n';

/*
 * In-game HUD (ART_DIRECTION §4): glass paper bands top and bottom, level chip, timer pill, pause
 * button, segmented SEND toggle, MENU; the pause card and the result card (slide-up, sequential
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
  /** Gold + crystal balances (drawn over the booster bar once the level is over; tap → shop). */
  wallet?: { gold: number; crystals: number };
  /** Economy rows on the result card (ECONOMY.md §3.4, §3.5, §5.2). */
  result?: ResultExtras;
  /** Result-card rect currently held down. */
  pressed?: Rect | null;
  toast?: ToastOpts | null;
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

function extrasOf(ui: PlayUi): HudExtras | undefined {
  return (ui as HudPlayUi).hud;
}

function clockOf(ui: PlayUi, state: Pick<GameState, 'time'>): number {
  return (ui as HudPlayUi).clockMs ?? state.time;
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

/** SEND ratio as a segmented control: label column, then 100 % | 50 % segments (left / right half of the rect). */
function drawSendToggle(ctx: CanvasRenderingContext2D, ui: PlayUi): void {
  const pal = ui.palette;
  const r = HUD.ratio;
  drawButton(ctx, pal, r, '');
  const labelW = 56;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.font = font(14);
  ctx.fillText(t('hud.send'), r.x + labelW / 2 + 2, r.y + (r.h - 4) / 2 + 1, labelW - 4);
  const segW = (r.w - labelW - 8) / 2;
  const segs: { label: string; ratio: number }[] = [
    { label: '100%', ratio: 1 },
    { label: '50%', ratio: 0.5 },
  ];
  segs.forEach((seg, i) => {
    const sr: Rect = { x: r.x + labelW + i * segW, y: r.y + 6, w: segW, h: r.h - 4 - 12 };
    const active = ui.sendRatio === seg.ratio;
    if (active) {
      roundRect(ctx, { x: sr.x, y: sr.y + 2, w: sr.w, h: sr.h }, 12);
      ctx.fillStyle = shade(pal.owners.player, -0.4);
      ctx.fill();
      roundRect(ctx, sr, 12);
      ctx.fillStyle = pal.owners.player;
      ctx.fill();
      innerHighlight(ctx, sr, 12, 0.45);
    }
    ctx.fillStyle = active ? pal.paper : pal.textDim;
    ctx.font = font(21);
    ctx.fillText(seg.label, sr.x + sr.w / 2, sr.y + sr.h / 2 + 1, sr.w - 4);
  });
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
  // glass bands
  drawGlassBand(ctx, HUD.topBar);
  drawGlassBand(ctx, HUD.bottomBar);

  // level chip: small "LEVEL n" over the name
  const chip = HUD.levelChip;
  drawPill(ctx, chip, pal.paper);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.font = font(14, '500');
  ctx.fillText(t('hud.level', { n: ui.level.id }), chip.x + 24, chip.y + 19, chip.w - 44);
  ctx.fillStyle = pal.ink;
  ctx.font = font(24);
  ctx.fillText(ui.level.name, chip.x + 24, chip.y + 41, chip.w - 44);

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

  // lesson hint during the first seconds (a small translated "LESSON" caption over the English lesson text)
  if (state.time < 8000 && ui.outcome === 'playing') {
    ctx.font = font(20, '500');
    const lines = wrapText(ctx, ui.level.lesson, 620, 3);
    const captionH = 18;
    const h = lines.length * 26 + 18 + captionH;
    const w = Math.min(680, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48);
    drawCard(ctx, pal, { x: 360 - w / 2, y: 108, w, h }, { radius: 18, edge: 4 });
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.textDim;
    ctx.font = font(13, '500');
    ctx.fillText(t('hud.lesson'), 360, 108 + 14, w - 24);
    ctx.fillStyle = pal.ink;
    ctx.font = font(20, '500');
    lines.forEach((l, i) => ctx.fillText(l, 360, 108 + 20 + captionH + i * 26));
  }

  // bottom bar: send ratio · boosters · coins · menu (wallet replaces boosters + coins once the level is over)
  drawSendToggle(ctx, ui);
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
  ctx.restore();
}

/* ---------- overlays ---------- */

const overlayShownAt = new WeakMap<GameState, number>();

function dimWorld(ctx: CanvasRenderingContext2D, lost: boolean): void {
  // victory: blue-ink dim; defeat: a greyer, slightly desaturating veil
  ctx.fillStyle = lost ? 'rgba(70, 80, 100, 0.58)' : 'rgba(26, 58, 90, 0.5)';
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
}

function drawPauseCard(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi): void {
  const pal = ui.palette;
  const hud = extrasOf(ui);
  const card = PAUSE.card;
  drawCard(ctx, pal, card);
  const pausedTitle = t('pause.title');
  drawExtrudedText(ctx, pausedTitle, 360, card.y + 72, fitFontPx(ctx, pausedTitle, 60, 460), { face: pal.paper, side: shade(pal.owners.player, -0.3), outline: pal.ink, depth: 5 });
  ctx.fillStyle = pal.textDim;
  ctx.font = font(24, '500');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t('pause.subtitle', { n: ui.level.id, time: formatTime(clockOf(ui, state)) }), 360, card.y + 136, card.w - 40);
  drawButton(ctx, pal, PAUSE.resume, t('pause.resume'), { fill: pal.owners.player, fontPx: 30 });
  const fast = ui.speed !== 1;
  drawButton(ctx, pal, PAUSE.speed, t('pause.speed', { n: ui.speed }), { fontPx: 24, border: fast ? pal.accent : undefined, text: fast ? pal.accent : undefined });
  // sound toggle (glyph + state) · settings (gear)
  const muted = hud?.muted ?? false;
  const sb = PAUSE.sound;
  drawButton(ctx, pal, sb, '');
  drawSpeakerGlyph(ctx, muted ? pal.textDim : pal.ink, sb.x + 34, sb.y + (sb.h - 4) / 2, 14, !muted);
  ctx.fillStyle = muted ? pal.textDim : pal.ink;
  ctx.font = font(20);
  ctx.textAlign = 'left';
  ctx.fillText(muted ? t('pause.muted') : t('pause.sound'), sb.x + 62, sb.y + (sb.h - 4) / 2 + 1, sb.w - 72);
  const gb = PAUSE.settings;
  drawButton(ctx, pal, gb, '');
  drawGearGlyph(ctx, pal.ink, gb.x + 32, gb.y + (gb.h - 4) / 2, 12);
  ctx.fillStyle = pal.ink;
  ctx.font = font(20);
  ctx.fillText(t('pause.settings'), gb.x + 56, gb.y + (gb.h - 4) / 2 + 1, gb.w - 66);
  ctx.textAlign = 'center';
  drawButton(ctx, pal, PAUSE.retry, t('common.retry'), { fontPx: 26 });
  drawButton(ctx, pal, PAUSE.menu, t('common.menu'), { fontPx: 26 });
}

function drawResultCard(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi, since: number): void {
  const pal = ui.palette;
  const won = ui.outcome === 'won';
  const card = RESULT.card;
  // slide up with a bounce
  const slide = (1 - easeOutBack(Math.min(1, since / 460))) * (C.MAP_H - card.y + 40);
  ctx.save();
  ctx.translate(0, slide);
  drawCard(ctx, pal, card);
  // banner: coloured top of the card
  ctx.save();
  roundRect(ctx, { x: card.x, y: card.y, w: card.w, h: card.h - 6 }, 28);
  ctx.clip();
  const bannerH = 158;
  const bannerColor = won ? pal.owners.player : pal.owners.enemy1;
  const g = ctx.createLinearGradient(0, card.y, 0, card.y + bannerH);
  g.addColorStop(0, shade(bannerColor, 0.18));
  g.addColorStop(1, bannerColor);
  ctx.fillStyle = g;
  ctx.fillRect(card.x, card.y, card.w, bannerH);
  ctx.fillStyle = shade(bannerColor, -0.3);
  ctx.fillRect(card.x, card.y + bannerH - 5, card.w, 5);
  ctx.restore();
  innerHighlight(ctx, { x: card.x, y: card.y, w: card.w, h: card.h - 6 }, 28, 0.5, 3);
  const titleScale = easeOutBack(Math.min(1, Math.max(0, (since - 120) / 380)));
  const title = won ? t('result.victory') : t('result.defeat');
  const titlePx = fitFontPx(ctx, title, 92, card.w - 60);
  ctx.save();
  ctx.translate(360, card.y + 82);
  ctx.scale(titleScale, titleScale);
  if (won) drawExtrudedText(ctx, title, 0, 0, titlePx, { face: pal.gold, side: pal.goldShade, outline: pal.ink, depth: 8 });
  else drawExtrudedText(ctx, title, 0, 0, titlePx, { face: pal.paper, side: shade(pal.owners.enemy1, -0.45), outline: pal.ink, depth: 8 });
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(30);
  ctx.fillText(t('result.time', { time: formatTime(clockOf(ui, state)) }), 360, card.y + 200, card.w - 60);

  // stars pop in one after another with a gold burst
  const starY = card.y + 272;
  for (let i = 0; i < 3; i++) {
    const t = (since - 420 - i * 260) / 380;
    drawStarPop(ctx, pal, 360 + (i - 1) * 100, starY, 38, won && i < ui.stars, t);
  }

  const hud = extrasOf(ui);
  const ex = hud?.result;
  const pressed = hud?.pressed ?? null;
  if (won) {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20, '500');
    ctx.fillText(t('result.starRule', { t3: formatTime(ui.level.star3), t2: formatTime(ui.level.star2) }), 360, card.y + 326, card.w - 60);
    // gold counts up (a crystal reward sits beside it)
    const countT = easeOutCubic((since - 900) / 800);
    const shown = Math.round(ui.coinsEarned * countT);
    const pop = 1 + 0.12 * Math.max(0, 1 - Math.abs((since - 1700) / 180));
    ctx.font = font(34);
    const label = `+${shown}`;
    const labelW = ctx.measureText(label).width;
    const crystals = ex?.crystalsEarned ?? 0;
    const cx = crystals > 0 ? 260 : 360;
    ctx.save();
    ctx.translate(cx, card.y + 376);
    ctx.scale(pop, pop);
    drawGoldCoin(ctx, pal, -labelW / 2 - 24, 0, 17);
    ctx.fillStyle = pal.ink;
    ctx.font = font(34);
    ctx.fillText(label, 8, 1);
    ctx.restore();
    if (crystals > 0) {
      const cl = `+${Math.round(crystals * countT)}`;
      ctx.font = font(34);
      const clw = ctx.measureText(cl).width;
      ctx.save();
      ctx.translate(470, card.y + 376);
      ctx.scale(pop, pop);
      drawCrystal(ctx, pal, -clw / 2 - 22, 0, 17);
      ctx.fillStyle = pal.ink;
      ctx.fillText(cl, 8, 1);
      ctx.restore();
    }
    ctx.fillStyle = pal.textDim;
    ctx.font = font(18, '500');
    const note = ex?.notes.length
      ? ex.notes.join(' · ')
      : ex?.replayCapped
        ? t('result.replayCapped')
        : ui.coinsEarned > 0
          ? t('result.goldTotal', { n: ui.coinsTotal })
          : t('result.alreadyCleared', { n: ui.coinsTotal });
    ctx.fillText(note, 360, card.y + 416, card.w - 60);
  } else {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(22, '500');
    ctx.fillText(t('result.allLost'), 360, card.y + 318, card.w - 60);
    // Reinforcements: crystals and / or a rewarded video (ECONOMY.md §3.5)
    if (ex && (ex.continueCrystals !== null || ex.continueAd)) {
      const both = ex.continueCrystals !== null && ex.continueAd;
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.textDim;
      ctx.font = font(16, '500');
      ctx.fillText(t('result.reinforcements', { s: Math.round(C.CONTINUE_REWIND_MS / 1000), n: C.CONTINUE_INFANTRY }), 360, RESULT.continueSolo.y - 18, card.w - 60);
      if (ex.continueCrystals !== null) {
        const r = both ? RESULT.continueCrystals : RESULT.continueSolo;
        drawOfferButton(ctx, pal, r, t('common.continue'), String(ex.continueCrystals), 'crystal', { pressed: pressed === r, pending: ex.pending, nowMs: since });
      }
      if (ex.continueAd) {
        const r = both ? RESULT.continueAd : RESULT.continueSolo;
        drawOfferButton(ctx, pal, r, t('common.continue'), t('common.watch'), 'video', { pressed: pressed === r, pending: ex.pending, nowMs: since });
      }
      ctx.textAlign = 'center';
    }
  }
  drawButton(ctx, pal, RESULT.next, t('common.next'), { fill: won ? pal.owners.player : undefined, disabled: !won || !ui.hasNext, fontPx: 26, pressed: pressed === RESULT.next });
  drawButton(ctx, pal, RESULT.retry, t('common.retry'), { fontPx: 26, pressed: pressed === RESULT.retry });
  drawButton(ctx, pal, RESULT.menu, t('common.menu'), { fontPx: 26, pressed: pressed === RESULT.menu });
  if (ex) {
    if (won && ex.doubleGold !== null && !ex.doubled) {
      drawOfferButton(ctx, pal, RESULT.extra, t('result.doubleGold', { n: ex.doubleGold }), t('common.watch'), 'video', { pressed: pressed === RESULT.extra, pending: ex.pending, nowMs: since });
    } else if (won && ex.doubled) {
      ctx.fillStyle = pal.textDim;
      ctx.font = font(18, '500');
      ctx.fillText(t('result.goldDoubled'), 360, RESULT.extra.y + RESULT.extra.h / 2);
    } else if (!won && ex.skipCrystals !== null) {
      drawOfferButton(ctx, pal, RESULT.extra, t('result.skipLevel'), String(ex.skipCrystals), 'crystal', { pressed: pressed === RESULT.extra, pending: ex.pending, nowMs: since, outline: true });
    }
  }
  ctx.restore();
}

/**
 * Offer button: label left, a price tag right (crystal glyph + amount, or a video glyph + WATCH).
 * `outline` draws the paper variant (secondary offer).
 */
function drawOfferButton(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: Rect,
  label: string,
  tag: string,
  glyph: 'crystal' | 'video',
  o: { pressed: boolean; pending: boolean; nowMs: number; outline?: boolean },
): void {
  const fill = o.outline ? undefined : glyph === 'video' ? pal.owners.enemy2 : pal.owners.player;
  drawButton(ctx, pal, r, '', { fill, pressed: o.pressed, flat: true });
  const cy = r.y + (r.h - 4) / 2 + (o.pressed ? 3 : 0);
  const text = fill ? pal.paper : pal.ink;
  ctx.textBaseline = 'middle';
  if (o.pending) {
    drawSpinner(ctx, text, r.x + r.w / 2, cy, 11, o.nowMs);
    return;
  }
  ctx.fillStyle = text;
  ctx.font = font(21);
  ctx.textAlign = 'left';
  ctx.fillText(label, r.x + 18, cy + 1, r.w * 0.58);
  ctx.font = font(19);
  const tw = ctx.measureText(tag).width;
  const gx = r.x + r.w - 18 - tw - 28;
  if (glyph === 'crystal') drawCrystal(ctx, pal, gx + 6, cy, 11);
  else drawVideoGlyph(ctx, pal, gx + 8, cy, 10);
  ctx.textAlign = 'left';
  ctx.fillStyle = text;
  ctx.fillText(tag, gx + 26, cy + 1);
  ctx.textAlign = 'center';
}

/** Pause menu (while playing and paused) or the result card (won / lost). Call only when one applies. */
export function drawOverlays(ctx: CanvasRenderingContext2D, state: GameState, _view: View, ui: PlayUi, nowMs: number): void {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (ui.outcome === 'playing') {
    dimWorld(ctx, false);
    drawPauseCard(ctx, state, ui);
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
  drawResultCard(ctx, state, ui, since);
  const toast = extrasOf(ui)?.toast;
  if (toast) drawToast(ctx, ui.palette, toast);
  ctx.restore();
}
