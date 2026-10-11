import { describe, expect, it } from 'vitest';
import type { ButtonInk, Palette } from '../../src/render/palette';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, shade } from '../../src/render/palette';
import type { ShopOpts } from '../../src/render/menusShop';
import { drawShop } from '../../src/render/menusShop';
import { LEVEL_MAP, SETTINGS, SHOP, SHOP_TABS, settingsAboutLayout, shopBuyRect, shopConvertSegRect, shopPackRect, shopRowBuyRect, shopRowRect, shopSkinRect } from '../../src/render/menuLayout';
import type { View } from '../../src/render/view';
import type { SettingsOpts } from '../../src/render/menusSettings';
import { drawSettings } from '../../src/render/menusSettings';
import type { DailyCardOpts, LevelSelectOpts } from '../../src/render/menusLevels';
import { COUNTDOWN_INSET, countdownPillRect, drawLevelSelect } from '../../src/render/menusLevels';
import { TOAST, drawToast } from '../../src/render/economyWidgets';
import { FONT_RU, NUMERAL_PX, drawNumeralLine, numeralRuns, wrapNumeralText } from '../../src/render/widgets';
import { registerDictionary, setLanguage, t } from '../../src/ui/i18n';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { ACHIEVEMENTS } from '../../src/economy/catalog';
import { achievementName } from '../../src/ui/catalogText';
import { ADVANCES, ADVANCE_CHARS } from './fontAdvances';

// the menus draw English menu strings that the app registers with its lazy chunks; these tests
// import the drawing modules directly, so they register the whole English dictionary themselves
registerDictionary('en', en);

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
  /** CSS weight of the font (500 words, 700 numerals / headings). */
  weight: number;
  /** fillText's maxWidth argument (undefined: the glyphs can never be squeezed). */
  maxW?: number;
  /** The font shorthand at the time of the call. */
  font: string;
}

/** Text width for a CSS font shorthand (the recorder's measureText). */
type Measure = (text: string, font: string) => number;
const pxOf = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 10);
/** Default measure: 0.6 em per character, wider than Fredoka / Nunito (pessimistic). */
const wideMeasure: Measure = (text, font) => text.length * 0.6 * pxOf(font);
/**
 * ART-17: the game's own fonts — per-glyph advances of the Fredoka-first and Nunito-first stacks
 * measured in Chromium (tests/render/fontAdvances.ts, scripts/fontAdvances.ts); a glyph outside the
 * table counts 0.6 em.
 */
const fontMeasure: Measure = (text, font) => {
  const table = ADVANCES[`${font.includes(FONT_RU) ? 'ru' : 'latin'}${/^700/.test(font) ? 700 : 500}` as keyof typeof ADVANCES];
  let em = 0;
  for (const c of text) {
    const i = ADVANCE_CHARS.indexOf(c);
    em += i < 0 ? 0.6 : table[i]!;
  }
  return em * pxOf(font);
};

/**
 * Canvas stand-in that records fillText with the current fillStyle and font size, the colour at
 * stop 1 of every linear gradient (drawButton's face ends on its `fill`) and, when asked, every flat
 * colour a shape is filled with (pills, segments); everything else is a no-op.
 */
function recordingCtx(out: Drawn[], faces: Set<string>, fills?: Set<string>, measure: Measure = wideMeasure): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '700 10px sans-serif', fillStyle: '#000000', globalAlpha: 1 };
  const stack: Record<string | symbol, unknown>[] = [];
  const gradient = { addColorStop: (at: number, colour: string) => void (at === 1 && faces.add(colour)) };
  const methods: Record<string, (...a: never[]) => unknown> = {
    measureText: (s: string) => ({ width: measure(String(s), String(store.font)) }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    fill: () => void (typeof store.fillStyle === 'string' && fills?.add(store.fillStyle)),
    save: () => void stack.push({ ...store }),
    restore: () => {
      const s = stack.pop();
      if (s) Object.assign(store, s);
    },
    fillText: (text: string, x: number, y: number, maxW?: number) =>
      void out.push({
        text: String(text),
        fill: store.fillStyle,
        px: Number(/(\d+(?:\.\d+)?)px/.exec(String(store.font))?.[1]),
        weight: Number(/^(\d+)/.exec(String(store.font))?.[1]),
        font: String(store.font),
        x,
        y,
        maxW,
      }),
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

const recordingView = (ctx: CanvasRenderingContext2D): View =>
  ({ canvas: { width: 720, height: 1280 }, ctx, dpr: 1, cssW: 720, cssH: 1280, scale: 1, offsetX: 0, offsetY: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 } }) as unknown as View;

function drawTab(pal: Palette, tab: ShopOpts['tab'], extra: Partial<ShopOpts> = {}, faces = new Set<string>(), fills?: Set<string>): Drawn[] {
  const out: Drawn[] = [];
  const ctx = recordingCtx(out, faces, fills);
  drawShop(recordingView(ctx), pal, { ...shopOpts(tab), ...extra });
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

/* ---------- ART-15: active-state controls, toasts, the two shop text lines ---------- */

describe('active-state colours (ART-15)', () => {
  it('the colours ART-15 replaced were below the line', () => {
    // paper on the owner mid blue (old tabs / segments / toggle ON / info toast): flat and gradient top
    expect(contrast(DEFAULT_PALETTE.paper, '#2f6df6')).toBeCloseTo(4.35, 2);
    expect(contrast(DEFAULT_PALETTE.paper, shade('#2f6df6', 0.16))).toBeCloseTo(3.37, 2);
    // paper on the error red (default) / orange (colour-blind)
    expect(contrast(DEFAULT_PALETTE.paper, '#ff5a5f')).toBeCloseTo(2.93, 2);
    expect(contrast(DEFAULT_PALETTE.paper, '#f97316')).toBeCloseTo(2.69, 2);
    // the upgrades "Next" green: shade(owner-2 green, -0.25) on the card
    expect(contrast(shade('#2ec27e', -0.25), DEFAULT_PALETTE.panel)).toBeCloseTo(3.77, 2);
  });

  for (const [name, pal] of PALETTES) {
    it(`${name}: the active-choice pair clears 4.5:1 flat and at the gradient top, pressed included`, () => {
      expect(contrast(pal.shopBuy.text, pal.shopBuy.face)).toBeCloseTo(7.14, 2);
      expect(contrast(pal.shopBuy.text, shade(pal.shopBuy.face, 0.16))).toBeCloseTo(4.96, 2);
      // the daily tab's pressed face is darker still
      expect(contrast(pal.shopBuy.text, shade(pal.shopBuy.face, -0.15))).toBeGreaterThanOrEqual(MIN_TEXT);
      expect(worstOnFace(pal.shopBuy)).toBeGreaterThanOrEqual(MIN_TEXT);
    });

    it(`${name}: error toast ink ≥ 4.5:1 on every face pixel, in the opposite polarity to the info toast`, () => {
      expect(pal.toastError).toEqual({ face: pal.owners.enemy1, text: pal.ink });
      expect(worstOnFace(pal.toastError)).toBeGreaterThanOrEqual(MIN_TEXT);
      // dark text on a light error pill vs light text on a dark info pill: the kinds differ in
      // polarity, not only in hue (the faces themselves are 2.4:1 / 2.7:1 apart)
      expect(luminance(pal.toastError.face)).toBeGreaterThan(luminance(pal.shopBuy.face));
      expect(luminance(pal.toastError.text)).toBeLessThan(luminance(pal.shopBuy.text));
      expect(contrast(pal.toastError.face, pal.shopBuy.face)).toBeGreaterThanOrEqual(2.4);
    });

    it(`${name}: the gain text ≥ 4.5:1 on the card face`, () => {
      expect(contrast(pal.gainText, pal.panel)).toBeGreaterThanOrEqual(MIN_TEXT);
      // ink numerals on the converter card
      expect(contrast(pal.ink, pal.panel)).toBeGreaterThanOrEqual(MIN_TEXT);
    });
  }

  it('pinned ratios of the error toast and the gain text', () => {
    expect(DEFAULT_PALETTE.toastError.face).toBe('#ff5a5f');
    expect(contrast(DEFAULT_PALETTE.ink, '#ff5a5f')).toBeCloseTo(4.68, 2);
    expect(contrast(DEFAULT_PALETTE.ink, shade('#ff5a5f', 0.16))).toBeCloseTo(5.46, 2);
    expect(COLOR_BLIND_PALETTE.toastError.face).toBe('#f97316');
    expect(contrast(COLOR_BLIND_PALETTE.ink, '#f97316')).toBeCloseTo(5.1, 2);
    expect(contrast(COLOR_BLIND_PALETTE.ink, shade('#f97316', 0.16))).toBeCloseTo(5.92, 2);
    expect(DEFAULT_PALETTE.gainText).toBe('#19724a');
    expect(contrast('#19724a', DEFAULT_PALETTE.panel)).toBeCloseTo(5.69, 2);
    expect(COLOR_BLIND_PALETTE.gainText).toBe('#7e22ce');
    expect(contrast('#7e22ce', COLOR_BLIND_PALETTE.panel)).toBeCloseTo(6.71, 2);
  });
});

function settingsOpts(over: Partial<SettingsOpts> = {}): SettingsOpts {
  return {
    soundOn: true,
    colorBlind: false,
    reducedMotion: 'auto',
    language: 'en',
    confirming: false,
    totalStars: 0,
    coins: 100,
    about: settingsAboutLayout(false, false),
    version: '1.0.0',
    supportId: null,
    nowMs: 0,
    ...over,
  };
}

function dailyOpts(tab: 'daily' | 'weekly', unlocked = true): DailyCardOpts {
  const face = { unlocked, unlockLevel: 3, levelName: 'Twin Peaks', twist: 'Fog', gold: 60, crystals: 5, streak: 3, done: false, best: null, countdown: 'New in 12:34' };
  return { ...face, nextBonus: [7, 10], tab, weekly: { ...face, target: false, targetMs: 90_000 }, yesterday: null };
}

function levelSelectOpts(daily: DailyCardOpts): LevelSelectOpts {
  return {
    nodes: [],
    current: 0,
    scroll: 0,
    backRect: LEVEL_MAP.back,
    walletRect: LEVEL_MAP.wallet,
    commanderRect: LEVEL_MAP.commander,
    gold: 0,
    crystals: 0,
    commander: null,
    daily,
    nowMs: 0,
  };
}

describe('active-state controls through a recording canvas (ART-15)', () => {
  for (const [name, pal] of PALETTES) {
    it(`${name}: the shop's selected tab is the active-choice pair`, () => {
      for (const tab of SHOP_TABS) {
        const fills = new Set<string>();
        const drawn = drawTab(pal, tab, {}, new Set<string>(), fills);
        const labels = drawn.filter((d) => inside(d, SHOP.tabs));
        expect(labels).toHaveLength(SHOP_TABS.length);
        const i = SHOP_TABS.indexOf(tab);
        labels.forEach((d, j) => expect(d.fill, `tab ${j} on ${tab}`).toBe(j === i ? pal.shopBuy.text : pal.textDim));
        expect(fills).toContain(pal.shopBuy.face);
      }
    });

    it(`${name}: settings — selected motion / language segments and the ON toggles use the active-choice pair`, () => {
      const out: Drawn[] = [];
      const faces = new Set<string>();
      const fills = new Set<string>();
      drawSettings(recordingView(recordingCtx(out, faces, fills)), pal, settingsOpts({ soundOn: true, colorBlind: true, reducedMotion: 'on', language: 'tr' }));
      const motion = out.filter((d) => inside(d, SETTINGS.motion));
      expect(motion).toHaveLength(3);
      expect(motion.map((d) => d.fill)).toEqual([pal.textDim, pal.shopBuy.text, pal.textDim]);
      const lang = out.filter((d) => inside(d, SETTINGS.language));
      expect(lang).toHaveLength(4);
      expect(lang.map((d) => d.fill)).toEqual([pal.textDim, pal.textDim, pal.textDim, pal.shopBuy.text]);
      for (const toggle of [SETTINGS.sound, SETTINGS.colorBlind]) {
        const label = out.filter((d) => inside(d, toggle));
        expect(label).toHaveLength(1);
        expect(label[0]!.fill).toBe(pal.shopBuy.text);
      }
      // segment pills are flat fills, the ON tracks drawButton gradients: both the pair's face
      // (the owner mid blue still fills the colour-blind row's palette glyph dots, so only faces are excluded)
      expect(fills).toContain(pal.shopBuy.face);
      expect(faces).toContain(pal.shopBuy.face);
      expect(faces).not.toContain(pal.owners.player);
      // OFF stays dim on the paper face (≥ 4.5:1, checked above)
      const off: Drawn[] = [];
      drawSettings(recordingView(recordingCtx(off, new Set<string>())), pal, settingsOpts({ soundOn: false, colorBlind: false }));
      expect(off.filter((d) => inside(d, SETTINGS.sound)).map((d) => d.fill)).toEqual([pal.textDim]);
    });

    it(`${name}: the DAILY / WEEKLY card tab is the active-choice pair on both faces`, () => {
      for (const tab of ['daily', 'weekly'] as const) {
        const out: Drawn[] = [];
        const fills = new Set<string>();
        drawLevelSelect(recordingView(recordingCtx(out, new Set<string>(), fills)), pal, levelSelectOpts(dailyOpts(tab)));
        const daily = out.filter((d) => inside(d, LEVEL_MAP.dailyTabDaily));
        const weekly = out.filter((d) => inside(d, LEVEL_MAP.dailyTabWeekly));
        expect(daily).toHaveLength(1);
        expect(weekly).toHaveLength(1);
        expect((tab === 'daily' ? daily : weekly)[0]!.fill).toBe(pal.shopBuy.text);
        expect((tab === 'daily' ? weekly : daily)[0]!.fill).toBe(pal.ink);
        expect(fills).toContain(pal.shopBuy.face);
      }
    });

    it(`${name}: every toast kind is drawn on its pair (info / reward / achievement / milestone = ok, error)`, () => {
      for (const [kind, ink] of [
        ['ok', pal.shopBuy],
        ['error', pal.toastError],
      ] as const) {
        const out: Drawn[] = [];
        const fills = new Set<string>();
        drawToast(recordingCtx(out, new Set<string>(), fills), pal, { text: 'Nothing new to restore', kind, t: 0.5 });
        expect(out).toHaveLength(1);
        expect(out[0]!.fill, kind).toBe(ink.text);
        expect(fills, kind).toContain(ink.face);
        expect(worstOnFace(ink)).toBeGreaterThanOrEqual(MIN_TEXT);
      }
    });

    it(`${name}: the upgrades "Next" line draws its numbers at ≥ 24 px in the gain colour`, () => {
      const row = shopRowRect(1);
      const drawn = drawTab(pal, 'upgrades', {
        upgrades: [{ id: 'u.buy', rect: row, label: 'Production', glyph: 'production' as never, tier: 1, maxTier: 5, cost: 300, effectNow: '+5 % production', effectNext: '+10 % production', affordable: true }],
      });
      const next = drawn.filter((d) => d.y > row.y + 118 && d.y < row.y + 150 && d.x < shopRowBuyRect(row).x);
      expect(next.map((d) => d.text).join('')).toBe('Next +10 % production');
      for (const d of next) expect(d.fill, `"${d.text}"`).toBe(pal.gainText);
      const number = next.find((d) => d.text === '+10 %');
      expect(number?.px).toBeGreaterThanOrEqual(24);
      // the words keep their size; the runs sit side by side on one baseline
      expect(next.filter((d) => d !== number).every((d) => d.px === 17)).toBe(true);
      expect(new Set(next.map((d) => d.y)).size).toBe(1);
      next.slice(1).forEach((d, i) => expect(d.x).toBeGreaterThan(next[i]!.x));
    });

    it(`${name}: the converter's "→ 100 gold" line is ink at ≥ 24 px`, () => {
      const convert = shopPackRect(5);
      const line = drawTab(pal, 'crystals').find((d) => d.text === '→ 100 gold');
      expect(line, 'result line').toBeDefined();
      expect(inside(line!, convert)).toBe(true);
      expect(line!.fill).toBe(pal.ink);
      expect(line!.px).toBeGreaterThanOrEqual(24);
    });
  }
});

/* ---------- ART-16: streak pill, locked card tab, upgrades "Now", toast amounts ---------- */

/** A numeral run as widgets.ts splits it (ART-17: clocks and fractions are one run). */
const NUMERAL = /^[+\-−]?\d+(?:[.,:/]\d+)*\.?(?:\s?%)?k?$/;
/** The locked card's tab frame: `shade(paper, -0.08)` with drawPill's white top highlight. */
const tabFrame = (pal: Palette): string => shade(pal.paper, -0.08);
/** The streak pill rect of the card at LEVEL_MAP.daily (menusLevels.ts drawDailyCard), `wide` when it names the next bonus. */
const streakPill = (wide: boolean) => {
  const r = LEVEL_MAP.daily;
  const w = 176 + (wide ? 70 : 0);
  return { x: r.x + r.w - 176 - 14 - (wide ? 70 : 0), y: r.y + 66, w, h: 30 };
};

describe('ART-16 colour pairs', () => {
  it('the colours ART-16 replaced were below the line', () => {
    // live streak pill: paper on the owner mid blue
    expect(contrast(DEFAULT_PALETTE.paper, DEFAULT_PALETTE.owners.player)).toBeCloseTo(4.35, 2);
    // locked card, inactive tab: textDim on the tab frame
    expect(contrast(DEFAULT_PALETTE.textDim, tabFrame(DEFAULT_PALETTE))).toBeCloseTo(4.35, 2);
  });

  for (const [name, pal] of PALETTES) {
    it(`${name}: live streak pill = the active-choice pair, ≥ 4.5:1 flat and at the gradient top`, () => {
      expect(contrast(pal.shopBuy.text, pal.shopBuy.face)).toBeCloseTo(7.14, 2);
      expect(contrast(pal.shopBuy.text, shade(pal.shopBuy.face, 0.16))).toBeCloseTo(4.96, 2);
      expect(worstOnFace(pal.shopBuy)).toBeGreaterThanOrEqual(MIN_TEXT);
      // the idle pill (streak 0, next bonus on offer) stays dim text on paper
      expect(contrast(pal.textDim, pal.paper)).toBeGreaterThanOrEqual(MIN_TEXT);
      expect(contrast(pal.textDim, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT);
    });

    it(`${name}: locked card inactive tab label ≥ 4.5:1 on the frame and its white top, still dimmer than ink`, () => {
      const frame = tabFrame(pal);
      expect(pal.textDimFrame).toBe('#526078');
      expect(pal.textDimFrame).toBe(shade(pal.textDim, -0.1));
      expect(contrast(pal.textDimFrame, frame)).toBeCloseTo(5.11, 2);
      expect(contrast(pal.textDimFrame, shade(frame, 0.16))).toBeGreaterThanOrEqual(MIN_TEXT);
      expect(contrast(pal.textDimFrame, '#ffffff')).toBeCloseTo(6.36, 2);
      // "locked" stays a dim label: well under ink's ratio on the same frame
      expect(contrast(pal.ink, frame)).toBeGreaterThan(contrast(pal.textDimFrame, frame) * 2);
    });
  }
});

describe('ART-16 through a recording canvas', () => {
  for (const [name, pal] of PALETTES) {
    it(`${name}: the streak pill's numbers are 24 px bold in the pair's text colour, its words 16 px`, () => {
      const cases: [DailyCardOpts, string, boolean, string][] = [
        [dailyOpts('daily'), 'Streak 3 · +10 at day 7', true, pal.shopBuy.text],
        [{ ...dailyOpts('daily'), nextBonus: null }, 'Streak 3', false, pal.shopBuy.text],
        [{ ...dailyOpts('daily'), streak: 0 }, 'Streak 0 · +10 at day 7', true, pal.textDim],
        [dailyOpts('weekly'), 'Week streak 3', false, pal.shopBuy.text],
      ];
      for (const [daily, label, wide, colour] of cases) {
        const out: Drawn[] = [];
        const fills = new Set<string>();
        drawLevelSelect(recordingView(recordingCtx(out, new Set<string>(), fills)), pal, levelSelectOpts(daily));
        const sp = streakPill(wide);
        const runs = out.filter((d) => inside(d, sp));
        expect(runs.map((d) => d.text).join(''), label).toBe(label);
        const numbers = runs.filter((d) => NUMERAL.test(d.text));
        expect(numbers.length, label).toBeGreaterThan(0);
        for (const d of runs) expect(d.fill, `"${d.text}" colour`).toBe(colour);
        for (const d of numbers) {
          expect(d.px, `"${d.text}" size`).toBeGreaterThanOrEqual(24);
          expect(d.weight, `"${d.text}" weight`).toBe(700);
        }
        // words 16 px; only a fit pass shrinks them (the recorder's 0.6 em glyphs are wider than Fredoka's)
        for (const d of runs.filter((r) => !numbers.includes(r))) {
          expect(d.px, `"${d.text}"`).toBeLessThanOrEqual(16);
          expect(d.px, `"${d.text}"`).toBeGreaterThanOrEqual(12);
          expect(d.weight).toBe(500);
        }
        // one baseline, runs left to right, centred in the pill, never squeezed
        expect(new Set(runs.map((d) => d.y)).size).toBe(1);
        expect(runs.every((d) => d.maxW === undefined)).toBe(true);
        expect(runs[0]!.x).toBeGreaterThan(sp.x + 8);
        if (colour === pal.shopBuy.text) {
          expect(fills).toContain(pal.shopBuy.face);
          expect(fills).not.toContain(pal.owners.player);
        }
      }
    });

    it(`${name}: the locked card's inactive tab label is textDimFrame, the active one the pair`, () => {
      for (const tab of ['daily', 'weekly'] as const) {
        const out: Drawn[] = [];
        drawLevelSelect(recordingView(recordingCtx(out, new Set<string>())), pal, levelSelectOpts(dailyOpts(tab, false)));
        const daily = out.filter((d) => inside(d, LEVEL_MAP.dailyTabDaily));
        const weekly = out.filter((d) => inside(d, LEVEL_MAP.dailyTabWeekly));
        expect(daily).toHaveLength(1);
        expect(weekly).toHaveLength(1);
        expect((tab === 'daily' ? daily : weekly)[0]!.fill).toBe(pal.shopBuy.text);
        expect((tab === 'daily' ? weekly : daily)[0]!.fill).toBe(pal.textDimFrame);
        expect(contrast(pal.textDimFrame, tabFrame(pal))).toBeGreaterThanOrEqual(MIN_TEXT);
      }
    });

    it(`${name}: the upgrades "Now" line draws its numbers at ≥ 24 px like "Next", words 18 px ink`, () => {
      const row = shopRowRect(1);
      const drawn = drawTab(pal, 'upgrades', {
        upgrades: [{ id: 'u.buy', rect: row, label: 'Production', glyph: 'production' as never, tier: 1, maxTier: 5, cost: 300, effectNow: '+5 % production', effectNext: '+10 % production', affordable: true }],
      });
      const left = (d: Drawn) => d.x < shopRowBuyRect(row).x;
      const now = drawn.filter((d) => d.y > row.y + 92 && d.y <= row.y + 118 && left(d));
      expect(now.map((d) => d.text).join('')).toBe('Now +5 % production');
      for (const d of now) expect(d.fill, `"${d.text}"`).toBe(pal.ink);
      const number = now.find((d) => d.text === '+5 %');
      expect(number?.px).toBeGreaterThanOrEqual(24);
      expect(number?.weight).toBe(700);
      expect(now.filter((d) => d !== number).every((d) => d.px === 18 && d.weight === 500)).toBe(true);
      expect(new Set(now.map((d) => d.y)).size).toBe(1);
      // the same size as the "Next" numbers under it (ART-15 left "Now" at 18 px, smaller than "Next")
      const next = drawn.find((d) => d.text === '+10 %' && left(d));
      expect(next?.px).toBe(number?.px);
      expect(next!.y).toBeGreaterThan(number!.y);
      // tier 0: "Not trained" keeps its words, no number to enlarge
      const fresh = drawTab(pal, 'upgrades', {
        upgrades: [{ id: 'u.new', rect: row, label: 'Production', glyph: 'production' as never, tier: 0, maxTier: 5, cost: 100, effectNow: '', effectNext: '+5 % production', affordable: true }],
      }).filter((d) => d.y > row.y + 92 && d.y <= row.y + 118 && left(d));
      expect(fresh.map((d) => [d.text, d.px, d.fill])).toEqual([['Not trained yet', 18, pal.ink]]);
    });

    it(`${name}: toast amounts are their own 24 px bold runs inside 21 px words (ruling (a))`, () => {
      for (const [kind, ink] of [
        ['error', pal.toastError],
        ['ok', pal.shopBuy],
      ] as const) {
        const out: Drawn[] = [];
        drawToast(recordingCtx(out, new Set<string>()), pal, { text: 'Need 200 gold', kind, t: 0.5 });
        expect(out.map((d) => d.text)).toEqual(['Need ', '200', ' gold']);
        for (const d of out) expect(d.fill).toBe(ink.text);
        expect(out[1]).toMatchObject({ px: 24, weight: 700 });
        expect(out[0]).toMatchObject({ px: 21, weight: 500 });
        expect(out[2]).toMatchObject({ px: 21, weight: 500 });
        expect(new Set(out.map((d) => d.y)).size).toBe(1);
        // centred on the screen's middle, never squeezed by fillText's maxWidth
        const w = out[2]!.x + 5 * 0.6 * 21 - out[0]!.x;
        expect(out[0]!.x + w / 2).toBeCloseTo(360, 5);
        expect(out.every((d) => d.maxW === undefined)).toBe(true);
      }
    });

    it(`${name}: a long toast wraps at " · " instead of shrinking, the amount kept at 24 px, the pill growing upwards`, () => {
      const text = 'Need 1200 gold · earn stars or watch ×2 gold after a win';
      const out: Drawn[] = [];
      const fills = new Set<string>();
      drawToast(recordingCtx(out, new Set<string>(), fills), pal, { text, kind: 'error', t: 0.5 });
      const lines = [...new Set(out.map((d) => d.y))];
      expect(lines).toHaveLength(2);
      expect(lines[1]! - lines[0]!).toBe(TOAST.lineH);
      expect(out.filter((d) => d.y === lines[0]).map((d) => d.text).join('')).toBe('Need 1200 gold');
      expect(out.filter((d) => d.y === lines[1]).map((d) => d.text).join('')).toBe('earn stars or watch ×2 gold after a win');
      for (const d of out) expect(d.px, `"${d.text}"`).toBe(NUMERAL.test(d.text) ? 24 : 21);
      expect(out.every((d) => d.maxW === undefined)).toBe(true);
      // the bottom line sits where a one-line toast sits (pill bottom fixed at y + 24)
      const one: Drawn[] = [];
      drawToast(recordingCtx(one, new Set<string>()), pal, { text: 'Need 1200 gold', kind: 'error', t: 0.5 });
      expect(lines[1]).toBe(one[0]!.y);
      expect(fills).toContain(pal.toastError.face);
    });
  }

  it('toast fit pass: every long toast of every language fits ≤ 4 lines at full size with 10 % slack', async () => {
    registerDictionary('az', az);
    registerDictionary('ru', ru);
    registerDictionary('tr', tr);
    const out: Drawn[] = [];
    const ctx = recordingCtx(out, new Set<string>());
    try {
      for (const lang of ['en', 'az', 'ru', 'tr'] as const) {
        await setLanguage(lang);
        const names = ACHIEVEMENTS.map((a) => achievementName(a)).sort((a, b) => b.length - a.length);
        const achievement = t('achievements.unlocked', { names: names.slice(0, 2).join(', '), crystals: 25 });
        const single = [
          t('shop.toast.needGold', { n: 1200 }),
          t('shop.toast.needCrystals', { n: 250 }),
          t('shop.toast.crateAdded', { o: 3, f: 3, a: 3 }),
          t('hint.stalemate'),
          t('result.notEnoughCrystals'),
          achievement,
        ];
        // the recorder measures 0.6 em per character, wider than Fredoka / Nunito (≈ 0.5 em), and the
        // column is 10 % narrower than the toast's 604 px
        const column = (TOAST.maxW - TOAST.pad * 2) / 1.1;
        for (const text of single) {
          const wrap = wrapNumeralText(ctx, text, column, TOAST.wordPx, TOAST.maxLines);
          expect(wrap.wordPx, `${lang}: ${text}`).toBe(TOAST.wordPx);
          expect(wrap.lines.length, `${lang}: ${text}`).toBeLessThanOrEqual(TOAST.maxLines);
        }
        // the daily reward is its own toast since FE-9 (the achievements it unlocks follow as a second
        // toast, screens.ts `toastClaim` — together they filled all four lines in RU): full size, ≤ 2 lines
        const reward = t('title.dailyReward', { day: 7, parts: `${t('amount.gold', { n: 150 })} · ${t('amount.crystals', { n: 20 })}` });
        const wrap = wrapNumeralText(ctx, reward, column, TOAST.wordPx, TOAST.maxLines);
        expect(wrap.wordPx, `${lang}: ${reward}`).toBe(TOAST.wordPx);
        expect(wrap.lines.length, `${lang}: ${reward}`).toBeLessThanOrEqual(2);
      }
    } finally {
      await setLanguage('en');
    }
  });
});

/* ---------- ART-17: countdown, reward line, locked hint, shop tier ---------- */

/** Card face behind the four lines: the panel, the paper countdown pill, and their white inner highlight. */
const CARD_FACES = (pal: Palette): string[] => [pal.panel, pal.paper, '#ffffff'];
/** Room of the reward line: card text column minus the coin + crystal glyphs and, beside the wide streak pill, 70 px. */
const rewardRoom = (wide: boolean): number => LEVEL_MAP.daily.w - 96 - 176 - 24 - 46 - (wide ? 70 : 0);
/** Room of the locked card's hint and countdown lines. */
const LOCKED_ROOM = LEVEL_MAP.daily.w - 96 - 24;
/** Shop upgrade row: text column x and the room of the "Tier n/5" label right of the five pips. */
const tierGeometry = (row: { x: number; w: number }) => {
  const textX = row.x + 130;
  const tierX = textX + 5 * 24 + 8;
  return { textX, tierX, room: textX + (row.w - 130 - SHOP.buyW - 36) - tierX };
};

/** Draw the level select (realistic font measure) and return what was drawn. */
function drawCardWith(pal: Palette, daily: DailyCardOpts, measure: Measure = fontMeasure): Drawn[] {
  const out: Drawn[] = [];
  drawLevelSelect(recordingView(recordingCtx(out, new Set<string>(), undefined, measure)), pal, levelSelectOpts(daily));
  return out;
}
const lineAt = (drawn: Drawn[], y: number, x0: number, x1: number): Drawn[] => drawn.filter((d) => d.y === y && d.x >= x0 && d.x < x1);
/** Left-to-right width of a run line as drawn (each run at its own font). */
const drawnWidth = (runs: Drawn[]): number => runs.reduce((w, d) => w + fontMeasure(d.text, d.font), 0);

/** Every number of `runs` 24 px bold, every word `wordPx` 500, all in `colour`, on one baseline, never squeezed. */
function expectNumeralLine(runs: Drawn[], text: string, colour: string, wordPx: number): void {
  expect(runs.map((d) => d.text).join(''), text).toBe(text);
  const numbers = runs.filter((d) => NUMERAL.test(d.text));
  expect(numbers.length, text).toBeGreaterThan(0);
  for (const d of runs) {
    expect(d.fill, `"${d.text}" colour`).toBe(colour);
    expect(d.maxW, `"${d.text}" maxWidth`).toBeUndefined();
    if (numbers.includes(d)) expect([d.px, d.weight], `"${d.text}" size / weight`).toEqual([NUMERAL_PX, 700]);
    else expect([d.px, d.weight], `"${d.text}" size / weight`).toEqual([wordPx, 500]);
  }
  expect(new Set(runs.map((d) => d.y)).size).toBe(1);
  runs.slice(1).forEach((d, i) => expect(d.x).toBeGreaterThan(runs[i]!.x));
}

describe('ART-17 colour pairs', () => {
  for (const [name, pal] of PALETTES) {
    it(`${name}: countdown, locked hint and tier (dim) and the reward (ink) ≥ 4.5:1 on every face pixel behind them`, () => {
      for (const face of CARD_FACES(pal)) {
        expect(contrast(pal.textDim, face), `textDim on ${face}`).toBeGreaterThanOrEqual(MIN_TEXT);
        expect(contrast(pal.ink, face), `ink on ${face}`).toBeGreaterThanOrEqual(MIN_TEXT);
      }
    });
  }

  it('pinned ratios (the colours stay; ART-17 changes the numeral size)', () => {
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      expect(pal.panel).toBe('#fffaf0');
      expect(pal.paper).toBe('#fffaf0');
      expect(contrast(pal.textDim, pal.panel)).toBeCloseTo(5.19, 2);
      expect(contrast(pal.textDim, '#ffffff')).toBeCloseTo(5.4, 2);
      expect(contrast(pal.ink, pal.panel)).toBeCloseTo(13.73, 2);
    }
  });
});

describe('ART-17 through a recording canvas', () => {
  const r = LEVEL_MAP.daily;
  for (const [name, pal] of PALETTES) {
    it(`${name}: the countdown pill draws its times 24 px bold, words 17 px, dim, centred inside the pill`, () => {
      const pill = countdownPillRect(r);
      // the pill takes the title row right of the WEEKLY tab: 306 px (was 250)
      expect(pill).toEqual({ x: 370, y: r.y + 12, w: 306, h: 32 });
      expect(pill.x).toBeGreaterThan(LEVEL_MAP.dailyTabWeekly.x + LEVEL_MAP.dailyTabWeekly.w);
      for (const [tab, countdown] of [
        ['daily', 'New in 12:34 (00:00 UTC)'],
        ['daily', 'New in 20h (00:00 UTC)'],
        ['weekly', 'New in 6d 23h (Mon 00:00 UTC)'],
      ] as const) {
        const base = dailyOpts(tab);
        const daily = tab === 'daily' ? { ...base, countdown } : { ...base, weekly: { ...base.weekly, countdown } };
        const runs = drawCardWith(pal, daily).filter((d) => inside(d, pill));
        expectNumeralLine(runs, countdown, pal.textDim, 17);
        // one run per clock: "12:34" and "00:00" are never split around a word-size colon
        if (countdown.includes('12:34')) expect(runs.map((d) => d.text)).toEqual(['New in ', '12:34', ' (', '00:00', ' UTC)']);
        // centred, inside the inset, numerals' cap height (0.72 em) inside the 32 px pill
        const left = runs[0]!.x;
        const right = left + drawnWidth(runs);
        expect((left + right) / 2).toBeCloseTo(pill.x + pill.w / 2, 5);
        expect(left).toBeGreaterThanOrEqual(pill.x + COUNTDOWN_INSET);
        expect(right).toBeLessThanOrEqual(pill.x + pill.w - COUNTDOWN_INSET);
        const y = runs[0]!.y;
        expect(y - 0.72 * NUMERAL_PX).toBeGreaterThanOrEqual(pill.y + 2);
        expect(y).toBeLessThanOrEqual(pill.y + pill.h - 4);
      }
      // DONE keeps its 176 px gold badge (no number on it)
      const done = drawCardWith(pal, { ...dailyOpts('daily'), done: true, best: { stars: 3, timeMs: 61_000 } });
      expect(done.filter((d) => inside(d, pill) && NUMERAL.test(d.text))).toEqual([]);
    });

    it(`${name}: the reward line draws its amounts 24 px bold, words 17 px ink, on the streak pill's baseline`, () => {
      for (const [daily, text, wide] of [
        [dailyOpts('daily'), 'up to +60 gold · +5 crystals', true],
        [{ ...dailyOpts('daily'), nextBonus: null }, 'up to +60 gold · +5 crystals', false],
        [dailyOpts('weekly'), '+60 gold · +5 crystals at 3★', false],
      ] as const) {
        const drawn = drawCardWith(pal, daily);
        const sp = streakPill(wide);
        const runs = lineAt(drawn, r.y + 89, r.x + 96, sp.x);
        expectNumeralLine(runs, text, pal.ink, 17);
        expect(runs.filter((d) => NUMERAL.test(d.text)).map((d) => d.text)).toEqual(text.includes('3★') ? ['+60', '+5', '3'] : ['+60', '+5']);
        // after the coin + crystal glyphs, clear of the streak pill
        expect(runs[0]!.x).toBe(r.x + 96 + 46);
        expect(runs[0]!.x + drawnWidth(runs)).toBeLessThanOrEqual(sp.x - 4);
        // the streak pill's own numerals sit on the same baseline
        const pillRuns = drawn.filter((d) => inside(d, sp));
        expect(new Set(pillRuns.map((d) => d.y))).toEqual(new Set([r.y + 89]));
      }
    });

    it(`${name}: the locked card's hint and countdown draw their numbers 24 px bold in textDim inside the card`, () => {
      for (const tab of ['daily', 'weekly'] as const) {
        const drawn = drawCardWith(pal, dailyOpts(tab, false));
        const hint = lineAt(drawn, r.y + 66, r.x + 96, r.x + r.w);
        expectNumeralLine(hint, 'Clear level 3 to unlock', pal.textDim, 19);
        // the numeral's top stays under the tab frame (frame bottom r.y + 46)
        expect(hint[0]!.y - 0.72 * NUMERAL_PX).toBeGreaterThan(r.y + 46);
        const countdown = lineAt(drawn, r.y + 91, r.x + 96, r.x + r.w);
        expectNumeralLine(countdown, 'New in 12:34', pal.textDim, 17);
        // two lines, numerals' cap tops clear of the line above's descenders (0.22 em of 19 px)
        expect(countdown[0]!.y - 0.72 * NUMERAL_PX).toBeGreaterThan(hint[0]!.y + 0.22 * 19);
      }
    });

    it(`${name}: the card does not grow — every line stays on its 104 px face, over the same map`, () => {
      expect(LEVEL_MAP.daily).toEqual({ x: 30, y: 112, w: 660, h: 104 });
      for (const daily of [dailyOpts('daily'), dailyOpts('weekly'), dailyOpts('daily', false), { ...dailyOpts('weekly'), weekly: { ...dailyOpts('weekly').weekly, countdown: 'New in 6d 23h (Mon 00:00 UTC)' } }]) {
        const card = drawCardWith(pal, daily).filter((d) => d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h + 40);
        expect(card.length).toBeGreaterThan(0);
        // baseline + a 0.22 em descent inside the face (the bottom 5 px are the clay edge)
        for (const d of card) expect(d.y + 0.22 * d.px, `"${d.text}"`).toBeLessThanOrEqual(r.y + r.h - 5);
      }
    });

    it(`${name}: the shop's "Tier n/5" draws the fraction as one 24 px bold run, the word 16 px dim, right of the pips`, () => {
      const row = shopRowRect(1);
      const { tierX, room } = tierGeometry(row);
      for (const tier of [0, 1, 5]) {
        const out: Drawn[] = [];
        drawShop(recordingView(recordingCtx(out, new Set<string>(), undefined, fontMeasure)), pal, {
          ...shopOpts('upgrades'),
          upgrades: [{ id: 'u', rect: row, label: 'Production', glyph: 'production' as never, tier, maxTier: 5, cost: tier < 5 ? 300 : null, effectNow: '+5 % production', effectNext: '+10 % production', affordable: true }],
        });
        const runs = lineAt(out, row.y + 78, tierX, tierX + room);
        expectNumeralLine(runs, `Tier ${tier}/5`, pal.textDim, 16);
        expect(runs.map((d) => d.text)).toEqual(['Tier ', `${tier}/5`]);
        expect(runs[0]!.x).toBe(tierX);
        // the numerals' middle sits on the pips' centre line (row.y + 70) within 2 px
        expect(Math.abs(row.y + 78 - 0.36 * NUMERAL_PX - (row.y + 70))).toBeLessThanOrEqual(2);
        // the "Now" line under it still starts below the tier numerals' descent
        const now = out.find((d) => d.text === '+5 %' && d.x < tierX);
        if (tier > 0) expect(now!.y - 0.72 * NUMERAL_PX).toBeGreaterThan(row.y + 78);
      }
    });
  }
});

/**
 * Locale fit (ART-17), measured with the game's fonts (fontAdvances.ts, Chromium ±1.8 %): every
 * numeral of the four lines stays 24 px in every language (the rule's floor is 20 px: no line comes
 * near it), every line fits its room, and a line whose natural width leaves < 5 % slack is a known
 * tight line whose words give up size first (≥ 12 px, helper floor). TIGHT names them; the test
 * fails when a tight line is missing from it or a listed one has become roomy, so the list stays true.
 */
const TIGHT = new Set([
  'az countdown weekly 6d',
  'ru countdown daily mm:ss',
  'ru countdown weekly 6d',
  'ru countdown weekly h',
  'tr countdown weekly 6d',
  'tr countdown weekly h',
  'ru reward daily +bonus',
  'ru reward weekly',
]);

describe('ART-17 locale fit at 360 px (720 logical)', () => {
  it('numbers 24 px in every locale, every line inside its room, < 5 % slack only on the known tight lines', async () => {
    registerDictionary('az', az);
    registerDictionary('ru', ru);
    registerDictionary('tr', tr);
    const pal = DEFAULT_PALETTE;
    const r = LEVEL_MAP.daily;
    const pill = countdownPillRect(r);
    const row = shopRowRect(1);
    const tierGeo = tierGeometry(row);
    const tight: string[] = [];
    try {
      for (const lang of ['en', 'az', 'ru', 'tr'] as const) {
        await setLanguage(lang);
        // [id, drawn runs, nominal word px, room]
        const lines: [string, Drawn[], number, number][] = [];
        const countdowns: [string, 'daily' | 'weekly', string][] = [
          ['daily h', 'daily', t('daily.newIn', { h: 24 })],
          ['daily mm:ss', 'daily', t('daily.newInTime', { time: '59:59' })],
          ['weekly 6d', 'weekly', t('weekly.newInDays', { d: 6, h: 23 })],
          ['weekly h', 'weekly', t('weekly.newIn', { h: 23 })],
        ];
        for (const [id, tab, countdown] of countdowns) {
          const base = dailyOpts(tab);
          const open = tab === 'daily' ? { ...base, countdown } : { ...base, weekly: { ...base.weekly, countdown } };
          lines.push([`countdown ${id}`, drawCardWith(pal, open).filter((d) => inside(d, pill)), 17, pill.w - COUNTDOWN_INSET * 2]);
          const locked = tab === 'daily' ? { ...open, unlocked: false } : { ...open, weekly: { ...open.weekly, unlocked: false } };
          lines.push([`locked countdown ${id}`, lineAt(drawCardWith(pal, locked), r.y + 91, r.x + 96, r.x + r.w), 17, LOCKED_ROOM]);
        }
        const reward = (daily: DailyCardOpts, wide: boolean) => lineAt(drawCardWith(pal, daily), r.y + 89, r.x + 96, streakPill(wide).x);
        for (const crystals of [5, 2, 1]) {
          const d = { ...dailyOpts('daily'), crystals, gold: 60 };
          lines.push([`reward daily +bonus${crystals === 5 ? '' : ` ${crystals}`}`, reward(d, true), 17, rewardRoom(true)]);
          lines.push([`reward daily${crystals === 5 ? '' : ` ${crystals}`}`, reward({ ...d, nextBonus: null }, false), 17, rewardRoom(false)]);
        }
        for (const crystals of [20, 21]) {
          const base = dailyOpts('weekly');
          lines.push([`reward weekly${crystals === 20 ? '' : ` ${crystals}`}`, reward({ ...base, weekly: { ...base.weekly, gold: 100, crystals } }, false), 17, rewardRoom(false)]);
        }
        for (const [tab, n] of [
          ['daily', 8],
          ['weekly', 32],
        ] as const) {
          const base = dailyOpts(tab, false);
          const d = tab === 'daily' ? { ...base, unlockLevel: n } : { ...base, weekly: { ...base.weekly, unlockLevel: n } };
          lines.push([`locked hint ${tab}`, lineAt(drawCardWith(pal, d), r.y + 66, r.x + 96, r.x + r.w), 19, LOCKED_ROOM]);
        }
        for (const tier of [0, 5]) {
          const out: Drawn[] = [];
          drawShop(recordingView(recordingCtx(out, new Set<string>(), undefined, fontMeasure)), pal, {
            ...shopOpts('upgrades'),
            upgrades: [{ id: 'u', rect: row, label: 'X', glyph: 'production' as never, tier, maxTier: 5, cost: 300, effectNow: 'a', effectNext: 'b', affordable: true }],
          });
          lines.push([`tier ${tier}/5`, lineAt(out, row.y + 78, tierGeo.tierX, tierGeo.tierX + tierGeo.room), 16, tierGeo.room]);
        }

        for (const [id, runs, wordPx, room] of lines) {
          const key = `${lang} ${id}`;
          expect(runs.length, key).toBeGreaterThan(0);
          const numbers = runs.filter((d) => NUMERAL.test(d.text));
          expect(numbers.length, key).toBeGreaterThan(0);
          // the rule: numbers 24 px bold (never below 20, and here never shrunk at all)
          for (const d of numbers) expect([d.px, d.weight], `${key}: "${d.text}"`).toEqual([NUMERAL_PX, 700]);
          // the drawn line fits; its words are the nominal size or shrunk, never under 12 px
          expect(drawnWidth(runs), key).toBeLessThanOrEqual(room + 0.5);
          const text = runs.map((d) => d.text).join('');
          const natural = numeralRuns(text).reduce((w, run) => w + fontMeasure(run.s, `${run.num ? 700 : 500} ${run.num ? NUMERAL_PX : wordPx}px ${lang === 'ru' ? FONT_RU : 'x'}`), 0);
          const words = runs.filter((d) => !numbers.includes(d));
          if (natural <= room * 0.95) {
            for (const d of words) expect(d.px, `${key}: "${d.text}"`).toBe(wordPx);
          } else {
            tight.push(key.replace(/ (\d+)$/, ''));
            for (const d of words) expect(d.px, `${key}: "${d.text}"`).toBeGreaterThanOrEqual(12);
          }
        }
      }
    } finally {
      await setLanguage('en');
    }
    expect([...new Set(tight)].sort()).toEqual([...TIGHT].sort());
  });
});

describe('ART-17 numeral runs and the per-frame cost of a numeral line', () => {
  it('clocks and fractions are one run; a comma or full stop joins a number only before a digit (or as the ordinal mark)', () => {
    const split = (s: string) => numeralRuns(s).map((r) => (r.num ? `[${r.s}]` : r.s)).join('');
    expect(split('New in 12:34 (00:00 UTC)')).toBe('New in [12:34] ([00:00] UTC)');
    expect(split('Tier 1/5')).toBe('Tier [1/5]');
    expect(split('Пройди уровень 8, чтобы открыть')).toBe('Пройди уровень [8], чтобы открыть');
    expect(split('Açmak için 8. bölümü geç')).toBe('Açmak için [8.] bölümü geç');
    expect(split('+10 % production · 2.5k gold · 1,200')).toBe('[+10 %] production · [2.5k] gold · [1,200]');
    expect(split('+20 crystals at 3★')).toBe('[+20] crystals at [3]★');
  });

  it('a line redrawn every frame measures each run once and sets the font only where it changes', () => {
    let measures = 0;
    let fontSets = 0;
    const out: Drawn[] = [];
    const inner = recordingCtx(out, new Set<string>(), undefined, (s, f) => {
      measures++;
      return fontMeasure(s, f);
    });
    const ctx = new Proxy(inner, {
      get: (target, key) => Reflect.get(target, key),
      set: (target, key, value) => {
        if (key === 'font') fontSets++;
        return Reflect.set(target, key, value);
      },
    });
    const text = 'New in 59:59 (00:00 UTC)';
    const runs = numeralRuns(text).length;
    drawNumeralLine(ctx, text, 360, 100, 290, '#000000', 17, 'center');
    // first frame: one measure per run (numbers and words at their fonts)
    expect(measures).toBe(runs);
    const firstSets = fontSets;
    measures = 0;
    fontSets = 0;
    for (let frame = 0; frame < 60; frame++) drawNumeralLine(ctx, text, 360, 100, 290, '#000000', 17, 'center');
    expect(measures).toBe(0);
    // runs alternate number / words, so one font set per run per frame and no more
    expect(fontSets).toBe(60 * runs);
    expect(firstSets).toBeLessThanOrEqual(2 * runs);
    // the next second only measures the run that changed
    drawNumeralLine(ctx, 'New in 59:58 (00:00 UTC)', 360, 100, 290, '#000000', 17, 'center');
    expect(measures).toBe(1);
    // the drawn runs of every frame are identical
    expect(new Set(out.filter((d) => d.text === '59:59').map((d) => `${d.x},${d.px}`)).size).toBe(1);
  });
});
