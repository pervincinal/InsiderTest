import { beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { evaluateAchievements } from '../../src/economy/achievements';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import type { WeeklyChallenge } from '../../src/daily/challenge';
import { STREAK_MILESTONES, TWISTS, WEEKLY_REWARD, WEEKLY_STREAK_MILESTONES, WEEKLY_UNLOCK_AFTER_LEVEL } from '../../src/daily/challenge';
import { recordWeeklyResult } from '../../src/ui/weekly';
import { t } from '../../src/ui/i18n';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { makeLevel } from '../helpers';

/*
 * Week-streak milestones (WK-1, GDD §8.1): the first win of a week that brings `save.weekly.streak`
 * to exactly 4 / 8 / 12 pays 15 / 30 / 60 crystals once, derived from the streak value alone (no save
 * field). Replays, losses and the 3★-target crystals are unchanged; `weekly_streak_4` still stacks.
 */

const LEAN = TWISTS.find((tw) => tw.id === 'lean')!;
const TARGET = 30_000;
const SLOW = 45_000; // a 2★ win above the target: gold only, no target crystals
const FIRST_MONDAY = '2026-01-05';
const level: LevelDef = makeLevel({ star3: TARGET, star2: 60_000 });

/** The Monday key `n` weeks after `FIRST_MONDAY`. */
function monday(n: number): string {
  const [y, m, d] = FIRST_MONDAY.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 7 * n)).toISOString().slice(0, 10);
}

function weekly(weekKey: string): WeeklyChallenge {
  return { weekKey, levelId: 999, seed: 5, twist: LEAN, targetMs: TARGET };
}

/** Win weeks `from..to` (inclusive, consecutive Mondays) above the target; returns each first win's milestone. */
function winWeeks(save: SaveData, from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(recordWeeklyResult(save, weekly(monday(n)), level, 'won', SLOW).milestone);
  return out;
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.crystals = 3;
  save.stars[String(WEEKLY_UNLOCK_AFTER_LEVEL)] = 1;
});

describe('WEEKLY_STREAK_MILESTONES', () => {
  it('pins weeks → crystals, ascending, next to the daily STREAK_MILESTONES', () => {
    expect(WEEKLY_STREAK_MILESTONES).toEqual([
      [4, 15],
      [8, 30],
      [12, 60],
    ]);
    expect(STREAK_MILESTONES.length).toBe(3);
  });
});

describe('recordWeeklyResult week-streak milestones', () => {
  it('1 → 4 across consecutive Mondays pays 15 once, on week 4, inside `crystals`', () => {
    expect(winWeeks(save, 0, 2)).toEqual([0, 0, 0]);
    expect(save.crystals).toBe(3);
    const w4 = recordWeeklyResult(save, weekly(monday(3)), level, 'won', SLOW);
    expect(w4).toMatchObject({ firstWin: true, streak: 4, gold: WEEKLY_REWARD.gold, targetHit: false, milestone: 15, crystals: 15 });
    expect(save.crystals).toBe(3 + 15);
    expect(save.gold).toBe(4 * WEEKLY_REWARD.gold);
  });

  it('a replay in week 4 (faster, even under the target) pays no milestone again; a loss pays nothing', () => {
    winWeeks(save, 0, 3);
    expect(save.crystals).toBe(18);
    const replay = recordWeeklyResult(save, weekly(monday(3)), level, 'won', SLOW - 1_000);
    expect(replay).toMatchObject({ firstWin: false, gold: 0, milestone: 0, crystals: 0, streak: 4 });
    const loss = recordWeeklyResult(save, weekly(monday(3)), level, 'lost', 90_000);
    expect(loss).toMatchObject({ won: false, milestone: 0, crystals: 0, streak: 4 });
    expect(save.crystals).toBe(18);
    // the target crystals still land on a later attempt — and only they
    const target = recordWeeklyResult(save, weekly(monday(3)), level, 'won', TARGET);
    expect(target).toMatchObject({ firstWin: false, targetHit: true, milestone: 0, crystals: WEEKLY_REWARD.crystals });
    expect(save.crystals).toBe(18 + 20);
  });

  it('a loss in week 4 before the first win pays nothing; the win that week still pays 15', () => {
    winWeeks(save, 0, 2);
    expect(recordWeeklyResult(save, weekly(monday(3)), level, 'lost', 90_000)).toMatchObject({ milestone: 0, crystals: 0, streak: 3 });
    expect(save.weekly.streak).toBe(3);
    expect(recordWeeklyResult(save, weekly(monday(3)), level, 'won', SLOW).milestone).toBe(15);
  });

  it('4 → 5 pays nothing', () => {
    winWeeks(save, 0, 3);
    const w5 = recordWeeklyResult(save, weekly(monday(4)), level, 'won', SLOW);
    expect(w5).toMatchObject({ streak: 5, milestone: 0, crystals: 0 });
    expect(save.crystals).toBe(18);
  });

  it('a missed week resets the streak; rebuilt to 4 it pays 15 again', () => {
    expect(winWeeks(save, 0, 4)).toEqual([0, 0, 0, 15, 0]);
    // week 5 missed: week 6 restarts at 1
    const restart = recordWeeklyResult(save, weekly(monday(6)), level, 'won', SLOW);
    expect(restart).toMatchObject({ streak: 1, milestone: 0 });
    expect(winWeeks(save, 7, 9)).toEqual([0, 0, 15]);
    expect(save.weekly.streak).toBe(4);
    expect(save.crystals).toBe(3 + 15 + 15);
  });

  it('8 pays 30, 12 pays 60, 16 pays nothing (no repeat past the last tier)', () => {
    const paid = winWeeks(save, 0, 16);
    expect(paid.flatMap((m, i) => (m > 0 ? [[i + 1, m]] : []))).toEqual([
      [4, 15],
      [8, 30],
      [12, 60],
    ]);
    expect(paid[15]).toBe(0); // week 16
    expect(save.weekly.streak).toBe(17);
    expect(save.crystals).toBe(3 + 15 + 30 + 60);
  });

  it('the 3★ target (20) and the milestone (15) land on the same run: both in `crystals`, one wallet credit', () => {
    winWeeks(save, 0, 2);
    const both = recordWeeklyResult(save, weekly(monday(3)), level, 'won', TARGET - 5_000);
    expect(both).toMatchObject({ firstWin: true, streak: 4, stars: 3, targetHit: true, milestone: 15, crystals: WEEKLY_REWARD.crystals + 15, gold: WEEKLY_REWARD.gold });
    expect(save.crystals).toBe(3 + 20 + 15);
    expect(save.weekly.best[monday(3)]).toEqual({ stars: 3, timeMs: TARGET - 5_000, target: true });
  });

  it('no new save field: the weekly block keeps its three keys', () => {
    winWeeks(save, 0, 3);
    expect(Object.keys(save.weekly).sort()).toEqual(['best', 'lastWinWeek', 'streak']);
  });

  it('weekly_streak_4 still fires on week 4 and stacks with the milestone; a rebuilt week 4 pays only the milestone', () => {
    winWeeks(save, 0, 2);
    expect(evaluateAchievements(save).unlocked.map((a) => a.id)).not.toContain('weekly_streak_4');
    recordWeeklyResult(save, weekly(monday(3)), level, 'won', SLOW);
    const grant = evaluateAchievements(save);
    expect(grant.unlocked.map((a) => a.id)).toEqual(['weekly_streak_4']);
    expect(save.crystals).toBe(3 + 15 + grant.crystals);
    // break and rebuild: the achievement is spent, the milestone is not
    const before = save.crystals;
    winWeeks(save, 5, 8);
    expect(evaluateAchievements(save).unlocked).toEqual([]);
    expect(save.crystals).toBe(before + 15);
  });
});

describe('result toast (GDD §7.3 slot: achievement > daily milestone > week-streak milestone > 3★ target)', () => {
  function fakeApp(s: SaveData, weekKey: string) {
    let current: Screen | null = null;
    const app: App = {
      view: {} as View,
      save: s,
      ads: createAdSession(),
      palette: () => getPalette(false),
      goTitle() {},
      goLevels() {},
      goShop() {},
      goAchievements() {},
      startLevel: () => Promise.resolve(true),
      go(screen) {
        current = screen;
      },
      openSettings() {},
      openHowTo() {},
      setSpeed() {},
      setLanguage() {},
      dayKey: () => weekKey,
      weekKey: () => weekKey,
    };
    return { app, current: () => current };
  }

  /** Win the weekly of `weekKey` on the first tick (250 ms of sim time, under the target). */
  function winResult(weekKey: string): ResultScreen {
    const shell = fakeApp(save, weekKey);
    const w = weekly(weekKey);
    const play = new PlayScreen(shell.app, level, w.seed, 20, { weekly: w });
    shell.app.go(play);
    const state = play.state;
    for (const tw of Object.values(state.towers)) tw.owner = 'player';
    state.units = state.units.filter((u) => u.owner === 'player');
    state.links = state.links.filter((l) => l.owner === 'player');
    play.update(250, 250);
    const result = shell.current() as ResultScreen;
    expect(result).toBeInstanceOf(ResultScreen);
    result.enter();
    return result;
  }

  it('the milestone toast names the week and the bonus when no achievement is granted (milestone beats the target)', () => {
    save.achievements.unlocked = ['weekly_streak_4']; // a rebuilt run: the achievement is spent
    save.weekly = { lastWinWeek: monday(2), streak: 3, best: {} };
    const result = winResult(monday(3));
    expect(result.info.weeklyOutcome).toMatchObject({ streak: 4, targetHit: true, milestone: 15, crystals: 35 });
    expect(result.info.achievements.unlocked).toEqual([]);
    expect(result.extras().crystalsEarned).toBe(35);
    expect(result.toast.opts(performance.now())?.text).toBe(t('weekly.resultMilestone', { n: 4, crystals: 15 }));
    expect(t('weekly.resultMilestone', { n: 4, crystals: 15 })).toBe('Week streak 4 · +15 crystals');
  });

  it('without a milestone the target toast still names 20, not the outcome total', () => {
    save.weekly = { lastWinWeek: monday(0), streak: 1, best: {} };
    const result = winResult(monday(1));
    expect(result.info.weeklyOutcome).toMatchObject({ streak: 2, targetHit: true, milestone: 0, crystals: 20 });
    expect(result.toast.opts(performance.now())?.text).toBe(t('weekly.resultTarget', { crystals: WEEKLY_REWARD.crystals }));
  });
});

describe('locale', () => {
  it('weekly.resultMilestone exists in all four locales with the {n} and {crystals} placeholders', () => {
    for (const dict of [en, az, ru, tr] as Record<string, string>[]) {
      const s = dict['weekly.resultMilestone'];
      expect(s).toBeTypeOf('string');
      expect(s).toContain('{n}');
      expect(s).toContain('{crystals}');
    }
    expect(az['weekly.resultMilestone']).toBe('Həftə seriyası {n} · +{crystals} kristal');
    expect(ru['weekly.resultMilestone']).toBe('Серия недель {n} · +{crystals} кристаллов');
    expect(tr['weekly.resultMilestone']).toBe('Hafta serisi {n} · +{crystals} kristal');
  });
});
