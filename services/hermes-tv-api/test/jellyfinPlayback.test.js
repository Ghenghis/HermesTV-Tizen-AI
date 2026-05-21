'use strict';

/**
 * test/jellyfinPlayback.test.js
 *
 * Proves Jellyfin is not merely "configured in catalog". A Jellyfin item must:
 *   catalog -> play ticket -> server-side image proxy -> server-side stream proxy
 * without exposing the Jellyfin API key in JSON, headers, or browser-visible URLs.
 *
 * This uses a local Jellyfin-compatible HTTP fixture. It is not live-provider
 * proof and cannot replace Dave's real Jellyfin/VPS check, but it proves the
 * DaveTV integration code path is implemented instead of stubbed.
 */

var fs = require('fs');
var http = require('http');
var os = require('os');
var path = require('path');

var PROVIDER_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-jellyfin-provider-'));
var JELLYFIN_TOKEN = 'jellyfin-contract-token-' + Math.random().toString(36).slice(2, 14);
var ITEM_ID = 'movie-001';

var pass = 0;
var fail = 0;
var fixtureSeen = {
  catalogToken: null,
  imageToken: null,
  streamApiKey: null,
  streamMethods: [],
};

function ok(label, cond, detail) {
  if (cond) {
    console.log('PASS:', label);
    pass += 1;
  } else {
    console.log('FAIL:', label, detail || '');
    fail += 1;
  }
}

function startJellyfinFixture() {
  return new Promise(function(resolve, reject) {
    var server = http.createServer(function(req, res) {
      var u = new URL(req.url, 'http://127.0.0.1');

      if (u.pathname === '/Items') {
        fixtureSeen.catalogToken = req.headers['x-emby-token'] || null;
        if (fixtureSeen.catalogToken !== JELLYFIN_TOKEN) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          Items: [{
            Id: ITEM_ID,
            Type: 'Movie',
            Name: 'Jellyfin Contract Movie',
            ProductionYear: 2026,
            OfficialRating: 'PG',
            RunTimeTicks: 72000000000,
            Genres: ['Family'],
            Overview: 'Fixture-backed Jellyfin playback contract item.',
            ImageTags: { Primary: 'primary-tag' },
          }],
        }));
        return;
      }

      if (u.pathname === '/Items/' + ITEM_ID + '/Images/Primary') {
        fixtureSeen.imageToken = req.headers['x-emby-token'] || null;
        if (fixtureSeen.imageToken !== JELLYFIN_TOKEN) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        var img = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
        res.writeHead(200, {
          'content-type': 'image/jpeg',
          'content-length': String(img.length),
        });
        res.end(img);
        return;
      }

      if (u.pathname === '/Videos/' + ITEM_ID + '/stream') {
        fixtureSeen.streamApiKey = u.searchParams.get('api_key');
        fixtureSeen.streamMethods.push(req.method);
        if (fixtureSeen.streamApiKey !== JELLYFIN_TOKEN) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'unauthorized' }));
          return;
        }
        var body = Buffer.from('JELLYFIN_MEDIA_BYTES');
        res.writeHead(200, {
          'content-type': 'video/mp4',
          'content-length': req.method === 'HEAD' ? '0' : String(body.length),
          'accept-ranges': 'bytes',
        });
        if (req.method === 'HEAD') { res.end(); }
        else { res.end(body); }
        return;
      }

      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });

    server.listen(0, '127.0.0.1', function() {
      resolve({ server: server, port: server.address().port });
    });
    server.on('error', reject);
  });
}

function request(port, method, urlPath, body) {
  return new Promise(function(resolve, reject) {
    var data = body ? JSON.stringify(body) : null;
    var opts = {
      host: '127.0.0.1',
      port: port,
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
        var buf = Buffer.concat(chunks);
        var text = buf.toString('utf8');
        var parsed = null;
        if ((res.headers['content-type'] || '').indexOf('application/json') !== -1) {
          try { parsed = text ? JSON.parse(text) : null; } catch (_) { parsed = null; }
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed || text, raw: text, bytes: buf });
      });
    });
    req.on('error', reject);
    if (data) { req.write(data); }
    req.end();
  });
}

function noLeak(label, value) {
  var raw = typeof value === 'string' ? value : JSON.stringify(value);
  ok(label + ' does not include Jellyfin token', raw.indexOf(JELLYFIN_TOKEN) === -1);
  ok(label + ' does not include api_key query', /[?&]api[_-]?key=/i.test(raw) === false);
  ok(label + ' does not include X-Emby header name', /X-Emby-Token/i.test(raw) === false);
}

(async function run() {
  var savedEnv = {};
  [
    'APOLLO_M3U_URL',
    'XTREMEHD_M3U_URL',
    'XTREAM_URL',
    'XTREAM_USERNAME',
    'XTREAM_PASSWORD',
    'JELLYFIN_URL',
    'JELLYFIN_API_KEY',
    'IPTV_ORG_ENABLED',
    'HERMES_PROVIDER_DATA_DIR',
    'DAVETV_AUTH_REQUIRED',
    'DAVETV_AUTH_ENFORCE_API',
    'DAVETV_ADMIN_EMAIL',
    'DAVETV_ADMIN_PASSWORD',
    'PORT',
  ].forEach(function(k) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  });

  var fixture = null;
  var hermesApp = null;
  var hermesPort = 3297;
  try {
    fixture = await startJellyfinFixture();
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(hermesPort);
    process.env.HERMES_PROVIDER_DATA_DIR = PROVIDER_DIR;
    process.env.JELLYFIN_URL = 'http://127.0.0.1:' + fixture.port;
    process.env.JELLYFIN_API_KEY = JELLYFIN_TOKEN;

    var jellyfin = require('../src/lib/jellyfin');
    jellyfin._clearCache();
    var streamResolver = require('../src/lib/streamResolver');
    ok('streamResolver classifies Jellyfin api_key URL as credential-bearing',
      streamResolver.isCredentialBearing('http://127.0.0.1:' + fixture.port + '/Videos/' + ITEM_ID + '/stream?Static=true&api_key=' + JELLYFIN_TOKEN));

    hermesApp = require('../src/index');

    var catalog = await request(hermesPort, 'GET', '/api/catalog');
    ok('GET /api/catalog returns Jellyfin item', catalog.status === 200 && catalog.body && catalog.body.total === 1, 'status=' + catalog.status);
    noLeak('catalog response', catalog.raw);
    var item = catalog.body && catalog.body.catalog && catalog.body.catalog[0];
    ok('Jellyfin item uses resolver-safe id prefix', item && /^jellyfin-/.test(item.id), item && item.id);
    ok('Jellyfin item keeps provider identity', item && item.providers && item.providers[0] && item.providers[0].provider_id === 'jellyfin', JSON.stringify(item && item.providers));
    ok('Jellyfin poster_url points at DaveTV proxy', item && /^\/api\/jellyfin\/items\//.test(item.poster_url || ''), item && item.poster_url);
    ok('Jellyfin catalog fetch used X-Emby-Token server-side', fixtureSeen.catalogToken === JELLYFIN_TOKEN);

    var jellyfinFilter = await request(hermesPort, 'GET', '/api/catalog?provider_id=jellyfin&profile_id=warren');
    ok('Jellyfin provider filter returns Jellyfin rows for family profiles',
      jellyfinFilter.status === 200 && jellyfinFilter.body && jellyfinFilter.body.total === 1,
      jellyfinFilter.raw);
    var wrongFilter = await request(hermesPort, 'GET', '/api/catalog?provider_id=xtream&profile_id=warren');
    ok('Jellyfin-only catalog respects non-Jellyfin provider filters',
      wrongFilter.status === 200 && wrongFilter.body && wrongFilter.body.total === 0,
      wrongFilter.raw);

    var image = await request(hermesPort, 'GET', item.poster_url);
    ok('Jellyfin image proxy returns bytes', image.status === 200 && image.bytes.length === 4, 'status=' + image.status);
    ok('Jellyfin image proxy preserves content-type', String(image.headers['content-type']).indexOf('image/jpeg') !== -1, JSON.stringify(image.headers));
    ok('Jellyfin image fetch used X-Emby-Token server-side', fixtureSeen.imageToken === JELLYFIN_TOKEN);
    noLeak('image response headers', JSON.stringify(image.headers));

    var ticket = await request(hermesPort, 'POST', '/api/play', {
      item_id: item.id,
      profile_id: 'dave_tv',
    });
    ok('POST /api/play returns Jellyfin ticket', ticket.status === 200 && ticket.body && ticket.body.ticket, 'status=' + ticket.status);
    ok('Jellyfin ticket names provider correctly', ticket.body && ticket.body.provider && ticket.body.provider.provider_id === 'jellyfin', JSON.stringify(ticket.body && ticket.body.provider));
    noLeak('play ticket response', ticket.raw);

    var stream = await request(hermesPort, 'GET', ticket.body.stream_endpoint);
    ok('GET /api/play/:ticket/stream proxies Jellyfin media', stream.status === 200 && stream.raw === 'JELLYFIN_MEDIA_BYTES', 'status=' + stream.status + ' body=' + stream.raw);
    ok('Jellyfin stream used api_key server-side only', fixtureSeen.streamApiKey === JELLYFIN_TOKEN);
    noLeak('stream response headers', JSON.stringify(stream.headers));
  } catch (err) {
    console.error('Unhandled test error:', err && err.stack ? err.stack : err);
    fail += 1;
  } finally {
    if (hermesApp && typeof hermesApp.closeHermesServer === 'function') {
      await new Promise(function(resolve) { hermesApp.closeHermesServer(function() { resolve(); }); });
    }
    if (fixture && fixture.server) { await new Promise(function(resolve) { fixture.server.close(function() { resolve(); }); }); }
    try { fs.rmSync(PROVIDER_DIR, { recursive: true, force: true }); } catch (_) {}
    Object.keys(savedEnv).forEach(function(k) {
      if (savedEnv[k] === undefined) { delete process.env[k]; }
      else { process.env[k] = savedEnv[k]; }
    });
  }

  console.log('\n=== Results: ' + pass + ' PASS, ' + fail + ' FAIL ===');
  process.exitCode = fail === 0 ? 0 : 1;
})();
