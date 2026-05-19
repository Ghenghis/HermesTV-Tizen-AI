// recentSearchesStore.js — tiny localStorage wrapper for the global search
// modal's "recently searched" rail.
//
// Why localStorage and not IndexedDB:
//   The recent-search list is a 10-row, single-string-per-row dataset. The
//   read happens synchronously when the modal opens so the empty state can
//   paint immediately — no flash, no flicker. IndexedDB would force a
//   promise chain on every open and dilute the "feels instant" Mom rule.
//
// Schema (single JSON-encoded array under one key):
//   localStorage["hermestv:recent-searches"] = '["avatar","stranger things",...]'
//
// Constraints:
//   - Max 10 entries (MAX_RECENT below).
//   - Dedup case-insensitively (a previous "Avatar" is replaced by a new
//     "avatar" rather than coexisting); but we preserve the latest query's
//     casing so the chip label reads naturally.
//   - Trimmed and empty-string filtered on every write.
//   - All read/write wrapped in try/catch — Tizen privacy mode and opaque-
//     origin iframes both block localStorage and we never want the search
//     modal to crash because the persistence layer is unavailable.
//
// Tizen 6.5 (Chrome 76) safe: no spread, no optional chaining, no nullish
// coalescing.

var STORAGE_KEY = 'hermestv:recent-searches';
var MAX_RECENT = 10;

function _read() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (typeof raw !== 'string' || raw.length === 0) { return []; }
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { return []; }
    // Belt + braces: ensure every entry is a non-empty string. Garbage
    // entries (null, object, "") are silently dropped so the consumer
    // never has to defend against bad data.
    var clean = [];
    for (var i = 0; i < parsed.length; i++) {
      var v = parsed[i];
      if (typeof v === 'string' && v.length > 0) { clean.push(v); }
      if (clean.length >= MAX_RECENT) { break; }
    }
    return clean;
  } catch (e) {
    return [];
  }
}

function _write(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // Quota exceeded / unavailable — silent. The in-memory caller still
    // works for this session; we just lose persistence.
  }
}

/**
 * Record a query as recently searched. No-ops on empty / whitespace input.
 * The query is normalised by trimming; case is preserved on the new entry,
 * but case-insensitive dedup removes any prior version.
 *
 * @param {string} q
 */
function addQuery(q) {
  if (typeof q !== 'string') { return; }
  var trimmed = q.trim();
  if (trimmed.length === 0) { return; }
  var lower = trimmed.toLowerCase();
  var existing = _read();
  var deduped = [];
  for (var i = 0; i < existing.length; i++) {
    var v = existing[i];
    if (typeof v === 'string' && v.toLowerCase() !== lower) {
      deduped.push(v);
    }
  }
  deduped.unshift(trimmed);
  if (deduped.length > MAX_RECENT) { deduped = deduped.slice(0, MAX_RECENT); }
  _write(deduped);
}

/**
 * Return the recent-searches list, newest first. Empty array when storage
 * is unavailable or the list has never been written.
 *
 * @returns {string[]}
 */
function listRecent() {
  return _read();
}

/**
 * Remove the entire recent-searches list (Settings → Privacy → "Clear
 * recent searches" surface uses this).
 */
function clearAll() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // silent
  }
}

export { addQuery, listRecent, clearAll };
