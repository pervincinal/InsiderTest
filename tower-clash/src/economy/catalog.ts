/**
 * Economy catalog — the machine-readable twin of docs/ECONOMY.md.
 *
 * Every price, grant, cap and earn rate the shop, wallet, ad layer and result screen consume lives
 * here and nowhere else. Change the doc and this file together; tests/economy/catalog.test.ts guards
 * the invariants (unique ids, valid store price points, monotonic bonuses, upgrade caps).
 *
 * Nothing in this module touches the DOM, the sim or storage — it is data only.
 */

import type { C } from '../sim/constants';

/** 'overdrive' | 'freeze' | 'airstrike' — derived from the sim's price table so the two cannot drift. */
type BoosterKind = keyof typeof C.BOOSTER_COST;

// ---------------------------------------------------------------------------------------------
// Currencies
// ---------------------------------------------------------------------------------------------

export type CurrencyId = 'gold' | 'crystals';

export interface CurrencyDef {
  readonly id: CurrencyId;
  readonly kind: 'soft' | 'hard';
  readonly label: string;
  /** Save field that stores the balance (`coins` is the historical name of gold). */
  readonly saveField: 'gold' | 'crystals';
}

export const CURRENCIES = {
  gold: { id: 'gold', kind: 'soft', label: 'Gold', saveField: 'gold' },
  crystals: { id: 'crystals', kind: 'hard', label: 'Crystals', saveField: 'crystals' },
} as const satisfies Record<CurrencyId, CurrencyDef>;

/** Crystals → gold only; gold → crystals never (ECONOMY.md §2). */
export const CONVERSION = {
  goldPerCrystal: 5,
  /** Offered pack sizes in crystals; gold granted = size × goldPerCrystal. */
  packsCrystals: [20, 100, 500],
} as const;

// ---------------------------------------------------------------------------------------------
// Earn rules
// ---------------------------------------------------------------------------------------------

export interface DailyRewardDay {
  readonly day: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly gold: number;
  readonly crystals: number;
}

export const EARN_RULES = {
  /** GDD §2.6: 10 gold per star, first clear only (star improvements pay the delta). */
  goldPerStarFirstClear: 10,
  goldPerNewStar: 10,
  /** Replay with no new star: 3 gold per star, capped per calendar day. */
  goldPerStarReplay: 3,
  replayGoldDailyCap: 100,
  /** Crystals for total levels cleared. */
  crystalsPerMilestone: { 10: 20, 20: 30, 30: 40, 40: 60 },
  /** Crystals when every level of a band (8 levels) is at 3★. */
  crystalsPerFullBand3Star: 20,
  bands: [
    [1, 8],
    [9, 16],
    [17, 24],
    [25, 32],
    [33, 40],
  ],
  /** 7-day login streak; resets after a missed calendar day, loops after day 7. */
  dailyReward: [
    { day: 1, gold: 20, crystals: 0 },
    { day: 2, gold: 30, crystals: 0 },
    { day: 3, gold: 40, crystals: 0 },
    { day: 4, gold: 0, crystals: 5 },
    { day: 5, gold: 60, crystals: 0 },
    { day: 6, gold: 80, crystals: 0 },
    { day: 7, gold: 100, crystals: 15 },
  ],
} as const satisfies {
  goldPerStarFirstClear: number;
  goldPerNewStar: number;
  goldPerStarReplay: number;
  replayGoldDailyCap: number;
  crystalsPerMilestone: Record<number, number>;
  crystalsPerFullBand3Star: number;
  bands: readonly (readonly [number, number])[];
  dailyReward: readonly DailyRewardDay[];
};

export interface AchievementDef {
  readonly id: string;
  readonly label: string;
  readonly crystals: number;
}

export const ACHIEVEMENTS = [
  { id: 'first_win', label: 'First victory', crystals: 5 },
  { id: 'first_l3', label: 'Upgrade a tower to level 3', crystals: 5 },
  { id: 'first_fortress', label: 'Capture a fortress', crystals: 5 },
  { id: 'first_bridge_cut', label: 'Cut a bridge', crystals: 5 },
  { id: 'first_tank', label: 'Capture a tank factory', crystals: 5 },
  { id: 'stars_10', label: 'Ten 3★ levels', crystals: 10 },
  { id: 'stars_20', label: 'Twenty 3★ levels', crystals: 10 },
  { id: 'stars_40', label: 'Every level at 3★', crystals: 20 },
  { id: 'flawless', label: 'Win without losing a tower', crystals: 10 },
  { id: 'speedrunner', label: 'Win in under 30 s', crystals: 10 },
] as const satisfies readonly AchievementDef[];

// ---------------------------------------------------------------------------------------------
// Sinks: commander upgrades, skins, crystal-priced services
// ---------------------------------------------------------------------------------------------

export type UpgradeEffectKind = 'productionMul' | 'capacityMul' | 'startingGarrison' | 'boosterDiscount' | 'marchSpeedMul';

export interface CommanderUpgradeDef {
  readonly id: string;
  readonly label: string;
  readonly maxTier: number;
  /** Gold cost to reach tier index+1 (length === maxTier). */
  readonly costGoldByTier: readonly number[];
  readonly effect: {
    readonly kind: UpgradeEffectKind;
    /** Additive per tier: multiplier delta (0.04 = +4 %), units (+1) or discount fraction (0.05). */
    readonly perTier: number;
  };
}

const UPGRADE_TIER_COSTS = [60, 120, 200, 300, 420] as const;

export const COMMANDER_UPGRADES = [
  { id: 'production', label: 'Production', maxTier: 5, costGoldByTier: UPGRADE_TIER_COSTS, effect: { kind: 'productionMul', perTier: 0.04 } },
  { id: 'capacity', label: 'Capacity', maxTier: 5, costGoldByTier: UPGRADE_TIER_COSTS, effect: { kind: 'capacityMul', perTier: 0.05 } },
  { id: 'garrison', label: 'Starting garrison', maxTier: 5, costGoldByTier: UPGRADE_TIER_COSTS, effect: { kind: 'startingGarrison', perTier: 1 } },
  { id: 'booster_cost', label: 'Booster discount', maxTier: 5, costGoldByTier: UPGRADE_TIER_COSTS, effect: { kind: 'boosterDiscount', perTier: 0.05 } },
  { id: 'march_speed', label: 'March speed', maxTier: 5, costGoldByTier: UPGRADE_TIER_COSTS, effect: { kind: 'marchSpeedMul', perTier: 0.03 } },
] as const satisfies readonly CommanderUpgradeDef[];

/**
 * GDD advantage limit (ECONOMY.md §3.2): the maximum cumulative edge any combination of permanent
 * upgrades may give the player. The reference bot with everything maxed must still land at a median
 * of ≤ 2.5★. Tier tables that would exceed these values fail the catalog test.
 */
export const ADVANTAGE_LIMIT = {
  productionMul: 0.2,
  capacityMul: 0.25,
  startingGarrison: 5,
  boosterDiscount: 0.25,
  marchSpeedMul: 0.15,
  /** Commander discount + premium discount together never exceed this. */
  totalBoosterDiscount: 0.3,
} as const satisfies Record<UpgradeEffectKind, number> & { totalBoosterDiscount: number };

export type SkinCategory = 'towerRoof' | 'unitHelmet' | 'terrainTheme';

export interface SkinDef {
  readonly id: string;
  readonly label: string;
  readonly category: SkinCategory;
  /** 0 = not sold for crystals (exclusive to a pack). */
  readonly costCrystals: number;
  readonly source: 'shop' | 'starter' | 'premium';
}

export const SKINS = [
  { id: 'roof_slate', label: 'Slate roof', category: 'towerRoof', costCrystals: 80, source: 'shop' },
  { id: 'roof_pagoda', label: 'Pagoda roof', category: 'towerRoof', costCrystals: 120, source: 'shop' },
  { id: 'roof_onion', label: 'Onion dome', category: 'towerRoof', costCrystals: 150, source: 'shop' },
  { id: 'roof_gold', label: 'Gold roof', category: 'towerRoof', costCrystals: 0, source: 'premium' },
  { id: 'helmet_bronze', label: 'Bronze helmet', category: 'unitHelmet', costCrystals: 0, source: 'starter' },
  { id: 'helmet_viking', label: 'Viking helmet', category: 'unitHelmet', costCrystals: 100, source: 'shop' },
  { id: 'helmet_knight', label: 'Knight helmet', category: 'unitHelmet', costCrystals: 120, source: 'shop' },
  { id: 'helmet_samurai', label: 'Samurai helmet', category: 'unitHelmet', costCrystals: 150, source: 'shop' },
  { id: 'helmet_royal', label: 'Royal helmet', category: 'unitHelmet', costCrystals: 0, source: 'premium' },
  { id: 'theme_dusk', label: 'Dusk', category: 'terrainTheme', costCrystals: 150, source: 'shop' },
  { id: 'theme_winter_night', label: 'Winter night', category: 'terrainTheme', costCrystals: 200, source: 'shop' },
  { id: 'theme_neon', label: 'Neon', category: 'terrainTheme', costCrystals: 200, source: 'shop' },
] as const satisfies readonly SkinDef[];

/** Crystal-priced services (ECONOMY.md §3.1, §3.4, §3.5). */
export const CRYSTAL_SERVICES = {
  levelSkip: { costCrystals: 30, offerAfterDefeats: 3, maxPerBand: 1, starsGranted: 1 },
  continue: { costCrystals: 10, rewindMs: 20_000, snapshotEveryMs: 5000, bonusInfantry: 15, freeFreeze: true, perAttempt: 1 },
  boosterCrate: { costCrystals: 60, charges: { overdrive: 5, freeze: 3, airstrike: 2 } },
} as const satisfies {
  levelSkip: { costCrystals: number; offerAfterDefeats: number; maxPerBand: number; starsGranted: number };
  continue: { costCrystals: number; rewindMs: number; snapshotEveryMs: number; bonusInfantry: number; freeFreeze: boolean; perAttempt: number };
  boosterCrate: { costCrystals: number; charges: Record<BoosterKind, number> };
};

/** Explicitly rejected (ECONOMY.md §3.6): there is no energy/lives system. */
export const ENERGY_SYSTEM = null;

// ---------------------------------------------------------------------------------------------
// IAP catalog
// ---------------------------------------------------------------------------------------------

/** USD price points shared by Apple's legacy tier names and Google's default USD prices. */
export const STORE_PRICE_POINTS_USD = [0.99, 1.99, 2.99, 3.99, 4.99, 9.99, 19.99, 49.99, 99.99] as const;

export type ProductKind = 'consumable' | 'nonConsumable';

export interface IapGrants {
  readonly crystals?: number;
  readonly gold?: number;
  readonly skins?: readonly string[];
  readonly removeAds?: boolean;
  /** Fraction off the gold price of boosters (stacks with the commander track, capped). */
  readonly boosterDiscount?: number;
}

export interface IapProductDef {
  readonly id: string;
  readonly kind: ProductKind;
  /** Store-facing display name (store providers read `title`). */
  readonly title: string;
  readonly priceUsd: (typeof STORE_PRICE_POINTS_USD)[number];
  /** Apple legacy tier number (Tier 1 = $0.99 … Tier 50 = $49.99); Google has no ladder. */
  readonly tier: number;
  readonly grants: IapGrants;
  /** For crystal packs: bonus over the $0.99 base rate, as a fraction (0.1 = +10 %). */
  readonly bonusPct?: number;
  readonly availability: 'always' | 'once' | 'liveops';
  /** Shown only when the listed product is owned (e.g. premium_upgrade replaces premium_bundle). */
  readonly requiresOwned?: string;
  readonly hiddenWhenOwned?: readonly string[];
}

export const IAP_PRODUCTS = [
  { id: 'crystals_100', kind: 'consumable', title: 'Handful of crystals', priceUsd: 0.99, tier: 1, grants: { crystals: 100 }, bonusPct: 0, availability: 'always' },
  { id: 'crystals_550', kind: 'consumable', title: 'Pouch of crystals', priceUsd: 4.99, tier: 5, grants: { crystals: 550 }, bonusPct: 0.1, availability: 'always' },
  { id: 'crystals_1200', kind: 'consumable', title: 'Chest of crystals', priceUsd: 9.99, tier: 10, grants: { crystals: 1200 }, bonusPct: 0.2, availability: 'always' },
  { id: 'crystals_2600', kind: 'consumable', title: 'Crate of crystals', priceUsd: 19.99, tier: 20, grants: { crystals: 2600 }, bonusPct: 0.3, availability: 'always' },
  { id: 'crystals_7000', kind: 'consumable', title: 'Vault of crystals', priceUsd: 49.99, tier: 50, grants: { crystals: 7000 }, bonusPct: 0.4, availability: 'always' },
  {
    id: 'starter_pack',
    kind: 'nonConsumable',
    title: 'Starter Pack',
    priceUsd: 2.99,
    tier: 3,
    grants: { crystals: 400, gold: 400, skins: ['helmet_bronze'] },
    availability: 'once',
  },
  { id: 'remove_ads', kind: 'nonConsumable', title: 'Remove Ads', priceUsd: 3.99, tier: 4, grants: { removeAds: true, crystals: 50 }, availability: 'once', hiddenWhenOwned: ['premium_bundle'] },
  {
    id: 'premium_bundle',
    kind: 'nonConsumable',
    title: 'Premium Bundle',
    priceUsd: 9.99,
    tier: 10,
    grants: { removeAds: true, crystals: 600, skins: ['roof_gold', 'helmet_royal'], boosterDiscount: 0.1 },
    availability: 'once',
    hiddenWhenOwned: ['remove_ads', 'premium_upgrade'],
  },
  {
    id: 'premium_upgrade',
    kind: 'nonConsumable',
    title: 'Premium Upgrade',
    priceUsd: 4.99,
    tier: 5,
    grants: { crystals: 550, skins: ['roof_gold', 'helmet_royal'], boosterDiscount: 0.1 },
    availability: 'once',
    requiresOwned: 'remove_ads',
    hiddenWhenOwned: ['premium_bundle'],
  },
  { id: 'weekend_pack', kind: 'consumable', title: 'Weekend Pack', priceUsd: 1.99, tier: 2, grants: { crystals: 250, gold: 250 }, availability: 'liveops' },
] as const satisfies readonly IapProductDef[];

/** Phase C LiveOps offers that are not products themselves. */
export const OFFERS = {
  firstPurchaseDouble: { multiplier: 2, appliesTo: ['crystals_100', 'crystals_550', 'crystals_1200', 'crystals_2600', 'crystals_7000'] },
  weekendPack: { productId: 'weekend_pack', days: ['fri', 'sat', 'sun'], maxPerWeekend: 1 },
} as const;

// ---------------------------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------------------------

export type AdPlacementType = 'interstitial' | 'rewarded';

export type AdReward =
  | { readonly kind: 'none' }
  | { readonly kind: 'doubleGold' }
  | { readonly kind: 'continue' }
  | { readonly kind: 'boosterCharge'; readonly amount: number }
  | { readonly kind: 'crystals'; readonly amount: number };

export interface AdPlacementDef {
  readonly id: string;
  readonly type: AdPlacementType;
  readonly where: 'resultScreen' | 'defeatScreen' | 'boosterBar' | 'mapScreen';
  readonly reward: AdReward;
  /** Per calendar day; interstitials use a session cap instead. */
  readonly dailyCap: number;
  readonly cooldownMs: number;
}

export const AD_PLACEMENTS = [
  { id: 'int_level_break', type: 'interstitial', where: 'resultScreen', reward: { kind: 'none' }, dailyCap: Infinity, cooldownMs: 120_000 },
  { id: 'rv_double_gold', type: 'rewarded', where: 'resultScreen', reward: { kind: 'doubleGold' }, dailyCap: 5, cooldownMs: 60_000 },
  { id: 'rv_continue', type: 'rewarded', where: 'defeatScreen', reward: { kind: 'continue' }, dailyCap: 3, cooldownMs: 60_000 },
  { id: 'rv_free_booster', type: 'rewarded', where: 'boosterBar', reward: { kind: 'boosterCharge', amount: 1 }, dailyCap: 3, cooldownMs: 120_000 },
  { id: 'rv_daily_chest', type: 'rewarded', where: 'mapScreen', reward: { kind: 'crystals', amount: 5 }, dailyCap: 1, cooldownMs: 20 * 3_600_000 },
] as const satisfies readonly AdPlacementDef[];

/** Interstitial policy (ECONOMY.md §5.1). Rewarded placements are never gated by these. */
export const INTERSTITIAL_RULES = {
  /** No interstitial until this many levels have been completed (won or lost). */
  minLevelsCompleted: 5,
  everyNthCompletedLevel: 3,
  /** Minimum time since the last ad of any kind (also satisfied by the placement cooldown). */
  minMsSinceLastAd: 120_000,
  sessionCap: 4,
  /** A rewarded ad on the same result screen suppresses the interstitial and resets the counter. */
  skipAfterRewarded: true,
  /** Entitlements that disable interstitials entirely. */
  disabledByProducts: ['remove_ads', 'premium_bundle'],
  /** The web build carries no ad SDK: all placements report unavailable and their buttons are hidden. */
  webBuild: 'noAds',
} as const;
