// ─────────────────────────────────────────────────────────────────────────────
// WatchlistButton — small ➕ / ✓ toggle on cards + detail panels.
//
// Mounts next to the existing favorites heart. Reads/writes watchlistStore.
// aria-pressed reflects current state; clicking flips it.
//
// Mom-mode aware: 56-px minimum hit target when profile.mom_mode === true.
//
// Tizen 6.5 / Chrome 76 safe: ES5 only.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import watchlistStore from '../store/watchlistStore.js';

function WatchlistButton(props) {
  var profile = props.profile;
  var item = props.item;

  var inListState = React.useState(function() {
    return watchlistStore.has(profile && profile.id, item && item.id);
  });
  var inList = inListState[0];
  var setInList = inListState[1];

  var isMom = profile && (profile.mom_mode === true || (profile.font_scale && profile.font_scale >= 1.4));
  var size = isMom ? 56 : 36;

  function handleClick(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (!profile || !item || !item.id) return;
    var nowIn = watchlistStore.toggle(profile.id, item.id);
    setInList(nowIn);
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKey}
      tabIndex={0}
      aria-pressed={inList ? 'true' : 'false'}
      aria-label={inList ? 'Remove from watchlist' : 'Add to watchlist'}
      title={inList ? 'Remove from watchlist' : 'Add to watchlist'}
      style={{
        width: size + 'px',
        height: size + 'px',
        minWidth: size + 'px',
        minHeight: size + 'px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: inList ? 'var(--accent, #58a6ff)' : 'rgba(0,0,0,0.55)',
        color: inList ? '#fff' : 'var(--text, #e6edf3)',
        border: '1px solid var(--border, #23272f)',
        borderRadius: '50%',
        cursor: 'pointer',
        fontSize: (size >= 56 ? 1.6 : 1.0) + 'rem',
        lineHeight: 1,
        padding: 0,
      }}
    >
      <span aria-hidden="true">{inList ? '✓' : '+'}</span>
    </button>
  );
}

export default WatchlistButton;
