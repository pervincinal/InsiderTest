import { beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { PAUSE, TITLE } from '../../src/render/layout';
import { SETTINGS } from '../../src/render/menuLayout';
import { LANGUAGE_SEGMENTS, MOTION_SEGMENTS, SETTINGS_FEEL } from '../../src/render/menusSettings';
import { createAdSession } from '../../src/economy/adsFlow';
import { musicOn } from '../../src/audio/index';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { TitleScreen } from '../../src/ui/screens';
import { SettingsScreen } from '../../src/ui/settings';
import type { FocusHost } from '../../src/ui/focus';
import { activate, focusItems, focusKey, focusState, hideFocus, readingOrder, resetFocusForTests, segmentRects, step, vertical } from '../../src/ui/focus';
import type { PointerPoint } from '../../src/input/pointer';

/*
 * AUD-U27 (2026-11-05): desktop keyboard focus on the menus (src/ui/focus.ts). Order = reading order of
 * the screen's tappable rects; Tab / arrows wrap; Enter / Space are a tap at the item's centre through the
 * screen's own down / up; a pointer press hides the ring; while it is hidden the per-screen shortcuts keep
 * their keys.
 */

/** A 9:16 phone (360 × 640 CSS px): logical = layout, no bands, no title shifts. */
const VIEW = { cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

function fakeApp(save: SaveData, log: string[] = []): App {
  return {
    view: VIEW,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle: () => void log.push('title'),
    goLevels: () => void log.push('levels'),
    goShop: () => void log.push('shop'),
    goAchievements: () => void log.push('achievements'),
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings: () => void log.push('settings'),
    openHowTo: () => void log.push('howto'),
    setSpeed() {},
    setLanguage: (code) => void log.push(`lang:${code}`),
    dayKey: () => '2026-11-05',
    weekKey: () => '2026-11-03',
  };
}

const key = (k: string, shift = false): KeyboardEvent => ({ key: k, shiftKey: shift, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }) as unknown as KeyboardEvent;
const host = (current: Screen): FocusHost => ({ current, view: VIEW });
const same = (a: Rect | null | undefined, b: Rect): boolean => !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** A screen recording the taps it gets, with `rects` as its focus items. */
function recorder(rects: Rect[], name: Screen['name'] = 'howto'): Screen & { taps: string[] } {
  const taps: string[] = [];
  const at = (p: PointerPoint): string => `${p.x},${p.y}`;
  return { name, taps, draw() {}, down: (p) => void taps.push(`down ${at(p)}`), up: (p) => void taps.push(`up ${at(p)}`), focusRects: () => rects };
}

beforeEach(() => {
  resetFocusForTests();
  setSaveStorageForTests(null);
});

describe('order', () => {
  it('reading order: rows top to bottom (centres within half a height share a row), each row left to right', () => {
    const a = { x: 400, y: 100, w: 100, h: 60 };
    const b = { x: 50, y: 110, w: 100, h: 40 };
    const c = { x: 50, y: 300, w: 100, h: 60 };
    const d = { x: 300, y: 10, w: 50, h: 50 };
    expect(readingOrder([a, b, c, d])).toEqual([d, b, a, c]);
  });

  it('the title: language chip, PLAY, settings · sound, SHOP, then the bottom row and the wallet', () => {
    const items = focusItems(new TitleScreen(fakeApp(defaultSave())), VIEW);
    expect(items).toHaveLength(8);
    expect(same(items[0], TITLE.lang)).toBe(true);
    expect(same(items[1], TITLE.play)).toBe(true);
    const settings = items.findIndex((r) => same(r, TITLE.settings));
    const sound = items.findIndex((r) => same(r, TITLE.sound));
    expect(sound).toBe(settings + 1); // one row: settings left, sound right
    expect(same(items[items.length - 1], TITLE.wallet)).toBe(true);
    for (let i = 1; i < items.length; i++) expect(items[i]!.y + items[i]!.h / 2).toBeGreaterThanOrEqual(items[i - 1]!.y + items[i - 1]!.h / 2 - Math.min(items[i]!.h, items[i - 1]!.h) / 2);
  });

  it('settings: BACK, Music, Effects, … one item per picker segment, Vibration, Screen shake, RESET; the confirm card offers CANCEL first', () => {
    const s = new SettingsScreen(fakeApp(defaultSave()), () => {});
    const items = s.focusRects();
    expect(same(items[0], SETTINGS.back)).toBe(true);
    expect(same(items[1], SETTINGS.music)).toBe(true);
    expect(same(items[2], SETTINGS.sound)).toBe(true);
    expect(same(items[3], SETTINGS.colorBlind)).toBe(true);
    const motion = segmentRects(SETTINGS.motion, MOTION_SEGMENTS.length);
    expect(items.slice(4, 4 + motion.length)).toEqual(motion.map((r) => ({ ...r, band: items[4]!.band })));
    const lang = items.findIndex((r) => same(r, segmentRects(SETTINGS.language, LANGUAGE_SEGMENTS.length)[0]!));
    expect(same(items[lang - 1], SETTINGS.howto)).toBe(true);
    const reset = items.findIndex((r) => same(r, SETTINGS.reset));
    expect(same(items[reset - 2], SETTINGS_FEEL.haptics)).toBe(true);
    expect(same(items[reset - 1], SETTINGS_FEEL.shake)).toBe(true);
    expect(items.some((r) => same(r, s.versionRow))).toBe(false); // the hidden overlay switch is no button
    activate(s, items[reset]!);
    expect(s.isConfirming).toBe(true);
    expect(s.focusRects().map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))).toEqual([SETTINGS.confirm.no, SETTINGS.confirm.yes]);
  });

  it('the pause card while paused, nothing while the match runs', () => {
    const play = { name: 'play', draw() {}, loop: { paused: true }, over: false } as unknown as Screen;
    expect(focusItems(play, VIEW)).toEqual([PAUSE.resume, PAUSE.speed, PAUSE.sound, PAUSE.settings, PAUSE.retry, PAUSE.menu, PAUSE.howto]);
    (play as unknown as { loop: { paused: boolean } }).loop.paused = false;
    expect(focusItems(play, VIEW)).toEqual([]);
  });
});

describe('wrap', () => {
  const rects = [
    { x: 0, y: 0, w: 100, h: 60 },
    { x: 200, y: 0, w: 100, h: 60 },
    { x: 0, y: 200, w: 100, h: 60 },
  ];

  it('step wraps both ways; ↑ / ↓ take the nearest item of the next row and wrap to the first / last', () => {
    expect(step(2, 1, 3)).toBe(0);
    expect(step(0, -1, 3)).toBe(2);
    expect(vertical(rects, 1, 1)).toBe(2); // down from the top right: the one below-left
    expect(vertical(rects, 2, 1)).toBe(0); // nothing below: wrap to the first
    expect(vertical(rects, 0, -1)).toBe(2); // nothing above: wrap to the last
  });

  it('the first Tab shows the ring on the first item (Shift+Tab: the last); Tab past the last wraps to the first', () => {
    const s = recorder(rects);
    const h = host(s);
    expect(focusState(h)).toMatchObject({ shown: false, rect: null, count: 3 });
    expect(focusKey(h, key('Tab'))).toBe(true);
    expect(focusState(h)).toMatchObject({ shown: true, index: 0 });
    focusKey(h, key('Tab'));
    focusKey(h, key('Tab'));
    expect(focusState(h).index).toBe(2);
    focusKey(h, key('Tab'));
    expect(focusState(h).index).toBe(0);
    focusKey(h, key('Tab', true));
    expect(focusState(h).index).toBe(2);
    focusKey(h, key('ArrowRight'));
    expect(focusState(h).index).toBe(0);
    resetFocusForTests();
    expect(focusKey(h, key('Tab', true))).toBe(true);
    expect(focusState(h).index).toBe(2);
  });
});

describe('activate', () => {
  it('Enter / Space are a tap at the item centre through the screen’s own down / up', () => {
    const s = recorder([{ x: 100, y: 200, w: 80, h: 40 }]);
    const h = host(s);
    focusKey(h, key('Tab'));
    expect(focusKey(h, key('Enter'))).toBe(true);
    expect(focusKey(h, key(' '))).toBe(true);
    expect(s.taps).toEqual(['down 140,220', 'up 140,220', 'down 140,220', 'up 140,220']);
  });

  it('settings: Tab to Music, Enter toggles it (the tap path: the row persists through the audio facade)', () => {
    const save = defaultSave();
    const s = new SettingsScreen(fakeApp(save), () => {});
    const h = host(s);
    focusKey(h, key('Tab')); // BACK
    focusKey(h, key('Tab')); // Music
    expect(same(focusState(h).rect, SETTINGS.music)).toBe(true);
    const before = musicOn();
    focusKey(h, key('Enter'));
    expect(musicOn()).toBe(!before);
    focusKey(h, key(' '));
    expect(musicOn()).toBe(before);
  });

  it('the title: Tab to the gear, Enter opens Settings', () => {
    const log: string[] = [];
    const title = new TitleScreen(fakeApp(defaultSave(), log));
    const h = host(title);
    const items = focusItems(title, VIEW);
    const gear = items.findIndex((r) => same(r, TITLE.settings));
    for (let i = 0; i <= gear; i++) focusKey(h, key('Tab'));
    expect(same(focusState(h).rect, TITLE.settings)).toBe(true);
    focusKey(h, key('Enter'));
    expect(log).toEqual(['settings']);
  });

  it('while the ring is hidden the screen keeps its keys: Enter / Space / Escape pass, the level map’s / shop’s arrows pass', () => {
    const s = recorder([{ x: 0, y: 0, w: 50, h: 50 }]);
    const h = host(s);
    for (const k of ['Enter', ' ', 'Escape', 'm', '1']) expect(focusKey(h, key(k)), k).toBe(false);
    expect(s.taps).toEqual([]);
    const map = recorder([{ x: 0, y: 0, w: 50, h: 50 }], 'levelSelect');
    const hm = host(map);
    expect(focusKey(hm, key('ArrowDown'))).toBe(false); // scrolls the map (levelSelect.key)
    expect(focusKey(hm, key('Tab'))).toBe(true);
    expect(focusKey(hm, key('ArrowDown'))).toBe(true); // once the ring is up the arrows move it
    expect(focusKey(hm, key('Escape'))).toBe(false); // back stays the screen's
    // a screen with no items (the play screen mid-match) takes no key
    const running = { name: 'play', draw() {}, loop: { paused: false }, over: false } as unknown as Screen;
    expect(focusKey(host(running), key('Tab'))).toBe(false);
    expect(focusKey(host(running), key(' '))).toBe(false); // Space = pause (play.ts key)
  });
});

describe('hide on pointer', () => {
  it('a pointer press hides the ring; the next key brings it back on the same item without moving it', () => {
    const rects = [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 100, y: 0, w: 50, h: 50 },
    ];
    const s = recorder(rects);
    const h = host(s);
    focusKey(h, key('Tab'));
    focusKey(h, key('Tab'));
    expect(focusState(h)).toMatchObject({ shown: true, index: 1 });
    hideFocus();
    expect(focusState(h)).toMatchObject({ shown: false, rect: null });
    expect(focusKey(h, key('Enter')), 'no ring: Enter is the screen’s').toBe(false);
    expect(s.taps).toEqual([]);
    focusKey(h, key('Tab'));
    expect(focusState(h)).toMatchObject({ shown: true, index: 1 });
  });

  it('keyboard mode carries to the next screen, which opens on its first item; a hidden ring stays hidden there', () => {
    const a = recorder([{ x: 0, y: 0, w: 50, h: 50 }]);
    const b = recorder([
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 0, y: 100, w: 50, h: 50 },
    ]);
    focusKey(host(a), key('Tab'));
    expect(focusState(host(b))).toMatchObject({ shown: true, index: 0, count: 2 });
    hideFocus();
    const c = recorder([{ x: 0, y: 0, w: 50, h: 50 }]);
    expect(focusState(host(c))).toMatchObject({ shown: false, rect: null });
  });
});
