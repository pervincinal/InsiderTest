/**
 * Entitlement queries over the save (ECONOMY.md §4): which products are owned, whether interstitials
 * are disabled, the combined booster discount and the equipped cosmetic skins. What the shop lists is in
 * shopListing.ts (the shop's lazy chunk, PERF-12).
 * Read-only helpers; the wallet is the only writer.
 *
 * Owned by the Frontend Engineer.
 */
import { C } from '../sim/constants';
import type { TowerSkin } from '../render/sprites';
import type { SaveData } from '../ui/save';
import type { SkinDef } from './catalog';
import { ADVANTAGE_LIMIT, COMMANDER_UPGRADES, INTERSTITIAL_RULES, SKINS } from './catalog';

type BoosterKind = keyof typeof C.BOOSTER_COST;

/** True when the one-time product was granted (consumables are never "owned"). */
export function ownsProduct(save: SaveData, productId: string): boolean {
  return save.purchases.includes(`owned:${productId}`);
}

/** `remove_ads` / `premium_bundle` owners never see interstitials (INTERSTITIAL_RULES.disabledByProducts). */
export function interstitialsDisabled(save: SaveData): boolean {
  return save.entitlements.noAds || INTERSTITIAL_RULES.disabledByProducts.some((id) => ownsProduct(save, id));
}

/** Highest level id with at least one star (0 when none) — the "after level N" gate of ECONOMY.md §4. */
export function highestClearedLevel(save: SaveData): number {
  let best = 0;
  for (const [key, stars] of Object.entries(save.stars)) {
    const id = Number(key);
    if (stars >= 1 && Number.isInteger(id) && id > best) best = id;
  }
  return best;
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

