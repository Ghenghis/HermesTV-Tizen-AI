'use strict';

/**
 * routes/series.js — Series, movies and continue-watching endpoints.
 *
 * Mirrors IPTV Player Zero's Tauri commands from TAURI_COMMANDS.md §6 and §7
 * (movies + series watch state) plus the continue-watching upsert/remove
 * pair from the movies block.
 *
 * Watch state is per-profile in-memory only. A real implementation would
 * persist to SQLite (matches Zero's `watched_episodes` and
 * `watched_movies` tables). The endpoint shape is stable so the frontend
 * can wire today.
 *
 * MAPPING TO ZERO COMMANDS:
 *   GET    /api/series                          ← xtream_list_series
 *   GET    /api/series/:seriesId                ← xtream_get_series_details
 *   GET    /api/series/:seriesId/next-episode   ← (no direct Zero equivalent; computed)
 *   POST   /api/series/episode/watched          ← mark_episode_viewed
 *   POST   /api/series/episodes/watched         ← mark_episodes_viewed_bulk
 *   POST   /api/series/episodes/unwatched       ← unmark_episodes_viewed_bulk
 *   POST   /api/series/:seriesId/favorite       ← toggle_series_favorite
 *   POST   /api/movies/:movieId/watched         ← mark_movie_watched
 *   POST   /api/movies/:movieId/favorite        ← toggle_movie_favorite
 *   GET    /api/continue-watching               ← get_continue_watching
 *   POST   /api/continue-watching               ← upsert_continue_watching_movie
 *   DELETE /api/continue-watching/:itemId       ← remove_continue_watching_movie
 */

const { Router } = require('express');
const router = Router();
const iptvOrg = require('../lib/iptvOrg');
const m3uClient = require('../lib/m3uClient');
const xtreamClient = require('../lib/xtreamClient');
const catalogMerge = require('../lib/catalogMerge');
const profileIds = require('../lib/profileIds');

const MAX_CONTINUE_WATCHING = 50;

// W17-PURGE: catalog lookups walk the real provider caches via the merged
// snapshot (populated by /api/catalog). The seed catalog is gone.
function _allItems() {
  try {
    var snap = catalogMerge.getLastMerged && catalogMerge.getLastMerged();
    if (Array.isArray(snap) && snap.length > 0) { return snap; }
  } catch (_) {}
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

// Per-profile in-memory state.
// watchedEpisodes[profile_id] = Set<episode_id>
// watchedMovies[profile_id]   = Set<movie_id>
// favorites[profile_id]       = { series: Set, movies: Set }
// continueWatching[profile_id] = [{ item_id, position_sec, duration_sec, updated_utc }]
var watchedEpisodes = { dave_tv: new Set(), mom_tv: new Set() };
var watchedMovies   = { dave_tv: new Set(), mom_tv: new Set() };
var favorites       = {
  dave_tv: { series: new Set(), movies: new Set() },
  mom_tv:  { series: new Set(), movies: new Set() },
};
var continueWatching = { dave_tv: [], mom_tv: [] };

function _ensureProfileState(profileId) {
  if (!profileId) { return; }
  if (!watchedEpisodes[profileId]) { watchedEpisodes[profileId] = new Set(); }
  if (!watchedMovies[profileId]) { watchedMovies[profileId] = new Set(); }
  if (!favorites[profileId]) { favorites[profileId] = { series: new Set(), movies: new Set() }; }
  if (!continueWatching[profileId]) { continueWatching[profileId] = []; }
}

function _findItem(itemId) {
  var items = _allItems();
  for (var i = 0; i < items.length; i++) {
    if (items[i] && items[i].id === itemId) { return items[i]; }
  }
  return null;
}

function _requireProfile(req, res) {
  const profileId = (req.body && req.body.profile_id) || (req.query && req.query.profile_id);
  if (!profileId || !profileIds.isValidProfileId(profileId)) {
    res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required. ' + profileIds.profileValidationMessage(),
    });
    return null;
  }
  _ensureProfileState(profileId);
  return profileId;
}

async function _episodesForItem(seriesItem) {
  if (!seriesItem || typeof seriesItem.id !== 'string') { return []; }
  if (seriesItem.id.indexOf('xtream-') === 0) {
    return xtreamClient.getSeriesEpisodesForItemId(seriesItem.id);
  }
  return [];
}

function _seasonCountFromEpisodes(episodes, item) {
  if (Array.isArray(episodes) && episodes.length > 0) {
    var seen = {};
    episodes.forEach(function(ep) {
      if (ep && ep.season != null) { seen[String(ep.season)] = true; }
    });
    return Object.keys(seen).length;
  }
  var meta = item && item.metadata ? item.metadata : {};
  return meta.season_count || meta.seasons || null;
}

// ─── GET /api/series ─────────────────────────────────────────────────────────
// Maps to: xtream_list_series
router.get('/api/series', (req, res) => {
  const profileId = req.query.profile_id;
  if (profileId !== undefined && !profileIds.isValidProfileId(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: profileIds.profileValidationMessage(),
    });
  }
  _ensureProfileState(profileId);

  var series = _allItems().filter(function(i) { return i && i.type === 'series'; });
  if (profileId) {
    series = series.filter(function(i) {
      return profileIds.itemVisibleToProfile(i, profileId);
    });
  }

  res.json({
    series: series.map(function(s) {
      const fav = profileId ? favorites[profileId].series.has(s.id) : false;
      return {
        id: s.id,
        title: s.title,
        type: s.type,
        poster_url: s.poster_url,
        category: s.category,
        favorite: fav,
      };
    }),
    total: series.length,
    _meta: { source: series.length > 0 ? 'providers' : 'no-providers', profile_filter: profileId || null },
  });
});

// ─── GET /api/series/:seriesId ───────────────────────────────────────────────
router.get('/api/series/:seriesId', async (req, res) => {
  const item = _findItem(req.params.seriesId);
  if (!item || item.type !== 'series') {
    return res.status(404).json({ error: 'series_not_found', series_id: req.params.seriesId });
  }
  const profileId = req.query.profile_id;
  if (profileId !== undefined && !profileIds.isValidProfileId(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: profileIds.profileValidationMessage(),
    });
  }
  _ensureProfileState(profileId);

  let episodes = [];
  try {
    episodes = await _episodesForItem(item);
  } catch (err) {
    console.warn('[series] episode metadata fetch failed: ' + (err && err.message ? err.message : 'unknown'));
    episodes = [];
  }
  const watchedSet = profileId ? watchedEpisodes[profileId] : new Set();
  const episodesWithState = episodes.map(function(ep) {
    return { ...ep, viewed: watchedSet.has(ep.episode_id) };
  });

  res.json({
    series: {
      id: item.id,
      title: item.title,
      type: item.type,
      poster_url: item.poster_url,
      category: item.category,
      season_count: _seasonCountFromEpisodes(episodes, item),
      episode_count: episodes.length,
      favorite: profileId ? favorites[profileId].series.has(item.id) : false,
    },
    episodes: episodesWithState,
    _meta: {
      source: 'providers',
      episode_source: episodes.length > 0 ? 'provider' : 'unavailable',
      profile_filter: profileId || null,
    },
  });
});

// ─── GET /api/series/:seriesId/next-episode ──────────────────────────────────
// Returns the first un-viewed episode for the given series + profile.
router.get('/api/series/:seriesId/next-episode', async (req, res) => {
  const item = _findItem(req.params.seriesId);
  if (!item || item.type !== 'series') {
    return res.status(404).json({ error: 'series_not_found' });
  }
  const profileId = req.query.profile_id;
  if (!profileId || !profileIds.isValidProfileId(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required. ' + profileIds.profileValidationMessage(),
    });
  }
  _ensureProfileState(profileId);

  let episodes = [];
  try {
    episodes = await _episodesForItem(item);
  } catch (_) {
    episodes = [];
  }
  if (episodes.length === 0) {
    return res.status(503).json({
      error: 'episode_metadata_unavailable',
      message: 'This provider did not return playable episode metadata for the selected series.',
      series_id: item.id,
    });
  }
  const watchedSet = watchedEpisodes[profileId];
  const next = episodes.find(function(ep) { return !watchedSet.has(ep.episode_id); });

  if (!next) {
    return res.json({ next_episode: null, all_watched: true, series_id: item.id });
  }
  res.json({
    next_episode: next,
    all_watched: false,
    series_id: item.id,
    _meta: { source: 'computed-from-watch-state' },
  });
});

// ─── POST /api/series/episode/watched ────────────────────────────────────────
// Body: { profile_id, episode_id, series_id? }
router.post('/api/series/episode/watched', (req, res) => {
  const profileId = _requireProfile(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  if (!body.episode_id || typeof body.episode_id !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'episode_id is required' });
  }
  watchedEpisodes[profileId].add(body.episode_id);
  res.json({
    success: true,
    episode_id: body.episode_id,
    series_id: body.series_id || null,
    profile_id: profileId,
    total_watched: watchedEpisodes[profileId].size,
  });
});

// ─── POST /api/series/episodes/watched ───────────────────────────────────────
// Body: { profile_id, episode_ids: string[] }
router.post('/api/series/episodes/watched', (req, res) => {
  const profileId = _requireProfile(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  if (!Array.isArray(body.episode_ids) || body.episode_ids.length === 0) {
    return res.status(400).json({ error: 'validation_failed', message: 'episode_ids must be a non-empty array' });
  }
  if (body.episode_ids.length > 500) {
    return res.status(400).json({ error: 'validation_failed', message: 'episode_ids cannot exceed 500 entries per request' });
  }
  body.episode_ids.forEach(function(id) {
    if (typeof id === 'string') { watchedEpisodes[profileId].add(id); }
  });
  res.json({
    success: true,
    marked_count: body.episode_ids.length,
    profile_id: profileId,
    total_watched: watchedEpisodes[profileId].size,
  });
});

// ─── POST /api/series/episodes/unwatched ─────────────────────────────────────
router.post('/api/series/episodes/unwatched', (req, res) => {
  const profileId = _requireProfile(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  if (!Array.isArray(body.episode_ids) || body.episode_ids.length === 0) {
    return res.status(400).json({ error: 'validation_failed', message: 'episode_ids must be a non-empty array' });
  }
  if (body.episode_ids.length > 500) {
    return res.status(400).json({ error: 'validation_failed', message: 'episode_ids cannot exceed 500 entries per request' });
  }
  body.episode_ids.forEach(function(id) {
    if (typeof id === 'string') { watchedEpisodes[profileId].delete(id); }
  });
  res.json({
    success: true,
    unmarked_count: body.episode_ids.length,
    profile_id: profileId,
    total_watched: watchedEpisodes[profileId].size,
  });
});

// ─── POST /api/series/:seriesId/favorite ─────────────────────────────────────
// Toggles favorite state. Body: { profile_id }.
router.post('/api/series/:seriesId/favorite', (req, res) => {
  const profileId = _requireProfile(req, res);
  if (!profileId) { return; }
  const item = _findItem(req.params.seriesId);
  if (!item || item.type !== 'series') {
    return res.status(404).json({ error: 'series_not_found' });
  }
  const set = favorites[profileId].series;
  if (set.has(item.id)) {
    set.delete(item.id);
  } else {
    set.add(item.id);
  }
  res.json({
    success: true,
    series_id: item.id,
    favorite: set.has(item.id),
    profile_id: profileId,
  });
});

// ─── POST /api/movies/:movieId/watched ───────────────────────────────────────
router.post('/api/movies/:movieId/watched', (req, res) => {
  const profileId = _requireProfile(req, res);
  if (!profileId) { return; }
  const item = _findItem(req.params.movieId);
  if (!item || (item.type !== 'vod' && item.type !== 'movie')) {
    return res.status(404).json({ error: 'movie_not_found' });
  }
  watchedMovies[profileId].add(item.id);
  res.json({
    success: true,
    movie_id: item.id,
    profile_id: profileId,
    total_watched_movies: watchedMovies[profileId].size,
  });
});

// ─── POST /api/movies/:movieId/favorite ──────────────────────────────────────
router.post('/api/movies/:movieId/favorite', (req, res) => {
  const profileId = _requireProfile(req, res);
  if (!profileId) { return; }
  const item = _findItem(req.params.movieId);
  if (!item || (item.type !== 'vod' && item.type !== 'movie')) {
    return res.status(404).json({ error: 'movie_not_found' });
  }
  const set = favorites[profileId].movies;
  if (set.has(item.id)) {
    set.delete(item.id);
  } else {
    set.add(item.id);
  }
  res.json({
    success: true,
    movie_id: item.id,
    favorite: set.has(item.id),
    profile_id: profileId,
  });
});

// ─── GET /api/continue-watching ──────────────────────────────────────────────
router.get('/api/continue-watching', (req, res) => {
  const profileId = req.query.profile_id;
  if (!profileId || !profileIds.isValidProfileId(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required. ' + profileIds.profileValidationMessage(),
    });
  }
  _ensureProfileState(profileId);
  const items = continueWatching[profileId].map(function(entry) {
    const meta = _findItem(entry.item_id);
    return {
      item_id: entry.item_id,
      title: meta ? meta.title : null,
      type: meta ? meta.type : null,
      poster_url: meta ? meta.poster_url : null,
      position_sec: entry.position_sec,
      duration_sec: entry.duration_sec,
      progress_pct: entry.duration_sec > 0 ? Math.round((entry.position_sec / entry.duration_sec) * 100) : 0,
      updated_utc: entry.updated_utc,
    };
  });
  res.json({
    items: items,
    total: items.length,
    _meta: { source: 'in-memory', profile_id: profileId },
  });
});

// ─── POST /api/continue-watching ─────────────────────────────────────────────
// Body: { profile_id, item_id, position_sec, duration_sec }
router.post('/api/continue-watching', (req, res) => {
  const profileId = _requireProfile(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  if (!body.item_id || typeof body.item_id !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'item_id is required' });
  }
  if (typeof body.position_sec !== 'number' || body.position_sec < 0) {
    return res.status(400).json({ error: 'validation_failed', message: 'position_sec must be a non-negative number' });
  }
  if (typeof body.duration_sec !== 'number' || body.duration_sec <= 0) {
    return res.status(400).json({ error: 'validation_failed', message: 'duration_sec must be a positive number' });
  }
  const item = _findItem(body.item_id);
  if (!item) {
    return res.status(404).json({ error: 'item_not_found', item_id: body.item_id });
  }

  const list = continueWatching[profileId];
  // Upsert: remove any existing entry for this item, then prepend.
  const filtered = list.filter(function(x) { return x.item_id !== body.item_id; });
  filtered.unshift({
    item_id: body.item_id,
    position_sec: body.position_sec,
    duration_sec: body.duration_sec,
    updated_utc: new Date().toISOString(),
  });
  continueWatching[profileId] = filtered.slice(0, MAX_CONTINUE_WATCHING);

  res.json({
    success: true,
    item_id: body.item_id,
    profile_id: profileId,
    position_sec: body.position_sec,
    duration_sec: body.duration_sec,
    total_continue_watching: continueWatching[profileId].length,
  });
});

// ─── DELETE /api/continue-watching/:itemId ───────────────────────────────────
router.delete('/api/continue-watching/:itemId', (req, res) => {
  const profileId = (req.body && req.body.profile_id) || req.query.profile_id;
  if (!profileId || !profileIds.isValidProfileId(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required. ' + profileIds.profileValidationMessage(),
    });
  }
  _ensureProfileState(profileId);
  const before = continueWatching[profileId].length;
  continueWatching[profileId] = continueWatching[profileId].filter(function(x) { return x.item_id !== req.params.itemId; });
  const removed = before - continueWatching[profileId].length;
  res.json({
    success: true,
    removed_count: removed,
    item_id: req.params.itemId,
    profile_id: profileId,
  });
});

module.exports = router;
module.exports._internal = {
  _clear: function() {
    watchedEpisodes = { dave_tv: new Set(), mom_tv: new Set() };
    watchedMovies   = { dave_tv: new Set(), mom_tv: new Set() };
    favorites       = {
      dave_tv: { series: new Set(), movies: new Set() },
      mom_tv:  { series: new Set(), movies: new Set() },
    };
    continueWatching = { dave_tv: [], mom_tv: [] };
  },
  _getState: function() {
    return { watchedEpisodes, watchedMovies, favorites, continueWatching };
  },
};
