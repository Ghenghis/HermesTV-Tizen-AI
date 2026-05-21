#!/usr/bin/env node
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'davetv-agent-config-'));
process.env.HERMES_AGENT_DATA_DIR = tmpDir;

var agentConfigStore = require('../src/lib/agentConfigStore');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function expectValidation(label, fn) {
  return fn().then(function(out) {
    ok(label, false, 'expected validation failure, got ' + JSON.stringify(out));
  }, function(err) {
    ok(label, err && err.code === 'VALIDATION_FAILED', err && err.message);
  });
}

(async function run() {
  var defaults = await agentConfigStore.get('warren');
  ok('default assistant is DaveTV', defaults.assistant_name === 'DaveTV', JSON.stringify(defaults));
  ok('default trigger phrase is Hey DaveTV', defaults.trigger_phrase === 'Hey DaveTV', JSON.stringify(defaults));
  ok('wake phrase is honestly unsupported by default', defaults.wake_phrase_supported === false && defaults.trigger_mode === 'remote_button', JSON.stringify(defaults));

  var updated = await agentConfigStore.update('warren', {
    trigger_phrase: 'Yo DaveTV',
    trigger_enabled: false,
    voice_first: true,
  });
  ok('update saves custom trigger phrase', updated.trigger_phrase === 'Yo DaveTV', JSON.stringify(updated));
  ok('update can disable phrase trigger preference', updated.trigger_enabled === false, JSON.stringify(updated));
  ok('update writes updated_at', typeof updated.updated_at === 'string' && updated.updated_at.length > 0, JSON.stringify(updated));

  agentConfigStore._resetCacheForTests();
  var reloaded = await agentConfigStore.get('warren');
  ok('restart survival reloads trigger phrase', reloaded.trigger_phrase === 'Yo DaveTV', JSON.stringify(reloaded));
  ok('restart survival reloads trigger enabled', reloaded.trigger_enabled === false, JSON.stringify(reloaded));

  await expectValidation('rejects invalid profile id', function() {
    return agentConfigStore.get('../bad');
  });
  await expectValidation('rejects unsupported patch fields', function() {
    return agentConfigStore.update('warren', { wake_phrase_supported: true });
  });
  await expectValidation('rejects overlong trigger phrase', function() {
    return agentConfigStore.update('warren', { trigger_phrase: new Array(60).join('x') });
  });

  var filePath = agentConfigStore._filePathForTests();
  fs.writeFileSync(filePath, JSON.stringify({
    legacy: {
      assistant_name: 'Hermes',
      trigger_phrase: 'Hey Hermes',
      trigger_enabled: true,
      trigger_mode: 'active_listening',
      wake_phrase_supported: false,
    },
  }, null, 2));
  agentConfigStore._resetCacheForTests();
  var legacy = await agentConfigStore.get('legacy');
  ok('legacy Hermes assistant name normalizes to DaveTV', legacy.assistant_name === 'DaveTV', JSON.stringify(legacy));
  ok('legacy Hey Hermes trigger normalizes to Hey DaveTV', legacy.trigger_phrase === 'Hey DaveTV', JSON.stringify(legacy));
  ok('unsupported active listening normalizes to remote_button', legacy.trigger_mode === 'remote_button' && legacy.wake_phrase_supported === false, JSON.stringify(legacy));

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* best-effort */ }
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  process.exit(1);
});
