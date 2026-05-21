#!/usr/bin/env node
'use strict';

var http = require('http');
var net = require('net');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function freePort() {
  return new Promise(function(resolve, reject) {
    var srv = net.createServer();
    srv.listen(0, '127.0.0.1', function() {
      var port = srv.address().port;
      srv.close(function(err) {
        if (err) { reject(err); }
        else { resolve(port); }
      });
    });
    srv.on('error', reject);
  });
}

function request(port, origin) {
  return new Promise(function(resolve, reject) {
    var headers = { Accept: 'application/json' };
    if (origin) { headers.Origin = origin; }
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      method: 'GET',
      path: '/api/auth/me',
      headers: headers,
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var body = null;
        try { body = JSON.parse(text); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async function run() {
  var previous = {};
  [
    'NODE_ENV',
    'PORT',
    'DAVETV_AUTH_REQUIRED',
    'DAVETV_AUTH_ENFORCE_API',
    'DAVETV_ADMIN_EMAIL',
    'DAVETV_ADMIN_PASSWORD',
    'DAVETV_AUTH_STORE',
  ].forEach(function(k) {
    previous[k] = process.env[k];
    delete process.env[k];
  });

  var app = null;
  try {
    var port = await freePort();
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(port);
    process.env.DAVETV_AUTH_REQUIRED = 'false';
    process.env.DAVETV_AUTH_ENFORCE_API = 'false';

    delete require.cache[require.resolve('../src/index.js')];
    app = require('../src/index.js');

    var localIp = await request(port, 'http://127.0.0.1:5174');
    var localhost = await request(port, 'http://localhost:5173');
    var lan = await request(port, 'http://192.168.1.20:5173');
    var denied = await request(port, 'http://evil.example.test');

    ok('127.0.0.1 browser origin can read local API',
      localIp.status === 200
        && localIp.headers['access-control-allow-origin'] === 'http://127.0.0.1:5174'
        && localIp.headers['access-control-allow-credentials'] === 'true'
        && localIp.body
        && localIp.body.auth
        && localIp.body.auth.required === false,
      JSON.stringify(localIp));

    ok('localhost browser origin remains allowed',
      localhost.status === 200
        && localhost.headers['access-control-allow-origin'] === 'http://localhost:5173',
      JSON.stringify(localhost));

    ok('LAN browser origin remains allowed',
      lan.status === 200
        && lan.headers['access-control-allow-origin'] === 'http://192.168.1.20:5173',
      JSON.stringify(lan));

    ok('untrusted browser origin is soft-denied without CORS reflection',
      denied.status === 200
        && !denied.headers['access-control-allow-origin'],
      JSON.stringify(denied));
  } finally {
    if (app && typeof app.closeHermesServer === 'function') {
      await new Promise(function(resolve) { app.closeHermesServer(resolve); });
    }
    Object.keys(previous).forEach(function(k) {
      if (previous[k] === undefined) { delete process.env[k]; }
      else { process.env[k] = previous[k]; }
    });
  }

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) { process.exitCode = 1; }
})().catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
