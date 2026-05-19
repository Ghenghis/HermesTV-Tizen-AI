'use strict';

// Tizen lifecycle + memory pressure helpers.
//
// Why this exists (per docs/IPTV_Player_Zero/SAMSUNG_TIZEN_PORT.md §Q7
// limitations): the Tizen 6.5 webview backs every app with a Chromium 76
// renderer that runs under tight memory caps. When the user presses Home
// or switches to a different app, Tizen suspends the page; if the page is
// holding a live <video> element with an HLS source attached, the
// platform may evict the renderer to reclaim memory rather than pause it
// cleanly. This module makes the eviction explicit and predictable:
//
//   1. On `visibilitychange` → 'hidden' we proactively pause and detach
//      any <video> srcObject / src so the AVPlay backend releases its
//      decoder slot. When we come back visible we let the player reattach
//      naturally on the next user gesture.
//
//   2. On `pagehide` we treat the same way as 'hidden' but additionally
//      revoke any blob: URLs we were holding for TTS audio (Azure voice
//      playback) so the bytes can be GC'd while the app is backgrounded.
//
//   3. We expose `addUserGestureListener` so other modules (specifically
//      the Azure TTS boot greeting) can wait for the first remote-OK /
//      tap before playing audio. Tizen 6.5 Chrome 76 enforces the
//      autoplay-with-sound rule the same way desktop Chrome 76 does, and
//      the boot greeting otherwise gets rejected with NotAllowedError.
//
// ES5-only — same constraint as src/api/apiBase.js. No `?.`, no template
// literals, no for...of.

var userGestureSeen = false;
var pendingGestureCallbacks = [];

function isTizenEnv() {
  if (typeof window === 'undefined') { return false; }
  var ua = (window.navigator && window.navigator.userAgent) || '';
  // Samsung Tizen TVs report "Tizen" in the UA string. Used as a coarse
  // guard so dev/desktop runs don't get the Tizen-specific behavior.
  return ua.indexOf('Tizen') !== -1;
}

function _detachAllVideos() {
  if (typeof document === 'undefined') { return; }
  var videos = document.getElementsByTagName('video');
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i];
    try {
      if (!v.paused) { v.pause(); }
      // Remember the src so the player can restore on resume. Reading
      // currentSrc not src because Vite's bundler sometimes inlines the
      // src attribute and we want the live URL.
      var live = v.currentSrc || v.getAttribute('src') || '';
      if (live) { v.setAttribute('data-hermes-suspended-src', live); }
      // Detach. removeAttribute('src') + load() is the documented way to
      // make Chromium release decoder resources.
      v.removeAttribute('src');
      // Some HLS.js attachments use MediaSource via srcObject — null it.
      try { v.srcObject = null; } catch (_) { /* ignore */ }
      if (typeof v.load === 'function') { v.load(); }
    } catch (videoErr) {
      // Never throw from lifecycle hooks. Log only.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tizenLifecycle] video detach failed:', videoErr && videoErr.message);
      }
    }
  }
}

// Revoke every object URL we recorded against an audio element. Azure
// voice playback (apps/hermes-web-tv/src/api/azureVoiceClient.js) creates
// these via URL.createObjectURL(blob) and normally revokes on `onended` —
// but if the user backgrounds the app mid-utterance the audio never ends
// and the blob URL leaks for the duration of the suspend.
function _revokeAudioBlobUrls() {
  if (typeof document === 'undefined' || typeof URL === 'undefined') { return; }
  var audios = document.getElementsByTagName('audio');
  for (var i = 0; i < audios.length; i++) {
    var a = audios[i];
    try {
      var src = a.currentSrc || a.getAttribute('src') || '';
      if (src.indexOf('blob:') === 0) {
        if (typeof a.pause === 'function') { a.pause(); }
        URL.revokeObjectURL(src);
        a.removeAttribute('src');
        if (typeof a.load === 'function') { a.load(); }
      }
    } catch (audioErr) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tizenLifecycle] audio revoke failed:', audioErr && audioErr.message);
      }
    }
  }
}

function _onVisibilityChange() {
  if (typeof document === 'undefined') { return; }
  if (document.visibilityState === 'hidden') {
    _detachAllVideos();
    _revokeAudioBlobUrls();
  }
}

function _onPageHide() {
  _detachAllVideos();
  _revokeAudioBlobUrls();
}

function _onFirstGesture() {
  if (userGestureSeen) { return; }
  userGestureSeen = true;
  var queue = pendingGestureCallbacks;
  pendingGestureCallbacks = [];
  for (var i = 0; i < queue.length; i++) {
    try { queue[i](); } catch (gestureErr) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tizenLifecycle] gesture callback failed:', gestureErr && gestureErr.message);
      }
    }
  }
}

// Public: install the lifecycle handlers. Returns an "uninstall" function
// so callers can clean up in tests / hot-reload. Idempotent — calling
// twice is safe; the second call replaces the previous listeners.
var _installed = false;
var _cleanupFns = [];

function installTizenLifecycle() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return function() {};
  }
  if (_installed) {
    return uninstallTizenLifecycle;
  }
  _installed = true;

  document.addEventListener('visibilitychange', _onVisibilityChange);
  _cleanupFns.push(function() {
    document.removeEventListener('visibilitychange', _onVisibilityChange);
  });

  window.addEventListener('pagehide', _onPageHide);
  _cleanupFns.push(function() {
    window.removeEventListener('pagehide', _onPageHide);
  });

  // First-gesture detection. Tizen Chrome 76 honors the autoplay policy,
  // so the boot Azure TTS greeting needs a real user gesture to play.
  // Listen on three sources: keydown (Tizen remote), click (touch /
  // pointer), and touchstart (some Samsung remotes ship a touchpad).
  // Mark as { once: true } so the listeners self-remove after the first
  // fire and don't pile up on long sessions.
  var gestureOpts = { once: true, passive: true };
  window.addEventListener('keydown', _onFirstGesture, gestureOpts);
  window.addEventListener('click', _onFirstGesture, gestureOpts);
  window.addEventListener('touchstart', _onFirstGesture, gestureOpts);
  _cleanupFns.push(function() {
    window.removeEventListener('keydown', _onFirstGesture, gestureOpts);
    window.removeEventListener('click', _onFirstGesture, gestureOpts);
    window.removeEventListener('touchstart', _onFirstGesture, gestureOpts);
  });

  return uninstallTizenLifecycle;
}

function uninstallTizenLifecycle() {
  for (var i = 0; i < _cleanupFns.length; i++) {
    try { _cleanupFns[i](); } catch (_) { /* ignore */ }
  }
  _cleanupFns = [];
  _installed = false;
}

// Public: schedule a callback to fire after the first user gesture. If a
// gesture has already happened the callback fires synchronously on the
// next microtask. Used by the boot greeting to gate Azure TTS playback.
function onUserGesture(cb) {
  if (typeof cb !== 'function') { return; }
  if (userGestureSeen) {
    // Defer to next tick so the caller doesn't get a synchronous re-entry
    // before its own setup finished.
    setTimeout(cb, 0);
    return;
  }
  pendingGestureCallbacks.push(cb);
}

function hasUserGestured() {
  return userGestureSeen;
}

module.exports = {
  isTizenEnv: isTizenEnv,
  installTizenLifecycle: installTizenLifecycle,
  uninstallTizenLifecycle: uninstallTizenLifecycle,
  onUserGesture: onUserGesture,
  hasUserGestured: hasUserGestured
};
