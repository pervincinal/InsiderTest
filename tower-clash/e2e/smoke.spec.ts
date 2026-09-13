import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Smoke: title → level select → play level 1 (manual send) → reference player wins → result →
 * next level → save persisted. Everything is canvas-drawn, so the test taps logical (720×1280)
 * coordinates converted with `window.__towerclash.toClient` and reads state via the debug surface.
 *
 * The spec deliberately imports nothing from src/: Node 22 strips types natively for ESM `.ts`
 * imports (parameter properties and JSON imports then fail to load), so the few hit regions it
 * needs are mirrored here with a pointer to their source of truth. If one of these drifts the
 * corresponding tap will miss and the poll below will say which screen we are stuck on.
 */

// src/ui/screens.ts
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const GRID = { cols: 3, card: 200, gap: 20, top: 250 };
function levelCardRect(index: number): { x: number; y: number; w: number; h: number } {
  const left = (720 - GRID.cols * GRID.card - (GRID.cols - 1) * GRID.gap) / 2;
  const col = index % GRID.cols;
  const row = Math.floor(index / GRID.cols);
  return { x: left + col * (GRID.card + GRID.gap), y: GRID.top + row * (GRID.card + GRID.gap), w: GRID.card, h: GRID.card };
}
// src/render/layout.ts
const HUD = { mapTop: 96, mapBottom: 1180 };
const RESULT = { next: { x: 84, y: 780, w: 170, h: 72 } };
// src/ui/save.ts
const SAVE_KEY = 'towerclash.save.v1';

interface LevelJson {
  id: number;
  star3: number;
  star2: number;
  towers: { id: string; x: number; y: number; owner: string }[];
}
const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL_FILES = readdirSync(LEVELS_DIR).filter((f) => /^\d{3}-.*\.json$/.test(f)).sort();
const readLevel = (file: string): LevelJson => JSON.parse(readFileSync(new URL(file, LEVELS_DIR), 'utf8')) as LevelJson;

const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}smoke-${name}.png`, scale: 'css' });

/** Tap the centre of a logical rectangle. */
async function tapRect(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<void> {
  await tapAt(page, r.x + r.w / 2, r.y + r.h / 2);
}

/** Tap a logical (720×1280) point. */
async function tapAt(page: Page, lx: number, ly: number): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [lx, ly] as const);
  await page.mouse.click(c.x, c.y);
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const towerUnits = (page: Page, id: string) =>
  page.evaluate((tid) => window.__towerclash.getState()?.towers[tid]?.units ?? -1, id);
const readSave = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { stars: Record<string, number>; coins: number }) : null;
  }, SAVE_KEY);

/** Stars by clear time, mirrors src/ui/save.ts starsFor (GDD §2.4). */
function expectedStars(level: { star3: number; star2: number }, timeMs: number): number {
  return timeMs <= level.star3 ? 3 : timeMs <= level.star2 ? 2 : 1;
}

test.describe('Tower Clash smoke', () => {
  test('title → level select → play level 1 → win → result → next level', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    // (a) title renders and the debug surface is up.
    await page.goto('/');
    await expect(page).toHaveTitle('Tower Clash');
    await expect(page.locator('canvas#game')).toBeVisible();
    await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');
    expect(await screen(page)).toBe('title');
    expect(await page.evaluate(() => window.__towerclash.aiAvailable)).toBe(true);
    // canvas is sized to the viewport (no zero-size canvas / broken resize)
    const box = await page.locator('canvas#game').boundingBox();
    expect(box?.width).toBeGreaterThan(300);
    expect(box?.height).toBeGreaterThan(600);
    // let the title frame animate once before shooting it
    await page.waitForTimeout(250);
    await shot(page, 'title');

    // (b) PLAY → level select shows the 5 authored levels.
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(LEVEL_FILES).toHaveLength(5);
    // every card fits inside the logical map without scrolling at 5 levels
    for (let i = 0; i < LEVEL_FILES.length; i++) {
      const r = levelCardRect(i);
      expect(r.y + r.h).toBeLessThanOrEqual(1280);
      expect(r.x + r.w).toBeLessThanOrEqual(720);
    }
    await shot(page, 'levelselect');

    // (c) tap level 1 → play screen, sim time advances.
    await tapRect(page, levelCardRect(0));
    await expect.poll(() => screen(page)).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(1);
    const t0 = await simTime(page);
    expect(t0).toBeGreaterThanOrEqual(0);
    await expect.poll(() => simTime(page)).toBeGreaterThan(t0);

    // Manual send: tap the player tower ("home") then the neutral tower ("camp") — level 1's lesson.
    const level1 = readLevel(LEVEL_FILES[0]!);
    expect(level1.id).toBe(1);
    const home = level1.towers.find((t) => t.id === 'home')!;
    const camp = level1.towers.find((t) => t.id === 'camp')!;
    expect(home.y).toBeGreaterThan(HUD.mapTop);
    expect(home.y).toBeLessThan(HUD.mapBottom);
    const garrisonBefore = await towerUnits(page, 'home');
    expect(garrisonBefore).toBeGreaterThan(0);
    await tapAt(page, home.x, home.y);
    await tapAt(page, camp.x, camp.y);
    await expect.poll(() => towerUnits(page, 'home'), { message: 'home garrison should drop after send' }).toBeLessThan(
      garrisonBefore,
    );
    await expect
      .poll(() => page.evaluate(() => window.__towerclash.getState()?.units.length ?? 0), {
        message: 'units should be marching on the road',
      })
      .toBeGreaterThan(0);
    await shot(page, 'play');

    // (d) reference player at ×10 wins within 60 s wall-clock.
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    const finalState = await page.evaluate(() => window.__towerclash.getState());
    expect(finalState).not.toBeNull();
    const enemyOwned = Object.values(finalState!.towers).filter((t) => t.owner.startsWith('enemy'));
    expect(enemyOwned, 'player must own or neutralise every enemy tower').toHaveLength(0);
    const stars = expectedStars(level1, finalState!.time);
    expect(stars).toBeGreaterThanOrEqual(1);
    const saveAfterWin = await readSave(page);
    expect(saveAfterWin?.stars['1']).toBe(stars);
    await page.waitForTimeout(250); // let capture effects fade so the shot shows the overlay
    await shot(page, 'result');

    // (e) NEXT → level 2 starts playing at normal speed.
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    await tapRect(page, RESULT.next);
    await expect.poll(() => screen(page)).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getState()?.levelId)).toBe(2);

    // (f) save survives: stars for level 1 persisted in localStorage, coins earned.
    const save = await readSave(page);
    expect(save).not.toBeNull();
    expect(save!.stars['1']).toBeGreaterThanOrEqual(1);
    expect(save!.stars['1']).toBe(stars);
    expect(save!.coins).toBeGreaterThan(0);

    // whole flow must be free of console errors and uncaught exceptions
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
