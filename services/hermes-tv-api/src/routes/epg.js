'use strict';

/**
 * routes/epg.js — EPG endpoints mirroring IPTV Player Zero's Tauri commands.
 *
 * SECURITY CONTRACT
 *   - XMLTV source URLs may contain credentials in the query string. They are
 *     NEVER stored or returned to the client.
 *   - Channel EPG mappings carry no auth material — only ID-to-ID mappings.
 *
 * MAPPING TO ZERO COMMANDS (see G:\Github\IPTV_Player_Zero\docs\TAURI_COMMANDS.md):
 *   GET    /api/epg/:channelId          ← get_epg_for_channel        (stub, B4)
 *   GET    /api/epg/coverage            ← get_epg_coverage           (stub)
 *   POST   /api/epg/refresh             ← refresh_epg                (stub, 501)
 *   POST   /api/epg/clear               ← clear_epg                  (stub, 501)
 *   GET    /api/epg/suggest-channels    ← suggest_epg_channel_ids    (real)
 *   POST   /api/epg/mapping             ← set_channel_epg_mapping    (real, in-memory)
 *   POST   /api/epg/import-xmltv        ← import_xmltv_epg           (stub, 501)
 *   GET    /api/epg/settings            ← get_epg_import_settings    (real)
 *   PATCH  /api/epg/settings            ← set_epg_import_settings    (real, in-memory)
 */

const { Router } = require('express');
const router = Router();
const { LIVE_DEFS } = require('../data/seedCatalog');
const xmltv = require('../integrations/xmltv');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epg?provider=<provider_id>&hours=<n>&force_refresh=1
//
// Grid endpoint consumed by apps/hermes-web-tv/src/components/EPGGrid.jsx.
// Returns { channels, programs, _meta: { source } } so the TV-side React
// component can render the time-grid without further normalisation.
//
// Three operating modes:
//   1. XMLTV_URL env set            → fetch + parse + cache via xmltv.js,
//                                      apply data/channelMap.json mapping,
//                                      filter to the next `hours` window.
//   2. XMLTV_URL unset              → stub response with a helpful message
//                                      pointing at the setup doc.
//   3. ?force_refresh=1             → bypass cache, but only when env var
//                                      EPG_ALLOW_FORCE_REFRESH=1 is set
//                                      (otherwise any LAN client could
//                                      hammer the upstream source).
//
// Response headers:
//   X-Hermes-XMLTV-Channels         — first 20 raw XMLTV channel IDs from
//                                      the feed (comma-joined). Lets
//                                      operators wire channelMap.json
//                                      without grepping logs. Only emitted
//                                      when XMLTV_URL is configured.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/epg', async (req, res) => {
  let hours = parseInt(req.query.hours, 10);
  if (isNaN(hours) || hours < 1) { hours = 4; }
  if (hours > 12) { hours = 12; }

  const provider = typeof req.query.provider === 'string'
    ? req.query.provider
    : '';

  const xmltvUrl = (typeof process.env.XMLTV_URL === 'string' && process.env.XMLTV_URL.trim().length > 0)
    ? process.env.XMLTV_URL.trim()
    : '';

  // ─── Mode 2: no upstream configured — return the stub ────────────────────
  if (xmltvUrl.length === 0) {
    return res.json({
      channels: [],
      programs: [],
      _meta: {
        source: 'stub',
        message: 'Set XMLTV_URL env var to enable EPG data — see docs/44_EPG_XMLTV_SETUP.md',
        requested_provider: provider,
        requested_hours: hours,
        server_time: new Date().toISOString(),
      },
    });
  }

  // ─── Mode 1/3: real upstream ─────────────────────────────────────────────
  // `force_refresh` is a debugging hatch. Off by default to prevent any LAN
  // client from triggering an upstream fetch on every request — that would
  // make the operator's XMLTV provider rate-limit them.
  const wantForce = req.query.force_refresh === '1' || req.query.force_refresh === 'true';
  const forceAllowed = process.env.EPG_ALLOW_FORCE_REFRESH === '1';
  const useForce = wantForce && forceAllowed;

  let epg;
  try {
    epg = await xmltv.fetchEpg(xmltvUrl, { forceRefresh: useForce });
  } catch (e) {
    // fetchEpg never throws by contract, but defense-in-depth: if it does,
    // surface an honest stub rather than a 500.
    return res.json({
      channels: [],
      programs: [],
      _meta: {
        source:        'xmltv',
        source_label:  xmltv._safeSourceLabel(xmltvUrl),
        message:       'XMLTV fetch threw unexpectedly — see server logs',
        requested_provider: provider,
        requested_hours: hours,
        server_time:   new Date().toISOString(),
        error:         'unexpected',
      },
    });
  }

  // Apply the operator-curated XMLTV → HermesTV channel ID map. Channels
  // not in the map are dropped — the TV grid only renders channels we can
  // also play back.
  const mapped = xmltv.applyChannelMap(epg);

  // Expose the raw XMLTV channel IDs as a response header so the operator
  // can extend channelMap.json without re-running curl. Cap at 20 to keep
  // the header well under the 8KB envelope.
  if (mapped.xmltv_channel_ids && mapped.xmltv_channel_ids.length > 0) {
    res.set('X-Hermes-XMLTV-Channels', mapped.xmltv_channel_ids.join(','));
  }

  // Filter programs to the requested time window so the grid doesn't render
  // 7 days of data. `now - 30min` to `now + hours` gives the user a buffer
  // for "what's on right now" plus the forward look-ahead.
  const nowMs = Date.now();
  const windowStartMs = nowMs - 30 * 60 * 1000;
  const windowEndMs   = nowMs + hours * 60 * 60 * 1000;
  const programs = mapped.programs.filter(function(p) {
    const ps = Date.parse(p.start);
    const pe = Date.parse(p.end);
    if (isNaN(ps) || isNaN(pe)) { return false; }
    // Include programs that overlap the window
    return ps < windowEndMs && pe > windowStartMs;
  });

  // Provider filter — when the client passes ?provider=apollo_group we still
  // serve EPG (it's source-agnostic) but echo the filter in _meta so the
  // EPGGrid component can display a "showing for Apollo Group" caption.
  // The XMLTV feed itself is provider-agnostic by design.

  // Get cached entry diagnostics — useful for operators tuning the TTL.
  const cacheInfo = xmltv.getCachedEpg(xmltvUrl);

  res.json({
    channels: mapped.channels,
    programs: programs,
    _meta: {
      source:               'xmltv',
      source_label:         xmltv._safeSourceLabel(xmltvUrl), // host + path only — no creds
      fetched_at:           epg.fetched_at,
      channel_count:        mapped.channels.length,
      program_count:        programs.length,
      raw_channel_count:    Array.isArray(epg.channels) ? epg.channels.length : 0,
      raw_program_count:    Array.isArray(epg.programs) ? epg.programs.length : 0,
      requested_provider:   provider,
      requested_hours:      hours,
      window_start:         new Date(windowStartMs).toISOString(),
      window_end:           new Date(windowEndMs).toISOString(),
      server_time:          new Date().toISOString(),
      cache:                cacheInfo ? {
        age_ms:     cacheInfo.age_ms,
        fresh:      cacheInfo.fresh,
        expires_at: cacheInfo.expires_at,
      } : null,
      force_refresh: useForce
        ? 'applied'
        : (wantForce && !forceAllowed ? 'denied (set EPG_ALLOW_FORCE_REFRESH=1)' : 'not_requested'),
      error: epg.error || null,
    },
  });
});


const VALID_PROFILES = ['dave_tv', 'mom_tv'];

// In-memory channel→EPG mapping (resets on restart; persisted-to-disk is the
// next step but isn't blocking the surface).
var EPG_MAPPING = {};

// In-memory EPG import settings. The shape matches Zero's EpgImportSettings:
//   auto_refresh        — daily refresh on/off
//   refresh_hour_utc    — clock hour to run the refresh
//   keep_days           — retain N days of past programs
//   match_strategy      — "fuzzy" | "exact" | "prefix"
//   default_source_id   — fallback source if a playlist has none
var EPG_SETTINGS = {
  auto_refresh: true,
  refresh_hour_utc: 4,
  keep_days: 3,
  match_strategy: 'fuzzy',
  default_source_id: null,
};

const VALID_MATCH_STRATEGIES = ['fuzzy', 'exact', 'prefix'];

// ─── GET /api/epg/coverage ───────────────────────────────────────────────────
// Maps to: get_epg_coverage({ playlist_id }) → { matched, total, coverage_pct }
// Since we don't yet have per-playlist EPG persisted, we report 0% coverage
// against the seed channel list so the UI sees the shape it expects.
router.get('/api/epg/coverage', (req, res) => {
  const total = LIVE_DEFS.length;
  // Count channels in the seed that have has_catchup=true as a proxy for
  // "matched" since those are the ones with hand-curated EPG data.
  const matched = LIVE_DEFS.filter(function(d) { return d.has_catchup; }).length;
  res.json({
    matched: matched,
    total: total,
    coverage_pct: total > 0 ? Math.round((matched / total) * 100) : 0,
    _meta: { source: 'seed-static', generated_utc: new Date().toISOString() },
  });
});

// ─── GET /api/epg/settings ───────────────────────────────────────────────────
// Maps to: get_epg_import_settings() → EpgImportSettings
router.get('/api/epg/settings', (req, res) => {
  res.json({
    ...EPG_SETTINGS,
    _meta: { source: 'in-memory' },
  });
});

// ─── PATCH /api/epg/settings ─────────────────────────────────────────────────
// Maps to: set_epg_import_settings({ settings })
// Validates types and applies the partial update.
router.patch('/api/epg/settings', (req, res) => {
  const body = req.body || {};
  const errors = {};

  if (body.auto_refresh !== undefined && typeof body.auto_refresh !== 'boolean') {
    errors.auto_refresh = 'must be a boolean';
  }
  if (body.refresh_hour_utc !== undefined) {
    if (typeof body.refresh_hour_utc !== 'number' || body.refresh_hour_utc < 0 || body.refresh_hour_utc > 23) {
      errors.refresh_hour_utc = 'must be a number 0-23';
    }
  }
  if (body.keep_days !== undefined) {
    if (typeof body.keep_days !== 'number' || body.keep_days < 1 || body.keep_days > 30) {
      errors.keep_days = 'must be a number 1-30';
    }
  }
  if (body.match_strategy !== undefined && !VALID_MATCH_STRATEGIES.includes(body.match_strategy)) {
    errors.match_strategy = 'must be one of: ' + VALID_MATCH_STRATEGIES.join(', ');
  }
  if (body.default_source_id !== undefined && body.default_source_id !== null && typeof body.default_source_id !== 'string') {
    errors.default_source_id = 'must be a string or null';
  }

  // Reject unknown fields to avoid silent typos.
  const ALLOWED = ['auto_refresh', 'refresh_hour_utc', 'keep_days', 'match_strategy', 'default_source_id'];
  for (const key of Object.keys(body)) {
    if (!ALLOWED.includes(key)) {
      errors[key] = 'unknown field';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'validation_failed', fields: errors });
  }

  EPG_SETTINGS = { ...EPG_SETTINGS, ...body };
  res.json({ success: true, ...EPG_SETTINGS });
});

// ─── POST /api/epg/refresh ───────────────────────────────────────────────────
// Maps to: refresh_epg({ playlist_id })
// XMLTV refresh pipeline lands in Phase 4. Returns 501 with a clean error.
router.post('/api/epg/refresh', (req, res) => {
  const body = req.body || {};
  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  console.warn('[epg] refresh_epg requested but XMLTV pipeline not implemented (Phase 4)');
  res.status(501).json({
    error: 'not_implemented',
    message: 'XMLTV refresh pipeline lands in Phase 4. EPG_IMPORT_URL configured? ' + (!!process.env.EPG_IMPORT_URL),
  });
});

// ─── POST /api/epg/clear ─────────────────────────────────────────────────────
// Maps to: clear_epg({ playlist_id })
router.post('/api/epg/clear', (req, res) => {
  const body = req.body || {};
  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  console.warn('[epg] clear_epg requested but persisted EPG store not implemented (Phase 4)');
  res.status(501).json({
    error: 'not_implemented',
    message: 'EPG persistence is not yet wired. Nothing to clear.',
  });
});

// ─── POST /api/epg/import-xmltv ──────────────────────────────────────────────
// Maps to: import_xmltv_epg({ url, playlist_id })
// The URL is accepted (validated only, not stored). Actual parse + insert
// lands in Phase 4. We deliberately do NOT echo the URL back in the
// response (it may carry credentials) — only the host portion.
router.post('/api/epg/import-xmltv', (req, res) => {
  const body = req.body || {};
  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  if (!body.url || typeof body.url !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'url is required' });
  }

  var host = null;
  try { host = new URL(body.url).host; } catch (_) {
    return res.status(400).json({ error: 'validation_failed', message: 'url is not a valid URL' });
  }

  console.warn('[epg] import_xmltv_epg requested for host=' + host + ' but XMLTV parser not implemented (Phase 4)');
  res.status(501).json({
    error: 'not_implemented',
    message: 'XMLTV parser pipeline lands in Phase 4.',
    accepted_host: host, // host only — never the full URL with credentials
  });
});

// ─── GET /api/epg/suggest-channels?name=... ──────────────────────────────────
// Maps to: suggest_epg_channel_ids({ channel_name }) → string[]
// Returns channel slugs whose display name contains the query (case-insensitive
// substring + naive token overlap). Real implementation lands when an XMLTV
// source is configured; this version uses the seed channel list so the UI's
// "Fix mapping" modal has live suggestions to render.
router.get('/api/epg/suggest-channels', (req, res) => {
  const name = (req.query.name || '').toString().trim().toLowerCase();
  if (!name || name.length < 2) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'name query parameter is required (>= 2 chars)',
    });
  }

  // Score = (1 if substring match) + (token overlap count / total tokens)
  const tokens = name.split(/\s+/).filter(Boolean);
  const scored = LIVE_DEFS.map(function(def) {
    const candidate = (def.title || '').toLowerCase();
    const substringMatch = candidate.indexOf(name) !== -1 ? 1 : 0;
    var tokenHits = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (candidate.indexOf(tokens[i]) !== -1) { tokenHits++; }
    }
    const tokenScore = tokens.length > 0 ? tokenHits / tokens.length : 0;
    return {
      channel_id: 'live.' + def.slug,
      display_name: def.title,
      score: substringMatch + tokenScore,
    };
  }).filter(function(s) { return s.score > 0; });

  scored.sort(function(a, b) { return b.score - a.score; });

  res.json({
    suggestions: scored.slice(0, 10),
    total: scored.length,
    _meta: { source: 'seed-static', strategy: EPG_SETTINGS.match_strategy },
  });
});

// ─── POST /api/epg/mapping ───────────────────────────────────────────────────
// Maps to: set_channel_epg_mapping({ channel_id, epg_id })
// Stores the mapping in-memory (persisted store lands later).
router.post('/api/epg/mapping', (req, res) => {
  const body = req.body || {};
  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  if (!body.channel_id || typeof body.channel_id !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'channel_id is required' });
  }
  if (!body.epg_id || typeof body.epg_id !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'epg_id is required' });
  }

  EPG_MAPPING[body.channel_id] = body.epg_id;
  res.json({
    success: true,
    channel_id: body.channel_id,
    epg_id: body.epg_id,
    _meta: { source: 'in-memory', mapping_count: Object.keys(EPG_MAPPING).length },
  });
});

// ─── GET /api/epg/:channelId ─────────────────────────────────────────────────
// Maps to: get_epg_for_channel({ channel_id })
// Kept the original stub shape so existing clients don't break, but extended
// with _meta and a richer response body for B4 wiring.
router.get('/api/epg/:channelId', (req, res) => {
  res.json({
    channel_id: req.params.channelId,
    status: 'not_implemented',
    programs: [],
    message: 'Per-channel EPG integration pending B4 phase',
    _meta: { source: 'stub' },
  });
});

module.exports = router;
module.exports._internal = {
  _clear: function() { EPG_MAPPING = {}; EPG_SETTINGS = {
    auto_refresh: true,
    refresh_hour_utc: 4,
    keep_days: 3,
    match_strategy: 'fuzzy',
    default_source_id: null,
  }; },
  _getMappings: function() { return EPG_MAPPING; },
};
