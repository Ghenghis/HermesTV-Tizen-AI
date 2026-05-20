'use strict';

/**
 * lib/epgWaterfall.js — pure EPG behavior helpers (Priority 3).
 *
 * Implements the EPG URL waterfall + program/channel merge + gzip
 * detection + safe fuzzy channel-name matching contracts adopted from
 * Extreme-InfiniTV's tests/epg-data.test.ts as a behavior contract
 * (PATTERN-ONLY adoption; no GPL source copied — see docs/48 §"Reference
 * App License Boundary").
 *
 * Public helpers (all pure functions; never touch network / fs):
 *
 *   buildEpgUrlsFromEntry(entry, creds, headerEpgUrl)
 *     → Array<{ url, source, kind }>
 *     Priority order:
 *       1. entry.epgUrl (user override) — kind=primary, source='override'
 *       2. headerEpgUrl (M3U #EXTM3U x-tvg-url) — kind=primary, source='m3u-header'
 *       3. xtream xmltv.php derived from creds — kind=primary, source='xtream-default'
 *      then entry.additionalEpgUrls — kind=additional, source='additional'
 *     Dedupe across the resulting list. Whitespace trimmed; blanks dropped.
 *     entry.disableProviderEpg suppresses the auto-derived primary
 *     (xtream-default + m3u-header) but keeps user override + additional.
 *
 *   dedupeEpgUrls(sources) → Array  — exported for testing the primitive.
 *
 *   mergeProgrammeMaps(maps) → Map<tvgId, Array<Programme>>
 *     Waterfall: first map's keys win on conflict; subsequent maps only
 *     fill keys missing from earlier ones.
 *
 *   mergeChannelNameMaps(maps) → Map<tvgId, displayName>
 *     Same waterfall semantics. Empty values rejected.
 *
 *   detectGzip(url, bytes, headers) → boolean
 *     Truthy when ANY of:
 *       - first two bytes are 0x1F 0x8B (gzip magic)
 *       - url pathname (query stripped) ends in .gz
 *       - content-type matches /gzip/i
 *       - content-disposition filename ends in .gz
 *
 *   resolveTvgId(channel, overrides, programmes?, channelNames?) → string
 *     Returns lowercased ID. Override map wins; falls back to
 *     channel.tvgId; falls through to safe name match against
 *     channelNames when programmes/channelNames are provided.
 *
 *   normaliseChannelName(name) → string
 *     Lowercased, diacritic-stripped, separator-/punctuation-stripped,
 *     quality-suffix-stripped (HD/FHD/UHD/4K/8K/SD/2K) — but `+` (timeshift
 *     channels like Sky+1) is preserved.
 *
 *   findBestEpgChannelByName(displayName, channelNames) → string
 *     Returns canonical tvgId from channelNames whose normalised display
 *     name UNIQUELY matches the query. Ambiguous matches return "" — the
 *     contract explicitly forbids silent guessing.
 *
 *   buildChannelNameIndex(channelNames) → Map<normalised, tvgId|null>
 *     Pre-computed lookup. Entries with collisions are nulled so
 *     findInChannelNameIndex returns "" on those keys.
 *
 *   findInChannelNameIndex(displayName, index) → string
 *
 * Style: CommonJS, Node 20+. No external dependencies.
 */

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function _isCredCarrying(creds) {
  if (!creds || typeof creds !== 'object') { return false; }
  // Xtream-shaped creds: need all four fields with content.
  return !!(creds.host && creds.user && creds.pass);
}

function _xtreamXmltvUrl(creds) {
  // Mirrors the panel.php URL shape every Xtream panel exposes. Built here
  // so callers don't have to assemble the query string manually.
  var port = creds.port ? (':' + creds.port) : '';
  var host = String(creds.host || '');
  // Normalise host — strip trailing slashes; leave scheme as-is when user
  // pasted https://. Default to http:// when the user gave a bare host.
  var schemeMatch = /^(https?:\/\/)/i.exec(host);
  if (schemeMatch) {
    host = host.replace(/\/+$/, '');
    return host + port + '/xmltv.php?username=' + encodeURIComponent(creds.user) + '&password=' + encodeURIComponent(creds.pass);
  }
  return 'http://' + host.replace(/\/+$/, '') + port + '/xmltv.php?username=' + encodeURIComponent(creds.user) + '&password=' + encodeURIComponent(creds.pass);
}

function dedupeEpgUrls(sources) {
  if (!Array.isArray(sources)) { return []; }
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < sources.length; i++) {
    var s = sources[i];
    if (!s || typeof s.url !== 'string' || s.url.length === 0) { continue; }
    if (seen[s.url]) { continue; }
    seen[s.url] = true;
    out.push(s);
  }
  return out;
}

function buildEpgUrlsFromEntry(entry, creds, headerEpgUrl) {
  entry = entry || {};
  var disableProvider = !!entry.disableProviderEpg;
  var raw = [];

  // Slot 1: explicit user override
  var override = (typeof entry.epgUrl === 'string') ? entry.epgUrl.trim() : '';
  if (override.length > 0) {
    raw.push({ url: override, source: 'override', kind: 'primary' });
  } else if (!disableProvider) {
    // Slot 2: M3U #EXTM3U header EPG URL (m3u creds get no auto-default).
    var headerTrim = (typeof headerEpgUrl === 'string') ? headerEpgUrl.trim() : '';
    if (headerTrim.length > 0) {
      raw.push({ url: headerTrim, source: 'm3u-header', kind: 'primary' });
    } else if (_isCredCarrying(creds)) {
      // Slot 3: Xtream xmltv.php default
      raw.push({ url: _xtreamXmltvUrl(creds), source: 'xtream-default', kind: 'primary' });
    }
  }

  // Slot 4+: additionalEpgUrls (preserved order, trim + skip blanks)
  if (Array.isArray(entry.additionalEpgUrls)) {
    for (var i = 0; i < entry.additionalEpgUrls.length; i++) {
      var u = entry.additionalEpgUrls[i];
      if (typeof u !== 'string') { continue; }
      var t = u.trim();
      if (t.length === 0) { continue; }
      raw.push({ url: t, source: 'additional', kind: 'additional' });
    }
  }

  return dedupeEpgUrls(raw);
}

// ---------------------------------------------------------------------------
// Programme + channel-name waterfall merges
// ---------------------------------------------------------------------------

function mergeProgrammeMaps(maps) {
  var merged = new Map();
  if (!Array.isArray(maps)) { return merged; }
  for (var i = 0; i < maps.length; i++) {
    var m = maps[i];
    if (!m || typeof m.forEach !== 'function') { continue; }
    m.forEach(function(value, key) {
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    });
  }
  return merged;
}

function mergeChannelNameMaps(maps) {
  var merged = new Map();
  if (!Array.isArray(maps)) { return merged; }
  for (var i = 0; i < maps.length; i++) {
    var m = maps[i];
    if (!m || typeof m.forEach !== 'function') { continue; }
    m.forEach(function(value, key) {
      if (typeof value !== 'string' || value.length === 0) { return; }
      if (!merged.has(key)) {
        merged.set(key, value);
      }
    });
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Gzip detection
// ---------------------------------------------------------------------------

function detectGzip(url, bytes, headers) {
  headers = headers || {};
  // Magic bytes win — covers misconfigured upstreams (no extension, wrong CT).
  if (bytes && typeof bytes.length === 'number' && bytes.length >= 2 &&
      bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return true;
  }
  // .gz extension on the pathname (query string ignored).
  if (typeof url === 'string') {
    try {
      var u = new URL(url);
      if (/\.gz$/i.test(u.pathname)) { return true; }
    } catch (_) {
      // Fall back to a regex-only check; treat the string before "?" as path.
      var path = url.split('?')[0];
      if (/\.gz$/i.test(path)) { return true; }
    }
  }
  // Content-Type sniff.
  var ct = headers.contentType || headers['content-type'] || '';
  if (typeof ct === 'string' && /gzip/i.test(ct)) { return true; }
  // Content-Disposition filename sniff.
  var cd = headers.contentDisposition || headers['content-disposition'] || '';
  if (typeof cd === 'string') {
    var fnMatch = /filename\*?=(?:[^;]*''|")?([^;"']+)/i.exec(cd);
    if (fnMatch && /\.gz\b/i.test(fnMatch[1])) { return true; }
  }
  return false;
}

// ---------------------------------------------------------------------------
// resolveTvgId — per-channel override + safe fallback
// ---------------------------------------------------------------------------

function _safeLower(s) {
  return (typeof s === 'string') ? s.toLowerCase() : '';
}

function resolveTvgId(channel, overrides, programmes, channelNames) {
  if (!channel || typeof channel !== 'object') { return ''; }
  var idKey = (channel.id != null) ? String(channel.id) : '';

  var ovKey = (overrides && idKey && Object.prototype.hasOwnProperty.call(overrides, idKey)) ? overrides[idKey] : null;
  if (typeof ovKey === 'string' && ovKey.length > 0) {
    return _safeLower(ovKey);
  }

  var rawTvgId = _safeLower(channel.tvgId);

  // When programmes is provided, prefer the raw tvgId IFF it's in programmes.
  if (programmes && typeof programmes.has === 'function' && rawTvgId && programmes.has(rawTvgId)) {
    return rawTvgId;
  }

  // Fall through to name match when programmes provided + raw doesn't hit.
  if (programmes && channelNames && typeof channel.name === 'string' && channel.name.length > 0) {
    var byName = findBestEpgChannelByName(channel.name, channelNames);
    if (byName) { return byName; }
  }

  // Default: return whatever tvgId the channel claims (or empty).
  return rawTvgId;
}

// ---------------------------------------------------------------------------
// normaliseChannelName + fuzzy matching
// ---------------------------------------------------------------------------

// Quality-suffix tokens we strip. Anchored as whole tokens (preceded by a
// separator or start/end) so we don't strip non-quality "HD" embedded in a
// longer word like "HDMI".
var QUALITY_TOKENS = ['UHD', 'FHD', '4K', '8K', '2K', 'HD', 'SD', '1080P', '720P', '480P', '2160P'];

function normaliseChannelName(name) {
  if (!name || typeof name !== 'string') { return ''; }
  var s = name;
  // Step 1: Unicode-normalise + strip combining marks (diacritics).
  try {
    s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch (_) { /* old Node — keep raw */ }
  s = s.toLowerCase();
  // Step 2: Replace separators (whitespace, punctuation except `+`) with a
  // sentinel so we can token-strip quality markers, then collapse the
  // sentinel away.
  // Allowed survivors: a-z, 0-9, +
  s = s.replace(/[^a-z0-9+]+/g, ' ').trim();
  // Step 3: Strip quality tokens whole-word.
  var tokens = s.split(' ').filter(function(t) { return t.length > 0; });
  var kept = [];
  for (var i = 0; i < tokens.length; i++) {
    if (QUALITY_TOKENS.indexOf(tokens[i].toUpperCase()) === -1) {
      kept.push(tokens[i]);
    }
  }
  return kept.join('');
}

function findBestEpgChannelByName(displayName, channelNames) {
  if (!displayName || !channelNames || typeof channelNames.forEach !== 'function' || channelNames.size === 0) {
    return '';
  }
  var needle = normaliseChannelName(displayName);
  if (!needle) { return ''; }
  var match = '';
  var ambiguous = false;
  channelNames.forEach(function(name, tvgId) {
    if (ambiguous) { return; }
    if (typeof name !== 'string' || name.length === 0) { return; }
    var candidate = normaliseChannelName(name);
    if (!candidate) { return; }
    if (candidate === needle) {
      if (match && match !== tvgId) {
        ambiguous = true;
        match = '';
      } else {
        match = tvgId;
      }
    }
  });
  if (ambiguous) { return ''; }
  return match || '';
}

function buildChannelNameIndex(channelNames) {
  var idx = new Map();
  if (!channelNames || typeof channelNames.forEach !== 'function') { return idx; }
  var collisions = Object.create(null);
  channelNames.forEach(function(name, tvgId) {
    if (typeof name !== 'string' || name.length === 0) { return; }
    var key = normaliseChannelName(name);
    if (!key) { return; }
    if (idx.has(key)) {
      collisions[key] = true;
    } else {
      idx.set(key, tvgId);
    }
  });
  // Null out collisions — find* returns "" on null entries.
  Object.keys(collisions).forEach(function(k) { idx.set(k, null); });
  return idx;
}

function findInChannelNameIndex(displayName, index) {
  if (!index || typeof index.get !== 'function') { return ''; }
  if (typeof displayName !== 'string' || displayName.length === 0) { return ''; }
  var key = normaliseChannelName(displayName);
  if (!key) { return ''; }
  var hit = index.get(key);
  return (typeof hit === 'string' && hit.length > 0) ? hit : '';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  buildEpgUrlsFromEntry: buildEpgUrlsFromEntry,
  dedupeEpgUrls: dedupeEpgUrls,
  mergeProgrammeMaps: mergeProgrammeMaps,
  mergeChannelNameMaps: mergeChannelNameMaps,
  detectGzip: detectGzip,
  resolveTvgId: resolveTvgId,
  normaliseChannelName: normaliseChannelName,
  findBestEpgChannelByName: findBestEpgChannelByName,
  buildChannelNameIndex: buildChannelNameIndex,
  findInChannelNameIndex: findInChannelNameIndex
};
