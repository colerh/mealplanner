// App-shell cache-first service worker. Bump CACHE_VERSION on any static
// asset change so clients pick up the new files instead of stale caches.
const CACHE_VERSION = 'v1';
const CACHE_NAME = `mealplanner-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/router.js',
  './js/kroger.js',
  './js/views/recipes.js',
  './js/views/pantry.js',
  './js/views/calendar.js',
  './js/views/shopping.js',
  './js/views/settings.js',
  './js/lib/recipeParser.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Never cache API calls — they're dynamic (Kroger tokens, recipe fetch/LLM parse).
  if (url.pathname.startsWith('/api/')) return;
  if (url.origin !== location.origin) return; // let cross-origin (fonts) pass through normally

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
