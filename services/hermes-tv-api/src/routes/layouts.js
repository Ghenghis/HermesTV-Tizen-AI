'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');

const router = Router();

const MANIFESTS_DIR = path.resolve(
  __dirname,
  '../../../../apps/hermes-web-tv/src/layouts/manifests'
);

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
  res.json({ layouts: manifests, count: manifests.length });
});

module.exports = router;
