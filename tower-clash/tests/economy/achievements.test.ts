import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { CHALLENGE_BEST_KEEP, SAVE_KEY, defaultSave, loadSaveFrom, normalizeSave, pruneChallengeBest, resetProgress, setSaveStorageForTests } from '../../src/ui/save';
import type { MatchSummary } from '../../src/economy/achievements';
import {
  CHALLENGE_STREAK_TARGET,
  CHALLENGE_WINS_TARGET,
  GRAND_CAMPAIGN_LEVEL,
  L3_LEVEL,
  SPEEDRUN_MS,
  WEEKLY_STREAK_TARGET,
  achievementCrystalsEarned,
  achievementProgress,
  achievementToast,
  emptyMatch,
  evaluateAchievements,
  threeStarLevels,
} from '../../src/economy/achievements';
import { ACHIEVEMENTS } from '../../src/economy/catalog';
import { LEVEL_META } from '../../src/levels/index';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

let store: ReturnType<typeof memStore>;
let save: SaveData;

beforeEach(() => {
  store = memStore();
  setSaveStorageForTests(store);
  save = defaultSave();
});

const crystalsOf = (id: string): number => ACHIEVEMENTS.find((a) => a.id === id)!.crystals;
const win = (over: Partial<MatchSummary> = {}): MatchSummary => ({ ...emptyMatch(), outcome: 'won', timeMs: 60_000, ...over });
const ids = (r: { unlocked: { id: string }[] }) => r.unlocked.map((a) => a.id);

describe('unlock rules', () => {
  it('a plain win (60 s, one tower lost) unlocks only First victory and pays its crystals', () => {
    const r = evaluateAchievements(save, win({ lostTower: true }));
    expect(ids(r)).toEqual(['first_win']);
    expect(r.crystals).toBe(crystalsOf('first_win'));
    expect(save.crystals).toBe(5);
    expect(save.achievements.unlocked).toEqual(['first_win']);
  });

  it('a defeat never pays the win-based goals but still counts the match facts', () => {
    const r = evaluateAchievements(save, { ...emptyMatch(), outcome: 'lost', timeMs: 10_000, upgradedToL3: true, capturedFortress: true, capturedTankFactory: true, tripleStream: true });
    expect(ids(r)).toEqual(['first_l3', 'first_fortress', 'first_triple_stream', 'first_tank']);
    expect(r.crystals).toBe(20);
    expect(save.crystals).toBe(20);
  });

  it('flawless needs a win with no tower lost; speedrunner a win strictly under 30 s', () => {
    expect(ids(evaluateAchievements(save, win({ lostTower: true, timeMs: SPEEDRUN_MS })))).toEqual(['first_win']);
    expect(ids(evaluateAchievements(save, win({ lostTower: false, timeMs: SPEEDRUN_MS })))).toEqual(['flawless']);
    expect(ids(evaluateAchievements(save, win({ lostTower: true, timeMs: SPEEDRUN_MS - 50 })))).toEqual(['speedrunner']);
    expect(save.crystals).toBe(5 + 10 + 10);
    expect(L3_LEVEL).toBe(3);
  });

  it('star goals come from the save: 10 / 20 / every level at 3★, with or without a match', () => {
    for (let id = 1; id <= 9; id++) save.stars[String(id)] = 3;
    save.stars['10'] = 2;
    expect(threeStarLevels(save)).toBe(9);
    expect(ids(evaluateAchievements(save))).toEqual([]);
    save.stars['10'] = 3;
    expect(ids(evaluateAchievements(save))).toEqual(['stars_10']);
    for (const level of LEVEL_META.slice(10, -1)) save.stars[String(level.id)] = 3;
    expect(ids(evaluateAchievements(save))).toEqual(['stars_20']); // one short of the campaign
    save.stars[String(LEVEL_META.at(-1)!.id)] = 3;
    const r = evaluateAchievements(save, win());
    expect(ids(r)).toEqual(['first_win', 'stars_40', 'flawless']);
    expect(save.crystals).toBe(10 + 5 + 10 + 20 + 10);
  });

  it('grand_campaign fires on a won match on level 50 only — not on level 49, a defeat on 50, or a skip of 50', () => {
    expect(GRAND_CAMPAIGN_LEVEL).toBe(50);
    expect(ids(evaluateAchievements(save, win({ levelId: 49, lostTower: true })))).toEqual(['first_win']);
    expect(ids(evaluateAchievements(save, { ...emptyMatch(), levelId: 50, outcome: 'lost' }))).toEqual([]);
    save.stars['50'] = 1; // a level skip grants 1★ without a match
    expect(ids(evaluateAchievements(save))).toEqual([]);
    const r = evaluateAchievements(save, win({ levelId: 50, lostTower: true }));
    expect(ids(r)).toEqual(['grand_campaign']);
    expect(r.crystals).toBe(10);
    expect(save.crystals).toBe(5 + 10);
    expect(evaluateAchievements(save, win({ levelId: 50, lostTower: true }))).toEqual({ unlocked: [], crystals: 0 });
  });

  it('nothing unlocks without a match on a fresh save', () => {
    expect(evaluateAchievements(save)).toEqual({ unlocked: [], crystals: 0 });
    expect(store.dump()[SAVE_KEY]).toBeUndefined(); // nothing to persist
  });
});

describe('once-only grants', () => {
  it('re-evaluating the same facts grants nothing and leaves the balance alone', () => {
    evaluateAchievements(save, win({ timeMs: 1000 }));
    expect(save.achievements.unlocked).toEqual(['first_win', 'flawless', 'speedrunner']);
    const before = save.crystals;
    expect(evaluateAchievements(save, win({ timeMs: 1000 }))).toEqual({ unlocked: [], crystals: 0 });
    expect(evaluateAchievements(save, win({ timeMs: 1000 }))).toEqual({ unlocked: [], crystals: 0 });
    expect(save.crystals).toBe(before);
    expect(save.achievements.unlocked).toHaveLength(3);
    expect(achievementCrystalsEarned(save)).toBe(25);
  });

  it('an unlocked id survives a save round-trip (no schema bump) and cannot be earned again after reload', () => {
    evaluateAchievements(save, win({ lostTower: true }));
    const reloaded = loadSaveFrom(store);
    expect(reloaded.version).toBe(3);
    expect(reloaded.achievements.unlocked).toEqual(['first_win']);
    expect(reloaded.crystals).toBe(5);
    expect(evaluateAchievements(reloaded, win({ lostTower: true }))).toEqual({ unlocked: [], crystals: 0 });
  });

  it('every catalog achievement can be granted exactly once in total (145 crystals)', () => {
    for (const level of LEVEL_META) save.stars[String(level.id)] = 3;
    save.challenge.streak = 7;
    save.challenge.best = winDays(30);
    save.weekly.streak = 4;
    const everything = win({ levelId: GRAND_CAMPAIGN_LEVEL, timeMs: 1000, upgradedToL3: true, capturedFortress: true, capturedTankFactory: true, tripleStream: true });
    const all = evaluateAchievements(save, everything);
    expect(ids(all)).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(all.crystals).toBe(145);
    expect(evaluateAchievements(save, everything).crystals).toBe(0);
    expect(save.crystals).toBe(145);
  });
});

/** `n` distinct won day keys in `challenge.best` shape (2026-01-01 onwards). */
function winDays(n: number): SaveData['challenge']['best'] {
  const out: SaveData['challenge']['best'] = {};
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    out[d.toISOString().slice(0, 10)] = { stars: 3, timeMs: 30_000 };
  }
  return out;
}

describe('challenge achievements (ECONOMY.md §6.3, ECON-10): save counters, no match', () => {
  it('pins the targets and the catalog rows (10 / 20 / 20, after grand_campaign, in that order)', () => {
    expect([CHALLENGE_STREAK_TARGET, CHALLENGE_WINS_TARGET, WEEKLY_STREAK_TARGET]).toEqual([7, 30, 4]);
    expect(ACHIEVEMENTS.slice(-4).map((a) => a.id)).toEqual(['grand_campaign', 'challenge_streak_7', 'challenge_wins_30', 'weekly_streak_4']);
    expect(crystalsOf('challenge_streak_7')).toBe(10);
    expect(crystalsOf('challenge_wins_30')).toBe(20);
    expect(crystalsOf('weekly_streak_4')).toBe(20);
  });

  it('CHALLENGE_BEST_KEEP is at least 30, so pruning best can never hide the 30th win day', () => {
    expect(CHALLENGE_BEST_KEEP).toBeGreaterThanOrEqual(CHALLENGE_WINS_TARGET);
    expect(Object.keys(pruneChallengeBest(winDays(45))).length).toBeGreaterThanOrEqual(30);
  });

  it('challenge_streak_7: streak 6 grants nothing, 7 grants 10 crystals once; a reset to 1 and a later 14 never pay again', () => {
    save.challenge.streak = 6;
    expect(ids(evaluateAchievements(save))).toEqual([]);
    expect(achievementProgress(save).find((a) => a.id === 'challenge_streak_7')).toMatchObject({ current: 6, target: 7, unlocked: false });
    save.challenge.streak = 7;
    const r = evaluateAchievements(save);
    expect(ids(r)).toEqual(['challenge_streak_7']);
    expect(r.crystals).toBe(10);
    expect(save.crystals).toBe(10);
    save.challenge.streak = 1; // broken streak, next first win
    expect(evaluateAchievements(save)).toEqual({ unlocked: [], crystals: 0 });
    expect(achievementProgress(save).find((a) => a.id === 'challenge_streak_7')).toMatchObject({ current: 7, target: 7, unlocked: true }); // stays earned
    save.challenge.streak = 14;
    expect(evaluateAchievements(save)).toEqual({ unlocked: [], crystals: 0 });
    expect(save.crystals).toBe(10);
    expect(save.achievements.unlocked).toEqual(['challenge_streak_7']);
  });

  it('challenge_wins_30: 29 distinct win days show 29/30 and pay nothing; the 30th pays 20 once; more keys keep 30/30', () => {
    save.challenge.best = winDays(29);
    expect(ids(evaluateAchievements(save))).toEqual([]);
    expect(achievementProgress(save).find((a) => a.id === 'challenge_wins_30')).toMatchObject({ current: 29, target: 30, unlocked: false });
    save.challenge.best = winDays(30);
    const r = evaluateAchievements(save);
    expect(ids(r)).toEqual(['challenge_wins_30']);
    expect(r.crystals).toBe(20);
    save.challenge.best = pruneChallengeBest(winDays(40));
    expect(Object.keys(save.challenge.best)).toHaveLength(CHALLENGE_BEST_KEEP);
    expect(evaluateAchievements(save)).toEqual({ unlocked: [], crystals: 0 });
    expect(achievementProgress(save).find((a) => a.id === 'challenge_wins_30')).toMatchObject({ current: 30, target: 30, unlocked: true });
    expect(save.crystals).toBe(20);
  });

  it('weekly_streak_4: 3 weeks show 3/4, the 4th pays 20 once', () => {
    save.weekly.streak = 3;
    expect(ids(evaluateAchievements(save))).toEqual([]);
    expect(achievementProgress(save).find((a) => a.id === 'weekly_streak_4')).toMatchObject({ current: 3, target: 4, unlocked: false });
    save.weekly.streak = 4;
    expect(ids(evaluateAchievements(save))).toEqual(['weekly_streak_4']);
    expect(save.crystals).toBe(20);
    save.weekly.streak = 5;
    expect(evaluateAchievements(save)).toEqual({ unlocked: [], crystals: 0 });
    expect(save.crystals).toBe(20);
  });

  it('a match never satisfies a challenge achievement, and the counters ignore the match facts', () => {
    const everything = win({ levelId: GRAND_CAMPAIGN_LEVEL, timeMs: 1000, upgradedToL3: true, capturedFortress: true, capturedTankFactory: true, tripleStream: true });
    const r = evaluateAchievements(save, everything);
    expect(ids(r)).not.toContain('challenge_streak_7');
    expect(ids(r)).not.toContain('challenge_wins_30');
    expect(ids(r)).not.toContain('weekly_streak_4');
    save.challenge.streak = 7;
    expect(ids(evaluateAchievements(save, { ...emptyMatch(), outcome: 'lost' }))).toEqual(['challenge_streak_7']); // a lost daily still runs the counter rules
  });

  it('progress bars: 3/7 for the streak and 12/30 for the wins on a mid-way save, persisted grant survives a reload', () => {
    save.challenge.streak = 3;
    save.challenge.best = winDays(12);
    const p = achievementProgress(save);
    expect(p.find((a) => a.id === 'challenge_streak_7')).toMatchObject({ current: 3, target: 7, unlocked: false, crystals: 10 });
    expect(p.find((a) => a.id === 'challenge_wins_30')).toMatchObject({ current: 12, target: 30, unlocked: false, crystals: 20 });
    expect(p.find((a) => a.id === 'weekly_streak_4')).toMatchObject({ current: 0, target: 4, unlocked: false, crystals: 20 });
    save.weekly.streak = 4;
    evaluateAchievements(save);
    const reloaded = loadSaveFrom(store);
    expect(reloaded.achievements.unlocked).toEqual(['weekly_streak_4']);
    expect(reloaded.crystals).toBe(20);
    expect(evaluateAchievements(reloaded)).toEqual({ unlocked: [], crystals: 0 });
  });
});

describe('progress and presentation', () => {
  it('lists every achievement in catalog order with progress bars: binary goals 0/1, star goals n/target', () => {
    for (let id = 1; id <= 7; id++) save.stars[String(id)] = 3;
    evaluateAchievements(save, win({ lostTower: true }));
    const p = achievementProgress(save);
    expect(p.map((a) => a.id)).toEqual(ACHIEVEMENTS.map((a) => a.id));
    expect(p.find((a) => a.id === 'first_win')).toMatchObject({ current: 1, target: 1, unlocked: true, crystals: 5 });
    expect(p.find((a) => a.id === 'flawless')).toMatchObject({ current: 0, target: 1, unlocked: false });
    expect(p.find((a) => a.id === 'stars_10')).toMatchObject({ current: 7, target: 10, unlocked: false });
    expect(p.find((a) => a.id === 'stars_40')).toMatchObject({ current: 7, target: LEVEL_META.length, unlocked: false });
    for (let id = 8; id <= 25; id++) save.stars[String(id)] = 3;
    evaluateAchievements(save);
    const q = achievementProgress(save);
    expect(q.find((a) => a.id === 'stars_10')).toMatchObject({ current: 10, target: 10, unlocked: true }); // capped at the target once unlocked
    expect(q.find((a) => a.id === 'stars_20')).toMatchObject({ current: 20, target: 20, unlocked: true });
    expect(q.find((a) => a.id === 'stars_40')).toMatchObject({ current: 25, target: LEVEL_META.length, unlocked: false });
    expect(LEVEL_META.length, 'the campaign is longer than the 20★ goal, so stars_40 is the long-tail goal').toBeGreaterThan(25);
  });

  it('the toast names one or two achievements and counts more', () => {
    expect(achievementToast({ unlocked: [], crystals: 0 })).toBeNull();
    expect(achievementToast(evaluateAchievements(save, win({ lostTower: true })))).toBe('Achievement unlocked: First victory · +5 crystals');
    const many = evaluateAchievements(save, win({ timeMs: 1000, upgradedToL3: true }));
    expect(achievementToast(many)).toBe('Achievement unlocked: 3 achievements · +25 crystals');
  });

  it('normalizeSave defaults and dedupes the ledger; resetProgress wipes it', () => {
    expect(normalizeSave({ version: 3 }).achievements).toEqual({ unlocked: [] });
    expect(normalizeSave({ version: 3, achievements: { unlocked: ['first_win', 'first_win', 7] } }).achievements).toEqual({ unlocked: ['first_win'] });
    expect(normalizeSave({ version: 3, achievements: 'nope' }).achievements).toEqual({ unlocked: [] });
    evaluateAchievements(save, win());
    resetProgress(save);
    expect(save.achievements.unlocked).toEqual([]);
    expect(save.crystals).toBe(0);
  });
});
