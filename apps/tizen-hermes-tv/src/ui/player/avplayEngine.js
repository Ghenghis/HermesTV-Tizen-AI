// HermesTV AVPlay Engine — HLS/HLS live streaming wrapper for Samsung Tizen TV.
// Uses webapis.avplay (Tizen-specific). Falls back to a mock in browser dev mode.
// No credentials are accepted in streamConfig.url.
(function() {
  'use strict';

  var KEY_PLAY  = 415;
  var KEY_PAUSE = 19;
  var KEY_STOP  = 413;
  var KEY_FF    = 417;
  var KEY_RW    = 412;

  var SEEK_STEP_MS = 10000; // 10 seconds for FF/RW

  var STATS_INTERVAL_MS = 5000;

  // ---------------------------------------------------------------------------
  // Mock AVPlay for browser/dev environment
  // ---------------------------------------------------------------------------

  var _mockAvplay = {
    open:                  function(url)          { console.log('[avplay-mock] open:', url); },
    setDisplayRect:        function(x, y, w, h)   { console.log('[avplay-mock] setDisplayRect:', x, y, w, h); },
    setStreamingProperty:  function(k, v)          { console.log('[avplay-mock] setStreamingProperty:', k, v); },
    setListener:           function(cb)            { console.log('[avplay-mock] setListener'); },
    prepareAsync:          function(ok, err)        { console.log('[avplay-mock] prepareAsync'); setTimeout(ok, 100); },
    play:                  function()              { console.log('[avplay-mock] play'); },
    pause:                 function()              { console.log('[avplay-mock] pause'); },
    stop:                  function()              { console.log('[avplay-mock] stop'); },
    close:                 function()              { console.log('[avplay-mock] close'); },
    getCurrentTime:        function()              { return 0; },
    getDuration:           function()              { return 0; },
    seekTo:                function(ms, ok, err)   { console.log('[avplay-mock] seekTo:', ms); if (ok) ok(); },
    getStreamInfo:         function()              { return []; }
  };

  function _avplay() {
    if (typeof webapis !== 'undefined' && webapis && webapis.avplay) {
      return webapis.avplay;
    }
    return _mockAvplay;
  }

  // ---------------------------------------------------------------------------
  // Credential guard
  // ---------------------------------------------------------------------------

  var CRED_PATTERNS = ['username=', 'password=', 'api_key='];

  function _urlHasCredentials(url) {
    var lower = (url || '').toLowerCase();
    for (var i = 0; i < CRED_PATTERNS.length; i++) {
      if (lower.indexOf(CRED_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var _containerId    = null;
  var _containerEl    = null;
  var _currentConfig  = null;
  var _statsCallback  = null;
  var _statsTimer     = null;
  var _keyHandler     = null;
  var _buffering      = false;

  // ---------------------------------------------------------------------------
  // Key event handler
  // ---------------------------------------------------------------------------

  function _handleKey(e) {
    var kc = e.keyCode;
    if (kc === KEY_PLAY) {
      player.play(_currentConfig || {});
    } else if (kc === KEY_PAUSE) {
      player.pause();
    } else if (kc === KEY_STOP) {
      player.stop();
    } else if (kc === KEY_FF) {
      player.seekForward(SEEK_STEP_MS);
    } else if (kc === KEY_RW) {
      player.seekBackward(SEEK_STEP_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Stats polling
  // ---------------------------------------------------------------------------

  function _pollStats() {
    if (!_statsCallback) return;
    var stats = player.getCurrentStats();
    _statsCallback(stats);
  }

  function _startStatsTimer() {
    _stopStatsTimer();
    _statsTimer = setInterval(_pollStats, STATS_INTERVAL_MS);
  }

  function _stopStatsTimer() {
    if (_statsTimer) {
      clearInterval(_statsTimer);
      _statsTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  var player = {
    init: function(containerId) {
      _containerId = containerId;
      _containerEl = document.getElementById(containerId);

      if (!_containerEl) {
        if (typeof console !== 'undefined') {
          console.warn('[avplayEngine] Container not found: ' + containerId);
        }
      }

      // Register key event listener.
      if (_keyHandler) {
        document.removeEventListener('keydown', _keyHandler);
      }
      _keyHandler = _handleKey;
      document.addEventListener('keydown', _keyHandler);
    },

    play: function(streamConfig) {
      _currentConfig = streamConfig || {};
      var url = _currentConfig.url || '';

      if (!url) {
        if (typeof console !== 'undefined') {
          console.error('[avplayEngine] play() called with no URL');
        }
        return;
      }

      if (_urlHasCredentials(url)) {
        if (typeof console !== 'undefined') {
          console.error('[avplayEngine] Rejected stream URL containing credentials.');
        }
        if (typeof _currentConfig.onError === 'function') {
          _currentConfig.onError(new Error('Stream URL must not contain credentials.'));
        }
        return;
      }

      var av = _avplay();

      try { av.stop(); } catch (e) {}
      try { av.close(); } catch (e) {}

      try {
        av.open(url);
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[avplayEngine] open() failed:', e);
        return;
      }

      // Position the player over the container element.
      if (_containerEl) {
        var rect = _containerEl.getBoundingClientRect();
        try {
          av.setDisplayRect(
            Math.round(rect.left),
            Math.round(rect.top),
            Math.round(rect.width),
            Math.round(rect.height)
          );
        } catch (e) {
          if (typeof console !== 'undefined') console.warn('[avplayEngine] setDisplayRect failed:', e);
        }
      }

      // Enhanced-tier stream configuration for QN-class QLED TVs (QN85, QN95).
      // Higher bitrate ceiling and larger buffer for 4K/HDR streaming preference.
      if (window.HERMES_CAP && window.HERMES_CAP.isEnhancedTier) {
        try {
          av.setStreamingProperty('ADAPTIVE_INFO', 'BITRATE_LIMIT=20000|BUFFER_SIZE=30');
        } catch (e) {}
        try {
          av.setStreamingProperty('HLS_REBUFFER_PERCENTAGE', '10');
        } catch (e) {}
        // Apply quality preference from stream config profile if supplied.
        if (_currentConfig.profile) {
          player.setQualityPreference(_currentConfig.profile);
        }
      } else {
        // UN-class degraded: conservative rebuffer, no high-bitrate limit.
        try {
          av.setStreamingProperty('HLS_REBUFFER_PERCENTAGE', '0');
        } catch (e) {}
      }

      // Listeners.
      try {
        av.setListener({
          onbufferingstart: function() {
            _buffering = true;
          },
          onbufferingprogress: function(percent) {
            // percent is 0-100; nothing to do here except track state.
          },
          onbufferingcomplete: function() {
            _buffering = false;
          },
          onerror: function(errCode) {
            if (typeof console !== 'undefined') {
              console.error('[avplayEngine] Player error:', errCode);
            }
          },
          onstreamcompleted: function() {
            if (typeof console !== 'undefined') {
              console.log('[avplayEngine] Stream completed.');
            }
            _stopStatsTimer();
          }
        });
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[avplayEngine] setListener failed:', e);
      }

      // Prepare and then play.
      try {
        av.prepareAsync(
          function() {
            try { av.play(); } catch (e2) {
              if (typeof console !== 'undefined') console.error('[avplayEngine] play() failed:', e2);
            }
            _startStatsTimer();
          },
          function(err) {
            if (typeof console !== 'undefined') console.error('[avplayEngine] prepareAsync failed:', err);
          }
        );
      } catch (e) {
        if (typeof console !== 'undefined') console.error('[avplayEngine] prepareAsync threw:', e);
      }
    },

    pause: function() {
      try { _avplay().pause(); } catch (e) {
        if (typeof console !== 'undefined') console.warn('[avplayEngine] pause() failed:', e);
      }
    },

    stop: function() {
      _stopStatsTimer();
      try { _avplay().stop(); } catch (e) {
        if (typeof console !== 'undefined') console.warn('[avplayEngine] stop() failed:', e);
      }
    },

    seekForward: function(ms) {
      var av = _avplay();
      try {
        var current = av.getCurrentTime();
        var target  = current + (ms || SEEK_STEP_MS);
        av.seekTo(target, null, null);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[avplayEngine] seekForward failed:', e);
      }
    },

    seekBackward: function(ms) {
      var av = _avplay();
      try {
        var current = av.getCurrentTime();
        var target  = Math.max(0, current - (ms || SEEK_STEP_MS));
        av.seekTo(target, null, null);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('[avplayEngine] seekBackward failed:', e);
      }
    },

    getCurrentStats: function() {
      var av = _avplay();
      var streamInfo = [];
      try { streamInfo = av.getStreamInfo() || []; } catch (e) {}

      var bitrateKbps = 0;
      var fps         = 0;
      var resolution  = '';

      // Parse stream info array for video track data.
      for (var i = 0; i < streamInfo.length; i++) {
        var info = streamInfo[i];
        if (info && info.type === 'VIDEO') {
          bitrateKbps = info.bitRate   ? Math.round(info.bitRate / 1000) : bitrateKbps;
          fps         = info.frameRate ? info.frameRate                  : fps;
          if (info.width && info.height) {
            resolution = info.width + 'x' + info.height;
          }
        }
      }

      return {
        bitrate_kbps: bitrateKbps,
        fps:          fps,
        resolution:   resolution,
        buffering:    _buffering
      };
    },

    onStatsUpdate: function(callback) {
      _statsCallback = typeof callback === 'function' ? callback : null;
    },

    // preferHDR — registers an ON_HDR_DETECTED listener when enabled (QN-class only).
    // No-op on UN-class or when AVPlay HDR events are unsupported.
    preferHDR: function(enabled) {
      if (!enabled) return;
      var av = _avplay();
      try {
        av.setStreamingProperty('ON_HDR_DETECTED', 'true');
      } catch (e) {
        if (typeof console !== 'undefined') {
          console.warn('[avplayEngine] preferHDR: ON_HDR_DETECTED not supported on this device:', e);
        }
      }
    },

    // setQualityPreference — applies bitrate caps from a profile quality_preference object.
    // enhanced (QN-class): prefer_4k → 20 Mbps max (4K HDR budget).
    // degraded (UN-class): cap at 8 Mbps to avoid overloading Crystal UHD hardware.
    setQualityPreference: function(profile) {
      if (!profile) return;
      var qp = profile.quality_preference || {};
      var av = _avplay();

      var isEnhanced = window.HERMES_CAP && window.HERMES_CAP.isEnhancedTier;
      var bitrateKbps;

      if (isEnhanced && qp.prefer_4k) {
        bitrateKbps = 20000; // 20 Mbps — 4K HDR budget for QN85/QN95
      } else if (!isEnhanced) {
        bitrateKbps = 8000;  // 8 Mbps cap — UN-class degraded ceiling
      }

      if (bitrateKbps) {
        try {
          av.setStreamingProperty('ADAPTIVE_INFO', 'BITRATE_LIMIT=' + bitrateKbps + '|BUFFER_SIZE=30');
        } catch (e) {
          if (typeof console !== 'undefined') {
            console.warn('[avplayEngine] setQualityPreference: ADAPTIVE_INFO failed:', e);
          }
        }
      }
    },

    destroy: function() {
      _stopStatsTimer();

      if (_keyHandler) {
        document.removeEventListener('keydown', _keyHandler);
        _keyHandler = null;
      }

      try { _avplay().stop();  } catch (e) {}
      try { _avplay().close(); } catch (e) {}

      _currentConfig  = null;
      _containerEl    = null;
      _containerId    = null;
      _statsCallback  = null;
      _buffering      = false;
    }
  };

  window.hermesPlayer = player;
}());
