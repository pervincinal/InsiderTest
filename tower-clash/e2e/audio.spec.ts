import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { tapRect } from './helpers/tap';

/*
 * AUD-F6 mixer + music on a real Chromium AudioContext, read through the debug surface
 * (`window.__towerclash.audio`, src/debug.ts): nothing before the first gesture; the first tap on the
 * title builds master → limiter with the SFX / UI / music buses and starts the lazy music chunk;
 * Settings → Music / Effects move only their own bus gains and persist; a hidden page stops the
 * loop; the title speaker silences both. Like smoke.spec.ts this file imports nothing from src/:
 * the hit regions mirror src/render/layout.ts / menuLayout.ts and the levels src/audio/mixer.ts.
 */

const SAVE_KEY = 'towerclash.save.v3';
// src/render/layout.ts — TITLE.settings, TITLE.sound; src/render/menuLayout.ts — SETTINGS.back, SETTINGS.music, SETTINGS.sound (Effects)
const TITLE_SETTINGS = { x: 180, y: 776, w: 172, h: 64 };
const TITLE_SOUND = { x: 368, y: 776, w: 172, h: 64 };
const SETTINGS_BACK = { x: 18, y: 20, w: 140, h: 60 };
const SETTINGS_MUSIC = { x: 470, y: 200, w: 160, h: 56 };
const SETTINGS_EFFECTS = { x: 470, y: 296, w: 160, h: 56 };
// src/audio/mixer.ts — master 0.5, BUS_DB { sfx: 0, ui: 0, music: −10 }, LIMITER { thresholdDb: −6, ratio: 20 }
const MUSIC_GAIN = Math.pow(10, -10 / 20);

interface Buses {
  master: number;
  sfx: number;
  ui: number;
  music: number;
  duck: number;
  limiter: { thresholdDb: number; ratio: number } | null;
}
interface AudioDebug {
  getBuses(): Buses | null;
  getMusic(): { playing: boolean; step: number; pulse: boolean };
  settings(): { effects: boolean; music: boolean };
}

const buses = (page: Page) => page.evaluate(() => (window.__towerclash as unknown as { audio: AudioDebug }).audio.getBuses());
const music = (page: Page) => page.evaluate(() => (window.__towerclash as unknown as { audio: AudioDebug }).audio.getMusic());
const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const saved = (page: Page) =>
  page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: { sound?: boolean; music?: boolean } }).settings ?? {}, SAVE_KEY);
const near = (v: number | undefined, want: number) => v !== undefined && Math.abs(v - want) < 1e-3;

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.describe('AUD-F6 audio buses + music', () => {
  test('first gesture builds the mixer and starts the music; Music / Effects move their own buses; hidden page and the speaker stop it', async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const chunks: string[] = [];
    page.on('request', (r) => {
      const m = /\/assets\/(music|mixer|recipes)-[\w-]+\.js/.exec(r.url());
      if (m) chunks.push(m[1]!);
    });
    await page.goto('/');
    await page.waitForFunction(() => typeof (window.__towerclash as unknown as { audio?: unknown } | undefined)?.audio === 'object');
    await expect.poll(() => screen(page)).toBe('title');
    expect(await buses(page), 'no mixer before the first gesture').toBeNull();
    expect((await music(page)).playing).toBe(false);
    expect(chunks, 'the music chunk waits for the first gesture').not.toContain('music');

    // first gesture: the tap that opens Settings unlocks audio, builds the mixer and starts the loop
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await expect.poll(async () => (await music(page)).playing, { message: 'music starts on the first gesture' }).toBe(true);
    expect(chunks).toContain('music');
    expect(chunks.filter((c) => c === 'music')).toHaveLength(1);
    const on = (await buses(page))!;
    expect(on).toMatchObject({ master: 0.5, sfx: 1, ui: 1, duck: 1, limiter: { thresholdDb: -6, ratio: 20 } });
    expect(near(on.music, MUSIC_GAIN), `music bus ${on.music}`).toBe(true);
    // the loop advances on the audio clock
    const step0 = (await music(page)).step;
    await expect.poll(async () => (await music(page)).step).toBeGreaterThan(step0);
    await page.screenshot({ path: info.outputPath('aud-f6-settings.png'), scale: 'css' });

    // Music off: only the music bus, persisted; the loop stops
    await tapRect(page, SETTINGS_MUSIC);
    await expect.poll(async () => (await saved(page)).music).toBe(false);
    await expect.poll(async () => (await buses(page))?.music).toBe(0);
    expect(await buses(page)).toMatchObject({ sfx: 1, ui: 1 });
    expect((await music(page)).playing).toBe(false);
    await page.screenshot({ path: info.outputPath('aud-f6-settings-music-off.png'), scale: 'css' });

    // Effects off: SFX + UI to 0, persisted in settings.sound; Music stays off
    await tapRect(page, SETTINGS_EFFECTS);
    await expect.poll(async () => (await saved(page)).sound).toBe(false);
    await expect.poll(async () => (await buses(page))?.sfx).toBe(0);
    expect(await buses(page)).toMatchObject({ ui: 0, music: 0 });

    // Music on again while Effects stay off: the loop restarts, the effects buses stay silent
    await tapRect(page, SETTINGS_MUSIC);
    await expect.poll(async () => (await music(page)).playing).toBe(true);
    expect(near((await buses(page))?.music, MUSIC_GAIN)).toBe(true);
    expect(await buses(page)).toMatchObject({ sfx: 0, ui: 0 });
    expect(await saved(page)).toMatchObject({ sound: false, music: true });
    await tapRect(page, SETTINGS_EFFECTS);
    await expect.poll(async () => (await buses(page))?.sfx).toBe(1);

    // a hidden page stops the loop; visible again restarts it
    await setHidden(page, true);
    await expect.poll(async () => (await music(page)).playing).toBe(false);
    await setHidden(page, false);
    await expect.poll(async () => (await music(page)).playing).toBe(true);

    // the title speaker silences both, then brings both back
    await tapRect(page, SETTINGS_BACK);
    await expect.poll(() => screen(page)).toBe('title');
    await tapRect(page, TITLE_SOUND);
    await expect.poll(async () => (await buses(page))?.music).toBe(0);
    expect(await buses(page)).toMatchObject({ sfx: 0, ui: 0, master: 0.5 });
    expect(await saved(page)).toMatchObject({ sound: false, music: false });
    expect((await music(page)).playing).toBe(false);
    await tapRect(page, TITLE_SOUND);
    await expect.poll(async () => (await music(page)).playing).toBe(true);
    expect(await buses(page)).toMatchObject({ sfx: 1, ui: 1 });
    expect(await saved(page)).toMatchObject({ sound: true, music: true });

    expect(errors).toEqual([]);
  });
});
