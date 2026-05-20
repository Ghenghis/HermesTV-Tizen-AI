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
const hlsProxy = require('../lib/hlsProxy');

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

// Decide which extension to append to the stream_endpoint pointer so the
// client-side hls.js path detection (which probes for `.m3u8` / `.mpd` in
// the URL string) wires up the right engine. Returning an extension here
// is *purely cosmetic* on the server — the actual bytes come from the
// 302 target — but it makes the front end pick hls.js so the 302 to the
// upstream CDN is followed transparently inside the player engine.
//
// Best-effort: peeks at the same resolver play-time path uses. If it
// can't resolve (cold cache, missing item), returns '' — the bare
// `/api/play/:ticket/stream` endpoint still works for fallback paths.
function _streamExtFor(itemId) {
  if (typeof itemId !== 'string' || itemId.length === 0) { return ''; }
  try {
    var resolved = streamResolver.resolveStreamUrl(itemId);
    if (!resolved || !resolved.url) { return ''; }
    // Don't expose hint for credential-bearing streams — those land at
    // 503 anyway, never become a real stream URL the client can use.
    if (resolved.credential_bearing) { return ''; }
    var lower = String(resolved.url).toLowerCase();
    if (lower.indexOf('.m3u8') !== -1) { return '.m3u8'; }
    if (lower.indexOf('.mpd') !== -1)  { return '.mpd'; }
  } catch (_) { /* fall through to bare endpoint */ }
  return '';
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

  // Append .m3u8 / .mpd suffix to the stream_endpoint when the upstream is
  // a public HLS / DASH manifest. The front-end PlayerModal probes the
  // URL string for these extensions to decide whether to engage hls.js or
  // wire a native <video src> — without the suffix, the proxy URL ends in
  // ".../stream", PlayerModal picks the native path, and Chrome cannot
  // play HLS natively → black screen + "playback don't work".
  var ext = _streamExtFor(item.id);
  if (ext) {
    ticket.stream_endpoint = ticket.stream_endpoint + ext;
  }

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
// The :ticket param matches the bare ticket id; the optional trailing
// `.m3u8` / `.mpd` suffix on the path is captured by the wildcard so the
// front-end's hls.js probe (urlLooksHls) lights up. Server logic is
// identical regardless of suffix — it always 302s to the same upstream.
router.get(/^\/api\/play\/([^\/]+)\/stream(?:\.m3u8|\.mpd)?$/, (req, res) => {
  // Manual param mapping since this route uses a RegExp pattern.
  req.params.ticket = req.params[0];
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
    // In-API HLS proxy path (wave-11). Fetch the upstream playlist
    // server-side, rewrite every segment URL to /api/proxy/<ticket>/seg/<b64>,
    // and serve the rewritten body. The credential never reaches the client.
    // We do NOT 302 here — that would put the credentialed URL into the
    // Location header. Native HLS players (Safari, Tizen) and hls.js both
    // accept this manifest body verbatim.
    return hlsProxy.proxyPlaylist({
      upstreamUrl: resolved.url,
      ticket: req.params.ticket,
    })
      .then(function(rewritten) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(rewritten);
      })
      .catch(function(err) {
        var sanLog = require('../lib/sanitizeLog').sanitizeForLog;
        console.warn('[play] hls proxy failed ticket=' + req.params.ticket + ': ' + sanLog(err && err.message ? err.message : 'unknown'));
        res.status(502).json({
          error: 'upstream_playlist_fetch_failed',
          message: 'Could not fetch the upstream playlist for this item.',
          ticket: req.params.ticket,
          provider: t.ticket.provider,
          item: t.ticket.item,
        });
      });
  }

  // Clean public URL — safe to redirect. credentialGuard middleware
  // is wrapping res.json only; Location-header redirects are
  // separately covered by the credential-bearing check above.
  return res.redirect(302, resolved.url);
});

/**
 * GET /api/proxy/:ticket/seg/:b64
 *
 * Streams a single HLS segment (or sub-resource) through the API on
 * behalf of the client. The :b64 param is a base64url-encoded upstream
 * URL, planted in the playlist by hlsProxy.proxyPlaylist().
 *
 * Ticket validation is intentionally the same as /stream — we will not
 * proxy bytes for an expired or unknown ticket. This keeps the proxy
 * gated by the 5-minute play-ticket TTL, so even if a logged manifest
 * leaks the segment URLs are useless 5 minutes later.
 */
router.get('/api/proxy/:ticket/seg/:b64', (req, res) => {
  const t = tickets[req.params.ticket];
  if (!t) {
    return res.status(404).json({ error: 'ticket_not_found' });
  }
  if (Date.now() > t.expires_at) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired' });
  }
  return hlsProxy.streamSegment({
    res: res,
    req: req,
    b64Url: req.params.b64,
    ticket: req.params.ticket,
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
