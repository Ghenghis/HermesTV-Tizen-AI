#!/usr/bin/env node
'use strict';

/**
 * test/playbackProxy.test.js - Lane C direct stream proxy proof.
 *
 * Proves credential-bearing direct byte streams do not go through the HLS
 * playlist rewriter and that Range/HEAD/media headers survive the proxy.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-playback-proxy-'));
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
var seenRange = null;
var seenMethods = [];

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
  seenMethods.push(method + ' ' + s);
  if (opts && opts.headers && opts.headers.Range) { seenRange = opts.headers.Range; }

  if (s === 'https://m3u.example.test/direct.m3u') {
    return Promise.resolve(new Response([
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="direct-news" tvg-name="Direct News" group-title="News",Direct News',
      'https://streams.example.test/live/direct-news.ts',
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'application/vnd.apple.mpegurl' },
    }));
  }

  if (s === 'https://streams.example.test/live/direct-news.ts') {
    var body = method === 'HEAD' ? null : 'RANGE-BYTES';
    return Promise.resolve(new Response(body, {
      status: opts && opts.headers && opts.headers.Range ? 206 : 200,
      headers: {
        'content-type': 'video/mp2t',
        'content-range': 'bytes 0-10/100',
        'accept-ranges': 'bytes',
        'content-length': method === 'HEAD' ? '0' : '11',
      },
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

(async function run() {
  var providerStore = require('../src/lib/providerStore');
  providerStore._resetCacheForTests();
  await providerStore.add({
    type: 'm3u',
    label: 'Direct Stream Provider',
    url: 'https://m3u.example.test/direct.m3u',
  });

  var app = require('../src/index');
  var srv = await startServer(app);

  var catalog = await request(srv, 'GET', '/api/catalog');
  ok('Catalog primed direct stream item', catalog.status === 200 && catalog.body.total === 1, JSON.stringify(catalog.body));
  var item = catalog.body.catalog[0];

  var ticket = await request(srv, 'POST', '/api/play', {
    item_id: item.id,
    profile_id: 'dave_tv',
  });
  ok('POST /api/play returns ticket', ticket.status === 200 && ticket.body.ticket, JSON.stringify(ticket.body));
  ok('Ticket response does not leak upstream stream URL',
    JSON.stringify(ticket.body).indexOf('streams.example.test') === -1,
    JSON.stringify(ticket.body));

  var stream = await request(srv, 'GET', ticket.body.stream_endpoint, null, { Range: 'bytes=0-3' });
  ok('Direct stream proxy returns upstream partial status', stream.status === 206, 'status=' + stream.status);
  ok('Direct stream proxy forwards Range upstream', seenRange === 'bytes=0-3', 'seenRange=' + seenRange);
  ok('Direct stream proxy preserves media content-type',
    String(stream.headers['content-type']).indexOf('video/mp2t') !== -1,
    JSON.stringify(stream.headers));
  ok('Direct stream proxy preserves content-range',
    stream.headers['content-range'] === 'bytes 0-10/100',
    JSON.stringify(stream.headers));
  ok('Direct stream proxy returns media bytes', stream.body === 'RANGE-BYTES', JSON.stringify(stream.body));

  var head = await request(srv, 'HEAD', ticket.body.stream_endpoint);
  ok('HEAD /stream succeeds for direct stream', head.status === 200 || head.status === 206, 'status=' + head.status);
  ok('HEAD /stream uses upstream HEAD method',
    seenMethods.some(function(s) { return s === 'HEAD https://streams.example.test/live/direct-news.ts'; }),
    JSON.stringify(seenMethods));

  srv.close();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log('Results: ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail === 0 ? 0 : 1);
})().catch(function(err) {
  console.error('Unhandled test error:', err && err.stack ? err.stack : err);
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(1);
});
