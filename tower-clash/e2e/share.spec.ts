import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Share card (SHARE-1, GDD §7.6): the result screen's SHARE button draws a 1080 × 1350 PNG on an
 * offscreen canvas and hands it to the platform. Chromium on Linux has no Web Share API, so the
 * specs install their own:
 *   - `navigator.share` + `navigator.canShare` stubs that capture the payload (file count, MIME
 *     type, name, PNG signature, decoded pixel size, text) → the file path of the chain;
 *   - no `navigator.share` and a recording `HTMLAnchorElement.prototype.click` → the download path.
 * Level 1 is won by the reference player (seed 1, the smoke spec's run); the daily case pins a day
 * the bot wins (daily.spec.ts DAY_A) and checks the day key + twist in the text.
 * The captured PNG is written as the look baseline `look3-share-card.png`.
 *
 * Like smoke.spec.ts this file imports nothing from src/; the hit region mirrors
 * src/render/layout.ts RESULT.shareInline (hud.ts `resultShareLayout`: the ×2 gold slot is free).
 */

const SAVE_KEY = 'towerclash.save.v3';
/** RESULT.shareInline: SHARE in the free ×2 gold slot (no ad provider on the preview, so no ×2 offer). */
const RESULT_SHARE = { x: 230, y: 874, w: 260, h: 62 };
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const DAY_A = '2026-09-27';
const UNLOCK_AFTER_LEVEL = 8;

const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
function levelName(id: number): string {
  const file = readdirSync(LEVELS_DIR).find((f) => f.startsWith(`${String(id).padStart(3, '0')}-`) && f.endsWith('.json'));
  if (!file) throw new Error(`no level file for ${id}`);
  return (JSON.parse(readFileSync(new URL(file, LEVELS_DIR), 'utf8')) as { name: string }).name;
}

const SHOTS = fileURLToPath(new URL('./__screenshots__/', import.meta.url));

type R = { x: number; y: number; w: number; h: number };
async function tapRect(page: Page, r: R): Promise<void> {
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [r.x + r.w / 2, r.y + r.h / 2] as const);
  await page.mouse.click(c.x, c.y);
}
const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());

interface Captured {
  title: string | undefined;
  text: string | undefined;
  files: number;
  type: string | null;
  name: string | null;
  head: number[] | null;
  dims: { w: number; h: number } | null;
  base64: string | null;
}

declare global {
  interface Window {
    __shareCaptured?: Captured | null;
    __shareCalls?: number;
    __downloads?: { download: string; href: string }[];
    __toastsSeen?: string[];
  }
}

/**
 * BUG-25: the toast lives 2.4 s of page wall clock (`Toast.show`, src/ui/screens.ts), so reading
 * `getToast()` once, several Playwright round-trips after the share resolved, raced the expiry
 * under load (2026-10-09, load 9.7: `getToast()` → null 1.5–2.5 s after "Shared" went up). The
 * page records every toast text it shows from its own 16 ms timer, so the assertion no longer
 * depends on protocol latency; a 2.4 s main-thread stall would be needed to miss one.
 */
function recordToasts(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.__toastsSeen = [];
    setInterval(() => {
      const t = window.__towerclash?.getToast?.() ?? null;
      const seen = window.__toastsSeen!;
      if (t !== null && seen[seen.length - 1] !== t) seen.push(t);
    }, 16);
  });
}
const toastsSeen = (page: Page) => page.evaluate(() => window.__toastsSeen ?? []);

/** Web Share stubs: canShare accepts files, share() records the payload (and decodes the PNG). */
function stubWebShare(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.__shareCaptured = null;
    window.__shareCalls = 0;
    const canShare = (d?: ShareData) => !!d && (d.files === undefined || d.files.length > 0);
    const share = async (d?: ShareData) => {
      window.__shareCalls = (window.__shareCalls ?? 0) + 1;
      const f = d?.files?.[0] ?? null;
      let head: number[] | null = null;
      let dims: { w: number; h: number } | null = null;
      let base64: string | null = null;
      if (f) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        head = Array.from(bytes.slice(0, 8));
        const bmp = await createImageBitmap(f);
        dims = { w: bmp.width, h: bmp.height };
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        base64 = btoa(bin);
      }
      window.__shareCaptured = { title: d?.title, text: d?.text, files: d?.files?.length ?? 0, type: f?.type ?? null, name: f?.name ?? null, head, dims, base64 };
    };
    Object.defineProperty(Navigator.prototype, 'canShare', { value: canShare, configurable: true, writable: true });
    Object.defineProperty(Navigator.prototype, 'share', { value: share, configurable: true, writable: true });
  });
}

/** No Web Share at all; anchor clicks are recorded instead of navigating. */
function stubNoShare(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.__downloads = [];
    delete (Navigator.prototype as { share?: unknown }).share;
    delete (Navigator.prototype as { canShare?: unknown }).canShare;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      window.__downloads!.push({ download: this.download, href: this.href });
    };
  });
}

async function boot(page: Page, seeded: Record<string, unknown>): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, seeded] as const);
  await recordToasts(page);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  return errors;
}

/** Reference player at ×10 on level 1 (seed 1) → result screen, card at rest. */
async function winLevel1(page: Page): Promise<void> {
  await page.evaluate(() => {
    void window.__towerclash.loadLevel(1, 1);
    window.__towerclash.setSpeed(10);
    window.__towerclash.autoplay();
  });
  await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
  expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
  await page.waitForTimeout(900); // card slide-in
}

test.describe('share card (SHARE-1)', () => {
  test('win level 1 → SHARE → navigator.share gets one 1080×1350 PNG and the level name; toast "Shared"', async ({ page }) => {
    await stubWebShare(page);
    const errors = await boot(page, { version: 3 });
    await winLevel1(page);
    await page.screenshot({ path: test.info().outputPath('result-share-button.png'), scale: 'css' });
    await tapRect(page, RESULT_SHARE);
    await expect.poll(() => page.evaluate(() => window.__shareCaptured != null), { timeout: 15_000 }).toBe(true);
    const cap = (await page.evaluate(() => window.__shareCaptured))!;
    expect(cap.files).toBe(1);
    expect(cap.type).toBe('image/png');
    expect(cap.name).toBe('towerclash-level-01.png');
    expect(cap.head).toEqual(PNG_SIGNATURE);
    expect(cap.dims).toEqual({ w: 1080, h: 1350 });
    expect(cap.title).toBe('Tower Clash');
    expect(cap.text).toContain(levelName(1));
    expect(cap.text).toContain('Level 1');
    expect(cap.text).toMatch(/[123]★ in \d\d:\d\d/);
    expect(await page.evaluate(() => window.__shareCalls)).toBe(1);
    const last = await page.evaluate(() => window.__towerclash.lastShare);
    expect(last).toMatchObject({ result: 'shared', text: cap.text, name: 'towerclash-level-01.png', type: 'image/png', width: 1080, height: 1350 });
    expect(last!.bytes).toBeGreaterThan(20_000);
    await expect.poll(() => toastsSeen(page), { message: 'the "Shared" toast went up (BUG-25)' }).toContain('Shared');
    writeFileSync(`${SHOTS}look3-share-card.png`, Buffer.from(cap.base64!, 'base64'));
    expect(await screen(page)).toBe('result'); // sharing never navigates
    expect(errors).toEqual([]);
  });

  test('no navigator.share → the PNG is downloaded through <a download>; toast "Saved"', async ({ page }) => {
    await stubNoShare(page);
    const errors = await boot(page, { version: 3 });
    expect(await page.evaluate(() => typeof navigator.share)).toBe('undefined');
    await winLevel1(page);
    await tapRect(page, RESULT_SHARE);
    await expect.poll(() => page.evaluate(() => window.__downloads?.length ?? 0), { timeout: 15_000 }).toBe(1);
    const [dl] = (await page.evaluate(() => window.__downloads))!;
    expect(dl!.download).toBe('towerclash-level-01.png');
    expect(dl!.href).toMatch(/^blob:/);
    const last = await page.evaluate(() => window.__towerclash.lastShare);
    expect(last).toMatchObject({ result: 'saved', name: 'towerclash-level-01.png', type: 'image/png', width: 1080, height: 1350 });
    expect(last!.text).toContain(levelName(1));
    await expect.poll(() => toastsSeen(page), { message: 'the "Saved" toast went up (BUG-25)' }).toContain('Saved');
    expect(errors).toEqual([]);
  });

  test('daily challenge: the text carries the day key and the twist name (verifiable by anyone with the game)', async ({ page }) => {
    await stubWebShare(page);
    const stars: Record<string, number> = {};
    for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) stars[String(id)] = 1;
    const errors = await boot(page, { version: 3, stars });
    await page.evaluate((key) => window.__towerclash.setDayKey(key), DAY_A);
    const challenge = await page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.daily.get().challenge)) as { dayKey: string; levelId: number; twist: { id: string } });
    expect(challenge.dayKey).toBe(DAY_A);
    const twistName = await page.evaluate((id) => window.__towerclash.getText(`daily.twist.${id}`), challenge.twist.id);
    await page.evaluate(() => {
      void window.__towerclash.daily.start();
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    await expect.poll(() => screen(page), { timeout: 75_000, intervals: [250] }).toBe('result');
    expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe('won');
    await page.waitForTimeout(900);
    await tapRect(page, RESULT_SHARE);
    await expect.poll(() => page.evaluate(() => window.__shareCaptured != null), { timeout: 15_000 }).toBe(true);
    const cap = (await page.evaluate(() => window.__shareCaptured))!;
    expect(cap.name).toBe(`towerclash-daily-${DAY_A}.png`);
    expect(cap.dims).toEqual({ w: 1080, h: 1350 });
    expect(cap.text).toContain(`Daily ${DAY_A} · ${twistName}`);
    expect(cap.text).toContain(`Level ${challenge.levelId} · ${levelName(challenge.levelId)}`);
    expect(errors).toEqual([]);
  });
});
