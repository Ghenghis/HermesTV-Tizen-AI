#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function readWebFile(name) {
  return fs.readFileSync(path.join(__dirname, '..', '..', '..', 'apps', 'hermes-web-tv', name), 'utf8');
}

function csp(html) {
  var m = html.match(/Content-Security-Policy"\s+content="([^"]+)"/);
  return m ? m[1] : '';
}

function directive(policy, name) {
  var parts = policy.split(';').map(function(p) { return p.trim(); });
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].indexOf(name + ' ') === 0) { return parts[i]; }
  }
  return '';
}

(function run() {
  var appPolicy = csp(readWebFile('index.html'));
  var remotePolicy = csp(readWebFile('remote.html'));
  var appConnect = directive(appPolicy, 'connect-src');
  var remoteConnect = directive(remotePolicy, 'connect-src');

  ok('web app CSP allows local no-auth sidecar on 127.0.0.1 ports',
    appConnect.indexOf('http://127.0.0.1:*') !== -1
      && appConnect.indexOf('ws://127.0.0.1:*') !== -1,
    appConnect);

  ok('web app CSP still allows localhost dev API and Vite websocket',
    appConnect.indexOf('http://localhost:*') !== -1
      && appConnect.indexOf('ws://localhost:*') !== -1,
    appConnect);

  ok('remote CSP allows local loopback API during dev',
    remoteConnect.indexOf('http://127.0.0.1:*') !== -1
      && remoteConnect.indexOf('http://localhost:*') !== -1,
    remoteConnect);

  ok('CSP does not use global connect-src wildcard',
    appConnect.indexOf(' *') === -1 && remoteConnect.indexOf(' *') === -1,
    JSON.stringify({ appConnect: appConnect, remoteConnect: remoteConnect }));

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail > 0) { process.exitCode = 1; }
})();
