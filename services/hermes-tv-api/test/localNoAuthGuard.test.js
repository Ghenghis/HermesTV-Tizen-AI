'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var guard = require('../../../tools/local-noauth-env');

var totalPass = 0;
var totalFail = 0;

function ok(label, condition, detail) {
  if (condition) {
    console.log('PASS: ' + label);
    totalPass += 1;
  } else {
    console.log('FAIL: ' + label + (detail ? ' — ' + detail : ''));
    totalFail += 1;
  }
}

var localEnv = { NODE_ENV: 'development', DAVETV_AUTH_REQUIRED: 'true', DAVETV_AUTH_ENFORCE_API: 'true' };
guard.configureLocalNoAuth(localEnv);
ok('local no-auth guard disables UI auth for development only',
  localEnv.DAVETV_AUTH_REQUIRED === 'false' && localEnv.DAVETV_AUTH_ENFORCE_API === 'false',
  JSON.stringify(localEnv));
ok('local no-auth guard preserves non-production NODE_ENV',
  localEnv.NODE_ENV === 'development',
  localEnv.NODE_ENV);
ok('local no-auth guard enables free iptv-org for local testing',
  localEnv.IPTV_ORG_ENABLED === 'true'
    && /iptv-org-cache$/.test(localEnv.IPTV_ORG_CACHE_DIR || ''),
  JSON.stringify(localEnv));

var defaultEnv = {};
guard.configureLocalNoAuth(defaultEnv);
ok('local no-auth guard defaults NODE_ENV to development',
  defaultEnv.NODE_ENV === 'development',
  defaultEnv.NODE_ENV);
ok('local no-auth guard sets public iptv-org filter defaults',
  defaultEnv.IPTV_ORG_COUNTRIES === 'US,GB,CA,AU'
    && defaultEnv.IPTV_ORG_CATEGORIES.indexOf('sports') !== -1,
  JSON.stringify(defaultEnv));

var refused = false;
try {
  guard.configureLocalNoAuth({ NODE_ENV: 'production' });
} catch (err) {
  refused = /Refusing to disable DaveTV auth/.test(String(err && err.message));
}
ok('local no-auth guard refuses production',
  refused,
  'production must fail closed');

var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-local-env-'));
var envFile = path.join(tmp, '.env');
fs.writeFileSync(envFile, [
  'AZURE_SPEECH_KEY=test-key',
  'AZURE_SPEECH_REGION=eastus',
  'OPENROUTER_API_KEY=must-not-load',
  'APOLLO_M3U_URL=must-not-load',
].join('\n'), 'utf8');
var privateEnv = {};
var loaded = guard.loadWhitelistedEnvFile(privateEnv, envFile);
ok('local private env loader imports Azure voice keys only',
  privateEnv.AZURE_SPEECH_KEY === 'test-key' &&
    privateEnv.AZURE_SPEECH_REGION === 'eastus' &&
    privateEnv.OPENROUTER_API_KEY === undefined &&
    privateEnv.APOLLO_M3U_URL === undefined,
  JSON.stringify({ loaded: loaded, keys: Object.keys(privateEnv).sort() }));
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\n=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
process.exitCode = totalFail > 0 ? 1 : 0;
