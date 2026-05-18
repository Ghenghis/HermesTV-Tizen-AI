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

// Mock program data.  Shape is the contract the EPG grid component reads.
const MOCK_PROGRAMS = [
  {
    program_id:         'mock-prog-001',
    channel_id:         'mock.ch.001',
    title:              'Mock Program A',
    start_utc:          '2026-05-17T19:00:00Z',
    end_utc:            '2026-05-17T19:30:00Z',
    description:        'A mock live program.',
    catch_up_available: true,
    epg_status:         'matched',
  },
  {
    program_id:         'mock-prog-002',
    channel_id:         'mock.ch.001',
    title:              'Mock Program B',
    start_utc:          '2026-05-17T19:30:00Z',
    end_utc:            '2026-05-17T20:30:00Z',
    description:        'Another mock program.',
    catch_up_available: false,
    epg_status:         'matched',
  },
];

// ── GET /api/epg/grid ─────────────────────────────────────────────────────────
router.get('/', function(req, res) {
  const { start, end, profile_id } = req.query;

  // profile_id
  if (!profile_id) {
    return res.status(400).json({ error: 'profile_id query parameter is required' });
  }
  if (!VALID_PROFILES.has(profile_id)) {
    return res.status(400).json({
      error: 'profile_id must be one of: ' + Array.from(VALID_PROFILES).join(', '),
    });
  }

  // start / end
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query parameters are required (ISO 8601)' });
  }

  var startMs = Date.parse(start);
  var endMs   = Date.parse(end);

  if (isNaN(startMs)) {
    return res.status(400).json({ error: 'start is not a valid ISO 8601 date', received: start });
  }
  if (isNaN(endMs)) {
    return res.status(400).json({ error: 'end is not a valid ISO 8601 date', received: end });
  }
  if (endMs <= startMs) {
    return res.status(400).json({ error: 'end must be after start' });
  }
  if ((endMs - startMs) > MAX_WINDOW_MS) {
    return res.status(400).json({
      error: 'Requested window exceeds maximum of 4 hours',
      max_hours: 4,
      requested_ms: endMs - startMs,
    });
  }

  // Filter mock programs to the requested window
  var programs = MOCK_PROGRAMS.filter(function(p) {
    var pStart = Date.parse(p.start_utc);
    var pEnd   = Date.parse(p.end_utc);
    // Include programs that overlap the requested window
    return pStart < endMs && pEnd > startMs;
  });

  return res.status(200).json({
    window_start: new Date(startMs).toISOString(),
    window_end:   new Date(endMs).toISOString(),
    server_time:  new Date().toISOString(),
    programs:     programs,
    _note:        'Mock EPG. Real EPG integration in B3 via Jellyfin Live TV API.',
  });
});

module.exports = router;
