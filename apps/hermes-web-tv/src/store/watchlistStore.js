// ─────────────────────────────────────────────────────────────────────────────
// watchlistStore — per-profile "save for later" queue, separate from favorites.
//
// Favorites = items you've already loved. Watchlist = items you want to
// watch next. Same UX pattern as Netflix's "My List" + Stremio's Library.
//
// Persisted in localStorage under `hermestv:watchlist:<profile_id>` as a
// JSON array of item IDs. Window-global hook so cross-component reads work
// without a context provider:
//   window.hermesWatchlistStore.getIds(profileId) → string[]
//
// Tizen 6.5 / Chrome 76 safe: ES5 only, no destructuring, no template strings.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var STORAGE_PREFIX = 'hermestv:watchlist:';

function _key(profileId) {
  return STORAGE_PREFIX + (profileId || 'default');
}

function _read(profileId) {
  try {
    if (typeof localStorage === 'undefined') return [];
    var raw = localStorage.getItem(_key(profileId));
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

function _write(profileId, ids) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(_key(profileId), JSON.stringify(ids || []));
  } catch (_) { /* quota or sandbox — silent */ }
}

function get(profileId) {
  return _read(profileId);
}

function set(profileId, ids) {
  _write(profileId, ids);
}

function has(profileId, id) {
  if (!id) return false;
  var arr = _read(profileId);
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === id) return true;
  }
  return false;
}

function add(profileId, id) {
  if (!id) return;
  var arr = _read(profileId);
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] === id) return; // already present
  }
  arr.push(id);
  _write(profileId, arr);
}

function remove(profileId, id) {
  if (!id) return;
  var arr = _read(profileId);
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] !== id) out.push(arr[i]);
  }
  _write(profileId, out);
}

function toggle(profileId, id) {
  if (has(profileId, id)) {
    remove(profileId, id);
    return false;
  }
  add(profileId, id);
  return true;
}

function clear(profileId) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(_key(profileId));
  } catch (_) {}
}

var watchlistStore = {
  get: get,
  set: set,
  has: has,
  add: add,
  remove: remove,
  toggle: toggle,
  clear: clear,
  // Mirror the global-hook pattern other shells use (e.g. Stremio reads
  // window.hermesFavoritesStore — we provide the same shape so cross-shell
  // code doesn't need a context provider).
  getIds: function(profileId) { return _read(profileId); },
};

if (typeof window !== 'undefined') {
  window.hermesWatchlistStore = watchlistStore;
}

export default watchlistStore;
export var STORAGE_KEY_PREFIX = STORAGE_PREFIX;
