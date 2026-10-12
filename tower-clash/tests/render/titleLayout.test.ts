import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SafeInsets, View } from '../../src/render/view';
import { createView, hudAnchors, toClient, toLogical } from '../../src/render/view';
import { TITLE } from '../../src/render/layout';
import {
  NO_TITLE_SHIFTS,
  TITLE_GROUND_BANDS,
  TITLE_ISLAND,
  TITLE_RAMP,
  TITLE_RIM_CSS,
  TITLE_WALLET_GAP_CSS,
  screenToTitle,
  titleRectShift,
  titleShifts,
  titleToScreen,
} from '../../src/render/titleLayout';
import type { Rect } from '../../src/render/widgets';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { TitleScreen } from '../../src/ui/screens';
import { C } from '../../src/sim/constants';

/*
 * FE-12 (TestFlight build 12, iPhone 430×932: "the sea part of the main screen is too big"): on a
 * screen taller than 9:16 the title island grows to the safe-area edges with a thin sea rim, its groups
 * (logo, PLAY column, bottom row + wallet) move with it, and taps land where the buttons are drawn.
 */

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let env: SafeInsets = NO_INSETS;

function viewAt(w: number, h: number, insets: SafeInsets, dpr = 3): View {
  env = insets;
  vi.stubGlobal('window', { innerWidth: w, innerHeight: h, devicePixelRatio: dpr });
  vi.stubGlobal('getComputedStyle', () => {
    const vars: Record<string, string> = { '--safe-top': `${env.top}px`, '--safe-right': `${env.right}px`, '--safe-bottom': `${env.bottom}px`, '--safe-left': `${env.left}px` };
    return { getPropertyValue: (name: string) => vars[name] ?? '' };
  });
  const canvas = {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    parentElement: {} as Element,
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;
  return createView(canvas);
}

const proMax = () => viewAt(430, 932, { top: 59, right: 0, bottom: 34, left: 0 });

afterEach(() => {
  env = NO_INSETS;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('title shifts (FE-12)', () => {
  it('9:16 and a wide desktop window: nothing moves', () => {
    expect(titleShifts(viewAt(360, 640, NO_INSETS, 1))).toBe(NO_TITLE_SHIFTS);
    expect(titleShifts(viewAt(1280, 800, NO_INSETS, 1))).toBe(NO_TITLE_SHIFTS);
    expect(titleShifts({} as View)).toBe(NO_TITLE_SHIFTS); // stub view, not laid out
  });

  it('430×932: the island top sits a 24 CSS px rim under the safe top, the wallet 12 CSS px over the safe bottom', () => {
    const view = proMax();
    const a = hudAnchors(view);
    const sh = titleShifts(view);
    const css = (y: number) => toClient(view, 0, y).y;
    expect(css(TITLE_ISLAND.top + sh.top)).toBeCloseTo(59 + TITLE_RIM_CSS, 0);
    expect(css(TITLE.wallet.y + TITLE.wallet.h + sh.bottom)).toBeCloseTo(932 - 34 - TITLE_WALLET_GAP_CSS, 0);
    // the island foot is far closer to the bottom safe edge than before (≈ 100 CSS px of sea under it on build 12)
    expect(932 - 34 - css(TITLE_ISLAND.foot + sh.bottom)).toBeLessThan(45);
    expect(sh.logo).toBeCloseTo(sh.top / 2, 0);
    expect(sh.mid).toBe(0);
    expect(sh.safeTop).toBe(a.top);
    // whole device pixels: the moved ground pieces keep the unmoved image's pixel phase
    for (const v of [sh.top, sh.logo, sh.bottom]) expect(Math.abs(v * view.scale * view.dpr - Math.round(v * view.scale * view.dpr))).toBeLessThan(1e-6);
  });

  it('a screen a little taller than 9:16 moves a little (ramp), never more than its extra room plus the 9:16 margin', () => {
    // 360×660: 20 logical px of extra room per edge = 1/3 of the ramp; rim 24 CSS px = 48 logical
    // (shifts snap to whole device pixels: 2 logical px at 360 px wide, DPR 1)
    const near = titleShifts(viewAt(360, 660, NO_INSETS, 1));
    expect(Math.abs(near.top - (-20 - ((TITLE_ISLAND.top - 48) * 20) / TITLE_RAMP))).toBeLessThanOrEqual(1);
    expect(Math.abs(near.bottom - (20 + ((C.MAP_H - 1224 - TITLE_WALLET_GAP_CSS * 2) * 20) / TITLE_RAMP))).toBeLessThanOrEqual(1);
    // the full fit is reached past the ramp and never goes further
    const tall = titleShifts(viewAt(360, 800, NO_INSETS, 1));
    expect(Math.abs(tall.top - (-160 - (TITLE_ISLAND.top - 48)))).toBeLessThanOrEqual(1);
  });

  it('the ground bands lie between the groups, in order', () => {
    let y = 0;
    for (const b of TITLE_GROUND_BANDS) {
      expect(b.y0).toBeGreaterThan(y);
      expect(b.y1).toBeGreaterThan(b.y0);
      y = b.y1;
    }
    expect(y).toBeLessThan(C.MAP_H);
  });

  it('layout ↔ screen round-trips on every button centre; the chip follows the safe top edge', () => {
    const sh = titleShifts(proMax());
    for (const r of Object.values(TITLE) as Rect[]) {
      const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      const s = titleToScreen(sh, c.x, c.y);
      expect(s.y).toBeCloseTo(c.y + titleRectShift(sh, r), 6);
      const back = screenToTitle(sh, s.x, s.y);
      expect(back.x).toBe(c.x);
      expect(back.y).toBeCloseTo(c.y, 6);
    }
    // monotone and continuous between the groups (a step's gap maps onto its knot)
    let prev = -Infinity;
    for (let y = -200; y <= 1500; y += 0.5) {
      const l = screenToTitle(sh, 10, y).y;
      expect(l).toBeGreaterThanOrEqual(prev);
      prev = l;
    }
  });
});

describe('title taps where the buttons are drawn (FE-12)', () => {
  beforeEach(() => setSaveStorageForTests(null));

  function title(view: View): { screen: TitleScreen; calls: string[] } {
    const calls: string[] = [];
    const app: App = {
      view,
      save: defaultSave(),
      ads: createAdSession(),
      palette: () => getPalette(false),
      goTitle() {},
      goLevels: () => void calls.push('levels'),
      goShop: () => void calls.push('shop'),
      goAchievements: () => void calls.push('achievements'),
      startLevel: () => Promise.resolve(true),
      go() {},
      openSettings: () => void calls.push('settings'),
      openHowTo() {},
      setSpeed() {},
      setLanguage: () => void calls.push('language'),
      dayKey: () => '2026-10-12',
      weekKey: () => '2026-10-12',
    };
    return { screen: new TitleScreen(app), calls };
  }

  const pointer = (p: { x: number; y: number }) => ({ ...p, id: 1, type: 'touch' as const, timeMs: 0 });
  function tapDrawn(screen: TitleScreen, view: View, r: Rect): void {
    const drawn = screen.fromLayout(r.x + r.w / 2, r.y + r.h / 2);
    const client = toClient(view, drawn.x, drawn.y);
    const p = pointer(toLogical(view, client.x, client.y));
    screen.down(p);
    screen.up(p);
  }

  it('430×932: PLAY, settings, SHOP, wallet, trophy and the language chip take the tap at their drawn spot', () => {
    const view = proMax();
    const { screen, calls } = title(view);
    for (const r of [TITLE.play, TITLE.settings, TITLE.shop, TITLE.wallet, TITLE.achievements, TITLE.lang]) tapDrawn(screen, view, r);
    expect(calls).toEqual(['levels', 'settings', 'shop', 'shop', 'achievements', 'language']);
  });

  it('430×932: the wallet / trophy / chip layout rects (where 9:16 draws them) are empty there', () => {
    const view = proMax();
    const { screen, calls } = title(view);
    for (const r of [TITLE.wallet, TITLE.achievements, TITLE.lang]) {
      const p = pointer({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      screen.down(p);
      screen.up(p);
    }
    expect(calls).toEqual([]);
  });

  it('9:16: the identity', () => {
    const view = viewAt(360, 640, NO_INSETS, 1);
    const { screen, calls } = title(view);
    expect(screen.fromLayout(100, 1198)).toEqual({ x: 100, y: 1198 });
    expect(screen.toLayout(666, 40)).toEqual({ x: 666, y: 40 });
    tapDrawn(screen, view, TITLE.wallet);
    expect(calls).toEqual(['shop']);
  });
});
