'use strict';

/**
 * routes/parental.js — Parental controls endpoints.
 *
 * No direct Zero command equivalent in the public API surface — Zero exposes
 * parental controls only through its settings panel — but the underlying
 * state is identical: a PIN (hashed), per-category locks, and per-rating
 * locks. This route implements that contract as a server-side surface so
 * Mom (Sherri) can lock channel categories to her own profile and Dave can't
 * unlock them without the PIN.
 *
 * SECURITY CONTRACT
 *   - The PIN is hashed with SHA-256 + a per-process random salt before
 *     storage. The raw PIN is NEVER returned. Verification is constant-time.
 *   - PIN body fields are 4-8 numeric digits only — anything else 400s.
 *   - All write endpoints require a profile_id; locks are per-profile.
 *   - Logs go through sanitizeForLog so the PIN can never appear in logs.
 *
 * MAPPING TO HYPOTHETICAL ZERO COMMANDS:
 *   POST   /api/parental/pin           ← set_pin (real, in-memory hashed)
 *   POST   /api/parental/verify        ← verify_pin (real, constant-time)
 *   POST   /api/parental/lock          ← lock_category (real)
 *   POST   /api/parental/unlock        ← unlock_category (real)
 *   GET    /api/parental               ← get_parental_state (real)
 *   DELETE /api/parental/pin           ← clear_pin (requires current PIN)
 */

const crypto = require('crypto');
const { Router } = require('express');
const { sanitizeForLog } = require('../lib/sanitizeLog');
const router = Router();

const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const VALID_CATEGORIES = [
  'sports', 'news', 'entertainment', 'lifestyle', 'family', 'kids',
  'music', 'movies', 'series', 'local-broadcast', 'international',
  'adult', 'documentary', 'religious',
];
const VALID_RATINGS = ['G', 'PG', 'PG-13', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA', 'R', 'NC-17'];

const PIN_PATTERN = /^[0-9]{4,8}$/;

// Per-process salt — never exposed; rotates on every restart (matches the
// in-memory-only contract of the rest of the API).
const SALT = crypto.randomBytes(32);

// Per-profile state. pinHash is null when no PIN is set.
var parentalState = {
  dave_tv: { pinHash: null, locked_categories: new Set(), locked_ratings: new Set() },
  mom_tv:  { pinHash: null, locked_categories: new Set(), locked_ratings: new Set() },
};

function _hashPin(pin) {
  return crypto.createHmac('sha256', SALT).update(String(pin)).digest('hex');
}

function _verifyPin(profileId, pin) {
  const state = parentalState[profileId];
  if (!state || !state.pinHash) { return false; }
  const candidate = _hashPin(pin);
  // Constant-time comparison.
  const a = Buffer.from(state.pinHash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) { return false; }
  return crypto.timingSafeEqual(a, b);
}

function _requireProfileFromBody(req, res) {
  const profileId = req.body && req.body.profile_id;
  if (!profileId || !VALID_PROFILES.includes(profileId)) {
    res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
    return null;
  }
  return profileId;
}

// ─── GET /api/parental ───────────────────────────────────────────────────────
router.get('/api/parental', (req, res) => {
  const profileId = req.query.profile_id;
  if (!profileId || !VALID_PROFILES.includes(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be one of: ' + VALID_PROFILES.join(', '),
    });
  }
  const state = parentalState[profileId];
  res.json({
    profile_id: profileId,
    pin_set: !!state.pinHash,
    locked_categories: Array.from(state.locked_categories),
    locked_ratings: Array.from(state.locked_ratings),
    _meta: { source: 'in-memory', note: 'PIN hash never exposed' },
  });
});

// ─── POST /api/parental/pin ──────────────────────────────────────────────────
// Body: { profile_id, new_pin, current_pin? }
//   - current_pin required if a PIN is already set (replaces existing PIN).
router.post('/api/parental/pin', (req, res) => {
  const profileId = _requireProfileFromBody(req, res);
  if (!profileId) { return; }
  const body = req.body || {};

  if (!body.new_pin || typeof body.new_pin !== 'string') {
    return res.status(400).json({ error: 'validation_failed', message: 'new_pin is required' });
  }
  if (!PIN_PATTERN.test(body.new_pin)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'new_pin must be 4-8 numeric digits',
    });
  }

  const state = parentalState[profileId];
  if (state.pinHash) {
    if (!body.current_pin) {
      return res.status(403).json({
        error: 'current_pin_required',
        message: 'A PIN is already set. Supply current_pin to change it.',
      });
    }
    if (!_verifyPin(profileId, body.current_pin)) {
      console.warn('[parental] PIN change rejected for profile ' + sanitizeForLog(profileId) + ' — current_pin mismatch');
      return res.status(403).json({ error: 'invalid_pin', message: 'current_pin is incorrect' });
    }
  }

  // Reject unknown body fields.
  const ALLOWED = ['profile_id', 'new_pin', 'current_pin'];
  for (const key of Object.keys(body)) {
    if (!ALLOWED.includes(key)) {
      return res.status(400).json({ error: 'validation_failed', message: 'unknown field: ' + key });
    }
  }

  state.pinHash = _hashPin(body.new_pin);
  res.json({
    success: true,
    profile_id: profileId,
    pin_set: true,
  });
});

// ─── DELETE /api/parental/pin ────────────────────────────────────────────────
// Body: { profile_id, current_pin }
router.delete('/api/parental/pin', (req, res) => {
  const profileId = _requireProfileFromBody(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  const state = parentalState[profileId];

  if (!state.pinHash) {
    return res.json({ success: true, profile_id: profileId, pin_set: false, _note: 'No PIN to clear' });
  }

  if (!body.current_pin || !_verifyPin(profileId, body.current_pin)) {
    return res.status(403).json({ error: 'invalid_pin', message: 'current_pin is incorrect' });
  }

  state.pinHash = null;
  state.locked_categories.clear();
  state.locked_ratings.clear();
  res.json({ success: true, profile_id: profileId, pin_set: false });
});

// ─── POST /api/parental/verify ───────────────────────────────────────────────
// Body: { profile_id, pin }
router.post('/api/parental/verify', (req, res) => {
  const profileId = _requireProfileFromBody(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  if (!body.pin || typeof body.pin !== 'string' || !PIN_PATTERN.test(body.pin)) {
    return res.status(400).json({ error: 'validation_failed', message: 'pin must be 4-8 numeric digits' });
  }
  const ok = _verifyPin(profileId, body.pin);
  // Log only the result (true/false), never the PIN itself.
  if (!ok) {
    console.warn('[parental] PIN verify failed for profile ' + sanitizeForLog(profileId));
  }
  res.json({
    success: ok,
    valid: ok,
    profile_id: profileId,
  });
});

// ─── POST /api/parental/lock ─────────────────────────────────────────────────
// Body: { profile_id, pin, category? OR rating? }
router.post('/api/parental/lock', (req, res) => {
  const profileId = _requireProfileFromBody(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  const state = parentalState[profileId];

  if (!state.pinHash) {
    return res.status(403).json({ error: 'pin_required', message: 'Set a PIN via POST /api/parental/pin before locking categories' });
  }
  if (!body.pin || !_verifyPin(profileId, body.pin)) {
    return res.status(403).json({ error: 'invalid_pin', message: 'pin is incorrect' });
  }

  if (body.category && !VALID_CATEGORIES.includes(body.category)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'category must be one of: ' + VALID_CATEGORIES.join(', '),
    });
  }
  if (body.rating && !VALID_RATINGS.includes(body.rating)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'rating must be one of: ' + VALID_RATINGS.join(', '),
    });
  }
  if (!body.category && !body.rating) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Either category or rating must be supplied',
    });
  }

  if (body.category) { state.locked_categories.add(body.category); }
  if (body.rating)   { state.locked_ratings.add(body.rating); }

  res.json({
    success: true,
    profile_id: profileId,
    locked_categories: Array.from(state.locked_categories),
    locked_ratings: Array.from(state.locked_ratings),
  });
});

// ─── POST /api/parental/unlock ───────────────────────────────────────────────
router.post('/api/parental/unlock', (req, res) => {
  const profileId = _requireProfileFromBody(req, res);
  if (!profileId) { return; }
  const body = req.body || {};
  const state = parentalState[profileId];

  if (!state.pinHash) {
    return res.status(403).json({ error: 'pin_required', message: 'Set a PIN via POST /api/parental/pin first' });
  }
  if (!body.pin || !_verifyPin(profileId, body.pin)) {
    return res.status(403).json({ error: 'invalid_pin', message: 'pin is incorrect' });
  }

  if (body.category && !VALID_CATEGORIES.includes(body.category)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'category must be one of: ' + VALID_CATEGORIES.join(', '),
    });
  }
  if (body.rating && !VALID_RATINGS.includes(body.rating)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'rating must be one of: ' + VALID_RATINGS.join(', '),
    });
  }
  if (!body.category && !body.rating) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Either category or rating must be supplied',
    });
  }

  if (body.category) { state.locked_categories.delete(body.category); }
  if (body.rating)   { state.locked_ratings.delete(body.rating); }

  res.json({
    success: true,
    profile_id: profileId,
    locked_categories: Array.from(state.locked_categories),
    locked_ratings: Array.from(state.locked_ratings),
  });
});

module.exports = router;
module.exports._internal = {
  _clear: function() {
    parentalState = {
      dave_tv: { pinHash: null, locked_categories: new Set(), locked_ratings: new Set() },
      mom_tv:  { pinHash: null, locked_categories: new Set(), locked_ratings: new Set() },
    };
  },
};
