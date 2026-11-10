import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Rect } from './helpers/tap';
import { settled, tapRect } from './helpers/tap';
import { shotPath } from './tools/shots';

/*
 * AUD-B6: the opt-in on-device diagnostics log (src/ui/diagnostics.ts, Settings → About → Diagnostics).
 * Off by default: a win writes nothing. Switched on from the About card, the reference player's win of
 * level 1 books one `level_end` row; COPY LOG puts the hints line, the column line and that row on the
 * clipboard; CLEAR LOG empties the log. Nothing is requested from the network (no telemetry, ever).
 * DIAG-2 (2026-11-10): the row of a played result carries the match's replay record and COPY LOG appends
 * it as a `#replay <row> <json>` line; a level 15 loss copied from the About card re-runs to its recorded
 * hash through the debug `verifyReplay`, and the eager chunk does not hold the replay module.
 */

// src/render/titleLayout.ts — TITLE.settings
const TITLE_SETTINGS = { x: 180, y: 776, w: 172, h: 64 };
const SAVE_KEY = 'towerclash.save.v3';
const DIAG_KEY = 'towerclash.diag.v1';
// src/ui/diagnostics.ts — DIAG_COLUMNS
const COLUMNS = 'v,t,build,lvl,mode,attempt,outcome,timeMs,stars,first,continued,boosters,textScale';

interface DiagAbout {
  toggle: Rect;
  copy: Rect | null;
  clear: Rect | null;
  rows: number;
  on: boolean;
}
interface DiagDebug {
  rows(): { lvl: number; outcome: string; attempt: number; first: boolean; stars: number; timeMs: number; mode: string }[];
  text(): string;
  clear(): void;
  about(): DiagAbout | null;
}
type Win = Window & { __towerclash: { diag: DiagDebug } };
const diagRows = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.diag.rows());
const diagText = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.diag.text());
const diagAbout = (page: Page) => page.evaluate(() => (window as unknown as Win).__towerclash.diag.about());
const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem('diag-booted')) {
      sessionStorage.setItem('diag-booted', '1');
      localStorage.setItem(key, JSON.stringify({ version: 3, gold: 0, crystals: 0 }));
    }
  }, SAVE_KEY);
  await page.goto('/');
  await page.waitForFunction(() => typeof (window.__towerclash as unknown as { diag?: unknown } | undefined)?.diag === 'object');
  return errors;
}

/** Reference player at ×10 on level 1, seed 1 (verified by `npm run playtest`) → result screen. */
async function winLevelOne(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__towerclash.loadLevel(1, 1);
    window.__towerclash.setSpeed(10);
    window.__towerclash.autoplay();
  });
  await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
}

/** A fresh page load (the save stays: the seed runs once per session) → title → Settings. */
async function openSettings(page: Page): Promise<DiagAbout> {
  await page.goto('/');
  await page.waitForFunction(() => typeof (window.__towerclash as unknown as { diag?: unknown } | undefined)?.diag === 'object');
  await expect.poll(() => screen(page)).toBe('title');
  await tapRect(page, TITLE_SETTINGS);
  await expect.poll(() => screen(page)).toBe('settings');
  const about = await diagAbout(page);
  expect(about, 'the settings screen exposes its Diagnostics block').not.toBeNull();
  return about!;
}

/**
 * Scroll the settings body to its foot (AUD-U2: the About card with the Diagnostics block runs past a
 * Pixel 5's 727 px viewport) and wait until `r` is drawn inside the viewport.
 */
async function scrollTo(page: Page, r: Rect): Promise<void> {
  const vp = page.viewportSize()!;
  await settled(page); // FEEL-1-6: the wheel is not delivered during the title ↔ menu slide
  await page.mouse.move(vp.width / 2, vp.height / 2);
  await page.mouse.wheel(0, 3000);
  await expect
    .poll(async () => (await page.evaluate(([x, y]) => window.__towerclash.layoutToClient(x, y), [r.x + r.w / 2, r.y + r.h] as const)).y < vp.height - 4)
    .toBe(true);
}

test.describe('AUD-B6 diagnostics log', () => {
  test('off by default; on, a level 1 win books one row; COPY LOG copies it as CSV; CLEAR LOG empties it', async ({ page, context }) => {
    const errors = await boot(page);
    const requests: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') requests.push(r.url());
    });

    // off by default: a win writes nothing, not even the key
    await winLevelOne(page);
    expect(await diagRows(page)).toEqual([]);
    expect(await page.evaluate((k) => localStorage.getItem(k), DIAG_KEY)).toBeNull();

    // switch it on from the About card: persisted in the save (only `true`), the actions appear
    let about = await openSettings(page);
    expect(about).toMatchObject({ on: false, rows: 0, copy: null, clear: null });
    await scrollTo(page, about.toggle);
    await tapRect(page, about.toggle);
    await expect.poll(() => diagAbout(page).then((a) => a?.on)).toBe(true);
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).settings.diagnostics, SAVE_KEY)).toBe(true);

    // a win of level 1 (its second try in this save; the counter starts with the switch): one row
    await winLevelOne(page);
    const rows = await diagRows(page);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lvl: 1, mode: 'campaign', outcome: 'won', attempt: 1, first: false });
    expect(rows[0]!.stars).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.timeMs).toBeGreaterThan(0);
    const saved = await page.evaluate((k) => localStorage.getItem(k)!, SAVE_KEY);
    expect(saved, 'the log is never inside the save').not.toContain('"rows"');

    // COPY LOG → the clipboard: the hints line, the column line, one row "… ,1,campaign,1,won, …"
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    about = await openSettings(page);
    expect(about.rows).toBe(1);
    expect(about.copy).not.toBeNull();
    await scrollTo(page, about.copy!);
    await page.screenshot({ path: shotPath('diagnostics-about'), scale: 'css' }); // switch on, "Diagnostics: 1 event", COPY LOG / CLEAR LOG
    await tapRect(page, about.copy!);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^# Tower Clash diagnostics v1/);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toBe(await diagText(page));
    const lines = text.split('\n');
    expect(lines).toHaveLength(4); // DIAG-2: + the win's `#replay 1 {…}` line
    expect(lines[3]).toMatch(/^#replay 1 \{"v":1,"levelId":1,/);
    expect(lines[0]).toMatch(/\| build \S.* \| ua .+ \| viewport \d+x\d+ \| dpr [\d.]+ \| text 100% \| lang en \| events 1$/);
    expect(lines[1]).toBe(COLUMNS);
    const cells = lines[2]!.split(',');
    const at = (c: string) => cells[COLUMNS.split(',').indexOf(c)];
    expect([at('v'), at('lvl'), at('mode'), at('outcome'), at('attempt')]).toEqual(['1', '1', 'campaign', 'won', '1']);
    expect(at('t')).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/);

    // CLEAR LOG → 0 rows (the count on the card follows)
    await tapRect(page, about.clear!);
    await expect.poll(() => diagRows(page).then((r) => r.length)).toBe(0);
    await expect.poll(() => diagAbout(page).then((a) => a?.rows)).toBe(0);

    expect(requests, 'no request leaves the device').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('DIAG-2: a level 15 loss books its replay record; the copied log parses and its last record verifies', async ({ page, context }) => {
    const errors = await boot(page);
    let about = await openSettings(page);
    await scrollTo(page, about.toggle);
    await tapRect(page, about.toggle);
    await expect.poll(() => diagAbout(page).then((a) => a?.on)).toBe(true);

    await page.evaluate(async () => {
      await window.__towerclash.loadLevel(15, 1);
      window.__towerclash.setSpeed(20);
      window.__towerclash.economy.autoLose();
    });
    await expect.poll(() => screen(page), { timeout: 90_000, intervals: [250] }).toBe('result');
    await expect.poll(() => diagRows(page).then((r) => r.length)).toBe(1);
    expect((await diagRows(page))[0]).toMatchObject({ lvl: 15, outcome: 'lost' });
    expect(await page.evaluate((k) => localStorage.getItem(k)!, SAVE_KEY), 'the record is never inside the save').not.toContain('"commands"');

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    about = await openSettings(page);
    await scrollTo(page, about.copy!);
    await tapRect(page, about.copy!);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^# Tower Clash diagnostics v1/);
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text.length).toBeLessThanOrEqual(100 * 1024);
    const lines = text.split('\n');
    expect(lines[2]).toMatch(/^1,[^,]+,[^,]+,15,campaign,1,lost,/);
    const last = lines.filter((l) => l.startsWith('#replay ')).at(-1)!;
    expect(last, 'the loss carries its record').toMatch(/^#replay 1 \{/);
    const json = last.replace(/^#replay \d+ /, '');
    const rec = JSON.parse(json) as { levelId: number; outcome: { result: string; hash: string }; commands: unknown[] };
    expect(rec.levelId).toBe(15);
    expect(rec.outcome.result).toBe('lost');
    expect(json.length).toBeLessThanOrEqual(32 * 1024);
    const v = await page.evaluate((j) => (window as unknown as { __towerclash: { verifyReplay(json: string): Promise<Record<string, unknown>> } }).__towerclash.verifyReplay(j), json);
    expect(v).toMatchObject({ matches: true, rulesMatch: true, outcome: 'lost', expected: rec.outcome.hash, hash: rec.outcome.hash });
    console.log(`DIAG-2 e2e: level 15 loss record ${json.length} B, ${rec.commands.length} commands, log text ${text.length} B`);

    // the replay module stays out of the eager entry chunk (its parse error text is unique to it)
    const entry = await page.evaluate(() => (document.querySelector('script[type="module"][src]') as HTMLScriptElement).src);
    const body = await page.evaluate((u) => fetch(u).then((r) => r.text()), entry);
    expect(body).not.toContain('replay: not an object');
    expect(errors).toEqual([]);
  });
});
