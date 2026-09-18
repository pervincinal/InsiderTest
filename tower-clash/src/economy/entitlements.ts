/**
 * Entitlement queries over the save (ECONOMY.md §4): which products are owned / visible, whether
 * interstitials are disabled, the combined booster discount and the equipped cosmetic skins.
 * Read-only helpers; the wallet is the only writer.
 *
 * Owned by the Frontend Engineer.
 */
import { C } from '../sim/constants';
import type { TowerSkin } from '../render/sprites';
import type { SaveData, SkinFamily } from '../ui/save';
import type { IapProductDef, SkinDef } from './catalog';
import { ADVANTAGE_LIMIT, COMMANDER_UPGRADES, IAP_PRODUCTS, INTERSTITIAL_RULES, SKINS } from './catalog';

type BoosterKind = keyof typeof C.BOOSTER_COST;

/** True when the one-time product was granted (consumables are never "owned"). */
export function ownsProduct(save: SaveData, productId: string): boolean {
  return save.purchases.includes(`owned:${productId}`);
}

/** `remove_ads` / `premium_bundle` owners never see interstitials (INTERSTITIAL_RULES.disabledByProducts). */
export function interstitialsDisabled(save: SaveData): boolean {
  return save.entitlements.noAds || INTERSTITIAL_RULES.disabledByProducts.some((id) => ownsProduct(save, id));
}

/**
 * Products to list in the shop: `always` and unowned `once` products, minus the ones hidden by an
 * owned product, plus the ones whose `requiresOwned` is satisfied. LiveOps products wait for Phase C.
 */
export function visibleProducts(save: SaveData): IapProductDef[] {
  const all: readonly IapProductDef[] = IAP_PRODUCTS;
  return all.filter((p) => {
    if (p.availability === 'liveops') return false;
    if (p.requiresOwned && !ownsProduct(save, p.requiresOwned)) return false;
    if (p.hiddenWhenOwned?.some((id) => ownsProduct(save, id))) return false;
    return true;
  });
}

/** Commander booster track tier × 5 % plus the premium 10 %, capped at the advantage limit (30 %). */
export function boosterDiscount(save: SaveData): number {
  const track = COMMANDER_UPGRADES.find((u) => u.effect.kind === 'boosterDiscount');
  const tier = track ? Math.min(track.maxTier, save.upgrades[track.id] ?? 0) : 0;
  const fromTrack = track ? tier * track.effect.perTier : 0;
  const fromPremium = save.entitlements.premium ? 0.1 : 0;
  return Math.min(ADVANTAGE_LIMIT.totalBoosterDiscount, fromTrack + fromPremium);
}

/** Gold price of a booster after discounts (ceil, never below 1). */
export function boosterPrice(save: SaveData, kind: BoosterKind): number {
  const base = C.BOOSTER_COST[kind];
  return Math.max(1, Math.ceil(base * (1 - boosterDiscount(save)) - 1e-9));
}

/* ---------- skins ---------- */

export function skinById(id: string): SkinDef | undefined {
  return (SKINS as readonly SkinDef[]).find((s) => s.id === id);
}

/**
 * Catalog skin id → sprite skin id: every catalog look has a dedicated sprite named after it
 * (`roof_slate` → `roof.slate`, `helmet_viking` → `helmet.viking`, `theme_winter_night` →
 * `theme.winter_night`, `tower_keep` → `tower.keep`, `unit_robots` → `unit.robots`; see `ROOF_SKINS` /
 * `HELMET_SKINS` / `THEME_IDS` in `src/render/sprites.ts`).
 */
export function spriteSkinId(catalogId: string): string {
  return catalogId.replace('_', '.');
}

/** The equipped looks as the renderer wants them (undefined fields = default look / untinted terrain). */
export function equippedSkin(save: SaveData): TowerSkin {
  const { owned, equipped } = save.skins;
  const pick = (id: string | null): string | undefined => (id && owned.includes(id) ? spriteSkinId(id) : undefined);
  return { roof: pick(equipped.roof), helmet: pick(equipped.helmet), theme: pick(equipped.theme) };
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
