// providerVisibilityStore.js — per-profile provider visibility toggles.
//
// User request (W16-PROVIDERS):
//   "can features for displaying providers channels/movies/series/live be
//    selected to show or to exclude, like exclude/show iptv-org able to
//    display or hide, xtremehd and apollo group tv — so users can view some
//    or all providers."
//
// This store lets a profile (Mom / Dave / any future seat) opt OUT of one or
// more providers. The on/off state is persisted to localStorage keyed by
// profile_id, so Mom's choices never bleed into Dave's catalog and vice
// versa. Default visibility is "all true" — the system never auto-hides any
// provider; the toggle is purely opt-in per profile.
//
// Mom rule (MEMORY.md / feedback_mom_tv_never_limited):
//   Mom's TV is NEVER system-limited. We hard-code defaults to ALL VISIBLE
//   so the system never reduces Mom's catalog on its own. If Mom herself
//   opens Settings → Providers and hides xtremehd, that's her explicit
//   choice and we respect it — but the SYSTEM never picks for her.
//
// Storage shape (per-profile, under hermestv_provider_visibility::<profile>):
//   '{"iptv_org":true,"xtremehd":true,"apollo_group":true,"xtream":true,"jellyfin":true}'
//
// Provider IDs use the canonical seedCatalog / source-health spelling:
//   apollo_group, xtremehd, iptv_org (underscore form), xtream, jellyfin
// We also accept the hyphenated "iptv-org" form from /api/source-health and
// normalise to the underscore form internally so toggles survive across the
// hyphen/underscore drift between the catalog feed and the UI.
//
// Tizen 6.5 / Chrome 76 safe — no arrow funcs, no destructuring, no template
// strings, no optional chaining, no spread.

var STORAGE_KEY_PREFIX = 'hermestv_provider_visibility::';

// Canonical provider IDs we know about today. Any provider returned by
// /api/source-health that isn't in this list is still respected — the store
// is a free-form map keyed by whatever provider_id the API surfaces — but
// the defaults below guarantee the five "known" providers always start ON
// even if a profile's stored map is missing them.
var KNOWN_PROVIDER_IDS = [
  'iptv_org',
  'xtremehd',
  'apollo_group',
  'xtream',
  'jellyfin'
];

function _key(profileId) {
  if (typeof profileId !== 'string' || profileId.length === 0) { return null; }
  return STORAGE_KEY_PREFIX + profileId;
}

// Normalise the provider id we accept from callers (which sometimes carry
// the source-health / API spelling "iptv-org" with a hyphen) to the storage
// key form ("iptv_org" with an underscore). This keeps the localStorage map
// stable regardless of which surface flipped the toggle.
function _normalise(providerId) {
  if (typeof providerId !== 'string' || providerId.length === 0) { return ''; }
  if (providerId === 'iptv-org') { return 'iptv_org'; }
  return providerId;
}

// Build the "everything visible" default map. Always returns a fresh object
// so callers can mutate it without polluting the module-level constant.
function _defaultMap() {
  var out = {};
  for (var i = 0; i < KNOWN_PROVIDER_IDS.length; i++) {
    out[KNOWN_PROVIDER_IDS[i]] = true;
  }
  return out;
}

// Read the persisted map for a profile. Missing keys are coalesced to true
// so a fresh profile sees every provider. Corrupt JSON falls back to the
// all-visible default rather than throwing — the user should never lose
// visibility because of a bad write.
function getVisibility(profileId) {
  var k = _key(profileId);
  if (!k) { return _defaultMap(); }
  var raw = null;
  try {
    raw = localStorage.getItem(k);
  } catch (_e) {
    return _defaultMap();
  }
  if (!raw) { return _defaultMap(); }
  var parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_e2) {
    return _defaultMap();
  }
  if (!parsed || typeof parsed !== 'object') { return _defaultMap(); }
  var out = _defaultMap();
  // Copy persisted values over the defaults. Anything not in KNOWN_PROVIDER_IDS
  // is still preserved so future providers added by the API are honoured
  // without a code change.
  for (var pid in parsed) {
    if (Object.prototype.hasOwnProperty.call(parsed, pid)) {
      out[pid] = !!parsed[pid];
    }
  }
  return out;
}

// Update one toggle for a profile. Other providers are left alone.
function setVisibility(profileId, providerId, visible) {
  var k = _key(profileId);
  if (!k) { return; }
  var pid = _normalise(providerId);
  if (!pid) { return; }
  var current = getVisibility(profileId);
  current[pid] = !!visible;
  try {
    localStorage.setItem(k, JSON.stringify(current));
  } catch (_e) {
    // silent — TV in privacy mode; selection reverts to default next session.
  }
}

// Convenience: is this provider visible for this profile?
function isVisible(profileId, providerId) {
  var pid = _normalise(providerId);
  if (!pid) { return true; } // unknown provider id → don't hide on a typo
  var map = getVisibility(profileId);
  // Default true — only an explicit `false` value means "hide".
  return map[pid] !== false;
}

// Return the array of provider IDs the user has explicitly hidden. The
// catalog filter walks this list once per fetch to drop matching items.
function getHiddenList(profileId) {
  var map = getVisibility(profileId);
  var out = [];
  for (var pid in map) {
    if (Object.prototype.hasOwnProperty.call(map, pid) && map[pid] === false) {
      out.push(pid);
    }
  }
  return out;
}

// Reset all providers to visible (the default). Used by the "Show all"
// button on the Settings → Providers tab and by the legacy "Reset to
// defaults" action on the General tab.
function resetVisibility(profileId) {
  var k = _key(profileId);
  if (!k) { return; }
  try {
    localStorage.removeItem(k);
  } catch (_e) {
    // silent — same fallback story as setVisibility.
  }
}

export {
  getVisibility,
  setVisibility,
  isVisible,
  getHiddenList,
  resetVisibility,
  KNOWN_PROVIDER_IDS
};
