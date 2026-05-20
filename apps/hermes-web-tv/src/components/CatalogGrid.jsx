import React from 'react';
import CatalogCard from './CatalogCard.jsx';
import EmptyState from './EmptyState.jsx';
import { useGridVirtualizer } from '../shells/shellHelpers.js';
import { isSystemLimited } from '../utils/isSystemLimited.js';

// W16-PROVIDERS — provider display labels for section headers when
// "Group by Provider" is on. Keeps the header text readable ("iptv-org"
// rather than "iptv_org", "Apollo Group TV" instead of "apollo_group").
var PROVIDER_DISPLAY = {
  'iptv-org':    'iptv-org',
  'iptv_org':    'iptv-org',
  apollo_group:  'Apollo Group TV',
  apollo:        'Apollo Group TV',
  xtremehd:      'xTremeHD',
  xtream:        'Xtream Codes',
  jellyfin:      'Jellyfin',
  seed:          'Built-in',
  unknown:       'Other'
};

function _primaryProvider(item) {
  if (!item) { return 'unknown'; }
  // Prefer wave-13 sources[] canonical order — first entry is the primary
  // source after merge (xtremehd > apollo_group > iptv-org > seed).
  if (Array.isArray(item.sources) && item.sources.length > 0) {
    var sid = item.sources[0] && item.sources[0].provider_id;
    if (sid) { return sid; }
  }
  if (Array.isArray(item.providers) && item.providers.length > 0) {
    var pid = item.providers[0] && item.providers[0].provider_id;
    if (pid) { return pid; }
  }
  if (typeof item.provider === 'string' && item.provider) { return item.provider; }
  if (Array.isArray(item.provider_tags) && item.provider_tags.length > 0) {
    return item.provider_tags[0];
  }
  return 'unknown';
}

function _displayName(pid) {
  return PROVIDER_DISPLAY[pid] || pid || 'Other';
}

// Storage helpers for the per-profile "Group by Provider" preference.
var GROUP_KEY_PREFIX = 'daveTV:group-by-provider:';
function _readGroupPref(profileId) {
  if (!profileId) { return false; }
  try { return localStorage.getItem(GROUP_KEY_PREFIX + profileId) === '1'; }
  catch (_e) { return false; }
}
function _writeGroupPref(profileId, on) {
  if (!profileId) { return; }
  try { localStorage.setItem(GROUP_KEY_PREFIX + profileId, on ? '1' : '0'); }
  catch (_e) { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// CatalogGrid — the "Standard Grid" fallback shell when no layout is picked.
//
// W9-VIRTUALIZE (wave-9 perf fix)
// On a 1000+ item catalog this used to render every CatalogCard at once —
// scroll heights of ~340 viewports and >300 ms paint bursts on the QN85.
// Now we lean on the shared useGridVirtualizer (same hook as MomMode /
// TiviMate / ExtremeInfiniTV) so only the visible window + overscan is in
// the DOM at any time.
//
// Mom rule (per MEMORY.md): Mom's TV is NEVER system-limited. Virtualization
// is a perf optimisation, not a content cap — Mom still sees every item in
// the list. We just give her a slightly larger overscan (4 rows vs Dave's
// 2) so the next row is ready before her slower remote-scroll reaches it.
//
// Tizen 6.5 / Chrome 76 safe — no arrow funcs, no destructuring, no template
// strings, no optional chaining. Matches shellHelpers' ES5 style.
// ─────────────────────────────────────────────────────────────────────────────

// Walk up the DOM until we hit an element with overflow-y: auto|scroll. That's
// the actual scroll container — usually <main style="overflowY:auto"> in
// App.jsx. We do this once on mount; if nothing matches we fall back to
// `null` and the virtualizer hook short-circuits to "render everything".
function _findScrollParent(el) {
  if (!el || typeof window === 'undefined' || !window.getComputedStyle) { return null; }
  var node = el.parentElement;
  while (node && node !== document.body) {
    var cs;
    try { cs = window.getComputedStyle(node); } catch (_e) { cs = null; }
    if (cs) {
      var oy = cs.overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

// Per-card row height (px) estimate at 1920x1080 TV viewport. CatalogCard's
// poster slot is the dominant height — live tiles are 16:9, VOD posters are
// 2:3, so a mixed grid averages ~360px for a 240px-wide card column. We add
// the title/quality block (~70px) and the 16px row gap to land on 446 ≈ 450.
// Slight over-estimate is safer than under (a too-large rowHeight just mounts
// a few extra rows; a too-small one leaves gaps at the bottom of the viewport).
var ROW_HEIGHT_PX = 450;

function CatalogGrid(props) {
  var items = props.items || [];
  var profile = props.profile || {};
  var tier = props.tier || 'degraded';
  var onItemClick = props.onItemClick || null;
  var onOpenSettings = props.onOpenSettings || null;

  var profileId = profile.profile_id;
  var activeLayout = profile.active_layout || 'grid-standard';

  // W17-PURGE: when items[] is empty, render the honest empty state with an
  // Open Settings CTA. No fake-content fallback (the seed catalog is gone).
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div
        data-empty="true"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
      >
        <EmptyState
          icon="📭"
          title="No channels yet"
          message="None of your providers returned content. Open Settings → Providers and verify your iptv-org / xTremeHD / Apollo Group credentials are valid and reachable."
          cta={onOpenSettings ? { label: 'Open Settings', onClick: onOpenSettings } : null}
        />
      </div>
    );
  }

  // W16-PROVIDERS — Group-by-Provider toggle (persists per profile).
  var groupByState = React.useState(function() { return _readGroupPref(profileId); });
  var groupBy = groupByState[0];
  var setGroupBy = groupByState[1];
  // When the active profile changes (profile picker), re-read the pref so
  // Mom and Dave each remember their own grouping preference.
  React.useEffect(function() {
    setGroupBy(_readGroupPref(profileId));
  }, [profileId]);
  function toggleGroupBy() {
    var next = !groupBy;
    setGroupBy(next);
    _writeGroupPref(profileId, next);
  }

  // Provider filtering is already applied in App.jsx against sources[],
  // providers[], provider_id, provider and provider_tags. Do not re-filter
  // here with the old single-tab/provider_tags path or merged real-provider
  // rows disappear incorrectly.
  var filtered = items.slice();

  // Filter by profile access
  filtered = filtered.filter(function(item) {
    var access = item.profile_access || [];
    return !profileId || access.indexOf(profileId) !== -1;
  });

  // When grouping is on, sort items so same-provider entries are contiguous
  // and remember per-provider counts for the section headers.
  var groups = null;
  if (groupBy) {
    var buckets = {};
    var order = [];
    for (var gi = 0; gi < filtered.length; gi++) {
      var pp = _primaryProvider(filtered[gi]);
      if (!buckets[pp]) { buckets[pp] = []; order.push(pp); }
      buckets[pp].push(filtered[gi]);
    }
    // Stable provider order: known providers first (xtremehd, apollo_group,
    // iptv-org), everything else by descending bucket size so the user sees
    // their largest source first.
    var PROVIDER_RANK = { xtremehd: 1, apollo_group: 2, 'iptv-org': 3, iptv_org: 3, jellyfin: 4, xtream: 5 };
    order.sort(function(a, b) {
      var ra = PROVIDER_RANK[a] || 99;
      var rb = PROVIDER_RANK[b] || 99;
      if (ra !== rb) { return ra - rb; }
      return (buckets[b].length - buckets[a].length);
    });
    groups = [];
    for (var oi = 0; oi < order.length; oi++) {
      groups.push({ id: order[oi], items: buckets[order[oi]] });
    }
  }

  // Determine grid columns from layout and tier
  // enhanced: 5 for grid-standard, 8 for discovery, 2 for jumbo-rail
  // degraded: 3 for grid-standard, 4 for discovery, 2 for jumbo-rail
  var cols;
  if (props.columns !== undefined) {
    // explicit override from App.jsx
    cols = props.columns;
  } else if (activeLayout === 'jumbo-rail') {
    cols = 2;
  } else if (activeLayout === 'discovery') {
    cols = tier === 'enhanced' ? 8 : 4;
  } else {
    // grid-standard and rail-hero
    cols = tier === 'enhanced' ? 5 : 3;
  }

  // CSS class for grid container
  var gridClass = tier === 'enhanced' ? 'enhanced-grid' : 'degraded-grid';

  var gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(' + cols + ', 1fr)',
    // gridAutoRows:1fr aligns every card in a row to the same outer height
    // even when CatalogCard's internal poster aspect differs (16:9 for live,
    // 2:3 for VOD). Without this the row jagged-edges because mixed types
    // produce mixed intrinsic heights — exactly the audit-03 complaint.
    gridAutoRows: '1fr',
    gap: '1rem',
    padding: '1rem 1.5rem',
    flex: 1,
    alignItems: 'stretch',
  };

  // Degraded: disable hover transitions on grid container
  if (tier !== 'enhanced') {
    gridStyle.transition = 'none';
  }

  // ── W9-VIRTUALIZE: discover the scroll parent on mount ───────────────────
  // CatalogGrid is rendered inside a <main style="overflowY:auto"> in App.jsx
  // — that ancestor element is the actual scroll surface. We attach a ref to
  // a sentinel and walk up to find it once on mount.
  //
  // We expose the discovered parent as a React state-held ref-shape object
  // ({ current: parent }). When discovery resolves, we trigger a re-render
  // with a NEW object so useGridVirtualizer's [scrollRef, ...] dep sees a
  // fresh identity and attaches its scroll listener to the real element.
  var sentinelRef = React.useRef(null);
  var scrollRefState = React.useState({ current: null });
  var scrollRefHolder = scrollRefState[0];
  var setScrollRefHolder = scrollRefState[1];
  React.useEffect(function() {
    var parent = _findScrollParent(sentinelRef.current);
    if (parent) { setScrollRefHolder({ current: parent }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mom's TV is NEVER system-limited — virtualization is a perf optimisation,
  // not a content cap. She still sees the full filtered list; she just gets
  // a slightly larger overscan window so scrolling feels even smoother.
  var momProfile = !isSystemLimited(profile);
  var overscan = momProfile ? 4 : 2;

  // When grouped, the per-section grids virtualize themselves via CSS
  // overflow + the sentinel walk; we tell the top-level virtualizer to
  // treat itemCount as 0 so its row-windowing math is a no-op. The
  // sections below render the full per-provider lists.
  var virt = useGridVirtualizer({
    scrollRef: scrollRefHolder,
    itemCount: groupBy ? 0 : filtered.length,
    columns: cols,
    rowHeight: ROW_HEIGHT_PX,
    overscan: overscan,
  });

  if (!filtered.length) {
    return (
      <div
        ref={sentinelRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 'calc(1rem * var(--font-scale, 1))',
        }}
      >
        No content available for this filter.
      </div>
    );
  }

  // Slice to the visible window. When virtualization is off (small catalog,
  // < 100 items) startIndex=0 / endIndex=length so the slice is a no-op and
  // we render exactly as before.
  var visible = filtered.slice(virt.startIndex, virt.endIndex);

  // Focus restoration on scroll — when the focused card scrolls off the
  // virtualized window and back on, React replaces the DOM node and we
  // lose focus. We track the active card id via focusin on the grid root
  // and restore focus to the same data-card-id once it re-mounts.
  var gridRootRef = React.useRef(null);
  var lastFocusedIdRef = React.useRef(null);
  React.useEffect(function() {
    var root = gridRootRef.current;
    if (!root) { return undefined; }
    function onFocusIn(e) {
      var t = e.target;
      // Walk up to a node carrying data-card-id (the wrapper we render
      // around each CatalogCard). Avoids re-installing listeners per card.
      while (t && t !== root) {
        if (t.getAttribute && t.getAttribute('data-card-id')) {
          lastFocusedIdRef.current = t.getAttribute('data-card-id');
          return;
        }
        t = t.parentElement;
      }
    }
    root.addEventListener('focusin', onFocusIn);
    return function() { root.removeEventListener('focusin', onFocusIn); };
  }, []);

  // After every render, if the last focused id is in the visible slice but
  // the active element isn't inside the matching wrapper, refocus it. This
  // is the no-op path on every render that doesn't involve scroll: the
  // already-focused element keeps focus.
  React.useEffect(function() {
    var root = gridRootRef.current;
    var fid = lastFocusedIdRef.current;
    if (!root || !fid) { return; }
    var active = (typeof document !== 'undefined') ? document.activeElement : null;
    if (active && active !== document.body) {
      // Check whether the active element is already inside the matching
      // wrapper — if so we're done.
      var p = active;
      while (p && p !== root) {
        if (p.getAttribute && p.getAttribute('data-card-id') === fid) {
          return;
        }
        p = p.parentElement;
      }
    }
    // Active element is not the previously focused card — find that card
    // in the freshly rendered DOM and focus its first focusable child.
    var wrapper = root.querySelector('[data-card-id="' + fid + '"]');
    if (wrapper) {
      // CatalogCard renders the focusable element as the outermost child of
      // the wrapper (tabIndex={0}). Pick the first focusable descendant.
      var inner = wrapper.querySelector('[tabindex="0"], [tabindex="-1"]');
      if (inner && typeof inner.focus === 'function') {
        try { inner.focus({ preventScroll: true }); } catch (_e) {
          try { inner.focus(); } catch (_e2) {}
        }
        if (typeof inner.scrollIntoView === 'function') {
          try { inner.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_e3) {
            try { inner.scrollIntoView(false); } catch (_e4) {}
          }
        }
      }
    }
  }, [virt.startIndex, virt.endIndex, filtered.length]);

  // Group-by-Provider toolbar. Sits above the grid; small button + count.
  // Always rendered (even when there's only one provider) so the user can
  // discover the feature.
  var toolbar = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '0.5rem',
        padding: '0.5rem 1.5rem 0',
        flexShrink: 0,
      }}
    >
      <button
        tabIndex={0}
        role="switch"
        aria-checked={groupBy}
        aria-label="Group by provider"
        onClick={toggleGroupBy}
        onKeyDown={function(e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroupBy(); }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.85rem',
          background: groupBy ? 'rgba(0,212,255,0.18)' : 'transparent',
          border: '1px solid ' + (groupBy ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)'),
          borderRadius: '999px',
          color: groupBy ? 'var(--accent, #00d4ff)' : 'var(--muted)',
          fontSize: 'calc(0.78rem * var(--font-scale, 1))',
          fontWeight: 700,
          cursor: 'pointer',
          outline: 'none',
        }}
        onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
        onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
      >
        <span aria-hidden="true">⊞</span>
        <span>{groupBy ? 'Grouped by provider' : 'Group by provider'}</span>
      </button>
    </div>
  );

  if (groupBy && groups && groups.length > 0) {
    // Grouped view — one section per provider, each section is its own grid.
    // We bypass the central virtualizer for this mode (the per-section grids
    // still benefit from CSS overflow + the same DOM-mount footprint we had
    // pre-virtualization, since the user explicitly opted into seeing every
    // section's contents). Section headers double as virtualization landmarks
    // so the user can scroll directly to xTremeHD / iptv-org / Apollo.
    return (
      <div ref={sentinelRef}>
        {toolbar}
        <div ref={gridRootRef}>
          {groups.map(function(g) {
            var headerLabel = _displayName(g.id);
            var count = g.items.length;
            return (
              <section
                key={g.id}
                aria-label={headerLabel + ' (' + count + ' items)'}
                style={{ marginTop: '0.75rem' }}
              >
                <header
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.6rem 1.5rem 0.3rem',
                    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                    fontWeight: 800,
                    color: 'var(--text, #e6edf3)',
                    letterSpacing: '0.04em',
                    borderTop: '1px solid var(--border, #30363d)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent, #00d4ff)',
                    }}
                  />
                  <span>{headerLabel}</span>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({count.toLocaleString()})</span>
                </header>
                <div className={gridClass} style={gridStyle}>
                  {g.items.map(function(item, idx) {
                    var cardId = item.item_id || item.id;
                    return (
                      <div
                        key={g.id + '::' + cardId}
                        data-card-id={cardId}
                        data-card-index={idx}
                      >
                        <CatalogCard
                          item={item}
                          profile={profile}
                          tier={tier}
                          onClick={onItemClick}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={sentinelRef}>
      {toolbar}
      {/* Top spacer — preserves scrollbar geometry for unmounted rows.
          height=0 when virtualization is off (catalog under threshold). */}
      {virt.topSpacer > 0 && (
        <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
      )}
      <div ref={gridRootRef} className={gridClass} style={gridStyle}>
        {visible.map(function(item, sliceIdx) {
          var idx = virt.startIndex + sliceIdx;
          var cardId = item.item_id || item.id;
          return (
            <div
              key={cardId}
              data-card-id={cardId}
              data-card-index={idx}
            >
              <CatalogCard
                item={item}
                profile={profile}
                tier={tier}
                onClick={onItemClick}
              />
            </div>
          );
        })}
      </div>
      {/* Bottom spacer — preserves scrollbar geometry for unmounted trailing
          rows. height=0 when virtualization is off. */}
      {virt.bottomSpacer > 0 && (
        <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
      )}
    </div>
  );
}

export default CatalogGrid;
