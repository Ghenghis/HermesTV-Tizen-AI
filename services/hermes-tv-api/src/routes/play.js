'use strict';

/**
 * routes/play.js — TV-safe play-ticket endpoint.
 *
 * Mom (Sherri) clicks ▶ Watch in the MediaDetailPanel → frontend POSTs to
 * /api/play with { item_id, profile_id, provider_id? } → we look up the
 * item in the seed catalog (later: jellyfin / iptv-org / threadfin
 * adapters) and respond with a ticket the player surface can present.
 *
 * SECURITY CONTRACT
 *   - The raw stream URL is NEVER returned to the client. The ticket
 *     contains item metadata + provider metadata + a `stream_endpoint`
 *     pointer to GET /api/play/:ticket/stream. The actual streaming
 *     proxy is operator-side (Threadfin / Jellyfin / iptv-org) and
 *     lands in Phase 4.
 *   - The ticket expires in 5 minutes — bounded blast radius.
 */

const { Router } = require('express');
const router = Router();
const { SEED_CATALOG } = require('../data/seedCatalog');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const TICKET_TTL_MS = 5 * 60 * 1000;

// In-memory ticket store. A real implementation would use Redis or a signed
// JWT; for the surface-area-first version this is fine. Tickets self-clean
// on read after expiry.
var tickets = {};

function _makeTicketId() {
  return 'play-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function _findItem(itemId) {
  for (var i = 0; i < SEED_CATALOG.length; i++) {
    if (SEED_CATALOG[i].id === itemId) { return SEED_CATALOG[i]; }
  }
  return null;
}

function _providerDisplayName(pid) {
  if (pid === 'apollo_group') { return 'Apollo Group'; }
  if (pid === 'xtremehd') { return 'xTremeHD'; }
  if (pid === 'iptv-org') { return 'iptv-org (Free)'; }
  if (pid === 'jellyfin') { return 'Jellyfin'; }
  return pid || 'unknown';
}

/**
 * POST /api/play
 * Body: { item_id, profile_id, provider_id? }
 * Response: ticket envelope (no stream URL).
 */
router.post('/api/play', (req, res) => {
  const body = req.body || {};
  const itemId = body.item_id;
  const profileId = body.profile_id;
  const requestedProviderId = body.provider_id;

  if (!itemId || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'item_id is required.' });
  }
  if (VALID_PROFILES.indexOf(profileId) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  const item = _findItem(itemId);
  if (!item) {
    return res.status(404).json({ error: 'item_not_found', item_id: itemId });
  }

  // Pick provider: client-requested if listed, else first available.
  const providers = Array.isArray(item.providers) ? item.providers : [];
  let provider = null;
  if (requestedProviderId) {
    for (let i = 0; i < providers.length; i++) {
      if (providers[i].provider_id === requestedProviderId) { provider = providers[i]; break; }
    }
    if (!provider) {
      return res.status(400).json({
        error: 'provider_not_available',
        message: 'Item is not served by provider_id=' + requestedProviderId,
        available_providers: providers.map(function(p) { return p.provider_id; }),
      });
    }
  } else {
    provider = providers[0] || null;
  }

  if (!provider) {
    return res.status(503).json({
      error: 'no_provider_configured',
      message: 'No provider serves this item. Operator must wire credentials per docs/41_OPERATOR_CREDENTIALS_RUNBOOK.md',
    });
  }

  // Build ticket. Strip any internal source_id detail that doesn't belong
  // on a client response — keep provider_id + display name + health only.
  const ticketId = _makeTicketId();
  const now = Date.now();
  const ticket = {
    ticket: ticketId,
    item: {
      id: item.id,
      title: item.title,
      type: item.type,
      resolution: (item.metadata && item.metadata.resolution) || item.quality || null,
      hdr_format: (item.metadata && item.metadata.hdr_format) || null,
      category: item.category || null,
    },
    provider: {
      provider_id: provider.provider_id,
      display_name: _providerDisplayName(provider.provider_id),
      source_health: provider.source_health || { status: 'unknown' },
    },
    profile_id: profileId,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + TICKET_TTL_MS).toISOString(),
    stream_endpoint: '/api/play/' + ticketId + '/stream',
    _note: 'Stream URL is never returned to client. Call stream_endpoint to begin playback.',
  };

  tickets[ticketId] = { ticket: ticket, expires_at: now + TICKET_TTL_MS };
  return res.status(200).json(ticket);
});

/**
 * GET /api/play/:ticket/stream
 * For now returns 503 — the actual streaming proxy lands in Phase 4 when
 * Threadfin / Jellyfin URL resolution is wired through the play-time
 * resolver. The surface exists so the frontend PlayerModal can wire to it.
 */
router.get('/api/play/:ticket/stream', (req, res) => {
  const t = tickets[req.params.ticket];
  if (!t) {
    return res.status(404).json({ error: 'ticket_not_found', message: 'Ticket expired or invalid.' });
  }
  if (Date.now() > t.expires_at) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired', message: 'Re-request /api/play to get a fresh ticket.' });
  }
  return res.status(503).json({
    status: 'player_pipeline_not_implemented',
    message: 'Server-side stream proxy lands in Phase 4 (Threadfin / Jellyfin URL resolution). The ticket is valid; the actual byte stream is pending operator wiring.',
    ticket: req.params.ticket,
    provider: t.ticket.provider,
    item: t.ticket.item,
    expires_at: t.ticket.expires_at,
  });
});

/**
 * GET /api/play/:ticket — JSON-only ticket inspection (debug, no stream).
 */
router.get('/api/play/:ticket', (req, res) => {
  const t = tickets[req.params.ticket];
  if (!t) {
    return res.status(404).json({ error: 'ticket_not_found' });
  }
  if (Date.now() > t.expires_at) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired' });
  }
  return res.status(200).json(t.ticket);
});

module.exports = router;
