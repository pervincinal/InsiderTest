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

/**
 * Add (`on`) or remove the Latin 'Nunito' face from `document.fonts`. Idempotent; returns whether the
 * face is registered afterwards. No-op without the CSS Font Loading API (unit tests, old browsers:
 * Russian digits then fall back to Fredoka, as before ART-13).
 */
export function setRussianFaces(on: boolean): boolean {
  const fonts = typeof document === 'undefined' ? undefined : (document as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.add !== 'function' || typeof FontFace !== 'function') return false;
  if (on && !added) {
    if (!latinFace) {
      const f = NUNITO_LATIN_FACE;
      const url = typeof document.baseURI === 'string' ? new URL(f.url, document.baseURI).href : f.url;
      latinFace = new FontFace(f.family, `url('${url}') format('woff2')`, { weight: f.weight, unicodeRange: f.unicodeRange, display: 'block' });
    }
    fonts.add(latinFace);
    added = true;
  } else if (!on && added && latinFace) {
    fonts.delete(latinFace);
    added = false;
  }
  return added;
}

/** Test hook: forget the registered face (the module state outlives a stubbed `document`). */
export function resetRussianFacesForTests(): void {
  latinFace = null;
  added = false;
}
