import { describe, expect, it } from 'vitest';
import type { Palette } from '../../src/render/palette';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import type { View } from '../../src/render/view';
import { drawWallet } from '../../src/render/economyWidgets';
import { TITLE } from '../../src/render/layout';
import { LEVEL_MAP, SHOP, SHOP_TABS, levelNodeCentre } from '../../src/render/menuLayout';
import type { DailyCardOpts, LevelSelectOpts } from '../../src/render/menusLevels';
import { drawLevelSelect } from '../../src/render/menusLevels';
import type { ShopOpts } from '../../src/render/menusShop';
import { FOOTER_INK, drawShop } from '../../src/render/menusShop';
import { MIN_TEXT_PX } from '../../src/render/widgets';
import { t } from '../../src/ui/i18n';

/*
 * AUD-U26 leftovers: (a) the shop footers are ink on the sea (textDim there was ≈ 3.7 : 1) at the
 * 22 px floor; (c) the title wallet's star sits inside its own pill; (d) the level map's nodes are
 * clipped to the challenge card's top edge, so none peeks through the glass header or the gap above
 * the card while the map scrolls.
 */

const PALETTES: [string, Palette][] = [
  ['default', DEFAULT_PALETTE],
  ['colour-blind', COLOR_BLIND_PALETTE],
];

const channel = (h: string, i: number): number => {
  const c = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const contrast = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

interface Call {
  name: string;
  args: unknown[];
  fillStyle: unknown;
  font: string;
}

/** Canvas stand-in recording every call (with the fill style and font at that moment); measureText 0.5 em. */
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[]; stops: { args: number[]; stops: [number, string][] }[] } {
  const calls: Call[] = [];
  const stops: { args: number[]; stops: [number, string][] }[] = [];
  const store: Record<string | symbol, unknown> = { font: '700 10px sans-serif', fillStyle: '#000000', globalAlpha: 1 };
  const stack: Record<string | symbol, unknown>[] = [];
  const px = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(String(store.font))?.[1] ?? 10);
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'canvas') return { width: 720, height: 1280 };
      if (key === 'measureText') return (s: string) => ({ width: String(s).length * 0.5 * px() });
      if (key === 'createLinearGradient' || key === 'createRadialGradient')
        return (...args: number[]) => {
          const g = { args, stops: [] as [number, string][] };
          stops.push(g);
          return { addColorStop: (at: number, c: string) => void g.stops.push([at, c]) };
        };
      if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (key === 'getLineDash') return () => [];
      if (key === 'save') return () => void (stack.push({ ...store }), calls.push({ name: 'save', args: [], fillStyle: store.fillStyle, font: String(store.font) }));
      if (key === 'restore')
        return () => {
          const s = stack.pop();
          if (s) Object.assign(store, s);
          calls.push({ name: 'restore', args: [], fillStyle: store.fillStyle, font: String(store.font) });
        };
      if (typeof key === 'string' && !(key in store)) return (...args: unknown[]) => void calls.push({ name: key, args, fillStyle: store.fillStyle, font: String(store.font) });
      return store[key];
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls, stops };
}

const view = (ctx: CanvasRenderingContext2D): View =>
  ({ canvas: { width: 720, height: 1280 }, ctx, dpr: 1, cssW: 720, cssH: 1280, scale: 1, offsetX: 0, offsetY: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 } }) as unknown as View;

describe('AUD-U26 (a): shop footers in ink on the sea', () => {
  for (const [name, pal] of PALETTES) {
    it(`${name}: ink ≥ 4.5 : 1 on every water tone behind the footer (textDim there was ≈ 3.7 : 1)`, () => {
      expect(FOOTER_INK(pal)).toBe(pal.ink);
      for (const water of [pal.waterTop, pal.waterBottom, pal.waterLight]) expect(contrast(FOOTER_INK(pal), water), water).toBeGreaterThanOrEqual(6);
      // the old pair, for the record
      expect(contrast(pal.textDim, pal.waterBottom)).toBeLessThan(4.5);
    });

    it(`${name}: the test-store footer is drawn in that ink at the 22 px floor`, () => {
      const { ctx, calls } = recorder();
      const opts = {
        tab: 'crystals',
        tabs: SHOP_TABS,
        tabsRect: SHOP.tabs,
        backRect: SHOP.back,
        walletRect: SHOP.wallet,
        scroll: 0,
        gold: 0,
        crystals: 0,
        packs: [],
        convert: null,
        crate: null,
        bundles: [],
        skinHeaders: [],
        skins: [],
        upgrades: [],
        restoreRect: { x: 160, y: 400, w: 400, h: SHOP.restoreH },
        storeAvailable: true,
        pending: null,
        pressed: null,
        nowMs: 0,
      } as unknown as ShopOpts;
      drawShop(view(ctx), pal, opts);
      const footer = calls.filter((c) => c.name === 'fillText' && t('shop.testStore').startsWith(String(c.args[0]).slice(0, 12)));
      expect(footer.length).toBeGreaterThan(0);
      for (const c of footer) {
        expect(c.fillStyle).toBe(pal.ink);
        expect(Number(/(\d+(?:\.\d+)?)px/.exec(c.font)?.[1])).toBeGreaterThanOrEqual(Math.max(22, MIN_TEXT_PX));
      }
    });
  }
});

describe('AUD-U26 (c): the title wallet star sits inside its pill', () => {
  it('the star (face gradient: x0 = cx − s, x1 = cx + 0.6 s) lies wholly inside the first cell', () => {
    const { ctx, stops } = recorder();
    const r = TITLE.wallet;
    drawWallet(ctx, DEFAULT_PALETTE, r, 120, 30, { stars: 20 });
    const face = stops.find((g) => g.stops.some(([at, c]) => at === 0.5 && c === DEFAULT_PALETTE.star));
    expect(face).toBeDefined();
    const [x0, y0, x1] = face!.args as [number, number, number];
    const s = (x1 - x0) / 1.6;
    const cx = x0 + s;
    const cy = y0 + s;
    const cellW = (r.w - 2 * 8) / 3;
    expect(cx - s).toBeGreaterThanOrEqual(r.x + 4);
    expect(cx + s).toBeLessThanOrEqual(r.x + cellW / 2);
    expect(cy).toBeCloseTo(r.y + r.h / 2, 5);
    // on the same spot as the coin / crystal glyphs of the other cells (a pill-height half in from the left)
    expect(cx).toBeCloseTo(r.x + r.h / 2 + 2, 5);
  });
});

describe('AUD-U26 (d): the level map clips its nodes to the challenge card', () => {
  function frame(scroll: number): Call[] {
    const { ctx, calls } = recorder();
    const face = { unlocked: true, unlockLevel: 3, levelName: 'X', twist: 'Y', gold: 60, crystals: 5, streak: 0, done: false, best: null, countdown: 'New in 12:34', countdownTime: '12:34' };
    const daily: DailyCardOpts = { ...face, nextBonus: null, tab: 'daily', weekly: { ...face, target: false, targetMs: 90_000 }, yesterday: null };
    const o: LevelSelectOpts = {
      nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `L${i + 1}`, stars: 1, unlocked: true })),
      current: 3,
      scroll,
      backRect: LEVEL_MAP.back,
      walletRect: LEVEL_MAP.wallet,
      commanderRect: LEVEL_MAP.commander,
      gold: 0,
      crystals: 0,
      commander: null,
      daily,
      nowMs: 0,
    };
    drawLevelSelect(view(ctx), DEFAULT_PALETTE, o);
    return calls;
  }

  for (const scroll of [0, 300, 911]) {
    it(`scroll ${scroll}: every node is drawn inside a clip that starts at the card's top edge`, () => {
      const calls = frame(scroll);
      const clipAt = calls.findIndex((c, i) => c.name === 'clip' && calls[i - 1]?.name === 'rect');
      expect(clipAt).toBeGreaterThan(0);
      const [x, y, w, h] = calls[clipAt - 1]!.args as number[];
      // content space (the map is translated by −scroll): the card's top on screen is LEVEL_MAP.daily.y
      expect(y! - scroll).toBe(LEVEL_MAP.daily.y);
      expect(x).toBeLessThanOrEqual(0);
      expect(x! + w!).toBeGreaterThanOrEqual(720);
      expect(y! + h! - scroll).toBeGreaterThanOrEqual(1280);
      // the node numbers come after the clip and before the restore that lifts it
      let depth = 0;
      let lifted = -1;
      for (let i = clipAt; i < calls.length; i++) {
        if (calls[i]!.name === 'save') depth++;
        if (calls[i]!.name === 'restore' && depth-- === 0) {
          lifted = i;
          break;
        }
      }
      expect(lifted).toBeGreaterThan(clipAt);
      const numbers = calls.map((c, i) => [c, i] as const).filter(([c]) => c.name === 'fillText' && /^\d+$/.test(String(c.args[0])) && Number(c.args[0]) <= 12 && String(c.font).includes('40px'));
      expect(numbers.length).toBeGreaterThan(0);
      for (const [c, i] of numbers) expect(i > clipAt && i < lifted, `node ${String(c.args[0])}`).toBe(true);
      // and a node whose centre is above the card sits outside the clip
      const above = Array.from({ length: 12 }, (_, i) => levelNodeCentre(i).y - scroll).filter((cy) => cy < LEVEL_MAP.daily.y);
      if (scroll > 0) expect(above.length).toBeGreaterThan(0);
    });
  }
});
