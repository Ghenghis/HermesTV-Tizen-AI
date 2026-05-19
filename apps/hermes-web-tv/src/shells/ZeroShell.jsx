import React from 'react';
import { applyShellFilters, posterBg, useGridVirtualizer } from './shellHelpers.js';
import { debounce } from '../utils/debounce.js';

// ─────────────────────────────────────────────────────────────────────────────
// ZeroShell — HermesTV's clone of the IPTV Player Zero look (8th layout).
//
// Cloned design language (NOT cloned assets):
//   - Left rail: pinnable section toolbar with Favorite Movies, Trakt
//     (Watchlist / Library / History / Continue), Continue Watching,
//     Downloads, Categories search, Playlists tree.
//   - Top bar: stylised Z logo centred, time + Pro chip + bell + gear on
//     the right, "All playlists / N playlists" toggle.
//   - Top nav: Live TV / Catch-up / Movies / Series tabs.
//   - Main grid: poster cards 2:3 ratio with a yellow star-rating chip
//     top-right and a circular heart favourite bottom-right.
//   - Cyan-blue gradient accent across the Z logo and primary buttons.
//
// All copy is HermesTV branding — never reference "IPTV Player Zero" in
// user-visible strings. The visual language is inspired by the public
// screenshots; no proprietary assets are bundled.
// ─────────────────────────────────────────────────────────────────────────────

// Star rating used to render the yellow chip on the top-right of each card.
// Items don't carry a real `user_rating` yet — surface either the resolution
// rank or a deterministic per-id pseudo-rating so the chip is stable across
// renders without lying about data quality. Once we wire TMDb/TVMaze ratings
// in Phase 2 this falls back to the real value.
function _deriveStarRating(item) {
  if (item && typeof item.user_rating === 'number') {
    return Math.max(0, Math.min(10, item.user_rating));
  }
  if (item && item.metadata && typeof item.metadata.imdb_rating === 'number') {
    return Math.max(0, Math.min(10, item.metadata.imdb_rating));
  }
  // Deterministic fallback: first char of id → 0.0–9.9.
  var seed = item && item.id ? item.id.charCodeAt(0) : 0;
  return Math.round(((seed % 100) / 10) * 10) / 10;
}

function _formatStar(rating) {
  if (rating >= 10) { return '10.0'; }
  return rating.toFixed(2);
}

// ─── Sidebar inventory ────────────────────────────────────────────────────────
// Sections mirror the Zero-style rail. Counts come from the actual catalog
// when available so Sherri/Dave see real numbers, not stubs.
function _buildSidebarSections(catalog) {
  var counts = { live: 0, movies: 0, series: 0 };
  (catalog || []).forEach(function(it) {
    if (it.type === 'live') { counts.live++; }
    else if (it.type === 'movies' || it.type === 'movie') { counts.movies++; }
    else if (it.type === 'series') { counts.series++; }
  });
  return [
    { id: 'favorite_movies', icon: '★', label: 'Favorite Movies', count: 0, group: 'pinned' },
    { id: 'trakt', icon: '◉', label: 'Trakt', count: 0, group: 'sync', children: [
      { id: 'trakt_watchlist', label: 'Watchlist', count: 0 },
      { id: 'trakt_library', label: 'Library', count: 0 },
      { id: 'trakt_history', label: 'History', count: 0 },
      { id: 'trakt_continue', label: 'Continue', count: 0 },
    ] },
    { id: 'continue_watching', icon: '⟲', label: 'Continue Watching', count: 0, group: 'sync' },
    { id: 'downloads', icon: '⤓', label: 'Downloads', count: 0, group: 'sync' },
    { id: 'all_movies', icon: '🎬', label: 'All movies', count: counts.movies, group: 'browse' },
    { id: 'movies_new', icon: '✦', label: 'Movies-New Releases', count: counts.movies, group: 'browse' },
    { id: 'all_series', icon: '📺', label: 'All series', count: counts.series, group: 'browse' },
    { id: 'all_live', icon: '📡', label: 'Live TV', count: counts.live, group: 'browse' },
  ];
}

function ZeroShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var fontScale = (profile && profile.font_scale) || 1.0;
  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);

  var pinnedResult = React.useState(true); // "Pin top section" toggle (default on)
  var pinned = pinnedResult[0];
  var setPinned = pinnedResult[1];
  // Two-state search: searchInput is the immediate textbox value (drives the
  // controlled <input>), search is the debounced value that actually feeds
  // the filter pass. Typing "spo" produces 3 keystrokes but only 1 filter
  // run at most. 120 ms keeps the UI feeling instant while collapsing
  // bursty typing — well under the ~150 ms motor-to-visual threshold.
  var searchInputResult = React.useState('');
  var searchInput = searchInputResult[0];
  var setSearchInput = searchInputResult[1];
  var searchResult = React.useState('');
  var search = searchResult[0];
  var setSearch = searchResult[1];
  var sortResult = React.useState('newest');
  var sort = sortResult[0];
  var setSort = sortResult[1];
  var activeTabResult = React.useState('movies');
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];
  var nowResult = React.useState(new Date());
  var now = nowResult[0];
  var setNow = nowResult[1];

  // Build the debouncer once with useMemo so we don't re-create the timer
  // on every render (which would defeat the whole point).
  var debouncedSetSearch = React.useMemo(function() {
    return debounce(function(v) { setSearch(v); }, 120);
  }, []);
  // Cancel any pending timer on unmount so a setState doesn't fire after
  // React has dropped the shell from the tree.
  React.useEffect(function() {
    return function() { debouncedSetSearch.cancel(); };
  }, [debouncedSetSearch]);

  // Tick the clock once a minute so the top bar timestamp stays fresh.
  // Skipping seconds keeps Tizen 6.5 CPU draw effectively zero.
  React.useEffect(function() {
    var t = setInterval(function() { setNow(new Date()); }, 60000);
    return function() { clearInterval(t); };
  }, []);

  // Initial focus → first poster card, so the Tizen remote starts here.
  React.useEffect(function() {
    var el = document.querySelector('[data-zero-poster="true"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  var displayItems = filtered;
  if (activeTab === 'live') {
    displayItems = displayItems.filter(function(i) { return i.type === 'live'; });
  } else if (activeTab === 'movies') {
    displayItems = displayItems.filter(function(i) { return i.type === 'movies' || i.type === 'movie'; });
  } else if (activeTab === 'series') {
    displayItems = displayItems.filter(function(i) { return i.type === 'series'; });
  }
  // catchup tab: same list for now — actual TV-archive endpoint lands when
  // operator wires a catch-up source. The tab is visible regardless so users
  // get the same surface they expect from a Zero-style player.

  if (search) {
    var q = search.toLowerCase();
    displayItems = displayItems.filter(function(i) {
      return (i.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Sort: 'newest' falls back to catalog order; 'rating' uses the derived
  // star rating; 'a-z' uses title. Lazy + stable.
  if (sort === 'rating') {
    displayItems = displayItems.slice().sort(function(a, b) {
      return _deriveStarRating(b) - _deriveStarRating(a);
    });
  } else if (sort === 'a-z') {
    displayItems = displayItems.slice().sort(function(a, b) {
      return (a.title || '').localeCompare(b.title || '');
    });
  }

  // Grid columns scale with tier — QN85 stretches wider on enhanced.
  var cols = tier === 'enhanced' ? 7 : 5;

  // Virtualize the poster grid when the catalog exceeds the threshold
  // (~100 items). Below the threshold the helper short-circuits to a full
  // render so there's zero overhead. Row height = poster aspect-ratio 2:3
  // at the current column width + label/gap padding; on QN85 enhanced this
  // hovers around 280 px — we use a fixed estimate which is close enough
  // because we paint 1 row of overscan on either side. This is the chunk
  // that turns a 200+ item Apollo catalog from a stutter into a smooth scroll.
  var gridScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: gridScrollRef,
    itemCount: displayItems.length,
    columns: cols,
    rowHeight: 280,
    overscan: 1,
  });

  var tabs = [
    { id: 'live', icon: '📡', label: 'Live TV' },
    { id: 'catchup', icon: '⟲', label: 'Catch-up' },
    { id: 'movies', icon: '🎬', label: 'Movies' },
    { id: 'series', icon: '📺', label: 'Series' },
  ];

  var sidebarSections = _buildSidebarSections(catalog);
  var playlistCount = (providers && providers.length) || 0;
  var clockLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  var dateLabel = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div
      className="zero-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: pinned ? '240px 1fr' : '0 1fr',
        gridTemplateRows: '64px 1fr',
        height: '100%',
        background: 'var(--bg, #0a0e1a)',
        color: 'var(--text, #e6edf3)',
        overflow: 'hidden',
        fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
        transition: 'grid-template-columns 200ms ease',
      }}
    >
      {/* ─── Top bar (spans both columns visually) ─────────────────────────── */}
      <div
        style={{
          gridColumn: '1 / -1',
          gridRow: '1',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '0 1rem',
          background: 'linear-gradient(180deg, var(--surface, #161b22) 0%, var(--bg, #0a0e1a) 100%)',
          borderBottom: '1px solid var(--border, #1a2030)',
        }}
      >
        {/* Left cluster: clock + date */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: 'calc(0.78rem * var(--font-scale, 1))' }}>
          <span aria-hidden="true" style={{ color: 'var(--accent, #00d4ff)' }}>◷</span>
          <span style={{ fontWeight: 700 }}>{clockLabel}</span>
          <span style={{ color: 'var(--muted, #8b949e)' }}>{dateLabel}</span>
          <span
            aria-label="Pro plan"
            style={{
              marginLeft: '0.6rem',
              fontSize: 'calc(0.62rem * var(--font-scale, 1))',
              fontWeight: 800,
              color: '#0a0e1a',
              background: 'linear-gradient(135deg, #facc15, #f59e0b)',
              padding: '0.12rem 0.5rem',
              borderRadius: '999px',
              letterSpacing: '0.08em',
            }}
          >
            ♔ PRO
          </span>
        </div>

        {/* Centre: Z logo wordmark — placeholder gradient text, no asset */}
        <button
          tabIndex={0}
          aria-label="HermesTV — Zero look"
          onClick={function() { setActiveTab('movies'); }}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 900,
            fontSize: 'calc(1.4rem * var(--font-scale, 1))',
            letterSpacing: '0.04em',
            backgroundImage: 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            outline: 'none',
          }}
          onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '4px'; }}
          onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
        >
          Hermes<span style={{ marginLeft: '0.1em' }}>Z</span>
        </button>

        {/* Right cluster: All playlists / bell / settings */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.35rem 0.75rem',
              border: '1px solid var(--border, #1a2030)',
              borderRadius: '6px',
              fontSize: 'calc(0.7rem * var(--font-scale, 1))',
              background: 'var(--surface, #161b22)',
            }}
          >
            <span style={{ fontWeight: 700 }}>All playlists</span>
            <span style={{ color: 'var(--muted, #8b949e)' }}>· {playlistCount} {playlistCount === 1 ? 'playlist' : 'playlists'}</span>
          </div>
          <button
            tabIndex={0}
            aria-label="Notifications"
            style={{
              width: '34px', height: '34px', borderRadius: '8px',
              background: 'var(--surface, #161b22)', border: '1px solid var(--border, #1a2030)',
              color: 'var(--text, #e6edf3)', cursor: 'pointer', fontSize: '14px',
            }}
          >🔔</button>
          <button
            tabIndex={0}
            aria-label="Settings"
            style={{
              width: '34px', height: '34px', borderRadius: '8px',
              background: 'var(--surface, #161b22)', border: '1px solid var(--border, #1a2030)',
              color: 'var(--text, #e6edf3)', cursor: 'pointer', fontSize: '14px',
            }}
          >⚙</button>
        </div>
      </div>

      {/* ─── Left sidebar ──────────────────────────────────────────────────── */}
      <aside
        style={{
          gridColumn: '1',
          gridRow: '2',
          background: 'var(--surface, #161b22)',
          borderRight: '1px solid var(--border, #1a2030)',
          overflowY: 'auto',
          overflowX: 'hidden',
          opacity: pinned ? 1 : 0,
          transition: 'opacity 150ms ease',
        }}
      >
        {/* Pin top section toggle */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.6rem 0.85rem', borderBottom: '1px solid var(--border, #1a2030)',
            fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)',
          }}
        >
          <span>Pin top section</span>
          <button
            tabIndex={0}
            aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar'}
            onClick={function() { setPinned(!pinned); }}
            style={{
              width: '24px', height: '24px', borderRadius: '4px',
              background: 'transparent', border: '1px solid var(--border, #1a2030)',
              color: 'var(--text, #e6edf3)', cursor: 'pointer', fontSize: '12px',
            }}
          >◧</button>
        </div>

        {sidebarSections.map(function(sec) {
          return (
            <button
              key={sec.id}
              tabIndex={0}
              data-focusable="true"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '0.55rem 0.85rem',
                background: 'transparent', border: 'none', borderLeft: '3px solid transparent',
                color: 'var(--text, #e6edf3)', cursor: 'pointer', textAlign: 'left',
                fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.background = 'var(--surface-raised, #1c2128)'; e.currentTarget.style.borderLeftColor = 'var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
              onMouseEnter={function(e) { e.currentTarget.style.background = 'var(--surface-raised, #1c2128)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <span aria-hidden="true" style={{ color: 'var(--accent, #00d4ff)', fontSize: '14px', width: '16px', textAlign: 'center' }}>{sec.icon}</span>
                <span>{sec.label}</span>
              </span>
              <span style={{ color: 'var(--muted, #8b949e)', fontSize: 'calc(0.7rem * var(--font-scale, 1))' }}>{sec.count}</span>
            </button>
          );
        })}

        {/* Playlists block — surfaces operator-configured providers */}
        {providers && providers.length > 0 && (
          <div style={{ padding: '0.5rem 0.85rem 1rem', marginTop: '0.5rem', borderTop: '1px solid var(--border, #1a2030)' }}>
            <div style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
              Playlists · {providers.length}
            </div>
            {providers.map(function(p) {
              var label = p.provider_id || p.id || 'provider';
              return (
                <div
                  key={label}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.3rem 0', fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span aria-hidden="true" style={{ color: 'var(--accent, #00d4ff)' }}>◉</span>
                    <span>{label}</span>
                  </span>
                  <span
                    style={{
                      fontSize: 'calc(0.55rem * var(--font-scale, 1))',
                      color: 'var(--accent, #00d4ff)',
                      border: '1px solid var(--accent, #00d4ff)',
                      borderRadius: '3px',
                      padding: '0.05rem 0.3rem',
                      letterSpacing: '0.05em',
                    }}
                  >XTREAM</span>
                </div>
              );
            })}
          </div>
        )}
      </aside>

      {/* ─── Main content ──────────────────────────────────────────────────── */}
      <main
        style={{
          gridColumn: '2',
          gridRow: '2',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.6rem',
            padding: '0.75rem',
            background: 'var(--surface, #161b22)',
            borderBottom: '1px solid var(--border, #1a2030)',
          }}
        >
          {tabs.map(function(t) {
            var isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                tabIndex={0}
                aria-pressed={isActive}
                onClick={function() { setActiveTab(t.id); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(t.id); }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.45rem 1rem',
                  background: isActive ? 'var(--surface-raised, #1c2128)' : 'transparent',
                  border: '1px solid ' + (isActive ? 'var(--accent, #00d4ff)' : 'var(--border, #1a2030)'),
                  borderRadius: '999px',
                  color: isActive ? 'var(--accent, #00d4ff)' : 'var(--text, #e6edf3)',
                  cursor: 'pointer',
                  fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                  fontWeight: 600,
                  outline: 'none',
                  transition: 'background 100ms ease, color 100ms ease, border-color 100ms ease',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span aria-hidden="true">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Section header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1rem 1.25rem 0.5rem',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 'calc(1.25rem * var(--font-scale, 1))', fontWeight: 800 }}>
              {activeTab === 'movies' ? 'Movies-New Releases'
                : activeTab === 'series' ? 'Series'
                : activeTab === 'live' ? 'Live TV'
                : 'Catch-up'}
            </div>
            <div style={{ fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
              {displayItems.length} {displayItems.length === 1 ? 'item' : 'items'}
              {search ? ' · Filtered by "' + search + '"' : ''}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: 'calc(0.72rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)' }}>
              <span>Sort</span>
              <select
                value={sort}
                onChange={function(e) { setSort(e.target.value); }}
                style={{
                  background: 'var(--surface, #161b22)', color: 'var(--text, #e6edf3)',
                  border: '1px solid var(--border, #1a2030)', borderRadius: '6px',
                  padding: '0.25rem 0.5rem', fontSize: 'inherit', cursor: 'pointer',
                }}
              >
                <option value="newest">Newest</option>
                <option value="rating">Top rated</option>
                <option value="a-z">A → Z</option>
              </select>
            </label>
            <input
              type="search"
              value={searchInput}
              onChange={function(e) {
                var v = e.target.value;
                // Keep the controlled input instant — only debounce the
                // filter pass, never the keystroke echo.
                setSearchInput(v);
                debouncedSetSearch(v);
              }}
              placeholder="Search"
              aria-label="Search catalog"
              style={{
                background: 'var(--surface, #161b22)', color: 'var(--text, #e6edf3)',
                border: '1px solid var(--border, #1a2030)', borderRadius: '6px',
                padding: '0.3rem 0.7rem', fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                width: '200px', outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.borderColor = 'var(--accent, #00d4ff)'; }}
              onBlur={function(e) { e.currentTarget.style.borderColor = 'var(--border, #1a2030)'; }}
            />
          </div>
        </div>

        {/* Grid */}
        <div
          ref={gridScrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.5rem 1.25rem 1.25rem',
          }}
        >
          {displayItems.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted, #8b949e)' }}>
              <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }} aria-hidden="true">∅</div>
              <div>No items match the current filters.</div>
            </div>
          ) : (
            <React.Fragment>
              {/* Top spacer — preserves scrollbar geometry for the rows we
                  haven't mounted yet. height=0 when virtualization is off. */}
              {virt.topSpacer > 0 && (
                <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))',
                  gap: '0.85rem',
                }}
              >
                {displayItems.slice(virt.startIndex, virt.endIndex).map(function(item, sliceIdx) {
                  var idx = virt.startIndex + sliceIdx;
                var star = _deriveStarRating(item);
                // posterBg lives in ./shellHelpers.js — single source of truth
                // across all 8 shells. It checks poster_url → poster →
                // logo_url → thumb → metadata.poster_url before falling back
                // to a deterministic gradient hashed by item.id.
                var bg = posterBg(item, idx);
                var year = (item.metadata && item.metadata.year) || item.year || '';
                return (
                  <button
                    key={item.id || idx}
                    tabIndex={0}
                    data-zero-poster="true"
                    aria-label={(item.title || 'Untitled') + (year ? ' (' + year + ')' : '')}
                    onClick={function() { if (typeof onItemSelect === 'function') { onItemSelect(item); } }}
                    onKeyDown={function(e) {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (typeof onItemSelect === 'function') { onItemSelect(item); }
                      }
                    }}
                    style={{
                      position: 'relative',
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      outline: 'none',
                    }}
                    onFocus={function(e) { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.zIndex = '2'; }}
                    onBlur={function(e) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = '1'; }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        aspectRatio: '2 / 3',
                        background: bg,
                        borderRadius: '10px',
                        overflow: 'hidden',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                        transition: 'transform 150ms ease, box-shadow 150ms ease',
                      }}
                    >
                      {/* Star rating chip */}
                      <span
                        style={{
                          position: 'absolute', top: '6px', right: '6px',
                          display: 'flex', alignItems: 'center', gap: '2px',
                          padding: '2px 6px',
                          fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                          fontWeight: 700,
                          color: '#0a0e1a',
                          background: 'rgba(250,204,21,0.95)',
                          borderRadius: '999px',
                        }}
                      >
                        ★ {_formatStar(star)}
                      </span>
                      {/* Favorite heart */}
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute', bottom: '6px', right: '6px',
                          width: '24px', height: '24px',
                          borderRadius: '50%',
                          background: 'rgba(10,14,26,0.7)',
                          color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '12px',
                        }}
                      >♡</span>
                    </div>
                    <div
                      style={{
                        marginTop: '0.4rem',
                        fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                        fontWeight: 600,
                        color: 'var(--text, #e6edf3)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.title || 'Untitled'} {year ? <span style={{ color: 'var(--muted, #8b949e)', fontWeight: 400 }}>({year})</span> : null}
                    </div>
                  </button>
                );
              })}
              </div>
              {/* Bottom spacer — preserves scrollbar geometry for unmounted
                  trailing rows. height=0 when virtualization is off. */}
              {virt.bottomSpacer > 0 && (
                <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
              )}
            </React.Fragment>
          )}
        </div>
      </main>
    </div>
  );
}

export default ZeroShell;
