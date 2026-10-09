import { describe, expect, it } from 'vitest';
import type { ButtonInk, Palette } from '../../src/render/palette';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, shade } from '../../src/render/palette';
import type { ShopOpts } from '../../src/render/menusShop';
import { drawShop } from '../../src/render/menusShop';
import { SHOP, SHOP_TABS, shopBuyRect, shopConvertSegRect, shopPackRect, shopRowBuyRect, shopRowRect, shopSkinRect } from '../../src/render/menuLayout';
import type { View } from '../../src/render/view';

/*
 * BUG-22 (ART_DIRECTION §6: numerals ≥ 24 px logical, contrast ≥ 4.5:1). The rule covers every shop
 * button a player reads a number or a state from. The shop draws them with two palette pairs:
 * `shopBuy` (price / buy / convert faces) and `shopOwned` (EQUIPPED / OWNED / MAX, pack bonus
 * ribbon). drawButton paints the face as a vertical gradient from `shade(face, +0.16)` (dark faces;
 * +0.10 on light ones) down to `face`, so a pair is checked against both ends — contrast is
 * monotonic along that blend, so every face pixel behind the label is covered.
 * Then a recording canvas runs drawShop and checks that every numeral on a shop button is drawn in
 * the pair's text colour at ≥ 24 px.
 */

const channel = (h: string, i: number): number => {
  const c = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
/** WCAG 2.x contrast ratio, ≥ 1. */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Lowest ratio of the label against any pixel of drawButton's face gradient. */
const worstOnFace = (p: ButtonInk): number => Math.min(contrast(p.text, p.face), contrast(p.text, shade(p.face, 0.16)));

const MIN_TEXT = 4.5;
const PALETTES: [string, Palette][] = [
  ['default', DEFAULT_PALETTE],
  ['colour-blind', COLOR_BLIND_PALETTE],
];

describe('shop button colours (BUG-22)', () => {
  it('the WCAG helper matches known ratios', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
    // the pairs BUG-22 measured before the fix (fill end of the face): all below the line
    expect(contrast(DEFAULT_PALETTE.paper, '#2ec27e')).toBeCloseTo(2.21, 2);
    expect(contrast(DEFAULT_PALETTE.paper, '#a855f7')).toBeCloseTo(3.8, 2);
    expect(contrast(DEFAULT_PALETTE.paper, '#2f6df6')).toBeCloseTo(4.35, 2);
  });

  for (const [name, pal] of PALETTES) {
    it(`${name}: price / buy label ≥ 4.5:1 on every face pixel`, () => {
      // the player blue's shade tone (#1f4bc0) instead of its mid tone (#2f6df6)
      expect(pal.shopBuy).toEqual({ face: pal.ownerTones.player.shade, text: pal.paper });
      expect(pal.shopBuy.face).toBe('#1f4bc0');
      expect(contrast(pal.shopBuy.text, pal.shopBuy.face)).toBeCloseTo(7.14, 2);
      expect(contrast(pal.shopBuy.text, shade(pal.shopBuy.face, 0.16))).toBeCloseTo(4.96, 2);
      expect(worstOnFace(pal.shopBuy)).toBeGreaterThanOrEqual(MIN_TEXT);
    });

    it(`${name}: EQUIPPED / OWNED / MAX label ≥ 4.5:1 on every face pixel`, () => {
      expect(pal.shopOwned.text).toBe(pal.ink);
      expect(worstOnFace(pal.shopOwned)).toBeGreaterThanOrEqual(MIN_TEXT);
    });

    it(`${name}: owned faces still read as the owner-2 colour, and never as a buy button`, () => {
      // the face is one of the owner-2 clay tones of the palette (green / colour-blind purple)…
      expect(Object.values(pal.ownerTones.enemy2)).toContain(pal.shopOwned.face);
      // …and differs from the buy face in lightness, not only in hue (WCAG non-text 3:1)
      expect(contrast(pal.shopOwned.face, pal.shopBuy.face)).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: dim labels of the converter's pack picker ≥ 4.5:1 on the paper face`, () => {
      expect(contrast(pal.textDim, pal.panel)).toBeGreaterThanOrEqual(MIN_TEXT);
      expect(contrast(pal.textDim, shade(pal.panel, 0.1))).toBeGreaterThanOrEqual(MIN_TEXT);
    });
  }

  it('pinned ratios of the owned pair (default green, colour-blind light purple)', () => {
    expect(DEFAULT_PALETTE.shopOwned.face).toBe('#2ec27e');
    expect(contrast(DEFAULT_PALETTE.ink, '#2ec27e')).toBeCloseTo(6.21, 2);
    expect(COLOR_BLIND_PALETTE.shopOwned.face).toBe('#c58bff');
    expect(contrast(COLOR_BLIND_PALETTE.ink, '#c58bff')).toBeCloseTo(5.79, 2);
  });
});

/* ---------- drawShop through a recording canvas ---------- */

interface Drawn {
  text: string;
  fill: unknown;
  px: number;
  x: number;
  y: number;
}

/**
 * Canvas stand-in that records fillText with the current fillStyle and font size, and the colour at
 * stop 1 of every linear gradient (drawButton's face ends on its `fill`); everything else is a no-op.
 */
function recordingCtx(out: Drawn[], faces: Set<string>): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '700 10px sans-serif', fillStyle: '#000000', globalAlpha: 1 };
  const stack: Record<string | symbol, unknown>[] = [];
  const gradient = { addColorStop: (at: number, colour: string) => void (at === 1 && faces.add(colour)) };
  const methods: Record<string, (...a: never[]) => unknown> = {
    measureText: (s: string) => ({ width: String(s).length * 0.6 * Number(/(\d+(?:\.\d+)?)px/.exec(String(store.font))?.[1] ?? 10) }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    save: () => void stack.push({ ...store }),
    restore: () => {
      const s = stack.pop();
      if (s) Object.assign(store, s);
    },
    fillText: (text: string, x: number, y: number) =>
      void out.push({ text: String(text), fill: store.fillStyle, px: Number(/(\d+(?:\.\d+)?)px/.exec(String(store.font))?.[1]), x, y }),
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (typeof key === 'string' && key in methods) return methods[key];
      if (key in store) return store[key];
      if (key === 'canvas') return { width: 720, height: 1280 };
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

function shopOpts(tab: ShopOpts['tab']): ShopOpts {
  const pack = shopPackRect(0);
  const row0 = shopRowRect(0);
  const row1 = shopRowRect(1);
  const convert = shopPackRect(5);
  const skinTop = SHOP.row.y0;
  const skin = (i: number) => shopSkinRect(skinTop, i);
  return {
    tab,
    tabs: SHOP_TABS,
    tabsRect: SHOP.tabs,
    backRect: SHOP.back,
    walletRect: SHOP.wallet,
    scroll: 0,
    gold: 5000,
    crystals: 1000,
    packs: tab === 'crystals' ? [{ id: 'pack.l', rect: pack, crystals: 2600, bonusPct: 0.3, price: '$19.99', count: 4 }] : [],
    convert:
      tab === 'crystals'
        ? { rect: convert, packs: [20, 100, 500], selected: 0, segRect: shopConvertSegRect(convert), buyRect: shopBuyRect(convert, convert.w - 48), crystals: 20, gold: 100, goldPerCrystal: 5, affordable: true }
        : null,
    crate: tab === 'bundles' ? { rect: row1, cost: 120, charges: { overdrive: 3, freeze: 3, airstrike: 3 }, owned: { overdrive: 0, freeze: 0, airstrike: 0 }, affordable: true } : null,
    bundles:
      tab === 'bundles'
        ? [
            { id: 'b.owned', rect: row0, title: 'No ads', lines: ['x'], price: '$2.99', owned: true, glyph: 'noads' },
            { id: 'b.buy', rect: shopRowRect(2), title: 'Starter', lines: ['x'], price: '$4.99', owned: false, glyph: 'chest' },
          ]
        : [],
    skinHeaders: [],
    skins:
      tab === 'skins'
        ? [
            { id: 's.eq', rect: skin(0), label: 'Viking', spriteId: 'missing.skin', cost: 0, owned: true, equipped: true, locked: false },
            { id: 's.buy', rect: skin(1), label: 'Samurai', spriteId: 'missing.skin', cost: 150, owned: false, equipped: false, locked: false },
          ]
        : [],
    upgrades:
      tab === 'upgrades'
        ? [
            { id: 'u.max', rect: row0, label: 'Walls', glyph: 'walls' as never, tier: 5, maxTier: 5, cost: null, effectNow: 'a', effectNext: 'b', affordable: false },
            { id: 'u.buy', rect: row1, label: 'Speed', glyph: 'speed' as never, tier: 1, maxTier: 5, cost: 300, effectNow: 'a', effectNext: 'b', affordable: true },
          ]
        : [],
    restoreRect: null,
    storeAvailable: true,
    pending: null,
    pressed: null,
    nowMs: 0,
  };
}

function drawTab(pal: Palette, tab: ShopOpts['tab'], extra: Partial<ShopOpts> = {}, faces = new Set<string>()): Drawn[] {
  const out: Drawn[] = [];
  const ctx = recordingCtx(out, faces);
  const view = { canvas: { width: 720, height: 1280 }, ctx, dpr: 1, cssW: 720, cssH: 1280, scale: 1, offsetX: 0, offsetY: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;
  drawShop(view, pal, { ...shopOpts(tab), ...extra });
  return out;
}

const inside = (d: Drawn, r: { x: number; y: number; w: number; h: number }): boolean => d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h;

describe('drawShop button labels (BUG-22)', () => {
  for (const [name, pal] of PALETTES) {
    it(`${name}: every price numeral is drawn in the buy pair's text colour at ≥ 24 px`, () => {
      const prices: Drawn[] = [];
      const crystals = drawTab(pal, 'crystals');
      prices.push(...crystals.filter((d) => d.text === '$19.99'));
      prices.push(...drawTab(pal, 'bundles').filter((d) => d.text === '$4.99' || d.text === '120'));
      prices.push(...drawTab(pal, 'skins').filter((d) => d.text === '150'));
      prices.push(...drawTab(pal, 'upgrades').filter((d) => d.text === '300'));
      expect(prices.map((d) => d.text).sort()).toEqual(['$19.99', '$4.99', '120', '150', '300']);
      for (const d of prices) {
        expect(d.fill, `"${d.text}" colour`).toBe(pal.shopBuy.text);
        expect(d.px, `"${d.text}" size`).toBeGreaterThanOrEqual(24);
      }
    });

    it(`${name}: the converter's selected pack size, its CONVERT buttons and the pack bonus ribbon use the pairs`, () => {
      const convert = shopPackRect(5);
      const seg = shopConvertSegRect(convert);
      const drawn = drawTab(pal, 'crystals');
      const sizes = drawn.filter((d) => ['20', '100', '500'].includes(d.text) && inside(d, seg));
      expect(sizes).toHaveLength(3);
      for (const d of sizes) expect(d.px, `pack size ${d.text}`).toBeGreaterThanOrEqual(24);
      expect(sizes.find((d) => d.text === '20')?.fill).toBe(pal.shopBuy.text);
      expect(sizes.find((d) => d.text === '100')?.fill).toBe(pal.textDim);
      const ribbon = drawn.find((d) => d.text === '+30%');
      expect(ribbon?.fill).toBe(pal.shopOwned.text);
      expect(ribbon?.px).toBeGreaterThanOrEqual(24);
      // the confirm modal's CONVERT
      const modal = drawTab(pal, 'crystals', { confirmConvert: { crystals: 20, gold: 100 } });
      const yes = modal.filter((d) => inside(d, SHOP.convertConfirm.yes));
      expect(yes).toHaveLength(1);
      expect(yes[0]!.fill).toBe(pal.shopBuy.text);
    });

    it(`${name}: shop button faces are the pairs' faces, never the owner mid tones`, () => {
      const faces = new Set<string>();
      for (const tab of SHOP_TABS) drawTab(pal, tab, {}, faces);
      drawTab(pal, 'crystals', { confirmConvert: { crystals: 20, gold: 100 } }, faces);
      expect(faces).toContain(pal.shopBuy.face);
      expect(faces).toContain(pal.shopOwned.face);
      expect(faces).not.toContain(pal.owners.player);
      if (pal.shopOwned.face !== pal.owners.enemy2) expect(faces).not.toContain(pal.owners.enemy2);
    });

    it(`${name}: EQUIPPED / OWNED / MAX are drawn in the owned pair's text colour`, () => {
      const states = [
        ...drawTab(pal, 'skins').filter((d) => inside(d, shopBuyRect(shopSkinRect(SHOP.row.y0, 0), SHOP.skin.w - 36, 54))),
        ...drawTab(pal, 'bundles').filter((d) => inside(d, shopRowBuyRect(shopRowRect(0)))),
        ...drawTab(pal, 'upgrades').filter((d) => inside(d, shopRowBuyRect(shopRowRect(0)))),
      ];
      expect(states).toHaveLength(3);
      for (const d of states) expect(d.fill, `"${d.text}"`).toBe(pal.shopOwned.text);
    });
  }
});
