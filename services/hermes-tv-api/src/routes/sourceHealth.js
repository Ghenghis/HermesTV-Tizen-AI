'use strict';

/**
 * routes/sourceHealth.js — Source-health endpoints.
 *
 *   GET /api/source-health
 *     Aggregated cross-provider roll-up. Pulls cached state from
 *     lib/iptvOrg.js, lib/m3uClient.js, and data/seedCatalog.js via
 *     lib/sourceHealthAggregator.js. No network I/O on this path —
 *     it reads whatever is already in process memory.
 *
 *   GET /api/source-health/:provider_id/:item_id
 *     Real per-item probe. HEAD-requests the upstream URL via
 *     lib/streamProbe.js with a 4-second timeout.
 *
 * SECURITY CONTRACT
 *   - The raw stream URL is NEVER returned to the client (either path).
 *   - Per-item probe exposes only a redacted hint (scheme + host + path,
 *     no query string).
 *   - Providers without configured URLs return { reachable:false,
 *     reason:'not_configured', configured:false } so the UI can render a clear
 *     "Provider not connected" state instead of a fake number.
 *
 * BEHAVIOUR
 *   - Aggregate path is in-memory only — safe to poll.
 *   - Probe path: HEAD via lib/streamProbe.js with 4-second timeout,
 *     results cached server-side for 60 s to avoid hammering providers.
 *   - Falls back gracefully whenever a provider URL template is missing.
 */

const { Router } = require('express');
const router = Router();
const streamProbe = require('../lib/streamProbe');
const sourceHealthAggregator = require('../lib/sourceHealthAggregator');

// Provider IDs accepted by this route. Mirrors VALID_PROVIDERS in catalog.js.
const VALID_PROVIDERS = ['apollo_group', 'xtremehd'];

// Environment variable name lookup for a provider's base M3U URL.
const PROVIDER_ENV_KEYS = {
  apollo_group: 'APOLLO_M3U_URL',
  xtremehd: 'XTREMEHD_M3U_URL',
};

// Basic input guards. provider_id is enum, item_id is bounded ASCII.
const ITEM_ID_PATTERN = /^[a-zA-Z0-9_\-:.]{1,128}$/;

/**
 * Resolve a streamable URL for (provider_id, item_id). Returns null when
 * the provider is not configured (no env var, or empty value).
 *
 * NOTE: This is a deliberately conservative resolver — it only emits a
 * URL when the operator has wired a real provider via env. The eventual
 * implementation would query the provider catalog by item_id and append
 * the correct path; for now we treat the env var itself as the URL to
 * probe (it is typically an M3U playlist endpoint, which still responds
 * to HEAD with a sensible status code).
 */
function resolveStreamUrl(providerId, itemId) {
  var envKey = PROVIDER_ENV_KEYS[providerId];
  if (!envKey) return null;
  var raw = process.env[envKey];
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return null;

  // If the env value contains '{item_id}' we substitute; otherwise we
  // treat the env value itself as the URL to probe (M3U playlist root).
  var trimmed = raw.trim();
  if (trimmed.indexOf('{item_id}') !== -1) {
    return trimmed.replace('{item_id}', encodeURIComponent(itemId));
  }
  return trimmed;
}

/**
 * GET /api/source-health
 *
 * Aggregated source-health roll-up across apollo_group, iptv-org, and
 * xtremehd. Read-only; never touches the network. The aggregator wraps
 * each per-provider lookup so any unexpected adapter failure degrades
 * that single provider to offline rather than failing the whole call.
 */
router.get('/api/source-health', function(req, res) {
  var payload;
  try {
    payload = sourceHealthAggregator.getSourceHealth();
  } catch (err) {
    // Defensive — aggregator is supposed to swallow its own errors, but
    // if anything escapes we degrade gracefully so the UI gets a valid
    // shape rather than a 500.
    console.error('[sourceHealth] aggregator threw unexpectedly:', err && err.message);
    var nowIso = new Date().toISOString();
    payload = {
      overall_status: 'offline',
      providers: [],
      summary: {
        total_providers: 0,
        providers_ok: 0,
        providers_degraded: 0,
        providers_offline: 0,
        computed_at_utc: nowIso,
      },
    };
  }
  return res.json(payload);
});

router.get('/api/source-health/:provider_id/:item_id', async function(req, res) {
  var providerId = req.params.provider_id;
  var itemId = req.params.item_id;
  var checkedAt = new Date().toISOString();

  // ── Input validation ────────────────────────────────────────────────
  if (VALID_PROVIDERS.indexOf(providerId) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Invalid provider_id. Valid values: ' + VALID_PROVIDERS.join(', '),
    });
  }
  if (!ITEM_ID_PATTERN.test(itemId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Invalid item_id format.',
    });
  }

  // ── Resolve URL or surface not_configured ───────────────────────────
  var streamUrl = resolveStreamUrl(providerId, itemId);
  if (!streamUrl) {
    return res.json({
      provider_id: providerId,
      item_id: itemId,
      stream_url_hint: '***redacted***',
      probe: { reachable: false, reason: 'not_configured' },
      quality: { floor: 'unknown', source: 'url_heuristic' },
      checked_at: checkedAt,
      configured: false,
    });
  }

  // ── Probe + heuristic quality ───────────────────────────────────────
  var probe;
  try {
    probe = await streamProbe.probeStream(streamUrl);
  } catch (err) {
    // Defensive — streamProbe.probeStream is supposed to swallow its own
    // errors, but if something unexpected slips through we degrade
    // gracefully instead of returning 500.
    console.error('[sourceHealth] probeStream threw unexpectedly:', err && err.message);
    probe = { reachable: false, reason: 'network', latency_ms: 0 };
  }

  var quality = streamProbe.inferQuality(probe, streamUrl);
  var hint = streamProbe.redactUrl(streamUrl);

  return res.json({
    provider_id: providerId,
    item_id: itemId,
    stream_url_hint: hint,
    probe: probe,
    quality: quality,
    checked_at: checkedAt,
    configured: true,
  });
});

module.exports = router;
