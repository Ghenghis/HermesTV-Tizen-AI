'use strict';

/**
 * test/epgMappingRestart.test.js — HANDOFF blocker #8 proof.
 *
 * Proves that EPG channel-mapping overrides + import settings posted via
 * /api/epg/mapping and PATCH /api/epg/settings survive a process restart.
 * Before this fix the data lived in module-scoped vars (EPG_MAPPING +
 * EPG_SETTINGS in routes/epg.js) and wiped on every container redeploy.
 *
 * Pattern mirrors test/setupProviderRestart.e2e.test.js:
 *   - Isolated temp HERMES_PROVIDER_DATA_DIR (shared by providerStore +
 *     epgMappingStore — both write to the same dir).
 *   - Throwaway admin (in mkdtemp auth store).
 *   - Boot A → write mappings + custom settings → confirm they're readable.
 *   - Close API, require-cache reset.
 *   - Boot B → read mappings + settings → MUST still see them.
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

var SMOKE_ADMIN_EMAIL = 'epg-restart-admin@example.invalid';
var SMOKE_ADMIN_PASSWORD = 'EpgRestart-' + Math.random().toString(36).slice(2, 14);
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

  var providerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-epg-restart-prov-'));
  var authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-epg-restart-auth-'));
  process.env.HERMES_PROVIDER_DATA_DIR = providerDir;
  process.env.DAVETV_AUTH_STORE = path.join(authDir, 'auth.json');
  process.env.DAVETV_AUTH_REQUIRED = 'true';
  process.env.DAVETV_AUTH_ENFORCE_API = 'true';
  process.env.DAVETV_ADMIN_EMAIL = SMOKE_ADMIN_EMAIL;
  process.env.DAVETV_ADMIN_PASSWORD = SMOKE_ADMIN_PASSWORD;

  var port = 3297;
  try { await bootHermesApi(port); pass('Boot A: API listening on ' + port); }
  catch (e) { fail('Boot A', e.message); process.exitCode = 1; return; }

  try { await login(port); pass('Boot A: admin login'); }
  catch (e) { fail('Boot A login', e.message); await closeHermesApi(); process.exitCode = 1; return; }

  // ── Write a custom mapping + settings via the routes ────────────────────
  var mapResp = await call('POST', 'http://127.0.0.1:' + port + '/api/epg/mapping', {
    profile_id: 'dave_tv', channel_id: 'live.cnn-restart', epg_id: 'cnn.us',
  });
  if (mapResp.status !== 200 || !mapResp.body || !mapResp.body.success) {
    fail('Boot A: POST /api/epg/mapping', 'status=' + mapResp.status);
  } else {
    pass('Boot A: POST /api/epg/mapping persisted (count=' + mapResp.body._meta.mapping_count + ')');
  }

  var settingsResp = await call('PATCH', 'http://127.0.0.1:' + port + '/api/epg/settings', {
    refresh_hour_utc: 7,
    keep_days: 14,
    match_strategy: 'exact',
  });
  if (settingsResp.status !== 200 || settingsResp.body.refresh_hour_utc !== 7 ||
      settingsResp.body.keep_days !== 14 || settingsResp.body.match_strategy !== 'exact') {
    fail('Boot A: PATCH /api/epg/settings', 'status=' + settingsResp.status + ' body=' + JSON.stringify(settingsResp.body));
  } else {
    pass('Boot A: PATCH /api/epg/settings persisted custom values');
  }

  // ── Restart ─────────────────────────────────────────────────────────────
  await closeHermesApi();
  pass('Boot A: API closed');

  try { await bootHermesApi(port); pass('Boot B: API listening on same DATA_DIR'); }
  catch (e) { fail('Boot B', e.message); process.exitCode = 1; return; }

  try { await login(port); pass('Boot B: admin login (auth store survived)'); }
  catch (e) { fail('Boot B login', e.message); await closeHermesApi(); process.exitCode = 1; return; }

  // ── Boot-B reads MUST see the boot-A writes ─────────────────────────────
  var settingsB = await call('GET', 'http://127.0.0.1:' + port + '/api/epg/settings');
  if (settingsB.status !== 200) {
    fail('Boot B: GET /api/epg/settings', 'status=' + settingsB.status);
  } else if (settingsB.body.refresh_hour_utc !== 7 ||
             settingsB.body.keep_days !== 14 ||
             settingsB.body.match_strategy !== 'exact') {
    fail('Boot B: settings did NOT survive restart',
      JSON.stringify({
        refresh_hour_utc: settingsB.body.refresh_hour_utc,
        keep_days: settingsB.body.keep_days,
        match_strategy: settingsB.body.match_strategy,
      }));
  } else {
    pass('Boot B: settings (refresh_hour_utc=7, keep_days=14, exact) survived restart');
    pass('Boot B: _meta.source=' + (settingsB.body._meta && settingsB.body._meta.source));
  }

  // The mapping should also be visible — write it again so the response
  // reflects the post-restart count, then validate.
  var mapB = await call('POST', 'http://127.0.0.1:' + port + '/api/epg/mapping', {
    profile_id: 'dave_tv', channel_id: 'live.bbc-restart', epg_id: 'bbc.uk',
  });
  if (mapB.status !== 200) {
    fail('Boot B: POST /api/epg/mapping (additive)', 'status=' + mapB.status);
  } else if (!mapB.body._meta || mapB.body._meta.mapping_count < 2) {
    fail('Boot B: mapping_count did NOT carry over the boot-A mapping',
      'count=' + (mapB.body._meta && mapB.body._meta.mapping_count));
  } else {
    pass('Boot B: mapping_count=' + mapB.body._meta.mapping_count +
         ' (boot-A mapping survived; boot-B added another)');
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
