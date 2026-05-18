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
const streamResolver = require('../lib/streamResolver');
const m3uClient = require('../lib/m3uClient');
const iptvOrg = require('../lib/iptvOrg');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const TICKET_TTL_MS = 5 * 60 * 1000;

// In-memory ticket store. A real implementation would use Redis or a signed
// JWT; for the surface-area-first version this is fine. Tickets self-clean
// on read after expiry.
var tickets = {};

function _makeTicketId() {
  return 'play-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Resolve a HermesTV item by ID across all enabled catalog sources.
// ID prefixes:
//   "live-" / "vod-" / "series-" → seed catalog
//   "m3u-<provider>-..."         → m3uClient cache (operator-pasted M3U)
//   "iptv-..."                   → iptv-org public catalog
// Synchronous — relies on the per-source caches already being warm.
// /api/catalog should have been called before /api/play on any normal
// user journey, so the caches are primed; cold-cache requests get 404.
function _findItem(itemId) {
  for (var i = 0; i < SEED_CATALOG.length; i++) {
    if (SEED_CATALOG[i].id === itemId) { return SEED_CATALOG[i]; }
  }
  if (typeof itemId === 'string') {
    if (itemId.indexOf('m3u-') === 0) {
      var m3uItem = m3uClient.getCachedItemById(itemId);
      if (m3uItem) { return m3uItem; }
    } else if (itemId.indexOf('iptv-') === 0) {
      var orgItem = iptvOrg.getCachedItemById(itemId);
      if (orgItem) { return orgItem; }
    }
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
 *
 * Resolution path (best-effort, never throws):
 *   1. Look up the ticket; 404/410 on miss/expired.
 *   2. Ask lib/streamResolver for the upstream URL for this item.
 *   3. If the URL is credential-bearing (Apollo/xTremeHD style with
 *      embedded user/pass): 503 with `threadfin_proxy_required` —
 *      handing the operator a clear next step. We deliberately do not
 *      302 the client because the credential would appear in the
 *      Location header.
 *   4. If the URL is clean (iptv-org public CDN): 302 to the upstream.
 *   5. Otherwise: 503 with `stream_unresolved`.
 *
 * The "real" Threadfin proxy path lands when the operator has
 * THREADFIN_URL pointing at a tuner — at that point this route can
 * 302 to threadfin's stream endpoint instead. That layer is in the
 * Phase 4 hardening checklist.
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

  const itemId = t.ticket.item && t.ticket.item.id;
  const resolved = streamResolver.resolveStreamUrl(itemId);

  if (!resolved) {
    return res.status(503).json({
      status: 'stream_unresolved',
      message: 'Could not resolve a stream URL for this item. Operator must wire credentials per docs/41_OPERATOR_CREDENTIALS_RUNBOOK.md.',
      ticket: req.params.ticket,
      provider: t.ticket.provider,
      item: t.ticket.item,
    });
  }

  if (resolved.credential_bearing) {
    return res.status(503).json({
      status: 'threadfin_proxy_required',
      message: 'This stream URL embeds upstream credentials. Operator must set THREADFIN_URL and route playback through the Threadfin proxy before this item can be played.',
      ticket: req.params.ticket,
      provider: t.ticket.provider,
      item: t.ticket.item,
    });
  }

  // Clean public URL — safe to redirect. credentialGuard middleware
  // is wrapping res.json only; Location-header redirects are
  // separately covered by the credential-bearing check above.
  return res.redirect(302, resolved.url);
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
