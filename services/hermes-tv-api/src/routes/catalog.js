'use strict';

const { Router } = require('express');
const jellyfin = require('../lib/jellyfin');
const iptvOrg = require('../lib/iptvOrg');
const m3uClient = require('../lib/m3uClient');
const catalogMerge = require('../lib/catalogMerge');
const { SEED_CATALOG } = require('../data/seedCatalog');
const router = Router();

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
// 'iptv-org' added so /api/catalog?provider_id=iptv-org filters correctly.
// 'jellyfin' is allowed too even though the Jellyfin adapter currently
// returns its own catalog (it doesn't go through the filter path).
const VALID_PROVIDERS = ['apollo_group', 'xtremehd', 'iptv-org', 'jellyfin', 'all'];

// X-Catalog-Source header values surfaced to the web/Tizen client so the UI
// can render a "Live Jellyfin" vs "Mock catalog" badge.
//   jellyfin            — successfully fetched from the workstation Jellyfin
//   mock-fallback       — JELLYFIN_URL+JELLYFIN_API_KEY set but the call
//                         failed (timeout, 4xx, 5xx, network), so we served
//                         the mock list with the X-Catalog-Source header so
//                         the operator can spot the degradation in DevTools.
//   mock-no-jellyfin    — JELLYFIN_URL or JELLYFIN_API_KEY not set — this is
//                         the default until the operator pastes credentials.
const CATALOG_SOURCE_HEADER = 'X-Catalog-Source';
const SRC_JELLYFIN = 'jellyfin';
const SRC_MOCK_FALLBACK = 'mock-fallback';
const SRC_MOCK_NO_JELLYFIN = 'mock-no-jellyfin';
// iptv-org merged onto the mock seed (or Jellyfin) when the operator has
// flipped IPTV_ORG_ENABLED=true and the refresh cron has populated the
// /var/cache/iptv-org/ JSON files. The badge in the Settings panel turns
// green when this is the active source.
const SRC_MERGED_IPTV_ORG = 'merged-with-iptv-org';
// Operator-pasted M3U providers (Apollo Group, xTremeHD) — activates the
// moment APOLLO_M3U_URL or XTREMEHD_M3U_URL is non-empty. Outranks
// iptv-org when both are present because paid provider lineups are the
// operator's intended catalog; iptv-org rides shotgun.
const SRC_MERGED_PROVIDERS = 'merged-with-providers';

// ---------------------------------------------------------------------------
// Actors — same 5 actors as in catalog.mock.json companion data.
// photo_url uses hermestv.local (no external CDN, no credentials).
// ---------------------------------------------------------------------------
// actor_id format: actor-NNN (matches actor.person.schema.json pattern ^actor-[0-9]{3,}$)
// and matches cast_ids references in catalog items (actor-001 format).
const ACTORS = [
  {
    actor_id: 'actor-001',
    name: 'Tom Cruise',
    photo_url: 'https://hermestv.local/mock/actors/actor-001.jpg',
  },
  {
    actor_id: 'actor-002',
    name: 'Ryan Gosling',
    photo_url: 'https://hermestv.local/mock/actors/actor-002.jpg',
  },
  {
    actor_id: 'actor-003',
    name: 'Keanu Reeves',
    photo_url: 'https://hermestv.local/mock/actors/actor-003.jpg',
  },
  {
    actor_id: 'actor-004',
    name: 'Julia Roberts',
    photo_url: 'https://hermestv.local/mock/actors/actor-004.jpg',
  },
  {
    actor_id: 'actor-005',
    name: 'Kevin Costner',
    photo_url: 'https://hermestv.local/mock/actors/actor-005.jpg',
  },
];

// ---------------------------------------------------------------------------
// Catalog items — populated from data/seedCatalog.js so every shell (Netflix,
// TiviMate, Plex, Apple TV, Samsung, Mom Mode, Dave Power) renders a full
// catalog (~135 live channels + VOD + series) when no real provider has
// been wired yet. When the operator pastes Jellyfin / Apollo / xTremeHD
// credentials the corresponding lib (lib/jellyfin.js, future Threadfin
// client) replaces this seed at runtime.
const CATALOG_ITEMS = SEED_CATALOG;

// Seed `live-NNN` items (live-100..live-219 today, see data/seedCatalog.js
// liveItem()) point at fake `source_id` values that no real provider has.
// They exist purely so a fresh VPS with no provider credentials still
// renders a populated catalog. Once a real provider (iptv-org public CDN
// or operator-pasted M3U) loads channels, the seed live items become
// unplayable noise — clicking them lands at /api/play with 503 stream_unresolved
// because streamResolver has no branch for the bare `live-NNN` ID.
//
// We keep `live-demo-*` (real iptv-org demo channels — NASA TV, France 24)
// and we keep VOD + series (real movie content) regardless. Only the
// `live-NNN` placeholders are dropped, and only when a real provider's
// channels are available to fill in for them.
function isUnplayableSeedLive(item) {
  if (!item || typeof item.id !== 'string') { return false; }
  if (item.type !== 'live') { return false; }
  if (item.id.indexOf('live-') !== 0) { return false; }
  if (item.id.indexOf('live-demo-') === 0) { return false; }
  return true;
}

// Wave-14: same logic but for VOD / series seed items.
//
// Seed `vod-NNN` items (vod-200..vod-2NN, see seedCatalog.js vodItem()) and
// `ser-NNN` items (ser-300..ser-3NN, see seriesItem()) advertise providers
// = [apollo_group, xtremehd] but their source_ids are synthetic strings
// like "apo-vod-top-gun-maverick" / "xtr-ser-stranger-things" that no real
// provider lib returns. streamResolver.js has no `vod-*` or `ser-*` branch,
// so clicking these items returns 503 stream_unresolved — exactly the
// "website dont play movies" complaint.
//
// A "pure-seed-placeholder" VOD/series is one whose providers[].source_id
// values *all* match the seed mock prefix pattern. If wave-13's title-based
// catalog merge enriches one with a real `m3u-*` source_id (operator paid
// providers) or an `iptv-vod-*` source_id (some future free CDN), we keep
// the item — at least one real upstream can play it.
//
// We only filter when at least one real provider's content actually arrived
// (m3u or iptv-org). If both fetches yielded zero items, we leave the seed
// VODs in so the catalog still has movie titles visible during a provider
// outage — same conservative posture as the wave-11 live-NNN dedupe.
var SEED_VOD_SOURCE_RE = /^(apo|xtr)-(vod|ser)-/;

function isUnplayableSeedVodOrSeries(item) {
  if (!item || typeof item.id !== 'string') { return false; }
  if (item.type !== 'vod' && item.type !== 'series') { return false; }
  // Only act on the deterministic seed IDs we generate (vod-NNN, ser-NNN).
  // Anything else (jellyfin-*, m3u-*, iptv-vod-*) is left alone.
  if (item.id.indexOf('vod-') !== 0 && item.id.indexOf('ser-') !== 0) {
    return false;
  }
  var sources = Array.isArray(item.providers) ? item.providers : [];
  if (sources.length === 0) { return true; } // no provider → can't play
  // If ANY source escapes the seed prefix pattern, a real provider has
  // claimed this title (via title-based merge or direct add) — keep it.
  for (var si = 0; si < sources.length; si++) {
    var src = sources[si];
    var sid = src && typeof src.source_id === 'string' ? src.source_id : '';
    if (sid && !SEED_VOD_SOURCE_RE.test(sid)) {
      return false; // real source attached — keep
    }
  }
  return true; // every source_id was a seed mock — drop
}

// Resolution sort order for quality-aware sorting (higher index = higher quality)
const RESOLUTION_ORDER = {
  '4K': 4,
  '2160p': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1,
};

// Quality preference map per profile (mirrors profiles.js quality_preference)
const PROFILE_QUALITY_PREFS = {
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
// Returns the full actor list. No filtering — actors are profile-agnostic.
// ---------------------------------------------------------------------------
router.get('/api/actors', (req, res) => {
  res.json({ actors: ACTORS, total: ACTORS.length });
});

// ---------------------------------------------------------------------------
// GET /api/catalog
// Optional query params:
//   ?profile_id=dave_tv|mom_tv  — filters by profile_access
//   ?provider_id=apollo_group|xtremehd|all — filters by providers array membership
// Both params may be combined.
// ---------------------------------------------------------------------------
// Decide which catalog source to use for this request and return the result
// alongside a label for the X-Catalog-Source header. Never throws — failures
// fall back to mock cleanly.
//
// Branch order:
//   1. Jellyfin (if configured + reachable) — wholesale replaces the catalog
//   2. Mock seed — used when Jellyfin missing/failed
//   3. If IPTV_ORG_ENABLED=true AND the cache has channels, merge them into
//      whatever base was chosen (mock or jellyfin) so the badge flips to
//      green ('merged-with-iptv-org').
async function resolveCatalog() {
  let baseItems;
  let baseSource;

  const hasJellyfinConfig = !!(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY);
  if (!hasJellyfinConfig) {
    baseItems = [...CATALOG_ITEMS];
    baseSource = SRC_MOCK_NO_JELLYFIN;
  } else {
    try {
      const jellyfinItems = await jellyfin.fetchCatalog();
      if (Array.isArray(jellyfinItems) && jellyfinItems.length > 0) {
        baseItems = jellyfinItems;
        baseSource = SRC_JELLYFIN;
      } else {
        baseItems = [...CATALOG_ITEMS];
        baseSource = SRC_MOCK_FALLBACK;
      }
    } catch (err) {
      var sanLogJ = require('../lib/sanitizeLog').sanitizeForLog;
      console.warn('[catalog] Jellyfin fetch failed (' + (err && err.code ? err.code : 'unknown') + '): ' + sanLogJ(err && err.message ? err.message : 'no message') + ' — serving mock');
      baseItems = [...CATALOG_ITEMS];
      baseSource = SRC_MOCK_FALLBACK;
    }
  }

  // Merge iptv-org channels onto the base (after the cache cron has run).
  let iptvOrgCount = 0;
  let iptvOrgAge = null;
  if (iptvOrg.isEnabled()) {
    try {
      const orgItems = iptvOrg.fetchCatalog({ limit: 300 });
      if (Array.isArray(orgItems) && orgItems.length > 0) {
        iptvOrgCount = orgItems.length;
        iptvOrgAge = iptvOrg.getDataAgeHours();
        baseItems = baseItems.concat(orgItems);
        baseSource = SRC_MERGED_IPTV_ORG;
      }
    } catch (err) {
      console.warn('[catalog] iptv-org merge failed: ' + require('../lib/sanitizeLog').sanitizeForLog(err && err.message ? err.message : 'unknown'));
    }
  }

  // Merge operator-pasted M3U providers (Apollo Group, xTremeHD).
  // This activates whenever APOLLO_M3U_URL or XTREMEHD_M3U_URL is set.
  // Provider URLs may carry embedded credentials; the m3uClient module
  // keeps stream URLs server-side only — items returned here carry
  // sanitised metadata + a provider tag but never the upstream URL.
  let m3uCount = 0;
  let m3uProviders = null;
  if (m3uClient.isEnabled()) {
    try {
      const m3uItems = await m3uClient.fetchCatalog({ limit: 600 });
      if (Array.isArray(m3uItems) && m3uItems.length > 0) {
        m3uCount = m3uItems.length;
        baseItems = baseItems.concat(m3uItems);
        baseSource = SRC_MERGED_PROVIDERS;
      }
      // Status is always reported (even on zero items) so the operator
      // settings panel can show "configured but fetch failed" diagnostics.
      m3uProviders = m3uClient.getProviderStatus();
    } catch (err) {
      console.warn('[catalog] m3u merge failed: ' + require('../lib/sanitizeLog').sanitizeForLog(err && err.message ? err.message : 'unknown'));
    }
  }

  // Wave-13: cross-provider channel merge. Group same-channel items across
  // providers into ONE catalog entry with a sources[] array (one entry per
  // provider variant). The user no longer sees three "ESPN" cards (one per
  // provider) — they see one ESPN card. /api/play walks sources[] on
  // resolve so the failed primary auto-falls-through to the next provider.
  //
  // Source priority: xtremehd > apollo_group > iptv-org > seed. Seeds land
  // last because their source_id is fake; they only become the active
  // source if every real provider variant fails to resolve.
  var beforeMerge = baseItems.length;
  var mergedItems;
  try {
    mergedItems = catalogMerge.mergeByTitle(baseItems);
  } catch (mergeErr) {
    // Never let a merge bug nuke the catalog response — fall back to the
    // un-merged base list and surface the failure in the response meta.
    var sanLogM = require('../lib/sanitizeLog').sanitizeForLog;
    console.warn('[catalog] merge failed, serving un-merged: ' + sanLogM(mergeErr && mergeErr.message ? mergeErr.message : 'unknown'));
    mergedItems = baseItems.map(function(it) {
      // Synthesise a single-source sources[] so downstream consumers
      // (play.js) can rely on the shape unconditionally.
      var providerId = (Array.isArray(it.providers) && it.providers[0] && it.providers[0].provider_id) || it.provider || 'seed';
      var clone = {};
      for (var f in it) { if (Object.prototype.hasOwnProperty.call(it, f)) { clone[f] = it[f]; } }
      clone.sources = [{
        provider_id: providerId,
        item_id: it.id,
        source_id: (Array.isArray(it.providers) && it.providers[0] && it.providers[0].source_id) || null,
        resolution: (it.metadata && it.metadata.resolution) || it.quality || null,
        source_health: (Array.isArray(it.providers) && it.providers[0] && it.providers[0].source_health) || { status: 'unknown' },
        is_seed_placeholder: isUnplayableSeedLive(it),
      }];
      return clone;
    });
  }
  var mergedItemCount = beforeMerge - mergedItems.length;

  // Publish the latest merged set to the in-process cache so /api/play can
  // find a clicked item's full sources[] array on the next request. The
  // cache is overwritten every catalog request, so the bound on staleness
  // is just the time between a user opening a card and clicking ▶ Watch.
  try { catalogMerge.setLastMerged(mergedItems); }
  catch (_) { /* never block the catalog response on a cache write */ }

  // Wave-11 (now post-merge): a merged item is "playable" if AT LEAST ONE
  // of its sources points at a real provider (i.e. is_seed_placeholder is
  // false on some source). After merging, the seed placeholders survive
  // only inside the sources[] of items that also have a real provider —
  // those are KEPT (the seed is a tertiary fallback). Items whose ONLY
  // source is a seed placeholder are still unplayable; we drop them when
  // we have any real provider data.
  //
  // Safety net: if BOTH real-provider fetches yielded zero items (Apollo
  // unreachable AND iptv-org disabled), we leave the seeds in so the
  // catalog still has content — better an unplayable channel than a
  // blank shelf during a provider outage.
  var realProviderCount = m3uCount + iptvOrgCount;
  var seedDeduped = 0;
  var seedVodDeduped = 0;
  if (realProviderCount > 0) {
    var beforeLive = mergedItems.length;
    mergedItems = mergedItems.filter(function(it) {
      if (!isUnplayableSeedLive(it)) { return true; }
      if (Array.isArray(it.sources)) {
        for (var s = 0; s < it.sources.length; s++) {
          if (it.sources[s] && it.sources[s].is_seed_placeholder === false) { return true; }
        }
      }
      return false;
    });
    seedDeduped = beforeLive - mergedItems.length;

    // Wave-14: also strip unplayable seed VOD / series so "click Top Gun → 503"
    // stops happening. Same conservative posture: only when real providers
    // delivered items; if every provider is down we keep the seed VODs so
    // the catalog still shows movie titles (better an unplayable card during
    // an outage than a blank Movies shelf).
    var beforeVod = mergedItems.length;
    mergedItems = mergedItems.filter(function(it) {
      if (!isUnplayableSeedVodOrSeries(it)) { return true; }
      if (Array.isArray(it.sources)) {
        for (var sv = 0; sv < it.sources.length; sv++) {
          if (it.sources[sv] && it.sources[sv].is_seed_placeholder === false) { return true; }
        }
      }
      return false;
    });
    seedVodDeduped = beforeVod - mergedItems.length;
    if (seedVodDeduped > 0) {
      console.log('[catalog] hid ' + seedVodDeduped + ' unplayable seed VOD/series items');
    }
  }

  return {
    items: mergedItems,
    source: baseSource,
    iptv_org_count: iptvOrgCount,
    iptv_org_data_age_h: iptvOrgAge,
    m3u_count: m3uCount,
    m3u_providers: m3uProviders,
    seed_deduped: seedDeduped,
    seed_vod_deduped: seedVodDeduped,
    merged_duplicates: mergedItemCount,
  };
}

// Wave-16: parse the `?hide_providers=A,B,C` query param into a normalised
// Set of provider_ids the caller wants stripped from the response. Returns
// null when the param is empty/missing so resolveCatalog's filter is a
// no-op (and Cloudflare's edge cache shares the unfiltered entry). Accepts
// both hyphenated ("iptv-org") and underscored ("iptv_org") spellings so
// the client store key normalisation doesn't break server-side filtering.
function parseHideProviders(raw) {
  if (typeof raw !== 'string' || raw.length === 0) { return null; }
  // Cap length to defeat absurdly long inputs hitting the edge cache.
  if (raw.length > 256) { return null; }
  const parts = raw.split(',');
  const set = {};
  let count = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = (parts[i] || '').trim().toLowerCase();
    if (!p) { continue; }
    // Allow only [a-z0-9_-] in provider IDs.
    if (!/^[a-z0-9_-]{1,32}$/.test(p)) { continue; }
    set[p] = true;
    // Mirror the hyphen ↔ underscore alias so 'iptv-org' in the query
    // also hides items tagged 'iptv_org' (and vice versa).
    if (p === 'iptv-org') { set['iptv_org'] = true; }
    else if (p === 'iptv_org') { set['iptv-org'] = true; }
    count += 1;
  }
  if (count === 0) { return null; }
  return set;
}

router.get('/api/catalog', async (req, res) => {
  const { profile_id, provider_id } = req.query;
  // W16-PROVIDERS — `?hide_providers=apollo_group,xtremehd` lets the client
  // ask the server to strip items by provider. The client also re-filters
  // defensively so a stale Cloudflare cache entry never reveals a hidden
  // provider, but doing the filter here keeps the response size honest
  // when the visibility set is stable.
  const hiddenSet = parseHideProviders(req.query.hide_providers);

  if (profile_id !== undefined && !VALID_PROFILES.includes(profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: `Invalid profile_id '${profile_id}'. Valid values: dave_tv, mom_tv`,
    });
  }

  if (
    provider_id !== undefined &&
    !VALID_PROVIDERS.includes(provider_id)
  ) {
    return res.status(400).json({
      error: 'validation_failed',
      message: `Invalid provider_id '${provider_id}'. Valid values: apollo_group, xtremehd, all`,
    });
  }

  const resolved = await resolveCatalog();
  let items = resolved.items;
  res.setHeader(CATALOG_SOURCE_HEADER, resolved.source);

  // Edge-cache the catalog at Cloudflare. Live measurement on 2026-05-20 showed
  // 36 KB gzipped catalog took ~1 s end-to-end with cf-cache-status: DYNAMIC.
  // Catalog changes only when the operator pastes new provider credentials —
  // safe to cache 2 min at the edge with a 10 min stale-while-revalidate so
  // a stale cache entry serves instantly while we backfill in the background.
  // Browser cache (max-age) stays short so a hard refresh still gets fresh.
  // Cache key includes the full URL (path + query) so per-profile/per-provider
  // filters do not collide. Vary on Accept-Encoding keeps gzip/br separate.
  res.setHeader(
    'Cache-Control',
    'public, max-age=30, s-maxage=120, stale-while-revalidate=600'
  );
  res.setHeader('Vary', 'Accept-Encoding');

  // Filtering by profile_access / providers array only applies to mock items —
  // Jellyfin items don't carry those fields. When we're serving Jellyfin
  // results we skip these filters entirely (the workstation library is
  // already gated by who can reach the API).
  const isJellyfin = resolved.source === SRC_JELLYFIN;

  // --- Profile filter (mock only) ---
  if (profile_id && !isJellyfin) {
    items = items.filter((item) => item.profile_access.includes(profile_id));
  }

  // --- Provider filter (mock only) ---
  // "all" is a no-op (explicit "show everything"). Any specific provider_id
  // filters to items where that provider appears in EITHER the legacy
  // providers[] array OR the wave-13 sources[] array (post-merge canonical
  // place). Both shapes are checked so the filter survives the merge.
  if (provider_id && provider_id !== 'all' && !isJellyfin) {
    items = items.filter((item) => {
      if (Array.isArray(item.sources) &&
          item.sources.some((s) => s.provider_id === provider_id)) {
        return true;
      }
      if (Array.isArray(item.providers) &&
          item.providers.some((p) => p.provider_id === provider_id)) {
        return true;
      }
      return false;
    });
  }

  // --- Wave-16 hide_providers filter ---
  // Drop items whose only providers are in the hidden set. Items with at
  // least one source NOT in the hidden set survive (consistent with the
  // client-side filter in App.jsx).
  let hiddenDropped = 0;
  if (hiddenSet) {
    const before = items.length;
    items = items.filter((item) => {
      let anyVisible = false;
      let anySource = false;
      if (Array.isArray(item.sources)) {
        for (let i = 0; i < item.sources.length; i++) {
          const sid = item.sources[i] && item.sources[i].provider_id;
          if (!sid) { continue; }
          anySource = true;
          if (!hiddenSet[sid]) { anyVisible = true; break; }
        }
      }
      if (!anyVisible && Array.isArray(item.providers)) {
        for (let j = 0; j < item.providers.length; j++) {
          const pid = item.providers[j] && item.providers[j].provider_id;
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

  // --- Quality sorting for mom_tv: 4K first, HDR-flagged items higher ---
  // Only meaningful for mock items (Jellyfin items use a different shape).
  if (profile_id === 'mom_tv' && !isJellyfin) {
    items.sort((a, b) => {
      const resA = RESOLUTION_ORDER[a.metadata?.resolution] || 0;
      const resB = RESOLUTION_ORDER[b.metadata?.resolution] || 0;
      if (resB !== resA) { return resB - resA; }

      // Secondary: HDR items sorted higher
      const hdrA = a.metadata?.hdr_format ? 1 : 0;
      const hdrB = b.metadata?.hdr_format ? 1 : 0;
      return hdrB - hdrA;
    });
  }

  const quality_preference = profile_id
    ? (PROFILE_QUALITY_PREFS[profile_id] || null)
    : null;

  const _meta = {
    sorted_for_profile: profile_id || null,
    quality_preference,
    provider_filter: provider_id || null,
    source: resolved.source,
    iptv_org_count: resolved.iptv_org_count,
    m3u_count: resolved.m3u_count,
    m3u_providers: resolved.m3u_providers,
    seed_deduped: resolved.seed_deduped || 0,
    // Wave-13: how many duplicate items the cross-provider merge folded
    // away. If the unmerged catalog had 3 ESPN entries and 2 CNN entries
    // and 1 of each elsewhere, merged_duplicates is (3-1) + (2-1) = 3.
    merged_duplicates: resolved.merged_duplicates || 0,
    // Wave-16: how many items the hide_providers query param dropped.
    // 0 when the param is missing — the catalog is unfiltered.
    hidden_dropped: hiddenDropped,
    hidden_providers: hiddenSet ? Object.keys(hiddenSet) : [],
  };

  res.json({ catalog: items, total: items.length, _meta });
});

module.exports = router;
