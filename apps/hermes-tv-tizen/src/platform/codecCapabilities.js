'use strict';

// Codec capability detection for the Tizen webview.
//
// Why this exists (per docs/IPTV_Player_Zero/SAMSUNG_TIZEN_PORT.md §Q7
// limitations): the Q7-class QLED runs Tizen 6.5 with AVPlay v5, and AVPlay
// does not support every HLS / DASH variant the catalog might list. In
// particular, HEVC (H.265 / hev1 / hvc1) is hit-or-miss across model years
// and Dolby Vision is a paid Samsung license. If a stream URL points to a
// codec the TV can't decode, AVPlay just silently fails to start and the
// PlayerModal sits at "Connecting..." forever from the user's POV.
//
// To prevent that, the catalog pipeline can call probeCodecs() at boot and
// use the returned manifest to filter / re-rank streams. The catalog
// already tags items with `metadata.codec` when known; the filter layer
// pairs that tag with the probed manifest and demotes streams flagged as
// unsupported.
//
// QN85 enhanced-tier rule from CLAUDE.md: Mom's TV must never be
// system-limited. We DO NOT use this manifest to drop streams from Mom's
// catalog — we only surface it as advisory info to the catalog filter so
// Dave's degraded-tier UN-class TVs get streams matched to their
// capabilities. Mom's QN85 always sees the full catalog.
//
// ES5-only.

// Probe a representative spread of MSE codec strings. Returns a plain
// dictionary of { codecKey: bool } so callers can do
// `capabilities.hevc_main10` etc. without grepping strings.
function probeCodecs() {
  var caps = {
    h264_baseline: false,
    h264_main: false,
    h264_high: false,
    h264_high_10: false,
    hevc_main: false,
    hevc_main10: false,
    av1: false,
    vp9: false,
    aac_lc: false,
    eac3: false,
    opus: false,
    flac: false
  };

  // No MediaSource in this engine → leave all flags false. That signals
  // "we don't know, assume incompatible" rather than "we know it works".
  if (typeof window === 'undefined' ||
      typeof window.MediaSource === 'undefined' ||
      typeof window.MediaSource.isTypeSupported !== 'function') {
    return caps;
  }
  var MS = window.MediaSource;

  function probe(mime) {
    try { return MS.isTypeSupported(mime); } catch (_) { return false; }
  }

  // Video
  caps.h264_baseline = probe('video/mp4; codecs="avc1.42E01E"');
  caps.h264_main     = probe('video/mp4; codecs="avc1.4D401E"');
  caps.h264_high     = probe('video/mp4; codecs="avc1.64001E"');
  caps.h264_high_10  = probe('video/mp4; codecs="avc1.6E0028"');
  // HEVC: Samsung documents both hev1 and hvc1 fourCCs. Test both —
  // some Tizen builds accept only one.
  caps.hevc_main     = probe('video/mp4; codecs="hev1.1.6.L93.B0"') ||
                       probe('video/mp4; codecs="hvc1.1.6.L93.B0"');
  caps.hevc_main10   = probe('video/mp4; codecs="hev1.2.4.L150.B0"') ||
                       probe('video/mp4; codecs="hvc1.2.4.L150.B0"');
  caps.av1           = probe('video/mp4; codecs="av01.0.05M.08"');
  caps.vp9           = probe('video/webm; codecs="vp9"') ||
                       probe('video/mp4; codecs="vp09.00.10.08"');

  // Audio
  caps.aac_lc        = probe('audio/mp4; codecs="mp4a.40.2"');
  caps.eac3          = probe('audio/mp4; codecs="ec-3"');
  caps.opus          = probe('audio/webm; codecs="opus"') ||
                       probe('audio/ogg; codecs="opus"');
  caps.flac          = probe('audio/flac');

  return caps;
}

// Memoized accessor — probing is cheap but doing it from many places in
// the same render cycle adds noise to dlog and we want a stable view of
// the manifest for the lifetime of the page.
var _cachedCaps = null;
function getCodecCapabilities() {
  if (_cachedCaps) { return _cachedCaps; }
  _cachedCaps = probeCodecs();
  return _cachedCaps;
}

// Convenience predicate used by the catalog filter layer. Returns false
// when the probed manifest says the codec is unsupported AND we're not
// on an enhanced-tier TV. On enhanced-tier (QN-class) we return true
// regardless — per CLAUDE.md, Mom's TV is never system-limited.
//
// tier: 'enhanced' | 'degraded'   (matches App.jsx's resolveTier output)
// codecTag: case-insensitive substring of a codec name, e.g. 'hevc',
//           'h265', 'av1', 'vp9'. Anything else returns true (we have no
//           opinion and won't gate the stream).
function isCodecAllowed(codecTag, tier) {
  if (tier === 'enhanced') { return true; }
  if (!codecTag || typeof codecTag !== 'string') { return true; }
  var t = codecTag.toLowerCase();
  var caps = getCodecCapabilities();
  if (t.indexOf('hevc') !== -1 || t.indexOf('h265') !== -1 || t.indexOf('h.265') !== -1) {
    return caps.hevc_main || caps.hevc_main10;
  }
  if (t.indexOf('av1') !== -1) { return caps.av1; }
  if (t.indexOf('vp9') !== -1) { return caps.vp9; }
  // H.264 and AAC are baseline — assume supported even if MSE is absent.
  // Anything else: no opinion.
  return true;
}

// Reset for tests / hot reload.
function _resetCapabilityCache() {
  _cachedCaps = null;
}

module.exports = {
  probeCodecs: probeCodecs,
  getCodecCapabilities: getCodecCapabilities,
  isCodecAllowed: isCodecAllowed,
  _resetCapabilityCache: _resetCapabilityCache
};
