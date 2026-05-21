'use strict';

/**
 * lib/providerStore.js — file-backed multi-provider persistence (W20-PROVIDERS).
 *
 * The user requested TiviMate / IPTV-Smarters-class onboarding: "DaveTV should
 * include to add providers, like apollo group, xtremehd, any provider...
 * should be included with qr codes... inputing the paid data for each provider
 * inside DaveTV".
 *
 * This store is the operator-side database of every provider the user has
 * pasted/scanned/uploaded into the TV. It is OPERATOR-LOCAL — credentials are
 * stored at `data/providers.json` on the API container's writable volume,
 * never echoed in HTTP responses (mask everything before returning to the
 * client) and never committed to git (the `data/` path under the API
 * container's working dir is excluded by .gitignore — see Wave-20 commit).
 *
 * Shape per record:
 *   {
 *     id: 'prov-<8-hex>',
 *     type: 'm3u' | 'xtream' | 'stalker',
 *     label: '<display name>',
 *     url: '<canonical URL>',           // m3u: playlist URL; xtream: panel host
 *     username: '<...>'  | undefined,
 *     password: '<...>'  | undefined,
 *     epg_url:  '<...>'  | undefined,   // optional XMLTV URL
 *     enabled:  true,
 *     created_at: '<ISO>',
 *     last_test:  '<ISO> | null',       // last successful catalog fetch
 *     last_error: '<string> | null'
 *   }
 *
 * Public API (all functions are credential-aware):
 *   list()         → masked rows (no username/password ever returned)
 *   listFull()     → full rows with credentials. SERVER-INTERNAL ONLY — never
 *                    wire this directly into a response payload.
 *   add(input)     → masked row + id
 *   update(id, patch) → masked row
 *   remove(id)     → boolean
 *   setEnabled(id, bool) → masked row
 *   recordTest(id, ok, errorMsg) → updates last_test/last_error, masked row
 *
 * File I/O uses fs.promises with atomic temp-then-rename writes. Failures
 * throw — the caller (routes/providers.js) returns 500 with a sanitised
 * message. Permission 0600 is applied on POSIX (Windows perms are inherited
 * from the parent dir).
 *
 * NO MOCKS / NO STUBS — when the file does not exist yet, list() returns [].
 * The file is created on the first successful add().
 */

var fs = require('fs');
var fsp = require('fs').promises;
var path = require('path');
var crypto = require('crypto');

// data/providers.json lives at <api-root>/data/providers.json. Resolved
// relative to the source tree so unit tests can override via DATA_DIR. The
// path is also excluded from git via .gitignore wave-20.
var DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');
var DATA_FILE_NAME = 'providers.json';

var VALID_TYPES = { m3u: true, xtream: true, stalker: true };

// In-memory cache: lazy-loaded on first read, written-through on every mutate.
// Single-operator deployment means we don't need cross-process locking — the
// API container is the only writer.
var _cache = null;
var _cachePath = null;

function _dataDir() {
  return process.env.HERMES_PROVIDER_DATA_DIR || DEFAULT_DATA_DIR;
}

function _filePath() {
  return path.join(_dataDir(), DATA_FILE_NAME);
}

function _hexId() {
  return 'prov-' + crypto.randomBytes(4).toString('hex');
}

function _nowIso() {
  return new Date().toISOString();
}

// Strip protocol + path so the masked view doesn't leak more than the host.
function _urlHost(url) {
  if (typeof url !== 'string') { return ''; }
  try {
    var u = new URL(url);
    return u.host || '';
  } catch (_) {
    // Not a parseable URL — return a best-effort prefix without query string,
    // capped so a pasted blob can never produce a giant masked row.
    var stripped = url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || '';
    return stripped.split('?')[0].slice(0, 80);
  }
}

// Convert a full record into the masked shape returned to HTTP clients.
// NEVER include username / password / raw URL.
function _mask(row) {
  if (!row || typeof row !== 'object') { return null; }
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    url_host: _urlHost(row.url),
    has_username: !!(row.username && String(row.username).length > 0),
    has_password: !!(row.password && String(row.password).length > 0),
    has_epg: !!(row.epg_url && String(row.epg_url).length > 0),
    enabled: row.enabled !== false,
    created_at: row.created_at || null,
    last_test: row.last_test || null,
    last_error: row.last_error || null,
  };
}

// Load the cache from disk (idempotent — re-reads if the path changed,
// e.g. test override via HERMES_PROVIDER_DATA_DIR).
async function _load() {
  var p = _filePath();
  if (_cache && _cachePath === p) { return _cache; }
  _cachePath = p;
  try {
    var text = await fsp.readFile(p, 'utf8');
    var parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      _cache = [];
      return _cache;
    }
    _cache = parsed.filter(function(r) {
      return r && typeof r === 'object' && typeof r.id === 'string' && VALID_TYPES[r.type];
    });
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
      _cache = [];
    } else {
      throw e;
    }
  }
  return _cache;
}

async function _persist() {
  var p = _filePath();
  var dir = path.dirname(p);
  await fsp.mkdir(dir, { recursive: true });
  var tmp = p + '.tmp-' + process.pid + '-' + Date.now();
  await fsp.writeFile(tmp, JSON.stringify(_cache || [], null, 2), 'utf8');
  await fsp.rename(tmp, p);
  // Best-effort chmod — Windows ignores the bits, POSIX gets 0600 (owner R/W only).
  try { await fsp.chmod(p, 0o600); } catch (_) { /* non-POSIX or permission-fixed FS */ }
}

function _validateInput(input) {
  var errors = [];
  if (!input || typeof input !== 'object') {
    errors.push('body must be an object');
    return errors;
  }
  if (typeof input.type !== 'string' || !VALID_TYPES[input.type]) {
    errors.push('type must be one of: m3u, xtream, stalker');
  }
  if (typeof input.label !== 'string' || input.label.trim().length === 0) {
    errors.push('label is required');
  } else if (input.label.length > 80) {
    errors.push('label must be <= 80 chars');
  }
  if (typeof input.url !== 'string' || input.url.trim().length === 0) {
    errors.push('url is required');
  } else {
    var lower = input.url.trim().toLowerCase();
    var validProtocol = lower.indexOf('http://') === 0 ||
                        lower.indexOf('https://') === 0 ||
                        lower.indexOf('xtream://') === 0;
    if (!validProtocol) {
      errors.push('url must start with http://, https:// or xtream://');
    }
    if (input.url.length > 2048) {
      errors.push('url must be <= 2048 chars');
    }
  }
  if (input.type === 'xtream') {
    if (typeof input.username !== 'string' || input.username.length === 0) {
      errors.push('username is required for xtream');
    }
    if (typeof input.password !== 'string' || input.password.length === 0) {
      errors.push('password is required for xtream');
    }
  }
  // username/password length cap to defeat absurdly long inputs.
  if (typeof input.username === 'string' && input.username.length > 256) {
    errors.push('username must be <= 256 chars');
  }
  if (typeof input.password === 'string' && input.password.length > 256) {
    errors.push('password must be <= 256 chars');
  }
  if (input.epg_url !== undefined && input.epg_url !== null && input.epg_url !== '') {
    if (typeof input.epg_url !== 'string' || input.epg_url.length > 2048) {
      errors.push('epg_url must be a string <= 2048 chars');
    }
  }
  // Priority 4 — schema extensions adopted from
  // docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md §"EPG And Catchup".
  if (input.additional_epg_urls !== undefined && input.additional_epg_urls !== null) {
    if (!Array.isArray(input.additional_epg_urls)) {
      errors.push('additional_epg_urls must be an array');
    } else if (input.additional_epg_urls.length > 16) {
      errors.push('additional_epg_urls capped at 16 entries');
    } else {
      for (var aei = 0; aei < input.additional_epg_urls.length; aei++) {
        var ae = input.additional_epg_urls[aei];
        if (typeof ae !== 'string' || ae.length === 0 || ae.length > 2048) {
          errors.push('additional_epg_urls[' + aei + '] must be a string <= 2048 chars');
        }
      }
    }
  }
  if (input.user_agent !== undefined && input.user_agent !== null && input.user_agent !== '') {
    if (typeof input.user_agent !== 'string' || input.user_agent.length > 256) {
      errors.push('user_agent must be a string <= 256 chars');
    }
  }
  if (input.epg_timeshift_hours !== undefined && input.epg_timeshift_hours !== null) {
    if (typeof input.epg_timeshift_hours !== 'number' ||
        isNaN(input.epg_timeshift_hours) ||
        input.epg_timeshift_hours < -24 || input.epg_timeshift_hours > 24) {
      errors.push('epg_timeshift_hours must be a number in [-24, 24]');
    }
  }
  if (input.disable_provider_epg !== undefined && input.disable_provider_epg !== null) {
    if (typeof input.disable_provider_epg !== 'boolean') {
      errors.push('disable_provider_epg must be a boolean');
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function list() {
  var rows = await _load();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    out.push(_mask(rows[i]));
  }
  return out;
}

// SERVER-INTERNAL ONLY — never wire into an HTTP response. m3uClient and
// xtreamClient call this to enumerate operator-saved providers in addition
// to the legacy env-configured ones.
async function listFull() {
  var rows = await _load();
  // Return a shallow copy so callers can't accidentally mutate the cache.
  return rows.map(function(r) {
    return {
      id: r.id,
      type: r.type,
      label: r.label,
      url: r.url,
      username: r.username,
      password: r.password,
      epg_url: r.epg_url,
      enabled: r.enabled !== false,
      created_at: r.created_at,
      last_test: r.last_test,
      last_error: r.last_error,
    };
  });
}

async function add(input) {
  var errs = _validateInput(input);
  if (errs.length > 0) {
    var e = new Error('validation_failed: ' + errs.join('; '));
    e.code = 'VALIDATION_FAILED';
    e.errors = errs;
    throw e;
  }
  await _load();
  var row = {
    id: _hexId(),
    type: input.type,
    label: String(input.label).trim().slice(0, 80),
    url: String(input.url).trim(),
    username: (typeof input.username === 'string' && input.username.length > 0) ? input.username : undefined,
    password: (typeof input.password === 'string' && input.password.length > 0) ? input.password : undefined,
    epg_url: (typeof input.epg_url === 'string' && input.epg_url.length > 0) ? input.epg_url : undefined,
    // Priority 4 schema extensions (additional_epg_urls + user_agent +
    // epg_timeshift_hours + disable_provider_epg). All optional; persisted
    // server-side only and never appear in masked responses.
    additional_epg_urls: Array.isArray(input.additional_epg_urls) ? input.additional_epg_urls.slice(0, 16) : undefined,
    user_agent: (typeof input.user_agent === 'string' && input.user_agent.length > 0) ? input.user_agent : undefined,
    epg_timeshift_hours: (typeof input.epg_timeshift_hours === 'number') ? input.epg_timeshift_hours : undefined,
    disable_provider_epg: (input.disable_provider_epg === true) ? true : undefined,
    enabled: true,
    created_at: _nowIso(),
    last_test: null,
    last_error: null,
  };
  _cache.push(row);
  await _persist();
  return _mask(row);
}

async function update(id, patch) {
  if (typeof id !== 'string' || id.length === 0) {
    var e = new Error('id is required');
    e.code = 'VALIDATION_FAILED';
    throw e;
  }
  await _load();
  var idx = -1;
  for (var i = 0; i < _cache.length; i++) {
    if (_cache[i].id === id) { idx = i; break; }
  }
  if (idx < 0) { return null; }
  var row = _cache[idx];
  if (patch && typeof patch === 'object') {
    if (typeof patch.label === 'string' && patch.label.trim().length > 0) {
      row.label = patch.label.trim().slice(0, 80);
    }
    if (typeof patch.url === 'string' && patch.url.length > 0) {
      var lower = patch.url.trim().toLowerCase();
      if (lower.indexOf('http://') === 0 || lower.indexOf('https://') === 0 || lower.indexOf('xtream://') === 0) {
        row.url = patch.url.trim();
      }
    }
    if (typeof patch.username === 'string') {
      row.username = patch.username.length > 0 ? patch.username : undefined;
    }
    if (typeof patch.password === 'string') {
      row.password = patch.password.length > 0 ? patch.password : undefined;
    }
    if (patch.epg_url !== undefined) {
      if (typeof patch.epg_url === 'string' && patch.epg_url.length > 0) { row.epg_url = patch.epg_url; }
      else { row.epg_url = undefined; }
    }
    if (typeof patch.enabled === 'boolean') { row.enabled = patch.enabled; }
    if (typeof patch.type === 'string' && VALID_TYPES[patch.type]) { row.type = patch.type; }
  }
  await _persist();
  return _mask(row);
}

async function remove(id) {
  if (typeof id !== 'string' || id.length === 0) { return false; }
  await _load();
  var idx = -1;
  for (var i = 0; i < _cache.length; i++) {
    if (_cache[i].id === id) { idx = i; break; }
  }
  if (idx < 0) { return false; }
  _cache.splice(idx, 1);
  await _persist();
  return true;
}

async function setEnabled(id, enabled) {
  return update(id, { enabled: !!enabled });
}

async function recordTest(id, ok, errorMsg) {
  if (typeof id !== 'string' || id.length === 0) { return null; }
  await _load();
  var idx = -1;
  for (var i = 0; i < _cache.length; i++) {
    if (_cache[i].id === id) { idx = i; break; }
  }
  if (idx < 0) { return null; }
  var row = _cache[idx];
  if (ok) {
    row.last_test = _nowIso();
    row.last_error = null;
  } else {
    row.last_error = (typeof errorMsg === 'string' && errorMsg.length > 0)
      ? errorMsg.slice(0, 240)
      : 'unknown error';
  }
  await _persist();
  return _mask(row);
}

// Test hook — reset cache so unit tests don't leak state. NEVER call from
// production code paths.
function _resetCacheForTests() {
  _cache = null;
  _cachePath = null;
}

module.exports = {
  list: list,
  listFull: listFull,
  add: add,
  update: update,
  remove: remove,
  setEnabled: setEnabled,
  recordTest: recordTest,
  // INTERNAL — never expose in module.exports of any HTTP router.
  _resetCacheForTests: _resetCacheForTests,
  // Re-exported for routes/providers.js so it can return the same masked shape
  // when synthesising responses (e.g. parse-qr → here's a candidate to POST).
  _mask: _mask,
};
