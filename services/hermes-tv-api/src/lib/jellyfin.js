'use strict';

/**
 * lib/jellyfin.js
 *
 * Server-to-server REST client for the workstation Jellyfin instance reached
 * over Tailscale from the VPS. See docs/32_JELLYFIN_INTEGRATION_PLAN.md.
 *
 * Responsibilities:
 *   - fetchCatalog()       — pull movies/series/episodes from /Items and map
 *                            each item onto the DaveTV catalog shape.
 *   - fetchLiveSessions()  — currently-playing sessions for the future
 *                            "What Mom is watching" widget. (/Sessions/Playing)
 *
 * Failure semantics:
 *   - 8 s timeout per HTTP call. On timeout we throw UNREACHABLE.
 *   - HTTP 401 from Jellyfin → throws AUTH_FAILED so the caller can serve
 *     an honest empty/partial catalog.
 *   - Any network / 5xx error → throws UNREACHABLE so the caller can serve
 *     an honest empty/partial catalog.
 *
 * Caching:
 *   - 5-minute in-memory cache per endpoint. The workstation Jellyfin
 *     library does not change quickly enough to need anything finer-grained.
 *
 * Notes:
 *   - Uses native global `fetch` (Node 20+). No external deps.
 *   - The Jellyfin API key is read from process.env.JELLYFIN_API_KEY and
 *     attached as the `X-Emby-Token` header on every Jellyfin REST call.
 *     Catalog poster_url values point at a DaveTV image proxy; the key is
 *     never embedded in a browser-visible URL.
 */

var DEFAULT_TIMEOUT_MS = 8000;
var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
var ITEMS_PAGE_LIMIT = 200;

// Map Jellyfin Type → HermesTV catalog type
var TYPE_MAP = {
  Movie: 'movie',
  Series: 'series',
  Episode: 'episode',
};

// In-memory cache keyed by endpoint identifier
var _cache = {
  // shape: { catalog: { value, expires_at }, live: { value, expires_at } }
};

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

function _now() {
  return Date.now();
}

function _readCache(key) {
  var entry = _cache[key];
  if (!entry) { return null; }
  if (entry.expires_at <= _now()) {
    delete _cache[key];
    return null;
  }
  return entry.value;
}

function _writeCache(key, value) {
  _cache[key] = {
    value: value,
    expires_at: _now() + CACHE_TTL_MS,
  };
}

function _clearCache() {
  _cache = {};
}

function _makeError(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Strip a trailing slash from the configured Jellyfin URL so we can join
 * paths predictably. Example: "http://100.x.y.z:8096/" → "http://100.x.y.z:8096".
 */
function _normalizeBase(url) {
  if (typeof url !== 'string' || url.length === 0) { return ''; }
  if (url.charAt(url.length - 1) === '/') {
    return url.substring(0, url.length - 1);
  }
  return url;
}

function _catalogItemId(rawItemId) {
  if (typeof rawItemId !== 'string' || rawItemId.length === 0) { return ''; }
  return 'jellyfin-' + encodeURIComponent(rawItemId);
}

function _rawItemIdFromCatalogId(catalogItemId) {
  if (typeof catalogItemId !== 'string' || catalogItemId.length === 0) { return ''; }
  var raw = catalogItemId;
  if (raw.indexOf('jellyfin-') === 0) {
    raw = raw.slice('jellyfin-'.length);
  }
  try { raw = decodeURIComponent(raw); } catch (_) { /* leave raw */ }
  return raw;
}

/**
 * Make a Jellyfin HTTP call with an 8 s timeout. Returns parsed JSON on 2xx.
 * Throws AUTH_FAILED on 401, UNREACHABLE on any other failure / non-2xx.
 *
 * Uses AbortController to enforce the timeout cleanly.
 */
function _fetchJellyfin(path, baseUrl, apiKey) {
  var url = _normalizeBase(baseUrl) + path;
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, DEFAULT_TIMEOUT_MS);

  return fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Emby-Token': apiKey,
    },
    signal: controller.signal,
  }).then(function(response) {
    clearTimeout(timer);
    if (response.status === 401) {
      throw _makeError('AUTH_FAILED', 'Jellyfin returned 401 — JELLYFIN_API_KEY rejected');
    }
    if (response.status < 200 || response.status >= 300) {
      throw _makeError('UNREACHABLE', 'Jellyfin returned HTTP ' + response.status);
    }
    return response.json();
  }).catch(function(err) {
    clearTimeout(timer);
    if (err && err.code === 'AUTH_FAILED') {
      throw err;
    }
    if (err && err.name === 'AbortError') {
      throw _makeError('UNREACHABLE', 'Jellyfin request timed out after ' + DEFAULT_TIMEOUT_MS + 'ms');
    }
    var msg = 'Jellyfin request failed';
    if (err && err.message) {
      msg = msg + ': ' + err.message;
    }
    throw _makeError('UNREACHABLE', msg);
  });
}

/**
 * Build a poster URL that points at the Jellyfin Primary image for an item.
 * The API key is embedded as a query parameter so the browser can render
 * the image cross-origin. See PHASE 4 note above.
 */
function _buildPosterUrl(catalogItemId) {
  return '/api/jellyfin/items/' + encodeURIComponent(catalogItemId) + '/image/primary';
}

function _buildPrimaryImageRequest(catalogItemId) {
  var baseUrl = process.env.JELLYFIN_URL;
  var apiKey = process.env.JELLYFIN_API_KEY;
  var rawItemId = _rawItemIdFromCatalogId(catalogItemId);
  if (!baseUrl || !apiKey || !rawItemId) { return null; }
  return {
    url: _normalizeBase(baseUrl) + '/Items/' + encodeURIComponent(rawItemId) + '/Images/Primary',
    headers: {
      'Accept': 'image/*,*/*',
      'X-Emby-Token': apiKey,
    },
  };
}

function _buildStreamUrl(baseUrl, itemId, apiKey) {
  return _normalizeBase(baseUrl) +
    '/Videos/' + encodeURIComponent(itemId) +
    '/stream?Static=true&api_key=' + encodeURIComponent(apiKey);
}

/**
 * Map a single Jellyfin item to a HermesTV catalog item.
 * Returns null when the item type is not one we surface.
 */
function _mapItem(jfItem, baseUrl, apiKey) {
  if (!jfItem || typeof jfItem !== 'object') { return null; }
  if (typeof jfItem.Id !== 'string' || jfItem.Id.length === 0) { return null; }

  var type = TYPE_MAP[jfItem.Type];
  if (!type) { return null; } // skip BoxSet, MusicAlbum, etc.
  var catalogId = _catalogItemId(jfItem.Id);

  var durationMinutes = null;
  if (typeof jfItem.RunTimeTicks === 'number' && jfItem.RunTimeTicks > 0) {
    // Jellyfin RunTimeTicks: 1 tick = 100 ns → 1 minute = 600,000,000 ticks
    durationMinutes = Math.round(jfItem.RunTimeTicks / 600000000);
  }

  var posterUrl = null;
  var hasPrimary = jfItem.ImageTags && jfItem.ImageTags.Primary;
  if (hasPrimary && catalogId) {
    posterUrl = _buildPosterUrl(catalogId);
  }

  var genres = [];
  if (Array.isArray(jfItem.Genres)) {
    genres = jfItem.Genres.slice();
  }

  return {
    id: catalogId,
    title: jfItem.Name || '',
    type: type,
    year: typeof jfItem.ProductionYear === 'number' ? jfItem.ProductionYear : null,
    genres: genres,
    rating: typeof jfItem.OfficialRating === 'string' ? jfItem.OfficialRating : null,
    description: typeof jfItem.Overview === 'string' ? jfItem.Overview : '',
    duration_minutes: durationMinutes,
    poster_url: posterUrl,
    provider: 'jellyfin',
    provider_id: 'jellyfin',
    providers: [{
      provider_id: 'jellyfin',
      source_id: jfItem.Id,
      source_health: { status: 'unknown' },
    }],
    quality_floor: '1080p',
  };
}

function resolveStreamUrl(catalogItemId) {
  var baseUrl = process.env.JELLYFIN_URL;
  var apiKey = process.env.JELLYFIN_API_KEY;
  var rawItemId = _rawItemIdFromCatalogId(catalogItemId);
  if (!baseUrl || !apiKey || !rawItemId) { return null; }
  return _buildStreamUrl(baseUrl, rawItemId, apiKey);
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * fetchCatalog()
 *
 * Pulls movies/series/episodes from the workstation Jellyfin and returns
 * them mapped onto the HermesTV catalog shape.
 *
 * Reads JELLYFIN_URL and JELLYFIN_API_KEY from process.env at call time
 * (not at module load) so that test code can mutate the env between calls.
 *
 * Throws:
 *   - AUTH_FAILED  — Jellyfin returned 401 / invalid key
 *   - UNREACHABLE  — timeout, DNS failure, 5xx, or network error
 *   - CONFIG       — JELLYFIN_URL or JELLYFIN_API_KEY not set
 *
 * The caller (routes/catalog.js) is expected to catch any of these and
 * serve an honest empty/partial catalog.
 */
function fetchCatalog() {
  var baseUrl = process.env.JELLYFIN_URL;
  var apiKey = process.env.JELLYFIN_API_KEY;

  if (!baseUrl || !apiKey) {
    return Promise.reject(_makeError('CONFIG', 'JELLYFIN_URL and JELLYFIN_API_KEY must both be set'));
  }

  var cached = _readCache('catalog');
  if (cached) {
    return Promise.resolve(cached);
  }

  var path = '/Items' +
    '?Recursive=true' +
    '&IncludeItemTypes=Movie,Series,Episode' +
    '&Limit=' + ITEMS_PAGE_LIMIT +
    '&Fields=Genres,Overview,ProductionYear,OfficialRating,RunTimeTicks,ImageTags';

  return _fetchJellyfin(path, baseUrl, apiKey).then(function(data) {
    var rawItems = (data && Array.isArray(data.Items)) ? data.Items : [];
    var mapped = [];
    for (var i = 0; i < rawItems.length; i++) {
      var item = _mapItem(rawItems[i], baseUrl, apiKey);
      if (item) { mapped.push(item); }
    }
    _writeCache('catalog', mapped);
    return mapped;
  });
}

/**
 * fetchLiveSessions()
 *
 * Returns active playback sessions for the future "What Mom is watching"
 * widget. Same error semantics as fetchCatalog().
 *
 * Note: the returned shape is the raw Jellyfin session list. We do not
 * map fields here yet because the widget UI is not built — Phase 4 will
 * decide the exact shape it consumes.
 */
function fetchLiveSessions() {
  var baseUrl = process.env.JELLYFIN_URL;
  var apiKey = process.env.JELLYFIN_API_KEY;

  if (!baseUrl || !apiKey) {
    return Promise.reject(_makeError('CONFIG', 'JELLYFIN_URL and JELLYFIN_API_KEY must both be set'));
  }

  var cached = _readCache('live');
  if (cached) {
    return Promise.resolve(cached);
  }

  return _fetchJellyfin('/Sessions', baseUrl, apiKey).then(function(data) {
    var sessions = Array.isArray(data) ? data : [];
    // Only sessions currently playing something
    var playing = sessions.filter(function(s) {
      return s && s.NowPlayingItem;
    });
    _writeCache('live', playing);
    return playing;
  });
}

module.exports = {
  fetchCatalog: fetchCatalog,
  fetchLiveSessions: fetchLiveSessions,
  // Exposed for tests only.
  _clearCache: _clearCache,
  internal: {
    catalogItemId: _catalogItemId,
    rawItemIdFromCatalogId: _rawItemIdFromCatalogId,
    buildPrimaryImageRequest: _buildPrimaryImageRequest,
    resolveStreamUrl: resolveStreamUrl,
  },
};
