/*
 * Russian UI faces (ART-13). Russian lines are set wholly in Nunito (render/widgets.ts FONT_RU): the
 * Cyrillic letters from public/fonts/nunito-cyrillic.woff2 (index.html @font-face) and the digits,
 * Latin letters and punctuation (':' '·' '-' …) from public/fonts/nunito-latin.woff2 — Google's
 * Latin subset of the same variable build (v32, wght 200–1000). Both join one 'Nunito' family.
 *
 * Why the Latin face is registered here and not in index.html: Chromium starts the download of
 * every face of *every* family in the canvas font stack whose unicode-range intersects the drawn
 * text, even when an earlier family (Fredoka) already covers every character (measured 2026-10-08:
 * an English session fetched nunito-latin.woff2 as soon as the stack 'Fredoka', 'Nunito', … drew
 * Latin text). So a static Latin 'Nunito' face would cost every EN / AZ / TR player ~39 kB. It is
 * added to `document.fonts` only while the UI is Russian and removed again on a switch away, which
 * also keeps the other languages' 'Nunito' (Cyrillic only, for "Русский" in the language picker)
 * exactly what it was.
 *
 * Offline (FE-8): public/sw.js caches ./fonts/*.woff2 files outside its PRECACHE on first use, so a
 * Russian install keeps the face offline while EN / AZ / TR installs never download it (src/swWarm.ts
 * routes a first launch's pre-claim request through the worker). When the
 * face cannot load (Russian chosen offline before it was ever cached), its `loaded` rejection is
 * swallowed with one console.warn per session and Russian digits fall back to Fredoka — the next
 * stack family, i.e. the pre-ART-13 look; the next switch to Russian (or the next boot) retries.
 */

/** The Latin 'Nunito' face: same descriptors as index.html's Cyrillic face, Google's `latin` range. */
export const NUNITO_LATIN_FACE = Object.freeze({
  family: 'Nunito',
  url: './fonts/nunito-latin.woff2',
  weight: '500 700',
  unicodeRange:
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
});

let latinFace: FontFace | null = null;
let added = false;
let warned = false;

/** Absolute URL of the Latin face file (FontFace sources resolve against the document). */
function latinFaceUrl(): string {
  const f = NUNITO_LATIN_FACE;
  return typeof document !== 'undefined' && typeof document.baseURI === 'string' ? new URL(f.url, document.baseURI).href : f.url;
}

/** Swallow the face's load failure (offline, never cached): one warning per session, never an unhandled rejection. */
function watchLoad(face: FontFace): void {
  const loaded = (face as { loaded?: Promise<FontFace> }).loaded;
  if (!loaded || typeof loaded.then !== 'function') return;
  loaded.then(undefined, () => {
    if (warned) return;
    warned = true;
    console.warn('[fonts] Nunito Latin face unavailable (offline?); Russian digits use Fredoka until the next switch or launch');
  });
}

/**
 * Add (`on`) or remove the Latin 'Nunito' face from `document.fonts`. Idempotent; returns whether the
 * face is registered afterwards. A face whose load failed (status 'error') is replaced by a fresh one
 * on the next `on`, so a switch to Russian once back online fetches the file again. No-op without
 * the CSS Font Loading API (unit tests, old browsers: Russian digits then fall back to Fredoka, as
 * before ART-13). Never throws, never waits.
 */
export function setRussianFaces(on: boolean): boolean {
  const fonts = typeof document === 'undefined' ? undefined : (document as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.add !== 'function' || typeof FontFace !== 'function') return false;
  try {
    if (on && latinFace?.status === 'error') {
      if (added) fonts.delete(latinFace);
      latinFace = null;
      added = false;
    }
    if (on && !added) {
      if (!latinFace) {
        const f = NUNITO_LATIN_FACE;
        latinFace = new FontFace(f.family, `url('${latinFaceUrl()}') format('woff2')`, { weight: f.weight, unicodeRange: f.unicodeRange, display: 'block' });
        watchLoad(latinFace);
      }
      fonts.add(latinFace);
      added = true;
    } else if (!on && added && latinFace) {
      fonts.delete(latinFace);
      added = false;
    }
  } catch {
    /* a FontFaceSet that refuses the face: Russian digits stay in Fredoka */
  }
  return added;
}

/** Test hook: forget the registered face (the module state outlives a stubbed `document`). */
export function resetRussianFacesForTests(): void {
  latinFace = null;
  added = false;
  warned = false;
}
