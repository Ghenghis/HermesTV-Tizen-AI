// HermesTV VPS API client — ES5 compatible (XHR-based for Tizen 3.0)
(function() {
  'use strict';

  // Default backend origin — read from <meta name="hermes-api-url"> at boot (see main.js).
  // Falls back to http://hermestv.local (mDNS). Never hardcode a provider URL here.
  var BASE_URL = 'http://hermestv.local';

  function _getAuth() {
    var p = window.hermesProfile ? window.hermesProfile.get() : null;
    return {
      'X-Hermes-Profile': p ? p.profile_id : 'guest',
      'X-Hermes-Device':  (window.HERMES_CAP && window.HERMES_CAP.modelCode) || 'unknown'
    };
  }

  // XHR wrapper — works on Tizen 3.0 (no fetch)
  function request(method, path, body, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, BASE_URL + path, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    var auth = _getAuth();
    Object.keys(auth).forEach(function(k) { xhr.setRequestHeader(k, auth[k]); });
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = xhr.responseText; }
      if (xhr.status >= 200 && xhr.status < 300) {
        callback(null, data);
      } else {
        callback({ status: xhr.status, body: data }, null);
      }
    };
    xhr.send(body ? JSON.stringify(body) : null);
  }

  var api = {
    // Config
    setBaseUrl: function(url) { BASE_URL = url; },

    // Quality scanner
    getQuality:    function(streamId, cb) { request('GET',  '/api/quality/' + streamId, null, cb); },
    scanQuality:   function(streamId, url, cb) { request('POST', '/api/quality/scan', { stream_id: streamId, url: url }, cb); },

    // Channels + EPG
    getChannels:   function(cb) { request('GET', '/api/channels', null, cb); },
    getEpgGrid:    function(start, end, channelIds, cb) {
      var qs = '?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end);
      if (channelIds && channelIds.length) qs += '&channelIds=' + channelIds.join(',');
      request('GET', '/api/epg/grid' + qs, null, cb);
    },

    // Jellyfin
    getResume:     function(cb) { request('GET', '/api/jellyfin/resume', null, cb); },
    getNextUp:     function(cb) { request('GET', '/api/jellyfin/nextup', null, cb); },
    getTrending:   function(cb) { request('GET', '/api/jellyfin/trending', null, cb); },
    search:        function(q, cb) { request('GET', '/api/jellyfin/search?q=' + encodeURIComponent(q), null, cb); },
    reportProgress:function(itemId, posMs, cb) {
      request('POST', '/api/jellyfin/progress', { item_id: itemId, position_ms: posMs }, cb);
    },

    // Agent commands
    sendCommand:   function(cmd, cb) { request('POST', '/api/cmd', cmd, cb); },
    getAuditLog:   function(cb) { request('GET',  '/api/cmd/audit', null, cb); },

    // TTS
    getTts:        function(text, cb) {
      var p = window.hermesProfile ? window.hermesProfile.get() : null;
      var profile = p ? p.profile_id : 'dave_tv';
      request('POST', '/api/tts', { text: text, profile: profile }, cb);
    },

    // Profiles — fetched from backend; never hardcoded in the app
    getProfile:    function(profileId, cb) {
      request('GET', '/api/profile/' + encodeURIComponent(profileId), null, cb);
    },
    updateProfile: function(profileId, fields, cb) {
      request('POST', '/api/profile/' + encodeURIComponent(profileId) + '/update', fields, cb);
    },

    // Health
    getHealth:     function(cb) { request('GET', '/api/health', null, cb); },

    // Expose base URL for modules that need it before hermesApi is fully ready
    get _baseUrl() { return BASE_URL; }
  };

  window.hermesApi = api;
}());
