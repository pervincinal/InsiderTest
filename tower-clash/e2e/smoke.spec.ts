import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Smoke: PWA files → title → level select (locks) → play level 1 (tutorial + manual stream: select
 * home → guide lines (rules v3) → link → the garrison holds) → reference player wins → result (stars,
 * coins) → next level → level select (level 2 unlocked, level 3 locked) → pause menu (speed toggle) →
 * save persisted; plus the rules v3 blocked tap on level 5. Everything is canvas-drawn, so the test
 * taps logical (720×1280) coordinates converted with `window.__towerclash.toClient` and reads state
 * via the debug surface (and a few canvas pixels for the guide lines, which the sim knows nothing of).
 *
 * The spec deliberately imports nothing from src/: Node 22 strips types natively for ESM `.ts`
 * imports (parameter properties and JSON imports then fail to load), so the few hit regions it
 * needs are mirrored here with a pointer to their source of truth. If one of these drifts the
 * corresponding tap will miss and the poll below will say which screen we are stuck on.
 */

// src/render/layout.ts — TITLE
const TITLE_PLAY = { x: 180, y: 640, w: 360, h: 96 };
const TITLE_SETTINGS = { x: 180, y: 780, w: 172, h: 64 };
// src/render/layout.ts — SETTINGS (+ the language picker: one segment per language in src/ui/i18n.ts LANGUAGES order)
const SETTINGS = { back: { x: 18, y: 20, w: 140, h: 60 }, sound: { x: 470, y: 216, w: 160, h: 56 }, howto: { x: 86, y: 500, w: 548, h: 64 }, language: { x: 86, y: 664, w: 548, h: 56 } };
// src/render/menuLayout.ts — HOWTO (the "How to play" card, FE-3)
const HOWTO = { back: { x: 18, y: 20, w: 140, h: 60 }, close: { x: 180, y: 1054, w: 360, h: 72 } };
const LANGUAGE_ORDER = ['en', 'az', 'ru', 'tr'] as const;
// src/render/layout.ts — TITLE.lang (language chip, tap → next language)
const TITLE_LANG = { x: 630, y: 18, w: 72, h: 44 };
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
const PAUSE = { resume: { x: 210, y: 566, w: 300, h: 76 }, speed: { x: 210, y: 662, w: 300, h: 64 }, howto: { x: 180, y: 960, w: 360, h: 64 } };
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
  /** Rules v3 (GDD §2.0b): wall / water polylines and rocks that block the straight lane between towers. */
  obstacles?: { kind: string; points: { x: number; y: number }[] }[];
}
const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL_FILES = readdirSync(LEVELS_DIR).filter((f) => /^\d{3}-.*\.json$/.test(f)).sort();
const readLevel = (file: string): LevelJson => JSON.parse(readFileSync(new URL(file, LEVELS_DIR), 'utf8')) as LevelJson;

const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}smoke-${name}.png`, scale: 'css' });
/** Look-review shots (rules v2 streams / tutorial), named without the `smoke-` prefix. */
const lookShot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}${name}.png`, scale: 'css' });

/** Tap the centre of a logical rectangle. */
async function tapRect(page: Page, r: { x: number; y: number; w: number; h: number }): Promise<void> {
  await tapAt(page, r.x + r.w / 2, r.y + r.h / 2);
}

/** Tap a logical (720×1280) point. */
async function tapAt(page: Page, lx: number, ly: number): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [lx, ly] as const);
  await page.mouse.click(c.x, c.y);
}

/** Tap segment `i` of a segmented control drawn with `drawSegmented` (4 px inset, equal widths). */
async function tapSegment(page: Page, r: { x: number; y: number; w: number; h: number }, count: number, i: number): Promise<void> {
  const segW = (r.w - 8) / count;
  await tapRect(page, { x: r.x + 4 + i * segW, y: r.y, w: segW, h: r.h });
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
const levelId = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.levelId ?? -1);
const hint = (page: Page) => page.evaluate(() => window.__towerclash.getTutorialHint());
const limitHint = (page: Page) => page.evaluate(() => window.__towerclash.getLimitHint());
/** Active attack streams (`state.links`, rules v2/v3), reduced to what the test asserts on. */
const links = (page: Page) => page.evaluate(() => (window.__towerclash.getState()?.links ?? []).map((l) => ({ owner: l.owner, from: l.from, to: l.to })));
/** The player's streams only (the bot runs its own at the same time). */
const playerLinks = (page: Page) => links(page).then((ls) => ls.filter((l) => l.owner === 'player'));
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
const language = (page: Page) => page.evaluate(() => window.__towerclash.getLanguage());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
const boosters = (page: Page) => page.evaluate(() => window.__towerclash.getState()?.boosters ?? []);
/** Ids of the lanes the sim built for the level (`state.roads`, rules v3: every clear straight pair, id `a-b` with a < b). */
const laneIds = (page: Page) => page.evaluate(() => Object.keys(window.__towerclash.getState()?.roads ?? {}).sort());
/** The logical point `t` of the way from tower `a` to tower `b`. */
const along = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/**
 * Mean RGBA of the 3×3 device pixels of the #game canvas around a logical point. The guide lines
 * of rules v3 (§2.0b item 8) are pure rendering — the sim has no notion of them — so the test reads
 * the canvas: a 2 px owner-coloured line at 45 % alpha shifts the colour under it by far more than
 * the anti-aliasing noise of a still frame.
 */
const pixelAt = (page: Page, p: { x: number; y: number }) =>
  page.evaluate(([x, y]) => {
    const c = document.getElementById('game');
    if (!(c instanceof HTMLCanvasElement)) throw new Error('#game is not a canvas');
    const client = window.__towerclash.toClient(x, y);
    const rect = c.getBoundingClientRect();
    const px = Math.round((client.x - rect.left) * (c.width / rect.width));
    const py = Math.round((client.y - rect.top) * (c.height / rect.height));
    const d = c.getContext('2d')!.getImageData(px - 1, py - 1, 3, 3).data;
    const sum = [0, 0, 0, 0];
    for (let i = 0; i < d.length; i++) sum[i % 4]! += d[i]!;
    return sum.map((v) => v / (d.length / 4));
  }, [p.x, p.y] as const);
const colourDistance = (a: number[], b: number[]) => a.reduce((acc, v, i) => acc + Math.abs(v - (b[i] ?? 0)), 0);
/** Smallest colour change over the probe points since `before` (0 while nothing new is drawn there). */
const GUIDE_LINE_MIN_SHIFT = 12;

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
    await page.waitForTimeout(300); // let the ring / arrow pulse once
    await lookShot(page, 'look3-tutorial');

    // Rules v3 stream: tap the player tower ("home") then the neutral tower ("camp") — level 1's
    // lesson. Each tutorial hint must disappear on its matching action; the tap creates one link
    // and units start marching while the garrison holds.
    const level1 = readLevel(LEVEL_FILES[0]!);
    expect(level1.id).toBe(1);
    const home = level1.towers.find((t) => t.id === 'home')!;
    const camp = level1.towers.find((t) => t.id === 'camp')!;
    const foe = level1.towers.find((t) => t.id === 'foe')!;
    expect(home.y).toBeGreaterThan(HUD.mapTop);
    expect(home.y).toBeLessThan(HUD.mapBottom);
    const garrisonBefore = await towerUnits(page, 'home');
    expect(garrisonBefore).toBeGreaterThan(0);
    expect(await playerLinks(page)).toEqual([]);
    // Rules v3 (GDD §2.0b item 1): level 1 has no obstacles, so every pair is a straight lane.
    expect(level1.obstacles ?? []).toEqual([]);
    expect(await laneIds(page)).toEqual(['camp-foe', 'camp-home', 'foe-home']);
    // (c0) guide lines (§2.0b item 8): selecting home draws a thin line to every tower it has a lane
    //      to. Probe three points of the home → foe segment (only the guide line is ever drawn there:
    //      the tutorial ring / arrow sit on home and camp, the stream below runs on home → camp).
    //      The line is dashed (ART-7: 10 px on / 8 px off in map units), so each probe is a run of
    //      three points 6 px apart along the lane — one of them always lies on a dash — and the
    //      probe's shift is the largest of the three.
    const laneLen = Math.hypot(foe.x - home.x, foe.y - home.y);
    // t ≥ 0.45: closer to home the lane runs under home's garrison badge (a 21 covers t ≈ 0.3–0.4 at
    // the 360 px viewport); t ≤ 0.65 stays clear of the tutorial banner that sits over foe.
    const guideProbes = [0.45, 0.55, 0.65].map((t) => [0, 6, 12].map((px) => along(home, foe, t + px / laneLen)));
    const guideBefore = await Promise.all(guideProbes.map((run) => Promise.all(run.map((p) => pixelAt(page, p)))));
    const probeShift = async (run: { x: number; y: number }[], i: number) =>
      Math.max(...(await Promise.all(run.map(async (p, j) => colourDistance(await pixelAt(page, p), guideBefore[i]![j]!)))));
    const guideShift = async () => Math.min(...(await Promise.all(guideProbes.map(probeShift))));
    await tapAt(page, home.x, home.y);
    await expect.poll(() => hint(page), { message: 'first hint should clear once home is selected' }).toBe('Now tap the grey tower — the stream keeps flowing');
    await expect.poll(guideShift, { message: 'selecting home must draw a guide line along the home → foe lane' }).toBeGreaterThanOrEqual(GUIDE_LINE_MIN_SHIFT);
    await tapAt(page, camp.x, camp.y);
    await expect.poll(() => hint(page), { message: 'second hint should clear after the link' }).toBeNull();
    await expect.poll(() => playerLinks(page), { message: 'the tap should create exactly one player stream' }).toEqual([{ owner: 'player', from: 'home', to: 'camp' }]);
    await expect
      .poll(() => page.evaluate(() => window.__towerclash.getState()?.units.length ?? 0), {
        message: 'units should be marching on the lane',
      })
      .toBeGreaterThan(0);
    // (c0b) the stream carries production, not garrison (§2.0b items 4–5, "say dəyişmir"): over the
    //       next 2 s of sim time the linked home neither drains nor grows. (The foe's first units
    //       cannot land on home before ≈ 8 s of sim time: 1 s emit + 760 px / 120 px/s.)
    //       (`garrisonBefore` was read before the taps: at ×1 the tower grows +1/s until the link
    //       lands, so the hold is measured from the linked garrison, not from that earlier value.)
    const held = await page.evaluate(() => {
      const s = window.__towerclash.getState()!;
      return { units: s.towers['home']!.units, time: s.time };
    });
    expect(held.units).toBeGreaterThanOrEqual(garrisonBefore);
    await expect.poll(() => simTime(page)).toBeGreaterThanOrEqual(held.time + 2000);
    expect(await towerUnits(page, 'home'), 'a streaming tower keeps its garrison: no drain, no growth').toBe(held.units);
    expect(await playerLinks(page)).toEqual([{ owner: 'player', from: 'home', to: 'camp' }]);

    // (c1) link limit: home is L1 (one stream), so a second target ("foe", lane-connected) is refused
    //      with the hint bubble and no second link.
    expect(await limitHint(page)).toBeNull();
    await tapAt(page, foe.x, foe.y);
    await expect.poll(() => limitHint(page), { message: 'a second target at L1 should raise the link-limit hint' }).toBe(await text(page, 'hint.linkLimit').then((s) => s.replaceAll('{n}', '2')));
    expect(await playerLinks(page)).toEqual([{ owner: 'player', from: 'home', to: 'camp' }]);
    await expect.poll(() => limitHint(page), { message: 'the hint fades on its own' }).toBeNull();

    // (c1b) tapping the target again stops the stream (home stays selected).
    await tapAt(page, camp.x, camp.y);
    await expect.poll(() => playerLinks(page), { message: 'the second tap on the target should remove the stream' }).toEqual([]);

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

    // (d) reference player wins within 60 s wall-clock. Restart the level first so the bot plays from
    // the authored opening state: the manual stream above depends on wall-clock timing (a slow CI
    // runner can let the rusher take the drained home tower before autoplay starts). The first
    // seconds run at ×1 for the look shot (a player stream and an enemy stream on screen), then ×10.
    await page.evaluate(() => {
      window.__towerclash.loadLevel(1, 1); // fixed seed: the bot's win on seed 1 is verified by `npm run playtest`
      window.__towerclash.setSpeed(1);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => levelId(page)).toBe(1);
    const bothStreams = await page
      .waitForFunction(
        () => {
          const ls = window.__towerclash.getState()?.links ?? [];
          return ls.some((l) => l.owner === 'player') && ls.some((l) => l.owner !== 'player');
        },
        null,
        { timeout: 20_000 },
      )
      .then(() => true)
      .catch(() => false);
    test.info().annotations.push({ type: 'look3-play-links', description: bothStreams ? 'player + enemy streams on screen' : 'no player+enemy stream pair within 20 s' });
    await lookShot(page, 'look3-play-links');
    await page.evaluate(() => window.__towerclash.setSpeed(10));
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
    expect(result).toMatchObject({ outcome: 'won', stars, coinsEarned: stars * COINS_PER_STAR, coinsTotal: coinsBeforeWin + stars * COINS_PER_STAR, crystalsEarned: 0 });
    // BUG-5: the result also carries the achievements unlocked by this clear; the first win is one of them
    expect(result!.achievements).toContain('first_win');
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

  test('rules v3: a tap on a tower behind a wall is refused with the blocked hint; a clear lane links (level 5)', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    // level 5 "Around the Wall": a wall at x = 360 between home (bottom centre) and foe (top centre);
    // west1 / east1 are clear of it. The level is past the tutorial band, so no hint interferes.
    const level5 = readLevel(LEVEL_FILES[4]!);
    expect(level5.id).toBe(5);
    const home = level5.towers.find((t) => t.id === 'home')!;
    const foe = level5.towers.find((t) => t.id === 'foe')!;
    const west1 = level5.towers.find((t) => t.id === 'west1')!;
    expect(home.owner).toBe('player');
    expect(home.x).toBe(foe.x); // straight up, through the wall
    const wall = (level5.obstacles ?? []).find((o) => o.kind === 'wall' && o.points.every((p) => p.x === home.x))!;
    expect(wall, 'level 5 authors a wall on the home → foe line (src/levels/005-*.json)').toBeTruthy();
    expect(Math.min(...wall.points.map((p) => p.y))).toBeGreaterThan(foe.y);
    expect(Math.max(...wall.points.map((p) => p.y))).toBeLessThan(home.y);

    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
    expect(await page.evaluate(() => window.__towerclash.loadLevel(5, 1))).toBe(true);
    await expect.poll(() => screen(page)).toBe('play');
    expect(await levelId(page)).toBe(5);
    // the sim built no lane through the wall (§2.0b items 1–2) but one to the clear neighbour
    const lanes = await laneIds(page);
    expect(lanes, 'no lane home → foe: the wall blocks the straight line').not.toContain('foe-home');
    expect(lanes, 'home → west1 is clear').toContain('home-west1');

    // tap home, then foe: shake + `hint.blocked`, no link; the hint fades and home stays selected
    await tapAt(page, home.x, home.y);
    await page.waitForTimeout(150);
    expect(await limitHint(page)).toBeNull();
    await tapAt(page, foe.x, foe.y);
    await expect.poll(() => limitHint(page), { message: 'a tap on a tower behind the wall must raise the blocked hint' }).toBe(await text(page, 'hint.blocked'));
    expect(await text(page, 'hint.blocked')).not.toBe('hint.blocked');
    expect(await playerLinks(page)).toEqual([]);
    await expect.poll(() => limitHint(page), { message: 'the hint fades on its own' }).toBeNull();
    await tapAt(page, west1.x, west1.y);
    await expect.poll(() => playerLinks(page), { message: 'home is still selected: the clear target links at once' }).toEqual([{ owner: 'player', from: 'home', to: 'west1' }]);
    expect(await limitHint(page)).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test('FE-3: the "How to play" card opens from settings and from the pause menu and closes back to each', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');

    // settings row → card (title text, look shot) → CLOSE returns to settings; ESC closes too
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await tapRect(page, SETTINGS.howto);
    await expect.poll(() => screen(page)).toBe('howto');
    expect(await text(page, 'howto.title')).toBe('HOW TO PLAY');
    await page.waitForTimeout(250);
    await lookShot(page, 'look3-howto');
    await tapRect(page, HOWTO.close);
    await expect.poll(() => screen(page)).toBe('settings');
    await tapRect(page, SETTINGS.howto);
    await expect.poll(() => screen(page)).toBe('howto');
    await page.keyboard.press('Escape');
    await expect.poll(() => screen(page)).toBe('settings');
    await tapRect(page, SETTINGS.back);
    await expect.poll(() => screen(page)).toBe('title');

    // pause menu → card → BACK returns to the paused game with the sim still frozen
    await page.evaluate(() => window.__towerclash.loadLevel(1, 1));
    await expect.poll(() => screen(page)).toBe('play');
    await page.keyboard.press('p');
    await page.waitForTimeout(100);
    const pausedAt = await simTime(page);
    await tapRect(page, PAUSE.howto);
    await expect.poll(() => screen(page)).toBe('howto');
    expect(await text(page, 'howto.title')).toBe('HOW TO PLAY');
    await tapRect(page, HOWTO.back);
    await expect.poll(() => screen(page)).toBe('play');
    await page.waitForTimeout(200);
    expect(await simTime(page)).toBe(pausedAt);
    await tapRect(page, PAUSE.resume);
    await expect.poll(() => simTime(page)).toBeGreaterThan(pausedAt);
    expect(pageErrors).toEqual([]);
  });

  test('language: detected from the browser on first run, AZ picked in settings changes the title chip, hints and persists', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.getLanguage === 'function');
    // Playwright's default locale is en-US → English, persisted on the first run
    expect(await language(page)).toBe('en');
    expect((await readSaveLang(page))?.settings.language).toBe('en');
    expect(await text(page, 'title.play')).toBe('PLAY');

    // settings → pick Azərbaycanca
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await tapSegment(page, SETTINGS.language, LANGUAGE_ORDER.length, LANGUAGE_ORDER.indexOf('az'));
    await expect.poll(() => language(page)).toBe('az');
    await expect.poll(() => text(page, 'settings.title')).toBe('AYARLAR');
    await expect.poll(async () => (await readSaveLang(page))?.settings.language).toBe('az');
    await page.waitForTimeout(200);
    await shot(page, 'settings-az');
    await tapRect(page, SETTINGS.back);
    await expect.poll(() => screen(page)).toBe('title');
    // title chip + play label are Azerbaijani now
    expect(await text(page, 'title.play')).toBe('OYNA');
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('az');
    await page.waitForTimeout(200);
    await shot(page, 'title-az');

    // tutorial hint of level 1 is translated
    await page.evaluate(() => window.__towerclash.loadLevel(1, 1));
    await expect.poll(() => screen(page)).toBe('play');
    await expect.poll(() => hint(page)).toBe('Öz qüllənə vur');

    // the choice survives a reload; the title chip cycles languages (az → ru) and persists too
    await page.reload();
    await page.waitForFunction(() => typeof window.__towerclash?.getLanguage === 'function');
    expect(await language(page)).toBe('az');
    await tapRect(page, TITLE_LANG);
    await expect.poll(() => language(page)).toBe('ru');
    await expect.poll(() => text(page, 'title.play')).toBe('ИГРАТЬ');
    expect((await readSaveLang(page))?.settings.language).toBe('ru');
    expect(pageErrors).toEqual([]);
  });
});

const readSaveLang = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { settings: { language?: string } }) : null;
  }, SAVE_KEY);
