'use strict';

/**
 * lib/streamProbe.js
 *
 * Server-side stream reachability probe. Used by /api/source-health to
 * provide real (rather than mocked) data for the StreamingQualityBar.
 *
 * SECURITY CONTRACT
 *   - HEAD requests only — never downloads the stream body.
 *   - The stream URL itself is NEVER returned to a client. Callers may
 *     forward only the redacted hint produced by `redactUrl`.
 *   - All provider credentials remain server-side, embedded in the URL
 *     that only this module sees.
 *
 * RUNTIME
 *   - Targets Node >= 20 (global fetch, AbortController).
 *   - In-memory cache keyed by stream URL, TTL 60 seconds, capped at
 *     1024 entries to prevent unbounded growth.
 *
 * Chrome 76 / Tizen 6.5 safety:
 *   This file runs only on the server, so modern Node syntax is fine.
 *   The shape it returns is plain JSON that the browser code consumes
 *   without optional chaining / nullish-coalescing.
 */

var PROBE_TIMEOUT_MS = 4000;
var CACHE_TTL_MS = 60 * 1000;
var CACHE_MAX_ENTRIES = 1024;

// Cache shape: { [url]: { result, expiresAt } }
var cache = Object.create(null);

function now() {
  return Date.now();
}

function cacheGet(key) {
  var entry = cache[key];
  if (!entry) return null;
  if (entry.expiresAt <= now()) {
    delete cache[key];
    return null;
  }
  return entry.result;
}

function cacheSet(key, result) {
  // Cheap LRU-ish prune: when over cap, drop every expired entry, then
  // drop the oldest by expiresAt until we are back under the cap.
  var keys = Object.keys(cache);
  if (keys.length >= CACHE_MAX_ENTRIES) {
    // First pass: remove expired
    for (var i = 0; i < keys.length; i++) {
      if (cache[keys[i]].expiresAt <= now()) {
        delete cache[keys[i]];
      }
    }
    keys = Object.keys(cache);
    if (keys.length >= CACHE_MAX_ENTRIES) {
      keys.sort(function(a, b) {
        return cache[a].expiresAt - cache[b].expiresAt;
      });
      // Drop oldest 10% so we don't thrash
      var dropCount = Math.ceil(CACHE_MAX_ENTRIES * 0.1);
      for (var j = 0; j < dropCount && j < keys.length; j++) {
        delete cache[keys[j]];
      }
    }
  }
  cache[key] = {
    result: result,
    expiresAt: now() + CACHE_TTL_MS,
  };
}

/**
 * Redact a stream URL down to scheme + host + path-without-query.
 * Strips query string and any embedded basic-auth credentials.
 * Returns a fixed placeholder when input is unusable.
 */
function redactUrl(streamUrl) {
  if (!streamUrl || typeof streamUrl !== 'string') return '***redacted***';
  try {
    var u = new URL(streamUrl);
    return u.protocol + '//' + u.host + u.pathname;
  } catch (_) {
    return '***redacted***';
  }
}

/**
 * Perform a HEAD request with a 4-second timeout.
 * Returns a normalized JSON-serializable result object.
 *
 * Success shape:
 *   { reachable: true, status: 200, latency_ms: <int>,
 *     content_type: '<string>'|null, content_length: <int>|null,
 *     server: '<string>'|null }
 *
 * Failure shapes:
 *   { reachable: false, reason: 'timeout', latency_ms: <int> }
 *   { reachable: false, reason: 'http_<status>', status: <int>, latency_ms: <int> }
 *   { reachable: false, reason: 'network', latency_ms: <int>, detail: '<short>' }
 *   { reachable: false, reason: 'invalid_url' }
 */
async function probeStream(streamUrl) {
  if (!streamUrl || typeof streamUrl !== 'string') {
    return { reachable: false, reason: 'invalid_url' };
  }

  // Validate URL upfront — avoids hitting the network on garbage input.
  try {
    new URL(streamUrl);
  } catch (_) {
    return { reachable: false, reason: 'invalid_url' };
  }

  // Cache lookup
  var cached = cacheGet(streamUrl);
  if (cached) {
    // Surface cache-hit so the route can stamp checked_at honestly.
    return Object.assign({}, cached, { cached: true });
  }

  var controller = new AbortController();
  var timer = setTimeout(function() {
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  var startedAt = now();
  var result;
  try {
    var response = await fetch(streamUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    var elapsed = now() - startedAt;

    if (response.ok) {
      result = {
        reachable: true,
        status: response.status,
        latency_ms: elapsed,
        content_type: response.headers.get('content-type') || null,
        content_length: (function() {
          var raw = response.headers.get('content-length');
          if (!raw) return null;
          var parsed = parseInt(raw, 10);
          return isNaN(parsed) ? null : parsed;
        })(),
        server: response.headers.get('server') || null,
      };
    } else {
      result = {
        reachable: false,
        reason: 'http_' + response.status,
        status: response.status,
        latency_ms: elapsed,
      };
    }
  } catch (err) {
    var elapsedErr = now() - startedAt;
    if (err && err.name === 'AbortError') {
      result = {
        reachable: false,
        reason: 'timeout',
        latency_ms: PROBE_TIMEOUT_MS,
      };
    } else {
      result = {
        reachable: false,
        reason: 'network',
        latency_ms: elapsedErr,
        detail: (err && err.code) ? String(err.code) : 'unknown',
      };
    }
  } finally {
    clearTimeout(timer);
  }

  cacheSet(streamUrl, result);
  return result;
}

/**
 * Heuristic quality floor based on URL substrings.
 * Best-effort — does not actually inspect the manifest.
 *
 * Returns { floor: '4K'|'1080p'|'720p'|'unknown', source: 'url_heuristic' }
 */
function inferQuality(probeResult, streamUrl) {
  var url = (streamUrl || '').toLowerCase();

  if (url.indexOf('/4k/') !== -1 || url.indexOf('/2160/') !== -1 || url.indexOf('/2160p/') !== -1) {
    return { floor: '4K', source: 'url_heuristic' };
  }
  if (url.indexOf('/1080/') !== -1 || url.indexOf('/1080p/') !== -1 || url.indexOf('/fhd/') !== -1) {
    return { floor: '1080p', source: 'url_heuristic' };
  }
  if (url.indexOf('/720/') !== -1 || url.indexOf('/720p/') !== -1 || url.indexOf('/hd/') !== -1) {
    return { floor: '720p', source: 'url_heuristic' };
  }
  return { floor: 'unknown', source: 'url_heuristic' };
}

/**
 * Clear the in-memory probe cache. Used by tests; no public route exposes
 * this — restart the API in production if you need a hard refresh.
 */
function _clearCache() {
  cache = Object.create(null);
}

module.exports = {
  probeStream: probeStream,
  inferQuality: inferQuality,
  redactUrl: redactUrl,
  _clearCache: _clearCache,
  PROBE_TIMEOUT_MS: PROBE_TIMEOUT_MS,
  CACHE_TTL_MS: CACHE_TTL_MS,
};
