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

// Resolution sort order for quality-aware sorting (higher index = higher quality)
const RESOLUTION_ORDER = {
  '4K': 4,
  '2160p': 4,
  '1080p': 3,
  '720p': 2,
  '480p': 1,
};

// Quality preference map per profile (mirrors profiles.js quality_preference)
const PROFILE_QUALITY_PREFS = {
  mom_tv: {
    resolution_floor: '1080p',
    prefer_4k: true,
    hdr_preferred: true,
    bitrate_floor_kbps: 4000,
  },
  dave_tv: {
    resolution_floor: '720p',
    prefer_4k: false,
    hdr_preferred: false,
    bitrate_floor_kbps: 2000,
  },
};

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

  let items = [...CATALOG_ITEMS];

  if (profile_id) {
    items = items.filter((item) =>
      item.profile_access.includes(profile_id)
    );
  }

  // Quality sorting for mom_tv: 4K first (resolution DESC), HDR-flagged items higher
  if (profile_id === 'mom_tv') {
    items.sort((a, b) => {
      const resA = RESOLUTION_ORDER[a.metadata?.resolution] || 0;
      const resB = RESOLUTION_ORDER[b.metadata?.resolution] || 0;
      if (resB !== resA) { return resB - resA; }

      // Secondary: HDR items sorted higher
      const hdrA = a.metadata?.hdr_format ? 1 : 0;
      const hdrB = b.metadata?.hdr_format ? 1 : 0;
      return hdrB - hdrA;
    });
  }

  const quality_preference = profile_id ? (PROFILE_QUALITY_PREFS[profile_id] || null) : null;

  const _meta = {
    sorted_for_profile: profile_id || null,
    quality_preference,
  };

  res.json({ catalog: items, total: items.length, _meta });
});

module.exports = router;
