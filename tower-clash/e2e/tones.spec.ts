import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clientPoint, tapRect } from './helpers/tap';

/*
 * FE-14 team colours as a player setting (2026-10-17). Settings → "Team colours" → Vivid: the title
 * island's player roof turns from the classic blue to Vivid's (the lazy teamTones chunk lands, the
 * sprite cache re-bakes), the choice is in the save and survives a reload; the page's `?tones=`
 * override still wins for its page load. Like smoke.spec.ts this file imports nothing from src/;
 * the hit regions and colours mirror their sources.
 */

const SAVE_KEY = 'towerclash.save.v3';
// src/render/layout.ts — TITLE.settings; src/render/menuLayout.ts — SETTINGS.back, SETTINGS.tones (four equal segments, TONE_SETS order)
const TITLE_SETTINGS = { x: 180, y: 776, w: 172, h: 64 };
const SETTINGS_BACK = { x: 18, y: 20, w: 140, h: 60 };
const SETTINGS_TONES = { x: 86, y: 866, w: 548, h: 56 }; // AUD-F6: under the new Music row
const TONE_ORDER = ['classic', 'vivid', 'royal', 'pastel'] as const;
/**
 * A pixel of the title's player barracks roof (src/render/menus.ts DEMO_TOWERS[0] at 130, 250): the
 * middle of its flat mid-tone face, i.e. the set's player mid exactly (src/render/palette.ts
 * OWNER_TONES.player, src/render/teamTones.ts TEAM_TONES.*.def.player).
 */
const ROOF = { x: 132, y: 184 };
const PLAYER_MID = { classic: '#2f6df6', vivid: '#0a50ff', royal: '#1e3aa8', pastel: '#4d82ff' } as const;

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const savedTones = (page: Page) =>
  page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { settings?: { tones?: string } }).settings?.tones ?? null, SAVE_KEY);

/** `#rrggbb` of the #game canvas pixel under layout point `p` (read after a painted frame). */
async function pixel(page: Page, p: { x: number; y: number }): Promise<string> {
  const c = await clientPoint(page, p.x, p.y);
  return page.evaluate(([cx, cy]) => {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    const d = canvas.getContext('2d')!.getImageData(Math.round((cx - r.left) * k), Math.round((cy - r.top) * k), 1, 1).data;
    return `#${[d[0]!, d[1]!, d[2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }, [c.x, c.y] as const);
}

async function tapTone(page: Page, set: (typeof TONE_ORDER)[number]): Promise<void> {
  const segW = (SETTINGS_TONES.w - 8) / TONE_ORDER.length;
  await tapRect(page, { x: SETTINGS_TONES.x + 4 + TONE_ORDER.indexOf(set) * segW, y: SETTINGS_TONES.y, w: segW, h: SETTINGS_TONES.h });
}

async function boot(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => typeof window.__towerclash?.getTones === 'function');
  await expect.poll(() => screen(page)).toBe('title');
}

test.describe('FE-14 team colours setting', () => {
  test('Vivid picked in settings recolours the title island, persists, survives a reload; ?tones= still wins', async ({ page }, info) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    const chunks: string[] = [];
    page.on('request', (r) => {
      if (/teamTones-[\w-]+\.js$/.test(r.url())) chunks.push(r.url());
    });
    await boot(page);
    await expect.poll(() => pixel(page, ROOF)).toBe(PLAYER_MID.classic);
    expect(await page.evaluate(() => window.__towerclash.getTones())).toMatchObject({ setting: 'classic', active: 'classic', loaded: false });
    expect(chunks, 'the classic set never fetches the alternatives').toEqual([]);

    // settings → Vivid: saved at once, the chunk fetched on demand
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await tapTone(page, 'vivid');
    await expect.poll(() => savedTones(page)).toBe('vivid');
    await expect.poll(() => page.evaluate(() => window.__towerclash.getTones())).toMatchObject({ setting: 'vivid', active: 'vivid', loaded: true, player: PLAYER_MID.vivid });
    expect(chunks.length).toBe(1);
    await page.screenshot({ path: info.outputPath('fe14-settings-vivid.png'), scale: 'css' });
    await tapRect(page, SETTINGS_BACK);
    await expect.poll(() => screen(page)).toBe('title');
    await expect.poll(() => pixel(page, ROOF)).toBe(PLAYER_MID.vivid);
    await page.screenshot({ path: info.outputPath('fe14-title-vivid.png'), scale: 'css' });

    // reload: the saved set is back (the shipped palette may show for the frames before the chunk lands)
    await page.reload();
    await page.waitForFunction(() => typeof window.__towerclash?.getTones === 'function');
    await expect.poll(() => screen(page)).toBe('title');
    await expect.poll(() => pixel(page, ROOF)).toBe(PLAYER_MID.vivid);
    expect(await savedTones(page)).toBe('vivid');

    // the URL override wins for its page load and leaves the setting alone
    await boot(page, '/?tones=royal');
    await expect.poll(() => pixel(page, ROOF)).toBe(PLAYER_MID.royal);
    expect(await page.evaluate(() => window.__towerclash.getTones())).toMatchObject({ setting: 'vivid', active: 'royal' });
    await boot(page, '/?tones=classic');
    await expect.poll(() => pixel(page, ROOF)).toBe(PLAYER_MID.classic);
    expect(await savedTones(page)).toBe('vivid');

    // back to Classic from settings (no override): the shipped blue again
    await boot(page);
    await expect.poll(() => pixel(page, ROOF)).toBe(PLAYER_MID.vivid);
    await tapRect(page, TITLE_SETTINGS);
    await expect.poll(() => screen(page)).toBe('settings');
    await tapTone(page, 'classic');
    await expect.poll(() => savedTones(page)).toBe('classic');
    await tapRect(page, SETTINGS_BACK);
    await expect.poll(() => screen(page)).toBe('title');
    await expect.poll(() => pixel(page, ROOF)).toBe(PLAYER_MID.classic);
    expect(pageErrors).toEqual([]);
  });
});
