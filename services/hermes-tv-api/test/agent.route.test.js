#!/usr/bin/env node
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'davetv-agent-route-'));
process.env.HERMES_AGENT_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

var agentConfigStore = require('../src/lib/agentConfigStore');
agentConfigStore._resetCacheForTests();

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

function closeAppServer() {
  return new Promise(function(resolve) {
    if (typeof app.closeHermesServer !== 'function') { return resolve(); }
    app.closeHermesServer(function() { resolve(); });
  });
}

function request(srv, method, urlPath, body) {
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
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
        try { parsed = JSON.parse(text); } catch (_) { parsed = text; }
        resolve({ status: res.statusCode, body: parsed, text: text });
      });
    });
    req.on('error', reject);
    if (data) { req.write(data); }
    req.end();
  });
}

(async function run() {
  var srv = await startServer();
  try {
    var cfg = await request(srv, 'GET', '/api/agent/config/warren');
    ok('GET config returns 200', cfg.status === 200, cfg.text);
    ok('GET config exposes DaveTV defaults', cfg.body && cfg.body.config && cfg.body.config.assistant_name === 'DaveTV' && cfg.body.config.trigger_phrase === 'Hey DaveTV', cfg.text);
    ok('GET config honestly reports wake phrase unsupported', cfg.body && cfg.body.capability && cfg.body.capability.wake_phrase === 'unsupported' && cfg.body.capability.active_trigger === false, cfg.text);

    var patch = await request(srv, 'PATCH', '/api/agent/config/warren', {
      trigger_phrase: 'Computer Dave',
      trigger_enabled: false,
    });
    ok('PATCH config returns 200', patch.status === 200, patch.text);
    ok('PATCH config saves trigger phrase', patch.body && patch.body.config && patch.body.config.trigger_phrase === 'Computer Dave', patch.text);
    ok('PATCH config keeps active trigger false without wake support', patch.body && patch.body.capability && patch.body.capability.active_trigger === false, patch.text);

    var badPatch = await request(srv, 'PATCH', '/api/agent/config/warren', {
      wake_phrase_supported: true,
    });
    ok('PATCH rejects unsupported capability spoofing', badPatch.status === 400 && badPatch.body && badPatch.body.error === 'validation_failed', badPatch.text);

    var missingProfile = await request(srv, 'POST', '/api/agent/utterance', {
      utterance: 'Find Batman from 1989',
      input_mode: 'voice',
    });
    ok('utterance requires profile_id', missingProfile.status === 400, missingProfile.text);

    var utterance = await request(srv, 'POST', '/api/agent/utterance', {
      profile_id: 'warren',
      utterance: 'Hey DaveTV, find Batman from 1989',
      input_mode: 'voice',
      screen_state: { active_view: 'home' },
    });
    ok('utterance route returns honest blocked status', utterance.status === 501 && utterance.body && utterance.body.status === 'blocked', utterance.text);
    ok('utterance route does not fake actions or candidates', utterance.body && Array.isArray(utterance.body.actions) && utterance.body.actions.length === 0 && Array.isArray(utterance.body.candidates) && utterance.body.candidates.length === 0, utterance.text);
    ok('utterance route does not echo raw utterance', utterance.text.indexOf('Batman') === -1, utterance.text);
    ok('utterance route includes configured trigger phrase', utterance.body && utterance.body.config && utterance.body.config.trigger_phrase === 'Computer Dave', utterance.text);

    var job = await request(srv, 'GET', '/api/agent/jobs/job_test');
    ok('job route is honest blocked', job.status === 501 && job.body && job.body.error === 'agent_jobs_unavailable', job.text);

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
