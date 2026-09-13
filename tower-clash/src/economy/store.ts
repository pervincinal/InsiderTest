/**
 * In-app purchase abstraction. The UI talks only to `StoreProvider`; the concrete provider is
 * RevenueCat inside a native shell (`providers/revenueCat.ts`) and an in-memory fake on the
 * web / in dev / in e2e (`providers/fakeStore.ts`).
 *
 * Contract for callers (Frontend Engineer):
 *   - Product ids are opaque strings from `src/economy/catalog.ts`.
 *   - Grant entitlements / currency ONLY when `purchase()` resolves `{ ok: true }`. Never grant
 *     on `error`, on a rejected promise, or before the promise settles.
 *   - `transactionId` (when present) is stable for a given store transaction: persist the ids you
 *     have already granted and skip duplicates, so a retry or a `restore()` never double-grants.
 *   - `restore()` returns the ids of NON-consumable products the user owns (e.g. "remove ads");
 *     consumables (crystal packs) are never restored. Grant each returned id idempotently.
 *   - Call `init()` once at startup (it never rejects); check `isAvailable()` before rendering
 *     buy buttons — when false, `purchase()` resolves `{ ok: false, error: 'unavailable' }`.
 *
 * Owned by the Mobile Engineer.
 */
import { isNative } from '../native/index';
import { fakeStore } from './providers/fakeStore';
import { revenueCatStore } from './providers/revenueCat';

export interface StoreProduct {
  /** Catalog / store product id (opaque). */
  id: string;
  /** Localized title from the store (or the catalog title in the fake). */
  title: string;
  /** Localized, formatted price, e.g. "$0.99" or "₼1,69". Show this string verbatim. */
  priceString: string;
  /** Price in micro-units of `currency` (0.99 USD -> 990000). For analytics / sorting only. */
  priceMicros: number;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
}

export type PurchaseError = 'cancelled' | 'unavailable' | 'failed';

export interface PurchaseResult {
  /** True only when the store confirmed the purchase. Grant the goods iff this is true. */
  ok: boolean;
  productId: string;
  /** Store transaction id when the store provides one; use it to de-duplicate grants. */
  transactionId?: string;
  /** Present iff `ok === false`. */
  error?: PurchaseError;
}

export interface StoreProvider {
  /** Configure the underlying SDK. Idempotent, never rejects (failures make `isAvailable()` false). */
  init(): Promise<void>;
  /** Store metadata for the given ids; ids unknown to the store are omitted from the result. */
  getProducts(ids: string[]): Promise<StoreProduct[]>;
  /** Run the platform purchase flow. Never rejects; errors are reported in the result. */
  purchase(id: string): Promise<PurchaseResult>;
  /** Owned non-consumable product ids (after asking the store to restore). Never rejects. */
  restore(): Promise<string[]>;
  /** False on the web, before `init()` finished, or when the store could not be configured. */
  isAvailable(): boolean;
}

let store: StoreProvider | null = null;

/** The store for this runtime: RevenueCat inside a native shell, the fake everywhere else. */
export function getStore(): StoreProvider {
  if (!store) store = isNative() ? revenueCatStore : fakeStore;
  return store;
}

/** Test hook: forget the cached provider so the next `getStore()` re-evaluates `isNative()`. */
export function resetStoreForTests(): void {
  store = null;
}
