'use strict';

/**
 * lib/iptvOrgRefresh.js — periodic refresh of the iptv-org JSON cache.
 *
 * Started once at API boot from src/index.js (after app.listen so the cron
 * never runs inside supertest fixtures). Polls the public iptv-org GitHub
 * Pages every 24h and atomically writes the 8 JSON files into
 * `IPTV_ORG_CACHE_DIR` (default /var/cache/iptv-org/).
 *
 * Safety:
 *  - dormant unless `IPTV_ORG_ENABLED === 'true'`
 *  - atomic writes (.tmp then rename) so the lib never reads a half-written file
 *  - on any HTTP failure, logs and retries in 1h; keeps serving stale cache
 *  - 15s timeout per file via AbortController
 */

var fs = require('fs');
var path = require('path');
var iptvOrg = require('./iptvOrg');

var BASE_URL = 'https://iptv-org.github.io/api';
var FILES = [
  'channels.json',
  'streams.json',
  'guides.json',
  'logos.json',
  'categories.json',
  'countries.json',
  'languages.json',
  'blocklist.json',
];
var FETCH_TIMEOUT_MS = 15000;
var REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
var RETRY_INTERVAL_MS   = 60 * 60 * 1000;      // 1h on failure

var _timer = null;
var _started = false;

function _log(msg) {
  console.log('[iptvOrgRefresh] ' + msg);
}

function _cacheDir() {
  return process.env.IPTV_ORG_CACHE_DIR || '/var/cache/iptv-org';
}

function _ensureDir() {
  var dir = _cacheDir();
  try { fs.mkdirSync(dir, { recursive: true }); }
  catch (_) { /* ignore — write will fail loudly later if truly broken */ }
}

function _fetchOne(filename) {
  var url = BASE_URL + '/' + filename;
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, FETCH_TIMEOUT_MS);
  return fetch(url, { method: 'GET', signal: ctrl.signal })
    .then(function(res) {
      clearTimeout(timer);
      if (!res.ok) { throw new Error('HTTP ' + res.status + ' for ' + filename); }
      return res.text();
    })
    .catch(function(err) {
      clearTimeout(timer);
      throw err;
    });
}

function _writeAtomic(filename, body) {
  _ensureDir();
  var dir = _cacheDir();
  var tmp = path.join(dir, filename + '.tmp');
  var final = path.join(dir, filename);
  fs.writeFileSync(tmp, body, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(tmp, final);
}

function _fetchAndWriteAll() {
  if (!iptvOrg.isEnabled()) {
    _log('IPTV_ORG_ENABLED != true — skipping refresh');
    return Promise.resolve({ skipped: true });
  }
  _log('fetching ' + FILES.length + ' JSON files from ' + BASE_URL);
  var started = Date.now();
  var failed = [];
  var done = 0;
  var p = Promise.resolve();
  FILES.forEach(function(filename) {
    p = p.then(function() {
      return _fetchOne(filename)
        .then(function(body) { _writeAtomic(filename, body); done += 1; })
        .catch(function(err) { failed.push(filename + ': ' + (err && err.message ? err.message : 'unknown')); });
    });
  });
  return p.then(function() {
    var elapsed = Date.now() - started;
    if (failed.length > 0) {
      _log('partial: ' + done + '/' + FILES.length + ' OK, ' + failed.length + ' failed (' + elapsed + 'ms): ' + failed.join('; '));
    } else {
      _log('refresh complete: ' + done + '/' + FILES.length + ' files (' + elapsed + 'ms)');
    }
    if (done > 0) { iptvOrg.loadIndex(); }
    return { done: done, failed: failed, elapsed_ms: elapsed };
  });
}

function _schedule(ms) {
  if (_timer) { clearTimeout(_timer); }
  _timer = setTimeout(_runCycle, ms);
  // Don't keep Node alive just for this timer
  if (typeof _timer.unref === 'function') { _timer.unref(); }
}

function _runCycle() {
  _fetchAndWriteAll()
    .then(function(result) {
      if (result.skipped) {
        _schedule(REFRESH_INTERVAL_MS);
      } else if (result.failed && result.failed.length === FILES.length) {
        _log('all files failed — retrying in 1h');
        _schedule(RETRY_INTERVAL_MS);
      } else {
        _schedule(REFRESH_INTERVAL_MS);
      }
    })
    .catch(function(err) {
      _log('cycle threw: ' + (err && err.message ? err.message : 'unknown') + ' — retrying in 1h');
      _schedule(RETRY_INTERVAL_MS);
    });
}

function start() {
  if (_started) { return; }
  _started = true;
  if (!iptvOrg.isEnabled()) {
    _log('IPTV_ORG_ENABLED != true — refresh cron not started');
    return;
  }
  _log('starting (interval=' + (REFRESH_INTERVAL_MS / 3600000) + 'h)');
  // Kick off immediately, then 24h cadence.
  _runCycle();
}

function stop() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  _started = false;
}

module.exports = {
  start: start,
  stop: stop,
  // Exposed for tests only.
  _fetchAndWriteAll: _fetchAndWriteAll,
};
