import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/*
 * Daily Challenge v1 (GDD §7): the level-map card is locked on a fresh save and opens once level 8
 * has a star; a tap starts today's challenge (fixed level, seed and twist); the first win of the day
 * pays `goldReward(stars)` gold + 5 crystals through the wallet and never touches the level's stars;
 * a replay the same day pays nothing; the card shows DONE; a win the next UTC day makes the streak 2.
 * Streak milestones (DAILY-2, ECONOMY.md §6.2): the third consecutive first win pays +5 crystals once
 * (`save.challenge.milestones` = [3]) and the card pill names the next bonus.
 * "Today" comes from `window.__towerclash.setDayKey`, so the run is deterministic.
 *
 * Like smoke.spec.ts this file imports nothing from src/; hit regions mirror src/render/layout.ts
 * (TITLE.play, LEVEL_MAP.daily, RESULT.next) and the rewards src/daily/challenge.ts (REWARD).
 */

const SAVE_KEY = 'towerclash.save.v3';
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const LEVEL_MAP_DAILY = { x: 30, y: 112, w: 660, h: 104 };
const RESULT_NEXT = { x: 84, y: 780, w: 170, h: 72 };
const REWARD = { gold: 30, goldPerStar: 10, crystals: 5 };
const UNLOCK_AFTER_LEVEL = 8;
/** Day-3 streak milestone (src/daily/challenge.ts STREAK_MILESTONES). */
const MILESTONE_DAY3 = 5;
// Three consecutive days the reference player wins at the fixed seed (`npm run playtest -- --daily 2026-09-27 --days 3`).
const DAY_A = '2026-09-27';
const DAY_B = '2026-09-28';
const DAY_C = '2026-09-29';

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
  challenge: { lastWinDay: string | null; streak: number; best: Record<string, { stars: number; timeMs: number }>; milestones: number[] };
}
const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as SaveShape);
const daily = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.daily.get())) as ReturnType<typeof window.__towerclash.daily.get>);

async function boot(page: Page, seeded: Record<string, unknown>, dayKey: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.daily?.get === 'function');
  await page.evaluate((key) => window.__towerclash.setDayKey(key), dayKey);
  return errors;
}

/** Reference player at ×10 on the challenge that is starting / running → result screen. */
async function winRunningChallenge(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__towerclash.setSpeed(10);
    window.__towerclash.autoplay();
  });
  await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
  expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
}

test.describe('daily challenge', () => {
  test('locked until level 8 has a star: the card explains, a tap does not start anything', async ({ page }) => {
    const errors = await boot(page, { version: 3 }, DAY_A);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    const info = await daily(page);
    expect(info.unlocked).toBe(false);
    expect(info.done).toBe(false);
    expect(info.challenge.dayKey).toBe(DAY_A);
    expect(info.challenge.levelId).toBeGreaterThanOrEqual(9);
    expect(await page.evaluate(() => window.__towerclash.getText('daily.locked'))).toContain(`{n}`);
    await tapRect(page, LEVEL_MAP_DAILY);
    await page.waitForTimeout(300);
    expect(await screen(page)).toBe('levelSelect');
    expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();
    expect(errors).toEqual([]);
  });

  test('unlocked: tap starts the fixed run; first win pays once, replay pays nothing, DONE badge, streak', async ({ page }) => {
    const stars: Record<string, number> = {};
    for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) stars[String(id)] = 1;
    const errors = await boot(page, { version: 3, stars, gold: 100, crystals: 3 }, DAY_A);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    const info = await daily(page);
    expect(info.unlocked).toBe(true);
    expect(info.done).toBe(false);
    expect(info.streak).toBe(0);
    await page.waitForTimeout(400); // header settles
    await shot(page, 'look3-daily-card');

    // tap the card → the challenge's level, seed and twist reach the sim
    await tapRect(page, LEVEL_MAP_DAILY);
    await expect.poll(() => screen(page)).toBe('play');
    const state = await page.evaluate(() => {
      const s = window.__towerclash.getState()!;
      return { levelId: s.levelId, seed: s.seed, modifiers: s.modifiers };
    });
    expect(state.levelId).toBe(info.challenge.levelId);
    expect(state.seed).toBe(info.challenge.seed);
    expect(state.modifiers).toEqual(info.challenge.twist.modifiers);
    expect(await page.evaluate(() => window.__towerclash.getText('daily.chip'))).toContain('{name}');

    await winRunningChallenge(page);
    const result = (await page.evaluate(() => window.__towerclash.getResult()))!;
    expect(result.stars).toBeGreaterThanOrEqual(1);
    const expectedGold = REWARD.gold + REWARD.goldPerStar * result.stars;
    expect(result.coinsEarned).toBe(expectedGold);
    expect(result.crystalsEarned).toBe(REWARD.crystals);
    expect(result.achievements).toEqual([]);
    const after = await save(page);
    expect(after.gold).toBe(100 + expectedGold);
    expect(after.crystals).toBe(3 + REWARD.crystals);
    expect(after.challenge.lastWinDay).toBe(DAY_A);
    expect(after.challenge.streak).toBe(1);
    expect(after.challenge.best[DAY_A]).toMatchObject({ stars: result.stars });
    expect(after.stars[String(info.challenge.levelId)]).toBeUndefined(); // no level stars from a challenge
    await page.waitForTimeout(2200); // card slide + count-up
    await shot(page, 'look3-daily-result');

    // replay the same day: nothing is paid, the best is reported
    await page.evaluate(() => void window.__towerclash.daily.start());
    await expect.poll(() => screen(page)).toBe('play');
    await winRunningChallenge(page);
    const replay = (await page.evaluate(() => window.__towerclash.getResult()))!;
    expect(replay.coinsEarned).toBe(0);
    expect(replay.crystalsEarned).toBe(0);
    const afterReplay = await save(page);
    expect(afterReplay.gold).toBe(after.gold);
    expect(afterReplay.crystals).toBe(after.crystals);
    expect(afterReplay.challenge.streak).toBe(1);

    // NEXT returns to the level map, where the card shows DONE
    await tapRect(page, RESULT_NEXT);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    const done = await daily(page);
    expect(done.done).toBe(true);
    expect(done.streak).toBe(1);
    // the replay at ×10 may beat the first run's clock, so the card reports the best of the two
    expect(done.best?.stars).toBeGreaterThanOrEqual(result.stars);
    await page.waitForTimeout(300);
    await shot(page, 'look3-daily-card-done');

    // the next UTC day: a new challenge, a win makes the streak 2 and pays again
    await page.evaluate((key) => window.__towerclash.setDayKey(key), DAY_B);
    const next = await daily(page);
    expect(next.done).toBe(false);
    expect(next.streak).toBe(1);
    expect(next.challenge.dayKey).toBe(DAY_B);
    await page.evaluate(() => void window.__towerclash.daily.start());
    await expect.poll(() => screen(page)).toBe('play');
    await winRunningChallenge(page);
    const dayB = (await page.evaluate(() => window.__towerclash.getResult()))!;
    const final = await save(page);
    expect(final.challenge.streak).toBe(2);
    expect(final.challenge.lastWinDay).toBe(DAY_B);
    expect(final.gold).toBe(afterReplay.gold + REWARD.gold + REWARD.goldPerStar * dayB.stars);
    expect(final.crystals).toBe(afterReplay.crystals + REWARD.crystals);
    expect(errors).toEqual([]);
  });

  test('streak milestone: three consecutive first wins pay the day-3 bonus once; the card names the next bonus', async ({ page }) => {
    test.slow();
    const stars: Record<string, number> = {};
    for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) stars[String(id)] = 1;
    const errors = await boot(page, { version: 3, stars, gold: 100, crystals: 3 }, DAY_A);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(await page.evaluate(() => window.__towerclash.getText('daily.streakNext'))).toContain('{day}');
    expect((await save(page)).challenge.milestones).toEqual([]);

    let crystals = 3;
    for (const [i, day] of [DAY_A, DAY_B, DAY_C].entries()) {
      await page.evaluate((key) => window.__towerclash.setDayKey(key), day);
      expect((await daily(page)).streak).toBe(i);
      await page.evaluate(() => void window.__towerclash.daily.start());
      await expect.poll(() => screen(page)).toBe('play');
      await winRunningChallenge(page);
      const bonus = i === 2 ? MILESTONE_DAY3 : 0;
      const result = (await page.evaluate(() => window.__towerclash.getResult()))!;
      expect(result.crystalsEarned).toBe(REWARD.crystals + bonus);
      crystals += REWARD.crystals + bonus;
      const s = await save(page);
      expect(s.crystals).toBe(crystals);
      expect(s.challenge.streak).toBe(i + 1);
      expect(s.challenge.lastWinDay).toBe(day);
      expect(s.challenge.milestones).toEqual(i === 2 ? [3] : []);
    }
    await page.waitForTimeout(2200); // card slide + count-up; the milestone toast is still up (3.5 s)
    await shot(page, 'look3-daily-milestone');

    // a replay on day 3 pays nothing and keeps the milestone paid
    await page.evaluate(() => void window.__towerclash.daily.start());
    await expect.poll(() => screen(page)).toBe('play');
    await winRunningChallenge(page);
    expect((await page.evaluate(() => window.__towerclash.getResult()))!.crystalsEarned).toBe(0);
    const afterReplay = await save(page);
    expect(afterReplay.crystals).toBe(crystals);
    expect(afterReplay.challenge.milestones).toEqual([3]);

    // back on the map: streak 3, the pill names the day-7 bonus
    await tapRect(page, RESULT_NEXT);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect((await daily(page)).streak).toBe(3);
    await page.waitForTimeout(300);
    await shot(page, 'look3-daily-card-streak');

    // a missed day breaks the streak: shown 0, the day-3 bonus is on offer again (paid days clear on the next win)
    await page.evaluate((key) => window.__towerclash.setDayKey(key), '2026-10-01');
    expect((await daily(page)).streak).toBe(0);
    expect((await save(page)).challenge.milestones).toEqual([3]);
    expect(errors).toEqual([]);
  });
  test('RETRY / restart after the UTC rollover does not replay the stale day: the map opens with the "new challenge" toast (BUG-9)', async ({ page }) => {
    const stars: Record<string, number> = {};
    for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) stars[String(id)] = 1;
    const errors = await boot(page, { version: 3, stars, gold: 100, crystals: 3 }, DAY_A);
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    const info = await daily(page);
    await tapRect(page, LEVEL_MAP_DAILY);
    await expect.poll(() => screen(page)).toBe('play');
    // midnight passes while the match runs; the pause menu's restart (R) re-reads the day
    await page.evaluate((key) => window.__towerclash.setDayKey(key), DAY_B);
    await page.keyboard.press('r');
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(await page.evaluate(() => window.__towerclash.getState())).toBeNull();
    expect(await page.evaluate(() => window.__towerclash.getToast())).toBe(await page.evaluate(() => window.__towerclash.getText('daily.newReady')));
    // the card now offers day B; a tap starts it, not day A's run
    expect((await daily(page)).challenge.dayKey).toBe(DAY_B);
    await tapRect(page, LEVEL_MAP_DAILY);
    await expect.poll(() => screen(page)).toBe('play');
    const seed = await page.evaluate(() => window.__towerclash.getState()!.seed);
    expect(seed).toBe((await daily(page)).challenge.seed);
    expect(seed).not.toBe(info.challenge.seed);
    // same day: R restarts the challenge in place
    await page.keyboard.press('r');
    await expect.poll(() => screen(page)).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getState()!.seed)).toBe(seed);
    expect((await save(page)).challenge.lastWinDay).toBeNull();
    expect(errors).toEqual([]);
  });
});
