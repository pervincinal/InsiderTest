import { describe, expect, it } from 'vitest';
import { C } from '../../src/sim/constants';
import {
  ACHIEVEMENTS,
  AD_PLACEMENTS,
  ADVANTAGE_LIMIT,
  COMMANDER_UPGRADES,
  CONVERSION,
  CRYSTAL_SERVICES,
  CURRENCIES,
  EARN_RULES,
  ENERGY_SYSTEM,
  IAP_PRODUCTS as IAP_PRODUCTS_CONST,
  INTERSTITIAL_RULES,
  SKINS,
  STORE_PRICE_POINTS_USD,
  UPGRADE_TRACK_COST_GOLD,
} from '../../src/economy/catalog';
import type { IapProductDef } from '../../src/economy/catalog';

/** Widened view: the `as const` literal union hides optional fields that are absent on some entries. */
const IAP_PRODUCTS: readonly IapProductDef[] = IAP_PRODUCTS_CONST;

function ids(list: readonly { id: string }[]): string[] {
  return list.map((x) => x.id);
}

function unique(list: readonly string[]): boolean {
  return new Set(list).size === list.length;
}

describe('economy catalog (docs/ECONOMY.md)', () => {
  it('ids are unique within every table and skins referenced by products exist', () => {
    expect(unique(ids(IAP_PRODUCTS))).toBe(true);
    expect(unique(ids(COMMANDER_UPGRADES))).toBe(true);
    expect(unique(ids(SKINS))).toBe(true);
    expect(unique(ids(AD_PLACEMENTS))).toBe(true);
    expect(unique(ids(ACHIEVEMENTS))).toBe(true);
    const skinIds = new Set(ids(SKINS));
    for (const p of IAP_PRODUCTS) for (const s of p.grants.skins ?? []) expect(skinIds.has(s)).toBe(true);
    for (const p of IAP_PRODUCTS) {
      for (const other of [...(p.hiddenWhenOwned ?? []), ...(p.requiresOwned ? [p.requiresOwned] : [])]) {
        expect(ids(IAP_PRODUCTS)).toContain(other);
      }
    }
  });

  it('every price is a valid Apple/Google price point and the tier matches the USD price', () => {
    for (const p of IAP_PRODUCTS) {
      expect(STORE_PRICE_POINTS_USD).toContain(p.priceUsd);
      expect(p.tier).toBe(Math.round(p.priceUsd + 0.01)); // Tier 1 = $0.99, Tier 5 = $4.99, Tier 50 = $49.99
    }
  });

  it('crystal packs: bonus % is strictly increasing with price and matches the granted amount', () => {
    const packs = IAP_PRODUCTS.filter((p) => p.bonusPct !== undefined).sort((a, b) => a.priceUsd - b.priceUsd);
    expect(packs.length).toBe(5);
    const base = packs[0]!;
    expect(base.priceUsd).toBe(0.99);
    const baseRate = base.grants.crystals! / base.priceUsd;
    for (let i = 1; i < packs.length; i++) {
      const prev = packs[i - 1]!;
      const cur = packs[i]!;
      expect(cur.bonusPct!).toBeGreaterThan(prev.bonusPct!);
      // granted ≈ base rate × price × (1 + bonus), within 5 % (prices end in .99, amounts are round)
      const expected = baseRate * cur.priceUsd * (1 + cur.bonusPct!);
      expect(Math.abs(cur.grants.crystals! / expected - 1)).toBeLessThan(0.05);
    }
  });

  it('one-time products are non-consumable and remove-ads / premium do not double-charge', () => {
    for (const p of IAP_PRODUCTS.filter((p) => p.availability === 'once')) expect(p.kind).toBe('nonConsumable');
    const removeAds = IAP_PRODUCTS.find((p) => p.id === 'remove_ads')!;
    const premium = IAP_PRODUCTS.find((p) => p.id === 'premium_bundle')!;
    const upgrade = IAP_PRODUCTS.find((p) => p.id === 'premium_upgrade')!;
    expect(removeAds.grants.removeAds).toBe(true);
    expect(premium.grants.removeAds).toBe(true);
    expect(upgrade.grants.removeAds).toBeUndefined();
    expect(upgrade.requiresOwned).toBe('remove_ads');
    expect(premium.hiddenWhenOwned).toContain('remove_ads');
    // remove_ads + premium_upgrade costs the same as premium_bundle and grants at least as many crystals
    expect(removeAds.priceUsd + upgrade.priceUsd).toBeLessThanOrEqual(premium.priceUsd);
    expect(removeAds.grants.crystals! + upgrade.grants.crystals!).toBeGreaterThanOrEqual(premium.grants.crystals!);
    expect(INTERSTITIAL_RULES.disabledByProducts).toEqual(['remove_ads', 'premium_bundle']);
  });

  it('commander upgrades stay within the GDD advantage limit', () => {
    for (const u of COMMANDER_UPGRADES) {
      expect(u.costGoldByTier.length).toBe(u.maxTier);
      expect(u.maxTier).toBeGreaterThanOrEqual(2); // a one-tier "track" is a toggle, not progression
      for (let i = 1; i < u.costGoldByTier.length; i++) expect(u.costGoldByTier[i]!).toBeGreaterThan(u.costGoldByTier[i - 1]!);
      const maxEffect = Math.round(u.effect.perTier * u.maxTier * 1e4) / 1e4;
      expect(maxEffect).toBeLessThanOrEqual(ADVANTAGE_LIMIT[u.effect.kind]);
      // The limit is the measured cap, not a ceiling with slack: a track that stops short of it means
      // the doc, the limit and the playtest headline no longer describe the same game.
      expect(maxEffect).toBe(ADVANTAGE_LIMIT[u.effect.kind]);
      // every track costs the same total; short tracks are pricier per tier, never stronger
      expect(u.costGoldByTier.reduce((a, b) => a + b, 0)).toBe(UPGRADE_TRACK_COST_GOLD);
    }
    // Retune bounds from the 2026-09-13 `--upgrades max` playtest (ECONOMY.md §3.2): production +10 %,
    // speed +5 % or garrison +3 on their own already flip a third of the campaign to 3★, and the
    // tactical tracks are super-additive, so the combined caps must stay under these ceilings.
    expect(ADVANTAGE_LIMIT.productionMul).toBeLessThanOrEqual(0.06);
    expect(ADVANTAGE_LIMIT.startingGarrison).toBeLessThanOrEqual(2);
    expect(ADVANTAGE_LIMIT.marchSpeedMul).toBeLessThanOrEqual(0.04);
    expect(ADVANTAGE_LIMIT.capacityMul).toBeLessThanOrEqual(0.25);
    // …and still meaningful: every tactical track does something at max
    expect(ADVANTAGE_LIMIT.productionMul).toBeGreaterThanOrEqual(0.04);
    expect(ADVANTAGE_LIMIT.startingGarrison).toBeGreaterThanOrEqual(1);
    expect(ADVANTAGE_LIMIT.marchSpeedMul).toBeGreaterThanOrEqual(0.02);
    const discount = COMMANDER_UPGRADES.find((u) => u.effect.kind === 'boosterDiscount')!;
    const premiumDiscount = Math.max(...IAP_PRODUCTS.map((p) => p.grants.boosterDiscount ?? 0));
    expect(discount.effect.perTier * discount.maxTier + premiumDiscount).toBeGreaterThan(ADVANTAGE_LIMIT.totalBoosterDiscount); // hence the cap exists
    expect(ADVANTAGE_LIMIT.totalBoosterDiscount).toBeLessThan(0.5);
    // full tree = 5 tracks × 1100 gold (ECONOMY.md §3.2) — unchanged by the retune
    expect(UPGRADE_TRACK_COST_GOLD).toBe(1100);
    const total = COMMANDER_UPGRADES.reduce((s, u) => s + u.costGoldByTier.reduce((a, b) => a + b, 0), 0);
    expect(total).toBe(5500);
  });

  it('earn rules match the GDD and the daily reward table has 7 days', () => {
    expect(EARN_RULES.goldPerStarFirstClear).toBe(C.COINS_PER_STAR);
    expect(EARN_RULES.dailyReward.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const weekGold = EARN_RULES.dailyReward.reduce((s, d) => s + d.gold, 0);
    const weekCrystals = EARN_RULES.dailyReward.reduce((s, d) => s + d.crystals, 0);
    expect(weekGold).toBe(330);
    expect(weekCrystals).toBe(20);
    // Band 5 (GDD §3, 2026-09-20): milestones 150 → 210, six bands ending at 50, achievements 85 → 95.
    expect(Object.values(EARN_RULES.crystalsPerMilestone).reduce((a, b) => a + b, 0)).toBe(210);
    expect(EARN_RULES.crystalsPerMilestone[50]).toBe(EARN_RULES.crystalsPerMilestone[40]); // a second finale, not a bigger one
    expect(EARN_RULES.bands.length).toBe(6);
    expect(EARN_RULES.bands.at(-1)).toEqual([41, 50]);
    for (let i = 1; i < EARN_RULES.bands.length; i++) expect(EARN_RULES.bands[i]![0]).toBe(EARN_RULES.bands[i - 1]![1] + 1); // contiguous
    expect(ACHIEVEMENTS.reduce((s, a) => s + a.crystals, 0)).toBe(95);
    expect(ACHIEVEMENTS.find((a) => a.id === 'grand_campaign')).toMatchObject({ label: 'Clear level 50', crystals: 10 });
  });

  it('conversion is crystals → gold only and the currencies map to save fields', () => {
    expect(CONVERSION.goldPerCrystal).toBeGreaterThan(0);
    expect('crystalsPerGold' in CONVERSION).toBe(false);
    expect(CURRENCIES.gold.saveField).toBe('gold');
    expect(CURRENCIES.crystals.kind).toBe('hard');
    expect(ENERGY_SYSTEM).toBeNull();
  });

  it('crystal-priced services: the booster crate is a discount, skins are cosmetic and exclusives are not sold', () => {
    const crate = CRYSTAL_SERVICES.boosterCrate;
    const goldValue = crate.charges.overdrive * C.BOOSTER_COST.overdrive + crate.charges.freeze * C.BOOSTER_COST.freeze + crate.charges.airstrike * C.BOOSTER_COST.airstrike;
    expect(goldValue).toBeGreaterThan(crate.costCrystals * CONVERSION.goldPerCrystal);
    for (const s of SKINS) {
      if (s.source === 'shop') expect(s.costCrystals).toBeGreaterThan(0);
      else expect(s.costCrystals).toBe(0);
    }
    expect(SKINS.filter((s) => s.source === 'premium').map((s) => s.id).sort()).toEqual(['helmet_royal', 'roof_gold']);
    // every shop skin sits in the 80–200 crystal band of ECONOMY.md §3.3, including the M3-2 silhouettes
    for (const s of SKINS.filter((s) => s.source === 'shop')) {
      expect(s.costCrystals, s.id).toBeGreaterThanOrEqual(80);
      expect(s.costCrystals, s.id).toBeLessThanOrEqual(200);
    }
    expect(SKINS.filter((s) => s.category === 'towerShape').map((s) => [s.id, s.costCrystals])).toEqual([
      ['tower_keep', 150],
      ['tower_watchtower', 200],
    ]);
    expect(SKINS.filter((s) => s.category === 'unitShape').map((s) => [s.id, s.costCrystals])).toEqual([
      ['unit_shieldwall', 120],
      ['unit_robots', 150],
    ]);
    expect(CRYSTAL_SERVICES.levelSkip.costCrystals).toBeGreaterThan(CRYSTAL_SERVICES.continue.costCrystals);
  });

  it('ads: interstitial only on the level break with gates and cooldown; rewarded placements have daily caps', () => {
    const interstitials = AD_PLACEMENTS.filter((p) => p.type === 'interstitial');
    expect(interstitials.length).toBe(1);
    expect(interstitials[0]!.where).toBe('resultScreen');
    expect(interstitials[0]!.cooldownMs).toBeGreaterThanOrEqual(120_000);
    expect(INTERSTITIAL_RULES.minLevelsCompleted).toBeGreaterThanOrEqual(5);
    expect(INTERSTITIAL_RULES.everyNthCompletedLevel).toBe(3);
    expect(INTERSTITIAL_RULES.skipAfterRewarded).toBe(true);
    for (const p of AD_PLACEMENTS.filter((p) => p.type === 'rewarded')) {
      expect(Number.isFinite(p.dailyCap)).toBe(true);
      expect(p.dailyCap).toBeGreaterThan(0);
      expect(p.cooldownMs).toBeGreaterThan(0);
      expect(p.reward.kind).not.toBe('none');
    }
    expect(ids(AD_PLACEMENTS)).toEqual(['int_level_break', 'rv_double_gold', 'rv_continue', 'rv_free_booster', 'rv_daily_chest']);
  });
});
