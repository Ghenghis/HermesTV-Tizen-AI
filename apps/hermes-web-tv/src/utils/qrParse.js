// qrParse.js — pure ES5 parser for QR-decoded provider payloads (W20-PROVIDERS).
//
// Mirror of services/hermes-tv-api/src/routes/providers.js → _parseQrText().
// Operator phones / cameras / clipboard paste can all produce the same set of
// shapes, but parsing locally lets the confirm sub-step in AddProviderModal
// render the parsed fields without a server round-trip. The server still
// re-parses on /api/providers/parse-qr as the audit boundary, but for fast
// in-app UX we run the same logic in the browser.
//
// Returns:
//   { type, label, url, username, password, epg_url, raw } on match
//   null on no match
//
// NEVER logs the parsed values — credentials may travel through this function
// and should never reach the JS console.
//
// Accepted shapes:
//   1. Plain M3U URL                 (https:// ... .m3u/.m3u8/.xspf)
//   2. xtream:// URI                 (xtream://user:pass@host:port[?label=Name])
//   3. JSON blob                     ({ url, username, password, epg_url, label, type })
//   4. Xtream M3U-export URL         (http(s)://host/get.php?username=...&password=...)
//   5. Bare HTTP URL fallback        (any http(s):// under 2048 chars)
//
// Tizen 6.5 / Chrome 76 safe: no arrow functions in callbacks, no
// destructuring, no template literals, no optional chaining, var only.

function _shape(type, label, url, username, password, epgUrl, raw) {
  return {
    type: type,
    label: String(label || 'Imported provider').slice(0, 80),
    url: String(url || '').slice(0, 2048),
    username: (typeof username === 'string' && username.length > 0) ? username : undefined,
    password: (typeof password === 'string' && password.length > 0) ? password : undefined,
    epg_url: (typeof epgUrl === 'string' && epgUrl.length > 0) ? epgUrl : undefined,
    raw: typeof raw === 'string' ? raw.slice(0, 4096) : ''
  };
}

export function parseQrPayload(text) {
  if (typeof text !== 'string') { return null; }
  var trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 8192) { return null; }

  // 3. JSON blob
  if (trimmed.charAt(0) === '{') {
    try {
      var obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') {
        var url = typeof obj.url === 'string' ? obj.url : (typeof obj.server === 'string' ? obj.server : '');
        var u = typeof obj.username === 'string' ? obj.username : (typeof obj.user === 'string' ? obj.user : undefined);
        var p = typeof obj.password === 'string' ? obj.password : (typeof obj.pass === 'string' ? obj.pass : undefined);
        var lbl = typeof obj.label === 'string' ? obj.label : (typeof obj.name === 'string' ? obj.name : 'Imported provider');
        var epg = typeof obj.epg_url === 'string' ? obj.epg_url : (typeof obj.epg === 'string' ? obj.epg : undefined);
        var type = typeof obj.type === 'string' ? obj.type : null;
        if (url) {
          if (!type) { type = (u && p) ? 'xtream' : 'm3u'; }
          return _shape(type, lbl, url, u, p, epg, trimmed);
        }
      }
    } catch (_e) { /* fall through */ }
  }

  // 2. xtream:// URI scheme - operator welcome emails often ship this
  if (/^xtream:\/\//i.test(trimmed)) {
    try {
      var sansScheme = trimmed.replace(/^xtream:\/\//i, '');
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
      var lbl2 = 'Xtream provider';
      if (query.length > 0) {
        var params = query.split('&');
        for (var i = 0; i < params.length; i++) {
          var kv = params[i].split('=');
          if (kv[0] === 'label' && kv[1]) { lbl2 = decodeURIComponent(kv[1]); }
        }
      }
      if (hostPart.length === 0) { return null; }
      return _shape('xtream', lbl2, 'http://' + hostPart, user, pw, undefined, trimmed);
    } catch (_e2) { /* fall through */ }
  }

  // 4. Xtream M3U-export URL - has username= and password= in query.
  // The CI secret-scan ALLOW_RE allows this file to reference these patterns
  // (see .github/workflows/ci.yml ALLOW_RE update).
  if (/^https?:\/\//i.test(trimmed) &&
      /[?&]username=/i.test(trimmed) &&
      /[?&]password=/i.test(trimmed)) {
    try {
      var u4 = new URL(trimmed);
      var u4User = u4.searchParams.get('username') || '';
      var u4Pass = u4.searchParams.get('password') || '';
      var u4Host = u4.origin;
      return _shape('xtream', 'Xtream provider', u4Host, u4User, u4Pass, undefined, trimmed);
    } catch (_e3) { /* fall through */ }
  }

  // 1. Plain playlist URL - .m3u/.m3u8/.xspf
  if (/^https?:\/\//i.test(trimmed) && /\.(m3u8?|xspf)(\?|$)/i.test(trimmed)) {
    var lblGuess = 'Playlist';
    try {
      var u1 = new URL(trimmed);
      lblGuess = (u1.hostname || 'Playlist').replace(/^www\./, '');
    } catch (_e4) { /* default */ }
    return _shape('m3u', lblGuess, trimmed, undefined, undefined, undefined, trimmed);
  }

  // 5. Bare HTTP URL fallback - operator may have a playlist URL without
  //    a recognised extension. Default to m3u type with a hostname label.
  if (/^https?:\/\//i.test(trimmed) && trimmed.length < 2048) {
    var lblGuess2 = 'Playlist';
    try {
      var u5 = new URL(trimmed);
      lblGuess2 = (u5.hostname || 'Playlist').replace(/^www\./, '');
    } catch (_e5) { /* default */ }
    return _shape('m3u', lblGuess2, trimmed, undefined, undefined, undefined, trimmed);
  }

  return null;
}

export default { parseQrPayload: parseQrPayload };
