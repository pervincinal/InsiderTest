#!/usr/bin/env node
/**
 * Renders the store assets from the real game with Playwright (PUB-2, PUB-5).
 *
 *   cd tower-clash && npm run build && node store/tools/renderStoreShots.mjs [--google] [--apple] [--all] [--port=4180]
 *
 * Default (no flag) = `--google`. Output (all PNG, every file kept under 600 KB):
 *
 *   --google
 *   store/screenshots/raw/NN-<name>.png        – uncaptioned 1080×1920 frames (viewport 360×640 @3x), game in English
 *   store/screenshots/raw-<lang>/NN-<name>.png – the same frames with the game's UI in az / ru / tr (PUB-7)
 *   store/screenshots/<lang>/01..08.png        – captioned phone screenshots, en / az / ru / tr: caption *and*
 *                                                in-game text (title, HUD, lesson banner, tutorial hint, shop,
 *                                                result) in that language
 *   store/feature-graphic.png                  – 1024×500 Google Play feature graphic (drawn on canvas)
 *   Google Play accepts any 9:16 size between 320 and 3840 px, so this set may be scaled down
 *   (1080×1920 → 945×1680 → …) until every file fits the size budget.
 *
 *   --apple
 *   store/screenshots/raw-apple-6.7/NN-<name>.png – 1290×2796 frames (viewport 430×932 @3x)
 *   store/screenshots/raw-apple-6.5/NN-<name>.png – 1284×2778 frames (viewport 428×926 @3x)
 *   store/screenshots/apple-6.7/en/01..09.png     – captioned, exactly 1290×2796 (iPhone 6.7"; 09 = App Store extra)
 *   store/screenshots/apple-6.5/en/01..09.png     – captioned, exactly 1284×2778 (iPhone 6.5"), English only
 *   store/iap-review/shop-crystals.png            – uncaptioned 1290×2796 shop frame, Crystals tab: the
 *                                                   App Store Connect "review screenshot" for every in-app
 *                                                   purchase (≥ 640×920). Without `--apple` it is written
 *                                                   from the Google set instead (1080×1920).
 *
 *   Frame 08 (ECON-7) is the shop on its Upgrades tab (Commander upgrades, paid with in-game gold) on a
 *   seeded mid-game save. The public sets deliberately do not use the Crystals tab: it shows the
 *   catalogue's fallback USD prices and the web build's "Test store" line, and a fixed-currency price
 *   in a public screenshot is a consumer-law problem in the EU (STORE_LISTING.md §1.3). The IAP review
 *   frame is the Crystals tab because Apple needs the purchasable product visible in-app.
 *   App Store Connect only accepts these exact sizes, so the Apple sets are never scaled. Every
 *   file is first re-encoded losslessly (`pngRecompress.mjs`); when it is still over budget the
 *   script steps down `APPLE_QUALITY_LADDER` at the same pixel size: fewer colour levels per
 *   channel (canvas posterise) and, when the transitive `sharp` module of `@capacitor/assets`
 *   can be imported, a dithered 256-colour palette (libimagequant). `sharp` is optional: without
 *   it the posterise steps alone still produce a file under the limit.
 *
 * In-game language (PUB-7): every set lists its languages (`SETS[].langs`); the raw frames are captured
 * once per language in a fresh browser context whose `towerclash.save.v3` is pre-seeded with
 * `settings.language` (an init script, so the language is in before the app's first frame — the app
 * reads `save.settings.language` at boot, `bootLanguage` in src/main.ts). The caption of each frame
 * comes from the `SHOTS[].<lang>` column.
 *
 * The script starts `vite preview` on the given port itself and kills it on exit. Chromium is the
 * preinstalled headless shell under /opt/pw-browsers (never run `playwright install` here);
 * in other environments the default Playwright browser is used.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { pngSize, recompressPng } from './pngRecompress.mjs';

/** Optional palette encoder (see header). `null` when the module is not resolvable. */
const sharp = await import('sharp').then((m) => m.default ?? m).catch(() => null);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); // tower-clash/
const STORE = join(ROOT, 'store');
const HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const MAX_BYTES = 600 * 1024;

/* ---------- CLI ---------- */

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const portArg = args.find((a) => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.slice('--port='.length)) : 4180;
const URL = `http://localhost:${PORT}/`;
const DO_APPLE = flag('apple') || flag('all');
const DO_GOOGLE = flag('google') || flag('all') || !flag('apple');
/** The IAP review frame is taken from the Apple 6.7" set (1290×2796) when it is rendered, else from the Google set (1080×1920). */
const IAP_REVIEW_SET = DO_APPLE ? 'apple-6.7' : 'google';

/**
 * Order matters: index N becomes <lang>/0N.png (STORE_LISTING.md §1.3 retake list, v0.4.0 set).
 * `capture` names the frame routine in `captureRaw`; `appleOnly` frames are skipped in the Google
 * set (8 phone screenshots max there, 10 on the App Store).
 */
const SHOTS = [
  { name: 'title', capture: 'title',
    en: 'Capture every tower', az: 'Bütün qüllələri tut', ru: 'Захвати все башни', tr: 'Tüm kuleleri ele geçir' },
  { name: 'level-01-tutorial', capture: 'tutorial',
    en: 'Tap, and the stream flows', az: 'Vur — axın davam edir', ru: 'Нажми — поток пошёл', tr: 'Dokun, akış başlasın' },
  { name: 'level-05-streams', capture: 'streams',
    en: 'Streams keep flowing', az: 'Axınlar dayanmır', ru: 'Потоки не иссякают', tr: 'Akışlar durmaz' },
  { name: 'level-04-upgrade', capture: 'upgrade',
    en: 'Fill up to level up', az: 'Doldur, səviyyə qalxsın', ru: 'Наполни и прокачай', tr: 'Doldur, seviye atla' },
  { name: 'level-05-limit-hint', capture: 'limitHint',
    en: 'Bigger towers, more streams', az: 'Böyük qüllə, çox axın', ru: 'Выше башня — больше потоков', tr: 'Büyük kule, çok akış' },
  { name: 'level-09-fortress', capture: 'fortress',
    en: 'Storm the fortress', az: 'Qalanı ələ keçir', ru: 'Штурмуй крепость', tr: 'Kaleyi fethet' },
  { name: 'result-win', capture: 'result',
    en: 'Three-star every level', az: 'Hər səviyyədə üç ulduz', ru: 'Везде по три звезды', tr: 'Her bölümde üç yıldız' },
  { name: 'shop-upgrades', capture: 'shop', shop: 'upgrades',
    en: 'Boost your commander', az: 'Komandirini gücləndir', ru: 'Прокачай командира', tr: 'Komutanını güçlendir' },
  { name: 'level-15-citadel', capture: 'citadel', appleOnly: true,
    en: 'Silence the guns', az: 'Topları susdur', ru: 'Заглуши пушки', tr: 'Topları sustur' },
];
/** Frames of one set, in order (the Google set drops the App-Store-only extras). */
const shotsFor = (set) => SHOTS.filter((s) => !s.appleOnly || set.exact);

/** Level layouts the frame routines tap (logical 720×1280 tower positions, from src/levels/*.json). */
const LEVEL_5 = { home: { x: 360, y: 1140 }, west1: { x: 150, y: 860 }, east1: { x: 570, y: 860 } };

/** Uncaptioned IAP review frame (Apple): the shop's Crystals tab, written by the first set rendered. */
const IAP_REVIEW = { file: join(STORE, 'iap-review', 'shop-crystals.png'), tab: 'crystals' };

/**
 * Save-v3 seed for the shop frames (`towerclash.save.v3`, normalised by `loadSave` on reload): a
 * plausible mid-game player — levels 1–14 cleared, some gold and crystals earned in play, two
 * Commander tracks already trained so the Upgrades tab shows filled tier pips and "Now / Next"
 * lines. Nothing here is a purchase: no entitlements, no skins, `purchases: []`.
 */
const SHOP_SAVE = {
  version: 3,
  gold: 1450,
  crystals: 140,
  stars: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [String(i + 1), (i + 1) % 3 === 0 ? 2 : 3])),
  upgrades: { production: 2, capacity: 1 },
};

/**
 * One entry per store format. `exact` = the output must keep its pixel size (App Store);
 * otherwise the set may be scaled down to meet the size budget (Google Play). `langs` = the
 * in-game languages captured (one raw directory each; `<lang>/NN.png` carries the matching caption).
 * The Apple sets stay English (Azerbaijani is not an App Store locale; RU/TR App Store sets are not
 * in the listing plan).
 */
const SETS = {
  google: {
    id: 'google',
    viewport: { width: 360, height: 640 },
    scale: 3,
    out: { w: 1080, h: 1920 },
    rawDir: (lang) => join(STORE, 'screenshots', lang === 'en' ? 'raw' : `raw-${lang}`),
    outDir: (lang) => join(STORE, 'screenshots', lang),
    langs: ['en', 'az', 'ru', 'tr'],
    exact: false,
  },
  'apple-6.7': {
    id: 'apple-6.7',
    viewport: { width: 430, height: 932 },
    scale: 3,
    out: { w: 1290, h: 2796 },
    rawDir: () => join(STORE, 'screenshots', 'raw-apple-6.7'),
    outDir: (lang) => join(STORE, 'screenshots', 'apple-6.7', lang),
    langs: ['en'],
    exact: true,
  },
  'apple-6.5': {
    id: 'apple-6.5',
    viewport: { width: 428, height: 926 },
    scale: 3,
    out: { w: 1284, h: 2778 },
    rawDir: () => join(STORE, 'screenshots', 'raw-apple-6.5'),
    outDir: (lang) => join(STORE, 'screenshots', 'apple-6.5', lang),
    langs: ['en'],
    exact: true,
  },
};

/** Save key the app boots from (src/ui/save.ts `SAVE_KEY`); `settings.language` is the in-game language. */
const SAVE_KEY = 'towerclash.save.v3';

/**
 * Re-encode steps for exact-size sets, tried in order until the file is under budget (best
 * quality first). `bits` = colour levels kept per channel (8 = untouched, 6 = 64 levels, not
 * visible on a phone; 5 starts to band on the water gradient); `palette` = dithered 256-colour
 * PNG via `sharp` (skipped when `sharp` is unavailable). Softening or resampling the frame is
 * deliberately not on the ladder: it *grows* the file (flat clay fills compress best when crisp).
 */
const APPLE_QUALITY_LADDER = [
  { bits: 8, palette: false },
  { bits: 6, palette: false },
  { bits: 8, palette: true },
  { bits: 6, palette: true },
  { bits: 5, palette: false },
  { bits: 5, palette: true },
  { bits: 4, palette: false },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rawFile = (set, lang, i) => join(set.rawDir(lang), `${String(i + 1).padStart(2, '0')}-${shotsFor(set)[i].name}.png`);
const outFile = (set, lang, i) => join(set.outDir(lang), `${String(i + 1).padStart(2, '0')}.png`);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/* ---------- preview server ---------- */

/**
 * Readiness probe with `node:http` rather than the global `fetch`: in sandboxes that route Node's
 * fetch through an outbound proxy (`HTTPS_PROXY` set), `fetch('http://localhost:…')` fails while a
 * plain `http.get` — and Chromium — reach the preview server fine.
 */
const httpOk = (url) =>
  new Promise((resolve) => {
    const req = get(url, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 400);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });

async function startPreview() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ missing — run `npm run build` first');
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite preview exited early:\n${log}`);
    if (await httpOk(URL)) return child;
    await sleep(200);
  }
  child.kill('SIGKILL');
  throw new Error(`vite preview did not answer on ${URL} within 30 s:\n${log}`);
}

/* ---------- game driving ---------- */

/**
 * Installed in every game context (init script): the state conditions `playWhile` polls for,
 * keyed by name so nothing is eval'd in the page. `st` is the live `GameState`.
 */
const FRAME_CONDITIONS = () => {
  window.__storeShotCondition = (st, key) => {
    switch (key) {
      case 'bothStreams': // a player ribbon and an enemy ribbon on the roads at the same moment
        return st.links.some((l) => l.owner === 'player') && st.links.some((l) => l.owner !== 'player');
      case 'homeL2': // the player's home tower has just auto-upgraded
        return (st.towers.home?.level ?? 1) >= 2;
      case 'playerToKeep': // the player streams into the fortress
        return st.links.some((l) => l.owner === 'player' && l.to === 'keep');
      case 'fortressUnderFire': // …while the fortress's counter-stream keeps a player tower under fire (swords badge)
        return (
          st.links.some((l) => l.owner === 'player' && l.to === 'keep') &&
          Object.values(st.towers).some((t) => t.owner === 'player' && st.time < t.underFireUntilMs)
        );
      default:
        throw new Error(`unknown frame condition ${key}`);
    }
  };
};

/**
 * Installed in every game context (init script, runs before the app on every navigation incl. the
 * shop-seed reload): pins `settings.language` in the v3 save so the app boots in `lang`. The rest
 * of the save is left as it is (absent on the first load → a fresh save, so level 1 still shows its
 * tutorial and the wallet starts at 0; the seeded shop save on the reload).
 */
const SEED_LANGUAGE = ({ key, lang }) => {
  let save = {};
  try {
    save = JSON.parse(localStorage.getItem(key) ?? '{}') ?? {};
  } catch {
    save = {};
  }
  if (typeof save !== 'object' || Array.isArray(save)) save = {};
  save.version = 3;
  save.settings = { ...(save.settings ?? {}), language: lang };
  localStorage.setItem(key, JSON.stringify(save));
};

/** Fonts the app waits for at boot (src/main.ts `waitForFonts`): Fredoka, plus Nunito for the Cyrillic UI. */
const awaitFonts = (page, lang) =>
  page.evaluate(async (lang) => {
    const fonts = document.fonts;
    if (!fonts) return;
    await fonts.ready;
    const loads = [fonts.load('700 32px Fredoka'), fonts.load('500 32px Fredoka')];
    if (lang === 'ru') loads.push(fonts.load('700 32px Nunito', 'Пауза'), fonts.load('500 32px Nunito', 'Пауза'));
    await Promise.all(loads).catch(() => undefined);
  }, lang);

/** Throws when the app did not boot in the language the context was seeded with. */
async function assertLanguage(page, lang) {
  const live = await page.evaluate(() => window.__towerclash.getLanguage());
  if (live !== lang) throw new Error(`in-game language is "${live}", expected "${lang}" (save seed not applied)`);
}

async function openGame(browser, set, lang) {
  // Fresh context = fresh localStorage, so level 1 shows its tutorial and coins start at 0.
  const context = await browser.newContext({
    viewport: set.viewport,
    deviceScaleFactor: set.scale,
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(FRAME_CONDITIONS);
  await context.addInitScript(SEED_LANGUAGE, { key: SAVE_KEY, lang });
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');
  await awaitFonts(page, lang); // Fredoka (and Nunito for RU) must be in before the first frame
  await assertLanguage(page, lang);
  await page.waitForTimeout(600); // let the title demo animate in
  return page;
}

const screen = (page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);

/** Start `id`, let the reference player fight at ×10 until sim time ≥ `untilMs`, then freeze at ×1. */
async function playUntil(page, id, untilMs) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((lv) => {
      window.__towerclash.setSpeed(1);
      window.__towerclash.loadLevel(lv);
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    }, id);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if ((await screen(page)) !== 'play') break;
      if ((await simTime(page)) >= untilMs) break;
      await sleep(100);
    }
    if ((await screen(page)) === 'play') {
      await page.evaluate(() => window.__towerclash.setSpeed(1)); // no "×10" tag in the HUD
      await page.waitForTimeout(80);
      return;
    }
    untilMs = Math.floor(untilMs / 2); // the bot already won — retry with an earlier frame
  }
  throw new Error(`level ${id}: could not capture a mid-battle frame`);
}

/**
 * Win `id` with the reference player. The result screen freezes the HUD as it was at the moment of
 * victory, so the last seconds run at ×1 (no "×10" tag) after a fast-forward to `fastUntilMs`.
 */
async function playToResult(page, id, fastUntilMs) {
  let result = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((lv) => {
      window.__towerclash.setSpeed(1);
      window.__towerclash.loadLevel(lv);
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    }, id);
    let deadline = Date.now() + 60_000;
    while (Date.now() < deadline && (await screen(page)) === 'play' && (await simTime(page)) < fastUntilMs) await sleep(100);
    await page.evaluate(() => window.__towerclash.setSpeed(1));
    // Generous: the 1290×2796 Apple canvas at ×1 runs well below real time when the machine is busy
    // (e.g. e2e suites in parallel), and the sim advances per rendered frame.
    deadline = Date.now() + 240_000;
    while (Date.now() < deadline && (await screen(page)) !== 'result') await sleep(150);
    result = await page.evaluate(() => window.__towerclash.getResult());
    if (result?.outcome === 'won') break;
    console.log(`level ${id}: bot got ${JSON.stringify(result)}, retrying (timing at ×10 varies between runs)`);
  }
  if (result?.outcome !== 'won') throw new Error(`level ${id}: expected a win, got ${JSON.stringify(result)}`);
  await page.waitForTimeout(1800); // stars pop in one by one; capture particles fade
  return result;
}

/**
 * Start `id` with a fixed seed (optionally under the reference player) at ×`speed` and poll the
 * in-page condition `cond` (see `FRAME_CONDITIONS`) every 50 ms until it holds or sim time passes
 * `maxMs`; then freeze at ×1 (no "×10" tag in the HUD). Returns whether the condition still holds
 * after the freeze, so the frame really shows what it waited for.
 */
async function playWhile(page, id, cond, { seed = 1, autoplay = true, speed = 10, maxMs = 90_000 } = {}) {
  await page.evaluate(
    ({ lv, sd, sp, ap }) => {
      window.__towerclash.setSpeed(1);
      window.__towerclash.loadLevel(lv, sd);
      window.__towerclash.setSpeed(sp);
      if (ap) window.__towerclash.autoplay();
    },
    { lv: id, sd: seed, sp: speed, ap: autoplay },
  );
  await page.waitForFunction((lv) => window.__towerclash.getScreen() === 'play' && window.__towerclash.getState()?.levelId === lv, id);
  await page
    .waitForFunction(
      ({ key, limit }) => {
        const d = window.__towerclash;
        const st = d.getState();
        if (d.getScreen() !== 'play' || !st) return true; // level ended: stop waiting
        if (st.time >= limit) return true;
        return window.__storeShotCondition(st, key);
      },
      { key: cond, limit: maxMs },
      { polling: 50, timeout: 120_000 },
    )
    .catch(() => undefined);
  if ((await screen(page)) !== 'play') return false;
  await page.evaluate(() => window.__towerclash.setSpeed(1));
  await page.waitForTimeout(60);
  return page.evaluate((key) => window.__storeShotCondition(window.__towerclash.getState(), key), cond);
}

/** Tap a logical (720×1280) point (same path as the e2e suite: `toClient` + a mouse click). */
async function tapAt(page, p) {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [p.x, p.y]);
  await page.mouse.click(c.x, c.y);
}

/**
 * Run `fn` up to `attempts` times with seeds 1, 2, 3…; the frame routines use it for timing-dependent
 * captures. Returns whether a seed produced the frame; throws instead when `required` (the default).
 */
async function withSeeds(label, attempts, fn, { required = true } = {}) {
  for (let seed = 1; seed <= attempts; seed++) {
    if (await fn(seed)) return true;
    console.log(`${label}: seed ${seed} did not produce the frame, retrying`);
  }
  if (required) throw new Error(`${label}: could not capture the frame in ${attempts} attempts`);
  console.log(`${label}: not captured in ${attempts} attempts, falling back`);
  return false;
}

/** One routine per `SHOTS[].capture`; each leaves the page on the frame to shoot. */
const FRAMES = {
  title: async () => {}, // fresh context: the title demo is already animating

  // level 1 on a fresh save: tutorial ring + "Tap your tower" bubble + the lesson banner
  tutorial: async (page) => {
    await page.evaluate(() => window.__towerclash.loadLevel(1));
    await page.waitForTimeout(700);
    const hint = await page.evaluate(() => window.__towerclash.getTutorialHint());
    if (!hint) throw new Error('level 1: tutorial hint not visible on a fresh save');
  },

  // level 5 "Two Roads": a player ribbon and an enemy ribbon on the roads at the same moment
  streams: (page) =>
    withSeeds('level 5 streams', 4, (seed) =>
      playWhile(page, 5, 'bothStreams', { seed, speed: 4, maxMs: 60_000 }),
    ),

  // level 4 "Build Up", no streams: the player tower fills to 25 and turns into the L2 sprite (upgrade burst)
  upgrade: async (page) => {
    const ok = await playWhile(page, 4, 'homeL2', { autoplay: false, speed: 1, maxMs: 60_000 });
    if (!ok) throw new Error('level 4: home did not reach L2');
  },

  // level 5, manual: one stream from the L1 home, then a second target → "L2 needed for 2 streams" (tower shakes)
  limitHint: async (page) => {
    await page.evaluate(() => {
      window.__towerclash.setSpeed(1);
      window.__towerclash.loadLevel(5, 1);
    });
    await page.waitForFunction(() => window.__towerclash.getScreen() === 'play' && window.__towerclash.getState()?.levelId === 5);
    await page.waitForTimeout(400);
    await tapAt(page, LEVEL_5.home);
    await page.waitForTimeout(120);
    await tapAt(page, LEVEL_5.west1);
    await page.waitForFunction(() => (window.__towerclash.getState()?.links ?? []).some((l) => l.owner === 'player'));
    await page.waitForTimeout(350); // first units on the road
    await tapAt(page, LEVEL_5.east1);
    await page.waitForFunction(() => window.__towerclash.getLimitHint() !== null, null, { polling: 'raf', timeout: 5000 });
    await page.waitForTimeout(120); // bubble fully faded in, tower mid-shake
    if ((await page.evaluate(() => window.__towerclash.getLimitHint())) === null) throw new Error('level 5: limit hint gone before the capture');
  },

  // level 9 "Stone Walls": mid-battle with the player streaming into the fortress ("keep"). Preferred
  // take: at the same moment the keep's counter-stream has a player tower (mid) under fire, so the
  // frame also shows the under-fire badge (enemy-coloured pill with the crossed-swords pip; the sim
  // holds it for UNDER_FIRE_MS = 1.5 s after every landing). Polled at ×4 so the 50 ms poll sees the
  // overlap; when no seed lines the two up, the plain "streaming into the keep" frame is taken.
  fortress: async (page) => {
    const opts = (seed) => ({ seed, speed: 4, maxMs: 70_000 });
    const hit = await withSeeds('level 9 fortress under fire', 4, (seed) => playWhile(page, 9, 'fortressUnderFire', opts(seed)), { required: false });
    if (!hit) await withSeeds('level 9 fortress', 4, (seed) => playWhile(page, 9, 'playerToKeep', opts(seed)));
  },

  // level 15 "The Citadel" (App Store extra): artillery mid-battle
  citadel: async (page) => {
    await playUntil(page, 15, 30_000);
  },

  // the reference player wins level 1: result card with 3 stars
  result: async (page, ctx) => {
    ctx.result = await playToResult(page, 1, 12_000);
  },

  // shop on the seeded mid-game save (the shop is a full screen, so nothing from the result overlays it)
  shop: async (page, ctx, shot) => {
    if (!ctx.shopSeeded) {
      await seedShopSave(page, ctx.lang);
      ctx.shopSeeded = true;
    }
    await openShop(page, shot.shop);
  },
};

/** Raw frames of `set` with the game in `lang` (one fresh context per language). */
async function captureRaw(browser, set, lang) {
  mkdirSync(set.rawDir(lang), { recursive: true });
  const page = await openGame(browser, set, lang);
  const out = (i) => rawFile(set, lang, i);
  const shots = shotsFor(set);
  const ctx = { result: null, shopSeeded: false, lang };
  const tag = `${set.id}/${lang}`;

  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const frame = FRAMES[shot.capture];
    if (!frame) throw new Error(`no capture routine "${shot.capture}" for frame ${shot.name}`);
    await frame(page, ctx, shot);
    await page.screenshot({ path: out(i) });
    console.log(`[${tag}] ${String(i + 1).padStart(2, '0')}-${shot.name}`);
  }
  const result = ctx.result;
  if (set.id === IAP_REVIEW_SET && lang === 'en') {
    await openShop(page, IAP_REVIEW.tab);
    mkdirSync(dirname(IAP_REVIEW.file), { recursive: true });
    await page.screenshot({ path: IAP_REVIEW.file });
    const buf = recompressPng(readFileSync(IAP_REVIEW.file));
    const [w, h] = pngSize(buf);
    if (w < 640 || h < 920) throw new Error(`${IAP_REVIEW.file} is ${w}×${h}, App Store Connect needs ≥ 640×920`);
    if (buf.length > MAX_BYTES) throw new Error(`${IAP_REVIEW.file} is ${kb(buf.length)} (> 600 KB)`);
    writeFileSync(IAP_REVIEW.file, buf);
    console.log(`[${tag}] IAP review frame ${w}×${h} ${kb(buf.length)} → ${IAP_REVIEW.file}`);
  }

  // every raw frame must be exactly viewport × scale; store it losslessly re-encoded
  for (let i = 0; i < shots.length; i++) {
    const buf = recompressPng(readFileSync(out(i)));
    const [w, h] = pngSize(buf);
    if (w !== set.out.w || h !== set.out.h) throw new Error(`${out(i)} is ${w}×${h}, expected ${set.out.w}×${set.out.h}`);
    writeFileSync(out(i), buf);
  }
  console.log(`[${tag}] raw frames written (level 1 result: ${result.stars} stars, ${result.coinsEarned} coins)`);
  await page.context().close();
}

/**
 * Write `SHOP_SAVE` under the v3 key and reload so the app boots on it (the wallet header reads the
 * live save). The init script re-applies the context's language on the reload.
 */
async function seedShopSave(page, lang) {
  await page.evaluate(({ key, save }) => localStorage.setItem(key, JSON.stringify(save)), { key: SAVE_KEY, save: SHOP_SAVE });
  await page.reload();
  await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');
  await awaitFonts(page, lang);
  await assertLanguage(page, lang);
  const live = await page.evaluate(() => {
    const s = window.__towerclash.economy.getSave();
    return { gold: s.gold, crystals: s.crystals, production: s.upgrades.production ?? 0 };
  });
  if (live.gold !== SHOP_SAVE.gold || live.crystals !== SHOP_SAVE.crystals || live.production !== SHOP_SAVE.upgrades.production) {
    throw new Error(`shop seed not applied: live save is ${JSON.stringify(live)}`);
  }
}

/** Open the shop on `tab` from the current screen and let the cards / price strings settle. */
async function openShop(page, tab) {
  await page.evaluate((t) => window.__towerclash.openShop(t), tab);
  await page.waitForFunction(() => window.__towerclash.getScreen() === 'shop');
  await page.waitForTimeout(700); // fake-store getProducts() resolves, particles/toasts idle
}

/* ---------- caption pass (canvas) ---------- */

const CANVAS_PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><canvas id="c"></canvas>`;

/**
 * Draws `pngBase64` under a caption band and returns the composed PNG as base64.
 * `scale` shrinks the whole output (Google); `bits` < 8 posterises the final pixels at the same
 * pixel size (Apple).
 */
const composeInPage = async ({ png, caption, w, h, scale, bits = 8 }) => {
  const c = document.getElementById('c');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const k = w / 1080; // caption geometry was designed at 1080 wide

  // water backdrop (game palette) with soft wave lines
  ctx.fillStyle = '#5ec1e6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 6 * k;
  for (let y = 40 * k; y < h; y += 120 * k) {
    ctx.beginPath();
    for (let x = -40; x <= w + 40; x += 20) ctx.lineTo(x, y + Math.sin((x + y) / (60 * k)) * 10 * k);
    ctx.stroke();
  }

  // caption band
  const bandH = 300 * k;
  const bandY = 40 * k;
  let px = 84 * k;
  ctx.font = `900 ${px}px ${FONT}`;
  while (ctx.measureText(caption).width > w - 120 * k && px > 40 * k) ctx.font = `900 ${(px -= 2)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = px * 0.22;
  ctx.strokeStyle = '#1e2a44';
  ctx.strokeText(caption, w / 2, bandY + bandH / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(caption, w / 2, bandY + bandH / 2);

  // the frame, scaled to fit below the band with a rounded mask and a shadow
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const top = bandY + bandH + 10 * k;
  const availH = h - top - 30 * k;
  const s = Math.min(availH / img.height, (w - 80 * k) / img.width);
  const dw = img.width * s;
  const dh = img.height * s;
  const dx = (w - dw) / 2;
  const dy = top;
  const r = 40 * k;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(dx + r, dy);
    ctx.arcTo(dx + dw, dy, dx + dw, dy + dh, r);
    ctx.arcTo(dx + dw, dy + dh, dx, dy + dh, r);
    ctx.arcTo(dx, dy + dh, dx, dy, r);
    ctx.arcTo(dx, dy, dx + dw, dy, r);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = 'rgba(20,40,70,0.35)';
  ctx.shadowBlur = 40 * k;
  ctx.shadowOffsetY = 14 * k;
  ctx.fillStyle = '#1e2a44';
  path();
  ctx.fill();
  ctx.restore();
  ctx.save();
  path();
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  ctx.lineWidth = 6 * k;
  ctx.strokeStyle = '#ffffff';
  path();
  ctx.stroke();

  if (bits < 8) {
    // keep the top `bits` of every channel (rounded, so mid-tones do not darken)
    const id = ctx.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    const step = 1 << (8 - bits);
    const max = 255 - (step - 1);
    for (let i = 0; i < d.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        const v = Math.round(d[i + ch] / step) * step;
        d[i + ch] = v > max ? max : v;
      }
    }
    ctx.putImageData(id, 0, 0);
  }

  return c.toDataURL('image/png').split(',')[1];
};

/** Dithered 256-colour palette PNG at the same size (only when `sharp` is available). */
async function toPalette(buf) {
  if (!sharp) return null;
  return sharp(buf).png({ palette: true, colours: 256, dither: 1.0, compressionLevel: 9, effort: 10 }).toBuffer();
}

/** Google set: whole-image scale steps until every file fits (any 9:16 size ≥ 320 px is accepted). */
async function composeScaled(page, set) {
  const sizes = [];
  for (let scale = 1; scale >= 0.5; scale -= 0.125) {
    sizes.length = 0;
    const shots = shotsFor(set);
    for (let i = 0; i < shots.length; i++) {
      for (const lang of set.langs) {
        const raw = readFileSync(rawFile(set, lang, i)).toString('base64');
        const b64 = await page.evaluate(composeInPage, { png: raw, caption: shots[i][lang], w: set.out.w, h: set.out.h, scale });
        const file = outFile(set, lang, i);
        writeFileSync(file, recompressPng(Buffer.from(b64, 'base64')));
        sizes.push([file, statSync(file).size]);
      }
    }
    const largest = Math.max(...sizes.map(([, s]) => s));
    if (largest <= MAX_BYTES) {
      console.log(`[${set.id}] captioned shots at ${set.out.w * scale}×${set.out.h * scale}, largest ${kb(largest)}`);
      return;
    }
    console.log(`[${set.id}] scale ${scale}: largest ${kb(largest)} > 600 KB, shrinking`);
  }
  throw new Error(`[${set.id}] could not get captioned screenshots under 600 KB`);
}

/** Apple sets: exact pixel size; per file, step down the quality ladder until it fits. */
async function composeExact(page, set) {
  const shots = shotsFor(set);
  for (let i = 0; i < shots.length; i++) {
    for (const lang of set.langs) {
      const raw = readFileSync(rawFile(set, lang, i)).toString('base64');
      const file = outFile(set, lang, i);
      let done = false;
      const composed = new Map(); // bits → canvas PNG, so palette steps reuse the same pixels
      for (const q of APPLE_QUALITY_LADDER) {
        if (q.palette && !sharp) continue;
        if (!composed.has(q.bits)) {
          const b64 = await page.evaluate(composeInPage, { png: raw, caption: shots[i][lang], w: set.out.w, h: set.out.h, scale: 1, bits: q.bits });
          composed.set(q.bits, Buffer.from(b64, 'base64'));
        }
        const buf = q.palette ? await toPalette(composed.get(q.bits)) : recompressPng(composed.get(q.bits));
        const [w, h] = pngSize(buf);
        if (w !== set.out.w || h !== set.out.h) throw new Error(`${file}: composed ${w}×${h}, expected ${set.out.w}×${set.out.h}`);
        const label = `bits ${q.bits}${q.palette ? ', 256-colour palette' : ''}`;
        if (buf.length <= MAX_BYTES) {
          writeFileSync(file, buf);
          console.log(`[${set.id}] ${lang}/${String(i + 1).padStart(2, '0')}.png ${w}×${h} ${kb(buf.length)} (${label})`);
          done = true;
          break;
        }
        console.log(`[${set.id}] ${lang}/${String(i + 1).padStart(2, '0')}.png ${kb(buf.length)} at ${label} > 600 KB, reducing`);
      }
      if (!done) throw new Error(`[${set.id}] ${file}: could not get under 600 KB at exact size`);
    }
  }
}

async function composeAll(browser, set) {
  const page = await browser.newPage({ viewport: { width: set.out.w, height: set.out.h } });
  await page.setContent(CANVAS_PAGE);
  for (const lang of set.langs) mkdirSync(set.outDir(lang), { recursive: true });
  try {
    if (set.exact) await composeExact(page, set);
    else await composeScaled(page, set);
  } finally {
    await page.close();
  }
}

/* ---------- feature graphic 1024×500 ---------- */

const drawFeatureInPage = () => {
  const W = 1024;
  const H = 500;
  const c = document.getElementById('c');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const P = {
    water: '#5ec1e6', waterLight: '#8fd9f0', grass: '#8fd16a', grassLight: '#a3dd7d', bush: '#5ea94a',
    cliff: '#e0c99a', cliffDark: '#b89b67', road: '#e8d9a8', text: '#1e2a44', selection: '#ffd23f',
    player: '#3b82f6', playerDark: '#1d4ed8', enemy: '#ef4444', enemyDark: '#b91c1c', neutral: '#8a94a6', neutralDark: '#5b6b85',
    crown: '#facc15', crownEdge: '#ca8a04', crownDot: '#fde68a',
  };

  // water + waves
  ctx.fillStyle = P.water;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = P.waterLight;
  ctx.lineWidth = 4;
  for (let y = 30; y < H; y += 70) {
    ctx.beginPath();
    for (let x = -30; x <= W + 30; x += 12) ctx.lineTo(x, y + Math.sin((x + y) / 45) * 6);
    ctx.stroke();
  }

  // island: cliff edge then grass plateau
  const island = (dy, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(60, 150 + dy);
    ctx.bezierCurveTo(140, 60 + dy, 420, 40 + dy, 620, 70 + dy);
    ctx.bezierCurveTo(820, 90 + dy, 1000, 140 + dy, 980, 270 + dy);
    ctx.bezierCurveTo(960, 400 + dy, 760, 470 + dy, 520, 450 + dy);
    ctx.bezierCurveTo(300, 435 + dy, 100, 420 + dy, 50, 320 + dy);
    ctx.bezierCurveTo(20, 250 + dy, 30, 190 + dy, 60, 150 + dy);
    ctx.closePath();
    ctx.fill();
  };
  island(18, P.cliffDark);
  island(10, P.cliff);
  island(0, P.grass);
  ctx.fillStyle = P.grassLight;
  for (const [x, y, r] of [[300, 330, 70], [700, 150, 55], [880, 400, 45]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = P.bush;
  for (const [x, y] of [[130, 250], [180, 380], [900, 230], [820, 400], [560, 420], [660, 60], [420, 90]]) {
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.arc(x + 14, y + 4, 10, 0, Math.PI * 2);
    ctx.arc(x - 12, y + 5, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // roads between the three towers
  const T = [
    { x: 150, y: 160, n: 24, fill: P.player, edge: P.playerDark, crown: true },
    { x: 890, y: 130, n: 18, fill: P.enemy, edge: P.enemyDark, flag: true },
    { x: 800, y: 320, n: 7, fill: P.neutral, edge: P.neutralDark },
  ];
  ctx.strokeStyle = P.road;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
    ctx.beginPath();
    ctx.moveTo(T[a].x, T[a].y);
    ctx.lineTo(T[b].x, T[b].y);
    ctx.stroke();
  }
  // marching dots (player blue heading to the neutral tower)
  for (let i = 1; i <= 6; i++) {
    const t = 0.25 + i * 0.07;
    const x = T[0].x + (T[2].x - T[0].x) * t;
    const y = T[0].y + (T[2].y - T[0].y) * t;
    ctx.fillStyle = P.player;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = P.playerDark;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // towers in the app-icon look: filled disc, darker ring, bold count, crown for the player
  const crown = (x, y, s) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-120, 60); ctx.lineTo(-90, -30); ctx.lineTo(-36, 30); ctx.lineTo(0, -60);
    ctx.lineTo(36, 30); ctx.lineTo(90, -30); ctx.lineTo(120, 60); ctx.closePath();
    ctx.fillStyle = P.crown; ctx.strokeStyle = P.crownEdge; ctx.lineWidth = 10; ctx.lineJoin = 'round';
    ctx.fill(); ctx.stroke();
    ctx.fillRect(-120, 60, 240, 40); ctx.strokeRect(-120, 60, 240, 40);
    ctx.fillStyle = P.crownDot;
    for (const [cx, cy, r] of [[-90, -30, 16], [0, -60, 18], [90, -30, 16]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };
  for (const t of T) {
    const R = 54;
    ctx.fillStyle = 'rgba(25,45,70,0.22)';
    ctx.beginPath(); ctx.ellipse(t.x, t.y + R * 0.9, R * 1.1, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(59,130,246,0.12)';
    ctx.beginPath(); ctx.arc(t.x, t.y, R * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.fill;
    ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = t.edge; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${R * 1.15}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(t.n), t.x, t.y + 4);
    if (t.crown) crown(t.x, t.y - R - 22, 0.22);
    if (t.flag) {
      ctx.strokeStyle = P.text; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(t.x + R - 6, t.y - R + 4); ctx.lineTo(t.x + R - 6, t.y - R - 40); ctx.stroke();
      ctx.fillStyle = P.enemy;
      ctx.beginPath(); ctx.moveTo(t.x + R - 6, t.y - R - 40); ctx.lineTo(t.x + R + 30, t.y - R - 30); ctx.lineTo(t.x + R - 6, t.y - R - 18); ctx.closePath(); ctx.fill();
    }
  }

  // title in the game's outlined style
  const outlined = (text, x, y, fill, px) => {
    ctx.font = `900 ${px}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = px * 0.2; ctx.strokeStyle = P.text; ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  };
  outlined('TOWER', 512, 150, '#ffffff', 118);
  outlined('CLASH', 512, 262, P.selection, 118);
  // tagline pill
  ctx.font = `bold 30px ${FONT}`;
  const tag = 'Capture every tower';
  const tw = ctx.measureText(tag).width + 56;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(512 - tw / 2, 372, tw, 56, 28); ctx.fill();
  ctx.strokeStyle = '#b8c6da'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = P.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tag, 512, 401);

  return c.toDataURL('image/png').split(',')[1];
};

async function featureGraphic(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent(CANVAS_PAGE);
  const b64 = await page.evaluate(drawFeatureInPage);
  const file = join(STORE, 'feature-graphic.png');
  writeFileSync(file, recompressPng(Buffer.from(b64, 'base64')));
  await page.close();
  const size = statSync(file).size;
  if (size > MAX_BYTES) throw new Error(`feature graphic is ${size} bytes (> 600 KB)`);
  console.log(`feature graphic written (${kb(size)})`);
}

/* ---------- main ---------- */

const server = await startPreview();
const cleanup = () => {
  if (server.exitCode === null) server.kill('SIGTERM');
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

try {
  const browser = await chromium.launch(existsSync(HEADLESS_SHELL) ? { executablePath: HEADLESS_SHELL } : {});
  try {
    const sets = [];
    if (DO_GOOGLE) sets.push(SETS.google);
    if (DO_APPLE) sets.push(SETS['apple-6.7'], SETS['apple-6.5']);
    for (const set of sets) {
      for (const lang of set.langs) await captureRaw(browser, set, lang);
      await composeAll(browser, set);
    }
    if (DO_GOOGLE) await featureGraphic(browser);
  } finally {
    await browser.close();
  }
} finally {
  cleanup();
}
