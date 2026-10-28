// Service worker: makes the app work offline and installable.
// • The core (HTML, CSS, JS, three.js, icons) is precached under a version that is a hash of its contents
//   (written by tools/stamp.mjs; a test fails if it is stale), so an update is all-or-nothing.
// • MediaPipe (≈15 MB) is cached the first time the mirror uses it, in its own cache that survives app updates.
// • A new version waits until the player taps "Reload" (never mid-session).
// @stamp-start
const VERSION = '05c9749b6f64';
const CORE = [
  './',
  'css/app.css',
  'fonts/OFL-barlow-condensed.txt',
  'fonts/barlow-condensed-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2',
  'fonts/barlow-condensed-latin-800-normal.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'js/app.js',
  'js/audio.js',
  'js/core/action.js',
  'js/core/badges.js',
  'js/core/bowling.js',
  'js/core/calib.js',
  'js/core/career.js',
  'js/core/levels.js',
  'js/core/match.js',
  'js/core/physics.js',
  'js/core/progress.js',
  'js/core/quality.js',
  'js/core/rules.js',
  'js/core/store.js',
  'js/core/sync.js',
  'js/core/timing.js',
  'js/engine/bowler.js',
  'js/engine/perf.js',
  'js/engine/world.js',
  'js/game/game.js',
  'js/game/modes.js',
  'js/input.js',
  'js/main.js',
  'js/sync-github.js',
  'js/traj-service.js',
  'js/traj-worker.js',
  'js/ui/calib.js',
  'js/ui/menus.js',
  'js/ui/screens.js',
  'js/ui/session-ui.js',
  'legacy/v4.html',
  'length-reader.html',
  'manifest.webmanifest',
  'mirror.html',
  'vendor/three/three.module.min.js',
];
// @stamp-end
const CORE_CACHE = 'lr-core-' + VERSION;
const MP_CACHE = 'lr-mediapipe-0.10.14';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE_CACHE);
    // bypass the HTTP cache so a new version never stores stale files
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    if (!self.registration.active) await self.skipWaiting();        // first install: take over at once
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('lr-core-') && k !== CORE_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/vendor/mediapipe/')) {
    e.respondWith((async () => {
      const c = await caches.open(MP_CACHE), hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CORE_CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); }
    catch (err) {
      if (req.mode === 'navigate') { const home = await c.match('./'); if (home) return home; }
      throw err;
    }
  })());
});
