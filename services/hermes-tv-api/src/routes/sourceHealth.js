'use strict';

/**
 * routes/sourceHealth.js — Real source-health probe endpoint.
 *
 * GET /api/source-health/:provider_id/:item_id
 *
 * SECURITY CONTRACT
 *   - The raw stream URL is NEVER returned to the client.
 *   - Only a redacted hint (scheme + host + path, no query string) is exposed.
 *   - Providers without env-configured URLs return { reachable:false,
 *     reason:'not_configured', mock:true } so the UI can render a clear
 *     "Provider not connected" state instead of a fake number.
 *
 * BEHAVIOUR
 *   - HEAD request via lib/streamProbe.js with a 4-second timeout.
 *   - Results cached server-side for 60 s to avoid hammering providers.
 *   - Falls back gracefully whenever a provider URL template is missing.
 */

const { Router } = require('express');
const router = Router();
const streamProbe = require('../lib/streamProbe');

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
      mock: true,
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
  });
});

module.exports = router;
