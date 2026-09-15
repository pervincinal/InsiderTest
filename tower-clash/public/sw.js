/*
 * Tower Clash service worker.
 * - Precaches the app shell (index, manifest, icons, Fredoka font subsets) on install.
 * - Cache-first for same-origin static files (./assets/* are content-hashed by Vite, so a cached
 *   copy is always correct); the response is stored on first use. This also covers the lazy
 *   chunks (shop / achievements / settings screens, az / ru / tr dictionaries) once opened.
 * - Navigations go network-first with the cached shell as offline fallback, so a new deploy is
 *   picked up on the next launch while the game still opens with no connection.
 * Bump CACHE_VERSION when the shell files change shape; old caches are deleted on activate.
 */
const CACHE_VERSION = 'v3';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('towerclash-') && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const scopeUrl = new URL(self.registration.scope);

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isRuntimeAsset(url) {
  return isSameOrigin(url) && url.pathname.startsWith(new URL('./assets/', scopeUrl).pathname);
}

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
