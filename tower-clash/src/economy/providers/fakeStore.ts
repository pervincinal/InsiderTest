/**
 * Fake store for the web build, local development and e2e tests. Purchases "succeed" after a
 * short delay unless `configureFakeStore({ failNext })` was called. Prices come from
 * `src/economy/catalog.ts` (`IAP_PRODUCTS[].priceUsd`); an id the catalog does not know shows "$?.??".
 *
 * The frontend may expose `configureFakeStore` on its own debug hook (e.g.
 * `window.__towerclash.fakeStore.failNext(reason)`); this module does not touch `window`.
 */
import type { PurchaseError, PurchaseResult, StoreProduct, StoreProvider } from '../store';
import type { IapProductDef } from '../catalog';
import { IAP_PRODUCTS } from '../catalog';

export const FAKE_PURCHASE_DELAY_MS = 300;

export interface FakeStoreOptions {
  /**
   * Make the next `purchase()` fail with this reason (one-shot; `null` clears a pending failure).
   */
  failNext?: PurchaseError | null;
  /** Non-consumable ids that `restore()` should report as owned (replaces the previous list). */
  owned?: string[];
  /** Delay before a purchase settles, in ms (default 300). */
  delayMs?: number;
  /** Extra / overriding prices in USD by product id (merged over the catalog prices). */
  prices?: Record<string, number>;
}

interface CatalogEntry {
  id: string;
  priceUsd: number;
  title?: string;
}

/**
 * The store products of the catalog by id (`IAP_PRODUCTS` are the only catalog entries with a
 * `priceUsd`). PERF-11: a named import, not the old `import.meta.glob` walk over the whole module —
 * that namespace pinned every catalog export (offers, price points, …) into the eager bundle.
 */
const catalogEntries = new Map<string, CatalogEntry>((IAP_PRODUCTS as readonly IapProductDef[]).map((p) => [p.id, { id: p.id, priceUsd: p.priceUsd, title: p.title }]));

let failNext: PurchaseError | null = null;
let owned = new Set<string>();
let delayMs = FAKE_PURCHASE_DELAY_MS;
const priceOverrides = new Map<string, number>();
let initialized = false;
let txCounter = 0;

export function configureFakeStore(options: FakeStoreOptions): void {
  if ('failNext' in options) failNext = options.failNext ?? null;
  if (options.owned) owned = new Set(options.owned);
  if (typeof options.delayMs === 'number') delayMs = Math.max(0, options.delayMs);
  if (options.prices) for (const [id, usd] of Object.entries(options.prices)) priceOverrides.set(id, usd);
}

/** Test hook: back to a pristine fake (keeps catalog prices). */
export function resetFakeStore(): void {
  failNext = null;
  owned = new Set();
  delayMs = FAKE_PURCHASE_DELAY_MS;
  priceOverrides.clear();
  initialized = false;
  txCounter = 0;
}

function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function productFor(id: string): StoreProduct {
  const entry = catalogEntries.get(id);
  const usd = priceOverrides.get(id) ?? entry?.priceUsd;
  return {
    id,
    title: entry?.title ?? id,
    priceString: usd === undefined ? '$?.??' : formatUsd(usd),
    priceMicros: usd === undefined ? 0 : Math.round(usd * 1_000_000),
    currency: 'USD',
  };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const fakeStore: StoreProvider = {
  async init(): Promise<void> {
    initialized = true;
  },

  isAvailable(): boolean {
    return initialized;
  },

  async getProducts(ids: string[]): Promise<StoreProduct[]> {
    return ids.map(productFor);
  },

  async purchase(id: string): Promise<PurchaseResult> {
    const failure = failNext;
    failNext = null;
    await sleep(delayMs);
    if (failure) return { ok: false, productId: id, error: failure };
    owned.add(id);
    txCounter += 1;
    return { ok: true, productId: id, transactionId: `fake-${txCounter}` };
  },

  async restore(): Promise<string[]> {
    // The fake cannot tell consumables from non-consumables: it reports every id purchased in
    // this session plus `configureFakeStore({ owned })`. Callers must only treat catalog
    // non-consumables as entitlements.
    await sleep(Math.min(delayMs, 50));
    return [...owned];
  },

  async getSupportId(): Promise<string | null> {
    // No purchase backend on the web: there is no record to reference, so no id (the UI hides
    // the "Support ID" row).
    return null;
  },
};
