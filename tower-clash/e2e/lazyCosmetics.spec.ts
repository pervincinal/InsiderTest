import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * PERF-4 lazy cosmetics (QA 2026-09-21). With a lazy roof material (roof_pagoda → the skinShapes
 * chunk), a silhouette skin (unit_robots → the same chunk), a cosmetic terrain theme (theme_neon →
 * the themes chunk) and sound on, level 1 plays 3 s of sim time with no `pageerror`, no console
 * error, each cosmetic chunk fetched exactly once (no draw-time retry loop) and the SFX recipes
 * chunk warmed by the time the first tap (PLAY on the title) has been handled.
 */

test.use({ serviceWorkers: 'block' });

const SAVE_KEY = 'towerclash.save.v3';
// src/render/layout.ts — TITLE.play
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const CHUNKS: Record<string, RegExp> = {
  skinShapes: /\/assets\/skinShapes-[^/?]*\.js(\?.*)?$/,
  themes: /\/assets\/themes-[^/?]*\.js(\?.*)?$/,
  sfxRecipes: /\/assets\/recipes-[^/?]*\.js(\?.*)?$/,
};
const EQUIPPED = { roof: 'roof_pagoda', helmet: 'unit_robots', theme: 'theme_neon' };

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);

test('lazy roof + theme + shape skin: 3 s of level 1 without errors, each cosmetic chunk once, SFX chunk warmed by the first tap', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${String(err)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  const fetched = new Map<string, string[]>();
  page.on('response', (r) => {
    for (const [name, re] of Object.entries(CHUNKS)) if (re.test(r.url()) && r.ok()) fetched.set(name, [...(fetched.get(name) ?? []), r.url()]);
  });
  const seeded = { version: 3, skins: { owned: Object.values(EQUIPPED), equipped: EQUIPPED }, settings: { sound: true } };
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  // the three equipped cosmetics survived normalisation (owned + equipped)
  expect((await page.evaluate(() => window.__towerclash.economy.getSave())).skins.equipped).toEqual(EQUIPPED);

  // first tap: PLAY on the title (pointer-down unlocks audio, the tap warms the SFX recipes chunk)
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [TITLE_PLAY.x + TITLE_PLAY.w / 2, TITLE_PLAY.y + TITLE_PLAY.h / 2] as const);
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => screen(page)).toBe('levelSelect');
  await expect.poll(() => fetched.get('sfxRecipes')?.length ?? 0, { message: 'SFX recipes chunk warmed after the first tap' }).toBeGreaterThanOrEqual(1);

  expect(await page.evaluate(() => window.__towerclash.loadLevel(1, 1))).toBe(true);
  await expect.poll(() => screen(page)).toBe('play');
  await expect.poll(() => simTime(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(3_000);
  await expect.poll(() => fetched.get('skinShapes')?.length ?? 0, { message: 'roof material + silhouette skin chunk landed' }).toBe(1);
  await expect.poll(() => fetched.get('themes')?.length ?? 0, { message: 'terrain theme chunk landed' }).toBe(1);
  // still playing, still drawing, nothing thrown; no chunk was re-fetched under `?r=` (that only happens after a failure)
  expect(await screen(page)).toBe('play');
  for (const [name, urls] of fetched) expect(urls, name).toHaveLength(1);
  for (const urls of fetched.values()) expect(urls[0]).not.toContain('?r=');
  expect(errors).toEqual([]);
});
