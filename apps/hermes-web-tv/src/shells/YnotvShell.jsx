import React from 'react';
import { applyShellFilters, posterBg, useGridVirtualizer } from './shellHelpers.js';
import { debounce } from '../utils/debounce.js';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';

// ─────────────────────────────────────────────────────────────────────────────
// YnotvShell — DaveTV's "Lean TV" layout (13th layout).
//
// Cloned design language (NOT cloned assets):
//   - Windows 11-style fluent surface: slate-on-electric-blue, mica-feeling
//     translucent top bar, soft 1px borders, and a faux window-chrome cluster
//     on the right edge of the top bar (we hide the real window controls in
//     TV mode but keep the visual cue — minimize/maximize/close glyphs).
//   - LEFT mini-rail: 4 icon-only entries (Live / Movies / Series / Watchlist).
//     56 px wide, no labels in the rail itself — labels appear in the
//     central content header so the rail stays Windows-tight.
//   - TOP bar: current channel/section name on the left, an EPG preview "pill"
//     centered (shows "Now • {title}" when something is focused), clock + the
//     faux window controls on the right.
//   - MAIN content: standard poster grid driven by `applyShellFilters` +
//     `useGridVirtualizer` — same contract as every other shell.
//   - RIGHT channel overlay: a floating card that slides in from the right
//     for 4 seconds whenever the user focuses a NEW poster. Shows the item
//     title and real now/next data when available. Slides out automatically,
//     can also be dismissed by Escape.
//   - WATCHLIST tab: filters catalog to movies/series only, header chip says
//     "Watchlist (N)".
//   - CALENDAR tab: a one-month vanilla calendar grid. Days that have a
//     "release" (we surface anything with a year match this year, else a
//     deterministic week-of-month bucket so the dots aren't empty in the
//     mock catalog) get a small accent dot. Arrow keys move between days;
//     Enter clicks into "today's releases" list below.
//
// All copy is DaveTV branding — "ynotv" never appears in user-visible
// strings. The visual language is inspired by the public screenshots; no
// proprietary assets are bundled.
//
// Tizen 6.5 / Chrome 76 safe:
//   - No arrow functions, no destructuring, no template strings, no optional
//     chaining, no `:has()`, no `@container`.
//   - Channel overlay animates transform + opacity only, ≤220ms.
//   - ES5-style function declarations + `var`.
// ─────────────────────────────────────────────────────────────────────────────

// Channel overlay auto-hide. 4 s matches ynotv's screenshot timing — long
// enough to read the title + Now/Next pair, short enough that the user
// doesn't perceive it as a stuck modal blocking the grid.
var CHANNEL_OVERLAY_MS = 4000;

// Channel overlay slide duration. Keep under 220ms per task brief.
var CHANNEL_OVERLAY_TRANSITION_MS = 200;

// Days of week for the calendar header. Mon-first feels Windows-y; Sun-first
// is the US default. We go Sun-first to match DaveTV's English-US base locale.
var WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

var MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ─── Calendar helpers ───────────────────────────────────────────────────────
// Build a 6-row × 7-col grid of dates for a given month-anchor date. Each
// cell carries the JS Date plus an `inMonth` flag so we can fade out the
// padding cells from the previous/next month. 42 cells = 6 weeks, which
// always covers every possible month rendering (worst case: 31 days starting
// on a Saturday spans 6 weeks).
function _buildCalendarGrid(anchor) {
  var year = anchor.getFullYear();
  var month = anchor.getMonth();
  var first = new Date(year, month, 1);
  var firstWeekday = first.getDay(); // 0 = Sunday
  var grid = [];
  // Start `firstWeekday` days before the 1st so the first row aligns to Sun.
  var cursor = new Date(year, month, 1 - firstWeekday);
  for (var i = 0; i < 42; i++) {
    grid.push({
      date: new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()),
      inMonth: cursor.getMonth() === month,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return grid;
}

// Map catalog items → set of real release dates ("YYYY-MM-DD"). Items without
// an explicit release_date are omitted; no deterministic buckets or fake dots.
function _buildReleaseMap(items, anchor) {
  var map = {}; // 'YYYY-MM-DD' -> [item]
  var anchorYear = anchor.getFullYear();
  var anchorMonth = anchor.getMonth();
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it) { continue; }
    if (isLive(it)) { continue; } // live channels don't have releases
    var dateStr = null;
    if (typeof it.release_date === 'string' && it.release_date.length >= 10) {
      dateStr = it.release_date.substring(0, 10);
    } else if (it.metadata && typeof it.metadata.release_date === 'string'
        && it.metadata.release_date.length >= 10) {
      dateStr = it.metadata.release_date.substring(0, 10);
    }
    if (!dateStr) { continue; }
    if (!map[dateStr]) { map[dateStr] = []; }
    map[dateStr].push(it);
  }
  return map;
}

function _dateKey(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1);
  if (m.length < 2) { m = '0' + m; }
  var day = String(d.getDate());
  if (day.length < 2) { day = '0' + day; }
  return y + '-' + m + '-' + day;
}

function _sameDate(a, b) {
  if (!a || !b) { return false; }
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// ─── Up-Next label ──────────────────────────────────────────────────────────
// Honest empty until a real EPG/queue source is wired into this shell.
function _upNextLabel(item) {
  return '';
}

function _nowPlayingLabel(item) {
  if (!item) { return 'Browse the catalog'; }
  if (isLive(item)) {
    return item.title || 'Live channel';
  }
  return item.title || 'Featured';
}

// ─── Mini-rail icon set ─────────────────────────────────────────────────────
// 4 icons, Live / Movies / Series / Watchlist. Glyphs picked from the same
// pool the other shells use (📡 🎬 📺 ★) so the operator sees a consistent
// visual vocabulary across switches.
var RAIL_ITEMS = [
  { id: 'live', icon: '📡', label: 'Live TV' },
  { id: 'movies', icon: '🎬', label: 'Movies' },
  { id: 'series', icon: '📺', label: 'Series' },
  { id: 'watchlist', icon: '★', label: 'Watchlist' },
  { id: 'calendar', icon: '🗓', label: 'Calendar' },
];

function YnotvShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var fontScale = (profile && profile.font_scale) || 1.0;
  var reducedMotion = !!(profile && profile.reduced_motion);
  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);

  // ── Tab state ─────────────────────────────────────────────────────────────
  var activeTabResult = React.useState('movies');
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];

  // ── Search (debounced) ────────────────────────────────────────────────────
  var searchInputResult = React.useState('');
  var searchInput = searchInputResult[0];
  var setSearchInput = searchInputResult[1];
  var searchResult = React.useState('');
  var search = searchResult[0];
  var setSearch = searchResult[1];
  var debouncedSetSearch = React.useMemo(function() {
    return debounce(function(v) { setSearch(v); }, 120);
  }, []);
  React.useEffect(function() {
    return function() { debouncedSetSearch.cancel(); };
  }, [debouncedSetSearch]);

  // ── Clock ─────────────────────────────────────────────────────────────────
  var nowResult = React.useState(new Date());
  var now = nowResult[0];
  var setNow = nowResult[1];
  React.useEffect(function() {
    var t = setInterval(function() { setNow(new Date()); }, 60000);
    return function() { clearInterval(t); };
  }, []);

  // ── Focused item (drives the channel overlay) ─────────────────────────────
  var focusedItemResult = React.useState(null);
  var focusedItem = focusedItemResult[0];
  var setFocusedItem = focusedItemResult[1];
  var overlayVisibleResult = React.useState(false);
  var overlayVisible = overlayVisibleResult[0];
  var setOverlayVisible = overlayVisibleResult[1];
  var overlayTimerRef = React.useRef(null);

  function showChannelOverlay(item) {
    if (!item) { return; }
    setFocusedItem(item);
    setOverlayVisible(true);
    if (overlayTimerRef.current) {
      clearTimeout(overlayTimerRef.current);
    }
    overlayTimerRef.current = setTimeout(function() {
      setOverlayVisible(false);
    }, CHANNEL_OVERLAY_MS);
  }

  React.useEffect(function() {
    return function() {
      if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); }
    };
  }, []);

  // ── Calendar state ────────────────────────────────────────────────────────
  // Anchor: the month currently being rendered (always pinned to day 1
  // internally). Selected: the cell currently focused for keyboard nav.
  var calendarAnchorResult = React.useState(function() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  var calendarAnchor = calendarAnchorResult[0];
  var setCalendarAnchor = calendarAnchorResult[1];
  var calendarSelectedResult = React.useState(function() { return new Date(); });
  var calendarSelected = calendarSelectedResult[0];
  var setCalendarSelected = calendarSelectedResult[1];

  // ── Compute the visible display set ───────────────────────────────────────
  var displayItems = filtered;
  if (activeTab === 'live') {
    displayItems = displayItems.filter(function(i) { return isLive(i); });
  } else if (activeTab === 'movies') {
    displayItems = displayItems.filter(function(i) { return isMovie(i); });
  } else if (activeTab === 'series') {
    displayItems = displayItems.filter(function(i) { return isSeries(i); });
  } else if (activeTab === 'watchlist') {
    // Watchlist: movies + series. Live channels aren't watchlisted.
    displayItems = displayItems.filter(function(i) {
      return isMovie(i) || isSeries(i);
    });
  }
  // calendar tab handles its own list rendering below.

  if (search) {
    var q = search.toLowerCase();
    displayItems = displayItems.filter(function(i) {
      return (i.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Grid columns scale with tier — QN85 stretches wider on enhanced.
  // Actual grid uses auto-fill minmax(180 px) so the rendered column count
  // adapts to viewport; `cols` only feeds the virtualizer row-height math.
  var cols = tier === 'enhanced' ? 9 : 6;

  var gridScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: gridScrollRef,
    itemCount: displayItems.length,
    columns: cols,
    rowHeight: 280,
    overscan: 1,
  });

  // Initial focus → first poster card so the Tizen remote starts here.
  React.useEffect(function() {
    var el = document.querySelector('[data-ynotv-poster="true"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape dismisses the channel overlay early.
  React.useEffect(function() {
    function onKey(e) {
      if (e.key === 'Escape' && overlayVisible) {
        setOverlayVisible(false);
        if (overlayTimerRef.current) { clearTimeout(overlayTimerRef.current); }
      }
    }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [overlayVisible]);

  // ── Header strings ────────────────────────────────────────────────────────
  var clockLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  var sectionTitle = activeTab === 'live' ? 'Live TV'
    : activeTab === 'movies' ? 'Movies'
    : activeTab === 'series' ? 'Series'
    : activeTab === 'watchlist' ? 'Watchlist'
    : activeTab === 'calendar' ? 'Calendar'
    : 'DaveTV';

  // Watchlist count for the header chip.
  var watchlistCount = 0;
  for (var wi = 0; wi < filtered.length; wi++) {
    var fi = filtered[wi];
    if (fi && (isMovie(fi) || isSeries(fi))) {
      watchlistCount++;
    }
  }

  // EPG preview pill content. When something is focused, surface "Now • title";
  // otherwise show a hint string so the pill is never empty.
  var pillNow = focusedItem ? _nowPlayingLabel(focusedItem) : 'Browse the catalog';
  var pillNext = focusedItem ? _upNextLabel(focusedItem) : '';

  // ── Calendar derived ──────────────────────────────────────────────────────
  // Pre-compute the release map + grid so the render path stays straight.
  var releaseMap = React.useMemo(function() {
    return _buildReleaseMap(filtered, calendarAnchor);
  }, [filtered, calendarAnchor]);
  var calendarGrid = React.useMemo(function() {
    return _buildCalendarGrid(calendarAnchor);
  }, [calendarAnchor]);
  var selectedKey = _dateKey(calendarSelected);
  var selectedReleases = releaseMap[selectedKey] || [];

  // Arrow-key calendar navigation. Bound only when the calendar tab is active
  // so we don't fight the poster-grid focus on other tabs.
  React.useEffect(function() {
    if (activeTab !== 'calendar') { return undefined; }
    function onKey(e) {
      var delta = 0;
      if (e.key === 'ArrowLeft') { delta = -1; }
      else if (e.key === 'ArrowRight') { delta = 1; }
      else if (e.key === 'ArrowUp') { delta = -7; }
      else if (e.key === 'ArrowDown') { delta = 7; }
      else { return; }
      e.preventDefault();
      setCalendarSelected(function(prev) {
        var next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + delta);
        // Auto-jump the anchor month if the selection crosses out of it.
        if (next.getMonth() !== calendarAnchor.getMonth()
            || next.getFullYear() !== calendarAnchor.getFullYear()) {
          setCalendarAnchor(new Date(next.getFullYear(), next.getMonth(), 1));
        }
        return next;
      });
    }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [activeTab, calendarAnchor]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="ynotv-shell"
      style={{
        display: 'grid',
        gridTemplateColumns: '56px 1fr',
        gridTemplateRows: '52px 1fr',
        height: '100%',
        background: 'var(--bg, #0c111c)',
        color: 'var(--text, #e6edf3)',
        overflow: 'hidden',
        fontFamily: '"Segoe UI Variable", "Segoe UI", "Inter", system-ui, -apple-system, sans-serif',
        position: 'relative',
      }}
    >
      {/* ─── Top bar (spans both columns) ────────────────────────────────── */}
      <div
        style={{
          gridColumn: '1 / -1',
          gridRow: '1',
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1fr) minmax(280px, 2fr) minmax(180px, 1fr)',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0 0.85rem',
          background: 'linear-gradient(180deg, rgba(28,35,52,0.92) 0%, rgba(20,26,42,0.92) 100%)',
          borderBottom: '1px solid rgba(120,150,200,0.18)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        {/* Left: section name + count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '10px', height: '10px',
              borderRadius: '2px',
              background: 'linear-gradient(135deg, var(--accent, #4d8bff), #2563eb)',
              boxShadow: '0 0 8px rgba(77,139,255,0.6)',
            }}
          />
          <span
            style={{
              fontSize: 'calc(0.85rem * var(--font-scale, 1))',
              fontWeight: 700,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sectionTitle}
          </span>
          {activeTab === 'watchlist' && (
            <span
              style={{
                fontSize: 'calc(0.66rem * var(--font-scale, 1))',
                fontWeight: 700,
                padding: '0.12rem 0.5rem',
                borderRadius: '999px',
                background: 'rgba(77,139,255,0.18)',
                color: 'var(--accent, #4d8bff)',
                border: '1px solid rgba(77,139,255,0.4)',
                letterSpacing: '0.04em',
              }}
            >
              {watchlistCount}
            </span>
          )}
        </div>

        {/* Center: EPG preview pill */}
        <div
          aria-label="Now playing preview"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.3rem 0.85rem',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(120,150,200,0.22)',
            borderRadius: '999px',
            justifySelf: 'center',
            minWidth: 0,
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '6px', height: '6px', borderRadius: '50%',
              background: 'var(--accent, #4d8bff)',
              boxShadow: '0 0 6px var(--accent, #4d8bff)',
              flex: '0 0 auto',
            }}
          />
          <span
            style={{
              fontSize: 'calc(0.7rem * var(--font-scale, 1))',
              color: 'var(--muted, #94a3b8)',
              fontWeight: 600,
              flex: '0 0 auto',
            }}
          >
            Now
          </span>
          <span
            style={{
              fontSize: 'calc(0.72rem * var(--font-scale, 1))',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
            }}
          >
            {pillNow}
          </span>
          {pillNext && (
            <React.Fragment>
              <span aria-hidden="true" style={{ color: 'var(--muted, #94a3b8)', flex: '0 0 auto' }}>·</span>
              <span
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  color: 'var(--muted, #94a3b8)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                }}
              >
                Next · {pillNext}
              </span>
            </React.Fragment>
          )}
        </div>

        {/* Right: clock + faux window chrome */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <span style={{ fontSize: 'calc(0.74rem * var(--font-scale, 1))', fontWeight: 600 }}>
            {clockLabel}
          </span>
          {/* Faux window chrome — pure visual cue, no behaviour on TV. */}
          <div
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.4rem' }}
          >
            <span
              style={{
                width: '12px', height: '12px', borderRadius: '50%',
                background: '#facc15', opacity: 0.6,
              }}
            />
            <span
              style={{
                width: '12px', height: '12px', borderRadius: '50%',
                background: '#22c55e', opacity: 0.6,
              }}
            />
            <span
              style={{
                width: '12px', height: '12px', borderRadius: '50%',
                background: '#ef4444', opacity: 0.6,
              }}
            />
          </div>
        </div>
      </div>

      {/* ─── Left mini-rail ─────────────────────────────────────────────── */}
      <nav
        aria-label="Section navigation"
        style={{
          gridColumn: '1',
          gridRow: '2',
          background: 'rgba(16,22,36,0.92)',
          borderRight: '1px solid rgba(120,150,200,0.16)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '0.5rem',
          gap: '0.2rem',
          overflow: 'hidden',
        }}
      >
        {RAIL_ITEMS.map(function(it) {
          var isActive = activeTab === it.id;
          return (
            <button
              key={it.id}
              tabIndex={0}
              data-focusable="true"
              data-focus-group="ynotv-rail"
              data-card-id={'rail-' + it.id}
              aria-pressed={isActive}
              aria-label={it.label}
              title={it.label}
              onClick={function() { setActiveTab(it.id); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab(it.id);
                }
              }}
              style={{
                width: '44px',
                height: '44px',
                margin: '0.15rem 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isActive ? 'rgba(77,139,255,0.18)' : 'transparent',
                border: '1px solid ' + (isActive ? 'var(--accent, #4d8bff)' : 'transparent'),
                borderRadius: '10px',
                color: isActive ? 'var(--accent, #4d8bff)' : 'var(--text, #e6edf3)',
                cursor: 'pointer',
                fontSize: '18px',
                outline: 'none',
                transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
              }}
              onFocus={function(e) {
                e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #4d8bff)';
              }}
              onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
            >
              <span aria-hidden="true">{it.icon}</span>
            </button>
          );
        })}
      </nav>

      {/* ─── Main content ──────────────────────────────────────────────── */}
      <main
        style={{
          gridColumn: '2',
          gridRow: '2',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Section header (search + tab title) — except for calendar which
            renders its own controls below. */}
        {activeTab !== 'calendar' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.85rem 1.1rem 0.5rem',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 'calc(1.2rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                }}
              >
                {sectionTitle}
              </div>
              <div
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  color: 'var(--muted, #94a3b8)',
                }}
              >
                {displayItems.length} {displayItems.length === 1 ? 'item' : 'items'}
                {search ? ' · Filtered by "' + search + '"' : ''}
              </div>
            </div>
            <input
              type="search"
              value={searchInput}
              onChange={function(e) {
                var v = e.target.value;
                setSearchInput(v);
                debouncedSetSearch(v);
              }}
              placeholder="Search"
              aria-label="Search catalog"
              style={{
                background: 'rgba(28,35,52,0.85)',
                color: 'var(--text, #e6edf3)',
                border: '1px solid rgba(120,150,200,0.22)',
                borderRadius: '8px',
                padding: '0.35rem 0.75rem',
                fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                width: '220px',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.borderColor = 'var(--accent, #4d8bff)'; }}
              onBlur={function(e) { e.currentTarget.style.borderColor = 'rgba(120,150,200,0.22)'; }}
            />
          </div>
        )}

        {/* ── Calendar tab ── */}
        {activeTab === 'calendar' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem 1.1rem 1.25rem' }}>
            {/* Calendar header: month nav */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.85rem',
              }}
            >
              <button
                tabIndex={0}
                data-focusable="true"
                data-focus-group="ynotv-calendar-nav"
                aria-label="Previous month"
                onClick={function() {
                  setCalendarAnchor(function(prev) {
                    return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
                  });
                }}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'rgba(28,35,52,0.85)',
                  border: '1px solid rgba(120,150,200,0.22)',
                  color: 'var(--text, #e6edf3)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontSize: '14px',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #4d8bff)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >‹</button>
              <div
                style={{
                  fontSize: 'calc(1.15rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                }}
              >
                {MONTH_LABELS[calendarAnchor.getMonth()]} {calendarAnchor.getFullYear()}
              </div>
              <button
                tabIndex={0}
                data-focusable="true"
                data-focus-group="ynotv-calendar-nav"
                aria-label="Next month"
                onClick={function() {
                  setCalendarAnchor(function(prev) {
                    return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
                  });
                }}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'rgba(28,35,52,0.85)',
                  border: '1px solid rgba(120,150,200,0.22)',
                  color: 'var(--text, #e6edf3)',
                  cursor: 'pointer',
                  outline: 'none',
                  fontSize: '14px',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #4d8bff)'; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >›</button>
            </div>

            {/* Weekday header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: '0.3rem',
                marginBottom: '0.4rem',
              }}
            >
              {WEEKDAY_LABELS.map(function(w) {
                return (
                  <div
                    key={w}
                    style={{
                      fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                      color: 'var(--muted, #94a3b8)',
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      fontWeight: 700,
                      padding: '0.3rem 0',
                    }}
                  >
                    {w}
                  </div>
                );
              })}
            </div>

            {/* Calendar grid */}
            <div
              role="grid"
              aria-label="Release calendar"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: '0.3rem',
              }}
            >
              {calendarGrid.map(function(cell, idx) {
                var key = _dateKey(cell.date);
                var releases = releaseMap[key];
                var hasReleases = releases && releases.length > 0;
                var isSelected = _sameDate(cell.date, calendarSelected);
                var isToday = _sameDate(cell.date, new Date());
                return (
                  <button
                    key={idx}
                    role="gridcell"
                    tabIndex={isSelected ? 0 : -1}
                    data-focusable={isSelected ? 'true' : undefined}
                    data-focus-group="ynotv-calendar-grid"
                    data-card-id={'cal-' + key}
                    aria-selected={isSelected}
                    aria-label={
                      cell.date.toDateString()
                      + (hasReleases ? ' · ' + releases.length + ' release' + (releases.length === 1 ? '' : 's') : '')
                    }
                    onClick={function() { setCalendarSelected(cell.date); }}
                    onKeyDown={function(e) {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCalendarSelected(cell.date);
                      }
                    }}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      background: isSelected
                        ? 'rgba(77,139,255,0.22)'
                        : (isToday ? 'rgba(77,139,255,0.08)' : 'rgba(28,35,52,0.55)'),
                      border: '1px solid ' + (isSelected
                        ? 'var(--accent, #4d8bff)'
                        : (isToday ? 'rgba(77,139,255,0.5)' : 'rgba(120,150,200,0.14)')),
                      borderRadius: '8px',
                      color: cell.inMonth
                        ? 'var(--text, #e6edf3)'
                        : 'var(--muted, #64748b)',
                      cursor: 'pointer',
                      fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                      fontWeight: isToday ? 800 : 600,
                      outline: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: cell.inMonth ? 1 : 0.45,
                      transition: 'background 120ms ease, border-color 120ms ease',
                    }}
                    onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #4d8bff)'; }}
                    onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <span>{cell.date.getDate()}</span>
                    {hasReleases && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          bottom: '6px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '5px',
                          height: '5px',
                          borderRadius: '50%',
                          background: 'var(--accent, #4d8bff)',
                          boxShadow: '0 0 4px var(--accent, #4d8bff)',
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Releases for selected day */}
            <div style={{ marginTop: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: '0.6rem',
                }}
              >
                <div
                  style={{
                    fontSize: 'calc(0.95rem * var(--font-scale, 1))',
                    fontWeight: 800,
                  }}
                >
                  Releases on {calendarSelected.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                <div
                  style={{
                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                    color: 'var(--muted, #94a3b8)',
                  }}
                >
                  {selectedReleases.length} {selectedReleases.length === 1 ? 'item' : 'items'}
                </div>
              </div>
              {selectedReleases.length === 0 ? (
                <div
                  style={{
                    padding: '1.25rem',
                    textAlign: 'center',
                    color: 'var(--muted, #94a3b8)',
                    border: '1px dashed rgba(120,150,200,0.2)',
                    borderRadius: '10px',
                    fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                  }}
                >
                  No releases on this day.
                </div>
              ) : (
                // Calendar releases grid mirrors the main poster grid track
                // so column widths stay consistent when toggling tabs.
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '0.7rem',
                  }}
                >
                  {selectedReleases.map(function(item, idx) {
                    var bg = posterBg(item, idx);
                    return (
                      <button
                        key={item.id || idx}
                        tabIndex={0}
                        data-focusable="true"
                        data-focus-group="ynotv-calendar-releases"
                        data-card-id={item.id || ('cal-release-' + idx)}
                        aria-label={item.title || 'Untitled'}
                        onClick={function() {
                          if (typeof onItemSelect === 'function') { onItemSelect(item); }
                        }}
                        onFocus={function(e) {
                          showChannelOverlay(item);
                          e.currentTarget.style.transform = 'scale(1.04)';
                          e.currentTarget.style.zIndex = '2';
                        }}
                        onBlur={function(e) {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.zIndex = '1';
                        }}
                        onMouseEnter={function() { showChannelOverlay(item); }}
                        style={{
                          padding: 0,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          outline: 'none',
                        }}
                      >
                        <div
                          style={{
                            // Calendar shows release tiles — per-type aspect
                            // so a live-event card lays out as a 16:9 thumb
                            // and a film release stays a 2:3 poster.
                            aspectRatio: (item.type === 'live') ? '16 / 9' : '2 / 3',
                            background: bg,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                            transition: 'transform 150ms ease',
                          }}
                        />
                        <div
                          style={{
                            marginTop: '0.35rem',
                            fontSize: 'calc(0.68rem * var(--font-scale, 1))',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.title || 'Untitled'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Grid tabs (live/movies/series/watchlist) ── */
          <div
            ref={gridScrollRef}
            style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 1.1rem 1.25rem' }}
          >
            {displayItems.length === 0 ? (
              <div
                style={{
                  padding: '3rem',
                  textAlign: 'center',
                  color: 'var(--muted, #94a3b8)',
                }}
              >
                <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }} aria-hidden="true">∅</div>
                <div>
                  {activeTab === 'watchlist'
                    ? 'Your watchlist is empty — open a movie or series to add it.'
                    : 'No items match the current filters.'}
                </div>
              </div>
            ) : (
              <React.Fragment>
                {virt.topSpacer > 0 && (
                  <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
                )}
                {/* auto-fill minmax(180 px) keeps 2:3 posters dense across
                    the centre column (≈1865 px after the 56 px mini-rail) —
                    ~9 cols × ~2.5 rows of the 270 px-tall tiles visible. */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '0.85rem',
                  }}
                >
                  {displayItems.slice(virt.startIndex, virt.endIndex).map(function(item, sliceIdx) {
                    var idx = virt.startIndex + sliceIdx;
                    var bg = posterBg(item, idx);
                    var year = (item.metadata && item.metadata.year) || item.year || '';
                    return (
                      <button
                        key={item.id || idx}
                        tabIndex={0}
                        data-ynotv-poster="true"
                        data-focusable="true"
                        data-focus-group="ynotv-grid"
                        data-card-id={item.id || ('idx-' + idx)}
                        aria-label={(item.title || 'Untitled') + (year ? ' (' + year + ')' : '')}
                        onClick={function() {
                          if (typeof onItemSelect === 'function') { onItemSelect(item); }
                        }}
                        onKeyDown={function(e) {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (typeof onItemSelect === 'function') { onItemSelect(item); }
                          }
                        }}
                        onFocus={function(e) {
                          showChannelOverlay(item);
                          e.currentTarget.style.transform = 'scale(1.04)';
                          e.currentTarget.style.zIndex = '2';
                        }}
                        onBlur={function(e) {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.zIndex = '1';
                        }}
                        onMouseEnter={function() { showChannelOverlay(item); }}
                        style={{
                          position: 'relative',
                          padding: 0,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          outline: 'none',
                        }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            // Per-type aspect: live=16:9 landscape thumb,
                            // VOD/series=2:3 portrait. Hardcoded 2:3 was
                            // stretching live-channel logos into portrait
                            // boxes (audit-03 stretched-card bug).
                            aspectRatio: (item.type === 'live') ? '16 / 9' : '2 / 3',
                            background: bg,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                            transition: 'transform 150ms ease, box-shadow 150ms ease',
                            border: '1px solid rgba(120,150,200,0.12)',
                          }}
                        >
                          {item.type === 'live' && (
                            <span
                              style={{
                                position: 'absolute',
                                top: '6px',
                                left: '6px',
                                fontSize: 'calc(0.58rem * var(--font-scale, 1))',
                                fontWeight: 800,
                                padding: '0.12rem 0.45rem',
                                borderRadius: '4px',
                                background: 'rgba(239,68,68,0.92)',
                                color: '#fff',
                                letterSpacing: '0.05em',
                              }}
                            >
                              LIVE
                            </span>
                          )}
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
                          {item.title || 'Untitled'}
                          {year ? (
                            <span style={{ color: 'var(--muted, #94a3b8)', fontWeight: 400 }}>
                              {' '}({year})
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {virt.bottomSpacer > 0 && (
                  <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
                )}
              </React.Fragment>
            )}
          </div>
        )}

        {/* ── Channel overlay (slides in from right) ── */}
        <div
          aria-live="polite"
          aria-hidden={!overlayVisible}
          style={{
            position: 'absolute',
            top: '0.85rem',
            right: '1.1rem',
            width: '280px',
            background: 'linear-gradient(180deg, rgba(28,35,52,0.96) 0%, rgba(16,22,36,0.96) 100%)',
            border: '1px solid rgba(120,150,200,0.3)',
            borderRadius: '12px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            padding: '0.85rem',
            pointerEvents: overlayVisible ? 'auto' : 'none',
            opacity: overlayVisible ? 1 : 0,
            transform: overlayVisible ? 'translateX(0)' : 'translateX(16px)',
            transition: reducedMotion
              ? 'opacity ' + CHANNEL_OVERLAY_TRANSITION_MS + 'ms ease'
              : ('opacity ' + CHANNEL_OVERLAY_TRANSITION_MS + 'ms ease, transform ' + CHANNEL_OVERLAY_TRANSITION_MS + 'ms ease'),
            zIndex: 10,
          }}
        >
          {focusedItem && (
            <React.Fragment>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: 'var(--accent, #4d8bff)',
                    boxShadow: '0 0 6px var(--accent, #4d8bff)',
                  }}
                />
                <span
                  style={{
                    fontSize: 'calc(0.62rem * var(--font-scale, 1))',
                    color: 'var(--muted, #94a3b8)',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Now playing
                </span>
              </div>
              <div
                style={{
                  fontSize: 'calc(0.92rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  lineHeight: 1.2,
                  marginBottom: '0.4rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {focusedItem.title || 'Untitled'}
              </div>
              <div
                style={{
                  height: '1px',
                  background: 'rgba(120,150,200,0.18)',
                  margin: '0.5rem 0',
                }}
              />
              {pillNext && (
                <React.Fragment>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.3rem',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: '6px', height: '6px', borderRadius: '50%',
                        background: 'var(--muted, #94a3b8)',
                      }}
                    />
                    <span
                      style={{
                        fontSize: 'calc(0.6rem * var(--font-scale, 1))',
                        color: 'var(--muted, #94a3b8)',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Up next
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                      fontWeight: 600,
                      color: 'var(--text, #e6edf3)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pillNext}
                  </div>
                </React.Fragment>
              )}
            </React.Fragment>
          )}
        </div>
      </main>
    </div>
  );
}

export default YnotvShell;
