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
 *   GET    /api/epg/:channelId          ← get_epg_for_channel
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
const iptvOrg = require('../lib/iptvOrg');
const m3uClient = require('../lib/m3uClient');
const catalogMerge = require('../lib/catalogMerge');
const providerRegistry = require('../lib/providerRegistry');
const epgWaterfall = require('../lib/epgWaterfall');
const xmltv = require('../integrations/xmltv');

// W17-PURGE: coverage + suggest-channels used to walk the seed catalog
// (LIVE_DEFS). They now walk the real provider caches (iptv-org public +
// operator-pasted M3U). When no provider is configured the helpers return
// an empty list and the endpoints serve honest 0% coverage / no suggestions.
function _collectLiveCatalog() {
  var out = [];
  try {
    if (iptvOrg.isEnabled()) {
      var orgItems = iptvOrg.fetchCatalog({ limit: 500 });
      if (Array.isArray(orgItems)) {
        for (var i = 0; i < orgItems.length; i++) {
          if (orgItems[i] && orgItems[i].type === 'live') { out.push(orgItems[i]); }
        }
      }
    }
  } catch (_) {}
  try {
    if (m3uClient.isEnabled() && typeof m3uClient.getCachedCatalog === 'function') {
      var m3uItems = m3uClient.getCachedCatalog();
      if (Array.isArray(m3uItems)) {
        for (var j = 0; j < m3uItems.length; j++) {
          if (m3uItems[j] && m3uItems[j].type === 'live') { out.push(m3uItems[j]); }
        }
      }
    }
  } catch (_) {}
  return out;
}

function _catalogItemsForMapping() {
  var out = [];
  try {
    if (catalogMerge && typeof catalogMerge.getLastMerged === 'function') {
      var merged = catalogMerge.getLastMerged();
      if (Array.isArray(merged)) { out = out.concat(merged); }
    }
  } catch (_) {}
  try {
    if (m3uClient && typeof m3uClient.getCachedCatalog === 'function') {
      var m3u = m3uClient.getCachedCatalog();
      if (Array.isArray(m3u)) { out = out.concat(m3u); }
    }
  } catch (_) {}
  try {
    if (iptvOrg && iptvOrg.isEnabled && iptvOrg.isEnabled() && typeof iptvOrg.fetchCatalog === 'function') {
      var org = iptvOrg.fetchCatalog({ limit: 500 });
      if (Array.isArray(org)) { out = out.concat(org); }
    }
  } catch (_) {}
  return out;
}

async function _epgCandidates() {
  var rows = [];
  try {
    rows = await providerRegistry.listFull();
  } catch (_) {
    rows = [];
  }
  var xmltvUrl = (typeof process.env.XMLTV_URL === 'string' && process.env.XMLTV_URL.trim().length > 0)
    ? process.env.XMLTV_URL.trim()
    : '';
  return epgWaterfall.buildEpgUrlCandidatesFromRegistryRows(rows, xmltvUrl);
}

function _safeSourceMeta(candidate, epg, cacheInfo) {
  return {
    source: candidate.source,
    kind: candidate.kind,
    registry_id: candidate.registry_id,
    provider_id: candidate.provider_id,
    provider_type: candidate.provider_type,
    source_label: xmltv._safeSourceLabel(candidate.url),
    channel_count: epg && Array.isArray(epg.channels) ? epg.channels.length : 0,
    program_count: epg && Array.isArray(epg.programs) ? epg.programs.length : 0,
    error: epg && epg.error ? epg.error : null,
    cache: cacheInfo ? {
      age_ms: cacheInfo.age_ms,
      fresh: cacheInfo.fresh,
      expires_at: cacheInfo.expires_at,
    } : null,
  };
}

async function _loadProviderEpgs(useForce) {
  var candidates = await _epgCandidates();
  var epgs = [];
  var sourceMeta = [];
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    var epg = null;
    try {
      var cached = !useForce && typeof xmltv.getCachedEpg === 'function'
        ? xmltv.getCachedEpg(c.url)
        : null;
      epg = cached && cached.data ? cached.data : await xmltv.fetchEpg(c.url, { forceRefresh: useForce });
      epgs.push(epg);
      sourceMeta.push(_safeSourceMeta(c, epg, xmltv.getCachedEpg(c.url)));
    } catch (_) {
      epg = { channels: [], programs: [], error: 'unexpected' };
      sourceMeta.push(_safeSourceMeta(c, epg, null));
    }
  }
  return {
    candidates: candidates,
    sources: sourceMeta,
    epg: epgWaterfall.mergeEpgResults(epgs)
  };
}

function _channelNamesById(epgData) {
  var out = {};
  var channels = epgData && Array.isArray(epgData.channels) ? epgData.channels : [];
  for (var i = 0; i < channels.length; i++) {
    if (channels[i] && typeof channels[i].id === 'string') {
      out[channels[i].id] = channels[i].name || channels[i].id;
    }
  }
  return out;
}

function _logosById(epgData) {
  var out = {};
  var channels = epgData && Array.isArray(epgData.channels) ? epgData.channels : [];
  for (var i = 0; i < channels.length; i++) {
    if (channels[i] && typeof channels[i].id === 'string') {
      out[channels[i].id] = channels[i].logo_url || null;
    }
  }
  return out;
}

function _mapEpgToPlayable(epgData, effectiveStartMs, windowEndMs) {
  var channelNames = _channelNamesById(epgData);
  var logos = _logosById(epgData);
  var playableIndex = epgWaterfall.buildPlayableEpgIndex(_catalogItemsForMapping());
  var channelsById = {};
  var programs = [];
  var unmapped = 0;
  var rawPrograms = epgData && Array.isArray(epgData.programs) ? epgData.programs : [];
  for (var i = 0; i < rawPrograms.length; i++) {
    var p = rawPrograms[i];
    if (!p) { continue; }
    var ps = Date.parse(p.start);
    var pe = Date.parse(p.end);
    if (isNaN(ps) || isNaN(pe)) { continue; }
    if (!(ps < windowEndMs && pe > effectiveStartMs)) { continue; }
    var tvgId = p.channel_id;
    var channelName = channelNames[tvgId] || p.channel_name || p.tvg_name || p.name || tvgId;
    var mapping = epgWaterfall.resolvePlayableEpgChannel(tvgId, channelName, playableIndex);
    if (!mapping) {
      unmapped += 1;
      continue;
    }
    channelsById[mapping.catalog_item_id] = {
      id: mapping.catalog_item_id,
      name: channelName,
      logo_url: logos[tvgId] || null,
      xmltv_id: tvgId,
      provider_id: mapping.provider_id,
      source_id: mapping.source_id
    };
    programs.push({
      channel_id: mapping.catalog_item_id,
      title: p.title || '',
      description: p.description || p.desc || '',
      start: p.start,
      end: p.end,
      xmltv_tvg_id: tvgId,
      provider_id: mapping.provider_id,
      source_id: mapping.source_id,
      mapping_strategy: mapping.match_strategy
    });
  }
  return {
    channels: Object.keys(channelsById).map(function(id) { return channelsById[id]; }),
    programs: programs,
    unmapped_program_count: unmapped
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/epg?provider=<provider_id>&hours=<n>&force_refresh=1
//
// Grid endpoint consumed by apps/hermes-web-tv/src/components/EPGGrid.jsx.
// Returns { channels, programs, _meta: { source } } so the TV-side React
// component can render the time-grid without further normalisation.
//
// Three operating modes:
//   1. Provider registry EPG rows   → fetch + parse + cache via xmltv.js,
//                                      map via current playable catalog,
//                                      filter to the next `hours` window.
//      XMLTV_URL is appended as a fallback source.
//   2. No EPG source configured     → honest empty response with guidance.
//   3. ?force_refresh=1             → bypass cache, but only when env var
//                                      EPG_ALLOW_FORCE_REFRESH=1 is set
//                                      (otherwise any LAN client could
//                                      hammer the upstream source).
//
// Response headers:
//   X-Hermes-XMLTV-Channels         — first 20 raw XMLTV channel IDs from
//                                      the feed (comma-joined). Lets
//                                      operators inspect provider EPG IDs
//                                      without grepping logs. Only emitted
//                                      when an XMLTV source is configured.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/epg', async (req, res) => {
  let hours = parseInt(req.query.hours, 10);
  if (isNaN(hours) || hours < 1) { hours = 4; }
  // Cap raised from 12 → 48 so the client can request a full "Today" or
  // "Tomorrow" window (24h each). The XMLTV upstream is cached, so a wider
  // window doesn't multiply upstream calls — only the in-memory filter
  // costs grow, linearly.
  if (hours > 48) { hours = 48; }

  const provider = typeof req.query.provider === 'string'
    ? req.query.provider
    : '';

  // Optional `start` query param — when supplied + parseable, anchors the
  // window at that ISO timestamp instead of `now - 30min`. Lets the client
  // ask for "tomorrow 00:00 → tomorrow 23:59" without re-anchoring to now.
  let windowStartMs = null;
  if (typeof req.query.start === 'string' && req.query.start.length > 0) {
    const parsed = Date.parse(req.query.start);
    if (!isNaN(parsed)) { windowStartMs = parsed; }
  }

  // `force_refresh` is a debugging hatch. Off by default to prevent any LAN
  // client from triggering an upstream fetch on every request.
  const wantForce = req.query.force_refresh === '1' || req.query.force_refresh === 'true';
  const forceAllowed = process.env.EPG_ALLOW_FORCE_REFRESH === '1';
  const useForce = wantForce && forceAllowed;

  const loaded = await _loadProviderEpgs(useForce);

  // ─── Mode 2: no upstream configured — return an honest empty state ───────
  if (!loaded.candidates || loaded.candidates.length === 0) {
    return res.json({
      channels: [],
      programs: [],
      _meta: {
        source: 'no-epg',
        message: 'Configure a provider EPG URL, Xtream provider, or XMLTV_URL to enable EPG data',
        requested_provider: provider,
        requested_hours: hours,
        server_time: new Date().toISOString(),
      },
    });
  }

  // Expose the raw XMLTV channel IDs as a response header so the operator can
  // inspect provider EPG IDs without re-running curl. Cap at 20 to keep the
  // header well under the 8KB envelope.
  const rawChannelIds = (loaded.epg.channels || []).map(function(c) { return c && c.id; }).filter(Boolean).slice(0, 20);
  if (rawChannelIds.length > 0) {
    res.set('X-Hermes-XMLTV-Channels', rawChannelIds.join(','));
  }

  // Filter programs to the requested time window so the grid doesn't render
  // 7 days of data. When `start` is supplied, the window is exactly
  // [start, start+hours]; otherwise we anchor to `now - 30min` (so the user
  // sees the in-progress program at the left edge of the grid).
  const nowMs = Date.now();
  const effectiveStartMs = windowStartMs !== null
    ? windowStartMs
    : (nowMs - 30 * 60 * 1000);
  const windowEndMs = effectiveStartMs + hours * 60 * 60 * 1000;
  const mapped = _mapEpgToPlayable(loaded.epg, effectiveStartMs, windowEndMs);

  // Provider filter — when the client passes ?provider=apollo_group we still
  // serve EPG (it's source-agnostic) but echo the filter in _meta so the
  // EPGGrid component can display a "showing for Apollo Group" caption.
  // The XMLTV feed itself is provider-agnostic by design.

  res.json({
    channels: mapped.channels,
    programs: mapped.programs,
    _meta: {
      source:               'xmltv-merged',
      sources:              loaded.sources,
      channel_count:        mapped.channels.length,
      program_count:        mapped.programs.length,
      unmapped_program_count: mapped.unmapped_program_count,
      raw_channel_count:    Array.isArray(loaded.epg.channels) ? loaded.epg.channels.length : 0,
      raw_program_count:    Array.isArray(loaded.epg.programs) ? loaded.epg.programs.length : 0,
      requested_provider:   provider,
      requested_hours:      hours,
      requested_start:      windowStartMs !== null ? new Date(windowStartMs).toISOString() : null,
      window_start:         new Date(effectiveStartMs).toISOString(),
      window_end:           new Date(windowEndMs).toISOString(),
      server_time:          new Date().toISOString(),
      force_refresh: useForce
        ? 'applied'
        : (wantForce && !forceAllowed ? 'denied (set EPG_ALLOW_FORCE_REFRESH=1)' : 'not_requested'),
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
  // W17-PURGE: coverage is computed against the live provider catalog rather
  // than the deleted seed. When no provider is configured we honestly report
  // 0/0 coverage.
  const live = _collectLiveCatalog();
  const total = live.length;
  const matched = live.filter(function(d) {
    return d && d.metadata && d.metadata.has_catchup;
  }).length;
  res.json({
    matched: matched,
    total: total,
    coverage_pct: total > 0 ? Math.round((matched / total) * 100) : 0,
    _meta: { source: total > 0 ? 'providers' : 'no-providers', generated_utc: new Date().toISOString() },
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

  // W17-PURGE: suggestions are pulled from real provider channel lists.
  // Score = (1 if substring match) + (token overlap count / total tokens)
  const tokens = name.split(/\s+/).filter(Boolean);
  const live = _collectLiveCatalog();
  const scored = live.map(function(def) {
    const candidate = (def.title || '').toLowerCase();
    const substringMatch = candidate.indexOf(name) !== -1 ? 1 : 0;
    var tokenHits = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (candidate.indexOf(tokens[i]) !== -1) { tokenHits++; }
    }
    const tokenScore = tokens.length > 0 ? tokenHits / tokens.length : 0;
    return {
      channel_id: def.id || ('live.' + (def.slug || 'unknown')),
      display_name: def.title || 'Unknown',
      score: substringMatch + tokenScore,
    };
  }).filter(function(s) { return s.score > 0; });

  scored.sort(function(a, b) { return b.score - a.score; });

  res.json({
    suggestions: scored.slice(0, 10),
    total: scored.length,
    _meta: { source: live.length > 0 ? 'providers' : 'no-providers', strategy: EPG_SETTINGS.match_strategy },
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
// Uses the same providerRegistry/XMLTV waterfall as /api/epg and filters to
// one playable catalog channel. No EPG source or no match returns an honest
// empty program list, never a synthetic schedule.
router.get('/api/epg/:channelId', async (req, res) => {
  const channelId = req.params.channelId;
  let hours = parseInt(req.query.hours, 10);
  if (isNaN(hours) || hours < 1) { hours = 4; }
  if (hours > 48) { hours = 48; }

  let windowStartMs = null;
  if (typeof req.query.start === 'string' && req.query.start.length > 0) {
    const parsed = Date.parse(req.query.start);
    if (!isNaN(parsed)) { windowStartMs = parsed; }
  }

  const wantForce = req.query.force_refresh === '1' || req.query.force_refresh === 'true';
  const forceAllowed = process.env.EPG_ALLOW_FORCE_REFRESH === '1';
  const useForce = wantForce && forceAllowed;
  const loaded = await _loadProviderEpgs(useForce);
  if (!loaded.candidates || loaded.candidates.length === 0) {
    return res.json({
      channel_id: channelId,
      programs: [],
      _meta: {
        source: 'no-epg',
        message: 'Configure a provider EPG URL, Xtream provider, or XMLTV_URL to enable EPG data',
        requested_hours: hours,
        server_time: new Date().toISOString(),
      },
    });
  }

  const rawChannelIds = (loaded.epg.channels || []).map(function(c) { return c && c.id; }).filter(Boolean).slice(0, 20);
  if (rawChannelIds.length > 0) {
    res.set('X-Hermes-XMLTV-Channels', rawChannelIds.join(','));
  }

  const nowMs = Date.now();
  const effectiveStartMs = windowStartMs !== null
    ? windowStartMs
    : (nowMs - 30 * 60 * 1000);
  const windowEndMs = effectiveStartMs + hours * 60 * 60 * 1000;
  const mapped = _mapEpgToPlayable(loaded.epg, effectiveStartMs, windowEndMs);
  const programs = mapped.programs.filter(function(p) {
    return p &&
      (p.channel_id === channelId ||
       p.xmltv_tvg_id === channelId ||
       p.source_id === channelId);
  });

  res.json({
    channel_id: channelId,
    programs: programs,
    _meta: {
      source: 'xmltv-merged',
      sources: loaded.sources,
      program_count: programs.length,
      unmapped_program_count: mapped.unmapped_program_count,
      raw_channel_count: Array.isArray(loaded.epg.channels) ? loaded.epg.channels.length : 0,
      raw_program_count: Array.isArray(loaded.epg.programs) ? loaded.epg.programs.length : 0,
      requested_hours: hours,
      requested_start: windowStartMs !== null ? new Date(windowStartMs).toISOString() : null,
      window_start: new Date(effectiveStartMs).toISOString(),
      window_end: new Date(windowEndMs).toISOString(),
      server_time: new Date().toISOString(),
      force_refresh: useForce
        ? 'applied'
        : (wantForce && !forceAllowed ? 'denied (set EPG_ALLOW_FORCE_REFRESH=1)' : 'not_requested'),
    },
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
