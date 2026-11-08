/**
 * What the shop lists (products, skins and their equip slot) over the entitlement rules in
 * `entitlements.ts`. The shop screen (src/ui/shop.ts, a lazy chunk) is the only reader, so these live
 * in its chunk rather than the eager bundle (PERF-12).
 *
 * Owned by the Frontend Engineer.
 */
import type { SaveData, SkinFamily } from '../ui/save';
import type { IapProductDef, SkinDef } from './catalog';
import { IAP_PRODUCTS, SKINS } from './catalog';
import { highestClearedLevel, ownsProduct } from './entitlements';

/**
 * Products to list in the shop: `always` and unowned `once` products, minus the ones hidden by an
 * owned product, plus the ones whose `requiresOwned` is satisfied, minus the ones gated behind a
 * cleared level the player has not reached (`minClearedLevel`: the Starter Pack after level 8) or
 * held back in the first session (`notFirstSession`, AUD-B14: `firstSession` = the app started with
 * no level won, `AdSession.winsAtStart` 0) — an owner, e.g. after a restore on a fresh save, still
 * sees it as OWNED. LiveOps products wait for Phase C.
 */
export function visibleProducts(save: SaveData, firstSession = false): IapProductDef[] {
  const all: readonly IapProductDef[] = IAP_PRODUCTS;
  const cleared = highestClearedLevel(save);
  return all.filter((p) => {
    if (p.availability === 'liveops') return false;
    if (p.requiresOwned && !ownsProduct(save, p.requiresOwned)) return false;
    if (p.hiddenWhenOwned?.some((id) => ownsProduct(save, id))) return false;
    if ((cleared < (p.minClearedLevel ?? 0) || (firstSession && p.notFirstSession)) && !ownsProduct(save, p.id)) return false;
    return true;
  });
}

/** Skins sold or shown in the shop: roofs, helmets and terrain themes (ECON-10), in catalog order. */
export function shopSkins(): SkinDef[] {
  return [...(SKINS as readonly SkinDef[])];
}

/** The family slot a catalog skin equips into (silhouette skins share the roof / helmet slot, M3-2). */
export function skinFamily(skin: Pick<SkinDef, 'category'>): SkinFamily {
  switch (skin.category) {
    case 'towerRoof':
    case 'towerShape':
      return 'roof';
    case 'unitHelmet':
    case 'unitShape':
      return 'helmet';
    default:
      return 'theme';
  }
}
