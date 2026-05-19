// ─────────────────────────────────────────────────────────────────────────────
// profileStore — local persistence of profile records + the active profile ID.
//
// History
//   v0 (PR #?, pre-management UI): only the active profile *ID* was stored
//       here; the actual profile records lived in mockApi.js / the backend.
//       Two IDs were hard-coded — 'dave_tv' and 'mom_tv'.
//   v1 (this PR): full CRUD over profile records lives client-side so the
//       user can add / edit / delete profiles without a backend round-trip.
//       The original 'dave_tv' + 'mom_tv' defaults are seeded on first load
//       so existing behaviour is preserved. Both originals can be customised
//       but deleting them is allowed — the user can recreate by display name.
//
// Storage shape
//   localStorage['hermestv:profiles']   — JSON array of profile objects
//   localStorage['hermestv_profile_id'] — string, active profile ID (legacy)
//   localStorage['hermestv:profile_settings'] — JSON object, picker settings
//
// Profile object schema (all fields have defaults for migration safety)
//   id:             string  — stable identifier (never changes)
//   display_name:   string  — shown in the picker tile + header
//   nickname:       string  — optional, what the agent calls the user
//   avatar_emoji:   string  — single unicode char (e.g. '🌟')
//   active_theme:   string  — one of the 12 theme IDs (see THEMES)
//   font_scale:     number  — 0.75 .. 1.75 in 0.25 steps
//   reduced_motion: boolean — when true, body.motion-reduced is added
//   mom_mode:       boolean — when true, font_scale is clamped to >= 1.25
//   tier_override:  string  — 'auto' | 'enhanced' | 'degraded'
//   agent_name:     string  — what the user calls the agent (default 'Hermes')
//   audio_feedback: boolean — Azure TTS greeting on boot
//   tv_model:       string  — TV model string (Tizen detection seed)
//
// Tizen 6.5 / Chrome 76 safe: no optional chaining, no nullish coalescing,
// no spread. We use Object.assign + ternary + typeof checks throughout.
// ─────────────────────────────────────────────────────────────────────────────

var STORAGE_KEY = 'hermestv_profile_id';
var PROFILES_KEY = 'hermestv:profiles';
var SETTINGS_KEY = 'hermestv:profile_settings';

// ── Defaults ────────────────────────────────────────────────────────────────
// Seeded on first boot when localStorage[PROFILES_KEY] is empty. Mirrors the
// hard-coded values that used to live in mockApi.js so the picker shows
// "Dave" + "Sherri" out of the box for returning users.
var DEFAULT_PROFILES = [
  {
    id: 'dave_tv',
    display_name: 'Dave',
    nickname: 'Dave',
    avatar_emoji: '👤',
    active_theme: 'night-blue',
    font_scale: 1.0,
    reduced_motion: false,
    mom_mode: false,
    tier_override: 'auto',
    agent_name: 'Hermes',
    audio_feedback: false,
    tv_model: 'UN55CU8000BXZA'
  },
  {
    id: 'mom_tv',
    display_name: 'Sherri',
    nickname: 'Mom',
    avatar_emoji: '🌟',
    active_theme: 'mom-calm',
    font_scale: 1.35,
    reduced_motion: true,
    mom_mode: true,
    tier_override: 'auto',
    agent_name: 'Hermes',
    audio_feedback: true,
    tv_model: 'QN85Q7FAAFXZA'
  }
];

var DEFAULT_SETTINGS = {
  allow_chat_switch: true,
  always_show_picker: false,
  default_profile_id: 'mom_tv'
};

// Per-field defaults — applied to any stored profile object that's missing
// a field. This is the "migration safety" mentioned in the spec — new fields
// added in later versions auto-fill instead of crashing the UI.
var PROFILE_DEFAULTS = {
  display_name:   'New profile',
  nickname:       '',
  avatar_emoji:   '👤',
  active_theme:   'night-blue',
  font_scale:     1.0,
  reduced_motion: false,
  mom_mode:       false,
  tier_override:  'auto',
  agent_name:     'Hermes',
  audio_feedback: false,
  tv_model:       'QN85Q7FAAFXZA'
};

// ── Internal helpers ────────────────────────────────────────────────────────
function _safeRead(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function _safeWrite(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function _safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    // silent
  }
}

// Apply per-field defaults so older stored profiles don't crash newer code.
function _normaliseProfile(raw) {
  if (!raw || typeof raw !== 'object') { return null; }
  var out = Object.assign({}, PROFILE_DEFAULTS, raw);
  // Mom Mode enforcement — never below 1.25
  if (out.mom_mode === true && (typeof out.font_scale !== 'number' || out.font_scale < 1.25)) {
    out.font_scale = 1.25;
  }
  // Coerce numeric font_scale
  if (typeof out.font_scale !== 'number' || isNaN(out.font_scale)) {
    out.font_scale = PROFILE_DEFAULTS.font_scale;
  }
  // Snap to the slider step grid (0.75, 1.0, 1.25, 1.5, 1.75)
  // but only if the stored value falls outside expected bounds.
  if (out.font_scale < 0.75) { out.font_scale = 0.75; }
  if (out.font_scale > 1.75) { out.font_scale = 1.75; }
  // Tier override sanity
  if (out.tier_override !== 'auto' && out.tier_override !== 'enhanced' && out.tier_override !== 'degraded') {
    out.tier_override = 'auto';
  }
  return out;
}

function _generateId(displayName) {
  // Derive a slug from the display name + timestamp for uniqueness. Keeps
  // IDs human-readable in localStorage / dev tools while preventing
  // collisions when two profiles share a name.
  var slug = String(displayName || 'profile')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 24);
  if (!slug) { slug = 'profile'; }
  return slug + '_' + Date.now().toString(36);
}

// ── Profiles list (CRUD) ────────────────────────────────────────────────────
function _readRawProfiles() {
  var raw = _safeRead(PROFILES_KEY);
  if (!raw) { return null; }
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) { return null; }
    return parsed;
  } catch (e) {
    return null;
  }
}

function _writeProfiles(list) {
  return _safeWrite(PROFILES_KEY, JSON.stringify(list));
}

function listProfiles() {
  var raw = _readRawProfiles();
  if (!raw) {
    // First-load seed — clone the defaults so callers can mutate freely.
    var seeded = [];
    for (var i = 0; i < DEFAULT_PROFILES.length; i++) {
      seeded.push(_normaliseProfile(DEFAULT_PROFILES[i]));
    }
    _writeProfiles(seeded);
    return seeded;
  }
  // Normalise every stored profile so missing fields get defaults.
  var out = [];
  for (var j = 0; j < raw.length; j++) {
    var n = _normaliseProfile(raw[j]);
    if (n && typeof n.id === 'string' && n.id) { out.push(n); }
  }
  return out;
}

function getProfile(id) {
  if (!id) { return null; }
  var all = listProfiles();
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) { return all[i]; }
  }
  return null;
}

function createProfile(profile) {
  var all = listProfiles();
  var input = profile || {};
  // Allow caller to pass an explicit id (used by dave_tv / mom_tv recreation
  // when the user previously deleted them and now adds them back by name).
  var id = input.id;
  if (!id) { id = _generateId(input.display_name); }
  // If the id already exists, append a disambiguator instead of overwriting.
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) {
      id = id + '_' + Math.random().toString(36).substring(2, 6);
      break;
    }
  }
  var record = _normaliseProfile(Object.assign({}, input, { id: id }));
  all.push(record);
  _writeProfiles(all);
  return record;
}

function updateProfile(id, patch) {
  if (!id) { return null; }
  var all = listProfiles();
  var found = null;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) {
      // Preserve the id even if the patch accidentally includes one.
      var merged = Object.assign({}, all[i], patch || {}, { id: id });
      all[i] = _normaliseProfile(merged);
      found = all[i];
      break;
    }
  }
  if (found) { _writeProfiles(all); }
  return found;
}

function deleteProfile(id) {
  if (!id) { return false; }
  var all = listProfiles();
  var next = [];
  var removed = false;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) { removed = true; continue; }
    next.push(all[i]);
  }
  if (!removed) { return false; }
  _writeProfiles(next);
  // If the active profile was the one being deleted, clear it so the picker
  // shows on next boot instead of attempting to load a phantom profile.
  if (getActiveProfileId() === id) { clearActiveProfileId(); }
  // Same cleanup for picker settings — fall back to a remaining profile.
  var settings = getSettings();
  if (settings.default_profile_id === id) {
    var fallback = next.length > 0 ? next[0].id : null;
    setSettings({ default_profile_id: fallback });
  }
  return true;
}

// ── Active profile ID ──────────────────────────────────────────────────────
// Backwards compatible with v0 — same key, same value semantics. The set
// validation now consults the live profile list instead of a fixed allowlist.
function isValidId(id) {
  if (!id || typeof id !== 'string') { return false; }
  var all = listProfiles();
  for (var i = 0; i < all.length; i++) {
    if (all[i].id === id) { return true; }
  }
  return false;
}

function getActiveProfileId() {
  var stored = _safeRead(STORAGE_KEY);
  if (stored && isValidId(stored)) { return stored; }
  return null;
}

function setActiveProfileId(id) {
  if (!isValidId(id)) {
    throw new Error('Invalid profile ID: ' + id + '. Profile not found.');
  }
  _safeWrite(STORAGE_KEY, id);
}

function clearActiveProfileId() {
  _safeRemove(STORAGE_KEY);
}

// ── Picker settings ────────────────────────────────────────────────────────
function getSettings() {
  var raw = _safeRead(SETTINGS_KEY);
  if (!raw) { return Object.assign({}, DEFAULT_SETTINGS); }
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
    return Object.assign({}, DEFAULT_SETTINGS, parsed);
  } catch (e) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

function setSettings(patch) {
  var current = getSettings();
  var merged = Object.assign({}, current, patch || {});
  _safeWrite(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

export {
  // Active profile ID (v0 API — preserved for existing callers in App.jsx)
  getActiveProfileId,
  setActiveProfileId,
  clearActiveProfileId,
  // Profile records (v1 — new CRUD surface)
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  // Picker settings (Settings tab in ProfileManagementModal)
  getSettings,
  setSettings,
  // Defaults exposed so the modal can show theme/avatar pickers without
  // duplicating constants.
  DEFAULT_PROFILES,
  PROFILE_DEFAULTS
};
