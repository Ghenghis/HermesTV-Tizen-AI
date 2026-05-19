'use strict';

/**
 * routes/playlists.js — Playlist Import surface (m3u / XMLTV / xtream / stalker).
 *
 * Mirrors the IPTV Player Zero "Add Playlist" flow (docs/USER_JOURNEYS.md §1,
 * docs/DATA_FLOW.md §"Playlist Import Data Flow") onto the HermesTV API.
 *
 * Endpoints:
 *
 *   POST   /api/playlists/preview
 *     body: { type: 'url'|'file'|'xtream'|'stalker', ...source-specific }
 *     200:  { channels_count, groups_count, sample_channels[], _meta }
 *     400:  validation_failed (URL scheme, file size, missing fields, bad name)
 *     501:  not_implemented (xtream / stalker stubs)
 *     502:  upstream_unreachable (URL fetch failure)
 *
 *   POST   /api/playlists/save
 *     body: { name, provider_id, source: <same shape as /preview body> }
 *     200:  { id, name, provider_id, channels_count, created_at }
 *     400:  validation_failed
 *     501:  not_implemented (xtream / stalker)
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
 *   - xtream / stalker import returns 501 with `not_implemented` so the
 *     operator gets a clear "Xtream-Codes ingest lands in a follow-up"
 *     instead of a silent failure.
 *
 * STORE
 *   - In-memory only for Phase 1 (matches existing providers / downloads
 *     patterns in this service). A file-backed store can land in a follow-up
 *     once the operator confirms the import flow shape. Each saved record
 *     carries { id, name, provider_id, source_type, channels_count,
 *     created_at, _streams_by_local_id }.
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
const VALID_TYPES = ['url', 'file', 'xtream', 'stalker'];
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

// ── Handlers ──────────────────────────────────────────────────────────────

// POST /api/playlists/preview
// body shape:
//   { type: 'url', url: 'https://...' }
//   { type: 'file', text: '#EXTM3U\n...' }
//   { type: 'xtream', host, username, password }     // 501
//   { type: 'stalker', portal_url, mac }              // 501
async function handlePreview(req, res) {
  const body = req.body || {};
  const type = body.type;

  if (VALID_TYPES.indexOf(type) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'type must be one of: ' + VALID_TYPES.join(', '),
    });
  }

  if (type === 'xtream') {
    return res.status(501).json({
      error: 'not_implemented',
      message: 'Xtream-Codes ingest lands in a follow-up.',
      type: 'xtream',
    });
  }
  if (type === 'stalker') {
    return res.status(501).json({
      error: 'not_implemented',
      message: 'Stalker portal ingest lands in a follow-up.',
      type: 'stalker',
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
  const type = source.type;
  if (VALID_TYPES.indexOf(type) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'source.type must be one of: ' + VALID_TYPES.join(', '),
    });
  }

  if (type === 'xtream' || type === 'stalker') {
    return res.status(501).json({
      error: 'not_implemented',
      message: type === 'xtream'
        ? 'Xtream-Codes ingest lands in a follow-up.'
        : 'Stalker portal ingest lands in a follow-up.',
      type: type,
    });
  }

  var parsed = null;
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

  const id = _makeId();
  const record = {
    id: id,
    name: name,
    provider_id: providerId,
    source_type: type,
    channels_count: parsed.length,
    created_at: new Date(_now()).toISOString(),
    _streams_by_local_id: _buildStreamMap(parsed),
  };
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
  });
}

// GET /api/playlists
function handleList(req, res) {
  const list = _playlistOrder.map(function(id) {
    var r = _playlists[id];
    if (!r) { return null; }
    return {
      id: r.id,
      name: r.name,
      provider_id: r.provider_id,
      source_type: r.source_type,
      channels_count: r.channels_count,
      created_at: r.created_at,
    };
  }).filter(Boolean);
  return res.status(200).json({ playlists: list, total: list.length });
}

// DELETE /api/playlists/:id
function handleDelete(req, res) {
  const id = req.params.id;
  if (!_playlists[id]) {
    return res.status(404).json({ error: 'not_found', id: id });
  }
  delete _playlists[id];
  _playlistOrder = _playlistOrder.filter(function(x) { return x !== id; });
  return res.status(200).json({ deleted: true, id: id });
}

router.post('/api/playlists/preview', handlePreview);
router.post('/api/playlists/save', handleSave);
router.get('/api/playlists', handleList);
router.delete('/api/playlists/:id', handleDelete);

module.exports = router;
module.exports._internal = {
  _validateUrl: _validateUrl,
  _sanitiseName: _sanitiseName,
  _parseM3U: _parseM3U,
  _summarise: _summarise,
  _clear: function() { _playlists = {}; _playlistOrder = []; },
};
