import { describe, expect, it } from 'vitest';
import { POOL_TO, TWISTS, WEEKLY_CYCLE_FROM, WEEKLY_POOL_FROM, challengeFor, dayKeyOfNumber, dayNumberOf, hashDayKey, isMondayKey, legacyWeeklyLevelId, seededOrder, weekIndexOf, weeklyFor } from '../../src/daily/challenge';
import { LEVEL_META } from '../../src/levels/index';

/*
 * Weekly cycle permutation (AUD-B13, GDD §8.1 "AUD-B13 2026-11-01"). Before the cut-over Monday
 * `WEEKLY_CYCLE_FROM` the v1 hash draw stands byte-for-byte (saves hold weekly results by week key,
 * the TestFlight plan lists past weeks); from it on, week i plays position i mod 18 of one
 * permutation per 18-week block, with a boundary swap so no level repeats back-to-back across a
 * block boundary either. Seed and twist keep the v1 construction on every key.
 */

const addWeeks = (key: string, w: number): string => dayKeyOfNumber(dayNumberOf(key) + 7 * w);
const POOL = LEVEL_META.filter((m) => m.id >= WEEKLY_POOL_FROM && m.id <= POOL_TO);
const P = POOL.length;
const NON_PLAIN = TWISTS.filter((t) => t.id !== 'plain');

/** The ten Mondays before the cut-over, as the v1 picker drew them on 2026-11-01 (plus the cut-over's own v1 draw). */
const PAST_WEEKS: readonly [string, number, number, string, number][] = [
  ['2026-08-31', 49, 219275, 'fastFeet', 25000],
  ['2026-09-07', 33, 129191, 'fastFeet', 35000],
  ['2026-09-14', 49, 646071, 'fastFeet', 25000],
  ['2026-09-21', 33, 743047, 'fastFeet', 35000],
  ['2026-09-28', 46, 760996, 'thinWalls', 45000],
  ['2026-10-05', 37, 80299, 'fastFeet', 55000],
  ['2026-10-12', 39, 157939, 'fastFeet', 75000],
  ['2026-10-19', 36, 495762, 'lean', 45000],
  ['2026-10-26', 36, 136188, 'thinWalls', 45000],
  ['2026-11-02', 37, 595775, 'fastFeet', 55000],
];

/** The first 8 weeks of the new table (scratch `weekly-table-2026-11-09.md`, 36 weeks for the publisher). */
const NEW_WEEKS: readonly [string, number, number, string][] = [
  ['2026-11-09', 42, 775886, 'lean'],
  ['2026-11-16', 41, 896806, 'lean'],
  ['2026-11-23', 34, 4510, 'lean'],
  ['2026-11-30', 49, 804174, 'lean'],
  ['2026-12-07', 36, 759843, 'fastFeet'],
  ['2026-12-14', 50, 856819, 'fastFeet'],
  ['2026-12-21', 38, 539035, 'fastFeet'],
  ['2026-12-28', 44, 879688, 'thinWalls'],
];

describe('weekly cycle permutation (AUD-B13): cut-over', () => {
  it('the cut-over is a Monday, week index 0; the pool is 18 levels', () => {
    expect(WEEKLY_CYCLE_FROM).toBe('2026-11-09');
    expect(isMondayKey(WEEKLY_CYCLE_FROM)).toBe(true);
    expect(weekIndexOf(WEEKLY_CYCLE_FROM)).toBe(0);
    expect(weekIndexOf('2026-11-02')).toBe(-1);
    expect(weekIndexOf('2026-11-16')).toBe(1);
    expect(weekIndexOf('2027-03-15')).toBe(18);
    expect(P).toBe(18);
  });

  it('every key before the cut-over keeps the v1 draw byte-for-byte (pinned table of 10 past weeks)', () => {
    for (const [key, levelId, seed, twist, targetMs] of PAST_WEEKS) {
      const c = weeklyFor(key);
      expect([c.weekKey, c.levelId, c.seed, c.twist.id, c.targetMs], key).toEqual([key, levelId, seed, twist, targetMs]);
      expect(c.levelId, key).toBe(legacyWeeklyLevelId(key));
    }
    // and for 200 weeks back from the cut-over the level is the v1 hash draw
    for (let w = -200; w < 0; w++) {
      const key = addWeeks(WEEKLY_CYCLE_FROM, w);
      expect(weeklyFor(key).levelId, key).toBe(POOL[hashDayKey(`${key}#week`) % P]!.id);
    }
  });

  it('from the cut-over the level is re-mapped (2026-11-09: v1 drew 36, the cycle plays 42) and the first 8 weeks are pinned', () => {
    expect(legacyWeeklyLevelId(WEEKLY_CYCLE_FROM)).toBe(36);
    for (const [key, levelId, seed, twist] of NEW_WEEKS) {
      const c = weeklyFor(key);
      expect([c.weekKey, c.levelId, c.seed, c.twist.id], key).toEqual([key, levelId, seed, twist]);
      expect(c.targetMs).toBe(LEVEL_META.find((m) => m.id === levelId)!.star3);
    }
  });
});

describe('weekly cycle permutation (AUD-B13): blocks, boundaries, seed and twist', () => {
  it('18 consecutive weeks from the cut-over draw each pool level exactly once — every block of the first 12', () => {
    const all = POOL.map((m) => m.id).sort((a, b) => a - b);
    const blocks: number[][] = [];
    for (let b = 0; b < 12; b++) {
      const ids = Array.from({ length: P }, (_, pos) => weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, b * P + pos)).levelId);
      expect([...ids].sort((a, b2) => a - b2), `block ${b}`).toEqual(all);
      blocks.push(ids);
    }
    // a different permutation per block
    for (let b = 1; b < blocks.length; b++) expect(blocks[b], `block ${b} vs ${b - 1}`).not.toEqual(blocks[b - 1]);
    // any 10-week window inside a block has 10 distinct levels
    for (let start = 0; start + 10 <= P; start++) {
      const w = new Set<number>();
      for (let d = 0; d < 10; d++) w.add(weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, start + d)).levelId);
      expect(w.size, `window +${start}`).toBe(10);
    }
  });

  it('never the same level on consecutive weeks over 104 weeks from the cut-over, nor across the cut-over itself, nor over 2000 weeks', () => {
    let prev = weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, -1)).levelId; // 2026-11-02, v1 draw: 37
    expect(prev).toBe(37);
    for (let w = 0; w < 2000; w++) {
      const key = addWeeks(WEEKLY_CYCLE_FROM, w);
      const id = weeklyFor(key).levelId;
      expect(id, key).not.toBe(prev);
      prev = id;
    }
    // over the first 104 weeks every pool level is drawn 5 or 6 times
    const count = new Map<number, number>();
    for (let w = 0; w < 104; w++) {
      const id = weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, w)).levelId;
      count.set(id, (count.get(id) ?? 0) + 1);
    }
    expect(count.size).toBe(P);
    for (const [id, n] of count) {
      expect(n, `level ${id}`).toBeGreaterThanOrEqual(5);
      expect(n, `level ${id}`).toBeLessThanOrEqual(6);
    }
  });

  it('boundary rule: a block whose raw first level equals the week before swaps positions 0 and 1; a free block keeps its raw order', () => {
    const rawOrder = (b: number): number[] => seededOrder(POOL, hashDayKey(`weekcycle#${b}`)).map((m) => m.id);
    let swapped = 0;
    let kept = 0;
    for (let b = 0; b < 400; b++) {
      const raw = rawOrder(b);
      const before = weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, b * P - 1)).levelId;
      const first = weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, b * P)).levelId;
      const second = weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, b * P + 1)).levelId;
      if (raw[0] === before) {
        swapped++;
        expect([first, second], `block ${b} swaps`).toEqual([raw[1], raw[0]]);
      } else {
        kept++;
        expect([first, second], `block ${b} keeps`).toEqual([raw[0], raw[1]]);
      }
      // positions 2 … 17 are always the raw order; the last one is what the next block reads
      for (let pos = 2; pos < P; pos++) expect(weeklyFor(addWeeks(WEEKLY_CYCLE_FROM, b * P + pos)).levelId, `block ${b} pos ${pos}`).toBe(raw[pos]);
      expect(first, `block ${b} first ≠ before`).not.toBe(before);
    }
    // a collision is a 1/18 event: over 400 blocks, 22 expected — between 8 and 45
    expect(swapped).toBeGreaterThanOrEqual(8);
    expect(swapped).toBeLessThanOrEqual(45);
    expect(kept + swapped).toBe(400);
    // block 0 reads the v1 draw of 2026-11-02 (37); its raw first level is 42, so it keeps its order
    expect(rawOrder(0)[0]).toBe(42);
    expect(weeklyFor(WEEKLY_CYCLE_FROM).levelId).toBe(42);
  });

  it('seed and twist keep the v1 construction on every key, before and after the cut-over; the twist is never plain and all four stay within 15–35 %', () => {
    const count = new Map<string, number>();
    for (let w = -52; w < 104; w++) {
      const key = addWeeks(WEEKLY_CYCLE_FROM, w);
      const c = weeklyFor(key);
      expect(c.seed, key).toBe((hashDayKey(`${key}#week`) % 1_000_000) + 1);
      expect(c.twist, key).toBe(NON_PLAIN[hashDayKey(`${key}#weektwist`) % NON_PLAIN.length]);
      expect(c.twist.id, key).not.toBe('plain');
      if (w >= 0) count.set(c.twist.id, (count.get(c.twist.id) ?? 0) + 1);
    }
    expect(count.size).toBe(4);
    for (const t of NON_PLAIN) {
      const share = (count.get(t.id) ?? 0) / 104;
      expect(share, t.id).toBeGreaterThanOrEqual(0.15);
      expect(share, t.id).toBeLessThanOrEqual(0.35);
    }
  });

  it('is deterministic and total: the same key gives the same challenge, round-trips its key, and non-Mondays still throw after the cut-over', () => {
    for (let w = -30; w < 60; w += 7) {
      const key = addWeeks(WEEKLY_CYCLE_FROM, w);
      const c = weeklyFor(key);
      expect(weeklyFor(key)).toEqual(c);
      expect(weeklyFor(c.weekKey)).toEqual(c);
      expect(c.levelId).toBeGreaterThanOrEqual(WEEKLY_POOL_FROM);
      expect(c.levelId).toBeLessThanOrEqual(POOL_TO);
    }
    expect(() => weeklyFor('2026-11-10')).toThrow();
    expect(() => weeklyFor('2027-02-29')).toThrow();
    // the daily is untouched by the weekly cut-over (GDD §7.2 pins)
    expect([challengeFor('2026-09-21').levelId, challengeFor('2026-09-21').seed]).toEqual([44, 44606]);
  });
});
