import React from 'react';
import { applyShellFilters, posterBg, useGridVirtualizer } from './shellHelpers.js';
import { isSystemLimited } from '../utils/isSystemLimited.js';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// ExtremeInfiniTVShell — HermesTV's "Power user" 3-pane shell (11th layout).
//
// Design language inspiration (not asset clones):
//   - Dense, data-rich dashboard for technical viewers.
//   - 3-pane grid: groups rail (220px) | tabular channel list (1fr) |
//     preview & metadata pane (360px).
//   - Sidebar groups are derived from item.category / item.genre, sorted by
//     count, with an "online" green dot when any live item in the group has
//     a non-empty stream URL.
//   - Middle list is a fixed-row table (56px / row) so the user can scan
//     dozens of channels quickly without poster decoration.
//   - Right pane shows a small auto-play preview at the top (on `enhanced`
//     tier only, when reduced_motion is off, and only for live streams),
//     followed by terminal-styled metadata: resolution, codec, bitrate,
//     stream URL host.
//   - Monospace for technical metadata; sans for primary content.
//   - Focus is the primary interaction (TV remote): every row, group
//     button, and tab gets `var(--shadow-focus)` on focus. Hover is
//     decorative only.
//
// HermesTV branding — never reference "Extreme-InfiniTV" or "InfiniTV" in
// any user-visible string.
// ─────────────────────────────────────────────────────────────────────────────

// Tabs at the top of the middle column. Keeps the column self-contained so
// the user can switch content type without leaving the dense list view.
var TABS = [
  { id: 'live', icon: '📡', label: 'Live' },
  { id: 'movies', icon: '🎬', label: 'Movies' },
  { id: 'series', icon: '📺', label: 'Series' },
  { id: 'all', icon: '◉', label: 'All' },
];

// Filter the catalog by the active tab. Movies handles the legacy 'movie'
// singular type used by some seed entries; everything else is exact-match.
function _byTab(items, tab) {
  if (tab === 'all') { return items; }
  if (tab === 'live') { return items.filter(function(i) { return isLive(i); }); }
  if (tab === 'movies') { return items.filter(function(i) { return isMovie(i); }); }
  if (tab === 'series') { return items.filter(function(i) { return isSeries(i); }); }
  return items;
}

// Build group buckets from item.category or item.genre. We default the
// label to "Uncategorized" so every item lands in exactly one bucket and
// the counts in the rail always add up to the displayed list length.
function _buildGroups(items) {
  var buckets = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var label = (it && (it.category || it.genre)) || 'Uncategorized';
    if (!buckets[label]) {
      buckets[label] = { id: label, label: label, count: 0, online: 0 };
    }
    buckets[label].count += 1;
    // Treat "online" as: has a non-empty stream_url. Coarse but cheap —
    // we don't want to network-probe on every catalog change.
    if (it && it.stream_url) {
      buckets[label].online += 1;
    }
  }
  var list = [];
  for (var key in buckets) {
    if (Object.prototype.hasOwnProperty.call(buckets, key)) {
      list.push(buckets[key]);
    }
  }
  // Sort by count desc, then label asc — keeps the busiest groups at the
  // top of the rail without flicker when counts tie.
  list.sort(function(a, b) {
    if (b.count !== a.count) { return b.count - a.count; }
    return a.label < b.label ? -1 : 1;
  });
  return list;
}

// Cheap "now / next" derivation. Real EPG is stitched in by epg.js routes
// downstream; this is just the fallback for shells that need to render
// program text immediately. Items may carry `metadata.epg_now / epg_next`
// from a hydrated provider; if not, we synthesise a placeholder so the
// row still aligns visually.
function _nowProgram(item) {
  if (item && item.metadata) {
    if (item.metadata.epg_now) { return item.metadata.epg_now; }
    if (item.metadata.program) { return item.metadata.program; }
  }
  if (isLive(item)) { return 'Live programming'; }
  if (item && item.title) { return item.title; }
  return '—';
}
function _nextProgram(item) {
  if (item && item.metadata && item.metadata.epg_next) { return item.metadata.epg_next; }
  return '—';
}

// Quality chip text. Mirrors the QualityFilter source of truth — prefer
// explicit metadata.resolution_label, fall back to item.quality, then to
// '—'. Returned text is short so the chip stays under 56px wide.
function _qualityChip(item) {
  if (item && item.metadata && item.metadata.resolution_label) {
    return item.metadata.resolution_label;
  }
  if (item && item.quality) {
    var q = String(item.quality).toUpperCase();
    if (q.indexOf('4K') !== -1 || q.indexOf('2160') !== -1) { return '4K'; }
    if (q.indexOf('1080') !== -1) { return 'FHD'; }
    if (q.indexOf('720') !== -1) { return 'HD'; }
    if (q.indexOf('480') !== -1) { return 'SD'; }
    return q.slice(0, 4);
  }
  return '—';
}

// Try to read a host from a URL string without using URL() (older Tizen
// builds can choke on URL constructor with non-spec strings). Falls back
// to the raw URL when we can't parse a host.
function _hostOf(url) {
  if (!url || typeof url !== 'string') { return ''; }
  var m = url.match(/^[a-zA-Z]+:\/\/([^\/?#]+)/);
  if (m && m[1]) { return m[1]; }
  return url.slice(0, 40);
}

// Map an item to a stable per-render technical metadata object. Pure —
// safe to call on focus change without React state churn.
function _technicalMeta(item) {
  var meta = (item && item.metadata) || {};
  return {
    resolution: meta.resolution || meta.resolution_label || (item && item.quality) || '—',
    codec: meta.codec || meta.video_codec || '—',
    bitrate: meta.bitrate || meta.video_bitrate || '—',
    audio: meta.audio_codec || meta.audio || '—',
    container: meta.container || meta.ext || '—',
    host: _hostOf((item && item.stream_url) || (meta && meta.stream_url) || ''),
  };
}

function ExtremeInfiniTVShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var fontScale = (profile && profile.font_scale) || 1.0;
  // Auto-play in the preview pane is enhanced-tier only AND respects the
  // user's reduced_motion preference. UN-class TVs and motion-sensitive
  // viewers get a static thumbnail instead — same data layout, just no
  // moving video. This matches the contract on NetflixShell.
  var allowPreview = tier === 'enhanced' && !(profile && profile.reduced_motion);

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);

  // State: which top-tab is active, which group is selected, which row is
  // focused (drives the preview pane), and a live search box.
  var tabResult = React.useState('live');
  var tab = tabResult[0];
  var setTab = tabResult[1];

  var groupResult = React.useState(null); // null = all groups
  var group = groupResult[0];
  var setGroup = groupResult[1];

  var searchResult = React.useState('');
  var search = searchResult[0];
  var setSearch = searchResult[1];

  var focusedResult = React.useState(null);
  var focused = focusedResult[0];
  var setFocused = focusedResult[1];

  // Initial focus → first channel row, so the Tizen remote starts in the
  // densest column. Deferred to next frame to give the DOM time to mount.
  React.useEffect(function() {
    var raf = (typeof window !== 'undefined' && window.requestAnimationFrame)
      ? window.requestAnimationFrame
      : function(cb) { return setTimeout(cb, 16); };
    raf(function() {
      var el = document.querySelector('[data-extreme-row="true"]');
      if (el && typeof el.focus === 'function') {
        try { el.focus(); } catch (_) {}
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab filter first — drives which catalog the rail groups operate on.
  var byTab = _byTab(filtered, tab);

  // Sidebar groups are derived from the tab-filtered catalog (not the
  // global one) so the "Sports · 24" count reflects what the user will
  // actually see in the middle list when they click that group.
  var groups = React.useMemo(function() {
    return _buildGroups(byTab);
  }, [byTab]);

  // Apply group + search to get the final list.
  var displayItems = byTab;
  if (group) {
    displayItems = displayItems.filter(function(it) {
      var label = (it && (it.category || it.genre)) || 'Uncategorized';
      return label === group;
    });
  }
  if (search) {
    var q = search.toLowerCase();
    displayItems = displayItems.filter(function(i) {
      return (i.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Virtualize the channel list — this list can grow past 100 rows on
  // operator catalogs with full Xtream playlists. Row height matches the
  // CSS-grid template below (56px fixed); the helper short-circuits when
  // the list is under the threshold so smaller catalogs pay no cost.
  //
  // W9-VIRTUALIZE: Mom gets a larger overscan for smoother feel without
  // changing the visible-data contract.
  var momProfile = !isSystemLimited(profile);
  var listScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: listScrollRef,
    itemCount: displayItems.length,
    columns: 1,
    rowHeight: 56,
    overscan: momProfile ? 4 : 2,
  });

  // The focused item is what the right pane reflects. When the focused
  // index falls out of the current list (e.g. tab change), reset to the
  // first row so the preview pane never points at a stale item.
  var focusedItem = null;
  if (focused !== null && focused >= 0 && focused < displayItems.length) {
    focusedItem = displayItems[focused];
  } else if (displayItems.length > 0) {
    focusedItem = displayItems[0];
  }

  // Header counts — surfaced in the top bar so power users can see at a
  // glance how big the current scope is.
  var totalLabel = displayItems.length + (displayItems.length === 1 ? ' channel' : ' channels');

  return (
    <div
      className="extreme-infinitv-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr 360px',
        gridTemplateRows: '56px 1fr',
        height: '100%',
        background: 'var(--bg, #0d1117)',
        color: 'var(--text, #e6edf3)',
        overflow: 'hidden',
        fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ─── Top bar: brand + tabs + search ──────────────────────────────── */}
      <div
        style={{
          gridColumn: '1 / -1',
          gridRow: '1',
          display: 'grid',
          gridTemplateColumns: '220px 1fr 360px',
          alignItems: 'center',
          borderBottom: '1px solid var(--border, #1a2030)',
          background: 'var(--surface, #161b22)',
        }}
      >
        {/* Brand cell — sits over the sidebar column */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0 0.85rem',
            height: '100%',
            borderRight: '1px solid var(--border, #1a2030)',
          }}
        >
          <span aria-hidden="true" style={{ color: 'var(--accent, #00d4aa)', fontFamily: '"Consolas", "Courier New", monospace', fontWeight: 800 }}>$_</span>
          <span style={{ fontWeight: 800, letterSpacing: '0.04em', fontSize: 'calc(0.9rem * ' + fontScale + ')' }}>
            Hermes<span style={{ color: 'var(--accent, #00d4aa)' }}>TV</span>
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: '"Consolas", "Courier New", monospace',
              fontSize: 'calc(0.6rem * ' + fontScale + ')',
              color: 'var(--muted, #8b949e)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Power
          </span>
        </div>

        {/* Tab strip — middle column */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0 0.85rem',
            height: '100%',
          }}
        >
          {TABS.map(function(t) {
            var isActive = tab === t.id;
            return (
              <button
                key={t.id}
                tabIndex={0}
                aria-pressed={isActive}
                onClick={function() { setTab(t.id); setFocused(null); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTab(t.id);
                    setFocused(null);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  background: isActive ? 'var(--surface-raised, #1c2128)' : 'transparent',
                  border: '1px solid ' + (isActive ? 'var(--accent, #00d4aa)' : 'var(--border, #1a2030)'),
                  borderRadius: 'var(--radius-pill, 999px)',
                  color: isActive ? 'var(--accent, #00d4aa)' : 'var(--text, #e6edf3)',
                  cursor: 'pointer',
                  fontSize: 'calc(0.72rem * ' + fontScale + ')',
                  fontWeight: 600,
                  outline: 'none',
                  transition: 'background 100ms ease, color 100ms ease, border-color 100ms ease',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span aria-hidden="true">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', color: 'var(--muted, #8b949e)', fontSize: 'calc(0.68rem * ' + fontScale + ')', fontFamily: '"Consolas", "Courier New", monospace' }}>
            {totalLabel}
          </span>
        </div>

        {/* Search — right column */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0 0.85rem',
            height: '100%',
            borderLeft: '1px solid var(--border, #1a2030)',
          }}
        >
          <input
            type="search"
            value={search}
            onChange={function(e) { setSearch(e.target.value); setFocused(null); }}
            placeholder="Search…"
            aria-label="Search channels"
            style={{
              flex: 1,
              background: 'var(--bg, #0d1117)',
              color: 'var(--text, #e6edf3)',
              border: '1px solid var(--border, #1a2030)',
              borderRadius: 'var(--radius-sm, 8px)',
              padding: '0.35rem 0.65rem',
              fontSize: 'calc(0.74rem * ' + fontScale + ')',
              outline: 'none',
              fontFamily: '"Consolas", "Courier New", monospace',
            }}
            onFocus={function(e) { e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; e.currentTarget.style.borderColor = 'var(--accent, #00d4aa)'; }}
            onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border, #1a2030)'; }}
          />
        </div>
      </div>

      {/* ─── Left: groups rail ───────────────────────────────────────────── */}
      <aside
        style={{
          gridColumn: '1',
          gridRow: '2',
          background: 'var(--surface, #161b22)',
          borderRight: '1px solid var(--border, #1a2030)',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
        aria-label="Groups"
      >
        <div
          style={{
            padding: '0.55rem 0.85rem',
            fontSize: 'calc(0.62rem * ' + fontScale + ')',
            color: 'var(--muted, #8b949e)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontFamily: '"Consolas", "Courier New", monospace',
            borderBottom: '1px solid var(--border, #1a2030)',
          }}
        >
          Groups · {groups.length}
        </div>

        {/* "All groups" reset row */}
        <button
          tabIndex={0}
          aria-pressed={group === null}
          onClick={function() { setGroup(null); setFocused(null); }}
          onKeyDown={function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault(); setGroup(null); setFocused(null);
            }
          }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%',
            padding: '0.5rem 0.85rem',
            background: group === null ? 'var(--surface-raised, #1c2128)' : 'transparent',
            border: 'none',
            borderLeft: '3px solid ' + (group === null ? 'var(--accent, #00d4aa)' : 'transparent'),
            color: group === null ? 'var(--accent, #00d4aa)' : 'var(--text, #e6edf3)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 'calc(0.78rem * ' + fontScale + ')',
            outline: 'none',
          }}
          onFocus={function(e) { e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
          onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
        >
          <span style={{ fontWeight: 600 }}>All groups</span>
          <span style={{ color: 'var(--muted, #8b949e)', fontFamily: '"Consolas", "Courier New", monospace', fontSize: 'calc(0.7rem * ' + fontScale + ')' }}>
            {byTab.length}
          </span>
        </button>

        {groups.map(function(g) {
          var isActive = group === g.id;
          var hasOnline = g.online > 0;
          return (
            <button
              key={g.id}
              tabIndex={0}
              aria-pressed={isActive}
              data-focusable="true"
              onClick={function() { setGroup(g.id); setFocused(null); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault(); setGroup(g.id); setFocused(null);
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%',
                padding: '0.5rem 0.85rem',
                background: isActive ? 'var(--surface-raised, #1c2128)' : 'transparent',
                border: 'none',
                borderLeft: '3px solid ' + (isActive ? 'var(--accent, #00d4aa)' : 'transparent'),
                color: 'var(--text, #e6edf3)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 'calc(0.76rem * ' + fontScale + ')',
                outline: 'none',
                transition: 'background 100ms ease',
              }}
              onFocus={function(e) { e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              onMouseEnter={function(e) { if (!isActive) { e.currentTarget.style.background = 'var(--surface-raised, #1c2128)'; } }}
              onMouseLeave={function(e) { if (!isActive) { e.currentTarget.style.background = 'transparent'; } }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, flex: 1 }}>
                <span
                  aria-hidden="true"
                  title={hasOnline ? g.online + ' online' : 'No active streams'}
                  style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: hasOnline ? '#22c55e' : 'var(--muted, #8b949e)',
                    flexShrink: 0,
                    // Pulse only when on enhanced tier with motion allowed —
                    // keeps the rail still on UN-class TVs.
                    boxShadow: hasOnline && allowPreview ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.label}
                </span>
              </span>
              <span
                style={{
                  color: 'var(--muted, #8b949e)',
                  fontFamily: '"Consolas", "Courier New", monospace',
                  fontSize: 'calc(0.68rem * ' + fontScale + ')',
                  flexShrink: 0,
                  marginLeft: '0.5rem',
                }}
              >
                {g.count}
              </span>
            </button>
          );
        })}

        {/* Providers footnote — power users want to see the source */}
        {providers && providers.length > 0 && (
          <div
            style={{
              padding: '0.6rem 0.85rem 1rem',
              marginTop: '0.5rem',
              borderTop: '1px solid var(--border, #1a2030)',
              fontFamily: '"Consolas", "Courier New", monospace',
              fontSize: 'calc(0.62rem * ' + fontScale + ')',
              color: 'var(--muted, #8b949e)',
            }}
          >
            <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem' }}>
              Sources · {providers.length}
            </div>
            {providers.map(function(p) {
              var label = (p && (p.provider_id || p.id)) || 'provider';
              return (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                  <span style={{ color: 'var(--text, #e6edf3)' }}>{label}</span>
                  <span style={{ color: 'var(--accent, #00d4aa)' }}>OK</span>
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* ─── Middle: tabular channel list ────────────────────────────────── */}
      <main
        style={{
          gridColumn: '2',
          gridRow: '2',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg, #0d1117)',
        }}
      >
        {/* Continue Watching rail — sits above the channel-list table header.
            Returns null when the profile has no history, so the dense
            data-grid layout doesn't gain wasted vertical space when empty. */}
        <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} max={8} />

        {/* Column header — gives the table a scannable structure */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 1.6fr 1.4fr 1.4fr 60px',
            gap: '0.6rem',
            padding: '0.5rem 0.85rem',
            background: 'var(--surface, #161b22)',
            borderBottom: '1px solid var(--border, #1a2030)',
            fontFamily: '"Consolas", "Courier New", monospace',
            fontSize: 'calc(0.6rem * ' + fontScale + ')',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--muted, #8b949e)',
            flexShrink: 0,
          }}
        >
          <span></span>
          <span>Name</span>
          <span>Now</span>
          <span>Next</span>
          <span style={{ textAlign: 'right' }}>Q</span>
        </div>

        <div
          ref={listScrollRef}
          style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
        >
          {displayItems.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted, #8b949e)' }}>
              <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }} aria-hidden="true">∅</div>
              <div>No channels match the current filters.</div>
            </div>
          ) : (
            <React.Fragment>
              {virt.topSpacer > 0 && (
                <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
              )}
              {displayItems.slice(virt.startIndex, virt.endIndex).map(function(item, sliceIdx) {
                var idx = virt.startIndex + sliceIdx;
                var isFocused = focused === idx || (focused === null && idx === 0);
                var bg = posterBg(item, idx);
                return (
                  <button
                    key={item.id || idx}
                    tabIndex={0}
                    data-extreme-row="true"
                    data-focusable="true"
                    aria-label={item.title || 'Channel'}
                    onFocus={function() { setFocused(idx); }}
                    onMouseEnter={function() { /* hover does not change focus — TV-remote-first */ }}
                    onClick={function() {
                      setFocused(idx);
                      if (typeof onItemSelect === 'function') { onItemSelect(item); }
                    }}
                    onKeyDown={function(e) {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setFocused(idx);
                        if (typeof onItemSelect === 'function') { onItemSelect(item); }
                      }
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1.6fr 1.4fr 1.4fr 60px',
                      gap: '0.6rem',
                      alignItems: 'center',
                      width: '100%',
                      height: '56px',
                      padding: '0 0.85rem',
                      background: isFocused ? 'var(--surface-raised, #1c2128)' : 'transparent',
                      border: 'none',
                      borderLeft: '3px solid ' + (isFocused ? 'var(--accent, #00d4aa)' : 'transparent'),
                      color: 'var(--text, #e6edf3)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      outline: 'none',
                      borderBottom: '1px solid rgba(26,32,48,0.5)',
                    }}
                    onFocusCapture={function(e) { e.currentTarget.style.boxShadow = 'var(--shadow-focus)'; }}
                    onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    {/* Logo / mini poster */}
                    <span
                      aria-hidden="true"
                      style={{
                        width: '32px', height: '32px', borderRadius: 'var(--radius-xs, 4px)',
                        background: bg, flexShrink: 0,
                        boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
                      }}
                    />
                    {/* Name + provider */}
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'calc(0.82rem * ' + fontScale + ')',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.title || 'Untitled'}
                      </span>
                      {item.provider_id && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: 'calc(0.62rem * ' + fontScale + ')',
                            color: 'var(--muted, #8b949e)',
                            fontFamily: '"Consolas", "Courier New", monospace',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.provider_id}
                        </span>
                      )}
                    </span>
                    {/* Now */}
                    <span
                      style={{
                        fontSize: 'calc(0.72rem * ' + fontScale + ')',
                        color: 'var(--text, #e6edf3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {_nowProgram(item)}
                    </span>
                    {/* Next */}
                    <span
                      style={{
                        fontSize: 'calc(0.7rem * ' + fontScale + ')',
                        color: 'var(--muted, #8b949e)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {_nextProgram(item)}
                    </span>
                    {/* Quality chip */}
                    <span
                      style={{
                        justifySelf: 'end',
                        fontSize: 'calc(0.58rem * ' + fontScale + ')',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        color: 'var(--accent, #00d4aa)',
                        border: '1px solid var(--accent, #00d4aa)',
                        borderRadius: 'var(--radius-xs, 4px)',
                        padding: '0.1rem 0.35rem',
                        fontFamily: '"Consolas", "Courier New", monospace',
                        minWidth: '36px',
                        textAlign: 'center',
                      }}
                    >
                      {_qualityChip(item)}
                    </span>
                  </button>
                );
              })}
              {virt.bottomSpacer > 0 && (
                <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
              )}
            </React.Fragment>
          )}
        </div>
      </main>

      {/* ─── Right: preview + metadata pane ─────────────────────────────── */}
      <aside
        style={{
          gridColumn: '3',
          gridRow: '2',
          background: 'var(--surface, #161b22)',
          borderLeft: '1px solid var(--border, #1a2030)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
        aria-label="Preview"
      >
        {focusedItem ? (
          <PreviewPane
            item={focusedItem}
            allowPreview={allowPreview}
            fontScale={fontScale}
            tier={tier}
          />
        ) : (
          <div style={{ padding: '2rem', color: 'var(--muted, #8b949e)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }} aria-hidden="true">▮</div>
            <div>Focus a channel to see details.</div>
          </div>
        )}
      </aside>
    </div>
  );
}

// ─── Preview pane — split out so focus changes don't re-render the whole
// shell. Cheap to render: only the focused-item id matters. -----------------
function PreviewPane(props) {
  var item = props.item;
  var allowPreview = props.allowPreview;
  var fontScale = props.fontScale;

  var isLiveItem = isLive(item);
  var meta = _technicalMeta(item);
  var bg = posterBg(item, 0);
  var streamUrl = (item && item.stream_url) || (item && item.metadata && item.metadata.stream_url) || '';

  // For live: try to autoplay the stream in a muted <video>. The pane is
  // an HLS .m3u8 in many cases — Tizen 6.5 / Chrome 76 can natively play
  // some of these, but to stay safe we only attempt autoplay when the URL
  // ends in .mp4 / .webm / .m3u8 AND tier allows preview. For everything
  // else we fall back to the still poster.
  var canAutoplay = allowPreview && isLiveItem && streamUrl && (
    /\.(mp4|webm|m3u8)(\?|$)/i.test(streamUrl)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Preview slot — 16:9 */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: bg,
          flexShrink: 0,
          borderBottom: '1px solid var(--border, #1a2030)',
        }}
      >
        {canAutoplay ? (
          <video
            // key tied to stream url so changing focused channel triggers
            // a fresh element rather than mutating src on a paused player
            // (which Tizen sometimes leaves in a stuck buffering state).
            key={streamUrl}
            src={streamUrl}
            autoPlay
            muted
            playsInline
            // No loop — live streams can't loop and on-demand previews
            // should stop at the natural end.
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              background: '#000',
            }}
            // On error fall back silently to the poster background.
            onError={function(e) {
              try { e.currentTarget.style.display = 'none'; } catch (_) {}
            }}
          />
        ) : (
          // Static thumbnail with a "LIVE" or "VOD" badge.
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
              padding: '0.6rem',
            }}
          >
            <span
              style={{
                fontFamily: '"Consolas", "Courier New", monospace',
                fontSize: 'calc(0.58rem * ' + fontScale + ')',
                fontWeight: 800,
                letterSpacing: '0.1em',
                color: '#0d1117',
                background: isLiveItem ? '#ef4444' : 'var(--accent, #00d4aa)',
                padding: '0.15rem 0.4rem',
                borderRadius: 'var(--radius-xs, 4px)',
              }}
            >
              {isLiveItem ? 'LIVE' : 'VOD'}
            </span>
          </div>
        )}
      </div>

      {/* Title + synopsis */}
      <div style={{ padding: '0.85rem 1rem 0.5rem' }}>
        <div
          style={{
            fontSize: 'calc(1rem * ' + fontScale + ')',
            fontWeight: 700,
            marginBottom: '0.25rem',
          }}
        >
          {item.title || 'Untitled'}
        </div>
        <div
          style={{
            fontSize: 'calc(0.7rem * ' + fontScale + ')',
            color: 'var(--muted, #8b949e)',
            lineHeight: 1.45,
            maxHeight: '4.4em',
            overflow: 'hidden',
          }}
        >
          {(item.metadata && item.metadata.synopsis) || item.description || (isLiveItem ? 'Live channel — currently broadcasting.' : 'No synopsis available for this title.')}
        </div>
      </div>

      {/* Technical metadata — terminal-styled */}
      <div
        style={{
          margin: '0.5rem 1rem 1rem',
          padding: '0.6rem 0.75rem',
          background: 'var(--bg, #0d1117)',
          border: '1px solid var(--border, #1a2030)',
          borderRadius: 'var(--radius-sm, 8px)',
          fontFamily: '"Consolas", "Courier New", monospace',
          fontSize: 'calc(0.68rem * ' + fontScale + ')',
        }}
      >
        <div
          style={{
            color: 'var(--accent, #00d4aa)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 'calc(0.58rem * ' + fontScale + ')',
            marginBottom: '0.45rem',
          }}
        >
          Technical
        </div>
        <MetaRow k="resolution" v={meta.resolution} />
        <MetaRow k="codec" v={meta.codec} />
        <MetaRow k="bitrate" v={meta.bitrate} />
        <MetaRow k="audio" v={meta.audio} />
        <MetaRow k="container" v={meta.container} />
        {meta.host && <MetaRow k="host" v={meta.host} />}
      </div>
    </div>
  );
}

// Tiny terminal-style key/value row. Pulled out so the markup above stays
// scannable when reading the preview pane in isolation.
function MetaRow(props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.12rem 0' }}>
      <span style={{ color: 'var(--muted, #8b949e)' }}>{props.k}</span>
      <span
        style={{
          color: 'var(--text, #e6edf3)',
          maxWidth: '60%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {props.v}
      </span>
    </div>
  );
}

export default ExtremeInfiniTVShell;
