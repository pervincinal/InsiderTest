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
