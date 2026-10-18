/*
 * FE-8 / BUG-18 family: on a first launch the page loads its early files before the service worker
 * claims it (public/sw.js), so the worker's runtime cache never sees them — the language
 * dictionary chunk (az / ru / tr), the SFX recipes chunk, and in Russian the Latin 'Nunito' face
 * (src/render/fonts.ts). Offline, the next launch then booted in English, silent, with Fredoka
 * digits. On the first claim (`controllerchange`) the page re-requests every same-origin
 * ./assets/* and ./fonts/*.woff2 file it has already loaded, and (BUG-52) each one still in flight at
 * the claim once it completes; the requests now go through the worker,
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
  const done = new Set<string>();
  const warm = (entries: readonly PerformanceEntry[]) => {
    for (const url of warmableUrls(entries.map((e) => e.name), document.baseURI)) {
      if (done.has(url)) continue;
      done.add(url);
      // read to the end so the worker's cache.put of its clone is never cut short
      void fetch(url)
        .then((r) => r.arrayBuffer())
        .catch(() => undefined);
    }
  };
  warm(performance.getEntriesByType('resource'));
  // BUG-52: a load started before the claim and still in flight now (the idle preloads under load:
  // lazy screens, menu strings, level 1, AI) is not listed yet, and never went through the worker.
  // Warm it once it completes: `workerStart === 0` = not worker-served; the claimed page's own later
  // loads (and these re-requests) are, so the worker caches them itself. Bounded to a minute.
  try {
    const o = new PerformanceObserver((list) => warm(list.getEntries().filter((e) => (e as PerformanceResourceTiming).workerStart === 0)));
    o.observe({ type: 'resource', buffered: true });
    setTimeout(() => o.disconnect(), 60_000);
  } catch {
    /* no PerformanceObserver (or no 'resource' type): completed loads only */
  }
}

/** Test hook. */
export function resetWorkerWarmForTests(): void {
  warmed = false;
}
