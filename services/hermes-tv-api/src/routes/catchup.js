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
const iptvOrg = require('../lib/iptvOrg');
const m3uClient = require('../lib/m3uClient');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];

// W17-PURGE: the catchup channel set used to be derived from the seed catalog.
// Now we walk the real-provider caches and surface anything carrying
// metadata.has_catchup=true (currently only set by operator-pasted Xtream
// providers; iptv-org public channels do not advertise catchup). When no
// provider is configured the lookup is empty and every channel returns 404.
function _findCatchupChannel(channelId) {
  function _match(items) {
    if (!Array.isArray(items)) { return null; }
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || it.type !== 'live') { continue; }
      if (it.id !== channelId) { continue; }
      if (it.metadata && it.metadata.has_catchup) { return it; }
    }
    return null;
  }
  try {
    if (iptvOrg.isEnabled()) {
      var hit = _match(iptvOrg.fetchCatalog({ limit: 500 }));
      if (hit) { return hit; }
    }
  } catch (_) {}
  try {
    if (m3uClient.isEnabled() && typeof m3uClient.getCachedCatalog === 'function') {
      var hit2 = _match(m3uClient.getCachedCatalog());
      if (hit2) { return hit2; }
    }
  } catch (_) {}
  return null;
}

// ─── GET /api/catchup/:channelId ─────────────────────────────────────────────
// Maps to: get_catchup_programs({ channel_id, playlist_id })
// W17-PURGE: catchup programs were previously synthesised from the seed
// catalog ("ESPN — Block 1", "CNN — Block 2", ...). That was placeholder
// content the project bans. Until a real EPG / Xtream catchup adapter is
// wired the endpoint returns an empty programs[] list (with the correct
// 404 when the channel doesn't exist or doesn't support catchup).
router.get('/api/catchup/:channelId', (req, res) => {
  const channelId = req.params.channelId;
  const profileId = req.query.profile_id;

  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  const channelDef = _findCatchupChannel(channelId);
  if (!channelDef) {
    return res.status(404).json({
      error: 'catchup_not_available',
      message: 'Channel does not support catch-up TV or channel_id is unknown',
      channel_id: channelId,
    });
  }

  res.json({
    channel_id: channelId,
    channel_display_name: channelDef.title || channelId,
    programs: [],
    total: 0,
    catch_up_window_hours: 24,
    _meta: {
      source: 'no-catchup-adapter',
      message: 'Catchup program data requires Xtream xc_get_simple_data_table or XMLTV history — not yet wired.',
      server_time: new Date().toISOString(),
    },
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

  const channelDef = _findCatchupChannel(body.channel_id);
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
