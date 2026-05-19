import React from 'react';
import { listRecent } from '../store/watchHistoryStore.js';
import { posterBg } from '../shells/shellHelpers.js';
import { formatTimeRemaining, progressPercent } from './ContinueWatchingRail.helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// ContinueWatchingRail — the #1 audit-doc move from
// docs/43_REFERENCE_IPTV_DESIGN_AUDIT.md. Universal across all five reference
// apps (Nuvio / Stremio / iptvnator / Extreme-InfiniTV / ynotv): when a user
// has things in progress, the rail goes ABOVE everything else.
//
// Contract:
//   Props:
//     - profileId       (string)   profile to query (e.g. 'dave_tv' / 'mom_tv')
//     - onItemSelect    (fn)       receives the item record on click/Enter
//     - max             (number)   max cards rendered; default 12
//     - variant         (string)   'rail' (horizontal, default) or 'compact'
//                                  ('compact' = 3-up vertical-stack for tight
//                                  spaces — DavePower sidebar, TiviMate above
//                                  EPG, MomMode warm gradient header).
//     - profile         (object?)  whole profile so we can read font_scale,
//                                  reduced_motion, and warm-gradient flag.
//     - warmGradient    (boolean?) override for the progress-bar gradient.
//                                  MomMode passes true → uses --gradient-warm.
//     - fontScale       (number?)  optional override for the font-scale arith.
//
//   Behaviour:
//     - Mounts → reads listRecent(profileId, max). Renders null while loading
//       so we never flash an empty header.
//     - When zero items → returns null. The rail is PURELY ADDITIVE — when
//       the user has nothing to continue, the shell renders without it. No
//       "nothing here yet" placeholder.
//     - Re-reads when window dispatches 'hermes:watch-history-changed' so
//       playing something refreshes the rail without a remount.
//
//   Card layout (per the audit doc):
//     - 16:9 backdrop via posterBg(item)
//     - Title overlay bottom with vertical gradient veil
//     - 2px progress bar at the absolute bottom using --gradient-accent (or
//       --gradient-warm for MomMode)
//     - "12 min left" runtime-remaining label, top-right corner pill
//     - Hover/focus: transform: scale(1.05) + --shadow-md (transform-only at
//       runtime, shadow on focus-event is stateful — both inside 60fps budget)
//
//   Tizen 6.5 / Chrome 76 safe:
//     - No arrow functions, no destructuring, no template strings.
//     - No optional chaining, no spread.
//     - ES5-style `function` + `var`.
//     - aspectRatio supported on Chrome 76 since enabled-by-default in 88,
//       so we use explicit width/paddingBottom for the 16:9 box to be safe.
// ─────────────────────────────────────────────────────────────────────────────

// Detect reduced-motion from three sources, in priority order:
//   1. profile.reduced_motion (passed in by every shell)
//   2. window.hermesGlobalReducedMotion (global flag some shells use)
//   3. body.classList.contains('motion-reduced') (CSS-level signal)
// Returns boolean.
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
  } catch (_) { /* SSR / sandbox: no motion data, assume false */ }
  return false;
}

// Item card. One per row item — kept inline so the rail bundle is one
// component file, no per-card import overhead. Capitalised because React
// requires component identifiers to start with an uppercase letter in JSX.
function CWCard(props) {
  var item = props.item;
  var idx = props.idx;
  var onClick = props.onClick;
  var variant = props.variant;
  var reducedMotion = props.reducedMotion;
  var fontScale = props.fontScale;
  var warmGradient = props.warmGradient;

  var hoverState = React.useState(false);
  var hover = hoverState[0];
  var setHover = hoverState[1];

  var bg = posterBg(item, idx);
  var pct = progressPercent(item);
  var timeLeft = formatTimeRemaining(item.position_seconds, item.duration_seconds);

  // 'compact' variant: full-width tile (the consumer constrains via its
  // parent), aspect-ratio still 16:9 but the parent flow stacks vertically.
  // 'rail' variant: fixed 240px wide card in a horizontally-scrolling row.
  var cardWidth = variant === 'compact' ? '100%' : '240px';
  var flexShrink = variant === 'compact' ? 1 : 0;

  // The 16:9 box. We use paddingBottom hack (56.25%) for Chrome 76 safety
  // instead of `aspect-ratio: 16/9` — Tizen 6.5 ships Chrome 76 which lacks
  // CSS aspect-ratio support (it landed in Chrome 88).
  var progressGradient = warmGradient
    ? 'var(--gradient-warm, linear-gradient(135deg, #f59e0b, #ef4444))'
    : 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))';

  return (
    <button
      tabIndex={0}
      data-continue-watching-card="true"
      aria-label={'Continue watching: ' + (item.title || 'Untitled') + (timeLeft ? ' — ' + timeLeft : '')}
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
        flexShrink: flexShrink,
        width: cardWidth,
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
      {/* 16:9 backdrop box */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: '56.25%', /* 16:9 — Chrome 76-safe */
          background: bg,
          borderRadius: 'var(--radius-md, 12px)',
          overflow: 'hidden',
        }}
      >
        {/* Vertical gradient veil bottom→top — title legibility regardless of poster */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Runtime-remaining chip — top-right corner */}
        {timeLeft && (
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
            {timeLeft}
          </span>
        )}

        {/* Title — bottom-left, sits over the gradient veil */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '6px', /* leave 6px above the 2px progress bar */
            padding: '0 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
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

        {/* 2px progress bar — absolute bottom edge */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '2px',
            background: 'rgba(0,0,0,0.6)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: pct + '%',
              height: '100%',
              background: progressGradient,
            }}
          />
        </div>
      </div>
    </button>
  );
}

function ContinueWatchingRail(props) {
  var profileId = props.profileId;
  var onItemSelect = props.onItemSelect;
  var max = typeof props.max === 'number' && props.max > 0 ? props.max : 12;
  var variant = props.variant === 'compact' ? 'compact' : 'rail';
  var profile = props.profile || null;
  var warmGradient = !!props.warmGradient;
  var fontScale = typeof props.fontScale === 'number' && props.fontScale > 0
    ? props.fontScale
    : ((profile && profile.font_scale) || 1.0);

  var itemsState = React.useState(null); // null = loading; [] = loaded-but-empty
  var items = itemsState[0];
  var setItems = itemsState[1];

  var reducedMotion = _isReducedMotion(profile);

  // Single fetch function so initial mount + event refresh share one path.
  // Wrapped in a guard token so a late-arriving promise from a previous
  // profileId can't overwrite the current profile's list.
  var fetchTokenRef = React.useRef(0);
  function _refresh() {
    if (!profileId) {
      setItems([]);
      return;
    }
    var myToken = ++fetchTokenRef.current;
    listRecent(profileId, max).then(function(rows) {
      // Only commit if we're still the latest fetch for this rail.
      if (myToken !== fetchTokenRef.current) { return; }
      setItems(Array.isArray(rows) ? rows : []);
    }).catch(function() {
      if (myToken !== fetchTokenRef.current) { return; }
      // Failure → empty. The rail collapses; no broken state shown.
      setItems([]);
    });
  }

  React.useEffect(function() {
    _refresh();
    // Listen for the cross-app event so playing something refreshes the rail
    // without remounting. recordWatch in watchHistoryStore should fire this
    // (or its caller) after a successful put.
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

  // Loading → render nothing (we never flash a header without rows).
  // Empty after load → render nothing (the rail is purely additive).
  if (items === null || items.length === 0) {
    return null;
  }

  // Header label common to both variants. The audit calls for the heading to
  // appear ONLY if the rail has items — which is the same condition that
  // got us past the null guard above.
  var header = (
    <h2
      style={{
        margin: 0,
        padding: variant === 'compact' ? '0 0 8px' : '0 0 10px',
        fontSize: 'calc(0.95rem * ' + fontScale + ')',
        fontWeight: 800,
        letterSpacing: '0.01em',
        color: 'var(--text, #e6edf3)',
      }}
    >
      Continue Watching
    </h2>
  );

  // Compact: vertical 3-up stack. Used by DavePower sidebar + TiviMate
  // above-EPG. Honours max but caps at 3 visible to keep the layout tight.
  if (variant === 'compact') {
    var sliced = items.slice(0, Math.min(3, max));
    return (
      <section
        aria-label="Continue watching"
        style={{
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {header}
        {sliced.map(function(item, idx) {
          return (
            <CWCard
              key={item.id || idx}
              item={item}
              idx={idx}
              onClick={onItemSelect}
              variant="compact"
              reducedMotion={reducedMotion}
              fontScale={fontScale}
              warmGradient={warmGradient}
            />
          );
        })}
      </section>
    );
  }

  // Rail: horizontal scroll. Hide native scrollbar but let pointer/wheel/
  // arrow-keys drive it. 'rail' is the default variant.
  return (
    <section
      aria-label="Continue watching"
      style={{
        padding: '12px 0 20px',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        {header}
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
        {items.map(function(item, idx) {
          return (
            <CWCard
              key={item.id || idx}
              item={item}
              idx={idx}
              onClick={onItemSelect}
              variant="rail"
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

export default ContinueWatchingRail;
