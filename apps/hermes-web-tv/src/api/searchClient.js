// api/searchClient.js — Frontend client for the /api/search route.
import { resolveApiBase } from './apiBase.js';
//
// Mirrors the BASE_URL auto-detect logic in api/hermesApi.js so the same
// three deployment shapes (local Vite dev, LAN mirror via 192.168.x.x,
// production https://hermestv.daveai.tech) all just work without an env
// file. Tizen 6.5 / Chrome 76 compatible — no async/await, no spread, no
// optional chaining.
//
// Honest error paths: every reject carries a `.code` and `.message` so the
// SearchModal can render a specific hint ("Couldn't reach search — try
// again") versus a vague "something went wrong". No silent fallback to
// mock data — the catalog has its own dev-mock path and we don't want
// search to lie about reachability.
//
// Exports:
//   searchCatalog({ query, type, limit, profileId, signal }) → Promise<SearchResponse>
//
// SearchResponse shape (from services/hermes-tv-api/src/routes/search.js):
//   {
//     query: string,
//     results: Array<{ id, title, type, category, poster_url, logo_url, resolution, score }>,
//     total: number,
//     returned: number,
//     _meta: { source, profile_filter, type_filter, limit }
//   }

var BASE_URL = resolveApiBase();

var DEFAULT_TIMEOUT_MS = 6000;
// Map the modal's UI tab ids to the API's `type` query values. The API
// validates against ['live', 'vod', 'series']; the modal exposes friendlier
// labels ('movies', 'series', 'live', 'actor'). 'actor' is a UI-only filter
// that still hits /api/search (the API does post-filter scoring by title
// regardless), so we treat 'actor' as "no type filter" and let the user
// type the actor name.
var UI_TYPE_TO_API_TYPE = {
  movies: 'vod',
  series: 'series',
  live: 'live',
};

function _makeError(code, message, extras) {
  var err = new Error(message);
  err.code = code;
  if (extras) {
    if (extras.status !== undefined) { err.status = extras.status; }
    if (extras.body !== undefined) { err.body = extras.body; }
  }
  return err;
}

function _fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  var timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  return new Promise(function(resolve, reject) {
    var settled = false;
    var timer = setTimeout(function() {
      if (settled) { return; }
      settled = true;
      reject(_makeError('timeout', 'Request timed out: ' + url));
    }, timeout);

    // Forward an external AbortSignal if the caller passed one (the modal
    // cancels in-flight requests when the user keeps typing).
    if (externalSignal && typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', function() {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        reject(_makeError('aborted', 'Request aborted by caller'));
      });
    }

    var opts = options || {};
    if (externalSignal) { opts.signal = externalSignal; }

    fetch(url, opts).then(function(response) {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      // AbortError surfaces as a DOMException with name 'AbortError'. Treat
      // it as a clean cancellation rather than a network failure.
      if (err && (err.name === 'AbortError' || err.code === 20)) {
        reject(_makeError('aborted', 'Request aborted by caller'));
        return;
      }
      var msg = (err && err.message) ? err.message : 'unknown network error';
      reject(_makeError('network', 'Network error: ' + msg));
    });
  });
}

function _handleJson(response) {
  return response.json().then(function(body) {
    if (response.ok) { return body; }
    var msg = (body && body.message) ? body.message : ('HTTP ' + response.status);
    var code = (body && body.error) ? body.error : 'http_error';
    throw _makeError(code, msg, { status: response.status, body: body });
  }, function(parseErr) {
    throw _makeError(
      'bad_response',
      'Server returned a non-JSON response (HTTP ' + response.status + ')',
      { status: response.status, body: parseErr }
    );
  });
}

function _encodeParams(params) {
  var parts = [];
  for (var key in params) {
    if (!Object.prototype.hasOwnProperty.call(params, key)) { continue; }
    var v = params[key];
    if (v === undefined || v === null || v === '') { continue; }
    parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  }
  return parts.join('&');
}

/**
 * Search the catalog.
 *
 * @param {Object}  args
 * @param {string}  args.query      - >= 2 char query string (caller should
 *                                    have already bounced empty input)
 * @param {string=} args.type       - UI tab id: 'movies'|'series'|'live'|'actor'|'all'
 * @param {number=} args.limit      - max results, default 25, server clamp 100
 * @param {string=} args.profileId  - 'dave_tv' | 'mom_tv'
 * @param {AbortSignal=} args.signal- optional cancellation signal
 * @returns {Promise<SearchResponse>}
 */
function searchCatalog(args) {
  args = args || {};
  var query = typeof args.query === 'string' ? args.query.trim() : '';
  if (query.length < 2) {
    return Promise.reject(_makeError(
      'validation_failed',
      'query must be at least 2 characters'
    ));
  }
  var apiType = UI_TYPE_TO_API_TYPE[args.type] || null;
  var params = {
    q: query,
    limit: typeof args.limit === 'number' && args.limit > 0 ? args.limit : 25,
  };
  if (apiType) { params.type = apiType; }
  if (args.profileId) { params.profile_id = args.profileId; }

  var url = BASE_URL + '/api/search?' + _encodeParams(params);
  return _fetchWithTimeout(url, { method: 'GET' }, DEFAULT_TIMEOUT_MS, args.signal)
    .then(_handleJson);
}

/**
 * Fetch all items in a single category. Backs the "popular categories"
 * chip row at the top of SearchModal (Sports / News / Movies / Kids → on
 * click the chip fires this and renders the result list directly without
 * needing a typed query).
 *
 * @param {Object}  args
 * @param {string}  args.category   - slug from /api/search/category list
 * @param {string=} args.profileId  - 'dave_tv' | 'mom_tv'
 * @param {AbortSignal=} args.signal
 * @returns {Promise<{ category: string, items: Array, total: number }>}
 */
function fetchCategory(args) {
  args = args || {};
  var category = typeof args.category === 'string' ? args.category.trim() : '';
  if (category.length === 0) {
    return Promise.reject(_makeError(
      'validation_failed',
      'category is required'
    ));
  }
  var params = {};
  if (args.profileId) { params.profile_id = args.profileId; }
  var qs = _encodeParams(params);
  var url = BASE_URL + '/api/search/category/' + encodeURIComponent(category)
    + (qs.length > 0 ? ('?' + qs) : '');
  return _fetchWithTimeout(url, { method: 'GET' }, DEFAULT_TIMEOUT_MS, args.signal)
    .then(_handleJson);
}

export { searchCatalog, fetchCategory };
