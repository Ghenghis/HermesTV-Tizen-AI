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
 * URL is resolved server-side at play-time via /api/play.
 *
 * W17-PURGE: the seed catalog (LIVE_DEFS) was the previous channel source.
 * Under the no-fakes rule we now derive live channels from the same real
 * providers that /api/catalog uses (iptv-org + operator-pasted M3U).
 * When NO provider is configured the channel list is honestly empty —
 * never a synthetic ESPN/CNN/HBO list.
 */

var express = require('express');
var iptvOrg = require('../lib/iptvOrg');
var m3uClient = require('../lib/m3uClient');

var router = express.Router();

var VALID_PROFILES = ['dave_tv', 'mom_tv'];

// Pull live channels from real provider caches. Never throws. Returns an
// array in /api/channels shape with no stream URLs.
function _collectLiveChannels() {
  var out = [];
  // iptv-org public CDN channels first (free, no credentials).
  if (iptvOrg.isEnabled()) {
    try {
      var orgItems = iptvOrg.fetchCatalog({ limit: 500 });
      if (Array.isArray(orgItems)) {
        for (var i = 0; i < orgItems.length; i++) {
          var it = orgItems[i];
          if (!it || it.type !== 'live') { continue; }
          out.push(_toChannelShape(it, 'iptv-org'));
        }
      }
    } catch (_) { /* skip silently — diagnostic surfaces via /api/source-health */ }
  }
  // Operator-pasted M3U providers (Apollo Group, xTremeHD).
  if (m3uClient.isEnabled()) {
    try {
      // m3uClient.fetchCatalog is async; we can't await here without
      // making the helper async. The caller is sync so we rely on the
      // already-warm cache. /api/catalog primes the cache on startup.
      var cached = m3uClient.getCachedCatalog && m3uClient.getCachedCatalog();
      if (Array.isArray(cached)) {
        for (var j = 0; j < cached.length; j++) {
          var ci = cached[j];
          if (!ci || ci.type !== 'live') { continue; }
          var providerLabel = (Array.isArray(ci.providers) && ci.providers[0] && ci.providers[0].provider_id) || 'm3u';
          out.push(_toChannelShape(ci, providerLabel));
        }
      }
    } catch (_) { /* skip silently */ }
  }
  return out;
}

function _toChannelShape(item, providerTag) {
  return {
    channel_id: typeof item.id === 'string' ? item.id : 'live.' + String(item.id || 'unknown'),
    channel_number: item.channel_number ? String(item.channel_number) : '',
    display_name: item.title || 'Unknown',
    // Provider may serve a logo URL on the item; never substitute a fake URL.
    logo_url: item.logo_url || null,
    provider_tags: [providerTag],
    catch_up_available: !!(item.metadata && item.metadata.has_catchup),
    epg_status: (item.metadata && item.metadata.has_catchup) ? 'matched' : 'unknown',
    category: item.category || 'unknown',
    resolution: (item.metadata && item.metadata.resolution) || item.quality || null,
    profile_access: Array.isArray(item.profile_access) ? item.profile_access : ['dave_tv', 'mom_tv'],
  };
}

// ── GET /api/channels?profile_id=dave_tv|mom_tv ───────────────────────────────
router.get('/', function(req, res) {
  var profile_id = req.query.profile_id;

  if (!profile_id) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id query parameter is required',
    });
  }
  if (VALID_PROFILES.indexOf(profile_id) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  var channels = _collectLiveChannels();
  var visible = channels.filter(function(ch) {
    return !ch.profile_access || ch.profile_access.indexOf(profile_id) !== -1;
  });

  return res.status(200).json({
    channels: visible,
    _note: 'TV-safe. No stream URLs. No credentials. Served by HermesTV backend.',
    _meta: {
      source: visible.length > 0 ? 'providers' : 'no-providers',
      total: visible.length,
    },
  });
});

// ── GET /api/channels/:channel_id ─────────────────────────────────────────────
router.get('/:channel_id', function(req, res) {
  var channel_id = req.params.channel_id;
  var channels = _collectLiveChannels();
  var found = null;
  for (var i = 0; i < channels.length; i++) {
    if (channels[i].channel_id === channel_id) { found = channels[i]; break; }
  }

  if (!found) {
    return res.status(404).json({
      error: 'channel_not_found',
      message: 'Channel not found',
      channel_id: channel_id,
    });
  }

  return res.status(200).json(found);
});

module.exports = router;
