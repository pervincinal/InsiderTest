import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { shotPath } from './tools/shots';

/*
 * AUD-Q10: failed save writes are not silent. `window.__towerclash.save.failWrites(n)` makes the next n
 * localStorage writes of the save throw a QuotaExceededError (each refused write costs one call and
 * its 100 ms retry another, src/ui/save.ts `putSave`). The notice "Progress could not be saved — free
 * up space or check storage settings" is drawn on the result footer and the title for as long as the
 * session is failing (src/render/saveNotice.ts, read through `save.notice()`), clears when a write
 * lands, and a reload with healthy writes boots from what localStorage really holds: the win is gone,
 * but the player was told. A getter that throws (storage disabled) boots read-only + failing and
 * never writes a default over the save. The native mirror has no web fake (src/native/saveMirror.ts
 * loads only inside a Capacitor shell), so its variant is tests/native/saveMirror.test.ts.
 */

// src/ui/save.ts
const SAVE_KEY = 'towerclash.save.v3';
const SEEDED = { version: 3, gold: 50, crystals: 0, stars: {}, settings: { language: 'en' } };

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const status = (page: Page) => page.evaluate(() => window.__towerclash.save.status());
const notice = (page: Page) => page.evaluate(() => window.__towerclash.save.notice());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
/** The save under the key, read by property access (works while `getItem` is made to throw). */
const stored = (page: Page) =>
  page.evaluate((key) => {
    const raw = (localStorage as unknown as Record<string, string | undefined>)[key];
    return raw ? (JSON.parse(raw) as { stars: Record<string, number>; gold: number }) : null;
  }, SAVE_KEY);
const shot = (page: Page, name: string) => page.screenshot({ path: shotPath(`saveFailing-${name}`), scale: 'css' });

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.save?.failWrites === 'function');
  await expect.poll(() => screen(page)).toBe('title');
  return errors;
}

async function winLevelOne(page: Page): Promise<void> {
  await page.evaluate(() => {
    void window.__towerclash.loadLevel(1, 1);
    window.__towerclash.setSpeed(10);
    window.__towerclash.autoplay();
  });
  await expect.poll(() => screen(page), { timeout: 60_000, intervals: [250] }).toBe('result');
}

/** Back out of the result (→ level map) and the map (→ title). */
async function backToTitle(page: Page): Promise<void> {
  for (let i = 0; i < 3 && (await screen(page)) !== 'title'; i++) {
    await page.evaluate(() => window.__towerclash.back());
    await expect.poll(() => screen(page)).not.toBe('result');
  }
  await expect.poll(() => screen(page)).toBe('title');
}

test.describe('save writes that fail (AUD-Q10)', () => {
  test('refused writes: notice on the result footer and the title, the win is gone after a healthy reload', async ({ page }) => {
    await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, SEEDED] as const);
    const errors = await boot(page);
    expect(await status(page)).toMatchObject({ failing: false, readOnly: false, issue: null, thrown: 0 });
    expect(await notice(page)).toBeNull();

    // every write of the win (and its retry) throws: well above the audit probe's 3 failed writes
    await page.evaluate(() => window.__towerclash.save.failWrites(50));
    await winLevelOne(page);
    await expect.poll(() => status(page).then((s) => s.failing)).toBe(true); // 100 ms after the first write: its retry threw too
    const after = await status(page);
    expect(after.thrown).toBeGreaterThanOrEqual(3);
    expect(after.readOnly).toBe(false);
    // the result footer says so (drawn every frame while it lasts)
    const expected = await text(page, 'save.writeFailed');
    expect(expected).toBe('Progress could not be saved — free up space or check storage settings');
    await expect.poll(() => notice(page).then((n) => n && { screen: n.screen, text: n.text })).toEqual({ screen: 'result', text: expected });
    const onResult = (await notice(page))!;
    // inside the footer band (HUD.mapBottom 1180 → the screen's bottom edge, both moved by the safe-area anchor on a tall viewport, FE-11)
    const below = (await page.evaluate(() => window.__towerclash.getAnchors())).bottom;
    expect(onResult.y + onResult.h).toBeLessThanOrEqual(1280 + below - 8 + 0.01);
    expect(onResult.y).toBeGreaterThanOrEqual(1180 + below - 8);
    // the in-memory save has the win; the key still holds the seeded bytes
    expect(await page.evaluate(() => window.__towerclash.economy.getSave().stars['1'] ?? 0)).toBeGreaterThanOrEqual(1);
    expect(await stored(page)).toMatchObject({ stars: {}, gold: 50 });
    await page.waitForTimeout(250); // the card's slide-in, before the shot
    await shot(page, 'result');

    // the title carries the same notice over the tagline
    await backToTitle(page);
    await expect.poll(() => notice(page).then((n) => n && { screen: n.screen, text: n.text })).toEqual({ screen: 'title', text: expected });
    expect((await notice(page))!.y).toBe(546); // SAVE_NOTICE.y (src/render/saveNotice.ts)
    await page.waitForTimeout(250);
    await shot(page, 'title');

    // writes heal: the next write that lands clears the notice
    await page.evaluate(() => window.__towerclash.save.failWrites(0));
    await page.evaluate(() => window.__towerclash.economy.grant('remove_ads'));
    await expect.poll(() => status(page).then((s) => s.failing)).toBe(false);
    expect((await stored(page))!.stars['1']).toBeGreaterThanOrEqual(1); // the whole in-memory save landed with that write
    expect(errors).toEqual([]);
  });

  test('refused writes, then a reload with healthy storage: the win is gone and the session is healthy again', async ({ page }) => {
    await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, SEEDED] as const);
    const errors = await boot(page);
    await page.evaluate(() => window.__towerclash.save.failWrites(50));
    await winLevelOne(page);
    await expect.poll(() => status(page).then((s) => s.failing)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => typeof window.__towerclash?.save?.failWrites === 'function');
    await expect.poll(() => screen(page)).toBe('title');
    expect(await status(page)).toMatchObject({ failing: false, readOnly: false, issue: null, thrown: 0 });
    expect(await stored(page)).toMatchObject({ stars: {}, gold: 50 }); // the win never reached the disk
    expect(await page.evaluate(() => window.__towerclash.economy.getSave().stars['1'] ?? 0)).toBe(0);
    await page.waitForTimeout(300); // a few frames: nothing draws the notice while writes are healthy
    expect(await notice(page)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('a getter that throws at boot (storage disabled): read-only from a default, the notice, nothing written over the save', async ({ page }) => {
    await page.addInitScript(
      ([key, data]) => {
        localStorage.setItem(key, JSON.stringify(data));
        Storage.prototype.getItem = () => {
          throw new DOMException('The operation is insecure.', 'SecurityError');
        };
      },
      [SAVE_KEY, SEEDED] as const,
    );
    const errors = await boot(page);
    expect(await status(page)).toMatchObject({ failing: true, readOnly: true, issue: { kind: 'blocked' } });
    expect(await page.evaluate(() => window.__towerclash.economy.getSave().gold)).toBe(0); // a default, in memory
    const expected = await text(page, 'save.writeFailed');
    await expect.poll(() => notice(page).then((n) => n && { screen: n.screen, text: n.text })).toEqual({ screen: 'title', text: expected });
    await winLevelOne(page);
    await expect.poll(() => notice(page).then((n) => n?.screen)).toBe('result');
    expect(await stored(page)).toMatchObject({ stars: {}, gold: 50 }); // the seeded bytes, untouched
    expect(errors).toEqual([]);
  });
});
