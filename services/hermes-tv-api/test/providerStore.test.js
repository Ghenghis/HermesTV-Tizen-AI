#!/usr/bin/env node
'use strict';

/**
 * test/providerStore.test.js — wave-20 multi-provider persistence.
 *
 * Asserts:
 *   1. Empty list returned when no file exists yet.
 *   2. add() persists a row, returns masked shape (no username/password).
 *   3. list() returns masked rows.
 *   4. listFull() returns the full row (server-internal contract).
 *   5. update() applies partial patch, leaves untouched fields intact.
 *   6. remove() deletes by id, returns false for unknown id.
 *   7. setEnabled() flips the boolean.
 *   8. recordTest(ok) sets last_test, clears last_error.
 *   9. recordTest(false, msg) sets last_error.
 *  10. Validation: missing type / bad url / over-long label / xtream
 *      without username/password all rejected with VALIDATION_FAILED.
 *  11. File-backed: two sequential require()s + reset return persisted rows.
 *
 * Test fixtures NEVER reference real credentials. Placeholder shapes only.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');

// Sandbox dir so we don't touch the real data/ folder.
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-providers-'));
process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;

var providerStore = require('../src/lib/providerStore');

var pass = 0;
var fail = 0;

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function expectThrows(label, fn) {
  return fn().then(function(out) {
    ok(label, false, 'expected throw, got ' + JSON.stringify(out));
  }, function(err) {
    ok(label, err && err.code === 'VALIDATION_FAILED', 'wrong code: ' + (err && err.code));
  });
}

(async function run() {
  // ---------------------------------------------------------------------------
  // 1. Empty list
  // ---------------------------------------------------------------------------
  var empty = await providerStore.list();
  ok('list() returns [] when no file exists', Array.isArray(empty) && empty.length === 0);

  // ---------------------------------------------------------------------------
  // 2. add() — M3U provider with placeholder URL
  // ---------------------------------------------------------------------------
  var added = await providerStore.add({
    type: 'm3u',
    label: 'Test Playlist',
    url: 'https://example.com/playlist.m3u',
  });
  ok('add() returns masked row with id', added && /^prov-[a-f0-9]{8}$/.test(added.id), JSON.stringify(added));
  ok('add() masked row carries url_host', added && added.url_host === 'example.com', JSON.stringify(added));
  ok('add() masked row never includes username', !('username' in added) && added.has_username === false);
  ok('add() masked row never includes password', !('password' in added) && added.has_password === false);

  // ---------------------------------------------------------------------------
  // 3-4. list() vs listFull()
  // ---------------------------------------------------------------------------
  var listed = await providerStore.list();
  ok('list() returns the added row', listed.length === 1 && listed[0].id === added.id);
  ok('list() row is masked (no username field)', !('username' in listed[0]) && !('password' in listed[0]));

  var full = await providerStore.listFull();
  ok('listFull() returns the same row', full.length === 1 && full[0].id === added.id);
  ok('listFull() row carries the raw url', full[0].url === 'https://example.com/playlist.m3u');

  // ---------------------------------------------------------------------------
  // 5. update() — partial patch
  // ---------------------------------------------------------------------------
  var updated = await providerStore.update(added.id, { label: 'Renamed Playlist' });
  ok('update() returns masked row', updated && updated.id === added.id);
  ok('update() applied the label', updated.label === 'Renamed Playlist');
  var afterUpdate = await providerStore.listFull();
  ok('update() preserved the url', afterUpdate[0].url === 'https://example.com/playlist.m3u');

  // ---------------------------------------------------------------------------
  // 6. remove()
  // ---------------------------------------------------------------------------
  var removed = await providerStore.remove(added.id);
  ok('remove() returns true for existing id', removed === true);
  var removedAgain = await providerStore.remove(added.id);
  ok('remove() returns false for unknown id', removedAgain === false);
  var emptied = await providerStore.list();
  ok('list() is empty after remove', emptied.length === 0);

  // ---------------------------------------------------------------------------
  // 7. setEnabled()
  // ---------------------------------------------------------------------------
  var x1 = await providerStore.add({
    type: 'xtream',
    provider_id: 'xtremehd',
    label: 'Test Xtream',
    url: 'http://panel.example:8080',
    username: 'placeholderUser',
    password: 'placeholderPass',
  });
  ok('add xtream returns has_username=true', x1.has_username === true);
  ok('add xtream returns has_password=true', x1.has_password === true);

  var disabled = await providerStore.setEnabled(x1.id, false);
  ok('setEnabled(false) flips enabled', disabled && disabled.enabled === false);
  var enabled = await providerStore.setEnabled(x1.id, true);
  ok('setEnabled(true) flips enabled back', enabled && enabled.enabled === true);

  // ---------------------------------------------------------------------------
  // 8-9. recordTest()
  // ---------------------------------------------------------------------------
  var tested = await providerStore.recordTest(x1.id, true);
  ok('recordTest(ok) sets last_test', tested && typeof tested.last_test === 'string' && tested.last_test.length > 0);
  ok('recordTest(ok) clears last_error', tested.last_error === null);

  var testedFail = await providerStore.recordTest(x1.id, false, 'HTTP 401');
  ok('recordTest(false) sets last_error', testedFail && testedFail.last_error === 'HTTP 401');
  var taggedFull = await providerStore.listFull();
  ok('listFull() preserves canonical provider_id',
    taggedFull.length === 1 && taggedFull[0].provider_id === 'xtremehd',
    JSON.stringify(taggedFull.map(function(r) { return { id: r.id, provider_id: r.provider_id }; })));

  // ---------------------------------------------------------------------------
  // 10. Validation
  // ---------------------------------------------------------------------------
  await expectThrows('add() rejects missing type', function() {
    return providerStore.add({ label: 'No type', url: 'https://example.com/p.m3u' });
  });
  await expectThrows('add() rejects bad url protocol', function() {
    return providerStore.add({ type: 'm3u', label: 'Bad', url: 'ftp://nope/' });
  });
  await expectThrows('add() rejects xtream without username', function() {
    return providerStore.add({ type: 'xtream', label: 'X', url: 'http://panel.example:8080' });
  });
  await expectThrows('add() rejects empty label', function() {
    return providerStore.add({ type: 'm3u', label: '', url: 'https://example.com/p.m3u' });
  });
  await expectThrows('add() rejects label > 80 chars', function() {
    var longLabel = '';
    for (var i = 0; i < 100; i++) { longLabel += 'a'; }
    return providerStore.add({ type: 'm3u', label: longLabel, url: 'https://example.com/p.m3u' });
  });

  // ---------------------------------------------------------------------------
  // 11. File-backed persistence — clear in-memory cache, re-read from disk.
  // ---------------------------------------------------------------------------
  providerStore._resetCacheForTests();
  var reloaded = await providerStore.list();
  ok('list() repopulates after cache reset', reloaded.length === 1 && reloaded[0].id === x1.id);

  // ---------------------------------------------------------------------------
  // 12. File on disk: ensure providers.json is readable and contains JSON.
  // ---------------------------------------------------------------------------
  var filePath = path.join(tmpDir, 'providers.json');
  var fileText = fs.readFileSync(filePath, 'utf8');
  var fileParsed = JSON.parse(fileText);
  ok('providers.json is valid JSON', Array.isArray(fileParsed) && fileParsed.length === 1);
  ok('providers.json contains the persisted row', fileParsed[0].id === x1.id);

  // ---------------------------------------------------------------------------
  // Tally
  // ---------------------------------------------------------------------------
  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');

  // Cleanup temp dir.
  try {
    fs.unlinkSync(filePath);
    fs.rmdirSync(tmpDir);
  } catch (_) { /* best-effort */ }

  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
