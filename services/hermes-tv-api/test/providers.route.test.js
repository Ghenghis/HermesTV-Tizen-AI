#!/usr/bin/env node
'use strict';

/**
 * test/providers.route.test.js — wave-20 HTTP endpoint coverage.
 *
 * Boots the API in-process on a free port, then exercises:
 *   GET  /api/providers          → empty list initially
 *   POST /api/providers          → add returns masked row, 201
 *   POST /api/providers          → validation errors (400)
 *   GET  /api/providers          → list shows the added row
 *   PATCH /api/providers/:id     → partial update applies
 *   POST /api/providers/:id/test → for an unreachable URL we still get
 *                                  { ok:false, items_seen:0, error:'...' }
 *                                  WITHOUT 500
 *   POST /api/providers/parse-qr → recognises m3u URL / xtream:// URI /
 *                                  JSON blob / get.php query payload
 *   POST /api/providers/parse-qr → returns 422 on unrecognised text
 *   DELETE /api/providers/:id    → 204
 *
 * The credentialGuard middleware sanity check is implicit — any response
 * containing player_api.php / get.php?username= / m3u_plus would 500-replace
 * the body; we assert on the expected non-500 shape.
 *
 * Test fixtures NEVER reference real credentials. Placeholder URLs only.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

// Sandbox data dir BEFORE requiring the app — providerStore reads from this.
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-providers-route-'));
process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

// Reset cache so the test dir takes effect cleanly.
var providerStore = require('../src/lib/providerStore');
providerStore._resetCacheForTests();

var app = require('../src/index');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

// Minimal supertest-equivalent using node:http against the in-process app.
// We start a fresh listener on port 0 to avoid colliding with anything else.
function startServer() {
  return new Promise(function(resolve, reject) {
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, method, urlPath, body) {
  return new Promise(function(resolve, reject) {
    var port = srv.address().port;
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      host: '127.0.0.1',
      port: port,
      method: method,
      path: urlPath,
      headers: {
        'Accept': 'application/json',
      },
    };
    if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        if (text.length > 0) {
          try { parsed = JSON.parse(text); } catch (_) { parsed = text; }
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) { req.write(data); }
    req.end();
  });
}

(async function run() {
  var srv = await startServer();

  // -------------------------------------------------------------------------
  // 1. GET /api/providers — empty
  // -------------------------------------------------------------------------
  var r1 = await request(srv, 'GET', '/api/providers');
  ok('GET /api/providers returns 200', r1.status === 200, 'status=' + r1.status);
  ok('GET /api/providers returns empty list',
    r1.body && Array.isArray(r1.body.providers) && r1.body.providers.length === 0,
    JSON.stringify(r1.body));

  // -------------------------------------------------------------------------
  // 2. POST /api/providers — add m3u
  // -------------------------------------------------------------------------
  var r2 = await request(srv, 'POST', '/api/providers', {
    type: 'm3u',
    label: 'Route Test M3U',
    url: 'https://example.com/route-test.m3u',
  });
  ok('POST /api/providers returns 201', r2.status === 201, 'status=' + r2.status + ' body=' + JSON.stringify(r2.body));
  ok('POST /api/providers returns masked provider',
    r2.body && r2.body.provider && /^prov-[a-f0-9]{8}$/.test(r2.body.provider.id),
    JSON.stringify(r2.body));
  var addedId = r2.body && r2.body.provider && r2.body.provider.id;

  ok('POST response carries no username field', r2.body && r2.body.provider && !('username' in r2.body.provider));
  ok('POST response carries no password field', r2.body && r2.body.provider && !('password' in r2.body.provider));
  ok('POST response carries url_host only', r2.body && r2.body.provider && r2.body.provider.url_host === 'example.com');

  // -------------------------------------------------------------------------
  // 3. POST /api/providers — validation errors
  // -------------------------------------------------------------------------
  var r3 = await request(srv, 'POST', '/api/providers', { type: 'bogus', label: 'X', url: 'ftp://bad/' });
  ok('POST with bad type → 400', r3.status === 400, 'status=' + r3.status);

  var r3b = await request(srv, 'POST', '/api/providers', { type: 'xtream', label: 'X', url: 'http://panel.example' });
  ok('POST xtream without creds → 400', r3b.status === 400, 'status=' + r3b.status);

  // -------------------------------------------------------------------------
  // 4. GET /api/providers — list reflects add
  // -------------------------------------------------------------------------
  var r4 = await request(srv, 'GET', '/api/providers');
  ok('GET list reflects added row', r4.body && r4.body.providers.length === 1 && r4.body.providers[0].id === addedId);

  // -------------------------------------------------------------------------
  // 5. PATCH /api/providers/:id — partial update
  // -------------------------------------------------------------------------
  var r5 = await request(srv, 'PATCH', '/api/providers/' + addedId, { label: 'Renamed' });
  ok('PATCH returns 200', r5.status === 200, 'status=' + r5.status);
  ok('PATCH updates label', r5.body && r5.body.provider && r5.body.provider.label === 'Renamed');

  // -------------------------------------------------------------------------
  // 6. POST /api/providers/:id/test — unreachable URL → ok:false
  // -------------------------------------------------------------------------
  var r6 = await request(srv, 'POST', '/api/providers/' + addedId + '/test', {});
  ok('Test returns 200 even on failed fetch', r6.status === 200, 'status=' + r6.status);
  ok('Test returns ok:false + items_seen:0',
    r6.body && r6.body.ok === false && r6.body.items_seen === 0,
    JSON.stringify(r6.body));

  // -------------------------------------------------------------------------
  // 7. POST /api/providers/parse-qr — accepts each shape
  // -------------------------------------------------------------------------
  var r7a = await request(srv, 'POST', '/api/providers/parse-qr', { text: 'https://example.com/playlist.m3u8' });
  ok('parse-qr accepts plain m3u URL', r7a.status === 200 && r7a.body && r7a.body.parsed && r7a.body.parsed.type === 'm3u',
    JSON.stringify(r7a.body));
  ok('parse-qr m3u sets a label', r7a.body && r7a.body.parsed && typeof r7a.body.parsed.label === 'string' && r7a.body.parsed.label.length > 0);

  var r7b = await request(srv, 'POST', '/api/providers/parse-qr', {
    text: 'xtream://placeholderUser:placeholderPass@panel.example:8080?label=Test',
  });
  ok('parse-qr accepts xtream:// URI', r7b.status === 200 && r7b.body && r7b.body.parsed && r7b.body.parsed.type === 'xtream',
    JSON.stringify(r7b.body));
  ok('parse-qr xtream extracted username', r7b.body && r7b.body.parsed && r7b.body.parsed.username === 'placeholderUser');
  ok('parse-qr xtream extracted password', r7b.body && r7b.body.parsed && r7b.body.parsed.password === 'placeholderPass');
  ok('parse-qr xtream extracted label', r7b.body && r7b.body.parsed && r7b.body.parsed.label === 'Test');

  var r7c = await request(srv, 'POST', '/api/providers/parse-qr', {
    text: JSON.stringify({
      url: 'http://panel.example:8080',
      username: 'placeholderUser',
      password: 'placeholderPass',
      label: 'Welcome Email',
    }),
  });
  ok('parse-qr accepts JSON blob', r7c.status === 200 && r7c.body && r7c.body.parsed && r7c.body.parsed.type === 'xtream',
    JSON.stringify(r7c.body));

  // 422 on unrecognised
  var r7d = await request(srv, 'POST', '/api/providers/parse-qr', { text: 'totally not a url' });
  ok('parse-qr returns 422 on unrecognised text', r7d.status === 422, 'status=' + r7d.status);

  // 400 on missing text
  var r7e = await request(srv, 'POST', '/api/providers/parse-qr', {});
  ok('parse-qr returns 400 on missing text', r7e.status === 400, 'status=' + r7e.status);

  // -------------------------------------------------------------------------
  // 8. DELETE /api/providers/:id → 204
  // -------------------------------------------------------------------------
  var r8 = await request(srv, 'DELETE', '/api/providers/' + addedId);
  ok('DELETE returns 204', r8.status === 204, 'status=' + r8.status + ' body=' + JSON.stringify(r8.body));

  var r8b = await request(srv, 'DELETE', '/api/providers/' + addedId);
  ok('DELETE for already-removed returns 404', r8b.status === 404, 'status=' + r8b.status);

  // -------------------------------------------------------------------------
  // 9. credentialGuard sanity — POST should never leak creds even if the body
  //    accidentally tried to. The parse-qr endpoint is the closest we get to
  //    legitimately echoing username/password; assert the body shape is the
  //    expected wrapper { parsed: { ... } } and not a credentialGuard
  //    rejection envelope ({ error: 'Internal security policy violation' }).
  // -------------------------------------------------------------------------
  ok('parse-qr response is NOT a credentialGuard rejection',
    r7c.body && r7c.body.parsed && !r7c.body.error,
    JSON.stringify(r7c.body));

  // -------------------------------------------------------------------------
  // Tally + shutdown
  // -------------------------------------------------------------------------
  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');

  srv.close();

  // Cleanup temp dir.
  try {
    var f = path.join(tmpDir, 'providers.json');
    if (fs.existsSync(f)) { fs.unlinkSync(f); }
    fs.rmdirSync(tmpDir);
  } catch (_) { /* best-effort */ }

  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
