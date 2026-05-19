// favoritesStore.js — per-profile favorites pinning.
//
// Schema (one record per profile + item):
//   {
//     id:          string,   // synthetic: <profile_id>::<item_id>
//     profile_id:  string,   // 'dave_tv' | 'mom_tv'
//     item_id:     string,   // catalog item id
//     item_type:   'live' | 'movies' | 'series',
//     title:       string,
//     poster_url:  string,   // empty string if catalog item has no poster
//     added_at:    string    // ISO timestamp
//   }
//
// The object store is created in watchHistoryStore.js's upgrade callback
// (same DB, same version, single upgrade transaction). This module just
// reads/writes it. If you change the schema, bump idb.DB_VERSION and add
// a migration block in BOTH stores' upgrade paths — they must agree.
//
// Index: `by_profile` on `profile_id`.
//
// Failure mode: APIs return empty result + console.warn on IDB errors.

import * as idb from './indexedDB.js';

var STORE_NAME = 'favorites';
var INDEX_PROFILE = 'by_profile';

var _dbPromise = null;

function _upgrade(db, oldVersion /*, newVersion */) {
  // Mirror of watchHistoryStore._upgrade — if a consumer happens to call us
  // first before watchHistoryStore initializes, we still create both stores
  // in the same upgrade transaction so the schema stays consistent.
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains('watch_history')) {
      var wh = db.createObjectStore('watch_history', { keyPath: 'id' });
      wh.createIndex('by_profile', 'profile_id', { unique: false });
    }
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      var favs = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      favs.createIndex(INDEX_PROFILE, 'profile_id', { unique: false });
    }
  }
}

function _getDB() {
  if (_dbPromise) { return _dbPromise; }
  _dbPromise = idb.openDB(idb.DB_NAME, idb.DB_VERSION, _upgrade).catch(function(err) {
    _dbPromise = null;
    throw err;
  });
  return _dbPromise;
}

function _warn(scope, err) {
  try {
    console.warn('[favoritesStore] ' + scope + ': ' + (err && err.name ? err.name : 'failed'));
  } catch (e) { /* ignore */ }
}

function _safeId(profileId, itemId) {
  return String(profileId) + '::' + String(itemId);
}

function addFavorite(profileId, item) {
  if (!profileId || !item || !item.id) {
    return Promise.resolve(null);
  }
  var record = {
    id: _safeId(profileId, item.id),
    profile_id: profileId,
    item_id: String(item.id),
    item_type: item.type || item.item_type || 'movies',
    title: typeof item.title === 'string' ? item.title : '',
    poster_url: typeof item.poster_url === 'string'
      ? item.poster_url
      : (typeof item.poster === 'string' ? item.poster : ''),
    added_at: new Date().toISOString()
  };
  return _getDB().then(function(db) {
    return idb.put(db, STORE_NAME, record);
  }).then(function() {
    return record;
  }).catch(function(err) {
    _warn('addFavorite', err);
    return null;
  });
}

function removeFavorite(profileId, itemId) {
  if (!profileId || !itemId) { return Promise.resolve(false); }
  return _getDB().then(function(db) {
    return idb.delete(db, STORE_NAME, _safeId(profileId, itemId));
  }).then(function() {
    return true;
  }).catch(function(err) {
    _warn('removeFavorite', err);
    return false;
  });
}

function isFavorite(profileId, itemId) {
  if (!profileId || !itemId) { return Promise.resolve(false); }
  return _getDB().then(function(db) {
    return idb.get(db, STORE_NAME, _safeId(profileId, itemId));
  }).then(function(row) {
    return !!row;
  }).catch(function(err) {
    _warn('isFavorite', err);
    return false;
  });
}

function listFavorites(profileId) {
  if (!profileId) { return Promise.resolve([]); }
  return _getDB().then(function(db) {
    return idb.getAll(db, STORE_NAME, INDEX_PROFILE, profileId);
  }).then(function(rows) {
    if (!rows || rows.length === 0) { return []; }
    rows.sort(function(a, b) {
      // Most recently added first.
      if (a.added_at === b.added_at) { return 0; }
      return a.added_at < b.added_at ? 1 : -1;
    });
    return rows;
  }).catch(function(err) {
    _warn('listFavorites', err);
    return [];
  });
}

export { addFavorite, removeFavorite, isFavorite, listFavorites };
