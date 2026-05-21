'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const source = fs.readFileSync(path.join(root, 'services', 'hermes-tv-api', 'src', 'lib', 'iptvOrg.js'), 'utf8');

let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) {
    pass += 1;
    console.log('PASS: ' + name);
  } else {
    fail += 1;
    console.error('FAIL: ' + name + (detail ? ' - ' + detail : ''));
  }
}

ok('iptv-org catalog entries are not marked healthy until proven by playback',
  /provider_id: 'iptv-org'[\s\S]*source_health: \{[\s\S]*status: 'unknown'[\s\S]*health_label: 'unverified'/.test(source),
  'iptv-org source_health must stay unknown/unverified, not ok');

ok('iptv-org adapter no longer assigns fake ok health',
  source.indexOf("source_health: { status: 'ok'") === -1,
  'found fake ok source_health in iptvOrg.js');

console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
if (fail) { process.exit(1); }
