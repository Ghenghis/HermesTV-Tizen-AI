'use strict';

// HermesTV Tizen API base.
// Mom's QN85 calls the public VPS. The VPS holds all API keys.
// On dev workstation: override to local API via Samsung TV's Settings panel.
//
// Resolution order on boot:
//   1. ?api=<url> query string         (one-shot, useful for QR pairing)
//   2. localStorage 'hermestv.api_base' (sticky operator override)
//   3. DEFAULT_API_BASE                 (production canonical)
//
// A parallel agent may migrate the canonical from hermestv.daveai.tech to
// tv.daveai.tech. This file deliberately points at the existing canonical
// — don't fight the migration; rebase when the migration PR lands.

// tv.daveai.tech is the canonical short URL. hermestv.daveai.tech remains
// a valid alias on the VPS nginx (additive change in PR for tv.daveai.tech).
var DEFAULT_API_BASE = 'https://tv.daveai.tech';

function _normalize(url) {
  if (!url || typeof url !== 'string') { return ''; }
  var trimmed = url.replace(/\s+/g, '');
  // Strip a single trailing slash so callers can safely concatenate '/api/...'
  while (trimmed.length > 1 && trimmed.charAt(trimmed.length - 1) === '/') {
    trimmed = trimmed.substring(0, trimmed.length - 1);
  }
  return trimmed;
}

function _readQueryStringOverride() {
  try {
    if (typeof window === 'undefined' || !window.location || !window.location.search) {
      return '';
    }
    var search = window.location.search;
    // Tizen Chrome 76 supports URLSearchParams but we deliberately avoid it
    // here to keep this file zero-dependency and trivially testable in Node.
    var pairs = search.replace(/^\?/, '').split('&');
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split('=');
      if (pair[0] === 'api' && pair.length === 2) {
        return _normalize(decodeURIComponent(pair[1]));
      }
    }
  } catch (_) { /* ignore — fall through to defaults */ }
  return '';
}

function _readLocalStorageOverride() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) { return ''; }
    var override = window.localStorage.getItem('hermestv.api_base');
    if (override && override.length > 0) {
      return _normalize(override);
    }
  } catch (_) { /* ignore */ }
  return '';
}

var apiBase = (function() {
  var qs = _readQueryStringOverride();
  if (qs) { return qs; }
  var ls = _readLocalStorageOverride();
  if (ls) { return ls; }
  return _normalize(DEFAULT_API_BASE);
})();

function getApiBase() {
  return apiBase;
}

function setApiBase(url) {
  apiBase = _normalize(url);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('hermestv.api_base', apiBase);
    }
  } catch (_) { /* ignore */ }
}

function fetchHermesAPI(path, opts) {
  var p = (path && typeof path === 'string') ? path : '';
  var url = apiBase + (p.charAt(0) === '/' ? p : '/' + p);
  return fetch(url, opts || {});
}

module.exports = {
  DEFAULT_API_BASE: DEFAULT_API_BASE,
  getApiBase: getApiBase,
  setApiBase: setApiBase,
  fetchHermesAPI: fetchHermesAPI
};
