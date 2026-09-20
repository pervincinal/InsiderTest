import { describe, expect, it } from 'vitest';
import { challengeFor, TWISTS } from '../../src/daily/challenge';
import { loadLevel } from '../../src/levels/index';
import { DEFAULT_MODIFIERS, createState } from '../../src/sim/index';
import { DAILY_WIN_RATE, TWIST_WIN_RATE, addDays, dailyPlan, dailySeeds, inPool, runDaily, runTwist, twistById } from '../../scripts/lib/daily';

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

  it('inPool is the daily pool, ids 9…50', () => {
    expect(inPool({ id: 8 })).toBe(false);
    expect(inPool({ id: 9 })).toBe(true);
    expect(inPool({ id: 40 })).toBe(true);
    expect(inPool({ id: 50 })).toBe(true);
    expect(inPool({ id: 51 })).toBe(false);
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
