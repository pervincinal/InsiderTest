/**
 * The shop half of the wallet (ECONOMY.md §2–§4): crystal → gold conversion, the booster crate,
 * store grants (once per transaction / non-consumable) and restores. Split from ./wallet.ts for
 * PERF-11: only the shop and the debug surface use these — both lazy chunks — so this file is a
 * lazy chunk of its own (shared by the two). ./store.ts and the fake store stay eager: main.ts calls
 * `getStore().init()` at boot (≈ 1.3 kB gzip with the catalog's IAP_PRODUCTS, a PERF-11 candidate). Same rules as
 * the wallet: every mutation persists through `writeSave`, balances never go negative.
 *
 * Owned by the Frontend Engineer.
 */
import type { BoosterCharges, SaveData } from '../ui/save';
import { writeSave } from '../ui/save';
import type { IapProductDef } from './catalog';
import { CONVERSION, CRYSTAL_SERVICES, IAP_PRODUCTS } from './catalog';
import type { StoreProvider } from './store';
import { getStore } from './store';
import { spendCrystals } from './wallet';

/* ---------- crystal sinks: gold conversion, booster crate ---------- */

/** Gold a conversion of `crystals` pays (CONVERSION.goldPerCrystal). */
export function conversionGold(crystals: number): number {
  return Math.max(0, Math.floor(crystals)) * CONVERSION.goldPerCrystal;
}

/** Pack sizes (in crystals) the shop offers for conversion. */
export const CONVERSION_PACKS: readonly number[] = CONVERSION.packsCrystals;

/**
 * Crystals → gold, one catalog pack at a time (gold → crystals never exists). Returns the gold
 * added, or null (nothing changes) when the pack is not offered or unaffordable.
 */
export function convertCrystals(save: SaveData, crystals: number): number | null {
  if (!CONVERSION_PACKS.includes(crystals)) return null;
  if (!spendCrystals(save, crystals)) return null;
  const gold = conversionGold(crystals);
  save.gold += gold;
  writeSave(save);
  return gold;
}

/**
 * Booster crate (ECONOMY.md §3.1): crystals → pre-paid charges of every booster. Returns the
 * charges added, or null (nothing changes) when unaffordable.
 */
export function buyBoosterCrate(save: SaveData): BoosterCharges | null {
  const crate = CRYSTAL_SERVICES.boosterCrate;
  if (!spendCrystals(save, crate.costCrystals)) return null;
  const added: BoosterCharges = { ...crate.charges };
  save.charges.overdrive += added.overdrive;
  save.charges.freeze += added.freeze;
  save.charges.airstrike += added.airstrike;
  writeSave(save);
  return added;
}

/* ---------- store grants ---------- */

export function productById(id: string): IapProductDef | undefined {
  return (IAP_PRODUCTS as readonly IapProductDef[]).find((p) => p.id === id);
}

export interface GrantResult {
  productId: string;
  gold: number;
  crystals: number;
  skins: string[];
  noAds: boolean;
  premium: boolean;
}

/**
 * The non-currency side of a product (skins, no-ads / premium / starter flags). Idempotent; returns
 * the skins that were newly added.
 */
function applyEntitlements(save: SaveData, product: IapProductDef): string[] {
  const g = product.grants;
  const added: string[] = [];
  for (const skin of g.skins ?? []) {
    if (!save.skins.owned.includes(skin)) {
      save.skins.owned.push(skin);
      added.push(skin);
    }
  }
  if (g.removeAds === true) save.entitlements.noAds = true;
  if ((g.boosterDiscount ?? 0) > 0) save.entitlements.premium = true;
  if (product.id === 'starter_pack') save.entitlements.starterPack = true;
  return added;
}

/**
 * Apply a product's catalog grants exactly once. `transactionId` (from the store) is the dedupe
 * key; without one, consumables are granted unconditionally (the fake store always sends an id).
 *
 * Non-consumables are granted once per save (ECON-12 (2), "grant once per purchase"): the first
 * grant writes `owned:<productId>` into `save.purchases`; from then on a purchase retry, a second
 * transaction or any number of `restore()`s add no currency again — they only re-ensure the
 * entitlement (skins, no-ads / premium / starter flags) in case the save lost it, and return null.
 * A restore on a fresh save (reinstall, second device: no marker yet) grants once, because the
 * player paid; `resetProgress` keeps `purchases`, so a reset never re-opens the grant.
 * Returns null when the product is unknown or was already granted.
 */
export function grantProduct(save: SaveData, productId: string, transactionId?: string): GrantResult | null {
  const product = productById(productId);
  if (!product) return null;
  const marker = product.kind === 'nonConsumable' ? `owned:${productId}` : null;
  if (marker && save.purchases.includes(marker)) {
    const flags = JSON.stringify(save.entitlements);
    const added = applyEntitlements(save, product);
    if (added.length > 0 || JSON.stringify(save.entitlements) !== flags) writeSave(save);
    return null;
  }
  if (transactionId && save.purchases.includes(transactionId)) return null;
  const g = product.grants;
  const result: GrantResult = {
    productId,
    gold: g.gold ?? 0,
    crystals: g.crystals ?? 0,
    skins: [],
    noAds: g.removeAds === true,
    premium: (g.boosterDiscount ?? 0) > 0,
  };
  save.gold += result.gold;
  save.crystals += result.crystals;
  result.skins = applyEntitlements(save, product);
  if (transactionId) save.purchases.push(transactionId);
  if (marker) save.purchases.push(marker);
  writeSave(save);
  return result;
}

/**
 * Ask the store for the owned non-consumables and grant each one idempotently (consumables the
 * store may report — the fake does — are ignored). Returns the ids granted for the first time.
 */
export async function restorePurchases(save: SaveData, store: StoreProvider = getStore()): Promise<string[]> {
  const ids = await store.restore();
  const granted: string[] = [];
  for (const id of ids) {
    const product = productById(id);
    if (!product || product.kind !== 'nonConsumable') continue;
    if (grantProduct(save, id)) granted.push(id);
  }
  return granted;
}
