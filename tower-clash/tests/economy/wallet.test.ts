import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { SAVE_KEY, SAVE_KEY_V2, defaultSave, loadSaveFrom, setSaveStorageForTests } from '../../src/ui/save';
import {
  claimDaily,
  dailyStatus,
  dayKey,
  earnCrystals,
  earnGold,
  grantProduct,
  payMilestones,
  recordResult,
  restorePurchases,
  spendCrystals,
  spendGold,
} from '../../src/economy/wallet';
import { boosterDiscount, boosterPrice, equippedSkin, interstitialsDisabled, ownsProduct, visibleProducts } from '../../src/economy/entitlements';
import { buyUpgrade, commanderSummary, modifiersFromSave, upgradeCost, upgradeTier } from '../../src/ui/upgrades';
import { EARN_RULES, IAP_PRODUCTS } from '../../src/economy/catalog';
import type { StoreProvider } from '../../src/economy/store';
import { makeLevel } from '../helpers';

function memStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

let store: ReturnType<typeof memStore>;
let save: SaveData;

beforeEach(() => {
  store = memStore();
  setSaveStorageForTests(store);
  save = defaultSave();
});

const NOON = new Date(2026, 8, 13, 12, 0, 0).getTime(); // local 2026-09-13
const DAY = 86_400_000;

describe('balances', () => {
  it('earn adds, spend deducts, never negative, and every change persists', () => {
    expect(earnGold(save, 25)).toBe(25);
    expect(earnCrystals(save, 7)).toBe(7);
    expect(spendGold(save, 30)).toBe(false);
    expect(save.gold).toBe(25);
    expect(spendGold(save, 25)).toBe(true);
    expect(save.gold).toBe(0);
    expect(spendCrystals(save, -1)).toBe(false);
    expect(spendCrystals(save, 7)).toBe(true);
    expect(save.crystals).toBe(0);
    expect(earnGold(save, -50)).toBe(0);
    expect(earnGold(save, Number.NaN)).toBe(0);
    const written = JSON.parse(store.dump()[SAVE_KEY]!) as { gold: number; crystals: number; version: number };
    expect(written).toMatchObject({ gold: 0, crystals: 0, version: 3 });
  });
});

describe('grantProduct', () => {
  it('applies the catalog grants exactly once per transaction id', () => {
    const first = grantProduct(save, 'crystals_100', 'tx-1');
    expect(first).toMatchObject({ crystals: 100, gold: 0, noAds: false, premium: false });
    expect(save.crystals).toBe(100);
    expect(grantProduct(save, 'crystals_100', 'tx-1')).toBeNull(); // retry of the same transaction
    expect(save.crystals).toBe(100);
    expect(grantProduct(save, 'crystals_100', 'tx-2')).not.toBeNull();
    expect(save.crystals).toBe(200);
    expect(save.purchases).toEqual(['tx-1', 'tx-2']);
  });

  it('non-consumables set entitlements, grant skins and are never granted twice', () => {
    const g = grantProduct(save, 'premium_bundle', 'tx-p');
    expect(g).toMatchObject({ crystals: 600, noAds: true, premium: true, skins: ['roof_gold', 'helmet_royal'] });
    expect(save.entitlements).toEqual({ noAds: true, premium: true, starterPack: false });
    expect(ownsProduct(save, 'premium_bundle')).toBe(true);
    expect(interstitialsDisabled(save)).toBe(true);
    expect(grantProduct(save, 'premium_bundle', 'tx-p2')).toBeNull(); // a second transaction still does not double-grant
    expect(save.crystals).toBe(600);
    expect(grantProduct(save, 'premium_bundle')).toBeNull(); // restore without an id
    const starter = grantProduct(save, 'starter_pack', 'tx-s');
    expect(starter).toMatchObject({ crystals: 400, gold: 400, skins: ['helmet_bronze'] });
    expect(save.entitlements.starterPack).toBe(true);
    expect(grantProduct(save, 'nope', 'tx-x')).toBeNull();
  });

  it('visibleProducts keeps owned packs (shown as OWNED), swaps premium bundle for the upgrade, hides LiveOps', () => {
    const ids = () => visibleProducts(save).map((p) => p.id);
    expect(ids()).toEqual(['crystals_100', 'crystals_550', 'crystals_1200', 'crystals_2600', 'crystals_7000', 'starter_pack', 'remove_ads', 'premium_bundle']);
    grantProduct(save, 'remove_ads', 'tx-r');
    expect(ids()).toContain('premium_upgrade'); // nobody pays for no-ads twice
    expect(ids()).not.toContain('premium_bundle');
    expect(ids()).toContain('remove_ads'); // listed as OWNED
    grantProduct(save, 'premium_upgrade', 'tx-u');
    expect(ids()).toEqual(['crystals_100', 'crystals_550', 'crystals_1200', 'crystals_2600', 'crystals_7000', 'starter_pack', 'remove_ads', 'premium_upgrade']);
    expect(IAP_PRODUCTS.some((p) => p.availability === 'liveops')).toBe(true); // Phase C products are never listed
    expect(ids()).not.toContain('weekend_pack');
  });

  it('restorePurchases grants owned non-consumables idempotently and ignores consumables', async () => {
    const fake: StoreProvider = {
      init: async () => undefined,
      getProducts: async () => [],
      purchase: async (id) => ({ ok: false, productId: id, error: 'unavailable' }),
      restore: async () => ['remove_ads', 'crystals_100', 'remove_ads'],
      isAvailable: () => true,
    };
    expect(await restorePurchases(save, fake)).toEqual(['remove_ads']);
    expect(save.entitlements.noAds).toBe(true);
    expect(save.crystals).toBe(50); // remove_ads grants 50; the crystal pack is not restored
    expect(await restorePurchases(save, fake)).toEqual([]);
    expect(save.crystals).toBe(50);
  });
});

describe('earn rules on a result', () => {
  const level = makeLevel({ id: 3, star3: 30_000, star2: 60_000 });

  it('first clear pays 10 per star, an improvement pays the delta, a repeat pays replay gold', () => {
    expect(recordResult(save, level, 'won', 50_000, NOON)).toMatchObject({ stars: 2, gold: 20, crystals: 0 });
    expect(recordResult(save, level, 'won', 20_000, NOON)).toMatchObject({ stars: 3, gold: 10 });
    expect(recordResult(save, level, 'won', 20_000, NOON)).toMatchObject({ stars: 3, gold: 9, replayCapped: false });
    expect(save.gold).toBe(39);
    expect(save.stars['3']).toBe(3);
  });

  it('replay gold is capped at 100 per calendar day and resets the next day', () => {
    recordResult(save, level, 'won', 20_000, NOON);
    save.gold = 0;
    for (let i = 0; i < 12; i++) recordResult(save, level, 'won', 20_000, NOON); // 12 × 9 = 108 wanted
    expect(save.gold).toBe(EARN_RULES.replayGoldDailyCap);
    const capped = recordResult(save, level, 'won', 20_000, NOON);
    expect(capped).toMatchObject({ gold: 0, replayCapped: true });
    expect(recordResult(save, level, 'won', 20_000, NOON + DAY)).toMatchObject({ gold: 9, replayCapped: false });
  });

  it('a defeat counts the streak (for the skip offer) and a win clears it; both count completed levels', () => {
    expect(recordResult(save, level, 'lost', 90_000, NOON).gold).toBe(0);
    recordResult(save, level, 'lost', 90_000, NOON);
    expect(save.defeats['3']).toBe(2);
    expect(save.adCounters.levelsCompleted).toBe(2);
    recordResult(save, level, 'won', 90_000, NOON);
    expect(save.defeats['3']).toBeUndefined();
    expect(save.adCounters.levelsCompleted).toBe(3);
  });

  it('pays crystal milestones at 10/20/30/40 levels and 20 per full-3★ band, once', () => {
    for (let id = 1; id <= 9; id++) save.stars[String(id)] = 1;
    expect(payMilestones(save)).toEqual({ crystals: 0, notes: [] });
    save.stars['10'] = 1;
    expect(payMilestones(save)).toEqual({ crystals: 20, notes: ['10 levels cleared'] });
    expect(payMilestones(save)).toEqual({ crystals: 0, notes: [] });
    for (let id = 1; id <= 8; id++) save.stars[String(id)] = 3;
    expect(payMilestones(save)).toEqual({ crystals: 20, notes: ['Band 1 at 3★'] });
    for (let id = 11; id <= 40; id++) save.stars[String(id)] = 1;
    const rest = payMilestones(save);
    expect(rest.crystals).toBe(30 + 40 + 60);
    expect(save.crystals).toBe(20 + 20 + 130);
    const r = recordResult(save, makeLevel({ id: 9 }), 'won', 1000, NOON); // 9..16 now all 3★? no: 10..16 are 1★
    expect(r.crystals).toBe(0);
  });
});

describe('daily streak', () => {
  it('claims day 1, then 2 the next day, resets after a missed day and loops after day 7', () => {
    expect(dailyStatus(save, NOON)).toMatchObject({ claimed: false, day: 1, gold: 20, crystals: 0 });
    expect(claimDaily(save, NOON)).toMatchObject({ day: 1, gold: 20 });
    expect(claimDaily(save, NOON)).toBeNull();
    expect(dailyStatus(save, NOON).claimed).toBe(true);
    expect(save.gold).toBe(20);
    expect(claimDaily(save, NOON + DAY)).toMatchObject({ day: 2, gold: 30 });
    expect(claimDaily(save, NOON + 3 * DAY)).toMatchObject({ day: 1 }); // missed day 3 → reset
    let t = NOON + 3 * DAY;
    for (let d = 2; d <= 7; d++) {
      t += DAY;
      expect(claimDaily(save, t)?.day).toBe(d);
    }
    expect(save.daily.streak).toBe(7);
    expect(claimDaily(save, t + DAY)?.day).toBe(1);
    expect(save.crystals).toBe(5 + 15); // day 4 and day 7 of the full week
    expect(dayKey(NOON)).toBe('2026-09-13');
  });
});

describe('commander upgrades', () => {
  it('tiers cost 60/120/200/300/420 gold and unlock in order', () => {
    save.gold = 1100;
    expect(upgradeCost(save, 'production')).toBe(60);
    expect(buyUpgrade(save, 'production')).toBe(true);
    expect(upgradeTier(save, 'production')).toBe(1);
    expect(upgradeCost(save, 'production')).toBe(120);
    for (let i = 0; i < 4; i++) expect(buyUpgrade(save, 'production')).toBe(true);
    expect(save.gold).toBe(0);
    expect(upgradeCost(save, 'production')).toBeNull();
    expect(buyUpgrade(save, 'production')).toBe(false);
    expect(buyUpgrade(save, 'capacity')).toBe(false); // unaffordable
    expect(upgradeTier(save, 'capacity')).toBe(0);
    expect(commanderSummary(save)).toBe('+20 % prod');
  });

  it('modifiersFromSave maps tiers onto the sim modifiers (max = the advantage limit)', () => {
    expect(modifiersFromSave(save)).toEqual({ productionMul: 1, capacityMul: 1, startGarrisonBonus: 0, unitSpeedMul: 1 });
    save.upgrades = { production: 2, capacity: 3, garrison: 4, march_speed: 1, booster_cost: 5 };
    expect(modifiersFromSave(save)).toEqual({ productionMul: 1.08, capacityMul: 1.15, startGarrisonBonus: 4, unitSpeedMul: 1.03 });
    save.upgrades = { production: 5, capacity: 5, garrison: 5, march_speed: 5, booster_cost: 5 };
    expect(modifiersFromSave(save)).toEqual({ productionMul: 1.2, capacityMul: 1.25, startGarrisonBonus: 5, unitSpeedMul: 1.15 });
    expect(modifiersFromSave(save, 15).startGarrisonBonus).toBe(20); // "Reinforcements" continue
    save.upgrades = { production: 99 };
    expect(modifiersFromSave(save).productionMul).toBe(1.2); // clamped to maxTier
  });

  it('booster discount stacks the track and premium, capped at 30 %, and prices round up', () => {
    expect(boosterPrice(save, 'overdrive')).toBe(30);
    save.upgrades.booster_cost = 3; // −15 %
    expect(boosterDiscount(save)).toBeCloseTo(0.15);
    expect(boosterPrice(save, 'overdrive')).toBe(26); // 25.5 → 26
    expect(boosterPrice(save, 'freeze')).toBe(34);
    save.entitlements.premium = true; // −10 % more
    expect(boosterDiscount(save)).toBeCloseTo(0.25);
    save.upgrades.booster_cost = 5; // 25 + 10 → capped at 30
    expect(boosterDiscount(save)).toBe(0.3);
    expect(boosterPrice(save, 'airstrike')).toBe(35);
  });
});

describe('skins', () => {
  it('equippedSkin maps owned catalog ids onto sprite ids and ignores unowned ones', () => {
    expect(equippedSkin(save)).toEqual({ roof: undefined, helmet: undefined });
    save.skins.owned = ['roof_gold'];
    save.skins.equipped = { roof: 'roof_gold', helmet: 'helmet_royal' };
    expect(equippedSkin(save)).toEqual({ roof: 'roof.gold', helmet: undefined });
  });
});

describe('save migration v2 → v3', () => {
  it('reads a v2 save (coins) into gold with default economy fields and writes the v3 key', () => {
    const v2 = { version: 2, stars: { '1': 3, '2': 2 }, coins: 120, settings: { sendRatio: 0.5, colorBlind: false, sound: true, reducedMotion: 'off' } };
    store.setItem(SAVE_KEY_V2, JSON.stringify(v2));
    const s = loadSaveFrom(store);
    expect(s.version).toBe(3);
    expect(s.gold).toBe(120);
    expect(s.crystals).toBe(0);
    expect(s.stars).toEqual({ '1': 3, '2': 2 });
    expect(s.settings.reducedMotion).toBe('off');
    expect(s.entitlements).toEqual({ noAds: false, premium: false, starterPack: false });
    expect(s.upgrades).toEqual({});
    expect(s.skins).toEqual({ owned: [], equipped: { roof: null, helmet: null } });
    expect(s.charges).toEqual({ overdrive: 0, freeze: 0, airstrike: 0 });
    expect(s.daily).toEqual({ lastClaimDay: null, streak: 0 });
    expect(s.purchases).toEqual([]);
    expect(store.dump()[SAVE_KEY]).toBeDefined();
    expect(store.dump()[SAVE_KEY_V2]).toBe(JSON.stringify(v2));
  });

  it('normalises hostile v3 input: negative balances, unknown equipped skins, over-max tiers', () => {
    store.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 3, gold: -5, crystals: 'x', upgrades: { production: 9, bogus: -1 }, skins: { owned: ['roof_slate'], equipped: { roof: 'roof_gold', helmet: 3 } } }),
    );
    const s = loadSaveFrom(store);
    expect(s.gold).toBe(0);
    expect(s.crystals).toBe(0);
    expect(s.upgrades).toEqual({ production: 5, bogus: 0 });
    expect(s.skins.equipped).toEqual({ roof: null, helmet: null });
  });
});
