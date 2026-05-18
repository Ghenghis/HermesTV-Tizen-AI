'use strict';

const { Router } = require('express');
const path = require('path');
const fs = require('fs');

const router = Router();

const CATALOG_PATH = path.resolve(__dirname, '../../../../upstream/apps-catalog.json');

// GET /api/upstream-apps — serve upstream apps catalog for Extensions panel
router.get('/api/upstream-apps', (req, res) => {
  if (!fs.existsSync(CATALOG_PATH)) {
    return res.status(503).json({
      error: 'catalog_unavailable',
      message: 'upstream/apps-catalog.json not found',
    });
  }

  try {
    const raw = fs.readFileSync(CATALOG_PATH, 'utf8');
    const catalog = JSON.parse(raw);

    // Optional ?priority= filter: tier1, tier2
    const { priority, platform, category } = req.query;

    let apps = catalog.apps || [];

    if (priority) {
      apps = apps.filter(function(a) { return a.priority === priority; });
    }
    if (platform) {
      apps = apps.filter(function(a) {
        return Array.isArray(a.platforms) && a.platforms.indexOf(platform) !== -1;
      });
    }
    if (category) {
      apps = apps.filter(function(a) { return a.category === category; });
    }

    res.json({
      version: catalog.version,
      generated: catalog.generated,
      total: apps.length,
      apps: apps,
    });
  } catch (e) {
    res.status(500).json({ error: 'catalog_parse_error', message: e.message });
  }
});

module.exports = router;
