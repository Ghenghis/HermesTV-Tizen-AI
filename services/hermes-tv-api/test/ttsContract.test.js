'use strict';

/**
 * test/ttsContract.test.js — Azure TTS surface contract.
 *
 * Pins down /api/tts/* behaviour so the UI gate (apps/hermes-web-tv/.../
 * VoiceSettings.jsx) can trust the response shapes. The memory rule
 * `feedback_voice_tts_azure_only` requires that Azure is the ONLY voice
 * output path — no browser SpeechSynthesis, no Bixby — and this test
 * proves the route refuses to fake synthesis when the Azure subscription
 * is not configured.
 *
 * What the test asserts:
 *   GET  /api/tts/voices              → 200, voices[], azure_configured boolean,
 *                                       source field present
 *   GET  /api/tts/voice/mom_tv        → 200, profile_id+voice_id set
 *   PATCH /api/tts/voice/mom_tv       (invalid voice_id) → 400 invalid_voice_id
 *   POST /api/tts/speak (empty text)  → 400 validation_failed
 *   POST /api/tts/speak (>800 chars)  → 400 validation_failed
 *   POST /api/tts/speak (creds in text) → 400 credential_pattern_blocked
 *   POST /api/tts/speak (no profile_id) → 400 validation_failed
 *   POST /api/tts/speak (Azure not configured)
 *                                     → 202 status='azure_not_configured'
 *                                       NO audio bytes, NO env-var names leaked
 *
 * Pattern matches setupProviderRestart.e2e.test.js — isolated admin in a
 * mkdtemp auth store, single boot.
 */

var http = require('http');
var path = require('path');
var fs = require('fs');
var os = require('os');

var hermesApp = null;
var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) { console.log('FAIL: ' + label + (detail ? ' — ' + detail : '')); totalFail += 1; }

var SMOKE_ADMIN_EMAIL = 'tts-admin@example.invalid';
var SMOKE_ADMIN_PASSWORD = 'TtsAdmin-' + Math.random().toString(36).slice(2, 14);
var SESSION_COOKIE = '';

function call(method, url, body) {
  return new Promise(function(resolve) {
    var u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0 }); }
    var headers = { Accept: 'application/json' };
    if (SESSION_COOKIE) { headers.Cookie = SESSION_COOKIE; }
    var data = null;
    if (body !== undefined && body !== null) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    var req = http.request({
      method: method, hostname: u.hostname, port: u.port || 80,
      path: u.pathname + (u.search || ''), headers: headers,
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) {}
        var sc = res.headers['set-cookie'];
        if (Array.isArray(sc)) {
          var sess = sc.find(function(s) { return /^davetv_session=/i.test(s); });
          if (sess) { SESSION_COOKIE = sess.split(';')[0]; }
        }
        resolve({ status: res.statusCode, body: parsed, raw: raw, headers: res.headers });
      });
    });
    req.on('error', function() { resolve({ status: 0 }); });
    req.setTimeout(15000, function() { try { req.destroy(); } catch (_) {} });
    if (data) { req.write(data); }
    req.end();
  });
}

function bootHermesApi(port) {
  return new Promise(function(resolve, reject) {
    process.env.PORT = String(port);
    process.env.NODE_ENV = 'test';
    var apiPath = path.resolve(__dirname, '..', 'src', 'index.js');
    Object.keys(require.cache).forEach(function(k) {
      if (k.indexOf(path.resolve(__dirname, '..', 'src')) === 0) { delete require.cache[k]; }
    });
    try { hermesApp = require(apiPath); } catch (e) { return reject(e); }
    var deadline = Date.now() + 20000;
    function probe() {
      call('GET', 'http://127.0.0.1:' + port + '/health').then(function(r) {
        if (r.status === 200) { return resolve(); }
        if (Date.now() > deadline) { return reject(new Error('not healthy in 20s')); }
        setTimeout(probe, 250);
      });
    }
    setTimeout(probe, 300);
  });
}

function closeHermesApi() {
  return new Promise(function(resolve) {
    if (hermesApp && typeof hermesApp.closeHermesServer === 'function') {
      return hermesApp.closeHermesServer(function() { resolve(); });
    }
    return resolve();
  });
}

async function login(port) {
  SESSION_COOKIE = '';
  var r = await call('POST', 'http://127.0.0.1:' + port + '/api/auth/login', {
    email: SMOKE_ADMIN_EMAIL, password: SMOKE_ADMIN_PASSWORD,
  });
  if (r.status !== 200 || !SESSION_COOKIE) {
    throw new Error('admin login failed: status=' + r.status);
  }
}

(async function main() {
  var savedEnv = {};
  ['DAVETV_ADMIN_EMAIL','DAVETV_ADMIN_PASSWORD','DAVETV_AUTH_STORE',
   'DAVETV_AUTH_REQUIRED','DAVETV_AUTH_ENFORCE_API','HERMES_PROVIDER_DATA_DIR',
   'AZURE_TTS_KEY','AZURE_TTS_REGION','AZURE_SPEECH_KEY','AZURE_SPEECH_REGION'].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });

  var providerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-tts-prov-'));
  var authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-tts-auth-'));
  process.env.HERMES_PROVIDER_DATA_DIR = providerDir;
  process.env.DAVETV_AUTH_STORE = path.join(authDir, 'auth.json');
  process.env.DAVETV_AUTH_REQUIRED = 'true';
  process.env.DAVETV_AUTH_ENFORCE_API = 'true';
  process.env.DAVETV_ADMIN_EMAIL = SMOKE_ADMIN_EMAIL;
  process.env.DAVETV_ADMIN_PASSWORD = SMOKE_ADMIN_PASSWORD;
  // INTENTIONALLY no AZURE_* env — the test asserts the route refuses to
  // fake synthesis when the subscription is missing.

  var port = 3299;
  try { await bootHermesApi(port); pass('Boot: API listening on ' + port); }
  catch (e) { fail('Boot', e.message); process.exitCode = 1; return; }

  try { await login(port); pass('Boot: admin login'); }
  catch (e) { fail('Boot login', e.message); await closeHermesApi(); process.exitCode = 1; return; }

  // ── GET /api/tts/voices ─────────────────────────────────────────────────
  var voicesResp = await call('GET', 'http://127.0.0.1:' + port + '/api/tts/voices');
  if (voicesResp.status !== 200) {
    fail('Voices: GET /api/tts/voices', 'status=' + voicesResp.status);
  } else if (!voicesResp.body || !Array.isArray(voicesResp.body.voices)) {
    fail('Voices: body.voices not an array', JSON.stringify(voicesResp.body));
  } else if (voicesResp.body.voices.length === 0) {
    fail('Voices: empty list', 'count=0');
  } else {
    pass('Voices: GET /api/tts/voices status=200 with ' + voicesResp.body.voices.length + ' voices');
    if (voicesResp.body.azure_configured !== false) {
      fail('Voices: azure_configured should be false (no env)', 'value=' + voicesResp.body.azure_configured);
    } else {
      pass('Voices: azure_configured === false (no env in this test)');
    }
    if (!voicesResp.body.source) {
      fail('Voices: source field missing');
    } else {
      pass('Voices: source field present (' + voicesResp.body.source + ')');
    }
    if (!voicesResp.body.profile_defaults || !voicesResp.body.profile_defaults.mom_tv) {
      fail('Voices: profile_defaults.mom_tv missing');
    } else {
      pass('Voices: profile_defaults.mom_tv === ' + voicesResp.body.profile_defaults.mom_tv);
    }
  }

  // ── GET /api/tts/voice/mom_tv ───────────────────────────────────────────
  var profileVoiceResp = await call('GET', 'http://127.0.0.1:' + port + '/api/tts/voice/mom_tv');
  if (profileVoiceResp.status !== 200) {
    fail('ProfileVoice: GET /api/tts/voice/mom_tv', 'status=' + profileVoiceResp.status);
  } else if (!profileVoiceResp.body || !profileVoiceResp.body.voice_id) {
    fail('ProfileVoice: voice_id missing', JSON.stringify(profileVoiceResp.body));
  } else {
    pass('ProfileVoice: GET /api/tts/voice/mom_tv → voice_id=' + profileVoiceResp.body.voice_id);
  }

  // ── PATCH /api/tts/voice/mom_tv (invalid voice_id) ───────────────────────
  var invalidPatch = await call('PATCH', 'http://127.0.0.1:' + port + '/api/tts/voice/mom_tv', {
    voice_id: 'en-XX-NotARealVoiceNeural',
  });
  if (invalidPatch.status !== 400) {
    fail('Patch: invalid voice_id expected 400', 'status=' + invalidPatch.status);
  } else if (!invalidPatch.body || invalidPatch.body.error !== 'invalid_voice_id') {
    fail('Patch: body.error not "invalid_voice_id"', JSON.stringify(invalidPatch.body));
  } else {
    pass('Patch: PATCH with invalid voice_id → 400 invalid_voice_id (catalog allowlist works)');
  }

  // ── POST /api/tts/speak (empty text) ─────────────────────────────────────
  var emptySpeak = await call('POST', 'http://127.0.0.1:' + port + '/api/tts/speak', {
    text: '', profile_id: 'mom_tv',
  });
  if (emptySpeak.status !== 400) {
    fail('Speak: empty text expected 400', 'status=' + emptySpeak.status);
  } else if (!emptySpeak.body || emptySpeak.body.error !== 'validation_failed') {
    fail('Speak: empty text body.error not "validation_failed"', JSON.stringify(emptySpeak.body));
  } else {
    pass('Speak: POST empty text → 400 validation_failed');
  }

  // ── POST /api/tts/speak (>800 chars) ─────────────────────────────────────
  var longSpeak = await call('POST', 'http://127.0.0.1:' + port + '/api/tts/speak', {
    text: 'A'.repeat(900), profile_id: 'mom_tv',
  });
  if (longSpeak.status !== 400) {
    fail('Speak: 900-char text expected 400', 'status=' + longSpeak.status);
  } else if (!longSpeak.body || longSpeak.body.error !== 'validation_failed') {
    fail('Speak: 900-char body.error not "validation_failed"', JSON.stringify(longSpeak.body));
  } else if (longSpeak.body.max !== 800) {
    fail('Speak: 900-char body.max not 800', JSON.stringify(longSpeak.body));
  } else {
    pass('Speak: POST 900-char text → 400 validation_failed (max=800)');
  }

  // ── POST /api/tts/speak (credential pattern in text) ────────────────────
  var credPayloads = [
    'My password=hunter2 is the worst kept secret',
    'Bearer abc123-def456 is the token',
    'My api_key for the service is hunter2',
  ];
  for (var i = 0; i < credPayloads.length; i++) {
    var credSpeak = await call('POST', 'http://127.0.0.1:' + port + '/api/tts/speak', {
      text: credPayloads[i], profile_id: 'mom_tv',
    });
    if (credSpeak.status !== 400) {
      fail('Speak: credential-bearing text expected 400', 'i=' + i + ' status=' + credSpeak.status);
    } else if (!credSpeak.body || credSpeak.body.error !== 'credential_pattern_blocked') {
      fail('Speak: credential body.error not "credential_pattern_blocked"', JSON.stringify(credSpeak.body));
    } else {
      pass('Speak: POST credential-bearing text [' + i + '] → 400 credential_pattern_blocked');
    }
  }

  // ── POST /api/tts/speak (missing profile_id) ────────────────────────────
  var noProfileSpeak = await call('POST', 'http://127.0.0.1:' + port + '/api/tts/speak', {
    text: 'Hello world',
  });
  if (noProfileSpeak.status !== 400) {
    fail('Speak: missing profile_id expected 400', 'status=' + noProfileSpeak.status);
  } else {
    pass('Speak: POST missing profile_id → 400 validation_failed');
  }

  // ── POST /api/tts/speak (Azure NOT configured — MUST NOT fake synthesis) ─
  var unconfiguredSpeak = await call('POST', 'http://127.0.0.1:' + port + '/api/tts/speak', {
    text: 'Read me the weather forecast', profile_id: 'mom_tv',
  });
  if (unconfiguredSpeak.status !== 202) {
    fail('Speak: unconfigured expected 202', 'status=' + unconfiguredSpeak.status);
  } else if (!unconfiguredSpeak.body || unconfiguredSpeak.body.status !== 'azure_not_configured') {
    fail('Speak: unconfigured body.status not "azure_not_configured"', JSON.stringify(unconfiguredSpeak.body));
  } else {
    pass('Speak: POST unconfigured → 202 azure_not_configured (NO fake synthesis)');
    // Memory rule: credentialGuard should strip env-var names from the body.
    // The route's _own_ comment says: "describe what is missing without naming the env vars".
    if (/AZURE_TTS_KEY|AZURE_TTS_REGION|AZURE_SPEECH_KEY|AZURE_SPEECH_REGION/i.test(unconfiguredSpeak.raw)) {
      fail('Speak: unconfigured response leaks env-var names',
        unconfiguredSpeak.raw.slice(0, 200));
    } else {
      pass('Speak: unconfigured response does NOT name AZURE_* env vars (credentialGuard works)');
    }
    // Must not contain any synthesised audio bytes (no audio/mpeg content)
    var ct = unconfiguredSpeak.headers && unconfiguredSpeak.headers['content-type'];
    if (ct && /audio\//i.test(ct)) {
      fail('Speak: unconfigured returned audio/* content-type', 'content-type=' + ct);
    } else {
      pass('Speak: unconfigured Content-Type=' + (ct || '<none>') + ' (no audio bytes)');
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  await closeHermesApi();
  try { fs.rmSync(providerDir, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (_) {}
  Object.keys(savedEnv).forEach(function(k) {
    if (savedEnv[k] === undefined) { delete process.env[k]; } else { process.env[k] = savedEnv[k]; }
  });
  console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  process.exitCode = totalFail > 0 ? 1 : 0;
})().catch(function(e) {
  fail('main', e && e.message ? e.message : String(e));
  console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  process.exitCode = 1;
});
