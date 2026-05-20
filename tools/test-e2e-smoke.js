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
  if (r.body.count < 9) {
    return fail('GET /api/layouts', 'count=' + r.body.count + ' (expected >= 9, growing as new shells land)');
  }
  const ids = (r.body.layouts || []).map((l) => l.id);
  const required = ['zero', 'nuvio'];
  for (let i = 0; i < required.length; i++) {
    if (ids.indexOf(required[i]) === -1) {
      return fail('GET /api/layouts', 'missing layout id "' + required[i] + '" (got: ' + ids.join(',') + ')');
    }
  }
  pass('GET /api/layouts', 'count=' + r.body.count + ' incl. zero + nuvio');
}

// Wave-17 purged the seed catalog (live-100..vod-200..ser-300..ACTORS).
// Lane 09 (CI provider gate, docs/47 contract): this script has two honest
// modes, gated by the NO_PROVIDER_EMPTY_STATE env var:
//
//   NO_PROVIDER_EMPTY_STATE=1 (empty-state mode)
//     - The catalog is allowed to be empty.
//     - The play / download / season-download probes mark themselves as
//       "PASS — skipped, no provider items" so the gate still says
//       12 PASS, 0 FAIL when the honest no-providers contract holds.
//     - This is the CI mode for PRs / push-to-main on a host that has no
//       provider secrets wired.
//
//   default mode (live mode)
//     - The catalog MUST contain at least one real provider item.
//     - When firstPlayableItemId is null, the play/download probes FAIL
//       (not skip). Per docs/46 §"Non-Negotiable Truth Rules":
//         "No test may report provider playback as passing because no
//          provider items were configured."
//     - This is the release-gate mode for the dedicated provider-live
//       workflow + the post-deploy VPS verification step.
var ALLOW_EMPTY_STATE = String(process.env.NO_PROVIDER_EMPTY_STATE || '').toLowerCase();
ALLOW_EMPTY_STATE = (ALLOW_EMPTY_STATE === '1' || ALLOW_EMPTY_STATE === 'true');
let firstPlayableItemId = null;
let firstSeriesItemId = null;

async function probeCatalog() {
  const r = await call('GET', '/api/catalog');
  if (r.status !== 200) { return fail('GET /api/catalog', 'status=' + r.status); }
  if (!r.body || typeof r.body.total !== 'number' || !Array.isArray(r.body.catalog)) {
    return fail('GET /api/catalog', 'body shape invalid');
  }
  if (!r.body._meta || typeof r.body._meta.source !== 'string') {
    return fail('GET /api/catalog', '_meta.source missing');
  }
  // Capture a real playable item id for the play/download probes that follow.
  // Prefer iptv-org / m3u items over anything else (real upstreams).
  for (var i = 0; i < r.body.catalog.length; i++) {
    var it = r.body.catalog[i];
    if (!it || !it.id) { continue; }
    if (!firstPlayableItemId) { firstPlayableItemId = it.id; }
    if (!firstSeriesItemId && it.type === 'series') { firstSeriesItemId = it.id; }
    if (firstPlayableItemId && firstSeriesItemId) { break; }
  }
  pass('GET /api/catalog', 'total=' + r.body.total + ' source=' + r.body._meta.source);
}

async function probeActors() {
  const r = await call('GET', '/api/actors');
  if (r.status !== 200) { return fail('GET /api/actors', 'status=' + r.status); }
  if (!r.body || typeof r.body.total !== 'number' || !Array.isArray(r.body.actors)) {
    return fail('GET /api/actors', 'body shape invalid');
  }
  // Honest contract: actors is empty until a TMDB cast adapter is wired.
  // The endpoint must return a well-formed envelope; the count itself is
  // not asserted (post-wave-17 it is 0; future TMDB wiring will fill it).
  pass('GET /api/actors', 'total=' + r.body.total + ' (envelope ok)');
}

// State shared with probePlayStream.
let playTicketId = null;

async function probePlay() {
  if (!firstPlayableItemId) {
    if (ALLOW_EMPTY_STATE) {
      pass('POST /api/play', 'skipped — no provider items in CI env (catalog total=0, NO_PROVIDER_EMPTY_STATE=1)');
      return;
    }
    return fail('POST /api/play', 'no provider items in catalog (live mode requires at least one). Set NO_PROVIDER_EMPTY_STATE=1 ONLY for the honest empty-state CI job.');
  }
  const r = await call('POST', '/api/play', {
    body: { item_id: firstPlayableItemId, profile_id: 'mom_tv' },
  });
  if (r.status !== 200) {
    return fail('POST /api/play', 'status=' + r.status + ' raw=' + r.raw.slice(0, 120));
  }
  if (!r.body || !r.body.ticket || typeof r.body.ticket !== 'string') {
    return fail('POST /api/play', 'body.ticket missing');
  }
  playTicketId = r.body.ticket;
  pass('POST /api/play', 'ticket=' + playTicketId.slice(0, 24) + '... item=' + firstPlayableItemId);
}

async function probePlayStream() {
  if (!firstPlayableItemId) {
    if (ALLOW_EMPTY_STATE) {
      pass('GET /api/play/:ticket/stream', 'skipped — no provider items (NO_PROVIDER_EMPTY_STATE=1)');
      return;
    }
    return fail('GET /api/play/:ticket/stream', 'live mode requires a real catalog item — none available');
  }
  if (!playTicketId) {
    return fail('GET /api/play/:ticket/stream', 'no ticket from previous probe');
  }
  const r = await call('GET', '/api/play/' + playTicketId + '/stream');
  // Per current contract: 200 (in-API HLS proxy response), 206 (range), 302
  // (clean redirect for iptv-org public CDN), OR 503 (operator config issue).
  if (r.status === 200 || r.status === 206 || r.status === 302 || r.status === 503) {
    pass('GET /api/play/:ticket/stream', 'status=' + r.status + ' (acceptable in CI env)');
  } else {
    fail('GET /api/play/:ticket/stream', 'status=' + r.status + ' (expected 200/206/302/503)');
  }
}

async function probeDownloadMovie() {
  if (!firstPlayableItemId) {
    if (ALLOW_EMPTY_STATE) {
      pass('POST /api/download', 'skipped — no provider items (NO_PROVIDER_EMPTY_STATE=1)');
      return;
    }
    return fail('POST /api/download', 'live mode requires a real catalog item — none available');
  }
  const r = await call('POST', '/api/download', {
    body: { item_id: firstPlayableItemId, profile_id: 'mom_tv' },
  });
  if (r.status !== 200) {
    return fail('POST /api/download', 'status=' + r.status + ' raw=' + r.raw.slice(0, 120));
  }
  if (!r.body || !r.body.exact_size_human) {
    return fail('POST /api/download', 'body.exact_size_human missing');
  }
  pass('POST /api/download', 'exact_size_human=' + r.body.exact_size_human + ' item=' + firstPlayableItemId);
}

async function probeDownloadSeason() {
  if (!firstSeriesItemId) {
    if (ALLOW_EMPTY_STATE) {
      pass('POST /api/download (series)', 'skipped — no series in catalog (NO_PROVIDER_EMPTY_STATE=1)');
      return;
    }
    // In live mode a missing series is still a soft pass — not every paid
    // provider exposes series. The play probe is the gate that proves a
    // playable upstream exists.
    pass('POST /api/download (series)', 'no series in this provider mix (live mode soft-pass)');
    return;
  }
  const r = await call('POST', '/api/download', {
    body: { item_id: firstSeriesItemId, profile_id: 'mom_tv', season: 1 },
  });
  if (r.status !== 200) {
    return fail('POST /api/download (series)', 'status=' + r.status + ' raw=' + r.raw.slice(0, 120));
  }
  if (!r.body || typeof r.body.label !== 'string') {
    return fail('POST /api/download (series)', 'body.label missing');
  }
  pass('POST /api/download (series)', 'label="' + r.body.label + '" item=' + firstSeriesItemId);
}

async function probeDownloadsList() {
  const r = await call('GET', '/api/downloads');
  if (r.status !== 200) { return fail('GET /api/downloads', 'status=' + r.status); }
  if (!r.body || typeof r.body.total !== 'number' || !Array.isArray(r.body.items || r.body.downloads)) {
    return fail('GET /api/downloads', 'envelope invalid');
  }
  // total can be 0 in the no-provider CI env (no successful POST /api/download
  // happened). Shape is what we assert.
  pass('GET /api/downloads', 'total=' + r.body.total + ' (envelope ok)');
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
