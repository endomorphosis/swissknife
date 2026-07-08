// web/public/service-worker.js
//
// SwissKnife browser deployment service worker (SWR-041).
//
// Scope and policy: see `docs/browser-deployment-policy.md`.
//
// This file is served as-is from the deployment root (Vite copies
// `web/public/*` verbatim into `dist/`) and must stay a plain, dependency-free
// Web Worker script:
//   - It runs in the ServiceWorkerGlobalScope, a browser-only execution
//     context. It must never import Node built-ins (`fs`, `path`,
//     `worker_threads`, `child_process`, ...); doing so would not even load in
//     a browser, and `scripts/audit-browser-deployment-policy.mjs` fails the
//     deployment audit if it finds one.
//   - It only uses the Cache Storage API (`caches`) for persistence. It must
//     never assume IndexedDB or OPFS are available inside the service worker
//     thread beyond what `src/storage/browser.ts` already guards for the main
//     thread.
//   - It has no build step: it is registered directly via
//     `navigator.serviceWorker.register('/service-worker.js')` from
//     `web/index.html`.
//
// Strategy:
//   - Navigation requests (`mode === 'navigate'`): network-first, falling
//     back to the cached shell and finally to `/offline.html` so the desktop
//     keeps working offline once it has been opened at least once.
//   - Same-origin GET requests for static assets (JS/CSS/fonts/images/wasm):
//     stale-while-revalidate — serve the cached copy immediately when present
//     and refresh the cache in the background, so first-load-then-offline
//     behavior works without a hand-maintained precache manifest of hashed
//     Vite build filenames.
//   - Everything else (cross-origin requests, non-GET requests, IPFS gateway
//     traffic, API calls): pass straight through to the network. The service
//     worker never intercepts POST/PUT/DELETE or opaque cross-origin
//     responses, so it cannot corrupt non-idempotent requests or MCP/IPFS
//     traffic that already has its own retry/caching policy.

const CACHE_VERSION = 'swissknife-web-v1';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const OFFLINE_URL = '/offline.html';

// Best-effort app shell precache. Every entry is optional: a failed fetch for
// one entry (for example, a build that renamed `/manifest.webmanifest`) must
// not abort installation of the rest.
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/favicon.ico',
];

const STATIC_ASSET_DESTINATIONS = new Set([
  'script',
  'style',
  'image',
  'font',
  'worker',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await Promise.all(
        APP_SHELL_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch {
            // Offline install or missing optional asset: skip, do not fail
            // the whole install step.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('swissknife-web-') && !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cached = (await cache.match(request)) || (await cache.match('/index.html'));
    return cached || (await cache.match(OFFLINE_URL));
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await networkFetch) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GET requests. Everything else (cross-origin
  // fetches, IPFS gateways, POST/PUT/DELETE) is left entirely to the network.
  if (request.method !== 'GET') return;

  let requestUrl;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return;
  }
  if (requestUrl.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (STATIC_ASSET_DESTINATIONS.has(request.destination)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
