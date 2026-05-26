const CACHE_NAME = 'metro-tracker-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET or cross-origin sockets
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/socket.io')) return;

  // API: network first
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(request).catch(() => new Response(JSON.stringify({ success: false, message: 'Offline' }), {
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // Static: cache first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          // Only cache valid basic responses
          if (!res || res.status !== 200 || res.type !== 'basic') {
            return res;
          }
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch((err) => {
          // Fail gracefully to prevent uncaught promise errors in console
          return new Response('Asset unavailable', { status: 404, statusText: 'Not Found' });
        });
    })
  );
});

// Push notification support
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  self.registration.showNotification(data.title || '🚇 Metro Tracker', {
    body: data.body || 'Update from Metro Tracker',
    icon: '/metro-icon-192.png',
    badge: '/metro-icon-192.png',
  });
});
