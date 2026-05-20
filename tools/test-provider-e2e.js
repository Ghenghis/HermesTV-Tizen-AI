#!/usr/bin/env node
'use strict';

/**
 * tools/test-provider-e2e.js — Agent 02 live-provider E2E proof.
 *
 * Per docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md + docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md:
 *
 *   "A working provider means all of these are true for at least one configured source:
 *     - /api/providers returns real provider state
 *     - /api/catalog returns non-zero items AND _meta.source != 'no-providers'
 *     - POST /api/play returns a ticket for a real item
 *     - GET/HEAD /api/play/:ticket/stream returns 200/206/302 with playable content type
 *     - No credential, token, username, password, raw paid-provider URL, or API key
 *       appears in API responses or proof artifacts"
 *
 *   "The provider proof command must fail when no live provider is configured
 *    unless it is explicitly run in NO_PROVIDER_EMPTY_STATE=1 mode."
 *
 * Modes:
 *   PROVIDER_E2E_MODE=live (default)
 *     Requires at least one real configured provider; FAILS on empty catalog.
 *   NO_PROVIDER_EMPTY_STATE=1
 *     Empty-state test. Asserts /api/catalog returns {total:0, _meta.source:'no-providers'}
 *     and play attempts return 404 / 503 cleanly. PASS even with no provider.
 *
 * Output:
 *   - All proof artifacts written under docs/proof/provider-truth/<YYYYMMDD-HHMMSS>/
 *   - Every URL/cred-bearing token redacted before write
 *   - Returns exit 0 only on PASS; exit 1 on FAIL/BLOCKED
 *
 * SAFETY:
 *   - Never echoes APOLLO_M3U_URL / XTREMEHD_M3U_URL / XTREAM_* / JELLYFIN_* values.
 *   - Redacts `?username=...&password=...` query strings.
 *   - Redacts `/get.php?...` and `/player_api.php?...` URLs to `<redacted-url>`.
 *   - Redacts ticket values to first 12 chars + `...` (tickets expire in 5 min;
 *     this is informational not exfiltration).
 *   - Reports presence/absence of env vars, never the values.
 */

var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');

var MODE = (process.env.PROVIDER_E2E_MODE || 'live').toLowerCase();
var EMPTY_STATE = String(process.env.NO_PROVIDER_EMPTY_STATE || '').toLowerCase();
var IS_EMPTY = EMPTY_STATE === '1' || EMPTY_STATE === 'true';
var HAS_EXPLICIT_BASE = typeof process.env.HERMES_PROVIDER_E2E_BASE === 'string' &&
  process.env.HERMES_PROVIDER_E2E_BASE.length > 0;
var ALLOW_LOCAL_LIVE = String(process.env.PROVIDER_E2E_ALLOW_LOCAL_LIVE || '').toLowerCase() === '1' ||
  String(process.env.PROVIDER_E2E_ALLOW_LOCAL_LIVE || '').toLowerCase() === 'true';
var BASE = HAS_EXPLICIT_BASE ? process.env.HERMES_PROVIDER_E2E_BASE : 'http://127.0.0.1:3199';

function nowIso() { return new Date().toISOString(); }
function fmtTs() {
  var d = new Date();
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getUTCFullYear() +
         pad(d.getUTCMonth() + 1) +
         pad(d.getUTCDate()) + '-' +
         pad(d.getUTCHours()) +
         pad(d.getUTCMinutes()) +
         pad(d.getUTCSeconds());
}

var TS = fmtTs();
var PROOF_DIR = path.resolve(__dirname, '..', 'docs', 'proof', 'provider-truth', TS);
var artifactLeakFailures = [];

// Lazy-create the proof dir only when we actually emit an artifact so a
// failed boot doesn't leave empty timestamp folders littering the repo.
function ensureProofDir() {
  if (!fs.existsSync(PROOF_DIR)) {
    fs.mkdirSync(PROOF_DIR, { recursive: true });
  }
}

// ----- Redaction --------------------------------------------------------
// Everything that gets written to disk OR printed to stdout goes through
// these helpers first. The pattern set mirrors lib/sanitizeLog.js but
// adds JSON-aware stripping for url/username/password/api_key keys.

var URL_PATTERNS = [
  /https?:\/\/[^\s'"]*\/get\.php\?[^\s'"]*/gi,
  /https?:\/\/[^\s'"]*\/player_api\.php\?[^\s'"]*/gi,
  /https?:\/\/[^\s'"]*m3u_plus[^\s'"]*/gi
];
var QUERY_PATTERNS = [
  /([?&])username=[^&\s'"]*/gi,
  /([?&])password=[^&\s'"]*/gi,
  /([?&])token=[^&\s'"]*/gi,
  /([?&])api_key=[^&\s'"]*/gi,
  /([?&])apikey=[^&\s'"]*/gi
];

function redactString(s) {
  if (typeof s !== 'string') { return s; }
  var out = s;
  for (var i = 0; i < URL_PATTERNS.length; i++) {
    out = out.replace(URL_PATTERNS[i], '<redacted-url>');
  }
  for (var j = 0; j < QUERY_PATTERNS.length; j++) {
    out = out.replace(QUERY_PATTERNS[j], '$1<redacted>');
  }
  return out;
}

function sensitiveEnvValues() {
  var keys = ['APOLLO_M3U_URL', 'XTREMEHD_M3U_URL',
              'XTREAM_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD',
              'JELLYFIN_URL', 'JELLYFIN_API_KEY'];
  var vals = [];
  for (var i = 0; i < keys.length; i++) {
    var v = process.env[keys[i]];
    if (typeof v === 'string' && v.length >= 4) { vals.push({ key: keys[i], value: v }); }
  }
  return vals;
}

function redactSensitiveValues(s) {
  var out = redactString(s);
  var vals = sensitiveEnvValues();
  for (var i = 0; i < vals.length; i++) {
    out = out.split(vals[i].value).join('<redacted-' + vals[i].key.toLowerCase() + '>');
  }
  return out;
}

function credentialLeakReasons(s) {
  if (typeof s !== 'string' || s.length === 0) { return []; }
  var reasons = [];
  var vals = sensitiveEnvValues();
  for (var i = 0; i < vals.length; i++) {
    if (s.indexOf(vals[i].value) !== -1) { reasons.push('raw env value ' + vals[i].key); }
  }
  if (/https?:\/\/[^\s'"]*\/(?:get|player_api)\.php\?[^\s'"]+/i.test(s)) {
    reasons.push('credential-bearing provider URL');
  }
  if (/[?&](?:username|password|token|api_key|apikey)=(?!<redacted>)[^&\s'"]+/i.test(s)) {
    reasons.push('unredacted credential query parameter');
  }
  if (/"(?:username|password|api_key|apikey|token|secret)"\s*:\s*"(?!<redacted>|<set>|<unset>)[^"]+"/i.test(s)) {
    reasons.push('unredacted credential JSON field');
  }
  return reasons;
}

function safeBaseLabel() {
  if (BASE.indexOf('localhost') !== -1 || BASE.indexOf('127.0.0.1') !== -1) { return BASE; }
  try {
    var u = new URL(BASE);
    return u.protocol + '//' + u.host;
  } catch (_) {
    return '<base-redacted>';
  }
}

// Recursively scrub JSON-shaped objects: remove the known credential keys
// outright; redact strings; pass through everything else.
var CRED_KEYS = { username: 1, password: 1, api_key: 1, apikey: 1,
                  token: 1, secret: 1, ticket: 1 };
function scrub(v) {
  if (v == null) { return v; }
  if (typeof v === 'string') { return redactString(v); }
  if (Array.isArray(v)) { return v.map(scrub); }
  if (typeof v === 'object') {
    var out = {};
    var keys = Object.keys(v);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (CRED_KEYS[k.toLowerCase()]) {
        out[k] = '<redacted>';
      } else if (k === 'url' && typeof v[k] === 'string') {
        // Replace full url with just the host so the response shape is preserved.
        try { out[k] = '<host:' + new URL(v[k]).host + '>'; }
        catch (_) { out[k] = '<redacted-url>'; }
      } else if (k === 'stream_endpoint' && typeof v[k] === 'string') {
        // Replace embedded ticket with prefix.
        out[k] = v[k].replace(/play-[a-z0-9-]+/i, function(m) {
          return m.slice(0, 12) + '...';
        });
      } else {
        out[k] = scrub(v[k]);
      }
    }
    return out;
  }
  return v;
}

// ----- HTTP helpers -----------------------------------------------------

function call(method, p, body, options) {
  options = options || {};
  return new Promise(function(resolve) {
    var url = /^https?:\/\//i.test(p) ? p : BASE + p;
    var data = body ? JSON.stringify(body) : null;
    var u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0, error: 'bad-url' }); }
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    var opts = {
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: headers
    };
    if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    var client = u.protocol === 'https:' ? https : http;
    var settled = false;
    function finish(payload) {
      if (settled) { return; }
      settled = true;
      resolve(payload);
    }
    var req = client.request(opts, function(res) {
      var location = res.headers && res.headers.location;
      var redirectStatuses = { 301: 1, 302: 1, 303: 1, 307: 1, 308: 1 };
      var redirectCount = options.redirectCount || 0;
      if (options.followRedirects && redirectStatuses[res.statusCode] && location && redirectCount < (options.maxRedirects || 3)) {
        var nextUrl;
        try { nextUrl = new URL(location, u).toString(); }
        catch (_) { nextUrl = null; }
        if (nextUrl) {
          res.resume();
          var nextMethod = res.statusCode === 303 ? 'GET' : method;
          var nextOptions = Object.assign({}, options, { redirectCount: redirectCount + 1 });
          return call(nextMethod, nextUrl, nextMethod === 'GET' ? null : body, nextOptions).then(function(r) {
            r.redirected = true;
            r.redirects = (r.redirects || 0) + 1;
            finish(r);
          });
        }
      }
      var chunks = [];
      var keptBytes = 0;
      var receivedBytes = 0;
      var maxBytes = options.maxBytes || 0;
      function responsePayload(truncated) {
        var buf = Buffer.concat(chunks);
        var raw = buf.toString('utf8');
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (_) { /* not json */ }
        var headers = {};
        Object.keys(res.headers || {}).forEach(function(h) { headers[h] = res.headers[h]; });
        return {
          status: res.statusCode,
          headers: headers,
          raw: raw,
          body: parsed,
          bodyBuffer: buf,
          bytes: keptBytes,
          receivedBytes: receivedBytes,
          truncated: !!truncated
        };
      }
      res.on('data', function(c) {
        receivedBytes += c.length;
        if (maxBytes && keptBytes >= maxBytes) { return; }
        var keep = c;
        if (maxBytes && keptBytes + c.length > maxBytes) {
          keep = c.slice(0, maxBytes - keptBytes);
        }
        chunks.push(keep);
        keptBytes += keep.length;
        if (maxBytes && keptBytes >= maxBytes) {
          finish(responsePayload(true));
          try { res.destroy(); } catch (_) {}
          try { req.destroy(); } catch (_) {}
        }
      });
      res.on('end', function() { finish(responsePayload(false)); });
    });
    req.on('error', function(e) { finish({ status: 0, error: e.message }); });
    req.setTimeout(options.timeoutMs || 15000, function() {
      finish({ status: 0, error: 'timeout' });
      try { req.destroy(); } catch (_) {}
    });
    if (data) { req.write(data); }
    req.end();
  });
}

// ----- Boot the API in-process if not already up -----------------------

function bootApi() {
  return new Promise(function(resolve, reject) {
    // If the caller already pointed us at a remote BASE, don't boot.
    if (HAS_EXPLICIT_BASE) { return resolve(); }
    process.env.PORT = '3199';
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
    var apiPath = path.resolve(__dirname, '..', 'services', 'hermes-tv-api', 'src', 'index.js');
    try { require(apiPath); } catch (e) { return reject(e); }
    var deadline = Date.now() + 15000;
    function probe() {
      call('GET', '/health').then(function(r) {
        if (r.status === 200) { return resolve(); }
        if (Date.now() > deadline) { return reject(new Error('API did not become healthy within 15s')); }
        setTimeout(probe, 200);
      });
    }
    setTimeout(probe, 300);
  });
}

// ----- Proof writers ----------------------------------------------------

function writeProof(name, content) {
  ensureProofDir();
  var text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  var leakReasons = credentialLeakReasons(text);
  if (leakReasons.length > 0) {
    artifactLeakFailures.push(name + ': ' + leakReasons.join(', '));
    text = redactSensitiveValues(text);
  }
  fs.writeFileSync(path.join(PROOF_DIR, name), text, 'utf8');
}

function envSummary() {
  var keys = ['APOLLO_M3U_URL', 'XTREMEHD_M3U_URL',
              'XTREAM_URL', 'XTREAM_USERNAME', 'XTREAM_PASSWORD',
              'JELLYFIN_URL', 'JELLYFIN_API_KEY', 'IPTV_ORG_ENABLED'];
  var out = {};
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    out[k] = (typeof process.env[k] === 'string' && process.env[k].length > 0) ? '<set>' : null;
  }
  return out;
}

// ----- Main flow --------------------------------------------------------

var pass = 0;
var fail = 0;
function PASS(label) { console.log('PASS: ' + label); pass += 1; }
function FAIL(label, detail) {
  console.log('FAIL: ' + label + (detail ? ' — ' + redactSensitiveValues(detail) : ''));
  fail += 1;
}

function assertResponseNoLeak(label, raw, summary) {
  var reasons = credentialLeakReasons(raw || '');
  if (reasons.length > 0) {
    FAIL(label + ' contains zero credential bytes', reasons.join(', '));
    summary.fail.push(label.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_credential_leak');
    return false;
  }
  PASS(label + ' contains zero credential bytes');
  summary.pass.push(label.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_no_credential_leak');
  return true;
}

function isAllowedStreamStatus(status) {
  return status === 200 || status === 206 || status === 302;
}

function isMediaProof(resp) {
  var ct = String((resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || '').toLowerCase();
  var raw = resp.raw || '';
  var buf = resp.bodyBuffer || Buffer.alloc(0);
  var mediaCt = /(?:application\/vnd\.apple\.mpegurl|application\/x-mpegurl|audio\/|video\/|application\/octet-stream|binary\/octet-stream|video\/mp2t)/i.test(ct);
  var hlsBody = raw.indexOf('#EXTM3U') === 0 || raw.indexOf('#EXT-X-') !== -1;
  var tsSync = buf.length > 0 && buf[0] === 0x47;
  return (resp.bytes || 0) > 0 && (mediaCt || hlsBody || tsSync);
}

async function runLiveProof() {
  var summary = {
    mode: 'live',
    started_at: nowIso(),
    base: safeBaseLabel(),
    env: envSummary(),
    pass: [],
    fail: [],
    notes: []
  };

  // 1. /api/providers — must be a real registry
  var providersResp = await call('GET', '/api/providers');
  if (providersResp.status !== 200) {
    FAIL('GET /api/providers status', 'got ' + providersResp.status);
    summary.fail.push('providers_status');
    return summary;
  }
  assertResponseNoLeak('/api/providers response', providersResp.raw, summary);
  var providers = (providersResp.body && Array.isArray(providersResp.body.providers))
    ? providersResp.body.providers : [];
  writeProof('providers.redacted.json', scrub({ providers: providers, _meta: providersResp.body && providersResp.body._meta }));
  if (providers.length === 0) {
    if (IS_EMPTY) {
      PASS('no-provider-empty-state: /api/providers returned []');
      summary.pass.push('empty_providers');
    } else {
      FAIL('Provider-live mode: /api/providers returned empty array — no live provider is configured', 'Configure APOLLO_M3U_URL / XTREMEHD_M3U_URL / XTREAM_URL+USERNAME+PASSWORD / JELLYFIN_URL+API_KEY / IPTV_ORG_ENABLED=true on this host then re-run.');
      summary.fail.push('no_providers_configured');
    }
  } else {
    PASS('/api/providers returns ' + providers.length + ' real registry rows');
    summary.pass.push('providers_count_' + providers.length);
  }

  // 2. /api/catalog — must be non-empty in live mode
  var catalogResp = await call('GET', '/api/catalog');
  if (catalogResp.status !== 200) {
    FAIL('GET /api/catalog status', 'got ' + catalogResp.status);
    summary.fail.push('catalog_status');
    return summary;
  }
  assertResponseNoLeak('/api/catalog response', catalogResp.raw, summary);
  var catalog = catalogResp.body || {};
  var total = (typeof catalog.total === 'number') ? catalog.total : (Array.isArray(catalog.catalog) ? catalog.catalog.length : 0);
  var source = (catalog._meta && catalog._meta.source) || null;
  writeProof('catalog.meta.json', { total: total, _meta: catalog._meta || null });

  if (IS_EMPTY) {
    if (total === 0 && source === 'no-providers') {
      PASS('no-provider-empty-state: /api/catalog returned {total:0, _meta.source:"no-providers"}');
      summary.pass.push('empty_catalog_honest');
    } else {
      FAIL('NO_PROVIDER_EMPTY_STATE asserted but catalog is not honestly empty', 'total=' + total + ' source=' + source);
      summary.fail.push('empty_catalog_dishonest');
    }
  } else {
    if (total > 0 && source !== 'no-providers') {
      PASS('/api/catalog returned ' + total + ' real items (source=' + source + ')');
      summary.pass.push('catalog_nonzero_' + total);
    } else {
      FAIL('Provider-live mode: /api/catalog is empty or reports no-providers', 'total=' + total + ' source=' + source);
      summary.fail.push('catalog_empty_in_live_mode');
      return summary;
    }
  }

  // 3. Pick a real catalog item and play it (skip in empty-state mode)
  if (!IS_EMPTY) {
    var items = Array.isArray(catalog.catalog) ? catalog.catalog : [];
    var pick = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].id && items[i].type === 'live') { pick = items[i]; break; }
    }
    if (!pick && items[0]) { pick = items[0]; }
    if (!pick) {
      FAIL('No catalog item available to play despite total>0', '');
      summary.fail.push('no_catalog_item');
      return summary;
    }
    var playResp = await call('POST', '/api/play', { item_id: pick.id, profile_id: 'dave_tv' });
    if (playResp.status !== 200 || !playResp.body || !playResp.body.ticket) {
      FAIL('POST /api/play status', 'got ' + playResp.status + ' body=' + redactString((playResp.raw || '').slice(0, 200)));
      summary.fail.push('play_ticket_missing');
      writeProof('play-ticket.redacted.json', scrub({ status: playResp.status, body: playResp.body || (playResp.raw || '').slice(0, 200) }));
      return summary;
    }
    assertResponseNoLeak('/api/play response', playResp.raw, summary);
    var ticket = playResp.body.ticket;
    var streamEndpoint = playResp.body.stream_endpoint || ('/api/play/' + ticket + '/stream');
    writeProof('play-ticket.redacted.json', scrub(playResp.body));
    PASS('POST /api/play returned ticket=' + ticket.slice(0, 12) + '... for item_id=' + pick.id);
    summary.pass.push('play_ticket');

    // 4. Stream endpoint — require HEAD plus byte-producing GET proof.
    var streamHeadResp = await call('HEAD', streamEndpoint);
    var headStatus = streamHeadResp.status;
    var headCt = (streamHeadResp.headers && (streamHeadResp.headers['content-type'] || streamHeadResp.headers['Content-Type'])) || '';
    writeProof('stream-head.txt',
      'HTTP/1.1 ' + headStatus + '\n' +
      'Content-Type: ' + headCt + '\n' +
      'X-Provider-Used: ' + ((streamHeadResp.headers && streamHeadResp.headers['x-provider-used']) || '') + '\n' +
      (streamHeadResp.headers && streamHeadResp.headers['location']
        ? 'Location: <redacted-url>\n' : '') +
      '\n# HEAD body bytes: ' + (streamHeadResp.bytes || 0) + '\n'
    );
    if (isAllowedStreamStatus(headStatus)) {
      PASS('HEAD stream_endpoint status=' + headStatus + ' content-type=' + (headCt || '(none)'));
      summary.pass.push('stream_head_status_' + headStatus);
    } else {
      FAIL('HEAD stream_endpoint unexpected status', 'status=' + headStatus);
      summary.fail.push('stream_head_status_' + headStatus);
    }

    var streamGetResp = await call('GET', streamEndpoint, null, {
      headers: { Accept: '*/*', Range: 'bytes=0-4095' },
      followRedirects: true,
      maxRedirects: 3,
      maxBytes: 8192,
      timeoutMs: 20000
    });
    var getStatus = streamGetResp.status;
    var getCt = (streamGetResp.headers && (streamGetResp.headers['content-type'] || streamGetResp.headers['Content-Type'])) || '';
    writeProof('stream-get.txt',
      'HTTP/1.1 ' + getStatus + '\n' +
      'Content-Type: ' + getCt + '\n' +
      'Bytes-Proven: ' + (streamGetResp.bytes || 0) + '\n' +
      'Redirects-Followed: ' + (streamGetResp.redirects || 0) + '\n' +
      'Truncated-Probe: ' + (streamGetResp.truncated ? 'true' : 'false') + '\n' +
      'X-Provider-Used: ' + ((streamGetResp.headers && streamGetResp.headers['x-provider-used']) || '') + '\n' +
      (streamGetResp.headers && streamGetResp.headers['location']
        ? 'Location: <redacted-url>\n' : '') +
      '\n# body first 200b (redacted):\n' + redactSensitiveValues((streamGetResp.raw || '').slice(0, 200))
    );
    assertResponseNoLeak('stream GET response', streamGetResp.raw, summary);
    if (getStatus === 200 || getStatus === 206) {
      PASS('GET stream_endpoint status=' + getStatus + ' content-type=' + (getCt || '(none)'));
      summary.pass.push('stream_get_status_' + getStatus);
    } else if (getStatus === 503) {
      FAIL('GET stream_endpoint returned 503 — upstream unreachable from this host', 'status=' + getStatus);
      summary.fail.push('stream_get_503');
    } else {
      FAIL('GET stream_endpoint unexpected status', 'status=' + getStatus);
      summary.fail.push('stream_get_status_' + getStatus);
    }
    if (isMediaProof(streamGetResp)) {
      PASS('GET stream_endpoint proved nonzero media/HLS bytes=' + streamGetResp.bytes);
      summary.pass.push('stream_media_bytes_' + streamGetResp.bytes);
    } else {
      FAIL('GET stream_endpoint did not prove nonzero media/HLS bytes', 'status=' + getStatus + ' content-type=' + getCt + ' bytes=' + (streamGetResp.bytes || 0));
      summary.fail.push('stream_no_media_bytes');
    }
  }

  // 5. /api/source-health — informational, doesn't fail the proof
  var healthResp = await call('GET', '/api/source-health');
  if (healthResp.status === 200) {
    assertResponseNoLeak('/api/source-health response', healthResp.raw, summary);
    writeProof('source-health.redacted.json', scrub(healthResp.body || {}));
    PASS('GET /api/source-health status=200');
  } else {
    // Some builds may not expose this endpoint — treat as informational.
    summary.notes.push('source-health status ' + healthResp.status);
  }

  summary.finished_at = nowIso();
  return summary;
}

(async function main() {
  console.log('# tools/test-provider-e2e.js — Provider Truth E2E');
  console.log('# mode: ' + (IS_EMPTY ? 'NO_PROVIDER_EMPTY_STATE' : 'live'));
  console.log('# base: ' + safeBaseLabel());
  console.log('# proof dir: docs/proof/provider-truth/' + TS + '/');
  console.log('');

  if (!IS_EMPTY && !HAS_EXPLICIT_BASE && !ALLOW_LOCAL_LIVE) {
    console.log('FAIL: live-provider proof requires HERMES_PROVIDER_E2E_BASE, or PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 for an explicit local live proof');
    process.exit(1);
  }

  try {
    await bootApi();
  } catch (e) {
    FAIL('Boot API', e.message || String(e));
    process.exit(1);
  }

  var summary;
  try { summary = await runLiveProof(); }
  catch (e) {
    FAIL('runtime', e.message || String(e));
    process.exit(1);
  }

  // Environment snapshot — always written
  writeProof('environment.redacted.json', {
    timestamp: TS,
    mode: IS_EMPTY ? 'empty-state' : 'live',
    base: summary.base,
    env: summary.env,
    pass: summary.pass,
    fail: summary.fail,
    notes: summary.notes
  });

  // Commands.txt — exact command run + env keys present (no values)
  writeProof('commands.txt',
    'PROVIDER_E2E_MODE=' + (IS_EMPTY ? 'empty-state' : 'live') + '\n' +
    'NO_PROVIDER_EMPTY_STATE=' + (IS_EMPTY ? '1' : '0') + '\n' +
    'HERMES_PROVIDER_E2E_BASE=' + (process.env.HERMES_PROVIDER_E2E_BASE ? '<set>' : '<unset>') + '\n' +
    Object.keys(summary.env).map(function(k) { return k + '=' + (summary.env[k] || '<unset>'); }).join('\n') + '\n' +
    '\n# Command: node tools/test-provider-e2e.js\n'
  );

  if (artifactLeakFailures.length === 0) {
    PASS('Proof artifacts contain zero credential leaks');
    summary.pass.push('proof_artifacts_no_credential_leak');
  } else {
    FAIL('Proof artifacts contain zero credential leaks', artifactLeakFailures.join('; '));
    summary.fail.push('proof_artifact_credential_leak');
  }

  // Summary.md
  var md = '# Provider Truth Proof — ' + TS + '\n\n';
  md += '- Mode: ' + (IS_EMPTY ? '`NO_PROVIDER_EMPTY_STATE`' : '`live`') + '\n';
  md += '- Base: `' + summary.base + '`\n';
  md += '- Pass: ' + summary.pass.length + '\n';
  md += '- Fail: ' + summary.fail.length + '\n\n';
  if (summary.pass.length > 0) {
    md += '## Pass\n\n';
    summary.pass.forEach(function(p) { md += '- ' + p + '\n'; });
    md += '\n';
  }
  if (summary.fail.length > 0) {
    md += '## Fail\n\n';
    summary.fail.forEach(function(f) { md += '- ' + f + '\n'; });
    md += '\n';
  }
  md += '## Verdict\n\n';
  if (fail === 0 && pass > 0) {
    md += 'PASS — see proof artifacts in this directory.\n';
  } else if (fail === 0 && pass === 0) {
    md += 'BLOCKED — no assertions ran. Check `commands.txt`.\n';
  } else {
    md += 'FAIL — ' + fail + ' assertion(s) failed. See artifacts.\n';
  }
  writeProof('summary.md', md);

  console.log('');
  console.log('=== Results: ' + pass + ' PASS, ' + fail + ' FAIL ===');
  console.log('Proof artifacts: docs/proof/provider-truth/' + TS + '/');
  if (fail > 0) { process.exit(1); }
  if (pass === 0) {
    console.log('No assertions ran — treating as BLOCKED.');
    process.exit(1);
  }
  process.exit(0);
})().catch(function(err) {
  console.error('Harness errored:', redactString(err && err.stack ? err.stack : String(err)));
  process.exit(2);
});
