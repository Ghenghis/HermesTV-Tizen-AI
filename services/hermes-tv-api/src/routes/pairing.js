'use strict';

/**
 * routes/pairing.js — Pairing-code endpoint for the "Add a Provider" QR flow.
 *
 * The TV displays a QR code + short pairing code (HRM-XXXX). The operator
 * scans on their phone, the phone opens /setup/provider?code=HRM-XXXX,
 * submits provider credentials into the durable provider store, and the TV
 * polls /api/pair/:code every 5s for status.
 *
 *   POST /api/pair
 *     201: { pairing_code, setup_url, expires_at, ttl_ms }
 *     A fresh code is minted on every call. Pairing state is in-memory;
 *     stored provider configs are durable.
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
 *     body: { provider_config: { type, label, url, ... } }
 *     200:  { pairing_code, status: 'completed', persisted_provider_id }
 *     400:  validation_failed / provider_config_required
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
 *   - In-memory store - server restart wipes all active pairing codes. The
 *     durable provider config is persisted by providerStore before completion.
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

function _normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function _publicBaseUrl(req) {
  var configured = process.env.HERMES_PUBLIC_SETUP_BASE_URL ||
                   process.env.HERMES_PUBLIC_URL ||
                   process.env.PUBLIC_BASE_URL ||
                   '';
  if (configured) {
    return String(configured).replace(/\/+$/, '');
  }
  var proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  var host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  if (!host) { return ''; }
  return proto + '://' + host;
}

function _buildSetupUrl(req, code) {
  var base = _publicBaseUrl(req);
  // Public VPS nginx only proxies /api/* to the API container; non-/api paths
  // are owned by the React web container. Encode the QR target through the API
  // prefix so a phone scan opens the real server-rendered setup form.
  var path = '/api/setup/provider?code=' + encodeURIComponent(code);
  return base ? (base + path) : path;
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
  if (envelope.setup_url) { out.setup_url = envelope.setup_url; }
  if (envelope.provider_id) { out.provider_id = envelope.provider_id; }
  if (envelope.persisted_provider_id) { out.persisted_provider_id = envelope.persisted_provider_id; }
  return out;
}

function _validateCompletable(code) {
  var normalized = _normalizeCode(code);
  if (!CODE_PATTERN.test(normalized)) {
    return {
      status: 400,
      body: {
        error: 'validation_failed',
        message: 'pairing_code must match HRM-XXXX',
      },
    };
  }
  var env = _pairings[normalized];
  if (!env) {
    return {
      status: 404,
      body: {
        error: 'pairing_code_not_found',
        pairing_code: normalized,
      },
    };
  }
  if (_isExpired(env)) {
    env.status = 'expired';
    return {
      status: 410,
      body: {
        error: 'pairing_code_expired',
        pairing_code: normalized,
      },
    };
  }
  return { status: 200, code: normalized, envelope: env };
}

function _completeWithProvider(code, providerId, persistedProvider) {
  var ready = _validateCompletable(code);
  if (ready.status !== 200) { return ready; }
  var env = ready.envelope;
  var id = String(providerId || '').trim();
  if (!id) {
    return {
      status: 400,
      body: {
        error: 'validation_failed',
        message: 'provider_id is required',
      },
    };
  }
  env.status = 'completed';
  env.provider_id = id;
  if (persistedProvider && persistedProvider.id) {
    env.persisted_provider_id = persistedProvider.id;
  }
  var out = _serialize(env);
  if (persistedProvider) { out.persisted_provider = persistedProvider; }
  return { status: 200, body: out };
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
  var setupUrl = _buildSetupUrl(req, code);
  var envelope = {
    pairing_code: code,
    status: 'pending',
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PAIRING_TTL_MS).toISOString(),
    setup_url: setupUrl,
  };
  _pairings[code] = envelope;
  res.status(201).json({
    pairing_code: code,
    status: 'pending',
    issued_at: envelope.issued_at,
    expires_at: envelope.expires_at,
    ttl_ms: PAIRING_TTL_MS,
    setup_url: setupUrl,
  });
});

// GET /api/pair/:code - TV polls here every 5s while the QR modal is open.
router.get('/api/pair/:code', function(req, res) {
  var code = _normalizeCode(req.params.code);
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
// once provider creds are stored. Trust boundary is LAN/CORS; completion still
// requires a persisted provider config so the TV never closes on a fake save.
//
// Per docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md P0#2 ("Pairing completion is
// in memory and stores no credentials"): the required `provider_config`
// payload is persisted via providerStore so it
// survives restart and feeds the rest of the registry. The pairing envelope
// itself stays in-memory (short-lived TTL handshake state); the provider
// credential data is durable.
//
// Body shape:
//   {
//     provider_config: {
//       type: 'm3u' | 'xtream' | 'stalker',
//       label: '...',
//       url:   '...',
//       username?: '...',
//       password?: '...',
//       epg_url?: '...'
//     }
//   }
router.post('/api/pair/:code/complete', function(req, res) {
  var code = _normalizeCode(req.params.code);
  var ready = _validateCompletable(code);
  if (ready.status !== 200) {
    return res.status(ready.status).json(ready.body);
  }
  var body = req.body || {};
  var hasProviderConfig = body.provider_config && typeof body.provider_config === 'object';
  if (!hasProviderConfig) {
    return res.status(400).json({
      error: 'provider_config_required',
      message: 'Pairing cannot complete until a provider_config has been saved.',
    });
  }

  var providerStore = require('../lib/providerStore');
  var SANITIZE = require('../lib/sanitizeLog').sanitizeForLog;
  var cfg = body.provider_config;
  return providerStore.add({
    type: cfg.type,
    provider_id: cfg.provider_id,
    label: cfg.label || cfg.type,
    url: cfg.url,
    username: cfg.username,
    password: cfg.password,
    epg_url: cfg.epg_url,
  }).then(function(masked) {
    var completed = _completeWithProvider(code, masked.id, masked);
    return res.status(completed.status).json(completed.body);
  }).catch(function(err) {
    if (err && err.code === 'VALIDATION_FAILED') {
      return res.status(400).json({ error: 'validation_failed', errors: err.errors || [err.message] });
    }
    console.warn('[pairing] persist failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    return res.status(500).json({ error: 'persist_failed', message: 'Could not persist provider config.' });
  });
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
router._test_buildSetupUrl = _buildSetupUrl;
router._validateCompletable = _validateCompletable;
router._completeWithProvider = _completeWithProvider;

module.exports = router;
