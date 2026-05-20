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
const catalogMerge = require('../lib/catalogMerge');

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

// Wave-13: build the ordered sources[] array for a clicked item, using
// the latest catalog merge if available. Falls back to the legacy
// providers[] shape so a /api/play that arrives before /api/catalog has
// ever run still gets at least one source to try.
//
// Returns an array of { provider_id, item_id, source_id, resolution,
// source_health, is_seed_placeholder } in priority order.
function _buildSourcesForItem(item, requestedProviderId) {
  // Prefer the merged catalog's authoritative sources list (it knows
  // about cross-provider duplicates).
  var merged = null;
  try { merged = catalogMerge.getSourcesForItemId(item && item.id); }
  catch (_) { merged = null; }
  var sources = Array.isArray(merged) && merged.length > 0
    ? merged.slice()
    : null;

  // Fall back: derive a single-source array from the item's legacy shape.
  if (!sources) {
    var legacyProviders = Array.isArray(item && item.providers) ? item.providers : [];
    if (legacyProviders.length === 0) { return []; }
    sources = legacyProviders.map(function(p) {
      return {
        provider_id: p.provider_id,
        item_id: item.id,         // same id for every legacy provider variant
        source_id: p.source_id || null,
        resolution: (item.metadata && item.metadata.resolution) || item.quality || null,
        source_health: p.source_health || { status: 'unknown' },
        is_seed_placeholder: false,
      };
    });
  }

  // Apply provider_id override: if the caller asked for a specific
  // provider, move that source to the front (don't drop the others —
  // they remain as fallback candidates).
  if (requestedProviderId) {
    var hoisted = null;
    var rest = [];
    for (var i = 0; i < sources.length; i++) {
      if (!hoisted && sources[i].provider_id === requestedProviderId) {
        hoisted = sources[i];
      } else {
        rest.push(sources[i]);
      }
    }
    if (hoisted) { sources = [hoisted].concat(rest); }
  }

  return sources;
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

  // Wave-13: build the full sources[] array up-front so the stream
  // endpoint can walk providers in order and auto-fall-through.
  var sources = _buildSourcesForItem(item, requestedProviderId);

  if (sources.length === 0) {
    return res.status(503).json({
      error: 'no_provider_configured',
      message: 'No provider serves this item. Operator must wire credentials per docs/41_OPERATOR_CREDENTIALS_RUNBOOK.md',
    });
  }

  // If the caller asked for a specific provider but it isn't in the
  // sources list, surface the same 400 the legacy path did — but tell
  // them which providers ARE available (now from sources[], so the merged
  // entries are visible).
  if (requestedProviderId && sources[0].provider_id !== requestedProviderId) {
    return res.status(400).json({
      error: 'provider_not_available',
      message: 'Item is not served by provider_id=' + requestedProviderId,
      available_providers: sources.map(function(s) { return s.provider_id; }),
    });
  }

  var primarySource = sources[0];

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
      provider_id: primarySource.provider_id,
      display_name: _providerDisplayName(primarySource.provider_id),
      source_health: primarySource.source_health || { status: 'unknown' },
    },
    // Wave-13: surface the full source list on the ticket so the player UI
    // can render a "Server X of Y" picker. Each entry is the client-safe
    // view (no upstream URL, no creds).
    sources: sources.map(function(s, idx) {
      return {
        index: idx,
        provider_id: s.provider_id,
        label: _providerDisplayName(s.provider_id),
        resolution: s.resolution || null,
        source_health: s.source_health || { status: 'unknown' },
        is_seed_placeholder: !!s.is_seed_placeholder,
      };
    }),
    profile_id: profileId,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + TICKET_TTL_MS).toISOString(),
    stream_endpoint: '/api/play/' + ticketId + '/stream',
    sources_endpoint: '/api/play/' + ticketId + '/sources',
    _note: 'Stream URL is never returned to client. Call stream_endpoint to begin playback.',
  };

  // Append .m3u8 / .mpd suffix to the stream_endpoint when the upstream is
  // a public HLS / DASH manifest. The front-end PlayerModal probes the
  // URL string for these extensions to decide whether to engage hls.js or
  // wire a native <video src> — without the suffix, the proxy URL ends in
  // ".../stream", PlayerModal picks the native path, and Chrome cannot
  // play HLS natively → black screen + "playback don't work".
  //
  // The hint is computed against the PRIMARY source's id — if the primary
  // resolves to HLS the player wires hls.js. On auto-fallback to a DASH
  // source the player engine handles the mismatch (it always re-reads the
  // Content-Type of the actual response).
  var ext = _streamExtFor(primarySource.item_id || item.id);
  if (ext) {
    ticket.stream_endpoint = ticket.stream_endpoint + ext;
  }

  // Persist the internal source list (with item_id resolvers) alongside
  // the client-safe ticket so /stream can walk them. `internal` is NEVER
  // returned to the client.
  tickets[ticketId] = {
    ticket: ticket,
    expires_at: now + TICKET_TTL_MS,
    internal: {
      sources: sources,           // full list with item_id for resolver
      current_source_index: 0,    // updated as fallback walks the list
    },
  };
  return res.status(200).json(ticket);
});

/**
 * GET /api/play/:ticket/stream(?source_index=N)
 *
 * Wave-13 auto-fallback resolution path (best-effort, never throws):
 *   1. Look up the ticket; 404/410 on miss/expired.
 *   2. Walk the ticket's internal.sources[] array IN ORDER (skipping past
 *      `?source_index=N` if the caller pinned a specific index). For each
 *      source ask lib/streamResolver for the upstream URL.
 *      - First success wins. Update ticket.internal.current_source_index.
 *      - Credential-bearing URLs go through the in-API HLS proxy.
 *      - Clean public URLs 302 to the upstream CDN.
 *   3. If ALL sources fail to resolve → 503 with the failure list so the
 *      operator can debug which provider broke.
 *
 * `?source_index=N` lets the player UI pin a specific server when the
 * user picks one from the picker. Index is clamped to [0, sources.length).
 */
// The :ticket param matches the bare ticket id; the optional trailing
// `.m3u8` / `.mpd` suffix on the path is captured by the wildcard so the
// front-end's hls.js probe (urlLooksHls) lights up. Server logic is
// identical regardless of suffix — it always 302s to the same upstream.
function _streamHandler(req, res) {
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

  // Build the candidate walk order. Default: every source in priority
  // order. If `?source_index=N` is set, hoist that index to front;
  // remaining sources still trail as fallbacks (we never strand a player
  // on a single broken source if a working alternate is one HTTP away).
  var internal = t.internal || { sources: [] };
  var sourceList = Array.isArray(internal.sources) ? internal.sources.slice() : [];
  // Legacy ticket (built before this code shipped) — degrade gracefully
  // by synthesising a single source from the ticket's primary provider.
  if (sourceList.length === 0 && t.ticket.item && t.ticket.item.id) {
    sourceList = [{
      provider_id: (t.ticket.provider && t.ticket.provider.provider_id) || 'unknown',
      item_id: t.ticket.item.id,
      source_id: null,
      resolution: t.ticket.item.resolution || null,
      source_health: (t.ticket.provider && t.ticket.provider.source_health) || { status: 'unknown' },
      is_seed_placeholder: false,
    }];
  }

  var pinnedIdx = -1;
  if (typeof req.query.source_index === 'string' && /^\d+$/.test(req.query.source_index)) {
    var n = parseInt(req.query.source_index, 10);
    if (n >= 0 && n < sourceList.length) {
      pinnedIdx = n;
    }
  }
  if (pinnedIdx > 0) {
    var hoisted = sourceList[pinnedIdx];
    sourceList = [hoisted].concat(sourceList.slice(0, pinnedIdx)).concat(sourceList.slice(pinnedIdx + 1));
  }

  // Walk the list. The first source whose resolver returns a non-null
  // URL wins. Track every failure so we can surface them on total miss.
  var failures = [];
  var picked = null;
  var pickedIndex = -1;
  for (var i = 0; i < sourceList.length; i++) {
    var src = sourceList[i];
    var sid = src && src.item_id;
    if (typeof sid !== 'string' || sid.length === 0) {
      failures.push({ provider_id: src && src.provider_id, reason: 'no_item_id' });
      continue;
    }
    var resolved;
    try { resolved = streamResolver.resolveStreamUrl(sid); }
    catch (errResolve) {
      failures.push({ provider_id: src.provider_id, reason: 'resolver_threw' });
      continue;
    }
    if (!resolved || !resolved.url) {
      failures.push({ provider_id: src.provider_id, reason: 'unresolved' });
      continue;
    }
    picked = { source: src, resolved: resolved };
    // Map back to the ORIGINAL index in t.internal.sources for the
    // current_source_index field (so /sources sees the same numbering
    // the client first received).
    for (var oi = 0; oi < internal.sources.length; oi++) {
      if (internal.sources[oi] === src) { pickedIndex = oi; break; }
    }
    break;
  }

  if (!picked) {
    return res.status(503).json({
      status: 'stream_unresolved',
      message: 'Could not resolve any stream source for this item. Operator must wire credentials per docs/41_OPERATOR_CREDENTIALS_RUNBOOK.md.',
      ticket: req.params.ticket,
      provider: t.ticket.provider,
      item: t.ticket.item,
      attempted_sources: failures.length,
      failures: failures,
    });
  }

  // Remember which source served this play for /sources diagnostics.
  if (pickedIndex >= 0 && t.internal) { t.internal.current_source_index = pickedIndex; }

  // Expose the active provider in a non-credential header so the player
  // UI can update its "Now playing from xTremeHD" badge without a
  // second request. Header is server-controlled, not user-supplied —
  // safe to set even though credentialGuard wraps res.json only.
  if (picked.source.provider_id) {
    try { res.setHeader('X-Provider-Used', String(picked.source.provider_id)); }
    catch (_) { /* setHeader after writeHead — ignore */ }
  }

  if (picked.resolved.credential_bearing) {
    // In-API HLS proxy path (wave-11). Fetch the upstream playlist
    // server-side, rewrite every segment URL to /api/proxy/<ticket>/seg/<b64>,
    // and serve the rewritten body. The credential never reaches the client.
    // We do NOT 302 here — that would put the credentialed URL into the
    // Location header. Native HLS players (Safari, Tizen) and hls.js both
    // accept this manifest body verbatim.
    return hlsProxy.proxyPlaylist({
      upstreamUrl: picked.resolved.url,
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
          provider_used: picked.source.provider_id,
        });
      });
  }

  // Clean public URL — safe to redirect. credentialGuard middleware
  // is wrapping res.json only; Location-header redirects are
  // separately covered by the credential-bearing check above.
  return res.redirect(302, picked.resolved.url);
}

router.get(/^\/api\/play\/([^\/]+)\/stream(?:\.m3u8|\.mpd)?$/, _streamHandler);

/**
 * GET /api/play/:ticket/sources
 *
 * Returns the list of available sources for a ticket so the player UI can
 * render a "Server X of Y" picker. Updated current_source_index reflects
 * the source that won the most recent /stream resolve (or 0 if no /stream
 * call has landed yet).
 */
router.get('/api/play/:ticket/sources', (req, res) => {
  const t = tickets[req.params.ticket];
  if (!t) {
    return res.status(404).json({ error: 'ticket_not_found' });
  }
  if (Date.now() > t.expires_at) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired' });
  }

  var internal = t.internal || { sources: [], current_source_index: 0 };
  var sources = Array.isArray(internal.sources) ? internal.sources : [];
  var currentIdx = typeof internal.current_source_index === 'number' ? internal.current_source_index : 0;

  return res.status(200).json({
    ticket: req.params.ticket,
    current_source_index: currentIdx,
    sources: sources.map(function(s, idx) {
      var status = 'available';
      if (idx === currentIdx) { status = 'active'; }
      else if (idx < currentIdx) { status = 'failed'; }   // walked past on auto-fallback
      return {
        index: idx,
        provider_id: s.provider_id,
        label: _providerDisplayName(s.provider_id),
        resolution: s.resolution || null,
        status: status,
        source_health: s.source_health || { status: 'unknown' },
        is_seed_placeholder: !!s.is_seed_placeholder,
      };
    }),
  });
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
