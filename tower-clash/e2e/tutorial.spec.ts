import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * LV-5 / launch checklist R1: the first-play tutorial of levels 1–4 (src/ui/tutorial.ts, GD-5a/b)
 * driven by real touch taps on a fresh save:
 *   level 1  "tap your tower" → "tap the grey tower" → stream started
 *   level 2  side first: "tap your tower, then the grey tower" (side) → (gated on the capture) "now tap
 *            the new tower, then the red one" (side → foe) → "swipe across the stream so your tower
 *            grows" (home → side; here the second tap on the target, the swipe-cut is driven in
 *            swipe.spec.ts) → no supply-line step on that line. Mid first: the supply-line step comes
 *            up on mid once it is full and streams onward, and a relay link into it clears it.
 *   level 3  take both greys: home → east, then (gated on the capture) "now take the other grey tower
 *            too" pointing at west → cleared by the link into it
 *   level 4  stop → fill → L2: (gated on the outpost capture) "stop this tower's stream so it can grow"
 *            → cleared by the unlink → "at 25 it levels up" → cleared when home auto-upgrades to L2,
 *            after which it runs two streams
 * and: a cleared level (≥ 1 star) shows no tutorial on replay.
 *
 * Every run is `loadLevel(id, SEED)` so the sim is reproducible; the only wall-clock-dependent part is
 * when a tap lands, and every assertion is an immediate consequence of that tap or of the sim alone
 * (a capture, the level-4 fill, mid filling up on the mid-first line; waits run the sim at ×3–×10).
 * Hint texts are read through `getText(key)` (src/ui/locales/en.ts) — never the
 * level's lesson text (src/levels/*.json), which the Level Designer owns. Level JSON is only used for
 * tower coordinates. Nothing is imported from src/ (see smoke.spec.ts for why).
 */

const SEED = 1;
/** src/sim/constants.ts — CAPACITY[1] (the `{n}` of tutorial.fillToUpgrade). */
const L1_CAPACITY = 25;
const HINT_KEYS = [
  'tutorial.tapTower',
  'tutorial.tapGrey',
  'tutorial.tapThenGrey',
  'tutorial.goAround',
  'tutorial.stopStream',
  'tutorial.supplyLine',
  'tutorial.grabOther',
  'tutorial.stopToGrow',
  'tutorial.fillToUpgrade',
] as const;
/** Empty ground on levels 2–4 (no tower within 150 px): a tap there deselects. */
const EMPTY = { x: 150, y: 560 };

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
/** The hint and a tower's owner read in one frame (no capture can land between the two reads). */
const hintAndOwner = (page: Page, id: string) =>
  page.evaluate((tid) => ({ hint: window.__towerclash.getTutorialHint(), owner: window.__towerclash.getState()?.towers[tid]?.owner ?? null }), id);
const relayLinks = (page: Page) =>
  page.evaluate(() =>
    (window.__towerclash.getState()?.links ?? []).filter((l) => l.owner === 'player' && l.relay).map((l) => ({ from: l.from, to: l.to })),
  );
const setSpeed = async (page: Page, n: number): Promise<void> => {
  await page.evaluate((s) => window.__towerclash.setSpeed(s), n);
  await expect.poll(() => page.evaluate(() => window.__towerclash.getSpeed())).toBe(n);
};

/**
 * Until `id` is the player's, every sample must show no hint (or `allowed`): a gated step stays hidden
 * before the capture. Runs the sim at ×`speed` meanwhile and returns to ×1.
 */
async function waitForCapture(page: Page, id: string, speed: number, allowed: string | null = null): Promise<void> {
  await setSpeed(page, speed);
  const seen = new Set<string | null>();
  await expect
    .poll(
      async () => {
        const s = await hintAndOwner(page, id);
        if (s.owner !== 'player') seen.add(s.hint);
        return s.owner;
      },
      { message: `${id} is captured`, timeout: 30_000, intervals: [100] },
    )
    .toBe('player');
  await setSpeed(page, 1);
  expect([...seen].filter((h) => h !== null && h !== allowed), `no hint before ${id} is ours`).toEqual([]);
}

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

test.describe('tutorial levels 1–4 (LV-5 / checklist R1, GD-5a/b)', () => {
  test('fresh save: level 1 hints appear and complete in order by touch', async ({ page }) => {
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

    expect(pageErrors).toEqual([]);
  });

  test('level 2, side first: side → (capture) side → foe → cut home → side on its ribbon → no supply-line step', async ({ page }) => {
    const pageErrors = await boot(page);
    const T = await hintTexts(page);
    await startLevel(page, 2);
    await expect.poll(() => hint(page), { message: 'level 2 opens on its first step' }).toBe(T['tutorial.tapThenGrey']);
    await tap(page, towerAt(2, 'home'));
    await page.waitForTimeout(150);
    expect(await hint(page), 'selecting home alone does not complete the link step').toBe(T['tutorial.tapThenGrey']);
    expect(await playerLinks(page)).toEqual([]);
    await tap(page, towerAt(2, 'side'));
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'side' }]);
    await expect.poll(() => hint(page), { message: 'home → side completes step 1; step 2 waits for the capture' }).toBeNull();
    // the stop step (and every other) stays hidden while side is still grey, though home → side streams
    await waitForCapture(page, 'side', 3);

    await expect.poll(() => hint(page), { message: 'side is ours: go around by it' }).toBe(T['tutorial.goAround']);
    await tap(page, EMPTY); // drop home's selection (a tap on side now would cut home → side)
    await tap(page, towerAt(2, 'side'));
    await tap(page, towerAt(2, 'foe'));
    await expect.poll(() => hint(page), { message: 'side → foe completes step 2; the stop step shows' }).toBe(T['tutorial.stopStream']);
    expect(await playerLinks(page)).toEqual([
      { from: 'home', to: 'side' },
      { from: 'side', to: 'foe' },
    ]);

    await tap(page, EMPTY);
    await tap(page, towerAt(2, 'home'));
    await tap(page, towerAt(2, 'side')); // the second tap on the target unlinks home → side
    await expect.poll(() => hint(page), { message: 'the cut completes the stop step' }).toBeNull();
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'side', to: 'foe' }]);
    // side-first line: no own full tower relays onward, so the supply-line step never comes up
    await setSpeed(page, 3);
    const hints = new Set<string | null>();
    for (let i = 0; i < 20; i++) {
      hints.add(await hint(page));
      await page.waitForTimeout(150);
    }
    await setSpeed(page, 1);
    expect([...hints], 'no supply-line step (or any other) after the cut').toEqual([null]);
    expect(await relayLinks(page)).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('level 2, mid first: the supply-line step comes up on mid once it is full and streams onward; the relay link clears it', async ({ page }) => {
    const pageErrors = await boot(page);
    const T = await hintTexts(page);
    await startLevel(page, 2);
    await expect.poll(() => hint(page)).toBe(T['tutorial.tapThenGrey']);
    // the naive line's first tap time (3 s): a tap in the rusher's first second on mid can freeze into
    // a 0/1 stalemate there (GDD §3.11 "common cause"); from 3 s on seed 1 takes mid at 10–15 s
    await expect.poll(() => simTime(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(3_200);
    // the taps land at ×0.1 so the link forms at sim ≈ 3.2–3.6 s whatever the host's load: a tap that
    // lands after ≈ 5 s loses the race for mid to the rusher (Day 32: failed once in the full suite)
    await setSpeed(page, 0.1);
    await tap(page, towerAt(2, 'home'));
    await tap(page, towerAt(2, 'mid')); // the bait: step 1 (side) stays
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'mid' }]);
    expect(await simTime(page), 'the bait link formed before the rusher contests mid').toBeLessThan(4_000);
    await setSpeed(page, 1);
    expect(await hint(page)).toBe(T['tutorial.tapThenGrey']);
    // step 1 may stay up (20 s timeout) until mid falls; after that only the supply line could show
    await waitForCapture(page, 'mid', 3, T['tutorial.tapThenGrey']);
    await tap(page, EMPTY);
    await tap(page, towerAt(2, 'mid'));
    await tap(page, towerAt(2, 'side')); // mid streams onward
    await expect.poll(() => playerLinks(page)).toContainEqual({ from: 'mid', to: 'side' });
    // home → mid fills mid (25) and ends; mid, full and streaming onward, now relays
    await setSpeed(page, 3);
    await expect
      .poll(() => hint(page), { message: 'the supply-line step comes up (sim ≈ 33 s)', timeout: 30_000, intervals: [100] })
      .toBe(T['tutorial.supplyLine']);
    await setSpeed(page, 1);
    expect(await tower(page, 'mid')).toMatchObject({ owner: 'player', units: 25 });
    expect(await playerLinks(page), 'home → mid ended (targetFull)').not.toContainEqual({ from: 'home', to: 'mid' });

    await tap(page, EMPTY);
    await tap(page, towerAt(2, 'home'));
    await tap(page, towerAt(2, 'mid')); // a stream into the full tower: a supply line
    await expect.poll(() => relayLinks(page), { message: 'home → mid is a relay link' }).toEqual([{ from: 'home', to: 'mid' }]);
    await expect.poll(() => hint(page), { message: 'the relay link completes the supply-line step (tutorial over)' }).toBeNull();
    await page.waitForTimeout(300);
    expect(await hint(page), 'level 2 has no further step').toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test('level 3: take both greys — home → east, then the step points at the grey tower left', async ({ page }) => {
    const pageErrors = await boot(page);
    const T = await hintTexts(page);
    await startLevel(page, 3);
    await expect.poll(() => hint(page), { message: 'level 3 opens on tap-then-grey' }).toBe(T['tutorial.tapThenGrey']);
    await tap(page, towerAt(3, 'home'));
    await tap(page, towerAt(3, 'east'));
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'east' }]);
    await expect.poll(() => hint(page), { message: 'home → east completes step 1; step 2 waits for the capture' }).toBeNull();
    await waitForCapture(page, 'east', 3);
    await expect.poll(() => hint(page), { message: 'east is ours: take the other grey tower' }).toBe(T['tutorial.grabOther']);
    expect(await tower(page, 'west')).toMatchObject({ owner: 'neutral' });
    // home (L1) already runs its one stream: east, just taken, opens the second
    await tap(page, EMPTY);
    await tap(page, towerAt(3, 'east'));
    await tap(page, towerAt(3, 'west'));
    await expect.poll(() => playerLinks(page)).toContainEqual({ from: 'east', to: 'west' });
    await expect.poll(() => hint(page), { message: 'the link into west completes step 2 (tutorial over)' }).toBeNull();
    await setSpeed(page, 3);
    await expect.poll(async () => (await tower(page, 'west'))?.owner, { message: 'both greys taken', timeout: 20_000 }).toBe('player');
    await setSpeed(page, 1);
    expect(await hint(page), 'level 3 has no further step').toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test('level 4: stop → fill → L2 — cut home → outpost after the capture, home fills to 25 and runs two streams', async ({ page }) => {
    const pageErrors = await boot(page);
    const T = await hintTexts(page);
    expect(T['tutorial.fillToUpgrade']).toContain(String(L1_CAPACITY));
    await startLevel(page, 4);
    await page.waitForTimeout(300);
    expect(await hint(page), 'level 4: nothing to stop yet').toBeNull();
    await tap(page, towerAt(4, 'home'));
    await tap(page, towerAt(4, 'outpost'));
    await expect.poll(() => playerLinks(page)).toEqual([{ from: 'home', to: 'outpost' }]);
    await waitForCapture(page, 'outpost', 3);
    await expect.poll(() => hint(page), { message: 'outpost is ours and home still streams: stop it' }).toBe(T['tutorial.stopToGrow']);
    expect(await playerMaxLevel(page), 'no player tower is L2 yet').toBe(1);
    await tap(page, towerAt(4, 'outpost')); // home is still selected: the second tap on the target unlinks
    await expect.poll(() => hint(page), { message: 'the unlink completes the stop step; fill-to-upgrade shows' }).toBe(T['tutorial.fillToUpgrade']);
    expect(await playerLinks(page)).toEqual([]);
    // home grows again (one unit a second from ≈ 15): ≈ 10 s of sim time to 25
    await setSpeed(page, 10);
    await expect.poll(() => hint(page), { message: 'the step completes when home reaches L2', timeout: 20_000 }).toBeNull();
    await setSpeed(page, 1);
    expect(await tower(page, 'home'), 'home auto-upgraded to L2').toMatchObject({ owner: 'player', level: 2 });
    // the lesson in practice: L2 home runs two streams at once (L1 would refuse the second)
    await tap(page, EMPTY);
    await tap(page, towerAt(4, 'home'));
    await tap(page, towerAt(4, 'outpost'));
    await tap(page, towerAt(4, 'mid'));
    await expect.poll(() => playerLinks(page), { message: 'an L2 tower runs two streams' }).toEqual([
      { from: 'home', to: 'outpost' },
      { from: 'home', to: 'mid' },
    ]);
    expect(await limitHint(page), 'no link-limit refusal at L2 with two streams').toBeNull();
    expect(await hint(page), 'level 4 has no further step').toBeNull();
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
