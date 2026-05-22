#!/usr/bin/env node
'use strict';

/**
 * test/playlistProviderPersistence.test.js — provider-save truth contract.
 *
 * The playlist import wizard must never tell the user "saved" unless a
 * durable providerStore row was written and can be found through /api/providers.
 * This test uses placeholder endpoints/credentials only.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var express = require('express');

process.env.NODE_ENV = 'test';
process.env.APOLLO_M3U_URL = '';
process.env.XTREMEHD_M3U_URL = '';
process.env.XTREAM_URL = '';
process.env.XTREAM_USERNAME = '';
process.env.XTREAM_PASSWORD = '';
process.env.JELLYFIN_URL = '';
process.env.JELLYFIN_API_KEY = '';
process.env.IPTV_ORG_ENABLED = 'false';

var route = require('../src/routes/playlists');
var providerStore = require('../src/lib/providerStore');
var providerRegistry = require('../src/lib/providerRegistry');

var pass = 0;
var fail = 0;
var originalFetch = global.fetch;
var tempRoots = [];

var SAMPLE_M3U = [
  '#EXTM3U',
  '#EXTINF:-1 tvg-id="one" group-title="News",One News',
  'https://stream.example.test/live/one.m3u8',
  '#EXTINF:-1 tvg-id="two" group-title="Sports",Two Sports',
  'https://stream.example.test/live/two.m3u8',
].join('\n');

function ok(label, cond, detail) {
  if (cond) { console.log('PASS:', label); pass++; }
  else { console.log('FAIL:', label, detail || ''); fail++; }
}

function makeTempDir(prefix) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(dir);
  return dir;
}

function resetStore(dataDir) {
  process.env.HERMES_PROVIDER_DATA_DIR = dataDir;
  providerStore._resetCacheForTests();
  route._internal._clear();
}

function appForRoute() {
  var app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(route);
  return app;
}

function startServer(app) {
  return new Promise(function(resolve, reject) {
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, method, urlPath, body) {
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : '';
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
        try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
        resolve({ status: res.statusCode, text: text, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) { req.write(data); }
    req.end();
  });
}

function installFetchStub() {
  global.fetch = function(url) {
    var u = String(url || '');
    if (u.indexOf('get.php') !== -1 || u.indexOf('playlist.m3u') !== -1) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function() { return Promise.resolve(SAMPLE_M3U); },
        json: function() { return Promise.resolve([]); },
      });
    }
    if (u.indexOf('player_api.php') !== -1) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: function() { return Promise.resolve('[]'); },
        json: function() { return Promise.resolve([]); },
      });
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      text: function() { return Promise.resolve(''); },
      json: function() { return Promise.resolve({}); },
    });
  };
}

(async function run() {
  installFetchStub();
  var srv = await startServer(appForRoute());
  try {
    var goodDir = makeTempDir('hermes-playlist-persist-');
    resetStore(goodDir);

    var urlSave = await request(srv, 'POST', '/api/playlists/save', {
      name: 'xTremeHD',
      provider_id: 'xtremehd',
      source: { type: 'url', url: 'https://provider.example.test/playlist.m3u' },
    });
    ok('URL playlist save returns 200', urlSave.status === 200, 'status=' + urlSave.status + ' body=' + urlSave.text);
    ok('URL playlist save returns durable provider id',
      urlSave.body && /^prov-[a-f0-9]{8}$/.test(urlSave.body.persisted_provider_id || ''),
      urlSave.text);

    providerStore._resetCacheForTests();
    var registryRows = await providerRegistry.list();
    var urlRow = registryRows.filter(function(r) { return r.id === urlSave.body.persisted_provider_id; })[0];
    ok('saved URL provider is visible through provider registry',
      urlRow && urlRow.provider_id === 'xtremehd' && urlRow.source === 'config' && urlRow.url_host === 'provider.example.test',
      JSON.stringify(registryRows.map(function(r) { return { id: r.id, provider_id: r.provider_id, source: r.source, url_host: r.url_host }; })));

    route._internal._clear();
    providerStore._resetCacheForTests();
    var listAfterRestart = await request(srv, 'GET', '/api/playlists');
    var listedUrl = listAfterRestart.body && Array.isArray(listAfterRestart.body.playlists)
      ? listAfterRestart.body.playlists.filter(function(p) { return p.id === urlSave.body.persisted_provider_id; })[0]
      : null;
    ok('GET /api/playlists reads durable provider rows after route memory reset',
      listAfterRestart.status === 200 &&
        listAfterRestart.body.source === 'providerStore' &&
        listedUrl &&
        listedUrl.persisted_provider_id === urlSave.body.persisted_provider_id &&
        listedUrl.name === 'xTremeHD',
      'status=' + listAfterRestart.status + ' body=' + listAfterRestart.text);

    var xtreamSave = await request(srv, 'POST', '/api/playlists/save', {
      name: 'ApolloGroup',
      provider_id: 'apollo_group',
      source: {
        type: 'xtream',
        host: 'http://panel.example.test:8080',
        username: 'TEST_USER',
        password: 'TEST_PASS',
      },
    });
    ok('Xtream playlist save returns 200', xtreamSave.status === 200, 'status=' + xtreamSave.status + ' body=' + xtreamSave.text);
    ok('Xtream save response does not leak username/password',
      xtreamSave.text.indexOf('TEST_USER') === -1 && xtreamSave.text.indexOf('TEST_PASS') === -1,
      xtreamSave.text);

    providerStore._resetCacheForTests();
    registryRows = await providerRegistry.list();
    var xtreamRow = registryRows.filter(function(r) { return r.id === xtreamSave.body.persisted_provider_id; })[0];
    ok('saved Xtream provider keeps selected canonical provider id',
      xtreamRow && xtreamRow.provider_id === 'apollo_group' && xtreamRow.type === 'xtream' && xtreamRow.has_username && xtreamRow.has_password,
      JSON.stringify(registryRows.map(function(r) { return { id: r.id, provider_id: r.provider_id, type: r.type }; })));

    var deleteUrl = await request(srv, 'DELETE', '/api/playlists/' + encodeURIComponent(urlSave.body.persisted_provider_id));
    ok('DELETE /api/playlists/:persisted_provider_id removes durable provider row',
      deleteUrl.status === 200 &&
        deleteUrl.body &&
        deleteUrl.body.deleted === true &&
        deleteUrl.body.persisted_provider_id === urlSave.body.persisted_provider_id,
      'status=' + deleteUrl.status + ' body=' + deleteUrl.text);
    providerStore._resetCacheForTests();
    registryRows = await providerRegistry.list();
    var deletedUrlRow = registryRows.filter(function(r) { return r.id === urlSave.body.persisted_provider_id; })[0];
    ok('deleted playlist provider no longer appears in provider registry',
      !deletedUrlRow,
      JSON.stringify(registryRows.map(function(r) { return { id: r.id, provider_id: r.provider_id, type: r.type }; })));

    var fileSave = await request(srv, 'POST', '/api/playlists/save', {
      name: 'Local file',
      provider_id: 'custom',
      source: { type: 'file', text: SAMPLE_M3U },
    });
    ok('file playlist save is rejected because it is not durable',
      fileSave.status === 501 && fileSave.body && fileSave.body.error === 'not_durable',
      'status=' + fileSave.status + ' body=' + fileSave.text);

    var badRoot = makeTempDir('hermes-playlist-baddir-');
    var badPath = path.join(badRoot, 'not-a-directory');
    fs.writeFileSync(badPath, 'occupied', 'utf8');
    resetStore(badPath);
    var failedSave = await request(srv, 'POST', '/api/playlists/save', {
      name: 'Cannot Persist',
      provider_id: 'xtremehd',
      source: { type: 'url', url: 'https://provider.example.test/playlist.m3u' },
    });
    ok('save fails when providerStore cannot write durable row',
      failedSave.status === 500 && failedSave.body && failedSave.body.error === 'provider_persist_failed',
      'status=' + failedSave.status + ' body=' + failedSave.text);

    console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  } finally {
    await new Promise(function(resolve) { srv.close(function() { resolve(); }); });
    global.fetch = originalFetch;
    for (var i = 0; i < tempRoots.length; i++) {
      try { fs.rmSync(tempRoots[i], { recursive: true, force: true }); } catch (_) { /* best-effort */ }
    }
  }
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err);
  global.fetch = originalFetch;
  process.exit(1);
});
