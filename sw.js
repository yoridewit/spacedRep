/* Service worker: app-schil offline beschikbaar houden.
 *
 * Strategie:
 *   - navigatie, JS, CSS en JSON: eerst het netwerk, cache als terugval. Zo zie
 *     je een nieuwe versie meteen na het uitrollen, in plaats van pas nadat de
 *     cache toevallig ververst is;
 *   - lettertypen en iconen: eerst de cache. Die veranderen zelden en zijn het
 *     zwaarst.
 *
 * Bij het installeren wordt de hele schil alvast opgehaald, zodat de app ook
 * zonder verbinding start.
 */

const CACHE = 'kaartjes-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'css/app.css',
  'js/app.js',
  'js/store.js',
  'js/srs.js',
  'js/parse.js',
  'js/markup.js',
  'js/prompt.js',
  'js/ui.js',
  'js/icons.js',
  'js/gamify.js',
  'js/merge.js',
  'js/keycheck.js',
  'js/sync.js',
  'js/daystats.js',
  'js/device.js',
  'js/views/home.js',
  'js/views/study.js',
  'js/views/add.js',
  'js/views/deck.js',
  'js/views/stats.js',
  'js/views/settings.js',
  'js/views/sync-panel.js',
  'fonts/caprasimo-latin.woff2',
  'fonts/caprasimo-latin-ext.woff2',
  'fonts/figtree-latin.woff2',
  'fonts/figtree-latin-ext.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request)
      ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  const isCode = request.mode === 'navigate' || /\.(js|css|json|webmanifest)$/.test(url.pathname);
  event.respondWith(isCode ? networkFirst(request) : cacheFirst(request));
});
