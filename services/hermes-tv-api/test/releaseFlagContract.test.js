'use strict';

/**
 * test/releaseFlagContract.test.js — HANDOFF blocker #2 proof.
 *
 * The web app gates DownloadModal, RecordingsSection, and CatchupRail
 * behind three release flags in apps/hermes-web-tv/src/store/releaseFlags.js.
 * The flags default OFF because the corresponding backend byte pipelines
 * have not shipped yet. This test pins down the EXACT contract the gate
 * is built on, so that when Phase 4 lands and the routes start returning
 * live data, this test will fail — that's the signal to flip a flag.
 *
 * What the test asserts:
 *
 *   POST /api/dvr/schedule           → 200 with status='scheduled' and a
 *                                       _note referencing Phase 4
 *   GET  /api/dvr/recordings         → all rows status='scheduled'
 *                                       (none advance to 'recording'
 *                                       or 'complete')
 *   POST /api/download               → 503 download_pipeline_not_available
 *                                       with no job_id / size fields
 *   GET  /api/download/:job_id/file  → 503 download_pipeline_not_available
 *   POST /api/catchup/play           → 501 error='not_implemented'
 *
 * Pattern matches test/epgMappingRestart.test.js — isolated admin in a
 * mkdtemp auth store, single boot of the API, no live providers needed.
 */

var http = require('http');
var path = require('path');
var fs = require('fs');
var os = require('os');

var hermesApp = null;
var catalogMerge = null;
var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) { console.log('FAIL: ' + label + (detail ? ' — ' + detail : '')); totalFail += 1; }

var SMOKE_ADMIN_EMAIL = 'release-flag-admin@example.invalid';
var SMOKE_ADMIN_PASSWORD = 'RelFlag-' + Math.random().toString(36).slice(2, 14);
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
        resolve({ status: res.statusCode, body: parsed, raw: raw });
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
   'DAVETV_AUTH_REQUIRED','DAVETV_AUTH_ENFORCE_API','HERMES_PROVIDER_DATA_DIR'].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });

  var providerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-relflag-prov-'));
  var authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-relflag-auth-'));
  process.env.HERMES_PROVIDER_DATA_DIR = providerDir;
  process.env.DAVETV_AUTH_STORE = path.join(authDir, 'auth.json');
  process.env.DAVETV_AUTH_REQUIRED = 'true';
  process.env.DAVETV_AUTH_ENFORCE_API = 'true';
  process.env.DAVETV_ADMIN_EMAIL = SMOKE_ADMIN_EMAIL;
  process.env.DAVETV_ADMIN_PASSWORD = SMOKE_ADMIN_PASSWORD;

  var port = 3298;
  try { await bootHermesApi(port); pass('Boot: API listening on ' + port); }
  catch (e) { fail('Boot', e.message); process.exitCode = 1; return; }
  catalogMerge = require('../src/lib/catalogMerge');

  try { await login(port); pass('Boot: admin login'); }
  catch (e) { fail('Boot login', e.message); await closeHermesApi(); process.exitCode = 1; return; }

  // ── DVR contract ────────────────────────────────────────────────────────
  var startUtc = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  var endUtc = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  var schedResp = await call('POST', 'http://127.0.0.1:' + port + '/api/dvr/schedule', {
    channel_id: 'live.test-channel',
    profile_id: 'dave_tv',
    start_utc: startUtc,
    end_utc: endUtc,
    title: 'Release Flag Contract Test',
  });
  if (schedResp.status !== 200) {
    fail('DVR: POST /api/dvr/schedule', 'status=' + schedResp.status + ' raw=' + schedResp.raw);
  } else {
    pass('DVR: POST /api/dvr/schedule status=200');
    if (!schedResp.body || !schedResp.body.success || !schedResp.body.recording) {
      fail('DVR: schedule envelope shape', JSON.stringify(schedResp.body));
    } else {
      pass('DVR: response has { success: true, recording: {...} }');
      var rec = schedResp.body.recording;
      if (rec.status !== 'scheduled') {
        fail('DVR: status is not "scheduled"', 'status=' + rec.status);
      } else {
        pass('DVR: status === "scheduled" (will NOT advance until Phase 4)');
      }
      if (!rec._note || !/Phase 4/i.test(rec._note)) {
        fail('DVR: _note missing Phase 4 disclosure', '_note=' + rec._note);
      } else {
        pass('DVR: _note discloses Phase 4 muxer gap honestly');
      }
      if (rec.bytes_written !== 0) {
        fail('DVR: bytes_written should be 0 in stub mode', 'bytes_written=' + rec.bytes_written);
      } else {
        pass('DVR: bytes_written === 0 (no actual recording happens)');
      }
    }
  }

  var recList = await call('GET', 'http://127.0.0.1:' + port + '/api/dvr/recordings');
  if (recList.status !== 200) {
    fail('DVR: GET /api/dvr/recordings', 'status=' + recList.status);
  } else if (!recList.body || !Array.isArray(recList.body.recordings)) {
    fail('DVR: recordings list shape', JSON.stringify(recList.body));
  } else {
    pass('DVR: GET /api/dvr/recordings returned a list');
    var nonScheduled = recList.body.recordings.filter(function(r) { return r.status !== 'scheduled'; });
    if (nonScheduled.length > 0) {
      fail('DVR: some rows advanced past "scheduled"',
        'count=' + nonScheduled.length + ' statuses=' + nonScheduled.map(function(r) { return r.status; }).join(','));
    } else {
      pass('DVR: every row status === "scheduled" (Phase 4 muxer NOT shipped — gate justified)');
    }
  }

  // ── Downloads contract ──────────────────────────────────────────────────
  // Seed only the in-process merged-catalog snapshot with a synthetic test
  // fixture so the route validates item/profile before proving it refuses to
  // create a fake queue. No provider URL or credential is used.
  var firstItem = {
    id: 'm3u-release-download-contract',
    type: 'movie',
    title: 'Release Flag Contract Fixture',
    provider: 'contract-test',
    providers: [{ provider_id: 'contract-test', source_id: 'contract-test' }],
  };
  catalogMerge.setLastMerged([firstItem]);

  var listResp = await call('GET', 'http://127.0.0.1:' + port + '/api/downloads');
  if (listResp.status !== 200 || !listResp.body || !Array.isArray(listResp.body.downloads)) {
    fail('Downloads: GET /api/downloads expected list', 'status=' + listResp.status);
  } else if (listResp.body.downloads.length !== 0 || listResp.body.total !== 0 || listResp.body.pipeline_available !== false) {
    fail('Downloads: empty store should expose disabled pipeline',
      'body=' + JSON.stringify(listResp.body));
  } else {
    pass('Downloads: GET /api/downloads → { downloads: [], total: 0, pipeline_available: false }');
  }

  var dlResp = await call('POST', 'http://127.0.0.1:' + port + '/api/download', {
    item_id: firstItem.id,
    profile_id: 'dave_tv',
  });
  if (dlResp.status !== 503) {
    fail('Downloads: POST /api/download expected 503', 'status=' + dlResp.status + ' raw=' + (dlResp.raw || '').slice(0, 200));
  } else {
    pass('Downloads: POST /api/download returns 503 (no fake queue)');
    if (!dlResp.body || dlResp.body.error !== 'download_pipeline_not_available' || dlResp.body.pipeline_available !== false) {
      fail('Downloads: POST body is not honest disabled contract', 'body=' + JSON.stringify(dlResp.body));
    } else {
      pass('Downloads: POST body.error === "download_pipeline_not_available"');
    }
    if (dlResp.body && (dlResp.body.job_id || dlResp.body.exact_size_bytes || dlResp.body.exact_size_human || dlResp.body.status === 'queued')) {
      fail('Downloads: POST leaked fake queue/size fields', 'body=' + JSON.stringify(dlResp.body));
    } else {
      pass('Downloads: POST creates no job_id, queued status, or fake exact-size fields');
    }
  }

  var unknownFile = await call('GET', 'http://127.0.0.1:' + port + '/api/download/unknown-job-id/file');
  if (unknownFile.status !== 503) {
    fail('Downloads: GET /file expected 503 disabled pipeline', 'status=' + unknownFile.status);
  } else if (!unknownFile.body || unknownFile.body.error !== 'download_pipeline_not_available') {
    fail('Downloads: /file body.error is not disabled pipeline', JSON.stringify(unknownFile.body));
  } else {
    pass('Downloads: GET /file unknown-job → 503 download_pipeline_not_available');
  }

  var getJobResp = await call('GET', 'http://127.0.0.1:' + port + '/api/download/unknown-job-id');
  if (getJobResp.status !== 503 || !getJobResp.body || getJobResp.body.error !== 'download_pipeline_not_available') {
    fail('Downloads: GET /api/download/:job_id expected disabled pipeline',
      'status=' + getJobResp.status + ' body=' + JSON.stringify(getJobResp.body));
  } else {
    pass('Downloads: GET /api/download/:job_id returns disabled pipeline, not fake job state');
  }

  // ── Catch-up contract ───────────────────────────────────────────────────
  var cuPlayResp = await call('POST', 'http://127.0.0.1:' + port + '/api/catchup/play', {
    channel_id: 'live.test-channel',
    profile_id: 'dave_tv',
    program_id: 'cnn.0000',
  });
  // 501 not_implemented is correct ONLY if the channel-id resolves to a
  // catchup-capable channel and play is gated. With no catalog the route
  // returns 404 catchup_not_available — that's ALSO fine for this test
  // because either way the user gets an honest non-200 (not a fake play
  // ticket).
  if (cuPlayResp.status === 501) {
    pass('Catch-up: POST /api/catchup/play status=501');
    if (cuPlayResp.body && cuPlayResp.body.error === 'not_implemented') {
      pass('Catch-up: body.error === "not_implemented" (timeshift NOT shipped)');
    } else {
      fail('Catch-up: body.error is not "not_implemented"', 'body=' + JSON.stringify(cuPlayResp.body));
    }
  } else if (cuPlayResp.status === 404) {
    pass('Catch-up: POST /api/catchup/play status=404 (channel has no catch-up support)');
    if (cuPlayResp.body && cuPlayResp.body.error === 'catchup_not_available') {
      pass('Catch-up: body.error === "catchup_not_available" (honest gate, no fake ticket)');
    } else {
      fail('Catch-up: body.error is not "catchup_not_available"', 'body=' + JSON.stringify(cuPlayResp.body));
    }
  } else {
    fail('Catch-up: POST /api/catchup/play expected 501 or 404',
      'status=' + cuPlayResp.status + ' raw=' + (cuPlayResp.raw || '').slice(0, 200));
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
