'use strict';

// GET /api/version — diagnostics + ops visibility into the running build.
// Returns service identity, package version, node runtime, optional build/git
// metadata from env (HERMES_GIT_SHA, HERMES_BUILD_TIME), and uptime in seconds
// since this module was first loaded. No credentials, no provider data.
const { Router } = require('express');
const pkg = require('../../package.json');

const startupTime = Date.now();
const router = Router();

router.get('/api/version', function(req, res) {
  res.json({
    service: 'hermes-tv-api',
    brand: 'DaveTV',
    version: pkg.version,
    node_version: process.version,
    git_sha: process.env.HERMES_GIT_SHA || 'unknown',
    build_time_utc: process.env.HERMES_BUILD_TIME || new Date(startupTime).toISOString(),
    uptime_seconds: Math.floor((Date.now() - startupTime) / 1000),
    ts: new Date().toISOString()
  });
});

module.exports = router;
