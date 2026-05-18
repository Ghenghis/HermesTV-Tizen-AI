// HermesTV Quality Badge — renders resolution/HDR/upscale/bitrate badges
// for catalog cards and the player overlay.
// Returns DocumentFragment — all values set via textContent (no innerHTML).
(function() {
  'use strict';

  var RESOLUTION_CLASSES = {
    '4k':    'quality-badge--4k',
    '2160p': 'quality-badge--4k',
    '1440p': 'quality-badge--1440p',
    '1080p': 'quality-badge--1080p',
    '720p':  'quality-badge--720p',
    '480p':  'quality-badge--480p'
  };

  // Bitrate bucket → CSS class and color (dot).
  var BITRATE_COLORS = {
    low:    '#6B7280',
    medium: '#F5A524',
    high:   '#3EC97A',
    ultra:  '#9F7CFF'
  };

  var BITRATE_DOT_CLASSES = {
    low:    'bitrate-dot--low',
    medium: 'bitrate-dot--medium',
    high:   'bitrate-dot--high',
    ultra:  'bitrate-dot--ultra'
  };

  // Known HDR formats.
  var HDR_FORMATS = ['HDR10', 'HDR10+', 'Dolby Vision', 'HLG'];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _normalizeResolution(res) {
    if (!res) return null;
    var lower = res.toLowerCase().replace(/\s/g, '');
    // Accept "4k", "2160p", "1440p", "1080p", "720p", "480p", "unknown".
    if (lower === 'unknown' || lower === '') return null;
    if (lower === '4k' || lower === '2160p') return '4K';
    if (lower === '1440p') return '1440p';
    if (lower === '1080p') return '1080p';
    if (lower === '720p')  return '720p';
    if (lower === '480p')  return '480p';
    return null; // unrecognised → don't show
  }

  function _resolutionClass(res) {
    if (!res) return 'quality-badge--480p';
    var lower = res.toLowerCase();
    return RESOLUTION_CLASSES[lower] || 'quality-badge--480p';
  }

  function _isKnownHdr(hdrFormat) {
    if (!hdrFormat) return false;
    for (var i = 0; i < HDR_FORMATS.length; i++) {
      if (HDR_FORMATS[i].toLowerCase() === hdrFormat.toLowerCase()) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // render(quality) → DocumentFragment
  //
  // quality = {
  //   resolution, codec, bitrate_bucket, fps, audio_codec,
  //   possible_upscale, hdr_format
  // }
  // ---------------------------------------------------------------------------

  function render(quality) {
    var frag = document.createDocumentFragment();
    if (!quality) return frag;

    var resolution = _normalizeResolution(quality.resolution);

    // 1. Resolution pill (skip if null/unknown)
    if (resolution) {
      var pill = document.createElement('span');
      pill.className = 'quality-badge ' + _resolutionClass(resolution);

      var resText = resolution;

      // 4. Upscale warning appended to resolution text.
      if (quality.possible_upscale) {
        resText += ' ⚠';
        pill.classList.add('quality-badge--upscale-warn');
      }

      pill.textContent = resText;
      frag.appendChild(pill);
    }

    // 2. HDR sub-badge
    if (_isKnownHdr(quality.hdr_format)) {
      var hdrBadge = document.createElement('span');
      hdrBadge.className = 'quality-badge quality-badge--hdr';
      hdrBadge.textContent = quality.hdr_format;
      frag.appendChild(hdrBadge);
    }

    // 4. Bitrate dot
    var bucket = quality.bitrate_bucket ? quality.bitrate_bucket.toLowerCase() : null;
    if (bucket && BITRATE_DOT_CLASSES[bucket]) {
      var dot = document.createElement('span');
      dot.className = 'bitrate-dot ' + BITRATE_DOT_CLASSES[bucket];
      dot.style.background = BITRATE_COLORS[bucket] || '#6B7280';
      // Accessible label.
      dot.setAttribute('aria-label', bucket + ' bitrate');
      frag.appendChild(dot);
    }

    return frag;
  }

  // ---------------------------------------------------------------------------
  // renderCompact(resolution) → DocumentFragment
  // Small text-only badge for card overlays.
  // ---------------------------------------------------------------------------

  function renderCompact(resolution) {
    var frag = document.createDocumentFragment();
    var normalized = _normalizeResolution(resolution);
    if (!normalized) return frag;

    var span = document.createElement('span');
    span.className = 'quality-badge ' + _resolutionClass(normalized);
    span.textContent = normalized;
    frag.appendChild(span);
    return frag;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.hermesQualityBadge = {
    render:        render,
    renderCompact: renderCompact
  };
}());
