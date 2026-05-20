#!/usr/bin/env node
'use strict';

/**
 * test/epgProviderSources.test.js - providerRegistry EPG source proof.
 *
 * Proves /api/epg and /api/epg/grid can load XMLTV from disk-backed provider
 * rows without process.env.XMLTV_URL:
 *   - m3u provider epg_url
 *   - xtream provider default /xmltv.php?username=...&password=...
 */

var express = require('express');
var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

process.env.NODE_ENV = 'test';

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

function startServer(handler) {
  return new Promise(function(resolve, reject) {
    var srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function startExpress(app) {
  return new Promise(function(resolve, reject) {
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, urlPath) {
  return new Promise(function(resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: srv.address().port,
      method: 'GET',
      path: urlPath,
      headers: { Accept: 'application/json' },
    }, function(res) {
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

function closeServer(srv) {
  return new Promise(function(resolve) {
    if (!srv) { resolve(); return; }
    srv.close(function() { resolve(); });
  });
}

function xmltvDoc(id, name, title) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv>',
    '  <channel id="' + id + '"><display-name>' + name + '</display-name></channel>',
    '  <programme channel="' + id + '" start="20260520100000 +0000" stop="20260520110000 +0000">',
    '    <title>' + title + '</title>',
    '    <desc>Provider-backed XMLTV</desc>',
    '  </programme>',
    '</tv>'
  ].join('\n');
}

(async function run() {
  var savedEnv = {};
  ['XMLTV_URL', 'HERMES_PROVIDER_DATA_DIR', 'APOLLO_M3U_URL', 'XTREMEHD_M3U_URL',
   'XTREAM_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD', 'JELLYFIN_URL',
   'JELLYFIN_API_KEY', 'IPTV_ORG_ENABLED'].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });

  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epg-provider-sources-'));
  process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;

  var seen = { guide: 0, xtream: 0, xtreamQuery: '' };
  var upstream = await startServer(function(req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml');
    if (req.url.indexOf('/xmltv.php') === 0) {
      seen.xtream += 1;
      seen.xtreamQuery = req.url;
      res.end(xmltvDoc('xtream-news', 'Xtream News', 'Xtream Provider Hour'));
      return;
    }
    seen.guide += 1;
    res.end(xmltvDoc('disk-news', 'Disk News', 'Disk Provider Hour'));
  });

  var storePath = path.resolve(__dirname, '..', 'src', 'lib', 'providerStore.js');
  var registryPath = path.resolve(__dirname, '..', 'src', 'lib', 'providerRegistry.js');
  delete require.cache[storePath];
  delete require.cache[registryPath];
  var providerStore = require(storePath);
  var providerRegistry = require(registryPath);
  var xmltv = require('../src/integrations/xmltv');
  var catalogMerge = require('../src/lib/catalogMerge');
  providerStore._resetCacheForTests();
  providerRegistry._resetForTests();
  xmltv._internal._clearCache();

  var m3u = await providerStore.add({
    type: 'm3u',
    label: 'Disk M3U EPG',
    url: 'http://127.0.0.1:' + upstream.address().port + '/playlist.m3u',
    epg_url: 'http://127.0.0.1:' + upstream.address().port + '/guide.xml?token=secret'
  });
  catalogMerge.setLastMerged([{
    id: 'm3u-' + m3u.id + '-disk-news',
    type: 'live',
    title: 'Disk News',
    provider: 'm3u-' + m3u.id,
    metadata: { tvg_id: 'disk-news' },
    providers: [{ provider_id: 'm3u-' + m3u.id, source_id: 'disk-news' }],
    sources: [{ provider_id: 'm3u-' + m3u.id, item_id: 'm3u-' + m3u.id + '-disk-news', source_id: 'disk-news' }]
  }]);

  var epgRouter = require(path.resolve(__dirname, '..', 'src', 'routes', 'epg.js'));
  var app1 = express();
  app1.use('/', epgRouter);
  var srv1 = await startExpress(app1);
  var epgRes = await request(srv1, '/api/epg?start=2026-05-20T10%3A00%3A00.000Z&hours=2');
  var channelRes = await request(srv1, '/api/epg/' + encodeURIComponent('m3u-' + m3u.id + '-disk-news') + '?start=2026-05-20T10%3A00%3A00.000Z&hours=2');
  await closeServer(srv1);

  var epgRows = epgRes.body && Array.isArray(epgRes.body.programs) ? epgRes.body.programs : [];
  ok('/api/epg returns 200 with no XMLTV_URL', epgRes.status === 200, 'status=' + epgRes.status);
  ok('/api/epg fetched disk provider epg_url', seen.guide === 1, 'seen.guide=' + seen.guide);
  ok('/api/epg maps disk XMLTV only through current catalog item',
    epgRows.length === 1 &&
      epgRows[0].title === 'Disk Provider Hour' &&
      epgRows[0].channel_id === 'm3u-' + m3u.id + '-disk-news' &&
      epgRows[0].channel_id.indexOf('live.') !== 0,
    JSON.stringify(epgRows));
  ok('/api/epg response does not leak XMLTV token',
    JSON.stringify(epgRes.body).indexOf('secret') === -1,
    JSON.stringify(epgRes.body && epgRes.body._meta));
  var channelRows = channelRes.body && Array.isArray(channelRes.body.programs) ? channelRes.body.programs : [];
  ok('/api/epg/:channelId returns real provider-backed rows',
    channelRes.status === 200 &&
      channelRows.length === 1 &&
      channelRows[0].title === 'Disk Provider Hour' &&
      channelRows[0].channel_id === 'm3u-' + m3u.id + '-disk-news' &&
      channelRes.body._meta &&
      channelRes.body._meta.source === 'xmltv-merged',
    JSON.stringify(channelRes.body));

  await providerStore.remove(m3u.id);
  providerStore._resetCacheForTests();
  providerRegistry._resetForTests();
  xmltv._internal._clearCache();

  var xt = await providerStore.add({
    type: 'xtream',
    label: 'Disk Xtream EPG',
    url: 'http://127.0.0.1:' + upstream.address().port,
    username: 'PLACEHOLDER_USER',
    password: 'PLACEHOLDER_PASS'
  });
  catalogMerge.setLastMerged([{
    id: 'xtream-' + xt.id + '-live-101',
    type: 'live',
    title: 'Xtream News',
    provider: 'xtream-' + xt.id,
    metadata: { tvg_id: 'xtream-news' },
    providers: [{ provider_id: 'xtream-' + xt.id, source_id: '101' }],
    sources: [{ provider_id: 'xtream-' + xt.id, item_id: 'xtream-' + xt.id + '-live-101', source_id: '101' }]
  }]);

  var gridRouter = require(path.resolve(__dirname, '..', 'src', 'routes', 'epgGrid.js'));
  var app2 = express();
  app2.use('/', gridRouter);
  var srv2 = await startExpress(app2);
  var gridRes = await request(srv2, '/api/epg/grid?profile_id=dave_tv&start=2026-05-20T10%3A00%3A00.000Z&end=2026-05-20T12%3A00%3A00.000Z');
  await closeServer(srv2);

  var gridRows = gridRes.body && Array.isArray(gridRes.body.programs) ? gridRes.body.programs : [];
  ok('/api/epg/grid returns 200 with no XMLTV_URL', gridRes.status === 200, 'status=' + gridRes.status);
  ok('/api/epg/grid fetched Xtream default xmltv.php',
    seen.xtream === 1 && seen.xtreamQuery.indexOf('/xmltv.php?') === 0,
    'seen=' + JSON.stringify(seen));
  ok('/api/epg/grid maps Xtream XMLTV only through current catalog item',
    gridRows.length === 1 &&
      gridRows[0].title === 'Xtream Provider Hour' &&
      gridRows[0].channel_id === 'xtream-' + xt.id + '-live-101' &&
      gridRows[0].provider_id === 'xtream-' + xt.id,
    JSON.stringify(gridRows));
  ok('/api/epg/grid response does not leak Xtream credentials',
    JSON.stringify(gridRes.body).indexOf('PLACEHOLDER_USER') === -1 &&
      JSON.stringify(gridRes.body).indexOf('PLACEHOLDER_PASS') === -1,
    JSON.stringify(gridRes.body && gridRes.body._meta));

  xmltv._internal._clearCache();
  await closeServer(upstream);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  ['XMLTV_URL', 'HERMES_PROVIDER_DATA_DIR', 'APOLLO_M3U_URL', 'XTREMEHD_M3U_URL',
   'XTREAM_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD', 'JELLYFIN_URL',
   'JELLYFIN_API_KEY', 'IPTV_ORG_ENABLED'].forEach(function(k) {
    if (savedEnv[k] === undefined) { delete process.env[k]; } else { process.env[k] = savedEnv[k]; }
  });

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch(function(err) {
  console.error('Unhandled test error:', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
