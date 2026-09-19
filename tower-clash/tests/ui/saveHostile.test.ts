import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, defaultSave, loadSaveFrom, normalizeSave } from '../../src/ui/save';
import { equippedSkin } from '../../src/economy/entitlements';
import { themeFor } from '../../src/render/palette';
import { earnGold, spendCrystals, spendGold } from '../../src/economy/wallet';
import { recordChallengeResult, shownStreak } from '../../src/ui/daily';
import { TWISTS } from '../../src/daily/challenge';
import { challengeFor } from '../../src/daily/challenge';
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
  ['unknown future version with huge numbers', { version: 99, gold: Number.MAX_SAFE_INTEGER * 4, crystals: 2 ** 53, stars: { '40': 3 }, challenge: { streak: 1e300, milestones: [1e300] } }],
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
