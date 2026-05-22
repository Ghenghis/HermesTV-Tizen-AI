'use strict';

var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..', '..', '..');
var settings = fs.readFileSync(path.join(root, 'services', 'hermes-tv-api', 'src', 'routes', 'settings.js'), 'utf8');
var sourceHealth = fs.readFileSync(path.join(root, 'services', 'hermes-tv-api', 'src', 'routes', 'sourceHealth.js'), 'utf8');

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

ok('/api/settings default contract does not expose mock_mode',
  settings.indexOf('mock_mode') === -1);
ok('/api/settings default contract does not expose mock_only providers',
  settings.indexOf('mock_only') === -1);
ok('/api/source-health not-configured contract uses configured:false, not mock:true',
  sourceHealth.indexOf('mock: true') === -1 &&
  sourceHealth.indexOf('configured: false') !== -1);

console.log('\n=== Results: ' + pass + ' PASS, ' + fail + ' FAIL ===');
process.exit(fail === 0 ? 0 : 1);
