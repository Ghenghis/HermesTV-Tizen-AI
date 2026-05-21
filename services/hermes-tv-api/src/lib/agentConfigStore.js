'use strict';

var fs = require('fs');
var fsp = require('fs').promises;
var path = require('path');

var DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');
var DATA_FILE_NAME = 'agent-config.json';

var DEFAULT_ASSISTANT_NAME = 'DaveTV';
var DEFAULT_TRIGGER_PHRASE = 'Hey DaveTV';
var DEFAULT_WAKE_PHRASE_SUPPORTED = false;
var DEFAULT_TRIGGER_MODE = 'remote_button';

var PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var TRIGGER_MODES = {
  remote_button: true,
  active_listening: true,
  unsupported: true,
};

var _cache = null;
var _cachePath = null;

function _dataDir() {
  return process.env.HERMES_AGENT_DATA_DIR ||
    process.env.HERMES_PROVIDER_DATA_DIR ||
    DEFAULT_DATA_DIR;
}

function _filePath() {
  return path.join(_dataDir(), DATA_FILE_NAME);
}

function _nowIso() {
  return new Date().toISOString();
}

function _validateProfileId(profileId) {
  if (typeof profileId !== 'string' || !PROFILE_ID_RE.test(profileId)) {
    var err = new Error('profile_id must match [A-Za-z0-9_-] and be 1-64 characters');
    err.code = 'VALIDATION_FAILED';
    throw err;
  }
  return profileId;
}

function _normaliseTriggerPhrase(value) {
  if (value === undefined || value === null) { return DEFAULT_TRIGGER_PHRASE; }
  if (typeof value !== 'string') {
    var typeErr = new Error('trigger_phrase must be a string');
    typeErr.code = 'VALIDATION_FAILED';
    throw typeErr;
  }
  var trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) { return DEFAULT_TRIGGER_PHRASE; }
  if (trimmed.toLowerCase() === 'hey hermes' || trimmed.toLowerCase() === 'hermes') {
    return DEFAULT_TRIGGER_PHRASE;
  }
  if (trimmed.length < 3 || trimmed.length > 40) {
    var lenErr = new Error('trigger_phrase must be 3-40 characters');
    lenErr.code = 'VALIDATION_FAILED';
    throw lenErr;
  }
  if (!/^[A-Za-z0-9 .,'!?-]+$/.test(trimmed)) {
    var charErr = new Error('trigger_phrase contains unsupported characters');
    charErr.code = 'VALIDATION_FAILED';
    throw charErr;
  }
  return trimmed;
}

function _normaliseAssistantName(value) {
  if (value === undefined || value === null) { return DEFAULT_ASSISTANT_NAME; }
  if (typeof value !== 'string') { return DEFAULT_ASSISTANT_NAME; }
  var trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'hermes') { return DEFAULT_ASSISTANT_NAME; }
  if (trimmed.length > 30) { return trimmed.substring(0, 30); }
  return trimmed;
}

function _defaultConfig(profileId) {
  return {
    profile_id: profileId,
    assistant_name: DEFAULT_ASSISTANT_NAME,
    trigger_phrase: DEFAULT_TRIGGER_PHRASE,
    trigger_enabled: true,
    trigger_mode: DEFAULT_TRIGGER_MODE,
    wake_phrase_supported: DEFAULT_WAKE_PHRASE_SUPPORTED,
    voice_first: true,
    updated_at: null,
  };
}

function _normaliseRecord(profileId, row) {
  var base = _defaultConfig(profileId);
  var input = row && typeof row === 'object' ? row : {};
  var wakeSupported = input.wake_phrase_supported === true;
  var triggerMode = typeof input.trigger_mode === 'string' && TRIGGER_MODES[input.trigger_mode]
    ? input.trigger_mode
    : DEFAULT_TRIGGER_MODE;
  if (!wakeSupported && triggerMode === 'active_listening') {
    triggerMode = DEFAULT_TRIGGER_MODE;
  }
  return {
    profile_id: profileId,
    assistant_name: _normaliseAssistantName(input.assistant_name),
    trigger_phrase: _normaliseTriggerPhrase(input.trigger_phrase),
    trigger_enabled: input.trigger_enabled === false ? false : base.trigger_enabled,
    trigger_mode: triggerMode,
    wake_phrase_supported: wakeSupported,
    voice_first: input.voice_first === false ? false : true,
    updated_at: typeof input.updated_at === 'string' ? input.updated_at : null,
  };
}

async function _load() {
  var p = _filePath();
  if (_cache && _cachePath === p) { return _cache; }
  _cachePath = p;
  try {
    var text = await fsp.readFile(p, 'utf8');
    var parsed = JSON.parse(text);
    _cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
      _cache = {};
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
  await fsp.writeFile(tmp, JSON.stringify(_cache || {}, null, 2), 'utf8');
  await fsp.rename(tmp, p);
  try { await fsp.chmod(p, 0o600); } catch (_) { /* Windows / readonly FS */ }
}

async function get(profileId) {
  profileId = _validateProfileId(profileId);
  var data = await _load();
  return _normaliseRecord(profileId, data[profileId]);
}

async function update(profileId, patch) {
  profileId = _validateProfileId(profileId);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    var bodyErr = new Error('body must be an object');
    bodyErr.code = 'VALIDATION_FAILED';
    throw bodyErr;
  }

  var allowed = {
    trigger_phrase: true,
    trigger_enabled: true,
    voice_first: true,
  };
  var keys = Object.keys(patch);
  for (var i = 0; i < keys.length; i++) {
    if (!allowed[keys[i]]) {
      var fieldErr = new Error('unsupported field: ' + keys[i]);
      fieldErr.code = 'VALIDATION_FAILED';
      throw fieldErr;
    }
  }

  if (patch.trigger_enabled !== undefined && typeof patch.trigger_enabled !== 'boolean') {
    var enabledErr = new Error('trigger_enabled must be boolean');
    enabledErr.code = 'VALIDATION_FAILED';
    throw enabledErr;
  }
  if (patch.voice_first !== undefined && typeof patch.voice_first !== 'boolean') {
    var voiceErr = new Error('voice_first must be boolean');
    voiceErr.code = 'VALIDATION_FAILED';
    throw voiceErr;
  }

  var data = await _load();
  var current = _normaliseRecord(profileId, data[profileId]);
  var next = _normaliseRecord(profileId, Object.assign({}, current, patch, {
    updated_at: _nowIso(),
  }));
  data[profileId] = next;
  await _persist();
  return next;
}

function resetCacheForTests() {
  _cache = null;
  _cachePath = null;
}

module.exports = {
  DEFAULT_ASSISTANT_NAME: DEFAULT_ASSISTANT_NAME,
  DEFAULT_TRIGGER_PHRASE: DEFAULT_TRIGGER_PHRASE,
  get: get,
  update: update,
  _resetCacheForTests: resetCacheForTests,
  _filePathForTests: _filePath,
};
