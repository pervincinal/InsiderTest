import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SafeInsets, View } from '../../src/render/view';
import { bleed, createView, hudAnchors, toClient, toLogical } from '../../src/render/view';
import type { MenuBands } from '../../src/render/menuLayout';
import {
  ACHIEVEMENTS_BANDS,
  ACHIEVEMENTS_LAYOUT,
  HOWTO,
  HOWTO_BANDS,
  LEVEL_MAP,
  SETTINGS,
  SETTINGS_BANDS,
  SHOP,
  SHOP_BANDS,
  achievementsMaxScroll,
  bandToScreen,
  howtoRowShift,
  levelMapBands,
  levelMapMaxScroll,
  levelNodeRect,
  screenToBand,
  shopRowRect,
} from '../../src/render/menuLayout';
import { segmentAt } from '../../src/render/menuWidgets';
import type { Rect } from '../../src/render/widgets';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { getStore } from '../../src/economy/store';
import { LEVEL_META } from '../../src/levels/index';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { LevelSelectScreen } from '../../src/ui/levelSelect';
import { ShopScreen } from '../../src/ui/shop';
import { SettingsScreen } from '../../src/ui/settings';
import { HowToScreen } from '../../src/ui/howto';
import { AchievementsScreen } from '../../src/ui/achievements';
import { ACHIEVEMENTS } from '../../src/economy/catalog';
import { C } from '../../src/sim/constants';

/*
 * FE-11 (from BUG-34): the menus with a glass header (level map, shop, settings, how-to, achievements)
 * anchor the header *content* — not only its glass — to the top safe-area edge of a tall phone, and
 * their bottom chrome (the level map's commander chip, the how-to CLOSE) to the bottom one; the
 * content between takes the freed room. Taps follow the drawn positions. On 9:16 nothing moves.
 */

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** iPhone 17 Pro Max-class portrait viewport (CSS px) and its Dynamic Island / home indicator insets. */
const PRO_MAX = { w: 430, h: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } };

let env: SafeInsets = NO_INSETS;

interface Text {
  text: string;
  x: number;
  y: number;
}

/**
 * Canvas stand-in that records every fillText at its logical position: it follows `translate` (and
 * save / restore), which is all the menus use on top of the logical matrix `applyTransform` sets.
 */
function recorder(out: Text[]): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '700 10px sans-serif', fillStyle: '#000000', globalAlpha: 1, textAlign: 'left' };
  let ty = 0;
  let tx = 0;
  const stack: { ty: number; tx: number; s: Record<string | symbol, unknown> }[] = [];
  const gradient = { addColorStop: () => undefined };
  const methods: Record<string, (...a: never[]) => unknown> = {
    measureText: (s: string) => ({ width: String(s).length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    setTransform: () => {
      tx = 0;
      ty = 0;
    },
    translate: (x: number, y: number) => {
      tx += x;
      ty += y;
    },
    save: () => void stack.push({ tx, ty, s: { ...store } }),
    restore: () => {
      const s = stack.pop();
      if (s) {
        tx = s.tx;
        ty = s.ty;
        Object.assign(store, s.s);
      }
    },
    fillText: (text: string, x: number, y: number) => void out.push({ text: String(text), x: x + tx, y: y + ty }),
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

function viewAt(w: number, h: number, insets: SafeInsets, out: Text[] = []): View {
  env = insets;
  vi.stubGlobal('window', { innerWidth: w, innerHeight: h, devicePixelRatio: 2 });
  vi.stubGlobal('getComputedStyle', () => {
    const vars: Record<string, string> = { '--safe-top': `${env.top}px`, '--safe-right': `${env.right}px`, '--safe-bottom': `${env.bottom}px`, '--safe-left': `${env.left}px` };
    return { getPropertyValue: (name: string) => vars[name] ?? '' };
  });
  const ctx = recorder(out);
  const canvas = {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    parentElement: {} as Element,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;
  return createView(canvas);
}

const nineBySixteen = (out?: Text[]) => viewAt(360, 640, NO_INSETS, out);
const proMax = (out?: Text[]) => viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets, out);

interface Shell {
  app: App;
  starts: number[];
  shops: string[];
  backs: number;
}

function shell(view: View, save: SaveData): Shell {
  const s: Shell = { app: null as unknown as App, starts: [], shops: [], backs: 0 };
  s.app = {
    view,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {
      s.backs++;
    },
    goLevels() {},
    goShop(tab) {
      s.shops.push(tab ?? 'crystals');
    },
    goAchievements() {},
    startLevel: (id: number) => {
      s.starts.push(id);
      return Promise.resolve(true);
    },
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-10-12',
    weekKey: () => '2026-10-12',
  };
  return s;
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const pointer = (p: { x: number; y: number }) => ({ ...p, id: 1, type: 'touch' as const, timeMs: 0 });

/** Tap the screen where it draws layout point `p` (a finger on the glass: client px → logical). */
function tapDrawn(screen: Screen, view: View, p: { x: number; y: number }): void {
  const drawn = screen.fromLayout ? screen.fromLayout(p.x, p.y) : p;
  const client = toClient(view, drawn.x, drawn.y);
  const l = pointer(toLogical(view, client.x, client.y));
  screen.down?.(l);
  screen.up?.(l);
}

/** Tap logical point `p` as it is, ignoring any band (where a 9:16 layout would draw it). */
function tapRaw(screen: Screen, p: { x: number; y: number }): void {
  screen.down?.(pointer(p));
  screen.up?.(pointer(p));
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => true);
});
afterEach(() => {
  env = NO_INSETS;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ALL_BANDS: [string, MenuBands][] = [
  ['settings', SETTINGS_BANDS],
  ['shop', SHOP_BANDS],
  ['achievements', ACHIEVEMENTS_BANDS],
  ['howto', HOWTO_BANDS],
  ['level map', levelMapBands(false)],
  ['level map + yesterday', levelMapBands(true)],
];

describe('band mapping (FE-11)', () => {
  it('9:16 (and a wide screen): no anchors, every mapping is the identity', () => {
    for (const view of [nineBySixteen(), viewAt(1280, 720, NO_INSETS)]) {
      const a = hudAnchors(view);
      expect(a).toEqual({ top: 0, bottom: 0 });
      for (const [name, b] of ALL_BANDS) {
        for (const y of [0, 20, 99, 100, 150, 216, 300, 640, 1040, 1196, 1262, 1279]) {
          expect(bandToScreen(a, b, 123, y), `${name} y ${y}`).toEqual({ x: 123, y });
          expect(screenToBand(a, b, 123, y), `${name} y ${y}`).toEqual({ x: 123, y });
        }
      }
      expect(howtoRowShift(a, 0)).toBe(0);
      expect(howtoRowShift(a, HOWTO.rows - 1)).toBe(0);
    }
  });

  it('tall phone: the header band lands on the top safe edge, the bottom band on the bottom one, and the mapping round-trips', () => {
    const view = proMax();
    const a = hudAnchors(view);
    // ≈ 37 CSS px freed above the header on a Pro Max (the backlog's measurement), the same below
    expect(-a.top * view.scale).toBeCloseTo(37, 0);
    expect(a.bottom * view.scale).toBeCloseTo(37, 0);
    for (const [name, b] of ALL_BANDS) {
      // layout y 0 of the header → the top safe-area edge in client px
      const top = bandToScreen(a, b, 0, 0);
      expect(toClient(view, top.x, top.y).y, name).toBeCloseTo(PRO_MAX.insets.top, 6);
      for (const y of [10, 50, b.topEnd - 1, b.topEnd + 1, 640, 1100, 1250]) {
        const s = bandToScreen(a, b, 200, y);
        expect(screenToBand(a, b, s.x, s.y).y, `${name} y ${y}`).toBeCloseTo(y, 9);
      }
    }
    // the bottom chrome: the commander chip's bottom edge and CLOSE sit 20 / 154 layout px over the bottom safe edge, as on 9:16
    const chip = LEVEL_MAP.commander;
    const chipBottom = bandToScreen(a, levelMapBands(false), 0, chip.y + chip.h);
    expect(toClient(view, 0, chipBottom.y).y).toBeCloseTo(PRO_MAX.h - PRO_MAX.insets.bottom - (C.MAP_H - chip.y - chip.h) * view.scale, 6);
    const close = bandToScreen(a, HOWTO_BANDS, 0, HOWTO.close.y);
    expect(close.y).toBeCloseTo(HOWTO.close.y + a.bottom, 9);
    // how-to rows spread evenly from the header's shift to CLOSE's
    const shifts = Array.from({ length: HOWTO.rows }, (_, i) => howtoRowShift(a, i));
    for (let i = 1; i < shifts.length; i++) expect(shifts[i]! - shifts[i - 1]!).toBeCloseTo((a.bottom - a.top) / HOWTO.rows, 9);
    expect(shifts[0]).toBeGreaterThan(a.top);
    expect(shifts[HOWTO.rows - 1]).toBeLessThan(a.bottom);
  });
});

/** Texts every screen draws, recorded on a 9:16 and a Pro Max screen (same save, same state). */
function drawBoth(make: (app: App) => Screen): { flat: Text[]; tall: Text[]; a: { top: number; bottom: number } } {
  const flat: Text[] = [];
  const fv = nineBySixteen(flat);
  make(shell(fv, save).app).draw(fv, 0);
  const tall: Text[] = [];
  const tv = proMax(tall);
  make(shell(tv, save).app).draw(tv, 0);
  return { flat, tall, a: hudAnchors(tv) };
}

/** The vertical shift of `text` between the two recordings (first occurrence). */
function shiftOf(r: { flat: Text[]; tall: Text[] }, text: string): number {
  const f = r.flat.find((d) => d.text === text);
  const t = r.tall.find((d) => d.text === text && d.x === f?.x);
  if (!f || !t) throw new Error(`"${text}" not drawn on both screens`);
  return t.y - f.y;
}

describe('drawn positions (FE-11)', () => {
  it('9:16: the header texts sit on their layout rows (BACK centred in its rect, nothing shifted)', () => {
    const out: Text[] = [];
    const view = nineBySixteen(out);
    new SettingsScreen(shell(view, save).app, () => {}).draw(view, 0);
    const back = out.find((d) => d.text === 'BACK')!;
    expect(back.x).toBeCloseTo(SETTINGS.back.x + SETTINGS.back.w / 2, 0);
    expect(Math.abs(back.y - (SETTINGS.back.y + SETTINGS.back.h / 2))).toBeLessThanOrEqual(4);
  });

  it('settings: header, rows and the About card all move up by a.top together', () => {
    const r = drawBoth((app) => new SettingsScreen(app, () => {}));
    expect(r.tall.length).toBe(r.flat.length);
    r.flat.forEach((f, i) => {
      const t = r.tall[i]!;
      expect(t.text).toBe(f.text);
      expect(t.x).toBeCloseTo(f.x, 9);
      expect(t.y - f.y, `"${f.text}"`).toBeCloseTo(r.a.top, 9);
    });
  });

  it('shop: header, tabs and the cards move up by a.top', () => {
    const r = drawBoth((app) => {
      const shop = new ShopScreen(app, 'upgrades');
      shop.enter();
      return shop;
    });
    expect(r.tall.length).toBe(r.flat.length);
    r.flat.forEach((f, i) => expect(r.tall[i]!.y - f.y, `"${f.text}"`).toBeCloseTo(r.a.top, 9));
  });

  it('achievements: header, summary and rows move up by a.top', () => {
    const r = drawBoth((app) => new AchievementsScreen(app, () => {}));
    expect(r.tall.length).toBe(r.flat.length);
    r.flat.forEach((f, i) => expect(r.tall[i]!.y - f.y, `"${f.text}"`).toBeCloseTo(r.a.top, 9));
  });

  it('level map: header and challenge card up by a.top, the commander chip down by a.bottom, the path stays', () => {
    const r = drawBoth((app) => new LevelSelectScreen(app));
    expect(shiftOf(r, 'BACK')).toBeCloseTo(r.a.top, 9);
    expect(shiftOf(r, 'LEVELS')).toBeCloseTo(r.a.top, 9);
    expect(shiftOf(r, 'DAILY')).toBeCloseTo(r.a.top, 9);
    expect(shiftOf(r, 'WEEKLY')).toBeCloseTo(r.a.top, 9);
    expect(shiftOf(r, 'COMMANDER')).toBeCloseTo(r.a.bottom, 9);
    expect(shiftOf(r, '1')).toBe(0); // level 1's node numeral (the only unlocked one): the path does not move
  });

  it('how-to: BACK up by a.top, CLOSE down by a.bottom, rule text spread in between', () => {
    const r = drawBoth((app) => new HowToScreen(app, () => {}));
    expect(shiftOf(r, 'BACK')).toBeCloseTo(r.a.top, 9);
    expect(shiftOf(r, 'GOT IT')).toBeCloseTo(r.a.bottom, 9); // CLOSE
    for (let i = 0; i < HOWTO.rows; i++) expect(shiftOf(r, String(i + 1))).toBeCloseTo(howtoRowShift(r.a, i), 9);
  });
});

describe('taps follow the drawn positions (FE-11)', () => {
  it('settings: the colour-blind toggle where it is drawn; its 9:16 position is another row now', () => {
    const view = proMax();
    const s = shell(view, save);
    const settings = new SettingsScreen(s.app, () => s.backs++);
    tapRaw(settings, centre(SETTINGS.colorBlind)); // the moved card: this is the motion row's band now
    expect(save.settings.colorBlind).toBe(false);
    tapDrawn(settings, view, centre(SETTINGS.colorBlind));
    expect(save.settings.colorBlind).toBe(true);
    tapDrawn(settings, view, centre(SETTINGS.back));
    expect(s.backs).toBe(1);
    // the reset confirm card is centred on the screen, not banded
    tapDrawn(settings, view, centre(SETTINGS.reset));
    expect(settings.isConfirming).toBe(true);
    expect(settings.fromLayout(300, SETTINGS.confirm.no.y)).toEqual({ x: 300, y: SETTINGS.confirm.no.y });
    tapRaw(settings, centre(SETTINGS.confirm.no));
    expect(settings.isConfirming).toBe(false);
  });

  it('shop: a tab where it is drawn switches; the cards scroll under the moved tabs and their viewport grows', () => {
    const view = proMax();
    const a = hudAnchors(view);
    const shop = new ShopScreen(shell(view, save).app, 'crystals');
    shop.enter();
    const tabs = shop.tabs;
    const seg = (i: number) => {
      const w = (SHOP.tabs.w - 8) / tabs.length;
      return { x: SHOP.tabs.x + 4 + w * (i + 0.5), y: SHOP.tabs.y + SHOP.tabs.h / 2 };
    };
    expect(segmentAt(SHOP.tabs, tabs.length, seg(3).x, seg(3).y)).toBe(3);
    tapRaw(shop, seg(3)); // the 9:16 position is a card row now
    expect(shop.currentTab).toBe('crystals');
    tapDrawn(shop, view, seg(3));
    expect(shop.currentTab).toBe('upgrades');
    // an upgrade row bought where it is drawn
    save.gold = 10_000;
    tapDrawn(shop, view, centre(shopRowRect(0)));
    expect(Object.values(save.upgrades).some((tier) => tier > 0)).toBe(true);
    // scroll range: the 9:16 one minus the room the anchors add
    shop.setTab('skins');
    shop.setScroll(1e6);
    const flatView = nineBySixteen();
    const flat = new ShopScreen(shell(flatView, save).app, 'skins');
    flat.enter();
    flat.setScroll(1e6);
    expect(flat.scrollY - shop.scrollY).toBeCloseTo(a.bottom - a.top, 6);
  });

  it('level map: tabs, card and chip where they are drawn; nodes where the path is', () => {
    const view = proMax();
    const s = shell(view, save);
    const map = new LevelSelectScreen(s.app);
    expect(map.getScroll()).toBe(0);
    tapDrawn(map, view, centre(LEVEL_MAP.dailyTabWeekly));
    expect(map.getCardTab()).toBe('weekly');
    tapRaw(map, centre(LEVEL_MAP.dailyTabDaily)); // 9:16 position: the card's level line now, a tap on the card
    expect(map.getCardTab()).toBe('weekly');
    tapDrawn(map, view, centre(LEVEL_MAP.dailyTabDaily));
    expect(map.getCardTab()).toBe('daily');
    tapDrawn(map, view, centre(LEVEL_MAP.commander));
    expect(s.shops).toEqual(['upgrades']);
    tapRaw(map, centre(LEVEL_MAP.commander)); // above the moved chip: the path, no node there
    expect(s.shops).toEqual(['upgrades']);
    tapDrawn(map, view, centre(levelNodeRect(0, map.getScroll())));
    expect(s.starts).toEqual([LEVEL_META[0]!.id]);
    // the path scrolls until its last node clears the chip where it is drawn
    map.setScroll(1e6);
    const a = hudAnchors(view);
    expect(map.getScroll()).toBeCloseTo(levelMapMaxScroll(LEVEL_META.length, C.MAP_H + a.bottom), 9);
    expect(levelMapMaxScroll(LEVEL_META.length) - map.getScroll()).toBeCloseTo(a.bottom, 9);
    // the header band covers what the screen shows above the card: no node is hit through it
    const under = levelNodeRect(0, 0);
    expect(map.toLayout(under.x + 46, bleed(view).top + 5).y).toBeLessThan(LEVEL_MAP.headerH);
  });

  it('achievements: BACK where it is drawn; the rows scroll less on a tall screen', () => {
    const view = proMax();
    const a = hudAnchors(view);
    let backs = 0;
    const screen = new AchievementsScreen(shell(view, save).app, () => backs++);
    tapRaw(screen, centre(ACHIEVEMENTS_LAYOUT.back));
    expect(backs).toBe(0);
    tapDrawn(screen, view, centre(ACHIEVEMENTS_LAYOUT.back));
    expect(backs).toBe(1);
    expect(achievementsMaxScroll(ACHIEVEMENTS.length) - achievementsMaxScroll(ACHIEVEMENTS.length, a.bottom - a.top)).toBeCloseTo(
      Math.min(achievementsMaxScroll(ACHIEVEMENTS.length), a.bottom - a.top),
      9,
    );
  });

  it('how-to: CLOSE and BACK where they are drawn', () => {
    const view = proMax();
    let backs = 0;
    const card = new HowToScreen(shell(view, save).app, () => backs++);
    tapRaw(card, centre(HOWTO.close));
    expect(backs).toBe(0);
    // the stretched card's last row, where the content's layout range overlaps CLOSE's rect: no close
    const a = hudAnchors(view);
    tapRaw(card, { x: 360, y: HOWTO.close.y + 20 + a.top });
    expect(screenToBand(a, HOWTO_BANDS, 360, HOWTO.close.y + 20 + a.top).y).toBeCloseTo(HOWTO.close.y + 20, 9);
    expect(backs).toBe(0);
    tapDrawn(card, view, centre(HOWTO.close));
    tapDrawn(card, view, centre(HOWTO.back));
    expect(backs).toBe(2);
  });
});
