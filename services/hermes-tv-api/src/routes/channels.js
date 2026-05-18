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
const { LIVE_DEFS } = require('../data/seedCatalog');
const router  = express.Router();

const VALID_PROFILES = new Set(['dave_tv', 'mom_tv']);

// Derive the channel list from the same seed catalog so /api/channels and
// /api/catalog (the catalog rail in each shell) stay consistent. ~90 live
// channels cover sports/news/entertainment/lifestyle/family/local broadcast,
// which is what the EPG grid needs to actually populate the viewport.
// When a real provider is wired (Threadfin-fronted Apollo / xTremeHD or
// iptv-org), this seed gets replaced by that provider's channel list.
const MOCK_CHANNELS = LIVE_DEFS.map(function(def, i) {
  return {
    channel_id:         'live.' + def.slug,
    channel_number:     String(i + 1),
    display_name:       def.title,
    logo_url:           'https://hermestv.local/assets/logos/' + def.slug + '.png',
    // Use 'apollo' for backward-compat with provider.* schemas that use
    // the no-suffix form; the catalog endpoint uses the 'apollo_group' form.
    provider_tags:      (def.providers || ['apollo_group']).map(function(p) {
      return p === 'apollo_group' ? 'apollo' : p;
    }),
    catch_up_available: !!def.has_catchup,
    epg_status:         def.has_catchup ? 'matched' : 'partial',
    category:           def.category,
    resolution:         def.resolution || '1080p',
    profile_access:     def.profile_access || ['dave_tv', 'mom_tv'],
  };
});

const CHANNEL_INDEX = MOCK_CHANNELS.reduce(function(map, ch) {
  map[ch.channel_id] = ch;
  return map;
}, {});

// ── GET /api/channels?profile_id=dave_tv|mom_tv ───────────────────────────────
router.get('/', function(req, res) {
  const { profile_id } = req.query;

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

  const visible = MOCK_CHANNELS.filter(function(ch) {
    return !ch.profile_access || ch.profile_access.indexOf(profile_id) !== -1;
  });

  return res.status(200).json({
    channels: visible,
    _note:    'TV-safe. No stream URLs. No credentials. Served by HermesTV backend.',
  });
});

// ── GET /api/channels/:channel_id ─────────────────────────────────────────────
router.get('/:channel_id', function(req, res) {
  const { channel_id } = req.params;
  const channel = CHANNEL_INDEX[channel_id];

  if (!channel) {
    return res.status(404).json({
      error:      'channel_not_found',
      message:    'Channel not found',
      channel_id: channel_id,
    });
  }

  return res.status(200).json(channel);
});

module.exports = router;
