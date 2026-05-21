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
 *   - The ticket expires after 5 minutes of inactivity. Active playback
 *     slides that window forward, capped by an absolute max lifetime.
 */

const { Router } = require('express');
const router = Router();
const streamResolver = require('../lib/streamResolver');
const m3uClient = require('../lib/m3uClient');
const iptvOrg = require('../lib/iptvOrg');
const hlsProxy = require('../lib/hlsProxy');
const catalogMerge = require('../lib/catalogMerge');
const streamProbe = require('../lib/streamProbe');
const xtreamClient = require('../lib/xtreamClient');
const profileIds = require('../lib/profileIds');

const TICKET_IDLE_TTL_MS = 5 * 60 * 1000;
const TICKET_MAX_TTL_MS = 12 * 60 * 60 * 1000;

// In-memory ticket store. A real implementation would use Redis or a signed
// JWT; for the surface-area-first version this is fine. Tickets self-clean
// on read after expiry.
var tickets = {};

function _nowMs() {
  return Date.now();
}

function _isTicketExpired(entry) {
  if (!entry) { return true; }
  var now = _nowMs();
  if (entry.max_expires_at && now > entry.max_expires_at) { return true; }
  return now > entry.expires_at;
}

function _touchTicket(entry) {
  if (!entry) { return; }
  var now = _nowMs();
  var max = entry.max_expires_at || (now + TICKET_IDLE_TTL_MS);
  var next = now + TICKET_IDLE_TTL_MS;
  if (next > max) { next = max; }
  if (!entry.expires_at || next > entry.expires_at) {
    entry.expires_at = next;
    if (entry.ticket) {
      entry.ticket.expires_at = new Date(next).toISOString();
    }
  }
}

function _makeTicketId() {
  return 'play-' + _nowMs().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// Resolve a HermesTV item by ID across all enabled catalog sources.
// ID prefixes:
//   "m3u-<provider>-..."         → m3uClient cache (operator-pasted M3U)
//   "iptv-..."                   → iptv-org public catalog
// W17-PURGE: the seed catalog lookup is gone with seedCatalog.js. /api/catalog
// should have been called before /api/play on any normal user journey so the
// per-provider caches are primed; cold-cache requests get 404 honestly.
// We also try the merged-catalog snapshot so any item the user clicks on
// inside /api/catalog (which may carry the merged id) resolves cleanly.
function _findItem(itemId) {
  if (typeof itemId !== 'string') { return null; }
  if (itemId.indexOf('m3u-') === 0) {
    var m3uItem = m3uClient.getCachedItemById(itemId);
    if (m3uItem) { return m3uItem; }
  } else if (itemId.indexOf('iptv-') === 0) {
    var orgItem = iptvOrg.getCachedItemById(itemId);
    if (orgItem) { return orgItem; }
  }
  // Last resort: scan the merged-catalog snapshot. catalogMerge re-emits
  // items with possibly-different ids than the original provider IDs; this
  // catches clicks on the merged-canonical id.
  try {
    var snap = catalogMerge.getLastMerged && catalogMerge.getLastMerged();
    if (Array.isArray(snap)) {
      for (var i = 0; i < snap.length; i++) {
        if (snap[i] && snap[i].id === itemId) { return snap[i]; }
      }
    }
  } catch (_) {}
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
// is *purely cosmetic* on the server — the actual bytes come from this same
// endpoint — but it makes the front end pick hls.js instead of trying to hand
// a manifest to the browser's progressive video path.
//
// Best-effort: peeks at the same resolver play-time path uses. If it
// can't resolve (cold cache, missing item), returns '' — the bare
// `/api/play/:ticket/stream` endpoint still works for fallback paths.
function _streamExtFor(itemId) {
  if (typeof itemId !== 'string' || itemId.length === 0) { return ''; }
  try {
    var resolved = streamResolver.resolveStreamUrl(itemId);
    if (!resolved || !resolved.url) { return ''; }
    var lower = String(resolved.url).toLowerCase();
    if (lower.indexOf('.m3u8') !== -1) { return '.m3u8'; }
    if (lower.indexOf('.mpd') !== -1)  { return '.mpd'; }
  } catch (_) { /* fall through to bare endpoint */ }
  return '';
}

function _looksLikeHlsManifest(url) {
  if (typeof url !== 'string') { return false; }
  var lower = url.toLowerCase();
  return lower.indexOf('.m3u8') !== -1 ||
    lower.indexOf('type=m3u') !== -1 ||
    lower.indexOf('output=m3u8') !== -1;
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

function _episodeItemIdForPlay(item, episodeItemId) {
  if (!item || item.type !== 'series') { return null; }
  if (typeof episodeItemId !== 'string' || episodeItemId.length === 0) { return null; }
  if (episodeItemId.indexOf('xtream-') === 0) {
    var storeSeries = /^xtream-(prov-[a-f0-9]+)-series-/.exec(item.id);
    if (storeSeries) {
      return episodeItemId.indexOf('xtream-' + storeSeries[1] + '-series-') === 0 ? episodeItemId : null;
    }
    if (item.id.indexOf('xtream-series-') === 0) {
      return episodeItemId.indexOf('xtream-series-') === 0 ? episodeItemId : null;
    }
    return null;
  }
  return xtreamClient.internal.episodeItemIdForSeries(item.id, episodeItemId);
}

async function _defaultEpisodeItemIdForPlay(item) {
  if (!item || item.type !== 'series' || typeof item.id !== 'string') { return null; }
  if (item.id.indexOf('xtream-') !== 0) { return null; }
  var episodes = await xtreamClient.getSeriesEpisodesForItemId(item.id);
  if (!Array.isArray(episodes) || episodes.length === 0) { return null; }
  for (var i = 0; i < episodes.length; i++) {
    if (episodes[i] && typeof episodes[i].play_item_id === 'string' && episodes[i].play_item_id.length > 0) {
      return episodes[i].play_item_id;
    }
  }
  return null;
}

/**
 * POST /api/play
 * Body: { item_id, profile_id, provider_id? }
 * Response: ticket envelope (no stream URL).
 */
router.post('/api/play', async (req, res) => {
  const body = req.body || {};
  const itemId = body.item_id;
  const profileId = body.profile_id;
  const requestedProviderId = body.provider_id;
  const requestedEpisodeItemId = body.episode_item_id || body.episode_id || null;

  if (!itemId || typeof itemId !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'item_id is required.' });
  }
  if (!profileIds.isValidProfileId(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: profileIds.profileValidationMessage(),
    });
  }

  const item = _findItem(itemId);
  if (!item) {
    return res.status(404).json({ error: 'item_not_found', item_id: itemId });
  }

  // Wave-13: build the full sources[] array up-front so the stream
  // endpoint can walk providers in order and auto-fall-through.
  var sources = _buildSourcesForItem(item, requestedProviderId);
  var episodeItemId = _episodeItemIdForPlay(item, requestedEpisodeItemId);

  if (requestedEpisodeItemId && !episodeItemId) {
    return res.status(400).json({
      error: 'invalid_episode_item',
      message: 'episode_item_id is only valid for playable provider-backed series episodes.',
    });
  }

  if (!requestedEpisodeItemId && item.type === 'series') {
    try {
      episodeItemId = await _defaultEpisodeItemIdForPlay(item);
    } catch (errEpisode) {
      console.warn('[play] series episode metadata fetch failed: ' + (errEpisode && errEpisode.message ? errEpisode.message : 'unknown'));
      episodeItemId = null;
    }
    if (!episodeItemId) {
      return res.status(503).json({
        error: 'episode_metadata_unavailable',
        message: 'This provider did not return playable episode metadata for the selected series.',
        item_id: item.id,
      });
    }
  }

  if (episodeItemId) {
    sources = sources.map(function(s) {
      var next = Object.assign({}, s);
      next.item_id = episodeItemId;
      return next;
    });
  }

  if (sources.length === 0) {
    return res.status(503).json({
      status: 'stream_temporarily_unavailable',
      error: 'no_provider_configured',
      message: 'No source is currently available for this item. We will try again automatically.',
      retry_after_seconds: 30,
      providers_attempted: [],
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
  const now = _nowMs();
  const ticket = {
    ticket: ticketId,
    item: {
      id: item.id,
      title: item.title,
      type: item.type,
      episode_item_id: episodeItemId || null,
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
    expires_at: new Date(now + TICKET_IDLE_TTL_MS).toISOString(),
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
    expires_at: now + TICKET_IDLE_TTL_MS,
    max_expires_at: now + TICKET_MAX_TTL_MS,
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
 * Wave-15 auto-fallback resolution path (best-effort, never throws):
 *   1. Look up the ticket; 404/410 on miss/expired.
 *   2. Walk the ticket's internal.sources[] array IN ORDER (skipping past
 *      `?source_index=N` if the caller pinned a specific index).
 *   3. For each source:
 *      a. Ask lib/streamResolver for the upstream URL. Unresolved = advance.
 *      b. HLS manifest? Try the in-API HLS proxy fetch (wave-11). On
 *         fetch failure (timeout, 502, 504) → record provider failure, log
 *         "[play] source N failed: ... advancing to N+1", advance to next.
 *      c. Clean public non-HLS URL? 302 the client — assumed playable.
 *   4. If a proxy fetch SUCCEEDS we record the provider as healthy + serve
 *      the rewritten body. First success wins. Update
 *      ticket.internal.current_source_index.
 *   5. If ALL sources fail → 503 with the friendly
 *      `stream_temporarily_unavailable` envelope so the client can
 *      auto-retry instead of telling the user "Operator must wire
 *      credentials".
 *
 * `?source_index=N` lets the player UI pin a specific server when the
 * user picks one from the picker. Index is clamped to [0, sources.length).
 *
 * NOTE: The walker is bounded by sourceList.length — we will never make
 * more than that many proxy-fetch attempts per ticket request.
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
  if (_isTicketExpired(t)) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired', message: 'Re-request /api/play to get a fresh ticket.' });
  }
  _touchTicket(t);

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

  // Track per-attempt failures so the final 503 (if any) can tell the
  // client which providers were tried.
  var failures = [];
  var providersAttempted = [];

  // Helper: find this source's ORIGINAL index inside internal.sources so
  // /sources diagnostics stay consistent with the index the client saw
  // on the initial /api/play response.
  function _originalIndex(src) {
    for (var oi = 0; oi < internal.sources.length; oi++) {
      if (internal.sources[oi] === src) { return oi; }
    }
    return -1;
  }

  // Walk asynchronously so we can await the hlsProxy.proxyPlaylist fetch
  // on credential-bearing sources and continue to the next source on
  // failure. Returns a promise that resolves when the response has been
  // sent (or when we give up after exhausting the source list).
  function _tryNext(i) {
    if (i >= sourceList.length) {
      // All sources exhausted — return the friendly 503.
      return res.status(503).json({
        status: 'stream_temporarily_unavailable',
        message: 'All upstream sources are temporarily unreachable. We will try again automatically.',
        ticket: req.params.ticket,
        sources_tried: providersAttempted.length || failures.length,
        retry_after_seconds: 30,
        providers_attempted: providersAttempted,
        failures: failures,
      });
    }

    var src = sourceList[i];
    var sid = src && src.item_id;
    var providerId = (src && src.provider_id) || 'unknown';

    if (typeof sid !== 'string' || sid.length === 0) {
      failures.push({ provider_id: providerId, reason: 'no_item_id' });
      console.log('[play] source ' + i + ' (' + providerId + ') failed: no_item_id, advancing to source ' + (i + 1));
      return _tryNext(i + 1);
    }

    var resolved;
    try { resolved = streamResolver.resolveStreamUrl(sid); }
    catch (errResolve) {
      failures.push({ provider_id: providerId, reason: 'resolver_threw' });
      console.log('[play] source ' + i + ' (' + providerId + ') failed: resolver_threw, advancing to source ' + (i + 1));
      return _tryNext(i + 1);
    }

    if (!resolved || !resolved.url) {
      failures.push({ provider_id: providerId, reason: 'unresolved' });
      console.log('[play] source ' + i + ' (' + providerId + ') failed: unresolved, advancing to source ' + (i + 1));
      return _tryNext(i + 1);
    }

    // We're attempting this provider. Record it so the final 503 (if any)
    // can list the providers actually tried (vs. ones we skipped because
    // they had no item_id).
    if (providersAttempted.indexOf(providerId) === -1) {
      providersAttempted.push(providerId);
    }

    var pickedIndex = _originalIndex(src);

    // Expose the active provider in a non-credential header so the player
    // UI can update its "Now playing from xTremeHD" badge without a
    // second request. Safe to set repeatedly per attempt — the LAST one
    // that actually starts sending bytes wins.
    if (src.provider_id) {
      try { res.setHeader('X-Provider-Used', String(src.provider_id)); }
      catch (_) { /* setHeader after writeHead — ignore */ }
    }

    if (_looksLikeHlsManifest(resolved.url)) {
      // In-API HLS proxy path (wave-11). Fetch the upstream playlist
      // server-side, rewrite every segment URL to /api/proxy/<ticket>/seg/<b64>,
      // and serve the rewritten body. Credential-bearing streams need this to
      // avoid leaks; public iptv-org streams need it because desktop Chrome,
      // Cloudflare, and Tizen can all fail on cross-origin HLS manifest/segment
      // redirects. Native HLS players and hls.js both accept this manifest body
      // verbatim.
      return hlsProxy.proxyPlaylist({
        upstreamUrl: resolved.url,
        ticket: req.params.ticket,
      })
        .then(function(rewritten) {
          // Mark this provider as healthy for the rolling window so
          // catalogMerge's health-aware ordering knows it's fine.
          try { streamProbe.recordProviderOutcome(providerId, true); }
          catch (_) { /* probe lib unavailable — non-fatal */ }
          if (pickedIndex >= 0 && t.internal) { t.internal.current_source_index = pickedIndex; }
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.setHeader('Cache-Control', 'no-store');
          res.status(200).send(rewritten);
        })
        .catch(function(err) {
          var sanLog = require('../lib/sanitizeLog').sanitizeForLog;
          var msg = (err && err.message) ? err.message : 'unknown';
          // Record failure so future merges deprioritize this provider.
          try { streamProbe.recordProviderOutcome(providerId, false); }
          catch (_) { /* */ }
          failures.push({
            provider_id: providerId,
            reason: 'upstream_fetch_failed',
            detail: sanLog(msg),
          });
          console.log('[play] source ' + i + ' (' + providerId + ') failed: ' + sanLog(msg) + ', advancing to source ' + (i + 1));
          // Headers may have been set on the response object but no body
          // has been sent yet — Express still allows status() + json()
          // until we actually start streaming. We never start streaming
          // on the failure path of proxyPlaylist, so the next attempt
          // (or final 503) is safe.
          return _tryNext(i + 1);
        });
    }

    if (resolved.credential_bearing) {
      return hlsProxy.proxyDirectStream({
        upstreamUrl: resolved.url,
        ticket: req.params.ticket,
        req: req,
        res: res,
        deferErrors: true,
      })
        .then(function() {
          try { streamProbe.recordProviderOutcome(providerId, true); }
          catch (_) { /* probe lib unavailable — non-fatal */ }
          if (pickedIndex >= 0 && t.internal) { t.internal.current_source_index = pickedIndex; }
        })
        .catch(function(err) {
          var sanLogDirect = require('../lib/sanitizeLog').sanitizeForLog;
          var msgDirect = (err && err.message) ? err.message : 'unknown';
          try { streamProbe.recordProviderOutcome(providerId, false); }
          catch (_) { /* */ }
          failures.push({
            provider_id: providerId,
            reason: 'direct_stream_failed',
            detail: sanLogDirect(msgDirect),
          });
          console.log('[play] source ' + i + ' (' + providerId + ') failed: ' + sanLogDirect(msgDirect) + ', advancing to source ' + (i + 1));
          if (!res.headersSent) { return _tryNext(i + 1); }
          return null;
        });
    }

    // Clean public URL — 302 to the upstream CDN. We treat this as a
    // success at the API layer (the upstream redirect target's own
    // reachability is the browser's problem after this point).
    try { streamProbe.recordProviderOutcome(providerId, true); }
    catch (_) { /* */ }
    if (pickedIndex >= 0 && t.internal) { t.internal.current_source_index = pickedIndex; }
    return res.redirect(302, resolved.url);
  }

  return _tryNext(0);
}

var STREAM_ROUTE_RE = /^\/api\/play\/([^\/]+)\/stream(?:\.m3u8|\.mpd)?$/;
router.head(STREAM_ROUTE_RE, _streamHandler);
router.get(STREAM_ROUTE_RE, _streamHandler);

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
  if (_isTicketExpired(t)) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired' });
  }
  _touchTicket(t);

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
 * gated by the active playback inactivity window, so copied segment URLs
 * die shortly after playback stops.
 */
router.get('/api/proxy/:ticket/seg/:b64', (req, res) => {
  const t = tickets[req.params.ticket];
  if (!t) {
    return res.status(404).json({ error: 'ticket_not_found' });
  }
  if (_isTicketExpired(t)) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired' });
  }
  _touchTicket(t);
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
  if (_isTicketExpired(t)) {
    delete tickets[req.params.ticket];
    return res.status(410).json({ error: 'ticket_expired' });
  }
  return res.status(200).json(t.ticket);
});

module.exports = router;
