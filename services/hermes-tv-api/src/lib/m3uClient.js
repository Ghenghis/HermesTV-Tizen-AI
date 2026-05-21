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
// Provider truth contract: all provider config flows through the registry,
// not directly through env or providerStore. We keep a synchronous snapshot
// for resolver/status callers, refreshed by fetchCatalog().
var providerRegistry = require('./providerRegistry');

var CACHE_TTL_MS = 5 * 60 * 1000;
var FETCH_TIMEOUT_MS = 15000;
var MAX_ITEMS_PER_PROVIDER = 1500;

// Per-provider cache: { items, streamsByLocalId, fetchedAt, error }
var _cache = {};
var _inFlight = {};

// Synchronous snapshot of providerRegistry.listFull() m3u rows. Each entry:
// { cacheKey, provider_id, url, label, registry_id, source }.
var _registrySnapshot = [];

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

// Async hook so fetchCatalog can refresh the registry snapshot. Best-effort:
// on read error we keep the previous snapshot.
async function _refreshRegistrySnapshot() {
  try {
    var rows = await providerRegistry.listFull();
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r && r.type === 'm3u' && r.enabled !== false && typeof r.url === 'string' && r.url.length > 0) {
        var isEnv = r.source === 'env';
        var cacheKey = isEnv ? (r.provider_id || String(r.id || '').replace(/^env-/, '')) : r.id;
        out.push({
          cacheKey: cacheKey,
          provider_id: r.provider_id || cacheKey,
          url: r.url,
          label: r.label || r.provider_id || r.id,
          registry_id: r.id,
          source: r.source || 'config',
        });
      }
    }
    _registrySnapshot = out;
  } catch (e) {
    console.warn('[m3uClient] registry snapshot refresh failed: ' + SANITIZE(e && e.message ? e.message : 'unknown'));
  }
}

function isEnabled() {
  for (var k in PROVIDER_DEFS) {
    if (_providerUrl(k)) { return true; }
  }
  return _registrySnapshot.length > 0;
}

// Parse a single `#EXTINF:` line into an attribute map.
// Format: #EXTINF:-1 tvg-id="..." tvg-name="..." tvg-logo="..." group-title="...",Display Name
// Parse one #EXTINF attribute string ("tvg-id=... group-title=... ,display name").
// Handles quoted, single-quoted, AND unquoted attribute values, plus escaped
// quotes inside quoted values, plus malformed unterminated quotes (treats
// them as a single trailing value rather than crashing).
//
// Returns an object whose keys are attribute names + `_displayName` (the
// post-comma label) + `_attrPart` (the pre-comma segment, for debugging).
function _parseAttrs(extinfLine) {
  var attrs = {};
  // The display name is whatever follows the LAST comma at the top level
  // (Xtream + many providers emit `tvg-name="X,Y" ,Real Name`). Use lastIndexOf
  // since attribute values rarely contain a comma + space.
  var commaIdx = extinfLine.lastIndexOf(',');
  attrs._displayName = commaIdx >= 0 ? extinfLine.slice(commaIdx + 1).trim() : '';
  var attrPart = commaIdx >= 0 ? extinfLine.slice(0, commaIdx) : extinfLine;
  attrs._attrPart = attrPart;

  // Walk attrPart by hand so we can support quoted ("..."), single-quoted
  // ('...'), and unquoted (=token) values uniformly. Anchored on `(?:^|\s)`
  // so `my-tvg-id=` does NOT match the `tvg-id=` suffix.
  //
  //   group 1 = attribute name ([a-zA-Z][\w-]*)
  //   group 2 = double-quoted value (with escaped quotes \\")
  //   group 3 = single-quoted value (with escaped quotes \\')
  //   group 4 = unquoted value (terminated by whitespace or end)
  var re = /(?:^|\s)([a-zA-Z][\w-]*)=(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^\s"]+))/g;
  var m;
  while ((m = re.exec(attrPart)) !== null) {
    var name = m[1];
    var val;
    if (m[2] !== undefined) {       // double-quoted
      val = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (m[3] !== undefined) { // single-quoted
      val = m[3].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    } else {                          // unquoted
      val = m[4];
    }
    attrs[name] = val;
  }

  // Malformed-unterminated-quote recovery: if the line still contains an
  // odd number of unescaped double-quotes after the structured walk, the
  // regex skipped the broken value silently. Don't throw — extract a
  // best-effort `attr=tail` pair from the rest of the line as a graceful
  // degrade. Tests assert this branch only on the "does not crash" path.
  var unbalanced = (attrPart.match(/(^|[^\\])"/g) || []).length;
  if (unbalanced % 2 === 1) {
    var loose = /([a-zA-Z][\w-]*)="([^,]*)$/.exec(attrPart);
    if (loose && !attrs[loose[1]]) {
      attrs[loose[1]] = loose[2];
    }
  }
  return attrs;
}

// Parse just the #EXTM3U header line into a header-attrs object.
function _parseHeaderAttrs(line) {
  // Reuse _parseAttrs after stripping the leading directive and prepending
  // a comma so the display-name split returns empty.
  return _parseAttrs(line.replace(/^#EXTM3U\s*/i, '') + ',');
}

// Resolve the EPG URL from #EXTM3U header attrs. Real M3Us use one of
// three aliases. The first non-empty wins.
function _epgUrlFromHeader(headerAttrs) {
  if (!headerAttrs) { return ''; }
  if (typeof headerAttrs['x-tvg-url'] === 'string' && headerAttrs['x-tvg-url'].length > 0) { return headerAttrs['x-tvg-url']; }
  if (typeof headerAttrs['tvg-url'] === 'string' && headerAttrs['tvg-url'].length > 0) { return headerAttrs['tvg-url']; }
  if (typeof headerAttrs['url-tvg'] === 'string' && headerAttrs['url-tvg'].length > 0) { return headerAttrs['url-tvg']; }
  return '';
}

// Convert a raw attrs object into the canonical Entry shape consumed by
// catalog ingest + the m3uParser test contract.
function _attrsToEntry(attrs, urlLine, extgrpFallback) {
  var nameRaw = attrs._displayName || attrs['tvg-name'] || '';
  // Strip leftover quoted attribute fragments from the display name
  // (some providers emit malformed lines where attrs leak past the comma).
  var name = String(nameRaw).replace(/[a-zA-Z][\w-]*="[^"]*"\s*/g, '').trim();
  if (name.length === 0) { name = attrs['tvg-name'] || ''; }

  var group = attrs['group-title'] || extgrpFallback || '';

  var chnoStr = attrs['tvg-chno'];
  var chnoNum = (typeof chnoStr === 'string' && chnoStr.length > 0 && !isNaN(Number(chnoStr))) ? Number(chnoStr) : null;

  var catchupDaysStr = attrs['catchup-days'];
  var catchupDays = (typeof catchupDaysStr === 'string' && catchupDaysStr.length > 0 && !isNaN(Number(catchupDaysStr)))
    ? Number(catchupDaysStr) : null;

  var tvgType = attrs['tvg-type'] || null;
  var radioAttr = attrs['radio'] || '';
  var isRadio = false;
  if (typeof tvgType === 'string' && tvgType.toLowerCase() === 'radio') { isRadio = true; }
  if (typeof radioAttr === 'string' && radioAttr.toLowerCase() === 'true') { isRadio = true; }

  return {
    name: name,
    url: urlLine,
    tvgId: attrs['tvg-id'] || null,
    tvgName: attrs['tvg-name'] || null,
    tvgLogo: attrs['tvg-logo'] || null,
    group: group || null,
    tvgChno: chnoNum,
    catchup: attrs['catchup'] || null,
    catchupDays: catchupDays,
    userAgent: attrs['http-user-agent'] || null,
    referer: attrs['http-referrer'] || attrs['http-referer'] || null,
    tvgType: tvgType,
    isRadio: isRadio,
    attrs: attrs
  };
}

// Two-mode parser:
//   parseM3U(text, { shape: 'legacy' })  → returns the legacy array of
//     attrs objects (with _displayName + _url) so the existing
//     _mapToHermes consumer in this file keeps working without touching
//     Lane B's _fetchProvider call site.
//   parseM3U(text)                       → returns { entries, epgUrl } in
//     the canonical shape required by test/m3uParser.test.js + future EPG
//     waterfall work (Priority 3).
//
// The two shapes share the same line-walking core so behavior is
// guaranteed identical between callers.
function _parseM3U(text, opts) {
  opts = opts || {};
  var legacy = opts.shape === 'legacy';
  var lines = String(text || '').split(/\r?\n/);
  var entries = [];
  var legacyItems = [];
  var pending = null;
  var pendingExtGrp = '';
  var headerAttrs = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line && line.charCodeAt(0) === 0xFEFF) { line = line.slice(1); } // strip BOM
    line = line.replace(/^[​‌‍﻿]+/, '').trim();
    if (line.length === 0) { continue; }
    if (/^#EXTM3U/i.test(line)) {
      headerAttrs = _parseHeaderAttrs(line);
      continue;
    }
    if (line.indexOf('#EXTINF:') === 0) {
      pending = _parseAttrs(line);
      pendingExtGrp = ''; // reset for this pending entry
      continue;
    }
    if (/^#EXTGRP:/i.test(line)) {
      pendingExtGrp = line.replace(/^#EXTGRP:/i, '').trim();
      continue;
    }
    if (line.charAt(0) === '#') {
      // Ignore other directives (#KODIPROP, #EXTVLCOPT, generic comments).
      continue;
    }
    // Non-comment line — only a URL if we have a pending EXTINF.
    if (pending) {
      var urlLine = line;
      if (legacy) {
        pending._url = urlLine;
        // Also overlay extgrp fallback into group-title for legacy consumers
        if (!pending['group-title'] && pendingExtGrp) {
          pending['group-title'] = pendingExtGrp;
        }
        legacyItems.push(pending);
        if (legacyItems.length >= MAX_ITEMS_PER_PROVIDER) { break; }
      } else {
        entries.push(_attrsToEntry(pending, urlLine, pendingExtGrp));
        if (entries.length >= MAX_ITEMS_PER_PROVIDER) { break; }
      }
      pending = null;
      pendingExtGrp = '';
    }
    // Bare URL with no pending EXTINF: drop it (matches Extreme-InfiniTV
    // contract — a stream without metadata can't be cataloged).
  }

  if (legacy) { return legacyItems; }
  return { entries: entries, epgUrl: _epgUrlFromHeader(headerAttrs) };
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

function _mapToHermes(cacheKey, providerId, parsed) {
  var items = [];
  var streamsByLocalId = {};
  for (var i = 0; i < parsed.length; i++) {
    var p = parsed[i];
    var tvgId = p['tvg-id'] || '';
    var name = p._displayName || p['tvg-name'] || ('Channel ' + (i + 1));
    var group = p['group-title'] || 'general';
    var logo = _safeLogo(p['tvg-logo']);
    var localId = tvgId ? _slug(tvgId) : _slug(name) + '-' + i;
    var hermesId = 'm3u-' + cacheKey + '-' + localId;
    var resolution = _detectResolution(name, group);
    streamsByLocalId[localId] = p._url;
    items.push({
      id: hermesId,
      type: 'live',
      title: name,
      provider: providerId,
      category: _normaliseCategory(group),
      logo_url: logo,
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

// _fetchProvider supports both env-configured providers (URL looked up via
// PROVIDER_DEFS) and store-backed providers (URL passed explicitly via
// overrideUrl). The cache and in-flight tables are keyed by providerId so
// store rows with their unique `prov-<hex>` IDs never collide with the
// well-known `apollo_group` / `xtremehd` keys.
function _fetchProvider(providerId, overrideUrl, catalogProviderId) {
  var url = (typeof overrideUrl === 'string' && overrideUrl.length > 0) ? overrideUrl : _providerUrl(providerId);
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
      var parsed = _parseM3U(text, { shape: 'legacy' });
      var mapped = _mapToHermes(providerId, catalogProviderId || providerId, parsed);
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
  await _refreshRegistrySnapshot();
  if (_registrySnapshot.length === 0) { return []; }

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
  for (var k = 0; k < _registrySnapshot.length; k++) {
    var row = _registrySnapshot[k];
    var pid = row.cacheKey;
    var any = _getAnyCached(pid);
    var fresh = _getFreshCached(pid);
    if (any) { results.push(any); }
    if (!fresh) {
      // Kick off refresh, but never await on the request path.
      var p = _fetchProvider(pid, row.url, row.provider_id);
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
  // Registry-backed providers use IDs of shape `prov-<hex>`. The
  // hermes ID then becomes `m3u-prov-<hex>-<localId>`. We greedy-match the
  // first hyphen-group; if the resulting providerId is `prov` we know it's
  // a store row and need to re-split to capture `prov-<hex>` as the
  // provider key plus the rest as the localId.
  var m = /^m3u-([^-]+)-(.+)$/.exec(hermesChannelId);
  if (!m) { return null; }
  var providerId = m[1];
  var localId = m[2];
  if (providerId === 'prov') {
    // Re-split: providerId is `prov-<hex>`, localId is everything after.
    var m2 = /^m3u-(prov-[a-f0-9]+)-(.+)$/.exec(hermesChannelId);
    if (m2) {
      providerId = m2[1];
      localId = m2[2];
    }
  }
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
  // Surface every registry-backed provider too. Their cacheKey is
  // `prov-<hex>` so they slot into the same map without colliding with the
  // env-configured well-known keys.
  for (var i = 0; i < _registrySnapshot.length; i++) {
    var row = _registrySnapshot[i];
    var cc = _cache[row.cacheKey];
    status[row.provider_id] = {
      configured: true,
      label: row.label,
      count: cc ? cc.items.length : 0,
      error: cc ? cc.error : null,
      age_ms: cc ? (_now() - cc.fetchedAt) : null,
      registry_id: row.registry_id,
      source: row.source,
    };
  }
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

/**
 * Synchronous: flatten the per-provider cache into a single items[] array.
 * Used by routes/channels.js to derive the live-channel list without a
 * fresh network fetch. Returns [] when nothing is cached.
 */
function getCachedCatalog() {
  var out = [];
  for (var pid in _cache) {
    if (!Object.prototype.hasOwnProperty.call(_cache, pid)) { continue; }
    var c = _cache[pid];
    if (!c || !Array.isArray(c.items)) { continue; }
    for (var i = 0; i < c.items.length; i++) { out.push(c.items[i]); }
  }
  return out;
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
  getCachedCatalog: getCachedCatalog,
  // INTERNAL — never exposed via HTTP route. lib/streamResolver.js calls
  // resolveStreamUrl; test/m3uParser.test.js calls parseM3U.
  internal: {
    resolveStreamUrl: _resolveStreamUrl,
    parseM3U: function(text) { return _parseM3U(text); },
    parseAttrs: _parseAttrs,
  },
  _clearCache: _clearCache,
};
