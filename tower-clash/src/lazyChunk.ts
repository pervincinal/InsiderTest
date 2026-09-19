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
 */

interface ChunkFailure {
  /** Consecutive failures of this chunk on this page. */
  count: number;
  /** Chunk URL from the last error, when the browser named it. */
  url: string | null;
  at: number;
}

export interface LoadChunkOptions<T> {
  /** Maps the raw module namespace of a URL re-fetch to what `load` resolves (default: the module itself). */
  unwrap?: (module: unknown) => T;
}

/** Draw-time callers (`chunkBackoff`) wait this long after a failure before another network attempt. */
export const RETRY_AFTER_MS = 3000;
const RELOAD_FLAG = 'towerclash.chunkReload';

const failures = new Map<string, ChunkFailure>();

/** Load a chunk through `load`; after a failure that named the URL, re-fetch that URL under a fresh query. */
export function loadChunk<T>(key: string, load: () => Promise<T>, opts: LoadChunkOptions<T> = {}): Promise<T> {
  const prev = failures.get(key);
  const attempt = prev?.url
    ? (import(/* @vite-ignore */ `${prev.url}?r=${Date.now()}`) as Promise<unknown>).then((m) => (opts.unwrap ? opts.unwrap(m) : (m as T)))
    : load();
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

/**
 * Last resort when a chunk keeps failing and the browser never named its URL: reload the page,
 * once per tab session (a sessionStorage flag stops any loop; no storage → no reload). Returns
 * false when the reload was already spent or storage is unavailable.
 */
export function reloadOnce(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): boolean {
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
