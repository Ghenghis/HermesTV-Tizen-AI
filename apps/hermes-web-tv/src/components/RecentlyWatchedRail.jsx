import React from 'react';
import { listRecent } from '../store/watchHistoryStore.js';
import { posterBg } from '../shells/shellHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// RecentlyWatchedRail — horizontal "Recently Watched" rail showing the last
// N items the user OPENED (regardless of progress). Different from
// ContinueWatchingRail's semantic:
//
//   ContinueWatchingRail = "items still in progress" (audit doc — primary surface)
//   RecentlyWatchedRail  = "items you opened recently" (history-style breadcrumb)
//
// In practice both rails read from watchHistoryStore.listRecent, but this rail
// renders the unfiltered top-N timeline. Useful for "I just watched that 5
// minutes ago and want to flip back to it" — even if the user finished or
// barely started it.
//
// Contract:
//   Props:
//     - profileId      (string)  profile to query
//     - onItemSelect   (fn)      called with the item record on click/Enter
//     - profile        (object?) reduced_motion + font_scale source
//     - fontScale      (number?) override
//     - warmGradient   (boolean?) MomMode → soft pink
//     - max            (number?) default 10
//     - catalog        (array?)  optional, see FavoritesRail._resolve
//
// Returns null when no rows — purely additive, like the other rails.
//
// Tizen 6.5 / Chrome 76 safe: ES5-style function/var.
// ─────────────────────────────────────────────────────────────────────────────

function _isReducedMotion(profile) {
  if (profile && profile.reduced_motion) { return true; }
  try {
    if (typeof window !== 'undefined' && window.hermesGlobalReducedMotion) {
      return true;
    }
    if (typeof document !== 'undefined' && document.body
        && document.body.classList
        && document.body.classList.contains('motion-reduced')) {
      return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}

// Inline card subcomponent. Slightly compact vs FavoritesRail (200px wide,
// no heart chip) so the two rails read visually distinct even when stacked.
function RWCard(props) {
  var item = props.item;
  var idx = props.idx;
  var onClick = props.onClick;
  var reducedMotion = props.reducedMotion;
  var fontScale = props.fontScale;
  var watchedAt = props.watchedAt;

  var hoverState = React.useState(false);
  var hover = hoverState[0];
  var setHover = hoverState[1];

  var bg = posterBg(item, idx);

  // Format watched-at relative label.
  var relLabel = (function() {
    if (!watchedAt) { return ''; }
    try {
      var then = new Date(watchedAt).getTime();
      if (isNaN(then)) { return ''; }
      var diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
      if (diffSec < 60) { return 'Just now'; }
      if (diffSec < 3600) { return Math.floor(diffSec / 60) + ' min ago'; }
      if (diffSec < 86400) { return Math.floor(diffSec / 3600) + 'h ago'; }
      var days = Math.floor(diffSec / 86400);
      if (days < 7) { return days + 'd ago'; }
      return Math.floor(days / 7) + 'w ago';
    } catch (_) { return ''; }
  })();

  return (
    <button
      tabIndex={0}
      data-recently-watched-card="true"
      aria-label={'Recently watched: ' + (item.title || 'Untitled') + (relLabel ? ' — ' + relLabel : '')}
      onClick={function() { if (typeof onClick === 'function') { onClick(item); } }}
      onKeyDown={function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (typeof onClick === 'function') { onClick(item); }
        }
      }}
      onMouseEnter={function() { setHover(true); }}
      onMouseLeave={function() { setHover(false); }}
      onFocus={function() { setHover(true); }}
      onBlur={function() { setHover(false); }}
      style={{
        flexShrink: 0,
        width: '200px',
        padding: 0,
        margin: 0,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        outline: 'none',
        transform: (hover && !reducedMotion) ? 'scale(1.05)' : 'scale(1)',
        transition: reducedMotion ? 'none' : 'transform 180ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)), box-shadow 180ms ease',
        boxShadow: hover ? 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))' : 'none',
        borderRadius: 'var(--radius-md, 12px)',
        position: 'relative',
        zIndex: hover ? 2 : 1,
        willChange: reducedMotion ? 'auto' : 'transform',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%',
          background: bg,
          borderRadius: 'var(--radius-md, 12px)',
          overflow: 'hidden',
        }}
      >
        {/* Relative time chip — top-right corner */}
        {relLabel && (
          <span
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              padding: '3px 8px',
              fontSize: 'calc(0.62rem * ' + fontScale + ')',
              fontWeight: 700,
              color: '#fff',
              background: 'rgba(0,0,0,0.7)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 'var(--radius-pill, 9999px)',
              letterSpacing: '0.02em',
            }}
          >
            {relLabel}
          </span>
        )}

        {/* Veil */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Title */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '8px',
            padding: '0 10px',
          }}
        >
          <div
            style={{
              fontSize: 'calc(0.78rem * ' + fontScale + ')',
              fontWeight: 700,
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
              lineHeight: 1.2,
            }}
          >
            {item.title || 'Untitled'}
          </div>
        </div>
      </div>
    </button>
  );
}

function RecentlyWatchedRail(props) {
  var profileId = props.profileId;
  var onItemSelect = props.onItemSelect;
  var profile = props.profile || null;
  var warmGradient = !!props.warmGradient;
  var catalog = Array.isArray(props.catalog) ? props.catalog : null;
  var max = typeof props.max === 'number' && props.max > 0 ? props.max : 10;
  var fontScale = typeof props.fontScale === 'number' && props.fontScale > 0
    ? props.fontScale
    : ((profile && profile.font_scale) || 1.0);

  var itemsState = React.useState(null); // null = loading
  var items = itemsState[0];
  var setItems = itemsState[1];

  var reducedMotion = _isReducedMotion(profile);

  var fetchTokenRef = React.useRef(0);
  function _refresh() {
    if (!profileId) {
      setItems([]);
      return;
    }
    var myToken = ++fetchTokenRef.current;
    listRecent(profileId, max).then(function(rows) {
      if (myToken !== fetchTokenRef.current) { return; }
      setItems(Array.isArray(rows) ? rows : []);
    }).catch(function() {
      if (myToken !== fetchTokenRef.current) { return; }
      setItems([]);
    });
  }

  React.useEffect(function() {
    _refresh();
    function handler() { _refresh(); }
    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('hermes:watch-history-changed', handler);
      }
    } catch (_) {}
    return function() {
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('hermes:watch-history-changed', handler);
        }
      } catch (_) {}
    };
  }, [profileId, max]); // eslint-disable-line react-hooks/exhaustive-deps

  if (items === null || items.length === 0) {
    return null;
  }

  function _resolve(record) {
    if (!catalog) { return record; }
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i] && String(catalog[i].id) === String(record.item_id)) {
        return catalog[i];
      }
    }
    return {
      id: record.item_id,
      title: record.title,
      type: record.item_type,
    };
  }

  var headerColor = warmGradient ? '#ff7eb3' : 'var(--text, #e6edf3)';

  return (
    <section
      aria-label="Recently watched"
      style={{
        padding: '12px 0 20px',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <h2
          style={{
            margin: 0,
            padding: '0 0 10px',
            fontSize: 'calc(0.95rem * ' + fontScale + ')',
            fontWeight: 800,
            letterSpacing: '0.01em',
            color: headerColor,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span aria-hidden="true">🕓</span>
          Recently Watched
        </h2>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '12px',
          padding: '6px 24px 12px',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {items.map(function(record, idx) {
          var resolved = _resolve(record);
          return (
            <RWCard
              key={record.id || record.item_id || idx}
              item={resolved}
              idx={idx}
              onClick={onItemSelect}
              reducedMotion={reducedMotion}
              fontScale={fontScale}
              watchedAt={record.watched_at}
            />
          );
        })}
      </div>
    </section>
  );
}

export default RecentlyWatchedRail;
