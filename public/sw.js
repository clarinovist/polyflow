/* PolyFlow PWA: cache static install assets only, never authenticated HTML. */
const CACHE = 'polyflow-mobile-v2';
const STATIC_ASSETS = ['/manifest.json', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Authenticated mobile portal responses, including Finance and HRD business
// data, deliberately remain network-only and never receive a cached fallback.
