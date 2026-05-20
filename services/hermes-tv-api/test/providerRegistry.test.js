'use strict';

/**
 * test/providerRegistry.test.js — Lane A provider truth proof.
 *
 * Per docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md:
 *   "A saved provider survives process restart."
 *   "/api/providers returns real provider state, not a hard-coded list."
 *   "No secret value is returned by any endpoint."
 *
 * This test must FAIL if any of the following regress:
 *   1. providerStore.add() does not write to disk (in-memory only)
 *   2. providerRegistry.list() returns a static array
 *   3. masked response shape leaks username / password / api_key / raw URL
 *   4. env-derived providers cannot be enumerated alongside disk providers
 *
 * The test uses a temp directory for the disk file via HERMES_PROVIDER_DATA_DIR
 * so it never touches production data.
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var os = require('os');

var totalPass = 0;
var totalFail = 0;
function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) { console.log('FAIL: ' + label + (detail ? ' — ' + detail : '')); totalFail += 1; }

async function run() {
  // ---- Set up a clean temp data dir + env scope ------------------------
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-truth-'));
  process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;

  // Clear any env-derived providers so the test's assertions about disk
  // rows aren't muddied. We re-set them later for the env-discovery check.
  var savedEnv = {};
  ['APOLLO_M3U_URL', 'XTREMEHD_M3U_URL', 'XTREAM_URL', 'XTREAM_USERNAME',
   'XTREAM_PASSWORD', 'JELLYFIN_URL', 'JELLYFIN_API_KEY', 'IPTV_ORG_ENABLED'].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });

  // Fresh require so module-scope caches see the new env.
  var registryPath = path.resolve(__dirname, '..', 'src', 'lib', 'providerRegistry.js');
  var storePath = path.resolve(__dirname, '..', 'src', 'lib', 'providerStore.js');
  delete require.cache[registryPath];
  delete require.cache[storePath];
  var providerRegistry = require(registryPath);
  var providerStore = require(storePath);
  providerStore._resetCacheForTests();
  providerRegistry._resetForTests();

  // ---- 1. Empty state contract -----------------------------------------
  var initialList = await providerRegistry.list();
  if (Array.isArray(initialList) && initialList.length === 0) {
    pass('Empty state — providerRegistry.list() returns [] with no env + no disk providers');
  } else {
    fail('Empty state expected []', 'got ' + JSON.stringify(initialList).slice(0, 200));
  }

  // ---- 2. Add via providerStore.add directly (simulates setup/playlists/pairing) ----
  var added = await providerStore.add({
    type: 'xtream',
    label: 'Provider Truth Test',
    url: 'https://panel.example.test:8080',
    username: 'PLACEHOLDER_USER',
    password: 'PLACEHOLDER_PASS',
  });
  if (added && added.id && /^prov-[a-f0-9]+$/.test(added.id)) {
    pass('providerStore.add() returns masked row with prov-<hex> id');
  } else {
    fail('providerStore.add() id shape', JSON.stringify(added));
  }
  if (added.has_username === true && added.has_password === true &&
      added.username === undefined && added.password === undefined) {
    pass('Masked row exposes has_username / has_password but never the values');
  } else {
    fail('Masked row leaked username / password', JSON.stringify(added));
  }
  if (added.url_host === 'panel.example.test:8080') {
    pass('Masked row carries url_host only, not the full URL');
  } else {
    fail('url_host shape', JSON.stringify(added.url_host));
  }

  // ---- 3. providerRegistry.list shows the added row ---------------------
  providerStore._resetCacheForTests();   // force re-read from disk
  providerRegistry._resetForTests();
  var listAfterAdd = await providerRegistry.list();
  if (listAfterAdd.length === 1 && listAfterAdd[0].id === added.id) {
    pass('providerRegistry.list() reflects the new disk row');
  } else {
    fail('list after add', 'expected 1 row with id ' + added.id + ', got ' + JSON.stringify(listAfterAdd));
  }
  if (listAfterAdd[0].source === 'config') {
    pass('Disk-stored providers carry source: "config"');
  } else {
    fail('source field', JSON.stringify(listAfterAdd[0].source));
  }

  // ---- 4. RESTART SURVIVAL PROOF ----------------------------------------
  // Simulate process restart by:
  //   (a) clearing the module cache so providerRegistry + providerStore are
  //       re-required from scratch with EMPTY in-memory caches
  //   (b) keeping the temp dir + providers.json on disk
  delete require.cache[registryPath];
  delete require.cache[storePath];
  var registry2 = require(registryPath);
  var store2 = require(storePath);
  store2._resetCacheForTests();
  registry2._resetForTests();

  var listAfterRestart = await registry2.list();
  if (listAfterRestart.length === 1 && listAfterRestart[0].id === added.id) {
    pass('RESTART SURVIVAL — disk row persists across simulated restart');
  } else {
    fail('Restart survival', 'expected the same row after re-require, got ' + JSON.stringify(listAfterRestart));
  }

  // Verify the on-disk file actually exists + is JSON
  var diskFile = path.join(tmpDir, 'providers.json');
  if (fs.existsSync(diskFile)) {
    var raw = fs.readFileSync(diskFile, 'utf8');
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (Array.isArray(parsed) && parsed.length === 1 && parsed[0].id === added.id) {
      pass('Disk file at HERMES_PROVIDER_DATA_DIR/providers.json contains the row');
    } else {
      fail('Disk file content', 'expected 1 row, got ' + raw.slice(0, 200));
    }
    // The disk file IS allowed to contain plaintext credentials — it's on
    // the operator's VPS volume with 0600 perms. The contract only forbids
    // credentials in HTTP RESPONSES, not in operator-controlled disk files.
    if (raw.indexOf('PLACEHOLDER_USER') !== -1 && raw.indexOf('PLACEHOLDER_PASS') !== -1) {
      pass('Disk file persists full credentials for ingest (HTTP responses are masked)');
    } else {
      fail('Disk file should contain full creds for ingest', raw.slice(0, 200));
    }
  } else {
    fail('Disk file presence', diskFile + ' not found');
  }

  // ---- 5. No-leak check on masked list ----------------------------------
  var json = JSON.stringify(listAfterRestart);
  if (json.indexOf('PLACEHOLDER_USER') === -1 && json.indexOf('PLACEHOLDER_PASS') === -1) {
    pass('Masked HTTP response shape contains zero credential bytes');
  } else {
    fail('Masked response leaked a credential', json.slice(0, 200));
  }

  // ---- 6. Env discovery — set APOLLO_M3U_URL and assert it appears -----
  process.env.APOLLO_M3U_URL = 'https://placeholder.example/playlist.m3u';
  delete require.cache[registryPath];
  delete require.cache[storePath];
  var registry3 = require(registryPath);
  var store3 = require(storePath);
  store3._resetCacheForTests();
  registry3._resetForTests();
  var listWithEnv = await registry3.list();
  var apolloRow = null;
  for (var i = 0; i < listWithEnv.length; i++) {
    if (listWithEnv[i].id === 'env-apollo_group') { apolloRow = listWithEnv[i]; break; }
  }
  if (apolloRow && apolloRow.source === 'env' && apolloRow.type === 'm3u') {
    pass('Env-derived row appears in registry.list() when APOLLO_M3U_URL is set');
  } else {
    fail('Env-derived row not found', JSON.stringify(listWithEnv));
  }
  if (apolloRow && apolloRow.url_host === 'placeholder.example') {
    pass('Env-derived row masks its URL to host only');
  } else {
    fail('Env row url_host', apolloRow ? apolloRow.url_host : 'no row');
  }

  // ---- 7. Env providers cannot be deleted via registry.remove -----------
  var caughtEnv = null;
  try {
    await registry3.remove('env-apollo_group');
  } catch (e) {
    caughtEnv = e;
  }
  if (caughtEnv && caughtEnv.code === 'ENV_PROVIDER_READONLY') {
    pass('Env-derived providers reject delete (ENV_PROVIDER_READONLY)');
  } else {
    fail('Env delete should reject', String(caughtEnv));
  }

  // ---- 8. Disk providers CAN be removed --------------------------------
  var removed = await store3.remove(added.id);
  if (removed === true) {
    pass('Disk-stored provider can be removed via providerStore.remove()');
  } else {
    fail('Disk remove result', String(removed));
  }
  var listAfterRemove = await registry3.list();
  var stillHas = false;
  for (var j = 0; j < listAfterRemove.length; j++) {
    if (listAfterRemove[j].id === added.id) { stillHas = true; break; }
  }
  if (!stillHas) {
    pass('Removed disk row no longer appears in registry.list()');
  } else {
    fail('Removed row still present', JSON.stringify(listAfterRemove));
  }

  // ---- Restore env + clean up ------------------------------------------
  ['APOLLO_M3U_URL', 'XTREMEHD_M3U_URL', 'XTREAM_URL', 'XTREAM_USERNAME',
   'XTREAM_PASSWORD', 'JELLYFIN_URL', 'JELLYFIN_API_KEY', 'IPTV_ORG_ENABLED'].forEach(function(k) {
    if (savedEnv[k] === undefined) { delete process.env[k]; } else { process.env[k] = savedEnv[k]; }
  });
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* best-effort cleanup */ }

  // ---- Final tally -----------------------------------------------------
  console.log('');
  console.log('=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  if (totalFail > 0) { process.exit(1); }
  process.exit(0);
}

run().catch(function(err) {
  console.error('Test harness errored:', err && err.stack ? err.stack : err);
  process.exit(2);
});
