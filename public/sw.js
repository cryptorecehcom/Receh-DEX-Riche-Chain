const CACHE_VERSION = 'receh-dex-shell-v14';
const SHELL_CACHE = CACHE_VERSION;

const CORE_ASSETS = [
  '/dex/',
  '/dex/index.html',
  '/dex/style.css',
  '/dex/app.js',
  '/dex/js/reown.js',
  '/dex/pwa/manifest.webmanifest',
  '/dex/pwa/icons/icon-192.png',
  '/dex/pwa/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(CORE_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(new Request(asset, { cache: 'no-cache' }));
        if (response.ok) await cache.put(asset, response);
      } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isStaticAsset(request) {
  const url = new URL(request.url);
  return /\.(?:css|js|mjs|png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isSameOrigin(request)) return;

  const url = new URL(request.url);

  // Navigation: network first so deployments update quickly, cache fallback keeps the shell usable offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/dex/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/dex/index.html'))
    );
    return;
  }

  // Application code and styles use network-first so a new deployment is not
  // trapped behind an old cached bundle. Other static assets use cache-first.
  if (isStaticAsset(request)) {
    const isAppCode = /\.(?:js|mjs|css|webmanifest)$/i.test(url.pathname);
    if (isAppCode) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
    } else {
      event.respondWith(
        caches.match(request).then((cached) => cached || fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }))
      );
    }
    return;
  }
});
