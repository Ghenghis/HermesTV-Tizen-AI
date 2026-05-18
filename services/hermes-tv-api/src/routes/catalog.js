'use strict';

const { Router } = require('express');
const router = Router();

const VALID_PROFILES = ['dave_tv', 'mom_tv'];

// Hardcoded mock catalog — TV-safe, no stream URLs, no credentials.
// Shape matches mock/catalog.mock.json catalog array.
const CATALOG_ITEMS = [
  {
    id: 'ch-001',
    type: 'live',
    title: 'ESPN',
    provider: 'apollo',
    category: 'sports',
    logo_url: 'https://hermestv.local/assets/logos/espn.png',
    profile_access: ['dave_tv', 'mom_tv'],
    metadata: {
      resolution: '1080p',
      has_catchup: true,
    },
  },
  {
    id: 'ch-002',
    type: 'live',
    title: 'HGTV',
    provider: 'apollo',
    category: 'lifestyle',
    logo_url: 'https://hermestv.local/assets/logos/hgtv.png',
    profile_access: ['dave_tv', 'mom_tv'],
    metadata: {
      resolution: '1080p',
      has_catchup: true,
    },
  },
  {
    id: 'ch-003',
    type: 'live',
    title: 'NFL RedZone',
    provider: 'xtremehd',
    category: 'sports',
    logo_url: 'https://hermestv.local/assets/logos/nfl-redzone.png',
    profile_access: ['dave_tv'],
    metadata: {
      resolution: '1080p',
      has_catchup: false,
    },
  },
  {
    id: 'ch-004',
    type: 'live',
    title: 'Hallmark Channel',
    provider: 'apollo',
    category: 'entertainment',
    logo_url: 'https://hermestv.local/assets/logos/hallmark.png',
    profile_access: ['mom_tv'],
    metadata: {
      resolution: '1080p',
      has_catchup: true,
    },
  },
  {
    id: 'vod-001',
    type: 'vod',
    title: 'Top Gun: Maverick',
    provider: 'xtremehd',
    category: 'movies',
    logo_url: 'https://hermestv.local/assets/logos/top-gun-maverick.png',
    profile_access: ['dave_tv', 'mom_tv'],
    metadata: {
      resolution: '4K',
      duration_min: 130,
      year: 2022,
    },
  },
];

// GET /api/catalog
// Optional query param: ?profile_id=dave_tv|mom_tv — filters by profile_access
router.get('/api/catalog', (req, res) => {
  const { profile_id } = req.query;

  if (profile_id !== undefined && !VALID_PROFILES.includes(profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: `Invalid profile_id '${profile_id}'. Valid values: dave_tv, mom_tv`,
    });
  }

  let items = CATALOG_ITEMS;

  if (profile_id) {
    items = CATALOG_ITEMS.filter((item) =>
      item.profile_access.includes(profile_id)
    );
  }

  res.json({ catalog: items, total: items.length });
});

module.exports = router;
