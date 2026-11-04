import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SETTINGS } from '../../src/render/menuLayout';
import { SETTINGS_FEEL } from '../../src/render/menusSettings';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, normalizeSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { SettingsScreen } from '../../src/ui/settings';
import { PlayScreen } from '../../src/ui/play';
import type { SimEvent } from '../../src/sim/types';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * AUD-U20: Settings → Vibration (`settings.haptics`, absent = on) — the capture haptic (play.ts, src/native
 * `hapticCapture`) and the hit / lost-tower haptics (audio/recipes.ts, tests/audio/hits.test.ts) read it.
 * AUD-F18: Settings → Screen shake (`settings.shake`, absent = on; the drawing side is
 * tests/render/shakeSetting.test.ts). Both rows: toggles under the text size, saved at once.
 */

const haptic = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/native/index', async (orig) => ({
  ...(await orig<typeof import('../../src/native/index')>()),
  hapticCapture: () => {
    haptic.calls++;
  },
}));

const loaded = (settings: Record<string, unknown>): SaveData['settings'] => normalizeSave({ version: 3, settings }).settings;

function fakeApp(save: SaveData): App {
  return {
    view: {} as View,
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
    dayKey: () => '2026-11-04',
    weekKey: () => '2026-11-03',
  };
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, timeMs: 0 });

describe('save (normalizeSave)', () => {
  it('a fresh save has neither field (both on); booleans survive a load, anything else is dropped', () => {
    expect(defaultSave().settings).not.toHaveProperty('haptics');
    expect(defaultSave().settings).not.toHaveProperty('shake');
    expect(loaded({ haptics: false, shake: false })).toMatchObject({ haptics: false, shake: false });
    expect(loaded({ haptics: true, shake: true })).toMatchObject({ haptics: true, shake: true });
    for (const bad of ['off', 0, null, {}]) {
      expect(loaded({ haptics: bad }), String(bad)).not.toHaveProperty('haptics');
      expect(loaded({ shake: bad }), String(bad)).not.toHaveProperty('shake');
    }
  });
});

describe('Settings → Vibration / Screen shake rows', () => {
  let save: SaveData;
  let screen: SettingsScreen;
  const tap = (r: Rect): void => {
    screen.down(centre(r));
    screen.up(centre(r));
  };

  beforeEach(() => {
    setSaveStorageForTests(null);
    save = defaultSave();
    screen = new SettingsScreen(fakeApp(save), () => {});
  });

  it('each toggle flips only its own flag, off then on again', () => {
    tap(SETTINGS_FEEL.haptics);
    expect(save.settings).toMatchObject({ haptics: false });
    expect(save.settings).not.toHaveProperty('shake');
    tap(SETTINGS_FEEL.shake);
    expect(save.settings).toMatchObject({ haptics: false, shake: false });
    tap(SETTINGS_FEEL.haptics);
    tap(SETTINGS_FEEL.shake);
    expect(save.settings).toMatchObject({ haptics: true, shake: true });
  });

  it('the rows sit under the text size, one row pitch apart, the toggles the size of the others', () => {
    expect(SETTINGS_FEEL.haptics.y - SETTINGS.textSize.y).toBe(SETTINGS.rowH);
    expect(SETTINGS_FEEL.shake.y - SETTINGS_FEEL.haptics.y).toBe(SETTINGS.rowH);
    for (const r of [SETTINGS_FEEL.haptics, SETTINGS_FEEL.shake]) expect([r.x, r.w, r.h]).toEqual([SETTINGS.music.x, SETTINGS.music.w, SETTINGS.music.h]);
  });
});

describe('the capture haptic reads Vibration (play.ts)', () => {
  const capture: SimEvent = { type: 'capture', towerId: 'e', by: 'player', from: 'enemy1' } as SimEvent;
  const fire = (save: SaveData): void => {
    const play = new PlayScreen(fakeApp(save), makeLevel(), 1, 1);
    (play as unknown as { onEvents(e: SimEvent[]): void }).onEvents([capture]);
  };

  beforeEach(() => {
    setSaveStorageForTests(null);
    haptic.calls = 0;
  });

  it('on by default, none while it is off', () => {
    const save = defaultSave();
    fire(save);
    expect(haptic.calls).toBe(1);
    save.settings.haptics = false;
    fire(save);
    expect(haptic.calls).toBe(1);
    save.settings.haptics = true;
    fire(save);
    expect(haptic.calls).toBe(2);
  });
});

describe('strings', () => {
  it('every language names both rows and their lines, translated', () => {
    const keys = ['settings.vibration', 'settings.vibrationSub', 'settings.vibrationWeb', 'settings.shake', 'settings.shakeSub', 'settings.shakeReduced'] as const;
    for (const d of [en, az, ru, tr]) for (const k of keys) expect(d[k], k).toBeTruthy();
    for (const k of keys) expect(new Set([en[k], az[k], ru[k], tr[k]]).size, k).toBe(4);
    expect(en['settings.vibration']).toBe('Vibration');
    expect(en['settings.vibrationWeb']).toBe('Phone only');
    expect(en['settings.shake']).toBe('Screen shake');
  });
});
