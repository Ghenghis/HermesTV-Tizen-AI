'use strict';

/**
 * routes/catchup.js — Catchup TV endpoints.
 *
 * Mirrors IPTV Player Zero's catchup commands from TAURI_COMMANDS.md §8:
 *   get_catchup_programs({ channel_id, playlist_id }) → CatchupProgram[]
 *
 * Catchup-program data only exists when the upstream provider supports
 * timeshift (Apollo / xTremeHD support it; iptv-org public channels do not).
 * The seed catalog tags channels with `has_catchup: true` for the subset
 * that mirror a credible catchup window — we synthesise the last 24 hours
 * of programs against that subset so the UI's catchup rail can render.
 *
 * Real timeshift playback (`play_catchup_item`) requires a credential-bearing
 * URL with embedded timestamps; that flows through lib/streamResolver and
 * surfaces `threadfin_proxy_required` 503 when no proxy is configured.
 *
 * MAPPING TO ZERO COMMANDS:
 *   GET    /api/catchup/:channelId       ← get_catchup_programs (synth)
 *   POST   /api/catchup/play             ← play_catchup_item (501 / ticket envelope)
 */

const { Router } = require('express');
const router = Router();
const { LIVE_DEFS } = require('../data/seedCatalog');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];

// Build a lookup by "live.<slug>" channel_id form.
const CATCHUP_CHANNELS = LIVE_DEFS.filter(function(d) { return d.has_catchup; }).reduce(function(map, def) {
  map['live.' + def.slug] = def;
  return map;
}, {});

// Synthesise 24h of half-hour catchup blocks for a channel. Real implementation
// queries the EPG store / Xtream Codes `xc_get_simple_data_table` endpoint.
function _synthesizeCatchupPrograms(channelId, channelDef) {
  const now = Date.now();
  const programs = [];
  // 48 half-hour slots = last 24 hours.
  for (var i = 0; i < 48; i++) {
    const endMs = now - (i * 30 * 60 * 1000);
    const startMs = endMs - (30 * 60 * 1000);
    // Skip programs that are still in the future.
    if (startMs > now) { continue; }
    programs.push({
      program_id: 'cu-' + (channelDef.slug || 'unknown') + '-' + i,
      channel_id: channelId,
      title: channelDef.title + ' — Block ' + (i + 1),
      start_utc: new Date(startMs).toISOString(),
      end_utc: new Date(endMs).toISOString(),
      duration_min: 30,
      catch_up_available: true,
      catch_up_expires_utc: new Date(endMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }
  return programs;
}

// ─── GET /api/catchup/:channelId ─────────────────────────────────────────────
// Maps to: get_catchup_programs({ channel_id, playlist_id })
router.get('/api/catchup/:channelId', (req, res) => {
  const channelId = req.params.channelId;
  const profileId = req.query.profile_id;

  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  const channelDef = CATCHUP_CHANNELS[channelId];
  if (!channelDef) {
    return res.status(404).json({
      error: 'catchup_not_available',
      message: 'Channel does not support catch-up TV or channel_id is unknown',
      channel_id: channelId,
    });
  }

  const programs = _synthesizeCatchupPrograms(channelId, channelDef);
  res.json({
    channel_id: channelId,
    channel_display_name: channelDef.title,
    programs: programs,
    total: programs.length,
    catch_up_window_hours: 24,
    _meta: { source: 'synthesised-from-seed', server_time: new Date().toISOString() },
  });
});

// ─── POST /api/catchup/play ──────────────────────────────────────────────────
// Maps to: play_catchup_item({ program_id })
// Returns a ticket envelope similar to /api/play. The actual timeshift URL
// resolution flows through streamResolver (Phase 4 wiring).
router.post('/api/catchup/play', (req, res) => {
  const body = req.body || {};

  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  if (!body.channel_id || typeof body.channel_id !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'channel_id is required' });
  }
  if (!body.program_id || typeof body.program_id !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'program_id is required' });
  }

  const ALLOWED = ['channel_id', 'profile_id', 'program_id'];
  for (const key of Object.keys(body)) {
    if (!ALLOWED.includes(key)) {
      return res.status(400).json({ error: 'validation_failed', message: 'unknown field: ' + key });
    }
  }

  const channelDef = CATCHUP_CHANNELS[body.channel_id];
  if (!channelDef) {
    return res.status(404).json({
      error: 'catchup_not_available',
      message: 'Channel does not support catch-up TV',
    });
  }

  console.warn('[catchup] play_catchup_item requested for channel=' + body.channel_id + ' program=' + body.program_id + ' but timeshift proxy not implemented (Phase 4)');
  res.status(501).json({
    error: 'not_implemented',
    message: 'Timeshift playback requires the Threadfin proxy and provider catch-up support. Configure THREADFIN_URL in the API .env.',
    channel_id: body.channel_id,
    program_id: body.program_id,
  });
});

module.exports = router;
