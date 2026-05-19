// skipIntroPrefStore.js — per-profile "skip intro automatically" preference.
//
// The skip is performed inside PlayerModal once the operator wires it (a
// follow-up). This store only exposes the preference so the series detail
// panel can offer the toggle and the player can read the same value when
// playback starts. Persistence is per-profile, mirroring voicePrefStore.
//
// Storage key pattern: hermestv_skip_intro_pref::<profile_id>
//   - "hermestv_skip_intro_pref::dave_tv"  → "1"  (on)
//   - "hermestv_skip_intro_pref::mom_tv"   → "0"  (off, default)
//
// Returns false when localStorage is unavailable or the key is missing —
// the safe default is "do not skip" so the user always sees the intro
// the first time. Operators can flip it on per-profile from the detail UI.

var STORAGE_KEY_PREFIX = 'hermestv_skip_intro_pref::';

function _key(profileId) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  return STORAGE_KEY_PREFIX + profileId;
}

function getSkipIntro(profileId) {
  var k = _key(profileId);
  if (!k) { return false; }
  try {
    var stored = localStorage.getItem(k);
    return stored === '1';
  } catch (e) {
    return false;
  }
}

function setSkipIntro(profileId, enabled) {
  var k = _key(profileId);
  if (!k) { return; }
  try {
    localStorage.setItem(k, enabled ? '1' : '0');
  } catch (e) {
    // silent — TV in privacy mode; preference reverts to false next session.
  }
}

export { getSkipIntro, setSkipIntro };
