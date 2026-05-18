'use strict';

const { Router } = require('express');
const router = Router();

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const VALID_PROVIDERS = ['apollo_group', 'xtremehd', 'all'];

// ---------------------------------------------------------------------------
// Actors — same 5 actors as in catalog.mock.json companion data.
// photo_url uses hermestv.local (no external CDN, no credentials).
// ---------------------------------------------------------------------------
const ACTORS = [
  {
    actor_id: 'act-001',
    name: 'Tom Cruise',
    photo_url: 'https://hermestv.local/assets/actors/tom-cruise.jpg',
  },
  {
    actor_id: 'act-002',
    name: 'Ryan Gosling',
    photo_url: 'https://hermestv.local/assets/actors/ryan-gosling.jpg',
  },
  {
    actor_id: 'act-003',
    name: 'Keanu Reeves',
    photo_url: 'https://hermestv.local/assets/actors/keanu-reeves.jpg',
  },
  {
    actor_id: 'act-004',
    name: 'Julia Roberts',
    photo_url: 'https://hermestv.local/assets/actors/julia-roberts.jpg',
  },
  {
    actor_id: 'act-005',
    name: 'Kevin Costner',
    photo_url: 'https://hermestv.local/assets/actors/kevin-costner.jpg',
  },
];

// ---------------------------------------------------------------------------
// Catalog items — providers array format.
// Each provider entry: { provider_id, source_id, source_health }
// Backward-compat: top-level `provider` string is preserved where it existed.
// source_health mirrors catalog.mock.json provider_health shape.
// ---------------------------------------------------------------------------
const CATALOG_ITEMS = [
  {
    id: 'ch-001',
    type: 'live',
    title: 'ESPN',
    // backward-compat legacy field
    provider: 'apollo_group',
    category: 'sports',
    logo_url: 'https://hermestv.local/assets/logos/espn.png',
    profile_access: ['dave_tv', 'mom_tv'],
    providers: [
      {
        provider_id: 'apollo_group',
        source_id: 'apl-live-espn',
        source_health: { status: 'ok', latency_ms: 42, checked_utc: '2026-05-17T04:00:00Z' },
      },
      {
        provider_id: 'xtremehd',
        source_id: 'xhd-live-espn',
        source_health: { status: 'ok', latency_ms: 58, checked_utc: '2026-05-17T04:02:00Z' },
      },
    ],
    metadata: {
      resolution: '1080p',
      has_catchup: true,
    },
  },
  {
    id: 'ch-002',
    type: 'live',
    title: 'HGTV',
    provider: 'apollo_group',
    category: 'lifestyle',
    logo_url: 'https://hermestv.local/assets/logos/hgtv.png',
    profile_access: ['dave_tv', 'mom_tv'],
    providers: [
      {
        provider_id: 'apollo_group',
        source_id: 'apl-live-hgtv',
        source_health: { status: 'ok', latency_ms: 38, checked_utc: '2026-05-17T04:00:00Z' },
      },
    ],
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
    providers: [
      {
        provider_id: 'xtremehd',
        source_id: 'xhd-live-nfl-redzone',
        source_health: { status: 'ok', latency_ms: 61, checked_utc: '2026-05-17T04:02:00Z' },
      },
    ],
    metadata: {
      resolution: '1080p',
      has_catchup: false,
    },
  },
  {
    id: 'ch-004',
    type: 'live',
    title: 'Hallmark Channel',
    provider: 'apollo_group',
    category: 'entertainment',
    logo_url: 'https://hermestv.local/assets/logos/hallmark.png',
    profile_access: ['mom_tv'],
    providers: [
      {
        provider_id: 'apollo_group',
        source_id: 'apl-live-hallmark',
        source_health: { status: 'ok', latency_ms: 35, checked_utc: '2026-05-17T04:00:00Z' },
      },
    ],
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
    providers: [
      {
        provider_id: 'xtremehd',
        source_id: 'xhd-vod-top-gun-maverick',
        source_health: { status: 'ok', latency_ms: 55, checked_utc: '2026-05-17T04:02:00Z' },
      },
      {
        provider_id: 'apollo_group',
        source_id: 'apl-vod-top-gun-maverick',
        source_health: { status: 'ok', latency_ms: 48, checked_utc: '2026-05-17T04:00:00Z' },
      },
    ],
    metadata: {
      resolution: '4K',
      duration_min: 130,
      year: 2022,
    },
    actors: ['act-001'],
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

// ---------------------------------------------------------------------------
// GET /api/actors
// Returns the full actor list. No filtering — actors are profile-agnostic.
// ---------------------------------------------------------------------------
router.get('/api/actors', (req, res) => {
  res.json({ actors: ACTORS, total: ACTORS.length });
});

// ---------------------------------------------------------------------------
// GET /api/catalog
// Optional query params:
//   ?profile_id=dave_tv|mom_tv  — filters by profile_access
//   ?provider_id=apollo_group|xtremehd|all — filters by providers array membership
// Both params may be combined.
// ---------------------------------------------------------------------------
router.get('/api/catalog', (req, res) => {
  const { profile_id, provider_id } = req.query;

  if (profile_id !== undefined && !VALID_PROFILES.includes(profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: `Invalid profile_id '${profile_id}'. Valid values: dave_tv, mom_tv`,
    });
  }

  if (
    provider_id !== undefined &&
    !VALID_PROVIDERS.includes(provider_id)
  ) {
    return res.status(400).json({
      error: 'validation_failed',
      message: `Invalid provider_id '${provider_id}'. Valid values: apollo_group, xtremehd, all`,
    });
  }

  let items = [...CATALOG_ITEMS];

  // --- Profile filter ---
  if (profile_id) {
    items = items.filter((item) => item.profile_access.includes(profile_id));
  }

  // --- Provider filter ---
  // "all" is a no-op (explicit "show everything"). Any specific provider_id
  // filters to items where that provider appears in the providers array.
  if (provider_id && provider_id !== 'all') {
    items = items.filter((item) =>
      Array.isArray(item.providers) &&
      item.providers.some((p) => p.provider_id === provider_id)
    );
  }

  // --- Quality sorting for mom_tv: 4K first, HDR-flagged items higher ---
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

  const quality_preference = profile_id
    ? (PROFILE_QUALITY_PREFS[profile_id] || null)
    : null;

  const _meta = {
    sorted_for_profile: profile_id || null,
    quality_preference,
    provider_filter: provider_id || null,
  };

  res.json({ catalog: items, total: items.length, _meta });
});

module.exports = router;
