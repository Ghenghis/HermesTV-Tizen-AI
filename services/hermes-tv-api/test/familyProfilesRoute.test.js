'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var express = require('express');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log('PASS: ' + label);
    pass += 1;
  } else {
    console.log('FAIL: ' + label + (detail ? ' — ' + detail : ''));
    fail += 1;
  }
}

function request(srv, method, urlPath, body) {
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : '';
    var opts = {
      host: '127.0.0.1',
      port: srv.address().port,
      method: method,
      path: urlPath,
      headers: { Accept: 'application/json' },
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
        try { parsed = text ? JSON.parse(text) : null; } catch (_) {}
        resolve({ status: res.statusCode, text: text, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) { req.write(data); }
    req.end();
  });
}

(async function run() {
  var savedEnv = {};
  ['DAVETV_AUTH_STORE','DAVETV_ADMIN_EMAIL','DAVETV_ADMIN_PASSWORD'].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-family-profiles-'));
  process.env.DAVETV_AUTH_STORE = path.join(dir, 'auth.json');
  process.env.DAVETV_ADMIN_EMAIL = 'dave-profile-admin@example.invalid';
  process.env.DAVETV_ADMIN_PASSWORD = 'ProfilePass-' + Math.random().toString(36).slice(2, 10);

  Object.keys(require.cache).forEach(function(k) {
    if (k.indexOf(path.resolve(__dirname, '..', 'src')) === 0) { delete require.cache[k]; }
  });
  var authStore = require('../src/lib/authStore');
  authStore.hydrate();
  var dave = authStore.findUserByEmail(process.env.DAVETV_ADMIN_EMAIL);
  var warren = authStore.createEmailAccount({
    email: 'warren-profile@example.invalid',
    display_name: 'Warren',
    duration_days: 90,
    role: 'viewer',
    created_by: dave && dave.id,
  });

  var route = require('../src/routes/profiles');
  var app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use(route);
  var srv = await new Promise(function(resolve, reject) {
    var s = app.listen(0, function() { resolve(s); });
    s.on('error', reject);
  });

  try {
    var list = await request(srv, 'GET', '/api/profiles');
    var ids = list.body && Array.isArray(list.body.profiles)
      ? list.body.profiles.map(function(p) { return p.profile_id; })
      : [];
    ok('GET /api/profiles includes Dave/Sherri plus auth-created family profile',
      list.status === 200 && ids.indexOf('dave_tv') !== -1 && ids.indexOf('mom_tv') !== -1 && ids.indexOf('warren') !== -1,
      'status=' + list.status + ' ids=' + ids.join(','));

    var one = await request(srv, 'GET', '/api/profile/warren');
    ok('GET /api/profile/warren returns family profile metadata',
      one.status === 200 &&
        one.body &&
        one.body.profile_id === 'warren' &&
        one.body.display_name === 'Warren' &&
        one.body.agent_name === 'DaveTV',
      'status=' + one.status + ' body=' + one.text);

    var patch = await request(srv, 'PATCH', '/api/profile/warren', {
      display_name: 'Warren',
      font_scale: 1.2,
      active_layout: 'samsung-modern',
      profile_id: 'evil',
    });
    ok('PATCH /api/profile/warren rejects protected identity overwrite',
      patch.status === 400 && patch.body && patch.body.error === 'validation_failed',
      'status=' + patch.status + ' body=' + patch.text);

    var patchSafe = await request(srv, 'PATCH', '/api/profile/warren', {
      display_name: 'Warren',
      font_scale: 1.2,
      active_layout: 'samsung-modern',
    });
    ok('PATCH /api/profile/warren saves safe family profile fields',
      patchSafe.status === 200 &&
        patchSafe.body &&
        patchSafe.body.profile_id === 'warren' &&
        patchSafe.body.font_scale === 1.2 &&
        patchSafe.body.active_layout === 'samsung-modern',
      'status=' + patchSafe.status + ' body=' + patchSafe.text);

    var bad = await request(srv, 'GET', '/api/profile/' + encodeURIComponent('warren bad'));
    ok('GET /api/profile rejects unsafe profile id',
      bad.status === 404 && bad.body && /profile_id/.test(String(bad.body.message || '')),
      'status=' + bad.status + ' body=' + bad.text);

    ok('auth user was created for test without leaking email into profile id',
      warren && warren.user && warren.user.display_name === 'Warren',
      JSON.stringify(warren && warren.user));
  } finally {
    await new Promise(function(resolve) { srv.close(function() { resolve(); }); });
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    Object.keys(savedEnv).forEach(function(k) {
      if (savedEnv[k] === undefined) { delete process.env[k]; } else { process.env[k] = savedEnv[k]; }
    });
  }

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exitCode = fail > 0 ? 1 : 0;
})().catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
