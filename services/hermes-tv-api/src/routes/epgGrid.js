'use strict';

/**
 * routes/epgGrid.js — Extended EPG grid endpoint.
 *
 * The single-channel stub is in epg.js (another agent's file).
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

// Per docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md §"Non-Negotiable Truth Rules"
// + docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md §"EPG And Catchup":
//   "epgGrid.js still returns mock programs. EPG is mostly single XMLTV URL
//    plus static channel map, not multi-source provider-aware waterfall."
// The mock array was removed; the route now derives programs from the
// xmltv cache (set up by routes/epg.js + lib/integrations/xmltv.js) and
// returns an HONEST empty list when no real EPG is configured. Lane 07
// (EPG mapping) wires the waterfall (lib/epgWaterfall.js, Priority 3) +
// per-channel mapping to playable catalog IDs in a follow-up.
var xmltv = (function() { try { return require('../integrations/xmltv'); } catch (_) { return null; } })();

// ── GET /api/epg/grid ─────────────────────────────────────────────────────────
router.get('/', function(req, res) {
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

  // Honest empty when no XMLTV is configured. When XMLTV_URL is set + the
  // xmltv cache holds a parsed result, walk its programmes-by-tvgId into
  // the grid shape and filter by window. Real-fixture EPG via the Xtream
  // panel (xmltv.php) populates the same xmltv cache, so the gate keys on
  // the cache contents rather than a hard-coded provider.
  var programs = [];
  var epgMeta = { source: 'no-epg', tvg_ids: 0, programmes_total: 0 };
  if (xmltv && typeof xmltv.getCachedEpg === 'function' &&
      typeof process.env.XMLTV_URL === 'string' && process.env.XMLTV_URL.length > 0) {
    try {
      var cached = xmltv.getCachedEpg(process.env.XMLTV_URL);
      if (cached && cached.programmes_by_tvg_id && typeof cached.programmes_by_tvg_id === 'object') {
        var byId = cached.programmes_by_tvg_id;
        var ids = Object.keys(byId);
        epgMeta.source = 'xmltv';
        epgMeta.tvg_ids = ids.length;
        for (var i = 0; i < ids.length; i++) {
          var tvgId = ids[i];
          var arr = byId[tvgId] || [];
          epgMeta.programmes_total += arr.length;
          for (var j = 0; j < arr.length; j++) {
            var p = arr[j];
            if (!p) { continue; }
            var pStart = Date.parse(p.start_utc || p.start || '');
            var pEnd = Date.parse(p.end_utc || p.stop_utc || p.stop || '');
            if (isNaN(pStart) || isNaN(pEnd)) { continue; }
            if (pStart < endMs && pEnd > startMs) {
              programs.push({
                program_id: p.program_id || (tvgId + '-' + pStart),
                channel_id: tvgId,
                title: p.title || '',
                start_utc: new Date(pStart).toISOString(),
                end_utc: new Date(pEnd).toISOString(),
                description: p.description || p.desc || '',
                catch_up_available: !!(p.catch_up_available || p.has_archive),
                epg_status: 'matched'
              });
            }
          }
        }
      }
    } catch (_) { /* fall through to empty */ }
  }

  return res.status(200).json({
    window_start: new Date(startMs).toISOString(),
    window_end:   new Date(endMs).toISOString(),
    server_time:  new Date().toISOString(),
    programs:     programs,
    _meta:        epgMeta
  });
});

module.exports = router;
