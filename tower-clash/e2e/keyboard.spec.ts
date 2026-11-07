import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { shotPath } from './tools/shots';

/*
 * AUD-U27 (2026-11-05): desktop keyboard focus on the menus (src/ui/focus.ts). On a desktop browser
 * (mouse, no touch, a landscape window) Tab walks a focus ring over the title's buttons in reading order,
 * Enter is a tap on the ringed one, the next screen opens with the ring on its first item, Escape stays
 * the screen's back, and a mouse press hides the ring. Chromium only. Nothing is imported from src/
 * (see smoke.spec.ts for why): the rects are mirrored below.
 */

test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

// src/render/layout.ts — TITLE.settings; src/render/menuLayout.ts — SETTINGS.back, SETTINGS.music
// (a landscape window letterboxes the 720 × 1280 frame by height: no safe-area bands, layout = logical)
const TITLE_SETTINGS = { x: 180, y: 776, w: 172, h: 64 };
const SETTINGS_BACK = { x: 18, y: 20, w: 140, h: 60 };
const SETTINGS_MUSIC = { x: 470, y: 200, w: 160, h: 56 };

type Rect = { x: number; y: number; w: number; h: number };
type FocusInfo = { shown: boolean; index: number; count: number; rect: Rect | null } | null;
type Win = Window & { __towerclash: { getScreen(): string; transitionDone(): boolean; getFocus(): FocusInfo; audio: { settings(): { effects: boolean; music: boolean } } } };

const screen = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.getScreen());
/** The ring's state after the current screen has painted a frame. */
const focus = (page: Page) => page.evaluate(() => new Promise<FocusInfo>((r) => requestAnimationFrame(() => r((window as unknown as Win).__towerclash.getFocus()))));
const music = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.audio.settings().music);
/** FEEL-1-6: keys sent during the title ↔ menu slide (≈ 120 ms after the screen changed) are not delivered — wait for it to settle. */
const settled = (page: Page) => page.waitForFunction(() => (window as unknown as Win).__towerclash.transitionDone(), null, { timeout: 15_000 });

/** Press Tab until the ring is on `target` (at most `max` presses); returns the presses it took. */
async function tabTo(page: Page, target: Rect, max = 20): Promise<number> {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    const f = await focus(page);
    if (f?.rect && f.rect.x === target.x && f.rect.y === target.y && f.rect.w === target.w && f.rect.h === target.h) return i;
  }
  throw new Error(`the ring never reached ${JSON.stringify(target)} in ${max} Tab presses (last: ${JSON.stringify(await focus(page))})`);
}

test('Tab from the title to Settings, Enter opens it, Tab + Enter toggles Music, Escape returns; a mouse press hides the ring', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto('/');
  await page.waitForFunction(() => typeof (window as unknown as Win).__towerclash?.getFocus === 'function');
  // the focus model rides the lazy menus chunk, warmed at idle after the first paint
  await expect.poll(() => focus(page)).not.toBeNull();
  expect(await focus(page)).toMatchObject({ shown: false, rect: null });

  // the title: the ring appears with the first Tab and walks the buttons in reading order to the gear
  const presses = await tabTo(page, TITLE_SETTINGS);
  expect(presses, 'language chip and PLAY come first').toBe(3);
  expect(await screen(page)).toBe('title');
  await page.screenshot({ path: shotPath('keyboard-title-focus'), scale: 'css' });

  await page.keyboard.press('Enter');
  await expect.poll(() => screen(page)).toBe('settings');
  await settled(page);
  // keyboard mode carries over: the settings screen opens with the ring on BACK
  await expect.poll(async () => (await focus(page))?.rect).toEqual(SETTINGS_BACK);

  expect(await tabTo(page, SETTINGS_MUSIC), 'BACK, then Music').toBe(1);
  const before = await music(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => music(page)).toBe(!before);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('towerclash.save.v3') ?? '{}').settings?.music);
  expect(saved, 'persisted like a tap').toBe(!before);
  await page.screenshot({ path: shotPath('keyboard-settings-focus'), scale: 'css' });

  await page.keyboard.press('Escape');
  await expect.poll(() => screen(page)).toBe('title');
  await settled(page);
  expect(await focus(page)).toMatchObject({ shown: true, index: 0 });

  // a mouse press hides the ring (on the sea right of the island: no button there)
  await page.mouse.click(1240, 400);
  expect(await focus(page)).toMatchObject({ shown: false, rect: null });
  expect(await screen(page)).toBe('title');
  // and with the ring hidden, Enter keeps the title's shortcut (PLAY → the level map)
  await page.keyboard.press('Enter');
  await expect.poll(() => screen(page)).toBe('levelSelect');
  expect(pageErrors).toEqual([]);
});
