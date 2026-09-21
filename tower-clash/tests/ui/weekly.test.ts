import { beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, normalizeSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen, StartOptions } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import type { WeeklyChallenge } from '../../src/daily/challenge';
import { TWISTS, WEEKLY_BEST_KEEP, WEEKLY_REWARD, WEEKLY_UNLOCK_AFTER_LEVEL, weekKeyOf, weeklyFor } from '../../src/daily/challenge';
import { msToNextMonday, previousWeekKey, recordWeeklyResult, shownWeekStreak, weeklyDone, weeklyTargetDone, weeklyUnlocked } from '../../src/ui/weekly';
import { t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * Weekly Challenge (GDD §8) over the save and the play screen: 100 gold once per week on the first
 * win, 20 crystals once per week the first time an attempt is at or under the level's 3★ clock, a
 * loss writes nothing, the streak counts consecutive Mondays, the twist's modifiers replace the
 * commander upgrades and the boosters are off. No DOM: the app shell is a recorder.
 */

const WEEK = '2026-09-21'; // a Monday
const LAST_WEEK = '2026-09-14';
const NEXT_WEEK = '2026-09-28';
const LEAN = TWISTS.find((t) => t.id === 'lean')!;
const FAST_FEET = TWISTS.find((t) => t.id === 'fastFeet')!;
const TARGET = 30_000;

function weekly(over: Partial<WeeklyChallenge> = {}): WeeklyChallenge {
  return { weekKey: WEEK, levelId: 999, seed: 5, twist: LEAN, targetMs: TARGET, ...over };
}

function fakeApp(save: SaveData) {
  const starts: { levelId: number; seed?: number; opts?: StartOptions }[] = [];
  const nav: string[] = [];
  let current: Screen | null = null;
  const app: App = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {
      nav.push('title');
    },
    goLevels(notice?: string) {
      nav.push(notice ? `levels:${notice}` : 'levels');
    },
    goShop() {},
    goAchievements() {},
    startLevel(levelId, seed, opts) {
      starts.push({ levelId, seed, opts });
      return Promise.resolve(true);
    },
    go(screen) {
      current = screen;
    },
    openSettings() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-09-24',
    weekKey: () => WEEK,
  };
  return { app, starts, nav, current: () => current };
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.gold = 100;
  save.crystals = 3;
  save.stars[String(WEEKLY_UNLOCK_AFTER_LEVEL)] = 1;
});

describe('week arithmetic (UTC)', () => {
  it('previousWeekKey is seven days back, across month and year boundaries', () => {
    expect(previousWeekKey('2026-09-21')).toBe('2026-09-14');
    expect(previousWeekKey('2026-10-05')).toBe('2026-09-28');
    expect(previousWeekKey('2027-01-04')).toBe('2026-12-28');
    expect(previousWeekKey('2028-03-06')).toBe('2028-02-28'); // leap year
  });

  it('msToNextMonday counts to the next Monday 00:00 UTC', () => {
    expect(msToNextMonday(Date.UTC(2026, 8, 21, 0, 0, 0))).toBe(7 * 86_400_000); // Monday 00:00 → a full week
    expect(msToNextMonday(Date.UTC(2026, 8, 20, 12, 0, 0))).toBe(12 * 3_600_000); // Sunday noon
    expect(msToNextMonday(Date.UTC(2026, 8, 27, 23, 59, 0))).toBe(60_000);
    expect(msToNextMonday(Date.UTC(2026, 8, 24, 20, 0, 0))).toBe(3 * 86_400_000 + 4 * 3_600_000); // Thursday 20:00 → "3d 4h"
    // consistent with the picker's week key for every hour of a fortnight
    for (let h = 0; h < 14 * 24; h++) {
      const now = Date.UTC(2026, 8, 14, h);
      const next = now + msToNextMonday(now);
      expect(new Date(next).getUTCDay()).toBe(1);
      expect(next % 86_400_000).toBe(0);
      expect(weekKeyOf(new Date(next - 1))).toBe(weekKeyOf(new Date(now)));
    }
  });
});

describe('unlock gate', () => {
  it(`opens with one star on level ${WEEKLY_UNLOCK_AFTER_LEVEL}`, () => {
    const fresh = defaultSave();
    expect(weeklyUnlocked(fresh)).toBe(false);
    fresh.stars[String(WEEKLY_UNLOCK_AFTER_LEVEL)] = 0;
    expect(weeklyUnlocked(fresh)).toBe(false);
    fresh.stars[String(WEEKLY_UNLOCK_AFTER_LEVEL)] = 1;
    expect(weeklyUnlocked(fresh)).toBe(true);
    expect(t('weekly.locked', { n: WEEKLY_UNLOCK_AFTER_LEVEL })).toBe('Clear level 32 to unlock');
  });
});

describe('recordWeeklyResult (gold once per week, crystals once at the target, streak, best)', () => {
  const level: LevelDef = makeLevel({ star3: TARGET, star2: 60_000 });

  it('first win above the target pays the gold only; a replay pays nothing; level stars untouched', () => {
    const first = recordWeeklyResult(save, weekly(), level, 'won', 45_000);
    expect(first).toMatchObject({ weekKey: WEEK, won: true, stars: 2, firstWin: true, gold: WEEKLY_REWARD.gold, targetHit: false, crystals: 0, streak: 1, best: { stars: 2, timeMs: 45_000, target: false }, targetMs: TARGET });
    expect(save.gold).toBe(200);
    expect(save.crystals).toBe(3);
    expect(save.weekly).toEqual({ lastWinWeek: WEEK, streak: 1, best: { [WEEK]: { stars: 2, timeMs: 45_000, target: false } } });
    expect(save.stars['999']).toBeUndefined();
    expect(save.challenge.lastWinDay).toBeNull();
    expect(save.milestones).toEqual([]);
    expect(weeklyDone(save, WEEK)).toBe(true);
    expect(weeklyTargetDone(save, WEEK)).toBe(false);

    const again = recordWeeklyResult(save, weekly(), level, 'won', 50_000);
    expect(again).toMatchObject({ firstWin: false, gold: 0, targetHit: false, crystals: 0, streak: 1, best: { stars: 2, timeMs: 45_000 } });
    expect(save.gold).toBe(200);
    expect(save.crystals).toBe(3);
  });

  it('the target crystals are paid once, on the first attempt at or under star3 — also a later one', () => {
    recordWeeklyResult(save, weekly(), level, 'won', 45_000); // gold, no target
    const hit = recordWeeklyResult(save, weekly(), level, 'won', TARGET); // exactly on the clock counts
    expect(hit).toMatchObject({ firstWin: false, gold: 0, targetHit: true, crystals: WEEKLY_REWARD.crystals, best: { stars: 3, timeMs: TARGET, target: true } });
    expect(save.gold).toBe(200);
    expect(save.crystals).toBe(3 + 20);
    expect(weeklyTargetDone(save, WEEK)).toBe(true);
    // faster again: the best improves, nothing more is paid
    const faster = recordWeeklyResult(save, weekly(), level, 'won', 20_000);
    expect(faster).toMatchObject({ targetHit: false, crystals: 0, best: { stars: 3, timeMs: 20_000, target: true } });
    expect(save.crystals).toBe(23);
    // slower again: the best (and its target flag) stay
    recordWeeklyResult(save, weekly(), level, 'won', 59_000);
    expect(save.weekly.best[WEEK]).toEqual({ stars: 3, timeMs: 20_000, target: true });
  });

  it('gold and crystals can land on the same run (first win under the target)', () => {
    const both = recordWeeklyResult(save, weekly(), level, 'won', 25_000);
    expect(both).toMatchObject({ firstWin: true, gold: 100, targetHit: true, crystals: 20, stars: 3, streak: 1 });
    expect(save.gold).toBe(200);
    expect(save.crystals).toBe(23);
    expect(save.weekly.best[WEEK]).toEqual({ stars: 3, timeMs: 25_000, target: true });
  });

  it('a win just over the target pays no crystals', () => {
    const over = recordWeeklyResult(save, weekly(), level, 'won', TARGET + 50);
    expect(over).toMatchObject({ stars: 2, targetHit: false, crystals: 0, gold: 100 });
    expect(save.crystals).toBe(3);
  });

  it('a loss pays nothing and changes nothing', () => {
    const before = JSON.stringify(save);
    const lost = recordWeeklyResult(save, weekly(), level, 'lost', 90_000);
    expect(lost).toMatchObject({ won: false, stars: 0, firstWin: false, gold: 0, targetHit: false, crystals: 0, streak: 0, best: null });
    expect(JSON.stringify(save)).toBe(before);
    expect(save.defeats).toEqual({});
  });

  it('streak: 1 → 2 → 3 across consecutive Mondays, back to 1 after a missed week, shown 0 when broken, capped at 99', () => {
    expect(recordWeeklyResult(save, weekly({ weekKey: LAST_WEEK }), level, 'won', 45_000).streak).toBe(1);
    expect(shownWeekStreak(save, WEEK)).toBe(1); // last week won: alive this week
    expect(recordWeeklyResult(save, weekly({ weekKey: WEEK }), level, 'won', 45_000).streak).toBe(2);
    expect(recordWeeklyResult(save, weekly({ weekKey: NEXT_WEEK }), level, 'won', 45_000).streak).toBe(3);
    expect(save.weekly.streak).toBe(3);
    expect(save.gold).toBe(100 + 3 * 100);
    expect(shownWeekStreak(save, '2026-10-05')).toBe(3);
    expect(shownWeekStreak(save, '2026-10-12')).toBe(0); // a missed week breaks it
    expect(recordWeeklyResult(save, weekly({ weekKey: '2026-10-12' }), level, 'won', 45_000).streak).toBe(1);
    expect(save.weekly.streak).toBe(1);

    save.weekly = { lastWinWeek: LAST_WEEK, streak: 150, best: {} };
    expect(shownWeekStreak(save, WEEK)).toBe(99);
    expect(recordWeeklyResult(save, weekly(), level, 'won', 45_000).streak).toBe(99);
    expect(save.weekly.streak).toBe(151); // the save keeps the real count
    // independent of the daily counters
    expect(save.challenge.streak).toBe(0);
    expect(save.daily.streak).toBe(0);
  });

  it('a match started on Sunday and won after the Monday rollover books against the week it started in', () => {
    const started = weeklyFor(LAST_WEEK); // captured when the match started (Sunday 2026-09-20)
    const out = recordWeeklyResult(save, started, level, 'won', 45_000); // "now" is Monday 2026-09-21
    expect(out.weekKey).toBe(LAST_WEEK);
    expect(out.firstWin).toBe(true);
    expect(save.weekly.lastWinWeek).toBe(LAST_WEEK);
    expect(save.weekly.best[LAST_WEEK]).toBeDefined();
    expect(save.weekly.best[WEEK]).toBeUndefined();
    // the new week is undone and the streak (won "last week") is alive
    expect(weeklyDone(save, WEEK)).toBe(false);
    expect(shownWeekStreak(save, WEEK)).toBe(1);
  });

  it(`best is pruned to the newest ${WEEKLY_BEST_KEEP} week keys`, () => {
    for (let w = 0; w < 14; w++) {
      const key = new Date(Date.UTC(2026, 0, 5) + w * 7 * 86_400_000).toISOString().slice(0, 10); // Mondays from 2026-01-05
      save.weekly.best[key] = { stars: 1, timeMs: 1000, target: false };
    }
    recordWeeklyResult(save, weekly(), level, 'won', 45_000);
    const keys = Object.keys(save.weekly.best).sort();
    expect(keys.length).toBe(WEEKLY_BEST_KEEP);
    expect(keys[0]).toBe('2026-01-26');
    expect(keys[keys.length - 1]).toBe(WEEK);
  });
});

describe('save.weekly normalisation (hostile input)', () => {
  it('defaults, well-formed data, and garbage', () => {
    expect(defaultSave().weekly).toEqual({ lastWinWeek: null, streak: 0, best: {} });
    expect(normalizeSave({ version: 3 }).weekly).toEqual({ lastWinWeek: null, streak: 0, best: {} });
    const ok = normalizeSave({ weekly: { lastWinWeek: WEEK, streak: 2.9, best: { [WEEK]: { stars: 7, timeMs: 41_250.7, target: true }, [LAST_WEEK]: { stars: 1, timeMs: 50_000, target: 'yes' } } } });
    expect(ok.weekly).toEqual({ lastWinWeek: WEEK, streak: 2, best: { [WEEK]: { stars: 3, timeMs: 41_250, target: true }, [LAST_WEEK]: { stars: 1, timeMs: 50_000, target: false } } });
    expect(normalizeSave({ weekly: { lastWinWeek: 20260921, streak: -3, best: 'none' } }).weekly).toEqual({ lastWinWeek: null, streak: 0, best: {} });
    expect(normalizeSave({ weekly: null }).weekly).toEqual({ lastWinWeek: null, streak: 0, best: {} });
    expect(normalizeSave({ weekly: { streak: 1e300, best: [] } }).weekly.streak).toBeGreaterThan(0);
  });

  it('only Monday keys survive; the newest 12 are kept', () => {
    const best: Record<string, unknown> = {
      '2026-09-22': { stars: 3, timeMs: 1 }, // Tuesday
      '2026-09-20': { stars: 3, timeMs: 1 }, // Sunday
      '9999-99-99': { stars: 3, timeMs: 1 },
      'not-a-key': { stars: 3, timeMs: 1 },
      [WEEK]: { stars: 3, timeMs: 1 },
      [WEEK + 'x']: { stars: 3, timeMs: 1 },
      '2026-09-14': { stars: -1, timeMs: 1 },
      '2026-09-07': { stars: 2 },
    };
    expect(normalizeSave({ weekly: { lastWinWeek: '2026-09-22', best } }).weekly).toEqual({ lastWinWeek: null, streak: 0, best: { [WEEK]: { stars: 3, timeMs: 1, target: false }, '2026-09-14': { stars: 0, timeMs: 1, target: false } } });
    const many: Record<string, unknown> = {};
    for (let w = 0; w < 20; w++) many[new Date(Date.UTC(2026, 0, 5) + w * 7 * 86_400_000).toISOString().slice(0, 10)] = { stars: 1, timeMs: 1 };
    const kept = Object.keys(normalizeSave({ weekly: { best: many } }).weekly.best).sort();
    expect(kept.length).toBe(12);
    expect(kept[0]).toBe('2026-03-02');
    expect(kept[11]).toBe('2026-05-18');
  });

  it('a hostile weekly block cannot break the streak arithmetic or the first-win payout', () => {
    const s = normalizeSave({ weekly: { lastWinWeek: '2026-09-22', streak: 1e300, best: { [WEEK]: { stars: 3, timeMs: 1, target: 1 } } } });
    s.gold = 0;
    s.crystals = 0;
    expect(shownWeekStreak(s, WEEK)).toBe(0);
    expect(weeklyDone(s, WEEK)).toBe(true); // this week has a best already (a bogus one, but a shape-valid one)
    expect(weeklyTargetDone(s, WEEK)).toBe(false); // `target: 1` is not `true`
    const out = recordWeeklyResult(s, weekly(), makeLevel({ star3: TARGET, star2: 60_000 }), 'won', 20_000);
    expect(out).toMatchObject({ firstWin: true, gold: 100, targetHit: true, crystals: 20, streak: 1 });
    expect(s.gold).toBe(100);
    expect(s.crystals).toBe(20);
  });
});

describe('PlayScreen in weekly mode', () => {
  const level = makeLevel({ star3: TARGET, star2: 60_000 });
  /** A level the player wins on the first tick once every tower is theirs (see continue.test.ts). */
  function winNow(play: PlayScreen, clock: { now: number }): void {
    const state = play.state;
    for (const t of Object.values(state.towers)) t.owner = 'player';
    state.units = state.units.filter((u) => u.owner === 'player');
    state.links = state.links.filter((l) => l.owner === 'player');
    clock.now += 250;
    play.update(250, clock.now);
  }

  it("applies the twist's modifiers instead of the commander upgrades, uses the fixed seed, boosters off", () => {
    save.upgrades = { production: 5, capacity: 5, garrison: 5, march_speed: 5 };
    save.charges.overdrive = 2;
    const shell = fakeApp(save);
    const w = weekly({ twist: FAST_FEET, seed: 4242 });
    const play = new PlayScreen(shell.app, level, w.seed, 20, { weekly: w });
    shell.app.go(play);
    expect(play.weekly).toBe(w);
    expect(play.challenge).toBeNull();
    expect(play.state.modifiers).toEqual(FAST_FEET.modifiers);
    expect(play.state.modifiers.unitSpeedMul).toBe(1.25);
    expect(play.state.seed).toBe(4242);
    expect(play.useBooster('overdrive')).toBe(false);
    expect(play.useBooster('airstrike')).toBe(false);
    play.update(250, 250);
    expect(play.state.boosters).toEqual([]);
    expect(save.gold).toBe(100);
    expect(save.charges.overdrive).toBe(2);
    expect(t('weekly.noBoosters')).toBe('Not in the weekly challenge');
  });

  it('a win goes through the weekly path: gold + target crystals once, no level stars, NEXT → map, RETRY keeps the seed', async () => {
    const shell = fakeApp(save);
    const w = weekly();
    const play = new PlayScreen(shell.app, level, w.seed, 20, { weekly: w });
    shell.app.go(play);
    const clock = { now: 0 };
    winNow(play, clock); // 250 ms ≤ target
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    const info = (result as ResultScreen).info;
    expect(info.ui.outcome).toBe('won');
    expect(info.weekly).toBe(w);
    expect(info.challenge).toBeUndefined();
    expect(info.weeklyOutcome).toMatchObject({ firstWin: true, gold: 100, targetHit: true, crystals: 20, streak: 1 });
    expect(info.ui.coinsEarned).toBe(100);
    expect(info.earnings.crystals).toBe(20);
    expect(info.ui.hasNext).toBe(true);
    expect(info.ui.hud?.challenge).toEqual({ twist: t('daily.twist.lean'), weekly: true });
    expect(save.gold).toBe(200);
    expect(save.crystals).toBe(23);
    expect(save.stars['999']).toBeUndefined();
    expect(save.weekly.lastWinWeek).toBe(WEEK);
    const ex = (result as ResultScreen).extras();
    expect(ex.continueCrystals).toBeNull();
    expect(ex.continueAd).toBe(false);
    expect(ex.skipCrystals).toBeNull();
    expect(ex.daily).toBeUndefined();
    expect(ex.weekly).toMatchObject({ firstWin: true, gold: 100, streak: 1, best: { stars: 3, target: true } });
    expect(ex.crystalsEarned).toBe(20);
    // the target bonus is named in the toast slot (GDD §8.2)
    (result as ResultScreen).enter();
    expect((result as ResultScreen).toast.opts(performance.now())?.text).toBe(t('weekly.resultTarget', { crystals: 20 }));

    // NEXT (Enter) → the level map, never the next level
    (result as ResultScreen).key({ key: 'Enter' } as KeyboardEvent);
    await new Promise((r) => setTimeout(r, 0));
    expect(shell.nav).toEqual(['levels']);
    expect(shell.starts).toEqual([]);

    // a second run the same week pays nothing and reports the best
    const replay = new PlayScreen(shell.app, level, w.seed, 20, { weekly: w });
    shell.app.go(replay);
    winNow(replay, clock);
    const again = (shell.current() as ResultScreen).info;
    expect(again.weeklyOutcome).toMatchObject({ firstWin: false, gold: 0, targetHit: false, crystals: 0, best: { stars: 3, target: true } });
    expect(again.ui.coinsEarned).toBe(0);
    expect(save.gold).toBe(200);
    expect(save.crystals).toBe(23);

    // RETRY keeps the seed and the weekly
    replay.restart();
    expect(shell.starts).toEqual([{ levelId: 999, seed: w.seed, opts: { weekly: w } }]);
  });

  it('a lost weekly pays nothing and offers no continue', () => {
    const shell = fakeApp(save);
    const hard = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 40, level: 1 },
        { id: 'q', x: 160, y: 900, owner: 'player', units: 24, level: 1 },
        { id: 'e', x: 360, y: 160, owner: 'enemy1', units: 100, level: 3 },
      ],
    });
    const play = new PlayScreen(shell.app, hard, 7, 20, { weekly: weekly() });
    shell.app.go(play);
    play.setSuicide(true);
    const clock = { now: 0 };
    while (shell.current() === play && play.state.time < 300_000) {
      clock.now += 250;
      play.update(250, clock.now);
    }
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    const info = (result as ResultScreen).info;
    expect(info.ui.outcome).toBe('lost');
    expect(info.weeklyOutcome).toMatchObject({ won: false, firstWin: false, gold: 0, crystals: 0 });
    expect(save.gold).toBe(100);
    expect(save.crystals).toBe(3);
    expect(save.weekly.lastWinWeek).toBeNull();
    expect(save.defeats).toEqual({});
    expect((result as ResultScreen).extras().continueCrystals).toBeNull();
  });

  it('restart / RETRY after the Monday rollover does not replay the stale week: the map opens with the "new weekly" notice', () => {
    let week = WEEK;
    const { app, starts, nav, current } = fakeApp(save);
    app.weekKey = () => week;
    const w = weekly({ levelId: 33 });
    const play = new PlayScreen(app, makeLevel({ id: 33 }), w.seed, 1, { weekly: w });
    play.restart(); // same week: a plain restart with the seed and the weekly
    expect(starts).toEqual([{ levelId: 33, seed: 5, opts: { weekly: w } }]);
    week = NEXT_WEEK;
    play.restart();
    expect(starts.length).toBe(1);
    expect(nav).toEqual([`levels:${t('weekly.newReady')}`]);
    expect(t('weekly.newReady')).toBe('New weekly challenge is ready');

    // result-screen RETRY too
    week = WEEK;
    const play2 = new PlayScreen(app, makeLevel({ id: 33, star3: TARGET, star2: 60_000 }), w.seed, 1, { weekly: w });
    app.go(play2);
    for (const tower of Object.values(play2.state.towers)) tower.owner = 'player';
    play2.state.units = [];
    play2.state.links = [];
    play2.update(250, 250);
    const result = current() as ResultScreen;
    expect(result).toBeInstanceOf(ResultScreen);
    expect(save.weekly.lastWinWeek).toBe(WEEK);
    week = NEXT_WEEK;
    (result as unknown as { retry(): void }).retry();
    expect(starts.length).toBe(1);
    expect(nav).toEqual([`levels:${t('weekly.newReady')}`, `levels:${t('weekly.newReady')}`]);
    // a campaign level keeps restarting whatever the week
    const campaign = new PlayScreen(app, makeLevel({ id: 3 }), 1, 1);
    campaign.restart();
    expect(starts).toEqual([{ levelId: 33, seed: 5, opts: { weekly: w } }, { levelId: 3, seed: undefined, opts: undefined }]);
  });
});
