// recentSearchesStore.js — tiny localStorage wrapper for the global search
// modal's "recently searched" rail.
//
// Why localStorage and not IndexedDB:
//   The recent-search list is a 8-row, single-string-per-row dataset. The
//   read happens synchronously when the modal opens so the empty state can
//   paint immediately — no flash, no flicker. IndexedDB would force a
//   promise chain on every open and dilute the "feels instant" Mom rule.
//
// Schema (one JSON-encoded array per profile under a namespaced key):
//   localStorage["hermestv:search:recent:mom_tv"] = '["avatar","stranger things",...]'
//   localStorage["hermestv:search:recent:dave_tv"] = '[...]'
//
// Legacy key:
//   localStorage["hermestv:recent-searches"]  — global, pre-profile-split.
//   Read on first listRecent() if the per-profile key is empty so existing
//   users don't lose their list on upgrade. Never written.
//
// Constraints:
//   - Max 8 entries (MAX_RECENT below) per spec — quick-chip row stays one
//     line wide on a 960px panel.
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

var KEY_PREFIX = 'hermestv:search:recent:';
var LEGACY_KEY = 'hermestv:recent-searches';
var MAX_RECENT = 8;

function _keyFor(profileId) {
  return KEY_PREFIX + (profileId || 'mom_tv');
}

function _readKey(storageKey) {
  try {
    var raw = localStorage.getItem(storageKey);
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

function _read(profileId) {
  var primary = _readKey(_keyFor(profileId));
  if (primary.length > 0) { return primary; }
  // Migrate-on-read: legacy global key seeded the first per-profile list.
  // We never delete the legacy key so other profiles can pick it up too,
  // but we don't write it either — it'll age out naturally.
  return _readKey(LEGACY_KEY);
}

function _write(profileId, list) {
  try {
    localStorage.setItem(_keyFor(profileId), JSON.stringify(list));
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
 * @param {string=} profileId — defaults to 'mom_tv' for callers that
 *   haven't been refactored to pass the active profile id yet.
 */
function addQuery(q, profileId) {
  if (typeof q !== 'string') { return; }
  var trimmed = q.trim();
  if (trimmed.length === 0) { return; }
  var lower = trimmed.toLowerCase();
  var existing = _read(profileId);
  var deduped = [];
  for (var i = 0; i < existing.length; i++) {
    var v = existing[i];
    if (typeof v === 'string' && v.toLowerCase() !== lower) {
      deduped.push(v);
    }
  }
  deduped.unshift(trimmed);
  if (deduped.length > MAX_RECENT) { deduped = deduped.slice(0, MAX_RECENT); }
  _write(profileId, deduped);
}

/**
 * Return the recent-searches list, newest first. Empty array when storage
 * is unavailable or the list has never been written.
 *
 * @param {string=} profileId
 * @returns {string[]}
 */
function listRecent(profileId) {
  return _read(profileId);
}

/**
 * Remove the recent-searches list for the given profile (Settings →
 * Privacy → "Clear recent searches" surface uses this). When profileId
 * is omitted we drop the legacy global key too, restoring the pre-upgrade
 * blank-slate behaviour.
 *
 * @param {string=} profileId
 */
function clearAll(profileId) {
  try {
    if (profileId) {
      localStorage.removeItem(_keyFor(profileId));
    } else {
      localStorage.removeItem(LEGACY_KEY);
      // Best-effort: clear known profile buckets too.
      localStorage.removeItem(_keyFor('mom_tv'));
      localStorage.removeItem(_keyFor('dave_tv'));
    }
  } catch (e) {
    // silent
  }
}

export { addQuery, listRecent, clearAll };
