'use strict';

/**
 * lib/xtreamClient.js — Xtream Codes REST API client.
 *
 * The de-facto standard "player API" every paid IPTV operator in 2026
 * speaks: Apollo Group, xTremeHD, and basically anyone running an
 * Xtream Codes panel (or an api-compatible fork like xui.one,
 * 1xtream, megaott, etc.). All endpoints are GET /player_api.php with
 * `action=<verb>` and the operator-issued user/pass in query params.
 *
 * Activates the moment the operator pastes credentials into:
 *   XTREAM_URL       — e.g. http://xtremehd.example:8080
 *   XTREAM_USERNAME
 *   XTREAM_PASSWORD
 *
 * Any of the three missing → isEnabled() returns false, every list
 * endpoint returns []. The catalog route can require() this module
 * unconditionally — it's a no-op until configured.
 *
 * --- Why this library exists ---
 * W12-RESEARCH FEATURE_GAP_2026.md flagged "no Xtream client" as the #1
 * integration gap: lib/streamResolver.js already DETECTS Xtream-shaped
 * URLs and bounces them with a 503 ("needs Threadfin proxy"), but we
 * never speak the panel's actual JSON API to enumerate the operator's
 * full catalog (live + vod + series + EPG). Without it we can never
 * surface VOD, series, catchup, or per-channel EPG from a paid panel —
 * features mainstream IPTV apps (TiviMate, IPTVnator, Smart IPTV) all
 * give users out of the box. This is the standalone library that
 * future wave-15 will wire into routes/catalog.js once verified
 * against a live operator endpoint.
 *
 * --- Caching ---
 * Two TTLs:
 *   - List/category endpoints: 5 min (matches m3uClient.js).
 *   - EPG endpoints (get_short_epg, get_simple_data_table): 60 s. EPG
 *     "now playing" data moves much faster than catalog structure.
 * In-flight dedupe per cache key — concurrent callers share a single
 * upstream fetch.
 *
 * --- Network ---
 * Node 20+ global fetch, 8 s timeout per call via AbortController
 * (matches m3uClient.js + streamProbe.js pattern). On transient failure
 * we serve stale cache when available, else [] / null — NEVER throw to
 * the route layer.
 *
 * --- Credential safety ---
 * `XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD` and any URL built
 * from them MUST be sanitised through `lib/sanitizeLog.sanitizeForLog`
 * before being written to console.warn/error. The sanitizer's
 * `/player_api.php[^\s'"]*/` pattern catches the full URL including
 * embedded creds. Tests assert no log line ever contains the literal
 * username or password.
 *
 * --- Stream URLs ---
 * `internal.resolveStreamUrl(channelId)` builds the per-channel TS/HLS
 * URL on demand from the cached stream_id table — same shape as
 * m3uClient.internal. It is NEVER exported on `module.exports` directly;
 * lib/streamResolver.js is the single audited consumer (just as it is
 * for m3uClient + iptvOrg). The /api/play route never sees the
 * credentialed URL — the URL is treated as ALWAYS credential-bearing
 * (operator-paid) and the hlsProxy ticket layer rewrites it.
 *
 * --- Auth ---
 * `player_api.php` returns `{user_info: {auth: 0}, ...}` when creds are
 * bad. We treat that as a soft failure: log the auth failure (sanitised)
 * and return [] / null. We do NOT raise — the operator may simply have
 * a typo'd password and we'd rather show "no catalog" than a 500.
 */

var SANITIZE = require('./sanitizeLog').sanitizeForLog;

var LIST_CACHE_TTL_MS = 5 * 60 * 1000;  // 5 minutes for catalog endpoints
var EPG_CACHE_TTL_MS = 60 * 1000;       // 60 s for EPG (now/next moves fast)
var FETCH_TIMEOUT_MS = 8000;            // matches m3uClient.js

// Unified cache: keyed by canonical endpoint+args string.
// Value shape: { data: <whatever fetch returned>, fetchedAt: <ms>, ttl: <ms>, error: <string|null> }
var _cache = {};
var _inFlight = {};

// ---------------------------------------------------------------------------
// Env / config
// ---------------------------------------------------------------------------

function _cfg() {
  var url = process.env.XTREAM_URL;
  var username = process.env.XTREAM_USERNAME;
  var password = process.env.XTREAM_PASSWORD;
  if (typeof url !== 'string' || url.trim().length === 0) { return null; }
  if (typeof username !== 'string' || username.trim().length === 0) { return null; }
  if (typeof password !== 'string' || password.trim().length === 0) { return null; }
  // Strip trailing slash so we can append `/player_api.php` cleanly.
  var base = url.trim().replace(/\/+$/, '');
  return { base: base, username: username.trim(), password: password.trim() };
}

function isEnabled() {
  return _cfg() !== null;
}

function _now() { return Date.now(); }

// ---------------------------------------------------------------------------
// Low-level fetch with timeout + in-flight dedupe + cache + soft-fail
// ---------------------------------------------------------------------------

function _buildUrl(cfg, action, params) {
  var qs = 'username=' + encodeURIComponent(cfg.username) +
           '&password=' + encodeURIComponent(cfg.password);
  if (action) {
    qs += '&action=' + encodeURIComponent(action);
  }
  if (params && typeof params === 'object') {
    for (var k in params) {
      if (!Object.prototype.hasOwnProperty.call(params, k)) { continue; }
      var v = params[k];
      if (v === null || v === undefined) { continue; }
      qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(String(v));
    }
  }
  return cfg.base + '/player_api.php?' + qs;
}

function _cacheKey(action, params) {
  var key = action || 'auth';
  if (params && typeof params === 'object') {
    var keys = Object.keys(params).sort();
    for (var i = 0; i < keys.length; i++) {
      key += '|' + keys[i] + '=' + String(params[keys[i]]);
    }
  }
  return key;
}

function _getCached(key) {
  var c = _cache[key];
  if (!c) { return null; }
  if ((_now() - c.fetchedAt) > c.ttl) { return null; }
  return c;
}

// _fetchAction returns a Promise that resolves to whatever JSON the
// Xtream panel returned (array, object, or {} on error). NEVER rejects —
// transient failures resolve to [] or null per the soft-fail contract.
function _fetchAction(action, params, ttlMs) {
  var cfg = _cfg();
  if (!cfg) { return Promise.resolve(null); }

  var key = _cacheKey(action, params);
  var fresh = _getCached(key);
  if (fresh) { return Promise.resolve(fresh.data); }

  if (_inFlight[key]) { return _inFlight[key]; }

  var url = _buildUrl(cfg, action, params);
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, FETCH_TIMEOUT_MS);

  _inFlight[key] = fetch(url, {
    method: 'GET',
    signal: ctrl.signal,
    headers: { 'Accept': 'application/json' },
  })
    .then(function(res) {
      clearTimeout(timer);
      if (!res.ok) {
        var err = new Error('Xtream HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.text();
    })
    .then(function(text) {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // Some panels return HTML on auth fail or maintenance pages.
        // Surface as soft failure.
        console.warn('[xtreamClient] ' + SANITIZE(action || 'auth') +
                     ' non-JSON response (' + (text.length || 0) + ' bytes)');
        parsed = null;
      }

      // The auth-probe endpoint (no action) returns {user_info, server_info}.
      // If user_info.auth === 0, the panel rejected our creds. Treat as
      // soft failure for list endpoints (return null so callers map to []).
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) &&
          parsed.user_info && Number(parsed.user_info.auth) === 0) {
        console.warn('[xtreamClient] auth=0 (panel rejected credentials) — returning empty result');
        // Cache the empty result briefly so we don't hammer the panel.
        var failEntry = { data: null, fetchedAt: _now(), ttl: ttlMs, error: 'auth_zero' };
        _cache[key] = failEntry;
        _inFlight[key] = null;
        return null;
      }

      var entry = { data: parsed, fetchedAt: _now(), ttl: ttlMs, error: null };
      _cache[key] = entry;
      _inFlight[key] = null;
      return parsed;
    })
    .catch(function(err) {
      clearTimeout(timer);
      _inFlight[key] = null;
      var msg = err && err.message ? err.message : 'unknown';
      console.warn('[xtreamClient] ' + SANITIZE(action || 'auth') +
                   ' fetch failed: ' + SANITIZE(msg));
      // Serve stale cache if we have one.
      var stale = _cache[key];
      if (stale) { return stale.data; }
      var failEntry = {
        data: null,
        fetchedAt: _now(),
        ttl: ttlMs,
        error: SANITIZE(msg),
      };
      _cache[key] = failEntry;
      return null;
    });

  return _inFlight[key];
}

// ---------------------------------------------------------------------------
// Public API — auth + server info
// ---------------------------------------------------------------------------

function getServerInfo() {
  return _fetchAction(null, null, LIST_CACHE_TTL_MS).then(function(payload) {
    if (!payload || typeof payload !== 'object') { return null; }
    // Shape returned by every Xtream panel I've seen:
    //   { user_info: {...}, server_info: {...} }
    var ui = payload.user_info || {};
    var si = payload.server_info || {};
    return {
      auth: Number(ui.auth) === 1,
      user_expiry: ui.exp_date || null,
      max_connections: ui.max_connections ? Number(ui.max_connections) : null,
      active_connections: ui.active_cons ? Number(ui.active_cons) : null,
      server_timezone: si.timezone || null,
      server_time: si.time_now || null,
      status: ui.status || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function _normaliseCategories(raw) {
  if (!Array.isArray(raw)) { return []; }
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var c = raw[i];
    if (!c || typeof c !== 'object') { continue; }
    out.push({
      category_id: c.category_id ? String(c.category_id) : null,
      category_name: c.category_name || c.name || 'Unknown',
      parent_id: c.parent_id != null ? String(c.parent_id) : null,
    });
  }
  return out;
}

function getLiveCategories() {
  return _fetchAction('get_live_categories', null, LIST_CACHE_TTL_MS)
    .then(_normaliseCategories);
}

function getVodCategories() {
  return _fetchAction('get_vod_categories', null, LIST_CACHE_TTL_MS)
    .then(_normaliseCategories);
}

function getSeriesCategories() {
  return _fetchAction('get_series_categories', null, LIST_CACHE_TTL_MS)
    .then(_normaliseCategories);
}

// ---------------------------------------------------------------------------
// Streams (live / vod / series list)
// ---------------------------------------------------------------------------

function getLiveStreams(opts) {
  opts = opts || {};
  var params = null;
  if (opts.category_id != null) {
    params = { category_id: String(opts.category_id) };
  }
  return _fetchAction('get_live_streams', params, LIST_CACHE_TTL_MS)
    .then(function(data) { return Array.isArray(data) ? data : []; });
}

function getVodStreams(opts) {
  opts = opts || {};
  var params = null;
  if (opts.category_id != null) {
    params = { category_id: String(opts.category_id) };
  }
  return _fetchAction('get_vod_streams', params, LIST_CACHE_TTL_MS)
    .then(function(data) { return Array.isArray(data) ? data : []; });
}

function getVodInfo(vodId) {
  if (vodId == null) { return Promise.resolve(null); }
  return _fetchAction('get_vod_info', { vod_id: vodId }, LIST_CACHE_TTL_MS)
    .then(function(data) { return data && typeof data === 'object' ? data : null; });
}

function getSeriesList(opts) {
  opts = opts || {};
  var params = null;
  if (opts.category_id != null) {
    params = { category_id: String(opts.category_id) };
  }
  return _fetchAction('get_series', params, LIST_CACHE_TTL_MS)
    .then(function(data) { return Array.isArray(data) ? data : []; });
}

function getSeriesInfo(seriesId) {
  if (seriesId == null) { return Promise.resolve(null); }
  return _fetchAction('get_series_info', { series_id: seriesId }, LIST_CACHE_TTL_MS)
    .then(function(data) { return data && typeof data === 'object' ? data : null; });
}

// ---------------------------------------------------------------------------
// EPG — short (now/next) and simple (full day) per channel
// ---------------------------------------------------------------------------

function getShortEpg(streamId, limit) {
  if (streamId == null) { return Promise.resolve([]); }
  var params = { stream_id: streamId };
  if (limit && Number(limit) > 0) { params.limit = Number(limit); }
  return _fetchAction('get_short_epg', params, EPG_CACHE_TTL_MS)
    .then(function(data) {
      // Panels return { epg_listings: [...] } or a bare array.
      if (Array.isArray(data)) { return data; }
      if (data && Array.isArray(data.epg_listings)) { return data.epg_listings; }
      return [];
    });
}

function getSimpleEpg(streamId) {
  if (streamId == null) { return Promise.resolve([]); }
  return _fetchAction('get_simple_data_table', { stream_id: streamId }, EPG_CACHE_TTL_MS)
    .then(function(data) {
      if (Array.isArray(data)) { return data; }
      if (data && Array.isArray(data.epg_listings)) { return data.epg_listings; }
      return [];
    });
}

// ---------------------------------------------------------------------------
// Stream URL resolution — INTERNAL, never exported on module.exports root
// ---------------------------------------------------------------------------

// Hermes ID shape: `xtream-<type>-<stream_id>` where type ∈ {live,vod,series}.
// streamResolver.js will dispatch on the `xtream-` prefix the same way it
// dispatches `m3u-` and `iptv-`.
function _resolveStreamUrl(hermesChannelId) {
  if (typeof hermesChannelId !== 'string') { return null; }
  var cfg = _cfg();
  if (!cfg) { return null; }
  var m = /^xtream-(live|vod|series)-(.+)$/.exec(hermesChannelId);
  if (!m) { return null; }
  var type = m[1];
  var streamId = m[2];
  // URL templates by type:
  //   live:   /live/<u>/<p>/<stream_id>.ts
  //   vod:    /movie/<u>/<p>/<stream_id>.<container_extension>
  //   series: /series/<u>/<p>/<episode_id>.<container_extension>
  // For VOD/series we'd need the container_extension from get_vod_info /
  // get_series_info — for now we default to .mp4 (the most common
  // container_extension Xtream panels use). A future enhancement: read
  // from cached VOD metadata.
  if (type === 'live') {
    return cfg.base + '/live/' +
      encodeURIComponent(cfg.username) + '/' +
      encodeURIComponent(cfg.password) + '/' +
      encodeURIComponent(streamId) + '.ts';
  }
  if (type === 'vod') {
    return cfg.base + '/movie/' +
      encodeURIComponent(cfg.username) + '/' +
      encodeURIComponent(cfg.password) + '/' +
      encodeURIComponent(streamId) + '.mp4';
  }
  if (type === 'series') {
    return cfg.base + '/series/' +
      encodeURIComponent(cfg.username) + '/' +
      encodeURIComponent(cfg.password) + '/' +
      encodeURIComponent(streamId) + '.mp4';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mapping: Xtream payload → HermesTV item shape
// ---------------------------------------------------------------------------

/**
 * Convert an Xtream API payload into a HermesTV catalog item.
 *
 * @param {object} x   — raw Xtream entity (stream / movie / series object)
 * @param {string} type — 'live' | 'vod' | 'series'
 * @returns {object|null} HermesTV item or null on bad input.
 *
 * Matches the shape used by m3uClient._mapToHermes / iptvOrg.mapChannelToItem
 * so the catalog merge in routes/catalog.js can treat all three sources
 * interchangeably (W13-MERGE dedupe + auto-fallback work out of the box).
 */
function toHermesItem(x, type) {
  if (!x || typeof x !== 'object') { return null; }
  if (type !== 'live' && type !== 'vod' && type !== 'series') { return null; }

  // Choose an id field: live/vod use stream_id, series uses series_id.
  var rawId;
  if (type === 'series') {
    rawId = x.series_id != null ? x.series_id : (x.id != null ? x.id : null);
  } else {
    rawId = x.stream_id != null ? x.stream_id : (x.id != null ? x.id : null);
  }
  if (rawId == null) { return null; }
  var sid = String(rawId);
  var hermesId = 'xtream-' + type + '-' + sid;

  var title = x.name || x.title || ('Xtream ' + type + ' ' + sid);
  var logo = x.stream_icon || x.cover || x.cover_big || null;
  var category = x.category_name || 'general';

  var metadata = {
    resolution: '1080p', // Xtream rarely reports — sensible default
    has_catchup: !!(x.tv_archive && Number(x.tv_archive) > 0),
    tvg_id: x.epg_channel_id || null,
  };

  if (type === 'vod') {
    metadata.container_extension = x.container_extension || 'mp4';
    metadata.rating = x.rating != null ? Number(x.rating) : null;
    metadata.release_date = x.releaseDate || x.release_date || null;
    metadata.tmdb_id = x.tmdb_id || x.tmdb || null;
  }
  if (type === 'series') {
    metadata.container_extension = x.container_extension || 'mp4';
    metadata.rating = x.rating != null ? Number(x.rating) : null;
    metadata.release_date = x.releaseDate || x.release_date || null;
    metadata.tmdb_id = x.tmdb_id || x.tmdb || null;
    metadata.last_modified = x.last_modified || null;
  }

  return {
    id: hermesId,
    type: type === 'series' ? 'series' : (type === 'vod' ? 'movie' : 'live'),
    title: title,
    provider: 'xtream',
    category: category,
    logo_url: logo,
    poster_url: logo,
    profile_access: ['dave_tv', 'mom_tv'],
    metadata: metadata,
    sources: [{
      provider_id: 'xtream',
      source_id: sid,
      resolution: metadata.resolution,
      is_seed_placeholder: false,
    }],
  };
}

// ---------------------------------------------------------------------------
// Diagnostics — same shape as m3uClient.getProviderStatus
// ---------------------------------------------------------------------------

function getProviderStatus() {
  var configured = isEnabled();
  // Find the most recent fetch across our cache buckets to age-report.
  var latestAt = 0;
  var lastError = null;
  for (var k in _cache) {
    if (!Object.prototype.hasOwnProperty.call(_cache, k)) { continue; }
    var e = _cache[k];
    if (e && e.fetchedAt > latestAt) { latestAt = e.fetchedAt; }
    if (e && e.error) { lastError = e.error; }
  }
  // Count live streams in cache (most useful diagnostic).
  var liveCount = 0;
  var liveKey = _cacheKey('get_live_streams', null);
  if (_cache[liveKey] && Array.isArray(_cache[liveKey].data)) {
    liveCount = _cache[liveKey].data.length;
  }
  return {
    configured: configured,
    label: 'Xtream Codes',
    count: liveCount,
    error: lastError,
    age_ms: latestAt > 0 ? (_now() - latestAt) : null,
  };
}

// ---------------------------------------------------------------------------
// Test hook — clears caches between unit tests
// ---------------------------------------------------------------------------

function _clearCache() {
  _cache = {};
  _inFlight = {};
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  isEnabled: isEnabled,
  getServerInfo: getServerInfo,
  getLiveCategories: getLiveCategories,
  getLiveStreams: getLiveStreams,
  getVodCategories: getVodCategories,
  getVodStreams: getVodStreams,
  getVodInfo: getVodInfo,
  getSeriesCategories: getSeriesCategories,
  getSeriesList: getSeriesList,
  getSeriesInfo: getSeriesInfo,
  getShortEpg: getShortEpg,
  getSimpleEpg: getSimpleEpg,
  toHermesItem: toHermesItem,
  getProviderStatus: getProviderStatus,
  // INTERNAL — only lib/streamResolver.js should call this. Never expose on
  // any HTTP route. Same audit boundary as m3uClient.internal.
  internal: {
    resolveStreamUrl: _resolveStreamUrl,
  },
  _clearCache: _clearCache,
};
