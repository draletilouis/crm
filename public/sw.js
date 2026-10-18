// Caches the app shell so it opens fast on a weak connection. API calls always go to the network.
const CACHE = 'lefori-sales-v2';
const SHELL = ['/', '/styles.css?v=2', '/app.js?v=2', '/manifest.webmanifest', '/icons/mark.svg', '/icons/mark-on-blue.svg',
  '/icons/icon-192.png', '/fonts/urbanist-latin-500-normal.woff2', '/fonts/urbanist-latin-700-normal.woff2',
  '/fonts/urbanist-latin-800-normal.woff2', '/fonts/montserrat-latin-500-normal.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/health') return;
  // Network first, cache as fallback: new versions show up on the next open.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('/'))),
  );
});
