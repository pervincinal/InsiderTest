import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetWorkerWarmForTests, warmWorkerCache, warmableUrls } from '../../src/swWarm';

/*
 * FE-8: the files a first launch loads before the service worker claims it are re-requested through
 * the worker on `controllerchange`, so the offline relaunch has its dictionary, SFX and (Russian) font.
 */
const BASE = 'https://example.test/game/index.html';

describe('warmableUrls (FE-8)', () => {
  it('keeps same-origin ./assets/* and ./fonts/*.woff2 under the app base, query dropped, deduplicated', () => {
    expect(
      warmableUrls(
        [
          'https://example.test/game/assets/ru-abc.js',
          'https://example.test/game/assets/recipes-def.js?r=123',
          'https://example.test/game/assets/recipes-def.js',
          'https://example.test/game/fonts/nunito-latin.woff2',
          'https://example.test/game/fonts/LICENSE.txt',
          'https://example.test/game/index.html',
          'https://example.test/game/icons/icon-192.png',
          'https://example.test/other/assets/x.js',
          'https://cdn.example.org/game/assets/y.js',
          'not a url ::',
        ],
        BASE,
      ),
    ).toEqual(['https://example.test/game/assets/ru-abc.js', 'https://example.test/game/assets/recipes-def.js', 'https://example.test/game/fonts/nunito-latin.woff2']);
  });
});

describe('warmWorkerCache (FE-8)', () => {
  afterEach(() => {
    resetWorkerWarmForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stub(controller: object | null, fetchImpl: (url: string) => Promise<unknown>) {
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { serviceWorker: { controller } });
    vi.stubGlobal('document', { baseURI: BASE });
    vi.stubGlobal('PerformanceObserver', undefined); // Node's own would watch the real process; BUG-52 tests stub one
    vi.stubGlobal('performance', {
      getEntriesByType: (type: string) =>
        type === 'resource'
          ? ['https://example.test/game/assets/index-1.js', 'https://example.test/game/assets/ru-2.js', 'https://example.test/game/fonts/nunito-latin.woff2', 'https://example.test/game/manifest.webmanifest'].map((name) => ({ name }))
          : [],
    });
    return fetchMock;
  }

  it('re-requests every loaded asset and font once, only when a worker controls the page', () => {
    const ok = () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    const none = stub(null, ok);
    warmWorkerCache();
    expect(none).not.toHaveBeenCalled();
    const fetchMock = stub({}, ok);
    warmWorkerCache();
    warmWorkerCache();
    expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      'https://example.test/game/assets/index-1.js',
      'https://example.test/game/assets/ru-2.js',
      'https://example.test/game/fonts/nunito-latin.woff2',
    ]);
  });

  it('BUG-52: a preload still in flight at the claim is warmed once it completes; nothing is fetched twice', async () => {
    vi.useFakeTimers();
    // the controlling worker: cache-first, so a request it already answered never reaches the network
    const cache = new Set<string>();
    const network: string[] = [];
    const fetchMock = stub({}, (url) => {
      if (!cache.has(url)) {
        network.push(url);
        cache.add(url);
      }
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    });
    const completed = ['https://example.test/game/assets/index-1.js', 'https://example.test/game/assets/ru-2.js', 'https://example.test/game/fonts/nunito-latin.woff2', 'https://example.test/game/manifest.webmanifest'];
    const observers: { cb: (list: { getEntries: () => PerformanceEntry[] }) => void; options: unknown; disconnected: boolean }[] = [];
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        disconnected = false;
        options: unknown;
        constructor(readonly cb: (list: { getEntries: () => PerformanceEntry[] }) => void) {
          observers.push(this);
        }
        observe(options: unknown) {
          this.options = options;
        }
        disconnect() {
          this.disconnected = true;
        }
      },
    );
    const emit = (entries: { name: string; workerStart: number }[]) => observers[0]!.cb({ getEntries: () => entries as unknown as PerformanceEntry[] });

    warmWorkerCache(); // controllerchange: the completed loads are re-requested right away
    expect(network).toEqual(completed.slice(0, 3));
    expect(observers).toHaveLength(1);
    expect(observers[0]!.options).toEqual({ type: 'resource', buffered: true });
    // the buffered replay lists the completed loads again (all pre-claim, workerStart 0): no second request
    emit(completed.map((name) => ({ name, workerStart: 0 })));
    // the idle preloads started before the claim finish now (not worker-served), next to a load the
    // worker served itself (workerStart > 0) and the warm-up's own re-requests (worker-served too)
    const lazy = 'https://example.test/game/assets/lazyScreens-3.js';
    const ai = 'https://example.test/game/assets/ai-4.js';
    const level2 = 'https://example.test/game/assets/002-5.js';
    emit([
      { name: lazy, workerStart: 0 },
      { name: `${ai}?r=1`, workerStart: 0 },
      { name: level2, workerStart: 12.5 },
      { name: 'https://example.test/game/assets/ru-2.js', workerStart: 3 },
    ]);
    emit([
      { name: ai, workerStart: 0 },
      { name: lazy, workerStart: 0 },
    ]);
    expect(network).toEqual([...completed.slice(0, 3), lazy, ai]);
    expect(fetchMock).toHaveBeenCalledTimes(5); // each file requested once, the worker hit the network once per file
    expect(new Set(fetchMock.mock.calls.map((c) => String((c as unknown[])[0]))).size).toBe(5);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(observers[0]!.disconnected).toBe(true);
    // a second controllerchange (an upgrade later in the session) changes nothing
    warmWorkerCache();
    expect(observers).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('BUG-52: without PerformanceObserver (or when observe throws) the completed loads are still warmed', () => {
    const ok = () => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    const fetchMock = stub({}, ok);
    expect(() => warmWorkerCache()).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    resetWorkerWarmForTests();
    const again = stub({}, ok);
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        observe() {
          throw new TypeError("entry type 'resource' not supported");
        }
      },
    );
    expect(() => warmWorkerCache()).not.toThrow();
    expect(again).toHaveBeenCalledTimes(3);
  });

  it('a failed request (offline) is swallowed', async () => {
    const fetchMock = stub({}, () => Promise.reject(new TypeError('Failed to fetch')));
    expect(() => warmWorkerCache()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
