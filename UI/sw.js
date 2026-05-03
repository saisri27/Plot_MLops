// Plot service worker.
// Bare-minimum: cache the app shell on first load so the PWA opens
// instantly on subsequent launches and works offline-ish (the API calls
// still need network, but the UI itself is cached). Network-first for
// .html so design changes show up without a SW reset.

// Bump this on every UI deploy that ships JS/HTML changes — old clients
// will purge their cached shell on next page load and pull the fresh files.
const CACHE = 'plot-shell-v14';
const SHELL = [
  '/Plot.html',
  '/tokens.js',
  '/api.js',
  '/icons.jsx',
  '/components.jsx',
  '/screens.jsx',
  '/app.jsx',
  '/ios-frame.jsx',
  '/tweaks-panel.jsx',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls — they need to hit the live backend.
  if (url.hostname.includes('plot-decision-engine')) return;

  // Network-first for HTML so iteration is fast.
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for everything else (JS, JSX, icons): serve
  // the cached version instantly so first paint stays fast, but kick off
  // a background fetch to refresh the cache for next time. Old code shows
  // up once after a deploy, then the very next page load is fresh —
  // without the user having to manually clear cache or hard-refresh.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
