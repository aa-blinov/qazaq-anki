/* ---------------------------------------------------------------------------
 * Service worker — offline app-shell + level JSON cache.
 *
 * Strategies:
 *   - App shell (HTML, JS, CSS, fonts, manifest): cache-first.
 *     These files are content-hashed by Vite, so once cached they
 *     stay valid until the next deploy (when the hash changes and
 *     the new file is fetched naturally).
 *   - Level JSONs (/src/data/decks/*.json): cache-first with a
 *     background revalidate. The user can study an already-loaded
 *     level offline; new levels still need to fetch once.
 *   - API calls (/api/*): network-only. The app cannot serve
 *     study progress from cache (it's a SQLite file on the
 *     server) — pretending to do so would silently lose reviews.
 *     When offline, the app surfaces a "нет сети" toast instead.
 *
 * Versioning: bump CACHE_NAME on schema-breaking changes so the
 * old cache is dropped instead of served stale.
 * --------------------------------------------------------------------------- */

const CACHE_NAME = 'qazaq-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  // Pre-cache the app shell so the very first offline launch
  // works. addAll is atomic — if any URL fails, the install
  // fails and the new SW doesn't activate.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  // Take over from any previous SW without waiting for the
  // next page load — the user gets the new version now.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Drop any old caches that aren't the current one.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs. The browser handles POST,
  // cross-origin, and other methods without our help.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // API: network only. The local SQLite is the source of truth —
  // we don't want to invent fake progress responses.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req).catch(() => new Response(
      JSON.stringify({ error: 'offline' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )));
    return;
  }

  // Level JSONs: cache-first, then network, then cache again.
  if (url.pathname.includes('/decks/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      }),
    );
    return;
  }

  // App shell: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    }),
  );
});
