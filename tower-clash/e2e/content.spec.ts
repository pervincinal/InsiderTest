import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Content check: every authored level in src/levels/*.json must load in the real browser build
 * through the debug surface (`window.__towerclash.loadLevel(id)`), land on the play screen with the
 * right levelId, tick the sim forward, and produce no console errors / uncaught exceptions.
 * Screenshots are taken for a fixed set of milestone ids (1, the first obstacle lesson 5, and the last
 * level of every band: 8, 16, 24, 32, 40, 50) when they exist, so new content from the Level Designer
 * is picked up automatically and missing ids are skipped. Rules v3 (GDD §2.0b): the set must show
 * every obstacle kind — a wall, a water band and a rock — so the terrain drawing is eyeballed on
 * every kind.
 *
 * Levels are discovered from the filesystem (not imported from src/) for the same reason as
 * smoke.spec.ts: Node's native TS loader cannot import the JSON-backed level index.
 */

interface LevelJson {
  id: number;
  name: string;
  towers: { id: string; owner: string }[];
  obstacles?: { kind: string }[];
}

const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL_FILES = readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{3}-.*\.json$/.test(f))
  .sort();
const LEVELS: LevelJson[] = LEVEL_FILES.map((f) => JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as LevelJson);
const SCREENSHOT_IDS = [1, 5, 8, 16, 24, 32, 40, 50];
const OBSTACLE_KINDS = ['wall', 'water', 'rock'] as const;

const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}content-${name}.png`, scale: 'css' });

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const levelId = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.levelId ?? -1);

test.describe('Tower Clash content: every authored level loads', () => {
  test('level files are discoverable', () => {
    expect(LEVELS.length, 'at least the 15 sprint-1 levels are authored').toBeGreaterThanOrEqual(15);
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size, 'level ids are unique').toBe(ids.length);
    // file prefix and json id must agree, otherwise the level index and the level select disagree
    LEVEL_FILES.forEach((file, i) => expect(Number(file.slice(0, 3)), file).toBe(LEVELS[i]!.id));
  });

  for (const level of LEVELS) {
    test(`level ${String(level.id).padStart(2, '0')} "${level.name}" loads, ticks, no errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => pageErrors.push(String(err)));

      await page.goto('/');
      await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
      expect(await screen(page)).toBe('title');

      const loaded = await page.evaluate((id) => window.__towerclash.loadLevel(id), level.id);
      expect(loaded, `loadLevel(${level.id}) must find the level in the built index`).toBe(true);
      await expect.poll(() => screen(page)).toBe('play');
      expect(await levelId(page)).toBe(level.id);

      // the sim is ticking (not paused, not stuck at 0)
      const t0 = await simTime(page);
      expect(t0).toBeGreaterThanOrEqual(0);
      await expect.poll(() => simTime(page), { message: 'sim time must advance' }).toBeGreaterThan(t0);

      // the built state mirrors the authored towers (ids and initial owners)
      const towers = await page.evaluate(() => {
        const s = window.__towerclash.getState();
        return s ? Object.values(s.towers).map((t) => ({ id: t.id, owner: t.owner })) : [];
      });
      expect(towers.map((t) => t.id).sort()).toEqual(level.towers.map((t) => t.id).sort());
      for (const authored of level.towers) {
        expect(towers.find((t) => t.id === authored.id)?.owner, `tower ${authored.id} owner`).toBe(authored.owner);
      }

      if (SCREENSHOT_IDS.includes(level.id)) {
        await page.waitForTimeout(400); // let the map settle and a few frames render
        await shot(page, `level-${String(level.id).padStart(2, '0')}`);
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('screenshot milestones show every obstacle kind (wall, water, rock)', () => {
    const shot = LEVELS.filter((l) => SCREENSHOT_IDS.includes(l.id));
    const kinds = new Set(shot.flatMap((l) => (l.obstacles ?? []).map((o) => o.kind)));
    test.info().annotations.push({ type: 'obstacle-kinds', description: shot.map((l) => `${l.id}: ${[...new Set((l.obstacles ?? []).map((o) => o.kind))].join('+') || '-'}`).join(', ') });
    for (const kind of OBSTACLE_KINDS) expect([...kinds], `a screenshot level with a ${kind}`).toContain(kind);
  });

  test('screenshot milestones that do not exist yet are reported, not failed', () => {
    const ids = new Set(LEVELS.map((l) => l.id));
    const missing = SCREENSHOT_IDS.filter((id) => !ids.has(id));
    // informational only: the Level Designer is still authoring the next band (41–50 as of 2026-09-20)
    test.info().annotations.push({ type: 'missing-screenshot-levels', description: missing.join(', ') || 'none' });
    expect(SCREENSHOT_IDS.filter((id) => ids.has(id))).toContain(1);
  });
});
