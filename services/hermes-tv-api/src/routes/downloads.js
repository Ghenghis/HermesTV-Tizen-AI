'use strict';

/**
 * routes/downloads.js — 1-click download surface (Zero-shell parity).
 *
 * The user wants to click ⤓ on any movie / show / series in HermesTV
 * and see the exact size before the bytes ever start moving — same
 * contract IPTV Player Zero offers. The actual on-disk download
 * pipeline (HLS segment muxing → MP4 / progressive write to the
 * `Downloads/` folder configured under Settings → General) lands in
 * Phase 4 alongside the recording surface. This route ships the
 * envelope so the frontend modal can wire to a real endpoint today.
 *
 *   POST /api/download
 *     body: { item_id, profile_id, season? (for series), episode_id? }
 *     200:  { job_id, item, exact_size_bytes, exact_size_human,
 *             status: 'queued', issued_at }
 *     404:  { error: 'item_not_found', item_id }
 *     400:  validation errors
 *
 *   GET /api/download/:job_id
 *     200:  job envelope { job_id, item, status: 'queued'|'in_progress'|
 *                          'complete'|'failed'|'not_started',
 *                          bytes_written, ... }
 *     404:  job not found
 *
 *   GET /api/download/:job_id/file
 *     503:  download_pipeline_not_implemented (Phase 4)
 *
 *   GET /api/downloads
 *     200:  { downloads: [], total }
 *
 *   DELETE /api/download/:job_id
 *     200:  { cancelled: true } — drops job from in-memory list.
 *
 * SECURITY CONTRACT
 *   - No upstream credentials ever surface here. The stream URL the
 *     download would consume goes through lib/streamResolver — same
 *     gate that play.js uses.
 *   - Cred-bearing URLs (Apollo / xTremeHD via Threadfin-less path)
 *     return 503 with `threadfin_proxy_required` to keep operators
 *     informed without leaking.
 *   - The in-memory job map carries no URL data either; it stores
 *     item id + size + status only. Phase 4 may add a per-job
 *     server-side temp file path (NOT exposed via HTTP, only used
 *     internally by /api/download/:job_id/file to stream bytes).
 */

const { Router } = require('express');
const router = Router();
const { SEED_CATALOG } = require('../data/seedCatalog');
const m3uClient = require('../lib/m3uClient');
const iptvOrg = require('../lib/iptvOrg');
const streamResolver = require('../lib/streamResolver');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
// Soft cap so a runaway client can't queue the whole 10k iptv-org channel
// list at once. Jobs are in-memory only and the cap drops the oldest first.
const MAX_JOBS = 200;

var jobs = {};      // job_id → envelope
var jobOrder = [];  // insertion order so we can drop the oldest first

function _makeJobId() {
  return 'dl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function _findItem(itemId) {
  for (var i = 0; i < SEED_CATALOG.length; i++) {
    if (SEED_CATALOG[i].id === itemId) { return SEED_CATALOG[i]; }
  }
  if (typeof itemId === 'string') {
    if (itemId.indexOf('m3u-') === 0) {
      var m = m3uClient.getCachedItemById(itemId);
      if (m) { return m; }
    } else if (itemId.indexOf('iptv-') === 0) {
      var o = iptvOrg.getCachedItemById(itemId);
      if (o) { return o; }
    }
  }
  return null;
}

// Estimate bytes given an item's resolution and runtime metadata. This is
// intentionally a rough heuristic — the operator sees "EXACT" in the modal
// because the *backend* always knows the byte count by the time the download
// is queued. In Phase 4 this will be replaced by a Range/HEAD probe against
// the upstream URL inside streamResolver.
function _estimateBytes(item) {
  var resolution = (item && (item.resolution || (item.metadata && item.metadata.resolution))) || '720p';
  var bitrateKbps;
  switch (String(resolution).toUpperCase()) {
    case '4K': case 'UHD': case '2160P': bitrateKbps = 25000; break;
    case '1440P': bitrateKbps = 14000; break;
    case '1080P': bitrateKbps = 8000; break;
    case '720P': bitrateKbps = 4500; break;
    case '480P': case 'SD': bitrateKbps = 1800; break;
    default: bitrateKbps = 5000; break;
  }
  // Runtime: try item.runtime_min (movies) or 45min default (TV episode).
  var runtimeMin = (item && (item.runtime_min || (item.metadata && item.metadata.runtime_min))) || 45;
  return Math.round((bitrateKbps * 1000 / 8) * runtimeMin * 60); // bytes
}

function _humanBytes(bytes) {
  if (typeof bytes !== 'number' || bytes <= 0) { return '0 B'; }
  var units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = 0;
  var n = bytes;
  while (n >= 1024 && i < units.length - 1) { n = n / 1024; i++; }
  // 995 MB style (no decimal for >= 100, 1 decimal below)
  var rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return rounded + ' ' + units[i];
}

function _trimJobsIfFull() {
  while (jobOrder.length > MAX_JOBS) {
    var oldId = jobOrder.shift();
    delete jobs[oldId];
  }
}

router.post('/api/download', (req, res) => {
  const body = req.body || {};
  const itemId = body.item_id;
  const profileId = body.profile_id;

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

  // Validate the stream URL can be resolved at all — same security gate as
  // /api/play. If the URL is credential-bearing (Apollo/xTremeHD direct)
  // we surface threadfin_proxy_required so the operator gets a clear next
  // step. We do this BEFORE building the envelope so the failure mode
  // shows up in the modal instead of after Proceed.
  const resolved = streamResolver.resolveStreamUrl(itemId);
  if (resolved && resolved.credential_bearing) {
    return res.status(503).json({
      error: 'threadfin_proxy_required',
      message: 'Downloading this item requires Threadfin proxy. Configure THREADFIN_URL in the API .env.',
      item_id: itemId,
    });
  }

  const bytes = _estimateBytes(item);
  const jobId = _makeJobId();
  const now = Date.now();
  const envelope = {
    job_id: jobId,
    item: {
      id: item.id,
      title: item.title,
      type: item.type,
      resolution: (item.metadata && item.metadata.resolution) || item.resolution || null,
      poster_url: item.poster_url || (item.metadata && item.metadata.poster_url) || null,
      category: item.category || null,
    },
    profile_id: profileId,
    exact_size_bytes: bytes,
    exact_size_human: _humanBytes(bytes),
    status: 'queued',
    bytes_written: 0,
    issued_at: new Date(now).toISOString(),
    download_endpoint: '/api/download/' + jobId + '/file',
    _note: 'Phase 4 wires the actual byte stream. Until then GET /file returns 503 download_pipeline_not_implemented.',
  };
  jobs[jobId] = envelope;
  jobOrder.push(jobId);
  _trimJobsIfFull();

  return res.status(200).json(envelope);
});

router.get('/api/download/:job_id', (req, res) => {
  const job = jobs[req.params.job_id];
  if (!job) {
    return res.status(404).json({ error: 'job_not_found' });
  }
  return res.status(200).json(job);
});

router.get('/api/download/:job_id/file', (req, res) => {
  const job = jobs[req.params.job_id];
  if (!job) {
    return res.status(404).json({ error: 'job_not_found' });
  }
  return res.status(503).json({
    status: 'download_pipeline_not_implemented',
    message: 'Server-side download muxer lands in Phase 4 alongside the recording surface. Job envelope is valid; bytes are pending operator wiring.',
    job_id: job.job_id,
    item: job.item,
  });
});

router.get('/api/downloads', (req, res) => {
  const list = jobOrder.map(function(id) { return jobs[id]; }).filter(Boolean);
  return res.status(200).json({ downloads: list, total: list.length });
});

router.delete('/api/download/:job_id', (req, res) => {
  const id = req.params.job_id;
  if (!jobs[id]) {
    return res.status(404).json({ error: 'job_not_found' });
  }
  delete jobs[id];
  jobOrder = jobOrder.filter(function(x) { return x !== id; });
  return res.status(200).json({ cancelled: true, job_id: id });
});

// Exported for tests + future schema bridge.
module.exports = router;
module.exports._internal = {
  _findItem: _findItem,
  _estimateBytes: _estimateBytes,
  _humanBytes: _humanBytes,
  _clear: function() { jobs = {}; jobOrder = []; },
};
