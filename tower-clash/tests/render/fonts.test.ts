import { readFileSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NUNITO_LATIN_FACE, resetRussianFacesForTests, setRussianFaces } from '../../src/render/fonts';

/*
 * ART-13: Russian lines are one family (Nunito letters *and* digits). The Latin Nunito face is
 * registered from JS while the UI is Russian only — declared in index.html, Chromium would fetch it
 * for every EN / AZ / TR player (e2e/shareLocales.spec.ts asserts the network side).
 */

const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const FONT_FACES = [...INDEX_HTML.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]!);
const descriptor = (block: string, name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();

/** `failLoads`: every face created from now on fails to load (offline, file never cached) — status 'error', `loaded` rejects. */
function fakeDocument(opts: { failLoads?: boolean } = {}) {
  const set = new Set<FakeFace>();
  class FakeFace {
    status: FontFaceLoadStatus = 'unloaded';
    loaded: Promise<FakeFace>;
    constructor(
      public family: string,
      public source: string,
      public desc: FontFaceDescriptors
    ) {
      this.loaded = opts.failLoads
        ? Promise.reject(new DOMException('A network error occurred.', 'NetworkError')).catch((e: unknown) => {
            this.status = 'error';
            throw e;
          })
        : Promise.resolve(this);
      // the module must attach its own handler; this one only keeps vitest from flagging the test's copy
      this.loaded.catch(() => undefined);
    }
  }
  vi.stubGlobal('FontFace', FakeFace);
  vi.stubGlobal('document', {
    baseURI: 'https://example.test/game/index.html',
    fonts: { add: (f: FakeFace) => void set.add(f), delete: (f: FakeFace) => set.delete(f), load: () => Promise.resolve([]) },
  });
  return { set, fail: (on: boolean) => void (opts.failLoads = on) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Russian Nunito faces (ART-13)', () => {
  afterEach(() => {
    resetRussianFacesForTests();
    vi.unstubAllGlobals();
  });

  it('the bundled Latin file is a woff2 next to the Cyrillic one, in public/fonts (never in the JS bundle)', () => {
    for (const name of ['nunito-latin.woff2', 'nunito-cyrillic.woff2']) {
      const url = new URL(`../../public/fonts/${name}`, import.meta.url);
      expect(readFileSync(url).subarray(0, 4).toString('latin1'), name).toBe('wOF2');
      expect(statSync(url).size, name).toBeLessThan(45_000);
    }
    expect(readFileSync(new URL('../../public/fonts/LICENSE.txt', import.meta.url), 'utf8')).toMatch(/nunito-latin\.woff2[\s\S]*Open Font License|Open Font License[\s\S]*nunito-latin\.woff2/);
  });

  it('index.html declares only the Cyrillic Nunito face; the Latin face copies its descriptors', () => {
    const nunito = FONT_FACES.filter((b) => /font-family:\s*'Nunito'/.test(b));
    expect(nunito).toHaveLength(1);
    expect(nunito[0]).toContain('nunito-cyrillic.woff2');
    expect(INDEX_HTML).not.toMatch(/url\(['"]?\.\/fonts\/nunito-latin/);
    expect(NUNITO_LATIN_FACE.family).toBe('Nunito');
    expect(NUNITO_LATIN_FACE.weight).toBe(descriptor(nunito[0]!, 'font-weight'));
    expect(descriptor(nunito[0]!, 'font-display')).toBe('block');
    // Google's `latin` range: digits, ':' (U+003A), '·' (U+00B7), '-' are all inside U+0000-00FF
    expect(NUNITO_LATIN_FACE.unicodeRange.startsWith('U+0000-00FF,')).toBe(true);
    // the same range as Fredoka's latin face, so both stacks treat the same characters as "Latin"
    const fredokaLatin = FONT_FACES.find((b) => b.includes('fredoka-700-latin.woff2'))!;
    expect(NUNITO_LATIN_FACE.unicodeRange).toBe(descriptor(fredokaLatin, 'unicode-range'));
  });

  it('the service worker does not precache it either (an EN / AZ / TR install never downloads it; Russian caches it on first use)', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
    const precache = /const PRECACHE = \[([\s\S]*?)\];/.exec(sw)?.[1] ?? '';
    expect(precache).toContain('./fonts/nunito-cyrillic.woff2');
    expect(precache).not.toContain('nunito-latin');
  });

  it('registered only while Russian: add once (absolute URL, block display), remove on a switch away, re-add on return', () => {
    const { set } = fakeDocument();
    expect(setRussianFaces(false)).toBe(false);
    expect(set.size).toBe(0);
    expect(setRussianFaces(true)).toBe(true);
    expect(setRussianFaces(true)).toBe(true);
    expect(set.size).toBe(1);
    const face = [...set][0]!;
    expect(face.family).toBe('Nunito');
    expect(face.source).toBe("url('https://example.test/game/fonts/nunito-latin.woff2') format('woff2')");
    expect(face.desc).toEqual({ weight: '500 700', unicodeRange: NUNITO_LATIN_FACE.unicodeRange, display: 'block' });
    expect(setRussianFaces(false)).toBe(false);
    expect(set.size).toBe(0);
    expect(setRussianFaces(true)).toBe(true);
    expect([...set]).toEqual([face]); // the same FontFace: loaded once per session
  });

  it('no Font Loading API (unit tests, old browsers) → no-op', () => {
    vi.stubGlobal('document', {});
    expect(setRussianFaces(true)).toBe(false);
  });

  it('FE-8: a face that cannot load (Russian chosen offline, file never cached) → one console.warn per session, retried on the next switch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { set, fail } = fakeDocument({ failLoads: true });
    expect(setRussianFaces(true)).toBe(true); // registered and returned at once: never throws, never waits
    await flush();
    const first = [...set][0]!;
    expect(first.status).toBe('error');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[fonts\] Nunito Latin face unavailable/);
    // still offline: a switch away and back builds a fresh face (an errored FontFace never reloads), and warns no more
    expect(setRussianFaces(false)).toBe(false);
    expect(setRussianFaces(true)).toBe(true);
    await flush();
    const second = [...set][0]!;
    expect(set.size).toBe(1);
    expect(second).not.toBe(first);
    expect(warn).toHaveBeenCalledTimes(1);
    // back online: the next `on` (switch, share card) replaces the errored face even without a switch away
    fail(false);
    expect(setRussianFaces(true)).toBe(true);
    await flush();
    const third = [...set][0]!;
    expect(set.size).toBe(1);
    expect(third).not.toBe(second);
    expect(third.status).toBe('unloaded');
    expect(setRussianFaces(true)).toBe(true);
    expect([...set]).toEqual([third]); // a healthy face is kept
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('a FontFaceSet that throws on add → false, no throw', () => {
    class FakeFace {
      loaded = new Promise(() => undefined);
    }
    vi.stubGlobal('FontFace', FakeFace);
    vi.stubGlobal('document', { fonts: { add: () => { throw new Error('nope'); }, delete: () => true } });
    expect(() => setRussianFaces(true)).not.toThrow();
    expect(setRussianFaces(true)).toBe(false);
  });
});

/*
 * FE-8: public/sw.js run in a fake worker global (node:vm) — the runtime font rule and its upgrade
 * carry-over, asserted on the worker's own fetch / activate handlers rather than on its source text.
 */
const SW_SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const SCOPE = 'https://example.test/game/';
const SW_CACHE = `towerclash-${/const CACHE_VERSION = '(v\d+)'/.exec(SW_SOURCE)?.[1]}`;

interface FakeResponse {
  ok: boolean;
  type: string;
  body: string;
  clone(): FakeResponse;
}
const response = (body: string): FakeResponse => ({ ok: true, type: 'basic', body, clone: () => response(body) });
type Keyed = string | { url: string };
const keyOf = (r: Keyed) => new URL(typeof r === 'string' ? r : r.url, SCOPE).href;

function loadWorker() {
  const stores = new Map<string, Map<string, FakeResponse>>();
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (r: Keyed, o?: { ignoreSearch?: boolean }) => {
        const k = keyOf(r);
        return store.get(o?.ignoreSearch ? k.split('?')[0]! : k);
      },
      put: async (r: Keyed, res: FakeResponse) => void store.set(keyOf(r), res),
      keys: async () => [...store.keys()].map((url) => ({ url })),
      addAll: async (rs: Keyed[]) => rs.forEach((r) => store.set(keyOf(r), response(`net:${keyOf(r)}`))),
    };
  };
  const caches = {
    open: async (name: string) => open(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  let online = true;
  const fetched: string[] = [];
  const fetch = vi.fn(async (r: Keyed) => {
    fetched.push(keyOf(r));
    if (!online) throw new TypeError('Failed to fetch');
    return response(`net:${keyOf(r)}`);
  });
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    registration: { scope: SCOPE },
    location: { origin: new URL(SCOPE).origin },
    addEventListener: (type: string, fn: (e: unknown) => void) => void (handlers[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  runInNewContext(SW_SOURCE, { self, caches, fetch, URL, Promise, console });
  /** Dispatch a GET; resolves to the response, or null when the worker leaves it to the network. */
  const request = async (path: string): Promise<FakeResponse | null> => {
    let responded: Promise<FakeResponse> | null = null;
    handlers.fetch!({ request: { method: 'GET', url: new URL(path, SCOPE).href, mode: 'cors' }, respondWith: (p: Promise<FakeResponse>) => void (responded = p) });
    return responded;
  };
  const activate = async () => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.activate!({ waitUntil: (p: Promise<unknown>) => void (done = p) });
    await done;
  };
  const paths = (name: string) => [...(stores.get(name)?.keys() ?? [])].map((k) => new URL(k).pathname).sort();
  return { open, stores, request, activate, paths, fetched, setOnline: (on: boolean) => void (online = on) };
}

describe('public/sw.js runtime font cache (FE-8)', () => {
  it('./fonts/*.woff2 outside PRECACHE: cache-first, stored in the worker cache on first use, served from it offline', async () => {
    const sw = loadWorker();
    const first = await sw.request('./fonts/nunito-latin.woff2');
    expect(first?.body).toBe(`net:${SCOPE}fonts/nunito-latin.woff2`);
    await flush();
    expect(sw.paths(SW_CACHE)).toEqual(['/game/fonts/nunito-latin.woff2']);
    sw.setOnline(false);
    const offline = await sw.request('./fonts/nunito-latin.woff2');
    expect(offline?.body).toBe(first?.body);
    expect(sw.fetched).toHaveLength(1);
  });

  it('only woff2 under ./fonts/ and only on use: other files are left to the network, an install caches nothing extra', async () => {
    const sw = loadWorker();
    expect(await sw.request('./fonts/LICENSE.txt')).toBeNull();
    expect(await sw.request('./other/nunito-latin.woff2')).toBeNull();
    expect(sw.fetched).toEqual([]);
    expect(sw.stores.size).toBe(0);
  });

  it('offline and never cached: the request fails (no hang) and nothing is stored', async () => {
    const sw = loadWorker();
    sw.setOnline(false);
    await expect(sw.request('./fonts/nunito-latin.woff2')).rejects.toThrow('Failed to fetch');
    expect(sw.paths(SW_CACHE)).toEqual([]);
  });

  it('upgrade: activate carries the runtime fonts (and ./assets/*) of an old cache into the new one, never its precached shell or fonts', async () => {
    const sw = loadWorker();
    const old = sw.open('towerclash-v0');
    for (const p of ['./index.html', './fonts/fredoka-700-latin.woff2', './fonts/nunito-latin.woff2', './assets/001-abc.js']) await old.put(p, response(`old:${p}`));
    await sw.activate();
    expect([...sw.stores.keys()]).toEqual([SW_CACHE]);
    expect(sw.paths(SW_CACHE)).toEqual(['/game/assets/001-abc.js', '/game/fonts/nunito-latin.woff2']);
    sw.setOnline(false);
    expect((await sw.request('./fonts/nunito-latin.woff2'))?.body).toBe('old:./fonts/nunito-latin.woff2');
  });
});
