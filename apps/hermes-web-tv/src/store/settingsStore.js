// settingsStore.js — namespaced localStorage wrapper for HermesTV deep
// settings (network, playback, parental, diagnostics).
//
// Schema is versioned (SCHEMA_VERSION) so we can run light migrations
// when defaults change without nuking the user's prefs. Every getter
// returns a frozen-default fallback so callers can use the result
// unconditionally — no `if (cfg) cfg.timeout` ladders. Setters validate
// shape and clamp ranges so a corrupt localStorage entry can't poison
// the rest of the app.
//
// Key pattern: `hermestv:settings:<group>:<field>` — one key per leaf
// so writes are atomic and a partial migration won't corrupt sibling
// fields. The `__v` key tracks schema version per group.
//
// Tizen 6.5 / Chrome 76 safe: no spread, no optional chaining, no
// nullish coalescing, no Object.fromEntries. All Object.assign +
// var-style state.

var SCHEMA_VERSION = 1;
var NS = 'hermestv:settings:';
var VER_KEY = NS + '__v';

// ─────────────────────────────────────────────────────────────────────
// Defaults — single source of truth. The rest of the app reads from
// here when a key is missing or localStorage is unavailable.
// ─────────────────────────────────────────────────────────────────────
var DEFAULTS = {
  network: {
    timeoutMs: 8000,        // matches hermesApi.DEFAULT_TIMEOUT
    retries: 2,             // 0..5
    retryBackoffMs: 750,    // base for exponential backoff
    proxyUrl: '',           // empty = no proxy
    ignoreSslErrors: false, // dangerous; surfaces a warning in the UI
  },
  playback: {
    hardwareAccel: true,
    audioLanguage: 'en',    // ISO 639-1
    subtitleLanguage: 'off',// 'off' | ISO 639-1
    subtitleFontSizePct: 100, // 50..200
    videoBufferKb: 4096,    // 1024..16384
  },
  parental: {
    pinHash: '',            // empty = not configured
    pinSalt: '',            // per-user salt for the SHA-256 hash
    ratingCap: 'unrestricted', // 'G' | 'PG' | 'PG-13' | 'R' | 'NC-17' | 'unrestricted'
    hideAdultCategories: true, // safe-by-default for shared family TV
    failedAttempts: 0,
    lockoutUntilMs: 0,      // epoch ms; 0 = not locked
  },
  diagnostics: {
    autoSendOnError: false, // future hook — for now just a UI toggle
    showApiLatency: false,
  },
};

// ─────────────────────────────────────────────────────────────────────
// Low-level helpers
// ─────────────────────────────────────────────────────────────────────
function _k(group, field) { return NS + group + ':' + field; }

function _safeGet(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch (_) { return null; }
}

function _safeSet(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch (_) { return false; }
}

function _safeRemove(key) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch (_) { /* silent */ }
}

function _readJson(group, field) {
  var raw = _safeGet(_k(group, field));
  if (raw === null) return undefined;
  try { return JSON.parse(raw); }
  catch (_) { return undefined; }
}

function _writeJson(group, field, value) {
  return _safeSet(_k(group, field), JSON.stringify(value));
}

function _clampInt(n, lo, hi, fallback) {
  var x = parseInt(n, 10);
  if (!isFinite(x)) return fallback;
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

function _clampStr(s, allowed, fallback) {
  if (typeof s !== 'string') return fallback;
  for (var i = 0; i < allowed.length; i++) {
    if (allowed[i] === s) return s;
  }
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────
// Schema migration — bumped when DEFAULTS change shape. v1 is initial.
// ─────────────────────────────────────────────────────────────────────
function _ensureVersion() {
  var stored = _safeGet(VER_KEY);
  var v = parseInt(stored, 10);
  if (!isFinite(v) || v < 1) {
    _safeSet(VER_KEY, String(SCHEMA_VERSION));
    return;
  }
  if (v < SCHEMA_VERSION) {
    // Future-proof — currently no migrations needed. When we bump,
    // walk the diff between v and SCHEMA_VERSION here.
    _safeSet(VER_KEY, String(SCHEMA_VERSION));
  }
}
_ensureVersion();

// ─────────────────────────────────────────────────────────────────────
// Network
// ─────────────────────────────────────────────────────────────────────
function getNetwork() {
  return {
    timeoutMs: _clampInt(_readJson('network', 'timeoutMs'), 1000, 60000, DEFAULTS.network.timeoutMs),
    retries: _clampInt(_readJson('network', 'retries'), 0, 5, DEFAULTS.network.retries),
    retryBackoffMs: _clampInt(_readJson('network', 'retryBackoffMs'), 100, 10000, DEFAULTS.network.retryBackoffMs),
    proxyUrl: (function() {
      var v = _readJson('network', 'proxyUrl');
      return typeof v === 'string' ? v : DEFAULTS.network.proxyUrl;
    })(),
    ignoreSslErrors: _readJson('network', 'ignoreSslErrors') === true,
  };
}

function setNetwork(patch) {
  var cur = getNetwork();
  var next = Object.assign({}, cur, patch || {});
  _writeJson('network', 'timeoutMs', _clampInt(next.timeoutMs, 1000, 60000, DEFAULTS.network.timeoutMs));
  _writeJson('network', 'retries', _clampInt(next.retries, 0, 5, DEFAULTS.network.retries));
  _writeJson('network', 'retryBackoffMs', _clampInt(next.retryBackoffMs, 100, 10000, DEFAULTS.network.retryBackoffMs));
  _writeJson('network', 'proxyUrl', typeof next.proxyUrl === 'string' ? next.proxyUrl : '');
  _writeJson('network', 'ignoreSslErrors', next.ignoreSslErrors === true);
  return getNetwork();
}

// ─────────────────────────────────────────────────────────────────────
// Playback
// ─────────────────────────────────────────────────────────────────────
var AUDIO_LANGS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh', 'ar', 'hi'];
var SUB_LANGS = ['off', 'en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'ko', 'zh', 'ar', 'hi'];

function getPlayback() {
  return {
    hardwareAccel: (function() {
      var v = _readJson('playback', 'hardwareAccel');
      return typeof v === 'boolean' ? v : DEFAULTS.playback.hardwareAccel;
    })(),
    audioLanguage: _clampStr(_readJson('playback', 'audioLanguage'), AUDIO_LANGS, DEFAULTS.playback.audioLanguage),
    subtitleLanguage: _clampStr(_readJson('playback', 'subtitleLanguage'), SUB_LANGS, DEFAULTS.playback.subtitleLanguage),
    subtitleFontSizePct: _clampInt(_readJson('playback', 'subtitleFontSizePct'), 50, 200, DEFAULTS.playback.subtitleFontSizePct),
    videoBufferKb: _clampInt(_readJson('playback', 'videoBufferKb'), 1024, 16384, DEFAULTS.playback.videoBufferKb),
  };
}

function setPlayback(patch) {
  var cur = getPlayback();
  var next = Object.assign({}, cur, patch || {});
  _writeJson('playback', 'hardwareAccel', next.hardwareAccel === true);
  _writeJson('playback', 'audioLanguage', _clampStr(next.audioLanguage, AUDIO_LANGS, DEFAULTS.playback.audioLanguage));
  _writeJson('playback', 'subtitleLanguage', _clampStr(next.subtitleLanguage, SUB_LANGS, DEFAULTS.playback.subtitleLanguage));
  _writeJson('playback', 'subtitleFontSizePct', _clampInt(next.subtitleFontSizePct, 50, 200, DEFAULTS.playback.subtitleFontSizePct));
  _writeJson('playback', 'videoBufferKb', _clampInt(next.videoBufferKb, 1024, 16384, DEFAULTS.playback.videoBufferKb));
  return getPlayback();
}

// ─────────────────────────────────────────────────────────────────────
// Parental controls
//
// PIN is stored as a SHA-256 hash (hex) of `salt + ':' + pin`. The
// salt is per-user, generated at PIN creation, and stored alongside.
// Anyone with localStorage access still can't extract the PIN —
// brute-forcing 4-digit PIN through SHA-256 is fast, but the threat
// model here is shoulder-surfing + shared-TV access, not a forensic
// attacker. 5 wrong attempts → 5-minute lockout.
// ─────────────────────────────────────────────────────────────────────
var RATING_TIERS = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'unrestricted'];
var MAX_FAILED_ATTEMPTS = 5;
var LOCKOUT_MS = 5 * 60 * 1000;

function _hex(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i].toString(16);
    out += b.length === 1 ? '0' + b : b;
  }
  return out;
}

function _randomSaltHex(byteLength) {
  var bytes = new Uint8Array(byteLength || 16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without WebCrypto (very unlikely on Chrome 76+).
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return _hex(bytes);
}

// Returns a Promise<string> with the hex SHA-256 of (salt + ':' + pin).
function _hashPin(salt, pin) {
  var text = salt + ':' + String(pin);
  if (typeof TextEncoder === 'undefined' || typeof crypto === 'undefined' || !crypto.subtle) {
    // Tizen 6.5 (Chrome 76) ships SubtleCrypto; this branch is a defensive
    // fallback for unit tests or future surfaces. We DO NOT silently store
    // plaintext — instead, we reject so the UI can warn.
    return Promise.reject(new Error('WebCrypto unavailable'));
  }
  var enc = new TextEncoder();
  return crypto.subtle.digest('SHA-256', enc.encode(text)).then(function(buf) {
    return _hex(new Uint8Array(buf));
  });
}

function getParental() {
  return {
    pinHash: (function() {
      var v = _readJson('parental', 'pinHash');
      return typeof v === 'string' ? v : '';
    })(),
    pinSalt: (function() {
      var v = _readJson('parental', 'pinSalt');
      return typeof v === 'string' ? v : '';
    })(),
    ratingCap: _clampStr(_readJson('parental', 'ratingCap'), RATING_TIERS, DEFAULTS.parental.ratingCap),
    hideAdultCategories: (function() {
      var v = _readJson('parental', 'hideAdultCategories');
      return typeof v === 'boolean' ? v : DEFAULTS.parental.hideAdultCategories;
    })(),
    failedAttempts: _clampInt(_readJson('parental', 'failedAttempts'), 0, 9999, 0),
    lockoutUntilMs: _clampInt(_readJson('parental', 'lockoutUntilMs'), 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

function hasPin() {
  var p = getParental();
  return p.pinHash.length > 0 && p.pinSalt.length > 0;
}

// Returns Promise<void>. Rejects if WebCrypto is unavailable or pin invalid.
function setPin(pin) {
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) {
    return Promise.reject(new Error('PIN must be 4-8 digits'));
  }
  var salt = _randomSaltHex(16);
  return _hashPin(salt, pin).then(function(hashHex) {
    _writeJson('parental', 'pinSalt', salt);
    _writeJson('parental', 'pinHash', hashHex);
    _writeJson('parental', 'failedAttempts', 0);
    _writeJson('parental', 'lockoutUntilMs', 0);
  });
}

function clearPin() {
  _safeRemove(_k('parental', 'pinHash'));
  _safeRemove(_k('parental', 'pinSalt'));
  _writeJson('parental', 'failedAttempts', 0);
  _writeJson('parental', 'lockoutUntilMs', 0);
}

// Returns Promise<{ ok: boolean, lockedUntilMs: number, attemptsRemaining: number }>
function verifyPin(pin) {
  var state = getParental();
  var now = Date.now();
  if (state.lockoutUntilMs > now) {
    return Promise.resolve({ ok: false, lockedUntilMs: state.lockoutUntilMs, attemptsRemaining: 0, lockedOut: true });
  }
  if (!state.pinHash || !state.pinSalt) {
    return Promise.resolve({ ok: false, lockedUntilMs: 0, attemptsRemaining: MAX_FAILED_ATTEMPTS, noPin: true });
  }
  return _hashPin(state.pinSalt, pin).then(function(hashHex) {
    if (hashHex === state.pinHash) {
      _writeJson('parental', 'failedAttempts', 0);
      _writeJson('parental', 'lockoutUntilMs', 0);
      return { ok: true, lockedUntilMs: 0, attemptsRemaining: MAX_FAILED_ATTEMPTS };
    }
    var nextAttempts = state.failedAttempts + 1;
    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      var until = Date.now() + LOCKOUT_MS;
      _writeJson('parental', 'failedAttempts', nextAttempts);
      _writeJson('parental', 'lockoutUntilMs', until);
      return { ok: false, lockedUntilMs: until, attemptsRemaining: 0, lockedOut: true };
    }
    _writeJson('parental', 'failedAttempts', nextAttempts);
    return { ok: false, lockedUntilMs: 0, attemptsRemaining: MAX_FAILED_ATTEMPTS - nextAttempts };
  });
}

function setParental(patch) {
  var cur = getParental();
  var next = Object.assign({}, cur, patch || {});
  // PIN hash + salt + failedAttempts + lockoutUntilMs are managed via
  // setPin/clearPin/verifyPin. This bulk setter only touches policy.
  if (next.ratingCap !== cur.ratingCap) {
    _writeJson('parental', 'ratingCap', _clampStr(next.ratingCap, RATING_TIERS, DEFAULTS.parental.ratingCap));
  }
  if (next.hideAdultCategories !== cur.hideAdultCategories) {
    _writeJson('parental', 'hideAdultCategories', next.hideAdultCategories === true);
  }
  return getParental();
}

// ─────────────────────────────────────────────────────────────────────
// Diagnostics
// ─────────────────────────────────────────────────────────────────────
function getDiagnostics() {
  return {
    autoSendOnError: _readJson('diagnostics', 'autoSendOnError') === true,
    showApiLatency: _readJson('diagnostics', 'showApiLatency') === true,
  };
}

function setDiagnostics(patch) {
  var cur = getDiagnostics();
  var next = Object.assign({}, cur, patch || {});
  _writeJson('diagnostics', 'autoSendOnError', next.autoSendOnError === true);
  _writeJson('diagnostics', 'showApiLatency', next.showApiLatency === true);
  return getDiagnostics();
}

// ─────────────────────────────────────────────────────────────────────
// Full snapshot (used by Backup/Restore export and reset-defaults)
// ─────────────────────────────────────────────────────────────────────
function exportAll() {
  return {
    __schemaVersion: SCHEMA_VERSION,
    __exportedAt: new Date().toISOString(),
    network: getNetwork(),
    playback: getPlayback(),
    parental: (function() {
      // Strip the lockout counters + raw hash on export — the user is
      // backing up _settings_, not a stale lockout state. We DO carry
      // the hash so restore brings the PIN back, but reset counters.
      var p = getParental();
      return {
        pinHash: p.pinHash,
        pinSalt: p.pinSalt,
        ratingCap: p.ratingCap,
        hideAdultCategories: p.hideAdultCategories,
      };
    })(),
    diagnostics: getDiagnostics(),
  };
}

function importAll(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, error: 'Snapshot is not an object' };
  }
  try {
    if (snapshot.network && typeof snapshot.network === 'object') {
      setNetwork(snapshot.network);
    }
    if (snapshot.playback && typeof snapshot.playback === 'object') {
      setPlayback(snapshot.playback);
    }
    if (snapshot.parental && typeof snapshot.parental === 'object') {
      setParental(snapshot.parental);
      if (typeof snapshot.parental.pinHash === 'string' && typeof snapshot.parental.pinSalt === 'string'
          && snapshot.parental.pinHash.length > 0 && snapshot.parental.pinSalt.length > 0) {
        _writeJson('parental', 'pinHash', snapshot.parental.pinHash);
        _writeJson('parental', 'pinSalt', snapshot.parental.pinSalt);
        _writeJson('parental', 'failedAttempts', 0);
        _writeJson('parental', 'lockoutUntilMs', 0);
      }
    }
    if (snapshot.diagnostics && typeof snapshot.diagnostics === 'object') {
      setDiagnostics(snapshot.diagnostics);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Unknown import error' };
  }
}

function resetAll() {
  // Walk every namespaced key and remove it. Cheaper than reflecting
  // over DEFAULTS shape because we want to nuke stragglers from future
  // schema versions that the current code no longer knows about.
  try {
    if (typeof localStorage === 'undefined') return;
    var toRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(NS) === 0 && key !== VER_KEY) {
        toRemove.push(key);
      }
    }
    for (var j = 0; j < toRemove.length; j++) {
      _safeRemove(toRemove[j]);
    }
  } catch (_) { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────
export {
  SCHEMA_VERSION,
  DEFAULTS,
  AUDIO_LANGS,
  SUB_LANGS,
  RATING_TIERS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_MS,
  // Network
  getNetwork,
  setNetwork,
  // Playback
  getPlayback,
  setPlayback,
  // Parental
  getParental,
  setParental,
  hasPin,
  setPin,
  clearPin,
  verifyPin,
  // Diagnostics
  getDiagnostics,
  setDiagnostics,
  // Backup
  exportAll,
  importAll,
  resetAll,
};
