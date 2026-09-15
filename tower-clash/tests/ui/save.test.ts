import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, defaultSave, isLevelUnlocked, normalizeSave, recordWin, starsFor } from '../../src/ui/save';

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
    expect(save.gold).toBe(20);
    expect(recordWin(save, 1, 2, 10)).toBe(0);
    expect(recordWin(save, 1, 1, 10)).toBe(0); // worse run keeps the best stars
    expect(save.stars['1']).toBe(2);
    expect(recordWin(save, 1, 3, 10)).toBe(10); // one extra star
    expect(save.gold).toBe(30);
  });

  it('starsFor uses the level thresholds', () => {
    const level = { star3: 45_000, star2: 90_000 };
    expect(starsFor(level, 45_000)).toBe(3);
    expect(starsFor(level, 45_001)).toBe(2);
    expect(starsFor(level, 90_001)).toBe(1);
  });

  it('normalizeSave clamps hostile input', () => {
    const s = normalizeSave({ stars: { '1': 9, '2': -1, '3': 'x' }, coins: -5, settings: { sendRatio: 0.3, sound: 'yes' } });
    expect(s.stars).toEqual({ '1': 3, '2': 0 });
    expect(s.gold).toBe(0);
    expect(s.settings.sound).toBe(true);
    // rules v2 dropped the send ratio: an old field is tolerated and simply not carried over
    expect('sendRatio' in s.settings).toBe(false);
  });
});

describe('save schema v3 (M3-3 + economy Phase A)', () => {
  function memStore(initial: Record<string, string> = {}) {
    const m = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      dump: () => Object.fromEntries(m),
    };
  }

  it('defaults carry the version and reducedMotion=auto', () => {
    const s = defaultSave();
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.settings.reducedMotion).toBe('auto');
  });

  it('reads a v1 save, keeps stars/coins/settings and writes the v3 copy', async () => {
    const { loadSaveFrom, SAVE_KEY, SAVE_KEY_V1 } = await import('../../src/ui/save');
    const v1 = { stars: { '1': 3, '2': 1 }, coins: 40, settings: { sendRatio: 0.5, colorBlind: true, sound: false } };
    const store = memStore({ [SAVE_KEY_V1]: JSON.stringify(v1) });
    const s = loadSaveFrom(store);
    expect(s.version).toBe(3);
    expect(s.stars).toEqual({ '1': 3, '2': 1 });
    expect(s.gold).toBe(40);
    expect(s.crystals).toBe(0);
    expect(s.settings).toEqual({ colorBlind: true, sound: false, reducedMotion: 'auto' }); // v1 sendRatio dropped (rules v2)
    const written = JSON.parse(store.dump()[SAVE_KEY]!) as { version: number; gold: number };
    expect(written.version).toBe(3);
    expect(written.gold).toBe(40);
    expect(store.dump()[SAVE_KEY_V1]).toBe(JSON.stringify(v1)); // the v1 entry is left in place
  });

  it('prefers the v3 entry, then v2 (coins → gold), and survives corrupt JSON', async () => {
    const { loadSaveFrom, SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2 } = await import('../../src/ui/save');
    const store = memStore({
      [SAVE_KEY_V1]: JSON.stringify({ coins: 5 }),
      [SAVE_KEY_V2]: JSON.stringify({ version: 2, coins: 50 }),
      [SAVE_KEY]: JSON.stringify({ version: 3, gold: 99, settings: { reducedMotion: 'on' } }),
    });
    const s = loadSaveFrom(store);
    expect(s.gold).toBe(99);
    expect(s.settings.reducedMotion).toBe('on');
    const v2only = memStore({ [SAVE_KEY_V1]: JSON.stringify({ coins: 5 }), [SAVE_KEY_V2]: JSON.stringify({ version: 2, coins: 50 }) });
    expect(loadSaveFrom(v2only).gold).toBe(50);
    expect(loadSaveFrom(memStore({ [SAVE_KEY]: '{not json' })).gold).toBe(0);
    expect(loadSaveFrom(null).version).toBe(3);
  });

  it('normalizeSave rejects an unknown reducedMotion value', () => {
    expect(normalizeSave({ settings: { reducedMotion: 'sometimes' } }).settings.reducedMotion).toBe('auto');
    expect(normalizeSave({ settings: { reducedMotion: 'off' } }).settings.reducedMotion).toBe('off');
  });

  it('spendCoins only deducts what is affordable', async () => {
    const { spendCoins } = await import('../../src/ui/save');
    const s = defaultSave();
    s.gold = 40;
    expect(spendCoins(s, 50)).toBe(false);
    expect(s.gold).toBe(40);
    expect(spendCoins(s, 40)).toBe(true);
    expect(s.gold).toBe(0);
    expect(spendCoins(s, -1)).toBe(false);
  });
});
