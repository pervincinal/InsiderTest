import { describe, expect, it } from 'vitest';
import { challengeFor, dayKeyOf, dayNumberOf, goldReward, hashDayKey, isMondayKey, POOL_FROM, POOL_TO, TWISTS, WEEKLY_POOL_FROM, weekKeyOf, weeklyFor } from '../../src/daily/challenge';

describe('daily challenge picker (GDD §7)', () => {
  it('is deterministic and stays inside the pool', () => {
    const a = challengeFor('2026-09-18');
    const b = challengeFor('2026-09-18');
    expect(a).toEqual(b);
    expect(a.levelId).toBeGreaterThanOrEqual(POOL_FROM);
    expect(a.levelId).toBeLessThanOrEqual(POOL_TO);
    expect(a.seed).toBeGreaterThan(0);
    expect(TWISTS).toContain(a.twist);
  });

  it('spreads levels and twists over a month', () => {
    const levels = new Set<number>();
    const twists = new Set<string>();
    for (let d = 1; d <= 30; d++) {
      const c = challengeFor(`2026-10-${String(d).padStart(2, '0')}`);
      levels.add(c.levelId);
      twists.add(c.twist.id);
    }
    expect(levels.size).toBeGreaterThanOrEqual(15);
    expect(twists.size).toBe(TWISTS.length);
  });

  it('rejects malformed keys and hashes stably', () => {
    expect(() => challengeFor('2026/09/18')).toThrow();
    expect(hashDayKey('2026-09-18')).toBe(hashDayKey('2026-09-18'));
    expect(hashDayKey('2026-09-18')).not.toBe(hashDayKey('2026-09-19'));
  });

  it('day key is UTC and rewards scale with stars', () => {
    expect(dayKeyOf(new Date('2026-09-18T23:59:59Z'))).toBe('2026-09-18');
    expect(dayKeyOf(new Date('2026-09-19T00:00:01Z'))).toBe('2026-09-19');
    expect(goldReward(0)).toBe(30);
    expect(goldReward(3)).toBe(60);
    expect(goldReward(9)).toBe(60);
  });
});

describe('daily picker cycles (DAILY-4) and weekly challenge (GDD §8)', () => {
  it('never repeats a level within a cycle and pins the first shipped days', () => {
    const size = POOL_TO - POOL_FROM + 1;
    const seen = new Set<number>();
    for (let d = 0; d < size; d++) seen.add(challengeFor(addDaysLocal('2026-01-01', d)).levelId);
    expect(seen.size).toBe(size);
    // any 14-day window has 14 distinct levels except across a cycle boundary
    for (let start = 0; start < size - 14; start++) {
      const w = new Set<number>();
      for (let d = 0; d < 14; d++) w.add(challengeFor(addDaysLocal('2026-01-01', start + d)).levelId);
      expect(w.size).toBe(14);
    }
    expect(dayNumberOf('2026-01-01')).toBe(0);
    expect(dayNumberOf('2025-12-31')).toBe(-1);
    const pin = challengeFor('2026-09-21');
    expect(pin.levelId).toBeGreaterThanOrEqual(POOL_FROM);
    expect(pin.levelId).toBeLessThanOrEqual(POOL_TO);
  });

  it('weekly picker is Monday-only, band 4+, never plain, and targets the level clock', () => {
    expect(weekKeyOf(new Date('2026-09-20T12:00:00Z'))).toBe('2026-09-14');
    expect(weekKeyOf(new Date('2026-09-21T00:00:00Z'))).toBe('2026-09-21');
    expect(weekKeyOf(new Date('2026-09-27T23:59:59Z'))).toBe('2026-09-21');
    expect(isMondayKey('2026-09-21')).toBe(true);
    expect(isMondayKey('2026-09-22')).toBe(false);
    expect(() => weeklyFor('2026-09-22')).toThrow();
    const levels = new Set<number>();
    const twists = new Set<string>();
    for (let w = 0; w < 26; w++) {
      const c = weeklyFor(addDaysLocal('2026-09-21', 7 * w));
      expect(c.levelId).toBeGreaterThanOrEqual(WEEKLY_POOL_FROM);
      expect(c.levelId).toBeLessThanOrEqual(POOL_TO);
      expect(c.twist.id).not.toBe('plain');
      expect(c.targetMs).toBeGreaterThan(0);
      expect(weeklyFor(c.weekKey)).toEqual(c);
      levels.add(c.levelId);
      twists.add(c.twist.id);
    }
    expect(levels.size).toBeGreaterThanOrEqual(6);
    expect(twists.size).toBe(4);
  });
});

function addDaysLocal(dayKey: string, n: number): string {
  const t = Date.UTC(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10)));
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/* ---------- GDD §7.2 worked example, cycle boundaries and calendar arithmetic (QA 2026-09-21) ---------- */

describe('picker pins (GDD §7.2), cycle boundaries and dayNumberOf', () => {
  const daily = (k: string): [number, number, string] => {
    const c = challengeFor(k);
    return [c.levelId, c.seed, c.twist.id];
  };
  const P = POOL_TO - POOL_FROM + 1;

  it('pins the GDD §7.2 worked example exactly: 2026-09-21/22/23 daily and the first shipped weekly', () => {
    expect(P).toBe(42);
    expect(dayNumberOf('2026-09-21')).toBe(263); // cycle 6, pos 11
    expect(daily('2026-09-21')).toEqual([44, 44606, 'lean']);
    expect(daily('2026-09-22')).toEqual([31, 711749, 'reinforced']);
    expect(daily('2026-09-23')).toEqual([21, 489368, 'thinWalls']);
    // the retired v1 pins kept their seed and twist (only the level re-mapped, DAILY-4)
    expect(daily('2026-09-18').slice(1)).toEqual([233226, 'plain']);
    expect(daily('2026-09-19').slice(1)).toEqual([455607, 'fastFeet']);
    expect(daily('2026-09-20').slice(1)).toEqual([266987, 'fastFeet']);
    const w = weeklyFor('2026-09-21');
    expect([w.levelId, w.seed, w.twist.id, w.targetMs]).toEqual([33, 743047, 'fastFeet', 40_000]);
    expect(w.weekKey).toBe('2026-09-21');
  });

  it('cycle boundary: 2026-10-21 closes cycle 6, 2026-10-22 opens cycle 7; every cycle (also before the epoch) visits all 42 levels once', () => {
    expect(dayNumberOf('2026-09-10')).toBe(6 * P);
    expect(dayNumberOf('2026-10-21')).toBe(6 * P + (P - 1));
    expect(dayNumberOf('2026-10-22')).toBe(7 * P);
    expect(dayNumberOf('2026-12-03')).toBe(8 * P);
    expect(dayNumberOf('2025-11-20')).toBe(-P); // cycle −1, pos 0
    expect(dayNumberOf('2025-11-19')).toBe(-P - 1); // cycle −2, pos 41
    const cycle = (first: string): number[] => Array.from({ length: P }, (_, d) => challengeFor(addDaysLocal(first, d)).levelId);
    const all = Array.from({ length: P }, (_, i) => POOL_FROM + i);
    for (const first of ['2026-09-10', '2026-10-22', '2026-12-03', '2025-11-20', '2025-10-09']) expect([...cycle(first)].sort((a, b) => a - b), `cycle starting ${first}`).toEqual(all);
    // a different permutation per cycle
    expect(cycle('2026-09-10')).not.toEqual(cycle('2026-10-22'));
    expect(cycle('2026-10-22')).not.toEqual(cycle('2026-12-03'));
    // the shuffle depends on the cycle only: day 41 of cycle 6 and day 0 of cycle 7 are the pinned boundary days
    expect(daily('2026-10-21')).toEqual([46, 509420, 'lean']);
    expect(daily('2026-10-22')).toEqual([27, 287039, 'reinforced']);
    // never the same level on consecutive days (GDD §7.2), cycle boundaries included, over 1200 days from before the epoch
    let prev = challengeFor('2025-10-09').levelId;
    for (let d = 1; d < 1200; d++) {
      const id = challengeFor(addDaysLocal('2025-10-09', d)).levelId;
      expect(id, `day +${d}`).not.toBe(prev);
      prev = id;
    }
  });

  it('dayNumberOf: leap day 2028-02-29, non-leap 2027, pre-epoch keys, and every consecutive key is exactly one apart', () => {
    expect(dayNumberOf('2028-02-28')).toBe(788);
    expect(dayNumberOf('2028-02-29')).toBe(789);
    expect(dayNumberOf('2028-03-01')).toBe(790);
    expect(dayNumberOf('2027-02-28')).toBe(423);
    expect(dayNumberOf('2027-03-01')).toBe(424);
    expect(dayNumberOf('2024-02-29')).toBe(-672);
    expect(dayNumberOf('2000-02-29')).toBe(-9438); // 2000 is a leap year (divisible by 400)
    expect(dayNumberOf('2000-03-01')).toBe(-9437);
    expect(dayNumberOf('1970-01-01')).toBe(-20454);
    expect(dayNumberOf('1969-12-31')).toBe(-20455);
    for (const start of ['2025-01-01', '2027-12-01', '2099-12-01']) {
      const base = dayNumberOf(start);
      for (let d = 1; d <= 500; d++) expect(dayNumberOf(addDaysLocal(start, d)), `${start} + ${d}`).toBe(base + d);
    }
    // the leap day is its own challenge day, in the pool, deterministic, and pre-epoch keys are too
    for (const k of ['2028-02-29', '1970-01-01', '1969-12-31']) {
      const c = challengeFor(k);
      expect(c).toEqual(challengeFor(k));
      expect(c.levelId).toBeGreaterThanOrEqual(POOL_FROM);
      expect(c.levelId).toBeLessThanOrEqual(POOL_TO);
    }
    expect(challengeFor('2028-02-29').levelId).not.toBe(challengeFor('2028-03-01').levelId);
    // Monday keys must be real calendar dates (V8 rolls 2026-02-30 over to Monday 2026-03-02)
    expect(isMondayKey('2026-02-30')).toBe(false);
    expect(isMondayKey('2029-01-01')).toBe(true);
    expect(() => weeklyFor('2026-02-30')).toThrow();
  });
});
