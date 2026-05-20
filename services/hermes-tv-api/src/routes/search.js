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
const iptvOrg = require('../lib/iptvOrg');
const m3uClient = require('../lib/m3uClient');
const catalogMerge = require('../lib/catalogMerge');

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const MAX_RESULTS = 100;

// W17-PURGE: search now walks real provider caches via the last merged
// catalog snapshot (populated by /api/catalog). When nothing has been
// merged yet (cold cache) we fall back to the per-provider caches directly.
// No seed catalog, no hard-coded actors.
function _allItems() {
  // Prefer the already-merged snapshot — it has cross-provider dedupe.
  try {
    var snap = catalogMerge.getLastMerged && catalogMerge.getLastMerged();
    if (Array.isArray(snap) && snap.length > 0) { return snap; }
  } catch (_) {}
  // Fallback: union of the per-provider caches.
  var out = [];
  try {
    if (iptvOrg.isEnabled()) {
      var orgItems = iptvOrg.fetchCatalog({ limit: 500 });
      if (Array.isArray(orgItems)) { out = out.concat(orgItems); }
    }
  } catch (_) {}
  try {
    if (m3uClient.isEnabled() && typeof m3uClient.getCachedCatalog === 'function') {
      var m3uItems = m3uClient.getCachedCatalog();
      if (Array.isArray(m3uItems)) { out = out.concat(m3uItems); }
    }
  } catch (_) {}
  return out;
}

function _categorySet() {
  var set = {};
  var items = _allItems();
  for (var i = 0; i < items.length; i++) {
    if (items[i] && items[i].category) { set[items[i].category] = true; }
  }
  return set;
}

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

  var candidates = _allItems().slice();
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
      source: candidates.length > 0 ? 'providers' : 'no-providers',
      profile_filter: profileId || null,
      type_filter: type || null,
      limit: limit,
    },
  });
});

// ─── GET /api/search/actor/:actorId ──────────────────────────────────────────
// W17-PURGE: actor data was hard-coded (Tom Cruise / Ryan Gosling / ...) under
// the old seed. Real TMDB / Jellyfin cast wiring is out of scope here, so
// this endpoint now reports "actor_not_found" until that wiring lands. We
// keep the route so existing clients still get a structured 404 rather than
// a network error.
router.get('/api/search/actor/:actorId', (req, res) => {
  const actorId = req.params.actorId;
  const profileId = req.query.profile_id;

  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  // Search providers for items whose metadata.cast_ids carries this id.
  var items = _allItems().filter(function(i) {
    const cast = i && i.metadata && Array.isArray(i.metadata.cast_ids) ? i.metadata.cast_ids : [];
    return cast.indexOf(actorId) !== -1;
  });
  items = _filterByProfile(items, profileId);

  if (items.length === 0) {
    return res.status(404).json({
      error: 'actor_not_found',
      actor_id: actorId,
      message: 'No provider returned items tagged with this actor. Cast metadata requires Jellyfin/TMDB wiring.',
    });
  }

  res.json({
    actor: { actor_id: actorId, name: null },
    items: items.map(_projectItem),
    total: items.length,
    _meta: { source: 'providers', profile_filter: profileId || null },
  });
});

// ─── GET /api/search/category/:category ──────────────────────────────────────
router.get('/api/search/category/:category', (req, res) => {
  const category = req.params.category;
  const profileId = req.query.profile_id;

  if (profileId !== undefined && !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  const categories = _categorySet();
  if (!categories[category]) {
    var available = Object.keys(categories).sort();
    return res.status(404).json({
      error: 'category_not_found',
      category: category,
      available_categories: available,
    });
  }

  var items = _allItems().filter(function(i) { return i && i.category === category; });
  items = _filterByProfile(items, profileId);

  res.json({
    category: category,
    items: items.map(_projectItem),
    total: items.length,
    _meta: { source: items.length > 0 ? 'providers' : 'no-providers', profile_filter: profileId || null },
  });
});

module.exports = router;
