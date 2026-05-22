'use strict';

/**
 * test/setupProviderRestart.e2e.test.js — HANDOFF blocker #4
 *
 * Proves the full provider-truth chain ACROSS A PROCESS RESTART. The user
 * complained "XtremeHD/ApolloGroup details appear saved but disappear after
 * reload/relogin" — backend persistence tests already pass, but no single
 * test was previously exercising the lifecycle:
 *
 *   form submit (/api/setup/provider/submit)
 *     → providerStore writes data/providers.json
 *     → /api/providers shows the new row
 *     → /api/catalog returns items via providerRegistry.listFull()
 *     → CLOSE the API (closeHermesServer)
 *     → DELETE require cache
 *     → BOOT a fresh process on the SAME HERMES_PROVIDER_DATA_DIR
 *     → /api/providers still shows the row (read from disk)
 *     → /api/catalog still returns items
 *     → POST /api/play returns a ticket
 *     → HEAD/GET /api/play/:ticket/stream returns 200/206/302
 *     → no credential bytes appear in any response body
 *
 * This is FIXTURE proof, not live proof. Per docs/46 §"Non-Negotiable Truth
 * Rules" rule 1, fixture proof CANNOT count as live-provider PASS. But it
 * does catch the regression class the user reported: disk providers fail
 * to load on restart.
 *
 * Style: CommonJS, var/function (matches the rest of services/hermes-tv-api).
 */

var http = require('http');
var path = require('path');
var fs = require('fs');
var os = require('os');

var fixture = require(path.resolve(__dirname, '..', '..', '..', 'tools', 'xtream-fixture-server.js'));

var FIXTURE_USER = 'restartdemo';
var FIXTURE_PASS = 'restartdemo';
var SMOKE_ADMIN_EMAIL = 'restart-admin@example.invalid';
var SMOKE_ADMIN_PASSWORD = 'RestartAdmin-' + Math.random().toString(36).slice(2, 14);

var hermesApp = null;
var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) { console.log('FAIL: ' + label + (detail ? ' — ' + detail : '')); totalFail += 1; }

// Per-request cookie jar — the auth gate is on this entire test (we own the
// admin bootstrap), so every request after login threads the session cookie.
var SESSION_COOKIE = '';

function call(method, url, body, options) {
  options = options || {};
  return new Promise(function(resolve) {
    var u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0, error: 'bad-url' }); }
    var headers = { Accept: 'application/json' };
    if (SESSION_COOKIE && !options.noAuth) { headers.Cookie = SESSION_COOKIE; }
    var data = null;
    if (body !== undefined && body !== null) {
      if (options.form) {
        // application/x-www-form-urlencoded for /setup/provider/submit
        var parts = [];
        Object.keys(body).forEach(function(k) {
          parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(body[k] == null ? '' : body[k])));
        });
        data = parts.join('&');
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        data = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    var opts = {
      method: method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + (u.search || ''),
      headers: headers,
    };
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { /* ok */ }
        // Capture set-cookie so we can thread session through the chain.
        var setCookie = res.headers['set-cookie'];
        if (Array.isArray(setCookie) && setCookie.length > 0) {
          var sessionLine = setCookie.find(function(l) { return /^davetv_session=/i.test(l); });
          if (sessionLine) {
            SESSION_COOKIE = sessionLine.split(';')[0];
          }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: raw });
      });
    });
    req.on('error', function(e) { resolve({ status: 0, error: e.message }); });
    req.setTimeout(20000, function() { try { req.destroy(); } catch (_) {} resolve({ status: 0, error: 'timeout' }); });
    if (data) { req.write(data); }
    req.end();
  });
}

function bootHermesApi(port) {
  return new Promise(function(resolve, reject) {
    process.env.PORT = String(port);
    process.env.NODE_ENV = 'test';
    var apiPath = path.resolve(__dirname, '..', 'src', 'index.js');
    delete require.cache[apiPath];
    // Also clear cached modules under the API tree so providerStore reloads
    // its lazy cache from disk on the fresh boot. This simulates an honest
    // process restart — `_cache` is module-scoped so a require()-cache reset
    // is the bare minimum to invalidate it.
    Object.keys(require.cache).forEach(function(k) {
      if (k.indexOf(path.resolve(__dirname, '..', 'src')) === 0) {
        delete require.cache[k];
      }
    });
    try { hermesApp = require(apiPath); } catch (e) { return reject(e); }
    var deadline = Date.now() + 20000;
    function probe() {
      call('GET', 'http://127.0.0.1:' + port + '/health', null, { noAuth: true }).then(function(r) {
        if (r.status === 200) { return resolve(); }
        if (Date.now() > deadline) { return reject(new Error('Hermes API did not become healthy within 20s')); }
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
    email: SMOKE_ADMIN_EMAIL,
    password: SMOKE_ADMIN_PASSWORD,
  }, { noAuth: true });
  if (r.status !== 200) {
    throw new Error('admin login failed: status=' + r.status + ' raw=' + (r.raw || '').slice(0, 200));
  }
  if (!SESSION_COOKIE) {
    throw new Error('admin login returned no davetv_session cookie');
  }
}

function scanForLeaks(body, label) {
  if (!body) { return; }
  var raw = typeof body === 'string' ? body : JSON.stringify(body);
  var patterns = [
    /\/get\.php\?username=[A-Za-z0-9][A-Za-z0-9._%+-]+/i,
    /\/player_api\.php\?username=[A-Za-z0-9][A-Za-z0-9._%+-]+/i,
    /(?:^|[^A-Za-z_])password\s*[:=]\s*"?[A-Za-z0-9!@#$%^&*+_~.-]{6,}/i,
  ];
  // The fixture user is "restartdemo" — a substring match on that token
  // ANYWHERE in a response would mean we're echoing the operator's
  // credential back. Catch that too.
  patterns.push(new RegExp('\\b' + FIXTURE_USER + '\\b'));
  patterns.push(new RegExp('\\b' + FIXTURE_PASS + '\\b'));
  for (var i = 0; i < patterns.length; i++) {
    if (patterns[i].test(raw)) {
      fail('LEAK in ' + label, 'pattern=' + patterns[i]);
      return;
    }
  }
}

async function cleanup(fx, tmpDir, savedEnv) {
  await closeHermesApi();
  if (fx && fx.server) { await fixture.stop(fx.server); }
  if (savedEnv) {
    Object.keys(savedEnv).forEach(function(k) {
      if (savedEnv[k] === undefined) { delete process.env[k]; } else { process.env[k] = savedEnv[k]; }
    });
  }
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* silent */ }
  }
}

(async function main() {
  // ── 1. Start the Xtream fixture on a random port ─────────────────────────
  process.env.XTREAM_FIXTURE_USER = FIXTURE_USER;
  process.env.XTREAM_FIXTURE_PASS = FIXTURE_PASS;
  var fx;
  try { fx = await fixture.start(0); } catch (e) {
    fail('fixture.start', e.message); process.exitCode = 1; return;
  }
  pass('xtream-fixture-server listening on 127.0.0.1:' + fx.port);

  // ── 2. Save existing env so the test is hermetic ────────────────────────
  // Critical: NO env-based xtream config — we are proving that DISK provider
  // (added via /api/setup/provider/submit) feeds catalog/play. If env config
  // existed, the env path would mask any disk-path regression.
  var savedEnv = {};
  ['APOLLO_M3U_URL','XTREMEHD_M3U_URL','XTREAM_URL','XTREAM_USERNAME','XTREAM_PASSWORD',
   'JELLYFIN_URL','JELLYFIN_API_KEY','IPTV_ORG_ENABLED',
   'DAVETV_ADMIN_EMAIL','DAVETV_ADMIN_PASSWORD','DAVETV_AUTH_STORE',
   'DAVETV_AUTH_REQUIRED','DAVETV_AUTH_ENFORCE_API',
   'HERMES_PROVIDER_DATA_DIR'].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });

  // ── 3. Set up isolated disk paths + admin bootstrap ─────────────────────
  var providerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-setup-restart-prov-'));
  var authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-setup-restart-auth-'));
  process.env.HERMES_PROVIDER_DATA_DIR = providerDir;
  process.env.DAVETV_AUTH_STORE = path.join(authDir, 'auth.json');
  process.env.DAVETV_AUTH_REQUIRED = 'true';
  process.env.DAVETV_AUTH_ENFORCE_API = 'true';
  process.env.DAVETV_ADMIN_EMAIL = SMOKE_ADMIN_EMAIL;
  process.env.DAVETV_ADMIN_PASSWORD = SMOKE_ADMIN_PASSWORD;

  var port = 3296;
  try { await bootHermesApi(port); } catch (e) {
    fail('Hermes API boot (A)', e.message);
    await cleanup(fx, providerDir, savedEnv);
    fs.rmSync(authDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }
  pass('Hermes API (boot A) listening on 127.0.0.1:' + port);

  try { await login(port); pass('Admin login (boot A) returned session cookie'); }
  catch (e) {
    fail('Admin login (boot A)', e.message);
    await cleanup(fx, providerDir, savedEnv);
    fs.rmSync(authDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  // ── 4. Create a pairing code, then submit a provider config ──────────────
  var pairResp = await call('POST', 'http://127.0.0.1:' + port + '/api/pair', {});
  // Pairing route uses `pairing_code` field (HRM-XXXX). Accept either name
  // so the test still validates if the contract is ever generalised.
  var pairingCode = (pairResp.body && (pairResp.body.pairing_code || pairResp.body.code)) || '';
  if (pairResp.status !== 201 || !pairingCode) {
    fail('POST /api/pair', 'status=' + pairResp.status + ' raw=' + (pairResp.raw || '').slice(0, 200));
    await cleanup(fx, providerDir, savedEnv);
    fs.rmSync(authDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }
  pass('POST /api/pair returned code=' + pairingCode);

  var fixtureUrl = 'http://127.0.0.1:' + fx.port;
  var submitResp = await call('POST', 'http://127.0.0.1:' + port + '/api/setup/provider/submit', {
    pairing_code: pairingCode,
    type: 'xtream',
    label: 'Restart Proof Fixture',
    url: fixtureUrl,
    username: FIXTURE_USER,
    password: FIXTURE_PASS,
  }, { form: true });
  if (submitResp.status !== 201 || !submitResp.body || !submitResp.body.provider || !submitResp.body.provider.id) {
    fail('POST /api/setup/provider/submit', 'status=' + submitResp.status + ' raw=' + (submitResp.raw || '').slice(0, 200));
    await cleanup(fx, providerDir, savedEnv);
    fs.rmSync(authDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }
  var provId = submitResp.body.provider.id;
  pass('Provider config submitted, masked id=' + provId);
  scanForLeaks(submitResp.raw, 'submit response');

  // Sanity — the response carries only masked fields (no raw URL or credentials)
  if (submitResp.body.provider.url || submitResp.body.provider.username || submitResp.body.provider.password) {
    fail('Submit response leaks raw fields',
      Object.keys(submitResp.body.provider).join(','));
  } else {
    pass('Submit response shape is masked (no url/username/password)');
  }

  // ── 5. Boot-A /api/providers should show the new row ────────────────────
  var providersA = await call('GET', 'http://127.0.0.1:' + port + '/api/providers');
  if (providersA.status !== 200 || !providersA.body || !Array.isArray(providersA.body.providers)) {
    fail('GET /api/providers (boot A)', 'status=' + providersA.status);
  } else {
    var aDiskRow = providersA.body.providers.find(function(p) { return p && p.id === provId; });
    if (aDiskRow) {
      pass('Boot A: /api/providers exposes the new disk row id=' + provId);
    } else {
      fail('Boot A: disk row missing from /api/providers',
        'ids=' + providersA.body.providers.map(function(p) { return p && p.id; }).join(','));
    }
  }
  scanForLeaks(providersA.raw, 'providers (boot A)');

  // ── 6. Boot-A /api/catalog should be non-zero from the disk provider ────
  var catA = await call('GET', 'http://127.0.0.1:' + port + '/api/catalog');
  for (var retry = 0; retry < 3 && catA.body && catA.body.total === 0; retry++) {
    await new Promise(function(r) { setTimeout(r, 1500); });
    catA = await call('GET', 'http://127.0.0.1:' + port + '/api/catalog');
  }
  if (catA.status === 200 && catA.body && catA.body.total > 0) {
    pass('Boot A: /api/catalog has ' + catA.body.total + ' items from disk provider');
  } else {
    fail('Boot A: /api/catalog empty',
      'total=' + (catA.body && catA.body.total) + ' source=' + (catA.body && catA.body._meta && catA.body._meta.source));
  }
  scanForLeaks(catA.raw, 'catalog (boot A)');

  // ── 7. RESTART the API on the same DATA_DIR ─────────────────────────────
  await closeHermesApi();
  pass('Hermes API (boot A) closed for restart');

  try { await bootHermesApi(port); } catch (e) {
    fail('Hermes API boot (B)', e.message);
    await cleanup(fx, providerDir, savedEnv);
    fs.rmSync(authDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }
  pass('Hermes API (boot B) listening on the same DATA_DIR');

  // Login fresh — session cookie from boot A was tied to the previous
  // process. This proves the auth path also survives restart.
  try { await login(port); pass('Admin login (boot B) — auth store survived restart'); }
  catch (e) {
    fail('Admin login (boot B)', e.message);
    await cleanup(fx, providerDir, savedEnv);
    fs.rmSync(authDir, { recursive: true, force: true });
    process.exitCode = 1;
    return;
  }

  // ── 8. Boot-B /api/providers MUST still show the disk row ───────────────
  var providersB = await call('GET', 'http://127.0.0.1:' + port + '/api/providers');
  if (providersB.status === 200 && providersB.body && Array.isArray(providersB.body.providers)) {
    var bDiskRow = providersB.body.providers.find(function(p) { return p && p.id === provId; });
    if (bDiskRow) {
      pass('Boot B: disk row id=' + provId + ' survived restart');
      if (bDiskRow.label !== 'Restart Proof Fixture' || bDiskRow.type !== 'xtream') {
        fail('Boot B: disk row shape regressed', JSON.stringify(bDiskRow));
      } else {
        pass('Boot B: disk row label + type preserved across restart');
      }
    } else {
      fail('Boot B: disk row LOST across restart',
        'ids=' + providersB.body.providers.map(function(p) { return p && p.id; }).join(','));
    }
  } else {
    fail('Boot B: GET /api/providers', 'status=' + providersB.status);
  }
  scanForLeaks(providersB.raw, 'providers (boot B)');

  // ── 9. Boot-B /api/catalog MUST still have items from the disk provider ──
  var catB = await call('GET', 'http://127.0.0.1:' + port + '/api/catalog');
  for (var retryB = 0; retryB < 3 && catB.body && catB.body.total === 0; retryB++) {
    await new Promise(function(r) { setTimeout(r, 1500); });
    catB = await call('GET', 'http://127.0.0.1:' + port + '/api/catalog');
  }
  if (catB.status === 200 && catB.body && catB.body.total > 0) {
    pass('Boot B: /api/catalog has ' + catB.body.total + ' items — disk provider feeds catalog after restart');
  } else {
    fail('Boot B: /api/catalog empty after restart — DISK PROVIDER REGRESSION',
      'total=' + (catB.body && catB.body.total) + ' source=' + (catB.body && catB.body._meta && catB.body._meta.source));
  }
  scanForLeaks(catB.raw, 'catalog (boot B)');

  // ── 10. Boot-B play ticket + stream ─────────────────────────────────────
  var items = (catB.body && catB.body.catalog) || [];
  var pickItem = null;
  for (var j = 0; j < items.length; j++) {
    if (items[j] && items[j].id && (items[j].type === 'live' || items[j].type === 'vod')) {
      pickItem = items[j]; break;
    }
  }
  if (!pickItem) {
    fail('Boot B: no playable item available', 'catalog had ' + items.length + ' rows');
  } else {
    var playResp = await call('POST', 'http://127.0.0.1:' + port + '/api/play', {
      item_id: pickItem.id, profile_id: 'dave_tv',
    });
    if (playResp.status !== 200 || !playResp.body || !playResp.body.ticket) {
      fail('Boot B: POST /api/play', 'status=' + playResp.status + ' raw=' + (playResp.raw || '').slice(0, 200));
    } else {
      var ticketId = playResp.body.ticket;
      var streamEndpoint = playResp.body.stream_endpoint || ('/api/play/' + ticketId + '/stream');
      pass('Boot B: POST /api/play ticket=' + ticketId.slice(0, 12) + '... item=' + pickItem.id);
      scanForLeaks(playResp.raw, 'play (boot B)');

      var headResp = await call('HEAD', 'http://127.0.0.1:' + port + streamEndpoint);
      if (headResp.status === 200 || headResp.status === 206 || headResp.status === 302) {
        pass('Boot B: HEAD stream status=' + headResp.status + ' — full chain works after restart');
      } else {
        fail('Boot B: HEAD stream unexpected',
          'status=' + headResp.status + ' raw=' + (headResp.raw || '').slice(0, 200));
      }
    }
  }

  // ── 11. Cleanup + final report ─────────────────────────────────────────
  await cleanup(fx, providerDir, savedEnv);
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (_) {}
  console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  process.exitCode = totalFail > 0 ? 1 : 0;
})().catch(function(e) {
  fail('main', e && e.message ? e.message : String(e));
  console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  process.exitCode = 1;
});
