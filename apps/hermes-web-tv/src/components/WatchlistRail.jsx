// ─────────────────────────────────────────────────────────────────────────────
// WatchlistRail — horizontal rail of items the user saved to "watch later".
//
// Renders nothing when the watchlist is empty (no noise on first launch).
// Same visual rhythm as FavoritesRail / RecentlyWatchedRail so it can be
// dropped into any shell that imports those.
//
// Mount via:
//   <WatchlistRail profile={profile} items={state.catalog} onItemSelect={handleItemSelect} />
//
// Suggested mount points: NetflixShell, PlexShell, StremioShell, MomModeShell
// (above Continue Watching). Mom Mode also gets a dedicated "Watchlist" tab.
//
// Tizen 6.5 / Chrome 76 safe: ES5 only.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import watchlistStore from '../store/watchlistStore.js';

function WatchlistRail(props) {
  var profile = props.profile;
  var items = Array.isArray(props.items) ? props.items : [];
  var onItemSelect = props.onItemSelect;

  // Recompute on every render — cheap, watchlistStore is localStorage-backed
  // and we want the rail to reflect heart toggles immediately.
  var idsState = React.useState(function() {
    return watchlistStore.get(profile && profile.id);
  });
  var ids = idsState[0];
  var setIds = idsState[1];

  // Listen for storage events fired by WatchlistButton in another tab/window
  // — and also a custom event for same-tab updates.
  React.useEffect(function() {
    function refresh() {
      setIds(watchlistStore.get(profile && profile.id));
    }
    function handleStorage(e) {
      if (e && e.key && e.key.indexOf('hermestv:watchlist:') === 0) refresh();
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorage);
      window.addEventListener('hermes:watchlist-updated', refresh);
    }
    // Poll every 2 s as a safety net for same-tab updates without custom event.
    var t = setInterval(refresh, 2000);
    return function cleanup() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorage);
        window.removeEventListener('hermes:watchlist-updated', refresh);
      }
      clearInterval(t);
    };
  }, [profile && profile.id]);

  if (!ids || ids.length === 0) return null;

  var idSet = {};
  for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;
  var saved = items.filter(function(it) { return it && idSet[it.id]; });
  if (saved.length === 0) return null;

  var isMom = profile && (profile.mom_mode === true || (profile.font_scale && profile.font_scale >= 1.4));
  var cardW = isMom ? 240 : 180;

  function handleClick(it) {
    if (typeof onItemSelect === 'function') onItemSelect(it);
  }

  return (
    <section
      aria-label="Your watchlist"
      data-watchlist-rail="true"
      style={{
        padding: 'calc(0.5rem * var(--font-scale, 1)) 0',
        margin: 'calc(0.75rem * var(--font-scale, 1)) 0',
      }}
    >
      <h3
        style={{
          fontSize: 'calc(1.1rem * var(--font-scale, 1))',
          fontWeight: 700,
          margin: '0 0 calc(0.5rem * var(--font-scale, 1)) calc(1rem * var(--font-scale, 1))',
          color: 'var(--text, #e6edf3)',
        }}
      >
        {'➕ Your Watchlist (' + saved.length + ')'}
      </h3>
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          overflowX: 'auto',
          padding: '0 1rem 0.5rem',
          scrollSnapType: 'x mandatory',
        }}
      >
        {saved.map(function(it, idx) {
          var poster = it.poster_url || it.poster || it.logo_url;
          var title = it.title || it.name || 'Untitled';
          var isLive = it.type === 'live';
          var aspect = isLive ? '16 / 9' : '2 / 3';
          return (
            <button
              key={(it.id || 'w') + '-' + idx}
              type="button"
              onClick={function() { handleClick(it); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(it);
                }
              }}
              tabIndex={0}
              aria-label={title}
              style={{
                flex: '0 0 auto',
                width: cardW + 'px',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text, #e6edf3)',
                textAlign: 'left',
                scrollSnapAlign: 'start',
              }}
            >
              <div
                style={{
                  width: '100%',
                  aspectRatio: aspect,
                  background: poster ? 'url(' + poster + ') center/cover' : 'var(--surface, #1a1d23)',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  marginBottom: '0.4rem',
                  border: '1px solid var(--border, #23272f)',
                }}
                aria-hidden="true"
              />
              <div
                style={{
                  fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default WatchlistRail;
