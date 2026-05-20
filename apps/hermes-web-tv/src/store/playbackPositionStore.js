// ─────────────────────────────────────────────────────────────────────────────
// playbackPositionStore — per-profile last-watched playback position cache.
//
// Why we have this AND watchHistoryStore.js (IDB-backed): the IDB store is
// authoritative for the "Continue Watching" rail and for any cross-shell
// position queries that can afford an async hop. This localStorage store is
// the FAST PATH the player uses on every timeupdate tick (60-120 Hz on PC,
// 30 Hz on Tizen). A synchronous, throttled, capped localStorage write is
// cheap; the equivalent IDB transaction every 5s would still create a
// per-tick promise chain we can avoid here.
//
// Contract:
//   getPosition(profileId, contentId) → { seconds, duration, updatedAt } | null
//   setPosition(profileId, contentId, seconds, duration) → void  (throttled 5s)
//   clearPosition(profileId, contentId) → void
//   listPositions(profileId) → Array<{contentId, seconds, duration, updatedAt, percent}>
//
// Auto-evict policy:
//   - percent >= 95% → consider watched, drop the entry
//   - seconds < 30  → barely started, not worth resuming, drop the entry
//   - 200-entry cap per profile; oldest updatedAt evicted when over
//
// Storage layout (one JSON blob per profile to keep reads atomic):
//   Key:    'hermestv:store:playback-pos:<sanitizedProfileId>'
//   Value:  JSON object:
//             { "<contentId>": { s: <seconds>, d: <duration>, t: <ISO> }, ... }
//
// Tizen 6.5 / Chrome 76 safe: ES5 only — `var` + `function`, no arrow funcs,
// no destructuring, no template strings, no optional chaining, no spread,
// no nullish coalescing. CommonJS-style module.exports so both ESM `import`
// and `require()` work via Vite's interop layer.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

var STORAGE_PREFIX = 'hermestv:store:playback-pos:';
var THROTTLE_MS = 5000;
var MAX_ENTRIES = 200;
var EVICT_PERCENT = 95;
var EVICT_MIN_SECONDS = 30;

// In-process throttle state. Keyed by "<profileId>::<contentId>" so a tick
// for movie A doesn't block a tick for movie B. We hold the most recent
// pending position so a flush on unmount (via flush()) keeps the last frame.
var _lastWriteAt = {};
var _pendingTimer = {};
var _pendingValue = {};

// Sanitize profileId the same way other per-profile stores do: trim, replace
// anything that isn't safe-for-key with '_', fall back to 'default' when
// empty/null. We deliberately keep this conservative so an upgrade can't
// fragment a user's positions across slightly-different key forms.
function _sanitizeProfileId(pid) {
  if (typeof pid !== 'string' || pid.length === 0) { return 'default'; }
  var trimmed = pid.replace(/^\s+|\s+$/g, '');
  if (trimmed.length === 0) { return 'default'; }
  // Allow letters, digits, '-', '_', '.'; replace everything else with '_'.
  var out = '';
  for (var i = 0; i < trimmed.length; i++) {
    var c = trimmed.charAt(i);
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') || c === '-' || c === '_' || c === '.') {
      out += c;
    } else {
      out += '_';
    }
  }
  return out;
}

function _key(profileId) {
  return STORAGE_PREFIX + _sanitizeProfileId(profileId);
}

function _safeGet(k) {
  try {
    if (typeof localStorage === 'undefined') { return null; }
    return localStorage.getItem(k);
  } catch (_) { return null; }
}

function _safeSet(k, v) {
  try {
    if (typeof localStorage === 'undefined') { return; }
    localStorage.setItem(k, v);
  } catch (_) { /* quota / private-mode: silent */ }
}

function _safeRemove(k) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(k);
    }
  } catch (_) { /* silent */ }
}

function _readBlob(profileId) {
  var raw = _safeGet(_key(profileId));
  if (!raw) { return {}; }
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return {}; }
    return parsed;
  } catch (_) { return {}; }
}

function _writeBlob(profileId, blob) {
  if (!blob || typeof blob !== 'object') {
    _safeRemove(_key(profileId));
    return;
  }
  try {
    _safeSet(_key(profileId), JSON.stringify(blob));
  } catch (_) { /* cyclic — impossible for our shape, but be safe */ }
}

function _percent(seconds, duration) {
  if (typeof duration !== 'number' || duration <= 0) { return 0; }
  if (typeof seconds !== 'number' || seconds < 0) { return 0; }
  var pct = (seconds / duration) * 100;
  if (pct < 0) { return 0; }
  if (pct > 100) { return 100; }
  return pct;
}

// Cap to MAX_ENTRIES by oldest updatedAt. ISO timestamps sort lexicographically
// so we don't need to parse Date here — string compare is fine and faster.
function _capBlob(blob) {
  var keys = [];
  for (var k in blob) {
    if (Object.prototype.hasOwnProperty.call(blob, k)) { keys.push(k); }
  }
  if (keys.length <= MAX_ENTRIES) { return blob; }
  // Sort by updatedAt ascending → oldest first → drop until at cap.
  keys.sort(function(a, b) {
    var ta = blob[a] && blob[a].t ? blob[a].t : '';
    var tb = blob[b] && blob[b].t ? blob[b].t : '';
    if (ta === tb) { return 0; }
    return ta < tb ? -1 : 1;
  });
  var dropCount = keys.length - MAX_ENTRIES;
  for (var i = 0; i < dropCount; i++) {
    delete blob[keys[i]];
  }
  return blob;
}

function _throttleKey(profileId, contentId) {
  return _sanitizeProfileId(profileId) + '::' + String(contentId);
}

// Synchronous-by-design persistence; used by both setPosition (after the
// throttle window elapses) and clearPosition.
function _persist(profileId, contentId, seconds, duration) {
  var blob = _readBlob(profileId);
  var pct = _percent(seconds, duration);
  // Auto-evict watched / barely-started before the entry can land. We still
  // delete any pre-existing entry so a half-watched record doesn't ghost.
  if (pct >= EVICT_PERCENT || (typeof seconds === 'number' && seconds < EVICT_MIN_SECONDS)) {
    if (Object.prototype.hasOwnProperty.call(blob, contentId)) {
      delete blob[contentId];
      _writeBlob(profileId, blob);
    }
    return;
  }
  blob[contentId] = {
    s: typeof seconds === 'number' ? seconds : 0,
    d: typeof duration === 'number' ? duration : 0,
    t: new Date().toISOString()
  };
  blob = _capBlob(blob);
  _writeBlob(profileId, blob);
}

// ── Public API ──────────────────────────────────────────────────────────────

function getPosition(profileId, contentId) {
  if (!contentId) { return null; }
  var blob = _readBlob(profileId);
  var rec = blob[contentId];
  if (!rec) { return null; }
  return {
    seconds: typeof rec.s === 'number' ? rec.s : 0,
    duration: typeof rec.d === 'number' ? rec.d : 0,
    updatedAt: rec.t || null
  };
}

function setPosition(profileId, contentId, seconds, duration) {
  if (!contentId) { return; }
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) { return; }
  var tk = _throttleKey(profileId, contentId);
  var now = Date.now();
  var last = _lastWriteAt[tk] || 0;
  var elapsed = now - last;
  if (elapsed >= THROTTLE_MS) {
    // Leading edge: write through immediately.
    _lastWriteAt[tk] = now;
    _pendingValue[tk] = null;
    if (_pendingTimer[tk]) {
      clearTimeout(_pendingTimer[tk]);
      _pendingTimer[tk] = null;
    }
    _persist(profileId, contentId, seconds, duration);
    return;
  }
  // Within the throttle window: record the latest position and ensure a
  // trailing-edge timer is armed so we never lose the most recent frame.
  _pendingValue[tk] = { profileId: profileId, contentId: contentId, seconds: seconds, duration: duration };
  if (!_pendingTimer[tk]) {
    var remaining = THROTTLE_MS - elapsed;
    _pendingTimer[tk] = setTimeout(function() {
      _pendingTimer[tk] = null;
      var pv = _pendingValue[tk];
      if (pv) {
        _lastWriteAt[tk] = Date.now();
        _pendingValue[tk] = null;
        _persist(pv.profileId, pv.contentId, pv.seconds, pv.duration);
      }
    }, remaining);
  }
}

function clearPosition(profileId, contentId) {
  if (!contentId) { return; }
  // Drop any pending throttle write for this entry so we don't resurrect it.
  var tk = _throttleKey(profileId, contentId);
  if (_pendingTimer[tk]) {
    clearTimeout(_pendingTimer[tk]);
    _pendingTimer[tk] = null;
  }
  _pendingValue[tk] = null;
  var blob = _readBlob(profileId);
  if (Object.prototype.hasOwnProperty.call(blob, contentId)) {
    delete blob[contentId];
    _writeBlob(profileId, blob);
  }
}

function listPositions(profileId) {
  var blob = _readBlob(profileId);
  var out = [];
  for (var k in blob) {
    if (!Object.prototype.hasOwnProperty.call(blob, k)) { continue; }
    var rec = blob[k];
    if (!rec) { continue; }
    var seconds = typeof rec.s === 'number' ? rec.s : 0;
    var duration = typeof rec.d === 'number' ? rec.d : 0;
    out.push({
      contentId: k,
      seconds: seconds,
      duration: duration,
      updatedAt: rec.t || null,
      percent: _percent(seconds, duration)
    });
  }
  // Newest first — the rail wants "what did I just have on?" at the head.
  out.sort(function(a, b) {
    var ta = a.updatedAt || '';
    var tb = b.updatedAt || '';
    if (ta === tb) { return 0; }
    return ta < tb ? 1 : -1;
  });
  return out;
}

// Optional: flush all pending throttled writes immediately. The player's
// unmount cleanup can call this so we never drop the user's last position
// when the modal closes.
function flush() {
  for (var tk in _pendingTimer) {
    if (!Object.prototype.hasOwnProperty.call(_pendingTimer, tk)) { continue; }
    var timer = _pendingTimer[tk];
    if (timer) {
      clearTimeout(timer);
      _pendingTimer[tk] = null;
    }
    var pv = _pendingValue[tk];
    if (pv) {
      _lastWriteAt[tk] = Date.now();
      _pendingValue[tk] = null;
      _persist(pv.profileId, pv.contentId, pv.seconds, pv.duration);
    }
  }
}

// Clear every entry for a profile — used by "Clear watch history" actions
// so users (Sherri, especially) can wipe their resume list without touching
// the IDB-backed history.
function clearForProfile(profileId) {
  _safeRemove(_key(profileId));
}

var playbackPositionStore = {
  getPosition: getPosition,
  setPosition: setPosition,
  clearPosition: clearPosition,
  listPositions: listPositions,
  flush: flush,
  clearForProfile: clearForProfile
};

// Window-global hook so cross-shell code (e.g. a Continue Watching rail
// inside any of the 14 layouts) can read without an import wiring change.
if (typeof window !== 'undefined') {
  window.hermesPlaybackPositionStore = playbackPositionStore;
}

export default playbackPositionStore;
export {
  getPosition,
  setPosition,
  clearPosition,
  listPositions,
  flush,
  clearForProfile
};
