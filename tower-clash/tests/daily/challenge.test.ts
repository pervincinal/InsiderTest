import { describe, expect, it } from 'vitest';
import { challengeFor, dayKeyOf, goldReward, hashDayKey, POOL_FROM, POOL_TO, TWISTS } from '../../src/daily/challenge';

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
