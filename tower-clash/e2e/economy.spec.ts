import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Economy (Phase A, docs/ECONOMY.md): commander upgrades reach the sim as `state.modifiers`, skins
 * equip from the shop, the level-break interstitial obeys its gating rules, and the defeat screen's
 * "Reinforcements" continue restarts the level with +15 starting infantry. Ads come from the fake
 * provider installed through `window.__towerclash.economy.setAdsAvailable(true)`; on the plain web
 * build every rewarded button is hidden (the provider is unavailable).
 *
 * Like smoke.spec.ts this file imports nothing from src/; hit regions are mirrored from
 * src/render/layout.ts (SHOP, RESULT) with a pointer to their source of truth.
 */

// src/render/layout.ts — SHOP (content cards are in content space; the tests never scroll)
const SHOP = { tabs: { x: 30, y: 112, w: 660, h: 60 }, back: { x: 18, y: 20, w: 140, h: 60 } };
const SHOP_TABS = ['crystals', 'bundles', 'skins', 'upgrades'] as const;
function shopRowRect(i: number): { x: number; y: number; w: number; h: number } {
  return { x: 34, y: 200 + i * (168 + 16), w: 652, h: 168 };
}
function shopSkinRect(top: number, i: number): { x: number; y: number; w: number; h: number } {
  return { x: 34 + (i % 3) * (208 + 14), y: top + 46 + Math.floor(i / 3) * (236 + 16), w: 208, h: 236 };
}
const SKIN_ROOFS_TOP = 194; // SHOP.row.y0 - 6
// src/render/layout.ts — RESULT
const RESULT = { next: { x: 84, y: 780, w: 170, h: 72 }, menu: { x: 466, y: 780, w: 170, h: 72 }, continueAd: { x: 368, y: 700, w: 268, h: 62 } };
const SAVE_KEY = 'towerclash.save.v3';
// src/economy/catalog.ts — COMMANDER_UPGRADES tier 1 cost / effects, CRYSTAL_SERVICES.continue, SKINS
const TIER1_COST = 60;
const PRODUCTION_PER_TIER = 0.04;
const CONTINUE_BONUS = 15;
const SLATE_COST = 80;
// a level the "auto lose" helper loses within seconds on every seed (verified levels 12 and 16)
const LOSING_LEVEL = 12;

async function tapRect(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

async function tapTab(page: Page, tab: (typeof SHOP_TABS)[number]): Promise<void> {
  const i = SHOP_TABS.indexOf(tab);
  const segW = (SHOP.tabs.w - 8) / SHOP_TABS.length;
  await tapRect(page, { x: SHOP.tabs.x + 4 + i * segW, y: SHOP.tabs.y, w: segW, h: SHOP.tabs.h });
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as SaveShape);
interface SaveShape {
  gold: number;
  crystals: number;
  upgrades: Record<string, number>;
  skins: { owned: string[]; equipped: { roof: string | null; helmet: string | null } };
  adCounters: { levelsCompleted: number; rewardedByPlacement: Record<string, number> };
  entitlements: { noAds: boolean };
}

async function boot(page: Page, seeded: Record<string, unknown>): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.economy?.getSave === 'function');
  return errors;
}

test.describe('economy', () => {
  test('commander upgrade bought in the shop changes state.modifiers of the next level', async ({ page }) => {
    const errors = await boot(page, { version: 3, gold: 100, crystals: 0, stars: { '1': 3 } });
    await page.evaluate(() => window.__towerclash.economy.openShop('upgrades'));
    await expect.poll(() => screen(page)).toBe('shop');
    await tapRect(page, shopRowRect(0)); // Production tier 1
    await expect.poll(async () => (await save(page)).upgrades.production).toBe(1);
    expect((await save(page)).gold).toBe(100 - TIER1_COST);
    await tapRect(page, shopRowRect(0)); // tier 2 costs 120: unaffordable, nothing changes
    await page.waitForTimeout(150);
    expect((await save(page)).upgrades.production).toBe(1);
    expect((await save(page)).gold).toBe(100 - TIER1_COST);
    await page.evaluate(() => window.__towerclash.loadLevel(1, 1));
    await expect.poll(() => screen(page)).toBe('play');
    const mods = await page.evaluate(() => window.__towerclash.getState()?.modifiers);
    expect(mods).toEqual({ productionMul: 1 + PRODUCTION_PER_TIER, capacityMul: 1, startGarrisonBonus: 0, unitSpeedMul: 1 });
    expect(errors).toEqual([]);
  });

  test('skins: buy a roof with crystals, it equips, tapping again unequips; pack skins are locked', async ({ page }) => {
    const errors = await boot(page, { version: 3, gold: 0, crystals: 100 });
    await page.evaluate(() => window.__towerclash.economy.openShop('skins'));
    await expect.poll(() => screen(page)).toBe('shop');
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 0)); // Slate roof, 80 crystals
    await expect.poll(async () => (await save(page)).skins.equipped.roof).toBe('roof_slate');
    let s = await save(page);
    expect(s.crystals).toBe(100 - SLATE_COST);
    expect(s.skins.owned).toEqual(['roof_slate']);
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 1)); // Pagoda, 120: unaffordable
    await page.waitForTimeout(150);
    s = await save(page);
    expect(s.crystals).toBe(100 - SLATE_COST);
    expect(s.skins.owned).toEqual(['roof_slate']);
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 3)); // Gold roof: premium exclusive, not for sale
    await page.waitForTimeout(150);
    expect((await save(page)).skins.owned).toEqual(['roof_slate']);
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 0)); // equipped → default look
    await expect.poll(async () => (await save(page)).skins.equipped.roof).toBeNull();
    await tapRect(page, shopSkinRect(SKIN_ROOFS_TOP, 0)); // and back on
    await expect.poll(async () => (await save(page)).skins.equipped.roof).toBe('roof_slate');
    // the shop tab switch works by tap and the BACK button leaves
    await tapTab(page, 'crystals');
    await tapRect(page, SHOP.back);
    await expect.poll(() => screen(page)).toBe('title');
    expect(errors).toEqual([]);
  });

  test('interstitial gating: none before 5 completed levels, then every 3rd result; never for no-ads owners', async ({ page }) => {
    // 3 results already persisted: the 3rd result of this session is the 6th overall — the first
    // moment both gates (≥ 6 completed, every 3rd result of the session) are open.
    const errors = await boot(page, { version: 3, gold: 0, crystals: 0, adCounters: { day: '', rewardedByPlacement: {}, levelsCompleted: 3 } });
    await page.evaluate(() => window.__towerclash.economy.setAdsAvailable(true));
    const winLevel = async (): Promise<void> => {
      await page.evaluate(() => {
        window.__towerclash.loadLevel(1, 1);
        window.__towerclash.setSpeed(10);
        window.__towerclash.autoplay();
      });
      await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    };
    const stats = () => page.evaluate(() => window.__towerclash.economy.getAdStats());
    // 4th and 5th results: still inside the grace period → MENU leaves without an ad
    for (let i = 0; i < 2; i++) {
      await winLevel();
      await tapRect(page, RESULT.menu);
      await expect.poll(() => screen(page)).toBe('levelSelect');
    }
    expect((await save(page)).adCounters.levelsCompleted).toBe(5);
    expect((await stats()).fakeInterstitials).toBe(0);
    // 6th result → interstitial on leaving the result screen (session counter counts it)
    await winLevel();
    await tapRect(page, RESULT.menu);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    await expect.poll(async () => (await stats()).fakeInterstitials).toBe(1);
    expect((await stats()).interstitialsShown).toBe(1);
    // 7th: not every result (every 3rd, plus the 120 s cooldown)
    await winLevel();
    await tapRect(page, RESULT.menu);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect((await stats()).fakeInterstitials).toBe(1);
    // remove-ads owner: never again
    await page.evaluate(() => window.__towerclash.economy.grant('remove_ads'));
    expect((await save(page)).entitlements.noAds).toBe(true);
    for (let i = 0; i < 3; i++) {
      await winLevel();
      await tapRect(page, RESULT.menu);
      await expect.poll(() => screen(page)).toBe('levelSelect');
    }
    expect((await stats()).fakeInterstitials).toBe(1);
    expect(errors).toEqual([]);
  });

  test('defeat → CONTINUE (rewarded video) restarts the level with +15 starting infantry, once', async ({ page }) => {
    const errors = await boot(page, { version: 3, gold: 0, crystals: 0, stars: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1, '8': 1, '9': 1, '10': 1, '11': 1 } });
    await page.evaluate(() => window.__towerclash.economy.setAdsAvailable(true));
    await page.evaluate((lvl) => {
      window.__towerclash.loadLevel(lvl, 3);
      window.__towerclash.setSpeed(20);
      window.__towerclash.economy.autoLose();
    }, LOSING_LEVEL);
    const base = await page.evaluate(() => {
      const s = window.__towerclash.getState()!;
      return { mods: s.modifiers, home: Object.values(s.towers).filter((t) => t.owner === 'player').map((t) => [t.id, t.units] as const) };
    });
    expect(base.mods.startGarrisonBonus).toBe(0);
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('lost');
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    await tapRect(page, RESULT.continueAd);
    await expect.poll(() => screen(page)).toBe('play');
    const cont = await page.evaluate(() => {
      const s = window.__towerclash.getState()!;
      return { mods: s.modifiers, levelId: s.levelId, time: s.time };
    });
    expect(cont.levelId).toBe(LOSING_LEVEL);
    expect(cont.mods.startGarrisonBonus).toBe(CONTINUE_BONUS);
    expect((await save(page)).adCounters.rewardedByPlacement['rv_continue']).toBe(1);
    expect((await page.evaluate(() => window.__towerclash.economy.getAdStats())).fakeRewarded).toBe(1);
    // lose again: the continued attempt offers no second continue (tap lands on nothing)
    await page.evaluate(() => {
      window.__towerclash.setSpeed(20);
      window.__towerclash.economy.autoLose();
    });
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    await tapRect(page, RESULT.continueAd);
    await page.waitForTimeout(300);
    expect(await screen(page)).toBe('result');
    expect((await save(page)).adCounters.rewardedByPlacement['rv_continue']).toBe(1);
    // NEXT is disabled on a defeat: a tap on it does nothing
    await tapRect(page, RESULT.next);
    await page.waitForTimeout(200);
    expect(await screen(page)).toBe('result');
    expect(errors).toEqual([]);
  });
});
