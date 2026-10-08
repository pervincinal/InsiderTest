import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * QA-16 A: the rating prompt (MM-9, src/native/review.ts) on the web path. The result screen calls
 * `maybeAskForReview` once per entry; on the web the OS call is never reached:
 *   - with `?review=on` (web debug switch) the hook runs the trigger rule, a campaign 3★ win on a
 *     level ≥ 10 qualifies, `requestReview()` resolves 'unavailable' (not native) and the save is NOT
 *     marked (`reviewAsked` stays false, so a later native build can still ask once);
 *   - without the switch (the shipped default: `VITE_RATING_PROMPT` unset) the hook returns
 *     'disabled' at once.
 * Both must be invisible to the player: no console error, a normal result screen, MENU goes back to
 * the level map, and `window.__towerclash.lastReview` carries the hook's verdict,
 * so the two runs assert only the observable contract.
 *
 * Deterministic 3★: the reference player wins level 11 "Starve the Keep" at seed 31 in 26.5 s
 * headless (`npm run playtest -- --level 11 --seed 31`), under its 30 s `star3` clock. Level 10 has
 * no 3★ seed for the bot in seeds 1–40 (its star3 is 20 s, the bot's median 25 s), so level 11 —
 * the lowest qualifying level the bot 3-stars reliably — stands in for "level ≥ 10".
 *
 * Like the other specs this file imports nothing from src/; the RESULT rect mirrors src/render/layout.ts.
 */

// src/render/layout.ts — RESULT.menu
const RESULT_MENU = { x: 466, y: 780, w: 170, h: 72 };
// src/native/review.ts RATING_PROMPT_MIN_LEVEL = 10; the level / seed pair the bot 3-stars (see above)
const REVIEW_LEVEL = 11;
const REVIEW_SEED = 31;
const SAVE_KEY = 'towerclash.save.v3';

/** Levels 1–10 cleared with 3★ (level 11 reachable), English UI, never asked for a review. */
function seededSave(): Record<string, unknown> {
  const stars: Record<string, number> = {};
  for (let id = 1; id < REVIEW_LEVEL; id++) stars[String(id)] = 3;
  return { version: 3, gold: 0, crystals: 0, stars, settings: { language: 'en' }, reviewAsked: false };
}

/** Boot on `url` with the seeded save; collects page errors, console errors, review-related warnings and any plugin request. */
async function boot(page: Page, url: string): Promise<string[]> {
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${String(err)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
    else if (msg.type() === 'warning' && /review/i.test(msg.text())) problems.push(`console.warn: ${msg.text()}`);
  });
  // the plugin is reached only through a dynamic import() inside a native shell: the web never fetches it
  page.on('request', (req) => {
    if (/in-app-review/i.test(req.url())) problems.push(`request: ${req.url()}`);
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seededSave()] as const);
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__towerclash?.economy?.getSave === 'function');
  return problems;
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
/** `reviewAsked` of the live save and of the persisted copy (undefined when the key is absent). */
const reviewAsked = (page: Page) =>
  page.evaluate((key) => {
    const live = (window.__towerclash.economy.getSave() as { reviewAsked?: unknown }).reviewAsked;
    const stored = (JSON.parse(localStorage.getItem(key) ?? '{}') as { reviewAsked?: unknown }).reviewAsked;
    return { live, stored };
  }, SAVE_KEY);

async function tapRect(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

/**
 * The whole run: level 11 seed 31 under the reference player at ×10 → 3★ campaign result (the
 * qualifying case of the trigger rule) → the hook has run → MENU → level map with level 12 open.
 */
async function threeStarRunToMap(page: Page, problems: string[], expected: 'unavailable' | 'disabled'): Promise<void> {
  expect(await reviewAsked(page)).toEqual({ live: false, stored: false });
  await page.evaluate(
    ([id, seed]) => {
      void window.__towerclash.loadLevel(id, seed);
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    },
    [REVIEW_LEVEL, REVIEW_SEED] as const,
  );
  await expect.poll(() => page.evaluate(() => window.__towerclash.getState()?.levelId ?? null)).toBe(REVIEW_LEVEL);
  await expect.poll(() => screen(page), { timeout: 30_000, intervals: [250] }).toBe('result');
  const result = await page.evaluate(() => window.__towerclash.getResult());
  // a normal campaign win: 3★, the first-clear gold, no practice / defeat-only fields
  expect(result).toMatchObject({ outcome: 'won', stars: 3, practice: false, tip: null, howto: false });
  expect(result!.coinsEarned).toBeGreaterThan(0);
  // the hook is fire-and-forget from ResultScreen.enter: give its promise a few frames to settle
  for (let i = 0; i < 2; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
  expect(await screen(page)).toBe('result'); // the hook did not navigate or throw the screen away
  // the hook's own verdict: web + ?review=on → the OS sheet is unavailable; no switch → disabled
  await expect.poll(() => page.evaluate(() => window.__towerclash.lastReview)).toBe(expected);
  const save = await page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as { stars: Record<string, number> });
  expect(save.stars[String(REVIEW_LEVEL)]).toBe(3); // the win itself was saved …
  expect(await reviewAsked(page)).toEqual({ live: false, stored: false }); // … but the review flag was not
  // the game goes on: MENU → level map, the next level is open
  await page.evaluate(() => window.__towerclash.setSpeed(1));
  await tapRect(page, RESULT_MENU);
  await expect.poll(() => screen(page)).toBe('levelSelect');
  expect(await page.evaluate((id) => window.__towerclash.isLevelUnlocked(id), REVIEW_LEVEL + 1)).toBe(true);
  expect(await reviewAsked(page)).toEqual({ live: false, stored: false });
  expect(problems).toEqual([]);
}

test.describe('rating prompt on the web (QA-16, MM-9)', () => {
  test('?review=on: a qualifying 3★ win on level 11 → normal result, reviewAsked stays false (web → unavailable), back to the map', async ({ page }) => {
    test.setTimeout(45_000);
    const problems = await boot(page, '/?lang=en&review=on');
    await threeStarRunToMap(page, problems, 'unavailable');
  });

  test('no switch (shipped default): the same 3★ run → no crash, reviewAsked stays false, back to the map', async ({ page }) => {
    test.setTimeout(45_000);
    const problems = await boot(page, '/?lang=en');
    await threeStarRunToMap(page, problems, 'disabled');
  });
});
