// playbackPrefStore.js — per-profile playback preferences persistence.
//
// Wave 2-D introduces a granular "Playback" tab in Settings (skip intro,
// auto-play next episode, preferred quality, etc.). Those toggles need to
// survive a TV reboot and stay scoped to the active profile — Mom's "always
// play next episode" choice must not flip Dave's player into auto-advance.
//
// This store mirrors the pattern in voicePrefStore.js: a single JSON blob
// per profile under a versioned key, with whitelisted writes through `set()`
// so an old build that wrote arbitrary keys can never poison newer reads.
//
//   Storage key: hermestv:playback-prefs:<profile_id>
//   Payload:     JSON object with the fields listed in PREFS_DEFAULTS
//
// Note: an older preference key exists in skipIntroPrefStore.js
// ('hermestv_skip_intro_pref::<profile_id>'). We intentionally do NOT
// touch that key here — Wave 2-F's PlayerModal still reads the legacy
// slot, and the Settings tab that mounts SkipIntroToggle will keep them
// in sync via its own onChange handler (or the toggle's standalone form
// will mirror to both slots — see SkipIntroToggle.jsx).
//
// Returns defaults (never null) when localStorage is unavailable so
// callers can render without a null-check branch. Tizen 6.5 / Chrome 76
// safe — no optional chaining, no spread, no nullish coalescing.

var STORAGE_KEY_PREFIX = 'hermestv:playback-prefs:';

// Whitelisted quality buckets. 'auto' lets the ABR ladder pick.
var QUALITY_VALUES = ['auto', '4K', '1080p', '720p', '480p'];

// Defaults applied when the JSON blob is missing, malformed, or a partial
// payload from an older app version is missing fields. Keep these in lock-
// step with the documented defaults in the task spec.
var PREFS_DEFAULTS = {
  skip_intro_enabled: false,
  auto_play_next_episode: true,
  auto_play_live_channel_up_down: true,
  pip_default_on_minimize: false,
  preferred_quality: 'auto',
  preferred_audio_language: 'auto',
  preferred_subtitle_language: 'off'
};

function _key(profileId) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  return STORAGE_KEY_PREFIX + profileId;
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

function _isValidQuality(v) {
  if (typeof v !== 'string') { return false; }
  for (var i = 0; i < QUALITY_VALUES.length; i++) {
    if (QUALITY_VALUES[i] === v) { return true; }
  }
  return false;
}

function _readBlob(profileId) {
  var k = _key(profileId);
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
    // Merge with defaults so partial blobs from older app versions still
    // answer every key callers may read.
    return Object.assign({}, PREFS_DEFAULTS, parsed);
  } catch (e) {
    return Object.assign({}, PREFS_DEFAULTS);
  }
}

function _writeBlob(profileId, blob) {
  var k = _key(profileId);
  if (!k) { return; }
  try {
    _safeWrite(k, JSON.stringify(blob));
  } catch (e) {
    // JSON.stringify only fails on cyclic input — we only hand it a flat
    // dict, but keep the catch as belt-and-braces.
  }
}

// Read the merged playback preferences for a profile. Always returns a
// full object — never null — so callers can destructure without guards.
//
//   get('dave_tv')
//   → { skip_intro_enabled: false, auto_play_next_episode: true, ... }
function get(profileId) {
  return _readBlob(profileId);
}

// Patch a subset of fields. Unspecified keys retain their current value.
// Returns the merged, persisted blob (or current blob on no-op).
//
//   set('mom_tv', { skip_intro_enabled: true })
//   → { skip_intro_enabled: true, auto_play_next_episode: true, ... }
function set(profileId, patch) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  if (!patch || typeof patch !== 'object') { return _readBlob(profileId); }
  var current = _readBlob(profileId);
  // Whitelist + coerce — never let arbitrary keys land in the blob.
  if (typeof patch.skip_intro_enabled === 'boolean') {
    current.skip_intro_enabled = patch.skip_intro_enabled;
  }
  if (typeof patch.auto_play_next_episode === 'boolean') {
    current.auto_play_next_episode = patch.auto_play_next_episode;
  }
  if (typeof patch.auto_play_live_channel_up_down === 'boolean') {
    current.auto_play_live_channel_up_down = patch.auto_play_live_channel_up_down;
  }
  if (typeof patch.pip_default_on_minimize === 'boolean') {
    current.pip_default_on_minimize = patch.pip_default_on_minimize;
  }
  if (_isValidQuality(patch.preferred_quality)) {
    current.preferred_quality = patch.preferred_quality;
  }
  if (typeof patch.preferred_audio_language === 'string' && patch.preferred_audio_language.length > 0) {
    current.preferred_audio_language = patch.preferred_audio_language;
  }
  if (typeof patch.preferred_subtitle_language === 'string' && patch.preferred_subtitle_language.length > 0) {
    current.preferred_subtitle_language = patch.preferred_subtitle_language;
  }
  _writeBlob(profileId, current);
  return current;
}

// Reset a profile's playback prefs back to defaults. Removes the storage
// key entirely so a subsequent get() returns a fresh copy of PREFS_DEFAULTS.
function reset(profileId) {
  var k = _key(profileId);
  if (!k) { return Object.assign({}, PREFS_DEFAULTS); }
  _safeRemove(k);
  return Object.assign({}, PREFS_DEFAULTS);
}

export { get, set, reset, PREFS_DEFAULTS, QUALITY_VALUES };
