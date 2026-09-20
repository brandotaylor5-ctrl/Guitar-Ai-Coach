const CACHE = 'guitar-ai-coach-v21-player-placement';
const SHELL = [
  './index.html',
  './styles.css',
  './mvp.css',
  './learning.css',
  './app.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Do not preserve a transient 404/500 as though it were a good app file.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Only navigations get the app shell. Returning index.html for a missing
        // JavaScript module makes Safari report an opaque module/MIME failure.
        if (event.request.mode === 'navigate') {
          return (await caches.match('./index.html')) ?? Response.error();
        }
        return Response.error();
      }),
  );
});
