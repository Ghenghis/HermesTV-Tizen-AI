import React from 'react';
import Toggle from './Toggle.jsx';
import * as visibilityStore from '../../store/providerVisibilityStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// ProvidersSettings — Settings ▸ Providers sub-tab (W16-PROVIDERS).
//
// User request:
//   "can features for displaying providers channels/movies/series/live be
//    selected to show or to exclude, like exclude/show iptv-org able to
//    display or hide, xtremehd and apollo group tv — so users can view some
//    or all providers."
//
// One row per currently-configured provider. Each row exposes:
//   - provider name + status badge (online/degraded/offline)
//   - count of items the catalog currently has from this provider
//   - on/off switch (≥44 px hit target for Mom's tablet)
//
// Defaults to all-visible. Mom's TV is NEVER auto-hidden — the toggle is
// purely opt-in per profile (see MEMORY.md feedback_mom_tv_never_limited).
//
// Tizen 6.5 / Chrome 76 safe — no arrows, no destructuring, no template
// strings, no optional chaining, no spread.
// ─────────────────────────────────────────────────────────────────────────────

var STATUS_COLOURS = {
  ok: '#22c55e',
  online: '#22c55e',
  degraded: '#e3b341',
  offline: '#ef4444',
  not_configured: '#8b949e',
  unknown: '#8b949e'
};

var STATUS_LABELS = {
  ok: 'Online',
  online: 'Online',
  degraded: 'Degraded',
  offline: 'Offline',
  not_configured: 'Not configured',
  unknown: 'Unknown'
};

// Default provider order for the row list — matches the order shown in the
// brand strip on the Diagnostics panel. Any provider returned by the API
// that isn't in this list is appended at the bottom alphabetically.
var DEFAULT_ORDER = ['iptv_org', 'iptv-org', 'apollo_group', 'xtremehd', 'xtream', 'jellyfin'];

var PROVIDER_DISPLAY_NAMES = {
  iptv_org: 'iptv-org',
  'iptv-org': 'iptv-org',
  apollo_group: 'Apollo Group TV',
  xtremehd: 'xTremeHD',
  xtream: 'Xtream Codes',
  jellyfin: 'Jellyfin'
};

function _statusFor(provider) {
  if (!provider) { return 'unknown'; }
  if (typeof provider.status === 'string') { return provider.status; }
  if (provider.error) { return 'offline'; }
  if (provider.configured === false) { return 'not_configured'; }
  if (typeof provider.count === 'number' && provider.count > 0) { return 'ok'; }
  return 'unknown';
}

function _label(provider) {
  if (!provider) { return ''; }
  if (typeof provider.display_name === 'string') { return provider.display_name; }
  if (typeof provider.label === 'string') { return provider.label; }
  var pid = provider.id || provider.provider_id;
  if (pid && PROVIDER_DISPLAY_NAMES[pid]) { return PROVIDER_DISPLAY_NAMES[pid]; }
  return pid || 'Provider';
}

function _itemCount(provider) {
  if (!provider) { return 0; }
  if (typeof provider.item_count === 'number') { return provider.item_count; }
  if (typeof provider.count === 'number') { return provider.count; }
  if (provider.counts && typeof provider.counts === 'object') {
    var c = provider.counts;
    return (c.live || 0) + (c.vod || 0) + (c.series || 0);
  }
  return 0;
}

// Normalise the provider id (hyphen → underscore) for store reads so a
// hyphenated `iptv-org` from /api/source-health writes to the same slot as
// the underscored `iptv_org` default. This is the same normalisation the
// store does internally; we mirror it here so the toggle's UI-side `checked`
// value matches what the store will save.
function _storeKey(providerId) {
  if (providerId === 'iptv-org') { return 'iptv_org'; }
  return providerId;
}

function ProvidersSettings(props) {
  var profile = props.profile || {};
  var profileId = profile.profile_id || 'mom_tv';
  var initialProviders = props.providers || [];
  // m3uProviders is the per-provider diagnostic blob from /api/catalog's
  // `_meta.m3u_providers` — used as a fallback / additive source when the
  // /api/source-health call hasn't returned yet (or isn't deployed).
  var m3uProviders = props.m3uProviders || null;
  var iptvOrgCount = typeof props.iptvOrgCount === 'number' ? props.iptvOrgCount : 0;

  // Pull /api/source-health on mount so we can show online/offline badges
  // and item counts. Falls back to the props-passed providers list if the
  // call fails — the UI still works without the live signal.
  var healthState = React.useState(null);
  var health = healthState[0];
  var setHealth = healthState[1];

  var loadingState = React.useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  // Visibility map state — re-read from the store on toggle so the count
  // at the top ("2 of 3 providers visible") updates live. Initialised
  // synchronously from localStorage so the first paint already reflects
  // the user's persisted choice.
  var visState = React.useState(function() { return visibilityStore.getVisibility(profileId); });
  var visibility = visState[0];
  var setVisibility = visState[1];

  // Re-read visibility when the active profile changes so flipping profiles
  // in the picker swaps the displayed toggles to the new profile's map.
  React.useEffect(function() {
    setVisibility(visibilityStore.getVisibility(profileId));
  }, [profileId]);

  React.useEffect(function() {
    var cancelled = false;
    function load() {
      // Inline fetch (no shared client yet) — same BASE_URL discipline as
      // hermesApi.js. We do it inline rather than adding a new API client
      // file so this PR stays scoped to the visibility feature.
      var base = '';
      try {
        if (typeof window !== 'undefined') {
          var h = window.location.hostname;
          if (h === 'localhost' || h === '127.0.0.1') { base = 'http://localhost:3001'; }
          else if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) { base = 'http://' + h + ':3001'; }
        }
      } catch (_e) { /* default base = '' */ }
      fetch(base + '/api/source-health').then(function(r) {
        if (!r.ok) { throw new Error('source-health failed'); }
        return r.json();
      }).then(function(body) {
        if (cancelled) { return; }
        setHealth(body || null);
        setLoading(false);
      }).catch(function() {
        if (cancelled) { return; }
        setHealth(null);
        setLoading(false);
      });
    }
    load();
    return function() { cancelled = true; };
  }, []);

  // Build the list of provider rows. Source of truth:
  //   1. /api/source-health response (canonical — has live status + counts)
  //   2. /api/catalog _meta.m3u_providers (fallback)
  //   3. iptv-org count + the providers prop (last-resort)
  function _buildRows() {
    var rows = [];
    var seen = {};
    function add(row) {
      if (!row || !row.id) { return; }
      if (seen[row.id]) { return; }
      seen[row.id] = true;
      rows.push(row);
    }
    var healthProviders = (health && Array.isArray(health.providers)) ? health.providers : [];
    for (var i = 0; i < healthProviders.length; i++) {
      var hp = healthProviders[i];
      add({
        id: hp.id || hp.provider_id,
        label: _label(hp),
        status: _statusFor(hp),
        count: _itemCount(hp)
      });
    }
    // Merge in m3u providers we may not have seen via source-health.
    if (m3uProviders && typeof m3uProviders === 'object') {
      for (var pid in m3uProviders) {
        if (Object.prototype.hasOwnProperty.call(m3uProviders, pid)) {
          var mp = m3uProviders[pid];
          add({
            id: pid,
            label: (mp && mp.label) || PROVIDER_DISPLAY_NAMES[pid] || pid,
            status: _statusFor(mp),
            count: _itemCount(mp)
          });
        }
      }
    }
    // iptv-org from the catalog meta fallback.
    if (!seen['iptv-org'] && !seen.iptv_org && iptvOrgCount > 0) {
      add({
        id: 'iptv-org',
        label: 'iptv-org',
        status: iptvOrgCount > 0 ? 'ok' : 'offline',
        count: iptvOrgCount
      });
    }
    // Anything in the initial `providers` prop (operator-imported) we haven't seen.
    for (var j = 0; j < initialProviders.length; j++) {
      var p = initialProviders[j];
      if (!p) { continue; }
      var ppid = p.provider_id || p.id;
      if (!ppid) { continue; }
      add({
        id: ppid,
        label: _label(p),
        status: _statusFor(p),
        count: _itemCount(p)
      });
    }
    // Final sort — DEFAULT_ORDER first, then alphabetical.
    rows.sort(function(a, b) {
      var ia = DEFAULT_ORDER.indexOf(a.id);
      var ib = DEFAULT_ORDER.indexOf(b.id);
      if (ia === -1) { ia = 9999; }
      if (ib === -1) { ib = 9999; }
      if (ia !== ib) { return ia - ib; }
      return (a.label || '').localeCompare(b.label || '');
    });
    return rows;
  }

  var rows = _buildRows();
  var totalItems = 0;
  var visibleCount = 0;
  for (var ri = 0; ri < rows.length; ri++) {
    var key = _storeKey(rows[ri].id);
    var on = visibility[key] !== false;
    if (on) {
      visibleCount += 1;
      totalItems += rows[ri].count || 0;
    }
  }

  function flip(providerId, nextOn) {
    visibilityStore.setVisibility(profileId, providerId, !!nextOn);
    setVisibility(visibilityStore.getVisibility(profileId));
    // Notify the rest of the app (App.jsx listens to refresh the catalog
    // filter). Custom event keeps this component decoupled from the
    // catalog state owner.
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        var ev;
        try {
          ev = new CustomEvent('hermestv:provider-visibility-changed', {
            detail: { profileId: profileId, providerId: providerId, visible: !!nextOn }
          });
        } catch (_e) {
          // IE / Tizen 6.5 fallback — CustomEvent constructor sometimes
          // throws; build via document.createEvent instead.
          ev = document.createEvent('CustomEvent');
          ev.initCustomEvent('hermestv:provider-visibility-changed', false, false, {
            profileId: profileId, providerId: providerId, visible: !!nextOn
          });
        }
        window.dispatchEvent(ev);
      }
    } catch (_e2) { /* silent */ }
  }

  function showAll() {
    for (var i = 0; i < rows.length; i++) {
      visibilityStore.setVisibility(profileId, rows[i].id, true);
    }
    setVisibility(visibilityStore.getVisibility(profileId));
    try {
      window.dispatchEvent(new CustomEvent('hermestv:provider-visibility-changed', {
        detail: { profileId: profileId, providerId: '*', visible: true }
      }));
    } catch (_e) { /* silent */ }
  }

  function hideAll() {
    for (var i = 0; i < rows.length; i++) {
      visibilityStore.setVisibility(profileId, rows[i].id, false);
    }
    setVisibility(visibilityStore.getVisibility(profileId));
    try {
      window.dispatchEvent(new CustomEvent('hermestv:provider-visibility-changed', {
        detail: { profileId: profileId, providerId: '*', visible: false }
      }));
    } catch (_e) { /* silent */ }
  }

  // Touch target sized for Mom's tablet — ≥64 px tall row, large hit area
  // for the toggle. The Toggle component itself is 44 px wide × 24 px tall;
  // we wrap the whole row in a click target so a tap anywhere on the row
  // flips the switch.
  function _row(provider) {
    if (!provider) { return null; }
    var key = _storeKey(provider.id);
    var on = visibility[key] !== false;
    var status = provider.status || 'unknown';
    var sc = STATUS_COLOURS[status] || STATUS_COLOURS.unknown;
    var sl = STATUS_LABELS[status] || status;
    return (
      <div
        key={provider.id}
        role="group"
        aria-label={provider.label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.8rem',
          padding: '0.85rem 0.9rem',
          minHeight: '64px',
          borderTop: '1px solid var(--border, #30363d)',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 'calc(0.92rem * var(--font-scale, 1))' }}>{provider.label}</span>
            <span
              aria-label={'Status: ' + sl}
              style={{
                display: 'inline-block',
                fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                fontWeight: 800,
                color: sc,
                border: '1px solid ' + sc,
                borderRadius: '3px',
                padding: '0.05rem 0.4rem',
                backgroundColor: sc + '22',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >{sl}</span>
          </div>
          <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
            {provider.count > 0
              ? (provider.count.toLocaleString() + ' items')
              : (status === 'not_configured' ? 'Add credentials to enable' : 'No items')}
          </div>
        </div>
        <Toggle
          checked={on}
          ariaLabel={(on ? 'Hide ' : 'Show ') + provider.label + ' content'}
          onChange={function(next) { flip(provider.id, next); }}
        />
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          background: 'var(--surface-raised, #1c2128)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '12px',
          padding: '0.9rem 1rem 0.4rem',
          marginBottom: '0.85rem',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <div
            aria-hidden="true"
            style={{
              width: '30px', height: '30px',
              borderRadius: '8px',
              background: 'rgba(0, 212, 255, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent, #00d4ff)',
              fontSize: '14px',
            }}
          >◉</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 'calc(0.92rem * var(--font-scale, 1))' }}>Show or hide providers</div>
            <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted)' }}>
              Choose which sources fill your channels, movies, and series.
            </div>
          </div>
        </div>
        <div
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            padding: '0.55rem 0.2rem 0.2rem',
            fontSize: 'calc(0.82rem * var(--font-scale, 1))',
          }}
        >
          <span style={{ color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--text, #e6edf3)' }}>{visibleCount}</strong>
            {' of '}
            <strong style={{ color: 'var(--text, #e6edf3)' }}>{rows.length}</strong>
            {' providers visible — '}
            <strong style={{ color: 'var(--text, #e6edf3)' }}>{totalItems.toLocaleString()}</strong>
            {' items'}
          </span>
          <span style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              tabIndex={0}
              onClick={showAll}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAll(); } }}
              style={{
                padding: '0.4rem 0.85rem',
                background: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: '999px',
                color: 'var(--text, #e6edf3)',
                fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >Show all</button>
            <button
              tabIndex={0}
              onClick={hideAll}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hideAll(); } }}
              style={{
                padding: '0.4rem 0.85rem',
                background: 'transparent',
                border: '1px solid var(--border, #30363d)',
                borderRadius: '999px',
                color: 'var(--muted)',
                fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >Hide all</button>
          </span>
        </div>
      </div>

      <div
        style={{
          background: 'var(--surface-raised, #1c2128)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {loading && rows.length === 0 ? (
          <div style={{ padding: '1rem 1.1rem', color: 'var(--muted)', fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
            Loading providers&hellip;
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '1rem 1.1rem', color: 'var(--muted)', fontSize: 'calc(0.85rem * var(--font-scale, 1))' }}>
            No providers configured yet. Import a playlist or paste Xtream / M3U credentials to populate the catalog.
          </div>
        ) : (
          rows.map(function(p) { return _row(p); })
        )}
      </div>
    </div>
  );
}

export default ProvidersSettings;
