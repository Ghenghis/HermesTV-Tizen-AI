'use strict';

/**
 * routes/dvr.js — DVR / recording scheduling endpoints.
 *
 * Mirrors IPTV Player Zero's recording commands from TAURI_COMMANDS.md §9
 * (get_recording_settings, set_recording_settings, recording_poster_*) and
 * extends with schedule / list / cancel which Zero exposes via a separate
 * recording scheduler component.
 *
 * Until a real on-disk recording pipeline lands (Phase 4 alongside the
 * download muxer in routes/downloads.js), all "scheduled" recordings live
 * in an in-memory map. The endpoint shape stays stable so the frontend
 * can wire to a real endpoint today.
 *
 * SECURITY CONTRACT
 *   - All write endpoints (POST /schedule, DELETE /recording/:id, PATCH
 *     /settings) require a valid profile_id in the body or query so
 *     credential-scoped recordings can't be created anonymously.
 *   - Stream URLs are never returned or stored alongside recording
 *     envelopes — only the channel_id is captured and resolved at
 *     record-time via lib/streamResolver (Phase 4).
 *
 * MAPPING TO ZERO COMMANDS:
 *   POST   /api/dvr/schedule              ← schedule_recording (stub-envelope)
 *   GET    /api/dvr/recordings            ← list_recordings (in-memory)
 *   GET    /api/dvr/recording/:id         ← get_recording (in-memory)
 *   DELETE /api/dvr/recording/:id         ← cancel_recording (in-memory)
 *   GET    /api/dvr/settings              ← get_recording_settings (real)
 *   PATCH  /api/dvr/settings              ← set_recording_settings (real)
 *   POST   /api/dvr/recording/:id/poster  ← recording_poster_download (501)
 *   DELETE /api/dvr/recording/:id/poster  ← recording_poster_delete (501)
 */

const { Router } = require('express');
const router = Router();
const { LIVE_DEFS } = require('../data/seedCatalog');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const MAX_RECORDINGS = 100;

// In-memory recording store. envelope shape mirrors what Zero serialises in
// recording_settings.json.
var recordings = {};
var recordingOrder = [];

// Look up a channel slug in the seed live-channel list.
const KNOWN_CHANNELS = LIVE_DEFS.reduce(function(map, def) {
  map['live.' + def.slug] = def;
  return map;
}, {});

// Recording settings — global app-level (not per-profile).
var RECORDING_SETTINGS = {
  output_directory: '/var/lib/hermestv/recordings',
  format: 'mp4',           // mp4 | mkv | ts
  pre_roll_sec: 30,        // start recording N seconds early
  post_roll_sec: 120,      // keep recording for N seconds after scheduled end
  max_concurrent: 2,
  retention_days: 30,
  notify_on_complete: true,
  default_quality: '1080p',
};

const VALID_FORMATS = ['mp4', 'mkv', 'ts'];
const VALID_QUALITIES = ['480p', '720p', '1080p', '4K', '2160p'];

function _makeRecordingId() {
  return 'rec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function _trim() {
  while (recordingOrder.length > MAX_RECORDINGS) {
    var oldId = recordingOrder.shift();
    delete recordings[oldId];
  }
}

// ─── POST /api/dvr/schedule ──────────────────────────────────────────────────
// Body: { channel_id, profile_id, start_utc, end_utc, title?, series_id? }
router.post('/api/dvr/schedule', (req, res) => {
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
  if (!body.start_utc || isNaN(Date.parse(body.start_utc))) {
    return res.status(400).json({ error: 'validation_failed', message: 'start_utc must be a valid ISO 8601 date' });
  }
  if (!body.end_utc || isNaN(Date.parse(body.end_utc))) {
    return res.status(400).json({ error: 'validation_failed', message: 'end_utc must be a valid ISO 8601 date' });
  }

  const startMs = Date.parse(body.start_utc);
  const endMs = Date.parse(body.end_utc);
  if (endMs <= startMs) {
    return res.status(400).json({ error: 'validation_failed', message: 'end_utc must be after start_utc' });
  }
  if ((endMs - startMs) > 6 * 60 * 60 * 1000) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Recording duration cannot exceed 6 hours',
    });
  }

  // Reject unknown fields to keep the contract tight.
  const ALLOWED = ['channel_id', 'profile_id', 'start_utc', 'end_utc', 'title', 'series_id'];
  for (const key of Object.keys(body)) {
    if (!ALLOWED.includes(key)) {
      return res.status(400).json({ error: 'validation_failed', message: 'unknown field: ' + key });
    }
  }

  const channelMeta = KNOWN_CHANNELS[body.channel_id] || null;
  const recordingId = _makeRecordingId();
  const envelope = {
    recording_id: recordingId,
    channel_id: body.channel_id,
    channel_display_name: channelMeta ? channelMeta.title : null,
    title: body.title || (channelMeta ? channelMeta.title : 'Untitled Recording'),
    series_id: body.series_id || null,
    profile_id: body.profile_id,
    start_utc: new Date(startMs).toISOString(),
    end_utc: new Date(endMs).toISOString(),
    duration_sec: Math.round((endMs - startMs) / 1000),
    status: 'scheduled', // scheduled | recording | complete | failed | cancelled
    bytes_written: 0,
    file_path: null,     // never exposed to client even when set
    poster_url: null,
    created_utc: new Date().toISOString(),
    _note: 'Phase 4 wires the actual recording muxer. Until then, status stays at "scheduled".',
  };

  recordings[recordingId] = envelope;
  recordingOrder.push(recordingId);
  _trim();

  res.json({ success: true, recording: envelope });
});

// ─── GET /api/dvr/recordings ─────────────────────────────────────────────────
// Optional ?profile_id=... filter.
router.get('/api/dvr/recordings', (req, res) => {
  const profileId = req.query.profile_id;
  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  // Hide internal file_path from the listing response.
  const list = recordingOrder.map(function(id) {
    const r = recordings[id];
    if (!r) { return null; }
    if (profileId && r.profile_id !== profileId) { return null; }
    var safe = { ...r };
    delete safe.file_path;
    return safe;
  }).filter(Boolean);

  res.json({
    recordings: list,
    total: list.length,
    _meta: { source: 'in-memory', profile_filter: profileId || null },
  });
});

// ─── GET /api/dvr/recording/:id ──────────────────────────────────────────────
router.get('/api/dvr/recording/:id', (req, res) => {
  const r = recordings[req.params.id];
  if (!r) { return res.status(404).json({ error: 'recording_not_found' }); }
  var safe = { ...r };
  delete safe.file_path;
  res.json(safe);
});

// ─── DELETE /api/dvr/recording/:id ───────────────────────────────────────────
router.delete('/api/dvr/recording/:id', (req, res) => {
  const r = recordings[req.params.id];
  if (!r) { return res.status(404).json({ error: 'recording_not_found' }); }
  // Require profile_id in body to authorise the cancel (write op).
  const body = req.body || {};
  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required in body and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  recordings[req.params.id].status = 'cancelled';
  delete recordings[req.params.id];
  recordingOrder = recordingOrder.filter(function(x) { return x !== req.params.id; });
  res.json({ success: true, cancelled: true, recording_id: req.params.id });
});

// ─── GET /api/dvr/settings ───────────────────────────────────────────────────
router.get('/api/dvr/settings', (req, res) => {
  res.json({ ...RECORDING_SETTINGS, _meta: { source: 'in-memory' } });
});

// ─── PATCH /api/dvr/settings ─────────────────────────────────────────────────
router.patch('/api/dvr/settings', (req, res) => {
  const body = req.body || {};
  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  const { profile_id, ...rest } = body;
  const errors = {};

  if (rest.output_directory !== undefined && (typeof rest.output_directory !== 'string' || !rest.output_directory)) {
    errors.output_directory = 'must be a non-empty string';
  }
  if (rest.format !== undefined && !VALID_FORMATS.includes(rest.format)) {
    errors.format = 'must be one of: ' + VALID_FORMATS.join(', ');
  }
  if (rest.pre_roll_sec !== undefined) {
    if (typeof rest.pre_roll_sec !== 'number' || rest.pre_roll_sec < 0 || rest.pre_roll_sec > 600) {
      errors.pre_roll_sec = 'must be a number 0-600';
    }
  }
  if (rest.post_roll_sec !== undefined) {
    if (typeof rest.post_roll_sec !== 'number' || rest.post_roll_sec < 0 || rest.post_roll_sec > 1800) {
      errors.post_roll_sec = 'must be a number 0-1800';
    }
  }
  if (rest.max_concurrent !== undefined) {
    if (typeof rest.max_concurrent !== 'number' || rest.max_concurrent < 1 || rest.max_concurrent > 8) {
      errors.max_concurrent = 'must be a number 1-8';
    }
  }
  if (rest.retention_days !== undefined) {
    if (typeof rest.retention_days !== 'number' || rest.retention_days < 1 || rest.retention_days > 365) {
      errors.retention_days = 'must be a number 1-365';
    }
  }
  if (rest.notify_on_complete !== undefined && typeof rest.notify_on_complete !== 'boolean') {
    errors.notify_on_complete = 'must be a boolean';
  }
  if (rest.default_quality !== undefined && !VALID_QUALITIES.includes(rest.default_quality)) {
    errors.default_quality = 'must be one of: ' + VALID_QUALITIES.join(', ');
  }

  const ALLOWED = ['output_directory', 'format', 'pre_roll_sec', 'post_roll_sec', 'max_concurrent', 'retention_days', 'notify_on_complete', 'default_quality'];
  for (const key of Object.keys(rest)) {
    if (!ALLOWED.includes(key)) {
      errors[key] = 'unknown field';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'validation_failed', fields: errors });
  }

  RECORDING_SETTINGS = { ...RECORDING_SETTINGS, ...rest };
  res.json({ success: true, ...RECORDING_SETTINGS });
});

// ─── POST /api/dvr/recording/:id/poster ──────────────────────────────────────
// Maps to: recording_poster_download({ recording_id, url })
// Poster download to disk lands in Phase 4 alongside the recording muxer.
router.post('/api/dvr/recording/:id/poster', (req, res) => {
  const r = recordings[req.params.id];
  if (!r) { return res.status(404).json({ error: 'recording_not_found' }); }
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
  console.warn('[dvr] recording_poster_download requested but poster cache not implemented (Phase 4)');
  res.status(501).json({
    error: 'not_implemented',
    message: 'Recording poster cache lands in Phase 4 alongside the recording muxer.',
  });
});

// ─── DELETE /api/dvr/recording/:id/poster ────────────────────────────────────
router.delete('/api/dvr/recording/:id/poster', (req, res) => {
  const r = recordings[req.params.id];
  if (!r) { return res.status(404).json({ error: 'recording_not_found' }); }
  const body = req.body || {};
  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  console.warn('[dvr] recording_poster_delete requested but poster cache not implemented (Phase 4)');
  res.status(501).json({
    error: 'not_implemented',
    message: 'Recording poster cache lands in Phase 4.',
  });
});

module.exports = router;
module.exports._internal = {
  _clear: function() { recordings = {}; recordingOrder = []; },
  _getSettings: function() { return RECORDING_SETTINGS; },
};
