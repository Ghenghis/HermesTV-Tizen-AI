'use strict';

/**
 * test/credentialGuardSync.test.js — HANDOFF blocker #7.
 *
 * Proves that middleware/credentialGuard.FORBIDDEN_PATTERNS and
 * lib/sanitizeLog.FORBIDDEN_PATTERNS stay in lockstep. A string that is
 * dangerous to log to STDOUT is also dangerous to ship in an HTTP body;
 * divergence is a release-blocker because credentials may pass one layer
 * and be redacted by the other.
 *
 * Test does NOT require equality of regex objects (the two files use
 * different flags — credentialGuard uses simple /i for test(), sanitizeLog
 * uses /gi for replace()), but the SET of trigger strings each layer
 * catches must match for the canonical payloads we care about.
 */

var path = require('path');
var credentialGuard = require(path.resolve(__dirname, '..', 'src', 'middleware', 'credentialGuard.js'));
var sanitizeLog = require(path.resolve(__dirname, '..', 'src', 'lib', 'sanitizeLog.js'));

var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) { console.log('FAIL: ' + label + (detail ? ' — ' + detail : '')); totalFail += 1; }

var GUARD_PATTERNS = credentialGuard._FORBIDDEN_PATTERNS;
var SANI_PATTERNS = sanitizeLog._FORBIDDEN_PATTERNS;

if (!Array.isArray(GUARD_PATTERNS) || GUARD_PATTERNS.length === 0) {
  fail('credentialGuard._FORBIDDEN_PATTERNS missing', 'expected array, got ' + typeof GUARD_PATTERNS);
} else {
  pass('credentialGuard exports _FORBIDDEN_PATTERNS (' + GUARD_PATTERNS.length + ' entries)');
}
if (!Array.isArray(SANI_PATTERNS) || SANI_PATTERNS.length === 0) {
  fail('sanitizeLog._FORBIDDEN_PATTERNS missing', 'expected array, got ' + typeof SANI_PATTERNS);
} else {
  pass('sanitizeLog exports _FORBIDDEN_PATTERNS (' + SANI_PATTERNS.length + ' entries)');
}

// Canonical leak payloads. Each MUST be caught by BOTH layers. If a new
// pattern lands in sanitizeLog without a matching credentialGuard entry,
// this test catches the regression at PR time.
var LEAK_PAYLOADS = [
  { label: 'Xtream M3U URL',          payload: 'http://host:8080/get.php?username=demo&password=demo&type=m3u_plus&output=ts' },
  { label: 'Xtream player_api',       payload: 'http://host:8080/player_api.php?username=demo&password=demo&action=get_live_streams' },
  { label: 'X-UI panel token header', payload: 'x-ui-token: 1234567890abcdef1234567890abcdef' },
  { label: 'OAuth client secret',     payload: 'client_secret=abcd1234ef567890fedcba0987654321' },
  { label: 'Azure TTS env',           payload: 'AZURE_TTS_KEY=longishLookingKeyValueAbcdef0123456789' },
  { label: 'DeepSeek API key',        payload: 'DEEPSEEK_API_KEY=sk-fakeFakeFakeFakeFakeFakeFake' },
  { label: 'Generic api_key',         payload: 'api_key=Fake1234FakeFakeFake1234' },
  { label: 'Jellyfin api_key query',  payload: 'https://jellyfin.example.test/Videos/movie-1/stream?Static=true&api_key=Fake1234FakeFakeFake1234' },
  { label: 'Generic password=',       payload: 'password=Sup3rSecretPass!2024' },
  { label: 'Bearer token',            payload: 'Authorization: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature' },
  { label: 'OpenAI sk- key',          payload: 'OPENAI_API_KEY=sk-1234567890abcdefghijklmnopqr' },
  { label: 'Azure Speech header',     payload: 'Ocp-Apim-Subscription-Key: someAzureSpeechSubscriptionKeyValue' },
  { label: 'Jellyfin token header',   payload: 'X-Emby-Token: jellyfinTokenValueThatMustNotLeak123' },
  { label: 'Xtream m3u_plus marker',  payload: 'http://host/path?type=m3u_plus&extra=1' },
];

LEAK_PAYLOADS.forEach(function(p) {
  // Layer 1 — credentialGuard: at least one pattern must .test() the payload.
  var guardHit = false;
  for (var i = 0; i < GUARD_PATTERNS.length; i++) {
    if (GUARD_PATTERNS[i].test(p.payload)) { guardHit = true; break; }
  }
  if (guardHit) {
    pass('credentialGuard catches: ' + p.label);
  } else {
    fail('credentialGuard MISS: ' + p.label, 'payload would leak through HTTP response');
  }

  // Layer 2 — sanitizeLog: the same payload must be redacted (any change
  // means the pattern matched).
  var redacted = sanitizeLog.sanitizeForLog(p.payload);
  if (redacted !== p.payload && redacted.indexOf('[REDACTED]') !== -1) {
    pass('sanitizeLog redacts: ' + p.label);
  } else {
    fail('sanitizeLog MISS: ' + p.label, 'logger would echo the payload verbatim');
  }
});

// Counterexample — a benign payload must pass both layers unchanged.
var BENIGN = [
  { label: 'plain prose',     payload: 'Provider successfully saved to disk.' },
  { label: 'json envelope',   payload: '{"providers":[{"id":"prov-deadbeef","label":"Apollo"}]}' },
  { label: 'masked host',     payload: 'http://example.com:8080' },
];
BENIGN.forEach(function(b) {
  var guardHit = false;
  for (var i = 0; i < GUARD_PATTERNS.length; i++) {
    if (GUARD_PATTERNS[i].test(b.payload)) { guardHit = true; break; }
  }
  if (guardHit) {
    fail('credentialGuard FALSE POSITIVE: ' + b.label, b.payload);
  } else {
    pass('credentialGuard allows benign: ' + b.label);
  }
  var redacted = sanitizeLog.sanitizeForLog(b.payload);
  if (redacted === b.payload) {
    pass('sanitizeLog leaves benign untouched: ' + b.label);
  } else {
    fail('sanitizeLog FALSE POSITIVE: ' + b.label, 'redacted="' + redacted + '"');
  }
});

console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
process.exit(totalFail > 0 ? 1 : 0);
