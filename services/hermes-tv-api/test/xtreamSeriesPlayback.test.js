'use strict';

/**
 * Proves series playback uses real Xtream episode metadata. The previous
 * path invented SxxExx rows and then tried to play the series id itself.
 */

var http = require('http');
var path = require('path');
var fs = require('fs');
var os = require('os');

var fixture = require(path.resolve(__dirname, '..', '..', '..', 'tools', 'xtream-fixture-server.js'));

var FIXTURE_USER = 'seriesdemo';
var FIXTURE_PASS = 'seriesdemo';
var hermesApp = null;
var totalPass = 0;
var totalFail = 0;

function pass(label) { console.log('PASS: ' + label); totalPass += 1; }
function fail(label, detail) { console.log('FAIL: ' + label + (detail ? ' — ' + detail : '')); totalFail += 1; }

function call(method, url, body) {
  return new Promise(function(resolve) {
    var u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0, error: 'bad-url' }); }
    var opts = {
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: { Accept: 'application/json' },
    };
    var data = body ? JSON.stringify(body) : null;
    if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    var req = http.request(opts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: raw });
      });
    });
    req.on('error', function(e) { resolve({ status: 0, error: e.message }); });
    req.setTimeout(20000, function() { try { req.destroy(); } catch (_) {} resolve({ status: 0, error: 'timeout' }); });
    if (data) { req.write(data); }
    req.end();
  });
}

function bootHermesApi(port) {
  return new Promise(function(resolve, reject) {
    process.env.PORT = String(port);
    process.env.NODE_ENV = 'test';
    var apiPath = path.resolve(__dirname, '..', 'src', 'index.js');
    delete require.cache[apiPath];
    try { hermesApp = require(apiPath); } catch (e) { return reject(e); }
    var deadline = Date.now() + 20000;
    function probe() {
      call('GET', 'http://127.0.0.1:' + port + '/health').then(function(r) {
        if (r.status === 200) { return resolve(); }
        if (Date.now() > deadline) { return reject(new Error('Hermes API did not become healthy')); }
        setTimeout(probe, 250);
      });
    }
    setTimeout(probe, 300);
  });
}

function closeHermesApi() {
  return new Promise(function(resolve) {
    if (hermesApp && typeof hermesApp.closeHermesServer === 'function') {
      return hermesApp.closeHermesServer(function() { resolve(); });
    }
    resolve();
  });
}

async function cleanup(fx, tmpDir, savedEnv) {
  await closeHermesApi();
  if (fx && fx.server) { await fixture.stop(fx.server); }
  if (savedEnv) {
    Object.keys(savedEnv).forEach(function(k) {
      if (savedEnv[k] === undefined) { delete process.env[k]; } else { process.env[k] = savedEnv[k]; }
    });
  }
  if (tmpDir) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

function hasNoCreds(label, text) {
  text = String(text || '');
  if (text.indexOf(FIXTURE_USER) === -1 && text.indexOf(FIXTURE_PASS) === -1) {
    pass(label + ' contains zero credential bytes');
  } else {
    fail(label + ' leaked credential bytes');
  }
}

(async function main() {
  process.env.XTREAM_FIXTURE_USER = FIXTURE_USER;
  process.env.XTREAM_FIXTURE_PASS = FIXTURE_PASS;

  var savedEnv = {};
  [
    'XTREAM_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD',
    'APOLLO_M3U_URL', 'XTREMEHD_M3U_URL', 'JELLYFIN_URL',
    'JELLYFIN_API_KEY', 'IPTV_ORG_ENABLED', 'HERMES_PROVIDER_DATA_DIR',
  ].forEach(function(k) { savedEnv[k] = process.env[k]; delete process.env[k]; });

  var fx = null;
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-series-'));
  try {
    fx = await fixture.start(0);
    pass('xtream fixture listening for series metadata');

    process.env.XTREAM_URL = 'http://127.0.0.1:' + fx.port;
    process.env.XTREAM_USERNAME = FIXTURE_USER;
    process.env.XTREAM_PASSWORD = FIXTURE_PASS;
    process.env.HERMES_PROVIDER_DATA_DIR = tmpDir;

    var hermesPort = 3307;
    await bootHermesApi(hermesPort);
    pass('Hermes API listening for series proof');

    var catalogResp = await call('GET', 'http://127.0.0.1:' + hermesPort + '/api/catalog');
    for (var retry = 0; retry < 3 && catalogResp.body && catalogResp.body.total === 0; retry++) {
      await new Promise(function(r) { setTimeout(r, 1000); });
      catalogResp = await call('GET', 'http://127.0.0.1:' + hermesPort + '/api/catalog');
    }
    var items = catalogResp.body && Array.isArray(catalogResp.body.catalog) ? catalogResp.body.catalog : [];
    var seriesItem = null;
    var movieItem = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].type === 'series') { seriesItem = items[i]; break; }
    }
    for (var mi = 0; mi < items.length; mi++) {
      if (items[mi] && (items[mi].type === 'movie' || items[mi].type === 'vod')) { movieItem = items[mi]; break; }
    }
    if (seriesItem && seriesItem.id.indexOf('xtream-') === 0) {
      pass('/api/catalog exposes real Xtream series item');
    } else {
      fail('/api/catalog did not expose fixture series', 'status=' + catalogResp.status);
    }

    var detailsResp = seriesItem
      ? await call('GET', 'http://127.0.0.1:' + hermesPort + '/api/series/' + encodeURIComponent(seriesItem.id) + '?profile_id=dave_tv')
      : { status: 0, body: null, raw: '' };
    var episodes = detailsResp.body && Array.isArray(detailsResp.body.episodes) ? detailsResp.body.episodes : [];
    var first = episodes[0];
    if (detailsResp.status === 200 && episodes.length === 2) {
      pass('/api/series/:id returns provider episodes, not synthesized rows');
    } else {
      fail('/api/series/:id episode count', 'status=' + detailsResp.status + ' count=' + episodes.length);
    }
    if (first && first.title === 'Pilot' && first.play_item_id && first.play_item_id !== seriesItem.id) {
      pass('episode row carries real title and distinct playable episode id');
    } else {
      fail('episode row missing real provider fields', JSON.stringify(first || {}));
    }
    hasNoCreds('/api/series details', detailsResp.raw);

    var playResp = first
      ? await call('POST', 'http://127.0.0.1:' + hermesPort + '/api/play', {
          item_id: seriesItem.id,
          profile_id: 'dave_tv',
          episode_item_id: first.play_item_id,
        })
      : { status: 0, body: null, raw: '' };
    if (playResp.status === 200 && playResp.body && playResp.body.ticket &&
        playResp.body.item && playResp.body.item.episode_item_id === first.play_item_id) {
      pass('/api/play accepts episode_item_id and issues an episode ticket');
    } else {
      fail('/api/play episode ticket', 'status=' + playResp.status + ' raw=' + (playResp.raw || '').slice(0, 200));
    }
    hasNoCreds('/api/play episode ticket', playResp.raw);

    var autoPlayResp = await call('POST', 'http://127.0.0.1:' + hermesPort + '/api/play', {
      item_id: seriesItem.id,
      profile_id: 'dave_tv',
    });
    if (autoPlayResp.status === 200 &&
        autoPlayResp.body &&
        autoPlayResp.body.item &&
        autoPlayResp.body.item.episode_item_id === first.play_item_id) {
      pass('/api/play resolves a series click to the first real provider episode');
    } else {
      fail('/api/play series auto-episode ticket', 'status=' + autoPlayResp.status + ' raw=' + (autoPlayResp.raw || '').slice(0, 200));
    }
    hasNoCreds('/api/play series auto-episode ticket', autoPlayResp.raw);

    var wrongProviderResp = await call('POST', 'http://127.0.0.1:' + hermesPort + '/api/play', {
      item_id: seriesItem.id,
      profile_id: 'dave_tv',
      episode_item_id: 'xtream-prov-deadbeef-series-50001',
    });
    if (wrongProviderResp.status === 400 &&
        wrongProviderResp.body && wrongProviderResp.body.error === 'invalid_episode_item') {
      pass('/api/play rejects episode_item_id from a different provider namespace');
    } else {
      fail('/api/play wrong-provider episode guard', 'status=' + wrongProviderResp.status);
    }

    if (playResp.body && playResp.body.stream_endpoint) {
      var streamResp = await call('GET', 'http://127.0.0.1:' + hermesPort + playResp.body.stream_endpoint);
      if (streamResp.status === 200 || streamResp.status === 206 || streamResp.status === 302) {
        pass('episode stream endpoint returns media response status=' + streamResp.status);
      } else {
        fail('episode stream endpoint status', 'status=' + streamResp.status + ' raw=' + (streamResp.raw || '').slice(0, 200));
      }
      hasNoCreds('episode stream response', streamResp.raw);
    }

    if (movieItem) {
      var movieWatchedResp = await call('POST', 'http://127.0.0.1:' + hermesPort + '/api/movies/' + encodeURIComponent(movieItem.id) + '/watched', {
        profile_id: 'dave_tv',
      });
      if (movieWatchedResp.status === 200 && movieWatchedResp.body && movieWatchedResp.body.success === true) {
        pass('/api/movies/:id/watched accepts real provider movie items');
      } else {
        fail('/api/movies/:id/watched rejected provider movie', 'status=' + movieWatchedResp.status + ' raw=' + (movieWatchedResp.raw || '').slice(0, 200));
      }
      var movieFavoriteResp = await call('POST', 'http://127.0.0.1:' + hermesPort + '/api/movies/' + encodeURIComponent(movieItem.id) + '/favorite', {
        profile_id: 'dave_tv',
      });
      if (movieFavoriteResp.status === 200 && movieFavoriteResp.body && movieFavoriteResp.body.success === true) {
        pass('/api/movies/:id/favorite accepts real provider movie items');
      } else {
        fail('/api/movies/:id/favorite rejected provider movie', 'status=' + movieFavoriteResp.status + ' raw=' + (movieFavoriteResp.raw || '').slice(0, 200));
      }
    } else {
      fail('/api/catalog did not expose fixture movie item');
    }
  } catch (err) {
    fail('xtream series playback harness', err && err.message ? err.message : String(err));
  } finally {
    await cleanup(fx, tmpDir, savedEnv);
  }

  console.log('');
  console.log('=== Results: ' + totalPass + ' PASS, ' + totalFail + ' FAIL ===');
  process.exitCode = totalFail === 0 ? 0 : 1;
})();
