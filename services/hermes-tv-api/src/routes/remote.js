'use strict';

/**
 * routes/remote.js — Phone-as-remote relay.
 *
 * Tiny in-memory event bus that lets the phone (running the secondary
 * /remote.html Vite entry) drive the TV's focus model over LAN. The phone
 * POSTs key events keyed by an `HRM-XXXX` pair code; the TV opens a Server-
 * Sent-Events stream against the same code and dispatches the keys into the
 * focus engine.
 *
 *   POST /api/remote/event
 *     body: { pair_code, key, modifiers?, ts }
 *     202:  { accepted: true }
 *     400:  validation_failed (bad pair_code format, missing key, etc.)
 *     Validates pair_code against /^HRM-[A-Z0-9]{4}$/. Pushes the event onto
 *     an in-memory ring buffer (cap 256 per code) and broadcasts to any open
 *     SSE listener for that code.
 *
 *   GET /api/remote/events?pair_code=HRM-XXXX
 *     200:  Server-Sent Events stream (Content-Type: text/event-stream)
 *     400:  validation_failed (bad pair_code format)
 *     Pushes each new event as a single `data: { ... }\n\n` frame. Sends a
 *     `:keepalive\n\n` comment every 25 s so corporate proxies don't drop
 *     the idle socket. Auto-closes after 5 min of zero activity.
 *
 * SECURITY CONTRACT
 *   - LAN-only via CORS (see services/hermes-tv-api/src/index.js LAN_ORIGIN).
 *   - No credentials traverse this route. Keys are arrow names / strings.
 *   - Pair code IS the only auth — same shape as routes/pairing.js. A code
 *     leak only buys an attacker a key-press relay until the TV reboots.
 *   - In-memory only: a server restart drops every event and listener.
 *     Intentional — phone re-connects with the same pair_code and resumes.
 *
 * MOUNT IN services/hermes-tv-api/src/index.js
 *   const remoteRouter = require('./routes/remote');
 *   app.use('/', remoteRouter);
 */

const { Router } = require('express');
const router = Router();

// Public knobs (also exported for tests).
const PAIR_CODE_PATTERN = /^HRM-[A-Z0-9]{4}$/;
const RING_BUFFER_CAP = 256;            // events per pair_code
const SSE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;  // 5 min idle → close
const SSE_KEEPALIVE_MS = 25 * 1000;     // 25 s comment ping
const KEY_MAX_LEN = 32;
const MODIFIERS_MAX_LEN = 32;

// In-memory state keyed by pair_code.
// { 'HRM-ABCD': { events: [...], listeners: Set<res> } }
var _store = Object.create(null);

function _getBucket(code) {
  if (!_store[code]) {
    _store[code] = { events: [], listeners: new Set() };
  }
  return _store[code];
}

function _pushEvent(code, event) {
  const bucket = _getBucket(code);
  bucket.events.push(event);
  if (bucket.events.length > RING_BUFFER_CAP) {
    bucket.events.splice(0, bucket.events.length - RING_BUFFER_CAP);
  }
  // Broadcast to every listener attached to this code. Each `res.write`
  // is wrapped in try/catch so a single dropped socket can't take the
  // whole broadcast loop down.
  bucket.listeners.forEach(function(res) {
    try {
      res.write('data: ' + JSON.stringify(event) + '\n\n');
    } catch (_) {
      // Listener socket already closed — the 'close' handler will sweep it.
    }
  });
}

// POST /api/remote/event — phone-side push.
router.post('/api/remote/event', function(req, res) {
  const body = req.body || {};
  const errors = [];

  const pairCode = typeof body.pair_code === 'string' ? body.pair_code : '';
  if (!PAIR_CODE_PATTERN.test(pairCode)) {
    errors.push('pair_code must match HRM-XXXX');
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) {
    errors.push('key is required');
  } else if (key.length > KEY_MAX_LEN) {
    errors.push('key must be <= ' + KEY_MAX_LEN + ' chars');
  }

  // modifiers is optional; if present, must be a short string.
  var modifiers = null;
  if (body.modifiers !== undefined && body.modifiers !== null) {
    if (typeof body.modifiers !== 'string' || body.modifiers.length > MODIFIERS_MAX_LEN) {
      errors.push('modifiers must be a string <= ' + MODIFIERS_MAX_LEN + ' chars');
    } else {
      modifiers = body.modifiers;
    }
  }

  // ts is optional; default to server time so a phone with stale clock
  // never breaks ordering.
  var ts = typeof body.ts === 'number' ? body.ts : Date.now();
  if (!Number.isFinite(ts)) { ts = Date.now(); }

  if (errors.length > 0) {
    return res.status(400).json({ error: 'validation_failed', errors: errors });
  }

  const event = {
    key: key,
    modifiers: modifiers,
    ts: ts,
    received_at: Date.now(),
  };
  _pushEvent(pairCode, event);
  return res.status(202).json({ accepted: true });
});

// GET /api/remote/events?pair_code=HRM-XXXX — TV-side SSE stream.
router.get('/api/remote/events', function(req, res) {
  const pairCode = typeof req.query.pair_code === 'string' ? req.query.pair_code : '';
  if (!PAIR_CODE_PATTERN.test(pairCode)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'pair_code must match HRM-XXXX',
    });
  }

  // SSE response headers. Cache-Control + X-Accel-Buffering disable any
  // upstream nginx / Cloudflare buffering that would otherwise hold events
  // for several seconds.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':connected ' + pairCode + '\n\n');

  const bucket = _getBucket(pairCode);
  bucket.listeners.add(res);

  // Replay anything already in the ring buffer so a late-joining TV catches
  // events the phone fired in the gap between mount and SSE handshake.
  for (var i = 0; i < bucket.events.length; i++) {
    try {
      res.write('data: ' + JSON.stringify(bucket.events[i]) + '\n\n');
    } catch (_) { /* socket closed mid-replay; close handler will sweep */ }
  }

  // Idle timeout — close the socket after SSE_IDLE_TIMEOUT_MS without any
  // event push or keepalive write. Reset on every send.
  var lastActivity = Date.now();
  var idleHandle = setInterval(function() {
    if (Date.now() - lastActivity > SSE_IDLE_TIMEOUT_MS) {
      try { res.end(); } catch (_) { /* already closed */ }
    }
  }, SSE_IDLE_TIMEOUT_MS);
  if (idleHandle && typeof idleHandle.unref === 'function') { idleHandle.unref(); }

  // Keepalive comment every 25 s.
  var keepaliveHandle = setInterval(function() {
    try {
      res.write(':keepalive\n\n');
      lastActivity = Date.now();
    } catch (_) { /* socket closed; close handler will sweep */ }
  }, SSE_KEEPALIVE_MS);
  if (keepaliveHandle && typeof keepaliveHandle.unref === 'function') { keepaliveHandle.unref(); }

  // Sweep listener + timers on socket close. Drop the bucket entirely once
  // no listeners remain AND no events are buffered.
  req.on('close', function() {
    clearInterval(idleHandle);
    clearInterval(keepaliveHandle);
    const b = _store[pairCode];
    if (b) {
      b.listeners.delete(res);
      if (b.listeners.size === 0 && b.events.length === 0) {
        delete _store[pairCode];
      }
    }
  });
});

// Test-only helpers — never exposed via HTTP.
router._test_reset = function() {
  _store = Object.create(null);
};
router._test_get_events = function(code) {
  return _store[code] ? _store[code].events.slice() : [];
};
router._test_get_listener_count = function(code) {
  return _store[code] ? _store[code].listeners.size : 0;
};
router._test_PAIR_CODE_PATTERN = PAIR_CODE_PATTERN;
router._test_RING_BUFFER_CAP = RING_BUFFER_CAP;

module.exports = router;
