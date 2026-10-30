import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, loadSaveFrom, normalizeSave, setSaveStorageForTests } from '../../src/ui/save';
import { CRYSTAL_SERVICES, EARN_RULES, LEARNING_LEVEL_IDS } from '../../src/economy/catalog';
import { GRAND_CAMPAIGN_LEVEL, evaluateAchievements } from '../../src/economy/achievements';
import { LEVEL_META } from '../../src/levels/index';
import { LEARNING_SKIP_SLOT_BASE, bandOf, buyLevelSkip, maxSkipsPerCampaign, skipAvailable, skipSlotOf } from '../../src/economy/wallet';

/** Level skip (ECONOMY.md §3.4, AUD-B3 2026-10-30): one per band plus one on each learning level. */

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const COST = CRYSTAL_SERVICES.levelSkip.costCrystals;
const DEFEATS = CRYSTAL_SERVICES.levelSkip.offerAfterDefeats;

let store: ReturnType<typeof memStore>;
let save: SaveData;

beforeEach(() => {
  store = memStore();
  setSaveStorageForTests(store);
  save = defaultSave();
  save.crystals = 1000;
});

/** Three straight defeats on `id` (the offer's precondition), then try to buy the skip. */
function loseAndSkip(id: number): boolean {
  save.defeats[String(id)] = DEFEATS;
  return buyLevelSkip(save, id) !== null;
}

describe('level skip slots (AUD-B3)', () => {
  it('the learning levels are the GDD §3 list (23, 27, 32), distinct, real levels inside a band', () => {
    expect([...LEARNING_LEVEL_IDS]).toEqual([23, 27, 32]);
    expect(new Set(LEARNING_LEVEL_IDS).size).toBe(LEARNING_LEVEL_IDS.length);
    const ids = new Set(LEVEL_META.map((l) => l.id));
    for (const id of LEARNING_LEVEL_IDS) {
      expect(ids.has(id)).toBe(true);
      expect(bandOf(id)).toBeGreaterThanOrEqual(0);
    }
  });

  it('an ordinary level spends its band index, a learning level its own slot past the band indices', () => {
    expect(LEARNING_SKIP_SLOT_BASE).toBeGreaterThan(EARN_RULES.bands.length);
    expect([1, 8, 9, 22, 24, 25, 26, 31, 33, 50].map(skipSlotOf)).toEqual([0, 0, 1, 2, 2, 3, 3, 3, 4, 5]);
    expect([23, 27, 32].map(skipSlotOf)).toEqual([123, 127, 132]);
    expect([0, 51, -3].map(skipSlotOf)).toEqual([-1, -1, -1]);
  });
});

describe('level skip offer and purchase (ECONOMY.md §3.4)', () => {
  it('a skip on 27 and then one on 32 are both allowed, and band 25–32 keeps its ordinary skip', () => {
    expect(loseAndSkip(27)).toBe(true);
    expect(loseAndSkip(32)).toBe(true);
    expect(loseAndSkip(25)).toBe(true);
    expect(loseAndSkip(26)).toBe(false);
    expect(save.skips).toEqual([127, 132, 3]);
    expect(save.crystals).toBe(1000 - 3 * COST);
  });

  it('25 then 26: an ordinary level still gets one skip per band', () => {
    expect(loseAndSkip(25)).toBe(true);
    expect(skipAvailable(save, 26)).toBe(false);
    expect(loseAndSkip(26)).toBe(false);
    expect(save.stars['26']).toBeUndefined();
    expect(save.defeats['26']).toBe(DEFEATS);
    // the learning levels of the band are untouched by the band's skip
    expect(loseAndSkip(27)).toBe(true);
    expect(loseAndSkip(32)).toBe(true);
  });

  it('band counts 1 / 1 / 2 / 3 / 1 / 1: up to 9 skips per campaign (6 before AUD-B3)', () => {
    const perBand = EARN_RULES.bands.map(() => 0);
    for (const { id } of LEVEL_META) if (loseAndSkip(id)) perBand[bandOf(id)] = (perBand[bandOf(id)] ?? 0) + 1;
    expect(perBand).toEqual([1, 1, 2, 3, 1, 1]);
    expect(maxSkipsPerCampaign()).toBe(9);
    expect(save.skips.length).toBe(maxSkipsPerCampaign());
    expect(save.crystals).toBe(1000 - 9 * COST);
  });

  it('a save from before 2026-10-30 (a skip of 27 recorded as band index 3) can still skip 32, not 26', () => {
    save = normalizeSave({ ...defaultSave(), crystals: 100, stars: { '27': 1 }, skips: [3] });
    expect(loseAndSkip(26)).toBe(false);
    expect(loseAndSkip(32)).toBe(true);
    expect(save.skips).toEqual([3, 132]);
  });

  it('is offered only after 3 straight defeats on an uncleared level; unaffordable changes nothing', () => {
    save.defeats['27'] = DEFEATS - 1;
    expect(skipAvailable(save, 27)).toBe(false);
    save.defeats['27'] = DEFEATS;
    expect(skipAvailable(save, 27)).toBe(true);
    save.stars['27'] = 1;
    expect(skipAvailable(save, 27)).toBe(false);
    delete save.stars['27'];
    save.crystals = COST - 1;
    expect(buyLevelSkip(save, 27)).toBeNull();
    expect(save).toMatchObject({ crystals: COST - 1, skips: [], defeats: { '27': DEFEATS } });
    expect(save.stars['27']).toBeUndefined();
  });

  it('grants 1★ and no gold, clears the streak, counts toward "levels cleared" but not toward a full-3★ band', () => {
    save.stars['1'] = 1;
    save.stars['2'] = 1;
    for (let id = 9; id <= 15; id++) save.stars[String(id)] = 3; // 9 cleared; band 9–16 at 3★ but for 16
    save.defeats['16'] = DEFEATS;
    expect(buyLevelSkip(save, 16)).toEqual({ crystals: 20, notes: ['10 levels cleared'] });
    expect(save.stars['16']).toBe(CRYSTAL_SERVICES.levelSkip.starsGranted);
    expect(save.gold).toBe(0);
    expect(save.defeats['16']).toBeUndefined();
    expect(save.milestones).toEqual(['levels_10']); // no band_1: a skip is 1★, never 3★
    expect(save.crystals).toBe(1000 - COST + 20);
  });

  it('a skip of level 50 still does not pay grand_campaign', () => {
    for (let id = 1; id < GRAND_CAMPAIGN_LEVEL; id++) save.stars[String(id)] = 1;
    expect(loseAndSkip(GRAND_CAMPAIGN_LEVEL)).toBe(true);
    expect(evaluateAchievements(save).unlocked.map((a) => a.id)).not.toContain('grand_campaign');
  });

  it('the learning-level slots survive a save round trip', () => {
    loseAndSkip(23);
    loseAndSkip(22);
    const reloaded = loadSaveFrom(store);
    expect(reloaded.skips).toEqual([123, 2]);
    save = reloaded;
    save.crystals = 100;
    expect(loseAndSkip(23)).toBe(false); // cleared
    expect(loseAndSkip(24)).toBe(false); // band 17–24's ordinary skip is spent
  });
});
