'use strict';

/**
 * lib/providerRegistry.js — canonical, single source of truth for every
 * IPTV provider HermesTV knows about.
 *
 * Per the Provider Truth and Proof Contract (docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md):
 *   "/api/providers, /api/catalog, source-health, EPG, search, play, and
 *    frontend filters consume the same provider identity model."
 *
 * Two storage tiers feed this registry:
 *   1. ENV — provider config loaded from process.env on every list. Examples:
 *      APOLLO_M3U_URL, XTREMEHD_M3U_URL, XTREAM_URL+USERNAME+PASSWORD,
 *      JELLYFIN_URL+API_KEY, IPTV_ORG_ENABLED. Each env-derived entry has a
 *      deterministic id of the form `env-<slug>` (e.g. env-apollo-m3u).
 *   2. DISK — provider config persisted to data/providers.json via
 *      lib/providerStore.js. Survives restart. IDs are of the form
 *      `prov-<8-hex>`.
 *
 * Both tiers expose the SAME masked shape externally so /api/providers
 * never reveals whether a provider was configured by env or by setup
 * submission. Source field is the only distinguishing flag.
 *
 * MASKING CONTRACT — no endpoint may return:
 *   - raw url with path or query (only `url_host`)
 *   - username / password / api_key values
 *   - epg_url (only `has_epg`)
 * Tests assert this in test/providerRegistry.test.js + the global
 * credentialGuard middleware sanity-checks every res.json() body.
 *
 * The registry is the single audited consumer of providerStore.listFull().
 * Other modules (m3uClient, xtreamClient, streamResolver, catalogMerge)
 * call providerRegistry.listFull() so the operator-pasted creds reach
 * the right ingest path. Lane B will wire that in.
 *
 * Style: CommonJS, Node 20+, no arrow declarations.
 */

var providerStore = require('./providerStore');

// canonical provider identity used by catalog merge, source-health, EPG,
// streamResolver. These slugs MUST stay stable — every code path that
// matches by provider id reads them from this list.
var CANONICAL_PROVIDERS = {
  apollo_group: { type: 'm3u',    envUrl: 'APOLLO_M3U_URL',  label: 'Apollo Group' },
  xtremehd:     { type: 'm3u',    envUrl: 'XTREMEHD_M3U_URL', label: 'xTremeHD' },
  xtream:       { type: 'xtream', envUrl: 'XTREAM_URL',       envUser: 'XTREAM_USERNAME', envPass: 'XTREAM_PASSWORD', label: 'Xtream Codes panel' },
  jellyfin:     { type: 'jellyfin', envUrl: 'JELLYFIN_URL', envKey: 'JELLYFIN_API_KEY', label: 'Jellyfin' },
  'iptv-org':   { type: 'iptv-org', envFlag: 'IPTV_ORG_ENABLED', label: 'iptv-org (public)' }
};

// In-memory probe state for env-derived rows (last successful test). Disk-
// derived rows persist this in providers.json via providerStore.recordTest.
var _envProbeState = Object.create(null);
var _bootIso = new Date().toISOString();

// ---------------------------------------------------------------------------
// Env discovery — synthesise the env-derived provider records on every read.
// We rebuild from process.env each time so operator-side env changes (docker
// compose restart with updated env_file) take effect on the next /api/providers
// hit without an in-process cache invalidation step.
// ---------------------------------------------------------------------------

function _envProviders() {
  var out = [];
  var keys = Object.keys(CANONICAL_PROVIDERS);
  for (var i = 0; i < keys.length; i++) {
    var slug = keys[i];
    var def = CANONICAL_PROVIDERS[slug];
    var row = _envRow(slug, def);
    if (row) { out.push(row); }
  }
  return out;
}

function _envRow(slug, def) {
  var id = 'env-' + slug;
  if (def.envFlag) {
    // iptv-org pattern — boolean flag, no URL/creds.
    var enabled = String(process.env[def.envFlag] || '').toLowerCase() === 'true';
    if (!enabled) { return null; }
    return _annotate({
      id: id,
      type: def.type,
      provider_id: slug,
      label: def.label,
      url: 'https://iptv-org.github.io',
      username: undefined,
      password: undefined,
      api_key: undefined,
      epg_url: undefined,
      enabled: true,
      source: 'env',
      created_at: _bootIso
    });
  }
  if (def.envKey) {
    // jellyfin pattern — URL + API key.
    var jfUrl = process.env[def.envUrl];
    var jfKey = process.env[def.envKey];
    if (!jfUrl || !jfKey) { return null; }
    return _annotate({
      id: id,
      type: def.type,
      provider_id: slug,
      label: def.label,
      url: String(jfUrl),
      username: undefined,
      password: undefined,
      api_key: String(jfKey),
      epg_url: undefined,
      enabled: true,
      source: 'env',
      created_at: _bootIso
    });
  }
  if (def.envUser && def.envPass) {
    // xtream pattern — URL + username + password.
    var xtUrl = process.env[def.envUrl];
    var xtUser = process.env[def.envUser];
    var xtPass = process.env[def.envPass];
    if (!xtUrl || !xtUser || !xtPass) { return null; }
    return _annotate({
      id: id,
      type: def.type,
      provider_id: slug,
      label: def.label,
      url: String(xtUrl),
      username: String(xtUser),
      password: String(xtPass),
      api_key: undefined,
      epg_url: undefined,
      enabled: true,
      source: 'env',
      created_at: _bootIso
    });
  }
  // m3u pattern — URL only.
  var m3uUrl = process.env[def.envUrl];
  if (!m3uUrl) { return null; }
  return _annotate({
    id: id,
    type: def.type,
    provider_id: slug,
    label: def.label,
    url: String(m3uUrl),
    username: undefined,
    password: undefined,
    api_key: undefined,
    epg_url: undefined,
    enabled: true,
    source: 'env',
    created_at: _bootIso
  });
}

function _annotate(row) {
  var probe = _envProbeState[row.id] || null;
  row.last_test = probe ? probe.last_test : null;
  row.last_error = probe ? probe.last_error : null;
  row.items_live = probe ? probe.items_live : null;
  return row;
}

// ---------------------------------------------------------------------------
// Disk providers — pulled from providerStore. Annotated with provider_id +
// canonical type so downstream consumers can treat env and disk rows the same.
// ---------------------------------------------------------------------------

function _diskRowsFull() {
  return providerStore.listFull().then(function(rows) {
    return rows.map(function(r) {
      // Disk rows already carry type / id / label / url / username / password /
      // epg_url / enabled / created_at / last_test / last_error.
      // We add a synthetic provider_id used by catalog merge so multiple disk
      // rows of the same kind ("two xtremehd M3Us") still collapse correctly.
      var providerId = r.type === 'm3u'    ? ('m3u-' + r.id) :
                       r.type === 'xtream' ? ('xtream-' + r.id) :
                       r.type === 'stalker' ? ('stalker-' + r.id) :
                       r.type;
      return {
        id: r.id,
        type: r.type,
        provider_id: providerId,
        label: r.label,
        url: r.url,
        username: r.username,
        password: r.password,
        api_key: undefined,
        epg_url: r.epg_url,
        enabled: r.enabled !== false,
        source: 'config',
        created_at: r.created_at,
        last_test: r.last_test || null,
        last_error: r.last_error || null,
        items_live: null
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Masking — the only shape an HTTP client ever sees. No URL path, no creds.
// ---------------------------------------------------------------------------

function _urlHost(url) {
  if (typeof url !== 'string' || url.length === 0) { return ''; }
  try {
    var u = new URL(url);
    return u.host || '';
  } catch (_) {
    var stripped = url.replace(/^[a-z]+:\/\//i, '').split('/')[0] || '';
    return stripped.split('?')[0].slice(0, 80);
  }
}

function _mask(row) {
  if (!row) { return null; }
  return {
    id: row.id,
    type: row.type,
    provider_id: row.provider_id || row.id,
    label: row.label,
    url_host: _urlHost(row.url),
    has_username: !!(row.username && String(row.username).length > 0),
    has_password: !!(row.password && String(row.password).length > 0),
    has_api_key: !!(row.api_key && String(row.api_key).length > 0),
    has_epg: !!(row.epg_url && String(row.epg_url).length > 0),
    enabled: row.enabled !== false,
    source: row.source || 'config',
    status: _statusOf(row),
    last_test: row.last_test || null,
    last_error: row.last_error || null,
    items_live: typeof row.items_live === 'number' ? row.items_live : null,
    created_at: row.created_at || null
  };
}

function _statusOf(row) {
  if (row.enabled === false) { return 'disabled'; }
  if (row.last_error) { return 'error'; }
  if (row.last_test) { return 'ok'; }
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function listFull() {
  // env rows are synchronous (read process.env); disk rows are async.
  var env = _envProviders();
  return _diskRowsFull().then(function(disk) {
    // env wins on id collision (shouldn't happen since prefixes differ).
    return env.concat(disk);
  });
}

function list() {
  return listFull().then(function(rows) {
    return rows.map(_mask);
  });
}

function getById(id) {
  return listFull().then(function(rows) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) { return _mask(rows[i]); }
    }
    return null;
  });
}

function getByIdFull(id) {
  return listFull().then(function(rows) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) { return rows[i]; }
    }
    return null;
  });
}

function add(input) {
  // Disk-only. providerStore.add validates type/url/label/etc.
  return providerStore.add(input).then(function(masked) {
    // providerStore.add returns its OWN masked shape; re-mask through the
    // registry so the response includes provider_id / source / status.
    return getById(masked.id);
  });
}

function update(id, patch) {
  if (typeof id !== 'string' || id.indexOf('env-') === 0) {
    var e = new Error('env-derived providers are not editable via API; update the operator env vars instead');
    e.code = 'ENV_PROVIDER_READONLY';
    return Promise.reject(e);
  }
  return providerStore.update(id, patch).then(function(masked) {
    if (!masked) { return null; }
    return getById(masked.id);
  });
}

function remove(id) {
  if (typeof id !== 'string' || id.indexOf('env-') === 0) {
    var e = new Error('env-derived providers cannot be removed via API; unset the operator env vars instead');
    e.code = 'ENV_PROVIDER_READONLY';
    return Promise.reject(e);
  }
  return providerStore.remove(id);
}

function setEnabled(id, enabled) {
  if (typeof id !== 'string' || id.indexOf('env-') === 0) {
    // env rows: toggle in-memory probe state so visibility filters work,
    // but the env var still wins on next process restart.
    _envProbeState[id] = _envProbeState[id] || {};
    _envProbeState[id].enabled_override = !!enabled;
    return getById(id);
  }
  return providerStore.setEnabled(id, !!enabled).then(function() {
    return getById(id);
  });
}

function recordTest(id, ok, items_live, errorMsg) {
  if (typeof id !== 'string') {
    return Promise.resolve(null);
  }
  if (id.indexOf('env-') === 0) {
    _envProbeState[id] = _envProbeState[id] || {};
    if (ok) {
      _envProbeState[id].last_test = new Date().toISOString();
      _envProbeState[id].last_error = null;
    } else {
      _envProbeState[id].last_error = (typeof errorMsg === 'string' && errorMsg.length > 0)
        ? errorMsg.slice(0, 240)
        : 'unknown error';
    }
    if (typeof items_live === 'number') {
      _envProbeState[id].items_live = items_live;
    }
    return getById(id);
  }
  return providerStore.recordTest(id, ok, errorMsg).then(function() {
    return getById(id);
  });
}

// Test hook — reset env-probe state. Disk reset goes through
// providerStore._resetCacheForTests().
function _resetForTests() {
  _envProbeState = Object.create(null);
}

module.exports = {
  // Public/masked API
  list: list,
  getById: getById,
  add: add,
  update: update,
  remove: remove,
  setEnabled: setEnabled,
  recordTest: recordTest,
  // SERVER-INTERNAL — only catalog/play/streamResolver/m3uClient/xtreamClient
  // are allowed to call listFull / getByIdFull. The audit boundary lives in
  // middleware/credentialGuard.js which inspects every res.json body.
  listFull: listFull,
  getByIdFull: getByIdFull,
  // canonical slug → metadata. Read-only.
  CANONICAL_PROVIDERS: CANONICAL_PROVIDERS,
  // tests
  _resetForTests: _resetForTests,
  _mask: _mask
};
