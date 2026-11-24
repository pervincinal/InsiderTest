import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SETTINGS } from '../../src/render/menuLayout';
import type { SettingsOpts } from '../../src/render/menusSettings';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData, SaveStorage } from '../../src/ui/save';
import { SAVE_KEY, defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { SettingsScreen } from '../../src/ui/settings';

/*
 * REV-43: `probeNative()` resolves asynchronously after the screen is built and calls `relayout()`,
 * which replaces the About card's rects with new objects. `up()` compared the rect captured at
 * `down()` by identity, so an About-card tap that straddled the resolution matched nothing and fell
 * through to `playSfx('button')` + `writeSave(save)` with no visible effect. The press is now
 * remembered by role and resolved against the current rects at `up()`.
 */

const drawn = vi.hoisted(() => ({ opts: null as SettingsOpts | null }));
vi.mock('../../src/render/menusSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/render/menusSettings')>()),
  drawSettings: (_v: unknown, _p: unknown, o: SettingsOpts) => void (drawn.opts = o),
}));

/** A laid-out 360×640 phone (draw() re-clamps the scroll through the view's size). */
const VIEW = { cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

const memory = (): SaveStorage & { writes: number } => {
  const data = new Map<string, string>();
  const s = {
    writes: 0,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (k === SAVE_KEY) s.writes += 1;
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  };
  return s;
};

function fakeApp(save: SaveData): App {
  return {
    view: VIEW,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-24',
    weekKey: () => '2026-11-23',
  };
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs: 0 });
/** Let `probeNative()` resolve (its awaited provider calls) and relayout the About card. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

let storage: ReturnType<typeof memory>;
let save: SaveData;
let screen: SettingsScreen;

/**
 * Open the screen inside the test body: `probeNative()` is still pending at the next synchronous
 * line (vitest awaits between `beforeEach` and the test, which would let it settle first).
 */
const open = (back: () => void = () => undefined): SettingsScreen => (screen = new SettingsScreen(fakeApp(save), back));

beforeEach(() => {
  storage = memory();
  setSaveStorageForTests(storage);
  save = defaultSave();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a settings tap that straddles probeNative()’s relayout (REV-43)', () => {
  it('still toggles Diagnostics: the About rects were replaced between down and up', async () => {
    open();
    const toggle = screen.diagInfo.toggle;
    screen.down(centre(toggle));
    await flush();
    const now = screen.diagInfo.toggle;
    expect(now).not.toBe(toggle); // relayout did happen: new objects…
    expect(now).toEqual(toggle); // …at the same place (the web: no support id, no privacy options)
    screen.up(centre(toggle));
    expect(save.settings.diagnostics).toBe(true);
    expect(screen.diagInfo.on).toBe(true);
    expect(storage.writes).toBe(1); // the toggle's own write, not a blind fall-through write
  });

  it('the press look follows the rebuilt rect while the finger is still down', async () => {
    open();
    const toggle = screen.diagInfo.toggle;
    screen.down(centre(toggle));
    screen.draw(VIEW, 0);
    expect(drawn.opts!.pressed).toBe(toggle);
    await flush();
    screen.draw(VIEW, 16);
    expect(drawn.opts!.pressed).toBe(screen.diagInfo.toggle);
    expect(drawn.opts!.pressed).not.toBe(toggle);
    screen.up(centre(toggle));
    expect(save.settings.diagnostics).toBe(true);
  });

  it('a straddling tap on COPY LOG / CLEAR LOG (rows that exist only with the log on) still hits them', async () => {
    save.settings.diagnostics = true;
    open();
    const clear = screen.diagInfo.clear!;
    expect(clear).toBeTruthy();
    screen.down(centre(clear));
    await flush();
    expect(screen.diagInfo.clear).not.toBe(clear);
    screen.up(centre(clear));
    // CLEAR LOG's own confirmation toast (the log was empty: it still answers)
    expect(screen.toast.opts(0)?.text).toBeTruthy();
    expect(save.settings.diagnostics).toBe(true); // the switch next to it did not flip
  });

  it('a tap after the relayout settled, and a tap on a static row (BACK, Colour-blind), work as before', async () => {
    let backs = 0;
    open(() => void (backs += 1));
    await flush();
    const toggle = screen.diagInfo.toggle;
    screen.down(centre(toggle));
    screen.up(centre(toggle));
    expect(save.settings.diagnostics).toBe(true);
    screen.down(centre(SETTINGS.colorBlind));
    screen.up(centre(SETTINGS.colorBlind));
    expect(save.settings.colorBlind).toBe(true);
    screen.down(centre(SETTINGS.back));
    screen.up(centre(SETTINGS.back));
    expect(backs).toBe(1);
  });

  it('a press released elsewhere writes nothing', async () => {
    open();
    const toggle = screen.diagInfo.toggle;
    screen.down(centre(toggle));
    await flush();
    screen.up(centre(SETTINGS.colorBlind));
    expect(save.settings.diagnostics).toBeUndefined();
    expect(save.settings.colorBlind).toBeFalsy();
    expect(storage.writes).toBe(0);
  });
});
