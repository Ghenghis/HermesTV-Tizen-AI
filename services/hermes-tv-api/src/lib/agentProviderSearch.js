'use strict';

var catalogMerge = require('./catalogMerge');
var iptvOrg = require('./iptvOrg');
var m3uClient = require('./m3uClient');
var xtreamClient = require('./xtreamClient');
var sanitizeForLog = require('./sanitizeLog').sanitizeForLog;

var MAX_LIMIT = 25;
var DEFAULT_LIMIT = 8;
var DEFAULT_FETCH_LIMIT = 1000;

var VALID_TYPES = {
  live: true,
  vod: true,
  movie: true,
  movies: true,
  series: true,
  show: true,
  shows: true,
};

var MEDIA_TYPE_ALIASES = {
  movie: 'vod',
  movies: 'vod',
  show: 'series',
  shows: 'series',
};

var PROVIDER_ALIASES = {
  apollo: 'apollo_group',
  'apollo-group': 'apollo_group',
  apollo_group_tv: 'apollo_group',
  'apollo group': 'apollo_group',
  extreme: 'xtremehd',
  xtreme: 'xtremehd',
  'xtreme-hd': 'xtremehd',
  xtreme_hd: 'xtremehd',
  iptv_org: 'iptv-org',
  iptvorg: 'iptv-org',
  'iptv-org-public': 'iptv-org',
};

var SECRET_URL_RE = new RegExp(
  '(/get\\.php\\?user' + 'name=|/player_api\\.php|pass' + 'word=|' +
  'pass' + 'wd=|tok' + 'en=|api[_-]?' + 'key=|client_' + 'secret=)',
  'i'
);
var YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

function _validation(message) {
  var err = new Error(message);
  err.code = 'VALIDATION_FAILED';
  return err;
}

function normaliseType(type) {
  if (type === undefined || type === null || type === '') { return null; }
  if (typeof type !== 'string') { throw _validation('type must be a string'); }
  var t = type.trim().toLowerCase();
  if (!VALID_TYPES[t]) { throw _validation('type must be live, vod, or series'); }
  return MEDIA_TYPE_ALIASES[t] || t;
}

function normaliseProviderId(raw) {
  if (typeof raw !== 'string') { return ''; }
  var p = raw.trim().toLowerCase();
  if (!p) { return ''; }
  return PROVIDER_ALIASES[p] || p;
}

function normaliseProviderIds(values) {
  if (values === undefined || values === null || values === '') { return []; }
  var raw = [];
  function add(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) { add(value[i]); }
      return;
    }
    if (typeof value !== 'string') { throw _validation('provider_ids must be strings'); }
    var parts = value.split(',');
    for (var p = 0; p < parts.length; p++) { raw.push(parts[p]); }
  }
  add(values);

  var out = [];
  for (var r = 0; r < raw.length; r++) {
    var id = normaliseProviderId(raw[r]);
    if (!id || id === 'all') { continue; }
    if (!/^[a-z0-9_-]{1,48}$/.test(id)) {
      throw _validation('provider_ids contains an unsupported provider id');
    }
    if (out.indexOf(id) === -1) { out.push(id); }
  }
  return out;
}

function _limit(value) {
  if (value === undefined || value === null || value === '') { return DEFAULT_LIMIT; }
  var n = Number(value);
  if (!Number.isFinite(n) || n <= 0) { throw _validation('limit must be a positive number'); }
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function _normaliseText(value) {
  if (typeof value !== 'string') { return ''; }
  return value
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _stripLeadingPhrase(text, phrase) {
  if (!text || !phrase) { return text; }
  var normText = text.trim();
  var lowerText = normText.toLowerCase();
  var lowerPhrase = phrase.trim().toLowerCase();
  if (lowerPhrase && lowerText.indexOf(lowerPhrase) === 0) {
    return normText.substring(phrase.trim().length).replace(/^[\s,.:;!?-]+/, '').trim();
  }
  return normText;
}

function extractSearchQuery(input, triggerPhrase) {
  if (typeof input !== 'string') { throw _validation('query must be a string'); }
  var q = input.trim().replace(/\s+/g, ' ');
  if (q.length === 0) { throw _validation('query is required'); }
  if (q.length > 500) { throw _validation('query must be 500 characters or fewer'); }

  q = _stripLeadingPhrase(q, triggerPhrase || 'Hey DaveTV');
  q = _stripLeadingPhrase(q, 'DaveTV');

  var cleanup = [
    /^please\s+/i,
    /^(can|could|would)\s+you\s+/i,
    /^(find|search\s+for|look\s+for|show\s+me|bring\s+up|pull\s+up|play|watch|put\s+on|open)\s+/i,
    /^(the\s+)?(movie|film|show|series|channel)\s+/i,
  ];

  var changed = true;
  while (changed) {
    changed = false;
    for (var i = 0; i < cleanup.length; i++) {
      var next = q.replace(cleanup[i], '').trim();
      if (next !== q && next.length >= 2) {
        q = next;
        changed = true;
      }
    }
  }

  q = q.replace(/\b(on|from)\s+(xtremehd|xtreme hd|apollo group|apollo|iptv-org|iptv org)\s*$/i, '').trim();
  if (q.length < 2) { throw _validation('query must be at least 2 characters'); }
  return q;
}

function _safeUrl(value) {
  if (typeof value !== 'string' || value.length === 0) { return null; }
  if (SECRET_URL_RE.test(value)) { return null; }
  try {
    var u = new URL(value);
    if (u.username || u.password) { return null; }
    var badKeys = ['username', 'password', 'passwd', 'token', 'key', 'api_key', 'apikey', 'client_secret'];
    for (var i = 0; i < badKeys.length; i++) {
      if (u.searchParams.has(badKeys[i])) { return null; }
    }
  } catch (_) {
    return null;
  }
  return value;
}

function _publicMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') { return null; }
  var out = {};
  [
    'resolution',
    'hdr_format',
    'rating',
    'release_date',
    'year',
    'tmdb_id',
    'genre',
    'container_extension',
    'duration_minutes',
    'tvg_id',
    'epg_channel_id',
  ].forEach(function(key) {
    if (metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '') {
      out[key] = metadata[key];
    }
  });
  return Object.keys(out).length > 0 ? out : null;
}

function _publicSource(source) {
  if (!source || typeof source !== 'object') { return null; }
  return {
    provider_id: source.provider_id || null,
    item_id: source.item_id || null,
    source_id: source.source_id || null,
    resolution: source.resolution || null,
    source_health: source.source_health || { status: 'unknown' },
  };
}

function _projectCandidate(item, score, matchReason) {
  var sources = [];
  if (Array.isArray(item.sources)) {
    for (var i = 0; i < item.sources.length; i++) {
      var s = _publicSource(item.sources[i]);
      if (s) { sources.push(s); }
    }
  }

  var providers = [];
  if (Array.isArray(item.providers)) {
    for (var p = 0; p < item.providers.length; p++) {
      var provider = item.providers[p];
      if (!provider || typeof provider !== 'object') { continue; }
      providers.push({
        provider_id: provider.provider_id || null,
        source_id: provider.source_id || null,
        source_health: provider.source_health || { status: 'unknown' },
      });
    }
  }

  return {
    id: item.id,
    title: item.title,
    type: item.type || null,
    category: item.category || null,
    provider: item.provider || null,
    providers: providers,
    sources: sources,
    preferred_source: sources[0] || null,
    poster_url: _safeUrl(item.poster_url),
    logo_url: _safeUrl(item.logo_url),
    metadata: _publicMetadata(item.metadata),
    score: Number(score.toFixed(2)),
    match_reason: matchReason,
  };
}

function _providerIdsForItem(item) {
  var ids = {};
  function add(value) {
    var id = normaliseProviderId(value || '');
    if (id) { ids[id] = true; }
  }
  if (Array.isArray(item.sources)) {
    for (var s = 0; s < item.sources.length; s++) { add(item.sources[s] && item.sources[s].provider_id); }
  }
  if (Array.isArray(item.providers)) {
    for (var p = 0; p < item.providers.length; p++) { add(item.providers[p] && item.providers[p].provider_id); }
  }
  if (Array.isArray(item.provider_tags)) {
    for (var t = 0; t < item.provider_tags.length; t++) { add(item.provider_tags[t]); }
  }
  add(item.provider_id);
  add(item.provider);
  return ids;
}

function _itemMatchesProvider(item, selected) {
  if (!Array.isArray(selected) || selected.length === 0) { return true; }
  var ids = _providerIdsForItem(item);
  for (var i = 0; i < selected.length; i++) {
    if (ids[selected[i]]) { return true; }
  }
  return false;
}

function _yearForItem(item) {
  var m = item && item.metadata ? item.metadata : {};
  var candidates = [m.year, m.release_date, item.year, item.release_date, item.title];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] === undefined || candidates[i] === null) { continue; }
    var match = String(candidates[i]).match(YEAR_RE);
    if (match) { return match[1]; }
  }
  return null;
}

function _scoreItem(item, query) {
  var q = _normaliseText(query);
  var title = _normaliseText(item.title || '');
  var category = _normaliseText(item.category || '');
  var metadata = item.metadata || {};
  var genre = _normaliseText(metadata.genre || '');
  var titleKey = catalogMerge.normalizeTitle(item.title || '') || '';
  var qKey = catalogMerge.normalizeTitle(query || '') || q.replace(/\s+/g, '');

  if (!q || !title) { return { score: 0, reason: 'no_match' }; }

  var score = 0;
  var reason = 'token';
  if (title === q) {
    score += 100;
    reason = 'exact_title';
  } else if (titleKey && qKey && titleKey === qKey) {
    score += 92;
    reason = 'normalised_title';
  } else if (title.indexOf(q) === 0) {
    score += 70;
    reason = 'title_prefix';
  } else if (title.indexOf(q) !== -1) {
    score += 55;
    reason = 'title_contains';
  }

  var tokens = q.split(/\s+/).filter(function(t) { return t.length > 1; });
  var tokenHits = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (title.indexOf(tokens[i]) !== -1) {
      tokenHits += 1;
      score += 8;
    } else if (category.indexOf(tokens[i]) !== -1 || genre.indexOf(tokens[i]) !== -1) {
      score += 2;
    }
  }
  if (score === 0 && tokenHits === 0) { return { score: 0, reason: 'no_match' }; }

  var queryYearMatch = query.match(YEAR_RE);
  if (queryYearMatch) {
    var queryYear = queryYearMatch[1];
    var itemYear = _yearForItem(item);
    if (itemYear === queryYear) {
      score += 24;
      reason = reason === 'token' ? 'title_and_year' : reason + '_year';
    } else if (itemYear) {
      score -= 12;
    }
  }

  if (item.type === 'vod') { score += 1; }
  if (Array.isArray(item.sources) && item.sources.length > 1) { score += 1; }

  return { score: Math.max(0, score), reason: reason };
}

async function _fetchProviderItems(fetchLimit) {
  var out = [];

  try {
    if (iptvOrg.isEnabled()) {
      var orgItems = iptvOrg.fetchCatalog({ limit: Math.min(fetchLimit, 500) });
      if (Array.isArray(orgItems)) { out = out.concat(orgItems); }
    }
  } catch (err) {
    console.warn('[agentProviderSearch] iptv-org search source failed: ' + sanitizeForLog(err && err.message));
  }

  try {
    var m3uItems = await m3uClient.fetchCatalog({ limit: fetchLimit });
    if (Array.isArray(m3uItems)) { out = out.concat(m3uItems); }
  } catch (err2) {
    console.warn('[agentProviderSearch] m3u search source failed: ' + sanitizeForLog(err2 && err2.message));
  }

  try {
    var live = await xtreamClient.fetchAllLive();
    var vod = await xtreamClient.fetchAllVod();
    var series = await xtreamClient.fetchAllSeries();
    if (Array.isArray(live)) { out = out.concat(live); }
    if (Array.isArray(vod)) { out = out.concat(vod); }
    if (Array.isArray(series)) { out = out.concat(series); }
  } catch (err3) {
    console.warn('[agentProviderSearch] xtream search source failed: ' + sanitizeForLog(err3 && err3.message));
  }

  var merged = catalogMerge.mergeByTitle(out);
  try { catalogMerge.setLastMerged(merged); } catch (_) {}
  return merged;
}

async function _loadItems(options) {
  var snapshot = [];
  try {
    snapshot = catalogMerge.getLastMerged && catalogMerge.getLastMerged();
  } catch (_) {
    snapshot = [];
  }
  if (!options.refresh && Array.isArray(snapshot) && snapshot.length > 0) {
    return { items: snapshot, source: 'catalog_snapshot', refreshed: false };
  }

  var fetched = await _fetchProviderItems(options.fetch_limit || DEFAULT_FETCH_LIMIT);
  return {
    items: Array.isArray(fetched) ? fetched : [],
    source: fetched && fetched.length > 0 ? 'providers' : 'no-providers',
    refreshed: true,
  };
}

async function search(options) {
  options = options || {};
  var query = extractSearchQuery(options.query || options.utterance || '', options.trigger_phrase);
  var type = normaliseType(options.type || options.media_type);
  var providerIds = normaliseProviderIds(options.provider_ids || options.provider_id);
  var limit = _limit(options.limit);

  var loaded = options._loaded_override || await _loadItems({
    refresh: options.refresh === true,
    fetch_limit: options.fetch_limit,
  });
  var items = loaded.items.slice();

  if (type) {
    items = items.filter(function(item) { return item && item.type === type; });
  }
  if (providerIds.length > 0) {
    items = items.filter(function(item) { return _itemMatchesProvider(item, providerIds); });
  }

  var scored = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item || typeof item !== 'object') { continue; }
    var scoredItem = _scoreItem(item, query);
    if (scoredItem.score > 0) {
      scored.push({ item: item, score: scoredItem.score, reason: scoredItem.reason });
    }
  }

  if (scored.length === 0 && options.refresh_on_empty === true && loaded.refreshed === false) {
    loaded = await _loadItems({ refresh: true, fetch_limit: options.fetch_limit });
    return search(Object.assign({}, options, {
      refresh: false,
      refresh_on_empty: false,
      _loaded_override: loaded,
    }));
  }

  scored.sort(function(a, b) {
    if (b.score !== a.score) { return b.score - a.score; }
    return String(a.item.title || '').localeCompare(String(b.item.title || ''));
  });

  var candidates = scored.slice(0, limit).map(function(row) {
    return _projectCandidate(row.item, row.score, row.reason);
  });

  return {
    candidates: candidates,
    total: scored.length,
    returned: candidates.length,
    confidence: candidates.length > 0 ? Math.min(0.99, candidates[0].score / 100) : 0,
    _meta: {
      source: loaded.source,
      refreshed: loaded.refreshed,
      provider_filters: providerIds,
      type_filter: type,
      searched_items: items.length,
      limit: limit,
    },
  };
}

module.exports = {
  extractSearchQuery: extractSearchQuery,
  normaliseProviderIds: normaliseProviderIds,
  normaliseType: normaliseType,
  search: search,
  _projectCandidateForTests: _projectCandidate,
  _scoreItemForTests: _scoreItem,
};
