// providerIdentity — canonical provider IDs shared by filters and shells.
//
// The catalog can describe sources in several shapes during the transition
// from legacy seed data to real provider rows: sources[], providers[],
// provider_id, provider, and provider_tags. Keep the alias logic here so the
// app does not split iptv-org/iptv_org or Apollo/apollo_group differently
// between Views.

export var CANONICAL_PROVIDER_FILTERS = [
  { id: 'xtremehd', label: 'xTremeHD' },
  { id: 'apollo_group', label: 'Apollo Group TV' },
  { id: 'iptv-org', label: 'iptv-org' },
];

var PROVIDER_LABELS = {
  xtremehd: 'xTremeHD',
  xtream: 'Xtream Codes',
  apollo_group: 'Apollo Group TV',
  apollo: 'Apollo Group TV',
  'iptv-org': 'iptv-org',
  iptv_org: 'iptv-org',
  jellyfin: 'Jellyfin',
};

function _addUnique(out, id) {
  if (!id || out.indexOf(id) !== -1) { return; }
  out.push(id);
}

export function normalizeProviderId(id) {
  if (typeof id !== 'string') { return ''; }
  var value = id.trim().toLowerCase();
  if (!value) { return ''; }
  if (value === 'apollo') { return 'apollo_group'; }
  if (value === 'apollo-group' || value === 'apollo_group_tv' || value === 'apollo group') { return 'apollo_group'; }
  if (value === 'iptv_org' || value === 'iptvorg' || value === 'iptv-org-public') { return 'iptv-org'; }
  if (value === 'extreme' || value === 'xtreme' || value === 'xtreme-hd' || value === 'xtreme_hd') { return 'xtremehd'; }
  return value;
}

export function providerLabel(id) {
  var normal = normalizeProviderId(id);
  if (PROVIDER_LABELS[normal]) { return PROVIDER_LABELS[normal]; }
  if (!normal) { return 'Provider'; }
  return normal;
}

export function providerFilterToIds(providerFilter) {
  if (!providerFilter || providerFilter === 'all') { return []; }
  var raw = [];
  if (Array.isArray(providerFilter)) {
    raw = providerFilter;
  } else {
    raw = String(providerFilter).split(',');
  }
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var id = normalizeProviderId(raw[i]);
    if (!id || id === 'all') { continue; }
    _addUnique(out, id);
  }
  return out;
}

export function providerIdsToFilter(ids) {
  if (!Array.isArray(ids) || ids.length === 0) { return 'all'; }
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    _addUnique(out, normalizeProviderId(ids[i]));
  }
  if (out.length === 0) { return 'all'; }

  var knownCount = 0;
  for (var k = 0; k < CANONICAL_PROVIDER_FILTERS.length; k++) {
    if (out.indexOf(CANONICAL_PROVIDER_FILTERS[k].id) !== -1) {
      knownCount += 1;
    }
  }
  if (knownCount === CANONICAL_PROVIDER_FILTERS.length && out.length === CANONICAL_PROVIDER_FILTERS.length) {
    return 'all';
  }
  return out.join(',');
}

export function isAllProviderFilter(providerFilter) {
  return providerFilterToIds(providerFilter).length === 0;
}

export function buildProviderFilterOptions(providers) {
  var out = [];
  var seen = {};
  for (var i = 0; i < CANONICAL_PROVIDER_FILTERS.length; i++) {
    var p = CANONICAL_PROVIDER_FILTERS[i];
    out.push({ id: p.id, label: p.label });
    seen[p.id] = true;
  }
  if (Array.isArray(providers)) {
    for (var j = 0; j < providers.length; j++) {
      var row = providers[j] || {};
      var id = normalizeProviderId(row.provider_id || row.id || row.type || '');
      if (!id || seen[id]) { continue; }
      seen[id] = true;
      out.push({
        id: id,
        label: row.display_name || row.name || providerLabel(id),
      });
    }
  }
  return out;
}

export function getItemProviderIds(item) {
  var out = [];
  if (!item) { return out; }
  var i;
  if (Array.isArray(item.sources)) {
    for (i = 0; i < item.sources.length; i++) {
      _addUnique(out, normalizeProviderId(item.sources[i] && item.sources[i].provider_id));
    }
  }
  if (Array.isArray(item.providers)) {
    for (i = 0; i < item.providers.length; i++) {
      _addUnique(out, normalizeProviderId(item.providers[i] && item.providers[i].provider_id));
    }
  }
  _addUnique(out, normalizeProviderId(item.provider_id));
  _addUnique(out, normalizeProviderId(item.provider));
  _addUnique(out, normalizeProviderId(item.preferred_source));
  if (Array.isArray(item.provider_tags)) {
    for (i = 0; i < item.provider_tags.length; i++) {
      _addUnique(out, normalizeProviderId(item.provider_tags[i]));
    }
  }
  return out;
}

export function itemMatchesProviderFilter(item, providerFilter) {
  var selected = providerFilterToIds(providerFilter);
  if (selected.length === 0) { return true; }
  var itemProviders = getItemProviderIds(item);
  for (var i = 0; i < itemProviders.length; i++) {
    if (selected.indexOf(itemProviders[i]) !== -1) { return true; }
  }
  return false;
}

export function formatProviderFilter(providerFilter) {
  var selected = providerFilterToIds(providerFilter);
  if (selected.length === 0) { return 'All providers'; }
  var labels = [];
  for (var i = 0; i < selected.length; i++) {
    labels.push(providerLabel(selected[i]));
  }
  return labels.join(' + ');
}
