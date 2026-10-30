import { C } from '../sim/constants';
import type { ButtonInk, Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import { bleedRect, hudAnchors } from './view';
import type { Rect } from './widgets';
import {
  clipText,
  drawBoltGlyph,
  drawButton,
  drawCard,
  drawCrosshairGlyph,
  drawNumeralLine,
  drawExtrudedText,
  drawGlassBand,
  drawPill,
  drawRoundButton,
  drawSnowflakeGlyph,
  fitFontPx,
  fitTextLines,
  font,
  NUMERAL_PX,
  roundRect,
  textPx,
} from './widgets';
import { drawSegmented } from './menuWidgets';
import type { ShopTab } from './menuLayout';
import { SHOP, SHOP_TABS, bandedContentBottom, shopBuyRect, shopRowBuyRect } from './menuLayout';
import type { UpgradeKind } from './sprites';
import type { ToastOpts } from './economyWidgets';
import { drawSpinner, drawToast, drawWallet, formatAmount } from './economyWidgets';
import { drawCrystal, drawGoldCoin, drawTreasureChest } from './sprites';
import { drawUpgradeGlyph } from './spritesShop';
import { drawCrownBadge, drawCrystalCluster, drawNoAdsBadge, drawSkinPreview } from './spritesShop';
import { beginFrame, drawWater, headerBand } from './menus';
import type { TranslationKey } from '../ui/i18n';
import { t } from '../ui/i18n';

/*
 * Shop screen drawing (ECONOMY.md §4, Phase A). Loaded lazily with `ShopScreen` (PERF-1); the
 * card / button rects come from layout.ts and the screen. Reads its options only.
 */

/* ---------- Shop (ECONOMY.md §4, Phase A) ---------- */

export interface ShopPackCard {
  id: string;
  rect: Rect;
  crystals: number;
  bonusPct: number;
  price: string;
  /** Cluster size 1..5. */
  count: number;
}

export interface ShopBundleCard {
  id: string;
  rect: Rect;
  title: string;
  lines: string[];
  price: string;
  owned: boolean;
  glyph: 'chest' | 'noads' | 'crown';
}

export interface ShopSkinCard {
  id: string;
  rect: Rect;
  label: string;
  /** Sprite skin id for `drawSkinPreview`. */
  spriteId: string;
  /** 0 = pack exclusive. */
  cost: number;
  owned: boolean;
  equipped: boolean;
  /** Exclusive to a pack the player does not own. */
  locked: boolean;
}

export interface ShopUpgradeCard {
  id: string;
  rect: Rect;
  label: string;
  glyph: UpgradeKind;
  tier: number;
  maxTier: number;
  /** Gold for the next tier, null when maxed. */
  cost: number | null;
  effectNow: string;
  effectNext: string;
  affordable: boolean;
}

/** Booster crate (ECONOMY.md §3.1): crystals → pre-paid charges of every booster. */
export interface ShopCrateCard {
  rect: Rect;
  cost: number;
  charges: { overdrive: number; freeze: number; airstrike: number };
  owned: { overdrive: number; freeze: number; airstrike: number };
  affordable: boolean;
}

/** Crystals → gold converter (ECONOMY.md §2): pick a pack, confirm. */
export interface ShopConvertCard {
  rect: Rect;
  /** Pack sizes in crystals and the selected index. */
  packs: readonly number[];
  selected: number;
  segRect: Rect;
  buyRect: Rect;
  /** Selected pack: crystals spent and gold received. */
  crystals: number;
  gold: number;
  goldPerCrystal: number;
  affordable: boolean;
}

export interface ShopOpts {
  tab: ShopTab;
  /** Tabs in the segmented row, in order (`shopTabsFor`); defaults to all of SHOP_TABS. */
  tabs?: readonly ShopTab[];
  tabsRect: Rect;
  backRect: Rect;
  walletRect: Rect;
  scroll: number;
  gold: number;
  crystals: number;
  packs: ShopPackCard[];
  bundles: ShopBundleCard[];
  skinHeaders: { label: string; y: number }[];
  skins: ShopSkinCard[];
  upgrades: ShopUpgradeCard[];
  /** Booster crate row (bundles tab). */
  crate?: ShopCrateCard | null;
  /** Convert card (crystals tab). */
  convert?: ShopConvertCard | null;
  /**
   * Crystal spend awaiting confirmation (modal over the tab): a conversion (`gold`), or a skin / the
   * booster crate (AUD-U5: `line` names what the crystals buy).
   */
  confirmConvert?: { crystals: number; gold?: number; line?: string } | null;
  /** Restore-purchases button (content space), on the store tabs. */
  restoreRect: Rect | null;
  storeAvailable: boolean;
  /** Card / button id with the spinner (purchase in flight). */
  pending: string | null;
  /** Rect (content space) held down. */
  pressed: Rect | null;
  nowMs: number;
  toast?: ToastOpts | null;
  /** Painted after the content in logical space (coin / crystal bursts). */
  particles?: { draw(ctx: CanvasRenderingContext2D, nowMs: number): void };
}

const TAB_KEYS: Record<ShopTab, TranslationKey> = { crystals: 'shop.tab.crystals', bundles: 'shop.tab.bundles', skins: 'shop.tab.skins', upgrades: 'shop.tab.upgrades' };

/**
 * Shop numerals (prices, pack sizes) are drawn at this size or larger (ART_DIRECTION §6, BUG-22);
 * only `fitFontPx` may shrink a label that would not fit beside its glyph (long translations).
 */
const SHOP_NUMERAL_PX = NUMERAL_PX;

/**
 * Price / action button: label with an optional currency glyph; spinner when pending. `ink` is a
 * coloured face with its label colour (`pal.shopBuy` / `pal.shopOwned`, ≥ 4.5:1, BUG-22); without
 * it the button is a paper face with ink text.
 */
function drawBuyButton(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: Rect,
  label: string,
  o: { glyph?: 'gold' | 'crystal'; ink?: ButtonInk; disabled?: boolean; pressed?: boolean; pending?: boolean; fontPx?: number; nowMs?: number },
): void {
  drawButton(ctx, pal, r, '', { fill: o.ink?.face, disabled: o.disabled, pressed: o.pressed, fontPx: o.fontPx, flat: true });
  const cy = r.y + (r.h - 4) / 2 + (o.pressed ? 3 : 0);
  const text = o.disabled ? pal.textDim : (o.ink?.text ?? pal.ink);
  if (o.pending) {
    drawSpinner(ctx, text, r.x + r.w / 2, cy, Math.min(12, r.h * 0.25), o.nowMs ?? 0);
    return;
  }
  const glyphR = o.glyph ? Math.min(11, r.h * 0.2) : 0;
  const glyphW = o.glyph ? glyphR * 2 + 8 : 0;
  // BUG-21: a long label (RU "ТОЛЬКО В НАБОРЕ") used to be squeezed by fillText's maxWidth; size the
  // font to the room left beside the glyph instead, so the glyphs keep their proportions.
  // AUD-U2: never below the 22 px floor; at a bigger text size no taller than the button allows
  const maxPx = r.h - 20;
  const px = fitFontPx(ctx, label, Math.max(22, o.fontPx ?? SHOP_NUMERAL_PX), r.w - 16 - glyphW);
  ctx.font = font(px, 'bold', undefined, maxPx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  const total = tw + glyphW;
  const x0 = r.x + r.w / 2 - total / 2;
  if (o.glyph === 'gold') drawGoldCoin(ctx, pal, x0 + glyphR, cy, glyphR);
  else if (o.glyph === 'crystal') drawCrystal(ctx, pal, x0 + glyphR, cy, glyphR * 1.05);
  ctx.fillStyle = text;
  ctx.font = font(px, 'bold', undefined, maxPx);
  ctx.textAlign = 'left';
  ctx.fillText(clipText(ctx, label, r.w - 16 - glyphW), x0 + glyphW, cy + 1);
}

/**
 * AUD-U2: a card's grey lines at the 22 px floor, each fitted to `w` (never squeezed, "…" only past
 * the floor), `pitch` apart — a fixed card, so no bigger than 24 px at any text size.
 */
function drawCardLines(ctx: CanvasRenderingContext2D, lines: readonly string[], x: number, y0: number, w: number, pitch: number): void {
  lines.forEach((line, i) => {
    ctx.font = font(fitFontPx(ctx, line, 22, w, '500'), '500', undefined, 24);
    ctx.fillText(clipText(ctx, line, w), x, y0 + i * pitch);
  });
}

function drawPackCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopPackCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  drawCrystalCluster(ctx, pal, r.x + r.w / 2, r.y + 78, 96, c.count);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(34, 'bold', undefined, 44);
  ctx.fillText(formatAmount(c.crystals), r.x + r.w / 2 + 10, r.y + 154);
  drawCrystal(ctx, pal, r.x + r.w / 2 - ctx.measureText(formatAmount(c.crystals)).width / 2 - 10, r.y + 154, 13);
  if (c.bonusPct > 0) {
    // bonus ribbon, top-right corner: a numeral, so the shop's owned ink pair at ≥ 24 px (BUG-22)
    const label = `+${Math.round(c.bonusPct * 100)}%`;
    ctx.font = font(SHOP_NUMERAL_PX, 'bold', undefined, 32);
    const w = ctx.measureText(label).width + 22;
    const tag: Rect = { x: r.x + r.w - w - 12, y: r.y + 12, w, h: Math.round(textPx(SHOP_NUMERAL_PX, 32)) + 12 };
    drawPill(ctx, tag, pal.shopOwned.face, shade(pal.shopOwned.face, -0.35), 2);
    ctx.fillStyle = pal.shopOwned.text;
    ctx.fillText(label, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  }
  const buy = shopBuyRect(r);
  drawBuyButton(ctx, pal, buy, c.price, {
    ink: pal.shopBuy,
    disabled: !o.storeAvailable,
    pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
    pending: o.pending === c.id,
    fontPx: SHOP_NUMERAL_PX,
    nowMs: o.nowMs,
  });
}

/** Pressed rects are rebuilt every frame by the shop screen, so compare by value. */
function rectEq(a: Rect | null, b: Rect): boolean {
  return a !== null && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function bundleGlyph(ctx: CanvasRenderingContext2D, pal: Palette, kind: ShopBundleCard['glyph'], x: number, y: number): void {
  if (kind === 'chest') drawTreasureChest(ctx, pal, x, y + 4, 92, true);
  else if (kind === 'noads') drawNoAdsBadge(ctx, pal, x, y, 40);
  else drawCrownBadge(ctx, pal, x, y, 40);
}

function drawBundleCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopBundleCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  bundleGlyph(ctx, pal, c.glyph, r.x + 70, r.y + r.h / 2 - 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const textX = r.x + 136;
  const textW = r.w - 136 - SHOP.buyW - 40;
  ctx.font = font(fitFontPx(ctx, c.title, 26, textW), 'bold', undefined, 32);
  ctx.fillText(clipText(ctx, c.title, textW), textX, r.y + 40);
  ctx.fillStyle = pal.textDim;
  drawCardLines(ctx, c.lines.slice(0, 4), textX, r.y + 72, textW, 25);
  const buy = shopRowBuyRect(r);
  if (c.owned) {
    drawBuyButton(ctx, pal, buy, t('shop.owned'), { ink: pal.shopOwned, fontPx: 22 });
  } else {
    drawBuyButton(ctx, pal, buy, c.price, {
      ink: pal.shopBuy,
      disabled: !o.storeAvailable,
      pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
      pending: o.pending === c.id,
      fontPx: SHOP_NUMERAL_PX,
      nowMs: o.nowMs,
    });
  }
}

function drawSkinCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopSkinCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 20, edge: 5 });
  if (c.equipped) {
    ctx.save();
    roundRect(ctx, { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 12 }, 18);
    ctx.strokeStyle = pal.selection;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  roundRect(ctx, { x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 14 }, 18);
  ctx.clip();
  drawSkinPreview(ctx, pal, r.x + r.w / 2, r.y + 68, 110, c.spriteId);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(fitFontPx(ctx, c.label, 22, r.w - 20), 'bold', undefined, 26); // AUD-U2 (was 19 px)
  ctx.fillText(clipText(ctx, c.label, r.w - 16), r.x + r.w / 2, r.y + 142);
  const buy = shopBuyRect(r, r.w - 36, 54);
  const pressed = rectEq(o.pressed, buy) || rectEq(o.pressed, r);
  if (c.equipped) drawBuyButton(ctx, pal, buy, t('shop.equipped'), { ink: pal.shopOwned, pressed, fontPx: 22 });
  else if (c.owned) drawBuyButton(ctx, pal, buy, t('shop.equip'), { pressed, fontPx: 22 });
  else if (c.locked) {
    drawBuyButton(ctx, pal, buy, t('shop.packOnly'), { disabled: true, fontPx: 22 });
  } else {
    drawBuyButton(ctx, pal, buy, String(c.cost), { glyph: 'crystal', ink: pal.shopBuy, disabled: o.crystals < c.cost, pressed, fontPx: SHOP_NUMERAL_PX });
  }
}

/** Three overlapping booster discs (bolt · snowflake · crosshair) as the crate's glyph. */
function crateGlyph(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number): void {
  const discs: { dx: number; dy: number; fill: string; glyph: (cx: number, cy: number) => void }[] = [
    { dx: -26, dy: 14, fill: pal.sky, glyph: (cx, cy) => drawSnowflakeGlyph(ctx, pal.paper, cx, cy, 12) },
    { dx: 26, dy: 14, fill: pal.owners.enemy1, glyph: (cx, cy) => drawCrosshairGlyph(ctx, pal.paper, cx, cy, 12) },
    { dx: 0, dy: -16, fill: pal.gold, glyph: (cx, cy) => drawBoltGlyph(ctx, pal.paper, cx, cy, 13, shade(pal.gold, -0.45)) },
  ];
  for (const d of discs) {
    drawRoundButton(ctx, pal, x + d.dx, y + d.dy, 24, { fill: d.fill });
    d.glyph(x + d.dx, y + d.dy - 1);
  }
}

function drawCrateCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopCrateCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  crateGlyph(ctx, pal, r.x + 70, r.y + r.h / 2 - 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const textX = r.x + 136;
  const textW = r.w - 136 - SHOP.buyW - 40;
  const crate = t('shop.crate');
  ctx.font = font(fitFontPx(ctx, crate, 26, textW), 'bold', undefined, 32);
  ctx.fillText(clipText(ctx, crate, textW), textX, r.y + 40);
  ctx.fillStyle = pal.textDim;
  const lines = [
    t('shop.crateCharges', { o: c.charges.overdrive, f: c.charges.freeze, a: c.charges.airstrike }),
    t('shop.crateSub'),
    t('shop.crateOwned', { o: c.owned.overdrive, f: c.owned.freeze, a: c.owned.airstrike }),
  ];
  drawCardLines(ctx, lines, textX, r.y + 74, textW, 30);
  const buy = shopRowBuyRect(r);
  drawBuyButton(ctx, pal, buy, String(c.cost), {
    glyph: 'crystal',
    ink: pal.shopBuy,
    disabled: !c.affordable,
    pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
    fontPx: SHOP_NUMERAL_PX,
  });
}

function drawConvertCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopConvertCard, o: ShopOpts): void {
  const r = c.rect;
  const cx = r.x + r.w / 2;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const convert = t('shop.convert');
  ctx.font = font(fitFontPx(ctx, convert, 26, r.w - 60), 'bold', undefined, 32);
  ctx.fillText(convert, cx + 14, r.y + 36);
  drawCrystal(ctx, pal, cx - Math.min(ctx.measureText(convert).width, r.w - 60) / 2 - 8, r.y + 36, 12);
  ctx.fillStyle = pal.textDim;
  drawCardLines(ctx, [t('shop.convertRate', { n: c.goldPerCrystal })], cx, r.y + 70, r.w - 24, 0);
  drawSegmented(
    ctx,
    pal,
    c.segRect,
    c.packs.map((n) => ({ label: String(n) })),
    c.selected,
    SHOP_NUMERAL_PX,
    pal.shopBuy,
  );
  // result line: "→ 100 gold" with a coin; the number the player converts to, so ≥ 24 px (ART-15)
  ctx.fillStyle = pal.ink;
  ctx.font = font(SHOP_NUMERAL_PX);
  const label = t('shop.convertResult', { n: formatAmount(c.gold) });
  const w = ctx.measureText(label).width;
  ctx.fillText(label, cx + 10, r.y + 170);
  drawGoldCoin(ctx, pal, cx + 10 - w / 2 - 16, r.y + 170, 11);
  drawBuyButton(ctx, pal, c.buyRect, t('shop.convert'), {
    ink: pal.shopBuy,
    disabled: !c.affordable,
    pressed: rectEq(o.pressed, c.buyRect),
    fontPx: 22,
  });
}

/**
 * Modal over the tab: "Convert crystals?" (20 crystals \u2192 100 gold) with CONVERT / CANCEL; AUD-U5: the
 * same card asks "Spend 80 crystals?" (what they buy \u00b7 how many are left) before a skin or the crate.
 */
function drawConvertConfirm(ctx: CanvasRenderingContext2D, pal: Palette, q: { crystals: number; gold?: number; line?: string }, o: ShopOpts, dim: Rect): void {
  ctx.fillStyle = 'rgba(26, 58, 90, 0.5)';
  ctx.fillRect(dim.x, dim.y, dim.w, dim.h); // the whole screen (BUG-34)
  const c = SHOP.convertConfirm;
  const convert = q.gold !== undefined;
  drawCard(ctx, pal, c.card);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const title = convert ? t('shop.convertTitle') : t('spend.title', { n: q.crystals });
  ctx.font = font(fitFontPx(ctx, title, 34, c.card.w - 40), 'bold', undefined, 44);
  ctx.fillText(title, 360, c.card.y + 62);
  ctx.font = font(26, 'bold', undefined, 34);
  if (convert) {
    const line = `${q.crystals}       ${q.gold}`;
    const w = ctx.measureText(line).width;
    ctx.fillText(line, 360, c.card.y + 122);
    drawCrystal(ctx, pal, 360 - w / 2 - 18, c.card.y + 122, 13);
    ctx.fillStyle = pal.textDim;
    ctx.fillText('\u2192', 360, c.card.y + 122);
    drawGoldCoin(ctx, pal, 360 + w / 2 + 18, c.card.y + 122, 12);
  } else {
    const line = q.line ?? '';
    ctx.font = font(fitFontPx(ctx, line, 26, c.card.w - 40, '500'), '500', undefined, 34);
    ctx.fillText(clipText(ctx, line, c.card.w - 40), 360, c.card.y + 122);
  }
  ctx.fillStyle = pal.textDim;
  // AUD-U2: 22 px (was 19), two lines where a translation needs them (never squeezed)
  const warn = convert ? t('shop.convertWarn') : t('spend.left', { n: Math.max(0, o.crystals - q.crystals) });
  const warnFit = fitTextLines(ctx, warn, Math.min(22, 26 / (textPx(22) / 22)), c.card.w - 40, 2);
  warnFit.lines.forEach((l, i, all) => ctx.fillText(l, 360, c.card.y + 172 + (i - (all.length - 1) / 2) * warnFit.lineH));
  drawButton(ctx, pal, c.yes, convert ? t('shop.convert') : t('spend.yes'), { fill: pal.shopBuy.face, text: pal.shopBuy.text, fontPx: 26, pressed: o.pressed === c.yes });
  drawButton(ctx, pal, c.no, t('common.cancel'), { fontPx: 26, pressed: o.pressed === c.no });
}

/** Five tier pips: filled up to `tier`. */
function drawTierPips(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, tier: number, max: number): void {
  for (let i = 0; i < max; i++) {
    const px = x + i * 24;
    const on = i < tier;
    ctx.fillStyle = on ? shade(pal.gold, -0.35) : shade(pal.panelBorder, -0.1);
    ctx.beginPath();
    ctx.arc(px + 1, y + 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = on ? pal.gold : pal.paper;
    ctx.beginPath();
    ctx.arc(px, y, 8, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(px - 2.5, y - 2.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawUpgradeCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopUpgradeCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  drawUpgradeGlyph(ctx, pal, r.x + 66, r.y + r.h / 2 - 2, 42, c.glyph);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  const textX = r.x + 130;
  const textW = r.w - 130 - SHOP.buyW - 36;
  ctx.font = font(fitFontPx(ctx, c.label, 25, textW), 'bold', undefined, 30);
  ctx.fillText(clipText(ctx, c.label, textW), textX, r.y + 36);
  drawTierPips(ctx, pal, textX + 10, r.y + 70, c.tier, c.maxTier);
  // ART-17: "Tier 1/5" beside the pips — the fraction 24 px bold (one run), the word 16 px, dim on the
  // card (≥ 4.5:1); baseline 8 px under the pips' centre puts the numerals' middle on it
  const tierX = textX + c.maxTier * 24 + 8;
  // AUD-U2: the words at the 22 px floor (were 16 / 18 / 17), numbers 24; a fixed card: ≤ 24 px drawn
  drawNumeralLine(ctx, t('shop.tier', { tier: c.tier, max: c.maxTier }), tierX, r.y + 78, textX + textW - tierX, pal.textDim, 22, 'left', 24);
  // ART-16: the current tier's numbers at ≥ 24 px like the "Next" line below (same helper), the
  // words ink; baseline 6 px under the old 18 px middle line keeps its visual centre
  drawNumeralLine(ctx, c.tier > 0 ? t('shop.now', { effect: c.effectNow }) : t('shop.notTrained'), textX, r.y + 110, textW, pal.ink, 22, 'left', 24);
  if (c.cost === null) {
    ctx.fillStyle = pal.textDim;
    drawCardLines(ctx, [t('shop.fullyTrained')], textX, r.y + 132, textW, 0);
  } else {
    // ART-15: the next tier's gain in the palette's gain colour (≥ 4.5:1 on the card; the owner-2
    // green it replaces was 3.8:1), its numbers at ≥ 24 px
    drawNumeralLine(ctx, t('shop.next', { effect: c.effectNext }), textX, r.y + 138, textW, pal.gainText, 22, 'left', 24);
  }
  const buy = shopRowBuyRect(r);
  const pressed = rectEq(o.pressed, buy) || rectEq(o.pressed, r);
  if (c.cost === null) drawBuyButton(ctx, pal, buy, t('shop.max'), { ink: pal.shopOwned, fontPx: 22 });
  else drawBuyButton(ctx, pal, buy, String(c.cost), { glyph: 'gold', ink: pal.shopBuy, disabled: !c.affordable, pressed, fontPx: SHOP_NUMERAL_PX });
}

/**
 * A dim footer under the last card (AUD-U2: 22 px, was 15): up to two 24 px-pitch lines across 640 px
 * from `y` down (the content keeps 60 px under the last card / RESTORE, ui/shop.ts), never squeezed.
 */
function drawFooter(ctx: CanvasRenderingContext2D, text: string, y: number): void {
  const fit = fitTextLines(ctx, text, Math.min(22, 22 / (textPx(22) / 22)), 640, 2, '500', 1.1);
  fit.lines.forEach((l, i) => ctx.fillText(l, 360, y + i * 24));
}

export function drawShop(view: View, pal: Palette, o: ShopOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, o.scroll * 0.4);
  // FE-11: on a tall screen the header and the tabs sit on the top safe-area edge (a.top ≤ 0) and the
  // cards follow them up; their viewport runs on to 18 layout px above the bottom safe edge
  const a = hudAnchors(view);

  // scrolled content, clipped under the tab row
  ctx.save();
  ctx.translate(0, a.top);
  ctx.beginPath();
  ctx.rect(0, SHOP.contentTop, C.MAP_W, bandedContentBottom(SHOP.contentBottom, a) - SHOP.contentTop);
  ctx.clip();
  ctx.translate(0, -o.scroll);
  for (const c of o.packs) drawPackCard(ctx, pal, c, o);
  if (o.convert) drawConvertCard(ctx, pal, o.convert, o);
  if (o.crate) drawCrateCard(ctx, pal, o.crate, o);
  for (const c of o.bundles) drawBundleCard(ctx, pal, c, o);
  for (const h of o.skinHeaders) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(22, 'bold', undefined, 28);
    const w = ctx.measureText(h.label).width + 40;
    const pill: Rect = { x: SHOP.skin.x0, y: h.y, w, h: 36 };
    drawPill(ctx, pill, pal.paper);
    ctx.fillStyle = pal.ink;
    ctx.fillText(h.label, pill.x + 20, pill.y + pill.h / 2 + 1);
  }
  for (const c of o.skins) drawSkinCard(ctx, pal, c, o);
  for (const c of o.upgrades) drawUpgradeCard(ctx, pal, c, o);
  if (o.restoreRect) {
    const rr = o.restoreRect;
    drawButton(ctx, pal, rr, o.pending === 'restore' ? '' : t('shop.restore'), { fontPx: 22, flat: true, pressed: rectEq(o.pressed, rr), disabled: !o.storeAvailable });
    if (o.pending === 'restore') drawSpinner(ctx, pal.ink, rr.x + rr.w / 2, rr.y + (rr.h - 4) / 2, 11, o.nowMs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.textDim;
    drawFooter(ctx, o.storeAvailable ? t('shop.testStore') : t('shop.storeUnavailable'), rr.y + rr.h + 22);
  }
  if (o.tab === 'upgrades') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.textDim;
    const last = o.upgrades[o.upgrades.length - 1];
    if (last) drawFooter(ctx, t('shop.upgradesFooter'), last.rect.y + last.rect.h + 22);
  }
  o.particles?.draw(ctx, o.nowMs);
  ctx.restore();

  // fixed chrome: header + tabs, on the top safe-area edge (FE-11)
  drawGlassBand(ctx, headerBand(view, SHOP.tabs.y + SHOP.tabs.h + 12 + a.top)); // up to the screen's top edge (BUG-34)
  ctx.save();
  ctx.translate(0, a.top);
  drawButton(ctx, pal, o.backRect, t('common.back'), { fontPx: 24, pressed: o.pressed === o.backRect });
  const title = t('shop.title');
  drawExtrudedText(ctx, title, 280, 50, fitFontPx(ctx, title, 40, 220), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals);
  const tabs = o.tabs ?? SHOP_TABS;
  drawSegmented(ctx, pal, o.tabsRect, tabs.map((tab) => ({ label: t(TAB_KEYS[tab]), value: tab })), tabs.indexOf(o.tab), 22);
  ctx.restore();
  if (o.confirmConvert) drawConvertConfirm(ctx, pal, o.confirmConvert, o, bleedRect(view));
  if (o.toast) drawToast(ctx, pal, { ...o.toast, y: (o.toast.y ?? 1210) + a.bottom });
  ctx.restore();
}
