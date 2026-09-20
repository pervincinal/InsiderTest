import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/*
 * Weekly Challenge (GDD §8, WEEKLY-1): the WEEKLY tab of the level-map card is locked on a fresh save
 * and opens once level 32 has a star; a tap on the card (weekly face) starts this week's fixed run
 * (level, seed, twist); the first win of the week pays 100 gold, the first attempt at or under the
 * level's 3★ clock pays 20 crystals, both through the wallet and never through the level's stars; a
 * replay the same week pays nothing; the card shows DONE (+ ★ pip once the target is paid); a win the
 * next week makes the streak 2. "This week" comes from `window.__towerclash.setWeekKey`.
 *
 * Like daily.spec.ts this file imports nothing from src/; hit regions mirror src/render/layout.ts
 * (TITLE.play, LEVEL_MAP.daily / dailyTabDaily / dailyTabWeekly, RESULT.next) and the rewards
 * src/daily/challenge.ts (WEEKLY_REWARD).
 */

const SAVE_KEY = 'towerclash.save.v3';
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const LEVEL_MAP_DAILY = { x: 30, y: 112, w: 660, h: 104 };
const TAB_DAILY = { x: 126, y: 118, w: 118, h: 44 };
const TAB_WEEKLY = { x: 244, y: 118, w: 118, h: 44 };
const RESULT_NEXT = { x: 84, y: 780, w: 170, h: 72 };
const WEEKLY_REWARD = { gold: 100, crystals: 20 };
const UNLOCK_AFTER_LEVEL = 32;
/**
 * Two consecutive weeks the reference player wins at the fixed seed (scratch sweep over
 * `weeklyFor` + `runHeadless`, 2026-09-20): 2026-10-05 → level 37 Tank Country, seed 80299, Fast
 * feet, target 25 s, bot 22.15 s (3★, pays the crystals); 2026-10-12 → level 39 The Long Night, seed
 * 157939, Fast feet, target 35 s, bot 38.55 s (2★, gold only).
 */
const WEEK_A = '2026-10-05';
const WEEK_B = '2026-10-12';

const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}${name}.png`, scale: 'css' });

type R = { x: number; y: number; w: number; h: number };
async function tapRect(page: Page, r: R): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

interface SaveShape {
  gold: number;
  crystals: number;
  stars: Record<string, number>;
  challenge: { lastWinDay: string | null; streak: number };
  weekly: { lastWinWeek: string | null; streak: number; best: Record<string, { stars: number; timeMs: number; target: boolean }> };
}
const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as SaveShape);
const weekly = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.weekly.get())) as ReturnType<typeof window.__towerclash.weekly.get>);
const tab = (page: Page) => page.evaluate(() => window.__towerclash.weekly.tab());

function unlockedStars(): Record<string, number> {
  const stars: Record<string, number> = {};
  for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) stars[String(id)] = 1;
  return stars;
}

async function boot(page: Page, seeded: Record<string, unknown>, weekKey: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.weekly?.get === 'function');
  await page.evaluate((key) => window.__towerclash.setWeekKey(key), weekKey);
  return errors;
}

/**
 * Reference player at ×10 on the challenge that is starting / running → result screen. Armed at
 * once (the app queues `autoplay` onto a pending level start) so the bot has the match from its
 * first ticks: the 3★ target leaves only a few seconds of sim time, and at ×10 a late start eats it.
 */
async function winRunning(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__towerclash.autoplay();
    window.__towerclash.setSpeed(10);
  });
  await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
  expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
}

/** `weekly.start()` with the bot armed in the same tick. */
async function startAndWin(page: Page): Promise<void> {
  await page.evaluate(() => void window.__towerclash.weekly.start());
  await winRunning(page);
}

test.describe('weekly challenge', () => {
  test('locked until level 32 has a star: the WEEKLY tab explains, a tap does not start anything', async ({ page }) => {
    const stars = unlockedStars();
    delete stars[String(UNLOCK_AFTER_LEVEL)]; // 1–31 cleared: the daily is open, the weekly is not
    const errors = await boot(page, { version: 3, stars }, WEEK_A);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(await tab(page)).toBe('daily');
    const info = await weekly(page);
    expect(info.unlocked).toBe(false);
    expect(info.done).toBe(false);
    expect(info.challenge.weekKey).toBe(WEEK_A);
    expect(info.challenge.levelId).toBeGreaterThanOrEqual(33);
    expect(info.challenge.twist.id).not.toBe('plain');
    // any day maps to its Monday
    await page.evaluate(() => window.__towerclash.setWeekKey('2026-10-07'));
    expect((await weekly(page)).challenge.weekKey).toBe(WEEK_A);
    await tapRect(page, TAB_WEEKLY);
    await expect.poll(() => tab(page)).toBe('weekly');
    await page.waitForTimeout(300);
    await shot(page, 'look3-weekly-card-locked');
    await tapRect(page, LEVEL_MAP_DAILY);
    await page.waitForTimeout(300);
    expect(await screen(page)).toBe('levelSelect');
    expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();
    const locked = await page.evaluate(() => window.__towerclash.getText('weekly.locked'));
    expect(locked).toContain('{n}');
    expect(await page.evaluate(() => window.__towerclash.getToast())).toBe(locked.replace('{n}', String(UNLOCK_AFTER_LEVEL)));
    // the DAILY tab still starts the daily
    await tapRect(page, TAB_DAILY);
    await expect.poll(() => tab(page)).toBe('daily');
    await tapRect(page, LEVEL_MAP_DAILY);
    await expect.poll(() => screen(page)).toBe('play');
    const dailyInfo = await page.evaluate(() => window.__towerclash.daily.get());
    expect(await page.evaluate(() => window.__towerclash.getState()!.seed)).toBe(dailyInfo.challenge.seed);
    expect(errors).toEqual([]);
  });

  test('unlocked: tab + tap start the fixed run; first win pays gold and the 3★ target crystals once, replay pays nothing, DONE + ★, streak', async ({ page }) => {
    test.slow();
    const errors = await boot(page, { version: 3, stars: unlockedStars(), gold: 100, crystals: 3 }, WEEK_A);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    const info = await weekly(page);
    expect(info.unlocked).toBe(true);
    expect(info.done).toBe(false);
    expect(info.target).toBe(false);
    expect(info.streak).toBe(0);
    await tapRect(page, TAB_WEEKLY);
    await expect.poll(() => tab(page)).toBe('weekly');
    await page.waitForTimeout(400); // header settles
    await shot(page, 'look3-weekly-card');
    // the card fits the narrowest supported viewport (GDD §8.2)
    await page.setViewportSize({ width: 360, height: 640 });
    await page.waitForTimeout(400);
    await shot(page, 'look3-weekly-card-360');
    await page.setViewportSize({ width: 393, height: 851 });
    await page.waitForTimeout(400);

    // tap the card → the weekly's level, seed and twist reach the sim; the chip says "Weekly"
    await tapRect(page, LEVEL_MAP_DAILY);
    await page.evaluate(() => window.__towerclash.autoplay()); // queued onto the pending start (see winRunning)
    await expect.poll(() => screen(page)).toBe('play');
    const state = await page.evaluate(() => {
      const s = window.__towerclash.getState()!;
      return { levelId: s.levelId, seed: s.seed, modifiers: s.modifiers };
    });
    expect(state.levelId).toBe(info.challenge.levelId);
    expect(state.seed).toBe(info.challenge.seed);
    expect(state.modifiers).toEqual(info.challenge.twist.modifiers);
    expect(await page.evaluate(() => window.__towerclash.getText('weekly.chip'))).toContain('{name}');

    await winRunning(page);
    const result = (await page.evaluate(() => window.__towerclash.getResult()))!;
    const clockA = (await save(page)).weekly.best[WEEK_A]?.timeMs;
    test.info().annotations.push({ type: 'weekly', description: `${WEEK_A}: ${result.stars}★, clock ${clockA} ms, target ${info.challenge.targetMs} ms` });
    expect(result.stars).toBe(3); // the reference player reaches the 25 s target at seed 80299 (22.15 s headless)
    expect(result.coinsEarned).toBe(WEEKLY_REWARD.gold);
    expect(result.crystalsEarned).toBe(WEEKLY_REWARD.crystals);
    expect(result.achievements).toEqual([]);
    expect(await page.evaluate(() => window.__towerclash.getToast())).toBe(await page.evaluate(() => window.__towerclash.getText('weekly.resultTarget').replace('{crystals}', '20')));
    const after = await save(page);
    expect(after.gold).toBe(100 + WEEKLY_REWARD.gold);
    expect(after.crystals).toBe(3 + WEEKLY_REWARD.crystals);
    expect(after.weekly.lastWinWeek).toBe(WEEK_A);
    expect(after.weekly.streak).toBe(1);
    expect(after.weekly.best[WEEK_A]).toMatchObject({ stars: 3, target: true });
    expect(after.weekly.best[WEEK_A]!.timeMs).toBeLessThanOrEqual(info.challenge.targetMs);
    expect(after.stars[String(info.challenge.levelId)]).toBeUndefined(); // no level stars from a challenge
    expect(after.challenge.lastWinDay).toBeNull(); // separate ledger from the daily
    await page.waitForTimeout(2200); // card slide + count-up
    await shot(page, 'look3-weekly-result');

    // replay the same week: nothing is paid, the best is reported
    await startAndWin(page);
    const replay = (await page.evaluate(() => window.__towerclash.getResult()))!;
    expect(replay.coinsEarned).toBe(0);
    expect(replay.crystalsEarned).toBe(0);
    const afterReplay = await save(page);
    expect(afterReplay.gold).toBe(after.gold);
    expect(afterReplay.crystals).toBe(after.crystals);
    expect(afterReplay.weekly.streak).toBe(1);

    // NEXT returns to the level map, where the card (still on the WEEKLY tab) shows DONE with the ★ pip
    await tapRect(page, RESULT_NEXT);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(await tab(page)).toBe('weekly');
    const done = await weekly(page);
    expect(done.done).toBe(true);
    expect(done.target).toBe(true);
    expect(done.streak).toBe(1);
    expect(done.best).toMatchObject({ stars: 3, target: true });
    await page.waitForTimeout(300);
    await shot(page, 'look3-weekly-card-done');

    // the next Monday: a new weekly, a win makes the streak 2 and pays the gold again (crystals only at 3★)
    await page.evaluate((key) => window.__towerclash.setWeekKey(key), WEEK_B);
    const next = await weekly(page);
    expect(next.done).toBe(false);
    expect(next.target).toBe(false);
    expect(next.streak).toBe(1);
    expect(next.challenge.weekKey).toBe(WEEK_B);
    expect(next.challenge.seed).not.toBe(info.challenge.seed);
    await startAndWin(page);
    const weekB = (await page.evaluate(() => window.__towerclash.getResult()))!;
    const targetB = weekB.stars === 3 ? WEEKLY_REWARD.crystals : 0;
    expect(weekB.coinsEarned).toBe(WEEKLY_REWARD.gold);
    expect(weekB.crystalsEarned).toBe(targetB);
    const final = await save(page);
    expect(final.weekly.streak).toBe(2);
    expect(final.weekly.lastWinWeek).toBe(WEEK_B);
    expect(final.weekly.best[WEEK_B]).toMatchObject({ stars: weekB.stars, target: weekB.stars === 3 });
    expect(final.weekly.best[WEEK_A]).toEqual(afterReplay.weekly.best[WEEK_A]);
    expect(final.gold).toBe(afterReplay.gold + WEEKLY_REWARD.gold);
    expect(final.crystals).toBe(afterReplay.crystals + targetB);
    expect(errors).toEqual([]);
  });

  test('RETRY / restart after the Monday rollover does not replay the stale week: the map opens with the "new weekly" toast', async ({ page }) => {
    const errors = await boot(page, { version: 3, stars: unlockedStars(), gold: 100, crystals: 3 }, WEEK_A);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    await tapRect(page, TAB_WEEKLY);
    await expect.poll(() => tab(page)).toBe('weekly');
    const info = await weekly(page);
    await tapRect(page, LEVEL_MAP_DAILY);
    await expect.poll(() => screen(page)).toBe('play');
    // Monday 00:00 UTC passes while the match runs; the pause menu's restart (R) re-reads the week
    await page.evaluate((key) => window.__towerclash.setWeekKey(key), WEEK_B);
    await page.keyboard.press('r');
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();
    expect(await page.evaluate(() => window.__towerclash.getToast())).toBe(await page.evaluate(() => window.__towerclash.getText('weekly.newReady')));
    // the card now offers week B (the tab is remembered); a tap starts it, not week A's run
    expect(await tab(page)).toBe('weekly');
    expect((await weekly(page)).challenge.weekKey).toBe(WEEK_B);
    await tapRect(page, LEVEL_MAP_DAILY);
    await expect.poll(() => screen(page)).toBe('play');
    const seed = await page.evaluate(() => window.__towerclash.getState()!.seed);
    expect(seed).toBe((await weekly(page)).challenge.seed);
    expect(seed).not.toBe(info.challenge.seed);
    // same week: R restarts the weekly in place
    await page.keyboard.press('r');
    await expect.poll(() => screen(page)).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getState()!.seed)).toBe(seed);
    expect((await save(page)).weekly.lastWinWeek).toBeNull();
    expect(errors).toEqual([]);
  });
});
