'use strict';

// Service Worker registration — wired from main.jsx after React mounts so
// the SW install doesn't block first paint. No-ops on localhost (Vite dev
// server confuses SW caching) and when the browser lacks SW support
// (older Tizen builds, private-mode tabs).

export function registerServiceWorker() {
  if (typeof window === 'undefined') { return; }
  if (!('serviceWorker' in navigator)) { return; }
  // Vite dev server hot-reload + SW caching → stale modules. Skip in dev.
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return;
  }
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').then(function(reg) {
      // Optional: log the scope so the operator can verify SW coverage in
      // DevTools → Application → Service Workers. Sanitized so it doesn't
      // leak anything sensitive.
      try { console.log('[davetv] service worker registered, scope=' + (reg && reg.scope)); } catch (e) {}
    }).catch(function(err) {
      try { console.warn('[davetv] service worker registration failed: ' + (err && err.message)); } catch (e) {}
    });
  });
}

export default registerServiceWorker;
