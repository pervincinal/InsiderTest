import { readFileSync, statSync } from 'node:fs';
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

function fakeDocument() {
  const set = new Set<FakeFace>();
  class FakeFace {
    constructor(
      public family: string,
      public source: string,
      public desc: FontFaceDescriptors
    ) {}
  }
  vi.stubGlobal('FontFace', FakeFace);
  vi.stubGlobal('document', {
    baseURI: 'https://example.test/game/index.html',
    fonts: { add: (f: FakeFace) => void set.add(f), delete: (f: FakeFace) => set.delete(f), load: () => Promise.resolve([]) },
  });
  return set;
}

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
    const set = fakeDocument();
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
});
