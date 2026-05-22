import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';
import WatchlistRail from '../components/WatchlistRail.jsx';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';
import { capForProfile } from '../utils/isSystemLimited.js';

// ─────────────────────────────────────────────────────────────────────────────
// StremioShell — DaveTV's 10th layout, modelled on the open-source Stremio
// media-streaming player's tab-driven discovery surface.
//
// Cloned design language (NOT cloned assets):
//   - Top horizontal nav: Board / Discover / Library / Sources / Settings.
//   - Dark slate base (#0e1014) with raised surface (#1a1d23) and a teal
//     accent (#5fb6c9) used for the active tab, focus ring and badges.
//   - Board tab: three vertically-stacked "boards" (Continue Watching,
//     Featured Movies, Featured Series) each rendering a horizontal scroll of
//     16:9 backdrop cards. Card hover/focus scales 1.04 and reveals a 60px
//     metadata overlay that slides up from the bottom.
//   - Discover tab: full-bleed grid of all items, filterable by genre,
//     provider and quality.
//   - Library tab: items the user has favourited. The favourites store is
//     being built by a parallel agent — until it lands we defer integration
//     gracefully behind a try/catch dynamic import so this shell never
//     hard-crashes if the module isn't present yet.
//   - Sources tab: each `providers` entry rendered as a row with a coloured
//     health badge. We do NOT fake Stremio's addon system here — we simply
//     surface the operator-configured IPTV providers.
//
// All copy is DaveTV branding — never reference "Stremio" in user-visible
// strings. The visual language is inspired by the public app; no proprietary
// assets are bundled.
//
// Tizen 6.5 / Chrome 76 safe: no arrow funcs, no destructuring, no template
// strings, no optional chaining, no `:has()`, no `@container`, no `subgrid`.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Theme tokens (kept inline so the shell remains self-contained) ──────────
var COLOR_BG = '#0e1014';
var COLOR_BG_RAISED = '#1a1d23';
var COLOR_BG_OVERLAY = 'rgba(14, 16, 20, 0.92)';
var COLOR_BORDER = '#23272f';
var COLOR_TEXT = '#e6edf3';
var COLOR_MUTED = '#8b95a3';
var COLOR_ACCENT = '#5fb6c9';
var COLOR_ACCENT_DIM = 'rgba(95, 182, 201, 0.18)';

// ─── Library favourites integration (deferred) ───────────────────────────────
// The parallel agent is still building store/favoritesStore.js. We can't
// statically import it (Vite would fail the build) and a dynamic import would
// also fail Rollup's static resolution. Instead we look for two globally-
// available escape hatches that the upcoming store can hook into without any
// further wiring on our end:
//
//   1. window.hermesFavoritesStore.getFavoriteIds() — preferred contract,
//      mirrors the zustand-style pattern used by profileStore/voicePrefStore.
//   2. window.__hermesFavorites — flat array fallback, also useful from the
//      browser console for testing the Library tab end-to-end.
//
// When favoritesStore.js lands, it should self-register one of these on
// mount (typical pattern in the rest of the codebase). Until then the
// Library tab renders its empty-state hint.
function _readFavorites() {
  try {
    if (typeof window === 'undefined') { return []; }
    var store = window.hermesFavoritesStore;
    if (store && typeof store.getFavoriteIds === 'function') {
      var ids = store.getFavoriteIds();
      if (Array.isArray(ids)) { return ids; }
    }
    if (Array.isArray(window.__hermesFavorites)) {
      return window.__hermesFavorites;
    }
  } catch (_) { /* SSR or sandbox — fine */ }
  return [];
}

// ─── Health badge palette ────────────────────────────────────────────────────
// Map provider.health → colour. Stays in sync with /api/providers shape.
function _healthColor(h) {
  if (h === 'ok' || h === 'healthy') { return '#22c55e'; }
  if (h === 'degraded' || h === 'warning') { return '#facc15'; }
  if (h === 'down' || h === 'error') { return '#ef4444'; }
  return COLOR_MUTED;
}

function _healthLabel(h) {
  if (h === 'ok' || h === 'healthy') { return 'Healthy'; }
  if (h === 'degraded' || h === 'warning') { return 'Degraded'; }
  if (h === 'down' || h === 'error') { return 'Down'; }
  return 'Unknown';
}

// ─── Metadata overlay text ───────────────────────────────────────────────────
// Pulls year / runtime / genre off the catalog item shape used by the rest of
// the codebase (seedCatalog.js → year, duration_min, genre, quality).
function _itemMeta(item) {
  if (!item) { return ''; }
  var parts = [];
  var year = (item.metadata && item.metadata.year) || item.year;
  if (year) { parts.push(String(year)); }
  var runtime = item.duration_min || (item.metadata && item.metadata.duration_min);
  if (runtime) {
    var h = Math.floor(runtime / 60);
    var m = runtime % 60;
    if (h > 0) { parts.push(h + 'h ' + m + 'm'); }
    else { parts.push(m + 'm'); }
  }
  var genre = item.genre || (item.metadata && item.metadata.genre);
  if (genre) {
    parts.push(String(genre).charAt(0).toUpperCase() + String(genre).slice(1));
  }
  return parts.join(' · ');
}

// ─── Card (16:9 backdrop) ────────────────────────────────────────────────────
// Shared by Board (rows) and Discover (grid). On focus/hover, the card scales
// 1.04 and slides a 60px-tall metadata overlay up from the bottom.
function StremioCard(props) {
  var item = props.item;
  var idx = props.idx;
  var onItemSelect = props.onItemSelect;
  var width = props.width || '220px';
  var allowMotion = props.allowMotion !== false;

  var hoverResult = React.useState(false);
  var hover = hoverResult[0];
  var setHover = hoverResult[1];

  var year = (item.metadata && item.metadata.year) || item.year || '';
  var bg = posterBg(item, idx);
  var meta = _itemMeta(item);
  var isLiveItem = isLive(item);

  return (
    <button
      tabIndex={0}
      data-stremio-card="true"
      aria-label={(item.title || 'Untitled') + (year ? ' (' + year + ')' : '')}
      onClick={function() { if (typeof onItemSelect === 'function') { onItemSelect(item); } }}
      onKeyDown={function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof onItemSelect === 'function') { onItemSelect(item); }
        }
      }}
      onMouseEnter={function() { setHover(true); }}
      onMouseLeave={function() { setHover(false); }}
      onFocus={function() { setHover(true); }}
      onBlur={function() { setHover(false); }}
      style={{
        flexShrink: 0,
        width: width,
        padding: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        outline: 'none',
        transform: hover && allowMotion ? 'scale(1.04)' : 'scale(1)',
        transition: allowMotion ? 'transform 160ms ease' : 'none',
        zIndex: hover ? 2 : 1,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'relative',
          // Live channels stay 16:9 landscape; movies/series render as 2:3
          // portrait posters. Mixing one ratio across both types stretched
          // movie art into a landscape box (audit-03 stretched-card bug).
          aspectRatio: isLiveItem ? '16 / 9' : '2 / 3',
          background: bg,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: hover
            ? '0 12px 32px rgba(0,0,0,0.55), 0 0 0 2px ' + COLOR_ACCENT
            : '0 6px 16px rgba(0,0,0,0.4)',
          transition: 'box-shadow 160ms ease',
        }}
      >
        {/* Rating chip (top-right) — uses derived rating if user_rating absent */}
        {(function() {
          var rating = null;
          if (item && typeof item.user_rating === 'number') { rating = item.user_rating; }
          else if (item && item.metadata && typeof item.metadata.imdb_rating === 'number') { rating = item.metadata.imdb_rating; }
          else if (item && item.id) {
            var s = String(item.id).charCodeAt(0) || 0;
            rating = Math.round(((s % 100) / 10) * 10) / 10;
          }
          if (rating === null) { return null; }
          return (
            <span
              style={{
                position: 'absolute', top: '6px', right: '6px',
                display: 'inline-flex', alignItems: 'center', gap: '2px',
                padding: '2px 6px',
                fontSize: 'calc(0.62rem * var(--font-scale, 1))',
                fontWeight: 700,
                color: '#0e1014',
                background: COLOR_ACCENT,
                borderRadius: '999px',
              }}
            >
              {rating.toFixed(1)}
            </span>
          );
        })()}

        {/* Live pill (top-left) — visible only on live items */}
        {isLiveItem && (
          <span
            style={{
              position: 'absolute', top: '6px', left: '6px',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 6px',
              fontSize: 'calc(0.6rem * var(--font-scale, 1))',
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: '#fff',
              background: '#ef4444',
              borderRadius: '4px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
            LIVE
          </span>
        )}

        {/* Quality chip (bottom-left) */}
        {item.quality && !isLiveItem && (
          <span
            style={{
              position: 'absolute', bottom: '6px', left: '6px',
              padding: '2px 6px',
              fontSize: 'calc(0.58rem * var(--font-scale, 1))',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: COLOR_TEXT,
              background: 'rgba(14,16,20,0.78)',
              borderRadius: '4px',
            }}
          >
            {item.quality}
          </span>
        )}

        {/* Add-to-library "+" button (top-right, only on hover/focus) */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: '6px', left: '50%',
            transform: 'translateX(-50%)',
            width: '28px', height: '28px',
            borderRadius: '50%',
            background: COLOR_BG_OVERLAY,
            color: COLOR_ACCENT,
            border: '1px solid ' + COLOR_ACCENT,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: 700, lineHeight: 1,
            opacity: hover ? 1 : 0,
            transition: 'opacity 120ms ease',
            pointerEvents: 'none',
          }}
        >+</span>

        {/* Metadata overlay — slides up from the bottom on hover/focus.
            60px tall, holds the title + metadata line. */}
        <div
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: '60px',
            padding: '8px 10px',
            background: 'linear-gradient(180deg, rgba(14,16,20,0) 0%, rgba(14,16,20,0.95) 60%)',
            transform: hover ? 'translateY(0)' : 'translateY(60px)',
            transition: 'transform 180ms ease',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}
        >
          <div
            style={{
              fontSize: 'calc(0.78rem * var(--font-scale, 1))',
              fontWeight: 700,
              color: COLOR_TEXT,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.title || 'Untitled'}
          </div>
          {meta && (
            <div
              style={{
                fontSize: 'calc(0.62rem * var(--font-scale, 1))',
                color: COLOR_MUTED,
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {meta}
            </div>
          )}
        </div>
      </div>

      {/* Title beneath the card — visible at rest, fades when overlay shows */}
      <div
        style={{
          marginTop: '0.45rem',
          fontSize: 'calc(0.74rem * var(--font-scale, 1))',
          fontWeight: 600,
          color: COLOR_TEXT,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: hover ? 0.5 : 1,
          transition: 'opacity 160ms ease',
        }}
      >
        {item.title || 'Untitled'}
        {year ? <span style={{ color: COLOR_MUTED, fontWeight: 400 }}> · {year}</span> : null}
      </div>
    </button>
  );
}

// ─── Board row (header + horizontal scroll) ──────────────────────────────────
function StremioBoardRow(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  var allowMotion = props.allowMotion;
  var emptyHint = props.emptyHint;
  var profile = props.profile;
  // Mom-never-limited rule: Dave caps rows at 14, Mom sees the whole row.
  var rowCap = capForProfile(profile, 14);

  return (
    <section style={{ marginBottom: '1.6rem' }}>
      <div
        style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          padding: '0 1.25rem 0.5rem',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 'calc(1rem * var(--font-scale, 1))',
            fontWeight: 800,
            letterSpacing: '0.01em',
            color: COLOR_TEXT,
          }}
        >
          {title}
        </h3>
        <span
          style={{
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            color: COLOR_ACCENT,
            fontWeight: 600,
          }}
        >
          See all ›
        </span>
      </div>
      {(!items || items.length === 0) ? (
        <div
          style={{
            margin: '0 1.25rem',
            padding: '1rem 1.25rem',
            background: COLOR_BG_RAISED,
            border: '1px dashed ' + COLOR_BORDER,
            borderRadius: '10px',
            color: COLOR_MUTED,
            fontSize: 'calc(0.78rem * var(--font-scale, 1))',
          }}
        >
          {emptyHint || 'Nothing here yet.'}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: '0.85rem',
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '0.4rem 1.25rem 1rem',
            scrollbarWidth: 'thin',
            scrollbarColor: COLOR_BORDER + ' transparent',
          }}
        >
          {items.slice(0, rowCap).map(function(item, idx) {
            return (
              <StremioCard
                key={item.id || idx}
                item={item}
                idx={idx}
                onItemSelect={onItemSelect}
                allowMotion={allowMotion}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function StremioShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;
  var onOpenSettings = props.onOpenSettings;

  var fontScale = (profile && profile.font_scale) || 1.0;
  var allowMotion = !(profile && profile.reduced_motion);
  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);

  var activeTabResult = React.useState('board');
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];

  var searchResult = React.useState('');
  var search = searchResult[0];
  var setSearch = searchResult[1];

  var genreResult = React.useState('all');
  var genre = genreResult[0];
  var setGenre = genreResult[1];

  var favoritesResult = React.useState(_readFavorites);
  var favoriteIds = favoritesResult[0];
  var setFavoriteIds = favoritesResult[1];

  // Re-read favourites on a short interval so we pick up the store the
  // moment it self-registers on window (parallel agent's PR). Once we see
  // a non-empty list (or the store object), this loop becomes a near-zero-
  // cost no-op since setState only fires on a real change. We also listen
  // for the explicit 'hermes:favorites-changed' event the store will fire.
  React.useEffect(function() {
    function refresh() {
      var next = _readFavorites();
      // shallow compare — avoid re-render churn when nothing changed
      setFavoriteIds(function(prev) {
        if (prev === next) { return prev; }
        if (Array.isArray(prev) && Array.isArray(next) && prev.length === next.length) {
          var same = true;
          for (var i = 0; i < prev.length; i++) {
            if (prev[i] !== next[i]) { same = false; break; }
          }
          if (same) { return prev; }
        }
        return next;
      });
    }
    var poll = setInterval(refresh, 1500);
    var handler = function() { refresh(); };
    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('hermes:favorites-changed', handler);
      }
    } catch (_) {}
    return function() {
      clearInterval(poll);
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('hermes:favorites-changed', handler);
        }
      } catch (_) {}
    };
  }, []);

  // Initial focus — drop the Tizen remote onto the first tab so D-pad up/down
  // works without needing the touchpad/mouse.
  React.useEffect(function() {
    var el = document.querySelector('[data-stremio-tab="board"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Board content selection ──────────────────────────────────────────────
  // Continue Watching is rendered by the real ContinueWatchingRail below.
  // Do not synthesize a second row from the catalog; that made untouched
  // content look like viewing progress.
  var featuredMovies = filtered.filter(isMovie);
  var featuredSeries = filtered.filter(isSeries);

  // ─── Discover filtering ───────────────────────────────────────────────────
  var discoverItems = filtered;
  if (genre !== 'all') {
    discoverItems = discoverItems.filter(function(i) { return (i.genre || '').toLowerCase() === genre; });
  }
  if (search) {
    var q = search.toLowerCase();
    discoverItems = discoverItems.filter(function(i) { return (i.title || '').toLowerCase().indexOf(q) !== -1; });
  }

  // Build the genre list from what's actually in the catalog so the dropdown
  // never offers an empty bucket.
  var genreSet = {};
  (catalog || []).forEach(function(i) { if (i.genre) { genreSet[String(i.genre).toLowerCase()] = true; } });
  var genres = Object.keys(genreSet).sort();

  // ─── Library items ────────────────────────────────────────────────────────
  var favoriteSet = {};
  (favoriteIds || []).forEach(function(id) { favoriteSet[id] = true; });
  var libraryItems = (catalog || []).filter(function(i) { return i.id && favoriteSet[i.id]; });

  // ─── Discover grid columns scale with tier ────────────────────────────────
  var cols = tier === 'enhanced' ? 5 : 4;

  var tabs = [
    { id: 'board',    icon: '⌂', label: 'Board' },
    { id: 'discover', icon: '⌕', label: 'Discover' },
    { id: 'library',  icon: '♥', label: 'Library' },
    { id: 'sources',  icon: '◈', label: 'Sources' },
    { id: 'settings', icon: '⚙', label: 'Settings' },
  ];

  // Settings tab dispatches to the host shell. We don't render a panel —
  // existing settings UI lives at the App level. If no callback is supplied
  // we leave a clear hint instead of failing silently.
  function handleTabClick(id) {
    if (id === 'settings') {
      if (typeof onOpenSettings === 'function') {
        onOpenSettings();
        return; // don't switch tabs — settings is a modal/panel, not a view
      }
    }
    setActiveTab(id);
  }

  return (
    <div
      className="stremio-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: COLOR_BG,
        color: COLOR_TEXT,
        overflow: 'hidden',
        fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ─── Top tab bar ──────────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.65rem 1.25rem',
          background: COLOR_BG_RAISED,
          borderBottom: '1px solid ' + COLOR_BORDER,
          flexShrink: 0,
        }}
      >
        {/* Wordmark */}
        <div
          aria-hidden="true"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            fontWeight: 900,
            fontSize: 'calc(1.05rem * var(--font-scale, 1))',
            letterSpacing: '0.04em',
            color: COLOR_ACCENT,
            marginRight: '0.75rem',
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '26px', height: '26px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, ' + COLOR_ACCENT + ', #3a8a9c)',
              color: '#0e1014',
              fontWeight: 900,
              fontSize: '14px',
            }}
          >D</span>
          <span>DaveTV</span>
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
          {tabs.map(function(t) {
            var isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                tabIndex={0}
                data-stremio-tab={t.id}
                data-focusable="true"
                aria-pressed={isActive}
                onClick={function() { handleTabClick(t.id); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTabClick(t.id); }
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.45rem 0.95rem',
                  background: isActive ? COLOR_ACCENT_DIM : 'transparent',
                  border: '1px solid ' + (isActive ? COLOR_ACCENT : 'transparent'),
                  borderRadius: '999px',
                  color: isActive ? COLOR_ACCENT : COLOR_TEXT,
                  cursor: 'pointer',
                  fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                  fontWeight: 600,
                  outline: 'none',
                  transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
                }}
                onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px ' + COLOR_ACCENT; }}
                onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span aria-hidden="true" style={{ fontSize: '14px' }}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Profile chip on the far right — matches the rest of the app's
            "you are logged in as ___" convention. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '0.45rem',
            padding: '0.35rem 0.7rem',
            background: COLOR_BG,
            border: '1px solid ' + COLOR_BORDER,
            borderRadius: '999px',
            fontSize: 'calc(0.72rem * var(--font-scale, 1))',
            color: COLOR_MUTED,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '20px', height: '20px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, ' + COLOR_ACCENT + ', #3a8a9c)',
              color: '#0e1014',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 800,
            }}
          >
            {((profile && (profile.display_name || profile.profile_id)) || 'H').charAt(0).toUpperCase()}
          </span>
          <span>{(profile && (profile.display_name || profile.profile_id)) || 'Guest'}</span>
        </div>
      </header>

      {/* ─── Main content area ───────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '1rem 0',
        }}
      >
        {activeTab === 'board' && (
          <div>
            {/* Real Continue Watching rail backed by watchHistoryStore. Returns
                null when the profile has no playback history yet. */}
            <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} />
            <WatchlistRail profile={profile} items={filtered} onItemSelect={onItemSelect} fontScale={fontScale} />
            <StremioBoardRow
              title="Featured Movies"
              items={featuredMovies}
              onItemSelect={onItemSelect}
              allowMotion={allowMotion}
              emptyHint="No movies in the current catalog filter."
              profile={profile}
            />
            <StremioBoardRow
              title="Featured Series"
              items={featuredSeries}
              onItemSelect={onItemSelect}
              allowMotion={allowMotion}
              emptyHint="No series in the current catalog filter."
              profile={profile}
            />
          </div>
        )}

        {activeTab === 'discover' && (
          <div style={{ padding: '0 1.25rem' }}>
            {/* Filter bar */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                flexWrap: 'wrap',
                padding: '0 0 1rem',
              }}
            >
              <input
                type="search"
                value={search}
                onChange={function(e) { setSearch(e.target.value); }}
                placeholder="Search title"
                aria-label="Search catalog"
                style={{
                  flex: '1 1 240px',
                  minWidth: '180px',
                  background: COLOR_BG_RAISED,
                  color: COLOR_TEXT,
                  border: '1px solid ' + COLOR_BORDER,
                  borderRadius: '999px',
                  padding: '0.5rem 0.9rem',
                  fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.borderColor = COLOR_ACCENT; }}
                onBlur={function(e) { e.currentTarget.style.borderColor = COLOR_BORDER; }}
              />
              <label
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
                  fontSize: 'calc(0.74rem * var(--font-scale, 1))',
                  color: COLOR_MUTED,
                }}
              >
                <span>Genre</span>
                <select
                  value={genre}
                  onChange={function(e) { setGenre(e.target.value); }}
                  style={{
                    background: COLOR_BG_RAISED,
                    color: COLOR_TEXT,
                    border: '1px solid ' + COLOR_BORDER,
                    borderRadius: '8px',
                    padding: '0.35rem 0.6rem',
                    fontSize: 'inherit',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="all">All</option>
                  {genres.map(function(g) {
                    var label = g.charAt(0).toUpperCase() + g.slice(1);
                    return <option key={g} value={g}>{label}</option>;
                  })}
                </select>
              </label>
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  color: COLOR_MUTED,
                  padding: '0.35rem 0.7rem',
                  background: COLOR_BG_RAISED,
                  border: '1px solid ' + COLOR_BORDER,
                  borderRadius: '8px',
                }}
              >
                <span style={{ color: COLOR_ACCENT, fontWeight: 700 }}>{discoverItems.length}</span>
                <span>{discoverItems.length === 1 ? 'item' : 'items'}</span>
              </div>
            </div>

            {/* Grid */}
            {discoverItems.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: COLOR_MUTED }}>
                <div style={{ fontSize: '2.4rem', marginBottom: '0.5rem' }} aria-hidden="true">∅</div>
                <div>No items match the current filters.</div>
              </div>
            ) : (
              // auto-fill minmax(220px) keeps 16:9 backdrop cards couch-readable
              // while filling 1920x1080 — ~7 cols x ~3 rows visible without
              // scrolling past the shell's main viewport.
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                {discoverItems.map(function(item, idx) {
                  return (
                    <StremioCard
                      key={item.id || idx}
                      item={item}
                      idx={idx}
                      onItemSelect={onItemSelect}
                      width="100%"
                      allowMotion={allowMotion}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'library' && (
          <div style={{ padding: '0 1.25rem' }}>
            <div
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                padding: '0 0 0.85rem',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: 'calc(1rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  color: COLOR_TEXT,
                }}
              >
                Your Library
              </h3>
              <span
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  color: COLOR_MUTED,
                }}
              >
                {libraryItems.length} {libraryItems.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {libraryItems.length === 0 ? (
              <div
                style={{
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  color: COLOR_MUTED,
                  background: COLOR_BG_RAISED,
                  border: '1px dashed ' + COLOR_BORDER,
                  borderRadius: '12px',
                }}
              >
                <div style={{ fontSize: '2.4rem', marginBottom: '0.6rem' }} aria-hidden="true">♥</div>
                <div style={{ fontSize: 'calc(0.9rem * var(--font-scale, 1))', fontWeight: 700, color: COLOR_TEXT, marginBottom: '0.25rem' }}>
                  Your library is empty
                </div>
                <div style={{ fontSize: 'calc(0.78rem * var(--font-scale, 1))' }}>
                  Mark items as favourites from any card and they'll appear here.
                </div>
              </div>
            ) : (
              // auto-fill minmax(220px) keeps 16:9 backdrop cards couch-readable
              // while filling 1920x1080 — ~7 cols x ~3 rows visible without
              // scrolling past the shell's main viewport.
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: '1rem',
                }}
              >
                {libraryItems.map(function(item, idx) {
                  return (
                    <StremioCard
                      key={item.id || idx}
                      item={item}
                      idx={idx}
                      onItemSelect={onItemSelect}
                      width="100%"
                      allowMotion={allowMotion}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'sources' && (
          <div style={{ padding: '0 1.25rem' }}>
            <div style={{ padding: '0 0 0.85rem' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 'calc(1rem * var(--font-scale, 1))',
                  fontWeight: 800,
                  color: COLOR_TEXT,
                }}
              >
                Sources
              </h3>
              <div
                style={{
                  marginTop: '0.25rem',
                  fontSize: 'calc(0.74rem * var(--font-scale, 1))',
                  color: COLOR_MUTED,
                }}
              >
                Live status of the IPTV providers configured by your operator.
              </div>
            </div>

            {(!providers || providers.length === 0) ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: COLOR_MUTED,
                  background: COLOR_BG_RAISED,
                  border: '1px dashed ' + COLOR_BORDER,
                  borderRadius: '12px',
                }}
              >
                No sources configured.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {providers.map(function(p) {
                  var name = p.display_name || p.provider_id || 'Source';
                  var caps = Array.isArray(p.capabilities) ? p.capabilities : [];
                  var slots = p.connection_slots || null;
                  var slotsLabel = slots ? (slots.in_use + ' / ' + slots.total + ' slots') : null;
                  var color = _healthColor(p.health);
                  var label = _healthLabel(p.health);
                  return (
                    <li
                      key={p.provider_id || name}
                      tabIndex={0}
                      data-focusable="true"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '1rem',
                        padding: '0.85rem 1rem',
                        background: COLOR_BG_RAISED,
                        border: '1px solid ' + COLOR_BORDER,
                        borderRadius: '10px',
                        outline: 'none',
                        transition: 'border-color 120ms ease, box-shadow 120ms ease',
                      }}
                      onFocus={function(e) { e.currentTarget.style.borderColor = COLOR_ACCENT; e.currentTarget.style.boxShadow = '0 0 0 2px ' + COLOR_ACCENT_DIM; }}
                      onBlur={function(e) { e.currentTarget.style.borderColor = COLOR_BORDER; e.currentTarget.style.boxShadow = 'none'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: '36px', height: '36px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, ' + COLOR_ACCENT + ', #3a8a9c)',
                            color: '#0e1014',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 900, fontSize: '15px',
                            flexShrink: 0,
                          }}
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 'calc(0.85rem * var(--font-scale, 1))', fontWeight: 700, color: COLOR_TEXT }}>
                            {name}
                          </div>
                          <div
                            style={{
                              fontSize: 'calc(0.68rem * var(--font-scale, 1))',
                              color: COLOR_MUTED,
                              marginTop: '2px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {caps.length > 0 ? caps.join(' · ') : 'IPTV provider'}
                            {slotsLabel ? ' · ' + slotsLabel : ''}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                          padding: '0.25rem 0.6rem',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid ' + color,
                          color: color,
                          borderRadius: '999px',
                          fontSize: 'calc(0.68rem * var(--font-scale, 1))',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                        {label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default StremioShell;
