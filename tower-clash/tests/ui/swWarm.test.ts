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
  });

  function stub(controller: object | null, fetchImpl: () => Promise<unknown>) {
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { serviceWorker: { controller } });
    vi.stubGlobal('document', { baseURI: BASE });
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

  it('a failed request (offline) is swallowed', async () => {
    const fetchMock = stub({}, () => Promise.reject(new TypeError('Failed to fetch')));
    expect(() => warmWorkerCache()).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
