'use strict';

// routes/catalog.js — TV-safe catalog endpoint.
//
// W17-PURGE (wave-17): all mock / seed / placeholder content has been removed
// from this server. The catalog is an honest mirror of whatever real upstream
// providers the operator has configured (Jellyfin, iptv-org, operator-pasted
// M3U URLs for Apollo Group / xTremeHD). When NO upstream is reachable the
// response is `{ catalog: [], total: 0, _meta: { source: 'no-providers' } }` —
// never a synthetic fallback list.
//
// User rule (memory: feedback_no_mocks_no_stubs.md):
//   "never mocked data, never placeholders, never stubs, all restricted in
//    project, only working code"

var Router = require('express').Router;
var jellyfin = require('../lib/jellyfin');
var iptvOrg = require('../lib/iptvOrg');
var m3uClient = require('../lib/m3uClient');
var xtreamClient = require('../lib/xtreamClient');
var catalogMerge = require('../lib/catalogMerge');
var sanitizeLog = require('../lib/sanitizeLog').sanitizeForLog;

var router = Router();

var VALID_PROFILES = ['dave_tv', 'mom_tv'];
var VALID_PROVIDERS = ['apollo_group', 'xtremehd', 'xtream', 'iptv-org', 'jellyfin', 'all'];

// X-Catalog-Source header values surfaced to the client so DevTools / Settings
// can render a "Live Jellyfin" / "iptv-org" / "operator providers" / "empty"
// badge. There is NO mock / seed source any more — those values would be a
// lie under the no-fakes rule.
var CATALOG_SOURCE_HEADER = 'X-Catalog-Source';
var SRC_JELLYFIN = 'jellyfin';
var SRC_IPTV_ORG_ONLY = 'iptv-org';
var SRC_PROVIDERS_ONLY = 'providers';
var SRC_MERGED = 'merged';
var SRC_NONE = 'no-providers'; // every upstream returned zero — honest empty.

// Resolution sort order for quality-aware sorting (higher = better).
var RESOLUTION_ORDER = {
  '4K': 4,
  '2160p': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1,
};

var PROFILE_QUALITY_PREFS = {
  mom_tv: {
    resolution_floor: '1080p',
    prefer_4k: true,
    hdr_preferred: true,
    bitrate_floor_kbps: 4000,
  },
  dave_tv: {
    resolution_floor: '720p',
    prefer_4k: false,
    hdr_preferred: false,
    bitrate_floor_kbps: 2000,
  },
};

// ---------------------------------------------------------------------------
// GET /api/actors
// W17-PURGE: returns an empty list until real cast data (TMDB / Jellyfin) is
// wired in. Returning a hard-coded "Tom Cruise / Ryan Gosling / ..." list
// would be exactly the kind of mock data the project bans.
// ---------------------------------------------------------------------------
router.get('/api/actors', function(req, res) {
  res.json({ actors: [], total: 0, _meta: { source: 'no-providers' } });
});

// ---------------------------------------------------------------------------
// resolveCatalog() — pull items from real providers only. Order of operations:
//   1. Jellyfin (when JELLYFIN_URL + JELLYFIN_API_KEY both set + reachable).
//   2. Merge in iptv-org channels (when IPTV_ORG_ENABLED=true and the cache
//      has data).
//   3. Merge in operator-pasted M3U providers (Apollo Group, xTremeHD) when
//      their URLs are set.
// When all three yield zero items the response is honestly empty.
// Never throws; per-provider failures are logged and skipped.
// ---------------------------------------------------------------------------
async function resolveCatalog() {
  var baseItems = [];
  var baseSource = SRC_NONE;

  var hasJellyfinConfig = !!(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY);
  if (hasJellyfinConfig) {
    try {
      var jellyfinItems = await jellyfin.fetchCatalog();
      if (Array.isArray(jellyfinItems) && jellyfinItems.length > 0) {
        baseItems = jellyfinItems;
        baseSource = SRC_JELLYFIN;
      }
    } catch (err) {
      var msg = (err && err.message) ? err.message : 'no message';
      var code = (err && err.code) ? err.code : 'unknown';
      console.warn('[catalog] Jellyfin fetch failed (' + code + '): ' + sanitizeLog(msg));
    }
  }

  // iptv-org merge
  var iptvOrgCount = 0;
  var iptvOrgAge = null;
  if (iptvOrg.isEnabled()) {
    try {
      var orgItems = iptvOrg.fetchCatalog({ limit: 300 });
      if (Array.isArray(orgItems) && orgItems.length > 0) {
        iptvOrgCount = orgItems.length;
        try { iptvOrgAge = iptvOrg.getDataAgeHours(); } catch (_) { iptvOrgAge = null; }
        baseItems = baseItems.concat(orgItems);
        // Only flip the badge to iptv-org if jellyfin had nothing.
        if (baseSource === SRC_NONE) {
          baseSource = SRC_IPTV_ORG_ONLY;
        } else if (baseSource !== SRC_JELLYFIN) {
          baseSource = SRC_MERGED;
        } else {
          baseSource = SRC_MERGED;
        }
      }
    } catch (err) {
      console.warn('[catalog] iptv-org merge failed: ' + sanitizeLog(err && err.message ? err.message : 'unknown'));
    }
  }

  // Operator-pasted M3U providers (Apollo Group, xTremeHD).
  var m3uCount = 0;
  var m3uProviders = null;
  try {
    // Always call fetchCatalog. Disk-backed providers are discovered through
    // providerRegistry asynchronously, so a cold-start isEnabled() check can
    // be stale before the first registry snapshot is loaded.
    var m3uItems = await m3uClient.fetchCatalog({ limit: 600 });
    if (Array.isArray(m3uItems) && m3uItems.length > 0) {
      m3uCount = m3uItems.length;
      baseItems = baseItems.concat(m3uItems);
      if (baseSource === SRC_NONE) {
        baseSource = SRC_PROVIDERS_ONLY;
      } else {
        baseSource = SRC_MERGED;
      }
    }
    // Status is reported even on zero items so Settings can show
    // "configured but fetch failed" diagnostics.
    m3uProviders = m3uClient.getProviderStatus();
  } catch (err) {
    console.warn('[catalog] m3u merge failed: ' + sanitizeLog(err && err.message ? err.message : 'unknown'));
  }

  // Xtream Codes panel (the de-facto paid-IPTV REST API). Activates when the
  // operator sets XTREAM_URL + XTREAM_USERNAME + XTREAM_PASSWORD. Pulls live +
  // VOD + series in parallel, each shaped through xtreamClient.toHermesItem
  // into the standard catalog shape. Items get a `sources` entry pointing at
  // 'xtream' so the wave-13 cross-provider merge collapses ESPN duplicates
  // across xTreme + m3u + iptv-org.
  var xtreamCount = 0;
  var xtreamStatus = null;
  try {
    // Same cold-start rule as M3U: fetchAll* refreshes providerRegistry first.
    var live = await xtreamClient.fetchAllLive();
    var vod = await xtreamClient.fetchAllVod();
    var series = await xtreamClient.fetchAllSeries();
    var xtreamItems = [];
    if (Array.isArray(live)) { for (var li = 0; li < live.length; li++) { xtreamItems.push(live[li]); } }
    if (Array.isArray(vod)) { for (var vi = 0; vi < vod.length; vi++) { xtreamItems.push(vod[vi]); } }
    if (Array.isArray(series)) { for (var si = 0; si < series.length; si++) { xtreamItems.push(series[si]); } }
    if (xtreamItems.length > 0) {
      xtreamCount = xtreamItems.length;
      baseItems = baseItems.concat(xtreamItems);
      if (baseSource === SRC_NONE) {
        baseSource = SRC_PROVIDERS_ONLY;
      } else {
        baseSource = SRC_MERGED;
      }
    }
    try { xtreamStatus = xtreamClient.getProviderStatus(); } catch (_) { xtreamStatus = null; }
  } catch (err) {
    console.warn('[catalog] xtream merge failed: ' + sanitizeLog(err && err.message ? err.message : 'unknown'));
  }

  // Cross-provider title merge. If three providers all carry "ESPN" the user
  // sees ONE card with three sources; /api/play walks sources[] on resolve.
  var beforeMerge = baseItems.length;
  var mergedItems;
  try {
    mergedItems = catalogMerge.mergeByTitle(baseItems);
  } catch (mergeErr) {
    console.warn('[catalog] merge failed, serving un-merged: ' + sanitizeLog(mergeErr && mergeErr.message ? mergeErr.message : 'unknown'));
    mergedItems = baseItems.map(function(it) {
      var providerId = (Array.isArray(it.providers) && it.providers[0] && it.providers[0].provider_id) || it.provider || 'unknown';
      var clone = {};
      for (var f in it) { if (Object.prototype.hasOwnProperty.call(it, f)) { clone[f] = it[f]; } }
      clone.sources = [{
        provider_id: providerId,
        item_id: it.id,
        source_id: (Array.isArray(it.providers) && it.providers[0] && it.providers[0].source_id) || null,
        resolution: (it.metadata && it.metadata.resolution) || it.quality || null,
        source_health: (Array.isArray(it.providers) && it.providers[0] && it.providers[0].source_health) || { status: 'unknown' },
        is_seed_placeholder: false, // no more seeds — every source is real
      }];
      return clone;
    });
  }
  var mergedItemCount = beforeMerge - mergedItems.length;

  try { catalogMerge.setLastMerged(mergedItems); }
  catch (_) { /* never block catalog response on a cache write */ }

  return {
    items: mergedItems,
    source: baseSource,
    iptv_org_count: iptvOrgCount,
    iptv_org_data_age_h: iptvOrgAge,
    m3u_count: m3uCount,
    m3u_providers: m3uProviders,
    xtream_count: xtreamCount,
    xtream_status: xtreamStatus,
    merged_duplicates: mergedItemCount,
  };
}

// Wave-16: parse the `?hide_providers=A,B,C` query param into a normalised
// Set of provider_ids the caller wants stripped from the response. Returns
// null when the param is empty/missing so the filter is a no-op (and
// Cloudflare's edge cache shares the unfiltered entry). Accepts both
// hyphenated ("iptv-org") and underscored ("iptv_org") spellings so the
// client store key normalisation doesn't break server-side filtering.
function parseHideProviders(raw) {
  if (typeof raw !== 'string' || raw.length === 0) { return null; }
  if (raw.length > 256) { return null; } // defeat absurdly long inputs
  var parts = raw.split(',');
  var set = {};
  var count = 0;
  for (var i = 0; i < parts.length; i++) {
    var p = (parts[i] || '').trim().toLowerCase();
    if (!p) { continue; }
    if (!/^[a-z0-9_-]{1,32}$/.test(p)) { continue; }
    set[p] = true;
    if (p === 'iptv-org') { set['iptv_org'] = true; }
    else if (p === 'iptv_org') { set['iptv-org'] = true; }
    count += 1;
  }
  if (count === 0) { return null; }
  return set;
}

function normalizeProviderId(raw) {
  if (typeof raw !== 'string') { return ''; }
  var p = raw.trim().toLowerCase();
  if (!p) { return ''; }
  if (p === 'apollo') { return 'apollo_group'; }
  if (p === 'apollo-group' || p === 'apollo_group_tv' || p === 'apollo group') { return 'apollo_group'; }
  if (p === 'iptv_org' || p === 'iptvorg' || p === 'iptv-org-public') { return 'iptv-org'; }
  if (p === 'extreme' || p === 'xtreme' || p === 'xtreme-hd' || p === 'xtreme_hd') { return 'xtremehd'; }
  return p;
}

function isValidProviderId(providerId) {
  return VALID_PROVIDERS.indexOf(providerId) !== -1 ||
    /^(m3u|xtream|stalker)-prov-[a-f0-9]{8}$/i.test(providerId);
}

function parseProviderIds(query) {
  var raw = [];
  function add(value) {
    if (Array.isArray(value)) {
      for (var ai = 0; ai < value.length; ai++) { add(value[ai]); }
      return;
    }
    if (typeof value !== 'string') { return; }
    var parts = value.split(',');
    for (var pi = 0; pi < parts.length; pi++) { raw.push(parts[pi]); }
  }

  add(query.provider_id);
  add(query.provider_ids);

  var ids = [];
  var invalid = [];
  for (var i = 0; i < raw.length; i++) {
    var id = normalizeProviderId(raw[i]);
    if (!id) { continue; }
    if (id === 'all') { return { ids: [], invalid: [] }; }
    if (!isValidProviderId(id)) {
      invalid.push(id);
      continue;
    }
    if (ids.indexOf(id) === -1) { ids.push(id); }
  }
  return { ids: ids, invalid: invalid };
}

function itemHasAnyProvider(item, providerIds) {
  if (!item || !Array.isArray(providerIds) || providerIds.length === 0) { return true; }
  var selected = {};
  for (var si = 0; si < providerIds.length; si++) { selected[providerIds[si]] = true; }
  var i;
  if (Array.isArray(item.sources)) {
    for (i = 0; i < item.sources.length; i++) {
      var sid = normalizeProviderId(item.sources[i] && item.sources[i].provider_id);
      if (sid && selected[sid]) { return true; }
    }
  }
  if (Array.isArray(item.providers)) {
    for (i = 0; i < item.providers.length; i++) {
      var pid = normalizeProviderId(item.providers[i] && item.providers[i].provider_id);
      if (pid && selected[pid]) { return true; }
    }
  }
  var flat = normalizeProviderId(item.provider_id || item.provider || '');
  if (flat && selected[flat]) { return true; }
  if (Array.isArray(item.provider_tags)) {
    for (i = 0; i < item.provider_tags.length; i++) {
      var tag = normalizeProviderId(item.provider_tags[i]);
      if (tag && selected[tag]) { return true; }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// GET /api/catalog
// Optional query params:
//   ?profile_id=dave_tv|mom_tv   — filters by profile_access (when present)
//   ?provider_id=apollo_group|xtremehd|iptv-org|jellyfin|all — provider filter
//   ?provider_ids=xtremehd,apollo_group,iptv-org — multi-provider filter
//   ?hide_providers=A,B,C        — wave-16 visibility toggle (server-side)
// ---------------------------------------------------------------------------
router.get('/api/catalog', async function(req, res) {
  var profile_id = req.query.profile_id;
  var providerParse = parseProviderIds(req.query);
  var providerIds = providerParse.ids;
  var hiddenSet = parseHideProviders(req.query.hide_providers);

  if (profile_id !== undefined && VALID_PROFILES.indexOf(profile_id) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: "Invalid profile_id '" + profile_id + "'. Valid values: dave_tv, mom_tv",
    });
  }

  if (providerParse.invalid.length > 0) {
    return res.status(400).json({
      error: 'validation_failed',
      message: "Invalid provider_id '" + providerParse.invalid[0] + "'. Use all, a known provider id, or a registry-backed provider id.",
    });
  }

  var resolved = await resolveCatalog();
  var items = resolved.items;
  res.setHeader(CATALOG_SOURCE_HEADER, resolved.source);

  // Edge-cache the catalog at Cloudflare. Catalog changes only when the
  // operator pastes new provider credentials — safe for 2 min at edge with
  // a 10 min SWR window so a stale entry serves instantly while we refresh.
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=600');
  res.setHeader('Vary', 'Accept-Encoding');

  // Filtering by profile_access only meaningfully applies to items that
  // carry the field (legacy seed used to set it; iptv-org / m3uClient may
  // or may not). When the field is absent we keep the item.
  var isJellyfin = resolved.source === SRC_JELLYFIN;
  if (profile_id && !isJellyfin) {
    items = items.filter(function(item) {
      if (!Array.isArray(item.profile_access)) { return true; }
      return item.profile_access.indexOf(profile_id) !== -1;
    });
  }

  // Provider filter. "all" is a no-op; specific provider ids filter by any
  // legacy providers[], post-merge sources[], flat provider_id/provider, or
  // provider_tags entry.
  if (providerIds.length > 0 && !isJellyfin) {
    items = items.filter(function(item) {
      return itemHasAnyProvider(item, providerIds);
    });
  }

  // --- Wave-16 hide_providers filter ---
  // Drop items whose only providers are in the hidden set. Items with at
  // least one source NOT in the hidden set survive (consistent with the
  // client-side filter in App.jsx).
  var hiddenDropped = 0;
  if (hiddenSet) {
    var before = items.length;
    items = items.filter(function(item) {
      var anyVisible = false;
      var anySource = false;
      if (Array.isArray(item.sources)) {
        for (var i = 0; i < item.sources.length; i++) {
          var sid = item.sources[i] && item.sources[i].provider_id;
          if (!sid) { continue; }
          anySource = true;
          if (!hiddenSet[sid]) { anyVisible = true; break; }
        }
      }
      if (!anyVisible && Array.isArray(item.providers)) {
        for (var j = 0; j < item.providers.length; j++) {
          var pid = item.providers[j] && item.providers[j].provider_id;
          if (!pid) { continue; }
          anySource = true;
          if (!hiddenSet[pid]) { anyVisible = true; break; }
        }
      }
      if (!anyVisible && typeof item.provider === 'string') {
        anySource = true;
        if (!hiddenSet[item.provider]) { anyVisible = true; }
      }
      // Items with no providers at all are NEVER dropped by this filter —
      // only items naming a provider can be hidden.
      if (!anySource) { return true; }
      return anyVisible;
    });
    hiddenDropped = before - items.length;
  }

  // Mom-mode quality sort: 4K first, HDR-flagged higher.
  if (profile_id === 'mom_tv' && !isJellyfin) {
    items.sort(function(a, b) {
      var resA = (a && a.metadata && RESOLUTION_ORDER[a.metadata.resolution]) || 0;
      var resB = (b && b.metadata && RESOLUTION_ORDER[b.metadata.resolution]) || 0;
      if (resB !== resA) { return resB - resA; }
      var hdrA = (a && a.metadata && a.metadata.hdr_format) ? 1 : 0;
      var hdrB = (b && b.metadata && b.metadata.hdr_format) ? 1 : 0;
      return hdrB - hdrA;
    });
  }

  var quality_preference = profile_id
    ? (PROFILE_QUALITY_PREFS[profile_id] || null)
    : null;

  var _meta = {
    sorted_for_profile: profile_id || null,
    quality_preference: quality_preference,
    provider_filter: providerIds.length > 0 ? providerIds.join(',') : null,
    provider_filters: providerIds,
    source: resolved.source,
    iptv_org_count: resolved.iptv_org_count,
    m3u_count: resolved.m3u_count,
    m3u_providers: resolved.m3u_providers,
    xtream_count: resolved.xtream_count,
    xtream_status: resolved.xtream_status,
    merged_duplicates: resolved.merged_duplicates || 0,
    // Wave-16: how many items the hide_providers query param dropped.
    // 0 when the param is missing — the catalog is unfiltered.
    hidden_dropped: hiddenDropped,
    hidden_providers: hiddenSet ? Object.keys(hiddenSet) : [],
  };

  res.json({ catalog: items, total: items.length, _meta: _meta });
});

module.exports = router;
