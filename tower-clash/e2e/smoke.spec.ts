import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Smoke: PWA files → title → level select (locks) → play level 1 (tutorial + manual send) →
 * reference player wins → result (stars, coins) → next level → level select (level 2 unlocked,
 * level 3 locked) → pause menu (speed toggle) → save persisted. Everything is canvas-drawn, so the
 * test taps logical (720×1280) coordinates converted with `window.__towerclash.toClient` and reads
 * state via the debug surface.
 *
 * The spec deliberately imports nothing from src/: Node 22 strips types natively for ESM `.ts`
 * imports (parameter properties and JSON imports then fail to load), so the few hit regions it
 * needs are mirrored here with a pointer to their source of truth. If one of these drifts the
 * corresponding tap will miss and the poll below will say which screen we are stuck on.
 */

// src/render/layout.ts — TITLE
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const TITLE_SETTINGS = { x: 180, y: 780, w: 172, h: 64 };
// src/render/layout.ts — SETTINGS
const SETTINGS = { back: { x: 18, y: 20, w: 140, h: 60 }, sound: { x: 470, y: 216, w: 160, h: 56 } };
// src/render/layout.ts — LEVEL_MAP + levelNodeRect (winding path map; the test scrolls the map to 0 first)
const LEVEL_MAP = { nodeR: 46, top: 260, step: 150, amp: 185, period: 5 };
function levelNodeRect(index: number, scroll = 0): { x: number; y: number; w: number; h: number } {
  const cx = 360 + LEVEL_MAP.amp * Math.sin((index * Math.PI * 2) / LEVEL_MAP.period);
  const cy = LEVEL_MAP.top + index * LEVEL_MAP.step - scroll;
  const r = LEVEL_MAP.nodeR;
  return { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
}
const HUD = { mapTop: 96, mapBottom: 1180, pause: { x: 636, y: 18, w: 66, h: 60 }, mute: { x: 560, y: 18, w: 62, h: 60 } };
const BOOSTERS = { overdrive: { x: 232, y: 1186, w: 66, h: 88 } };
const RESULT = { next: { x: 84, y: 780, w: 170, h: 72 } };
const PAUSE = { resume: { x: 210, y: 566, w: 300, h: 76 }, speed: { x: 210, y: 662, w: 300, h: 64 } };
// src/render/layout.ts — TITLE.wallet (tap → shop), SHOP (header back, crystal pack cards, restore button)
const TITLE_WALLET = { x: 120, y: 1172, w: 480, h: 52 };
const SHOP_BACK = { x: 18, y: 20, w: 140, h: 60 };
const SHOP_PACK_0 = { x: 34, y: 200, w: 316, h: 262 };
// restore button sits 24 px under the last pack row (3 rows of 262 + 18 gap): y = 200 + 3*280 - 18 + 24
const SHOP_RESTORE = { x: 160, y: 1046, w: 400, h: 60 };
// src/ui/save.ts — v3 is current; the test seeds a v1 save to exercise the v1 → v3 migration
const SAVE_KEY = 'towerclash.save.v3';
const SAVE_KEY_V1 = 'towerclash.save.v1';
const SEEDED_COINS = 100;
// src/sim/constants.ts
const COINS_PER_STAR = 10;
const OVERDRIVE_COST = 30;

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
const levelId = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.levelId ?? -1);
const hint = (page: Page) => page.evaluate(() => window.__towerclash.getTutorialHint());
const unlocked = (page: Page, ids: number[]) => page.evaluate((list) => list.map((id) => window.__towerclash.isLevelUnlocked(id)), ids);
const towerUnits = (page: Page, id: string) =>
  page.evaluate((tid) => window.__towerclash.getState()?.towers[tid]?.units ?? -1, id);
const readSave = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw
      ? (JSON.parse(raw) as {
          version?: number;
          stars: Record<string, number>;
          gold: number;
          crystals: number;
          entitlements: { noAds: boolean };
          settings: { sound: boolean; reducedMotion?: string };
        })
      : null;
  }, SAVE_KEY);
const coins = (page: Page) => page.evaluate(() => window.__towerclash.getCoins());
const boosters = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.boosters ?? []);

/** Stars by clear time, mirrors src/ui/save.ts starsFor (GDD §2.4). */
function expectedStars(level: { star3: number; star2: number }, timeMs: number): number {
  return timeMs <= level.star3 ? 3 : timeMs <= level.star2 ? 2 : 1;
}

test.describe('Tower Clash smoke', () => {
  test('pwa → title → settings → level select → tutorial level 1 + booster → win → coins → unlock → pause menu', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    // Seed an old (v1) save with coins so the booster bar has something to spend and the
    // v1 → v2 migration runs on boot.
    await page.addInitScript(
      ([key, seeded]) => {
        if (!localStorage.getItem('towerclash.save.v3'))
          localStorage.setItem(key, JSON.stringify({ stars: {}, coins: seeded, settings: { sendRatio: 1, colorBlind: false, sound: true } }));
      },
      [SAVE_KEY_V1, SEEDED_COINS] as const,
    );

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

    // (a2) PWA plumbing: manifest linked and served, service worker script served, icons served.
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();
    const manifestRes = await page.request.get(new URL(manifestHref!, page.url()).href);
    expect(manifestRes.status()).toBe(200);
    const manifest = (await manifestRes.json()) as { name: string; display: string; icons: { src: string }[] };
    expect(manifest.name).toBe('Tower Clash');
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      const res = await page.request.get(new URL(icon.src, manifestRes.url()).href);
      expect(res.status(), `icon ${icon.src}`).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
    expect((await page.request.get('/sw.js')).status()).toBe(200);
    expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('viewport-fit=cover');
    // the v1 save was migrated: v3 key present, coins → gold, crystals 0, reducedMotion defaulted
    const migrated = await readSave(page);
    expect(migrated?.version).toBe(3);
    expect(migrated?.gold).toBe(SEEDED_COINS);
    expect(migrated?.crystals).toBe(0);
    expect(migrated?.settings.reducedMotion).toBe('auto');
    expect(await coins(page)).toBe(SEEDED_COINS);
    // let the title frame animate once before shooting it
    await page.waitForTimeout(250);
    await shot(page, 'title');

    // (a4) economy: the wallet pills open the shop; a fake-store purchase of the 100-crystal pack
    //      lands in the save after the store resolves; RESTORE grants a store-reported non-consumable.
    await tapRect(page, TITLE_WALLET);
    await expect.poll(() => screen(page)).toBe('shop');
    await tapRect(page, SHOP_PACK_0);
    await expect.poll(async () => (await readSave(page))?.crystals, { timeout: 5000 }).toBe(100);
    await page.evaluate(() => window.__towerclash.economy.configureFakeStore({ owned: ['remove_ads'] }));
    await tapRect(page, SHOP_RESTORE);
    await expect.poll(async () => (await readSave(page))?.entitlements.noAds, { timeout: 5000 }).toBe(true);
    expect((await readSave(page))?.crystals).toBe(150); // remove_ads grants 50 crystals, once
    await tapRect(page, SHOP_RESTORE);
    await page.waitForTimeout(400);
    expect((await readSave(page))?.crystals).toBe(150);
    await shot(page, 'shop');
    await tapRect(page, SHOP_BACK);
    await expect.poll(() => screen(page)).toBe('title');

    // (a3) settings: gear → settings screen, sound toggle persists, BACK returns to the title.
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await shot(page, 'settings');
    await tapRect(page, SETTINGS.sound);
    await expect.poll(async () => (await readSave(page))?.settings.sound).toBe(false);
    await tapRect(page, SETTINGS.sound);
    await expect.poll(async () => (await readSave(page))?.settings.sound).toBe(true);
    await tapRect(page, SETTINGS.back);
    await expect.poll(() => screen(page)).toBe('title');

    // (b) PLAY → level select (winding path map): authored levels present, the map opens on the
    //     current level (level 1 on a fresh save → scroll 0), first three nodes reachable without
    //     scrolling, only level 1 unlocked and a tap on a locked node does nothing.
    await tapRect(page, TITLE_PLAY);
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(LEVEL_FILES.length).toBeGreaterThanOrEqual(5);
    expect(await page.evaluate(() => window.__towerclash.getLevelSelectScroll())).toBe(0);
    for (let i = 0; i < 3; i++) {
      const r = levelNodeRect(i);
      expect(r.y + r.h).toBeLessThanOrEqual(1280);
      expect(r.x + r.w).toBeLessThanOrEqual(720);
    }
    expect(await unlocked(page, [1, 2, 3])).toEqual([true, false, false]);
    await shot(page, 'levelselect');
    await tapRect(page, levelNodeRect(2)); // level 3: locked
    await page.waitForTimeout(150);
    expect(await screen(page)).toBe('levelSelect');
    await tapRect(page, levelNodeRect(1)); // level 2: locked
    await page.waitForTimeout(150);
    expect(await screen(page)).toBe('levelSelect');

    // (c) tap level 1 → play screen, sim time advances, tutorial hint shown on a fresh save.
    await tapRect(page, levelNodeRect(0));
    await expect.poll(() => screen(page)).toBe('play');
    expect(await levelId(page)).toBe(1);
    const t0 = await simTime(page);
    expect(t0).toBeGreaterThanOrEqual(0);
    await expect.poll(() => simTime(page)).toBeGreaterThan(t0);
    expect(await hint(page)).toBe('Tap your tower');

    // Manual send: tap the player tower ("home") then the neutral tower ("camp") — level 1's lesson.
    // Each tutorial hint must disappear on its matching action.
    const level1 = readLevel(LEVEL_FILES[0]!);
    expect(level1.id).toBe(1);
    const home = level1.towers.find((t) => t.id === 'home')!;
    const camp = level1.towers.find((t) => t.id === 'camp')!;
    expect(home.y).toBeGreaterThan(HUD.mapTop);
    expect(home.y).toBeLessThan(HUD.mapBottom);
    const garrisonBefore = await towerUnits(page, 'home');
    expect(garrisonBefore).toBeGreaterThan(0);
    await tapAt(page, home.x, home.y);
    await expect.poll(() => hint(page), { message: 'first hint should clear once home is selected' }).toBe('Now tap the grey tower');
    await tapAt(page, camp.x, camp.y);
    await expect.poll(() => hint(page), { message: 'second hint should clear after the send' }).toBeNull();
    await expect.poll(() => towerUnits(page, 'home'), { message: 'home garrison should drop after send' }).toBeLessThan(
      garrisonBefore,
    );
    await expect
      .poll(() => page.evaluate(() => window.__towerclash.getState()?.units.length ?? 0), {
        message: 'units should be marching on the road',
      })
      .toBeGreaterThan(0);

    // (c2) booster bar: OVERDRIVE costs 30 coins, lands in state.boosters and persists the balance;
    //      a second tap while it runs is ignored (one active per type).
    expect(await boosters(page)).toEqual([]);
    await tapRect(page, BOOSTERS.overdrive);
    await expect.poll(() => coins(page)).toBe(SEEDED_COINS - OVERDRIVE_COST);
    await expect.poll(async () => (await boosters(page)).map((b) => b.type)).toEqual(['overdrive']);
    expect((await readSave(page))?.gold).toBe(SEEDED_COINS - OVERDRIVE_COST);
    await tapRect(page, BOOSTERS.overdrive);
    await page.waitForTimeout(150);
    expect(await coins(page)).toBe(SEEDED_COINS - OVERDRIVE_COST);
    expect((await boosters(page)).length).toBe(1);
    await shot(page, 'play');
    // HUD mute toggles the persisted sound setting
    await tapRect(page, HUD.mute);
    await expect.poll(async () => (await readSave(page))?.settings.sound).toBe(false);
    await tapRect(page, HUD.mute);
    await expect.poll(async () => (await readSave(page))?.settings.sound).toBe(true);
    const coinsBeforeWin = SEEDED_COINS - OVERDRIVE_COST;

    // (d) reference player at ×10 wins within 60 s wall-clock. Restart the level first so the bot plays
    // from the authored opening state: the manual send above depends on wall-clock timing (a slow CI
    // runner can let the rusher take the emptied home tower before autoplay starts).
    await page.evaluate(() => {
      window.__towerclash.loadLevel(1, 1); // fixed seed: the bot's win on seed 1 is verified by `npm run playtest`
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => levelId(page)).toBe(1);
    await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
    const finalState = await page.evaluate(() => window.__towerclash.getState());
    expect(finalState).not.toBeNull();
    const enemyOwned = Object.values(finalState!.towers).filter((t) => t.owner.startsWith('enemy'));
    expect(enemyOwned, 'player must own or neutralise every enemy tower').toHaveLength(0);
    const stars = expectedStars(level1, finalState!.time);
    expect(stars).toBeGreaterThanOrEqual(1);
    const saveAfterWin = await readSave(page);
    expect(saveAfterWin?.stars['1']).toBe(stars);
    // result screen shows the coins of this (first) clear and the running total
    const result = await page.evaluate(() => window.__towerclash.getResult());
    expect(result).toEqual({ outcome: 'won', stars, coinsEarned: stars * COINS_PER_STAR, coinsTotal: coinsBeforeWin + stars * COINS_PER_STAR, crystalsEarned: 0 });
    expect(saveAfterWin?.gold).toBe(result!.coinsTotal);
    await page.waitForTimeout(250); // let capture effects fade so the shot shows the overlay
    await shot(page, 'result');

    // (e) NEXT → level 2 starts playing at normal speed (it is unlocked by the level 1 star).
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    await tapRect(page, RESULT.next);
    await expect.poll(() => screen(page)).toBe('play');
    expect(await levelId(page)).toBe(2);
    expect(await hint(page), 'level 2 has its own tutorial on a fresh save').not.toBeNull();

    // (e2) back to level select: level 2 unlocked, level 3 still locked; tapping level 3 does nothing,
    //      tapping level 2 starts it.
    await page.keyboard.press('Escape');
    await expect.poll(() => screen(page)).toBe('levelSelect');
    expect(await unlocked(page, [1, 2, 3])).toEqual([true, true, false]);
    // the map opens on the current level (2); pin the scroll so the mirrored node rects apply
    await page.evaluate(() => window.__towerclash.setLevelSelectScroll(0));
    await shot(page, 'levelselect-unlocked');
    await tapRect(page, levelNodeRect(2));
    await page.waitForTimeout(150);
    expect(await screen(page)).toBe('levelSelect');
    await tapRect(page, levelNodeRect(1));
    await expect.poll(() => screen(page)).toBe('play');
    expect(await levelId(page)).toBe(2);

    // (f) pause menu: P pauses (sim frozen, tutorial hidden), speed toggle ×1→×2, RESUME continues at ×2.
    await page.keyboard.press('p');
    await page.waitForTimeout(100);
    const pausedAt = await simTime(page);
    await page.waitForTimeout(300);
    expect(await simTime(page)).toBe(pausedAt);
    expect(await hint(page)).toBeNull();
    await shot(page, 'paused');
    await tapRect(page, PAUSE.speed);
    await expect.poll(() => page.evaluate(() => window.__towerclash.getSpeed())).toBe(2);
    await tapRect(page, PAUSE.resume);
    await expect.poll(() => simTime(page)).toBeGreaterThan(pausedAt);
    await tapRect(page, HUD.pause); // HUD button pauses too
    await page.waitForTimeout(100);
    const pausedAgain = await simTime(page);
    await page.waitForTimeout(200);
    expect(await simTime(page)).toBe(pausedAgain);
    await tapRect(page, PAUSE.speed); // back to ×1
    expect(await page.evaluate(() => window.__towerclash.getSpeed())).toBe(1);
    await tapRect(page, PAUSE.resume);

    // (g) save survives: stars for level 1 persisted in localStorage, coins earned.
    const save = await readSave(page);
    expect(save).not.toBeNull();
    expect(save!.stars['1']).toBeGreaterThanOrEqual(1);
    expect(save!.stars['1']).toBe(stars);
    expect(save!.gold).toBe(coinsBeforeWin + stars * COINS_PER_STAR);

    // whole flow must be free of console errors and uncaught exceptions
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
