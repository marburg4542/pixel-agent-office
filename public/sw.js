// Service worker: makes the app installable and opens it fast. It only keeps the app's own files
// (page, scripts, styles, fonts, icons). Everything live — the API, the event stream, uploads, and
// Cloudflare Access sign-in (/cdn-cgi/) — always goes straight to the network.
const CACHE = 'pao-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icons/icon-192.png'];
const LIVE = /\/(api|uploads|cdn-cgi)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Only plain same-origin 200s are kept (never Access redirects or errors). */
const keep = (res) => res.ok && res.type === 'basic';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || LIVE.test(url.pathname)) return;

  // The page: network first so a new version shows up at once; the saved copy only when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (keep(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        .catch(() => caches.match('./').then((hit) => hit || Response.error())),
    );
    return;
  }

  // Built files have content hashes in their names, so a saved copy never goes stale.
  // (Icons and the manifest don't — bump CACHE when they change.)
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (keep(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
