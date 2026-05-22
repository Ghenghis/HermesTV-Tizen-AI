#!/usr/bin/env node
'use strict';

/**
 * Proves large provider playlists do not block catalog ingest waiting for the
 * entire response body. Real xTremeHD-style M3Us can start with valid EXTINF
 * rows but keep downloading long enough that a full res.text() read times out.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-m3u-streaming-'));
process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.APOLLO_M3U_URL = 'https://provider.example.test/large.m3u';
delete process.env.XTREMEHD_M3U_URL;
delete process.env.XTREAM_URL;
delete process.env.XTREAM_USERNAME;
delete process.env.XTREAM_PASSWORD;
delete process.env.JELLYFIN_URL;
delete process.env.JELLYFIN_API_KEY;
delete process.env.IPTV_ORG_ENABLED;

var pass = 0;
var fail = 0;
function ok(label, cond, detail) {
  if (cond) {
    console.log('PASS: ' + label);
    pass += 1;
  } else {
    console.log('FAIL: ' + label + (detail ? ' — ' + detail : ''));
    fail += 1;
  }
}

var cancelCalled = false;
var textCalled = false;
var fetchCalled = 0;

function largeM3U() {
  var lines = ['#EXTM3U'];
  for (var i = 0; i < 1505; i++) {
    lines.push('#EXTINF:-1 tvg-id="stream-' + i + '" group-title="News",Stream ' + i);
    lines.push('https://streams.example.test/live/' + i + '.m3u8');
  }
  return lines.join('\n') + '\n';
}

global.fetch = function() {
  fetchCalled += 1;
  var text = largeM3U();
  return Promise.resolve({
    ok: true,
    status: 200,
    body: new ReadableStream({
      start: function(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        // Do not close. The production code must cancel once enough entries
        // are read instead of waiting forever for a full-body text read.
      },
      cancel: function() { cancelCalled = true; },
    }),
    text: function() {
      textCalled = true;
      return new Promise(function() {});
    },
  });
};

(async function run() {
  try {
    var m3uClient = require('../src/lib/m3uClient');
    m3uClient._clearCache();

    var started = Date.now();
    var items = await m3uClient.fetchCatalog({ limit: 600, waitForColdMs: 15000 });
    var elapsed = Date.now() - started;

    ok('fetch called once for configured provider', fetchCalled === 1, 'fetchCalled=' + fetchCalled);
    ok('streaming path did not call response.text()', textCalled === false, 'textCalled=' + textCalled);
    ok('reader was canceled after enough entries', cancelCalled === true, 'cancelCalled=' + cancelCalled);
    ok('catalog returned capped real items from streaming M3U', Array.isArray(items) && items.length === 600, 'items=' + (items && items.length));
    ok('streaming ingest finished quickly', elapsed < 2000, 'elapsed=' + elapsed + 'ms');
    ok('first item is mapped to provider catalog shape',
      !!(items[0] && items[0].id && items[0].id.indexOf('m3u-apollo_group-') === 0 &&
        items[0].title === 'Stream 0' &&
        items[0].providers && items[0].providers[0] &&
        items[0].providers[0].provider_id === 'apollo_group'),
      JSON.stringify(items[0]));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('');
  console.log('=== Results: ' + pass + ' PASS, ' + fail + ' FAIL ===');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err && err.stack ? err.stack : err);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
