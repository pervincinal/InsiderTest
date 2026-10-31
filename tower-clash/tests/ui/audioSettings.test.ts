import { beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SETTINGS } from '../../src/render/menuLayout';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, normalizeSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { SettingsScreen } from '../../src/ui/settings';
import { effectsOn, initAudio, isMuted, musicOn, toggleMuted } from '../../src/audio/index';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { FakeAudioContext } from '../audio/fakeAudio';

/*
 * AUD-F6: Settings → Sound split into Music and Effects (both default on). `settings.sound` stays the
 * Effects flag; `settings.music` is optional (absent = `sound`), so a pre-split save with Sound off
 * starts with both off; a non-boolean is dropped on load, as `textScale` (AUD-U2) is.
 */

const loaded = (settings: Record<string, unknown>): SaveData['settings'] => normalizeSave({ version: 3, settings }).settings;

describe('save migration (normalizeSave)', () => {
  it('a fresh save has no `music` field: Music follows Sound (on)', () => {
    expect(defaultSave().settings).toEqual({ colorBlind: false, sound: true, reducedMotion: 'auto' });
  });

  it('keeps a boolean `music`, drops anything else, never invents one', () => {
    expect(loaded({ sound: true, music: false })).toMatchObject({ sound: true, music: false });
    expect(loaded({ sound: false, music: true })).toMatchObject({ sound: false, music: true });
    for (const bad of ['on', 1, null, {}]) expect(loaded({ sound: true, music: bad }), String(bad)).not.toHaveProperty('music');
    expect(loaded({ sound: false })).not.toHaveProperty('music');
  });

  it('the audio facade reads an absent `music` as `sound`: old Sound off → both off, old Sound on → both on', () => {
    for (const sound of [false, true]) {
      initAudio(normalizeSave({ version: 3, settings: { sound } }), { factory: () => new FakeAudioContext(), persist: () => undefined });
      expect([effectsOn(), musicOn()], `sound ${sound}`).toEqual([sound, sound]);
    }
    initAudio(normalizeSave({ version: 3, settings: { sound: true, music: false } }), { factory: () => new FakeAudioContext(), persist: () => undefined });
    expect([effectsOn(), musicOn()]).toEqual([true, false]);
  });
});

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
    dayKey: () => '2026-10-31',
    weekKey: () => '2026-10-27',
  };
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, timeMs: 0 });

describe('Settings → Music / Effects rows', () => {
  let save: SaveData;
  let writes: SaveData['settings'][];
  let screen: SettingsScreen;
  const tap = (r: Rect): void => {
    screen.down(centre(r));
    screen.up(centre(r));
  };

  beforeEach(() => {
    setSaveStorageForTests(null);
    save = defaultSave();
    writes = [];
    initAudio(save, { factory: () => new FakeAudioContext(), persist: (s) => writes.push({ ...s.settings }) });
    screen = new SettingsScreen(fakeApp(save), () => {});
  });

  it('Music toggles only the music; Effects only the effects; each persists both flags', () => {
    tap(SETTINGS.music);
    expect([effectsOn(), musicOn()]).toEqual([true, false]);
    expect(writes.at(-1)).toMatchObject({ sound: true, music: false });
    tap(SETTINGS.sound);
    expect([effectsOn(), musicOn()]).toEqual([false, false]);
    expect(writes.at(-1)).toMatchObject({ sound: false, music: false });
    expect(isMuted()).toBe(true);
    tap(SETTINGS.music);
    expect([effectsOn(), musicOn()]).toEqual([false, true]);
    expect(save.settings).toMatchObject({ sound: false, music: true });
    expect(writes).toHaveLength(3);
  });

  it('the title / HUD speaker (toggleMuted) silences both and brings both back', () => {
    tap(SETTINGS.music); // music off, effects on
    toggleMuted();
    expect(save.settings).toMatchObject({ sound: false, music: false });
    toggleMuted();
    expect(save.settings).toMatchObject({ sound: true, music: true });
  });

  it('Music is the first row, Effects the next, one row pitch apart', () => {
    expect(SETTINGS.music).toEqual({ x: 470, y: 200, w: 160, h: 56 });
    expect(SETTINGS.sound).toEqual({ x: 470, y: 296, w: 160, h: 56 });
    expect(SETTINGS.sound.y - SETTINGS.music.y).toBe(SETTINGS.rowH);
  });
});

describe('strings', () => {
  it('every language names both rows and the music line, translated', () => {
    for (const d of [en, az, ru, tr]) for (const k of ['settings.music', 'settings.musicSub', 'settings.effects'] as const) expect(d[k], k).toBeTruthy();
    for (const k of ['settings.music', 'settings.effects'] as const) expect(new Set([en[k], az[k], ru[k], tr[k]]).size, k).toBe(4);
    expect(en['settings.music']).toBe('Music');
    expect(en['settings.effects']).toBe('Effects');
  });
});
