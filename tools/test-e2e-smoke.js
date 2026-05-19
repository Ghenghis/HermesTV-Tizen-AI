#!/usr/bin/env node
// test-e2e-smoke.js — End-to-end smoke test for the 12 critical HermesTV API
// surfaces. Boots the API on PORT=3199 in-process via require() and exercises
// every endpoint a real Tizen / web client touches today (health, layouts,
// catalog, actors, play ticket, play stream, download envelope, season
// download, downloads list, ui-command validate, TTS voices, TTS speak).
//
// Contract:
//   - Each probe prints "PASS:" or "FAIL:" with enough context (endpoint,
//     status, key field) that a CI failure points at the exact endpoint.
//   - Final line is exactly "=== Results: N PASS, M FAIL ===" so the CI
//     job can grep-enforce the "12 PASS, 0 FAIL" gate identically to
//     schema-validate and chatbot-integration.
//   - Exit code is non-zero whenever any probe fails.
//   - Pure Node + built-in fetch — no new deps. Node 20+ required.
//
// Tolerated states (documented stubs):
//   - GET /api/play/:ticket/stream → 302 or 503 ('threadfin_proxy_required'
//     or 'stream_unresolved') both acceptable because no operator has wired
//     a real Threadfin URL in CI.
//   - POST /api/tts → 200 (full Azure synth), 202 ('azure_not_configured'
//     stub when AZURE_TTS_KEY missing), or 503 ('sdk_missing') all
//     acceptable because CI never has AZURE_TTS_KEY.

'use strict';

const path = require('path');
const http = require('http');

// Force a CI-safe port so we never collide with a running dev server.
process.env.PORT = process.env.PORT || '3199';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const PORT = parseInt(process.env.PORT, 10);
const BASE = 'http://127.0.0.1:' + PORT;

let totalPass = 0;
let totalFail = 0;

function pass(label, detail) {
  console.log('PASS: ' + label + (detail ? ' — ' + detail : ''));
  totalPass += 1;
}
function fail(label, detail) {
  console.log('FAIL: ' + label + (detail ? ' — ' + detail : ''));
  totalFail += 1;
}

// Boot the API in-process. require()'ing src/index.js calls app.listen on
// process.env.PORT so we get a real HTTP server on 3199 with no extra subprocess.
function bootApi() {
  return new Promise((resolve, reject) => {
    let booted = false;
    const apiPath = path.resolve(__dirname, '..', 'services', 'hermes-tv-api', 'src', 'index.js');
    try {
      require(apiPath);
    } catch (e) {
      return reject(new Error('Failed to require API: ' + e.message));
    }
    // Poll /health for up to 15s.
    const deadline = Date.now() + 15000;
    function probe() {
      const req = http.get(BASE + '/health', (res) => {
        // Drain so the socket can be reused.
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode === 200 && !booted) {
            booted = true;
            resolve();
          }
        });
      });
      req.on('error', () => { /* not up yet */ });
      req.on('close', () => {
        if (!booted) {
          if (Date.now() > deadline) {
            reject(new Error('API did not become healthy on ' + BASE + '/health within 15s'));
          } else {
            setTimeout(probe, 150);
          }
        }
      });
    }
    setTimeout(probe, 200);
  });
}

// Lightweight fetch wrapper. Built-in fetch follows redirects by default, so
// we use { redirect: 'manual' } when we need to inspect a 302. Returns
// { status, headers, body, raw } where body is parsed-JSON-or-null and raw
// is the response text.
async function call(method, p, opts) {
  opts = opts || {};
  const url = BASE + p;
  const init = {
    method: method,
    headers: { 'Accept': 'application/json' },
    redirect: opts.redirect || 'manual',
  };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return { status: 0, headers: {}, body: null, raw: '', error: e.message };
  }
  const raw = await res.text();
  let body = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch (_) { body = null; }
  }
  const headers = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { status: res.status, headers: headers, body: body, raw: raw };
}

// -----------------------------------------------------------------------------
// Probes — each probe is its own async function so a single failure does not
// short-circuit the rest of the suite. Every probe must add exactly ONE entry
// to the PASS/FAIL counter so the final "=== Results: N PASS, M FAIL ===" line
// matches the documented "12 PASS, 0 FAIL" gate.
// -----------------------------------------------------------------------------

async function probeHealth() {
  const r = await call('GET', '/health');
  if (r.status !== 200) { return fail('GET /health', 'status=' + r.status); }
  if (!r.body || r.body.status !== 'ok') {
    return fail('GET /health', 'body.status=' + (r.body && r.body.status));
  }
  pass('GET /health', 'status=ok');
}

async function probeLayouts() {
  const r = await call('GET', '/api/layouts');
  if (r.status !== 200) { return fail('GET /api/layouts', 'status=' + r.status); }
  if (!r.body || typeof r.body.count !== 'number') {
    return fail('GET /api/layouts', 'body.count missing');
  }
  if (r.body.count !== 9) {
    return fail('GET /api/layouts', 'count=' + r.body.count + ' (expected 9)');
  }
  const ids = (r.body.layouts || []).map((l) => l.id);
  if (ids.indexOf('zero') === -1) {
    return fail('GET /api/layouts', 'missing layout id "zero" (got: ' + ids.join(',') + ')');
  }
  if (ids.indexOf('nuvio') === -1) {
    return fail('GET /api/layouts', 'missing layout id "nuvio" (got: ' + ids.join(',') + ')');
  }
  pass('GET /api/layouts', 'count=9 incl. zero + nuvio');
}

async function probeCatalog() {
  const r = await call('GET', '/api/catalog');
  if (r.status !== 200) { return fail('GET /api/catalog', 'status=' + r.status); }
  if (!r.body || typeof r.body.total !== 'number') {
    return fail('GET /api/catalog', 'body.total missing');
  }
  if (r.body.total < 100) {
    return fail('GET /api/catalog', 'total=' + r.body.total + ' (expected >=100)');
  }
  pass('GET /api/catalog', 'total=' + r.body.total);
}

async function probeActors() {
  const r = await call('GET', '/api/actors');
  if (r.status !== 200) { return fail('GET /api/actors', 'status=' + r.status); }
  if (!r.body || r.body.total !== 5) {
    return fail('GET /api/actors', 'total=' + (r.body && r.body.total) + ' (expected 5)');
  }
  pass('GET /api/actors', 'total=5');
}

// State shared with probePlayStream — the play ticket is consumed by the next
// probe in the chain.
let playTicketId = null;

async function probePlay() {
  const r = await call('POST', '/api/play', {
    body: { item_id: 'live-100', profile_id: 'mom_tv' },
  });
  if (r.status !== 200) {
    return fail('POST /api/play', 'status=' + r.status + ' raw=' + r.raw.slice(0, 120));
  }
  if (!r.body || !r.body.ticket || typeof r.body.ticket !== 'string') {
    return fail('POST /api/play', 'body.ticket missing');
  }
  playTicketId = r.body.ticket;
  pass('POST /api/play', 'ticket=' + playTicketId.slice(0, 24) + '...');
}

async function probePlayStream() {
  if (!playTicketId) {
    return fail('GET /api/play/:ticket/stream', 'no ticket from previous probe');
  }
  const r = await call('GET', '/api/play/' + playTicketId + '/stream');
  // Per current contract: 302 (clean redirect) OR 503 (operator must wire
  // Threadfin) OR 503 (stream_unresolved). Both 5xx variants are documented
  // PASS states for the CI run.
  if (r.status === 302 || r.status === 503) {
    pass('GET /api/play/:ticket/stream', 'status=' + r.status + ' (stub-OK)');
  } else {
    fail('GET /api/play/:ticket/stream', 'status=' + r.status + ' (expected 302 or 503)');
  }
}

async function probeDownloadMovie() {
  const r = await call('POST', '/api/download', {
    body: { item_id: 'live-100', profile_id: 'mom_tv' },
  });
  if (r.status !== 200) {
    return fail('POST /api/download (live-100)', 'status=' + r.status + ' raw=' + r.raw.slice(0, 120));
  }
  if (!r.body || !r.body.exact_size_human) {
    return fail('POST /api/download (live-100)', 'body.exact_size_human missing');
  }
  pass('POST /api/download (live-100)', 'exact_size_human=' + r.body.exact_size_human);
}

async function probeDownloadSeason() {
  const r = await call('POST', '/api/download', {
    body: { item_id: 'ser-300', profile_id: 'mom_tv', season: 1 },
  });
  if (r.status !== 200) {
    return fail('POST /api/download (ser-300 S1)', 'status=' + r.status + ' raw=' + r.raw.slice(0, 120));
  }
  if (!r.body || typeof r.body.label !== 'string') {
    return fail('POST /api/download (ser-300 S1)', 'body.label missing');
  }
  if (r.body.label.indexOf('Season 1') === -1) {
    return fail('POST /api/download (ser-300 S1)', 'label="' + r.body.label + '" (expected to contain "Season 1")');
  }
  pass('POST /api/download (ser-300 S1)', 'label="' + r.body.label + '"');
}

async function probeDownloadsList() {
  const r = await call('GET', '/api/downloads');
  if (r.status !== 200) { return fail('GET /api/downloads', 'status=' + r.status); }
  if (!r.body || typeof r.body.total !== 'number') {
    return fail('GET /api/downloads', 'body.total missing');
  }
  if (r.body.total < 1) {
    return fail('GET /api/downloads', 'total=' + r.body.total + ' (expected >=1 after two POSTs)');
  }
  pass('GET /api/downloads', 'total=' + r.body.total);
}

async function probeUiCommand() {
  const r = await call('POST', '/api/ui-command/validate', {
    body: { command_text: 'show movies', profile_id: 'mom_tv' },
  });
  if (r.status !== 200) {
    return fail('POST /api/ui-command/validate', 'status=' + r.status);
  }
  if (!r.body || r.body.action !== 'filter_content') {
    return fail('POST /api/ui-command/validate', 'action="' + (r.body && r.body.action) + '" (expected filter_content)');
  }
  pass('POST /api/ui-command/validate', 'action=filter_content');
}

// Captures the first voice id so the next probe can use it as the speak voice.
let firstVoiceId = null;

async function probeVoices() {
  // The voices endpoint is /api/tts/voices in the current API. The task brief
  // names it /api/voices — exercise the real endpoint and fail loudly if the
  // canonical path 404s.
  const r = await call('GET', '/api/tts/voices');
  if (r.status !== 200) { return fail('GET /api/tts/voices', 'status=' + r.status); }
  if (!r.body || !Array.isArray(r.body.voices) || r.body.voices.length === 0) {
    return fail('GET /api/tts/voices', 'voices.length=' + (r.body && r.body.voices && r.body.voices.length));
  }
  firstVoiceId = r.body.voices[0].id;
  pass('GET /api/tts/voices', 'count=' + r.body.voices.length + ' first=' + firstVoiceId);
}

async function probeTtsSpeak() {
  if (!firstVoiceId) {
    // Fall back to a known default so a voices failure doesn't cascade.
    firstVoiceId = 'en-US-AriaNeural';
  }
  // The TTS endpoint contract: with AZURE_TTS_KEY → 200 audio/mpeg, without
  // → 202 'azure_not_configured' or 503 'sdk_missing'. CI never has the key.
  const r = await call('POST', '/api/tts', {
    body: { text: 'hello', voice_id: firstVoiceId, profile_id: 'mom_tv' },
  });
  if (r.status === 200 || r.status === 202 || r.status === 503) {
    pass('POST /api/tts', 'status=' + r.status + ' (stub-OK without AZURE_TTS_KEY)');
  } else {
    fail('POST /api/tts', 'status=' + r.status + ' raw=' + r.raw.slice(0, 120));
  }
}

// -----------------------------------------------------------------------------
// Runner
// -----------------------------------------------------------------------------

async function runProbes() {
  // Order matters: play feeds play-stream; download envelopes feed downloads
  // list; voices feeds tts speak. Keep this list explicit so the 12 PASS
  // count maps 1:1 with the probe sequence.
  const sequence = [
    probeHealth,
    probeLayouts,
    probeCatalog,
    probeActors,
    probePlay,
    probePlayStream,
    probeDownloadMovie,
    probeDownloadSeason,
    probeDownloadsList,
    probeUiCommand,
    probeVoices,
    probeTtsSpeak,
  ];
  for (let i = 0; i < sequence.length; i++) {
    try { await sequence[i](); }
    catch (e) { fail(sequence[i].name, 'threw: ' + (e && e.message)); }
  }
}

(async () => {
  try {
    console.log('--- HermesTV E2E smoke (PORT=' + PORT + ') ---');
    await bootApi();
    await runProbes();
  } catch (e) {
    console.error('boot/runtime error:', e && e.message);
    // Surface the boot failure as a single FAIL so the totals line still prints.
    fail('boot', e && e.message);
  } finally {
    console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
    // Give the API a moment to flush before we exit so the log file is
    // complete when CI uploads the artifact on failure.
    setTimeout(() => process.exit(totalFail > 0 ? 1 : 0), 50);
  }
})();
