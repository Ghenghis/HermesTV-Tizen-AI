#!/usr/bin/env node
'use strict';

/**
 * Family profile proof.
 *
 * Provider rows are household-wide by default. A family profile such as
 * "warren" must see the same real provider catalog/channels/search results
 * unless an item explicitly carries a profile_access allow-list.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-family-profile-'));
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
  if (s === 'https://family.example.test/playlist.m3u') {
    return Promise.resolve(mockResponse([
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="family-news" tvg-name="Family News" group-title="News",Family News HD',
      'https://streams.example.test/live/family-news.m3u8',
    ].join('\n'), false));
  }
  if (s.indexOf('http://family-xtream.example.test:8080/player_api.php') === 0) {
    if (s.indexOf('action=get_live_streams') !== -1) {
      return Promise.resolve(mockResponse([
        {
          stream_id: 9101,
          name: 'Family Xtream News',
          category_name: 'News',
          stream_icon: '',
          epg_channel_id: 'family.xtream.news',
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

function request(srv, method, urlPath, body) {
  return new Promise(function(resolve, reject) {
    var payload = body ? JSON.stringify(body) : '';
    var opts = {
      host: '127.0.0.1',
      port: srv.address().port,
      method: method,
      path: urlPath,
      headers: { Accept: 'application/json' },
    };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var text = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers, text: text });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

(async function run() {
  var providerStore = require('../src/lib/providerStore');
  providerStore._resetCacheForTests();

  var app = require('../src/index');
  var srv = await startServer(app);

  try {
    var m3u = await providerStore.add({
      type: 'm3u',
      label: 'Family M3U Provider',
      url: 'https://family.example.test/playlist.m3u',
    });
    var xtream = await providerStore.add({
      type: 'xtream',
      label: 'Family Xtream Provider',
      url: 'http://family-xtream.example.test:8080',
      username: 'familydemo',
      password: 'familydemo',
    });

    var catalog = await request(srv, 'GET', '/api/catalog?profile_id=warren');
    ok('Catalog accepts a family profile id',
      catalog.status === 200,
      catalog.text);
    ok('Family profile sees real provider catalog items',
      catalog.body && Array.isArray(catalog.body.catalog) &&
        catalog.body.catalog.some(function(it) { return it.id && it.id.indexOf('m3u-' + m3u.id + '-') === 0; }) &&
        catalog.body.catalog.some(function(it) { return it.id === 'xtream-' + xtream.id + '-live-9101'; }),
      JSON.stringify(catalog.body && catalog.body._meta));
    ok('Provider items are not stamped with Dave/Sherri-only profile_access',
      catalog.body && Array.isArray(catalog.body.catalog) &&
        catalog.body.catalog.every(function(it) { return !Array.isArray(it.profile_access); }),
      JSON.stringify(catalog.body && catalog.body.catalog));

    var firstPlayable = catalog.body.catalog.filter(function(it) {
      return it && it.id && it.id.indexOf('m3u-' + m3u.id + '-') === 0;
    })[0];
    var play = await request(srv, 'POST', '/api/play', {
      item_id: firstPlayable && firstPlayable.id,
      profile_id: 'warren',
    });
    ok('Playback ticket accepts a family profile id',
      play.status === 200 && play.body && play.body.ticket && play.body.profile_id === 'warren',
      play.text);

    var search = await request(srv, 'GET', '/api/search?q=News&profile_id=warren');
    ok('Search accepts a family profile id',
      search.status === 200,
      search.text);
    ok('Family profile search returns real provider matches',
      search.body && Array.isArray(search.body.results) &&
        search.body.results.some(function(it) { return it.title === 'Family News HD'; }) &&
        search.body.results.some(function(it) { return it.title === 'Family Xtream News'; }),
      JSON.stringify(search.body));

    var uiCommand = await request(srv, 'POST', '/api/ui-command/validate', {
      command_text: 'show movies',
      profile_id: 'warren',
    });
    ok('Voice/chat command validation accepts a family profile id',
      uiCommand.status === 200 && uiCommand.body && uiCommand.body.valid === true,
      uiCommand.text);

    var commandEnvelope = await request(srv, 'POST', '/api/commands', {
      schema: 'hermestv.ui.v1',
      command_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      action: 'show_notification',
      target: { profile_id: 'warren' },
      params: { message: 'Family profile proof' },
      dry_run: true,
    });
    ok('Command envelope accepts a family profile id',
      commandEnvelope.status === 200 && commandEnvelope.body && commandEnvelope.body.accepted === true,
      commandEnvelope.text);

    var health = await request(srv, 'GET', '/api/source-health');
    var healthProviders = health.body && Array.isArray(health.body.providers) ? health.body.providers : [];
    var xtreamHealth = healthProviders.filter(function(p) { return p && p.id === 'xtream'; })[0];
    ok('Source health includes Xtream disk-provider counts',
      health.status === 200 && xtreamHealth && xtreamHealth.items_live >= 1,
      health.text);

    var channels = await request(srv, 'GET', '/api/channels?profile_id=warren');
    ok('Channels accepts a family profile id',
      channels.status === 200,
      channels.text);
    ok('Family profile sees real provider channels',
      channels.body && Array.isArray(channels.body.channels) &&
        channels.body.channels.some(function(ch) { return ch.channel_id && ch.channel_id.indexOf('m3u-' + m3u.id + '-') === 0; }) &&
        channels.body.channels.some(function(ch) { return ch.channel_id === 'xtream-' + xtream.id + '-live-9101'; }),
      JSON.stringify(channels.body));

    var invalid = await request(srv, 'GET', '/api/catalog?profile_id=warren%20bad');
    ok('Catalog rejects unsafe profile ids',
      invalid.status === 400 && invalid.body && invalid.body.error === 'validation_failed',
      invalid.text);

    console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  } finally {
    await new Promise(function(resolve) { srv.close(function() { resolve(); }); });
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }

  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error(err && err.stack ? err.stack : err);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
