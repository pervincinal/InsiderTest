import { C } from '../sim/constants';
import type { Palette } from './palette';
import { shade } from './palette';
import type { View } from './view';
import type { Rect } from './widgets';
import {
  drawBoltGlyph,
  drawButton,
  drawCard,
  drawCrosshairGlyph,
  drawExtrudedText,
  drawGlassBand,
  drawPill,
  drawRoundButton,
  drawSegmented,
  drawSnowflakeGlyph,
  fitFontPx,
  font,
  roundRect,
} from './widgets';
import type { ShopTab } from './layout';
import { SHOP, SHOP_TABS, shopBuyRect, shopRowBuyRect } from './layout';
import type { UpgradeKind } from './sprites';
import type { ToastOpts } from './economyWidgets';
import { drawSpinner, drawToast, drawWallet, formatAmount } from './economyWidgets';
import { drawCrownBadge, drawCrystal, drawCrystalCluster, drawGoldCoin, drawNoAdsBadge, drawSkinPreview, drawTreasureChest, drawUpgradeGlyph } from './sprites';
import { beginFrame, drawWater } from './menus';
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
  /** Conversion awaiting confirmation (modal over the tab). */
  confirmConvert?: { crystals: number; gold: number } | null;
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

/** Price / action button: label with an optional currency glyph; spinner when pending. */
function drawBuyButton(
  ctx: CanvasRenderingContext2D,
  pal: Palette,
  r: Rect,
  label: string,
  o: { glyph?: 'gold' | 'crystal'; fill?: string; disabled?: boolean; pressed?: boolean; pending?: boolean; fontPx?: number; nowMs?: number },
): void {
  drawButton(ctx, pal, r, '', { fill: o.fill, disabled: o.disabled, pressed: o.pressed, fontPx: o.fontPx, flat: true });
  const cy = r.y + (r.h - 4) / 2 + (o.pressed ? 3 : 0);
  const onColour = o.fill !== undefined && !o.disabled;
  const text = o.disabled ? pal.textDim : onColour ? pal.paper : pal.ink;
  if (o.pending) {
    drawSpinner(ctx, text, r.x + r.w / 2, cy, Math.min(12, r.h * 0.25), o.nowMs ?? 0);
    return;
  }
  ctx.font = font(o.fontPx ?? 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  const glyphR = o.glyph ? Math.min(11, r.h * 0.2) : 0;
  const total = tw + (o.glyph ? glyphR * 2 + 8 : 0);
  const x0 = r.x + r.w / 2 - total / 2;
  if (o.glyph === 'gold') drawGoldCoin(ctx, pal, x0 + glyphR, cy, glyphR);
  else if (o.glyph === 'crystal') drawCrystal(ctx, pal, x0 + glyphR, cy, glyphR * 1.05);
  ctx.fillStyle = text;
  ctx.font = font(o.fontPx ?? 22);
  ctx.textAlign = 'left';
  ctx.fillText(label, x0 + (o.glyph ? glyphR * 2 + 8 : 0), cy + 1, r.w - 16);
}

function drawPackCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopPackCard, o: ShopOpts): void {
  const r = c.rect;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  drawCrystalCluster(ctx, pal, r.x + r.w / 2, r.y + 78, 96, c.count);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(34);
  ctx.fillText(formatAmount(c.crystals), r.x + r.w / 2 + 10, r.y + 154);
  drawCrystal(ctx, pal, r.x + r.w / 2 - ctx.measureText(formatAmount(c.crystals)).width / 2 - 10, r.y + 154, 13);
  if (c.bonusPct > 0) {
    // bonus ribbon, top-right corner
    const label = `+${Math.round(c.bonusPct * 100)}%`;
    ctx.font = font(16);
    const w = ctx.measureText(label).width + 22;
    const tag: Rect = { x: r.x + r.w - w - 12, y: r.y + 12, w, h: 30 };
    drawPill(ctx, tag, pal.owners.enemy2, shade(pal.owners.enemy2, -0.35), 2);
    ctx.fillStyle = pal.paper;
    ctx.fillText(label, tag.x + tag.w / 2, tag.y + tag.h / 2 + 1);
  }
  const buy = shopBuyRect(r);
  drawBuyButton(ctx, pal, buy, c.price, {
    fill: pal.owners.player,
    disabled: !o.storeAvailable,
    pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
    pending: o.pending === c.id,
    fontPx: 24,
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
  ctx.font = font(26);
  const textX = r.x + 136;
  const textW = r.w - 136 - SHOP.buyW - 40;
  ctx.fillText(c.title, textX, r.y + 40, textW);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(17, '500');
  c.lines.slice(0, 4).forEach((line, i) => ctx.fillText(line, textX, r.y + 72 + i * 24, textW));
  const buy = shopRowBuyRect(r);
  if (c.owned) {
    drawBuyButton(ctx, pal, buy, t('shop.owned'), { fill: pal.owners.enemy2, fontPx: 22 });
  } else {
    drawBuyButton(ctx, pal, buy, c.price, {
      fill: pal.owners.player,
      disabled: !o.storeAvailable,
      pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
      pending: o.pending === c.id,
      fontPx: 24,
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
  ctx.font = font(19);
  ctx.fillText(c.label, r.x + r.w / 2, r.y + 142, r.w - 20);
  const buy = shopBuyRect(r, r.w - 36, 54);
  const pressed = rectEq(o.pressed, buy) || rectEq(o.pressed, r);
  if (c.equipped) drawBuyButton(ctx, pal, buy, t('shop.equipped'), { fill: pal.owners.enemy2, pressed, fontPx: 18 });
  else if (c.owned) drawBuyButton(ctx, pal, buy, t('shop.equip'), { pressed, fontPx: 20 });
  else if (c.locked) {
    drawBuyButton(ctx, pal, buy, t('shop.packOnly'), { disabled: true, fontPx: 17 });
  } else {
    drawBuyButton(ctx, pal, buy, String(c.cost), { glyph: 'crystal', fill: pal.owners.player, disabled: o.crystals < c.cost, pressed, fontPx: 22 });
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
  ctx.font = font(26);
  const textX = r.x + 136;
  const textW = r.w - 136 - SHOP.buyW - 40;
  ctx.fillText(t('shop.crate'), textX, r.y + 40, textW);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(17, '500');
  const lines = [
    t('shop.crateCharges', { o: c.charges.overdrive, f: c.charges.freeze, a: c.charges.airstrike }),
    t('shop.crateSub'),
    t('shop.crateOwned', { o: c.owned.overdrive, f: c.owned.freeze, a: c.owned.airstrike }),
  ];
  lines.forEach((line, i) => ctx.fillText(line, textX, r.y + 72 + i * 24, textW));
  const buy = shopRowBuyRect(r);
  drawBuyButton(ctx, pal, buy, String(c.cost), {
    glyph: 'crystal',
    fill: pal.owners.player,
    disabled: !c.affordable,
    pressed: rectEq(o.pressed, buy) || rectEq(o.pressed, r),
    fontPx: 24,
  });
}

function drawConvertCard(ctx: CanvasRenderingContext2D, pal: Palette, c: ShopConvertCard, o: ShopOpts): void {
  const r = c.rect;
  const cx = r.x + r.w / 2;
  drawCard(ctx, pal, r, { radius: 22, edge: 5 });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(26);
  const convert = t('shop.convert');
  ctx.fillText(convert, cx + 14, r.y + 36, r.w - 60);
  drawCrystal(ctx, pal, cx - Math.min(ctx.measureText(convert).width, r.w - 60) / 2 - 8, r.y + 36, 12);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(16, '500');
  ctx.fillText(t('shop.convertRate', { n: c.goldPerCrystal }), cx, r.y + 70, r.w - 24);
  drawSegmented(
    ctx,
    pal,
    c.segRect,
    c.packs.map((n) => ({ label: String(n) })),
    c.selected,
    20,
  );
  // result line: "→ 100 gold" with a coin
  ctx.fillStyle = pal.ink;
  ctx.font = font(22);
  const label = t('shop.convertResult', { n: formatAmount(c.gold) });
  const w = ctx.measureText(label).width;
  ctx.fillText(label, cx + 10, r.y + 170);
  drawGoldCoin(ctx, pal, cx + 10 - w / 2 - 16, r.y + 170, 11);
  drawBuyButton(ctx, pal, c.buyRect, t('shop.convert'), {
    fill: pal.owners.player,
    disabled: !c.affordable,
    pressed: rectEq(o.pressed, c.buyRect),
    fontPx: 22,
  });
}

/** Modal over the crystals tab: "Convert 20 crystals into 100 gold?" with CONVERT / CANCEL. */
function drawConvertConfirm(ctx: CanvasRenderingContext2D, pal: Palette, q: { crystals: number; gold: number }, o: ShopOpts): void {
  ctx.fillStyle = 'rgba(26, 58, 90, 0.5)';
  ctx.fillRect(0, 0, C.MAP_W, C.MAP_H);
  const c = SHOP.convertConfirm;
  drawCard(ctx, pal, c.card);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = font(34);
  ctx.fillText(t('shop.convertTitle'), 360, c.card.y + 62, c.card.w - 40);
  ctx.font = font(26);
  const line = `${q.crystals}       ${q.gold}`;
  const w = ctx.measureText(line).width;
  ctx.fillText(line, 360, c.card.y + 122);
  drawCrystal(ctx, pal, 360 - w / 2 - 18, c.card.y + 122, 13);
  ctx.fillStyle = pal.textDim;
  ctx.fillText('\u2192', 360, c.card.y + 122);
  drawGoldCoin(ctx, pal, 360 + w / 2 + 18, c.card.y + 122, 12);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(19, '500');
  ctx.fillText(t('shop.convertWarn'), 360, c.card.y + 168, c.card.w - 40);
  drawButton(ctx, pal, c.yes, t('shop.convert'), { fill: pal.owners.player, fontPx: 26, pressed: o.pressed === c.yes });
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
  ctx.font = font(25);
  const textX = r.x + 130;
  const textW = r.w - 130 - SHOP.buyW - 36;
  ctx.fillText(c.label, textX, r.y + 36, textW);
  drawTierPips(ctx, pal, textX + 10, r.y + 70, c.tier, c.maxTier);
  ctx.fillStyle = pal.textDim;
  ctx.font = font(16, '500');
  ctx.fillText(t('shop.tier', { tier: c.tier, max: c.maxTier }), textX + c.maxTier * 24 + 8, r.y + 70, 110);
  ctx.fillStyle = pal.ink;
  ctx.font = font(18, '500');
  ctx.fillText(c.tier > 0 ? t('shop.now', { effect: c.effectNow }) : t('shop.notTrained'), textX, r.y + 104, textW);
  ctx.fillStyle = c.cost === null ? pal.textDim : shade(pal.owners.enemy2, -0.25);
  ctx.font = font(17, '500');
  ctx.fillText(c.cost === null ? t('shop.fullyTrained') : t('shop.next', { effect: c.effectNext }), textX, r.y + 132, textW);
  const buy = shopRowBuyRect(r);
  const pressed = rectEq(o.pressed, buy) || rectEq(o.pressed, r);
  if (c.cost === null) drawBuyButton(ctx, pal, buy, t('shop.max'), { fill: pal.owners.enemy2, fontPx: 22 });
  else drawBuyButton(ctx, pal, buy, String(c.cost), { glyph: 'gold', fill: pal.owners.player, disabled: !c.affordable, pressed, fontPx: 24 });
}

export function drawShop(view: View, pal: Palette, o: ShopOpts): void {
  const ctx = beginFrame(view, pal);
  drawWater(ctx, pal, o.nowMs, o.scroll * 0.4);

  // scrolled content, clipped under the tab row
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, SHOP.contentTop, C.MAP_W, SHOP.contentBottom - SHOP.contentTop);
  ctx.clip();
  ctx.translate(0, -o.scroll);
  for (const c of o.packs) drawPackCard(ctx, pal, c, o);
  if (o.convert) drawConvertCard(ctx, pal, o.convert, o);
  if (o.crate) drawCrateCard(ctx, pal, o.crate, o);
  for (const c of o.bundles) drawBundleCard(ctx, pal, c, o);
  for (const h of o.skinHeaders) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font(22);
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
    drawButton(ctx, pal, rr, o.pending === 'restore' ? '' : t('shop.restore'), { fontPx: 20, flat: true, pressed: rectEq(o.pressed, rr), disabled: !o.storeAvailable });
    if (o.pending === 'restore') drawSpinner(ctx, pal.ink, rr.x + rr.w / 2, rr.y + (rr.h - 4) / 2, 11, o.nowMs);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.textDim;
    ctx.font = font(15, '500');
    ctx.fillText(
      o.storeAvailable ? t('shop.testStore') : t('shop.storeUnavailable'),
      360,
      rr.y + rr.h + 22,
      640,
    );
  }
  if (o.tab === 'upgrades') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.textDim;
    ctx.font = font(15, '500');
    const last = o.upgrades[o.upgrades.length - 1];
    if (last) ctx.fillText(t('shop.upgradesFooter'), 360, last.rect.y + last.rect.h + 26, 640);
  }
  o.particles?.draw(ctx, o.nowMs);
  ctx.restore();

  // fixed chrome: header + tabs
  drawGlassBand(ctx, { x: 0, y: 0, w: C.MAP_W, h: SHOP.tabs.y + SHOP.tabs.h + 12 });
  drawButton(ctx, pal, o.backRect, t('common.back'), { fontPx: 24, pressed: o.pressed === o.backRect });
  const title = t('shop.title');
  drawExtrudedText(ctx, title, 280, 50, fitFontPx(ctx, title, 40, 220), { face: pal.paper, side: shade(pal.owners.player, -0.25), outline: pal.ink, depth: 4 });
  drawWallet(ctx, pal, o.walletRect, o.gold, o.crystals);
  drawSegmented(ctx, pal, o.tabsRect, SHOP_TABS.map((tab) => ({ label: t(TAB_KEYS[tab]), value: tab })), SHOP_TABS.indexOf(o.tab), 19);
  if (o.confirmConvert) drawConvertConfirm(ctx, pal, o.confirmConvert, o);
  if (o.toast) drawToast(ctx, pal, { ...o.toast, y: o.toast.y ?? 1210 });
  ctx.restore();
}
