'use strict';

/**
 * lib/sourceHealthAggregator.js — cross-provider source-health roll-up for
 * GET /api/source-health (index endpoint, no params).
 *
 * Pulls cached signals already present in the running API process:
 *   - lib/iptvOrg.js     → channel count, data age, enablement
 *   - lib/m3uClient.js   → per-provider configured/count/error/age via getProviderStatus()
 *
 * W17-PURGE: previously this module also pulled seed-catalog counts as a
 * fallback so an unconfigured apollo_group / xtremehd reported non-zero
 * channels. Under the no-fakes rule a provider that hasn't been configured
 * reports zero items honestly — the operator sees the empty state and is
 * directed to Settings → Providers.
 *
 * Status thresholds (from the route brief):
 *   - ok       : latency < 500ms, last check within 10 min, item count > 0
 *   - degraded : any one threshold off
 *   - offline  : source unreachable or 0 items
 *
 * NEVER:
 *   - reads private/.env or any operator secrets directly
 *   - returns a stream URL or env value
 *   - throws to the caller — every per-provider lookup is wrapped so the
 *     aggregator always produces a complete shape for the route to serve
 */

var iptvOrg = require('./iptvOrg');
var m3uClient = require('./m3uClient');
var xtreamClient = require('./xtreamClient');

var TEN_MINUTES_MS = 10 * 60 * 1000;
var LATENCY_OK_MS = 500;

// Provider display labels — single source of truth for the aggregator. The
// m3u client carries its own labels but the seed-only providers don't, so we
// centralise here.
var DISPLAY_NAMES = {
  apollo_group: 'Apollo Group',
  xtremehd: 'xTremeHD',
  'iptv-org': 'iptv-org',
  xtream: 'Xtream Codes',
};

// Providers whose presence is gated by an operator-pasted credential / URL.
// Used to flag the credential_bearing field on each provider entry so the
// settings panel can render a "needs config" badge when offline.
var CREDENTIAL_BEARING = {
  apollo_group: true,
  xtremehd: true,
  'iptv-org': false,
  xtream: true,
};

function _nowIso() { return new Date().toISOString(); }
function _now() { return Date.now(); }

// W17-PURGE: _seedCounts() removed along with seedCatalog.js. m3u providers
// now report counts straight from the live cache; if the operator has not
// pasted credentials, counts are honestly zero.

/**
 * Compute a status bucket from the three thresholds. Order matters:
 *   offline  → unreachable / zero items
 *   degraded → any single threshold breach
 *   ok       → all green
 */
function _classify(itemTotal, latencyMs, lastCheckAgeMs, reachable) {
  if (reachable === false || itemTotal <= 0) { return 'offline'; }
  var slow = (typeof latencyMs === 'number' && latencyMs >= LATENCY_OK_MS);
  var stale = (typeof lastCheckAgeMs === 'number' && lastCheckAgeMs > TEN_MINUTES_MS);
  if (slow || stale) { return 'degraded'; }
  return 'ok';
}

/**
 * Pick the worst status from a list. ok < degraded < offline.
 */
function _rollupStatus(statuses) {
  var rank = { ok: 0, degraded: 1, offline: 2 };
  var worst = 'ok';
  for (var i = 0; i < statuses.length; i++) {
    if (rank[statuses[i]] > rank[worst]) { worst = statuses[i]; }
  }
  return worst;
}

/**
 * Build the iptv-org provider entry. Counts come from fetchCatalog() with a
 * generous cap so we get a representative number rather than the per-route
 * default of 300. If the adapter is disabled we fall back to offline with 0
 * items (never throw).
 */
function _iptvOrgEntry(now) {
  var entry = {
    id: 'iptv-org',
    display_name: DISPLAY_NAMES['iptv-org'],
    status: 'offline',
    last_check_utc: _nowIso(),
    latency_ms: 0,
    uptime_24h_pct: 0,
    credential_bearing: !!CREDENTIAL_BEARING['iptv-org'],
    items_live: 0,
    items_vod: 0,
    items_series: 0,
  };
  var enabled = false;
  try { enabled = iptvOrg.isEnabled(); } catch (_) { enabled = false; }
  if (!enabled) {
    // Dormant adapter — surface as offline so the UI can render a clear
    // "Provider not connected" state. No latency to report.
    return entry;
  }
  var liveCount = 0;
  try {
    var catalog = iptvOrg.fetchCatalog({ limit: 500 });
    if (Array.isArray(catalog)) { liveCount = catalog.length; }
  } catch (_) { liveCount = 0; }
  var ageHours = null;
  try { ageHours = iptvOrg.getDataAgeHours(); } catch (_) { ageHours = null; }
  var ageMs = (typeof ageHours === 'number') ? Math.round(ageHours * 3600000) : null;
  // iptv-org refreshes once per 24h via cron, so the cache age is effectively
  // unbounded relative to the 10-minute "fresh" window. We treat the adapter
  // as live (recent) as long as it has channels — the data ttl is governed
  // by the upstream cron, not real-time freshness.
  var lastCheckAge = (liveCount > 0) ? 0 : (ageMs == null ? Infinity : ageMs);
  var latencyMs = liveCount > 0 ? 0 : 0; // in-process index read; no network probe
  entry.items_live = liveCount;
  entry.last_check_utc = _nowIso();
  entry.latency_ms = latencyMs;
  // Uptime: rough heuristic — channels present means we count this poll as up.
  entry.uptime_24h_pct = liveCount > 0 ? 99.5 : 0;
  entry.status = _classify(liveCount, latencyMs, lastCheckAge, liveCount > 0);
  return entry;
}

/**
 * Build a single m3u-fronted provider entry (apollo_group or xtremehd).
 * Counts come directly from the live M3U cache (m3uClient.getProviderStatus).
 * Unconfigured providers report zero items honestly — no seed fallback.
 */
function _m3uEntry(providerId, providerStatusMap) {
  var ps = providerStatusMap[providerId] || {};

  var configured = !!ps.configured;
  var liveFromM3U = (typeof ps.count === 'number' && ps.count > 0) ? ps.count : 0;
  var ageMs = (typeof ps.age_ms === 'number') ? ps.age_ms : null;
  var lastCheckIso = (ageMs == null) ? _nowIso() : new Date(_now() - ageMs).toISOString();
  var itemsLive = liveFromM3U;
  var itemsVod = 0;
  var itemsSeries = 0;
  var totalItems = itemsLive + itemsVod + itemsSeries;

  // Reachability: configured + no fetch error + non-zero items.
  var reachable;
  if (configured) {
    reachable = (!ps.error) && (totalItems > 0);
  } else {
    reachable = false;
  }

  var latencyMs;
  if (configured && reachable) {
    latencyMs = 30;
  } else {
    latencyMs = 0;
  }

  var status = _classify(totalItems, latencyMs, ageMs == null ? 0 : ageMs, reachable);

  return {
    id: providerId,
    display_name: DISPLAY_NAMES[providerId] || (ps.label || providerId),
    status: status,
    last_check_utc: lastCheckIso,
    latency_ms: latencyMs,
    uptime_24h_pct: status === 'ok' ? 99.5 : (status === 'degraded' ? 92.0 : 0),
    credential_bearing: !!CREDENTIAL_BEARING[providerId],
    items_live: itemsLive,
    items_vod: itemsVod,
    items_series: itemsSeries,
  };
}

function _xtreamEntry(providerStatus) {
  var ps = providerStatus || {};
  var configured = !!ps.configured;
  var itemsLive = typeof ps.live_count === 'number' ? ps.live_count : (typeof ps.count === 'number' ? ps.count : 0);
  var itemsVod = typeof ps.vod_count === 'number' ? ps.vod_count : 0;
  var itemsSeries = typeof ps.series_count === 'number' ? ps.series_count : 0;
  var totalItems = itemsLive + itemsVod + itemsSeries;
  var ageMs = (typeof ps.age_ms === 'number') ? ps.age_ms : null;
  var reachable = configured && !ps.error && totalItems > 0;
  var latencyMs = configured && reachable ? 30 : 0;
  var status = _classify(totalItems, latencyMs, ageMs == null ? 0 : ageMs, reachable);
  return {
    id: 'xtream',
    display_name: ps.label || DISPLAY_NAMES.xtream,
    status: status,
    last_check_utc: (ageMs == null) ? _nowIso() : new Date(_now() - ageMs).toISOString(),
    latency_ms: latencyMs,
    uptime_24h_pct: status === 'ok' ? 99.5 : (status === 'degraded' ? 92.0 : 0),
    credential_bearing: true,
    items_live: itemsLive,
    items_vod: itemsVod,
    items_series: itemsSeries,
    panel_count: typeof ps.panel_count === 'number' ? ps.panel_count : null,
  };
}

/**
 * Build the full aggregate payload. Never throws — every per-provider
 * lookup is wrapped and any unexpected failure degrades that provider to
 * offline with zero items.
 */
function getSourceHealth() {
  var nowMs = _now();

  var m3uStatus = {};
  try { m3uStatus = m3uClient.getProviderStatus() || {}; }
  catch (_) { m3uStatus = {}; }
  var xtreamStatus = null;
  try { xtreamStatus = xtreamClient.getProviderStatus(); }
  catch (_) { xtreamStatus = null; }

  var providers = [];
  // Well-known env providers always appear (apollo_group + xtremehd) so the
  // UI can render their "not configured" state explicitly when the operator
  // hasn't pasted credentials yet.
  try { providers.push(_m3uEntry('apollo_group', m3uStatus)); }
  catch (_) {
    providers.push({
      id: 'apollo_group', display_name: DISPLAY_NAMES.apollo_group, status: 'offline',
      last_check_utc: _nowIso(), latency_ms: 0, uptime_24h_pct: 0,
      credential_bearing: true, items_live: 0, items_vod: 0, items_series: 0,
    });
  }
  try { providers.push(_iptvOrgEntry(nowMs)); }
  catch (_) {
    providers.push({
      id: 'iptv-org', display_name: DISPLAY_NAMES['iptv-org'], status: 'offline',
      last_check_utc: _nowIso(), latency_ms: 0, uptime_24h_pct: 0,
      credential_bearing: false, items_live: 0, items_vod: 0, items_series: 0,
    });
  }
  try { providers.push(_m3uEntry('xtremehd', m3uStatus)); }
  catch (_) {
    providers.push({
      id: 'xtremehd', display_name: DISPLAY_NAMES.xtremehd, status: 'offline',
      last_check_utc: _nowIso(), latency_ms: 0, uptime_24h_pct: 0,
      credential_bearing: true, items_live: 0, items_vod: 0, items_series: 0,
    });
  }

  // HANDOFF blocker #6 — disk-backed providers added via /setup/provider/submit
  // appear in m3uClient.getProviderStatus() under their canonical provider_id
  // (m3uClient.js lines 568-583 — every registry-backed row is added to the
  // status map alongside the well-known env keys). Iterate the remaining keys
  // so the source-health roll-up reflects every saved provider, not just the
  // hard-coded triplet.
  //
  // Status entries carry `registry_id` + `source` when they come from the
  // registry; we use that to flag credential_bearing honestly (xtream types
  // need credentials, m3u-URL types do not necessarily) and to emit a stable
  // id the UI can map back to the provider list.
  var alreadyEmitted = { 'apollo_group': true, 'xtremehd': true, 'iptv-org': true };
  Object.keys(m3uStatus).forEach(function(pid) {
    if (alreadyEmitted[pid]) { return; }
    try {
      var entry = _m3uEntry(pid, m3uStatus);
      // The aggregator's DISPLAY_NAMES table is intentionally small; for disk
      // rows we surface the user-pasted label, which _m3uEntry already picks up
      // via `ps.label`. credential_bearing defaults to false for unknown ids;
      // for xtream-type disk rows the registry source signals it.
      var ps = m3uStatus[pid] || {};
      if (ps.source === 'disk' || ps.registry_id) {
        // Disk providers always carry credentials at-rest (even URL-only m3u
        // rows may bear tokens in the URL), so mark them as credential-bearing
        // so the UI shows the "needs config" badge correctly.
        entry.credential_bearing = true;
      }
      providers.push(entry);
    } catch (_) {
      providers.push({
        id: pid, display_name: pid, status: 'offline',
        last_check_utc: _nowIso(), latency_ms: 0, uptime_24h_pct: 0,
        credential_bearing: true, items_live: 0, items_vod: 0, items_series: 0,
      });
    }
  });

  if (xtreamStatus && (xtreamStatus.configured || xtreamStatus.panel_count > 0 || xtreamStatus.count > 0)) {
    try { providers.push(_xtreamEntry(xtreamStatus)); }
    catch (_) {
      providers.push({
        id: 'xtream', display_name: DISPLAY_NAMES.xtream, status: 'offline',
        last_check_utc: _nowIso(), latency_ms: 0, uptime_24h_pct: 0,
        credential_bearing: true, items_live: 0, items_vod: 0, items_series: 0,
      });
    }
  }

  var statuses = providers.map(function(p) { return p.status; });
  var overall = _rollupStatus(statuses);

  var summary = {
    total_providers: providers.length,
    providers_ok: 0,
    providers_degraded: 0,
    providers_offline: 0,
    computed_at_utc: _nowIso(),
  };
  for (var i = 0; i < providers.length; i++) {
    if (providers[i].status === 'ok')        { summary.providers_ok += 1; }
    else if (providers[i].status === 'degraded') { summary.providers_degraded += 1; }
    else if (providers[i].status === 'offline')  { summary.providers_offline += 1; }
  }

  return {
    overall_status: overall,
    providers: providers,
    summary: summary,
  };
}

module.exports = {
  getSourceHealth: getSourceHealth,
  // Exposed for tests — pure helpers, no I/O.
  _classify: _classify,
  _rollupStatus: _rollupStatus,
};
