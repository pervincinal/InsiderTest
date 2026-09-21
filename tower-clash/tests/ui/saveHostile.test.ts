import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, defaultSave, loadSaveFrom, normalizeSave } from '../../src/ui/save';
import { equippedSkin } from '../../src/economy/entitlements';
import { themeFor } from '../../src/render/palette';
import { earnGold, spendCrystals, spendGold } from '../../src/economy/wallet';
import { challengeDone, recordChallengeResult, shownStreak } from '../../src/ui/daily';
import { recordWeeklyResult, shownWeekStreak, weeklyDone, weeklyTargetDone } from '../../src/ui/weekly';
import type { WeeklyChallenge } from '../../src/daily/challenge';
import { TWISTS, WEEKLY_REWARD, dayNumberOf, isMondayKey } from '../../src/daily/challenge';
import { challengeFor, weeklyFor } from '../../src/daily/challenge';
import { setSaveStorageForTests } from '../../src/ui/save';

/*
 * Save normalisation against hostile / stale input (QA review of the week's schema additions:
 * challenge, milestones, skins). Whatever localStorage holds — v1, v2, v3, garbage — the game must
 * boot with a well-formed v3 save: no throw, no NaN / Infinity / negative number anywhere, no
 * negative wallet, and a JSON round trip must be a fixed point (what we write is what we read).
 */

/** Every number reachable from `v` must be a finite, non-negative value. */
function assertSaneNumbers(v: unknown, path = 'save'): void {
  if (typeof v === 'number') {
    expect(Number.isFinite(v), `${path} is ${v}`).toBe(true);
    expect(v, `${path} is negative`).toBeGreaterThanOrEqual(0);
  } else if (Array.isArray(v)) v.forEach((x, i) => assertSaneNumbers(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) assertSaneNumbers(x, `${path}.${k}`);
}

function roundTrip(s: SaveData): SaveData {
  return normalizeSave(JSON.parse(JSON.stringify(s)));
}

const HOSTILE_INPUTS: [string, unknown][] = [
  ['null', null],
  ['a string', 'towerclash'],
  ['a number', 42],
  ['an array', [1, 2, 3]],
  ['v1 with garbage types', { stars: [3, 3], coins: '100', settings: null }],
  ['v2 with NaN / Infinity / negatives', { version: 2, stars: { '1': NaN, '2': Infinity, '3': -Infinity, '4': -1 }, coins: NaN, crystals: -Infinity }],
  [
    'v3 with every block wrong',
    {
      version: 3,
      stars: { '1': '3', '2': { deep: true } },
      gold: -5e15,
      crystals: 1e400,
      entitlements: { noAds: 'yes', premium: 1, starterPack: null },
      upgrades: { production: 99, capacity: -2, bogus: 'x' },
      skins: { owned: [1, null, 'roof_slate', 'roof_slate'], equipped: { roof: 'roof_gold', helmet: 'roof_slate', theme: 'theme_neon' } },
      charges: { overdrive: -1, freeze: 'two', airstrike: 2.9 },
      daily: { lastClaimDay: '2026-9-1', streak: 400 },
      challenge: { lastWinDay: 20260918, streak: -3, best: 'none', milestones: 'all' },
      weekly: { lastWinWeek: '2026-09-22', streak: -3, best: { '2026-09-21': { stars: 9, timeMs: -1, target: 'true' }, '2026-09-22': { stars: 3, timeMs: 1, target: true }, '2026-02-30': { stars: 3, timeMs: 1, target: true } } },
      adCounters: { day: null, rewardedByPlacement: [5], levelsCompleted: -9 },
      purchases: 'remove_ads',
      milestones: [1, 2],
      replayGold: { day: 3, earned: -20 },
      defeats: { '7': -1, '8': NaN },
      skips: ['0', 1.5, -1],
      achievements: { unlocked: [{}] },
      settings: { colorBlind: 'no', sound: 0, reducedMotion: 'always', language: 'xx' },
    },
  ],
  ['prototype pollution keys', JSON.parse('{"stars":{"__proto__":{"polluted":1},"constructor":3},"upgrades":{"__proto__":{"x":1}},"defeats":{"__proto__":9},"__proto__":{"gold":9}}')],
  ['unknown future version with huge numbers', { version: 99, gold: Number.MAX_SAFE_INTEGER * 4, crystals: 2 ** 53, stars: { '40': 3 }, challenge: { streak: 1e300, milestones: [1e300] }, weekly: { streak: 1e300, lastWinWeek: '9999-12-27' } }],
  ['weekly / challenge blocks as arrays and swapped shapes', { weekly: [{ lastWinWeek: '2026-09-21' }], challenge: { lastWinWeek: '2026-09-21', best: [{ stars: 3 }] } }],
];

describe('normalizeSave under hostile input', () => {
  for (const [label, raw] of HOSTILE_INPUTS) {
    it(`${label}: no throw, sane numbers, JSON round trip is a fixed point`, () => {
      const s = normalizeSave(raw);
      assertSaneNumbers(s);
      expect(s.version).toBe(3);
      expect(s.gold).toBeGreaterThanOrEqual(0);
      expect(s.crystals).toBeGreaterThanOrEqual(0);
      expect(roundTrip(s)).toEqual(s);
      // the pollution attempts changed nothing on Object.prototype
      expect(({} as { polluted?: number }).polluted).toBeUndefined();
      expect(({} as { gold?: number }).gold).toBeUndefined();
      // stars stay 0..3, upgrades 0..5, login streak ≤ 7
      for (const n of Object.values(s.stars)) expect(n).toBeLessThanOrEqual(3);
      for (const n of Object.values(s.upgrades)) expect(n).toBeLessThanOrEqual(5);
      expect(s.daily.streak).toBeLessThanOrEqual(7);
      // weekly (WEEKLY-1): Monday keys only, `target` a strict boolean, at most 12 weeks kept
      if (s.weekly.lastWinWeek !== null) expect(isMondayKey(s.weekly.lastWinWeek)).toBe(true);
      expect(Object.keys(s.weekly.best).length).toBeLessThanOrEqual(12);
      for (const [k, b] of Object.entries(s.weekly.best)) {
        expect(isMondayKey(k), k).toBe(true);
        expect(typeof b.target).toBe('boolean');
        expect(b.stars).toBeLessThanOrEqual(3);
      }
    });
  }

  it('an equipped skin must be owned; an unknown owned id renders as the default look and default theme', () => {
    const s = normalizeSave({ skins: { owned: ['roof_slate', 'theme_bogus', 'tower_nope'], equipped: { roof: 'roof_gold', helmet: 'unit_robots', theme: 'theme_bogus' } } });
    expect(s.skins.equipped).toEqual({ roof: null, helmet: null, theme: 'theme_bogus' }); // owned, so it stays equipped…
    const skin = equippedSkin(s);
    expect(skin.roof).toBeUndefined();
    expect(skin.helmet).toBeUndefined();
    // …and the renderer must not choke on the unknown theme id
    expect(themeFor(skin.theme).id).toBe('theme.default');
    s.skins.equipped.roof = 'tower_nope';
    expect(equippedSkin(s).roof).toBe('tower.nope'); // an unknown silhouette id → sprites draw the default building (tests/render/skins.test.ts)
  });

  it('wallet: hostile balances clamp to 0 and can never go negative through spend / earn', () => {
    setSaveStorageForTests(null);
    const s = normalizeSave({ gold: -100, crystals: -1 });
    expect([s.gold, s.crystals]).toEqual([0, 0]);
    expect(spendGold(s, 1)).toBe(false);
    expect(spendCrystals(s, 1)).toBe(false);
    expect(spendGold(s, NaN)).toBe(false);
    expect(spendGold(s, -5)).toBe(false);
    expect(earnGold(s, NaN)).toBe(0);
    expect(earnGold(s, -50)).toBe(0);
    expect(earnGold(s, 2.7)).toBe(2);
    expect([s.gold, s.crystals]).toEqual([2, 0]);
  });

  it('a hostile challenge block cannot break the streak arithmetic or the first-win payout', () => {
    setSaveStorageForTests(null);
    const s = normalizeSave({ challenge: { lastWinDay: '9999-99-99', streak: 1e300, milestones: [3, 7, 30, 1e300] } });
    expect(s.challenge.lastWinDay).toBe('9999-99-99'); // matches the shape; the rules below must still be sane
    expect(shownStreak(s, '2026-09-19')).toBe(0); // neither today nor yesterday → broken
    const level = { star3: 30_000, star2: 60_000 };
    const out = recordChallengeResult(s, { dayKey: '2026-09-19', levelId: 9, seed: 1, twist: TWISTS[0]! }, level, 'won', 10_000);
    expect(out.firstWin).toBe(true);
    expect(out.streak).toBe(1);
    expect(s.challenge.milestones).toEqual([]); // a new run forgets the (bogus) paid list
    expect(out.gold).toBe(60);
    expect(out.crystals).toBe(5);
    assertSaneNumbers(s);
    expect(roundTrip(s)).toEqual(s);
  });

  it('loadSaveFrom: corrupt v3 JSON, then a hostile v2, then a hostile v1 — always a playable default', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    mem.set(SAVE_KEY, '{"version":3,"gold":');
    expect(loadSaveFrom(store)).toEqual(defaultSave());
    mem.delete(SAVE_KEY);
    mem.set(SAVE_KEY_V2, JSON.stringify({ version: 2, coins: -7, stars: { '1': 5 } }));
    let s = loadSaveFrom(store);
    expect([s.gold, s.stars['1']]).toEqual([0, 3]);
    expect(JSON.parse(mem.get(SAVE_KEY)!)).toEqual(s); // migrated copy written under v3
    mem.delete(SAVE_KEY);
    mem.delete(SAVE_KEY_V2);
    mem.set(SAVE_KEY_V1, '[]');
    s = loadSaveFrom(store);
    expect(s).toEqual({ ...defaultSave(), version: 3 });
    // a store that throws on every access (Safari private mode) is the same as no store
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => undefined };
    expect(loadSaveFrom(broken)).toEqual(defaultSave());
  });

  it('challengeFor is total over well-formed keys the save could carry (no throw for any YYYY-MM-DD string)', () => {
    for (const key of ['0000-00-00', '9999-99-99', '2026-02-30', '2026-13-01']) expect(() => challengeFor(key)).not.toThrow();
  });
});

/* ---------- WEEKLY-1: save.weekly against hostile / stale input and its interplay with `challenge` (QA 2026-09-21) ---------- */

function addDays(dayKey: string, n: number): string {
  return new Date(Date.UTC(Number(dayKey.slice(0, 4)), Number(dayKey.slice(5, 7)) - 1, Number(dayKey.slice(8, 10))) + n * 86_400_000).toISOString().slice(0, 10);
}

describe('save.weekly normalisation (hostile input, interplay with the daily challenge block)', () => {
  const MON = '2026-09-21';
  const PREV = '2026-09-14';
  const level = { star3: 30_000, star2: 60_000 };
  const weeklyOf = (over: Partial<WeeklyChallenge> = {}): WeeklyChallenge => ({ ...weeklyFor(MON), targetMs: 30_000, ...over });

  it('Monday-key check: only real calendar Mondays survive (a rolled-over date like 2026-02-30 is not a key)', () => {
    expect(isMondayKey('2026-02-30')).toBe(false); // V8 parses it as Monday 2026-03-02
    expect(isMondayKey('2026-03-02')).toBe(true);
    expect(isMondayKey('2026-02-29')).toBe(false); // → Sunday 2026-03-01
    expect(isMondayKey('9999-99-99')).toBe(false);
    expect(isMondayKey('2026-13-01')).toBe(false);
    expect(isMondayKey('0001-01-01')).toBe(true); // proleptic Gregorian, a Monday
    expect(() => weeklyFor('2026-02-30')).toThrow();
    const s = normalizeSave({ weekly: { lastWinWeek: '2026-02-30', streak: 2, best: { '2026-02-30': { stars: 3, timeMs: 1, target: true }, '2026-03-02': { stars: 1, timeMs: 2, target: true }, '2026-09-22': { stars: 3, timeMs: 1, target: true } } } });
    expect(s.weekly).toEqual({ lastWinWeek: null, streak: 2, best: { '2026-03-02': { stars: 1, timeMs: 2, target: true } } });
    // the daily keeps shape-valid keys (its picker is total over them, see above): the two ledgers validate independently
    const d = normalizeSave({ challenge: { lastWinDay: '2026-02-30', best: { '2026-02-30': { stars: 3, timeMs: 1 } } } });
    expect(d.challenge.lastWinDay).toBe('2026-02-30');
    expect(Object.keys(d.challenge.best)).toEqual(['2026-02-30']);
    expect(d.weekly).toEqual(defaultSave().weekly);
  });

  it('`target` is a strict boolean, best is pruned to the newest 12 Mondays, the streak is a non-negative integer (not clamped)', () => {
    const best: Record<string, unknown> = {};
    for (let w = 0; w < 30; w++) best[addDays('2026-01-05', 7 * w)] = { stars: 1, timeMs: w, target: [true, 1, 'true', {}, null][w % 5] };
    const s = normalizeSave({ weekly: { lastWinWeek: MON, streak: '7', best } });
    const keys = Object.keys(s.weekly.best).sort();
    expect(keys.length).toBe(12);
    expect(keys[0]).toBe(addDays('2026-01-05', 7 * 18));
    expect(keys[11]).toBe(addDays('2026-01-05', 7 * 29));
    for (const k of keys) {
      const w = (dayNumberOf(k) - dayNumberOf('2026-01-05')) / 7;
      expect(s.weekly.best[k]).toEqual({ stars: 1, timeMs: w, target: w % 5 === 0 });
    }
    expect(s.weekly.streak).toBe(0); // '7' is not a number
    for (const [raw, want] of [[2.9, 2], [-3, 0], [NaN, 0], [Infinity, 0], [1e300, 1e300], [null, 0]] as const) expect(normalizeSave({ weekly: { streak: raw } }).weekly.streak).toBe(want);
    assertSaneNumbers(s);
    expect(roundTrip(s)).toEqual(s);
  });

  it('an absurd streak cannot break the arithmetic: shown capped at 99, a first win still pays once, the round trip is a fixed point', () => {
    setSaveStorageForTests(null);
    const s = normalizeSave({ weekly: { lastWinWeek: PREV, streak: 1e300, best: {} }, challenge: { lastWinDay: '2026-09-20', streak: 2 ** 53, best: {}, milestones: [] } });
    expect(shownWeekStreak(s, MON)).toBe(99);
    expect(shownStreak(s, MON)).toBe(99);
    const out = recordWeeklyResult(s, weeklyOf(), level, 'won', 45_000);
    expect(out).toMatchObject({ firstWin: true, gold: WEEKLY_REWARD.gold, targetHit: false, crystals: 0, streak: 99 });
    expect(s.weekly.streak).toBe(1e300); // + 1 is absorbed at this magnitude; still finite and non-negative
    expect(s.challenge.streak).toBe(2 ** 53); // untouched by the weekly
    expect(recordWeeklyResult(s, weeklyOf(), level, 'won', 45_000).gold).toBe(0);
    assertSaneNumbers(s);
    expect(roundTrip(s)).toEqual(s);
  });

  it('interplay with the daily block: a pre-WEEKLY-1 save, a weekly block in the daily shape, or the daily best map copied into weekly', () => {
    // an old save (before WEEKLY-1) has no `weekly`: defaults, while the daily progress is kept as is
    const old = normalizeSave({ version: 3, challenge: { lastWinDay: MON, streak: 4, best: { [MON]: { stars: 2, timeMs: 40_000 } }, milestones: [3] } });
    expect(old.weekly).toEqual({ lastWinWeek: null, streak: 0, best: {} });
    expect(old.challenge).toEqual({ lastWinDay: MON, streak: 4, best: { [MON]: { stars: 2, timeMs: 40_000 } }, milestones: [3] });
    expect(weeklyDone(old, MON)).toBe(false);
    expect(challengeDone(old, MON)).toBe(true);
    // the daily's field names inside the weekly block are ignored (no cross-reading of `lastWinDay` / `milestones`)
    const swapped = normalizeSave({ weekly: { lastWinDay: MON, streak: 4, best: { [MON]: { stars: 2, timeMs: 40_000 } }, milestones: [3] } });
    expect(swapped.weekly).toEqual({ lastWinWeek: null, streak: 4, best: { [MON]: { stars: 2, timeMs: 40_000, target: false } } });
    expect(swapped.milestones).toEqual([]);
    expect(weeklyDone(swapped, MON)).toBe(true); // a shape-valid best for this Monday counts as done: the gold is never paid twice
    expect(weeklyTargetDone(swapped, MON)).toBe(false);
    expect(challengeDone(swapped, MON)).toBe(false);
    // a daily best map (14 day keys) copied into weekly keeps only its two Mondays
    const days: Record<string, unknown> = {};
    for (let d = 0; d < 14; d++) days[addDays(PREV, d)] = { stars: 3, timeMs: 1_000 };
    const copied = normalizeSave({ challenge: { best: days }, weekly: { best: days } });
    expect(Object.keys(copied.challenge.best).length).toBe(14);
    expect(Object.keys(copied.weekly.best).sort()).toEqual([PREV, MON]);
    assertSaneNumbers(copied);
    expect(roundTrip(copied)).toEqual(copied);
  });
});
