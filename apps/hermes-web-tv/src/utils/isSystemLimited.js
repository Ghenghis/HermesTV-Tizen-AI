// ─────────────────────────────────────────────────────────────────────────────
// isSystemLimited — enforces the asymmetric "Mom's TV is never system-limited"
// rule from MEMORY.md.
//
// Background
//   Every shell applies row caps (e.g. `items.slice(0, 12)`) so a 1000-item
//   catalog doesn't render every card into a horizontal overflow rail at
//   once — that's a real Tizen 6.5 / Chrome 76 perf concern on the
//   degraded UN-class panels.
//
//   But the rule says: Mom's TV (Sherri's profile) is NEVER system-limited.
//   So every cap must be gated. Dave (and any other non-Mom profile) sees
//   the existing cap; Mom always sees the full list.
//
// Usage
//   import { isSystemLimited, capForProfile } from '../utils/isSystemLimited.js';
//   var cap = capForProfile(profile, 12);         // 12 for Dave, items.length for Mom
//   {items.slice(0, cap).map(...)}
//
//   // or, for inversions:
//   if (isSystemLimited(profile)) { /* apply the degradation */ }
//
//   // Either pass a full profile object OR a profileId string — the helper
//   // accepts both so call sites that only have one in scope still work.
//
// Detection signals (any one is sufficient — checked in this order)
//   0. profile === 'mom_tv'             — string profileId form (SearchModal etc.)
//   1. profile.mom_mode === true        — primary signal, set by Sherri's profile
//   2. profile.simplified_ui === true   — legacy alias for mom_mode
//   3. profile.id === 'mom_tv'          — default seeded ID
//   4. profile.profile_id === 'mom_tv'  — API-side mirror of id
//   5. display_name === 'Sherri' (case-insensitive) — fallback by name
//   6. nickname === 'Mom' (case-insensitive)        — fallback by nickname
//
// Returns false (i.e. NOT limited, give her everything) when ANY signal
// matches. Returns true for Dave and unknown profiles.
//
// Tizen 6.5 / Chrome 76 safe — no optional chaining, no nullish coalescing.
// ─────────────────────────────────────────────────────────────────────────────

function _isMomProfile(profile) {
  if (profile == null) { return false; }
  // String id form — accepted for call sites that only have profileId in scope
  // (e.g. SearchModal). The seeded id for Sherri is the literal 'mom_tv'.
  if (typeof profile === 'string') {
    return profile === 'mom_tv';
  }
  if (typeof profile !== 'object') { return false; }
  if (profile.mom_mode === true) { return true; }
  if (profile.simplified_ui === true) { return true; }
  if (profile.id === 'mom_tv') { return true; }
  if (profile.profile_id === 'mom_tv') { return true; }
  var dn = profile.display_name;
  if (typeof dn === 'string' && dn.toLowerCase() === 'sherri') { return true; }
  var nick = profile.nickname;
  if (typeof nick === 'string' && nick.toLowerCase() === 'mom') { return true; }
  return false;
}

// True when system caps SHOULD apply to this profile (Dave + unknowns).
// False when this profile must receive the full enhanced experience (Mom).
function isSystemLimited(profile) {
  return !_isMomProfile(profile);
}

// Resolve the effective cap for a profile.
//   - Mom: cap is bypassed → returns a very large number so `.slice(0, cap)`
//     yields the full list. (Using Infinity is safe in slice but we return
//     a finite huge value to keep TypedArray-style call sites tidy.)
//   - Dave / unknown: returns the requested cap unchanged.
function capForProfile(profile, daveCap) {
  if (_isMomProfile(profile)) { return 1e9; }
  return daveCap;
}

export { isSystemLimited, capForProfile };
