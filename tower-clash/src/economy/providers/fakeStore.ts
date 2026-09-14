/**
 * Fake store for the web build, local development and e2e tests. Purchases "succeed" after a
 * short delay unless `configureFakeStore({ failNext })` was called. Prices come from
 * `src/economy/catalog.ts` (`priceUsd` per product) when that module exists at import time,
 * otherwise "$?.??".
 *
 * The frontend may expose `configureFakeStore` on its own debug hook (e.g.
 * `window.__towerclash.fakeStore.failNext(reason)`); this module does not touch `window`.
 */
import type { PurchaseError, PurchaseResult, StoreProduct, StoreProvider } from '../store';

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
 * Pull `{ id, priceUsd, title? }` entries out of whatever `catalog.ts` exports (arrays, records or
 * nested objects). Tolerant on purpose: the catalog is written concurrently by another role.
 */
function collectCatalogEntries(mod: unknown): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 4 || value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const rec = value as Record<string, unknown>;
    if (typeof rec.id === 'string' && typeof rec.priceUsd === 'number') {
      out.push({
        id: rec.id,
        priceUsd: rec.priceUsd,
        title: typeof rec.title === 'string' ? rec.title : typeof rec.name === 'string' ? rec.name : undefined,
      });
      return;
    }
    for (const child of Array.isArray(value) ? value : Object.values(rec)) visit(child, depth + 1);
  };
  visit(mod, 0);
  return out;
}

// `import.meta.glob` resolves to `{}` when the file does not exist, so this compiles and runs
// before the Monetization Designer's catalog lands. `eager` keeps it a static import in the bundle.
const catalogModules: Record<string, unknown> = import.meta.glob('../catalog.ts', { eager: true });
const catalogEntries = new Map<string, CatalogEntry>();
for (const mod of Object.values(catalogModules)) {
  for (const entry of collectCatalogEntries(mod)) catalogEntries.set(entry.id, entry);
}

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
