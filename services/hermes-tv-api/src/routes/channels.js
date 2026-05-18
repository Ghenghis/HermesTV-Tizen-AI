'use strict';

/**
 * routes/channels.js — TV-safe channel list endpoint.
 *
 * SECURITY CONTRACT
 * - Stream URLs are NEVER present in any response from this endpoint.
 * - Credentials (usernames, passwords, tokens, M3U URLs) are NEVER returned.
 * - Only stable channel IDs, display metadata, and flags are served.
 *
 * These responses feed the EPG channel rail and EPG grid. The actual playback
 * URL is resolved server-side at play-time via /api/commands (B2).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * B2 IMPLEMENTATION NOTES
 * ────────────────────────────────────────────────────────────────────────────
 * Replace MOCK_CHANNELS with a call to the appropriate provider adapter
 * (Apollo, XtremeHD, etc.) via services/hermes-tv-api/src/providers/*.js.
 * Filter results by profile_id to respect per-user channel lists.
 * Cache results in Redis (TTL 5 min) keyed by profile_id.
 * ────────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router  = express.Router();

const VALID_PROFILES = new Set(['dave_tv', 'mom_tv']);

// Mock channel data — shape matches what the EPG grid expects.
// No stream URLs. No credentials.
const MOCK_CHANNELS = [
  {
    channel_id:         'mock.ch.001',
    channel_number:     '1',
    display_name:       'Mock HD Channel 1',
    logo_url:           null,
    provider_tags:      ['apollo'],
    catch_up_available: true,
    epg_status:         'matched',
  },
  {
    channel_id:         'mock.ch.002',
    channel_number:     '2',
    display_name:       'Mock HD Channel 2 (XtremeHD)',
    logo_url:           null,
    provider_tags:      ['xtremehd'],
    catch_up_available: false,
    epg_status:         'partial',
  },
];

const CHANNEL_INDEX = MOCK_CHANNELS.reduce(function(map, ch) {
  map[ch.channel_id] = ch;
  return map;
}, {});

// ── GET /api/channels?profile_id=dave_tv|mom_tv ───────────────────────────────
router.get('/', function(req, res) {
  const { profile_id } = req.query;

  if (!profile_id) {
    return res.status(400).json({ error: 'profile_id query parameter is required' });
  }
  if (!VALID_PROFILES.has(profile_id)) {
    return res.status(400).json({
      error: 'profile_id must be one of: ' + Array.from(VALID_PROFILES).join(', '),
    });
  }

  return res.status(200).json({
    channels: MOCK_CHANNELS,
    _note:    'TV-safe. No stream URLs. No credentials. Served by HermesTV backend.',
  });
});

// ── GET /api/channels/:channel_id ─────────────────────────────────────────────
router.get('/:channel_id', function(req, res) {
  const { channel_id } = req.params;
  const channel = CHANNEL_INDEX[channel_id];

  if (!channel) {
    return res.status(404).json({
      error:      'Channel not found',
      channel_id: channel_id,
    });
  }

  return res.status(200).json(channel);
});

module.exports = router;
