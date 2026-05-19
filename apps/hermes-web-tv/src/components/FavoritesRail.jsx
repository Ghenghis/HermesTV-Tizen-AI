import React from 'react';
import useFavorites from '../hooks/useFavorites.js';
import { posterBg } from '../shells/shellHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// FavoritesRail — horizontal "Your Favorites" rail rendered above the catalog
// in every shell that has space for it (Netflix, Plex, Stremio, MomMode).
// Returns null when the profile has no favorites yet so the rail is purely
// additive — exactly like ContinueWatchingRail.
//
// Contract:
//   Props:
//     - profileId      (string)  the profile whose favorites to render
//     - onItemSelect   (fn)      called with the item record on click/Enter
//     - profile        (object?) whole profile (used for reduced_motion + font_scale)
//     - fontScale      (number?) font scale override
//     - warmGradient   (boolean?) MomMode passes true → pink accent on header
//     - max            (number?) max cards rendered; default 12
//     - catalog        (array?)  if provided, we look up the full catalog item
//                                so onItemSelect receives the same shape that
//                                the rest of the shell deals with. Falls back
//                                to the favourites record itself if no match.
//
// Card layout mirrors ContinueWatchingRail (same 240px width, 16:9 backdrop,
// gradient veil, hover-lift) so the two rails stack visually as one family
// rather than reading like two unrelated components.
//
// Tizen 6.5 / Chrome 76 safe: ES5-style function/var, no arrow funcs,
// no destructuring, no template strings, no optional chaining.
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

// Per-card subcomponent (kept inline so the rail is one file).
function FavCard(props) {
  var item = props.item;
  var idx = props.idx;
  var onClick = props.onClick;
  var reducedMotion = props.reducedMotion;
  var fontScale = props.fontScale;
  var warmGradient = props.warmGradient;

  var hoverState = React.useState(false);
  var hover = hoverState[0];
  var setHover = hoverState[1];

  // posterBg honours item.poster_url so the favorites record (which carries
  // poster_url) lights up artwork without needing the full catalog item.
  var bg = posterBg(item, idx);
  var heartColor = warmGradient ? '#ff7eb3' : '#ef4444';

  return (
    <button
      tabIndex={0}
      data-favorites-card="true"
      aria-label={'Open favorite: ' + (item.title || 'Untitled')}
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
        width: '240px',
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
      {/* 16:9 backdrop box — paddingBottom hack for Chrome 76 safety */}
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
        {/* Filled heart chip — top-right, always visible (this IS a favorite) */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)',
            border: '1px solid ' + heartColor,
            color: heartColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            lineHeight: 1,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
          </svg>
        </span>

        {/* Vertical gradient veil bottom→top for title legibility */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Title — bottom-left */}
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
              fontSize: 'calc(0.82rem * ' + fontScale + ')',
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

function FavoritesRail(props) {
  var profileId = props.profileId;
  var onItemSelect = props.onItemSelect;
  var profile = props.profile || null;
  var warmGradient = !!props.warmGradient;
  var catalog = Array.isArray(props.catalog) ? props.catalog : null;
  var max = typeof props.max === 'number' && props.max > 0 ? props.max : 12;
  var fontScale = typeof props.fontScale === 'number' && props.fontScale > 0
    ? props.fontScale
    : ((profile && profile.font_scale) || 1.0);

  var fav = useFavorites(profileId);
  var reducedMotion = _isReducedMotion(profile);

  // Build a lookup from the catalog so onItemSelect receives the same shape
  // the rest of the shell uses (player picks up provider/streams via this).
  // Falls back to the favorites record itself when there's no catalog match.
  function _resolve(record) {
    if (!catalog) { return record; }
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i] && String(catalog[i].id) === String(record.item_id)) {
        return catalog[i];
      }
    }
    // Shape the bare favorites record to look like a catalog item.
    return {
      id: record.item_id,
      title: record.title,
      poster_url: record.poster_url,
      type: record.item_type,
    };
  }

  if (!fav.favorites || fav.favorites.length === 0) {
    return null;
  }

  var items = fav.favorites.slice(0, max);
  var headerColor = warmGradient ? '#ff7eb3' : 'var(--text, #e6edf3)';

  return (
    <section
      aria-label="Your favorites"
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
          <span aria-hidden="true" style={{ color: warmGradient ? '#ff7eb3' : '#ef4444' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
            </svg>
          </span>
          Your Favorites
          <span
            style={{
              marginLeft: '6px',
              fontSize: 'calc(0.7rem * ' + fontScale + ')',
              fontWeight: 600,
              color: 'var(--muted, #8b95a3)',
            }}
          >
            ({fav.favorites.length})
          </span>
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
            <FavCard
              key={record.id || record.item_id || idx}
              item={resolved}
              idx={idx}
              onClick={onItemSelect}
              reducedMotion={reducedMotion}
              fontScale={fontScale}
              warmGradient={warmGradient}
            />
          );
        })}
      </div>
    </section>
  );
}

export default FavoritesRail;
