'use strict';

const { Router } = require('express');
const jellyfin = require('../lib/jellyfin');
const router = Router();

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const VALID_PROVIDERS = ['apollo_group', 'xtremehd', 'all'];

// X-Catalog-Source header values surfaced to the web/Tizen client so the UI
// can render a "Live Jellyfin" vs "Mock catalog" badge.
//   jellyfin            — successfully fetched from the workstation Jellyfin
//   mock-fallback       — JELLYFIN_URL+JELLYFIN_API_KEY set but the call
//                         failed (timeout, 4xx, 5xx, network), so we served
//                         the mock list with the X-Catalog-Source header so
//                         the operator can spot the degradation in DevTools.
//   mock-no-jellyfin    — JELLYFIN_URL or JELLYFIN_API_KEY not set — this is
//                         the default until the operator pastes credentials.
const CATALOG_SOURCE_HEADER = 'X-Catalog-Source';
const SRC_JELLYFIN = 'jellyfin';
const SRC_MOCK_FALLBACK = 'mock-fallback';
const SRC_MOCK_NO_JELLYFIN = 'mock-no-jellyfin';

// ---------------------------------------------------------------------------
// Actors — same 5 actors as in catalog.mock.json companion data.
// photo_url uses hermestv.local (no external CDN, no credentials).
// ---------------------------------------------------------------------------
// actor_id format: actor-NNN (matches actor.person.schema.json pattern ^actor-[0-9]{3,}$)
// and matches cast_ids references in catalog items (actor-001 format).
const ACTORS = [
  {
    actor_id: 'actor-001',
    name: 'Tom Cruise',
    photo_url: 'https://hermestv.local/mock/actors/actor-001.jpg',
  },
  {
    actor_id: 'actor-002',
    name: 'Ryan Gosling',
    photo_url: 'https://hermestv.local/mock/actors/actor-002.jpg',
  },
  {
    actor_id: 'actor-003',
    name: 'Keanu Reeves',
    photo_url: 'https://hermestv.local/mock/actors/actor-003.jpg',
  },
  {
    actor_id: 'actor-004',
    name: 'Julia Roberts',
    photo_url: 'https://hermestv.local/mock/actors/actor-004.jpg',
  },
  {
    actor_id: 'actor-005',
    name: 'Kevin Costner',
    photo_url: 'https://hermestv.local/mock/actors/actor-005.jpg',
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
    actors: ['actor-001'],
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
// Decide which catalog source to use for this request and return the result
// alongside a label for the X-Catalog-Source header. Never throws — Jellyfin
// failures fall back to mock cleanly.
async function resolveCatalog() {
  const hasJellyfinConfig = !!(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY);
  if (!hasJellyfinConfig) {
    return { items: [...CATALOG_ITEMS], source: SRC_MOCK_NO_JELLYFIN };
  }
  try {
    const jellyfinItems = await jellyfin.fetchCatalog();
    if (Array.isArray(jellyfinItems) && jellyfinItems.length > 0) {
      // Jellyfin items have a different shape from the schema-validated
      // mock fixture (provider_id='jellyfin', poster_url points at the
      // workstation). The frontend dispatches on provider_id when picking
      // a player URL, so this is safe to return through the same endpoint.
      return { items: jellyfinItems, source: SRC_JELLYFIN };
    }
    // Configured but the call returned an empty body — treat as a failure
    // so the operator gets a "mock-fallback" signal in DevTools instead
    // of an empty grid.
    return { items: [...CATALOG_ITEMS], source: SRC_MOCK_FALLBACK };
  } catch (err) {
    console.warn('[catalog] Jellyfin fetch failed (' + (err && err.code ? err.code : 'unknown') + '): ' + (err && err.message ? err.message : 'no message') + ' — serving mock');
    return { items: [...CATALOG_ITEMS], source: SRC_MOCK_FALLBACK };
  }
}

router.get('/api/catalog', async (req, res) => {
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

  const resolved = await resolveCatalog();
  let items = resolved.items;
  res.setHeader(CATALOG_SOURCE_HEADER, resolved.source);

  // Filtering by profile_access / providers array only applies to mock items —
  // Jellyfin items don't carry those fields. When we're serving Jellyfin
  // results we skip these filters entirely (the workstation library is
  // already gated by who can reach the API).
  const isJellyfin = resolved.source === SRC_JELLYFIN;

  // --- Profile filter (mock only) ---
  if (profile_id && !isJellyfin) {
    items = items.filter((item) => item.profile_access.includes(profile_id));
  }

  // --- Provider filter (mock only) ---
  // "all" is a no-op (explicit "show everything"). Any specific provider_id
  // filters to items where that provider appears in the providers array.
  if (provider_id && provider_id !== 'all' && !isJellyfin) {
    items = items.filter((item) =>
      Array.isArray(item.providers) &&
      item.providers.some((p) => p.provider_id === provider_id)
    );
  }

  // --- Quality sorting for mom_tv: 4K first, HDR-flagged items higher ---
  // Only meaningful for mock items (Jellyfin items use a different shape).
  if (profile_id === 'mom_tv' && !isJellyfin) {
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
    source: resolved.source,
  };

  res.json({ catalog: items, total: items.length, _meta });
});

module.exports = router;
