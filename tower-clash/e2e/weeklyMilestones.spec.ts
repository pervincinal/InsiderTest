import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * QA-15 — week-streak milestones in the real UI (WK-1, GDD §8.1 "Week-streak milestones", §8.4 item 6;
 * the 13 rule-level unit tests live in tests/ui/weeklyMilestones.test.ts, this file does not repeat them).
 * Each test seeds a save whose week streak is live (`lastWinWeek` = the Monday before the faked week),
 * fakes "this week" with `window.__towerclash.setWeekKey`, lets the reference player win the weekly and
 * reads the result screen: the toast in the achievement-toast slot (priority achievement > week-streak
 * milestone > 3★ target), the crystals the wallet received, and `save.weekly.streak`. The toast is read
 * twice — from the debug surface (`getToast`) and from the strings actually drawn on the #game canvas
 * (a `fillText` recorder, as e2e/shopNoStore.spec.ts) — so "shown" means painted, not only queued.
 *
 * The week is weekly.spec.ts's WEEK_A (2026-09-21 → level 33 Three Kings, seed 743047, Fast feet,
 * 35 s target; the bot clocks ~32.9 s, so the 3★ target usually pays too). The target is not asserted
 * here: the expected crystals are derived from `save.weekly.best[week].target`, so a re-clock of level 33
 * changes the arithmetic, never the verdict. This spec writes no screenshots (weekly.spec.ts owns the
 * `look3-weekly-*` set); failure artefacts go to PW_OUTPUT.
 *
 * Like the other specs this file imports nothing from src/; hit regions mirror src/render/layout.ts
 * (TITLE.play, LEVEL_MAP.daily / dailyTabWeekly), numbers src/daily/challenge.ts (WEEKLY_REWARD,
 * WEEKLY_STREAK_MILESTONES) and src/economy/catalog.ts (`weekly_streak_4` = 20 crystals).
 */

const SAVE_KEY = 'towerclash.save.v3';
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const LEVEL_MAP_DAILY = { x: 30, y: 112, w: 660, h: 104 };
const TAB_WEEKLY = { x: 244, y: 118, w: 118, h: 44 };
const WEEKLY_REWARD = { gold: 100, crystals: 20 };
const WEEKLY_STREAK_MILESTONES: Record<number, number> = { 4: 15, 8: 30, 12: 60 };
const WEEKLY_STREAK_4_CRYSTALS = 20;
const UNLOCK_AFTER_LEVEL = 32;
const WEEK = '2026-09-21';
const LAST_WEEK = '2026-09-14';
const SEED_CRYSTALS = 3;
const SEED_GOLD = 100;

type R = { x: number; y: number; w: number; h: number };
type RecWindow = Window & { __qaTexts: string[] | null };

interface SaveShape {
  gold: number;
  crystals: number;
  weekly: { lastWinWeek: string | null; streak: number; best: Record<string, { stars: number; timeMs: number; target: boolean }> };
  achievements: { unlocked: string[] };
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as SaveShape);
const toast = (page: Page) => page.evaluate(() => window.__towerclash.getToast());
const text = (page: Page, key: string, params?: Record<string, string | number>) => page.evaluate(([k, p]) => window.__towerclash.getText(k, p), [key, params] as const);
const fill = (template: string, params: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));

async function tapRect(page: Page, r: R): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

/** Levels 1–32 at one star: the weekly is unlocked (GDD §8.1 "Unlock"). */
function unlockedStars(): Record<string, number> {
  const stars: Record<string, number> = {};
  for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) stars[String(id)] = 1;
  return stars;
}

/** A save with a live week streak `streak` (last won the week before WEEK). */
function seededSave(streak: number, language: 'az' | 'en', achievements: string[]): Record<string, unknown> {
  return {
    version: 3,
    gold: SEED_GOLD,
    crystals: SEED_CRYSTALS,
    stars: unlockedStars(),
    settings: { language },
    weekly: { lastWinWeek: LAST_WEEK, streak, best: { [LAST_WEEK]: { stars: 2, timeMs: 60_000, target: false } } },
    achievements: { unlocked: achievements },
  };
}

async function boot(page: Page, seeded: Record<string, unknown>, language: 'az' | 'en'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await page.addInitScript(() => {
    const w = window as unknown as RecWindow;
    w.__qaTexts = null;
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s: string, x: number, y: number, maxWidth?: number): void {
      if (w.__qaTexts && this.canvas.id === 'game') w.__qaTexts.push(String(s));
      if (maxWidth === undefined) orig.call(this, s, x, y);
      else orig.call(this, s, x, y, maxWidth);
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.weekly?.get === 'function');
  await page.evaluate((key) => window.__towerclash.setWeekKey(key), WEEK);
  await expect.poll(() => page.evaluate(() => window.__towerclash.getLanguage())).toBe(language);
  // the locale chunk is in: the milestone template is no longer the English fallback (or is English on purpose)
  await expect.poll(() => text(page, 'weekly.resultMilestone')).toContain(language === 'az' ? 'Həftə' : 'Week');
  return errors;
}

/** Every string drawn on #game during the next three animation frames. */
async function drawnTexts(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const w = window as unknown as RecWindow;
    w.__qaTexts = [];
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    const out = w.__qaTexts ?? [];
    w.__qaTexts = null;
    return out; // in draw order, duplicates kept: the compact() checks below need every run in place (ART-16 toasts draw numbers as separate runs)
  });
}

/** Reference player at ×10 on the weekly that is starting / running → a won result screen. */
async function winRunning(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__towerclash.autoplay();
    window.__towerclash.setSpeed(10);
  });
  await expect.poll(() => screen(page), { timeout: 30_000, intervals: [100] }).toBe('result');
  expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
}

/** The seeded streak survived normalisation and is shown live on the card's data. */
async function expectSeededStreak(page: Page, streak: number): Promise<void> {
  const info = await page.evaluate(() => window.__towerclash.weekly.get());
  expect(info.unlocked).toBe(true);
  expect(info.done).toBe(false);
  expect(info.lastWinWeek).toBe(LAST_WEEK);
  expect(info.streak).toBe(streak);
  expect(info.challenge.weekKey).toBe(WEEK);
}

interface Won {
  result: { stars: number; coinsEarned: number; crystalsEarned: number; achievements: string[] };
  after: SaveShape;
  /** The 3★ target crystals were paid on this run (the bot was at or under the level's star3 clock). */
  target: boolean;
  toast: string | null;
  drawn: string[];
}

async function readWin(page: Page): Promise<Won> {
  const result = (await page.evaluate(() => window.__towerclash.getResult()))!;
  const after = await save(page);
  const t = await toast(page);
  const drawn = await drawnTexts(page);
  return { result, after, target: after.weekly.best[WEEK]?.target === true, toast: t, drawn };
}

/**
 * ART-16 (2026-10-10): a toast is no longer one fillText call — the words and the 24 px numerals are
 * separate runs and long toasts wrap — so a toast string is looked for in the concatenation of every
 * drawn run with all whitespace removed.
 */
const compact = (s: string | readonly string[]): string => (Array.isArray(s) ? s.join(' ') : String(s)).replace(/\s+/g, '');

test.describe('weekly week-streak milestones (QA-15, GDD §8.1)', () => {
  test('streak 3 → 4 through the card (AZ), first run: 15 milestone + 20 weekly_streak_4 = +35 crystals, the achievement takes the toast slot', async ({ page }) => {
    const errors = await boot(page, seededSave(3, 'az', []), 'az');
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    await expectSeededStreak(page, 3);
    await tapRect(page, TAB_WEEKLY);
    await expect.poll(() => page.evaluate(() => window.__towerclash.weekly.tab())).toBe('weekly');
    await tapRect(page, LEVEL_MAP_DAILY);
    await page.evaluate(() => window.__towerclash.autoplay()); // queued onto the pending start
    await expect.poll(() => screen(page)).toBe('play');
    await winRunning(page);
    const w = await readWin(page);
    const milestone = WEEKLY_STREAK_MILESTONES[4]!;
    const targetPart = w.target ? WEEKLY_REWARD.crystals : 0;
    test.info().annotations.push({ type: 'weekly', description: `${WEEK}: ${w.result.stars}★, target ${w.target}, crystals earned ${w.result.crystalsEarned}` });
    expect(w.after.weekly.streak).toBe(4);
    expect(w.after.weekly.lastWinWeek).toBe(WEEK);
    expect(w.result.coinsEarned).toBe(WEEKLY_REWARD.gold);
    expect(w.after.gold).toBe(SEED_GOLD + WEEKLY_REWARD.gold);
    // WeeklyOutcome.crystals = milestone + target; the achievement's 20 rides on the grant (§6.3 call-site rule)
    expect(w.result.crystalsEarned).toBe(milestone + targetPart);
    expect(w.result.achievements).toEqual(['weekly_streak_4']);
    expect(w.after.achievements.unlocked).toContain('weekly_streak_4');
    expect(w.after.crystals - SEED_CRYSTALS).toBe(milestone + WEEKLY_STREAK_4_CRYSTALS + targetPart); // +35 (+20 at 3★)
    // one toast per result: the achievement outranks the milestone, whose 15 is credited, not named
    const achievementToast = fill(await text(page, 'achievements.unlocked'), { names: await text(page, 'achievement.weekly_streak_4'), crystals: WEEKLY_STREAK_4_CRYSTALS });
    const milestoneToast = fill(await text(page, 'weekly.resultMilestone'), { n: 4, streak: 4, crystals: milestone });
    expect(milestoneToast).toBe('Həftə seriyası 4 · +15 kristal');
    expect(w.toast).toBe(achievementToast);
    expect(compact(w.drawn)).toContain(compact(achievementToast));
    expect(compact(w.drawn)).not.toContain(compact(milestoneToast));
    // the line under the stars stays weekly.resultWon with the new streak
    expect(compact(w.drawn)).toContain(compact(fill(await text(page, 'weekly.resultWon'), { gold: WEEKLY_REWARD.gold, streak: 4 })));
    expect(errors).toEqual([]);
  });

  test('streak 3 → 4 on a rebuilt run (AZ, weekly_streak_4 already owned): toast "Həftə seriyası 4 · +15 kristal", +15 crystals', async ({ page }) => {
    const errors = await boot(page, seededSave(3, 'az', ['weekly_streak_4']), 'az');
    await expectSeededStreak(page, 3);
    await page.evaluate(() => void window.__towerclash.weekly.start());
    await winRunning(page);
    const w = await readWin(page);
    const milestone = WEEKLY_STREAK_MILESTONES[4]!;
    const targetPart = w.target ? WEEKLY_REWARD.crystals : 0;
    expect(w.after.weekly.streak).toBe(4);
    expect(w.result.achievements).toEqual([]);
    expect(w.result.crystalsEarned).toBe(milestone + targetPart);
    expect(w.after.crystals - SEED_CRYSTALS).toBe(milestone + targetPart);
    expect(w.after.gold).toBe(SEED_GOLD + WEEKLY_REWARD.gold);
    const expected = fill(await text(page, 'weekly.resultMilestone'), { n: 4, streak: 4, crystals: milestone });
    expect(expected).toBe('Həftə seriyası 4 · +15 kristal');
    // the milestone outranks the 3★ target (whose 20 is credited, not named)
    expect(w.toast).toBe(expected);
    expect(compact(w.drawn)).toContain(compact(expected));
    expect(compact(w.drawn)).toContain(compact(fill(await text(page, 'weekly.resultWon'), { gold: WEEKLY_REWARD.gold, streak: 4 })));
    expect(Object.keys(w.after.weekly).sort()).toEqual(['best', 'lastWinWeek', 'streak']); // no new save field
    expect(errors).toEqual([]);
  });

  test('streak 4 → 5 (EN): no milestone toast, no milestone crystals', async ({ page }) => {
    const errors = await boot(page, seededSave(4, 'en', ['weekly_streak_4']), 'en');
    await expectSeededStreak(page, 4);
    await page.evaluate(() => void window.__towerclash.weekly.start());
    await winRunning(page);
    const w = await readWin(page);
    const targetPart = w.target ? WEEKLY_REWARD.crystals : 0;
    expect(w.after.weekly.streak).toBe(5);
    expect(w.result.achievements).toEqual([]);
    expect(w.result.crystalsEarned).toBe(targetPart);
    expect(w.after.crystals - SEED_CRYSTALS).toBe(targetPart);
    expect(w.after.gold).toBe(SEED_GOLD + WEEKLY_REWARD.gold);
    const milestoneTemplate = await text(page, 'weekly.resultMilestone');
    const milestonePrefix = milestoneTemplate.slice(0, milestoneTemplate.indexOf('{'));
    expect(milestonePrefix).toBe('Week streak ');
    // the 3★ target toast when the bot hit it, else no toast at all — never a week-streak line
    expect(w.toast).toBe(w.target ? await text(page, 'weekly.resultTarget', { crystals: WEEKLY_REWARD.crystals }) : null);
    expect(w.drawn.filter((s) => s.startsWith(milestonePrefix))).toEqual([]);
    expect(compact(w.drawn)).toContain(compact(fill(await text(page, 'weekly.resultWon'), { gold: WEEKLY_REWARD.gold, streak: 5 })));
    expect(errors).toEqual([]);
  });

  test('streak 11 → 12 (EN): toast "Week streak 12 · +60 crystals", +60 crystals', async ({ page }) => {
    const errors = await boot(page, seededSave(11, 'en', ['weekly_streak_4']), 'en');
    await expectSeededStreak(page, 11);
    await page.evaluate(() => void window.__towerclash.weekly.start());
    await winRunning(page);
    const w = await readWin(page);
    const milestone = WEEKLY_STREAK_MILESTONES[12]!;
    const targetPart = w.target ? WEEKLY_REWARD.crystals : 0;
    expect(w.after.weekly.streak).toBe(12);
    expect(w.result.achievements).toEqual([]);
    expect(w.result.crystalsEarned).toBe(milestone + targetPart);
    expect(w.after.crystals - SEED_CRYSTALS).toBe(milestone + targetPart);
    expect(w.toast).toBe('Week streak 12 · +60 crystals');
    expect(compact(w.drawn)).toContain(compact('Week streak 12 · +60 crystals'));
    expect(errors).toEqual([]);
  });
});
