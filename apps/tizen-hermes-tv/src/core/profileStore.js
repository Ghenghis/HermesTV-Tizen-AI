// Per-profile settings store — profiles are fetched from the HermesTV backend.
// Valid profile IDs: 'mom_tv' (Sherri) and 'dave_tv' (Dave).
// Profile state is authoritative on the backend; this store is a read-through cache.
// Emits 'profile:updated' CustomEvent on any change.
//
// HARD RULES:
//   - Profile data comes from the backend (/api/profile/<id>), never hardcoded here.
//   - Credentials, tokens, and provider secrets must never appear in this file.
//   - localStorage is used ONLY to remember which profile was last active (a single
//     non-sensitive string: 'mom_tv' or 'dave_tv'). Full profile objects are NOT
//     written to localStorage/sessionStorage/cookies.
(function() {
  'use strict';

  var VALID_PROFILE_IDS = ['mom_tv', 'dave_tv'];
  var STORAGE_KEY_ACTIVE = 'hermes:active_profile_id';  // stores only the ID string

  var _active = null;   // current profile object (fetched from backend)
  var _pending = false; // true while a fetch is in flight

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function _emit() {
    var ev = document.createEvent('CustomEvent');
    ev.initCustomEvent('profile:updated', true, false, { profile: _active });
    document.dispatchEvent(ev);
  }

  function _isValidId(profileId) {
    return VALID_PROFILE_IDS.indexOf(profileId) !== -1;
  }

  // Persist only the active profile ID (not the full profile object).
  function _saveActiveId(profileId) {
    try { localStorage.setItem(STORAGE_KEY_ACTIVE, profileId); } catch (e) {}
  }

  // Read the last-used profile ID from localStorage. Defaults to 'mom_tv'.
  // This is the only value stored locally; the profile object itself always
  // comes from the backend.
  function getActiveId() {
    var stored;
    try { stored = localStorage.getItem(STORAGE_KEY_ACTIVE); } catch (e) {}
    return _isValidId(stored) ? stored : 'mom_tv';
  }

  // ---------------------------------------------------------------------------
  // Backend fetch
  // ---------------------------------------------------------------------------

  // Fetch a profile from the backend and activate it.
  // Calls callback(err, profile) when done.
  function _fetchAndActivate(profileId, callback) {
    if (_pending) return;
    _pending = true;

    var api = window.hermesApi;
    if (!api || typeof api.request !== 'function') {
      // hermesApi not yet ready — expose a low-level XHR path directly.
      var baseUrl = (window.hermesApi && window.hermesApi._baseUrl) || 'http://hermestv.local';
      var xhr = new XMLHttpRequest();
      xhr.open('GET', baseUrl + '/api/profile/' + encodeURIComponent(profileId), true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (window.HERMES_CAP && window.HERMES_CAP.modelCode) {
        xhr.setRequestHeader('X-Hermes-Device', window.HERMES_CAP.modelCode);
      }
      xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) return;
        _pending = false;
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300 && data) {
          _active = data;
          _saveActiveId(profileId);
          _emit();
          if (callback) callback(null, _active);
        } else {
          var err = { status: xhr.status, body: data };
          if (callback) callback(err, null);
        }
      };
      xhr.send(null);
      return;
    }

    // Use the shared api module if available.
    api.getProfile(profileId, function(err, data) {
      _pending = false;
      if (err || !data) {
        if (callback) callback(err || new Error('empty profile response'), null);
        return;
      }
      _active = data;
      _saveActiveId(profileId);
      _emit();
      if (callback) callback(null, _active);
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  // Activate a profile by fetching it from the backend.
  // profileId must be 'mom_tv' or 'dave_tv'.
  function activate(profileId, callback) {
    if (!_isValidId(profileId)) {
      var msg = '[profileStore] Invalid profile ID: ' + profileId +
                '. Must be one of: ' + VALID_PROFILE_IDS.join(', ');
      if (typeof console !== 'undefined') console.warn(msg);
      if (callback) callback(new Error(msg), null);
      return;
    }
    _fetchAndActivate(profileId, callback);
  }

  // Send a partial update to the backend and refresh the local cache on success.
  // fields: object of top-level or nested key-value pairs to update.
  // This does NOT write directly to localStorage — the backend is the source of truth.
  function update(fields, callback) {
    if (!_active) {
      if (callback) callback(new Error('[profileStore] No active profile'), null);
      return;
    }
    var api = window.hermesApi;
    if (!api || typeof api.updateProfile !== 'function') {
      // NOT_IMPLEMENTED: hermesApi.updateProfile() must be added to api.js.
      // It should POST to /api/profile/<id>/update with the fields object.
      if (callback) callback(new Error('[profileStore] hermesApi.updateProfile not available'), null);
      return;
    }
    api.updateProfile(_active.profile_id, fields, function(err, data) {
      if (err) { if (callback) callback(err, null); return; }
      _active = data || _active;
      _emit();
      if (callback) callback(null, _active);
    });
  }

  // Return the currently cached profile object (may be null before first fetch).
  function get() { return _active; }

  // ---------------------------------------------------------------------------
  // Boot: auto-activate last profile once DOM is ready
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function() {
    activate(getActiveId(), function(err) {
      if (err && typeof console !== 'undefined') {
        console.warn('[profileStore] Failed to fetch profile from backend:', err);
      }
    });
  });

  window.hermesProfile = { activate: activate, update: update, get: get, getActiveId: getActiveId };
}());
