import { afterEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { LEVEL_MAP } from '../../src/render/menuLayout';
import { CHALLENGE_PLAY_HIT } from '../../src/render/menusLevels';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave } from '../../src/ui/save';
import type { App, StartOptions } from '../../src/ui/screens';
import { LevelSelectScreen, challengeCountdown } from '../../src/ui/levelSelect';
import { UNLOCK_AFTER_LEVEL, WEEKLY_UNLOCK_AFTER_LEVEL, challengeFor, weeklyFor } from '../../src/daily/challenge';
import { registerDictionary, setLanguage, t } from '../../src/ui/i18n';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';

/*
 * AUD-U23: the challenge card speaks local time and has a visible call to action. The rollover stays
 * UTC midnight / Monday 00:00 UTC (GDD §7.2 / §8.1); the countdown shows the time left and, where the
 * device clock is more than an hour off UTC, the local clock time of the rollover. The ▶ PLAY /
 * DONE / LOCKED pill (`CHALLENGE_PLAY_HIT`) does what the card does.
 */

const H = 3_600_000;
const M = 60_000;
const DAY = '2026-09-27';
const WEEK = '2026-09-21';

describe('challengeCountdown (local display of the UTC rollover)', () => {
  afterEach(async () => {
    await setLanguage('en');
  });

  it('hours and minutes left, MM:SS under an hour; no note within ±1 h of UTC', () => {
    expect(challengeCountdown(10 * H + 24 * M + 30_000, 0, false)).toEqual({ full: 'New in 10h 24m', time: '10h 24m' });
    expect(challengeCountdown(H, 0, false)).toEqual({ full: 'New in 1h 0m', time: '1h 0m' });
    expect(challengeCountdown(59 * M + 59_000, 0, false)).toEqual({ full: 'New in 59:59', time: '59:59' });
    // London in summer (+1 h), Lisbon / Azores (−1 h): the rollover is close enough to midnight to say nothing
    expect(challengeCountdown(10 * H, 60, false).full).toBe('New in 10h 0m');
    expect(challengeCountdown(10 * H, -60, false).full).toBe('New in 10h 0m');
  });

  it('more than an hour off UTC: the local clock time of the rollover (Baku 04:00, India 05:30, New York 19:00)', () => {
    expect(challengeCountdown(10 * H + 24 * M, 240, false)).toEqual({ full: 'New in 10h 24m (at 04:00)', time: '10h 24m' });
    expect(challengeCountdown(3 * M, 330, false).full).toBe('New in 03:00 (at 05:30)');
    expect(challengeCountdown(2 * H, -300, false).full).toBe('New in 2h 0m (at 19:00)');
    expect(challengeCountdown(2 * H, 61, false).full).toBe('New in 2h 0m (at 01:01)');
  });

  it('weekly: days + hours, then hours + minutes; the rollover is Monday east of UTC and Sunday west of it', () => {
    expect(challengeCountdown(3 * 24 * H + 4 * H + 59 * M, 0, true)).toEqual({ full: 'New in 3d 4h', time: '3d 4h' });
    expect(challengeCountdown(23 * H + 5 * M, 0, true).full).toBe('New in 23h 5m');
    expect(challengeCountdown(6 * 24 * H, 240, true).full).toBe('New in 6d 0h (at Mon 04:00)');
    expect(challengeCountdown(6 * 24 * H, 840, true).full).toBe('New in 6d 0h (at Mon 14:00)');
    expect(challengeCountdown(6 * 24 * H, -300, true).full).toBe('New in 6d 0h (at Sun 19:00)');
    expect(challengeCountdown(6 * 24 * H, -720, true).full).toBe('New in 6d 0h (at Sun 12:00)');
  });

  it('no clock names UTC any more, in any language', async () => {
    registerDictionary('az', az);
    registerDictionary('ru', ru);
    registerDictionary('tr', tr);
    for (const lang of ['en', 'az', 'ru', 'tr'] as const) {
      await setLanguage(lang);
      for (const [ms, off, weekly] of [
        [10 * H, 240, false],
        [10 * H, 0, false],
        [30 * M, -300, false],
        [5 * 24 * H, 240, true],
        [5 * 24 * H, -300, true],
        [5 * H, 0, true],
      ] as const) {
        const c = challengeCountdown(ms, off, weekly);
        expect(c.full, `${lang}`).not.toMatch(/UTC/);
        expect(c.full, `${lang}`).toContain(c.time);
        expect(c.full.startsWith(c.time) || c.full.includes(` ${c.time}`), `${lang}: ${c.full}`).toBe(true);
        if (Math.abs(off) > 60) expect(c.full, `${lang}`).toMatch(/\(.*\d\d:\d\d\)$/);
        else expect(c.full, `${lang}`).not.toMatch(/\)$/);
      }
      // the Azerbaijani card the stakeholder sees in Baku
      if (lang === 'az') expect(challengeCountdown(10 * H + 24 * M, 240, false).full).toBe('Yenisi 10 s 24 dəq sonra (saat 04:00)');
    }
  });
});

function fakeApp(save: SaveData) {
  const starts: { levelId: number; seed?: number; opts?: StartOptions }[] = [];
  const app: App = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel(levelId, seed, opts) {
      starts.push({ levelId, seed, opts });
      return Promise.resolve(true);
    },
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => DAY,
    weekKey: () => WEEK,
  };
  return { app, starts };
}

const pointer = (x: number, y: number) => ({ x, y, id: 1, timeMs: 0 });
const tap = (map: LevelSelectScreen, x: number, y: number): void => {
  map.down(pointer(x, y));
  map.up(pointer(x, y));
};

function unlockedSave(upTo: number): SaveData {
  const save = defaultSave();
  for (let id = 1; id <= upTo; id++) save.stars[String(id)] = 1;
  // yesterday won: no "Yesterday's map" row
  save.challenge.best['2026-09-26'] = { stars: 1, timeMs: 60_000 };
  return save;
}

describe('the CTA pill (AUD-U23)', () => {
  it('a tap on ▶ PLAY starts today’s challenge, like the card', () => {
    const { app, starts } = fakeApp(unlockedSave(UNLOCK_AFTER_LEVEL));
    const map = new LevelSelectScreen(app);
    expect(map.getCardTab()).toBe('daily');
    // the pill's centre (pressed as the pill, not the card), and the top of its tap area above the card (44 pt at 360 px)
    map.down(pointer(676 - 50, LEVEL_MAP.daily.y + 28));
    expect((map as unknown as { pressed: unknown }).pressed).toBe(CHALLENGE_PLAY_HIT);
    map.cancel();
    tap(map, 676 - 50, LEVEL_MAP.daily.y + 28);
    tap(map, CHALLENGE_PLAY_HIT.x + 20, CHALLENGE_PLAY_HIT.y + 2);
    const ch = challengeFor(DAY);
    expect(starts).toEqual([
      { levelId: ch.levelId, seed: ch.seed, opts: { challenge: ch } },
      { levelId: ch.levelId, seed: ch.seed, opts: { challenge: ch } },
    ]);
  });

  it('LOCKED explains the lock like the card (no start)', () => {
    const { app, starts } = fakeApp(unlockedSave(UNLOCK_AFTER_LEVEL - 1));
    const map = new LevelSelectScreen(app);
    tap(map, 676 - 50, LEVEL_MAP.daily.y + 28);
    expect(starts).toEqual([]);
    expect(map.toast.opts(0)?.text).toBe(t('daily.locked', { n: UNLOCK_AFTER_LEVEL }));
  });

  it('on the WEEKLY tab it starts the weekly', () => {
    const { app, starts } = fakeApp(unlockedSave(WEEKLY_UNLOCK_AFTER_LEVEL));
    const map = new LevelSelectScreen(app);
    const tab = LEVEL_MAP.dailyTabWeekly;
    tap(map, tab.x + tab.w / 2, tab.y + tab.h / 2);
    expect(map.getCardTab()).toBe('weekly');
    tap(map, 676 - 50, LEVEL_MAP.daily.y + 28);
    const w = weeklyFor(WEEK);
    expect(starts).toEqual([{ levelId: w.levelId, seed: w.seed, opts: { weekly: w } }]);
    tap(map, LEVEL_MAP.dailyTabDaily.x + 10, LEVEL_MAP.dailyTabDaily.y + 20); // back to DAILY for the other tests (session-wide tab)
    expect(map.getCardTab()).toBe('daily');
  });
});
