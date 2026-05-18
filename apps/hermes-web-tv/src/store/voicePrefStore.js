// voicePrefStore.js — per-profile Azure voice preference persistence.
//
// Mom (Sherri) picks a warm female Aria, Dave picks a casual Guy — and
// expects those picks to survive a TV reboot or a return to the profile
// picker. The voice catalog lives server-side (lib/azureVoices.js); the
// _preference_ is local — it never round-trips to the server because the
// TV is the playback device and the speaker has its own latency profile.
//
// Storage key pattern: hermestv_voice_pref::<profile_id>
//   - "hermestv_voice_pref::mom_tv"   → "en-US-AriaNeural"
//   - "hermestv_voice_pref::dave_tv"  → "en-US-GuyNeural"
//
// Returns null when the value is missing or localStorage is unavailable
// (Tizen privacy mode, opaque-origin iframe, etc.) — callers fall back
// to whichever default voice the profile config carries.
//
// IDs are passed through unchanged — the validation surface (length,
// charset, en-* locale) lives in VoicePickerModal where the user picks
// from the curated Azure catalog. Storing arbitrary text here is safe:
// the worst case is the server returning 404 on the next /api/tts call
// and the UI silently falling back to the default voice.

var STORAGE_KEY_PREFIX = 'hermestv_voice_pref::';

function _key(profileId) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  return STORAGE_KEY_PREFIX + profileId;
}

function getVoiceId(profileId) {
  var k = _key(profileId);
  if (!k) { return null; }
  try {
    var stored = localStorage.getItem(k);
    if (typeof stored === 'string' && stored.length > 0) { return stored; }
    return null;
  } catch (e) {
    return null;
  }
}

function setVoiceId(profileId, voiceId) {
  var k = _key(profileId);
  if (!k) { return; }
  if (typeof voiceId !== 'string' || voiceId.length === 0) {
    // Empty string clears the preference rather than persisting an empty value.
    clearVoiceId(profileId);
    return;
  }
  try {
    localStorage.setItem(k, voiceId);
  } catch (e) {
    // localStorage unavailable — silent fail. Preference will not survive
    // reload, but the in-memory state continues to work for this session.
  }
}

function clearVoiceId(profileId) {
  var k = _key(profileId);
  if (!k) { return; }
  try {
    localStorage.removeItem(k);
  } catch (e) {
    // silent
  }
}

export { getVoiceId, setVoiceId, clearVoiceId };
