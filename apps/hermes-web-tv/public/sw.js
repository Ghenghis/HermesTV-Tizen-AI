'use strict';

// DaveTV Service Worker — boot-time asset caching for instant repeat visits.
//
// Strategy:
//   - /assets/*  (Vite hashed bundles)  → cache-first; immutable filenames
//     mean we can serve forever from cache + only refresh when a new hash
//     is referenced by the new HTML.
//   - /index.html, /remote.html         → stale-while-revalidate; user sees
//     yesterday's HTML instantly while we fetch fresh in the background.
//   - /api/*                            → ALWAYS network; never cache the
//     dynamic backend.
//   - Cross-origin (Cloudflare, Wikimedia, TMDb, imgur) → bypass; let the
//     browser's HTTP cache handle these.
//
// Cache version bump (CACHE_NAME) discards the previous cache on next
// activate so a bad cached HTML is one deploy away from being purged.

var CACHE_NAME = 'davetv-v1';
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/remote.html',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS).catch(function() {
        // Best-effort — don't fail install if a URL 404s during dev.
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE_NAME) { return caches.delete(k); }
        return null;
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') { return; }

  var url;
  try { url = new URL(req.url); }
  catch (_) { return; }

  // Never cache the backend.
  if (url.pathname.indexOf('/api/') === 0) { return; }
  // Don't shadow cross-origin caching strategies.
  if (url.origin !== self.location.origin) { return; }

  // Hashed assets are immutable — cache-first wins big.
  if (url.pathname.indexOf('/assets/') === 0) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        if (cached) { return cached; }
        return fetch(req).then(function(res) {
          if (res && res.ok) {
            var clone = res.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
          }
          return res;
        });
      })
    );
    return;
  }

  // HTML: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then(function(cached) {
      var fetchPromise = fetch(req).then(function(res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, clone); });
        }
        return res;
      }).catch(function() { return cached; });
      return cached || fetchPromise;
    })
  );
});
