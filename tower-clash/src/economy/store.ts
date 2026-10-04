/**
 * In-app purchase abstraction. The UI talks only to `StoreProvider`; the concrete provider is
 * RevenueCat inside a native shell (`providers/revenueCat.ts`) and an in-memory fake on the
 * web / in dev / in e2e (`providers/fakeStore.ts`).
 *
 * The RevenueCat provider (and `providers/config.ts` + `capacitor.config.ts` behind it) is NOT
 * part of the eager web bundle (PERF-7): `getStore()` returns a thin wrapper inside a native
 * shell whose `init()` loads `./providers/revenueCat` with a dynamic `import()` and delegates
 * everything to it from then on. Before that resolves — and forever if the chunk fails to load —
 * the wrapper answers like an unconfigured store (`isAvailable()` false, `purchase()` resolves
 * `error: 'unavailable'`, empty products/restore, `null` support id). The web build never
 * requests the chunk.
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
 *   - Settings → About → "Support ID" (privacy policy B.7): show `await getSupportId()` verbatim
 *     with a copy button; hide the row when it resolves `null` (web, or store unavailable).
 *
 * Owned by the Mobile Engineer.
 */
import { isNative } from '../native/index';
import { fakeStore } from './providers/fakeStore';

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
  /**
   * Anonymous, per-install identifier the purchase backend knows this player by (RevenueCat app
   * user id, e.g. `$RCAnonymousID:…`). Shown as "Support ID" so a player can ask for their
   * purchase record to be deleted. `null` on the web, before `init()`, or when the store is
   * unavailable. Never rejects. It is not a secret, but do not log or send it anywhere.
   */
  getSupportId(): Promise<string | null>;
}

let store: StoreProvider | null = null;

/** The RevenueCat provider once its chunk has loaded (native shells only). */
let native: StoreProvider | null = null;
let nativeInit: Promise<void> | null = null;

/**
 * Native-shell provider: loads `providers/revenueCat` on demand inside `init()` and delegates to
 * it. Until the chunk is loaded (or when loading fails) it answers like an unconfigured store —
 * the same values `revenueCatStore` itself returns before its own `init()`.
 */
const lazyRevenueCat: StoreProvider = {
  init(): Promise<void> {
    if (!nativeInit) {
      nativeInit = (async () => {
        try {
          const { revenueCatStore } = await import('./providers/revenueCat');
          native = revenueCatStore;
          await revenueCatStore.init();
        } catch (err) {
          // Chunk missing / SDK evaluation failed: stay unavailable, the UI hides buy buttons.
          console.warn('[store] RevenueCat provider failed to load:', err);
        }
      })();
    }
    return nativeInit;
  },
  isAvailable(): boolean {
    return native !== null && native.isAvailable();
  },
  getProducts(ids: string[]): Promise<StoreProduct[]> {
    return native ? native.getProducts(ids) : Promise.resolve([]);
  },
  purchase(id: string): Promise<PurchaseResult> {
    return native ? native.purchase(id) : Promise.resolve({ ok: false, productId: id, error: 'unavailable' });
  },
  restore(): Promise<string[]> {
    return native ? native.restore() : Promise.resolve([]);
  },
  getSupportId(): Promise<string | null> {
    return native ? native.getSupportId() : Promise.resolve(null);
  },
};

/**
 * The web build with the store switched off (`?store=off`, FE-6): answers like an unconfigured
 * native store so the no-IAP shop (two tabs, no pack-only skins) can be seen and e2e-tested.
 */
const storeOff: StoreProvider = {
  init: () => Promise.resolve(),
  isAvailable: () => false,
  getProducts: () => Promise.resolve([]),
  purchase: (id) => Promise.resolve({ ok: false, productId: id, error: 'unavailable' }),
  restore: () => Promise.resolve([]),
  getSupportId: () => Promise.resolve(null),
};

/**
 * `?store=off` in the page URL (web only, read once per session by `getStore()`): the store
 * reports unavailable. Ignored inside a native shell.
 */
export function storeOffByUrl(native: boolean = isNative()): boolean {
  return !native && typeof location !== 'undefined' && /[?&]store=off(&|$)/.test(location.search);
}

/**
 * The store for this runtime: RevenueCat inside a native shell (loaded lazily by `init()`), the
 * fake everywhere else (or an unavailable store on the web with `?store=off`).
 */
export function getStore(): StoreProvider {
  if (!store) store = isNative() ? lazyRevenueCat : storeOffByUrl(false) ? storeOff : fakeStore;
  return store;
}

/**
 * Test hook: forget the cached provider (and the lazily loaded RevenueCat module) so the next
 * `getStore()` re-evaluates `isNative()` and the next `init()` imports again.
 */
export function resetStoreForTests(): void {
  store = null;
  native = null;
  nativeInit = null;
}
