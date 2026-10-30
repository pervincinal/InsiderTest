import type { GameState } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import { CONFIRM, PAUSE, RESULT } from './layout';
import type { Rect } from './widgets';
import { MIN_TEXT_PX, clipText, drawButton, drawCard, drawGlyphLabel, drawExtrudedText, drawGearGlyph, drawSpeakerGlyph, drawStar, fitFontPx, fitTextLines, font, formatTime, getTextScale, innerHighlight, roundRect, textPx } from './widgets';
import type { PlayUi } from './draw';
import { drawCrystal, drawGoldCoin, drawVideoGlyph } from './sprites';
import { drawSpinner } from './economyWidgets';
import { STALL, STALEMATE_CARD_S, hudClockOf, hudExtrasOf, resultShareLayout } from './hud';
import { levelLesson, t } from '../ui/i18n';

/*
 * Pause menu and result card (PERF-6): lazy chunk. hud.ts reaches this module only through
 * `import('./hudOverlays')` (`loadHudOverlays`), so Vite emits it as its own chunk that is not in
 * the eager bundle; the play screen warms it at level start / on the first capture / when the
 * outcome is decided, and hud.ts draws a plain card until it lands (or when it never does).
 * The drawing here is byte-for-byte what hud.ts painted before the move — keep it so.
 */

export interface HudOverlayDrawers {
  pause(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi): void;
  /** `screenBottom`: logical y of the screen's bottom edge (BUG-34: below 1280 on a tall phone); the card slides in from under it. */
  result(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi, since: number, screenBottom?: number): void;
  /** AUD-B2 / A11 "Nothing is changing" card (`STALL` rects; `pressed`: the button held down). */
  stall(ctx: CanvasRenderingContext2D, ui: PlayUi, pressed: Rect | null): void;
}

function drawPauseCard(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi): void {
  const pal = ui.palette;
  const hud = hudExtrasOf(ui);
  const card = PAUSE.card;
  drawCard(ctx, pal, card);
  const pausedTitle = t('pause.title');
  drawExtrudedText(ctx, pausedTitle, 360, card.y + 72, fitFontPx(ctx, pausedTitle, 60, 460), { face: pal.paper, side: shade(pal.owners.player, -0.3), outline: pal.ink, depth: 5 });
  ctx.fillStyle = pal.textDim;
  const subtitle = t('pause.subtitle', { n: ui.level.id, time: formatTime(hudClockOf(ui, state)) });
  ctx.font = font(fitFontPx(ctx, subtitle, 24, card.w - 40, '500'), '500', undefined, 32);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clipText(ctx, subtitle, card.w - 40), 360, card.y + 136);
  drawButton(ctx, pal, PAUSE.resume, t('pause.resume'), { fill: pal.owners.player, fontPx: 30 });
  const fast = ui.speed !== 1;
  drawButton(ctx, pal, PAUSE.speed, t('pause.speed', { n: ui.speed }), { fontPx: 24, border: fast ? pal.accent : undefined, text: fast ? pal.accent : undefined });
  // sound toggle (glyph + state) · settings (gear)
  const muted = hud?.muted ?? false;
  const sb = PAUSE.sound;
  // AUD-U2: glyph + 22 px label centred as a group, the label fitted (never squeezed; "…" only past the floor)
  drawButton(ctx, pal, sb, '');
  drawGlyphLabel(ctx, sb, muted ? t('pause.muted') : t('pause.sound'), 30, (cx, cy) => drawSpeakerGlyph(ctx, muted ? pal.textDim : pal.ink, cx - 2, cy, 14, !muted), muted ? pal.textDim : pal.ink, 22, 30);
  const gb = PAUSE.settings;
  drawButton(ctx, pal, gb, '');
  drawGlyphLabel(ctx, gb, t('pause.settings'), 26, (cx, cy) => drawGearGlyph(ctx, pal.ink, cx, cy, 12), pal.ink, 22, 30);
  ctx.textAlign = 'center';
  drawButton(ctx, pal, PAUSE.retry, t('common.retry'), { fontPx: 26 });
  drawButton(ctx, pal, PAUSE.menu, t('common.menu'), { fontPx: 26 });
  drawButton(ctx, pal, PAUSE.howto, t('pause.howto'), { fontPx: 24 });
}

function drawResultCard(ctx: CanvasRenderingContext2D, state: GameState, ui: PlayUi, since: number, screenBottom: number = C.MAP_H): void {
  const pal = ui.palette;
  const won = ui.outcome === 'won';
  const layout = resultShareLayout(hudExtrasOf(ui)?.result, won);
  const card = layout.card;
  // slide up with a bounce
  const slide = (1 - easeOutBack(Math.min(1, since / 460))) * (Math.max(C.MAP_H, screenBottom) - card.y + 40);
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
  const timeLine = t('result.time', { time: formatTime(hudClockOf(ui, state)) });
  ctx.font = font(fitFontPx(ctx, timeLine, 30, card.w - 60), 'bold', undefined, 40);
  // a defeat has no star row: the time sits a little higher and the tip block takes the stars' place (FE-4)
  ctx.fillText(timeLine, 360, card.y + (won ? 200 : 190));

  // stars pop in one after another with a gold burst
  if (won) {
    const starY = card.y + 272;
    for (let i = 0; i < 3; i++) {
      const t = (since - 420 - i * 260) / 380;
      drawStarPop(ctx, pal, 360 + (i - 1) * 100, starY, 38, i < ui.stars, t);
    }
  }

  const hud = hudExtrasOf(ui);
  const ex = hud?.result;
  const pressed = hud?.pressed ?? null;
  if (won) {
    ctx.fillStyle = pal.textDim;
    const starRule = t('result.starRule', { t3: formatTime(ui.level.star3), t2: formatTime(ui.level.star2) });
    ctx.font = font(fitFontPx(ctx, starRule, 22, card.w - 60, '500'), '500', undefined, 30);
    ctx.fillText(starRule, 360, card.y + 326);
    // gold counts up (a crystal reward sits beside it)
    const countT = easeOutCubic((since - 900) / 800);
    const shown = Math.round(ui.coinsEarned * countT);
    const pop = 1 + 0.12 * Math.max(0, 1 - Math.abs((since - 1700) / 180));
    const goldFont = font(34, 'bold', undefined, 40); // the rows around it are fixed: 40 px at most
    ctx.font = goldFont;
    const label = `+${shown}`;
    const labelW = ctx.measureText(label).width;
    const crystals = ex?.crystalsEarned ?? 0;
    const cx = crystals > 0 ? 260 : 360;
    ctx.save();
    ctx.translate(cx, card.y + 376);
    ctx.scale(pop, pop);
    drawGoldCoin(ctx, pal, -labelW / 2 - 24, 0, 17);
    ctx.fillStyle = pal.ink;
    ctx.font = goldFont;
    ctx.fillText(label, 8, 1);
    ctx.restore();
    if (crystals > 0) {
      const cl = `+${Math.round(crystals * countT)}`;
      ctx.font = goldFont;
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
    const daily = ex?.daily;
    const weekly = ex?.weekly;
    const note = daily
      ? daily.practice
        ? t('daily.yesterdayNoReward')
        : daily.firstWin
        ? t('daily.resultWon', { gold: daily.gold, crystals: daily.crystals, streak: daily.streak })
        : t('daily.resultBest', { stars: daily.best?.stars ?? ui.stars, time: formatTime(daily.best?.timeMs ?? hudClockOf(ui, state)) })
      : weekly
        ? weekly.firstWin
          ? t('weekly.resultWon', { gold: weekly.gold, streak: weekly.streak })
          : t('weekly.resultBest', { stars: weekly.best?.stars ?? ui.stars, time: formatTime(weekly.best?.timeMs ?? hudClockOf(ui, state)) })
        : ex?.notes.length
        ? ex.notes.join(' · ')
        : ex?.replayCapped
          ? t('result.replayCapped')
          : ui.coinsEarned > 0
            ? t('result.goldTotal', { n: ui.coinsTotal })
            : t('result.alreadyCleared', { n: ui.coinsTotal });
    // AUD-U2: one line fitted down to the 22 px floor, else two lines at the floor (never squeezed)
    const noteFit = fitTextLines(ctx, note, 22, card.w - 60, 1);
    const noteLines = noteFit.lines[0]?.endsWith('…') ? fitTextLines(ctx, note, 22, card.w - 60, 2) : noteFit;
    const noteY = card.y + (noteLines.lines.length > 1 ? 420 : 416) - ((noteLines.lines.length - 1) * noteLines.lineH) / 2;
    noteLines.lines.forEach((l, i) => ctx.fillText(l, 360, noteY + i * noteLines.lineH));
  } else {
    drawDefeatTip(ctx, pal, ex?.tip ?? levelLesson(ui.level), ex?.howto ?? false, pressed);
    // Reinforcements: crystals and / or a rewarded video (ECONOMY.md §3.5)
    if (ex && (ex.continueCrystals !== null || ex.continueAd)) {
      const both = ex.continueCrystals !== null && ex.continueAd;
      ctx.textAlign = 'center';
      ctx.fillStyle = pal.textDim;
      const reinf = t('result.reinforcements', { s: Math.round(C.CONTINUE_REWIND_MS / 1000), n: C.CONTINUE_INFANTRY });
      ctx.font = font(fitFontPx(ctx, reinf, 22, card.w - 60, '500'), '500', undefined, 26);
      ctx.fillText(clipText(ctx, reinf, card.w - 60), 360, RESULT.continueSolo.y - 18);
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
      const doubled = t('result.goldDoubled');
      ctx.font = font(fitFontPx(ctx, doubled, 22, card.w - 60, '500'), '500');
      ctx.fillText(doubled, 360, RESULT.extra.y + RESULT.extra.h / 2);
    } else if (!won && ex.skipCrystals !== null) {
      drawOfferButton(ctx, pal, RESULT.extra, t('result.skipLevel'), String(ex.skipCrystals), 'crystal', { pressed: pressed === RESULT.extra, pending: ex.pending, nowMs: since, outline: true });
    }
    if (layout.share) drawShareButton(ctx, pal, layout.share, pressed === layout.share, ex.sharing === true, since);
  }
  ctx.restore();
  if (ex?.confirm) drawSpendConfirm(ctx, pal, ex.confirm, pressed);
}

/**
 * AUD-U5: "Spend 10 crystals?" over the result card before CONTINUE / SKIP LEVEL pays — the shop's
 * Convert confirm card (`CONFIRM` = SHOP.convertConfirm, menusShop.ts): what it buys, what is left, SPEND / CANCEL.
 */
function drawSpendConfirm(ctx: CanvasRenderingContext2D, pal: Palette, q: { kind: 'continue' | 'skip'; crystals: number; have: number }, pressed: Rect | null): void {
  ctx.fillStyle = 'rgba(26, 58, 90, 0.5)';
  ctx.fillRect(-2000, -2000, 4720, 5280); // the whole screen, margins of a tall / wide one included (BUG-34)
  const c = CONFIRM;
  const w = c.card.w - 40;
  drawCard(ctx, pal, c.card);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const title = t('spend.title', { n: q.crystals });
  ctx.font = font(fitFontPx(ctx, title, 34, w), 'bold', undefined, 44);
  ctx.fillText(title, 360, c.card.y + 62);
  const what = q.kind === 'skip' ? t('spend.skip') : t('result.reinforcements', { s: Math.round(C.CONTINUE_REWIND_MS / 1000), n: C.CONTINUE_INFANTRY });
  // AUD-U2: 22 px (× text size, ≤ 28), wrapped to two lines (never squeezed)
  const whatFit = fitTextLines(ctx, what, Math.min(22, 28 / (textPx(22) / 22)), w, 2);
  whatFit.lines.forEach((l, i, all) => ctx.fillText(l, 360, c.card.y + 120 + (i - (all.length - 1) / 2) * whatFit.lineH));
  ctx.fillStyle = pal.textDim;
  const left = t('spend.left', { n: Math.max(0, q.have - q.crystals) });
  ctx.font = font(fitFontPx(ctx, left, 22, w, '500'), '500', undefined, 28);
  ctx.fillText(left, 360, c.card.y + 172);
  drawButton(ctx, pal, c.yes, t('spend.yes'), { fill: pal.shopBuy.face, text: pal.shopBuy.text, fontPx: 26, pressed: pressed === c.yes });
  drawButton(ctx, pal, c.no, t('common.cancel'), { fontPx: 26, pressed: pressed === c.no });
}

/** SHARE (SHARE-1): paper button, share glyph + label; a spinner while the image is drawn / the sheet is open. */
function drawShareButton(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, pressed: boolean, busy: boolean, nowMs: number): void {
  drawButton(ctx, pal, r, '', { pressed, flat: true });
  const cy = r.y + (r.h - 4) / 2 + (pressed ? 3 : 0);
  ctx.textBaseline = 'middle';
  if (busy) {
    drawSpinner(ctx, pal.ink, r.x + r.w / 2, cy, 11, nowMs);
    ctx.textAlign = 'center';
    return;
  }
  const label = t('result.share');
  const px = fitFontPx(ctx, label, 22, r.w - 74);
  ctx.font = font(px);
  const w = ctx.measureText(label).width;
  const x0 = r.x + (r.w - (w + 34)) / 2;
  drawShareGlyph(ctx, pal.ink, x0 + 11, cy, 11);
  ctx.fillStyle = pal.ink;
  ctx.textAlign = 'left';
  ctx.fillText(label, x0 + 34, cy + 1);
  ctx.textAlign = 'center';
}

/** Share glyph: three nodes joined by two links (the common "share" mark); `s` is the half height. */
export function drawShareGlyph(ctx: CanvasRenderingContext2D, color: string, cx: number, cy: number, s: number): void {
  const a = { x: cx + s * 0.6, y: cy - s * 0.7 };
  const b = { x: cx - s * 0.6, y: cy };
  const c = { x: cx + s * 0.6, y: cy + s * 0.7 };
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, s * 0.2);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
  for (const p of [a, b, c]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, s * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Defeat tip (FE-4): a lightbulb + "Tip" caption, the level's lesson centred under it and, on the
 * second consecutive defeat of the level, a HOW TO PLAY link-button right of the time line
 * (RESULT.howto, AUD-U1). AUD-U2: caption and lesson at the 22 px floor (× text size) in ≤ 4 lines of
 * the tip's width — a bigger text size steps back down towards 22 px before a fifth line would be
 * needed, and only past that is the lesson cut with "…". Never squeezed.
 */
function drawDefeatTip(ctx: CanvasRenderingContext2D, pal: Palette, text: string, howto: boolean, pressed: Rect | null): void {
  const r = RESULT.tip;
  const cap = t('result.tip');
  ctx.font = font(22, '500', undefined, 26);
  const capW = ctx.measureText(cap).width;
  const x0 = 360 - (capW + 26) / 2;
  drawBulbGlyph(ctx, x0 + 9, r.y + 12, 9, pal.star, pal.ink);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.textDim;
  ctx.fillText(cap, x0 + 26, r.y + 13);
  // the lines fit the tip box under the caption (r.h − 30 px): a bigger size steps down until they do
  let fit = fitTextLines(ctx, text, 22, r.w, 4, '500', 1.12);
  while (fit.lines.length * fit.lineH > r.h - 30 && fit.drawnPx > MIN_TEXT_PX) fit = fitTextLines(ctx, text, fit.px - 1 / getTextScale(), r.w, 4, '500', 1.12);
  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink;
  fit.lines.forEach((l, i) => ctx.fillText(l, 360, r.y + 38 + i * fit.lineH));
  if (howto) drawButton(ctx, pal, RESULT.howto, t('result.howto'), { fontPx: 22, flat: true, pressed: pressed === RESULT.howto });
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
  // AUD-U2: label and price tag at 22 px (× text size, ≤ 30: the button is fixed), fitted, never squeezed
  ctx.font = font(fitFontPx(ctx, label, 22, r.w * 0.58), 'bold', undefined, 30);
  ctx.textAlign = 'left';
  ctx.fillText(clipText(ctx, label, r.w * 0.58), r.x + 18, cy + 1);
  ctx.font = font(fitFontPx(ctx, tag, 22, r.w * 0.3), 'bold', undefined, 30);
  const tw = ctx.measureText(tag).width;
  const gx = r.x + r.w - 18 - tw - 28;
  if (glyph === 'crystal') drawCrystal(ctx, pal, gx + 6, cy, 11);
  else drawVideoGlyph(ctx, pal, gx + 8, cy, 10);
  ctx.textAlign = 'left';
  ctx.fillStyle = text;
  ctx.fillText(tag, gx + 26, cy + 1);
  ctx.textAlign = 'center';
}

/* ---------- widgets only these cards use (moved from widgets.ts, PERF-6) ---------- */

/**
 * Star pop-in: `t` is the animation progress (0 = not started, ≥1 = settled). The star scales in
 * with overshoot while a gold glow burst expands and fades behind it.
 */
export function drawStarPop(ctx: CanvasRenderingContext2D, pal: Palette, cx: number, cy: number, size: number, on: boolean, t: number): void {
  if (t <= 0) return;
  const u = Math.min(1, t);
  if (on && u < 1) {
    const burst = 1 - u;
    ctx.save();
    ctx.globalAlpha = burst * 0.55;
    ctx.fillStyle = pal.star;
    ctx.beginPath();
    ctx.arc(cx, cy, size * (1.2 + u * 1.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = burst * 0.9;
    ctx.strokeStyle = shade(pal.star, 0.4);
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      const r0 = size * (1.3 + u * 1.2);
      const r1 = r0 + size * 0.45 * (1 - u);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawStar(ctx, pal, cx, cy, size, on, easeOutBack(u));
}

/** Ease-out with overshoot, for pop-in animations. t in 0..1. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Math.max(0, Math.min(1, t)) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/** Smooth ease-out (cubic). t in 0..1. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}

/** Lightbulb (defeat tip): lit globe with three rays and a small base; `s` is roughly half the height. */
export function drawBulbGlyph(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string, outline: string): void {
  const gy = cy - s * 0.25;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(1.5, s * 0.22);
  for (const a of [-Math.PI / 2, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85]) {
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * s * 1.05, gy + Math.sin(a) * s * 1.05);
    ctx.lineTo(cx + Math.cos(a) * s * 1.45, gy + Math.sin(a) * s * 1.45);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, gy, s * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, s * 0.18);
  ctx.strokeStyle = outline;
  ctx.stroke();
  roundRect(ctx, { x: cx - s * 0.36, y: cy + s * 0.42, w: s * 0.72, h: s * 0.5 }, s * 0.12);
  ctx.fillStyle = outline;
  ctx.fill();
  ctx.restore();
}

/** AUD-B2 / A11 (GDD §2.4): title, the body (up to four lines), KEEP PLAYING, then RESTART · RETREAT. */
function drawStallCard(ctx: CanvasRenderingContext2D, ui: PlayUi, pressed: Rect | null): void {
  const pal = ui.palette;
  const card = STALL.card;
  drawCard(ctx, pal, card);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const title = t('stall.title');
  ctx.font = font(fitFontPx(ctx, title, 40, card.w - 60));
  ctx.fillText(title, 360, card.y + 62);
  ctx.fillStyle = pal.textDim;
  // AUD-U2: the body's pitch follows the text size (30 at 100 %), ≤ 28 px drawn so four lines fit above KEEP PLAYING
  const body = fitTextLines(ctx, t('stall.body', { n: STALEMATE_CARD_S }), Math.min(22, 28 / (textPx(22) / 22)), card.w - 70, 4, '500', 1.36);
  const lines = body.lines;
  const top = card.y + 162 - ((lines.length - 1) * body.lineH) / 2;
  lines.forEach((l, i) => ctx.fillText(l, 360, top + i * body.lineH));
  drawButton(ctx, pal, STALL.keep, t('stall.keep'), { fill: pal.owners.player, fontPx: 28, pressed: pressed === STALL.keep });
  drawButton(ctx, pal, STALL.restart, t('stall.restart'), { fontPx: 22, pressed: pressed === STALL.restart });
  drawButton(ctx, pal, STALL.retreat, t('stall.retreat'), { fontPx: 22, pressed: pressed === STALL.retreat });
}

export const HUD_OVERLAYS: HudOverlayDrawers = { pause: drawPauseCard, result: drawResultCard, stall: drawStallCard };
