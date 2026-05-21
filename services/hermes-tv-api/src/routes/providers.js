'use strict';

/**
 * routes/providers.js — CRUD + test + QR-parse endpoints for the multi-provider
 * onboarding store (W20-PROVIDERS).
 *
 * Mirrors TiviMate / IPTV Smarters "Add a Playlist" surfaces — operators can
 * paste M3U URLs, Xtream Codes credentials, or scan a QR code from their
 * paid-provider welcome email.
 *
 * Endpoints:
 *   GET    /api/providers              → masked list
 *   POST   /api/providers              → add (returns masked row)
 *   PATCH  /api/providers/:id          → partial update (returns masked row)
 *   DELETE /api/providers/:id          → 204
 *   POST   /api/providers/:id/test     → fire a real catalog fetch and
 *                                        return { ok, items_seen, error }
 *   POST   /api/providers/parse-qr     → server-side parser for decoded QR
 *                                        text. Returns { type, label, url,
 *                                        username, password, epg_url } so
 *                                        the client can show a confirm step
 *                                        before saving.
 *
 * Credential safety:
 *   - The masked /api/providers list never includes username/password — only
 *     `has_username` / `has_password` flags and the URL HOST (no path or
 *     query).
 *   - POST /api/providers/parse-qr is the ONLY endpoint that returns the
 *     parsed username/password — and it returns them back to the same
 *     client that just submitted the raw QR text. Server doesn't persist
 *     the parse-qr payload; the client must POST to /api/providers to save.
 *   - middleware/credentialGuard.js runs after every res.json() and would
 *     bounce any response that accidentally matched a known credential
 *     pattern (player_api.php / get.php?username= / m3u_plus).
 */

var Router = require('express').Router;
var providerStore = require('../lib/providerStore');
var providerRegistry = require('../lib/providerRegistry');
var SANITIZE = require('../lib/sanitizeLog').sanitizeForLog;

var router = Router();

// ---------------------------------------------------------------------------
// GET /api/providers — masked list
// ---------------------------------------------------------------------------
router.get('/api/providers', function(req, res) {
  // Per Provider Truth Contract (docs/46): /api/providers MUST be a real
  // registry, not a static list. providerRegistry merges env-derived
  // providers (APOLLO_M3U_URL, XTREMEHD_M3U_URL, XTREAM_URL+USERNAME+PASSWORD,
  // JELLYFIN_URL+API_KEY, IPTV_ORG_ENABLED) with operator-added disk-stored
  // providers from providerStore. Both lanes return the SAME masked shape so
  // no caller can tell whether a credential lives in env or on disk.
  providerRegistry.list().then(function(rows) {
    res.json({
      providers: rows,
      total: rows.length,
      _meta: {
        env_count: rows.filter(function(r) { return r.source === 'env'; }).length,
        config_count: rows.filter(function(r) { return r.source === 'config'; }).length
      }
    });
  }).catch(function(err) {
    console.warn('[providers] list failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'list_failed', message: 'Could not load provider list.' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/providers — add (returns masked row)
// ---------------------------------------------------------------------------
router.post('/api/providers', function(req, res) {
  var body = req.body || {};
  providerRegistry.add({
    type: body.type,
    provider_id: body.provider_id,
    label: body.label,
    url: body.url,
    username: body.username,
    password: body.password,
    epg_url: body.epg_url,
  }).then(function(masked) {
    res.status(201).json({ provider: masked });
  }).catch(function(err) {
    if (err && err.code === 'VALIDATION_FAILED') {
      return res.status(400).json({ error: 'validation_failed', errors: err.errors || [err.message] });
    }
    console.warn('[providers] add failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'add_failed', message: 'Could not save provider.' });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/providers/:id — partial update (returns masked row)
// ---------------------------------------------------------------------------
router.patch('/api/providers/:id', function(req, res) {
  var id = String(req.params.id || '');
  if (!/^prov-[a-f0-9]{1,16}$/.test(id)) {
    return res.status(400).json({ error: 'validation_failed', errors: ['id must match prov-<hex>'] });
  }
  providerRegistry.update(id, req.body || {}).then(function(masked) {
    if (!masked) { return res.status(404).json({ error: 'not_found', id: id }); }
    res.json({ provider: masked });
  }).catch(function(err) {
    if (err && err.code === 'VALIDATION_FAILED') {
      return res.status(400).json({ error: 'validation_failed', errors: err.errors || [err.message] });
    }
    console.warn('[providers] update failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'update_failed', message: 'Could not update provider.' });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/providers/:id → 204
// ---------------------------------------------------------------------------
router.delete('/api/providers/:id', function(req, res) {
  var id = String(req.params.id || '');
  if (!/^prov-[a-f0-9]{1,16}$/.test(id)) {
    return res.status(400).json({ error: 'validation_failed', errors: ['id must match prov-<hex>'] });
  }
  providerStore.remove(id).then(function(ok) {
    if (!ok) { return res.status(404).json({ error: 'not_found', id: id }); }
    res.status(204).end();
  }).catch(function(err) {
    console.warn('[providers] remove failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'remove_failed', message: 'Could not remove provider.' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/providers/:id/test → kick off a real fetch via m3uClient or
//                                xtreamClient. Returns { ok, items_seen, error }.
// ---------------------------------------------------------------------------
router.post('/api/providers/:id/test', function(req, res) {
  var id = String(req.params.id || '');
  if (!/^prov-[a-f0-9]{1,16}$/.test(id)) {
    return res.status(400).json({ error: 'validation_failed', errors: ['id must match prov-<hex>'] });
  }
  providerStore.listFull().then(function(rows) {
    var row = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) { row = rows[i]; break; }
    }
    if (!row) {
      return res.status(404).json({ error: 'not_found', id: id });
    }
    if (row.type === 'm3u') {
      return _testM3u(row).then(function(result) {
        providerStore.recordTest(id, result.ok, result.error).then(function() { /* persisted */ }).catch(function() { /* non-fatal */ });
        res.json(result);
      });
    }
    if (row.type === 'xtream') {
      return _testXtream(row).then(function(result) {
        providerStore.recordTest(id, result.ok, result.error).then(function() { /* persisted */ }).catch(function() { /* non-fatal */ });
        res.json(result);
      });
    }
    if (row.type === 'stalker') {
      // Stalker portal — no client implementation yet (see PlaylistImportModal
      // comment about Stalker removal in wave-19). Return an honest failure
      // so the UI surfaces "not supported" rather than fake success.
      var msg = 'Stalker portal test not supported yet — paste the M3U export URL instead.';
      providerStore.recordTest(id, false, msg).then(function() { /* persisted */ }).catch(function() { /* non-fatal */ });
      return res.json({ ok: false, items_seen: 0, error: msg });
    }
    return res.status(400).json({ error: 'unsupported_type', message: 'Unknown provider type: ' + row.type });
  }).catch(function(err) {
    console.warn('[providers] test failed: ' + SANITIZE(err && err.message ? err.message : 'unknown'));
    res.status(500).json({ error: 'test_failed', message: 'Could not test provider.' });
  });
});

// ---------------------------------------------------------------------------
// POST /api/providers/parse-qr — server-side QR text parser.
// Body: { text: '<decoded QR>' }
// Returns: { type, label, url, username, password, epg_url } — caller then
// POSTs /api/providers to save.
// ---------------------------------------------------------------------------
router.post('/api/providers/parse-qr', function(req, res) {
  var body = req.body || {};
  var text = (typeof body.text === 'string') ? body.text.trim() : '';
  if (text.length === 0) {
    return res.status(400).json({ error: 'validation_failed', errors: ['text is required'] });
  }
  if (text.length > 4096) {
    return res.status(400).json({ error: 'validation_failed', errors: ['text must be <= 4096 chars'] });
  }
  var parsed = _parseQrText(text);
  if (!parsed) {
    return res.status(422).json({
      error: 'unrecognised_format',
      message: 'Could not recognise the QR payload. Try Manual entry.',
    });
  }
  res.json({ parsed: parsed });
});

// ---------------------------------------------------------------------------
// Internal: _testM3u / _testXtream — server-side validation by actual fetch.
// ---------------------------------------------------------------------------

function _testM3u(row) {
  // Lightweight smoke probe: HEAD or a short-range GET to confirm the URL
  // is reachable and returns an M3U-shaped body. We don't fully parse here
  // — that's m3uClient's job once the row is wired into env or store.
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, 8000);
  return fetch(row.url, { method: 'GET', signal: ctrl.signal })
    .then(function(r) {
      clearTimeout(timer);
      if (!r.ok) {
        return { ok: false, items_seen: 0, error: 'HTTP ' + r.status };
      }
      return r.text().then(function(text) {
        var head = (text || '').slice(0, 4096);
        if (head.indexOf('#EXTM3U') === -1 && head.indexOf('#EXTINF') === -1) {
          return { ok: false, items_seen: 0, error: 'Response did not contain #EXTM3U or #EXTINF' };
        }
        var count = (text.match(/#EXTINF:/g) || []).length;
        return { ok: true, items_seen: count, error: null };
      });
    })
    .catch(function(err) {
      clearTimeout(timer);
      var msg = (err && err.message) ? err.message : 'unknown';
      return { ok: false, items_seen: 0, error: SANITIZE(msg) };
    });
}

function _testXtream(row) {
  // Probe the Xtream Codes panel's no-action endpoint which returns
  // { user_info, server_info }. auth=1 means the credentials work.
  var url = row.url.replace(/\/+$/, '');
  var qs = 'username=' + encodeURIComponent(row.username || '') +
           '&password=' + encodeURIComponent(row.password || '');
  var fullUrl = url + '/player_api.php?' + qs;
  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, 8000);
  return fetch(fullUrl, { method: 'GET', signal: ctrl.signal, headers: { 'Accept': 'application/json' } })
    .then(function(r) {
      clearTimeout(timer);
      if (!r.ok) {
        return { ok: false, items_seen: 0, error: 'HTTP ' + r.status };
      }
      return r.text().then(function(text) {
        var parsed;
        try { parsed = JSON.parse(text); }
        catch (_) { return { ok: false, items_seen: 0, error: 'Non-JSON response (panel may be down)' }; }
        if (parsed && parsed.user_info && Number(parsed.user_info.auth) === 1) {
          var active = parsed.user_info.active_cons != null ? Number(parsed.user_info.active_cons) : null;
          return { ok: true, items_seen: active != null ? active : 0, error: null };
        }
        return { ok: false, items_seen: 0, error: 'auth=0 (panel rejected credentials)' };
      });
    })
    .catch(function(err) {
      clearTimeout(timer);
      var msg = (err && err.message) ? err.message : 'unknown';
      return { ok: false, items_seen: 0, error: SANITIZE(msg) };
    });
}

// ---------------------------------------------------------------------------
// Internal: _parseQrText — recognises common QR payload formats.
// Returns null if nothing matched.
//
// Formats accepted:
//   1. Plain M3U URL (https:// ... .m3u/.m3u8)
//   2. Xtream URL scheme: xtream://user:pass@host:port[?label=Name]
//   3. JSON blob: { url, username, password, epg_url, label, type }
//   4. Xtream M3U-export form: http(s)://host/get.php?username=<value>&password=<value>&type=m3u_plus
// ---------------------------------------------------------------------------
function _parseQrText(text) {
  var trimmed = (typeof text === 'string') ? text.trim() : '';
  if (trimmed.length === 0) { return null; }

  // 3. JSON blob
  if (trimmed.charAt(0) === '{') {
    try {
      var obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        var url = typeof obj.url === 'string' ? obj.url : (typeof obj.server === 'string' ? obj.server : '');
        var username = typeof obj.username === 'string' ? obj.username : (typeof obj.user === 'string' ? obj.user : undefined);
        var password = typeof obj.password === 'string' ? obj.password : (typeof obj.pass === 'string' ? obj.pass : undefined);
        var label = typeof obj.label === 'string' ? obj.label : (typeof obj.name === 'string' ? obj.name : 'Imported provider');
        var epgUrl = typeof obj.epg_url === 'string' ? obj.epg_url : (typeof obj.epg === 'string' ? obj.epg : undefined);
        var type = typeof obj.type === 'string' ? obj.type : null;
        if (url) {
          if (!type) {
            type = (username && password) ? 'xtream' : 'm3u';
          }
          return _shapeParse(type, label, url, username, password, epgUrl);
        }
      }
    } catch (_) { /* fall through */ }
  }

  // 2. xtream:// URI scheme
  if (/^xtream:\/\//i.test(trimmed)) {
    try {
      var sansScheme = trimmed.replace(/^xtream:\/\//i, '');
      // [user[:pass]@]host[:port][?query]
      var atIdx = sansScheme.lastIndexOf('@');
      var auth = '';
      var hostPart = sansScheme;
      if (atIdx >= 0) {
        auth = sansScheme.slice(0, atIdx);
        hostPart = sansScheme.slice(atIdx + 1);
      }
      var qIdx = hostPart.indexOf('?');
      var query = '';
      if (qIdx >= 0) {
        query = hostPart.slice(qIdx + 1);
        hostPart = hostPart.slice(0, qIdx);
      }
      var user = '';
      var pw = '';
      if (auth.length > 0) {
        var colonIdx = auth.indexOf(':');
        if (colonIdx >= 0) {
          user = decodeURIComponent(auth.slice(0, colonIdx));
          pw = decodeURIComponent(auth.slice(colonIdx + 1));
        } else {
          user = decodeURIComponent(auth);
        }
      }
      var lbl = 'Xtream provider';
      if (query.length > 0) {
        var params = query.split('&');
        for (var i = 0; i < params.length; i++) {
          var kv = params[i].split('=');
          if (kv[0] === 'label' && kv[1]) { lbl = decodeURIComponent(kv[1]); }
        }
      }
      if (hostPart.length === 0) { return null; }
      // Default to http:// — operator can edit to https:// in the confirm step.
      var panelUrl = 'http://' + hostPart;
      return _shapeParse('xtream', lbl, panelUrl, user, pw, undefined);
    } catch (_) { /* fall through */ }
  }

  // 4. Xtream M3U-export form — has username= and password= in query string
  //    AND a path like /get.php. The CI secret-scan ALLOW_RE allows this
  //    file to legitimately reference these patterns (see ALLOW_RE update
  //    in .github/workflows/ci.yml).
  if (/^https?:\/\//i.test(trimmed) &&
      /[?&]username=/i.test(trimmed) &&
      /[?&]password=/i.test(trimmed)) {
    try {
      var u4 = new URL(trimmed);
      var u4User = u4.searchParams.get('username') || '';
      var u4Pass = u4.searchParams.get('password') || '';
      var u4Host = u4.origin;
      // Detect Xtream-vs-M3U: if path includes 'get.php' or query has
      // type=m3u_plus, treat the panel host as an xtream provider for the
      // store (the actual playlist URL stays as the m3u import).
      return _shapeParse('xtream', 'Xtream provider', u4Host, u4User, u4Pass, undefined);
    } catch (_) { /* fall through */ }
  }

  // 1. Plain M3U URL
  if (/^https?:\/\//i.test(trimmed) && /\.(m3u8?|xspf)(\?|$)/i.test(trimmed)) {
    var labelGuess = 'Playlist';
    try {
      var u1 = new URL(trimmed);
      labelGuess = (u1.hostname || 'Playlist').replace(/^www\./, '');
    } catch (_) { /* keep default */ }
    return _shapeParse('m3u', labelGuess, trimmed, undefined, undefined, undefined);
  }

  // Plain HTTP URL without a recognised extension — operator might have a
  // bare M3U URL without .m3u suffix. Accept as m3u with a hostname label
  // so the user can adjust in the confirm step.
  if (/^https?:\/\//i.test(trimmed) && trimmed.length < 2048) {
    var labelGuess2 = 'Playlist';
    try {
      var u2 = new URL(trimmed);
      labelGuess2 = (u2.hostname || 'Playlist').replace(/^www\./, '');
    } catch (_) { /* keep default */ }
    return _shapeParse('m3u', labelGuess2, trimmed, undefined, undefined, undefined);
  }

  return null;
}

function _shapeParse(type, label, url, username, password, epgUrl) {
  return {
    type: type,
    label: String(label || 'Imported provider').slice(0, 80),
    url: String(url || '').slice(0, 2048),
    username: (typeof username === 'string' && username.length > 0) ? username : undefined,
    password: (typeof password === 'string' && password.length > 0) ? password : undefined,
    epg_url: (typeof epgUrl === 'string' && epgUrl.length > 0) ? epgUrl : undefined,
  };
}

// Test hooks — exposed for the test/providers.route.test.js file.
router._test_parseQrText = _parseQrText;

module.exports = router;
