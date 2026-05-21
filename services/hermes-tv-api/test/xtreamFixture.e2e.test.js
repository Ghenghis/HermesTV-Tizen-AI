'use strict';

/**
 * test/xtreamFixture.e2e.test.js — Priority 1 fixture-based pipeline proof.
 *
 * Adapted from IPTVnator's xtream-mock-server pattern (G:\Github\IPTV-Apps\
 * iptvnator\apps\xtream-mock-server) — the pattern, not the code. This test
 * proves the FULL Hermes pipeline with NO live provider required:
 *
 *   tools/xtream-fixture-server.js (boots Xtream API on random port)
 *      → process.env.XTREAM_URL / USERNAME / PASSWORD point at fixture
 *      → Hermes API boots in-process on PORT=3299
 *      → /api/providers must list the env-derived xtream provider
 *      → /api/catalog must return non-zero items from the fixture
 *      → POST /api/play must return a ticket
 *      → GET /api/play/:ticket/stream must return 200/206/302 with media
 *      → no credential bytes appear in any HTTP response body
 *
 * IMPORTANT — this is FIXTURE proof, NOT live-provider proof. Per
 * docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md §"Non-Negotiable Truth Rules"
 * rule 1, fixture proof CANNOT count as live-provider PASS. The
 * provider-live job in .github/workflows/ci.yml + the post-deploy step
 * in deploy-vps.yml are the gates that prove a real upstream works.
 *
 * What this test exists for:
 *   - Catches regressions in providerRegistry → catalog → play → stream
 *     end-to-end with NO secrets and NO network egress.
 *   - Runs in every PR (after Lane 09 wires it into ci.yml) so refactors
 *     that break the pipeline fail fast.
 *
 * Style: CommonJS, Node 20+. No deps outside the workspace.
 */

var http = require('http');
var path = require('path');
var fs = require('fs');
var os = require('os');

var fixture = require(path.resolve(__dirname, '..', '..', '..', 'tools', 'xtream-fixture-server.js'));

var FIXTURE_USER = 'fixturedemo';
var FIXTURE_PASS = 'fixturedemo';
var hermesApp = null;

var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) { console.log('FAIL: ' + label + (detail ? ' — ' + detail : '')); totalFail += 1; }

// Minimal HTTP client (no deps) — supports GET/POST + manual redirect.
function call(method, url, body) {
  return new Promise(function(resolve) {
    var u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0, error: 'bad-url' }); }
    var opts = {
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: { Accept: 'application/json' }
    };
    var data = body ? JSON.stringify(body) : null;
    if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { /* ok */ }
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
    try { hermesApp = require(apiPath); } catch (e) { return reject(e); }
    var deadline = Date.now() + 20000;
    function probe() {
      call('GET', 'http://127.0.0.1:' + port + '/health').then(function(r) {
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

async function cleanup(fx, tmpDir, savedEnv) {
  await closeHermesApi();
  if (fx && fx.server) { await fixture.stop(fx.server); }
  if (savedEnv) {
    ['APOLLO_M3U_URL','XTREMEHD_M3U_URL','JELLYFIN_URL','JELLYFIN_API_KEY','IPTV_ORG_ENABLED'].forEach(function(k) {
      if (savedEnv[k] === undefined) { delete process.env[k]; } else { process.env[k] = savedEnv[k]; }
    });
  }
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

(async function main() {
  // ------ 1. Start the Xtream fixture server on a random port ------------
  process.env.XTREAM_FIXTURE_USER = FIXTURE_USER;
  process.env.XTREAM_FIXTURE_PASS = FIXTURE_PASS;
  var fx;
  try { fx = await fixture.start(0); }
  catch (e) {
    fail('fixture.start', e.message);
    process.exitCode = 1;
    return;
  }
  pass('xtream-fixture-server listening on 127.0.0.1:' + fx.port);

  // ------ 2. Point Hermes at the fixture -----------------------------------
  // Save & clear any real provider env so the test result is deterministic.
  var savedEnv = {};
  ['APOLLO_M3U_URL','XTREMEHD_M3U_URL','JELLYFIN_URL','JELLYFIN_API_KEY','IPTV_ORG_ENABLED'].forEach(function(k) {
    savedEnv[k] = process.env[k]; delete process.env[k];
  });
  process.env.XTREAM_URL = 'http://127.0.0.1:' + fx.port;
  process.env.XTREAM_USERNAME = FIXTURE_USER;
  process.env.XTREAM_PASSWORD = FIXTURE_PASS;

  // Use an isolated provider-data dir so disk providerStore has no leakage
  // from a prior local run.
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-fixture-'));
  process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;

  // ------ 3. Boot Hermes API ----------------------------------------------
  var hermesPort = 3299;
  try { await bootHermesApi(hermesPort); }
  catch (e) {
    fail('Hermes API boot', e.message);
    await cleanup(fx, tmpDir, savedEnv);
    process.exitCode = 1;
    return;
  }
  pass('Hermes API listening on 127.0.0.1:' + hermesPort);

  // ------ 4. /api/providers must include the env-derived xtream provider --
  var providersResp = await call('GET', 'http://127.0.0.1:' + hermesPort + '/api/providers');
  if (providersResp.status === 200 && providersResp.body && Array.isArray(providersResp.body.providers)) {
    var xtreamRow = null;
    for (var i = 0; i < providersResp.body.providers.length; i++) {
      var p = providersResp.body.providers[i];
      if (p && p.source === 'env' && (p.type === 'xtream' || p.id === 'env-xtream')) {
        xtreamRow = p; break;
      }
    }
    if (xtreamRow) {
      pass('/api/providers exposes env-derived xtream provider (source=env)');
    } else {
      fail('/api/providers missing xtream env row', JSON.stringify(providersResp.body.providers));
    }
  } else {
    fail('/api/providers status', 'got ' + providersResp.status);
  }

  // ------ 5. /api/catalog must be non-zero ---------------------------------
  // Force any catalog cache to be populated by hitting the endpoint a couple
  // of times — m3uClient has a 2s race against cold cache.
  var catalogResp = await call('GET', 'http://127.0.0.1:' + hermesPort + '/api/catalog');
  // Retry up to 3x to absorb the SWR race for the first cold fetch.
  for (var retry = 0; retry < 3 && catalogResp.body && catalogResp.body.total === 0; retry++) {
    await new Promise(function(r) { setTimeout(r, 1500); });
    catalogResp = await call('GET', 'http://127.0.0.1:' + hermesPort + '/api/catalog');
  }
  if (catalogResp.status !== 200 || !catalogResp.body) {
    fail('/api/catalog status', 'got ' + catalogResp.status);
  } else {
    var total = catalogResp.body.total || 0;
    var source = (catalogResp.body._meta && catalogResp.body._meta.source) || null;
    if (total > 0 && source !== 'no-providers') {
      pass('/api/catalog returns ' + total + ' items (source=' + source + ')');
    } else {
      fail('/api/catalog empty in fixture mode', 'total=' + total + ' source=' + source);
    }
  }

  // ------ 6. POST /api/play returns a ticket -------------------------------
  var items = (catalogResp.body && catalogResp.body.catalog) || [];
  var pickItem = null;
  for (var j = 0; j < items.length; j++) {
    if (items[j] && items[j].id && (items[j].type === 'live' || items[j].type === 'vod')) {
      pickItem = items[j]; break;
    }
  }
  var ticketId = null;
  var streamEndpoint = null;
  if (!pickItem) {
    fail('No catalog item available to play (fixture should produce at least one)', '');
  } else {
    var playResp = await call('POST', 'http://127.0.0.1:' + hermesPort + '/api/play',
                               { item_id: pickItem.id, profile_id: 'dave_tv' });
    if (playResp.status !== 200 || !playResp.body || !playResp.body.ticket) {
      fail('POST /api/play', 'status=' + playResp.status + ' raw=' + (playResp.raw || '').slice(0, 200));
    } else {
      ticketId = playResp.body.ticket;
      streamEndpoint = playResp.body.stream_endpoint || ('/api/play/' + ticketId + '/stream');
      pass('POST /api/play ticket=' + ticketId.slice(0, 12) + '... item=' + pickItem.id);
    }
  }

  // ------ 7. HEAD + GET stream must return media response ----------------
  if (streamEndpoint) {
    var headResp = await call('HEAD', 'http://127.0.0.1:' + hermesPort + streamEndpoint);
    var headStatus = headResp.status;
    var headCt = (headResp.headers && (headResp.headers['content-type'] || headResp.headers['Content-Type'])) || '';
    if (headStatus === 200 || headStatus === 206 || headStatus === 302) {
      pass('HEAD stream_endpoint status=' + headStatus + ' content-type=' + headCt);
    } else {
      fail('HEAD stream_endpoint unexpected status', 'status=' + headStatus + ' raw=' + (headResp.raw || '').slice(0, 200));
    }

    var streamResp = await call('GET', 'http://127.0.0.1:' + hermesPort + streamEndpoint);
    var status = streamResp.status;
    var ct = (streamResp.headers && (streamResp.headers['content-type'] || streamResp.headers['Content-Type'])) || '';
    if (status === 200 || status === 206 || status === 302) {
      pass('GET stream_endpoint status=' + status + ' content-type=' + ct);
    } else {
      fail('GET stream_endpoint unexpected status', 'status=' + status + ' raw=' + (streamResp.raw || '').slice(0, 200));
    }
    // ---- 8. No credential bytes in response body -------------------------
    var bodySnippet = (streamResp.raw || '').slice(0, 4096);
    if (bodySnippet.indexOf(FIXTURE_USER) === -1 && bodySnippet.indexOf(FIXTURE_PASS) === -1) {
      pass('Stream response contains zero credential bytes');
    } else {
      fail('Credential leak in stream response',
           'username/password appeared in first 4KB (length=' + bodySnippet.length + ')');
    }
  }

  // ------ 9. No-leak scan on /api/providers + /api/catalog ----------------
  var combined = (providersResp.raw || '') + '\n' + (catalogResp.raw || '');
  if (combined.indexOf(FIXTURE_USER) === -1 && combined.indexOf(FIXTURE_PASS) === -1) {
    pass('Provider + catalog responses contain zero credential bytes');
  } else {
    fail('Credential leak in providers/catalog response',
         'username/password found in masked response body');
  }

  // ------ Cleanup ---------------------------------------------------------
  await cleanup(fx, tmpDir, savedEnv);

  console.log('');
  console.log('=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  console.log('# NOTE: fixture proof DOES NOT replace live-provider proof');
  console.log('# per docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md.');
  process.exitCode = totalFail === 0 ? 0 : 1;
})().catch(function(err) {
  console.error('Harness error:', err && err.stack ? err.stack : err);
  cleanup(null, null, null).then(function() { process.exitCode = 2; });
});
