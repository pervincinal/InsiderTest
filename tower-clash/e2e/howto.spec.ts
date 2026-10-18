import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { tapRect } from './helpers/tap';

/*
 * GD-5f: the "How to play" card carries six rules (`howto.2` gained the swipe sentence, `howto.6` is the
 * supply line). It must still be one card without scrolling at 360 × 640 in every language: each rule
 * wraps to ≤ 3 lines of its text column with the game's own fonts (Fredoka, Nunito for Russian), which
 * only a real canvas can measure — the play screen reports the wrapped line count of every row
 * (`getHowtoLines`, src/render/menusHowto.ts) before its 3-line cut. tests/ui/howto.test.ts covers the
 * geometry. Nothing is imported from src/ (see smoke.spec.ts for why).
 */

test.use({ viewport: { width: 360, height: 640 } });

const SAVE_KEY = 'towerclash.save.v3';
// src/render/titleLayout.ts — TITLE.settings; src/render/menuLayout.ts — SETTINGS.howto
const TITLE_SETTINGS = { x: 180, y: 780, w: 172, h: 64 };
const SETTINGS_HOWTO = { x: 86, y: 500, w: 548, h: 64 };
/** src/render/menuLayout.ts — HOWTO.rows / maxLines */
const ROWS = 6;
const MAX_LINES = 3;

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());

async function openHowTo(page: Page, language: string): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, { version: 3, settings: { language } }] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.getHowtoLines === 'function');
  await expect.poll(() => page.evaluate(() => window.__towerclash.getLanguage())).toBe(language);
  await tapRect(page, TITLE_SETTINGS);
  await expect.poll(() => screen(page)).toBe('settings');
  await tapRect(page, SETTINGS_HOWTO);
  await expect.poll(() => screen(page)).toBe('howto');
  // the dictionary and the faces are in before the measured frame
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return pageErrors;
}

for (const language of ['en', 'az', 'ru', 'tr']) {
  test(`${language}: six rules, each wrapped to ≤ ${MAX_LINES} lines at 360 × 640`, async ({ page }, info) => {
    const pageErrors = await openHowTo(page, language);
    const six = await page.evaluate((k) => window.__towerclash.getText(k), 'howto.6');
    expect(six).not.toBe('howto.6');
    let lines: readonly number[] | null = null;
    await expect
      .poll(
        async () => {
          lines = await page.evaluate(() => new Promise<readonly number[] | null>((r) => requestAnimationFrame(() => r(window.__towerclash.getHowtoLines()))));
          return lines?.length ?? 0;
        },
        { message: 'the card reports its rows' },
      )
      .toBe(ROWS);
    expect(Math.max(...lines!), `${language} line counts ${JSON.stringify(lines)}`).toBeLessThanOrEqual(MAX_LINES);
    expect(Math.min(...lines!)).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`howto-${language}-360x640.png`) });
    expect(pageErrors).toEqual([]);
  });
}
