import { describe, expect, it } from 'vitest';
import { POOL_FROM, POOL_TO, TWISTS, WEEKLY_POOL_FROM, challengeFor, weeklyFor } from '../../src/daily/challenge';
import { loadLevel } from '../../src/levels/index';
import { DEFAULT_MODIFIERS, createState } from '../../src/sim/index';
import { starsFor } from '../../src/ai/headless';
import {
  DAILY_WIN_RATE,
  DEFAULT_POOL,
  TWIST_WIN_RATE,
  WEEKLY_WIN_RATE,
  addDays,
  addWeeks,
  dailyPlan,
  dailySeeds,
  inPool,
  parsePool,
  runDaily,
  runTwist,
  runWeekly,
  twistById,
  weeklyPlan,
  weeklySeeds,
} from '../../scripts/lib/daily';

/*
 * The daily playtest must run exactly the match the client builds for a day: `challengeFor`'s level
 * and fixed seed, the twist's modifiers on `state.modifiers`, nothing else (no Commander upgrades).
 */

/** First day from `from` whose twist is not `plain`, so the modifiers are visibly non-default. */
function twistedDay(from: string): string {
  for (let i = 0; i < 30; i++) {
    const key = addDays(from, i);
    if (challengeFor(key).twist.id !== 'plain') return key;
  }
  throw new Error('no twisted day in 30 days');
}

describe('daily playtest runner', () => {
  it('addDays walks calendar days in UTC, across month and year ends', () => {
    expect(addDays('2026-09-18', 0)).toBe('2026-09-18');
    expect(addDays('2026-09-18', 1)).toBe('2026-09-19');
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // leap year
    expect(addDays('2026-01-01', 59)).toBe('2026-03-01');
    expect(() => addDays('2026/09/18', 1)).toThrow();
  });

  it('dailyPlan picks the same level, seed and twist as challengeFor for each consecutive day', () => {
    const plan = dailyPlan('2026-09-18', 60);
    expect(plan).toHaveLength(60);
    for (let i = 0; i < plan.length; i++) {
      const expected = challengeFor(addDays('2026-09-18', i));
      expect(plan[i]).toEqual(expected);
      expect(plan[i]!.levelId).toBe(expected.levelId);
      expect(plan[i]!.seed).toBe(expected.seed);
      expect(plan[i]!.twist).toBe(expected.twist);
    }
    expect(plan[0]!.dayKey).toBe('2026-09-18');
    expect(plan[59]!.dayKey).toBe('2026-11-16');
    expect(() => dailyPlan('2026-09-18', 0)).toThrow();
  });

  it('dailySeeds is the fixed seed followed by seed+1, seed+2, …', () => {
    const c = challengeFor('2026-09-18');
    expect(dailySeeds(c, 1)).toEqual([c.seed]);
    expect(dailySeeds(c, 5)).toEqual([c.seed, c.seed + 1, c.seed + 2, c.seed + 3, c.seed + 4]);
    expect(() => dailySeeds(c, 0)).toThrow();
  });

  it("runDaily plays the challenge's level at its fixed seed with the twist modifiers on state.modifiers", async () => {
    const day = twistedDay('2026-09-18');
    const c = challengeFor(day);
    const level = (await loadLevel(c.levelId))!;
    expect(level.id).toBe(c.levelId);
    const row = runDaily(c, level, 2);

    expect(row.challenge).toBe(c);
    expect(row.level.id).toBe(c.levelId);
    expect(row.seeds).toEqual([c.seed, c.seed + 1]);
    expect(row.results).toHaveLength(2);
    expect(row.fixed).toBe(row.results[0]);
    // The twist landed on the sim state (runHeadless reports `state.modifiers`), not the defaults.
    expect(c.twist.modifiers).not.toEqual(DEFAULT_MODIFIERS);
    expect(row.modifiers).toEqual(c.twist.modifiers);
    for (const r of row.results) expect(r.modifiers).toEqual(c.twist.modifiers);
    // ... and it is exactly what createState(level, seed, twist.modifiers) stores.
    expect(row.fixed.modifiers).toEqual(createState(level, c.seed, c.twist.modifiers).modifiers);
    expect(TWISTS.map((t) => t.modifiers)).toContainEqual(row.fixed.modifiers);
    // Bookkeeping is consistent with the results.
    expect(row.wins + row.losers.length).toBe(2);
    expect(row.wins).toBe(row.results.filter((r) => r.outcome === 'won').length);
    expect(row.losers).toEqual(row.seeds.filter((_, i) => row.results[i]!.outcome !== 'won'));
    expect(row.ok).toBe(row.fixed.outcome === 'won' && row.wins / 2 >= DAILY_WIN_RATE);
    expect(row.ticks).toBe(row.results[0]!.ticks + row.results[1]!.ticks);
    if (row.fixed.outcome === 'won') expect(row.fixedStars).toBeGreaterThanOrEqual(1);
    else expect(row.fixedStars).toBe(0);
  });

  it('runDaily without the twist uses the default modifiers on the same level and seeds (the control run)', async () => {
    const day = twistedDay('2026-09-18');
    const c = challengeFor(day);
    const level = (await loadLevel(c.levelId))!;
    const row = runDaily(c, level, 1, false);
    expect(row.seeds).toEqual([c.seed]);
    expect(row.modifiers).toEqual(DEFAULT_MODIFIERS);
    expect(row.fixed.modifiers).toEqual(DEFAULT_MODIFIERS);
    expect(row.fixed.modifiers).not.toEqual(c.twist.modifiers);
  });

  it('runDaily refuses a level that is not the day’s challenge', async () => {
    const c = challengeFor('2026-09-18');
    const other = (await loadLevel(c.levelId === 9 ? 10 : 9))!;
    expect(() => runDaily(c, other, 1)).toThrow(/not the .* challenge/);
  });

  it('twistById resolves every twist id and nothing else', () => {
    for (const t of TWISTS) expect(twistById(t.id)).toBe(t);
    expect(twistById('plain')!.modifiers).toEqual(DEFAULT_MODIFIERS);
    expect(twistById('Lean')).toBeUndefined();
    expect(twistById('')).toBeUndefined();
  });

  it('inPool is the daily pool, ids 9…50, unless a --pool range is given', () => {
    expect(inPool({ id: 8 })).toBe(false);
    expect(inPool({ id: 9 })).toBe(true);
    expect(inPool({ id: 40 })).toBe(true);
    expect(inPool({ id: 50 })).toBe(true);
    expect(inPool({ id: 51 })).toBe(false);
    expect(DEFAULT_POOL).toEqual({ from: POOL_FROM, to: POOL_TO });
    expect(inPool({ id: 8 }, { from: 1, to: 8 })).toBe(true);
    expect(inPool({ id: 9 }, { from: 1, to: 8 })).toBe(false);
    expect(inPool({ id: 33 }, { from: 33, to: 33 })).toBe(true);
  });

  it('parsePool reads a-b (inclusive, 1 <= a <= b) and rejects anything else', () => {
    expect(parsePool('9-50')).toEqual({ from: 9, to: 50 });
    expect(parsePool('33-33')).toEqual({ from: 33, to: 33 });
    expect(parsePool(' 1-8 ')).toEqual({ from: 1, to: 8 });
    expect(() => parsePool('50-9')).toThrow(/bad --pool/);
    expect(() => parsePool('0-5')).toThrow(/bad --pool/);
    expect(() => parsePool('9')).toThrow(/bad --pool/);
    expect(() => parsePool('9..50')).toThrow(/bad --pool/);
    expect(() => parsePool('a-b')).toThrow(/bad --pool/);
  });

  it('runTwist accepts a level outside the daily pool when the --pool range covers it', async () => {
    const twist = twistById('fastFeet')!;
    const tutorial = (await loadLevel(8))!;
    expect(() => runTwist(tutorial, twist, 1)).toThrow(/not in the challenge pool \(9-50\)/);
    const row = runTwist(tutorial, twist, 1, { from: 1, to: 8 });
    expect(row.level).toBe(tutorial);
    expect(row.results[0]!.modifiers).toEqual(twist.modifiers);
    expect(() => runTwist(tutorial, twist, 1, { from: 9, to: 12 })).toThrow(/not in the challenge pool \(9-12\)/);
  });

  it('runTwist plays a pool level over seeds 1..K with the twist on state.modifiers and gates at 80 %', async () => {
    const twist = twistById('lean')!;
    const level = (await loadLevel(9))!;
    const row = runTwist(level, twist, 2);
    expect(row.level).toBe(level);
    expect(row.twist).toBe(twist);
    expect(row.seeds).toEqual([1, 2]);
    expect(row.results).toHaveLength(2);
    for (const r of row.results) expect(r.modifiers).toEqual(twist.modifiers);
    expect(row.results[0]!.modifiers).toEqual(createState(level, 1, twist.modifiers).modifiers);
    expect(row.wins).toBe(row.results.filter((r) => r.outcome === 'won').length);
    expect(row.losers).toEqual(row.seeds.filter((_, i) => row.results[i]!.outcome !== 'won'));
    expect(row.stars).toHaveLength(2);
    expect(row.ticks).toBe(row.results[0]!.ticks + row.results[1]!.ticks);
    expect(row.ok).toBe(row.wins / 2 >= TWIST_WIN_RATE);
    if (row.wins === 2) expect(row.worstMs).toBe(Math.max(row.results[0]!.timeMs, row.results[1]!.timeMs));
    expect(TWIST_WIN_RATE).toBe(0.8); // 4/5 at K = 5 (GDD §7.5 item 3)
  });

  it('runTwist refuses a level outside the pool and a bad seed count', async () => {
    const twist = twistById('plain')!;
    const tutorial = (await loadLevel(8))!;
    expect(() => runTwist(tutorial, twist, 1)).toThrow(/not in the challenge pool/);
    const pool = (await loadLevel(9))!;
    expect(() => runTwist(pool, twist, 0)).toThrow(/bad seed count/);
  });
});

/*
 * The weekly playtest must run exactly the match the client builds for a week: `weeklyFor`'s level
 * and fixed seed, the (never plain) twist on `state.modifiers`, and it must report the 3★ target
 * (`targetMs` = the level's own `star3` clock) per seed — the extra gate of GDD §8.
 */
describe('weekly playtest runner', () => {
  const MONDAY = '2026-09-21';

  it('addWeeks walks Mondays only', () => {
    expect(addWeeks(MONDAY, 0)).toBe(MONDAY);
    expect(addWeeks(MONDAY, 1)).toBe('2026-09-28');
    expect(addWeeks(MONDAY, 15)).toBe('2027-01-04');
    expect(() => addWeeks('2026-09-22', 1)).toThrow(/not a Monday/);
    expect(() => addWeeks('2026-09-20', 1)).toThrow(/not a Monday/);
    expect(() => addWeeks('2026/09/21', 1)).toThrow();
  });

  it('weeklyPlan picks the same level, seed, twist and target as weeklyFor for each consecutive week', () => {
    const plan = weeklyPlan(MONDAY, 26);
    expect(plan).toHaveLength(26);
    for (let i = 0; i < plan.length; i++) {
      const expected = weeklyFor(addWeeks(MONDAY, i));
      expect(plan[i]).toEqual(expected);
      expect(plan[i]!.levelId).toBe(expected.levelId);
      expect(plan[i]!.seed).toBe(expected.seed);
      expect(plan[i]!.twist).toBe(expected.twist);
      expect(plan[i]!.targetMs).toBe(expected.targetMs);
      expect(plan[i]!.twist.id).not.toBe('plain');
      expect(plan[i]!.levelId).toBeGreaterThanOrEqual(WEEKLY_POOL_FROM);
      expect(plan[i]!.levelId).toBeLessThanOrEqual(POOL_TO);
    }
    expect(plan[0]!.weekKey).toBe(MONDAY);
    expect(plan[25]!.weekKey).toBe('2027-03-15');
    expect(() => weeklyPlan(MONDAY, 0)).toThrow(/bad week count/);
    expect(() => weeklyPlan('2026-09-22', 1)).toThrow(/not a Monday/);
  });

  it('weeklySeeds is the fixed seed followed by seed+1, seed+2, … (the daily rule)', () => {
    const c = weeklyFor(MONDAY);
    expect(weeklySeeds(c, 1)).toEqual([c.seed]);
    expect(weeklySeeds(c, 3)).toEqual([c.seed, c.seed + 1, c.seed + 2]);
    expect(weeklySeeds(c, 3)).toEqual(dailySeeds(c, 3));
    expect(() => weeklySeeds(c, 0)).toThrow(/bad seed count/);
  });

  it("runWeekly plays the week's level at its fixed seed with the twist modifiers on state.modifiers", async () => {
    const c = weeklyFor(MONDAY);
    const level = (await loadLevel(c.levelId))!;
    expect(level.id).toBe(c.levelId);
    const row = runWeekly(c, level, 2);

    expect(row.challenge).toBe(c);
    expect(row.level.id).toBe(c.levelId);
    expect(row.seeds).toEqual([c.seed, c.seed + 1]);
    expect(row.results).toHaveLength(2);
    expect(row.fixed).toBe(row.results[0]);
    // A weekly is never plain, so the modifiers are visibly non-default and land on the sim state.
    expect(c.twist.modifiers).not.toEqual(DEFAULT_MODIFIERS);
    expect(row.modifiers).toEqual(c.twist.modifiers);
    for (const r of row.results) expect(r.modifiers).toEqual(c.twist.modifiers);
    expect(row.fixed.modifiers).toEqual(createState(level, c.seed, c.twist.modifiers).modifiers);
    expect(TWISTS.map((t) => t.modifiers)).toContainEqual(row.fixed.modifiers);
    // Bookkeeping is consistent with the results.
    expect(row.wins + row.losers.length).toBe(2);
    expect(row.wins).toBe(row.results.filter((r) => r.outcome === 'won').length);
    expect(row.losers).toEqual(row.seeds.filter((_, i) => row.results[i]!.outcome !== 'won'));
    expect(row.fixedStars).toBe(starsFor(level, row.fixed));
    expect(row.ticks).toBe(row.results[0]!.ticks + row.results[1]!.ticks);
    expect(row.winsOk).toBe(row.fixed.outcome === 'won' && row.wins / 2 >= WEEKLY_WIN_RATE);
    expect(row.ok).toBe(row.winsOk); // the 3★ target is informational
  });

  it('runWeekly reports the 3★ target per seed: targetMs is the level clock, target seeds are the wins within it', async () => {
    const c = weeklyFor(MONDAY);
    const level = (await loadLevel(c.levelId))!;
    expect(c.targetMs).toBe(level.star3);
    const row = runWeekly(c, level, 3);
    const winners = row.results.map((r, i) => ({ r, seed: row.seeds[i]! })).filter(({ r }) => r.outcome === 'won');
    const onTarget = winners.filter(({ r }) => r.timeMs <= c.targetMs).map(({ seed }) => seed);
    expect(row.targetSeeds).toEqual(onTarget);
    expect(row.targetOk).toBe(onTarget.length > 0);
    expect(row.fixedOnTarget).toBe(row.fixed.outcome === 'won' && row.fixed.timeMs <= c.targetMs);
    expect(row.fixedOnTarget).toBe(row.fixedStars === 3);
    // A seed is on target exactly when starsFor gives it 3 stars.
    for (let i = 0; i < row.results.length; i++) {
      expect(row.targetSeeds.includes(row.seeds[i]!)).toBe(starsFor(level, row.results[i]!) === 3);
    }
    if (winners.length) {
      const best = Math.min(...winners.map(({ r }) => r.timeMs));
      expect(row.bestMs).toBe(best);
      expect(row.results[row.seeds.indexOf(row.bestSeed!)]!.timeMs).toBe(best);
      expect(row.targetOk).toBe(best <= c.targetMs);
    } else {
      expect(row.bestMs).toBeUndefined();
      expect(row.bestSeed).toBeUndefined();
      expect(row.targetOk).toBe(false);
    }
  });

  it('the target gate is the only difference between a week that wins and a week that passes', async () => {
    // Force both branches of the target check by rewriting targetMs on the same results.
    const c = weeklyFor(MONDAY);
    const level = (await loadLevel(c.levelId))!;
    const base = runWeekly(c, level, 1);
    expect(base.fixed.outcome).toBe('won'); // fixed seed of the first weekly must be won (GDD §8 gate)
    const generous = runWeekly({ ...c, targetMs: base.fixed.timeMs }, level, 1);
    expect(generous.targetSeeds).toEqual([c.seed]);
    expect(generous.fixedOnTarget).toBe(true);
    expect(generous.targetOk).toBe(true);
    expect(generous.winsOk).toBe(true);
    expect(generous.ok).toBe(generous.winsOk);
    const strict = runWeekly({ ...c, targetMs: base.fixed.timeMs - 50 }, level, 1);
    expect(strict.targetSeeds).toEqual([]);
    expect(strict.fixedOnTarget).toBe(false);
    expect(strict.targetOk).toBe(false);
    expect(strict.winsOk).toBe(true);
    expect(strict.ok).toBe(strict.winsOk); // target no longer gates
  });

  it('runWeekly without the twist uses the default modifiers on the same level and seeds (the control run)', async () => {
    const c = weeklyFor(MONDAY);
    const level = (await loadLevel(c.levelId))!;
    const row = runWeekly(c, level, 1, false);
    expect(row.seeds).toEqual([c.seed]);
    expect(row.modifiers).toEqual(DEFAULT_MODIFIERS);
    expect(row.fixed.modifiers).toEqual(DEFAULT_MODIFIERS);
    expect(row.fixed.modifiers).not.toEqual(c.twist.modifiers);
  });

  it("runWeekly refuses a level that is not the week's challenge", async () => {
    const c = weeklyFor(MONDAY);
    const other = (await loadLevel(c.levelId === 33 ? 34 : 33))!;
    expect(() => runWeekly(c, other, 1)).toThrow(/not the .* challenge/);
  });

  it('the weekly win-rate gate is the twist one (4/5), the daily stays at 90 %', () => {
    expect(WEEKLY_WIN_RATE).toBe(0.8);
    expect(DAILY_WIN_RATE).toBe(0.9);
  });
});
