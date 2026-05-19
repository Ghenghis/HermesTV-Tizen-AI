'use strict';

/**
 * lib/iptvOrg.js — public iptv-org catalog adapter.
 *
 * Reads the cached JSON files at `IPTV_ORG_CACHE_DIR` (default
 * /var/cache/iptv-org/) and builds an in-memory channel index that
 * routes/catalog.js can merge into /api/catalog responses.
 *
 * Source repo: https://github.com/iptv-org/iptv (Unlicense — public domain).
 * Companion API: https://iptv-org.github.io/api/
 *
 * Cache files (refreshed by lib/iptvOrgRefresh.js once per 24h):
 *   channels.json   — ~10k channels with categories/country/language/logo
 *   streams.json    — ~1.3k playable stream URLs keyed by channel.id
 *   guides.json     — XMLTV pointers (not consumed by this adapter)
 *   logos.json      — per-channel logo URLs in use
 *   categories.json — category whitelist source
 *   countries.json  — country whitelist source
 *   languages.json  — language code map
 *   blocklist.json  — DMCA-blocked channels (dropped from output)
 *
 * Server-side filtering before responding:
 *   1. Country whitelist (IPTV_ORG_COUNTRIES, default US,GB,CA,AU)
 *   2. Category whitelist (IPTV_ORG_CATEGORIES, default safe list)
 *   3. NSFW dropped (always, not configurable)
 *   4. Blocklisted channels dropped
 *   5. Closed channels dropped (channel.closed != null)
 *   6. Channels with no working stream dropped (must have streams.json entry)
 *
 * Stream URLs are NEVER returned to clients. They live server-side for
 * fetchStreamUrl() to use when /api/play resolves a ticket.
 */

var fs = require('fs');
var path = require('path');

var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — same pattern as lib/jellyfin.js

var _index = null;       // built index: { channels, streamsByChannel, blocklist, dataLoadedAt, dataAgeBaselineMs }
var _indexLoadedAt = 0;

function _now() { return Date.now(); }

function _cacheDir() {
  return process.env.IPTV_ORG_CACHE_DIR || '/var/cache/iptv-org';
}

function _readJSON(filename) {
  var fp = path.join(_cacheDir(), filename);
  try {
    var raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function _whitelist(envVar, fallback) {
  var raw = process.env[envVar];
  if (typeof raw !== 'string' || raw.trim().length === 0) { return fallback; }
  var set = {};
  raw.split(',').forEach(function(s) {
    var v = s.trim();
    if (v) { set[v.toUpperCase()] = true; }
  });
  return set;
}

function _toMap(arr, key) {
  var m = {};
  if (!Array.isArray(arr)) { return m; }
  for (var i = 0; i < arr.length; i++) {
    var entry = arr[i];
    if (entry && typeof entry === 'object' && entry[key]) {
      m[entry[key]] = entry;
    }
  }
  return m;
}

function _bestStream(channelId, streamsByChannel) {
  var list = streamsByChannel[channelId];
  if (!list || list.length === 0) { return null; }
  // Prefer highest declared quality.
  var rank = { '4K': 4, 'UHD': 4, '2160p': 4, '1440p': 3, '1080p': 3, '720p': 2, '576p': 1, '480p': 1, 'SD': 1 };
  var best = list[0];
  var bestRank = rank[(list[0].quality || '').toUpperCase()] || 0;
  for (var i = 1; i < list.length; i++) {
    var q = (list[i].quality || '').toUpperCase();
    var r = rank[q] || 0;
    if (r > bestRank) { best = list[i]; bestRank = r; }
  }
  return best;
}

function _bestLogo(channelId, channel, logosByChannel) {
  // Prefer an in-use logo from logos.json; fall back to channel.logo string.
  var list = logosByChannel[channelId];
  if (Array.isArray(list) && list.length > 0) {
    var inUse = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].in_use && list[i].url) {
        if (!inUse || ((list[i].width || 0) > (inUse.width || 0))) {
          inUse = list[i];
        }
      }
    }
    if (inUse) { return inUse.url; }
  }
  if (channel && typeof channel.logo === 'string' && channel.logo.length > 0) {
    return channel.logo;
  }
  // Stable fallback so the UI never renders a broken-image icon. Use a 1x1
  // transparent PNG data URI rather than a hermestv.local path so the browser
  // never performs a DNS lookup that fails in production (the web container
  // doesn't ship /assets/logos/*; only hashed JS/CSS chunks live there).
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Load (or reload) the index from disk. Idempotent — re-running it after
 * the cron has written new files refreshes the in-memory copy.
 */
function loadIndex() {
  var channels  = _readJSON('channels.json')  || [];
  var streams   = _readJSON('streams.json')   || [];
  var logos     = _readJSON('logos.json')     || [];
  var blocklist = _readJSON('blocklist.json') || [];

  var streamsByChannel = {};
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (!s || !s.channel || !s.url) { continue; }
    if (!streamsByChannel[s.channel]) { streamsByChannel[s.channel] = []; }
    streamsByChannel[s.channel].push(s);
  }

  var logosByChannel = {};
  for (var j = 0; j < logos.length; j++) {
    var l = logos[j];
    if (!l || !l.channel) { continue; }
    if (!logosByChannel[l.channel]) { logosByChannel[l.channel] = []; }
    logosByChannel[l.channel].push(l);
  }

  var blockSet = {};
  for (var k = 0; k < blocklist.length; k++) {
    if (blocklist[k] && blocklist[k].channel) { blockSet[blocklist[k].channel] = true; }
  }

  // Compute "data age" baseline from channels.json mtime (best signal we have).
  var dataLoadedAt = _now();
  var dataAgeBaselineMs = dataLoadedAt;
  try {
    var stat = fs.statSync(path.join(_cacheDir(), 'channels.json'));
    dataAgeBaselineMs = stat.mtimeMs;
  } catch (_) { /* ignore — fallback to dataLoadedAt */ }

  _index = {
    channels: channels,
    streamsByChannel: streamsByChannel,
    logosByChannel: logosByChannel,
    blockSet: blockSet,
    dataLoadedAt: dataLoadedAt,
    dataAgeBaselineMs: dataAgeBaselineMs,
  };
  _indexLoadedAt = dataLoadedAt;
  return _index;
}

function _maybeReload() {
  if (!_index) { return loadIndex(); }
  if ((_now() - _indexLoadedAt) > CACHE_TTL_MS) { return loadIndex(); }
  return _index;
}

function _mapChannelToItem(channel, streamsByChannel, logosByChannel) {
  var stream = _bestStream(channel.id, streamsByChannel);
  if (!stream) { return null; }
  var resolution = '1080p';
  if (stream && typeof stream.quality === 'string') {
    var q = stream.quality.toUpperCase();
    if (q === '4K' || q === 'UHD' || q === '2160P') { resolution = '4K'; }
    else if (q === '1440P') { resolution = '1440p'; }
    else if (q === '1080P') { resolution = '1080p'; }
    else if (q === '720P')  { resolution = '720p'; }
    else if (q === '576P' || q === '480P' || q === 'SD') { resolution = '480p'; }
  }
  var categories = Array.isArray(channel.categories) ? channel.categories : [];
  var category = categories[0] || 'general';

  return {
    id: 'iptv-' + channel.id,
    type: 'live',
    title: channel.name || channel.id,
    provider: 'iptv-org',
    category: category,
    logo_url: _bestLogo(channel.id, channel, logosByChannel),
    profile_access: ['dave_tv', 'mom_tv'],
    providers: [
      {
        provider_id: 'iptv-org',
        source_id: channel.id,
        source_health: { status: 'ok', latency_ms: null, checked_utc: null },
      },
    ],
    metadata: {
      resolution: resolution,
      country: channel.country || null,
      languages: channel.languages || [],
      categories: categories,
      is_nsfw: !!channel.is_nsfw,
    },
    quality: resolution,
  };
}

/**
 * Returns the filtered HermesTV-shape catalog array. NEVER throws — returns
 * an empty array on any error so the caller can still serve the mock seed.
 */
function fetchCatalog(opts) {
  opts = opts || {};
  var idx;
  try { idx = _maybeReload(); }
  catch (_) { return []; }
  if (!idx || idx.channels.length === 0) { return []; }

  var countryWhitelist  = _whitelist('IPTV_ORG_COUNTRIES',  { 'US': true, 'GB': true, 'CA': true, 'AU': true });
  var categoryWhitelist = _whitelist('IPTV_ORG_CATEGORIES', {
    'GENERAL': true, 'NEWS': true, 'SPORTS': true, 'MOVIES': true,
    'ENTERTAINMENT': true, 'KIDS': true, 'DOCUMENTARY': true,
    'LIFESTYLE': true, 'MUSIC': true,
  });

  var limit = (typeof opts.limit === 'number' && opts.limit > 0) ? Math.min(opts.limit, 500) : 300;
  var out = [];
  var channels = idx.channels;
  for (var i = 0; i < channels.length && out.length < limit; i++) {
    var c = channels[i];
    if (!c || !c.id) { continue; }
    if (c.is_nsfw === true) { continue; }
    if (c.closed) { continue; }
    if (idx.blockSet[c.id]) { continue; }
    var countryUpper = (c.country || '').toUpperCase();
    if (countryUpper && !countryWhitelist[countryUpper]) { continue; }
    var cats = Array.isArray(c.categories) ? c.categories : [];
    var catOk = false;
    for (var j = 0; j < cats.length; j++) {
      if (categoryWhitelist[String(cats[j]).toUpperCase()]) { catOk = true; break; }
    }
    if (cats.length > 0 && !catOk) { continue; }

    var item = _mapChannelToItem(c, idx.streamsByChannel, idx.logosByChannel);
    if (item) { out.push(item); }
  }
  return out;
}

/**
 * INTERNAL ONLY — never expose over HTTP and never include in any API
 * response body. Renamed from `fetchStreamUrl` to `_resolveStreamUrl` and
 * removed from module.exports per audit W3-B2 P0: when the function was
 * exported, a future route author could accidentally call
 * `iptvOrg.fetchStreamUrl(id)` and return the result, leaking the
 * provider's raw stream URL to the TV client.
 *
 * The /api/play endpoint will need this resolver at play-time — when that
 * land, expose it via a dedicated server-side play resolver module that
 * itself is not directly exposed over HTTP, OR re-add this as
 * `_resolveStreamUrl` to a curated `internal` export object that other
 * server-side modules call but routes can't accidentally proxy.
 */
function _resolveStreamUrl(channelId) {
  var idx = _maybeReload();
  if (!idx) { return null; }
  var stream = _bestStream(channelId, idx.streamsByChannel);
  return stream ? stream.url : null;
}

/**
 * Synchronous lookup for routes/play.js — finds an item by its HermesTV
 * channel ID (format: "iptv-<raw-channel-id>") in the currently-loaded
 * index. Triggers a normal lazy reload via _maybeReload if the cache
 * is cold. Returns null on miss.
 */
function getCachedItemById(hermesId) {
  if (typeof hermesId !== 'string' || hermesId.indexOf('iptv-') !== 0) { return null; }
  var rawId = hermesId.slice('iptv-'.length);
  var idx;
  try { idx = _maybeReload(); } catch (_) { return null; }
  if (!idx) { return null; }
  for (var i = 0; i < idx.channels.length; i++) {
    if (idx.channels[i] && idx.channels[i].id === rawId) {
      return _mapChannelToItem(idx.channels[i], idx.streamsByChannel, idx.logosByChannel);
    }
  }
  return null;
}

function getDataAgeHours() {
  if (!_index) { return null; }
  var ms = _now() - _index.dataAgeBaselineMs;
  return Math.round((ms / 3600000) * 10) / 10;
}

function isEnabled() {
  return String(process.env.IPTV_ORG_ENABLED || '').toLowerCase() === 'true';
}

function _clearCache() {
  _index = null;
  _indexLoadedAt = 0;
}

module.exports = {
  loadIndex: loadIndex,
  fetchCatalog: fetchCatalog,
  getCachedItemById: getCachedItemById,
  getDataAgeHours: getDataAgeHours,
  isEnabled: isEnabled,
  _clearCache: _clearCache,
  // INTERNAL — stream URL resolver lives behind this curated namespace.
  // lib/streamResolver.js is the single audited consumer (called from
  // routes/play.js at play-time only). The bare `fetchStreamUrl` /
  // `_resolveStreamUrl` names are intentionally NOT exported so a route
  // author cannot accidentally call `iptvOrg.fetchStreamUrl(id)` and
  // leak the upstream URL — they have to traverse `.internal.` which
  // makes the security boundary explicit. See audit W3-B2 P0.
  internal: {
    resolveStreamUrl: _resolveStreamUrl,
  },
};
