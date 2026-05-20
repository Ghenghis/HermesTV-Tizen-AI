// remoteClient.js — tiny POST helper for /api/remote/event.
//
// The phone-as-remote UI calls sendEvent(pairCode, key) on every D-pad
// press, trackpad gesture, OK/Back/Mic tap. We deliberately do NOT bring
// in the main app's HTTP client (apps/hermes-web-tv/src/services/api.js)
// because that pulls in profile/credential-aware code we don't want on
// the phone bundle.
//
// CONTRACT
//   sendEvent(pairCode, key, opts?) -> Promise<{ accepted, error? }>
//     Posts JSON { pair_code, key, modifiers?, ts } to /api/remote/event.
//     Resolves on any HTTP response (2xx -> { accepted: true }, non-2xx ->
//     { accepted: false, error }). Rejects on network failure.
//
//   API_BASE resolution:
//     - same-origin in prod (served by host nginx alongside the API)
//     - http://localhost:3001 in Vite dev when window.location.port === '5173'
//     - Override by setting window.__HERMES_API_BASE__ before app boot.

function resolveApiBase() {
  if (typeof window !== 'undefined' && window.__HERMES_API_BASE__) {
    return String(window.__HERMES_API_BASE__).replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location && window.location.port === '5173') {
    // Vite dev: API runs on :3001. Same hostname so a phone on the LAN
    // hitting http://192.168.1.10:5173/remote.html still reaches the API
    // at http://192.168.1.10:3001.
    return window.location.protocol + '//' + window.location.hostname + ':3001';
  }
  return '';
}

export var API_BASE = resolveApiBase();

export function sendEvent(pairCode, key, opts) {
  opts = opts || {};
  var body = {
    pair_code: pairCode,
    key: key,
    ts: Date.now(),
  };
  if (opts.modifiers) { body.modifiers = String(opts.modifiers).slice(0, 32); }

  return fetch(API_BASE + '/api/remote/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body),
    // No credentials: this is a LAN-only relay and CORS is set to
    // credentials:false in services/hermes-tv-api/src/index.js.
    credentials: 'omit',
    cache: 'no-store',
  }).then(function(r) {
    if (r.status === 202 || r.ok) {
      return { accepted: true };
    }
    return r.json().then(function(json) {
      return { accepted: false, error: (json && json.error) || ('http_' + r.status) };
    }).catch(function() {
      return { accepted: false, error: 'http_' + r.status };
    });
  });
}

// Optional pair-verify helper. The TV mints a pair code via /api/pair; the
// phone confirms it's a real code before persisting to localStorage. If the
// endpoint isn't reachable we still let the user proceed (LAN-only flow,
// the worst case is a no-op event POST).
export function verifyPairCode(pairCode) {
  return fetch(API_BASE + '/api/pair/' + encodeURIComponent(pairCode), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
  }).then(function(r) {
    if (r.ok) { return { valid: true }; }
    if (r.status === 404) { return { valid: false, error: 'not_found' }; }
    if (r.status === 400) { return { valid: false, error: 'invalid_format' }; }
    return { valid: false, error: 'http_' + r.status };
  }).catch(function() {
    // Network error - let the UI fall through and trust the format check.
    return { valid: true, offline: true };
  });
}

export default { sendEvent: sendEvent, verifyPairCode: verifyPairCode, API_BASE: API_BASE };
