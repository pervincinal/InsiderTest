import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETRY_AFTER_MS, chunkBackoff, chunkFailures, chunkRecoverable, chunkUrlFromError, loadChunk, reloadOnce, resetChunkFailuresForTests } from '../../src/lazyChunk';

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

describe('loadChunk', () => {
  it('resolves through `load` and forgets earlier failures on success', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(SAFARI).mockResolvedValue('module');
    await expect(loadChunk('k', load)).rejects.toBe(SAFARI);
    expect(chunkFailures('k')).toBe(1);
    expect(chunkRecoverable('k')).toBe(false);
    // no URL known: the next call is a plain retry (works in browsers that do not pin the failure)
    expect(await loadChunk('k', load)).toBe('module');
    expect(load).toHaveBeenCalledTimes(2);
    expect(chunkFailures('k')).toBe(0);
  });

  it('counts consecutive failures and keeps the URL from the first error that named it', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(SAFARI).mockRejectedValueOnce(CHROMIUM);
    await expect(loadChunk('k', load)).rejects.toBe(SAFARI);
    await expect(loadChunk('k', load)).rejects.toBe(CHROMIUM);
    expect(chunkFailures('k')).toBe(2);
    expect(chunkRecoverable('k')).toBe(true); // the next call re-fetches `<url>?r=<time>` instead of `load`
  });

  it('chunkBackoff is true for RETRY_AFTER_MS after a failure (draw-time callers skip the load), never blocks a tap', async () => {
    const load = vi.fn<() => Promise<string>>().mockRejectedValue(SAFARI);
    expect(chunkBackoff('k')).toBe(false);
    await expect(loadChunk('k', load)).rejects.toBe(SAFARI);
    expect(chunkBackoff('k')).toBe(true);
    await expect(loadChunk('k', load)).rejects.toBe(SAFARI); // a tap retries at once
    expect(load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(1_000_000 + RETRY_AFTER_MS);
    expect(chunkBackoff('k')).toBe(false);
    expect(chunkBackoff('other')).toBe(false);
  });

  it('keys are independent', async () => {
    await expect(loadChunk('a', () => Promise.reject(SAFARI))).rejects.toBe(SAFARI);
    expect(await loadChunk('b', () => Promise.resolve(1))).toBe(1);
    expect(chunkFailures('a')).toBe(1);
    expect(chunkFailures('b')).toBe(0);
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
});
