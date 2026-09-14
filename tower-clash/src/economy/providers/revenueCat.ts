/**
 * RevenueCat-backed store for the native shells (`@revenuecat/purchases-capacitor`, exact pin in
 * package.json). The plugin is loaded with a dynamic `import()` so the web bundle never contains
 * it; on the web this provider is simply never selected (see `store.ts`).
 *
 * RevenueCat dashboard conventions this code relies on (docs/MOBILE.md §8):
 *   - Product ids in App Store Connect / Play Console equal the catalog ids.
 *   - Every product is attached to a package of an offering (any offering, any package id) so it
 *     shows up in `getOfferings()`; ids missing from the offerings are fetched by id as a fallback.
 *   - Every NON-consumable (remove ads, permanent bundles) is attached to an entitlement;
 *     consumables (crystal packs) have no entitlement. `restore()` reports the product ids behind
 *     the ACTIVE entitlements, which is exactly the "owned non-consumables" set.
 */
import { getPlatform } from '../../native/index';
import type { PurchaseError, PurchaseResult, StoreProduct, StoreProvider } from '../store';
import { revenueCatApiKey } from './config';

type RcModule = typeof import('@revenuecat/purchases-capacitor');
type RcPackage = import('@revenuecat/purchases-capacitor').PurchasesPackage;
type RcProduct = import('@revenuecat/purchases-capacitor').PurchasesStoreProduct;
type RcCustomerInfo = import('@revenuecat/purchases-capacitor').CustomerInfo;

// String values of PURCHASES_ERROR_CODE (the enum is not imported to keep the module type-only
// until `init()` runs; the values are part of RevenueCat's public contract).
const RC_ERR = {
  PURCHASE_CANCELLED: '1',
  STORE_PROBLEM: '2',
  PURCHASE_NOT_ALLOWED: '3',
  PRODUCT_NOT_AVAILABLE: '5',
  PRODUCT_ALREADY_PURCHASED: '6',
  CONFIGURATION: '23',
  UNSUPPORTED: '24',
} as const;

let rc: RcModule | null = null;
let available = false;
let initPromise: Promise<void> | null = null;
let purchaseInFlight = false;
const packagesById = new Map<string, RcPackage>();
const productsById = new Map<string, RcProduct>();

function warn(what: string, err: unknown): void {
  console.warn(`[store/revenuecat] ${what} failed:`, err);
}

function toStoreProduct(p: RcProduct): StoreProduct {
  return {
    id: p.identifier,
    title: p.title || p.identifier,
    priceString: p.priceString,
    priceMicros: Math.round(p.price * 1_000_000),
    currency: p.currencyCode,
  };
}

/** Refresh the package cache from all offerings; swallow errors (store may be offline). */
async function loadOfferings(mod: RcModule): Promise<void> {
  try {
    const offerings = await mod.Purchases.getOfferings();
    for (const offering of Object.values(offerings.all)) {
      for (const pkg of offering.availablePackages) {
        packagesById.set(pkg.product.identifier, pkg);
        productsById.set(pkg.product.identifier, pkg.product);
      }
    }
  } catch (err) {
    warn('getOfferings', err);
  }
}

/** Fetch products by id (fallback for ids not present in any offering). */
async function loadProductsById(mod: RcModule, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const { products } = await mod.Purchases.getProducts({
      productIdentifiers: ids,
      type: mod.PRODUCT_CATEGORY.NON_SUBSCRIPTION,
    });
    for (const p of products) productsById.set(p.identifier, p);
  } catch (err) {
    warn('getProducts', err);
  }
}

function ownedNonConsumables(info: RcCustomerInfo): string[] {
  const ids = new Set<string>();
  for (const ent of Object.values(info.entitlements.active)) {
    if (ent.isActive && ent.productIdentifier) ids.add(ent.productIdentifier);
  }
  return [...ids];
}

/** Map a rejection from the RevenueCat bridge to our error vocabulary. */
export function mapRevenueCatError(err: unknown): PurchaseError | 'alreadyOwned' {
  const e = (err ?? {}) as { code?: unknown; userCancelled?: unknown };
  const code = e.code === undefined || e.code === null ? '' : String(e.code);
  if (e.userCancelled === true || code === RC_ERR.PURCHASE_CANCELLED) return 'cancelled';
  if (code === RC_ERR.PRODUCT_ALREADY_PURCHASED) return 'alreadyOwned';
  if (
    code === RC_ERR.PRODUCT_NOT_AVAILABLE ||
    code === RC_ERR.PURCHASE_NOT_ALLOWED ||
    code === RC_ERR.STORE_PROBLEM ||
    code === RC_ERR.CONFIGURATION ||
    code === RC_ERR.UNSUPPORTED
  ) {
    return 'unavailable';
  }
  return 'failed';
}

async function doInit(): Promise<void> {
  const platform = getPlatform();
  if (platform === 'web') return;
  const apiKey = revenueCatApiKey(platform);
  if (!apiKey) {
    console.warn('[store/revenuecat] no API key configured for', platform, '- store unavailable');
    return;
  }
  try {
    const mod = await import('@revenuecat/purchases-capacitor');
    if (import.meta.env?.DEV) {
      await mod.Purchases.setLogLevel({ level: mod.LOG_LEVEL.DEBUG }).catch(() => undefined);
    }
    // Anonymous app user id: RevenueCat generates and persists one per install. The game has
    // no accounts, so there is nothing to `logIn` with.
    await mod.Purchases.configure({ apiKey });
    rc = mod;
    available = true;
    void loadOfferings(mod);
  } catch (err) {
    warn('configure', err);
    rc = null;
    available = false;
  }
}

export const revenueCatStore: StoreProvider = {
  init(): Promise<void> {
    if (!initPromise) initPromise = doInit();
    return initPromise;
  },

  isAvailable(): boolean {
    return available && rc !== null;
  },

  async getProducts(ids: string[]): Promise<StoreProduct[]> {
    if (!rc) return [];
    const missing = ids.filter((id) => !productsById.has(id));
    if (missing.length > 0) {
      await loadOfferings(rc);
      await loadProductsById(rc, missing.filter((id) => !productsById.has(id)));
    }
    const out: StoreProduct[] = [];
    for (const id of ids) {
      const p = productsById.get(id);
      if (p) out.push(toStoreProduct(p));
    }
    return out;
  },

  async purchase(id: string): Promise<PurchaseResult> {
    if (!rc) return { ok: false, productId: id, error: 'unavailable' };
    if (purchaseInFlight) return { ok: false, productId: id, error: 'failed' };
    purchaseInFlight = true;
    try {
      if (!productsById.has(id)) await this.getProducts([id]);
      const pkg = packagesById.get(id);
      const product = productsById.get(id);
      if (!pkg && !product) return { ok: false, productId: id, error: 'unavailable' };
      const result = pkg
        ? await rc.Purchases.purchasePackage({ aPackage: pkg })
        : await rc.Purchases.purchaseStoreProduct({ product: product as RcProduct });
      return {
        ok: true,
        productId: result.productIdentifier || id,
        transactionId: result.transaction?.transactionIdentifier || undefined,
      };
    } catch (err) {
      const mapped = mapRevenueCatError(err);
      if (mapped === 'alreadyOwned') {
        // Non-consumable the user already owns (e.g. re-tapping "remove ads" after a reinstall):
        // the store refuses to sell it twice, so treat it as owned. No transaction id — the
        // caller's idempotent grant makes this safe.
        return { ok: true, productId: id };
      }
      if (mapped !== 'cancelled') warn(`purchase(${id})`, err);
      return { ok: false, productId: id, error: mapped };
    } finally {
      purchaseInFlight = false;
    }
  },

  async restore(): Promise<string[]> {
    if (!rc) return [];
    try {
      const { customerInfo } = await rc.Purchases.restorePurchases();
      return ownedNonConsumables(customerInfo);
    } catch (err) {
      warn('restorePurchases', err);
      try {
        const { customerInfo } = await rc.Purchases.getCustomerInfo();
        return ownedNonConsumables(customerInfo);
      } catch {
        return [];
      }
    }
  },

  async getSupportId(): Promise<string | null> {
    if (!rc) return null;
    try {
      const { appUserID } = await rc.Purchases.getAppUserID();
      return typeof appUserID === 'string' && appUserID.length > 0 ? appUserID : null;
    } catch (err) {
      warn('getAppUserID', err);
      return null;
    }
  },
};

/** Test hook. */
export function resetRevenueCatForTests(): void {
  rc = null;
  available = false;
  initPromise = null;
  purchaseInFlight = false;
  packagesById.clear();
  productsById.clear();
}
