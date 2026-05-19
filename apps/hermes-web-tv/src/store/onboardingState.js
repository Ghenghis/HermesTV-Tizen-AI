// onboardingState.js — first-launch onboarding state for HermesTV.
//
// Owns the "have we welcomed this TV yet?" flag plus per-step answers so the
// wizard can be paused / resumed and the final integrator can read back
// whichever answers we have (e.g. so App.jsx can pick up the tv_model the
// operator just chose without waiting for the next reboot).
//
// Storage keys:
//   hermestv:onboarded            → "true" once the wizard has been completed
//                                  OR explicitly skipped.
//   hermestv:onboarding::<stepId> → JSON-encoded answer for that step.
//
// API:
//   isOnboarded()                    → bool
//   setOnboarded()                   → void (sets flag)
//   getStepAnswer(stepId)            → parsed value or null
//   setStepAnswer(stepId, answer)    → void (persists JSON)
//   reset()                          → void (clears flag + every step answer;
//                                            for QA / "Replay onboarding")
//
// Tizen 6.5 / Chrome 76 safe: no spread, no optional chaining, no async,
// every JSON.parse / localStorage call wrapped in try/catch so a broken
// storage backend never bricks the boot path.

var FLAG_KEY = 'hermestv:onboarded';
var STEP_PREFIX = 'hermestv:onboarding::';

// Internal — every step key we've ever written. We keep an index list so
// reset() can wipe them deterministically even after a deploy renames step
// IDs. The index itself is stored under FLAG_KEY + '::keys'.
var INDEX_KEY = FLAG_KEY + '::keys';

function _safeGet(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) { return null; }
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function _safeSet(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) { return; }
    window.localStorage.setItem(key, value);
  } catch (e) {
    // Quota exceeded or storage disabled — non-fatal. Caller can still
    // continue; the answer just won't persist.
  }
}

function _safeRemove(key) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) { return; }
    window.localStorage.removeItem(key);
  } catch (e) {
    // silent
  }
}

function _readIndex() {
  var raw = _safeGet(INDEX_KEY);
  if (!raw) { return []; }
  try {
    var parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { return parsed; }
    return [];
  } catch (e) {
    return [];
  }
}

function _writeIndex(list) {
  try {
    _safeSet(INDEX_KEY, JSON.stringify(list));
  } catch (e) {
    // silent
  }
}

function _trackStep(stepId) {
  if (typeof stepId !== 'string' || stepId.length === 0) { return; }
  var index = _readIndex();
  if (index.indexOf(stepId) === -1) {
    index.push(stepId);
    _writeIndex(index);
  }
}

function isOnboarded() {
  return _safeGet(FLAG_KEY) === 'true';
}

function setOnboarded() {
  _safeSet(FLAG_KEY, 'true');
}

function getStepAnswer(stepId) {
  if (typeof stepId !== 'string' || stepId.length === 0) { return null; }
  var raw = _safeGet(STEP_PREFIX + stepId);
  if (raw === null) { return null; }
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Stored as a non-JSON string (older build, manual edit). Return as-is.
    return raw;
  }
}

function setStepAnswer(stepId, answer) {
  if (typeof stepId !== 'string' || stepId.length === 0) { return; }
  var serialised;
  try {
    serialised = JSON.stringify(answer);
  } catch (e) {
    // Caller passed something with a cycle / function — fall back to a
    // stringified marker so we don't silently drop the call.
    serialised = JSON.stringify({ _unserialisable: true });
  }
  _safeSet(STEP_PREFIX + stepId, serialised);
  _trackStep(stepId);
}

function reset() {
  var index = _readIndex();
  for (var i = 0; i < index.length; i++) {
    _safeRemove(STEP_PREFIX + index[i]);
  }
  _safeRemove(INDEX_KEY);
  _safeRemove(FLAG_KEY);
}

export {
  isOnboarded,
  setOnboarded,
  getStepAnswer,
  setStepAnswer,
  reset,
};
