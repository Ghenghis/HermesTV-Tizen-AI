#!/usr/bin/env node
'use strict';

var express = require('express');
var http = require('http');
var healthRouter = require('../src/routes/health');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function startServer() {
  return new Promise(function(resolve, reject) {
    var app = express();
    app.use('/', healthRouter);
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, path) {
  return new Promise(function(resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: srv.address().port,
      method: 'GET',
      path: path,
      headers: { Accept: 'application/json' },
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { /* ok */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function hasHermesIdentity(r) {
  return r.status === 200
    && r.body
    && r.body.status === 'ok'
    && r.body.service === 'hermes-tv-api'
    && r.body.version === '0.1.0'
    && typeof r.body.ts === 'string'
    && !Number.isNaN(Date.parse(r.body.ts));
}

(async function run() {
  var srv = await startServer();
  try {
    var canonical = await request(srv, '/health');
    var alias = await request(srv, '/api/health');

    ok('GET /health returns Hermes identity', hasHermesIdentity(canonical), JSON.stringify(canonical));
    ok('GET /api/health returns Hermes identity', hasHermesIdentity(alias), JSON.stringify(alias));
    ok('GET /api/health matches /health identity fields',
      alias.body
        && canonical.body
        && alias.body.status === canonical.body.status
        && alias.body.service === canonical.body.service
        && alias.body.version === canonical.body.version,
      JSON.stringify({ canonical: canonical.body, alias: alias.body }));
  } finally {
    srv.close();
  }

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) { process.exitCode = 1; }
})().catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
