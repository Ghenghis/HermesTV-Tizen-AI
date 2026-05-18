'use strict';

/**
 * routes/pairing.js — Pairing-code endpoint SHAPE for the "Add a Provider" QR flow.
 *
 * The TV displays a QR code + short pairing code (HRM-XXXX). The operator
 * scans on their phone, the phone hits a separate landing page (Phase 2)
 * that POSTs the provider credentials against /api/pair/:code/complete.
 * Meanwhile the TV polls /api/pair/:code every 5s for status.
 *
 *   POST /api/pair
 *     201: { pairing_code, expires_at, ttl_ms }
 *     A fresh code is minted on every call. Codes are in-memory only.
 *
 *   GET /api/pair/:code
 *     200: { pairing_code, status: 'pending'|'completed'|'expired',
 *            issued_at, expires_at, provider_id? }
 *     404: { error: 'pairing_code_not_found' }
 *     Status flips to 'expired' the moment Date.now() > expires_at; the
 *     TV polls this endpoint every 5s and closes the modal on 'completed'.
 *
 *   POST /api/pair/:code/complete
 *     (operator's phone landing page calls this after the user submits
 *     provider credentials at hermestv.local/setup/provider. The actual
 *     credential storage lives in /setup/provider/submit — this endpoint
 *     just flips the in-memory pairing record so the TV poll sees it.)
 *
 *     body: { provider_id }  // 'apollo' | 'xtremehd'
 *     200:  { pairing_code, status: 'completed', provider_id }
 *     400:  validation_failed (bad provider_id)
 *     404:  pairing_code_not_found
 *     410:  pairing_code_expired
 *
 * SECURITY CONTRACT
 *   - Codes are never logged (sanitizeForLog masks if they ever appear in
 *     errors). The 7-char "HRM-XXXX" format is short enough that even a
 *     plaintext leak only buys an attacker a 10-minute window on a single
 *     LAN-only listener.
 *   - No credentials EVER traverse this route. The operator's phone POSTs
 *     credentials to /setup/provider/submit (existing route). This route
 *     only carries a provider_id once the credential storage succeeds.
 *   - In-memory store - server restart wipes all codes. That is intentional
 *     for Phase 1; Phase 2 may persist to settingsStore once the operator
 *     phone landing page lands.
 *
 * TTL POLICY
 *   - 10 minutes (PAIRING_TTL_MS). A janitor sweeps every 60s to free
 *     memory deterministically; in addition, GET always re-checks
 *     expires_at so a stale entry surfaces 'expired' before the sweep.
 */

const { Router } = require('express');
const router = Router();
const crypto = require('crypto');

// Public knobs (also exported for tests).
const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SWEEP_INTERVAL_MS = 60 * 1000;   // 1 minute
const CODE_PATTERN = /^HRM-[A-Z0-9]{4}$/;
const VALID_PROVIDERS = ['apollo', 'xtremehd'];

// Crockford base32 minus I/O/U so the human eye can't misread 0/O or 1/I.
// (Same alphabet Stripe, Twilio, etc. use for short-codes.)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789';

// In-memory store: pairing_code -> envelope.
var _pairings = Object.create(null);

function _generateCode() {
  // 4 random bytes -> 4 alphabet chars. Reject collisions (unlikely at our
  // scale but cheap to guard).
  for (var attempt = 0; attempt < 16; attempt++) {
    var bytes = crypto.randomBytes(4);
    var out = '';
    for (var i = 0; i < 4; i++) {
      out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    var code = 'HRM-' + out;
    if (!_pairings[code]) { return code; }
  }
  // Astronomically unlikely fallback - append a counter so we never block.
  return 'HRM-' + Date.now().toString(36).slice(-4).toUpperCase();
}

function _isExpired(envelope) {
  return Date.now() > Date.parse(envelope.expires_at);
}

function _serialize(envelope) {
  // Shape returned by GET - derives a fresh 'expired' status if TTL passed.
  var status = envelope.status;
  if (status === 'pending' && _isExpired(envelope)) { status = 'expired'; }
  var out = {
    pairing_code: envelope.pairing_code,
    status: status,
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
  };
  if (envelope.provider_id) { out.provider_id = envelope.provider_id; }
  return out;
}

function _sweep() {
  // Drop entries whose TTL has fully lapsed AND were never completed. A
  // 'completed' entry sticks until TTL so the TV's last poll still sees the
  // completion (otherwise a 404 races the success path).
  var now = Date.now();
  var keys = Object.keys(_pairings);
  for (var i = 0; i < keys.length; i++) {
    var env = _pairings[keys[i]];
    if (now > Date.parse(env.expires_at)) {
      delete _pairings[keys[i]];
    }
  }
}

// Run sweep in background. Skip in test env so supertest fixtures don't
// hold the event loop open across describe blocks.
var _sweepHandle = null;
if (process.env.NODE_ENV !== 'test') {
  _sweepHandle = setInterval(_sweep, SWEEP_INTERVAL_MS);
  if (_sweepHandle && typeof _sweepHandle.unref === 'function') {
    _sweepHandle.unref();
  }
}

// POST /api/pair - mint a fresh pairing code. Returns 201 + envelope.
router.post('/api/pair', function(req, res) {
  var now = new Date();
  var code = _generateCode();
  var envelope = {
    pairing_code: code,
    status: 'pending',
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PAIRING_TTL_MS).toISOString(),
  };
  _pairings[code] = envelope;
  res.status(201).json({
    pairing_code: code,
    status: 'pending',
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
    ttl_ms: PAIRING_TTL_MS,
  });
});

// GET /api/pair/:code - TV polls here every 5s while the QR modal is open.
router.get('/api/pair/:code', function(req, res) {
  var code = req.params.code;
  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'pairing_code must match HRM-XXXX',
    });
  }
  var env = _pairings[code];
  if (!env) {
    return res.status(404).json({
      error: 'pairing_code_not_found',
      pairing_code: code,
    });
  }
  return res.json(_serialize(env));
});

// POST /api/pair/:code/complete - operator's phone landing page hits this
// once provider creds are stored. Phase 1: trusts the caller (LAN-only via
// CORS). Phase 2 will add a short-lived auth header derived from the code.
router.post('/api/pair/:code/complete', function(req, res) {
  var code = req.params.code;
  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'pairing_code must match HRM-XXXX',
    });
  }
  var env = _pairings[code];
  if (!env) {
    return res.status(404).json({
      error: 'pairing_code_not_found',
      pairing_code: code,
    });
  }
  if (_isExpired(env)) {
    env.status = 'expired';
    return res.status(410).json({
      error: 'pairing_code_expired',
      pairing_code: code,
    });
  }
  var providerId = req.body && req.body.provider_id;
  if (VALID_PROVIDERS.indexOf(providerId) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'provider_id must be one of: ' + VALID_PROVIDERS.join(', '),
    });
  }
  env.status = 'completed';
  env.provider_id = providerId;
  return res.json(_serialize(env));
});

// Test-only helpers - never exposed via HTTP. Used by tools/test-pairing.js.
router._test_reset = function() {
  _pairings = Object.create(null);
};
router._test_force_expire = function(code) {
  var env = _pairings[code];
  if (env) {
    env.expires_at = new Date(Date.now() - 1000).toISOString();
  }
};
router._test_get_envelope = function(code) {
  return _pairings[code] || null;
};
router._test_PAIRING_TTL_MS = PAIRING_TTL_MS;

module.exports = router;
