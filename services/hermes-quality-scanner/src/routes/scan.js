'use strict';

const { Router } = require('express');
const { probe }  = require('../ffprobeRunner');
const { normalize } = require('../normalizer');
const cache      = require('../cache');

const router = Router();

// TTL for cached scan results: 30 minutes
const CACHE_TTL_MS = 30 * 60 * 1000;

// Allowed characters for stream_id: alphanumeric and underscore
const STREAM_ID_RE = /^[a-zA-Z0-9_]+$/;

function isValidStreamId(id) {
  return typeof id === 'string' && id.length > 0 && STREAM_ID_RE.test(id);
}

// ---------------------------------------------------------------------------
// POST /scan
// Body: { stream_id, stream_url, provider_id }
// NEVER logs stream_url.
// ---------------------------------------------------------------------------
router.post('/scan', (req, res) => {
  const { stream_id, stream_url, provider_id } = req.body || {};

  // Validate stream_id
  if (!isValidStreamId(stream_id)) {
    return res.status(422).json({
      error: true,
      stream_id: stream_id || null,
      failure_mode: null,
      message: 'stream_id is required and must be alphanumeric with underscores only',
    });
  }

  // Validate stream_url present (don't log it)
  if (!stream_url || typeof stream_url !== 'string' || stream_url.trim() === '') {
    return res.status(422).json({
      error: true,
      stream_id,
      failure_mode: null,
      message: 'stream_url is required',
    });
  }

  const safeProviderId = provider_id || 'unknown';

  probe(stream_id, safeProviderId, stream_url, (err, rawFfprobe) => {
    if (err) {
      const failureMode = err.failure_mode || 'probe_error';
      return res.status(422).json({
        error: true,
        stream_id,
        failure_mode: failureMode,
        message: err.message || 'Probe failed',
      });
    }

    const result = normalize(stream_id, rawFfprobe);

    // Cache successful result
    cache.set(stream_id, result, CACHE_TTL_MS);

    return res.json(result);
  });
});

// ---------------------------------------------------------------------------
// GET /scan/:stream_id
// Returns cached result or 404.
// ---------------------------------------------------------------------------
router.get('/scan/:stream_id', (req, res) => {
  const { stream_id } = req.params;

  if (!isValidStreamId(stream_id)) {
    return res.status(422).json({
      error: true,
      stream_id,
      failure_mode: null,
      message: 'stream_id must be alphanumeric with underscores only',
    });
  }

  const cached = cache.get(stream_id);
  if (!cached) {
    return res.status(404).json({
      error: true,
      stream_id,
      message: 'No cached result found for this stream_id',
    });
  }

  return res.json(cached);
});

module.exports = router;
