import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROBE_TIMEOUT_MS, RETRY_AFTER_MS, chunkBackoff, chunkFailures, chunkReachable, chunkRecoverable, chunkUrlFromError, loadChunk, reloadOnce, resetChunkFailuresForTests, setChunkImportForTests, unwrapChunk } from '../../src/lazyChunk';

/*
 * BUG-8: a lazy chunk that failed once must be reachable again without a page reload. The browser's
 * module map keeps the failed URL, so the recovery is (a) a re-fetch under a fresh query when the
 * error names the URL, (b) a plain retry otherwise (draw-time callers back off via `chunkBackoff`), and (c) as the
 * last resort a one-shot page reload guarded by a sessionStorage flag (main.ts `chunkFailed`).
 */

beforeEach(() => {
  resetChunkFailuresForTests();
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

const CHROMIUM = new TypeError('Failed to fetch dynamically imported module: http://localhost:4173/assets/003-tRetwDss.js');
const FIREFOX = new TypeError('error loading dynamically imported module: https://play.example/assets/skinShapes-abc.js');
const SAFARI = new TypeError('Importing a module script failed.');

describe('chunkUrlFromError', () => {
  it('reads the module URL from Chromium and Firefox messages, none from Safari', () => {
    expect(chunkUrlFromError(CHROMIUM)).toBe('http://localhost:4173/assets/003-tRetwDss.js');
    expect(chunkUrlFromError(FIREFOX)).toBe('https://play.example/assets/skinShapes-abc.js');
    expect(chunkUrlFromError(new TypeError('Failed to fetch dynamically imported module: capacitor://localhost/assets/x-1.js?r=5'))).toBe('capacitor://localhost/assets/x-1.js');
    expect(chunkUrlFromError(SAFARI)).toBeNull();
    expect(chunkUrlFromError('offline')).toBeNull();
  });
});

/** What a lazy module looks like to `loadChunk`: an object with the export the caller names. */
interface Mod {
  ResultScreen: string;
}
const MODULE: Mod = { ResultScreen: 'class' };

describe('loadChunk', () => {
  afterEach(() => setChunkImportForTests(null));

  it('resolves through `load` and forgets earlier failures on success', async () => {
    const load = vi.fn<() => Promise<Mod>>().mockRejectedValueOnce(SAFARI).mockResolvedValue(MODULE);
    await expect(loadChunk('k', load, 'ResultScreen')).rejects.toBe(SAFARI);
    expect(chunkFailures('k')).toBe(1);
    expect(chunkRecoverable('k')).toBe(false);
    // no URL known: the next call is a plain retry (works in browsers that do not pin the failure)
    expect(await loadChunk('k', load, 'ResultScreen')).toBe(MODULE);
    expect(load).toHaveBeenCalledTimes(2);
    expect(chunkFailures('k')).toBe(0);
  });

  it('counts consecutive failures and keeps the URL from the first error that named it', async () => {
    const load = vi.fn<() => Promise<Mod>>().mockRejectedValueOnce(SAFARI).mockRejectedValueOnce(CHROMIUM);
    await expect(loadChunk('k', load, 'ResultScreen')).rejects.toBe(SAFARI);
    await expect(loadChunk('k', load, 'ResultScreen')).rejects.toBe(CHROMIUM);
    expect(chunkFailures('k')).toBe(2);
    expect(chunkRecoverable('k')).toBe(true); // the next call re-fetches `<url>?r=<time>` instead of `load`
  });

  it('chunkBackoff is true for RETRY_AFTER_MS after a failure (draw-time callers skip the load), never blocks a tap', async () => {
    const load = vi.fn<() => Promise<Mod>>().mockRejectedValue(SAFARI);
    expect(chunkBackoff('k')).toBe(false);
    await expect(loadChunk('k', load, 'ResultScreen')).rejects.toBe(SAFARI);
    expect(chunkBackoff('k')).toBe(true);
    await expect(loadChunk('k', load, 'ResultScreen')).rejects.toBe(SAFARI); // a tap retries at once
    expect(load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(1_000_000 + RETRY_AFTER_MS);
    expect(chunkBackoff('k')).toBe(false);
    expect(chunkBackoff('other')).toBe(false);
  });

  it('keys are independent', async () => {
    await expect(loadChunk('a', () => Promise.reject<Mod>(SAFARI), 'ResultScreen')).rejects.toBe(SAFARI);
    expect(await loadChunk('b', () => Promise.resolve(MODULE), 'ResultScreen')).toBe(MODULE);
    expect(chunkFailures('a')).toBe(1);
    expect(chunkFailures('b')).toBe(0);
  });

  /*
   * QA-49-2: the `?r=` re-fetch resolves the chunk's raw namespace. Where Rollup wrapped the dynamic import
   * (`import("./result-*.js").then(e => e.r)`: the module is a nested namespace export of a chunk that also
   * exports shared modules), the retry used to resolve `{ R, a, l, r }` and `new m.ResultScreen` threw —
   * the result and challenge chunks never recovered from one failed download (dry run 3). The caller's
   * `expect` finds the module in either shape; `load` is not called again (the module map pins its URL).
   */
  describe('the `?r=` re-fetch yields what `load` would have (QA-49-2)', () => {
    const RETRY_URL = /^http:\/\/localhost:4173\/assets\/003-tRetwDss\.js\?r=\d+$/;

    it('a wrapped namespace (`.then(e => e.r)` chunks): the nested module that carries `expect`', async () => {
      const load = vi.fn<() => Promise<Mod>>().mockRejectedValue(CHROMIUM);
      const raw = { R: 'translateNote', a: 'lastShareRecord', l: 'logLevelEnd', r: MODULE }; // the built result-*.js exports
      const importUrl = vi.fn<(url: string) => Promise<unknown>>().mockResolvedValue(raw);
      setChunkImportForTests(importUrl);
      await expect(loadChunk('result', load, 'ResultScreen')).rejects.toBe(CHROMIUM);
      expect(await loadChunk('result', load, 'ResultScreen')).toBe(MODULE);
      expect(importUrl).toHaveBeenCalledTimes(1);
      expect(importUrl.mock.calls[0]![0]).toMatch(RETRY_URL);
      expect(load, 'the pinned URL is never imported again').toHaveBeenCalledTimes(1);
      expect(chunkFailures('result')).toBe(0);
    });

    it('a facade chunk (the module is the chunk): the raw namespace itself', async () => {
      setChunkImportForTests(() => Promise.resolve({ ...MODULE, other: 1 }));
      await expect(loadChunk('k', () => Promise.reject<Mod>(FIREFOX), 'ResultScreen')).rejects.toBe(FIREFOX);
      expect(await loadChunk('k', () => Promise.reject<Mod>(new Error('must not run')), 'ResultScreen')).toEqual({ ...MODULE, other: 1 });
    });

    it('a top-level export wins over a nested namespace with the same name', async () => {
      const nested = { ResultScreen: 'nested' };
      setChunkImportForTests(() => Promise.resolve({ ResultScreen: 'top', n: nested }));
      await expect(loadChunk('k', () => Promise.reject<Mod>(CHROMIUM), 'ResultScreen')).rejects.toBe(CHROMIUM);
      expect((await loadChunk('k', () => Promise.reject<Mod>(SAFARI), 'ResultScreen')).ResultScreen).toBe('top');
    });

    it('a namespace without `expect` anywhere rejects (TypeError naming the chunk) and counts as a failure that keeps the URL', async () => {
      setChunkImportForTests(() => Promise.resolve({ a: 1, b: { c: 2 } }));
      await expect(loadChunk('k', () => Promise.reject<Mod>(CHROMIUM), 'ResultScreen')).rejects.toBe(CHROMIUM);
      await expect(loadChunk('k', () => Promise.reject<Mod>(SAFARI), 'ResultScreen')).rejects.toThrow(/003-tRetwDss\.js has no export 'ResultScreen'/);
      expect(chunkFailures('k')).toBe(2);
      expect(chunkRecoverable('k')).toBe(true);
    });

    it('unwrapChunk on its own: module object, nested namespace, a `default`-only level chunk', () => {
      expect(unwrapChunk<Mod>(MODULE, 'ResultScreen', 'x')).toBe(MODULE);
      expect(unwrapChunk<Mod>({ r: MODULE }, 'ResultScreen', 'x')).toBe(MODULE);
      const level = { id: 3, towers: [] };
      expect(unwrapChunk<typeof level>({ default: level }, 'towers', 'x')).toBe(level); // levels/index.ts: `entry.load` resolves `m.default`
      expect(() => unwrapChunk<Mod>(null, 'ResultScreen', 'x')).toThrow(TypeError);
      expect(() => unwrapChunk<Mod>({ r: null }, 'ResultScreen', 'x')).toThrow(TypeError);
    });
  });
});

/*
 * QA-49-1: a static dependency the module map pinned as failed makes every `?r=` re-fetch of the top chunk
 * fail without a request (the dependency's URL never changes). The probe tells that case — the chunk's own
 * bytes arrive — from a network that is still down, so main.ts `chunkFailed` reloads once only when it helps.
 */
describe('chunkReachable', () => {
  const okResponse = { ok: true } as Response;

  it('no failure or no URL known → false without a request', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await chunkReachable('none', fetchFn)).toBe(false);
    await expect(loadChunk('k', () => Promise.reject<Mod>(SAFARI), 'ResultScreen')).rejects.toBe(SAFARI);
    expect(await chunkReachable('k', fetchFn)).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('GETs the failed URL under a fresh query with no cache; true on 2xx', async () => {
    await expect(loadChunk('k', () => Promise.reject<Mod>(CHROMIUM), 'ResultScreen')).rejects.toBe(CHROMIUM);
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okResponse);
    expect(await chunkReachable('k', fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(String(url)).toMatch(/^http:\/\/localhost:4173\/assets\/003-tRetwDss\.js\?r=\d+$/);
    expect(init?.cache).toBe('no-store');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a network error or a non-2xx answer → false, never rejects', async () => {
    await expect(loadChunk('k', () => Promise.reject<Mod>(CHROMIUM), 'ResultScreen')).rejects.toBe(CHROMIUM);
    expect(await chunkReachable('k', () => Promise.reject(new TypeError('Failed to fetch')))).toBe(false);
    expect(await chunkReachable('k', () => Promise.resolve({ ok: false, status: 404 } as Response))).toBe(false);
  });

  it('a request that hangs is aborted after PROBE_TIMEOUT_MS → false', async () => {
    await expect(loadChunk('k', () => Promise.reject<Mod>(CHROMIUM), 'ResultScreen')).rejects.toBe(CHROMIUM);
    const fetchFn: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    const probe = chunkReachable('k', fetchFn);
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS + 1);
    expect(await probe).toBe(false);
  });
});

describe('reloadOnce', () => {
  function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  }

  it('grants exactly one reload per storage (session)', () => {
    const s = memory();
    expect(reloadOnce(s)).toBe(true);
    expect(reloadOnce(s)).toBe(false);
    expect(reloadOnce(memory())).toBe(true);
  });

  it('never reloads without a working storage (no way to stop a loop)', () => {
    expect(reloadOnce(null)).toBe(false);
    const broken: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(reloadOnce(broken)).toBe(false);
  });

  /*
   * REV-35: the default argument probes the real `sessionStorage`. Node has none (→ null → false); a
   * browser with storage blocked throws SecurityError on the getter itself, which used to escape
   * `reloadOnce` (and main.ts `chunkFailed`'s rejection handler: no load-failed toast, an unhandled
   * rejection). `globalThis.sessionStorage` is defined per test and restored after.
   */
  describe('default storage (REV-35)', () => {
    const define = (desc: PropertyDescriptor) => Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, ...desc });
    afterEach(() => {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    });

    it('no sessionStorage at all (Node) → false, no throw', () => {
      expect(typeof sessionStorage).toBe('undefined');
      expect(reloadOnce()).toBe(false);
    });

    it('a working sessionStorage grants exactly one reload', () => {
      define({ value: memory(), writable: true });
      expect(reloadOnce()).toBe(true);
      expect(reloadOnce()).toBe(false);
    });

    it('a blocked sessionStorage (the getter throws SecurityError, Chromium) → false, no throw', () => {
      define({
        get() {
          throw new DOMException('Failed to read the sessionStorage property from Window: Access is denied for this document.', 'SecurityError');
        },
      });
      expect(() => typeof sessionStorage, 'the probe itself throws without the guard').toThrow(DOMException);
      expect(reloadOnce()).toBe(false);
      expect(reloadOnce()).toBe(false);
    });
  });
});
