'use strict';

/**
 * routes/downloads.js — 1-click download surface (Zero-shell parity).
 *
 * The user wants 1-click downloads eventually, but DaveTV must not return
 * fake queue success until a real on-disk download worker exists. This route
 * validates the requested item/profile and then returns an honest 503.
 *
 *   POST /api/download
 *     body: { item_id, profile_id, season? (for series), episode_id? }
 *     503:  { error: 'download_pipeline_not_available', item_id }
 *     404:  { error: 'item_not_found', item_id }
 *     400:  validation errors
 *
 *   GET /api/download/:job_id
 *     503:  { error: 'download_pipeline_not_available' }
 *
 *   GET /api/download/:job_id/file
 *     503:  { error: 'download_pipeline_not_available' }
 *
 *   GET /api/downloads
 *     200:  { downloads: [], total: 0, pipeline_available: false }
 *
 *   DELETE /api/download/:job_id
 *     503:  { error: 'download_pipeline_not_available' }
 *
 * SECURITY CONTRACT
 *   - No upstream credentials ever surface here. The stream URL the
 *     download would consume goes through lib/streamResolver — same
 *     gate that play.js uses.
 *   - No in-memory job map exists in this disabled mode. Phase 4 must add a
 *     real worker and durable job store before this route can claim progress.
 */

const { Router } = require('express');
const router = Router();
const m3uClient = require('../lib/m3uClient');
const iptvOrg = require('../lib/iptvOrg');
const catalogMerge = require('../lib/catalogMerge');
const profileIds = require('../lib/profileIds');

// W17-PURGE: seed catalog is gone. Walk the per-provider caches +
// merged-catalog snapshot only. Cold caches return null and the caller
// surfaces an honest 404.
function _findItem(itemId) {
  if (typeof itemId !== 'string') { return null; }
  if (itemId.indexOf('m3u-') === 0) {
    var m = m3uClient.getCachedItemById(itemId);
    if (m) { return m; }
  } else if (itemId.indexOf('iptv-') === 0) {
    var o = iptvOrg.getCachedItemById(itemId);
    if (o) { return o; }
  }
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

function _pipelineUnavailable(res, extra) {
  var body = Object.assign({
    error: 'download_pipeline_not_available',
    message: 'Downloads are disabled until DaveTV has a real server-side download worker. No fake queue was created.',
    pipeline_available: false,
  }, extra || {});
  return res.status(503).json(body);
}

router.post('/api/download', (req, res) => {
  const body = req.body || {};
  const itemId = body.item_id;
  const profileId = body.profile_id;

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

  return _pipelineUnavailable(res, {
    item_id: item.id,
    profile_id: profileId,
  });
});

router.get('/api/download/:job_id', (req, res) => {
  return _pipelineUnavailable(res, { job_id: req.params.job_id });
});

router.get('/api/download/:job_id/file', (req, res) => {
  return _pipelineUnavailable(res, { job_id: req.params.job_id });
});

router.get('/api/downloads', (req, res) => {
  return res.status(200).json({ downloads: [], total: 0, pipeline_available: false });
});

router.delete('/api/download/:job_id', (req, res) => {
  return _pipelineUnavailable(res, { job_id: req.params.job_id });
});

// Exported for tests + future schema bridge.
module.exports = router;
module.exports._internal = {
  _findItem: _findItem,
  _pipelineUnavailable: _pipelineUnavailable,
};
