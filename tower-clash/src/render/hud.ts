import type { GameState } from '../sim/types';
import { C } from '../sim/constants';
import { shade } from './palette';
import type { View } from './view';
import { HUD, PAUSE, RESULT } from './layout';
import type { Rect } from './widgets';
import {
  drawButton,
  drawCard,
  drawCoin,
  drawExtrudedText,
  drawGlassBand,
  drawPill,
  drawStarPop,
  easeOutBack,
  easeOutCubic,
  font,
  formatTime,
  innerHighlight,
  roundRect,
  wrapText,
} from './widgets';
import type { PlayUi } from './draw';
import { prefersReducedMotion } from './particles';

/*
 * In-game HUD (ART_DIRECTION §4): glass paper bands top and bottom, level chip, timer pill, pause
 * button, segmented SEND toggle, MENU; the pause card and the result card (slide-up, sequential
 * star pops, extruded VICTORY / DEFEAT, coins counting up). Drawn by draw.ts after the world with
 * the logical (720×1280) transform active and the canvas clipped to the map. Reads state only.
 */

let reducedMotion: boolean | null = null;
function motionAllowed(): boolean {
  if (reducedMotion === null) reducedMotion = prefersReducedMotion();
  return !reducedMotion;
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
  const labelW = 64;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.font = font(15);
  ctx.fillText('SEND', r.x + labelW / 2 + 2, r.y + (r.h - 4) / 2 + 1);
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
    ctx.font = font(22);
    ctx.fillText(seg.label, sr.x + sr.w / 2, sr.y + sr.h / 2 + 1);
  });
}

export function drawHud(ctx: CanvasRenderingContext2D, state: GameState, _view: View, ui: PlayUi, _nowMs: number): void {
  const pal = ui.palette;
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
  ctx.fillText(`LEVEL ${ui.level.id}`, chip.x + 24, chip.y + 19);
  ctx.fillStyle = pal.ink;
  ctx.font = font(24);
  ctx.fillText(ui.level.name, chip.x + 24, chip.y + 41, chip.w - 44);

  // timer pill (+ speed tag)
  const timer = HUD.timer;
  drawPill(ctx, timer, pal.paper);
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink;
  ctx.font = font(34);
  ctx.fillText(formatTime(state.time), timer.x + timer.w / 2, timer.y + timer.h / 2 + 2);
  if (ui.speed !== 1) {
    const tag: Rect = { x: 444, y: 30, w: 82, h: 36 };
    drawPill(ctx, tag, pal.accent);
    ctx.fillStyle = pal.paper;
    ctx.font = font(20);
    ctx.fillText(`×${ui.speed}`, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  }

  // pause button
  const pb = HUD.pause;
  drawButton(ctx, pal, pb, '');
  pauseGlyph(ctx, pal.ink, pb.x + pb.w / 2, pb.y + (pb.h - 4) / 2, ui.paused);

  // lesson hint during the first seconds
  if (state.time < 8000 && ui.outcome === 'playing') {
    ctx.font = font(20, '500');
    const lines = wrapText(ctx, ui.level.lesson, 620, 3);
    const h = lines.length * 26 + 18;
    const w = Math.min(680, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48);
    drawCard(ctx, pal, { x: 360 - w / 2, y: 108, w, h }, { radius: 18, edge: 4 });
    ctx.fillStyle = pal.ink;
    ctx.font = font(20, '500');
    ctx.textAlign = 'center';
    lines.forEach((l, i) => ctx.fillText(l, 360, 108 + 20 + i * 26));
  }

  // bottom bar: send ratio + menu
  drawSendToggle(ctx, ui);
  drawButton(ctx, pal, HUD.menu, 'MENU', { fontPx: 24 });

  // selection hint (just above the bottom band)
  if (ui.selectedTowerId && ui.outcome === 'playing') {
    ctx.font = font(19, '500');
    const text = 'Tap a connected tower to send · tap again to upgrade';
    const w = ctx.measureText(text).width + 40;
    const pill: Rect = { x: 360 - w / 2, y: 1134, w, h: 38 };
    drawPill(ctx, pill, pal.paper);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.fillText(text, 360, pill.y + pill.h / 2 + 1);
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
  drawCard(ctx, pal, PAUSE.card);
  drawExtrudedText(ctx, 'PAUSED', 360, 492, 60, { face: pal.paper, side: shade(pal.owners.player, -0.3), outline: pal.ink, depth: 5 });
  ctx.fillStyle = pal.textDim;
  ctx.font = font(24, '500');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Level ${ui.level.id} · ${formatTime(state.time)}`, 360, 556);
  drawButton(ctx, pal, PAUSE.resume, 'RESUME', { fill: pal.owners.player, fontPx: 30 });
  const fast = ui.speed !== 1;
  drawButton(ctx, pal, PAUSE.speed, `SPEED ×${ui.speed}`, { fontPx: 24, border: fast ? pal.accent : undefined, text: fast ? pal.accent : undefined });
  drawButton(ctx, pal, PAUSE.retry, 'RETRY', { fontPx: 26 });
  drawButton(ctx, pal, PAUSE.menu, 'MENU', { fontPx: 26 });
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
  ctx.save();
  ctx.translate(360, card.y + 82);
  ctx.scale(titleScale, titleScale);
  if (won) drawExtrudedText(ctx, 'VICTORY', 0, 0, 92, { face: pal.gold, side: pal.goldShade, outline: pal.ink, depth: 8 });
  else drawExtrudedText(ctx, 'DEFEAT', 0, 0, 92, { face: pal.paper, side: shade(pal.owners.enemy1, -0.45), outline: pal.ink, depth: 8 });
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(30);
  ctx.fillText(`Time ${formatTime(state.time)}`, 360, card.y + 200);

  // stars pop in one after another with a gold burst
  const starY = card.y + 272;
  for (let i = 0; i < 3; i++) {
    const t = (since - 420 - i * 260) / 380;
    drawStarPop(ctx, pal, 360 + (i - 1) * 100, starY, 38, won && i < ui.stars, t);
  }

  if (won) {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20, '500');
    ctx.fillText(`3 stars under ${formatTime(ui.level.star3)} · 2 under ${formatTime(ui.level.star2)}`, 360, card.y + 328);
    // coins count up
    const countT = easeOutCubic((since - 900) / 800);
    const shown = Math.round(ui.coinsEarned * countT);
    const pop = 1 + 0.12 * Math.max(0, 1 - Math.abs((since - 1700) / 180));
    ctx.font = font(34);
    const label = `+${shown}`;
    const labelW = ctx.measureText(label).width;
    ctx.save();
    ctx.translate(360, card.y + 382);
    ctx.scale(pop, pop);
    drawCoin(ctx, pal, -labelW / 2 - 24, 0, 17);
    ctx.fillStyle = pal.ink;
    ctx.font = font(34);
    ctx.fillText(label, 8, 1);
    ctx.restore();
    ctx.fillStyle = pal.textDim;
    ctx.font = font(20, '500');
    ctx.fillText(ui.coinsEarned > 0 ? `${ui.coinsTotal} coins total` : `already cleared · ${ui.coinsTotal} coins total`, 360, card.y + 422);
  } else {
    ctx.fillStyle = pal.textDim;
    ctx.font = font(22, '500');
    ctx.fillText('Every tower was lost. Try again!', 360, card.y + 360);
  }
  drawButton(ctx, pal, RESULT.next, 'NEXT', { fill: won ? pal.owners.player : undefined, disabled: !won || !ui.hasNext, fontPx: 26 });
  drawButton(ctx, pal, RESULT.retry, 'RETRY', { fontPx: 26 });
  drawButton(ctx, pal, RESULT.menu, 'MENU', { fontPx: 26 });
  ctx.restore();
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
  ctx.restore();
}
