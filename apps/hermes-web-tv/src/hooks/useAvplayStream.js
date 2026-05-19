// useAvplayStream — bridge hook that prefers Samsung Tizen AVPlay for HLS
// playback when available, and falls back transparently to the existing
// hls.js path in any other environment.
//
// Why this exists (per apps/hermes-tv-tizen/AVPLAY_INTEGRATION.md):
//   - On Tizen 6.5 QLED TVs the hardware decoder reached through
//     window.webapis.avplay is materially faster and lower-power than
//     hls.js' software MSE pipeline, especially above 1080p60.
//   - But the same React shell also runs in desktop Chrome dev, in
//     Safari, and (for QR onboarding hand-off) in the Tizen built-in
//     browser, none of which expose `webapis.avplay`. So the hook must
//     degrade silently.
//
// Public shape (intentionally identical to useHlsStream so PlayerModal
// and MultiviewPlayer can swap implementations transparently):
//
//   useAvplayStream(url, videoRef) → { loading, error, level, levels }
//
//     url       — HLS manifest URL ('.m3u8'). Falsy → no-op.
//     videoRef  — React.useRef pointing at the <video> element. AVPlay
//                 doesn't draw into the <video>, but we still need the
//                 ref to (a) keep useHlsStream working when we fall
//                 through, and (b) read the bounding-rect to position
//                 the AVPlay hardware surface via setDisplayRect.
//     loading   — true between URL change and the first AVPlay
//                 onbufferingcomplete (or useHlsStream's loaded event).
//     error     — string when playback fails fatally, else null.
//     level     — currently-selected ABR level index, -1 = auto/unknown.
//                 AVPlay does not expose a per-level index in the way
//                 hls.js does; we report -1 ("auto") while AVPlay drives.
//     levels    — array of `{ height, bitrate, name }`. Empty when AVPlay
//                 drives (AVPlay manages ABR internally and does not
//                 surface the ladder to JS today).
//
// Tizen 6.5 / Chrome 76 compatibility constraints (same as useHlsStream):
//   - ES5 only — no `?.`, no `??`, no template literals outside JSX,
//     no async/await, no for...of.
//   - No top-level await. useEffect uses .then() chains where needed.
//   - No new npm deps. The hls.js fallback is delegated to the existing
//     useHlsStream hook, which itself lazy-imports hls.js.
//
// Source-of-truth references:
//   - apps/hermes-tv-tizen/AVPLAY_INTEGRATION.md  (state machine + DRM notes)
//   - apps/hermes-tv-tizen-native/src/ui/player/avplayEngine.js (legacy)
//   - docs/IPTV_Player_Zero/SAMSUNG_TIZEN_PORT.md §player-shim.js
//
// Used by (planned):
//   - components/PlayerModal.jsx   (swap useHlsStream → useAvplayStream)
//   - components/MultiviewPlayer.jsx (per-tile stream; AVPlay is single-
//     surface on Q7 so Multiview still uses useHlsStream — gated below)

import React from 'react';
import useHlsStream from './useHlsStream.js';

// Capability probe. Cached on first call; the result is fixed for the
// lifetime of the page (a TV cannot grow webapis.avplay at runtime).
var _avplayCapability = null;

function hasAvplay() {
  if (_avplayCapability !== null) { return _avplayCapability; }
  try {
    if (typeof window === 'undefined') { _avplayCapability = false; return false; }
    var w = window;
    if (!w.webapis || !w.webapis.avplay) { _avplayCapability = false; return false; }
    // Minimum surface we need. If any of these is missing the device is
    // exposing a partial AVPlay (rare, but documented on a handful of
    // 2017 QLED firmware revisions) and we treat it as unavailable.
    var av = w.webapis.avplay;
    if (typeof av.open !== 'function') { _avplayCapability = false; return false; }
    if (typeof av.play !== 'function') { _avplayCapability = false; return false; }
    if (typeof av.stop !== 'function') { _avplayCapability = false; return false; }
    if (typeof av.close !== 'function') { _avplayCapability = false; return false; }
    _avplayCapability = true;
    return true;
  } catch (probeErr) {
    _avplayCapability = false;
    return false;
  }
}

// Read window.webapis.avplay safely. Returns null on any miss so callers
// can branch with a single truthy check.
function _avplay() {
  try {
    if (typeof window === 'undefined') { return null; }
    if (!window.webapis || !window.webapis.avplay) { return null; }
    return window.webapis.avplay;
  } catch (e) {
    return null;
  }
}

// Best-effort: read the video element's bounding rect so AVPlay's
// hardware surface aligns under our React-driven controls. Falls back
// to the full panel resolution when the element isn't laid out yet.
function _readDisplayRect(videoEl) {
  try {
    if (!videoEl || typeof videoEl.getBoundingClientRect !== 'function') {
      return { x: 0, y: 0, w: 1920, h: 1080 };
    }
    var r = videoEl.getBoundingClientRect();
    var x = Math.max(0, Math.round(r.left || 0));
    var y = Math.max(0, Math.round(r.top || 0));
    var w = Math.max(1, Math.round(r.width || 1920));
    var h = Math.max(1, Math.round(r.height || 1080));
    return { x: x, y: y, w: w, h: h };
  } catch (rectErr) {
    return { x: 0, y: 0, w: 1920, h: 1080 };
  }
}

// AVPlay drive — stub-grade today. Opens, prepares, plays. Listener
// surface is wired enough to flip `loading` off on first
// onbufferingcomplete and to surface fatal errors. Richer features
// (ABR level enumeration, audio-track switching, TimeShift wall-clock
// time) are intentionally deferred — those tickets sit in the
// AVPLAY_INTEGRATION.md follow-up section.
function _driveAvplay(url, videoEl, onLoading, onError) {
  var av = _avplay();
  if (!av) {
    onError('AVPlay unavailable at drive-time');
    return function() {};
  }

  var closed = false;

  // Best-effort: keep any visible <video> element from also trying to
  // decode the same URL. AVPlay paints to its own hardware surface, so
  // a competing software decoder would just burn CPU.
  try {
    if (videoEl) {
      videoEl.removeAttribute('src');
      if (typeof videoEl.load === 'function') { videoEl.load(); }
    }
  } catch (videoErr) { /* best-effort */ }

  try {
    av.open(url);

    // Position the hardware surface under the React video element so
    // overlay controls line up. Re-read on every drive so layout
    // changes (multiview re-tile, modal resize) are honored.
    var rect = _readDisplayRect(videoEl);
    try {
      if (typeof av.setDisplayRect === 'function') {
        av.setDisplayRect(rect.x, rect.y, rect.w, rect.h);
      }
    } catch (rectErr) { /* best-effort */ }

    // Listener. AVPlay's listener object is a single bag — calling
    // setListener twice replaces, so we set once per drive.
    try {
      if (typeof av.setListener === 'function') {
        av.setListener({
          onbufferingstart: function() {
            if (closed) { return; }
            onLoading(true);
          },
          onbufferingcomplete: function() {
            if (closed) { return; }
            onLoading(false);
          },
          oncurrentplaytime: function(/* ms */) {
            // No-op in the stub; PlayerModal already polls
            // video.currentTime for its progress UI. When AVPlay paints
            // to its own surface, a follow-up patch will replace that
            // poll with this callback.
          },
          onstreamcompleted: function() {
            if (closed) { return; }
            onLoading(false);
          },
          onerror: function(errCode) {
            if (closed) { return; }
            var code = (errCode === null || typeof errCode === 'undefined')
              ? 'unknown'
              : String(errCode);
            onError('AVPlay error: ' + code);
            onLoading(false);
          }
        });
      }
    } catch (listenerErr) { /* best-effort */ }

    // Prepare → play. prepareAsync is the documented path; fall back
    // to the synchronous prepare() on older firmware that doesn't ship
    // it. We don't await on prepareAsync — the listener flips loading
    // off when buffering completes.
    if (typeof av.prepareAsync === 'function') {
      av.prepareAsync(
        function() {
          if (closed) { return; }
          try { av.play(); } catch (playErr) { onError('AVPlay play failed'); }
        },
        function(prepErr) {
          if (closed) { return; }
          var msg = (prepErr && prepErr.message) ? prepErr.message : 'prepare failed';
          onError('AVPlay prepare: ' + msg);
          onLoading(false);
        }
      );
    } else if (typeof av.prepare === 'function') {
      try {
        av.prepare();
        try { av.play(); } catch (playErr2) { onError('AVPlay play failed'); }
      } catch (prepSyncErr) {
        var msg2 = (prepSyncErr && prepSyncErr.message)
          ? prepSyncErr.message
          : 'prepare failed';
        onError('AVPlay prepare: ' + msg2);
        onLoading(false);
      }
    } else {
      onError('AVPlay: no prepare method');
      onLoading(false);
    }
  } catch (openErr) {
    var msg3 = (openErr && openErr.message) ? openErr.message : 'open failed';
    onError('AVPlay open: ' + msg3);
    onLoading(false);
    return function() {};
  }

  // Teardown.
  return function teardown() {
    if (closed) { return; }
    closed = true;
    var av2 = _avplay();
    if (!av2) { return; }
    try { av2.stop(); } catch (e1) { /* best-effort */ }
    try { av2.close(); } catch (e2) { /* best-effort */ }
  };
}

function useAvplayStream(url, videoRef) {
  // Capability is fixed for the page lifetime, but we still call it on
  // every render so a unit test that toggles window.webapis can flip
  // back to the hls.js path without unmounting the consumer.
  var avplayAvailable = hasAvplay();

  // Fallback delegation. When AVPlay isn't available we ALWAYS call
  // useHlsStream so the rules-of-hooks invariant holds. The order is
  // important: this useState/useEffect must run before any branch
  // that returns early.
  var hlsState = useHlsStream(avplayAvailable ? null : url, videoRef);

  var loadingState = React.useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var errorState = React.useState(null);
  var error = errorState[0];
  var setError = errorState[1];

  React.useEffect(function avplayEffect() {
    if (!avplayAvailable) {
      // hls.js path is driving; clear any AVPlay-specific state from a
      // prior render so the consumer doesn't see stale errors when
      // webapis.avplay flips off (rare, mostly a unit-test thing).
      setError(null);
      setLoading(false);
      return undefined;
    }
    var videoEl = videoRef && videoRef.current;
    if (!videoEl || !url) {
      return undefined;
    }

    setError(null);
    setLoading(true);

    var teardown = _driveAvplay(url, videoEl, setLoading, setError);
    return function avplayCleanup() {
      try { teardown(); } catch (cleanupErr) { /* best-effort */ }
    };
  }, [url, videoRef, avplayAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  // When AVPlay drives, return our local state. When hls.js drives,
  // return its state untouched so PlayerModal sees an ABR ladder etc.
  if (avplayAvailable) {
    return {
      loading: loading,
      error: error,
      level: -1, // AVPlay manages ABR internally; no per-level index today.
      levels: [] // No ladder surfaced from AVPlay. Filled in a later patch.
    };
  }
  return hlsState;
}

export default useAvplayStream;
export { useAvplayStream, hasAvplay };
