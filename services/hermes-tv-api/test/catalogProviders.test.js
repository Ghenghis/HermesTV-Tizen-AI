#!/usr/bin/env node
'use strict';

/**
 * test/catalogProviders.test.js - Lane B provider registry to catalog/search proof.
 *
 * Proves that disk-backed providerRegistry rows, not just process.env rows,
 * populate /api/catalog and that /api/search returns playable hydrated item
 * shape with providers/sources.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-catalog-providers-'));
process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;
process.env.NODE_ENV = 'test';
process.env.PORT = '0';

[
  'APOLLO_M3U_URL',
  'XTREMEHD_M3U_URL',
  'XTREAM_URL',
  'XTREAM_USERNAME',
  'XTREAM_PASSWORD',
  'JELLYFIN_URL',
  'JELLYFIN_API_KEY',
  'IPTV_ORG_ENABLED',
].forEach(function(k) { delete process.env[k]; });

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

function mockResponse(body, isJson) {
  return {
    ok: true,
    status: 200,
    text: function() {
      return Promise.resolve(isJson ? JSON.stringify(body) : String(body));
    },
    json: function() {
      return Promise.resolve(isJson ? body : JSON.parse(String(body)));
    },
  };
}

global.fetch = function(url) {
  var s = String(url || '');
  if (s === 'https://m3u.example.test/playlist.m3u') {
    return Promise.resolve(mockResponse([
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="disk-news" tvg-name="Disk News" group-title="News",Disk News HD',
      'https://streams.example.test/live/disk-news.m3u8',
    ].join('\n'), false));
  }
  if (s.indexOf('http://xtream.example.test:8080/player_api.php') === 0) {
    if (s.indexOf('action=get_live_streams') !== -1) {
      return Promise.resolve(mockResponse([
        {
          stream_id: 101,
          name: 'Xtream News',
          category_name: 'News',
          stream_icon: '',
          epg_channel_id: 'xtream-news',
        },
      ], true));
    }
    if (s.indexOf('action=get_vod_streams') !== -1 || s.indexOf('action=get_series') !== -1) {
      return Promise.resolve(mockResponse([], true));
    }
  }
  return Promise.resolve({
    ok: false,
    status: 404,
    text: function() { return Promise.resolve('not found'); },
    json: function() { return Promise.resolve({ error: 'not_found' }); },
  });
};

function startServer(app) {
  return new Promise(function(resolve, reject) {
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, method, urlPath) {
  return new Promise(function(resolve, reject) {
    var port = srv.address().port;
    var opts = {
      host: '127.0.0.1',
      port: port,
      method: method,
      path: urlPath,
      headers: { Accept: 'application/json' },
    };
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async function run() {
  var providerStore = require('../src/lib/providerStore');
  providerStore._resetCacheForTests();

  var m3u = await providerStore.add({
    type: 'm3u',
    label: 'Disk M3U Provider',
    url: 'https://m3u.example.test/playlist.m3u',
  });
  var xtream = await providerStore.add({
    type: 'xtream',
    label: 'Disk Xtream Provider',
    url: 'http://xtream.example.test:8080',
    username: 'placeholderUser',
    password: 'placeholderPass',
  });

  var app = require('../src/index');
  var srv = await startServer(app);

  var catalog = await request(srv, 'GET', '/api/catalog');
  ok('GET /api/catalog returns 200', catalog.status === 200, 'status=' + catalog.status);
  ok('Catalog has real provider items from disk config',
    catalog.body && Array.isArray(catalog.body.catalog) && catalog.body.catalog.length >= 2,
    JSON.stringify(catalog.body && catalog.body._meta));

  var items = catalog.body.catalog;
  var m3uItem = null;
  var xtreamItem = null;
  for (var i = 0; i < items.length; i++) {
    if (items[i].id && items[i].id.indexOf('m3u-' + m3u.id + '-') === 0) { m3uItem = items[i]; }
    if (items[i].id && items[i].id.indexOf('xtream-' + xtream.id + '-live-101') === 0) { xtreamItem = items[i]; }
  }

  ok('Disk M3U provider row appears in catalog ids',
    !!m3uItem,
    JSON.stringify(items.map(function(x) { return x.id; })));
  ok('Disk M3U item carries canonical provider/source shape',
    !!(m3uItem && Array.isArray(m3uItem.providers) && m3uItem.providers[0] &&
       m3uItem.providers[0].provider_id === 'm3u-' + m3u.id &&
       Array.isArray(m3uItem.sources) && m3uItem.sources[0] &&
       m3uItem.sources[0].item_id === m3uItem.id),
    JSON.stringify(m3uItem));

  ok('Disk Xtream provider row appears in catalog ids',
    !!xtreamItem,
    JSON.stringify(items.map(function(x) { return x.id; })));
  ok('Disk Xtream item carries canonical provider/source shape',
    !!(xtreamItem && Array.isArray(xtreamItem.providers) && xtreamItem.providers[0] &&
       xtreamItem.providers[0].provider_id === 'xtream-' + xtream.id &&
       Array.isArray(xtreamItem.sources) && xtreamItem.sources[0] &&
       xtreamItem.sources[0].provider_id === 'xtream-' + xtream.id),
    JSON.stringify(xtreamItem));

  ok('Catalog meta reports provider counts',
    catalog.body && catalog.body._meta &&
      catalog.body._meta.m3u_count >= 1 &&
      catalog.body._meta.xtream_count >= 1,
    JSON.stringify(catalog.body && catalog.body._meta));

  var search = await request(srv, 'GET', '/api/search?q=News');
  ok('GET /api/search returns 200', search.status === 200, 'status=' + search.status);
  ok('Search returns hydrated playable item shape',
    search.body && Array.isArray(search.body.results) &&
      search.body.results.some(function(item) {
        return item && item.id === m3uItem.id &&
          Array.isArray(item.providers) &&
          Array.isArray(item.sources) &&
          item.preferred_source &&
          item.preferred_source.item_id === item.id;
      }),
    JSON.stringify(search.body));

  srv.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err && err.stack ? err.stack : err);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
