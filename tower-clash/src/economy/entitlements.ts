/**
 * Entitlement queries over the save (ECONOMY.md §4): which products are owned / visible, whether
 * interstitials are disabled, the combined booster discount and the equipped cosmetic skins.
 * Read-only helpers; the wallet is the only writer.
 *
 * Owned by the Frontend Engineer.
 */
import { C } from '../sim/constants';
import type { TowerSkin } from '../render/sprites';
import type { SaveData } from '../ui/save';
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
 * Catalog skin id → sprite skin id (`src/render/sprites.ts` draws four roofs and two helmets in
 * Phase A; the remaining catalog looks reuse the closest sprite until the tech artist adds them).
 */
const SPRITE_SKIN: Readonly<Record<string, string>> = {
  roof_slate: 'roof.iron',
  roof_pagoda: 'roof.tent',
  roof_onion: 'roof.tent',
  roof_gold: 'roof.gold',
  helmet_bronze: 'helmet.plume',
  helmet_viking: 'helmet.plume',
  helmet_knight: 'helmet.plume',
  helmet_samurai: 'helmet.plume',
  helmet_royal: 'helmet.plume',
};

export function spriteSkinId(catalogId: string): string {
  return SPRITE_SKIN[catalogId] ?? (catalogId.startsWith('helmet') ? 'helmet.default' : 'roof.default');
}

/** The equipped looks as the renderer wants them (undefined fields = default look). */
export function equippedSkin(save: SaveData): TowerSkin {
  const { roof, helmet } = save.skins.equipped;
  return {
    roof: roof && save.skins.owned.includes(roof) ? spriteSkinId(roof) : undefined,
    helmet: helmet && save.skins.owned.includes(helmet) ? spriteSkinId(helmet) : undefined,
  };
}

/** Skins sold or shown in the shop (Phase A: roofs and helmets; terrain themes need renderer support). */
export function shopSkins(): SkinDef[] {
  return (SKINS as readonly SkinDef[]).filter((s) => s.category !== 'terrainTheme');
}
