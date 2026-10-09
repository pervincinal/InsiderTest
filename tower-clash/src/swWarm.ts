/*
 * FE-8 / BUG-18 family: on a first launch the page loads its early files before the service worker
 * claims it (public/sw.js), so the worker's runtime cache never sees them — the language
 * dictionary chunk (az / ru / tr), the SFX recipes chunk, and in Russian the Latin 'Nunito' face
 * (src/render/fonts.ts). Offline, the next launch then booted in English, silent, with Fredoka
 * digits. On the first claim (`controllerchange`) the page re-requests every same-origin
 * ./assets/* and ./fonts/*.woff2 file it has already loaded; the requests now go through the worker,
 * which stores them (usually straight from the HTTP cache; anything it already holds is a cache hit
 * and never reaches the network). Only files this session actually used are warmed, so an EN / AZ /
 * TR session never fetches the Russian-only face.
 */

/** Same-origin ./assets/* and ./fonts/*.woff2 pathnames (query dropped, deduplicated) among `urls`, resolved against `base`. */
export function warmableUrls(urls: readonly string[], base: string): string[] {
  const root = new URL('./', base);
  const assets = new URL('./assets/', root).pathname;
  const fonts = new URL('./fonts/', root).pathname;
  const out: string[] = [];
  for (const raw of urls) {
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (url.origin !== root.origin) continue;
    const p = url.pathname;
    if (!p.startsWith(assets) && !(p.startsWith(fonts) && p.endsWith('.woff2'))) continue;
    const href = url.origin + p;
    if (!out.includes(href)) out.push(href);
  }
  return out;
}

let warmed = false;

/**
 * Re-request, through the now-controlling worker, the files this page loaded before the claim. At
 * most once per session; no-op without a controller, `fetch` or Resource Timing. Never rejects.
 */
export function warmWorkerCache(): void {
  if (warmed || typeof fetch !== 'function' || typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return;
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return;
  warmed = true;
  const loaded = performance.getEntriesByType('resource').map((e) => e.name);
  for (const url of warmableUrls(loaded, document.baseURI)) {
    // read to the end so the worker's cache.put of its clone is never cut short
    void fetch(url)
      .then((r) => r.arrayBuffer())
      .catch(() => undefined);
  }
}

/** Test hook. */
export function resetWorkerWarmForTests(): void {
  warmed = false;
}
