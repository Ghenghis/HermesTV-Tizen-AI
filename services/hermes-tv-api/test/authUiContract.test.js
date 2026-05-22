'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log('PASS: ' + name);
  } else {
    fail += 1;
    console.error('FAIL: ' + name + (detail ? ' — ' + detail : ''));
  }
}

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const authGate = fs.readFileSync(path.join(repoRoot, 'apps/hermes-web-tv/src/components/AuthGate.jsx'), 'utf8');
const settingsPanel = fs.readFileSync(path.join(repoRoot, 'apps/hermes-web-tv/src/components/SettingsPanelTabbed.jsx'), 'utf8');
const app = fs.readFileSync(path.join(repoRoot, 'apps/hermes-web-tv/src/App.jsx'), 'utf8');

console.log('\n--- Auth UI contract ---');
ok('Admin panel does not concatenate raw reset URLs into status copy',
  !/use this reset link:\s*'\s*\+\s*body\.reset_url/.test(authGate));
ok('Admin panel stores manual reset URL as an action link',
  /setActionLink\(body\.reset_url\)/.test(authGate));
ok('Admin panel renders manual reset as an Open reset form link',
  /href=\{actionLink\}/.test(authGate) && /Open reset form/.test(authGate));
ok('Settings panel exposes family access entry point',
  /onOpenAdminPanel/.test(settingsPanel) && /Manage family access/.test(settingsPanel));
ok('App routes family access entry to admin login mode',
  /onOpenAdminPanel/.test(app) && /admin=1/.test(app));
ok('Reset and register routes are not bypassed by local no-auth mode',
  authGate.indexOf('if (registerToken)') < authGate.indexOf('if (auth && auth.required === false)')
    && authGate.indexOf('if (resetToken)') < authGate.indexOf('if (auth && auth.required === false)'));
ok('Local no-auth admin route renders an honest blocked state',
  /LocalAdminDisabledView/.test(authGate)
    && /Family account management requires the API auth gate/.test(authGate));

console.log(`Results: ${pass} PASS, ${fail} FAIL`);
if (fail) process.exit(1);
