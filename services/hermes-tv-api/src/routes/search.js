'use strict';

/**
 * routes/search.js — Full-text search, search-by-actor, search-by-category.
 *
 * No direct Zero equivalent in TAURI_COMMANDS.md surface — Zero exposes
 * filtering via the catalog get/filter calls. This route implements the
 * isomorphic REST surface so HermesTV chatbot commands ("find me a Tom
 * Cruise movie", "show me hallmark stuff", "search for stranger things")
 * have a clean endpoint to call.
 *
 * MAPPING:
 *   GET /api/search?q=...                     — full-text title + category search
 *   GET /api/search/actor/:actorId            — list items by actor
 *   GET /api/search/category/:category        — list items by category
 *
 * All endpoints are read-only and require no profile (optional ?profile_id
 * filter for access-list narrowing).
 */

const { Router } = require('express');
const router = Router();
const { SEED_CATALOG } = require('../data/seedCatalog');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const MAX_RESULTS = 100;

// Build a quick category lookup for the category endpoint.
const VALID_CATEGORIES = new Set();
SEED_CATALOG.forEach(function(i) {
  if (i.category) { VALID_CATEGORIES.add(i.category); }
});

// Same actor list as catalog.js — keep in sync.
const ACTORS = {
  'actor-001': 'Tom Cruise',
  'actor-002': 'Ryan Gosling',
  'actor-003': 'Keanu Reeves',
  'actor-004': 'Julia Roberts',
  'actor-005': 'Kevin Costner',
};

function _scoreItem(item, query) {
  const q = query.toLowerCase();
  const title = (item.title || '').toLowerCase();
  const category = (item.category || '').toLowerCase();
  var score = 0;
  if (title === q) { score += 10; }
  else if (title.indexOf(q) === 0) { score += 5; }
  else if (title.indexOf(q) !== -1) { score += 3; }
  if (category.indexOf(q) !== -1) { score += 1; }
  // Token overlap.
  const tokens = q.split(/\s+/).filter(Boolean);
  tokens.forEach(function(t) {
    if (title.indexOf(t) !== -1) { score += 0.5; }
  });
  return score;
}

function _filterByProfile(items, profileId) {
  if (!profileId) { return items; }
  return items.filter(function(i) {
    return !i.profile_access || i.profile_access.indexOf(profileId) !== -1;
  });
}

function _projectItem(item) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    category: item.category,
    poster_url: item.poster_url || null,
    logo_url: item.logo_url || null,
    resolution: (item.metadata && item.metadata.resolution) || item.resolution || null,
  };
}

// ─── GET /api/search?q=...&profile_id=...&type=... ───────────────────────────
router.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const profileId = req.query.profile_id;
  const type = req.query.type;
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_RESULTS) : 25;

  if (!q || q.length < 2) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'q query parameter is required (>= 2 chars)',
    });
  }
  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  const VALID_TYPES = ['live', 'vod', 'series'];
  if (type !== undefined && !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'type must be one of: ' + VALID_TYPES.join(', '),
    });
  }

  var candidates = SEED_CATALOG.slice();
  if (type) { candidates = candidates.filter(function(i) { return i.type === type; }); }
  candidates = _filterByProfile(candidates, profileId);

  const scored = candidates
    .map(function(i) { return { item: i, score: _scoreItem(i, q) }; })
    .filter(function(s) { return s.score > 0; });
  scored.sort(function(a, b) { return b.score - a.score; });

  const results = scored.slice(0, limit).map(function(s) {
    return { ..._projectItem(s.item), score: Number(s.score.toFixed(2)) };
  });

  res.json({
    query: q,
    results: results,
    total: scored.length,
    returned: results.length,
    _meta: {
      source: 'seed-catalog',
      profile_filter: profileId || null,
      type_filter: type || null,
      limit: limit,
    },
  });
});

// ─── GET /api/search/actor/:actorId ──────────────────────────────────────────
router.get('/api/search/actor/:actorId', (req, res) => {
  const actorId = req.params.actorId;
  const profileId = req.query.profile_id;

  if (!ACTORS[actorId]) {
    return res.status(404).json({ error: 'actor_not_found', actor_id: actorId });
  }
  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  // Match items whose metadata.cast_ids array contains this actor_id.
  var items = SEED_CATALOG.filter(function(i) {
    const cast = i.metadata && Array.isArray(i.metadata.cast_ids) ? i.metadata.cast_ids : [];
    return cast.indexOf(actorId) !== -1;
  });
  items = _filterByProfile(items, profileId);

  res.json({
    actor: { actor_id: actorId, name: ACTORS[actorId] },
    items: items.map(_projectItem),
    total: items.length,
    _meta: { source: 'seed-catalog', profile_filter: profileId || null },
  });
});

// ─── GET /api/search/category/:category ──────────────────────────────────────
router.get('/api/search/category/:category', (req, res) => {
  const category = req.params.category;
  const profileId = req.query.profile_id;

  if (!VALID_CATEGORIES.has(category)) {
    return res.status(404).json({
      error: 'category_not_found',
      category: category,
      available_categories: Array.from(VALID_CATEGORIES).sort(),
    });
  }
  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  var items = SEED_CATALOG.filter(function(i) { return i.category === category; });
  items = _filterByProfile(items, profileId);

  res.json({
    category: category,
    items: items.map(_projectItem),
    total: items.length,
    _meta: { source: 'seed-catalog', profile_filter: profileId || null },
  });
});

module.exports = router;
