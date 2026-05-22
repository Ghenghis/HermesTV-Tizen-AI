// watchHistoryStore.js — local-first watch history, mirrors Zero's
// `watched_movies` / `watched_episodes` SQLite tables but flattened into
// a single IndexedDB object store keyed on a synthetic `id`.
//
// Why a single store: Zero has separate tables because SQLite enforces
// schemas per table; IDB doesn't care, and a flat shape keeps the
// "continue watching" rail trivial (one getAll on a `profile_id` index,
// sort by watched_at desc, slice).
//
// Schema (one record per profile + item):
//   {
//     id:                 string,   // synthetic: <profile_id>::<item_id>
//     profile_id:         string,   // 'dave_tv' | 'mom_tv' (from profileStore)
//     item_id:            string,   // catalog item id (channel/movie/episode)
//     item_type:          'live' | 'movies' | 'series',
//     title:              string,
//     watched_at:         string,   // ISO timestamp, last update
//     position_seconds:   number,   // current playback offset
//     duration_seconds:   number,   // total runtime (0 for live)
//     percent_complete:   number    // 0..100, cached so the rail doesn't recompute
//   }
//
// Index: `profile_id` — supports cheap per-user reads. We don't index
// watched_at because IDB indexes are unsorted in our access pattern; the
// per-profile slice is small (< 1k typical) and sorting in JS is fine.
//
// Failure mode: every API returns a sensible empty result on error and logs
// a non-PII warning. The UI rail will simply be blank rather than crashing.
//
// Privacy: only profile_id ('dave_tv'/'mom_tv'), item_id, item_type, title,
// and timestamps are stored. Never write emails, voice ids, or any
// Azure / TTS context. Sherri's "clear history" need is met by clearForProfile().

import * as idb from './indexedDB.js';

var STORE_NAME = 'watch_history';
var INDEX_PROFILE = 'by_profile';

var _dbPromise = null;

function _upgrade(db, oldVersion /*, newVersion */) {
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      var store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex(INDEX_PROFILE, 'profile_id', { unique: false });
    }
    // favoritesStore.js owns the favorites object store on the same
    // upgrade transaction — see its module for that creation block.
    if (!db.objectStoreNames.contains('favorites')) {
      var favs = db.createObjectStore('favorites', { keyPath: 'id' });
      favs.createIndex('by_profile', 'profile_id', { unique: false });
    }
  }
}

function _getDB() {
  if (_dbPromise) { return _dbPromise; }
  _dbPromise = idb.openDB(idb.DB_NAME, idb.DB_VERSION, _upgrade).catch(function(err) {
    // Reset the cached promise so a later call can retry (e.g., user
    // closed a private-mode tab and reopened a normal one).
    _dbPromise = null;
    throw err;
  });
  return _dbPromise;
}

function _warn(scope, err) {
  try {
    console.warn('[watchHistoryStore] ' + scope + ': ' + (err && err.name ? err.name : 'failed'));
  } catch (e) { /* ignore */ }
}

function _safeId(profileId, itemId) {
  return String(profileId) + '::' + String(itemId);
}

function _clampPercent(pos, dur) {
  if (typeof pos !== 'number' || !isFinite(pos)) { return 0; }
  if (typeof dur !== 'number' || !isFinite(dur) || dur <= 0) { return 0; }
  var pct = (pos / dur) * 100;
  if (pct < 0) { return 0; }
  if (pct > 100) { return 100; }
  return Math.round(pct * 10) / 10;
}

function recordWatch(profileId, item, positionSec, durationSec) {
  if (!profileId || !item || !item.id) {
    return Promise.resolve(null);
  }
  var pos = typeof positionSec === 'number' && isFinite(positionSec) && positionSec >= 0 ? positionSec : 0;
  var dur = typeof durationSec === 'number' && isFinite(durationSec) && durationSec >= 0 ? durationSec : 0;
  var record = {
    id: _safeId(profileId, item.id),
    profile_id: profileId,
    item_id: String(item.id),
    item_type: item.type || item.item_type || 'movies',
    title: typeof item.title === 'string' ? item.title : '',
    watched_at: new Date().toISOString(),
    position_seconds: pos,
    duration_seconds: dur,
    percent_complete: _clampPercent(pos, dur)
  };
  return _getDB().then(function(db) {
    return idb.put(db, STORE_NAME, record);
  }).then(function() {
    return record;
  }).catch(function(err) {
    _warn('recordWatch', err);
    return null;
  });
}

function listRecent(profileId, limit) {
  var n = typeof limit === 'number' && limit > 0 ? limit : 50;
  if (!profileId) { return Promise.resolve([]); }
  return _getDB().then(function(db) {
    return idb.getAll(db, STORE_NAME, INDEX_PROFILE, profileId);
  }).then(function(rows) {
    if (!rows || rows.length === 0) { return []; }
    rows.sort(function(a, b) {
      // Newest first. ISO timestamps sort lexicographically.
      if (a.watched_at === b.watched_at) { return 0; }
      return a.watched_at < b.watched_at ? 1 : -1;
    });
    return rows.slice(0, n);
  }).catch(function(err) {
    _warn('listRecent', err);
    return [];
  });
}

function getProgress(profileId, itemId) {
  if (!profileId || !itemId) { return Promise.resolve(null); }
  return _getDB().then(function(db) {
    return idb.get(db, STORE_NAME, _safeId(profileId, itemId));
  }).then(function(row) {
    return row || null;
  }).catch(function(err) {
    _warn('getProgress', err);
    return null;
  });
}

function clearForProfile(profileId) {
  if (!profileId) { return Promise.resolve(0); }
  return _getDB().then(function(db) {
    return idb.getAll(db, STORE_NAME, INDEX_PROFILE, profileId).then(function(rows) {
      if (!rows || rows.length === 0) { return 0; }
      // Delete each matching record. We use individual deletes rather than
      // store.clear() because clear() would wipe BOTH profiles — Sherri
      // clearing her history must not nuke Dave's.
      var deletions = [];
      for (var i = 0; i < rows.length; i++) {
        deletions.push(idb.delete(db, STORE_NAME, rows[i].id));
      }
      return Promise.all(deletions).then(function() { return rows.length; });
    });
  }).catch(function(err) {
    _warn('clearForProfile', err);
    return 0;
  });
}

export { recordWatch, listRecent, getProgress, clearForProfile };
