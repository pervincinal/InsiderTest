import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, SAVE_VERSION, defaultSave, loadSaveFrom, normalizeSave } from '../../src/ui/save';

/*
 * Save upgrade test (QA-10, POST_LAUNCH.md §6.1): a 1.0.0 (build 7) save opens in the next build
 * unchanged, and a v2 / v1 save migrates as save.ts documents.
 *
 * `saveFixtures/v3-build7-full.json` is exactly what build 7 wrote to `towerclash.save.v3` for a
 * player who cleared all 50 levels (mixed stars on 41–50, level 30 skipped), has an active login
 * streak, a Daily Challenge streak of 8 with the day-3 and day-7 milestones paid, two weekly bests
 * (this week's 3★ target reached), a starter pack + remove-ads purchase, three skins, two commander
 * tracks, a booster crate, two rewarded videos today, language az and reduced motion on. It was
 * produced by driving the public API (recordResult, evaluateAchievements, claimDaily,
 * recordChallengeResult, recordWeeklyResult, grantProduct, buyUpgrade, buyBoosterCrate, showRewarded)
 * and freezing `JSON.stringify(save)`; the fixture is the contract, the generator is not kept.
 *
 * If a test here fails after a change to src/ui/save.ts you have changed the schema. Either the
 * change is additive with a default (`normalizeSave` fills it) — then add the field to the fixture
 * with the value build 7 would have had, i.e. the default, and to KNOWN_KEYS — or it is not, and
 * SAVE_VERSION must be bumped with a migration and a new fixture for the old version.
 */

const FIXTURES = new URL('./saveFixtures/', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, FIXTURES), 'utf8');
const parse = (name: string) => JSON.parse(read(name)) as Record<string, unknown>;

/**
 * Every top-level key of SaveData as of build 7 (schema v3). Adding a key to SaveData fails the
 * guard below on purpose: add a line to `saveFixtures/v3-build7-full.json` (the value build 7 would
 * have had — the default), add the key here and check `normalizeSave` fills it when missing.
 */
const KNOWN_KEYS = [
  'version',
  'stars',
  'gold',
  'crystals',
  'entitlements',
  'upgrades',
  'skins',
  'charges',
  'daily',
  'challenge',
  'weekly',
  'adCounters',
  'purchases',
  'milestones',
  'replayGold',
  'defeats',
  'skips',
  'achievements',
  'reviewAsked', // MM-9 (2026-10-07): build 7 never asked → false
  'settings',
] as const;

const KEY_MESSAGE =
  'SaveData gained or lost a top-level key. A new field must (1) get a line in tests/ui/saveFixtures/v3-build7-full.json ' +
  'with the value build 7 would have had (its default), (2) be listed in KNOWN_KEYS in tests/ui/saveUpgrade.test.ts and ' +
  '(3) be filled by normalizeSave when missing — or SAVE_VERSION must be bumped with a migration.';

function memStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  const writes: string[] = [];
  const removes: string[] = [];
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push(k);
      m.set(k, v);
    },
    removeItem: (k: string) => {
      removes.push(k);
      m.delete(k);
    },
    dump: () => Object.fromEntries(m),
    writes,
    removes,
  };
}

describe('schema guard (v3, build 7)', () => {
  it('SAVE_VERSION is still 3 — a bump needs a migration and a new fixture for v3', () => {
    expect(SAVE_VERSION, 'SAVE_VERSION changed: add tests/ui/saveFixtures/v3-*.json coverage for the migration from v3 and a fixture for the new version').toBe(3);
  });

  it('every top-level key of a fresh save is a known key', () => {
    expect([...Object.keys(defaultSave())].sort(), KEY_MESSAGE).toEqual([...KNOWN_KEYS].sort());
  });

  it('every top-level key of the build-7 fixture is a known key, in the order defaultSave writes them', () => {
    const fixture = parse('v3-build7-full.json');
    expect(Object.keys(fixture), KEY_MESSAGE).toEqual([...KNOWN_KEYS]);
    expect(Object.keys(defaultSave()), 'defaultSave key order changed: the byte-stability test below depends on it').toEqual([...KNOWN_KEYS]);
  });
});

describe('a build-7 (1.0.0) save opens unchanged', () => {
  const text = read('v3-build7-full.json');
  const fixture = JSON.parse(text) as SaveData;

  it('the fixture carries the scenario the item asks for', () => {
    expect(fixture.version).toBe(3);
    for (let id = 41; id <= 50; id++) expect(fixture.stars[String(id)], `stars on level ${id}`).toBeGreaterThanOrEqual(1);
    expect(Object.keys(fixture.stars).length).toBe(50);
    expect(fixture.daily.lastClaimDay).toBe('2026-09-27');
    expect(fixture.daily.streak).toBe(5);
    expect(fixture.challenge.streak).toBe(8);
    expect(fixture.challenge.milestones).toEqual([3, 7]);
    expect(Object.keys(fixture.challenge.best).length).toBe(8);
    expect(fixture.weekly.streak).toBe(2);
    expect(fixture.weekly.best['2026-09-21']).toEqual({ stars: 3, timeMs: 35_000, target: true });
    expect(fixture.weekly.best['2026-09-14']!.target).toBe(false);
    expect(fixture.entitlements).toEqual({ noAds: true, premium: false, starterPack: true });
    expect(fixture.purchases).toEqual(['fake-txn-000001', 'owned:starter_pack', 'fake-txn-000002', 'owned:remove_ads']);
    expect(fixture.skins.owned).toEqual(['helmet_bronze', 'roof_slate', 'theme_dusk']);
    expect(fixture.skins.equipped).toEqual({ roof: 'roof_slate', helmet: 'helmet_bronze', theme: 'theme_dusk' });
    expect(fixture.upgrades).toEqual({ production: 2, garrison: 1 });
    expect(fixture.charges).toEqual({ overdrive: 5, freeze: 3, airstrike: 2 });
    expect(fixture.milestones).toContain('levels_50');
    expect(fixture.milestones).toContain('band_0');
    expect(fixture.skips).toEqual([3]);
    expect(fixture.defeats).toEqual({ '47': 1 });
    expect(fixture.replayGold).toEqual({ day: '2026-09-27', earned: 9 });
    expect(fixture.adCounters).toEqual({ day: '2026-09-27', rewardedByPlacement: { rv_double_gold: 1, rv_daily_chest: 1 }, levelsCompleted: 54 });
    expect(fixture.achievements.unlocked).toContain('grand_campaign');
    expect(fixture.settings).toEqual({ colorBlind: true, sound: false, reducedMotion: 'on', language: 'az' });
  });

  it('normalizeSave returns the fixture deep-equal: no field lost, added or changed', () => {
    const normalized = normalizeSave(JSON.parse(text));
    expect(normalized, KEY_MESSAGE).toStrictEqual(fixture);
  });

  it('normalizeSave → JSON.stringify reproduces the stored bytes (nothing reordered, nothing reformatted)', () => {
    const compact = JSON.stringify(JSON.parse(text)); // what localStorage holds (writeSave uses the compact form)
    expect(JSON.stringify(normalizeSave(JSON.parse(compact)))).toBe(compact);
  });

  it('loadSave from a storage holding it returns the same data and does not touch the storage', () => {
    const compact = JSON.stringify(JSON.parse(text));
    const store = memStore({ [SAVE_KEY]: compact });
    const loaded = loadSaveFrom(store);
    expect(loaded).toStrictEqual(fixture);
    expect(store.writes).toEqual([]);
    expect(store.removes).toEqual([]);
    expect(store.dump()).toEqual({ [SAVE_KEY]: compact });
  });

  it('a v3 entry wins over leftover v2 / v1 entries and nothing is written', () => {
    const compact = JSON.stringify(JSON.parse(text));
    const store = memStore({ [SAVE_KEY]: compact, [SAVE_KEY_V2]: read('v2-legacy.json'), [SAVE_KEY_V1]: read('v1-legacy.json') });
    expect(loadSaveFrom(store)).toStrictEqual(fixture);
    expect(store.writes).toEqual([]);
    expect(store.removes).toEqual([]);
  });
});

describe('v2 → v3 migration (coins → gold, sendRatio dropped, economy defaults)', () => {
  const v2text = read('v2-legacy.json');
  const v2 = parse('v2-legacy.json');

  /** The v3 the documented mappings produce from the v2 fixture. */
  function expectedFromV2(): SaveData {
    const out = defaultSave();
    out.stars = v2.stars as Record<string, number>;
    out.gold = v2.coins as number;
    out.settings = { colorBlind: false, sound: true, reducedMotion: 'off' };
    return out;
  }

  it('normalizeSave maps the documented fields and fills everything else with defaults', () => {
    const s = normalizeSave(v2);
    expect(s).toStrictEqual(expectedFromV2());
    expect(s.version).toBe(3);
    expect(s.gold).toBe(230);
    expect('coins' in s).toBe(false);
    expect('sendRatio' in s.settings).toBe(false);
    expect('language' in s.settings).toBe(false); // absent until the first run detects it
    expect(s.crystals).toBe(0);
    expect(s.challenge).toEqual({ lastWinDay: null, streak: 0, best: {}, milestones: [] });
    expect(s.weekly).toEqual({ lastWinWeek: null, streak: 0, best: {} });
    expect(s.achievements).toEqual({ unlocked: [] });
  });

  it('loadSave writes the v3 copy once and leaves the v2 entry byte-identical', () => {
    const store = memStore({ [SAVE_KEY_V2]: v2text });
    const s = loadSaveFrom(store);
    expect(s).toStrictEqual(expectedFromV2());
    expect(store.writes).toEqual([SAVE_KEY]);
    expect(store.removes).toEqual([]);
    expect(store.dump()[SAVE_KEY]).toBe(JSON.stringify(expectedFromV2()));
    expect(store.dump()[SAVE_KEY_V2]).toBe(v2text); // a downgrade still finds it
    expect(SAVE_KEY_V1 in store.dump()).toBe(false);
    // the next launch reads the v3 entry and writes nothing
    const again = loadSaveFrom(store);
    expect(again).toStrictEqual(s);
    expect(store.writes).toEqual([SAVE_KEY]);
  });

  it('a v2 entry takes precedence over a v1 entry', () => {
    const store = memStore({ [SAVE_KEY_V2]: v2text, [SAVE_KEY_V1]: read('v1-legacy.json') });
    expect(loadSaveFrom(store).gold).toBe(230);
    expect(store.dump()[SAVE_KEY_V1]).toBe(read('v1-legacy.json'));
  });
});

describe('v1 → v3 migration (no version, no reducedMotion, coins → gold)', () => {
  const v1text = read('v1-legacy.json');
  const v1 = parse('v1-legacy.json');

  function expectedFromV1(): SaveData {
    const out = defaultSave();
    out.stars = v1.stars as Record<string, number>;
    out.gold = v1.coins as number;
    out.settings = { colorBlind: true, sound: false, reducedMotion: 'auto' };
    return out;
  }

  it('normalizeSave maps the documented fields and fills everything else with defaults', () => {
    const s = normalizeSave(v1);
    expect(s).toStrictEqual(expectedFromV1());
    expect(s.version).toBe(3);
    expect(s.gold).toBe(60);
    expect(s.settings.reducedMotion).toBe('auto');
    expect('sendRatio' in s.settings).toBe(false);
  });

  it('loadSave writes the v3 copy once and leaves the v1 entry byte-identical', () => {
    const store = memStore({ [SAVE_KEY_V1]: v1text });
    const s = loadSaveFrom(store);
    expect(s).toStrictEqual(expectedFromV1());
    expect(store.writes).toEqual([SAVE_KEY]);
    expect(store.removes).toEqual([]);
    expect(store.dump()[SAVE_KEY]).toBe(JSON.stringify(expectedFromV1()));
    expect(store.dump()[SAVE_KEY_V1]).toBe(v1text);
    expect(SAVE_KEY_V2 in store.dump()).toBe(false);
  });
});
