import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import { claimDaily, dailyStatus, dayKey, yesterdayKey } from '../../src/economy/wallet';

/*
 * REV-23: the daily streak across a DST change. `dayKey` is the device's LOCAL calendar day, so
 * "yesterday" must be calendar arithmetic on that day, not `nowMs - 24 h`: a spring-forward day is
 * 23 hours long, and between 00:00 and 01:00 on the day after it the subtraction lands two days
 * back. Node re-reads `process.env.TZ` when it is assigned, so the zone below is in force for every
 * `Date` in this file whatever the runner's zone (the first test proves it before relying on it).
 */
process.env.TZ = 'Europe/Berlin';

const DAY_MS = 86_400_000;
/** Europe/Berlin 2026: spring forward Sun 29 March (02:00 → 03:00), fall back Sun 25 October. */
const SPRING = { y: 2026, m: 2, d: 29 };
const FALL = { y: 2026, m: 9, d: 25 };
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m, d, h, min).getTime();

let save: SaveData;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
});

describe('yesterdayKey (local calendar arithmetic)', () => {
  it('the zone has DST: 29 March 2026 is a 23-hour day and 25 October a 25-hour day', () => {
    expect(new Date(SPRING.y, SPRING.m, SPRING.d - 1, 12).getTimezoneOffset()).toBe(-60);
    expect(new Date(SPRING.y, SPRING.m, SPRING.d, 12).getTimezoneOffset()).toBe(-120);
    expect(at(SPRING.y, SPRING.m, SPRING.d + 1, 0) - at(SPRING.y, SPRING.m, SPRING.d, 0)).toBe(23 * 3_600_000);
    expect(at(FALL.y, FALL.m, FALL.d + 1, 0) - at(FALL.y, FALL.m, FALL.d, 0)).toBe(25 * 3_600_000);
  });

  it('is the previous calendar day, across month and year edges', () => {
    expect(yesterdayKey('2026-03-30')).toBe('2026-03-29');
    expect(yesterdayKey('2026-03-01')).toBe('2026-02-28');
    expect(yesterdayKey('2024-03-01')).toBe('2024-02-29');
    expect(yesterdayKey('2026-01-01')).toBe('2025-12-31');
    expect(yesterdayKey('2026-10-26')).toBe('2026-10-25');
  });

  it('matches the key of new Date(y, m, d - 1) for every hour of the day after the spring-forward day — where minus 24 h does not', () => {
    const { y, m, d } = SPRING;
    const expected = dayKey(at(y, m, d, 12));
    let subtractionWrong = 0;
    for (let h = 0; h < 24; h++) {
      const now = at(y, m, d + 1, h, 30);
      expect(yesterdayKey(dayKey(now)), `hour ${h}`).toBe(expected);
      if (dayKey(now - DAY_MS) !== expected) subtractionWrong += 1;
    }
    expect(subtractionWrong).toBe(1); // 00:30 the day after: 24 h earlier is 23:30 two days back
  });
});

describe('daily streak across DST (REV-23)', () => {
  it('a claim on the spring-forward day continues as day 2 at 00:30 the next day', () => {
    const { y, m, d } = SPRING;
    expect(claimDaily(save, at(y, m, d, 12))).toMatchObject({ day: 1 });
    expect(save.daily.lastClaimDay).toBe(`${y}-03-29`);
    const earlyNextDay = at(y, m, d + 1, 0, 30);
    expect(dayKey(earlyNextDay)).toBe(`${y}-03-30`);
    expect(dayKey(earlyNextDay - DAY_MS)).toBe(`${y}-03-28`); // the trap the old code fell into
    expect(dailyStatus(save, earlyNextDay)).toMatchObject({ claimed: false, day: 2 });
    expect(claimDaily(save, earlyNextDay)).toMatchObject({ day: 2 });
    expect(dailyStatus(save, at(y, m, d + 2, 0, 30))).toMatchObject({ claimed: false, day: 3 });
  });

  it('a claim the day before the spring-forward day continues as day 2 on it, at any hour', () => {
    const { y, m, d } = SPRING;
    expect(claimDaily(save, at(y, m, d - 1, 23, 30))).toMatchObject({ day: 1 });
    for (const h of [0, 1, 3, 12, 23]) expect(dailyStatus(save, at(y, m, d, h, 30)), `hour ${h}`).toMatchObject({ claimed: false, day: 2 });
  });

  it('a claim on the fall-back day (25 h) continues as day 2 the next day and a missed day still resets', () => {
    const { y, m, d } = FALL;
    expect(claimDaily(save, at(y, m, d, 12))).toMatchObject({ day: 1 });
    for (const h of [0, 1, 12, 23]) expect(dailyStatus(save, at(y, m, d + 1, h, 30)), `hour ${h}`).toMatchObject({ claimed: false, day: 2 });
    expect(dailyStatus(save, at(y, m, d + 2, 0, 30))).toMatchObject({ claimed: false, day: 1 });
  });
});
