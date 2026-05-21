#!/usr/bin/env node
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'davetv-auth-bootstrap-'));
var storePath = path.join(tmpDir, 'auth.json');

process.env.DAVETV_AUTH_STORE = storePath;
process.env.DAVETV_ADMIN_EMAIL = 'dave@example.test';
delete process.env.DAVETV_ADMIN_PASSWORD;

fs.writeFileSync(storePath, JSON.stringify({
  version: 1,
  users: {
    'usr-other-admin': {
      id: 'usr-other-admin',
      email: 'suzy-admin@example.test',
      display_name: 'Suzy',
      role: 'admin',
      status: 'active',
      auth_methods: [],
      oauth: {},
      password: null,
      account_expires_at: null,
      created_at: new Date().toISOString(),
      created_by: 'test',
      last_login_at: null,
      last_seen_at: null,
    },
    'usr-existing': {
      id: 'usr-existing',
      email: 'warren@example.test',
      display_name: 'Warren',
      role: 'viewer',
      status: 'active',
      auth_methods: [],
      oauth: {},
      password: null,
      account_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      created_by: 'test',
      last_login_at: null,
      last_seen_at: null,
    },
  },
  invites: {},
  resets: {},
  sessions: {},
  oauth_states: {},
}, null, 2) + os.EOL, 'utf8');

var authStore = require('../src/lib/authStore');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

try {
  authStore.hydrate();
  var dave = authStore.findUserByEmail('dave@example.test');
  ok('email-only bootstrap creates Dave when store already has users/admins', !!dave && dave.display_name === 'Dave', JSON.stringify(dave));
  ok('email-only Dave bootstrap is admin and active', dave && dave.role === 'admin' && dave.status === 'active', JSON.stringify(dave));
  ok('email-only Dave bootstrap has no required initial password', dave && dave.auth_methods.indexOf('password') === -1, JSON.stringify(dave));
  ok('auth store now reports an active admin', authStore.hasAdmin() === true, '');

  var reset = authStore.createPasswordReset('dave@example.test', 'self-service');
  ok('Dave can create a password reset after email-only bootstrap', reset && reset.token && reset.user && reset.user.email === 'dave@example.test', JSON.stringify(reset && reset.user));

  var user = authStore.resetPassword(reset.token, 'DaveStrongPass123!');
  ok('Dave reset link sets password', user && user.role === 'admin' && user.email === 'dave@example.test', JSON.stringify(user));

  var login = authStore.loginWithPassword('dave@example.test', 'DaveStrongPass123!', 'test-device');
  ok('Dave can log in after reset password', login && login.token && login.user && login.user.role === 'admin', JSON.stringify(login && login.user));

  var warren = authStore.findUserByEmail('warren@example.test');
  warren.status = 'expired';
  warren.account_expires_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  var renewed = authStore.createEmailAccount({
    email: 'warren@example.test',
    display_name: 'Warren',
    duration_days: 90,
    created_by: dave.id,
  });
  ok('admin email account flow renews existing family user', renewed && renewed.created === false && renewed.reset && renewed.reset.token, JSON.stringify(renewed && renewed.user));
  var renewedWarren = authStore.findUserByEmail('warren@example.test');
  ok('renewed existing family user is active with future expiry', renewedWarren && renewedWarren.status === 'active' && Date.parse(renewedWarren.account_expires_at) > Date.now(), JSON.stringify(renewedWarren));

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
} finally {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
}
