#!/usr/bin/env node
'use strict';

/**
 * VPS persistence contract.
 *
 * Provider setup must survive container rebuilds/restarts. The production
 * image and compose files therefore need the provider store, auth store, and
 * settings store pinned to the mounted /var/lib/hermestv volume.
 */

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..', '..', '..');
var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log('PASS:', label);
    pass += 1;
  } else {
    console.log('FAIL:', label, detail || '');
    fail += 1;
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

var dockerfile = read('services/hermes-tv-api/Dockerfile');
var vpsCompose = read('upstream/docker-vps/VPS_COMPOSE.yml');
var legacyCompose = read('docker/vps/compose.yml');
var deployWorkflow = read('.github/workflows/deploy-vps.yml');
var redeployScript = read('tools/redeploy-vps.sh');

ok('Dockerfile pins provider data dir to /var/lib/hermestv/providers',
  /ENV\s+HERMES_PROVIDER_DATA_DIR=\/var\/lib\/hermestv\/providers/.test(dockerfile));
ok('Dockerfile pins auth store to /var/lib/hermestv/auth.json',
  /ENV\s+DAVETV_AUTH_STORE=\/var\/lib\/hermestv\/auth\.json/.test(dockerfile));
ok('Dockerfile creates provider persistence directory',
  /mkdir\s+-p\s+\/var\/lib\/hermestv\/providers/.test(dockerfile));
ok('Dockerfile enables free iptv-org by default',
  /ENV\s+IPTV_ORG_ENABLED=true/.test(dockerfile)
    && /ENV\s+IPTV_ORG_CACHE_DIR=\/var\/cache\/iptv-org/.test(dockerfile));
ok('Dockerfile creates iptv-org cache directory',
  /mkdir\s+-p[\s\S]*\/var\/cache\/iptv-org/.test(dockerfile));

ok('VPS compose mounts /var/lib/hermestv',
  vpsCompose.indexOf(':/var/lib/hermestv') !== -1);
ok('VPS compose sets provider data dir on the mounted volume',
  vpsCompose.indexOf('HERMES_PROVIDER_DATA_DIR: /var/lib/hermestv/providers') !== -1);
ok('VPS compose enables iptv-org and mounts its cache',
  vpsCompose.indexOf('IPTV_ORG_ENABLED: "true"') !== -1
    && vpsCompose.indexOf('IPTV_ORG_CACHE_DIR: /var/cache/iptv-org') !== -1
    && vpsCompose.indexOf(':/var/cache/iptv-org') !== -1);
ok('VPS compose makes private .env optional instead of blocking deploy',
  /env_file:\s*[\s\S]*path:\s+\.\.\/\.\.\/\.env[\s\S]*required:\s+false/.test(vpsCompose));

ok('legacy docker/vps compose mounts /var/lib/hermestv',
  legacyCompose.indexOf('hermestv-data:/var/lib/hermestv') !== -1);
ok('legacy docker/vps compose sets provider data dir on the mounted volume',
  legacyCompose.indexOf('HERMES_PROVIDER_DATA_DIR: /var/lib/hermestv/providers') !== -1);
ok('legacy docker/vps compose enables iptv-org and mounts its cache',
  legacyCompose.indexOf("IPTV_ORG_ENABLED: 'true'") !== -1
    && legacyCompose.indexOf('IPTV_ORG_CACHE_DIR: /var/cache/iptv-org') !== -1
    && legacyCompose.indexOf('hermestv-iptv-org-cache:/var/cache/iptv-org') !== -1);

ok('GitHub VPS deploy does not refuse solely because private .env is missing',
  deployWorkflow.indexOf('Refusing to deploy an auth-gated build') === -1
    && /WARN[\s\S]+\.env is missing[\s\S]+continuing with compose\/image defaults/.test(deployWorkflow));
ok('local VPS redeploy script does not refuse solely because private .env is missing',
  redeployScript.indexOf('Refusing to deploy an auth-gated build') === -1
    && /WARN[\s\S]+\.env is missing[\s\S]+continuing with compose\/image defaults/.test(redeployScript));
ok('VPS deploy no longer requires an initial admin password in env',
  deployWorkflow.indexOf('DAVETV_ADMIN_PASSWORD') === -1
    && redeployScript.indexOf('DAVETV_ADMIN_PASSWORD') === -1);

console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
