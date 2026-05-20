#!/usr/bin/env node
'use strict';

/**
 * test/epgGridMapping.test.js - EPG grid playable mapping proof.
 *
 * Verifies /api/epg/grid maps XMLTV tvg IDs to real Hermes catalog/source IDs
 * when catalog data proves the relationship, and marks unmatched XMLTV rows as
 * unmapped instead of echoing raw tvg IDs as playable channel_id values.
 */

var express = require('express');
var http = require('http');
var path = require('path');

process.env.NODE_ENV = 'test';
process.env.XMLTV_URL = 'https://epg.example.test/guide.xml?token=secret';

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

function startServer(app) {
  return new Promise(function(resolve, reject) {
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, urlPath) {
  return new Promise(function(resolve, reject) {
    var opts = {
      host: '127.0.0.1',
      port: srv.address().port,
      method: 'GET',
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

var xmltv = require('../src/integrations/xmltv');
xmltv.getCachedEpg = function() {
  return {
    data: {
      channels: [
        { id: 'disk-news', name: 'Disk News' },
        { id: 'xtream-news', name: 'Xtream News' },
        { id: 'unknown-news', name: 'Unknown News' },
      ],
      programs: [
        {
          channel_id: 'disk-news',
          title: 'Morning Update',
          description: 'Mapped M3U channel',
          start: '2026-05-20T10:00:00.000Z',
          end: '2026-05-20T11:00:00.000Z',
        },
        {
          channel_id: 'xtream-news',
          title: 'Panel Headlines',
          description: 'Mapped Xtream channel',
          start: '2026-05-20T10:30:00.000Z',
          end: '2026-05-20T11:30:00.000Z',
        },
        {
          channel_id: 'unknown-news',
          title: 'Unmapped Hour',
          description: 'No playable catalog row',
          start: '2026-05-20T10:15:00.000Z',
          end: '2026-05-20T10:45:00.000Z',
        },
      ],
    },
  };
};

var catalogMerge = require('../src/lib/catalogMerge');
catalogMerge.setLastMerged([
  {
    id: 'm3u-prov-111-disk-news',
    type: 'live',
    title: 'Disk News HD',
    provider: 'm3u-prov-111',
    metadata: { tvg_id: 'disk-news' },
    providers: [{
      provider_id: 'm3u-prov-111',
      source_id: 'disk-news',
      source_health: { status: 'ok' },
    }],
    sources: [{
      provider_id: 'm3u-prov-111',
      item_id: 'm3u-prov-111-disk-news',
      source_id: 'disk-news',
      source_health: { status: 'ok' },
    }],
  },
  {
    id: 'xtream-prov-222-live-101',
    type: 'live',
    title: 'Xtream News',
    provider: 'xtream-prov-222',
    metadata: { tvg_id: 'xtream-news' },
    providers: [{
      provider_id: 'xtream-prov-222',
      source_id: '101',
      source_health: { status: 'ok' },
    }],
    sources: [{
      provider_id: 'xtream-prov-222',
      item_id: 'xtream-prov-222-live-101',
      source_id: '101',
      source_health: { status: 'ok' },
    }],
  },
]);

var router = require(path.resolve(__dirname, '..', 'src', 'routes', 'epgGrid.js'));
var app = express();
app.use('/', router);

(async function run() {
  var srv = await startServer(app);
  var res = await request(srv, '/api/epg/grid?profile_id=dave_tv&start=2026-05-20T10%3A00%3A00.000Z&end=2026-05-20T12%3A00%3A00.000Z');
  ok('GET /api/epg/grid returns 200', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));
  ok('Response includes three fixture programs',
    res.body && Array.isArray(res.body.programs) && res.body.programs.length === 3,
    JSON.stringify(res.body && res.body.programs));

  var rows = res.body.programs || [];
  var byTitle = {};
  for (var i = 0; i < rows.length; i++) { byTitle[rows[i].title] = rows[i]; }

  ok('M3U row uses playable catalog item id as channel_id',
    byTitle['Morning Update'] &&
      byTitle['Morning Update'].channel_id === 'm3u-prov-111-disk-news' &&
      byTitle['Morning Update'].catalog_item_id === 'm3u-prov-111-disk-news' &&
      byTitle['Morning Update'].source_id === 'disk-news' &&
      byTitle['Morning Update'].xmltv_tvg_id === 'disk-news' &&
      byTitle['Morning Update'].epg_status === 'mapped',
    JSON.stringify(byTitle['Morning Update']));

  ok('Xtream row maps by metadata.tvg_id but keeps provider stream source_id',
    byTitle['Panel Headlines'] &&
      byTitle['Panel Headlines'].channel_id === 'xtream-prov-222-live-101' &&
      byTitle['Panel Headlines'].provider_id === 'xtream-prov-222' &&
      byTitle['Panel Headlines'].source_id === '101' &&
      byTitle['Panel Headlines'].xmltv_tvg_id === 'xtream-news' &&
      byTitle['Panel Headlines'].epg_status === 'mapped',
    JSON.stringify(byTitle['Panel Headlines']));

  ok('Unmapped row does not pretend raw tvgId is playable channel_id',
    byTitle['Unmapped Hour'] &&
      byTitle['Unmapped Hour'].channel_id === null &&
      byTitle['Unmapped Hour'].catalog_item_id === null &&
      byTitle['Unmapped Hour'].source_id === null &&
      byTitle['Unmapped Hour'].xmltv_tvg_id === 'unknown-news' &&
      byTitle['Unmapped Hour'].epg_status === 'unmapped',
    JSON.stringify(byTitle['Unmapped Hour']));

  ok('Meta reports mapped and unmapped counts',
    res.body && res.body._meta && res.body._meta.mapped === 2 && res.body._meta.unmapped === 1,
    JSON.stringify(res.body && res.body._meta));

  srv.close();
  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err && err.stack ? err.stack : err);
  process.exit(1);
});
