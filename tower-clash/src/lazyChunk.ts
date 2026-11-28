/**
 * Recovery for lazy chunks (BUG-8). The browser's module map remembers a failed module fetch for
 * the life of the page, so a plain retry of the same `import()` rejects at once without a request:
 * a level, the menu screens or the silhouette skins that failed once on a flaky connection would
 * stay unreachable until a reload.
 *
 * `loadChunk` wraps every dynamic import in the game. On a failure it remembers the chunk's URL
 * when the error names it (Chromium: "Failed to fetch dynamically imported module: <url>",
 * Firefox: "error loading dynamically imported module: <url>") and the next call re-fetches that
 * URL under a cache-busting query (`?r=<time>`): a fresh module-map entry, and its relative
 * imports still resolve to the already loaded shared chunks. When the URL is unknown (Safari says
 * only "Importing a module script failed.") the caller can fall back to `reloadOnce`.
 *
 * QA-49-2: the URL re-fetch resolves the chunk's RAW namespace, which is not always what `load` resolves.
 * Where a dynamically imported module is not its chunk's facade (the chunk also exports modules other
 * chunks import statically — result-*.js, challengeRecord-*.js, store-*.js in the 2026-11-28 build),
 * Rollup exports the module as a nested namespace and rewrites the import to
 * `import("./result-*.js").then(e => e.r)`; the retry never ran that `.then`, so after a failed download
 * the result chunk resolved `{ R, a, l, r }` and `new m.ResultScreen` threw. Every caller therefore names
 * one export of the module it loads (`expect`), and the re-fetch resolves whichever of the raw namespace
 * or its nested namespaces carries it — the module itself whenever the module is the chunk's facade.
 *
 * QA-49-1: the re-fetch renews the top module only; a static dependency the module map pinned as
 * failed makes every retry fail without a request. `chunkReachable` tells that case (the chunk's own
 * bytes arrive) from a network that is still down, so the app shell reloads once only when a reload can help.
 */

interface ChunkFailure {
  /** Consecutive failures of this chunk on this page. */
  count: number;
  /** Chunk URL from the last error, when the browser named it. */
  url: string | null;
  at: number;
}

/** Draw-time callers (`chunkBackoff`) wait this long after a failure before another network attempt. */
export const RETRY_AFTER_MS = 3000;
/** `chunkReachable` gives up on its probe request after this long (a hanging network is "not reachable"). */
export const PROBE_TIMEOUT_MS = 10_000;
const RELOAD_FLAG = 'towerclash.chunkReload';

const failures = new Map<string, ChunkFailure>();

type ImportUrl = (url: string) => Promise<unknown>;
const importUrl: ImportUrl = (url) => import(/* @vite-ignore */ url) as Promise<unknown>;
let importForRetry: ImportUrl = importUrl;

/**
 * Load a chunk through `load`; after a failure that named the URL, re-fetch that URL under a fresh query.
 * `expect` names one export of the module `load` resolves (e.g. `'ResultScreen'` for the result chunk,
 * `'towers'` for a level): the re-fetch resolves the raw chunk namespace, and `expect` finds the module in
 * it where Rollup wrapped the dynamic import (QA-49-2, see `unwrapChunk`). Always required, so no caller
 * can resolve a wrapped namespace by accident.
 */
export function loadChunk<T extends object>(key: string, load: () => Promise<T>, expect: keyof T & string): Promise<T> {
  const prev = failures.get(key);
  const attempt = prev?.url ? importForRetry(`${prev.url}?r=${Date.now()}`).then((m) => unwrapChunk<T>(m, expect, prev.url ?? key)) : load();
  return attempt.then(
    (m) => {
      failures.delete(key);
      return m;
    },
    (err: unknown) => {
      failures.set(key, { count: (prev?.count ?? 0) + 1, url: chunkUrlFromError(err) ?? prev?.url ?? null, at: Date.now() });
      throw err;
    },
  );
}

/** The module URL named by a failed-import error, or null. */
export function chunkUrlFromError(err: unknown): string | null {
  return /[a-z]+:\/\/\S+?\.js/.exec(String(err))?.[0] ?? null;
}

const hasExport = (m: unknown, name: string): boolean => (typeof m === 'object' || typeof m === 'function') && m !== null && name in m;

/**
 * The module with export `expect` inside the raw namespace of a URL re-fetch: the namespace itself when the
 * module is the chunk's facade (its exports are the chunk's), else the nested namespace Rollup exported it as
 * (`export { r }` for a `.then(e => e.r)` import — QA-49-2). Throws a TypeError naming the chunk when neither
 * carries it (a stale or foreign chunk); the caller's failure path then runs, as for a failed download.
 */
export function unwrapChunk<T extends object>(raw: unknown, expect: keyof T & string, chunk: string): T {
  if (hasExport(raw, expect)) return raw as T;
  if (typeof raw === 'object' && raw !== null) for (const nested of Object.values(raw)) if (hasExport(nested, expect)) return nested as T;
  throw new TypeError(`chunk ${chunk} has no export '${expect}' (QA-49-2)`);
}

/**
 * QA-49-1: after `key` failed again under a fresh URL — does the chunk itself arrive? True means the network
 * is fine and the failure is in the chunk's graph (a static dependency the module map pinned as failed),
 * which only a reload can clear; false means offline / still failing (or no URL known), where a reload
 * would not help. One `GET <url>?r=<time>` (no cache), bounded by `PROBE_TIMEOUT_MS`; never rejects.
 */
export function chunkReachable(key: string, fetchFn: typeof fetch = (...args) => fetch(...args)): Promise<boolean> {
  const url = failures.get(key)?.url;
  if (!url) return Promise.resolve(false);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  return fetchFn(`${url}?r=${Date.now()}`, { cache: 'no-store', signal: abort.signal })
    .then(
      (res) => res.ok,
      () => false,
    )
    .finally(() => clearTimeout(timer));
}

/** True within `RETRY_AFTER_MS` of a failure: callers that would otherwise retry every frame skip the load. */
export function chunkBackoff(key: string): boolean {
  const prev = failures.get(key);
  return prev !== undefined && Date.now() - prev.at < RETRY_AFTER_MS;
}

/** Consecutive failures of `key` on this page (0 after a success). */
export function chunkFailures(key: string): number {
  return failures.get(key)?.count ?? 0;
}

/** True when the next `loadChunk(key)` would re-fetch under a fresh URL (the browser named it). */
export function chunkRecoverable(key: string): boolean {
  return failures.get(key)?.url != null;
}

type ReloadStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * `sessionStorage`, or null when it is absent or blocked. REV-35: with storage blocked, Chromium throws
 * SecurityError on the getter itself, so a bare `typeof sessionStorage` probe throws too — out of
 * `reloadOnce`'s own try/catch and out of `chunkFailed`'s rejection handler, i.e. no toast and an
 * unhandled rejection instead of "no storage → no reload". Same probe as src/ui/save.ts `storage()`.
 */
function sessionStorageOrNull(): ReloadStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Last resort when a chunk keeps failing and the browser never named its URL: reload the page,
 * once per tab session (a sessionStorage flag stops any loop; no storage → no reload). Returns
 * false when the reload was already spent or storage is unavailable or blocked; never throws.
 */
export function reloadOnce(storage: ReloadStorage | null = sessionStorageOrNull()): boolean {
  try {
    if (!storage || storage.getItem(RELOAD_FLAG)) return false;
    storage.setItem(RELOAD_FLAG, '1');
  } catch {
    return false;
  }
  return true;
}

/** Test hook: forget every recorded failure. */
export function resetChunkFailuresForTests(): void {
  failures.clear();
}

/** Test hook: what the `?r=` re-fetch imports with (default: the browser's `import(url)`); null restores it. */
export function setChunkImportForTests(fn: ImportUrl | null): void {
  importForRetry = fn ?? importUrl;
}
