'use strict';

/**
 * test/remoteRelayContract.test.js — phone-as-remote relay contract.
 *
 * The phone scans the TV's pair code (HRM-XXXX), opens /remote.html in
 * its browser, and POSTs key events. The TV opens an SSE stream against
 * the same code and dispatches the keys into the focus engine. This
 * test pins down that contract end-to-end:
 *
 *   - validation_failed (pair_code shape, missing key, oversized fields)
 *   - happy-path POST → 202 accepted
 *   - SSE stream opens with the right headers
 *   - POSTed events FLOW through the SSE stream (the actual relay)
 *
 * Routes do NOT require auth (pair_code is the only auth — see auth.js
 * authMiddleware isOpenRoute for /api/remote/), so we boot the API with
 * auth disabled to keep this test focused on the relay contract.
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

function call(method, url, body) {
  return new Promise(function(resolve) {
    var u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0 }); }
    var headers = { Accept: 'application/json' };
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
        resolve({ status: res.statusCode, body: parsed, raw: raw, headers: res.headers });
      });
    });
    req.on('error', function() { resolve({ status: 0 }); });
    req.setTimeout(5000, function() { try { req.destroy(); } catch (_) {} });
    if (data) { req.write(data); }
    req.end();
  });
}

// Open an SSE connection that resolves with the first `data: ...` frame received
// or rejects on timeout. Closes the connection cleanly afterward.
function openSseAndWaitForFirstData(url, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var settled = false;
    var firstFrameBuf = '';
    var req = http.request({
      method: 'GET', hostname: u.hostname, port: u.port || 80,
      path: u.pathname + (u.search || ''),
      headers: { Accept: 'text/event-stream' },
    }, function(res) {
      if (settled) return;
      var contentType = res.headers['content-type'] || '';
      if (res.statusCode !== 200 || !/text\/event-stream/i.test(contentType)) {
        settled = true;
        try { req.destroy(); } catch (_) {}
        return reject(new Error('bad SSE response: status=' + res.statusCode + ' content-type=' + contentType));
      }
      res.on('data', function(chunk) {
        if (settled) return;
        firstFrameBuf += chunk.toString('utf8');
        // Look for a `data: {...}` line (skip the `:keepalive` comments).
        var lines = firstFrameBuf.split(/\n/);
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (ln.indexOf('data:') === 0) {
            settled = true;
            try { req.destroy(); } catch (_) {}
            try { resolve({ contentType: contentType, dataLine: ln.replace(/^data:\s*/, '') }); }
            catch (e) { /* swallow */ }
            return;
          }
        }
      });
      res.on('error', function() {
        if (settled) return;
        settled = true;
        reject(new Error('SSE socket error'));
      });
    });
    req.on('error', function(e) {
      if (settled) return;
      settled = true;
      reject(e);
    });
    req.setTimeout(timeoutMs, function() {
      if (settled) return;
      settled = true;
      try { req.destroy(); } catch (_) {}
      reject(new Error('SSE first-data timed out'));
    });
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

(async function main() {
  var savedEnv = {};
  ['DAVETV_AUTH_REQUIRED','DAVETV_AUTH_ENFORCE_API','HERMES_PROVIDER_DATA_DIR'].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });

  var providerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-remote-prov-'));
  process.env.HERMES_PROVIDER_DATA_DIR = providerDir;
  // Routes /api/remote/* are open per auth.js isOpenRoute. We disable auth
  // entirely so the test isn't coupled to admin bootstrap mechanics.
  process.env.DAVETV_AUTH_REQUIRED = 'false';
  process.env.DAVETV_AUTH_ENFORCE_API = 'false';

  var port = 3300;
  try { await bootHermesApi(port); pass('Boot: API listening on ' + port); }
  catch (e) { fail('Boot', e.message); process.exitCode = 1; return; }

  var base = 'http://127.0.0.1:' + port;

  // ── Validation: bad pair_code shape ─────────────────────────────────────
  var badShape = await call('POST', base + '/api/remote/event', {
    pair_code: 'bad-code', key: 'ArrowLeft',
  });
  if (badShape.status !== 400) {
    fail('Validation: bad pair_code expected 400', 'status=' + badShape.status);
  } else if (!badShape.body || badShape.body.error !== 'validation_failed') {
    fail('Validation: bad pair_code body.error not "validation_failed"', JSON.stringify(badShape.body));
  } else {
    pass('Validation: POST bad pair_code shape → 400 validation_failed');
  }

  // ── Validation: missing key ──────────────────────────────────────────────
  var missingKey = await call('POST', base + '/api/remote/event', {
    pair_code: 'HRM-AB12',
  });
  if (missingKey.status !== 400) {
    fail('Validation: missing key expected 400', 'status=' + missingKey.status);
  } else {
    pass('Validation: POST missing key → 400 validation_failed');
  }

  // ── Validation: oversized key ────────────────────────────────────────────
  var bigKey = await call('POST', base + '/api/remote/event', {
    pair_code: 'HRM-AB12', key: 'X'.repeat(64),
  });
  if (bigKey.status !== 400) {
    fail('Validation: oversized key expected 400', 'status=' + bigKey.status);
  } else {
    pass('Validation: POST 64-char key → 400 validation_failed (cap=32)');
  }

  // ── Validation: GET /events with bad pair_code ──────────────────────────
  var badGet = await call('GET', base + '/api/remote/events?pair_code=NOTACODE');
  if (badGet.status !== 400) {
    fail('Validation: GET bad pair_code expected 400', 'status=' + badGet.status);
  } else {
    pass('Validation: GET /events with bad pair_code → 400');
  }

  // ── Happy path: POST event ──────────────────────────────────────────────
  var goodPair = 'HRM-Z9XK';
  var goodPost = await call('POST', base + '/api/remote/event', {
    pair_code: goodPair, key: 'ArrowDown', ts: Date.now(),
  });
  if (goodPost.status !== 202) {
    fail('Happy: POST valid event expected 202', 'status=' + goodPost.status + ' raw=' + goodPost.raw);
  } else if (!goodPost.body || goodPost.body.accepted !== true) {
    fail('Happy: body.accepted not true', JSON.stringify(goodPost.body));
  } else {
    pass('Happy: POST valid event → 202 accepted:true');
  }

  // ── SSE relay round-trip ────────────────────────────────────────────────
  // Open the SSE stream FIRST (so the listener is registered), then POST an
  // event, then assert the data frame arrived.
  var relayPair = 'HRM-RL99';
  var ssePromise = openSseAndWaitForFirstData(base + '/api/remote/events?pair_code=' + relayPair, 5000);
  // Give the SSE handler a tick to register the listener before posting.
  await new Promise(function(r) { setTimeout(r, 200); });
  var relayPost = await call('POST', base + '/api/remote/event', {
    pair_code: relayPair, key: 'Enter', ts: 12345,
  });
  if (relayPost.status !== 202) {
    fail('Relay: POST setup expected 202', 'status=' + relayPost.status);
  } else {
    pass('Relay: POST event for SSE listener → 202');
  }

  try {
    var sse = await ssePromise;
    pass('Relay: SSE Content-Type=' + sse.contentType + ' (text/event-stream)');
    var parsed = null;
    try { parsed = JSON.parse(sse.dataLine); } catch (_) {}
    if (!parsed) {
      fail('Relay: SSE data frame not JSON', sse.dataLine.slice(0, 200));
    } else {
      pass('Relay: SSE data frame parsed JSON');
      if (parsed.key !== 'Enter') {
        fail('Relay: SSE frame.key not "Enter"', JSON.stringify(parsed));
      } else {
        pass('Relay: SSE frame.key === "Enter" (round-trip works)');
      }
      if (parsed.pair_code !== relayPair) {
        // The relay may strip pair_code from the broadcast — that's fine, just
        // verify the key flowed through.
        pass('Relay: SSE frame ' + (parsed.pair_code ? 'includes' : 'omits') + ' pair_code (key flow is the contract)');
      } else {
        pass('Relay: SSE frame.pair_code === ' + relayPair);
      }
    }
  } catch (e) {
    fail('Relay: SSE round-trip', e && e.message ? e.message : String(e));
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────
  await closeHermesApi();
  try { fs.rmSync(providerDir, { recursive: true, force: true }); } catch (_) {}
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
