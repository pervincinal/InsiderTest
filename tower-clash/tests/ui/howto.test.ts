import { beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { inRect } from '../../src/render/widgets';
import { HUD, PAUSE, SETTINGS } from '../../src/render/layout';
import { HOWTO, howtoIconRect, howtoRowRect } from '../../src/render/menuLayout';
import { HOWTO_KEYS } from '../../src/render/menusHowto';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { HowToScreen } from '../../src/ui/howto';
import { SettingsScreen } from '../../src/ui/settings';
import { PlayScreen } from '../../src/ui/play';
import * as lazy from '../../src/ui/lazyScreens';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * FE-3 "How to play" card: geometry (one card, no scrolling, inside the map at 720×1280 and
 * therefore inside 360×640 at DPR 1), the locale keys in all four dictionaries (each rule ≤ 90
 * characters so it wraps to ≤ 2 lines of the 448 px text column at 22 px), and the screen
 * transitions: settings row → card → settings; pause button → card → paused game; ESC closes.
 */

const MAP: Rect = { x: 0, y: 0, w: 720, h: 1280 };
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: Rect, outer: Rect, pad = 0): boolean =>
  inner.x >= outer.x + pad && inner.y >= outer.y + pad && inner.x + inner.w <= outer.x + outer.w - pad && inner.y + inner.h <= outer.y + outer.h - pad;
const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'mouse' as const, timeMs: 0 });

/** Letterbox scale of the logical map in a `w`×`h` CSS viewport without insets (src/render/view.ts resize). */
const fitScale = (w: number, h: number): number => Math.min(w / MAP.w, h / MAP.h);

describe('how-to card layout (menuLayout.ts HOWTO)', () => {
  const rows = Array.from({ length: HOWTO.rows }, (_, i) => howtoRowRect(i));
  const icons = Array.from({ length: HOWTO.rows }, (_, i) => howtoIconRect(i));
  const last = rows[HOWTO.rows - 1]!;
  const textCol: Rect = { x: HOWTO.text.x, y: rows[0]!.y, w: HOWTO.text.w, h: last.y + last.h - rows[0]!.y };

  it('five rows, their icons, the text column and CLOSE sit inside the card; the card inside the map under the header', () => {
    expect(HOWTO.rows).toBe(5);
    expect(HOWTO_KEYS).toHaveLength(5);
    expect(inside(HOWTO.card, MAP, 20)).toBe(true);
    expect(HOWTO.card.y).toBeGreaterThanOrEqual(HOWTO.headerH + 20);
    expect(inside(HOWTO.back, { x: 0, y: 0, w: MAP.w, h: HOWTO.headerH })).toBe(true);
    for (const r of rows) expect(inside(r, HOWTO.card)).toBe(true);
    for (let i = 0; i < HOWTO.rows; i++) expect(inside(icons[i]!, rows[i]!)).toBe(true);
    expect(inside(textCol, HOWTO.card, 24)).toBe(true);
    for (const b of icons) expect(overlaps(b, textCol)).toBe(false);
    expect(inside(HOWTO.close, HOWTO.card, 24)).toBe(true);
    expect(HOWTO.close.y).toBeGreaterThanOrEqual(rows[HOWTO.rows - 1]!.y + rows[HOWTO.rows - 1]!.h + 16);
  });

  it('tap targets (BACK, CLOSE, rows) never overlap each other', () => {
    const targets = [HOWTO.back, HOWTO.close, ...rows];
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) expect(overlaps(targets[i]!, targets[j]!), `${i} vs ${j}`).toBe(false);
  });

  it('three lines of text fit a row', () => {
    expect(HOWTO.maxLines * HOWTO.lineH).toBeLessThanOrEqual(HOWTO.row.h - 16);
  });

  it.each([
    [360, 640],
    [720, 1280],
  ])('fits a %i×%i viewport at DPR 1 without scrolling and keeps CLOSE a real tap target', (w, h) => {
    const s = fitScale(w, h);
    const css = (r: Rect): Rect => ({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s });
    for (const r of [HOWTO.card, HOWTO.close, HOWTO.back, ...rows]) expect(inside(css(r), { x: 0, y: 0, w, h })).toBe(true);
    expect(css(HOWTO.close).h).toBeGreaterThanOrEqual(32);
    expect(css(HOWTO.back).h).toBeGreaterThanOrEqual(28);
  });
});

describe('entry points (layout.ts SETTINGS.howto, PAUSE.howto)', () => {
  it('settings row sits in the free slot between the motion row and the language label, inside the card', () => {
    const r = SETTINGS.howto;
    expect(inside(r, SETTINGS.card)).toBe(true);
    expect(r.y).toBeGreaterThanOrEqual(SETTINGS.motion.y + SETTINGS.motion.h);
    expect(r.y + r.h).toBeLessThanOrEqual(SETTINGS.languageLabelY);
    for (const other of [SETTINGS.sound, SETTINGS.colorBlind, SETTINGS.motion, SETTINGS.language, SETTINGS.reset, SETTINGS.back]) expect(overlaps(r, other)).toBe(false);
  });

  it('pause button sits under RETRY / MENU inside the (taller) pause card, clear of the bottom HUD band', () => {
    const r = PAUSE.howto;
    expect(inside(r, PAUSE.card, 16)).toBe(true);
    expect(r.y).toBeGreaterThanOrEqual(PAUSE.retry.y + PAUSE.retry.h + 8);
    for (const other of [PAUSE.resume, PAUSE.speed, PAUSE.sound, PAUSE.settings, PAUSE.retry, PAUSE.menu]) expect(overlaps(r, other)).toBe(false);
    expect(PAUSE.card.y + PAUSE.card.h).toBeLessThanOrEqual(HUD.bottomBar.y);
    // the rects the e2e specs mirror did not move
    expect(PAUSE.resume).toEqual({ x: 210, y: 566, w: 300, h: 76 });
    expect(PAUSE.speed).toEqual({ x: 210, y: 662, w: 300, h: 64 });
    expect(SETTINGS.language).toEqual({ x: 86, y: 664, w: 548, h: 56 });
  });
});

describe('locale keys', () => {
  const dicts: Record<string, Record<string, string>> = { en, az, ru, tr };
  const keys = ['howto.title', 'howto.1', 'howto.2', 'howto.3', 'howto.4', 'howto.5', 'howto.close', 'settings.howto', 'settings.howtoSub', 'pause.howto'];

  for (const [code, dict] of Object.entries(dicts)) {
    it(`${code}: every key present, each rule ≤ 90 characters with no unbreakable long word`, () => {
      for (const k of keys) expect(typeof dict[k] === 'string' && dict[k]!.trim().length > 0, k).toBe(true);
      for (const k of HOWTO_KEYS) {
        const s = dict[k]!;
        expect(s.length, `${code} ${k}: ${s.length} chars`).toBeLessThanOrEqual(90);
        for (const word of s.split(/\s+/)) expect(word.length, `${code} ${k}: "${word}"`).toBeLessThanOrEqual(22);
      }
      expect(dict['howto.title']).toBe(dict['pause.howto']);
    });
  }

  it('the four titles differ (translated, not copied)', () => {
    expect(new Set([en['howto.title'], az['howto.title'], ru['howto.title'], tr['howto.title']]).size).toBe(4);
  });
});

/* ---------- screen transitions ---------- */

function fakeApp(save: SaveData) {
  const opened: Screen[] = [];
  const gone: Screen[] = [];
  const app: App = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go(screen) {
      gone.push(screen);
    },
    openSettings() {},
    openHowTo(from) {
      opened.push(from);
    },
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-09-25',
    weekKey: () => '2026-09-21',
  };
  return { app, opened, gone };
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
});

describe('screen transitions', () => {
  it('is exported from the lazy screens chunk (never from the eager bundle)', () => {
    expect(lazy.HowToScreen).toBe(HowToScreen);
  });

  it('settings: a tap on the "How to play" row opens the card from the settings screen', () => {
    const shell = fakeApp(save);
    const settings = new SettingsScreen(shell.app, () => {});
    const p = centre(SETTINGS.howto);
    settings.down(p);
    settings.up(p);
    expect(shell.opened).toEqual([settings]);
    // a press that slides off the row does nothing
    settings.down(p);
    settings.move({ ...p, y: SETTINGS.howto.y - 40 });
    settings.up({ ...p, y: SETTINGS.howto.y - 40 });
    expect(shell.opened).toHaveLength(1);
  });

  it('pause menu: the button under RETRY opens the card only while paused', () => {
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel(), 1, 1);
    const p = centre(PAUSE.howto);
    play.up(p); // running: the point is on the map, not a menu button
    expect(shell.opened).toEqual([]);
    play.togglePause();
    play.up(p);
    expect(shell.opened).toEqual([play]);
    expect(play.loop.paused).toBe(true); // still paused when the card returns
    expect(inRect(PAUSE.howto, p.x, p.y)).toBe(true);
  });

  it('card: CLOSE, BACK, ESC and Enter all run `back`; a press that leaves the button does not', () => {
    let backs = 0;
    const shell = fakeApp(save);
    const card = new HowToScreen(shell.app, () => backs++);
    expect(card.name).toBe('howto');
    const close = centre(HOWTO.close);
    card.down(close);
    card.up(close);
    expect(backs).toBe(1);
    const back = centre(HOWTO.back);
    card.down(back);
    card.up(back);
    expect(backs).toBe(2);
    card.down(close);
    card.move({ ...close, x: HOWTO.close.x - 30 });
    card.up({ ...close, x: HOWTO.close.x - 30 });
    expect(backs).toBe(2);
    card.up(close); // no press
    expect(backs).toBe(2);
    for (const key of ['Escape', 'Enter', 'x']) card.key({ key } as KeyboardEvent); // no DOM in Vitest
    expect(backs).toBe(4);
  });
});
