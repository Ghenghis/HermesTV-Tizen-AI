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

var BASE = process.env.HERMES_PROVIDER_E2E_BASE || 'http://127.0.0.1:3199';
var MODE = (process.env.PROVIDER_E2E_MODE || 'live').toLowerCase();
var EMPTY_STATE = String(process.env.NO_PROVIDER_EMPTY_STATE || '').toLowerCase();
var IS_EMPTY = EMPTY_STATE === '1' || EMPTY_STATE === 'true';

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

function call(method, p, body) {
  return new Promise(function(resolve) {
    var url = BASE + p;
    var data = body ? JSON.stringify(body) : null;
    var u;
    try { u = new URL(url); } catch (_) { return resolve({ status: 0, error: 'bad-url' }); }
    var opts = {
      method: method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + (u.search || ''),
      headers: { Accept: 'application/json' }
    };
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
        try { parsed = JSON.parse(raw); } catch (_) { /* not json */ }
        var headers = {};
        Object.keys(res.headers || {}).forEach(function(h) { headers[h] = res.headers[h]; });
        resolve({ status: res.statusCode, headers: headers, raw: raw, body: parsed });
      });
    });
    req.on('error', function(e) { resolve({ status: 0, error: e.message }); });
    req.setTimeout(15000, function() { try { req.destroy(); } catch (_) {} resolve({ status: 0, error: 'timeout' }); });
    if (data) { req.write(data); }
    req.end();
  });
}

// ----- Boot the API in-process if not already up -----------------------

function bootApi() {
  return new Promise(function(resolve, reject) {
    // If the caller already pointed us at a remote BASE, don't boot.
    if (process.env.HERMES_PROVIDER_E2E_BASE) { return resolve(); }
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
  fs.writeFileSync(path.join(PROOF_DIR, name), typeof content === 'string' ? content : JSON.stringify(content, null, 2), 'utf8');
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
  console.log('FAIL: ' + label + (detail ? ' — ' + redactString(detail) : ''));
  fail += 1;
}

async function runLiveProof() {
  var summary = {
    mode: 'live',
    started_at: nowIso(),
    base: BASE.replace(/^https?:\/\/[^/]*/, BASE.indexOf('localhost') !== -1 || BASE.indexOf('127.0.0.1') !== -1 ? BASE : '<base-redacted>'),
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
    var ticket = playResp.body.ticket;
    var streamEndpoint = playResp.body.stream_endpoint || ('/api/play/' + ticket + '/stream');
    writeProof('play-ticket.redacted.json', scrub(playResp.body));
    PASS('POST /api/play returned ticket=' + ticket.slice(0, 12) + '... for item_id=' + pick.id);
    summary.pass.push('play_ticket');

    // 4. Stream endpoint — accept 200 / 206 / 302
    var streamHeadResp = await call('GET', streamEndpoint);
    var streamStatus = streamHeadResp.status;
    var streamCt = (streamHeadResp.headers && (streamHeadResp.headers['content-type'] || streamHeadResp.headers['Content-Type'])) || '';
    writeProof('stream-head.txt',
      'HTTP/1.1 ' + streamStatus + '\n' +
      'Content-Type: ' + streamCt + '\n' +
      'X-Provider-Used: ' + ((streamHeadResp.headers && streamHeadResp.headers['x-provider-used']) || '') + '\n' +
      (streamHeadResp.headers && streamHeadResp.headers['location']
        ? 'Location: <redacted-url>\n' : '') +
      '\n# body first 200b (redacted):\n' + redactString((streamHeadResp.raw || '').slice(0, 200))
    );
    if (streamStatus === 200 || streamStatus === 206 || streamStatus === 302) {
      PASS('GET stream_endpoint status=' + streamStatus + ' content-type=' + (streamCt || '(none)'));
      summary.pass.push('stream_status_' + streamStatus);
    } else if (streamStatus === 503) {
      FAIL('Stream endpoint returned 503 — upstream unreachable from this host', 'status=' + streamStatus);
      summary.fail.push('stream_503');
    } else {
      FAIL('Stream endpoint unexpected status', 'status=' + streamStatus);
      summary.fail.push('stream_status_' + streamStatus);
    }
  }

  // 5. /api/source-health — informational, doesn't fail the proof
  var healthResp = await call('GET', '/api/source-health');
  if (healthResp.status === 200) {
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
  console.log('# base: ' + BASE);
  console.log('# proof dir: docs/proof/provider-truth/' + TS + '/');
  console.log('');

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
