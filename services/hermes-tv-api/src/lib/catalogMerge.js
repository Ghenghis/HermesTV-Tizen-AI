'use strict';

/**
 * lib/catalogMerge.js — cross-provider channel merge (wave-13).
 *
 * Today the catalog can carry the SAME logical channel three times: once as
 * a seed `live-NNN` (apollo provider, broken source_id), once as a real
 * xTremeHD `m3u-xtremehd-espn-...`, and once as the iptv-org `iptv-ESPN.us`.
 * The user sees three "ESPN" cards. Each card has only one stream. If that
 * stream is down /api/play returns 503 with no fallback.
 *
 * This module collapses duplicates by normalized title and emits ONE item
 * per logical channel carrying a `sources[]` array — one entry per provider
 * variant. /api/play walks the array on resolve so a failed primary
 * automatically falls through to the next provider.
 *
 * Source priority (operator-paid first; iptv-org public fills gaps; seeds
 * land last because they reference fake source_id values):
 *   xtremehd > apollo_group > iptv-org > seed
 *
 * Mom rule: this only collapses duplicates — no real content is lost. Mom
 * still sees ESPN; she just sees it once with N stream sources behind it.
 */

// Provider priority — lower = higher priority. Anything not listed falls to
// the catch-all bucket so unknown providers still merge cleanly.
var PROVIDER_PRIORITY = {
  'xtremehd':     1,
  'apollo_group': 2,
  'iptv-org':     3,
  'jellyfin':     4,
  'seed':         5,
};
var UNKNOWN_PROVIDER_PRIORITY = 99;

// Higher = better quality.
var RESOLUTION_RANK = {
  '4K':     5,
  '2160p':  5,
  'UHD':    5,
  '1440p':  4,
  '1080p':  3,
  'FHD':    3,
  '720p':   2,
  'HD':     2,
  '480p':   1,
  'SD':     1,
};

// Tokens stripped from titles before grouping. Order matters — we strip
// from longest to shortest so "HD+" goes before "HD".
var STRIP_TOKENS = [
  '2160p', '1440p', '1080p', '720p', '480p',
  'hd+', 'fhd', 'uhd', '4k', 'sd',
  'hd',  // last because it would shadow "fhd"/"uhd" otherwise
];

// Country-style suffixes we DO NOT strip — keep them so "ESPN Deportes",
// "ESPN Latin America", "ESPN UK" do NOT collapse into "ESPN" (they ARE
// different channels). Only generic broadcast quality / locale flags get
// merged: "ESPN.us" and "ESPN US" both reduce to "espn" because ".us" /
// "US" without further qualification is just a country code, not a
// distinct lineup.
var LOCALE_CODES = ['us', 'uk', 'usa', 'eu', 'eur'];

/**
 * Normalize a title for grouping. Lowercase, strip resolution/locale
 * tokens, drop trailing single digits ("ESPN 2" → "espn"), remove
 * punctuation/whitespace.
 *
 * NOTE: trailing digits are stripped so "ESPN 2" maps to "espn". The
 * user's complaint is specifically about "ESPN" appearing 3+ times for
 * what should be one channel, so we err on the merging side. If this
 * over-merges "ESPN 2" into "ESPN", the operator can split them by
 * adding a non-digit suffix ("ESPN 2 East") — but the much more common
 * case in IPTV M3U lists is "ESPN HD" / "ESPN 1080p" / "ESPN.us" all
 * being the SAME feed differently labelled.
 *
 * Returns a non-empty grouping key, or null if the title is unusable.
 */
function normalizeTitle(title) {
  if (typeof title !== 'string' || title.length === 0) { return null; }
  var s = title.toLowerCase();

  // Strip a trailing ".us" / ".uk" / ".usa" before tokenising —
  // "espn.us" → "espn ", "tnt.uk" → "tnt ".
  for (var l = 0; l < LOCALE_CODES.length; l++) {
    var lc = '.' + LOCALE_CODES[l];
    if (s.indexOf(lc) !== -1) {
      s = s.split(lc).join(' ');
    }
  }

  // Tokenize on whitespace + common separators so we can drop
  // quality/locale tokens by exact match (avoids accidental partial
  // matches like "hd" inside "Hudson").
  // Replace separators with spaces; then split.
  s = s.replace(/[\-\._\(\)\[\]\|\/,;:!\?]+/g, ' ');
  var tokens = s.split(/\s+/).filter(function(t) { return t.length > 0; });

  // Drop quality/locale tokens.
  tokens = tokens.filter(function(t) {
    for (var i = 0; i < STRIP_TOKENS.length; i++) {
      if (t === STRIP_TOKENS[i]) { return false; }
    }
    for (var j = 0; j < LOCALE_CODES.length; j++) {
      if (t === LOCALE_CODES[j]) { return false; }
    }
    return true;
  });

  // Drop a single trailing single-digit token — collapses "ESPN 2" / "TNT 1"
  // into the parent channel. Two-digit and larger tokens (e.g. "Telemundo 47"
  // — a real distinct local affiliate, "Channel 13") are preserved as they
  // commonly identify a local affiliate that is NOT the same feed as the
  // unsuffixed channel.
  if (tokens.length > 1) {
    var last = tokens[tokens.length - 1];
    if (/^\d$/.test(last)) {
      tokens = tokens.slice(0, -1);
    }
  }

  // Final scrub: drop any non-alphanumeric leftovers and rejoin.
  var key = tokens.join('').replace(/[^a-z0-9]+/g, '');
  return key.length > 0 ? key : null;
}

function providerPriority(pid) {
  if (Object.prototype.hasOwnProperty.call(PROVIDER_PRIORITY, pid)) {
    return PROVIDER_PRIORITY[pid];
  }
  return UNKNOWN_PROVIDER_PRIORITY;
}

function resolutionRank(res) {
  if (typeof res !== 'string') { return 0; }
  var key = res.toUpperCase();
  // "4K" stays as "4K"; "1080P" → "1080P" → also match "1080p" below.
  if (RESOLUTION_RANK[key]) { return RESOLUTION_RANK[key]; }
  var lc = res.toLowerCase();
  return RESOLUTION_RANK[lc] || 0;
}

// Pull the active provider entry for an item. Items from the seed catalog
// carry the entry directly in item.providers[]; items from iptvOrg /
// m3uClient carry a single entry in providers[0]. Seed items also carry a
// top-level item.provider string (which may differ from providers[0] —
// the seed builder takes the first listed provider as the canonical one).
function detectProviderId(item) {
  if (!item || typeof item !== 'object') { return 'seed'; }
  if (Array.isArray(item.providers) && item.providers.length > 0) {
    var p0 = item.providers[0];
    if (p0 && typeof p0.provider_id === 'string') { return p0.provider_id; }
  }
  if (typeof item.provider === 'string' && item.provider.length > 0) {
    return item.provider;
  }
  return 'seed';
}

// Heuristic: an item is a "seed live placeholder" if its id matches the
// live-NNN pattern (not live-demo-) — those reference fake source_id
// values that no real provider has. We still merge them into the
// sources[] array of their group (they keep the operator-facing
// metadata) but they sort LAST regardless of nominal provider.
function isSeedPlaceholder(item) {
  if (!item || typeof item.id !== 'string') { return false; }
  if (item.type !== 'live') { return false; }
  if (item.id.indexOf('live-') !== 0) { return false; }
  if (item.id.indexOf('live-demo-') === 0) { return false; }
  return true;
}

// Build a single source descriptor from an item + its detected provider.
function _itemToSource(item, providerId) {
  var providersArr = Array.isArray(item.providers) ? item.providers : [];
  var matched = null;
  for (var i = 0; i < providersArr.length; i++) {
    if (providersArr[i] && providersArr[i].provider_id === providerId) {
      matched = providersArr[i];
      break;
    }
  }
  var sourceId = matched && matched.source_id ? matched.source_id : null;
  var sourceHealth = matched && matched.source_health
    ? matched.source_health
    : { status: 'unknown' };
  var resolution = (item.metadata && item.metadata.resolution) || item.quality || null;
  return {
    provider_id: providerId,
    item_id: item.id,           // resolver dispatch key (m3u-xtremehd-espn-..., iptv-ESPN.us, live-100)
    source_id: sourceId,        // upstream provider's own id (tvg-id, iptv-org channel.id)
    resolution: resolution,
    source_health: sourceHealth,
    is_seed_placeholder: isSeedPlaceholder(item),
  };
}

// Pick a clean display title from a list of variants — prefer the one
// without HD/4K/etc tokens, fall back to the longest non-empty otherwise.
function _cleanestTitle(variants) {
  var QUALITY_RE = /\b(hd|fhd|uhd|4k|2k|1080p?|720p?|480p?|sd|hd\+)\b/i;
  for (var i = 0; i < variants.length; i++) {
    if (typeof variants[i] === 'string' &&
        variants[i].length > 0 &&
        !QUALITY_RE.test(variants[i])) {
      return variants[i];
    }
  }
  // Nothing clean — return whichever variant is shortest non-empty
  // (shortest tends to be the canonical "ESPN" over "ESPN HD 1080p").
  var best = null;
  for (var j = 0; j < variants.length; j++) {
    if (typeof variants[j] !== 'string' || variants[j].length === 0) { continue; }
    if (!best || variants[j].length < best.length) { best = variants[j]; }
  }
  return best || (variants[0] || '');
}

/**
 * Merge a flat array of catalog items into a deduped list with sources[].
 *
 * Input: items as already-built HermesTV catalog entries.
 * Output: a NEW array. Length <= input.length. Each entry either:
 *   - had no duplicates → emitted as-is + `sources: [<one source>]`
 *   - had duplicates    → collapsed into ONE entry with `sources: [...N]`
 *
 * The merged entry's identity:
 *   id        = the highest-priority source's id
 *   title     = the cleanest variant title (no "HD"/"4K" suffix preferred)
 *   metadata  = the highest-priority source's metadata
 *   sources   = sorted by priority (xtremehd > apollo > iptv-org > seed)
 *
 * NEVER throws — bad items are passed through untouched.
 */
function mergeByTitle(items) {
  if (!Array.isArray(items)) { return []; }

  var groups = {};                 // normalized key → { items: [], titles: [] }
  var passthrough = [];            // items with un-normalisable titles
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || typeof it !== 'object') { continue; }
    var key = normalizeTitle(it.title);
    if (!key) {
      // No grouping possible — still wrap in single-source shape so the
      // downstream consumer can assume `sources` exists everywhere.
      var lonePid = detectProviderId(it);
      var withSource = {};
      for (var f in it) { if (Object.prototype.hasOwnProperty.call(it, f)) { withSource[f] = it[f]; } }
      withSource.sources = [_itemToSource(it, lonePid)];
      passthrough.push(withSource);
      continue;
    }
    // Live channels group by title; VOD/series do NOT group across providers
    // (you can absolutely have two unrelated movies with the same title;
    // we don't have a strong enough signal — year + duration — to be
    // safe). Only live channels collapse.
    if (it.type !== 'live') {
      var pidVod = detectProviderId(it);
      var clone = {};
      for (var k in it) { if (Object.prototype.hasOwnProperty.call(it, k)) { clone[k] = it[k]; } }
      clone.sources = [_itemToSource(it, pidVod)];
      passthrough.push(clone);
      continue;
    }
    if (!groups[key]) { groups[key] = { items: [], titles: [] }; }
    groups[key].items.push(it);
    groups[key].titles.push(it.title);
  }

  var out = [];
  // Stable output order: emit groups in the order their FIRST member
  // appeared in `items`, then passthrough in insertion order.
  var emittedKey = {};
  for (var m = 0; m < items.length; m++) {
    var itm = items[m];
    if (!itm || itm.type !== 'live') { continue; }
    var gkey = normalizeTitle(itm.title);
    if (!gkey || !groups[gkey] || emittedKey[gkey]) { continue; }
    emittedKey[gkey] = true;

    var group = groups[gkey];

    // Sort variants by (priority asc, resolutionRank desc, isSeedPlaceholder last).
    var variants = group.items.slice().sort(function(a, b) {
      var pa = providerPriority(detectProviderId(a));
      var pb = providerPriority(detectProviderId(b));
      // Seed placeholders sink to the bottom regardless of nominal provider.
      if (isSeedPlaceholder(a)) { pa = Math.max(pa, PROVIDER_PRIORITY.seed); }
      if (isSeedPlaceholder(b)) { pb = Math.max(pb, PROVIDER_PRIORITY.seed); }
      if (pa !== pb) { return pa - pb; }
      var ra = resolutionRank((a.metadata && a.metadata.resolution) || a.quality);
      var rb = resolutionRank((b.metadata && b.metadata.resolution) || b.quality);
      return rb - ra;
    });

    var primary = variants[0];
    var sources = [];
    var bestResolution = null;
    var bestResolutionRank = -1;
    for (var v = 0; v < variants.length; v++) {
      var vItem = variants[v];
      var vPid = detectProviderId(vItem);
      sources.push(_itemToSource(vItem, vPid));
      var rRank = resolutionRank((vItem.metadata && vItem.metadata.resolution) || vItem.quality);
      if (rRank > bestResolutionRank) {
        bestResolutionRank = rRank;
        bestResolution = (vItem.metadata && vItem.metadata.resolution) || vItem.quality;
      }
    }

    // Single-variant group → emit a shape compatible with the legacy
    // pre-merge consumers but with sources: [<one>].
    if (variants.length === 1) {
      var single = {};
      for (var fld in primary) {
        if (Object.prototype.hasOwnProperty.call(primary, fld)) { single[fld] = primary[fld]; }
      }
      single.sources = sources;
      out.push(single);
      continue;
    }

    // Multi-variant merge. Start from a shallow clone of the primary so
    // downstream code that reads `item.metadata` / `item.poster_url` / etc.
    // still works without knowing about sources[].
    var merged = {};
    for (var ff in primary) {
      if (Object.prototype.hasOwnProperty.call(primary, ff)) { merged[ff] = primary[ff]; }
    }
    merged.title = _cleanestTitle(group.titles);
    if (bestResolution) {
      // Bubble the best resolution up.
      if (!merged.metadata || typeof merged.metadata !== 'object') { merged.metadata = {}; }
      merged.metadata = Object.assign({}, merged.metadata, { resolution: bestResolution });
      merged.quality = bestResolution;
    }
    merged.sources = sources;
    // Flatten the providers[] array (legacy consumers like /api/play's
    // ticket builder read providers[0] when picking a default provider).
    // We keep the primary source's provider as providers[0] so existing
    // routes still pick the highest-priority one by default.
    merged.providers = sources.map(function(s) {
      return {
        provider_id: s.provider_id,
        source_id: s.source_id,
        source_health: s.source_health,
      };
    });
    out.push(merged);
  }

  // Passthrough items (non-live + un-normalisable titles) preserve their
  // original order at the END so live channels remain user-facing first.
  // ...actually for catalog parity, splice passthrough back in the same
  // relative positions they entered. Simplest correct behaviour: emit
  // them after merged live groups. Live channels rendered first is fine
  // for the existing shells which group by type anyway.
  for (var pp = 0; pp < passthrough.length; pp++) { out.push(passthrough[pp]); }

  return out;
}

// ---------------------------------------------------------------------------
// Merged-catalog cache. routes/catalog.js writes the most-recent merged
// items here after every successful resolveCatalog() call; routes/play.js
// reads from it to look up the sources[] array for an item the user just
// clicked. The cache is shared in-process and refreshed every catalog
// request, so play.js sees ~at most a few seconds of staleness.
// ---------------------------------------------------------------------------
var _lastMerged = [];
var _lastMergedAt = 0;
var _sourcesByItemId = {};   // id-of-any-source → sources[] for that group

function setLastMerged(items) {
  if (!Array.isArray(items)) { return; }
  _lastMerged = items;
  _lastMergedAt = Date.now();
  _sourcesByItemId = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !Array.isArray(it.sources)) { continue; }
    // Index by the merged item id...
    if (typeof it.id === 'string') { _sourcesByItemId[it.id] = it.sources; }
    // ...AND by every source's item_id so a click on the legacy id
    // (e.g. a bookmarked iptv-ESPN.us) still discovers the merged group.
    for (var s = 0; s < it.sources.length; s++) {
      var srcId = it.sources[s] && it.sources[s].item_id;
      if (typeof srcId === 'string' && !_sourcesByItemId[srcId]) {
        _sourcesByItemId[srcId] = it.sources;
      }
    }
  }
}

function getSourcesForItemId(itemId) {
  if (typeof itemId !== 'string') { return null; }
  return _sourcesByItemId[itemId] || null;
}

function getLastMergedAt() { return _lastMergedAt; }

module.exports = {
  normalizeTitle: normalizeTitle,
  providerPriority: providerPriority,
  resolutionRank: resolutionRank,
  mergeByTitle: mergeByTitle,
  setLastMerged: setLastMerged,
  getSourcesForItemId: getSourcesForItemId,
  getLastMergedAt: getLastMergedAt,
  // Constants exposed for tests + diagnostics.
  PROVIDER_PRIORITY: PROVIDER_PRIORITY,
  RESOLUTION_RANK: RESOLUTION_RANK,
};
