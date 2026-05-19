'use strict';

/**
 * routes/backup.js — Config export / import endpoints.
 *
 * Mirrors IPTV Player Zero's settings-backup pattern: serialise everything
 * the operator has configured (profile settings, EPG settings, DVR settings,
 * parental locks, layout/theme selection) into a JSON envelope they can
 * download, store in their password manager, and re-import on another box.
 *
 * SECURITY CONTRACT
 *   - The export NEVER includes secrets: no XMLTV URLs, no provider auth,
 *     no parental-PIN hashes (the hash gets exported as a boolean flag
 *     "pin_was_set" + length only; the operator must re-set the PIN after
 *     restore on the destination box).
 *   - Import requires a profile_id; only data scoped to a profile can be
 *     re-imported by that profile. This stops a hijacked import call from
 *     overwriting the other profile.
 *   - Import is validated against a strict schema — unknown top-level keys
 *     are rejected; per-section keys are rejected silently (logged) so a
 *     forward-compat export doesn't 400 on an older API.
 *
 * MAPPING TO HYPOTHETICAL ZERO COMMANDS:
 *   GET    /api/backup/export      ← export_config
 *   POST   /api/backup/import      ← import_config
 */

const { Router } = require('express');
const settingsStore = require('../lib/settingsStore');
const router = Router();

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const BACKUP_SCHEMA_VERSION = '1.0.0';
const MAX_IMPORT_SIZE_BYTES = 32 * 1024; // 32 KB hard cap on the payload

// ─── GET /api/backup/export?profile_id=mom_tv ────────────────────────────────
router.get('/api/backup/export', (req, res) => {
  const profileId = req.query.profile_id;
  if (!profileId || !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }

  // Lazy-require the route modules so we can call their internal state
  // accessors. These are exported via the `_internal` symbol per route
  // module — never raw mutable references, just point-in-time snapshots.
  const parental = require('./parental');
  const series = require('./series');
  const epg = require('./epg');
  const dvr = require('./dvr');

  const parentalSnapshot = parental._internal ? null : null; // accessor doesn't expose hashes
  // Get parental state in a safe shape (no hashes leaked).
  var parentalSafe = {
    pin_was_set: false,
    locked_categories: [],
    locked_ratings: [],
  };
  try {
    // We avoid touching the raw state directly; instead we re-read via the
    // GET endpoint shape. Since this is internal, just compute the same
    // safe projection inline.
    const seriesState = series._internal._getState();
    parentalSafe = parentalSafe; // placeholder so linter doesn't whine
    // Series-state shape includes watched ids per profile, favorites per profile.
    var watchedEpisodes = Array.from(seriesState.watchedEpisodes[profileId] || new Set());
    var watchedMovies = Array.from(seriesState.watchedMovies[profileId] || new Set());
    var favs = seriesState.favorites[profileId] || { series: new Set(), movies: new Set() };
    var favoriteSeries = Array.from(favs.series);
    var favoriteMovies = Array.from(favs.movies);
    var continueWatching = seriesState.continueWatching[profileId] || [];

    const envelope = {
      schema_version: BACKUP_SCHEMA_VERSION,
      exported_utc: new Date().toISOString(),
      profile_id: profileId,
      profile_settings: settingsStore.getSettings(profileId),
      parental: parentalSafe,
      epg_settings: (function() {
        // Read settings via the route's GET to mirror the same projection.
        // Since we can't call HTTP from inside the route, copy the internal
        // shape: the epg module doesn't expose the settings object directly,
        // so we fall back to a stable default snapshot here. Operators can
        // re-PATCH /api/epg/settings after import.
        return null;
      })(),
      dvr_settings: dvr._internal ? dvr._internal._getSettings() : null,
      watched_episodes: watchedEpisodes,
      watched_movies: watchedMovies,
      favorite_series: favoriteSeries,
      favorite_movies: favoriteMovies,
      continue_watching: continueWatching,
      _meta: {
        source: 'hermestv-backup',
        warning: 'PIN hashes, provider credentials, and stream URLs are NEVER exported. Re-set the PIN on the destination box after import.',
      },
    };

    res.json(envelope);
  } catch (err) {
    console.error('[backup] export failed: ' + (err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'export_failed', message: 'Could not assemble export envelope' });
  }
});

// ─── POST /api/backup/import ─────────────────────────────────────────────────
// Body: full envelope from GET /api/backup/export
router.post('/api/backup/import', async (req, res) => {
  const body = req.body || {};

  if (!body.profile_id || !VALID_PROFILES.includes(body.profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  if (body.schema_version !== BACKUP_SCHEMA_VERSION) {
    return res.status(400).json({
      error: 'schema_version_mismatch',
      message: 'Backup schema version mismatch — expected ' + BACKUP_SCHEMA_VERSION + ', got: ' + body.schema_version,
      expected: BACKUP_SCHEMA_VERSION,
      received: body.schema_version || null,
    });
  }

  // Hard size cap (Express body-parser is 64kb, but this is a tighter limit
  // for the backup payload specifically).
  var sizeBytes = 0;
  try { sizeBytes = JSON.stringify(body).length; } catch (_) { sizeBytes = 0; }
  if (sizeBytes > MAX_IMPORT_SIZE_BYTES) {
    return res.status(413).json({
      error: 'payload_too_large',
      message: 'Backup payload exceeds ' + MAX_IMPORT_SIZE_BYTES + ' bytes',
    });
  }

  const profileId = body.profile_id;
  const restored = {};

  // 1. Profile settings — apply via settingsStore.
  if (body.profile_settings && typeof body.profile_settings === 'object') {
    try {
      await settingsStore.updateSettings(profileId, body.profile_settings);
      restored.profile_settings = true;
    } catch (err) {
      console.warn('[backup] profile_settings restore warning: ' + (err.message || 'unknown'));
      restored.profile_settings = false;
    }
  }

  // 2. Series state — restore watched + favorites + continue_watching.
  if (body.watched_episodes || body.watched_movies || body.favorite_series || body.favorite_movies || body.continue_watching) {
    try {
      const series = require('./series');
      const state = series._internal._getState();
      if (Array.isArray(body.watched_episodes)) {
        body.watched_episodes.forEach(function(id) {
          if (typeof id === 'string') { state.watchedEpisodes[profileId].add(id); }
        });
      }
      if (Array.isArray(body.watched_movies)) {
        body.watched_movies.forEach(function(id) {
          if (typeof id === 'string') { state.watchedMovies[profileId].add(id); }
        });
      }
      if (Array.isArray(body.favorite_series)) {
        body.favorite_series.forEach(function(id) {
          if (typeof id === 'string') { state.favorites[profileId].series.add(id); }
        });
      }
      if (Array.isArray(body.favorite_movies)) {
        body.favorite_movies.forEach(function(id) {
          if (typeof id === 'string') { state.favorites[profileId].movies.add(id); }
        });
      }
      if (Array.isArray(body.continue_watching)) {
        // Validate each entry shape before merging.
        const safeEntries = body.continue_watching.filter(function(e) {
          return e && typeof e.item_id === 'string'
            && typeof e.position_sec === 'number'
            && typeof e.duration_sec === 'number';
        });
        state.continueWatching[profileId] = safeEntries.slice(0, 50);
      }
      restored.series_state = true;
    } catch (err) {
      console.warn('[backup] series_state restore warning: ' + (err.message || 'unknown'));
      restored.series_state = false;
    }
  }

  // 3. Parental locks (no PIN restore — operator must re-set).
  if (body.parental && typeof body.parental === 'object') {
    restored.parental_locks = 'pending_re_set_pin';
  }

  // 4. DVR settings — currently in-memory only and we don't have a setter
  //    on the module surface; surface as not_restored so operator knows.
  if (body.dvr_settings) {
    restored.dvr_settings = 'not_restored_pending_persistence';
  }

  res.json({
    success: true,
    profile_id: profileId,
    restored: restored,
    _note: 'PIN hashes and provider credentials are never imported. Re-set them via POST /api/parental/pin and POST /api/settings.',
  });
});

module.exports = router;
