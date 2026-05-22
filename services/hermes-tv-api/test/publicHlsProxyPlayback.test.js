#!/usr/bin/env node
'use strict';

/**
 * Proves public HLS playback stays on DaveTV's origin instead of 302ing the
 * browser to an upstream CDN. This is required for local dev, Cloudflare, and
 * Tizen because hls.js/Chrome can stall on cross-origin HLS redirects.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-public-hls-'));
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
var fetched = [];
var realDateNow = Date.now;
var fakeNow = realDateNow();
Date.now = function() { return fakeNow; };

function advanceClock(ms) {
  fakeNow += ms;
}

function ok(label, cond, detail) {
  if (cond) {
    console.log('PASS:', label);
    pass += 1;
  } else {
    console.log('FAIL:', label, detail || '');
    fail += 1;
  }
}

global.fetch = function(url, opts) {
  var s = String(url || '');
  var method = opts && opts.method ? opts.method : 'GET';
  fetched.push(method + ' ' + s);

  if (s === 'https://m3u.example.test/public.m3u') {
    return Promise.resolve(new Response([
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="public-hls" tvg-name="Public HLS" group-title="News",Public HLS',
      'https://cdn.example.test/master/index.m3u8',
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    }));
  }

  if (s === 'https://cdn.example.test/master/index.m3u8') {
    return Promise.resolve(new Response([
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720',
      'variant/live.m3u8',
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    }));
  }

  if (s === 'https://cdn.example.test/master/variant/live.m3u8') {
    return Promise.resolve(new Response([
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:6',
      '#EXTINF:6.0,',
      'segment001.ts',
    ].join('\n'), {
      status: 206,
      headers: {
        'content-type': 'application/vnd.apple.mpegurl',
        'content-range': 'bytes 0-74/75',
        'accept-ranges': 'bytes',
      },
    }));
  }

  if (s === 'https://cdn.example.test/master/variant/segment001.ts') {
    return Promise.resolve(new Response('VIDEO-BYTES', {
      status: 200,
      headers: { 'content-type': 'video/mp2t', 'content-length': '11' },
    }));
  }

  return Promise.resolve(new Response('not found', { status: 404 }));
};

function startServer(app) {
  return new Promise(function(resolve, reject) {
    var srv = app.listen(0, function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function request(srv, method, urlPath, body, headers) {
  return new Promise(function(resolve, reject) {
    var port = srv.address().port;
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      host: '127.0.0.1',
      port: port,
      method: method,
      path: urlPath,
      headers: Object.assign({ Accept: 'application/json' }, headers || {}),
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
        if ((res.headers['content-type'] || '').indexOf('application/json') !== -1) {
          try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = text; }
        }
        resolve({ status: res.statusCode, body: parsed || text, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) { req.write(data); }
    req.end();
  });
}

function firstProxyPath(body) {
  var lines = String(body || '').split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('/api/proxy/') === 0) { return lines[i]; }
  }
  return '';
}

(async function run() {
  var providerStore = require('../src/lib/providerStore');
  providerStore._resetCacheForTests();
  await providerStore.add({
    type: 'm3u',
    label: 'Public HLS Provider',
    url: 'https://m3u.example.test/public.m3u',
  });

  var app = require('../src/index');
  var srv = await startServer(app);

  var catalog = await request(srv, 'GET', '/api/catalog');
  ok('Catalog exposes public HLS item', catalog.status === 200 && catalog.body.total === 1, JSON.stringify(catalog.body));
  var item = catalog.body.catalog[0];

  var ticket = await request(srv, 'POST', '/api/play', {
    item_id: item.id,
    profile_id: 'dave_tv',
  });
  ok('POST /api/play returns HLS-suffixed ticket', ticket.status === 200 && /\.m3u8$/.test(ticket.body.stream_endpoint || ''), JSON.stringify(ticket.body));

  var stream = await request(srv, 'GET', ticket.body.stream_endpoint);
  ok('GET /stream returns proxied playlist, not redirect', stream.status === 200, 'status=' + stream.status);
  ok('GET /stream content-type is HLS',
    String(stream.headers['content-type']).indexOf('mpegurl') !== -1,
    JSON.stringify(stream.headers));
  ok('Public master playlist is rewritten to DaveTV proxy paths',
    String(stream.body).indexOf('/api/proxy/') !== -1 && String(stream.body).indexOf('cdn.example.test') === -1,
    String(stream.body));

  var variantPath = firstProxyPath(stream.body);
  advanceClock((4 * 60 + 55) * 1000);
  var variant = await request(srv, 'GET', variantPath, null, { Range: 'bytes=0-' });
  ok('Nested variant playlist is also rewritten', variant.status === 200, 'status=' + variant.status);
  ok('Nested variant playlist normalizes partial upstream responses',
    variant.status === 200 && !variant.headers['content-range'] && String(variant.headers['content-type']).indexOf('mpegurl') !== -1,
    JSON.stringify(variant.headers));
  ok('Nested variant does not leak upstream host',
    String(variant.body).indexOf('/api/proxy/') !== -1 && String(variant.body).indexOf('cdn.example.test') === -1,
    String(variant.body));

  var segmentPath = firstProxyPath(variant.body);
  advanceClock(20 * 1000);
  var segment = await request(srv, 'GET', segmentPath);
  ok('Rewritten segment proxy returns media bytes', segment.status === 200 && segment.body === 'VIDEO-BYTES', 'status=' + segment.status + ' body=' + segment.body);
  ok('Active HLS playback keeps ticket alive past original 5-minute issue TTL',
    segment.status === 200 && fakeNow > Date.parse(ticket.body.issued_at) + (5 * 60 * 1000),
    'status=' + segment.status + ' fakeNow=' + fakeNow + ' issued=' + ticket.body.issued_at);

  advanceClock((5 * 60 + 1) * 1000);
  var expired = await request(srv, 'GET', segmentPath);
  ok('HLS ticket still expires after playback inactivity',
    expired.status === 410 && expired.body && expired.body.error === 'ticket_expired',
    'status=' + expired.status + ' body=' + JSON.stringify(expired.body));

  ok('No browser-facing 302 was needed for public HLS',
    fetched.indexOf('GET https://cdn.example.test/master/index.m3u8') !== -1 &&
      fetched.indexOf('GET https://cdn.example.test/master/variant/live.m3u8') !== -1,
    JSON.stringify(fetched));

  srv.close();
  Date.now = realDateNow;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err && err.stack ? err.stack : err);
  Date.now = realDateNow;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
