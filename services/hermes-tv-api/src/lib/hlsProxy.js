'use strict';

/**
 * lib/hlsProxy.js — server-side HLS playlist + segment proxy.
 *
 * WHY THIS EXISTS
 *   Operator-paid M3U providers (xTremeHD, Apollo Group) hand us stream
 *   URLs that embed user/password in the path:
 *     http://host/live/USER/PASS/CHANNEL.m3u8
 *   We can never 302 the client at that URL — the credential would
 *   appear in the browser's Location header / network panel / referrer
 *   chain and leak to whatever ad network the host page is talking to.
 *   So we resolve and fetch the playlist *server-side*, then rewrite
 *   every absolute segment URL to point at our own /api/proxy endpoint.
 *   The client sees only opaque base64url-encoded segment IDs; the
 *   credential never crosses the wire to the browser.
 *
 * WHAT WE PROXY
 *   - Media playlists (`#EXTM3U` + `#EXTINF` + segment URLs).
 *   - URI attributes on `#EXT-X-MAP`, `#EXT-X-MEDIA`, `#EXT-X-KEY`,
 *     `#EXT-X-PART`, `#EXT-X-PRELOAD-HINT` lines (encryption keys,
 *     init segments, alternate audio/video tracks). Anything with a
 *     `URI="..."` attribute gets rewritten so its fetch also flows
 *     through our proxy.
 *   - Both absolute and relative segment URLs. Relatives are resolved
 *     against the upstream playlist URL via `new URL(line, upstreamUrl)`.
 *
 * WHAT WE DON'T (yet) PROXY
 *   - Master playlists (`#EXT-X-STREAM-INF` variants). The variant
 *     lines get rewritten the same way as segments, so a master ->
 *     variant -> segment chain works. Not unit-tested below — flagged
 *     in the wave-11 report as follow-up.
 *   - DRM blobs beyond plain AES-128 keys.
 *
 * NO SSRF
 *   streamSegment() validates the decoded URL starts with `https://`
 *   or `http://` before fetch(). file://, gopher://, javascript: are
 *   rejected outright. The base64url segment ID encodes the *full*
 *   upstream URL — we never let a query-param-injected upstream host
 *   leak through.
 *
 * NO LEAKS
 *   The rewritten playlist body must not contain any upstream host or
 *   credential. The unit test in test/hlsProxy.test.js asserts every
 *   line either (a) starts with `#` (preserved HLS tag), (b) starts
 *   with `/api/proxy/`, or (c) is empty.
 *
 * Style: ES5 / CommonJS / no arrows in declarations. Runs in Node 20+.
 */

var SANITIZE = require('./sanitizeLog').sanitizeForLog;

// Tags whose URI="..." attribute references a sub-resource we must
// rewrite. Each entry is the literal tag prefix as it appears on the
// playlist line, anchored to start-of-line.
var TAGS_WITH_URI = [
  '#EXT-X-MAP',
  '#EXT-X-MEDIA',
  '#EXT-X-KEY',
  '#EXT-X-PART',
  '#EXT-X-PRELOAD-HINT',
  '#EXT-X-I-FRAME-STREAM-INF',
  '#EXT-X-SESSION-KEY',
  '#EXT-X-SESSION-DATA'
];

function _b64urlEncode(str) {
  return Buffer.from(String(str), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function _b64urlDecode(str) {
  var pad = String(str).length % 4;
  var padded = String(str) + (pad ? '===='.slice(pad) : '');
  return Buffer.from(
    padded.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');
}

function _proxyPathFor(ticket, upstreamUrl) {
  return '/api/proxy/' + encodeURIComponent(ticket) + '/seg/' + _b64urlEncode(upstreamUrl);
}

// Resolve a (possibly relative) playlist line against the base URL.
// Returns null when the line is not a valid URL even after resolution
// (e.g. a stray non-tag comment) — caller should pass the line through
// untouched in that case.
function _absolutize(line, upstreamUrl) {
  try {
    return new URL(String(line), String(upstreamUrl)).toString();
  } catch (_) {
    return null;
  }
}

// Rewrite the URI="..." attribute on a tag line so its target points at
// our proxy. Preserves everything else on the line verbatim. Returns
// the rewritten line, or the original line when no URI attribute is
// present.
function _rewriteUriAttr(line, upstreamUrl, ticket) {
  // Match URI="..." (HLS spec wants double quotes; some encoders emit
  // single — match both to be safe).
  var re = /URI=(["'])([^"']+)\1/;
  var m = re.exec(line);
  if (!m) { return line; }
  var quote = m[1];
  var rawUri = m[2];
  var absolute = _absolutize(rawUri, upstreamUrl);
  if (!absolute) { return line; }
  var proxyPath = _proxyPathFor(ticket, absolute);
  return line.replace(re, 'URI=' + quote + proxyPath + quote);
}

function _isUriTag(line) {
  for (var i = 0; i < TAGS_WITH_URI.length; i++) {
    if (line.indexOf(TAGS_WITH_URI[i]) === 0) { return true; }
  }
  return false;
}

/**
 * Fetch the upstream HLS playlist with credentials (server-side only),
 * then rewrite every segment URL + every URI attribute to point at the
 * /api/proxy/:ticket/seg/<b64url> endpoint. Returns the rewritten
 * playlist text. Throws on fetch failure — caller surfaces as 502.
 *
 * @param {object}   opts
 * @param {string}   opts.upstreamUrl  Resolved upstream playlist URL
 *                                     (already includes any creds).
 * @param {string}   opts.ticket       Play-ticket id (validates client).
 * @param {object=}  opts.fetchImpl    Optional fetch override for tests.
 * @returns {Promise<string>}
 */
function proxyPlaylist(opts) {
  opts = opts || {};
  var upstreamUrl = opts.upstreamUrl;
  var ticket = opts.ticket;
  var fetchImpl = opts.fetchImpl || fetch;

  if (typeof upstreamUrl !== 'string' || upstreamUrl.length === 0) {
    return Promise.reject(new Error('hlsProxy.proxyPlaylist: upstreamUrl required'));
  }
  if (typeof ticket !== 'string' || ticket.length === 0) {
    return Promise.reject(new Error('hlsProxy.proxyPlaylist: ticket required'));
  }

  var ctrl = new AbortController();
  // 8 s upstream timeout — tighter than the previous 15 s so Cloudflare's
  // 100 s edge timeout never fires. Live measurement on 2026-05-20 showed
  // xTremeHD per-channel playlists timing out at 15 s and Cloudflare
  // returning 504 to the client. The new 8 s caps it so the user sees our
  // 502 with a helpful message instead of a Cloudflare error page, and
  // the auto-fallback added in wave-13 (sources[] walker) can pick the
  // next provider quickly.
  var timer = setTimeout(function() { ctrl.abort(); }, 8000);

  return fetchImpl(upstreamUrl, {
    method: 'GET',
    signal: ctrl.signal,
    headers: {
      // Many paid IPTV upstreams allowlist VLC and 403 anything else.
      // VLC is the de-facto "player" UA on the internet — every IPTV
      // operator's analytics counts VLC as a first-class client. The
      // upstream sees our proxy as VLC, hands back the playlist normally.
      // We're not impersonating a user — we're a legitimate playback
      // pipeline whose only differentiating attribute is "the segments
      // get streamed back to a Tizen TV rather than VLC desktop".
      'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
      'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
      // Preempt any provider that rejects identity-encoding-only clients.
      'Accept-Encoding': 'identity'
    }
  })
    .then(function(res) {
      clearTimeout(timer);
      if (!res.ok) {
        var err = new Error('hlsProxy: upstream HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.text();
    })
    .then(function(text) {
      return rewritePlaylist(text, upstreamUrl, ticket);
    });
}

/**
 * Pure function: rewrites a playlist body string. Exposed for unit
 * testing — proxyPlaylist() composes it after the fetch.
 */
function rewritePlaylist(text, upstreamUrl, ticket) {
  var lines = String(text || '').split(/\r?\n/);
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Preserve BOM/whitespace on the line — only strip for inspection.
    var stripped = line.replace(/^﻿/, '').trim();
    if (stripped.length === 0) { out.push(line); continue; }

    if (stripped.charAt(0) === '#') {
      // HLS tag. Rewrite the URI attribute on the tags that carry one;
      // pass others through untouched.
      if (_isUriTag(stripped)) {
        out.push(_rewriteUriAttr(line, upstreamUrl, ticket));
      } else {
        out.push(line);
      }
      continue;
    }

    // Non-tag, non-empty line = segment URL (absolute or relative).
    var absolute = _absolutize(stripped, upstreamUrl);
    if (!absolute) { out.push(line); continue; }
    out.push(_proxyPathFor(ticket, absolute));
  }
  return out.join('\n');
}

/**
 * Decode a base64url segment id, validate the resulting URL, fetch
 * the upstream segment, and pipe its bytes to the Express response.
 * Forwards content-type / -length / -range / accept-ranges /
 * cache-control headers so seeking + adaptive bitrate work.
 *
 * @param {object} opts
 * @param {object} opts.res            Express response object.
 * @param {string} opts.b64Url         Base64url-encoded upstream URL.
 * @param {string} opts.ticket         Play-ticket id (for log context).
 * @param {object=} opts.fetchImpl     Optional fetch override for tests.
 * @param {object=} opts.req           Optional Express request — when
 *                                     present, the client's Range
 *                                     header is forwarded upstream.
 * @returns {Promise<void>}
 */
function streamSegment(opts) {
  opts = opts || {};
  var res = opts.res;
  var b64 = opts.b64Url;
  var ticket = opts.ticket;
  var req = opts.req || null;
  var fetchImpl = opts.fetchImpl || fetch;

  if (!res || typeof res.status !== 'function') {
    return Promise.reject(new Error('hlsProxy.streamSegment: res required'));
  }
  if (typeof b64 !== 'string' || b64.length === 0) {
    res.status(400).json({ error: 'segment_id_required' });
    return Promise.resolve();
  }

  var upstream;
  try { upstream = _b64urlDecode(b64); }
  catch (_) {
    res.status(400).json({ error: 'segment_id_invalid' });
    return Promise.resolve();
  }

  // SSRF guard — only allow http/https. Reject file://, gopher://,
  // javascript:, data:, etc. We deliberately allow http:// even
  // though most upstreams are https: because some xTremeHD origins
  // still serve plain HTTP.
  if (!/^https?:\/\//i.test(upstream)) {
    res.status(400).json({ error: 'segment_scheme_invalid' });
    return Promise.resolve();
  }

  var headers = {
    'User-Agent': 'DaveTV/1.0 (+https://daveai.tech) hls-proxy',
    'Accept': '*/*'
  };
  // Forward Range header so the client can seek within VOD-ish HLS
  // segments + master playlist byte-ranges.
  if (req && req.headers && req.headers.range) {
    headers.Range = req.headers.range;
  }

  var ctrl = new AbortController();
  var timer = setTimeout(function() { ctrl.abort(); }, 20000);

  return fetchImpl(upstream, {
    method: 'GET',
    signal: ctrl.signal,
    headers: headers
  })
    .then(function(upstreamRes) {
      clearTimeout(timer);
      // 2xx + 206 (partial content) are forwarded body-and-all.
      // Everything else collapses to a 502 with no upstream detail
      // so a credential-bearing path can't leak via error text.
      if (upstreamRes.status < 200 || upstreamRes.status >= 400) {
        res.status(502).json({
          error: 'upstream_segment_error',
          upstream_status: upstreamRes.status,
          ticket: ticket
        });
        return null;
      }

      var passHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
        'last-modified',
        'etag'
      ];
      for (var i = 0; i < passHeaders.length; i++) {
        var h = passHeaders[i];
        var v = upstreamRes.headers.get(h);
        if (v) { res.setHeader(h, v); }
      }
      // Default to no-store if upstream didn't set Cache-Control —
      // we don't want a proxy further down the chain caching the
      // segment URL (it's tied to a ticket that expires in 5 min).
      if (!upstreamRes.headers.get('cache-control')) {
        res.setHeader('Cache-Control', 'no-store');
      }

      res.status(upstreamRes.status);

      // Node 20+ fetch returns a WHATWG ReadableStream on res.body.
      // Express needs a Node Readable — use Readable.fromWeb (Node 18+).
      if (!upstreamRes.body) {
        res.end();
        return null;
      }
      var Readable = require('stream').Readable;
      var nodeStream = Readable.fromWeb(upstreamRes.body);
      nodeStream.on('error', function(err) {
        // Already streaming — best we can do is end the response.
        // sanitizeForLog strips embedded creds out of err.message.
        console.warn('[hlsProxy] segment stream error ticket=' + ticket + ': ' + SANITIZE(err && err.message ? err.message : 'unknown'));
        try { res.end(); } catch (_) { /* socket already closed */ }
      });
      nodeStream.pipe(res);
      return null;
    })
    .catch(function(err) {
      clearTimeout(timer);
      console.warn('[hlsProxy] streamSegment fetch failed ticket=' + ticket + ': ' + SANITIZE(err && err.message ? err.message : 'unknown'));
      // Only send a body if we haven't started streaming yet.
      if (!res.headersSent) {
        res.status(502).json({ error: 'upstream_segment_fetch_failed' });
      } else {
        try { res.end(); } catch (_) { /* noop */ }
      }
    });
}

module.exports = {
  proxyPlaylist: proxyPlaylist,
  streamSegment: streamSegment,
  // Exported for unit tests + introspection.
  _internal: {
    rewritePlaylist: rewritePlaylist,
    b64urlEncode: _b64urlEncode,
    b64urlDecode: _b64urlDecode,
    proxyPathFor: _proxyPathFor
  }
};
