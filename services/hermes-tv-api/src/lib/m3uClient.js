'use strict';

/**
 * lib/m3uClient.js — fetches and parses M3U playlists from operator-configured
 * upstream providers (Apollo Group, xTremeHD). Mirrors lib/iptvOrg.js patterns:
 * in-memory cache, server-only stream URL resolution, never returns the
 * raw upstream URL to clients.
 *
 * Activates the moment the operator pastes a value into:
 *   APOLLO_M3U_URL    → provider_id 'apollo_group'
 *   XTREMEHD_M3U_URL  → provider_id 'xtremehd'
 *
 * Both empty → dormant; isEnabled() returns false and fetchCatalog() short-
 * circuits to []. Callers (routes/catalog.js) can safely require this module
 * unconditionally.
 *
 * Cache: 5-min per provider, in-memory. First call to fetchCatalog after
 * boot triggers a refresh; subsequent calls within the TTL return the
 * cached parse.
 *
 * Network: global fetch (Node 20+) with a 15s timeout via AbortController.
 * On transient failure stale cache is served; on no-cache failure we
 * return an empty list (never throw to the route).
 *
 * Stream URLs live ONLY in the per-provider streamsByLocalId map. They
 * NEVER appear in catalog responses — routes/catalog.js maps to the
 * sanitized item shape only. The play-time resolver (lib/streamResolver)
 * is the single audited consumer of _resolveStreamUrl().
 */

var SANITIZE = require('./sanitizeLog').sanitizeForLog;

var CACHE_TTL_MS = 5 * 60 * 1000;
var FETCH_TIMEOUT_MS = 15000;
var MAX_ITEMS_PER_PROVIDER = 1500;

// Per-provider cache: { items, streamsByLocalId, fetchedAt, error }
var _cache = {};
var _inFlight = {};

var PROVIDER_DEFS = {
  apollo_group: { envVar: 'APOLLO_M3U_URL', label: 'Apollo Group' },
  xtremehd:     { envVar: 'XTREMEHD_M3U_URL', label: 'xTremeHD' },
};

function _now() { return Date.now(); }

function _providerUrl(providerId) {
  var def = PROVIDER_DEFS[providerId];
  if (!def) { return null; }
  var url = process.env[def.envVar];
  return (typeof url === 'string' && url.trim().length > 0) ? url.trim() : null;
}

function isEnabled() {
  for (var k in PROVIDER_DEFS) {
    if (_providerUrl(k)) { return true; }
  }
  return false;
}

// Parse a single `#EXTINF:` line into an attribute map.
// Format: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Display Name
function _parseAttrs(extinfLine) {
  var attrs = {};
  var commaIdx = extinfLine.lastIndexOf(',');
  attrs._displayName = commaIdx >= 0 ? extinfLine.slice(commaIdx + 1).trim() : '';
  var attrPart = commaIdx >= 0 ? extinfLine.slice(0, commaIdx) : extinfLine;
  var re = /([\w-]+)="([^"]*)"/g;
  var m;
  while ((m = re.exec(attrPart)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function _parseM3U(text) {
  var lines = String(text || '').split(/\r?\n/);
  var items = [];
  var pending = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line && line.charCodeAt(0) === 0xFEFF) { line = line.slice(1); } // strip BOM
    line = line.trim();
    if (line.length === 0) { continue; }
    if (line.indexOf('#EXTINF:') === 0) {
      pending = _parseAttrs(line);
    } else if (line.charAt(0) === '#') {
      // ignore other directives (#EXTM3U, #EXTGRP, #EXTVLCOPT, etc.)
    } else if (pending) {
      pending._url = line;
      items.push(pending);
      pending = null;
      if (items.length >= MAX_ITEMS_PER_PROVIDER) { break; }
    }
  }
  return items;
}

function _detectResolution(name, group) {
  var s = ((name || '') + ' ' + (group || '')).toUpperCase();
  if (/\b(4K|UHD|2160P)\b/.test(s)) { return '4K'; }
  if (/\b(2K|1440P)\b/.test(s)) { return '1440p'; }
  if (/\b(FHD|1080P)\b/.test(s)) { return '1080p'; }
  if (/\b(HD|720P)\b/.test(s)) { return '720p'; }
  if (/\b(SD|480P)\b/.test(s)) { return '480p'; }
  return '720p'; // sensible default for IPTV live channels
}

function _slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function _normaliseCategory(group) {
  var g = String(group || '').toLowerCase();
  if (g.indexOf('sport') !== -1) { return 'sports'; }
  if (g.indexOf('news') !== -1) { return 'news'; }
  if (g.indexOf('movie') !== -1 || g.indexOf('film') !== -1) { return 'movies'; }
  if (g.indexOf('kids') !== -1 || g.indexOf('family') !== -1) { return 'family'; }
  if (g.indexOf('music') !== -1) { return 'music'; }
  if (g.indexOf('document') !== -1) { return 'documentary'; }
  if (g.indexOf('hallmark') !== -1) { return 'hallmark'; }
  if (g.indexOf('mystery') !== -1) { return 'mysteries'; }
  if (g.indexOf('lifestyle') !== -1) { return 'lifestyle'; }
  return 'general';
}

// Defensive: some upstream providers embed creds in logo URLs too
// (e.g. `tvg-logo="http://host/get.php?username=X..."`). If any logo
// matches the credential-bearing shape, swap to a 1x1 transparent data
// URI so the catalog response cannot trigger credentialGuard and kill
// the entire payload, and so the browser never makes a DNS lookup for
// a hermestv.local fallback host that doesn't exist in production.
// We never just trust upstream metadata.
var DEFAULT_LOGO_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
var CRED_BEARING_LOGO = [/\/get\.php\?username=/i, /\/player_api\.php/i, /m3u_plus/i];
function _safeLogo(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return DEFAULT_LOGO_DATA_URI;
  }
  for (var i = 0; i < CRED_BEARING_LOGO.length; i++) {
    if (CRED_BEARING_LOGO[i].test(url)) {
      return DEFAULT_LOGO_DATA_URI;
    }
  }
  return url;
}

function _mapToHermes(providerId, parsed) {
  var items = [];
  var streamsByLocalId = {};
  for (var i = 0; i < parsed.length; i++) {
    var p = parsed[i];
    var tvgId = p['tvg-id'] || '';
    var name = p._displayName || p['tvg-name'] || ('Channel ' + (i + 1));
    var group = p['group-title'] || 'general';
    var logo = _safeLogo(p['tvg-logo']);
    var localId = tvgId ? _slug(tvgId) : _slug(name) + '-' + i;
    var hermesId = 'm3u-' + providerId + '-' + localId;
    var resolution = _detectResolution(name, group);
    streamsByLocalId[localId] = p._url;
    items.push({
      id: hermesId,
      type: 'live',
      title: name,
      provider: providerId,
      category: _normaliseCategory(group),
      logo_url: logo,
      profile_access: ['dave_tv', 'mom_tv'],
      providers: [{
        provider_id: providerId,
        source_id: tvgId || localId,
        source_health: { status: 'ok', latency_ms: null, checked_utc: null },
      }],
      metadata: {
        resolution: resolution,
        tvg_id: tvgId || null,
        group: group,
      },
      quality: resolution,
    });
  }
  return { items: items, streamsByLocalId: streamsByLocalId };
}

function _fetchProvider(providerId) {
  var url = _providerUrl(providerId);
  if (!url) {
    return Promise.resolve({ items: [], streamsByLocalId: {}, fetchedAt: _now(), error: 'not_configured' });
  }
  if (_inFlight[providerId]) { return _inFlight[providerId]; }

  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, FETCH_TIMEOUT_MS);

  _inFlight[providerId] = fetch(url, { method: 'GET', signal: ctrl.signal })
    .then(function(res) {
      clearTimeout(timer);
      if (!res.ok) {
        var err = new Error('M3U fetch returned HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.text();
    })
    .then(function(text) {
      var parsed = _parseM3U(text);
      var mapped = _mapToHermes(providerId, parsed);
      var result = {
        items: mapped.items,
        streamsByLocalId: mapped.streamsByLocalId,
        fetchedAt: _now(),
        error: null,
      };
      _cache[providerId] = result;
      _inFlight[providerId] = null;
      return result;
    })
    .catch(function(err) {
      clearTimeout(timer);
      _inFlight[providerId] = null;
      console.warn('[m3uClient] ' + providerId + ' fetch failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
      // Serve stale cache if we have one — better than nothing.
      var stale = _cache[providerId];
      if (stale) { return stale; }
      var fail = {
        items: [],
        streamsByLocalId: {},
        fetchedAt: _now(),
        error: err && err.message ? SANITIZE(err.message) : 'unknown',
      };
      _cache[providerId] = fail;
      return fail;
    });
  return _inFlight[providerId];
}

function _getFreshCached(providerId) {
  var c = _cache[providerId];
  if (!c) { return null; }
  if ((_now() - c.fetchedAt) > CACHE_TTL_MS) { return null; }
  return c;
}

/**
 * Returns flat array of HermesTV-shape items across all configured providers.
 * Never throws; on per-provider error returns whatever subset succeeded.
 *
 * opts.limit (default 600) caps the total returned items to keep the
 * /api/catalog payload reasonable for the QN85 over LAN.
 */
// Returns the cache entry for providerId regardless of TTL freshness.
// Used by the stale-while-revalidate path so we can always answer the
// catalog request instantly, even if every provider's data is stale.
function _getAnyCached(providerId) {
  return _cache[providerId] || null;
}

async function fetchCatalog(opts) {
  opts = opts || {};
  var limit = (typeof opts.limit === 'number' && opts.limit > 0) ? opts.limit : 600;
  var providerIds = Object.keys(PROVIDER_DEFS).filter(_providerUrl);
  if (providerIds.length === 0) { return []; }

  // Stale-while-revalidate. Live measurement on 2026-05-20 showed that when
  // the 5-min TTL expired, the next /api/catalog request blocked ~30 s waiting
  // for apollo's broken upstream to time out (15 s) + xtremehd's full re-parse.
  // The user-visible symptom was a 1-minute page load.
  //
  // The new contract:
  //   - If we have ANY cache for a provider (fresh or stale), use it now.
  //   - If the cache is stale or absent, kick off a refresh in the background
  //     so the next call sees fresh data — but never await it on the request
  //     path.
  //   - If a provider has no cache at all (cold boot, first request), we
  //     still need real data, so we await up to 2 s and then bail to whatever
  //     other providers responded. The pre-warm at server start (index.js)
  //     populates the cold cache before user traffic typically arrives.
  var results = [];
  var coldFetches = [];
  for (var k = 0; k < providerIds.length; k++) {
    var pid = providerIds[k];
    var any = _getAnyCached(pid);
    var fresh = _getFreshCached(pid);
    if (any) { results.push(any); }
    if (!fresh) {
      // Kick off refresh, but never await on the request path.
      var p = _fetchProvider(pid);
      if (!any) {
        // Cold cache — race the fetch against a 2 s hedge so the first
        // request after boot can still return SOMETHING if pre-warm hasn't
        // landed yet.
        coldFetches.push(p);
      }
      // Detach so unhandled-rejection telemetry stays clean.
      if (p && typeof p.catch === 'function') { p.catch(function() {}); }
    }
  }

  if (results.length === 0 && coldFetches.length > 0) {
    try {
      var raced = await Promise.race([
        Promise.all(coldFetches),
        new Promise(function(resolve) { setTimeout(function() { resolve(null); }, 2000); }),
      ]);
      if (Array.isArray(raced)) {
        for (var rr = 0; rr < raced.length; rr++) {
          if (raced[rr] && Array.isArray(raced[rr].items)) { results.push(raced[rr]); }
        }
      }
    } catch (_) {
      // race never throws (each fetch swallows its own errors), but be safe.
    }
  }

  var out = [];
  for (var i = 0; i < results.length && out.length < limit; i++) {
    var items = results[i].items;
    if (!Array.isArray(items)) { continue; }
    for (var j = 0; j < items.length && out.length < limit; j++) {
      out.push(items[j]);
    }
  }
  return out;
}

/**
 * INTERNAL — server-only stream URL resolver. Channel IDs follow the
 * pattern `m3u-<providerId>-<localId>`; we strip the prefix and look
 * up in the per-provider stream table.
 *
 * Never expose over HTTP. lib/streamResolver.js is the single audited
 * consumer.
 */
function _resolveStreamUrl(hermesChannelId) {
  if (typeof hermesChannelId !== 'string') { return null; }
  var m = /^m3u-([^-]+)-(.+)$/.exec(hermesChannelId);
  if (!m) { return null; }
  var providerId = m[1];
  var localId = m[2];
  var c = _cache[providerId];
  if (!c || !c.streamsByLocalId) { return null; }
  return c.streamsByLocalId[localId] || null;
}

/**
 * Per-provider diagnostics for /api/source-health and the operator settings
 * panel. Never includes URLs.
 */
function getProviderStatus() {
  var status = {};
  Object.keys(PROVIDER_DEFS).forEach(function(pid) {
    var c = _cache[pid];
    var configured = !!_providerUrl(pid);
    status[pid] = {
      configured: configured,
      label: PROVIDER_DEFS[pid].label,
      count: c ? c.items.length : 0,
      error: c ? c.error : null,
      age_ms: c ? (_now() - c.fetchedAt) : null,
    };
  });
  return status;
}

/**
 * Synchronous lookup against whatever is already in the per-provider
 * cache. Used by routes/play.js to find an item by ID without re-fetching
 * the M3U playlist. Returns null on cache miss — caller surfaces that
 * as a 404 / 503 to the user.
 */
function getCachedItemById(hermesId) {
  if (typeof hermesId !== 'string' || hermesId.indexOf('m3u-') !== 0) { return null; }
  for (var pid in _cache) {
    if (!Object.prototype.hasOwnProperty.call(_cache, pid)) { continue; }
    var c = _cache[pid];
    if (!c || !Array.isArray(c.items)) { continue; }
    for (var i = 0; i < c.items.length; i++) {
      if (c.items[i].id === hermesId) { return c.items[i]; }
    }
  }
  return null;
}

function _clearCache() {
  _cache = {};
  _inFlight = {};
}

module.exports = {
  isEnabled: isEnabled,
  fetchCatalog: fetchCatalog,
  getProviderStatus: getProviderStatus,
  getCachedItemById: getCachedItemById,
  // INTERNAL — never exposed via HTTP route; lib/streamResolver.js calls this.
  internal: {
    resolveStreamUrl: _resolveStreamUrl,
  },
  _clearCache: _clearCache,
};
