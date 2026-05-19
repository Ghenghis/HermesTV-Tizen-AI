import React from 'react';
import { posterBg } from '../../shells/shellHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// ZeroChannelStrip — horizontal mini channel rail that mirrors Zero's
// FavoriteChannelBar (FRONTEND_COMPONENTS.md §Live TV). Renders the top N
// channels as 16:9 thumbnails with a name underneath. The user navigates
// with left/right arrows, presses OK to start playback.
//
// Inputs:
//   channels      — array of live-type catalog items.
//   limit         — max channels to render (default 12).
//   onItemFocus   — fires when remote/mouse focus lands on a channel; the
//                   parent shell typically pipes this into the hero panel
//                   and ZeroNowNext rows.
//   onItemSelect  — fires on OK / click.
//   focusedItemId — id of the currently focused item (used to apply the
//                   "active" outline for keyboard navigation echo).
//   fontScale     — propagated from profile.
//   tier          — gates the focus lift transform.
//
// Tizen 6.5 / Chrome 76 safe — classic ES5.
// ─────────────────────────────────────────────────────────────────────────────

function ZeroChannelStrip(props) {
  var channels = props.channels || [];
  var limit = typeof props.limit === 'number' ? props.limit : 12;
  var onItemFocus = props.onItemFocus;
  var onItemSelect = props.onItemSelect;
  var focusedItemId = props.focusedItemId;
  var fontScale = props.fontScale || 1.0;
  var tier = props.tier;
  var allowMotion = tier === 'enhanced';

  // Bail early when no live channels are loaded — the parent shell still
  // shows its own empty-state, so we don't reserve vertical space.
  if (!channels || channels.length === 0) {
    return null;
  }

  var visible = channels.slice(0, limit);

  return (
    <div style={{ padding: '4px 16px 8px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 4px 8px',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 'calc(0.78rem * ' + fontScale + ')',
            fontWeight: 700,
            color: '#eef2f7',
            letterSpacing: '0.02em',
          }}
        >
          Featured channels
        </h3>
        <span
          style={{
            fontSize: 'calc(0.62rem * ' + fontScale + ')',
            color: 'rgba(225,231,240,0.55)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {channels.length} live
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '10px',
          // overflowX: auto so the user can scroll past the visible window
          // when the catalog has more than `limit` live channels.
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: '6px',
          // Hide scrollbar on Tizen (no mouse, never useful); rely on
          // remote D-pad to traverse.
          scrollbarWidth: 'none',
        }}
      >
        {visible.map(function(ch, idx) {
          var isActive = focusedItemId && ch.id === focusedItemId;
          return (
            <button
              key={ch.id || idx}
              type="button"
              tabIndex={0}
              data-focusable="true"
              data-zero-channel-tile="true"
              aria-label={'Live channel ' + (ch.title || 'Untitled')}
              onFocus={function() { if (typeof onItemFocus === 'function') { onItemFocus(ch); } }}
              onMouseEnter={function() { if (typeof onItemFocus === 'function') { onItemFocus(ch); } }}
              onClick={function() { if (typeof onItemSelect === 'function') { onItemSelect(ch); } }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (typeof onItemSelect === 'function') { onItemSelect(ch); }
                }
              }}
              style={{
                flexShrink: 0,
                width: '160px',
                padding: 0,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                textAlign: 'left',
                transition: allowMotion ? 'transform 150ms ease' : 'none',
                transform: isActive && allowMotion ? 'translateY(-2px)' : 'translateY(0)',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  aspectRatio: '16 / 9',
                  background: posterBg(ch, idx),
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderRadius: '10px',
                  border: '1px solid ' + (isActive ? '#56d2f1' : 'rgba(255,255,255,0.08)'),
                  boxShadow: isActive ? '0 6px 18px rgba(86,210,241,0.28)' : '0 4px 12px rgba(0,0,0,0.35)',
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: '6px', left: '6px',
                    fontSize: 'calc(0.55rem * ' + fontScale + ')',
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    color: '#fff',
                    background: 'rgba(229,9,20,0.95)',
                    padding: '1px 6px',
                    borderRadius: '4px',
                  }}
                  aria-hidden="true"
                >
                  LIVE
                </span>
              </div>
              <div
                style={{
                  marginTop: '6px',
                  fontSize: 'calc(0.7rem * ' + fontScale + ')',
                  fontWeight: 600,
                  color: '#eef2f7',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {ch.title || 'Untitled'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ZeroChannelStrip;
