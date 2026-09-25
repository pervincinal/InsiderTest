import { beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { EARN_RULES } from '../../src/economy/catalog';
import { recordResult } from '../../src/economy/wallet';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen, StartOptions } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { REWARD, WEEKLY_REWARD, challengeFor, goldReward, weeklyFor } from '../../src/daily/challenge';
import { challengeDone, recordChallengeResult } from '../../src/ui/daily';
import { recordWeeklyResult, weeklyDone } from '../../src/ui/weekly';
import { LEVEL_META } from '../../src/levels/index';
import { makeLevel } from '../helpers';

/*
 * Daily and Weekly Challenge on the same level on the same day (QA 2026-09-21). Monday 2026-11-09 is
 * a day whose daily (`challengeFor`) and weekly (`weeklyFor`) both pick level 36 — the two pickers are
 * independent hashes, so this happens a few times a year. The two are separate ledgers
 * (`save.challenge` / `save.weekly`) under the same key string: each pays its own reward exactly
 * once, neither writes campaign stars, first-clear gold, milestones, defeats or achievements, a
 * replay of either pays nothing whatever the order, and the campaign clear of that level afterwards
 * is still a first clear.
 */

const DAY = '2026-11-09';
const daily = challengeFor(DAY);
const weekly = weeklyFor(DAY);
const meta = LEVEL_META.find((m) => m.id === daily.levelId)!;
const level = makeLevel({ id: daily.levelId, star3: meta.star3, star2: meta.star2 });
const KEY = String(level.id);

function fakeApp(save: SaveData) {
  const starts: { levelId: number; seed?: number; opts?: StartOptions }[] = [];
  let current: Screen | null = null;
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
    go(screen) {
      current = screen;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => DAY,
    weekKey: () => DAY,
  };
  return { app, starts, current: () => current };
}

/** Every tower to the player: the win lands on the next tick (see continue.test.ts). */
function winNow(play: PlayScreen, clock: { now: number }): void {
  const state = play.state;
  for (const tower of Object.values(state.towers)) tower.owner = 'player';
  state.units = state.units.filter((u) => u.owner === 'player');
  state.links = state.links.filter((l) => l.owner === 'player');
  clock.now += 250;
  play.update(250, clock.now);
}

/** The campaign-side fields a challenge must never touch. */
function campaignSlice(save: SaveData) {
  const { stars, milestones, achievements, defeats, skips, replayGold, adCounters, upgrades, charges, purchases, daily: login } = save;
  return { stars, milestones, achievements, defeats, skips, replayGold, adCounters, upgrades, charges, purchases, login };
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.gold = 100;
  save.crystals = 3;
  for (let id = 1; id <= 32; id++) save.stars[String(id)] = 1; // both challenges unlocked; level 36 uncleared
});

describe('daily + weekly on the same level and day (2026-11-09 → level 36 twice)', () => {
  it('pins the coincidence: same level, different seeds and twists, weekly target = the level clock', () => {
    expect(daily.levelId).toBe(36);
    expect(weekly.levelId).toBe(36);
    expect(weekly.weekKey).toBe(DAY);
    expect(daily.seed).not.toBe(weekly.seed);
    expect([daily.twist.id, weekly.twist.id]).toEqual(['fastFeet', 'lean']);
    expect(weekly.targetMs).toBe(meta.star3);
  });

  it('each ledger pays once, neither touches the campaign, replays in any order pay nothing, losses change nothing', () => {
    const campaignBefore = JSON.stringify(campaignSlice(save));
    const d = recordChallengeResult(save, daily, level, 'won', 1_000);
    expect(d).toMatchObject({ firstWin: true, stars: 3, gold: goldReward(3), crystals: REWARD.crystals, streak: 1 });
    const w = recordWeeklyResult(save, weekly, level, 'won', 1_000);
    expect(w).toMatchObject({ firstWin: true, stars: 3, gold: WEEKLY_REWARD.gold, targetHit: true, crystals: WEEKLY_REWARD.crystals, streak: 1 });
    expect(save.gold).toBe(100 + goldReward(3) + WEEKLY_REWARD.gold);
    expect(save.crystals).toBe(3 + REWARD.crystals + WEEKLY_REWARD.crystals);
    expect(JSON.stringify(campaignSlice(save))).toBe(campaignBefore);
    expect(save.stars[KEY]).toBeUndefined();
    // the same key string in two separate ledgers
    expect(save.challenge).toEqual({ lastWinDay: DAY, streak: 1, best: { [DAY]: { stars: 3, timeMs: 1_000 } }, milestones: [] });
    expect(save.weekly).toEqual({ lastWinWeek: DAY, streak: 1, best: { [DAY]: { stars: 3, timeMs: 1_000, target: true } } });
    expect(challengeDone(save, DAY)).toBe(true);
    expect(weeklyDone(save, DAY)).toBe(true);

    // replays, weekly first then daily, then daily then weekly: nothing more is paid, bests improve
    const gold = save.gold;
    const crystals = save.crystals;
    for (const timeMs of [900, 800]) {
      expect(recordWeeklyResult(save, weekly, level, 'won', timeMs)).toMatchObject({ firstWin: false, gold: 0, targetHit: false, crystals: 0 });
      expect(recordChallengeResult(save, daily, level, 'won', timeMs)).toMatchObject({ firstWin: false, gold: 0, crystals: 0, milestone: 0 });
    }
    expect(recordChallengeResult(save, daily, level, 'won', 700)).toMatchObject({ firstWin: false, gold: 0, crystals: 0 });
    expect(recordWeeklyResult(save, weekly, level, 'won', 700)).toMatchObject({ firstWin: false, gold: 0, crystals: 0 });
    expect([save.gold, save.crystals]).toEqual([gold, crystals]);
    expect(save.challenge.best[DAY]).toEqual({ stars: 3, timeMs: 700 });
    expect(save.weekly.best[DAY]).toEqual({ stars: 3, timeMs: 700, target: true });
    expect(JSON.stringify(campaignSlice(save))).toBe(campaignBefore);

    // losses on either change nothing anywhere (no defeat counter either)
    const snapshot = JSON.stringify(save);
    expect(recordChallengeResult(save, daily, level, 'lost', 90_000).won).toBe(false);
    expect(recordWeeklyResult(save, weekly, level, 'lost', 90_000).won).toBe(false);
    expect(JSON.stringify(save)).toBe(snapshot);

    // the campaign clear of level 36 afterwards is still a first clear, and the challenge ledgers do not move
    const campaign = recordResult(save, level, 'won', 1_000, Date.UTC(2026, 10, 9, 12));
    expect(campaign.stars).toBe(3);
    expect(campaign.gold).toBe(3 * EARN_RULES.goldPerStarFirstClear);
    expect(save.stars[KEY]).toBe(3);
    expect(save.gold).toBe(gold + campaign.gold);
    expect(save.challenge.best[DAY]).toEqual({ stars: 3, timeMs: 700 });
    expect(save.weekly.best[DAY]).toEqual({ stars: 3, timeMs: 700, target: true });
  });

  it('through PlayScreen: a daily win then a weekly win on the same level book each ledger once and no campaign star', () => {
    const shell = fakeApp(save);
    const campaignBefore = JSON.stringify(campaignSlice(save));
    const clock = { now: 0 };

    const dailyPlay = new PlayScreen(shell.app, level, daily.seed, 20, { challenge: daily });
    shell.app.go(dailyPlay);
    expect(dailyPlay.state.modifiers).toEqual(daily.twist.modifiers);
    winNow(dailyPlay, clock);
    const dailyResult = shell.current() as ResultScreen;
    expect(dailyResult).toBeInstanceOf(ResultScreen);
    expect(dailyResult.info.challenge).toBe(daily);
    expect(dailyResult.info.weekly).toBeUndefined();
    expect(dailyResult.info.weeklyOutcome).toBeUndefined();
    expect(dailyResult.info.daily).toMatchObject({ firstWin: true, gold: goldReward(3), crystals: REWARD.crystals });
    expect(dailyResult.info.achievements.unlocked).toEqual([]);

    const weeklyPlay = new PlayScreen(shell.app, level, weekly.seed, 20, { weekly });
    shell.app.go(weeklyPlay);
    expect(weeklyPlay.state.modifiers).toEqual(weekly.twist.modifiers);
    winNow(weeklyPlay, clock);
    const weeklyResult = shell.current() as ResultScreen;
    expect(weeklyResult).toBeInstanceOf(ResultScreen);
    expect(weeklyResult.info.weekly).toBe(weekly);
    expect(weeklyResult.info.challenge).toBeUndefined();
    expect(weeklyResult.info.daily).toBeUndefined();
    expect(weeklyResult.info.weeklyOutcome).toMatchObject({ firstWin: true, gold: WEEKLY_REWARD.gold, targetHit: true, crystals: WEEKLY_REWARD.crystals });
    expect(weeklyResult.info.achievements.unlocked).toEqual([]);
    expect(weeklyResult.extras().daily).toBeUndefined();
    expect(weeklyResult.extras().weekly).toMatchObject({ firstWin: true, gold: WEEKLY_REWARD.gold });

    expect(save.gold).toBe(100 + goldReward(3) + WEEKLY_REWARD.gold);
    expect(save.crystals).toBe(3 + REWARD.crystals + WEEKLY_REWARD.crystals);
    expect(save.stars[KEY]).toBeUndefined();
    expect(JSON.stringify(campaignSlice(save))).toBe(campaignBefore);
    expect(save.challenge.lastWinDay).toBe(DAY);
    expect(save.weekly.lastWinWeek).toBe(DAY);

    // a second run of each pays nothing more
    const again = new PlayScreen(shell.app, level, weekly.seed, 20, { weekly });
    shell.app.go(again);
    winNow(again, clock);
    expect((shell.current() as ResultScreen).info.weeklyOutcome).toMatchObject({ firstWin: false, gold: 0, targetHit: false, crystals: 0 });
    const againDaily = new PlayScreen(shell.app, level, daily.seed, 20, { challenge: daily });
    shell.app.go(againDaily);
    winNow(againDaily, clock);
    expect((shell.current() as ResultScreen).info.daily).toMatchObject({ firstWin: false, gold: 0, crystals: 0 });
    expect(save.gold).toBe(100 + goldReward(3) + WEEKLY_REWARD.gold);
    expect(save.crystals).toBe(3 + REWARD.crystals + WEEKLY_REWARD.crystals);
    expect(save.stars[KEY]).toBeUndefined();
  });

  it('StartOptions with both a daily and a weekly (no caller does this) books the daily only — never two rewards for one match', () => {
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, level, daily.seed, 20, { challenge: daily, weekly });
    shell.app.go(play);
    expect(play.challenge).toBe(daily);
    expect(play.weekly).toBe(weekly);
    expect(play.state.modifiers).toEqual(daily.twist.modifiers);
    winNow(play, { now: 0 });
    const result = shell.current() as ResultScreen;
    expect(result.info.daily).toMatchObject({ firstWin: true, gold: goldReward(3) });
    expect(result.info.weeklyOutcome).toBeUndefined();
    expect(save.gold).toBe(100 + goldReward(3));
    expect(save.crystals).toBe(3 + REWARD.crystals);
    expect(save.weekly).toEqual({ lastWinWeek: null, streak: 0, best: {} });
    expect(save.stars[KEY]).toBeUndefined();
  });
});
