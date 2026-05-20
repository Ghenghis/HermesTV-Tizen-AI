'use strict';

// GET /api/version — diagnostics + ops visibility into the running build.
// Returns service identity, package version, node runtime, optional build/git
// metadata from env, and uptime in seconds since this module was first
// loaded. No credentials, no provider data.
//
// git_sha resolution order (first non-empty wins):
//   1. HERMES_GIT_SHA   — legacy/explicit name
//   2. GIT_SHA          — short canonical name (Docker build-arg + compose env)
//   3. SOURCE_COMMIT    — Docker Hub auto-build convention (kept as fallback)
//   4. 'unknown'        — env was not injected; build pipeline regression
//
// The Docker build accepts ARG GIT_SHA and the VPS deploy workflow exports
// GIT_SHA=$(git rev-parse HEAD) before `docker compose build`, so a fresh
// VPS redeploy should never return 'unknown'.
const { Router } = require('express');
const pkg = require('../../package.json');

const startupTime = Date.now();
const router = Router();

function resolveGitSha() {
  return process.env.HERMES_GIT_SHA
    || process.env.GIT_SHA
    || process.env.SOURCE_COMMIT
    || 'unknown';
}

router.get('/api/version', function(req, res) {
  res.json({
    service: 'hermes-tv-api',
    brand: 'DaveTV',
    version: pkg.version,
    node_version: process.version,
    git_sha: resolveGitSha(),
    build_time_utc: process.env.HERMES_BUILD_TIME || new Date(startupTime).toISOString(),
    uptime_seconds: Math.floor((Date.now() - startupTime) / 1000),
    ts: new Date().toISOString()
  });
});

module.exports = router;
