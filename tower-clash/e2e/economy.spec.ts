import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Economy (Phase A, docs/ECONOMY.md): commander upgrades reach the sim as `state.modifiers`, skins
 * equip from the shop, the level-break interstitial obeys its gating rules, and the defeat screen's
 * "Reinforcements" continue rewinds the running level ~20 s (snapshot ring) with a free Freeze and
 * +15 troops — once per attempt, the star clock keeps the original start. Ads come from the fake
 * provider installed through `window.__towerclash.economy.setAdsAvailable(true)`; on the plain web
 * build every rewarded button is hidden (the provider is unavailable). ECON-4 / ECON-2 UI:
 * achievements (trophy screen, once-only crystal grants), crystals → gold conversion with a confirm
 * card, the booster crate, and the settings About block (version, support id, privacy options).
 *
 * Like smoke.spec.ts this file imports nothing from src/; hit regions are mirrored from
 * src/render/layout.ts (SHOP, RESULT) with a pointer to their source of truth.
 */

// src/render/layout.ts — SHOP (content cards are in content space; the tests never scroll)
const SHOP = { tabs: { x: 30, y: 112, w: 660, h: 60 }, back: { x: 18, y: 20, w: 140, h: 60 } };
const SHOP_TABS = ['crystals', 'bundles', 'skins', 'upgrades'] as const;
type R = { x: number; y: number; w: number; h: number };
function shopRowRect(i: number): R {
  return { x: 34, y: 200 + i * (168 + 16), w: 652, h: 168 };
}
function shopPackRect(i: number): R {
  return { x: 34 + (i % 2) * (316 + 20), y: 200 + Math.floor(i / 2) * (262 + 18), w: 316, h: 262 };
}
// the convert card takes the grid slot after the 5 crystal packs; its segmented picker and CONVERT button
const CONVERT_CARD = shopPackRect(5);
const CONVERT_SEG = { x: CONVERT_CARD.x + 24, y: CONVERT_CARD.y + 96, w: CONVERT_CARD.w - 48, h: 52 };
const CONVERT_BUY = { x: CONVERT_CARD.x + 24, y: CONVERT_CARD.y + CONVERT_CARD.h - 54 - 16, w: CONVERT_CARD.w - 48, h: 54 };
const CONVERT_CONFIRM = { yes: { x: 130, y: 676, w: 210, h: 72 }, no: { x: 380, y: 676, w: 210, h: 72 } };
// src/render/layout.ts — TITLE.achievements / TITLE.settings, ACHIEVEMENTS_LAYOUT.back, settingsAboutLayout(true, true)
// (SETTINGS.about.y = 920 since the language row: copy.y = 920 + 22 + 62 + 31 − 24, privacy.y = 920 + 22 + 2·62 + 10)
const TITLE_ACHIEVEMENTS = { x: 18, y: 990, w: 128, h: 132 };
const TITLE_SETTINGS = { x: 180, y: 780, w: 172, h: 64 };
const ACHIEVEMENTS_BACK = { x: 18, y: 20, w: 140, h: 60 };
const ABOUT_COPY = { x: 522, y: 1011, w: 118, h: 48 };
const ABOUT_PRIVACY = { x: 160, y: 1076, w: 400, h: 60 };
// src/economy/catalog.ts — CONVERSION, CRYSTAL_SERVICES.boosterCrate, ACHIEVEMENTS crystals
const CONVERSION = { goldPerCrystal: 5, packs: [20, 100, 500] };
const CRATE = { cost: 60, charges: { overdrive: 5, freeze: 3, airstrike: 2 } };
const FIRST_WIN_CRYSTALS = 5;
const STARS_10_CRYSTALS = 10;
function shopSkinRect(top: number, i: number): { x: number; y: number; w: number; h: number } {
  return { x: 34 + (i % 3) * (208 + 14), y: top + 46 + Math.floor(i / 3) * (236 + 16), w: 208, h: 236 };
}
const SKIN_ROOFS_TOP = 194; // SHOP.row.y0 - 6
// roofs (4 → 2 rows) then helmets (5 → 2 rows) then terrain themes (3), each section 22 px under the previous one
const SKIN_HELMETS_TOP = SKIN_ROOFS_TOP + 46 + 2 * (236 + 16) - 16 + 22;
const SKIN_THEMES_TOP = SKIN_HELMETS_TOP + 46 + 2 * (236 + 16) - 16 + 22;
// src/render/layout.ts — RESULT
const RESULT = { next: { x: 84, y: 780, w: 170, h: 72 }, menu: { x: 466, y: 780, w: 170, h: 72 }, continueAd: { x: 368, y: 700, w: 268, h: 62 } };
const SAVE_KEY = 'towerclash.save.v3';
// src/economy/catalog.ts — COMMANDER_UPGRADES: Capacity (row 1) is the cheap 5-step ladder (60 / 120 …, +5 % per
// tier); Production (row 0) starts at 200 after the 2026-09-13 retune. CRYSTAL_SERVICES.continue, SKINS.
const CAPACITY_ROW = 1;
const TIER1_COST = 60;
const CAPACITY_PER_TIER = 0.05;
const SLATE_COST = 80;
const DUSK_COST = 150;
// src/sim/constants.ts — CONTINUE_REWIND_MS / CONTINUE_FREEZE_MS; a level + seed the "auto lose" helper loses
// after the full rewind window (~27 s of sim time) so the continue really goes back 20 s (tests/ui/continue.test.ts)
const CONTINUE_REWIND_MS = 20_000;
const REWIND_LEVEL = 15;
const REWIND_SEED = 2; // seed 3 wins under rules v2.1 + the level-15 retune (the trickle pauses enemy production); seed 2 loses at 68 s

async function tapRect(page: Page, r: R): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}

/** Tap segment `i` of a segmented control drawn with `drawSegmented` (4 px inset, equal widths). */
async function tapSegment(page: Page, r: R, count: number, i: number): Promise<void> {
  const segW = (r.w - 8) / count;
  await tapRect(page, { x: r.x + 4 + i * segW, y: r.y, w: segW, h: r.h });
}

async function tapTab(page: Page, tab: (typeof SHOP_TABS)[number]): Promise<void> {
  await tapSegment(page, SHOP.tabs, SHOP_TABS.length, SHOP_TABS.indexOf(tab));
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const save = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.economy.getSave())) as SaveShape);
interface SaveShape {
  gold: number;
  crystals: number;
  upgrades: Record<string, number>;
  skins: { owned: string[]; equipped: { roof: string | null; helmet: string | null; theme: string | null } };
  charges: { overdrive: number; freeze: number; airstrike: number };
  adCounters: { levelsCompleted: number; rewardedByPlacement: Record<string, number> };
  entitlements: { noAds: boolean };
  achievements: { unlocked: string[] };
}

/** Reference player at ×10 on level 1, seed 1 (verified by `npm run playtest`) → result screen. */
async function winLevelOne(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__towerclash.loadLevel(1, 1);
    window.__towerclash.setSpeed(10);
    window.__towerclash.autoplay();
  });
  await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
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
    await tapRect(page, shopRowRect(CAPACITY_ROW)); // Capacity tier 1
    await expect.poll(async () => (await save(page)).upgrades.capacity).toBe(1);
    expect((await save(page)).gold).toBe(100 - TIER1_COST);
    await tapRect(page, shopRowRect(CAPACITY_ROW)); // tier 2 costs 120: unaffordable, nothing changes
    await page.waitForTimeout(150);
    expect((await save(page)).upgrades.capacity).toBe(1);
    expect((await save(page)).gold).toBe(100 - TIER1_COST);
    await tapRect(page, shopRowRect(0)); // Production tier 1 costs 200: unaffordable too
    await page.waitForTimeout(150);
    expect((await save(page)).upgrades.production ?? 0).toBe(0);
    await page.evaluate(() => window.__towerclash.loadLevel(1, 1));
    await expect.poll(() => screen(page)).toBe('play');
    const mods = await page.evaluate(() => window.__towerclash.getState()?.modifiers);
    expect(mods).toEqual({ productionMul: 1, capacityMul: 1 + CAPACITY_PER_TIER, startGarrisonBonus: 0, unitSpeedMul: 1 });
    expect(errors).toEqual([]);
  });

  test('achievements: the trophy opens the screen (star goals pay on entry), a first win unlocks First victory once', async ({ page }) => {
    const stars: Record<string, number> = {};
    for (let id = 1; id <= 10; id++) stars[String(id)] = 3;
    const errors = await boot(page, { version: 3, gold: 0, crystals: 0, stars });
    expect((await save(page)).achievements.unlocked).toEqual([]);
    await tapRect(page, TITLE_ACHIEVEMENTS);
    await expect.poll(() => screen(page)).toBe('achievements');
    // ten 3★ levels were already in the save: entering the screen evaluates and pays the goal, once
    await expect.poll(async () => (await save(page)).achievements.unlocked).toEqual(['stars_10']);
    expect((await save(page)).crystals).toBe(STARS_10_CRYSTALS);
    await tapRect(page, ACHIEVEMENTS_BACK);
    await expect.poll(() => screen(page)).toBe('title');
    await tapRect(page, TITLE_ACHIEVEMENTS);
    await expect.poll(() => screen(page)).toBe('achievements');
    expect((await save(page)).crystals).toBe(STARS_10_CRYSTALS); // re-entering grants nothing
    await page.keyboard.press('Escape');
    await expect.poll(() => screen(page)).toBe('title');
    // first win → First victory (+5); the same win again unlocks nothing new
    await winLevelOne(page);
    const first = await page.evaluate(() => window.__towerclash.getResult());
    expect(first?.outcome).toBe('won');
    expect(first?.achievements).toContain('first_win');
    let s = await save(page);
    expect(s.achievements.unlocked).toContain('first_win');
    expect(s.crystals).toBeGreaterThanOrEqual(STARS_10_CRYSTALS + FIRST_WIN_CRYSTALS);
    const crystalsAfterFirst = s.crystals;
    await winLevelOne(page);
    const second = await page.evaluate(() => window.__towerclash.getResult());
    expect(second?.achievements).toEqual([]); // identical seed → identical facts → nothing new
    s = await save(page);
    expect(s.crystals).toBe(crystalsAfterFirst);
    expect(new Set(s.achievements.unlocked).size).toBe(s.achievements.unlocked.length);
    expect(errors).toEqual([]);
  });

  test('crystals → gold conversion: pick a pack, confirm (cancel changes nothing), never without the crystals', async ({ page }) => {
    const [small, mid] = CONVERSION.packs as [number, number, number];
    const errors = await boot(page, { version: 3, gold: 0, crystals: mid });
    await page.evaluate(() => window.__towerclash.economy.openShop('crystals'));
    await expect.poll(() => screen(page)).toBe('shop');
    // small pack, then CANCEL on the confirm card → balances untouched
    await tapSegment(page, CONVERT_SEG, CONVERSION.packs.length, 0);
    await tapRect(page, CONVERT_BUY);
    await page.waitForTimeout(150);
    await tapRect(page, CONVERT_CONFIRM.no);
    await page.waitForTimeout(150);
    expect(await save(page)).toMatchObject({ gold: 0, crystals: mid });
    // mid pack, CONVERT → confirm → crystals gone, gold at the catalog rate
    await tapSegment(page, CONVERT_SEG, CONVERSION.packs.length, 1);
    await tapRect(page, CONVERT_BUY);
    await page.waitForTimeout(150);
    await tapRect(page, CONVERT_CONFIRM.yes);
    await expect.poll(async () => (await save(page)).gold).toBe(mid * CONVERSION.goldPerCrystal);
    expect((await save(page)).crystals).toBe(0);
    // no crystals left: CONVERT only toasts (no confirm card), nothing moves
    await tapSegment(page, CONVERT_SEG, CONVERSION.packs.length, 0);
    await tapRect(page, CONVERT_BUY);
    await page.waitForTimeout(200);
    expect(await save(page)).toMatchObject({ gold: mid * CONVERSION.goldPerCrystal, crystals: 0 });
    expect(small).toBeLessThan(mid);
    expect(errors).toEqual([]);
  });

  test('booster crate in the Bundles tab adds pre-paid charges for crystals, stacking, until unaffordable', async ({ page }) => {
    const errors = await boot(page, { version: 3, gold: 0, crystals: CRATE.cost * 2 + 10, charges: { overdrive: 1, freeze: 0, airstrike: 0 } });
    await page.evaluate(() => window.__towerclash.economy.openShop('bundles'));
    await expect.poll(() => screen(page)).toBe('shop');
    await tapRect(page, shopRowRect(0)); // the crate is the first row
    await expect.poll(async () => (await save(page)).charges).toEqual({ overdrive: 1 + 5, freeze: 3, airstrike: 2 });
    expect((await save(page)).crystals).toBe(CRATE.cost + 10);
    await tapRect(page, shopRowRect(0));
    await expect.poll(async () => (await save(page)).charges).toEqual({ overdrive: 11, freeze: 6, airstrike: 4 });
    expect((await save(page)).crystals).toBe(10);
    await tapRect(page, shopRowRect(0)); // 10 crystals: unaffordable
    await page.waitForTimeout(200);
    expect((await save(page)).charges).toEqual({ overdrive: 11, freeze: 6, airstrike: 4 });
    expect((await save(page)).crystals).toBe(10);
    expect(CRATE.charges).toEqual({ overdrive: 5, freeze: 3, airstrike: 2 });
    expect(errors).toEqual([]);
  });

  test('settings About: version always; support id + COPY and PRIVACY OPTIONS only when the native providers say so', async ({ page, context }) => {
    const errors = await boot(page, { version: 3, gold: 0, crystals: 0 });
    // web providers: no support id, no privacy options
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await page.waitForTimeout(200); // the provider probe is async
    const web = await page.evaluate(() => window.__towerclash.economy.getAboutInfo());
    expect(web?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(web?.supportId).toBeNull();
    expect(web?.privacyOptions).toBe(false);
    await page.keyboard.press('Escape');
    await expect.poll(() => screen(page)).toBe('title');
    // native-like providers: both rows appear; COPY puts the id on the clipboard
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => window.__towerclash.economy.setNativeInfo({ supportId: 'rc-test-1234', privacyOptionsRequired: true }));
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await expect.poll(() => page.evaluate(() => window.__towerclash.economy.getAboutInfo())).toEqual({ version: web!.version, supportId: 'rc-test-1234', privacyOptions: true });
    await tapRect(page, ABOUT_COPY);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('rc-test-1234');
    await tapRect(page, ABOUT_PRIVACY); // the web ads provider has no form: a toast, never a crash
    await page.waitForTimeout(200);
    expect(await screen(page)).toBe('settings');
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
    // terrain themes (ECON-10) sit below the fold: scroll to the end, the card rects move up by the scroll
    await page.evaluate(() => window.__towerclash.economy.grant('crystals_550'));
    const scroll = await page.evaluate(() => window.__towerclash.economy.shopScroll(10_000));
    expect(scroll).toBeGreaterThan(0);
    const themeCard = (i: number) => {
      const r = shopSkinRect(SKIN_THEMES_TOP, i);
      return { ...r, y: r.y - scroll };
    };
    const before = (await save(page)).crystals;
    expect(before).toBeGreaterThanOrEqual(DUSK_COST);
    await tapRect(page, themeCard(0)); // Dusk, 150 crystals
    await expect.poll(async () => (await save(page)).skins.equipped.theme).toBe('theme_dusk');
    s = await save(page);
    expect(s.crystals).toBe(before - DUSK_COST);
    expect(s.skins.owned).toEqual(['roof_slate', 'theme_dusk']);
    expect(s.skins.equipped.roof).toBe('roof_slate'); // its own slot: the roof stays equipped
    await tapRect(page, themeCard(0)); // equipped → untinted
    await expect.poll(async () => (await save(page)).skins.equipped.theme).toBeNull();
    await tapRect(page, themeCard(0));
    await expect.poll(async () => (await save(page)).skins.equipped.theme).toBe('theme_dusk');
    await page.evaluate(() => window.__towerclash.economy.shopScroll(0));
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

  test('defeat → CONTINUE (rewarded video) rewinds the level ~20 s with a free Freeze, once per attempt', async ({ page }) => {
    const errors = await boot(page, { version: 3, gold: 0, crystals: 0, stars: { '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1, '8': 1, '9': 1, '10': 1, '11': 1, '12': 1, '13': 1, '14': 1 } });
    await page.evaluate(() => window.__towerclash.economy.setAdsAvailable(true));
    await page.evaluate(
      ([lvl, seed]) => {
        window.__towerclash.loadLevel(lvl, seed);
        window.__towerclash.setSpeed(20);
        window.__towerclash.economy.autoLose();
      },
      [REWIND_LEVEL, REWIND_SEED] as const,
    );
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('lost');
    const lost = await page.evaluate(() => window.__towerclash.economy.getClock()!);
    expect(lost.continued).toBe(false);
    expect(lost.elapsedMs).toBe(lost.timeMs);
    expect(lost.timeMs).toBeGreaterThanOrEqual(CONTINUE_REWIND_MS + 2000);
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    await tapRect(page, RESULT.continueAd);
    await expect.poll(() => screen(page)).toBe('play');
    const cont = await page.evaluate(() => {
      const s = window.__towerclash.getState()!;
      const clock = window.__towerclash.economy.getClock()!;
      return { ...clock, levelId: s.levelId, freeze: s.boosters.some((b) => b.type === 'freeze' && b.owner === 'player' && b.untilMs > s.time), mods: s.modifiers };
    });
    expect(cont.levelId).toBe(REWIND_LEVEL);
    expect(cont.continued).toBe(true);
    expect(cont.mods.startGarrisonBonus).toBe(0); // a rewind, not the +15 garrison restart
    expect(lost.timeMs - cont.timeMs).toBeGreaterThanOrEqual(15_000); // the sim went back (≥ 20 s minus the ×1 drift since the tap)
    expect(cont.elapsedMs - cont.timeMs).toBeGreaterThanOrEqual(CONTINUE_REWIND_MS); // the star clock keeps the original start
    expect(cont.freeze).toBe(true);
    expect((await save(page)).adCounters.rewardedByPlacement['rv_continue']).toBe(1);
    expect((await page.evaluate(() => window.__towerclash.economy.getAdStats())).fakeRewarded).toBe(1);
    // the reinforced attempt plays on (auto-lose is still on) and offers no second continue. Under
    // rules v2 the free Freeze can let the trickle capture the drained enemy towers, so the second
    // result may be a win; a second defeat must not offer CONTINUE again and keeps NEXT disabled.
    await page.evaluate(() => window.__towerclash.setSpeed(20));
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => window.__towerclash.economy.getClock()))?.continued).toBe(true);
    if ((await page.evaluate(() => window.__towerclash.getResult()))?.outcome === 'lost') {
      await tapRect(page, RESULT.continueAd); // lands on nothing
      await page.waitForTimeout(300);
      expect(await screen(page)).toBe('result');
      // NEXT is disabled on a defeat: a tap on it does nothing
      await tapRect(page, RESULT.next);
      await page.waitForTimeout(200);
      expect(await screen(page)).toBe('result');
    }
    expect((await save(page)).adCounters.rewardedByPlacement['rv_continue']).toBe(1);
    expect(errors).toEqual([]);
  });
});
