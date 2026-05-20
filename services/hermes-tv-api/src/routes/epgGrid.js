'use strict';

/**
 * routes/epgGrid.js — Extended EPG grid endpoint.
 *
 * This file adds the multi-channel time-window grid used by the EPG UI.
 *
 * SECURITY CONTRACT
 * - XMLTV source URLs contain credentials (username/password in query string).
 *   These are NEVER present in any response from this endpoint.
 * - Only credential-stripped program data is returned: stable channel IDs,
 *   program IDs, titles, times, and flags.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * B3 INTEGRATION PATH — Jellyfin Live TV API
 * ────────────────────────────────────────────────────────────────────────────
 * Source: Jellyfin at http://jellyfin-host:8096/LiveTv/Programs
 *   GET /LiveTv/Programs
 *     ?ChannelIds=<comma-separated internal channel IDs>
 *     &StartIndex=0
 *     &Limit=500
 *     &MinStartDate=<ISO8601 start>
 *     &MaxEndDate=<ISO8601 end>
 *     &HasAired=false
 *     &IsAiring=true
 *   Authorization: MediaBrowser Token="<JELLYFIN_API_KEY>"   ← server-side only
 *
 * Pipeline:
 *   1. Map HermesTV channel_id → Jellyfin channel ID via a local mapping table.
 *   2. Call Jellyfin API (server-to-server; key never leaves backend).
 *   3. Strip any fields that contain source URL fragments (StreamUrl, etc.).
 *   4. Return only: program_id, channel_id, title, start_utc, end_utc,
 *      description, catch_up_available, epg_status.
 *   5. Cache result in Redis: key = epg:grid:<profile_id>:<start>:<end>, TTL 5 min.
 *
 * NEVER forward XMLTV endpoint URLs to the TV client.
 * NEVER forward Jellyfin API tokens to the TV client.
 * ────────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();

const VALID_PROFILES = new Set(['dave_tv', 'mom_tv']);

// Maximum permitted window in milliseconds (4 hours)
const MAX_WINDOW_MS = 4 * 60 * 60 * 1000;

var xmltv = (function() { try { return require('../integrations/xmltv'); } catch (_) { return null; } })();
var catalogMerge = (function() { try { return require('../lib/catalogMerge'); } catch (_) { return null; } })();
var m3uClient = (function() { try { return require('../lib/m3uClient'); } catch (_) { return null; } })();
var iptvOrg = (function() { try { return require('../lib/iptvOrg'); } catch (_) { return null; } })();
var epgWaterfall = require('../lib/epgWaterfall');
var providerRegistry = require('../lib/providerRegistry');

function _asArray(v) {
  return Array.isArray(v) ? v : [];
}

function _catalogItemsForMapping() {
  var out = [];
  try {
    if (catalogMerge && typeof catalogMerge.getLastMerged === 'function') {
      var merged = catalogMerge.getLastMerged();
      if (Array.isArray(merged)) { out = out.concat(merged); }
    }
  } catch (_) {}
  try {
    if (m3uClient && typeof m3uClient.getCachedCatalog === 'function') {
      var m3u = m3uClient.getCachedCatalog();
      if (Array.isArray(m3u)) { out = out.concat(m3u); }
    }
  } catch (_) {}
  try {
    if (iptvOrg && iptvOrg.isEnabled && iptvOrg.isEnabled() && typeof iptvOrg.fetchCatalog === 'function') {
      var org = iptvOrg.fetchCatalog({ limit: 500 });
      if (Array.isArray(org)) { out = out.concat(org); }
    }
  } catch (_) {}
  return out;
}

function _channelNamesByTvgId(epgData) {
  var names = {};
  if (epgData && Array.isArray(epgData.channels)) {
    for (var i = 0; i < epgData.channels.length; i++) {
      var c = epgData.channels[i];
      if (c && typeof c.id === 'string' && c.id.length > 0) {
        names[c.id] = c.name || c.id;
      }
    }
  }
  return names;
}

function _programmesByTvgId(cached) {
  if (!cached) { return {}; }
  if (cached.programmes_by_tvg_id && typeof cached.programmes_by_tvg_id === 'object') {
    return cached.programmes_by_tvg_id;
  }
  var epgData = cached.data || cached;
  var programs = _asArray(epgData.programs);
  var out = {};
  for (var i = 0; i < programs.length; i++) {
    var p = programs[i];
    if (!p || typeof p.channel_id !== 'string' || p.channel_id.length === 0) { continue; }
    if (!out[p.channel_id]) { out[p.channel_id] = []; }
    out[p.channel_id].push(p);
  }
  return out;
}

async function _epgCandidates() {
  var rows = [];
  try {
    rows = await providerRegistry.listFull();
  } catch (_) {
    rows = [];
  }
  var xmltvUrl = (typeof process.env.XMLTV_URL === 'string' && process.env.XMLTV_URL.trim().length > 0)
    ? process.env.XMLTV_URL.trim()
    : '';
  return epgWaterfall.buildEpgUrlCandidatesFromRegistryRows(rows, xmltvUrl);
}

function _safeSourceMeta(candidate, epg, cacheInfo) {
  return {
    source: candidate.source,
    kind: candidate.kind,
    registry_id: candidate.registry_id,
    provider_id: candidate.provider_id,
    provider_type: candidate.provider_type,
    source_label: xmltv && xmltv._safeSourceLabel ? xmltv._safeSourceLabel(candidate.url) : 'none',
    channel_count: epg && Array.isArray(epg.channels) ? epg.channels.length : 0,
    program_count: epg && Array.isArray(epg.programs) ? epg.programs.length : 0,
    error: epg && epg.error ? epg.error : null,
    cache: cacheInfo ? {
      age_ms: cacheInfo.age_ms,
      fresh: cacheInfo.fresh,
      expires_at: cacheInfo.expires_at,
    } : null,
  };
}

async function _loadProviderEpgs(useForce) {
  if (!xmltv || typeof xmltv.getCachedEpg !== 'function' || typeof xmltv.fetchEpg !== 'function') {
    return { candidates: [], sources: [], epg: { channels: [], programs: [] } };
  }
  var candidates = await _epgCandidates();
  var epgs = [];
  var sourceMeta = [];
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var epg = null;
    try {
      var cached = !useForce ? xmltv.getCachedEpg(c.url) : null;
      epg = cached && cached.data ? cached.data : await xmltv.fetchEpg(c.url, { forceRefresh: useForce });
      epgs.push(epg);
      sourceMeta.push(_safeSourceMeta(c, epg, xmltv.getCachedEpg(c.url)));
    } catch (_) {
      epg = { channels: [], programs: [], error: 'unexpected' };
      sourceMeta.push(_safeSourceMeta(c, epg, null));
    }
  }
  return {
    candidates: candidates,
    sources: sourceMeta,
    epg: epgWaterfall.mergeEpgResults(epgs)
  };
}

function _programStart(p) {
  return Date.parse(p.start_utc || p.start || '');
}

function _programEnd(p) {
  return Date.parse(p.end_utc || p.stop_utc || p.stop || p.end || '');
}

function _channelFilterSet(raw) {
  if (typeof raw !== 'string' || raw.length === 0) { return null; }
  var parts = raw.split(',');
  var set = {};
  var any = false;
  for (var i = 0; i < parts.length; i++) {
    var id = parts[i].trim();
    if (!id) { continue; }
    set[id] = true;
    any = true;
  }
  return any ? set : null;
}

function _matchesChannelFilter(filter, row) {
  if (!filter) { return true; }
  return !!(row &&
    ((row.channel_id && filter[row.channel_id]) ||
     (row.catalog_item_id && filter[row.catalog_item_id]) ||
     (row.source_item_id && filter[row.source_item_id]) ||
     (row.xmltv_tvg_id && filter[row.xmltv_tvg_id])));
}

// ── GET /api/epg/grid ─────────────────────────────────────────────────────────
router.get('/api/epg/grid', async function(req, res) {
  const { start, end, profile_id } = req.query;

  // profile_id
  if (!profile_id) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id query parameter is required',
    });
  }
  if (!VALID_PROFILES.has(profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + Array.from(VALID_PROFILES).join(', '),
    });
  }

  // start / end
  if (!start || !end) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'start and end query parameters are required (ISO 8601)',
    });
  }

  var startMs = Date.parse(start);
  var endMs   = Date.parse(end);

  if (isNaN(startMs)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'start is not a valid ISO 8601 date',
      received: start,
    });
  }
  if (isNaN(endMs)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'end is not a valid ISO 8601 date',
      received: end,
    });
  }
  if (endMs <= startMs) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'end must be after start',
    });
  }
  if ((endMs - startMs) > MAX_WINDOW_MS) {
    return res.status(400).json({
      error: 'window_too_large',
      message: 'Requested window exceeds maximum of 4 hours',
      max_hours: 4,
      requested_ms: endMs - startMs,
    });
  }

  // Walk providerRegistry EPG sources first, then XMLTV_URL as a fallback.
  // Rows are mapped to the latest playable catalog/source identity only when
  // a real provider/catalog item proves that relationship. Unmapped rows keep
  // raw XMLTV metadata and explicitly do not claim a playable channel_id.
  var programs = [];
  var epgMeta = { source: 'no-epg', tvg_ids: 0, programmes_total: 0, mapped: 0, unmapped: 0, sources: [] };
  var wantForce = req.query.force_refresh === '1' || req.query.force_refresh === 'true';
  var forceAllowed = process.env.EPG_ALLOW_FORCE_REFRESH === '1';
  var useForce = wantForce && forceAllowed;
  var loaded = await _loadProviderEpgs(useForce);
  if (loaded.candidates.length > 0) {
    try {
      var epgData = loaded.epg;
      if (epgData) {
        var byId = _programmesByTvgId(epgData);
        var ids = Object.keys(byId);
        var channelNames = _channelNamesByTvgId(epgData);
        var playableIndex = epgWaterfall.buildPlayableEpgIndex(_catalogItemsForMapping());
        var channelFilter = _channelFilterSet(req.query.channelIds);
        epgMeta.source = 'xmltv-merged';
        epgMeta.sources = loaded.sources;
        epgMeta.tvg_ids = ids.length;
        epgMeta.mapping_source_items =
          (playableIndex && playableIndex.byName && typeof playableIndex.byName.size === 'number')
            ? playableIndex.byName.size
            : 0;
        for (var i = 0; i < ids.length; i++) {
          var tvgId = ids[i];
          var arr = byId[tvgId] || [];
          epgMeta.programmes_total += arr.length;
          for (var j = 0; j < arr.length; j++) {
            var p = arr[j];
            if (!p) { continue; }
            var pStart = _programStart(p);
            var pEnd = _programEnd(p);
            if (isNaN(pStart) || isNaN(pEnd)) { continue; }
            if (pStart < endMs && pEnd > startMs) {
              var channelName = channelNames[tvgId] || p.channel_name || p.tvg_name || p.name || tvgId;
              var mapping = epgWaterfall.resolvePlayableEpgChannel(tvgId, channelName, playableIndex);
              var row = {
                program_id: p.program_id || (tvgId + '-' + pStart),
                channel_id: mapping ? mapping.catalog_item_id : null,
                catalog_item_id: mapping ? mapping.catalog_item_id : null,
                source_item_id: mapping ? mapping.source_item_id : null,
                provider_id: mapping ? mapping.provider_id : null,
                source_id: mapping ? mapping.source_id : null,
                xmltv_tvg_id: tvgId,
                xmltv_channel_name: channelName,
                title: p.title || '',
                start_utc: new Date(pStart).toISOString(),
                end_utc: new Date(pEnd).toISOString(),
                description: p.description || p.desc || '',
                catch_up_available: !!(p.catch_up_available || p.has_archive),
                epg_status: mapping ? 'mapped' : 'unmapped',
                mapping_strategy: mapping ? mapping.match_strategy : null
              };
              if (_matchesChannelFilter(channelFilter, row)) {
                programs.push(row);
                if (mapping) { epgMeta.mapped += 1; }
                else { epgMeta.unmapped += 1; }
              }
            }
          }
        }
      }
    } catch (_) { /* fall through to empty */ }
  }
  epgMeta.force_refresh = useForce
    ? 'applied'
    : (wantForce && !forceAllowed ? 'denied (set EPG_ALLOW_FORCE_REFRESH=1)' : 'not_requested');

  return res.status(200).json({
    window_start: new Date(startMs).toISOString(),
    window_end:   new Date(endMs).toISOString(),
    server_time:  new Date().toISOString(),
    programs:     programs,
    _meta:        epgMeta
  });
});

module.exports = router;
