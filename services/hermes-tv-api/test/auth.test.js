#!/usr/bin/env node
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'davetv-auth-'));
process.env.DAVETV_AUTH_STORE = path.join(tmpDir, 'auth.json');
process.env.DAVETV_ADMIN_EMAIL = 'dave@example.test';
process.env.DAVETV_ADMIN_PASSWORD = 'StrongPass123!';
process.env.DAVETV_AUTH_REQUIRED = 'true';
process.env.DAVETV_AUTH_ENFORCE_API = 'true';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

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

function request(srv, opts, bodyObj, jar) {
  return new Promise(function(resolve, reject) {
    var bodyText = bodyObj ? JSON.stringify(bodyObj) : '';
    var headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
    if (bodyText) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyText);
    }
    if (jar && jar.cookie) { headers.Cookie = jar.cookie; }
    var req = http.request({
      host: '127.0.0.1',
      port: srv.address().port,
      method: opts.method || 'GET',
      path: opts.path,
      headers: headers,
    }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        var setCookie = res.headers['set-cookie'];
        if (jar && setCookie && setCookie.length > 0) {
          jar.cookie = String(setCookie[0]).split(';')[0];
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
  var adminJar = {};
  var userJar = {};
  try {
    var me = await request(srv, { path: '/api/auth/me' }, null, {});
    ok('auth status bootstraps Dave admin', me.status === 200 && me.body && me.body.auth && me.body.auth.configured === true && me.body.user === null, me.text);

    var protectedRoute = await request(srv, { path: '/api/providers' }, null, {});
    ok('API gate blocks unauthenticated provider route', protectedRoute.status === 401 && protectedRoute.body && protectedRoute.body.error === 'auth_required', protectedRoute.text);

    var openPairCreate = await request(srv, { method: 'POST', path: '/api/pair' }, {}, {});
    ok('API gate blocks unauthenticated pair-code creation', openPairCreate.status === 401, openPairCreate.text);

    var adminLogin = await request(srv, { method: 'POST', path: '/api/auth/login' }, {
      email: 'dave@example.test',
      password: 'StrongPass123!',
    }, adminJar);
    ok('Dave admin can log in', adminLogin.status === 200 && adminLogin.body && adminLogin.body.user && adminLogin.body.user.role === 'admin', adminLogin.text);
    ok('login sets durable session cookie', /^davetv_session=/.test(adminJar.cookie || ''), adminJar.cookie);

    var pairCreate = await request(srv, { method: 'POST', path: '/api/pair' }, {}, adminJar);
    ok('authenticated session can create pair code', pairCreate.status === 201 && /^HRM-[A-Z0-9]{4}$/.test(pairCreate.body && pairCreate.body.pairing_code || ''), pairCreate.text);

    var badInvite = await request(srv, { method: 'POST', path: '/api/admin/invites' }, {
      email: 'outsider@example.test',
      display_name: 'Outsider',
      duration_days: 30,
    }, adminJar);
    ok('admin cannot invite names outside allow-list', badInvite.status === 400 && badInvite.body && badInvite.body.error === 'name_not_allowed', badInvite.text);

    var invite = await request(srv, { method: 'POST', path: '/api/admin/invites', headers: { Origin: 'http://localhost:5173' } }, {
      email: 'sherri@example.test',
      display_name: 'Sherri',
      duration_days: 90,
    }, adminJar);
    ok('admin creates Sherri invite', invite.status === 201 && invite.body && invite.body.invite && invite.body.invite.display_name === 'Sherri', invite.text);
    ok('invite returns manual link when SMTP not configured', invite.body && invite.body.delivery && invite.body.delivery.sent === false && /register_token=/.test(invite.body.invite_url || ''), invite.text);
    ok('invite link targets public web origin', /^http:\/\/localhost:5173\/\?register_token=/.test(invite.body.invite_url || ''), invite.body && invite.body.invite_url);

    var registerToken = new URL(invite.body.invite_url).searchParams.get('register_token');
    var registered = await request(srv, { method: 'POST', path: '/api/auth/register' }, {
      token: registerToken,
      password: 'SherriPass123!',
    }, userJar);
    ok('invite registration creates viewer', registered.status === 201 && registered.body && registered.body.user && registered.body.user.display_name === 'Sherri' && registered.body.user.role === 'viewer', registered.text);

    var viewerAdmin = await request(srv, { path: '/api/admin/users' }, null, userJar);
    ok('viewer cannot access admin users', viewerAdmin.status === 403, viewerAdmin.text);

    var users = await request(srv, { path: '/api/admin/users' }, null, adminJar);
    ok('admin can list users and invites', users.status === 200 && users.body && users.body.users && users.body.users.length === 2 && users.body.invites && users.body.invites.length === 1, users.text);
    var sherri = users.body.users.filter(function(u) { return u.email === 'sherri@example.test'; })[0];
    ok('registered account carries expiry', sherri && typeof sherri.account_expires_at === 'string' && Date.parse(sherri.account_expires_at) > Date.now(), JSON.stringify(sherri));

    console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  } finally {
    await new Promise(function(resolve) { srv.close(function() { resolve(); }); });
    await closeAppServer();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch(async function(err) {
  console.error(err && err.stack ? err.stack : err);
  try { await closeAppServer(); } catch (_) { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  process.exit(1);
});
