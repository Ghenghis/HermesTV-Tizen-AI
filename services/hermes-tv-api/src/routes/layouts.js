'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');

const router = Router();

// In Docker the container won't have apps/hermes-web-tv/ in the filesystem
// (different build context), so the Dockerfile bakes the manifests in at a
// fixed location and sets HERMES_MANIFESTS_DIR to point at them. For local
// dev (npm run dev:api without Docker), fall back to the repo-relative path.
const MANIFESTS_DIR = process.env.HERMES_MANIFESTS_DIR
  || path.resolve(__dirname, '../../../../apps/hermes-web-tv/src/layouts/manifests');

router.get('/api/layouts', (req, res) => {
  let files;
  try {
    files = fs.readdirSync(MANIFESTS_DIR);
  } catch (e) {
    return res.status(503).json({
      error: 'manifests_unavailable',
      message: 'Layout manifests directory not found. Run the web app build first.',
    });
  }

  const manifests = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(MANIFESTS_DIR, file), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.id) manifests.push(parsed);
    } catch (_) {
      // skip malformed
    }
  }

  manifests.sort((a, b) => (a.id < b.id ? -1 : 1));
  // Layouts only change on deploy (manifests are bundled into the image), so
  // we can cache aggressively at the edge. 5 min hard, 1 hour stale-while-
  // revalidate. Browser cache stays short so dev iteration is immediate.
  res.setHeader(
    'Cache-Control',
    'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
  );
  res.setHeader('Vary', 'Accept-Encoding');
  res.json({ layouts: manifests, count: manifests.length });
});

module.exports = router;
