'use strict';

const { Router } = require('express');
const router = Router();

// TV-safe provider summaries — no credentials, no stream URLs, no API keys.
// Shape matches schemas/provider.profile.schema.json
const PROVIDERS = [
  {
    provider_id: 'apollo',
    display_name: 'Apollo Group',
    health: 'ok',
    capabilities: ['live', 'vod', 'series', 'catch_up', 'xmltv'],
    connection_slots: {
      total: 2,
      in_use: 0,
    },
  },
  {
    provider_id: 'xtremehd',
    display_name: 'XtremeHD',
    health: 'ok',
    capabilities: ['live', 'vod', 'series', 'xmltv'],
    connection_slots: {
      total: 2,
      in_use: 0,
    },
  },
];

// GET /api/providers
router.get('/api/providers', (req, res) => {
  res.json({ providers: PROVIDERS });
});

module.exports = router;
