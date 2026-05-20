#!/usr/bin/env node
'use strict';

/**
 * Real QR/provider setup proof:
 *   POST /api/pair returns a concrete setup_url with the minted code.
 *   GET /setup/provider?code=... returns a form whose field names match
 *   providerStore.add().
 *   POST /setup/provider/submit persists the provider and completes pairing.
 *   GET /api/pair/:code returns completed with a durable provider id.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-provider-qr-'));
process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

var providerStore = require('../src/lib/providerStore');
providerStore._resetCacheForTests();

var pairingRouter = require('../src/routes/pairing');
pairingRouter._test_reset();

var app = require('../src/index');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function startServer() {
  return new Promise(function(resolve, reject) {
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, opts, bodyText) {
  return new Promise(function(resolve, reject) {
    var port = srv.address().port;
    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (bodyText) { headers['Content-Length'] = Buffer.byteLength(bodyText); }
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      method: opts.method || 'GET',
      path: opts.path,
      headers: headers,
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        var ct = String(res.headers['content-type'] || '');
        if (ct.indexOf('application/json') !== -1 && text) {
          try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        }
        resolve({ status: res.statusCode, headers: res.headers, text: text, body: parsed });
      });
    });
    req.on('error', reject);
    if (bodyText) { req.write(bodyText); }
    req.end();
  });
}

function closeAppServer() {
  return new Promise(function(resolve) {
    if (typeof app.closeHermesServer !== 'function') { return resolve(); }
    app.closeHermesServer(function() { resolve(); });
  });
}

(async function run() {
  var srv = await startServer();
  try {
    var created = await request(srv, {
      method: 'POST',
      path: '/api/pair',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'tv.example.test',
      },
    }, '{}');

    ok('POST /api/pair returns 201', created.status === 201, 'status=' + created.status + ' body=' + created.text);
    var code = created.body && created.body.pairing_code;
    ok('POST /api/pair returns HRM code', /^HRM-[A-Z0-9]{4}$/.test(code || ''), 'code=' + code);
    ok('POST /api/pair returns real setup_url',
      created.body && created.body.setup_url === 'https://tv.example.test/setup/provider?code=' + encodeURIComponent(code),
      JSON.stringify(created.body));

    var fakeComplete = await request(srv, {
      method: 'POST',
      path: '/api/pair/' + encodeURIComponent(code) + '/complete',
      headers: { 'Content-Type': 'application/json' },
    }, JSON.stringify({ provider_id: 'apollo' }));
    ok('provider-id-only pairing completion is rejected',
      fakeComplete.status === 400 && fakeComplete.body && fakeComplete.body.error === 'provider_config_required',
      fakeComplete.text);
    var stillPending = await request(srv, { method: 'GET', path: '/api/pair/' + encodeURIComponent(code) });
    ok('rejected legacy completion leaves pairing pending',
      stillPending.status === 200 && stillPending.body && stillPending.body.status === 'pending',
      stillPending.text);

    var page = await request(srv, {
      method: 'GET',
      path: '/setup/provider?code=' + encodeURIComponent(code),
      headers: { Accept: 'text/html' },
    });
    ok('GET setup page returns HTML', page.status === 200 && /text\/html/.test(String(page.headers['content-type'] || '')));
    ok('setup page contains hidden pairing_code', page.text.indexOf('name="pairing_code" value="' + code + '"') !== -1);
    ok('setup form field names match providerStore', page.text.indexOf('name="type"') !== -1 && page.text.indexOf('name="url"') !== -1);
    ok('setup page does not claim encryption', page.text.indexOf('stored encrypted') === -1);

    var form = new URLSearchParams();
    form.append('pairing_code', code);
    form.append('type', 'm3u');
    form.append('label', 'QR Setup Test');
    form.append('url', 'https://provider.example.test/live.m3u');

    var submitted = await request(srv, {
      method: 'POST',
      path: '/setup/provider/submit',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }, form.toString());

    ok('POST setup submit persists provider', submitted.status === 201, 'status=' + submitted.status + ' body=' + submitted.text);
    ok('setup submit returns masked provider',
      submitted.body && submitted.body.provider && /^prov-[a-f0-9]{8}$/.test(submitted.body.provider.id),
      submitted.text);
    ok('setup submit completes pairing',
      submitted.body && submitted.body.pairing && submitted.body.pairing.status === 'completed',
      submitted.text);
    ok('setup submit leaks no raw url path',
      submitted.body && submitted.body.provider && submitted.body.provider.url_host === 'provider.example.test' &&
        !('url' in submitted.body.provider),
      submitted.text);

    var status = await request(srv, { method: 'GET', path: '/api/pair/' + encodeURIComponent(code) });
    ok('GET /api/pair/:code reflects completed', status.status === 200 && status.body && status.body.status === 'completed',
      status.text);
    ok('completed pairing has durable provider id',
      status.body && status.body.persisted_provider_id === submitted.body.provider.id,
      status.text);

    var diskPath = path.join(tmpDir, 'providers.json');
    ok('provider store wrote providers.json', fs.existsSync(diskPath), diskPath);

    console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  } finally {
    await new Promise(function(resolve) { srv.close(function() { resolve(); }); });
    await closeAppServer();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch(async function(err) {
  console.error('Unhandled test error:', err);
  try { await closeAppServer(); } catch (_) { /* best-effort */ }
  process.exit(1);
});
