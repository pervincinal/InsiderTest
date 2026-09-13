import { describe, expect, it } from 'vitest';
import { defaultSave, isLevelUnlocked, normalizeSave, recordWin, starsFor } from '../../src/ui/save';

const LEVELS = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe('isLevelUnlocked', () => {
  it('only level 1 is open on a fresh save', () => {
    const save = defaultSave();
    expect(LEVELS.map((_, i) => isLevelUnlocked(save, LEVELS, i))).toEqual([true, false, false]);
  });

  it('level N+1 opens with ≥1 star on level N, not before', () => {
    const save = defaultSave();
    save.stars['1'] = 1;
    expect(LEVELS.map((_, i) => isLevelUnlocked(save, LEVELS, i))).toEqual([true, true, false]);
    save.stars['2'] = 3;
    expect(isLevelUnlocked(save, LEVELS, 2)).toBe(true);
  });

  it('zero stars do not unlock; out-of-range indices are locked', () => {
    const save = defaultSave();
    save.stars['1'] = 0;
    expect(isLevelUnlocked(save, LEVELS, 1)).toBe(false);
    expect(isLevelUnlocked(save, LEVELS, -1)).toBe(false);
    expect(isLevelUnlocked(save, LEVELS, 3)).toBe(false);
    expect(isLevelUnlocked(save, [], 0)).toBe(false);
  });
});

describe('recordWin coins (GDD §2.6: 10 per star, first clear only)', () => {
  it('pays 10 per new star and nothing on a repeat with the same stars', () => {
    const save = defaultSave();
    expect(recordWin(save, 1, 2, 10)).toBe(20);
    expect(save.coins).toBe(20);
    expect(recordWin(save, 1, 2, 10)).toBe(0);
    expect(recordWin(save, 1, 1, 10)).toBe(0); // worse run keeps the best stars
    expect(save.stars['1']).toBe(2);
    expect(recordWin(save, 1, 3, 10)).toBe(10); // one extra star
    expect(save.coins).toBe(30);
  });

  it('starsFor uses the level thresholds', () => {
    const level = { star3: 45_000, star2: 90_000 };
    expect(starsFor(level, 45_000)).toBe(3);
    expect(starsFor(level, 45_001)).toBe(2);
    expect(starsFor(level, 90_001)).toBe(1);
  });

  it('normalizeSave clamps hostile input', () => {
    const s = normalizeSave({ stars: { '1': 9, '2': -1, '3': 'x' }, coins: -5, settings: { sendRatio: 0.3 } });
    expect(s.stars).toEqual({ '1': 3, '2': 0 });
    expect(s.coins).toBe(0);
    expect(s.settings.sendRatio).toBe(1);
  });
});
