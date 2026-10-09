/*
 * Tower Clash service worker.
 * - Precaches the app shell (index, manifest, icons, Fredoka font subsets) on install, then reads
 *   the cached index.html and precaches the hashed entry chunk it references (`<script type="module"
 *   src="./assets/index-*.js">`) and any `<link rel="modulepreload">` (BUG-18: on the first visit
 *   the entry chunk is fetched before the worker claims the page, so the runtime cache below never
 *   sees it; without this a player who opened the game once and went offline got the cached shell
 *   with no script). The list is derived at install, so it follows every build's content hashes.
 * - Cache-first for same-origin static files (./assets/* are content-hashed by Vite, so a cached
 *   copy is always correct); the response is stored on first use. This also covers the lazy
 *   chunks (shop / achievements / settings screens, az / ru / tr dictionaries) once opened.
 * - Cache-first, stored on first use, for the ./fonts/*.woff2 files PRECACHE does not list (FE-8):
 *   today the Latin 'Nunito' face, which the page registers only while the UI is Russian
 *   (src/render/fonts.ts, ART-13). EN / AZ / TR installs never request it, so they never download
 *   it; a Russian session caches it on its first request (src/swWarm.ts re-requests it once the
 *   worker claims the first launch, which loaded the face before the worker existed). Font files
 *   are never edited in place: new bytes ship under a new file name, like the hashed ./assets/*.
 * - Navigations go network-first with the cached shell as offline fallback, so a new deploy is
 *   picked up on the next launch while the game still opens with no connection.
 * Bump CACHE_VERSION when the shell files change shape; old caches are deleted on activate, after
 *   their ./assets/* entries (content-hashed, so still valid) and runtime fonts (see above) are
 *   carried into the new cache (BUG-19: without this an upgraded install kept only the shell and
 *   level 1 could not start offline; FE-8: likewise a Russian install lost its Latin digits face).
 *   A new runtime rule alone is not a shape change: the byte-different sw.js already installs.
 */
const CACHE_VERSION = 'v4';
const CACHE_NAME = `towerclash-${CACHE_VERSION}`;
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/fredoka-500-latin.woff2',
  './fonts/fredoka-500-latin-ext.woff2',
  './fonts/fredoka-700-latin.woff2',
  './fonts/fredoka-700-latin-ext.woff2',
  './fonts/nunito-cyrillic.woff2',
];

const scopeUrl = new URL(self.registration.scope);

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

/**
 * Same-origin URLs of the module scripts the shell loads before any of the game's own code runs:
 * every `<script type="module" src>` and `<link rel="modulepreload" href>` in index.html, resolved
 * against the worker's scope (Vite emits them relative to `base: './'`). Attribute order is not
 * assumed (Vite writes `type="module" crossorigin src=...`).
 */
function shellModuleUrls(html) {
  const urls = [];
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const isModuleScript = /^<script/i.test(tag) && /\btype=["']module["']/i.test(tag);
    const isModulePreload = /^<link/i.test(tag) && /\brel=["']modulepreload["']/i.test(tag);
    if (!isModuleScript && !isModulePreload) continue;
    const attr = (isModuleScript ? /\bsrc=["']([^"']+)["']/i : /\bhref=["']([^"']+)["']/i).exec(tag);
    if (!attr) continue;
    const url = new URL(attr[1], scopeUrl);
    if (isSameOrigin(url) && !urls.includes(url.href)) urls.push(url.href);
  }
  return urls;
}

/** Precache the entry chunk (and modulepreloads) named by the index.html just stored by PRECACHE. */
async function precacheShellModules(cache) {
  const shell = await cache.match('./index.html');
  if (!shell) return;
  const urls = shellModuleUrls(await shell.text());
  if (urls.length > 0) await cache.addAll(urls);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).then(() => precacheShellModules(cache)))
      .then(() => self.skipWaiting()),
  );
});

function isRuntimeAsset(url) {
  return isSameOrigin(url) && url.pathname.startsWith(new URL('./assets/', scopeUrl).pathname);
}

function isPrecached(url) {
  return PRECACHE.some((p) => new URL(p, scopeUrl).pathname === url.pathname);
}

/** A ./fonts/*.woff2 file outside PRECACHE (FE-8: the Latin 'Nunito' face, requested in Russian only). */
function isRuntimeFont(url) {
  return (
    isSameOrigin(url) &&
    url.pathname.startsWith(new URL('./fonts/', scopeUrl).pathname) &&
    url.pathname.endsWith('.woff2') &&
    !isPrecached(url)
  );
}

/** What the runtime cache stores on first use, and what an upgrade carries into the new cache. */
function isRuntimeCached(url) {
  return isRuntimeAsset(url) || isRuntimeFont(url);
}

/**
 * Copy the runtime-cached entries of an old cache into the new one: ./assets/* (BUG-19) and the
 * runtime fonts (FE-8). Only those qualify: Vite content-hashes the assets and font files keep their
 * bytes under their name, so a cached copy is always the right bytes, while the shell files (index,
 * manifest, icons, precached fonts) come from the new worker's PRECACHE and must never be carried over. Entries the new cache already holds (the entry chunk precached at
 * install) are left alone. Failure-tolerant: a copy that throws is skipped, never blocks activation.
 */
async function carryOverAssets(oldName, cache) {
  try {
    const old = await caches.open(oldName);
    const requests = (await old.keys()).filter((r) => isRuntimeCached(new URL(r.url)));
    await Promise.all(
      requests.map(async (request) => {
        try {
          if (await cache.match(request)) return;
          const response = await old.match(request);
          if (response) await cache.put(request, response);
        } catch {
          /* skip this entry; it is fetched again on first use */
        }
      }),
    );
  } catch {
    /* the old cache could not be read; nothing to carry over */
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([caches.keys(), caches.open(CACHE_NAME)])
      .then(([keys, cache]) => {
        const old = keys.filter((k) => k.startsWith('towerclash-') && k !== CACHE_NAME);
        return Promise.all(old.map((k) => carryOverAssets(k, cache).then(() => caches.delete(k))));
      })
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch {
    const cached = (await cache.match('./index.html')) || (await cache.match('./'));
    if (cached) return cached;
    throw new Error('offline and no cached shell');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (isPrecached(url) || isRuntimeCached(url)) event.respondWith(cacheFirst(request));
});
