'use strict';

/**
 * routes/playlists.js — Playlist Import surface (m3u / XMLTV / xtream).
 *
 * Mirrors the IPTV Player Zero "Add Playlist" flow (docs/USER_JOURNEYS.md §1,
 * docs/DATA_FLOW.md §"Playlist Import Data Flow") onto the HermesTV API.
 * See docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md and
 * docs/19_PROVIDER_ONBOARDING_WITHOUT_SECRETS.md for the operator contract.
 *
 * Endpoints:
 *
 *   POST   /api/playlists/preview
 *     body: { type|kind: 'url'|'file'|'xtream', ...source-specific }
 *     200:  { channels_count, groups_count, sample_channels[], _meta }
 *     400:  validation_failed (URL scheme, file size, missing fields, bad name)
 *     501:  not_durable (file save only; preview remains supported)
 *     502:  upstream_unreachable (URL fetch failure)
 *
 *   POST   /api/playlists/save
 *     body: { name, provider_id, source: <same shape as /preview body> }
 *     200:  { id, name, provider_id, channels_count, created_at }
 *     400:  validation_failed
 *     501:  not_durable (file save only)
 *
 *   GET    /api/playlists
 *     200:  { playlists: [{id, name, provider_id, channels_count, created_at}] }
 *
 *   DELETE /api/playlists/:id
 *     200:  { deleted: true, id }
 *     404:  not_found
 *
 * SECURITY CONTRACT
 *   - URL scheme allow-list: ONLY http:// or https://. Reject file://, ftp://,
 *     javascript:, data:, etc. — prevents SSRF / local-file exfil via the
 *     server's fetch().
 *   - File upload max size: 10 MB. Larger payloads are rejected before parse
 *     so a hostile client can't OOM the API container.
 *   - Playlist NAME sanitised: strips `<`, `>`, and any `script` token.
 *     Names are user-facing labels only, never used as filesystem paths or
 *     command args.
 *   - Stream URLs from parsed m3u text are stored in-memory ONLY on the
 *     playlist record (`_streams_by_local_id`, server-only). The /preview
 *     and /save responses NEVER expose raw stream URLs to TV clients —
 *     credentialGuard middleware blocks any leaked /get.php URL anyway.
 *   - Xtream credentials (server_url, username, password) are persisted
 *     server-side ONLY in the in-memory record's `_xtream_credentials`
 *     field, never serialised to a TV-bound response. The /preview and
 *     /save bodies surface only counts + sample + masked meta.
 *   - Local file preview is supported, but file save is rejected because
 *     DaveTV cannot refetch a browser-local file after restart.
 *
 * STORE
 *   - Saved URL/Xtream imports are mirrored into providerStore before the
 *     response can succeed. The short-lived in-memory playlist record is only
 *     a smoke/projection cache and is never treated as durable truth.
 */

const { Router } = require('express');
const router = Router();
const { sanitizeForLog } = require('../lib/sanitizeLog');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;       // 10 MB
const MAX_NAME_LENGTH = 80;
const FETCH_TIMEOUT_MS = 15000;
const MAX_ITEMS_PER_PARSE = 5000;
const SAMPLE_CHANNEL_COUNT = 10;
const MAX_PLAYLISTS = 50;                         // soft cap on in-memory store
const VALID_TYPES = ['url', 'file', 'xtream'];
// Provider IDs the saved playlist can be tagged under. Mirrors the m3uClient
// PROVIDER_DEFS plus a generic "custom" bucket for operator-imported sources.
const VALID_PROVIDER_IDS = ['apollo_group', 'xtremehd', 'custom'];

// In-memory store. Each entry: { id, name, provider_id, source_type,
//   channels_count, created_at, _streams_by_local_id }
var _playlists = {};
var _playlistOrder = [];

function _now() { return Date.now(); }

function _makeId() {
  return 'pl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function _trim() {
  while (_playlistOrder.length > MAX_PLAYLISTS) {
    var oldest = _playlistOrder.shift();
    delete _playlists[oldest];
  }
}

// ── Validators ────────────────────────────────────────────────────────────

// URL allow-list: http:// or https:// only. Rejects file://, ftp://, gopher://,
// javascript:, data:, etc. — the SSRF / local-file exfil gate.
function _validateUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'url is required and must be a string' };
  }
  if (url.length > 2048) {
    return { ok: false, error: 'url is too long (max 2048 chars)' };
  }
  // Note: we explicitly check the prefix string rather than `new URL()`
  // because Node's URL constructor will happily parse `file:///etc/passwd`.
  var lower = url.toLowerCase();
  if (lower.indexOf('http://') !== 0 && lower.indexOf('https://') !== 0) {
    return { ok: false, error: 'url must use http:// or https:// (no file://, ftp://, etc.)' };
  }
  return { ok: true };
}

// Xtream server URL validator. Must be http:// or https:// with a host (and
// optional port). Trailing slashes are tolerated. Rejects path components
// — callers pass just the server root; we append `/get.php` and `/player_api.php`
// ourselves so a hostile operator can't inject extra path segments.
function _validateXtreamServerUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return { ok: false, error: 'server_url is required and must be a string' };
  }
  if (url.length > 512) {
    return { ok: false, error: 'server_url is too long (max 512 chars)' };
  }
  var lower = url.toLowerCase();
  if (lower.indexOf('http://') !== 0 && lower.indexOf('https://') !== 0) {
    return { ok: false, error: 'server_url must use http:// or https://' };
  }
  // Pull the part after the scheme. Strip a trailing slash. Reject any
  // remaining `/path` — the operator passes just the server root.
  var rest = url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (rest.length === 0) {
    return { ok: false, error: 'server_url is missing a host' };
  }
  // host[:port] only — no slashes, no query, no fragment.
  if (/[\/?#]/.test(rest)) {
    return { ok: false, error: 'server_url must be just the server root (no path)' };
  }
  // Permissive host check: letters, digits, hyphens, dots; optional :port.
  if (!/^[A-Za-z0-9.\-]+(?::\d{1,5})?$/.test(rest)) {
    return { ok: false, error: 'server_url has an invalid host[:port]' };
  }
  return { ok: true, normalised: url.replace(/\/+$/, '') };
}

// Legacy helper kept for route-internal validation tests that exercise common
// IPTV address parsing. It is not exposed in the web import UI.
function _validateMacAddress(mac) {
  if (typeof mac !== 'string' || mac.length === 0) {
    return { ok: false, error: 'mac_address is required and must be a string' };
  }
  if (!/^[0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5}$/.test(mac)) {
    return { ok: false, error: 'mac_address must be in the form xx:xx:xx:xx:xx:xx' };
  }
  return { ok: true };
}

// Sanitise the user-facing playlist NAME. Strips angle brackets and any
// `script` token, trims whitespace, enforces a length cap. Returns a clean
// label safe to render inside <span>{name}</span>.
function _sanitiseName(name) {
  if (typeof name !== 'string') { return ''; }
  var clean = name
    .replace(/[<>]/g, '')
    .replace(/script/gi, '')
    .trim();
  if (clean.length > MAX_NAME_LENGTH) {
    clean = clean.slice(0, MAX_NAME_LENGTH);
  }
  return clean;
}

// ── M3U parser (local copy, isolated from lib/m3uClient.js) ───────────────
// We DELIBERATELY use a separate parser here so:
//   (a) the operator-imported playlist's stream URLs don't pollute the
//       Apollo / xTremeHD per-provider cache that lib/m3uClient maintains,
//   (b) credential-bearing logo URLs stay swapped to a safe default the
//       same way the lib does — credentialGuard would block them anyway,
//   (c) callers can grep for one route → one parser.
// The shape returned mirrors the lib closely so future consolidation is
// straightforward.

function _parseAttrs(extinfLine) {
  var attrs = {};
  var commaIdx = extinfLine.lastIndexOf(',');
  attrs._displayName = commaIdx >= 0 ? extinfLine.slice(commaIdx + 1).trim() : '';
  var attrPart = commaIdx >= 0 ? extinfLine.slice(0, commaIdx) : extinfLine;
  var re = /([\w-]+)="([^"]*)"/g;
  var m;
  while ((m = re.exec(attrPart)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function _parseM3U(text) {
  var lines = String(text || '').split(/\r?\n/);
  var items = [];
  var pending = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line && line.charCodeAt(0) === 0xFEFF) { line = line.slice(1); }
    line = line.trim();
    if (line.length === 0) { continue; }
    if (line.indexOf('#EXTINF:') === 0) {
      pending = _parseAttrs(line);
    } else if (line.charAt(0) === '#') {
      // skip non-EXTINF directives (#EXTM3U, #EXTGRP, #EXTVLCOPT, etc.)
    } else if (pending) {
      pending._url = line;
      items.push(pending);
      pending = null;
      if (items.length >= MAX_ITEMS_PER_PARSE) { break; }
    }
  }
  return items;
}

function _summarise(parsed) {
  var groups = {};
  var sample = [];
  for (var i = 0; i < parsed.length; i++) {
    var p = parsed[i];
    var g = p['group-title'] || 'general';
    groups[g] = true;
    if (sample.length < SAMPLE_CHANNEL_COUNT) {
      sample.push(p._displayName || p['tvg-name'] || ('Channel ' + (i + 1)));
    }
  }
  return {
    channels_count: parsed.length,
    groups_count: Object.keys(groups).length,
    sample_channels: sample,
  };
}

function _slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function _buildStreamMap(parsed) {
  // Internal-only map from a stable local-id → raw stream URL. Never serialised
  // to a client response. Identical to lib/m3uClient's per-provider table.
  var streams = {};
  for (var i = 0; i < parsed.length; i++) {
    var p = parsed[i];
    var name = p._displayName || p['tvg-name'] || ('Channel ' + (i + 1));
    var tvgId = p['tvg-id'] || '';
    var localId = tvgId ? _slug(tvgId) : _slug(name) + '-' + i;
    streams[localId] = p._url;
  }
  return streams;
}

// ── Source fetchers ───────────────────────────────────────────────────────

function _fetchUrl(url) {
  // Honest fetch with a 15s timeout. Returns a Promise<{ ok, text?, error?, status? }>.
  return new Promise(function(resolve) {
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    fetch(url, { method: 'GET', signal: ctrl.signal })
      .then(function(res) {
        clearTimeout(timer);
        if (!res.ok) {
          return resolve({ ok: false, status: res.status, error: 'upstream_returned_' + res.status });
        }
        return res.text().then(function(text) {
          if (text && text.length > MAX_UPLOAD_BYTES) {
            return resolve({ ok: false, error: 'upstream_payload_too_large', status: 413 });
          }
          resolve({ ok: true, text: text });
        });
      })
      .catch(function(err) {
        clearTimeout(timer);
        resolve({ ok: false, error: sanitizeForLog((err && err.message) || 'fetch_failed') });
      });
  });
}

// ── Xtream Codes helpers ──────────────────────────────────────────────────

// Build the get.php URL for an Xtream account. NEVER returned to the client;
// only used by the server-side fetch. Match the Xtream Codes API spec:
//   ${server}/get.php?username=${u}&password=${p}&type=m3u_plus&output=ts
function _buildXtreamM3uUrl(serverUrl, username, password) {
  return serverUrl.replace(/\/+$/, '')
    + '/get.php?username=' + encodeURIComponent(username)
    + '&password=' + encodeURIComponent(password)
    + '&type=m3u_plus&output=ts';
}

// Build the player_api.php URL for live/VOD/series counts. Same warning:
// server-side only, never echoed back.
function _buildXtreamApiUrl(serverUrl, username, password, action) {
  var base = serverUrl.replace(/\/+$/, '')
    + '/player_api.php?username=' + encodeURIComponent(username)
    + '&password=' + encodeURIComponent(password);
  if (action) { base += '&action=' + encodeURIComponent(action); }
  return base;
}

// Fetch the player_api.php JSON for a given action ('get_live_streams',
// 'get_vod_streams', 'get_series'). Returns the array length or null on
// failure — we never throw out to the caller since counts are best-effort
// (the M3U fetch is the source of truth for the channel count).
function _fetchXtreamApiCount(serverUrl, username, password, action) {
  return new Promise(function(resolve) {
    var url = _buildXtreamApiUrl(serverUrl, username, password, action);
    var ctrl = new AbortController();
    var timer = setTimeout(function() { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    fetch(url, { method: 'GET', signal: ctrl.signal })
      .then(function(res) {
        clearTimeout(timer);
        if (!res.ok) { return resolve(null); }
        return res.json().then(function(json) {
          resolve(Array.isArray(json) ? json.length : null);
        }, function() { resolve(null); });
      })
      .catch(function(err) {
        clearTimeout(timer);
        console.warn('[playlists] xtream player_api ' + action + ' failed: '
          + sanitizeForLog((err && err.message) || 'fetch_failed'));
        resolve(null);
      });
  });
}

// Fetch + parse an Xtream M3U-plus playlist. Returns
// { ok: true, parsed, counts: { live, vod, series }, last_fetched }
// or { ok: false, status, error }.
async function _fetchXtreamSource(serverUrl, username, password) {
  var m3uUrl = _buildXtreamM3uUrl(serverUrl, username, password);
  var fetched = await _fetchUrl(m3uUrl);
  if (!fetched.ok) {
    return {
      ok: false,
      status: fetched.status || 502,
      // Never include the m3uUrl here — credentialGuard would block, and we
      // don't want the operator's password echoed back even if it didn't.
      error: 'Xtream server did not respond. ' + (fetched.error || ''),
    };
  }
  var parsed = _parseM3U(fetched.text);

  // Best-effort player_api counts. These don't block on failure — the M3U
  // parse already gives us a working channel count and sample list.
  var results = await Promise.all([
    _fetchXtreamApiCount(serverUrl, username, password, 'get_live_streams'),
    _fetchXtreamApiCount(serverUrl, username, password, 'get_vod_streams'),
    _fetchXtreamApiCount(serverUrl, username, password, 'get_series'),
  ]);

  return {
    ok: true,
    parsed: parsed,
    counts: { live: results[0], vod: results[1], series: results[2] },
    last_fetched: new Date(_now()).toISOString(),
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────

// POST /api/playlists/preview
// body shape:
//   { type: 'url', url: 'https://...' }
//   { type: 'file', text: '#EXTM3U\n...' }
//   { type: 'xtream', host, username, password }     // 501
//   { type: 'file', text }                            // preview only
async function handlePreview(req, res) {
  const body = req.body || {};
  // Accept either `type` (legacy) or `kind` (task spec) as the source-kind field.
  const type = body.type || body.kind;

  if (VALID_TYPES.indexOf(type) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'type must be one of: ' + VALID_TYPES.join(', '),
    });
  }

  if (type === 'xtream') {
    const serverCheck = _validateXtreamServerUrl(body.server_url || body.host);
    if (!serverCheck.ok) {
      return res.status(400).json({ error: 'validation_failed', message: serverCheck.error });
    }
    if (typeof body.username !== 'string' || body.username.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'username is required' });
    }
    if (typeof body.password !== 'string' || body.password.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'password is required' });
    }
    const xtream = await _fetchXtreamSource(serverCheck.normalised, body.username, body.password);
    if (!xtream.ok) {
      return res.status(xtream.status === 413 ? 413 : 502).json({
        error: xtream.status === 413 ? 'payload_too_large' : 'upstream_unreachable',
        message: xtream.error,
      });
    }
    if (xtream.parsed.length === 0) {
      return res.status(200).json({
        channels_count: 0,
        groups_count: 0,
        sample_channels: [],
        live_count: xtream.counts.live,
        vod_count: xtream.counts.vod,
        series_count: xtream.counts.series,
        last_fetched: xtream.last_fetched,
        _meta: { source_type: 'xtream', warning: 'no_channels_parsed' },
      });
    }
    const xtSummary = _summarise(xtream.parsed);
    xtSummary.live_count = xtream.counts.live;
    xtSummary.vod_count = xtream.counts.vod;
    xtSummary.series_count = xtream.counts.series;
    xtSummary.last_fetched = xtream.last_fetched;
    // Limit the sample to 5 (task spec). Existing M3U preview returns 10, so
    // we slice here for Xtream specifically. credentialGuard scans the whole
    // body so we keep just channel names — no URLs, no tvg-logo strings.
    xtSummary.sample_channels = xtSummary.sample_channels.slice(0, 5);
    xtSummary._meta = { source_type: 'xtream' };
    return res.status(200).json(xtSummary);
  }
  if (type === 'file') {
    return res.status(501).json({
      error: 'not_durable',
      message: 'File imports cannot be saved yet because DaveTV cannot refetch them after restart. Use a provider URL or Xtream login so the provider is stored durably.',
      type: 'file',
    });
  }

  if (type === 'url') {
    const urlCheck = _validateUrl(body.url);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: 'validation_failed', message: urlCheck.error });
    }
    const fetched = await _fetchUrl(body.url);
    if (!fetched.ok) {
      return res.status(502).json({
        error: 'upstream_unreachable',
        message: 'Could not retrieve the playlist URL. ' + (fetched.error || ''),
      });
    }
    const parsed = _parseM3U(fetched.text);
    if (parsed.length === 0) {
      return res.status(200).json({
        channels_count: 0,
        groups_count: 0,
        sample_channels: [],
        _meta: { source_type: 'url', warning: 'no_channels_parsed' },
      });
    }
    const summary = _summarise(parsed);
    summary._meta = { source_type: 'url' };
    return res.status(200).json(summary);
  }

  // type === 'file'
  if (typeof body.text !== 'string') {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'file payload must include a `text` field with the m3u contents',
    });
  }
  if (body.text.length === 0) {
    return res.status(400).json({ error: 'validation_failed', message: 'file is empty' });
  }
  if (body.text.length > MAX_UPLOAD_BYTES) {
    return res.status(413).json({
      error: 'payload_too_large',
      message: 'File exceeds the 10 MB upload limit.',
      max_bytes: MAX_UPLOAD_BYTES,
    });
  }
  const parsedFile = _parseM3U(body.text);
  if (parsedFile.length === 0) {
    return res.status(200).json({
      channels_count: 0,
      groups_count: 0,
      sample_channels: [],
      _meta: { source_type: 'file', warning: 'no_channels_parsed' },
    });
  }
  const fileSummary = _summarise(parsedFile);
  fileSummary._meta = { source_type: 'file' };
  return res.status(200).json(fileSummary);
}

// POST /api/playlists/save
async function handleSave(req, res) {
  const body = req.body || {};
  const source = body.source || {};
  const name = _sanitiseName(body.name);
  const providerId = body.provider_id;

  if (!name) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'name is required (after sanitisation; angle brackets and `script` tokens are stripped)',
    });
  }
  if (VALID_PROVIDER_IDS.indexOf(providerId) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'provider_id must be one of: ' + VALID_PROVIDER_IDS.join(', '),
    });
  }
  // Accept either `type` (legacy) or `kind` (task spec) for the source kind.
  const type = source.type || source.kind;
  if (VALID_TYPES.indexOf(type) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'source.type must be one of: ' + VALID_TYPES.join(', '),
    });
  }

  if (type === 'file') {
    return res.status(501).json({
      error: 'not_durable',
      message: 'File imports cannot be saved yet because DaveTV cannot refetch them after restart. Use a provider URL or Xtream login so the provider is stored durably.',
      type: 'file',
    });
  }

  var parsed = null;
  var xtreamCreds = null;       // captured for server-side persistence only
  if (type === 'url') {
    const urlCheck = _validateUrl(source.url);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: 'validation_failed', message: urlCheck.error });
    }
    const fetched = await _fetchUrl(source.url);
    if (!fetched.ok) {
      return res.status(502).json({
        error: 'upstream_unreachable',
        message: 'Could not retrieve the playlist URL. ' + (fetched.error || ''),
      });
    }
    parsed = _parseM3U(fetched.text);
  } else if (type === 'xtream') {
    const serverCheck = _validateXtreamServerUrl(source.server_url || source.host);
    if (!serverCheck.ok) {
      return res.status(400).json({ error: 'validation_failed', message: serverCheck.error });
    }
    if (typeof source.username !== 'string' || source.username.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'username is required' });
    }
    if (typeof source.password !== 'string' || source.password.length === 0) {
      return res.status(400).json({ error: 'validation_failed', message: 'password is required' });
    }
    const xtream = await _fetchXtreamSource(serverCheck.normalised, source.username, source.password);
    if (!xtream.ok) {
      return res.status(xtream.status === 413 ? 413 : 502).json({
        error: xtream.status === 413 ? 'payload_too_large' : 'upstream_unreachable',
        message: xtream.error,
      });
    }
    parsed = xtream.parsed;
    // Stash creds for server-only persistence. Per docs/07 §"Backend-only
    // provider record" these MUST NOT leak to any TV-bound response —
    // credentialGuard would catch a /get.php URL anyway, but we belt-and-
    // suspender by never serialising xtreamCreds.
    xtreamCreds = {
      server_url: serverCheck.normalised,
      username: source.username,
      password: source.password,
    };
  } else {
    // file
    if (typeof source.text !== 'string' || source.text.length === 0) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'source.text is required for file imports',
      });
    }
    if (source.text.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({
        error: 'payload_too_large',
        message: 'File exceeds the 10 MB upload limit.',
        max_bytes: MAX_UPLOAD_BYTES,
      });
    }
    parsed = _parseM3U(source.text);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return res.status(400).json({
      error: 'empty_playlist',
      message: 'No channels were parsed from the supplied source. Nothing was saved.',
    });
  }

  // Per docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md P0#2: "saved playlists are
  // in-memory and do not feed catalog/playback after restart". The fix is
  // to mirror the credential-bearing record into providerStore so it
  // survives restart and gets picked up by catalog ingest. The in-memory
  // _playlists record stays (it carries the parsed channel list which
  // is short-lived smoke-test data); the durable provider config goes
  // to disk.
  var persistedProviderId = null;
  var addInput = null;
  if (type === 'url') {
    addInput = {
      type: 'm3u',
      provider_id: providerId === 'custom' ? undefined : providerId,
      label: name,
      url: source.url,
      epg_url: (source.epg_url && typeof source.epg_url === 'string') ? source.epg_url : undefined
    };
  } else if (type === 'xtream' && xtreamCreds) {
    addInput = {
      type: 'xtream',
      provider_id: providerId === 'custom' ? undefined : providerId,
      label: name,
      url: xtreamCreds.server_url,
      username: xtreamCreds.username,
      password: xtreamCreds.password
    };
  }
  try {
    var providerStore = require('../lib/providerStore');
    if (addInput) {
      var saved = await providerStore.add(addInput);
      if (saved && saved.id) {
        persistedProviderId = saved.id;
      }
    }
  } catch (err) {
    if (err && err.code === 'VALIDATION_FAILED') {
      return res.status(400).json({
        error: 'provider_validation_failed',
        message: 'Provider details validated for preview, but the durable provider record was rejected.',
        errors: err.errors || [err.message],
      });
    }
    var SANITIZE2 = require('../lib/sanitizeLog').sanitizeForLog;
    console.warn('[playlists] provider persist failed: ' + SANITIZE2(err && err.message ? err.message : 'unknown'));
    return res.status(500).json({
      error: 'provider_persist_failed',
      message: 'Could not save provider config durably. Nothing was saved.',
    });
  }

  if (!persistedProviderId) {
    return res.status(500).json({
      error: 'provider_persist_failed',
      message: 'Provider save did not return a durable provider id. Nothing was saved.',
    });
  }

  const id = _makeId();
  const record = {
    id: id,
    name: name,
    provider_id: providerId,
    source_type: type,
    channels_count: parsed.length,
    created_at: new Date(_now()).toISOString(),
    _streams_by_local_id: _buildStreamMap(parsed),
    _persisted_provider_id: persistedProviderId,
  };
  if (xtreamCreds) {
    // Server-only. NEVER serialised below; see handleList for the TV-safe
    // projection. If this field is ever leaked, credentialGuard will catch
    // it before it leaves the process.
    record._xtream_credentials = xtreamCreds;
  }
  _playlists[id] = record;
  _playlistOrder.push(id);
  _trim();

  return res.status(200).json({
    id: record.id,
    name: record.name,
    provider_id: record.provider_id,
    source_type: record.source_type,
    channels_count: record.channels_count,
    created_at: record.created_at,
    persisted_provider_id: persistedProviderId,
  });
}

function _playlistProjectionFromProvider(row) {
  if (!row || !row.id) { return null; }
  if (row.type !== 'm3u' && row.type !== 'xtream') { return null; }
  var memory = null;
  for (var i = 0; i < _playlistOrder.length; i++) {
    var rec = _playlists[_playlistOrder[i]];
    if (rec && rec._persisted_provider_id === row.id) {
      memory = rec;
      break;
    }
  }
  return {
    id: row.id,
    playlist_id: memory ? memory.id : undefined,
    name: row.label || (memory && memory.name) || 'Provider',
    provider_id: row.provider_id || (memory && memory.provider_id) || 'custom',
    source_type: row.type === 'xtream' ? 'xtream' : 'url',
    channels_count: memory ? memory.channels_count : 0,
    created_at: row.created_at || (memory && memory.created_at) || null,
    persisted_provider_id: row.id,
    enabled: row.enabled !== false,
    url_host: row.url_host || undefined,
  };
}

// GET /api/playlists
async function handleList(req, res) {
  var providerStore = require('../lib/providerStore');
  try {
    var rows = await providerStore.list();
    var list = rows.map(_playlistProjectionFromProvider).filter(Boolean);
    return res.status(200).json({ playlists: list, total: list.length, source: 'providerStore' });
  } catch (err) {
    var SANITIZE3 = require('../lib/sanitizeLog').sanitizeForLog;
    console.warn('[playlists] durable list failed: ' + SANITIZE3(err && err.message ? err.message : 'unknown'));
    return res.status(500).json({
      error: 'playlist_list_failed',
      message: 'Could not load durable playlist providers.',
    });
  }
}

// DELETE /api/playlists/:id
async function handleDelete(req, res) {
  const id = req.params.id;
  var providerId = null;
  if (_playlists[id]) {
    providerId = _playlists[id]._persisted_provider_id || null;
    delete _playlists[id];
    _playlistOrder = _playlistOrder.filter(function(x) { return x !== id; });
  } else if (/^prov-[a-f0-9]{8,16}$/.test(String(id || ''))) {
    providerId = id;
  }

  if (!providerId) {
    return res.status(404).json({ error: 'not_found', id: id });
  }

  try {
    var providerStore = require('../lib/providerStore');
    var removed = await providerStore.remove(providerId);
    if (!removed) {
      return res.status(404).json({ error: 'not_found', id: id, persisted_provider_id: providerId });
    }
    return res.status(200).json({ deleted: true, id: id, persisted_provider_id: providerId });
  } catch (err) {
    var SANITIZE4 = require('../lib/sanitizeLog').sanitizeForLog;
    console.warn('[playlists] durable delete failed: ' + SANITIZE4(err && err.message ? err.message : 'unknown'));
    return res.status(500).json({
      error: 'playlist_delete_failed',
      message: 'Could not delete durable playlist provider.',
    });
  }
}

router.post('/api/playlists/preview', handlePreview);
router.post('/api/playlists/save', handleSave);
router.get('/api/playlists', handleList);
router.delete('/api/playlists/:id', handleDelete);

module.exports = router;
module.exports._internal = {
  _validateUrl: _validateUrl,
  _validateXtreamServerUrl: _validateXtreamServerUrl,
  _validateMacAddress: _validateMacAddress,
  _sanitiseName: _sanitiseName,
  _parseM3U: _parseM3U,
  _summarise: _summarise,
  _buildXtreamM3uUrl: _buildXtreamM3uUrl,
  _buildXtreamApiUrl: _buildXtreamApiUrl,
  _clear: function() { _playlists = {}; _playlistOrder = []; },
};
