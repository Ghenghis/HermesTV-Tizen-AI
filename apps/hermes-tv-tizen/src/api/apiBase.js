'use strict';

// HermesTV Tizen API base
// Mom's QN85 calls the public VPS. The VPS holds all API keys.
// On dev workstation: override to local API via Samsung TV's Settings panel.

var DEFAULT_API_BASE = 'https://hermestv.example.com';

var apiBase = DEFAULT_API_BASE;

try {
  if (typeof window !== 'undefined' && window.localStorage) {
    var override = window.localStorage.getItem('hermestv.api_base');
    if (override && override.length > 0) {
      apiBase = override;
    }
  }
} catch (_) {}

function getApiBase() {
  return apiBase;
}

function setApiBase(url) {
  apiBase = url;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('hermestv.api_base', url);
    }
  } catch (_) {}
}

function fetchHermesAPI(path, opts) {
  var url = apiBase + (path.charAt(0) === '/' ? path : '/' + path);
  return fetch(url, opts || {});
}

module.exports = { getApiBase: getApiBase, setApiBase: setApiBase, fetchHermesAPI: fetchHermesAPI };
