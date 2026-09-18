import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * LV-5 / launch checklist R1: the first-play tutorial of levels 1–3 (src/ui/tutorial.ts, rules v2)
 * driven by real touch taps on a fresh save:
 *   level 1  "tap your tower" → "tap the grey tower" → stream started
 *   level 2  "tap your tower, then the grey tower" → (gated on the link) "tap the target again to
 *            stop the stream" → cleared by the unlink
 *   level 3  "let a tower fill to 25" → cleared when a player tower auto-upgrades to L2, after which
 *            the L2 tower may run two streams
 * and: a cleared level (≥ 1 star) shows no tutorial on replay.
 *
 * Every run is `loadLevel(id, SEED)` so the sim is reproducible; the only wall-clock-dependent part is
 * when a tap lands, and every assertion is an immediate consequence of that tap (or of the sim alone
 * for the level-3 fill). Hint texts are read through `getText(key)` (src/ui/locales/en.ts) — never the
 * level's lesson text (src/levels/*.json), which the Level Designer owns. Level JSON is only used for
 * tower coordinates. Nothing is imported from src/ (see smoke.spec.ts for why).
 */

const SEED = 1;
/** src/sim/constants.ts — CAPACITY[1] (the `{n}` of tutorial.fillToUpgrade). */
const L1_CAPACITY = 25;
const HINT_KEYS = ['tutorial.tapTower', 'tutorial.tapGrey', 'tutorial.tapThenGrey', 'tutorial.stopStream', 'tutorial.fillToUpgrade'] as const;

interface LevelJson {
  id: number;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVELS = new Map<number, LevelJson>();
for (const f of readdirSync(LEVELS_DIR).filter((f) => /^\d{3}-.*\.json$/.test(f))) {
  const level = JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as LevelJson;
  LEVELS.set(level.id, level);
}
function towerAt(levelId: number, towerId: string): { x: number; y: number } {
  const tower = LEVELS.get(levelId)?.towers.find((t) => t.id === towerId);
  if (!tower) throw new Error(`level ${levelId} has no tower "${towerId}" (src/levels/*.json)`);
  return { x: tower.x, y: tower.y };
}

/** Touch-tap a logical (720×1280) point — a real touchstart/touchend (the chromium project is a Pixel 5 with hasTouch). */
async function tap(page: Page, p: { x: number; y: number }): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [p.x, p.y] as const);
  await page.touchscreen.tap(c.x, c.y);
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const hint = (page: Page) => page.evaluate(() => window.__towerclash.getTutorialHint());
const limitHint = (page: Page) => page.evaluate(() => window.__towerclash.getLimitHint());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
const playerLinks = (page: Page) =>
  page.evaluate(() =>
    (window.__towerclash.getState()?.links ?? []).filter((l) => l.owner === 'player').map((l) => ({ from: l.from, to: l.to })),
  );
const tower = (page: Page, id: string) =>
  page.evaluate((tid) => {
    const t = window.__towerclash.getState()?.towers[tid];
    return t ? { owner: t.owner, level: t.level, units: t.units } : null;
  }, id);
const playerMaxLevel = (page: Page) =>
  page.evaluate(() =>
    Object.values(window.__towerclash.getState()?.towers ?? {})
      .filter((t) => t.owner === 'player')
      .reduce((m, t) => Math.max(m, t.level), 0),
  );
const stars = (page: Page, id: number) => page.evaluate((lid) => window.__towerclash.economy.getSave().stars[String(lid)] ?? 0, id);

/** Load a level with the fixed seed and wait until it is really running (sim time advancing). */
async function startLevel(page: Page, id: number): Promise<void> {
  expect(await page.evaluate(([lid, seed]) => window.__towerclash.loadLevel(lid, seed), [id, SEED] as const), `loadLevel(${id})`).toBe(true);
  await expect.poll(() => screen(page)).toBe('play');
  expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(id);
  await expect.poll(() => simTime(page), { message: `level ${id} sim should tick` }).toBeGreaterThan(0);
}

/** Fresh save (new context = empty localStorage) → title → debug surface up; returns the page-error sink. */
async function boot(page: Page): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.getTutorialHint === 'function');
  expect(await screen(page)).toBe('title');
  expect(await page.evaluate(() => Object.keys(window.__towerclash.economy.getSave().stars)), 'fresh save: no stars').toEqual([]);
  return pageErrors;
}

/** The English hint texts, from the running page (src/ui/locales/en.ts); each key must resolve. */
async function hintTexts(page: Page): Promise<Record<(typeof HINT_KEYS)[number], string>> {
  expect(await page.evaluate(() => window.__towerclash.getLanguage())).toBe('en');
  const out = {} as Record<(typeof HINT_KEYS)[number], string>;
  for (const key of HINT_KEYS) {
    const s = await text(page, key);
    expect(s, `${key} must be translated`).not.toBe(key);
    expect(s.length).toBeGreaterThan(0);
    out[key] = key === 'tutorial.fillToUpgrade' ? s.replaceAll('{n}', String(L1_CAPACITY)) : s;
  }
  return out;
}

test.describe('tutorial levels 1–3 (LV-5 / checklist R1)', () => {
  test('fresh save: every hint of levels 1, 2 and 3 appears and completes in order by touch', async ({ page }) => {
    const pageErrors = await boot(page);
    const T = await hintTexts(page);

    // ---- level 1: tap your tower → tap the grey tower → a stream runs ----
    await startLevel(page, 1);
    await expect.poll(() => hint(page), { message: 'level 1 opens on step 1' }).toBe(T['tutorial.tapTower']);
    await tap(page, towerAt(1, 'foe')); // an enemy tower is not "your tower": step 1 stays
    await page.waitForTimeout(150);
    expect(await hint(page)).toBe(T['tutorial.tapTower']);
    await tap(page, towerAt(1, 'home'));
    await expect.poll(() => hint(page), { message: 'selecting home completes step 1' }).toBe(T['tutorial.tapGrey']);
    await tap(page, towerAt(1, 'camp'));
    await expect.poll(() => hint(page), { message: 'the home→camp link completes step 2 (tutorial over)' }).toBeNull();
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'camp' }]);
    await page.waitForTimeout(200);
    expect(await hint(page), 'level 1 has no further step').toBeNull();

    // ---- level 2: tap-then-grey → (gated) stop the stream → cleared by the unlink ----
    await startLevel(page, 2);
    await expect.poll(() => hint(page), { message: 'level 2 opens on its first step' }).toBe(T['tutorial.tapThenGrey']);
    await tap(page, towerAt(2, 'home'));
    await page.waitForTimeout(150);
    expect(await hint(page), 'selecting home alone does not complete the link step').toBe(T['tutorial.tapThenGrey']);
    expect(await playerLinks(page)).toEqual([]);
    await tap(page, towerAt(2, 'mid'));
    await expect.poll(() => hint(page), { message: '"stop the stream" shows once the home→mid link exists' }).toBe(T['tutorial.stopStream']);
    expect(await playerLinks(page)).toEqual([{ from: 'home', to: 'mid' }]);
    await tap(page, towerAt(2, 'mid')); // home is still selected: the second tap on the target unlinks
    await expect.poll(() => hint(page), { message: 'the unlink completes the stop step (tutorial over)' }).toBeNull();
    await expect.poll(() => playerLinks(page)).toEqual([]);
    await page.waitForTimeout(200);
    expect(await hint(page), 'level 2 has no further step').toBeNull();

    // ---- level 3: fill to 25 → auto-upgrade to L2 → the L2 tower runs two streams ----
    await startLevel(page, 3);
    await expect.poll(() => hint(page), { message: 'level 3 opens on the fill-to-upgrade step, {n} = 25' }).toBe(T['tutorial.fillToUpgrade']);
    expect(T['tutorial.fillToUpgrade']).toContain(String(L1_CAPACITY));
    expect(await playerMaxLevel(page), 'no player tower is L2 yet').toBe(1);
    // home starts at 12 and produces one unit per second: 13 s of sim time to reach 25 (x10 → ~1.3 s)
    await page.evaluate(() => window.__towerclash.setSpeed(10));
    await expect.poll(() => hint(page), { message: 'the step completes when a player tower reaches L2', timeout: 20_000 }).toBeNull();
    expect(await playerMaxLevel(page), 'a player tower auto-upgraded to L2').toBeGreaterThanOrEqual(2);
    expect(await simTime(page), 'the fill takes about 13 s of sim time').toBeGreaterThanOrEqual(13_000);
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    await expect.poll(() => page.evaluate(() => window.__towerclash.getSpeed())).toBe(1);
    // the lesson in practice: L2 home may stream to both neutrals at once (L1 would refuse the second)
    const home3 = await tower(page, 'home');
    expect(home3).toMatchObject({ owner: 'player', level: 2 });
    await tap(page, towerAt(3, 'home'));
    await tap(page, towerAt(3, 'west'));
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'west' }]);
    await tap(page, towerAt(3, 'east'));
    await expect.poll(() => playerLinks(page), { message: 'an L2 tower runs two streams' }).toEqual([
      { from: 'home', to: 'west' },
      { from: 'home', to: 'east' },
    ]);
    expect(await limitHint(page), 'no link-limit refusal at L2 with two streams').toBeNull();
    expect(await hint(page), 'level 3 has no further step').toBeNull();

    expect(pageErrors).toEqual([]);
  });

  test('a cleared level shows no tutorial on replay; an uncleared one still does', async ({ page }) => {
    const pageErrors = await boot(page);
    const T = await hintTexts(page);

    // clear level 1 with the reference player (seed 1 is a verified win — `npm run playtest`)
    await startLevel(page, 1);
    expect(await hint(page), 'first play: tutorial on').toBe(T['tutorial.tapTower']);
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
    expect(await stars(page, 1)).toBeGreaterThanOrEqual(1);

    // replay level 1: it runs, but no hint at any point of the opening
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    await startLevel(page, 1);
    expect(await hint(page), 'cleared level: no tutorial').toBeNull();
    await tap(page, towerAt(1, 'home')); // the actions that used to drive the steps change nothing
    await tap(page, towerAt(1, 'camp'));
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'camp' }]);
    await page.waitForTimeout(300);
    expect(await hint(page), 'cleared level: still no tutorial after the tutorial actions').toBeNull();

    // level 2 has no star yet, so its tutorial is still on
    expect(await stars(page, 2)).toBe(0);
    await startLevel(page, 2);
    await expect.poll(() => hint(page)).toBe(T['tutorial.tapThenGrey']);

    expect(pageErrors).toEqual([]);
  });
});
