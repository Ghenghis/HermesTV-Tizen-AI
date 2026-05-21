'use strict';

/**
 * lib/epgMappingStore.js — file-backed persistence for EPG channel-mapping
 * overrides + EPG import settings.
 *
 * Closes HANDOFF blocker #8 — EPG_MAPPING and EPG_SETTINGS in routes/epg.js
 * previously lived in module-scoped vars and wiped on every API restart.
 * Operators who pasted XMLTV channel mappings ("CNN HD" → "live.cnn") via
 * /api/epg/mapping had to redo that work on every container redeploy.
 *
 * Storage shape (per file `data/epg.json`, sibling to providers.json):
 *   {
 *     "mappings": { "<channel_id>": "<epg_id>", ... },
 *     "settings": {
 *       "auto_refresh":     boolean,
 *       "refresh_hour_utc": 0..23,
 *       "keep_days":        1..30,
 *       "match_strategy":   "fuzzy" | "exact" | "prefix",
 *       "default_source_id": string | null
 *     },
 *     "schema_version": 1
 *   }
 *
 * Atomic writes via temp-then-rename, mirroring providerStore.js. Permissions
 * 0600 on POSIX. NO secrets ever land in this file — EPG ids are public.
 *
 * Public API:
 *   getMappings()             → { channel_id: epg_id, ... }
 *   setMapping(channelId, epgId)
 *   clearMappings()
 *   getSettings()             → settings object
 *   updateSettings(patch)     → merged settings
 *   resetSettings()           → DEFAULT_SETTINGS
 *
 * Test hook:
 *   _resetCacheForTests()
 */

var fs = require('fs');
var fsp = require('fs').promises;
var path = require('path');

var DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');
var DATA_FILE_NAME = 'epg.json';
var SCHEMA_VERSION = 1;

var DEFAULT_SETTINGS = {
  auto_refresh: true,
  refresh_hour_utc: 4,
  keep_days: 3,
  match_strategy: 'fuzzy',
  default_source_id: null,
};

// In-memory cache. Lazy-loaded on first read, write-through on every mutate.
var _cache = null;
var _cachePath = null;

function _dataDir() {
  return process.env.HERMES_PROVIDER_DATA_DIR || DEFAULT_DATA_DIR;
}
function _filePath() { return path.join(_dataDir(), DATA_FILE_NAME); }

function _defaultState() {
  return {
    mappings: {},
    settings: Object.assign({}, DEFAULT_SETTINGS),
    schema_version: SCHEMA_VERSION,
  };
}

function _isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function _coerce(raw) {
  if (!_isPlainObject(raw)) { return _defaultState(); }
  var mappings = _isPlainObject(raw.mappings) ? raw.mappings : {};
  // Trust only string-valued entries to avoid letting a corrupt file inject
  // non-string values into the route's later JSON response.
  var cleanMappings = {};
  Object.keys(mappings).forEach(function(k) {
    if (typeof k === 'string' && k.length > 0 && typeof mappings[k] === 'string' && mappings[k].length > 0) {
      cleanMappings[k] = mappings[k];
    }
  });
  var settings = Object.assign({}, DEFAULT_SETTINGS, _isPlainObject(raw.settings) ? raw.settings : {});
  // Re-validate critical fields rather than trusting disk.
  if (typeof settings.refresh_hour_utc !== 'number' || settings.refresh_hour_utc < 0 || settings.refresh_hour_utc > 23) {
    settings.refresh_hour_utc = DEFAULT_SETTINGS.refresh_hour_utc;
  }
  if (typeof settings.keep_days !== 'number' || settings.keep_days < 1 || settings.keep_days > 30) {
    settings.keep_days = DEFAULT_SETTINGS.keep_days;
  }
  var VALID = ['fuzzy', 'exact', 'prefix'];
  if (typeof settings.match_strategy !== 'string' || VALID.indexOf(settings.match_strategy) === -1) {
    settings.match_strategy = DEFAULT_SETTINGS.match_strategy;
  }
  if (settings.default_source_id !== null && typeof settings.default_source_id !== 'string') {
    settings.default_source_id = DEFAULT_SETTINGS.default_source_id;
  }
  if (typeof settings.auto_refresh !== 'boolean') {
    settings.auto_refresh = DEFAULT_SETTINGS.auto_refresh;
  }
  return {
    mappings: cleanMappings,
    settings: settings,
    schema_version: SCHEMA_VERSION,
  };
}

async function _load() {
  var p = _filePath();
  if (_cache && _cachePath === p) { return _cache; }
  _cachePath = p;
  try {
    var text = await fsp.readFile(p, 'utf8');
    var parsed = JSON.parse(text);
    _cache = _coerce(parsed);
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
      _cache = _defaultState();
    } else {
      throw e;
    }
  }
  return _cache;
}

async function _persist() {
  var p = _filePath();
  await fsp.mkdir(path.dirname(p), { recursive: true });
  var tmp = p + '.tmp-' + process.pid + '-' + Date.now();
  await fsp.writeFile(tmp, JSON.stringify(_cache || _defaultState(), null, 2), 'utf8');
  await fsp.rename(tmp, p);
  try { await fsp.chmod(p, 0o600); } catch (_) { /* non-POSIX */ }
}

async function getMappings() {
  var c = await _load();
  // Return a shallow copy so callers can't mutate the cache.
  return Object.assign({}, c.mappings);
}

async function setMapping(channelId, epgId) {
  if (typeof channelId !== 'string' || channelId.length === 0) { return false; }
  if (typeof epgId !== 'string' || epgId.length === 0) { return false; }
  await _load();
  _cache.mappings[channelId] = epgId;
  await _persist();
  return true;
}

async function clearMappings() {
  await _load();
  _cache.mappings = {};
  await _persist();
  return true;
}

async function getSettings() {
  var c = await _load();
  return Object.assign({}, c.settings);
}

async function updateSettings(patch) {
  if (!_isPlainObject(patch)) { return await getSettings(); }
  await _load();
  _cache.settings = Object.assign({}, _cache.settings, patch);
  // Re-coerce post-patch so disk never sees a bad value if the caller skipped
  // validation. _coerce returns a new state; pluck just settings.
  var coerced = _coerce({ mappings: _cache.mappings, settings: _cache.settings });
  _cache.settings = coerced.settings;
  await _persist();
  return Object.assign({}, _cache.settings);
}

async function resetSettings() {
  await _load();
  _cache.settings = Object.assign({}, DEFAULT_SETTINGS);
  await _persist();
  return Object.assign({}, _cache.settings);
}

function _resetCacheForTests() {
  _cache = null;
  _cachePath = null;
}

module.exports = {
  getMappings: getMappings,
  setMapping: setMapping,
  clearMappings: clearMappings,
  getSettings: getSettings,
  updateSettings: updateSettings,
  resetSettings: resetSettings,
  DEFAULT_SETTINGS: Object.assign({}, DEFAULT_SETTINGS),
  _resetCacheForTests: _resetCacheForTests,
  _filePath: _filePath,
};
