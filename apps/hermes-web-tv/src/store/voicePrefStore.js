// voicePrefStore.js — per-profile Azure voice preference persistence.
//
// Mom (Sherri) picks a warm female Aria, Dave picks a casual Guy — and
// expects those picks to survive a TV reboot or a return to the profile
// picker. The voice catalog lives server-side (lib/azureVoices.js); the
// _preference_ is local — it never round-trips to the server because the
// TV is the playback device and the speaker has its own latency profile.
//
// Two storage shapes coexist for backwards compatibility:
//
//   Legacy (still read + written by getVoiceId/setVoiceId/clearVoiceId):
//     hermestv_voice_pref::<profile_id>  →  "en-US-AriaNeural"  (plain string)
//
//   Granular prefs (added for the "voice settings" UI):
//     hermestv:voice-prefs:<profile_id>  →  JSON blob with:
//       master_enabled                bool
//       welcome_greeting_enabled      bool
//       chatbot_reply_enabled         bool
//       command_confirmation_enabled  bool
//       volume                        number 0..100
//       voice_id                      string  (mirrors the legacy slot)
//
// The two slots are kept in sync: setVoiceId() writes both, and
// getVoicePrefs() will lift a legacy voice_id into the JSON blob on read
// so an existing user who only had the legacy string keeps their voice
// after the upgrade.
//
// Returns null / defaults when localStorage is unavailable (Tizen privacy
// mode, opaque-origin iframe, etc.) — callers fall back to whichever
// default voice the profile config carries.
//
// IDs are passed through unchanged — the validation surface (length,
// charset, en-* locale) lives in VoicePickerModal where the user picks
// from the curated Azure catalog. Storing arbitrary text here is safe:
// the worst case is the server returning 404 on the next /api/tts call
// and the UI silently falling back to the default voice.

var STORAGE_KEY_PREFIX = 'hermestv_voice_pref::';
var PREFS_KEY_PREFIX = 'hermestv:voice-prefs:';

// Defaults — used when the JSON blob is missing or malformed.
// master_enabled is left undefined so callers can mix it with
// profile.audio_feedback as a per-profile default (see getVoicePrefs).
var PREFS_DEFAULTS = {
  master_enabled: null, // null = "not yet set, fall back to profile.audio_feedback"
  welcome_greeting_enabled: true,
  chatbot_reply_enabled: true,
  command_confirmation_enabled: true,
  volume: 80,
  voice_id: ''
};

function _legacyKey(profileId) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  return STORAGE_KEY_PREFIX + profileId;
}

function _prefsKey(profileId) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  return PREFS_KEY_PREFIX + profileId;
}

function _safeRead(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function _safeWrite(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}

function _safeRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* silent */ }
}

// ── Legacy voice-id slot (unchanged public API) ─────────────────────────────
function getVoiceId(profileId) {
  var k = _legacyKey(profileId);
  if (!k) { return null; }
  var stored = _safeRead(k);
  if (typeof stored === 'string' && stored.length > 0) { return stored; }
  return null;
}

function setVoiceId(profileId, voiceId) {
  var k = _legacyKey(profileId);
  if (!k) { return; }
  if (typeof voiceId !== 'string' || voiceId.length === 0) {
    clearVoiceId(profileId);
    return;
  }
  _safeWrite(k, voiceId);
  // Keep the JSON blob in lockstep so the granular UI immediately
  // reflects the picker's choice without a refresh.
  var blob = _readBlob(profileId);
  blob.voice_id = voiceId;
  _writeBlob(profileId, blob);
}

function clearVoiceId(profileId) {
  var k = _legacyKey(profileId);
  if (!k) { return; }
  _safeRemove(k);
  var blob = _readBlob(profileId);
  blob.voice_id = '';
  _writeBlob(profileId, blob);
}

// ── Granular prefs blob ─────────────────────────────────────────────────────
function _readBlob(profileId) {
  var k = _prefsKey(profileId);
  if (!k) { return Object.assign({}, PREFS_DEFAULTS); }
  var raw = _safeRead(k);
  if (typeof raw !== 'string' || raw.length === 0) {
    return Object.assign({}, PREFS_DEFAULTS);
  }
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return Object.assign({}, PREFS_DEFAULTS);
    }
    // Merge with defaults so a partial blob from an older app version
    // still answers every key callers may read.
    return Object.assign({}, PREFS_DEFAULTS, parsed);
  } catch (e) {
    return Object.assign({}, PREFS_DEFAULTS);
  }
}

function _writeBlob(profileId, blob) {
  var k = _prefsKey(profileId);
  if (!k) { return; }
  try {
    _safeWrite(k, JSON.stringify(blob));
  } catch (e) {
    // JSON.stringify can throw on cyclic objects, but we only ever
    // hand it a flat dict — keep this catch as a belt-and-braces.
  }
}

// Read merged prefs for a profile. `profile` is the full profile record
// (from profileStore) and is used to seed master_enabled / voice_id
// when the user has not explicitly set them.
//
//   getVoicePrefs({ id: 'mom_tv', audio_feedback: true, preferred_voice_id: 'en-US-AriaNeural' })
//   → { master_enabled: true, welcome_greeting_enabled: true, ..., voice_id: 'en-US-AriaNeural' }
function getVoicePrefs(profile) {
  if (!profile || typeof profile !== 'object' || typeof profile.id !== 'string') {
    return Object.assign({}, PREFS_DEFAULTS, { master_enabled: false });
  }
  var blob = _readBlob(profile.id);
  // master_enabled: null in blob means "inherit from profile". `!!` collapses
  // missing / undefined audio_feedback to false (Dave's quiet default).
  var master = blob.master_enabled;
  if (master === null || typeof master !== 'boolean') {
    master = !!profile.audio_feedback;
  }
  // voice_id: empty in blob → fall back to the legacy slot, then to the
  // profile's preferred_voice_id (server-side default), then to ''.
  var voiceId = blob.voice_id;
  if (typeof voiceId !== 'string' || voiceId.length === 0) {
    voiceId = getVoiceId(profile.id) ||
              (typeof profile.preferred_voice_id === 'string' ? profile.preferred_voice_id : '');
  }
  return {
    master_enabled: master,
    welcome_greeting_enabled: blob.welcome_greeting_enabled !== false,
    chatbot_reply_enabled: blob.chatbot_reply_enabled !== false,
    command_confirmation_enabled: blob.command_confirmation_enabled !== false,
    volume: _clampVolume(blob.volume),
    voice_id: voiceId
  };
}

// Patch a subset of fields. Unspecified keys retain their current value.
// Returns the merged, persisted blob.
function setVoicePrefs(profileId, patch) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  if (!patch || typeof patch !== 'object') { return _readBlob(profileId); }
  var current = _readBlob(profileId);
  // Whitelist + coerce — never let arbitrary keys land in the blob.
  if (typeof patch.master_enabled === 'boolean') { current.master_enabled = patch.master_enabled; }
  if (typeof patch.welcome_greeting_enabled === 'boolean') { current.welcome_greeting_enabled = patch.welcome_greeting_enabled; }
  if (typeof patch.chatbot_reply_enabled === 'boolean') { current.chatbot_reply_enabled = patch.chatbot_reply_enabled; }
  if (typeof patch.command_confirmation_enabled === 'boolean') { current.command_confirmation_enabled = patch.command_confirmation_enabled; }
  if (typeof patch.volume === 'number' && isFinite(patch.volume)) { current.volume = _clampVolume(patch.volume); }
  if (typeof patch.voice_id === 'string') {
    current.voice_id = patch.voice_id;
    // Mirror to the legacy slot so existing callers keep working.
    if (patch.voice_id.length > 0) {
      var lk = _legacyKey(profileId);
      if (lk) { _safeWrite(lk, patch.voice_id); }
    }
  }
  _writeBlob(profileId, current);
  return current;
}

function _clampVolume(v) {
  if (typeof v !== 'number' || !isFinite(v)) { return PREFS_DEFAULTS.volume; }
  if (v < 0) { return 0; }
  if (v > 100) { return 100; }
  return Math.round(v);
}

export {
  getVoiceId, setVoiceId, clearVoiceId,
  getVoicePrefs, setVoicePrefs
};
