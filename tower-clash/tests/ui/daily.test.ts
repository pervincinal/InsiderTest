import { beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen, StartOptions } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import type { DailyChallenge } from '../../src/daily/challenge';
import { REWARD, STREAK_MILESTONES, TWISTS, UNLOCK_AFTER_LEVEL, goldReward } from '../../src/daily/challenge';
import { challengeDone, challengeUnlocked, msToUtcMidnight, previousDayKey, recordChallengeResult, shownStreak } from '../../src/ui/daily';
import { nextStreakMilestone } from '../../src/ui/levelSelect';
import { t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * Daily Challenge (GDD §7) over the save and the play screen: the reward is paid once per UTC day,
 * a loss pays nothing, the streak counts consecutive days, the twist's modifiers replace the
 * commander upgrades and the boosters are off. No DOM: the app shell is a recorder.
 */

const DAY = '2026-09-18';
const YESTERDAY = '2026-09-17';
const FAST_FEET = TWISTS.find((t) => t.id === 'fastFeet')!;
const LEAN = TWISTS.find((t) => t.id === 'lean')!;

function challenge(over: Partial<DailyChallenge> = {}): DailyChallenge {
  return { dayKey: DAY, levelId: 999, seed: 5, twist: FAST_FEET, ...over };
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
    dayKey: () => DAY,
    weekKey: () => '2026-09-14',
  };
  return { app, starts, nav, current: () => current };
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.gold = 100;
  save.crystals = 3;
  save.stars[String(UNLOCK_AFTER_LEVEL)] = 1;
});

describe('day arithmetic (UTC)', () => {
  it('previousDayKey crosses month and year boundaries', () => {
    expect(previousDayKey('2026-09-18')).toBe('2026-09-17');
    expect(previousDayKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDayKey('2028-03-01')).toBe('2028-02-29');
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31');
  });

  it('msToUtcMidnight counts to the next UTC midnight', () => {
    expect(msToUtcMidnight(Date.UTC(2026, 8, 18, 23, 59, 0))).toBe(60_000);
    expect(msToUtcMidnight(Date.UTC(2026, 8, 18, 0, 0, 0))).toBe(86_400_000);
    expect(msToUtcMidnight(Date.UTC(2026, 8, 18, 12, 0, 0))).toBe(43_200_000);
  });
});

describe('unlock gate', () => {
  it(`opens with one star on level ${UNLOCK_AFTER_LEVEL}`, () => {
    const fresh = defaultSave();
    expect(challengeUnlocked(fresh)).toBe(false);
    fresh.stars[String(UNLOCK_AFTER_LEVEL)] = 0;
    expect(challengeUnlocked(fresh)).toBe(false);
    fresh.stars[String(UNLOCK_AFTER_LEVEL)] = 1;
    expect(challengeUnlocked(fresh)).toBe(true);
  });
});

describe('recordChallengeResult (reward once per day, streak, best)', () => {
  const level: LevelDef = makeLevel({ star3: 30_000, star2: 60_000 });

  it('pays goldReward(stars) + crystals on the first win only and never touches level stars', () => {
    const first = recordChallengeResult(save, challenge(), level, 'won', 20_000);
    expect(first).toMatchObject({ won: true, stars: 3, firstWin: true, gold: goldReward(3), crystals: REWARD.crystals, streak: 1, best: { stars: 3, timeMs: 20_000 } });
    expect(save.gold).toBe(100 + 60);
    expect(save.crystals).toBe(3 + 5);
    expect(save.challenge).toEqual({ lastWinDay: DAY, streak: 1, best: { [DAY]: { stars: 3, timeMs: 20_000 } }, milestones: [] });
    expect(save.stars['999']).toBeUndefined();
    expect(save.milestones).toEqual([]);
    expect(challengeDone(save, DAY)).toBe(true);

    const again = recordChallengeResult(save, challenge(), level, 'won', 50_000);
    expect(again).toMatchObject({ won: true, stars: 2, firstWin: false, gold: 0, crystals: 0, streak: 1, best: { stars: 3, timeMs: 20_000 } });
    expect(save.gold).toBe(160);
    expect(save.crystals).toBe(8);
  });

  it('best keeps more stars, then the faster time', () => {
    recordChallengeResult(save, challenge(), level, 'won', 50_000); // 2★
    recordChallengeResult(save, challenge(), level, 'won', 40_000); // 2★ faster
    expect(save.challenge.best[DAY]).toEqual({ stars: 2, timeMs: 40_000 });
    recordChallengeResult(save, challenge(), level, 'won', 70_000); // 1★ — worse
    expect(save.challenge.best[DAY]).toEqual({ stars: 2, timeMs: 40_000 });
    recordChallengeResult(save, challenge(), level, 'won', 29_000); // 3★
    expect(save.challenge.best[DAY]).toEqual({ stars: 3, timeMs: 29_000 });
  });

  it('a loss pays nothing and changes nothing', () => {
    const before = JSON.stringify(save);
    const lost = recordChallengeResult(save, challenge(), level, 'lost', 90_000);
    expect(lost).toMatchObject({ won: false, stars: 0, firstWin: false, gold: 0, crystals: 0, streak: 0, best: null });
    expect(JSON.stringify(save)).toBe(before);
    expect(save.defeats).toEqual({});
  });

  it('streak: +1 after a win yesterday, back to 1 after a gap, capped at 99 when shown', () => {
    save.challenge = { lastWinDay: YESTERDAY, streak: 4, best: {}, milestones: [] };
    expect(shownStreak(save, DAY)).toBe(4);
    expect(recordChallengeResult(save, challenge(), level, 'won', 20_000).streak).toBe(5);
    expect(save.challenge.streak).toBe(5);

    save.challenge = { lastWinDay: '2026-09-10', streak: 4, best: {}, milestones: [] };
    expect(shownStreak(save, DAY)).toBe(0); // broken
    expect(recordChallengeResult(save, challenge(), level, 'won', 20_000).streak).toBe(1);
    expect(save.challenge.streak).toBe(1);

    save.challenge = { lastWinDay: YESTERDAY, streak: 150, best: {}, milestones: [] };
    expect(shownStreak(save, DAY)).toBe(99);
    expect(recordChallengeResult(save, challenge(), level, 'won', 20_000).streak).toBe(99);
    expect(save.challenge.streak).toBe(151); // the save keeps the real count
  });

  it('best is pruned to the newest 30 day keys', () => {
    for (let d = 1; d <= 31; d++) save.challenge.best[`2026-08-${String(d).padStart(2, '0')}`] = { stars: 1, timeMs: 1000 };
    recordChallengeResult(save, challenge(), level, 'won', 20_000);
    const keys = Object.keys(save.challenge.best).sort();
    expect(keys.length).toBe(30);
    expect(keys[0]).toBe('2026-08-03');
    expect(keys[keys.length - 1]).toBe(DAY);
  });
});

describe('streak milestones (ECONOMY.md §6.2: day 3 / 7 / 30 → +5 / +20 / +100 crystals, once per streak run)', () => {
  const level: LevelDef = makeLevel({ star3: 30_000, star2: 60_000 });
  /** A live streak of `streak` days (won yesterday) with `milestones` already paid in this run. */
  const at = (streak: number, milestones: number[] = []) => {
    save.challenge = { lastWinDay: YESTERDAY, streak, best: {}, milestones };
  };
  const win = (dayKey = DAY) => recordChallengeResult(save, challenge({ dayKey }), level, 'won', 20_000);

  it('table matches the economy doc', () => {
    expect(STREAK_MILESTONES).toEqual([
      [3, 5],
      [7, 20],
      [30, 100],
    ]);
  });

  it('2 → 3 pays +5 on top of the reward, once (a replay the same day pays nothing)', () => {
    at(2);
    expect(win()).toMatchObject({ firstWin: true, streak: 3, milestone: 5, crystals: REWARD.crystals + 5, gold: goldReward(3) });
    expect(save.crystals).toBe(3 + REWARD.crystals + 5);
    expect(save.challenge.milestones).toEqual([3]);
    expect(win()).toMatchObject({ firstWin: false, milestone: 0, crystals: 0 });
    expect(save.crystals).toBe(3 + REWARD.crystals + 5);
  });

  it('3 → 4 pays 0; 6 → 7 pays +20; 29 → 30 pays +100', () => {
    at(3, [3]);
    expect(win()).toMatchObject({ streak: 4, milestone: 0, crystals: REWARD.crystals });
    expect(save.crystals).toBe(3 + REWARD.crystals);
    expect(save.challenge.milestones).toEqual([3]);
    at(6, [3]);
    expect(win()).toMatchObject({ streak: 7, milestone: 20, crystals: REWARD.crystals + 20 });
    expect(save.crystals).toBe(3 + 2 * REWARD.crystals + 20);
    expect(save.challenge.milestones).toEqual([3, 7]);
    at(29, [3, 7]);
    expect(win()).toMatchObject({ streak: 30, milestone: 100, crystals: REWARD.crystals + 100 });
    expect(save.crystals).toBe(3 + 3 * REWARD.crystals + 120);
    expect(save.challenge.milestones).toEqual([3, 7, 30]);
  });

  it('a broken streak forgets the paid milestones: back to 1, and day 3 pays +5 again', () => {
    save.challenge = { lastWinDay: '2026-09-10', streak: 5, best: {}, milestones: [3] };
    expect(win()).toMatchObject({ streak: 1, milestone: 0, crystals: REWARD.crystals });
    expect(save.challenge.milestones).toEqual([]);
    expect(win('2026-09-19')).toMatchObject({ streak: 2, milestone: 0 });
    expect(win('2026-09-20')).toMatchObject({ streak: 3, milestone: 5, crystals: REWARD.crystals + 5 });
    expect(save.challenge.milestones).toEqual([3]);
    expect(save.crystals).toBe(3 + 3 * REWARD.crystals + 5);
  });

  it('nothing retroactive: a pre-milestone save at streak 4 is paid at day 7, not for day 3', () => {
    at(4);
    expect(win()).toMatchObject({ streak: 5, milestone: 0 });
    expect(save.challenge.milestones).toEqual([]);
  });

  it('a loss at streak 2 pays nothing and keeps the run', () => {
    at(2);
    const before = JSON.stringify(save);
    expect(recordChallengeResult(save, challenge(), level, 'lost', 90_000)).toMatchObject({ won: false, milestone: 0, crystals: 0, streak: 2 });
    expect(JSON.stringify(save)).toBe(before);
  });

  it('nextStreakMilestone names the first milestone above the shown streak', () => {
    expect(nextStreakMilestone(save, DAY)).toEqual([3, 5]);
    at(2);
    expect(nextStreakMilestone(save, DAY)).toEqual([3, 5]);
    at(3, [3]);
    expect(nextStreakMilestone(save, DAY)).toEqual([7, 20]);
    at(30, [3, 7, 30]);
    expect(nextStreakMilestone(save, DAY)).toBeNull();
    save.challenge = { lastWinDay: '2026-09-10', streak: 7, best: {}, milestones: [3, 7] }; // broken
    expect(nextStreakMilestone(save, DAY)).toEqual([3, 5]);
  });
});

describe('PlayScreen in challenge mode', () => {
  /** A level the player wins on the first tick once every tower is theirs (see continue.test.ts). */
  function winNow(play: PlayScreen, clock: { now: number }): void {
    const state = play.state;
    for (const t of Object.values(state.towers)) t.owner = 'player';
    state.units = state.units.filter((u) => u.owner === 'player');
    state.queues = state.queues.filter((q) => q.owner === 'player');
    state.links = state.links.filter((l) => l.owner === 'player');
    clock.now += 250;
    play.update(250, clock.now);
  }

  it("applies the twist's modifiers instead of the commander upgrades and uses the fixed seed", () => {
    save.upgrades = { production: 5, capacity: 5, garrison: 5, march_speed: 5 };
    const shell = fakeApp(save);
    const level = makeLevel();
    const ch = challenge({ twist: LEAN, seed: 4242 });
    const play = new PlayScreen(shell.app, level, ch.seed, 20, { challenge: ch });
    expect(play.state.modifiers).toEqual(LEAN.modifiers);
    expect(play.state.modifiers.productionMul).toBeLessThan(1);
    expect(play.state.seed).toBe(4242);
    // a normal start with the same save takes the upgrades
    const normal = new PlayScreen(shell.app, level, 1, 20);
    expect(normal.state.modifiers.productionMul).toBeGreaterThan(1);
    expect(normal.state.modifiers.startGarrisonBonus).toBeGreaterThan(0);
  });

  it('boosters are off: nothing is bought, no booster reaches the sim', () => {
    save.charges.overdrive = 2;
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel(), 5, 20, { challenge: challenge() });
    shell.app.go(play);
    expect(play.useBooster('overdrive')).toBe(false);
    expect(play.useBooster('freeze')).toBe(false);
    expect(play.useBooster('airstrike')).toBe(false);
    expect(play.targeting).toBe(false);
    play.update(250, 250);
    expect(play.state.boosters).toEqual([]);
    expect(save.gold).toBe(100);
    expect(save.charges.overdrive).toBe(2);
  });

  it('a win goes through the daily path: reward once, no level stars, NEXT returns to the map, RETRY keeps the seed', async () => {
    const shell = fakeApp(save);
    const level = makeLevel({ star3: 30_000, star2: 60_000 });
    const ch = challenge();
    const play = new PlayScreen(shell.app, level, ch.seed, 20, { challenge: ch });
    shell.app.go(play);
    const clock = { now: 0 };
    winNow(play, clock);
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    const info = (result as ResultScreen).info;
    expect(info.ui.outcome).toBe('won');
    expect(info.challenge).toBe(ch);
    expect(info.daily).toMatchObject({ firstWin: true, gold: goldReward(3), crystals: REWARD.crystals, streak: 1 });
    expect(info.ui.coinsEarned).toBe(goldReward(3));
    expect(info.ui.hasNext).toBe(true);
    expect(info.achievements.unlocked).toEqual([]);
    expect(save.gold).toBe(100 + goldReward(3));
    expect(save.crystals).toBe(8);
    expect(save.stars['999']).toBeUndefined();
    expect(save.challenge.lastWinDay).toBe(DAY);
    // no economy offers on a challenge result
    const ex = (result as ResultScreen).extras();
    expect(ex.continueCrystals).toBeNull();
    expect(ex.continueAd).toBe(false);
    expect(ex.skipCrystals).toBeNull();
    expect(ex.daily).toMatchObject({ won: true, firstWin: true });

    // NEXT (Enter) → the level map, never the next level
    (result as ResultScreen).key({ key: 'Enter' } as KeyboardEvent);
    await new Promise((r) => setTimeout(r, 0));
    expect(shell.nav).toEqual(['levels']);
    expect(shell.starts).toEqual([]);

    // a second run the same day pays nothing and reports the best
    const replay = new PlayScreen(shell.app, level, ch.seed, 20, { challenge: ch });
    shell.app.go(replay);
    winNow(replay, clock);
    const again = (shell.current() as ResultScreen).info;
    expect(again.daily).toMatchObject({ firstWin: false, gold: 0, crystals: 0, best: { stars: 3 } });
    expect(again.ui.coinsEarned).toBe(0);
    expect(save.gold).toBe(100 + goldReward(3));

    // RETRY keeps the seed and the challenge
    replay.restart();
    expect(shell.starts).toEqual([{ levelId: 999, seed: ch.seed, opts: { challenge: ch } }]);
  });

  it('a lost challenge pays nothing and offers no continue', () => {
    const shell = fakeApp(save);
    // two player towers against a strong enemy: the debug "suicide" mode loses it (continue.test.ts)
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 40, level: 1 },
        { id: 'q', x: 160, y: 900, owner: 'player', units: 24, level: 1 },
        { id: 'e', x: 360, y: 160, owner: 'enemy1', units: 100, level: 1 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'q', b: 'p' },
        { a: 'q', b: 'e' },
      ],
    });
    const play = new PlayScreen(shell.app, level, 7, 20, { challenge: challenge() });
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
    expect(info.daily).toMatchObject({ won: false, firstWin: false, gold: 0, crystals: 0 });
    expect(save.gold).toBe(100);
    expect(save.crystals).toBe(3);
    expect(save.challenge.lastWinDay).toBeNull();
    expect(save.defeats).toEqual({});
    expect((result as ResultScreen).extras().continueCrystals).toBeNull();
  });
});

describe('UTC day rollover during a match (GDD §7.5 item 4)', () => {
  it('a challenge started on D and won on D + 1 books against D; the map then shows D + 1 with the streak alive', async () => {
    const { LevelSelectScreen } = await import('../../src/ui/levelSelect');
    const { challengeFor } = await import('../../src/daily/challenge');
    let today = DAY;
    const { app } = fakeApp(save);
    app.dayKey = () => today;
    const ch = challengeFor(DAY);
    const level = makeLevel({ id: ch.levelId });
    const play = new PlayScreen(app, level, ch.seed, 1, { challenge: ch });
    expect(play.challenge?.dayKey).toBe(DAY);
    today = '2026-09-19'; // midnight passes while the match runs
    const out = recordChallengeResult(save, play.challenge!, level, 'won', 20_000);
    expect(out.dayKey).toBe(DAY);
    expect(out.firstWin).toBe(true);
    expect(save.challenge.lastWinDay).toBe(DAY);
    expect(save.challenge.streak).toBe(1);
    expect(save.gold).toBe(100 + goldReward(3));
    // the level map re-reads the day key every frame: D + 1 is a fresh, undone challenge and the streak (won "yesterday") is alive
    expect(challengeDone(save, today)).toBe(false);
    expect(shownStreak(save, today)).toBe(1);
    const map = new LevelSelectScreen(app);
    const card = (map as unknown as { todaysChallenge(): DailyChallenge }).todaysChallenge();
    expect(card.dayKey).toBe('2026-09-19');
    expect(card).toEqual(challengeFor('2026-09-19'));
    // and a second rollover swaps the card again without a new screen
    today = '2026-09-20';
    expect((map as unknown as { todaysChallenge(): DailyChallenge }).todaysChallenge().dayKey).toBe('2026-09-20');
    expect(shownStreak(save, today)).toBe(0);
  });

  it('pause-menu restart after the rollover does not replay the stale day: the level map opens with the "new challenge" notice (BUG-9)', () => {
    let today = DAY;
    const { app, starts, nav } = fakeApp(save);
    app.dayKey = () => today;
    const ch: DailyChallenge = { dayKey: DAY, levelId: 9, seed: 5, twist: LEAN };
    const play = new PlayScreen(app, makeLevel({ id: 9 }), ch.seed, 1, { challenge: ch });
    play.restart(); // same day: a plain restart with the seed and the challenge
    expect(starts).toEqual([{ levelId: 9, seed: 5, opts: { challenge: ch } }]);
    today = '2026-09-19';
    play.restart();
    expect(starts.length).toBe(1);
    expect(nav).toEqual([`levels:${t('daily.newReady')}`]);
    expect(t('daily.newReady')).toBe('New daily challenge is ready');
  });

  it('result-screen RETRY after the rollover goes to the map too; a campaign level is unaffected', () => {
    let today = DAY;
    const { app, starts, nav, current } = fakeApp(save);
    app.dayKey = () => today;
    const ch: DailyChallenge = { dayKey: DAY, levelId: 9, seed: 5, twist: LEAN };
    const level = makeLevel({ id: 9, star3: 30_000, star2: 60_000 });
    const play = new PlayScreen(app, level, ch.seed, 1, { challenge: ch });
    app.go(play);
    for (const tower of Object.values(play.state.towers)) tower.owner = 'player';
    play.state.units = [];
    play.state.queues = [];
    play.state.links = [];
    play.update(250, 250);
    const result = current() as ResultScreen;
    expect(result).toBeInstanceOf(ResultScreen);
    expect(save.challenge.lastWinDay).toBe(DAY);
    today = '2026-09-19';
    (result as unknown as { retry(): void }).retry();
    expect(starts).toEqual([]);
    expect(nav).toEqual([`levels:${t('daily.newReady')}`]);
    // a campaign level keeps restarting whatever the day
    const campaign = new PlayScreen(app, makeLevel({ id: 3 }), 1, 1);
    campaign.restart();
    expect(starts).toEqual([{ levelId: 3, seed: undefined, opts: undefined }]); // a campaign restart rolls a fresh seed
  });
});
