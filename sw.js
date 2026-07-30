/* Service worker: app-schil offline beschikbaar houden. */

const CACHE = 'kaartjes-v2';
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
  'js/sync.js',
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Decks en de Supabase-instellingen mogen best vers zijn; val terug op de cache offline.
  if (url.pathname.includes('/decks/') || url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigatie: altijd de app-schil, zodat #-routes offline werken.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
