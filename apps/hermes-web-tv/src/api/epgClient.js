// epgClient — Electronic Program Guide REST client.
//
// Mirrors the IPTV Player Zero EPG data model (channels + programs +
// time-window query) but reshaped into a single GET that returns both
// channels and programs together. The TV-side EPGGrid component reads
// that shape directly with no extra normalisation.
//
// Contract:
//   - GET /api/epg?provider=<provider_id>&hours=<n>
//   - Response: { channels: [...], programs: [...], _meta: { source } }
//   - Throws an Error with .offline=true on network failure.
//   - Throws an Error with .status=<code> on HTTP error.
//   - NO silent mock fallback. The caller decides whether to render the
//     empty state or surface an error banner — we never invent data.
//
// Tizen 6.5 / Chrome 76 compatibility: no arrow functions, no destructuring
// in params, no template literals (string concatenation only), no optional
// chaining, no nullish coalescing.

// Base URL detection mirrors hermesApi.js so dev (cross-origin :3001),
// LAN mirror (192.168.x.x:3001), and prod (same-origin via host nginx)
// all resolve correctly. Kept in lock-step with hermesApi.js's auto-detect.
var BASE_URL = (function() {
  if (typeof window === 'undefined') { return ''; }
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') { return 'http://localhost:3001'; }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) { return 'http://' + h + ':3001'; }
  if (h === 'hermestv.local') { return 'http://hermestv.local'; }
  return '';
})();

var DEFAULT_TIMEOUT_MS = 8000;

function makeNetworkError(message) {
  var err = new Error(message);
  err.offline = true;
  return err;
}

function fetchWithTimeout(url, options, timeoutMs) {
  var timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(makeNetworkError('Request timed out: ' + url));
    }, timeout);

    fetch(url, options || {}).then(function(response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      clearTimeout(timer);
      reject(makeNetworkError('Network error: ' + (err && err.message ? err.message : 'unknown')));
    });
  });
}

/**
 * Fetch EPG channels + programs for a provider over a configurable window.
 *
 * @param {string} providerId  Provider id (e.g. 'apollo_group', 'xtremehd').
 *   When falsy, the backend may treat that as "default / first configured
 *   provider" — we still send the parameter so the contract stays explicit.
 * @param {number} hoursAhead  Look-ahead window in hours (1..48).
 *   The backend MAY clamp to its own ceiling; we don't validate client-side
 *   beyond a positive-integer cast.
 * @param {string} [startIso]  Optional ISO-8601 anchor for the window. When
 *   omitted, the backend anchors at "now - 30min" (so the in-progress
 *   program sits at the left edge of the grid). EPGModal passes today/
 *   tomorrow midnight here.
 * @returns {Promise<{channels: Array, programs: Array, _meta: {source: string, message?: string}}>}
 */
function fetchEPG(providerId, hoursAhead, startIso) {
  var hours = parseInt(hoursAhead, 10);
  if (isNaN(hours) || hours < 1) { hours = 4; }

  var qs = '?provider=' + encodeURIComponent(providerId || '')
    + '&hours=' + encodeURIComponent(String(hours));
  if (typeof startIso === 'string' && startIso.length > 0) {
    qs += '&start=' + encodeURIComponent(startIso);
  }

  return fetchWithTimeout(BASE_URL + '/api/epg' + qs).then(function(response) {
    if (!response.ok) {
      var httpErr = makeNetworkError('EPG fetch failed: HTTP ' + response.status);
      httpErr.status = response.status;
      // Try to surface the server message verbatim so the UI can render an
      // operator-actionable hint instead of a generic "fetch failed".
      return response.json().then(function(body) {
        if (body && body.message) { httpErr.message = body.message; }
        throw httpErr;
      }, function() {
        throw httpErr;
      });
    }
    return response.json().then(function(body) {
      // Defensive shape: always return { channels, programs, _meta } even if
      // the server omits one of them. _meta.source is the contract the UI
      // reads to render a "stub" or "live" badge.
      return {
        channels: (body && body.channels) ? body.channels : [],
        programs: (body && body.programs) ? body.programs : [],
        _meta: (body && body._meta) ? body._meta : { source: 'unknown' },
      };
    });
  });
}

export { fetchEPG };
