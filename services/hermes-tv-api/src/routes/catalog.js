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
var catalogMerge = require('../lib/catalogMerge');
var sanitizeLog = require('../lib/sanitizeLog').sanitizeForLog;

var router = Router();

var VALID_PROFILES = ['dave_tv', 'mom_tv'];
var VALID_PROVIDERS = ['apollo_group', 'xtremehd', 'iptv-org', 'jellyfin', 'all'];

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
  if (m3uClient.isEnabled()) {
    try {
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
    merged_duplicates: mergedItemCount,
  };
}

// ---------------------------------------------------------------------------
// GET /api/catalog
// Optional query params:
//   ?profile_id=dave_tv|mom_tv   — filters by profile_access (when present)
//   ?provider_id=apollo_group|xtremehd|iptv-org|jellyfin|all — provider filter
// ---------------------------------------------------------------------------
router.get('/api/catalog', async function(req, res) {
  var profile_id = req.query.profile_id;
  var provider_id = req.query.provider_id;

  if (profile_id !== undefined && VALID_PROFILES.indexOf(profile_id) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: "Invalid profile_id '" + profile_id + "'. Valid values: dave_tv, mom_tv",
    });
  }

  if (provider_id !== undefined && VALID_PROVIDERS.indexOf(provider_id) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: "Invalid provider_id '" + provider_id + "'. Valid values: apollo_group, xtremehd, iptv-org, jellyfin, all",
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

  // Provider filter. "all" is a no-op; specific provider id filters by either
  // the legacy providers[] array OR the post-merge sources[] array.
  if (provider_id && provider_id !== 'all' && !isJellyfin) {
    items = items.filter(function(item) {
      if (Array.isArray(item.sources)) {
        for (var si = 0; si < item.sources.length; si++) {
          if (item.sources[si] && item.sources[si].provider_id === provider_id) { return true; }
        }
      }
      if (Array.isArray(item.providers)) {
        for (var pi = 0; pi < item.providers.length; pi++) {
          if (item.providers[pi] && item.providers[pi].provider_id === provider_id) { return true; }
        }
      }
      return false;
    });
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
    provider_filter: provider_id || null,
    source: resolved.source,
    iptv_org_count: resolved.iptv_org_count,
    m3u_count: resolved.m3u_count,
    m3u_providers: resolved.m3u_providers,
    merged_duplicates: resolved.merged_duplicates || 0,
  };

  res.json({ catalog: items, total: items.length, _meta: _meta });
});

module.exports = router;
