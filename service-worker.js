// ===== WebMan Service Worker =====
// Strategy:
//   - Core app shell (index.html, offline.html, manifest, etc.) → Cache-first with background update
//   - files.json → Network-first (always fresh)
//   - GitHub API calls → Network-only (never cache)
//   - Everything else → Network-first, fall back to cache, fall back to offline page

const CACHE_VERSION = 'webman-v3';
const OFFLINE_PAGE  = 'offline.html';

const APP_SHELL = [
  './',
  'index.html',
  'offline.html',
  'manifest.json',
  'favicon.png',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(APP_SHELL.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. GitHub API → network only
  if (url.hostname === 'api.github.com' || url.hostname.endsWith('.githubusercontent.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // 2. files.json → network first (must always be fresh)
  if (url.pathname.endsWith('files.json')) {
    event.respondWith(
      fetch(request)
        .then(res => { caches.open(CACHE_VERSION).then(c => c.put(request, res.clone())); return res; })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 3. Top-level navigation → network first, fallback offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => { caches.open(CACHE_VERSION).then(c => c.put(request, res.clone())); return res; })
        .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_PAGE)))
    );
    return;
  }

  // 4. App shell assets → cache first + background update
  if (APP_SHELL.includes(request.url) || APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const networkFetch = fetch(request).then(res => {
          caches.open(CACHE_VERSION).then(c => c.put(request, res.clone()));
          return res;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // 5. Everything else → network first, then cache, then offline
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) caches.open(CACHE_VERSION).then(c => c.put(request, res.clone()));
        return res;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match(OFFLINE_PAGE)))
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_VERSION).then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' }));
  }
});
