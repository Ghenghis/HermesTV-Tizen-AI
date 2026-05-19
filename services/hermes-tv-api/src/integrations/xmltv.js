'use strict';

/**
 * integrations/xmltv.js — XMLTV EPG fetcher, parser, and in-memory cache.
 *
 * Why it exists
 * ─────────────
 * /api/epg used to return a hard-coded stub. Now, the moment an operator drops
 * an XMLTV feed URL into the `XMLTV_URL` env var, this module:
 *   1. Fetches the XML (HTTPS / HTTP, Node built-in fetch, 10s timeout).
 *   2. Parses it with `fast-xml-parser` (~50KB, no native deps).
 *   3. Caches the parse for 5 minutes keyed by URL.
 *   4. Normalises every `<channel>` and `<programme>` into the JSON shape the
 *      EPGGrid component expects.
 *   5. Exposes the result via `getCachedEpg()` for cache-aware callers.
 *
 * Security
 * ────────
 *   - XMLTV URLs may carry credentials in the query string (`?key=...`,
 *     `?username=...`). They live ONLY in this module and the env. They are
 *     never returned in response bodies, never logged un-redacted (we hand
 *     err.message through `sanitizeForLog` from lib/sanitizeLog.js, and we
 *     only echo the URL's host in `_meta.source`).
 *   - Channel logos and program titles ARE returned to the client. We do not
 *     log program metadata — only counts.
 *
 * Caching
 * ───────
 *   - In-memory Map keyed by URL. TTL: 5 minutes. Evicts oldest entry once
 *     `MAX_CACHE_ENTRIES` is exceeded so a misbehaving operator who rotates
 *     URLs can't grow the cache without bound.
 *   - Concurrent fetches for the same URL coalesce via `_inFlight`.
 *   - On HTTP / parse error: serve stale cache if we have one (better than
 *     an empty grid), otherwise return `{channels:[], programs:[], error}`.
 *
 * XMLTV format reminder
 * ─────────────────────
 * The XMLTV DTD is liberal about timestamp format. We accept both:
 *   start="20260519080000 +0000"   (the historical XMLTV "no T, no dashes")
 *   start="20260519T080000Z"       (ISO 8601 basic)
 * Plus the slightly looser dashed variant some tools emit. All are converted
 * to ISO 8601 strings (`"2026-05-19T08:00:00.000Z"`) before returning.
 */

var fs = require('fs');
var path = require('path');
var SANITIZE = require('../lib/sanitizeLog').sanitizeForLog;

// fast-xml-parser exposes XMLParser as a class. We instantiate one parser per
// module load — it's pure config + has no internal state across parses.
var XMLParser = require('fast-xml-parser').XMLParser;

var CACHE_TTL_MS    = 5 * 60 * 1000;
var FETCH_TIMEOUT_MS = 10 * 1000;
var MAX_CACHE_ENTRIES = 8;

// Parser config — XMLTV uses element children + attribute carriers, so we
// preserve attributes (prefix `@_`) and trim text nodes.
var _xmlParser = new XMLParser({
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  trimValues:          true,
  // XMLTV programmes can have multiple <title>, <desc> children in different
  // languages. We force these to be arrays so the post-parse step doesn't
  // need to branch on "object vs array".
  isArray: function(name, jpath /*, isLeaf, isAttribute */) {
    return [
      'tv.channel',
      'tv.programme',
      'tv.channel.display-name',
      'tv.channel.icon',
      'tv.programme.title',
      'tv.programme.desc',
      'tv.programme.category',
    ].indexOf(jpath) !== -1;
  },
});

// Cache: Map<urlKey, { data, fetched_at, ttl_ms, expires_at }>
var _cache = new Map();
var _inFlight = new Map(); // Map<urlKey, Promise>

function _now() { return Date.now(); }

// ─── URL handling / redaction ────────────────────────────────────────────────

// The cache key is the URL with credentials stripped, so two URLs that differ
// only by token still resolve to the same channels/programs entry. This avoids
// duplicate cache rows when an operator's source rotates an auth token.
function _cacheKey(url) {
  try {
    var u = new URL(url);
    // Drop everything that looks like an auth token. We keep the path and
    // any non-credential query params so distinct feeds aren't collapsed.
    var CRED_KEYS = ['key', 'apikey', 'api_key', 'token', 'auth', 'username', 'password', 'pwd'];
    CRED_KEYS.forEach(function(k) { u.searchParams.delete(k); });
    return u.origin + u.pathname + (u.search || '');
  } catch (_) {
    // If the URL doesn't parse, fall back to its raw string. The caller will
    // surface a fetch error anyway.
    return String(url);
  }
}

// Returned in `_meta.source` so the operator can confirm which feed served
// the response. NEVER returns the full URL or query string — host + pathname
// only.
function _safeSourceLabel(url) {
  if (typeof url !== 'string' || url.length === 0) { return 'none'; }
  try {
    var u = new URL(url);
    return u.host + u.pathname;
  } catch (_) {
    return 'invalid-url';
  }
}

// ─── Timestamp parsing ───────────────────────────────────────────────────────

/**
 * Normalise an XMLTV timestamp to ISO 8601.
 * Accepts:
 *   "20260519080000 +0000"   (XMLTV traditional — 14-digit + space + tz)
 *   "20260519080000"         (XMLTV traditional — assume UTC)
 *   "20260519T080000Z"       (ISO 8601 basic with Z)
 *   "2026-05-19T08:00:00Z"   (ISO 8601 extended)
 *   "2026-05-19T08:00:00+00:00"
 * Returns ISO 8601 string or null when unparseable.
 */
function _parseTimestamp(raw) {
  if (typeof raw !== 'string' || raw.length === 0) { return null; }
  var s = raw.trim();

  // Path 1: Date.parse handles ISO 8601 EXTENDED (dashed) variants on every
  // supported Node version. We try it first.
  var t = Date.parse(s);
  if (!isNaN(t)) { return new Date(t).toISOString(); }

  // Path 2: ISO 8601 BASIC — "YYYYMMDDTHHMMSSZ" or "YYYYMMDDTHHMMSS±HHMM".
  // Node's Date.parse on V8 does NOT accept this form, so we expand it
  // into the extended form first.
  var iso8601Basic = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+\-]\d{2}:?\d{2})?$/.exec(s);
  if (iso8601Basic) {
    var expanded =
      iso8601Basic[1] + '-' + iso8601Basic[2] + '-' + iso8601Basic[3] + 'T' +
      iso8601Basic[4] + ':' + iso8601Basic[5] + ':' + iso8601Basic[6] +
      (iso8601Basic[7] || 'Z');
    var t2 = Date.parse(expanded);
    if (!isNaN(t2)) { return new Date(t2).toISOString(); }
  }

  // Path 3: traditional XMLTV. "YYYYMMDDHHMMSS" optionally followed by
  // " +HHMM" / " -HHMM" (or even no space, some emitters). The 14-digit
  // form is mandatory.
  var m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+\-]\d{2}):?(\d{2}))?$/.exec(s);
  if (!m) { return null; }
  var year = m[1], month = m[2], day = m[3], hh = m[4], mm = m[5], ss = m[6];
  // Tz default — UTC if absent.
  var tzHr = m[7] || '+00';
  var tzMn = m[8] || '00';
  // Build an ISO string Date.parse understands directly.
  var iso = year + '-' + month + '-' + day + 'T' + hh + ':' + mm + ':' + ss + tzHr + ':' + tzMn;
  var parsed = Date.parse(iso);
  if (isNaN(parsed)) { return null; }
  return new Date(parsed).toISOString();
}

// ─── XML → JSON normaliser ───────────────────────────────────────────────────

// Pulls a string value out of a parsed element. fast-xml-parser may return
// a string, a number, an object `{ '#text': '...' }`, or arrays of any of
// those when multiple children of the same tag exist. We pick the first one
// and stringify it.
function _textOf(node) {
  if (node === null || node === undefined) { return ''; }
  if (typeof node === 'string') { return node; }
  if (typeof node === 'number' || typeof node === 'boolean') { return String(node); }
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      var t = _textOf(node[i]);
      if (t.length > 0) { return t; }
    }
    return '';
  }
  if (typeof node === 'object') {
    if (typeof node['#text'] === 'string') { return node['#text']; }
    if (typeof node['#text'] === 'number') { return String(node['#text']); }
    // Some emitters put the language as an attribute and the text as #text.
    // If neither exists, give up.
    return '';
  }
  return '';
}

function _iconOf(channelNode) {
  // <icon src="..." /> — may be a single object, an array, or absent.
  var icon = channelNode.icon;
  if (!icon) { return null; }
  if (Array.isArray(icon)) { icon = icon[0]; }
  if (icon && typeof icon === 'object' && typeof icon['@_src'] === 'string') {
    return icon['@_src'];
  }
  return null;
}

/**
 * Parse an XMLTV XML string into normalised channels + programs.
 * Never throws — returns `{channels:[], programs:[], parse_error}` on
 * malformed input.
 */
function parseXmltv(xmlString) {
  if (typeof xmlString !== 'string' || xmlString.length === 0) {
    return { channels: [], programs: [], parse_error: 'empty input' };
  }
  var parsed;
  try {
    parsed = _xmlParser.parse(xmlString);
  } catch (e) {
    return {
      channels: [], programs: [],
      parse_error: 'xml_parse_failed: ' + SANITIZE(e && e.message ? e.message : 'unknown'),
    };
  }

  var tv = parsed && parsed.tv;
  if (!tv || typeof tv !== 'object') {
    return { channels: [], programs: [], parse_error: 'no <tv> root element' };
  }

  // ── Channels ────────────────────────────────────────────────────────────
  var channels = [];
  var rawChannels = Array.isArray(tv.channel) ? tv.channel : [];
  for (var i = 0; i < rawChannels.length; i++) {
    var c = rawChannels[i];
    if (!c || typeof c !== 'object') { continue; }
    var id = c['@_id'];
    if (typeof id !== 'string' || id.length === 0) { continue; }
    // display-name may be an array; pick the first non-empty entry.
    var name = '';
    if (Array.isArray(c['display-name'])) {
      for (var j = 0; j < c['display-name'].length; j++) {
        var n = _textOf(c['display-name'][j]);
        if (n.length > 0) { name = n; break; }
      }
    } else {
      name = _textOf(c['display-name']);
    }
    channels.push({
      id: id,
      name: name || id,
      logo_url: _iconOf(c),
    });
  }

  // ── Programs ────────────────────────────────────────────────────────────
  var programs = [];
  var rawPrograms = Array.isArray(tv.programme) ? tv.programme : [];
  for (var k = 0; k < rawPrograms.length; k++) {
    var p = rawPrograms[k];
    if (!p || typeof p !== 'object') { continue; }
    var channelId = p['@_channel'];
    if (typeof channelId !== 'string' || channelId.length === 0) { continue; }
    var startIso = _parseTimestamp(p['@_start']);
    var endIso   = _parseTimestamp(p['@_stop']);
    if (!startIso || !endIso) { continue; }

    var title = '';
    if (Array.isArray(p.title)) {
      title = _textOf(p.title[0]);
    } else {
      title = _textOf(p.title);
    }
    var desc = '';
    if (Array.isArray(p.desc)) {
      desc = _textOf(p.desc[0]);
    } else {
      desc = _textOf(p.desc);
    }

    programs.push({
      channel_id:  channelId,
      title:       title || '(no title)',
      description: desc,
      start:       startIso,
      end:         endIso,
    });
  }

  return { channels: channels, programs: programs };
}

// ─── Fetch + cache ───────────────────────────────────────────────────────────

function _evictIfFull() {
  if (_cache.size <= MAX_CACHE_ENTRIES) { return; }
  // Map iteration order is insertion order — drop the oldest entry.
  var iter = _cache.keys();
  var first = iter.next();
  if (!first.done) { _cache.delete(first.value); }
}

/**
 * Fetch and parse an XMLTV feed. Returns the cached entry when fresh,
 * otherwise hits the network. Never throws — surfaces transport / parse
 * failures via the `error` field on the returned object.
 *
 * @param  {string}  xmltvUrl   — full URL (may include credentials)
 * @param  {object?} opts       — { forceRefresh: bool }
 * @return {Promise<{channels, programs, fetched_at, error?}>}
 */
async function fetchEpg(xmltvUrl, opts) {
  opts = opts || {};
  if (typeof xmltvUrl !== 'string' || xmltvUrl.length === 0) {
    return {
      channels: [], programs: [],
      fetched_at: new Date(_now()).toISOString(),
      error: 'no_url',
    };
  }
  var key = _cacheKey(xmltvUrl);

  if (!opts.forceRefresh) {
    var cached = _cache.get(key);
    if (cached && cached.expires_at > _now()) {
      return cached.data;
    }
  }

  // Coalesce concurrent fetches for the same key — first one in pays the
  // network cost, the rest await the same Promise.
  if (_inFlight.has(key)) {
    return _inFlight.get(key);
  }

  var promise = (async function() {
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    var result;
    try {
      var res = await fetch(xmltvUrl, {
        method: 'GET',
        signal: ctrl.signal,
        headers: { 'Accept': 'application/xml, text/xml, */*' },
      });
      clearTimeout(timer);
      if (!res.ok) {
        var stale = _cache.get(key);
        if (stale && stale.data) {
          // Serve stale cache rather than an empty grid — operators can see
          // the warning in `_meta.message`. Refresh on next tick.
          return Object.assign({}, stale.data, {
            error: 'http_' + res.status + '_using_stale_cache',
          });
        }
        return {
          channels: [], programs: [],
          fetched_at: new Date(_now()).toISOString(),
          error: 'http_' + res.status,
        };
      }
      var text = await res.text();
      var parsed = parseXmltv(text);
      result = {
        channels:   parsed.channels,
        programs:   parsed.programs,
        fetched_at: new Date(_now()).toISOString(),
        error:      parsed.parse_error || null,
      };
      _cache.set(key, {
        data: result,
        fetched_at: _now(),
        ttl_ms: CACHE_TTL_MS,
        expires_at: _now() + CACHE_TTL_MS,
      });
      _evictIfFull();
      return result;
    } catch (err) {
      clearTimeout(timer);
      var msg = err && err.message ? SANITIZE(err.message) : 'unknown';
      var staleErr = _cache.get(key);
      if (staleErr && staleErr.data) {
        console.warn('[xmltv] fetch failed, serving stale cache: ' + msg);
        return Object.assign({}, staleErr.data, { error: 'fetch_failed_using_stale_cache' });
      }
      console.warn('[xmltv] fetch failed: ' + msg);
      return {
        channels: [], programs: [],
        fetched_at: new Date(_now()).toISOString(),
        error: 'fetch_failed: ' + msg,
      };
    } finally {
      _inFlight.delete(key);
    }
  })();

  _inFlight.set(key, promise);
  return promise;
}

/**
 * Returns the current cache entry for `xmltvUrl` without triggering a fetch.
 * Useful for diagnostics and the `_meta.cached_age_ms` echo. Returns `null`
 * when no cached entry exists.
 */
function getCachedEpg(xmltvUrl) {
  if (typeof xmltvUrl !== 'string' || xmltvUrl.length === 0) { return null; }
  var entry = _cache.get(_cacheKey(xmltvUrl));
  if (!entry) { return null; }
  return {
    data: entry.data,
    fetched_at: new Date(entry.fetched_at).toISOString(),
    expires_at: new Date(entry.expires_at).toISOString(),
    age_ms: _now() - entry.fetched_at,
    fresh: entry.expires_at > _now(),
  };
}

// ─── Channel mapping helper ──────────────────────────────────────────────────

var _channelMap = null;

function _loadChannelMap() {
  if (_channelMap !== null) { return _channelMap; }
  try {
    var fp = path.join(__dirname, '..', 'data', 'channelMap.json');
    var raw = fs.readFileSync(fp, 'utf8');
    var parsed = JSON.parse(raw);
    // Accept either the bare {xmltvId: hermesId} shape OR the documented
    // {map: {...}, _note: '...'} envelope. Either way we want just the map.
    if (parsed && typeof parsed === 'object' && parsed.map && typeof parsed.map === 'object') {
      _channelMap = parsed.map;
    } else if (parsed && typeof parsed === 'object') {
      _channelMap = parsed;
    } else {
      _channelMap = {};
    }
  } catch (e) {
    console.warn('[xmltv] channelMap.json load failed: ' + SANITIZE(e && e.message));
    _channelMap = {};
  }
  return _channelMap;
}

/**
 * Apply the operator-curated channelMap to a raw XMLTV result.
 *
 *   - Channels whose XMLTV id is missing from the map are DROPPED (they have
 *     no HermesTV counterpart, so the grid would show orphans).
 *   - Programs whose channel_id is missing from the map are likewise dropped.
 *   - The returned `channels[].id` and `programs[].channel_id` are the
 *     HermesTV catalog IDs, not the XMLTV IDs. The caller sees one consistent
 *     ID space.
 *   - Returns also `xmltv_channel_ids` — the first 20 raw XMLTV channel IDs
 *     from the feed, surfaced via the `X-Hermes-XMLTV-Channels` response
 *     header so operators can wire mappings without grepping logs.
 */
function applyChannelMap(epgResult) {
  var map = _loadChannelMap();
  var channels = [];
  var programs = [];
  var xmltvChannelIds = [];

  if (epgResult && Array.isArray(epgResult.channels)) {
    for (var i = 0; i < epgResult.channels.length; i++) {
      var c = epgResult.channels[i];
      if (xmltvChannelIds.length < 20) { xmltvChannelIds.push(c.id); }
      var hermesId = map[c.id];
      if (typeof hermesId !== 'string' || hermesId.length === 0) { continue; }
      channels.push({
        id:       hermesId,
        name:     c.name,
        logo_url: c.logo_url,
        xmltv_id: c.id, // operators may want to confirm the mapping
      });
    }
  }
  if (epgResult && Array.isArray(epgResult.programs)) {
    for (var j = 0; j < epgResult.programs.length; j++) {
      var p = epgResult.programs[j];
      var hid = map[p.channel_id];
      if (typeof hid !== 'string' || hid.length === 0) { continue; }
      programs.push({
        channel_id:  hid,
        title:       p.title,
        description: p.description,
        start:       p.start,
        end:         p.end,
      });
    }
  }
  return { channels: channels, programs: programs, xmltv_channel_ids: xmltvChannelIds };
}

// ─── Test / diagnostic surface ───────────────────────────────────────────────

function _clearCache() {
  _cache.clear();
  _inFlight.clear();
  _channelMap = null;
}

module.exports = {
  fetchEpg:           fetchEpg,
  parseXmltv:         parseXmltv,
  getCachedEpg:       getCachedEpg,
  applyChannelMap:    applyChannelMap,
  _safeSourceLabel:   _safeSourceLabel,
  _internal: {
    _parseTimestamp:  _parseTimestamp,
    _cacheKey:        _cacheKey,
    _clearCache:      _clearCache,
    _loadChannelMap:  _loadChannelMap,
    CACHE_TTL_MS:     CACHE_TTL_MS,
    FETCH_TIMEOUT_MS: FETCH_TIMEOUT_MS,
    MAX_CACHE_ENTRIES: MAX_CACHE_ENTRIES,
  },
};
