// useHlsStream — custom hook that wires an HLS stream URL into a <video>
// element. Handles the two engine paths HermesTV supports:
//
//   1. Native HLS (Safari, Tizen 6.5+ on Samsung TVs) — assign the URL
//      directly to video.src and the platform decoder handles the playlist
//      manifest, segment fetches, and ABR ladder internally.
//   2. MSE-based (Chrome 76 — desktop browsers and older Tizen builds) —
//      dynamic-import hls.js, attach it to the video element, and tear
//      it down on unmount.
//
// hls.js is loaded lazily via `import('hls.js')` so the ~80 KB gzipped
// chunk is NEVER part of the initial bundle. Only the first stream
// requested triggers the download; subsequent streams reuse the cached
// module via the Vite chunk cache.
//
// Tizen 6.5 / Chrome 76 compatibility notes:
//   - No top-level await — useEffect uses `.then()` chains, never `async`.
//   - No optional chaining inside hot paths — explicit null checks.
//   - hls.js@~1.5.x avoids the optional-chaining surface that lands in 1.6+.
//   - useEffect cleanup tears down the hls.js instance synchronously so
//     re-renders never leak a phantom MediaSource attached to a stale URL.
//
// Hook signature:
//   useHlsStream(url, videoRef) → { loading, error, level, levels }
//
//   url       — string HLS manifest URL (`.m3u8`). Falsy values are no-ops.
//   videoRef  — React.useRef pointing at the <video> element.
//   loading   — true between URL change and first MANIFEST_PARSED event.
//   error     — string when hls.js raises a fatal error, else null.
//   level     — currently-selected ABR level index (-1 = auto / unknown).
//   levels    — array of `{ height, bitrate, name }` from the manifest.
//
// Source-of-truth references:
//   - hls.js docs: https://github.com/video-dev/hls.js/blob/v1.5.20/docs/API.md
//   - MDN canPlayType: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/canPlayType
//
// Used by:
//   - components/MultiviewPlayer.jsx (2-4 simultaneous streams)
//   - (planned) components/PlayerModal.jsx single-stream playback follow-up

import React from 'react';

// Capability probe — runs once per call; cheap enough that we don't cache
// since the result is fixed for the lifetime of the page anyway.
function browserCanPlayHlsNatively(videoEl) {
  if (!videoEl) { return false; }
  // Apple's Safari and Tizen WebKit both return 'probably' for HLS;
  // Chrome / Firefox / Edge return '' so they fall through to hls.js.
  var canType = videoEl.canPlayType('application/vnd.apple.mpegurl');
  return canType === 'probably' || canType === 'maybe';
}

function useHlsStream(url, videoRef) {
  var loadingState = React.useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var errorState = React.useState(null);
  var error = errorState[0];
  var setError = errorState[1];

  var levelState = React.useState(-1);
  var level = levelState[0];
  var setLevel = levelState[1];

  var levelsState = React.useState([]);
  var levels = levelsState[0];
  var setLevels = levelsState[1];

  React.useEffect(function() {
    var videoEl = videoRef && videoRef.current;
    if (!videoEl || !url) {
      return undefined;
    }

    // Reset state for the new URL — keeps stale errors from confusing the UI.
    setError(null);
    setLoading(true);
    setLevels([]);
    setLevel(-1);

    var cancelled = false;
    var hlsInstance = null;

    if (browserCanPlayHlsNatively(videoEl)) {
      // Native HLS path. Wire src directly; the platform handles
      // manifest + segments. No JS bundle cost on this path.
      videoEl.src = url;
      // The 'loadedmetadata' event marks the manifest as parsed enough to
      // know duration, dimensions, and that playback can start. We flip
      // `loading` off there so the UI can swap the skeleton for the video.
      var onLoaded = function() {
        if (!cancelled) { setLoading(false); }
      };
      videoEl.addEventListener('loadedmetadata', onLoaded);
      return function() {
        cancelled = true;
        videoEl.removeEventListener('loadedmetadata', onLoaded);
        // Detach the source so the platform decoder releases the
        // underlying GPU/network resources promptly. Setting an empty
        // string is the cross-engine-safe way to do this on Tizen WebKit.
        try {
          videoEl.removeAttribute('src');
          videoEl.load();
        } catch (e) { /* best-effort teardown */ }
      };
    }

    // MSE / hls.js path. Dynamic import keeps the chunk out of the
    // initial bundle; the .then handler attaches once the module lands.
    import('hls.js').then(function(mod) {
      if (cancelled) { return; }
      var Hls = mod && mod.default ? mod.default : mod;

      // Hls.isSupported() guards against environments where hls.js
      // loaded but MSE is unavailable (rare, but degrades gracefully).
      if (!Hls || typeof Hls.isSupported !== 'function' || !Hls.isSupported()) {
        setError('HLS playback is not supported on this device.');
        setLoading(false);
        return;
      }

      hlsInstance = new Hls({
        // Conservative defaults — we're often running 2-4 streams in
        // parallel inside Multiview. Setting a tight max-buffer keeps
        // memory predictable on the QN85 GPU.
        maxBufferLength: 20,
        maxMaxBufferLength: 30,
        enableWorker: true,
      });

      hlsInstance.on(Hls.Events.MANIFEST_PARSED, function(_event, data) {
        if (cancelled) { return; }
        setLoading(false);
        if (data && Array.isArray(data.levels)) {
          var mapped = [];
          for (var i = 0; i < data.levels.length; i++) {
            var lv = data.levels[i] || {};
            mapped.push({
              height: lv.height || 0,
              bitrate: lv.bitrate || 0,
              name: lv.name || (lv.height ? (lv.height + 'p') : ('level ' + i)),
            });
          }
          setLevels(mapped);
        }
      });

      hlsInstance.on(Hls.Events.LEVEL_SWITCHED, function(_event, data) {
        if (cancelled) { return; }
        if (data && typeof data.level === 'number') {
          setLevel(data.level);
        }
      });

      hlsInstance.on(Hls.Events.ERROR, function(_event, data) {
        if (cancelled) { return; }
        // Non-fatal hls.js errors recover automatically. Surface only
        // fatal ones so the UI can show a useful message.
        if (data && data.fatal) {
          var detail = (data.details ? String(data.details) : 'fatal');
          setError('HLS error: ' + detail);
          setLoading(false);
        }
      });

      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoEl);
    }).catch(function(err) {
      if (cancelled) { return; }
      var msg = (err && err.message) ? err.message : 'unknown';
      setError('Failed to load HLS engine: ' + msg);
      setLoading(false);
    });

    return function() {
      cancelled = true;
      if (hlsInstance) {
        try { hlsInstance.destroy(); } catch (e) { /* best-effort */ }
        hlsInstance = null;
      }
    };
  }, [url, videoRef]); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading: loading, error: error, level: level, levels: levels };
}

export default useHlsStream;
export { useHlsStream };
