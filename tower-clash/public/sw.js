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
 * - Navigations go network-first with the cached shell as offline fallback, so a new deploy is
 *   picked up on the next launch while the game still opens with no connection.
 * Bump CACHE_VERSION when the shell files change shape; old caches are deleted on activate, after
 *   their ./assets/* entries (content-hashed, so still valid) are carried into the new cache (BUG-19:
 *   without this an upgraded install kept only the shell and level 1 could not start offline).
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

/**
 * Copy the runtime-cached ./assets/* entries of an old cache into the new one (BUG-19). Only the
 * assets prefix qualifies: Vite content-hashes those files, so a cached copy is always the right
 * bytes, while the shell files (index, manifest, icons, fonts) come from the new worker's PRECACHE
 * and must never be carried over. Entries the new cache already holds (the entry chunk precached at
 * install) are left alone. Failure-tolerant: a copy that throws is skipped, never blocks activation.
 */
async function carryOverAssets(oldName, cache) {
  try {
    const old = await caches.open(oldName);
    const requests = (await old.keys()).filter((r) => isRuntimeAsset(new URL(r.url)));
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
  const precached = PRECACHE.some((p) => new URL(p, scopeUrl).pathname === url.pathname);
  if (precached || isRuntimeAsset(url)) event.respondWith(cacheFirst(request));
});
