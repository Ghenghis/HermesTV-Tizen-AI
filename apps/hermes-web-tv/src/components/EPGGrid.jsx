import React from 'react';
import { useGridVirtualizer } from '../shells/shellHelpers.js';

// EPGGrid — Electronic Program Guide grid component.
//
// Mirrors the IPTV Player Zero EPG UX: rows = channels (sticky left column),
// columns = 30-minute time slots, cells = program blocks that span multiple
// columns based on their duration. A vertical "now" indicator marks the
// current time and pulses with the accent colour.
//
// Props
// -----
//   channels       Array<{id, name, logo_url}>
//   programs       Array<{channel_id, title, start, end, description}>
//                  start/end are ms-epoch numbers OR ISO strings.
//   nowMs          Current timestamp in ms (defaults to Date.now()).
//   onProgramSelect(program)  Fired on Enter / click of a program cell.
//   onChannelSelect(channel)  Fired on Enter / click of a channel row label.
//
// Keyboard navigation
// -------------------
//   ArrowUp / ArrowDown   Move focus between channel rows.
//   ArrowLeft / ArrowRight Move focus between programs on the same row.
//   Enter / Space         Activate the focused cell.
//
// Tizen 6.5 / Chrome 76 compatibility
// -----------------------------------
//   - No arrow functions, no destructuring in params, no template literals,
//     no optional chaining, no nullish coalescing.
//   - Lazy-renders off-screen rows via useGridVirtualizer from shellHelpers.
//   - Sticky time header (top) + sticky channel column (left) using
//     position: sticky which is OK on Chrome 76.

// Pixel constants — pulled out so the row height matches the virtualiser's
// rowHeight and the spacers compute identically.
var ROW_HEIGHT = 72;             // px per channel row (logo + name + program cells)
var CHANNEL_COL_WIDTH = 220;     // px width of the sticky channel column
var TIME_HEADER_HEIGHT = 40;     // px height of the sticky time header
var SLOT_MINUTES = 30;           // every column = 30 minutes
var SLOT_PIXELS = 180;           // px width of one 30-minute slot

function toMs(value) {
  if (value === null || value === undefined) { return null; }
  if (typeof value === 'number') { return value; }
  var parsed = Date.parse(value);
  if (isNaN(parsed)) { return null; }
  return parsed;
}

function fmtTime(ms) {
  if (ms === null || ms === undefined) { return ''; }
  var d = new Date(ms);
  var h = d.getHours();
  var m = d.getMinutes();
  var hh = h < 10 ? '0' + h : String(h);
  var mm = m < 10 ? '0' + m : String(m);
  return hh + ':' + mm;
}

// Floor an epoch ms value down to the previous 30-minute boundary so the
// time-header columns always start on :00 / :30 like every real EPG.
function floorToSlot(ms) {
  var slotMs = SLOT_MINUTES * 60 * 1000;
  return Math.floor(ms / slotMs) * slotMs;
}

function EPGGrid(props) {
  var channels = props.channels || [];
  var programs = props.programs || [];
  var nowMs = (typeof props.nowMs === 'number') ? props.nowMs : Date.now();
  var onProgramSelect = props.onProgramSelect || null;
  var onChannelSelect = props.onChannelSelect || null;

  // Window controls — when the caller (EPGModal) passes day-tab params we
  // honour them; otherwise we default to the original "4 hours starting at
  // the previous :00/:30 boundary from now" behaviour so existing callers
  // are unchanged.
  var hoursForward = (typeof props.hoursForward === 'number' && props.hoursForward > 0)
    ? props.hoursForward
    : 4;
  var slotsToShow = (hoursForward * 60) / SLOT_MINUTES;
  var gridStartMs = (typeof props.windowStartMs === 'number')
    ? floorToSlot(props.windowStartMs)
    : floorToSlot(nowMs);
  var gridEndMs = gridStartMs + (slotsToShow * SLOT_MINUTES * 60 * 1000);

  // Build the time-header slot list once per render.
  var slots = [];
  for (var s = 0; s < slotsToShow; s++) {
    slots.push(gridStartMs + (s * SLOT_MINUTES * 60 * 1000));
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!channels.length || !programs.length) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '320px',
          color: 'var(--muted)',
          fontSize: 'calc(1rem * var(--font-scale, 1))',
          textAlign: 'center',
          padding: '2rem',
          backgroundColor: 'var(--surface, #161b22)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-md)',
        }}
        role="status"
        aria-live="polite"
      >
        No programs available — playlist or EPG XMLTV not loaded yet.
      </div>
    );
  }

  // ── Group programs by channel id and pre-compute layout positions ──────
  // Keyed on channel.id so a single linear pass over `programs` gives us
  // the per-row list to render without re-filtering on every cell.
  var programsByChannel = {};
  for (var i = 0; i < channels.length; i++) {
    programsByChannel[channels[i].id] = [];
  }
  for (var j = 0; j < programs.length; j++) {
    var p = programs[j];
    if (!p || !p.channel_id) { continue; }
    if (!programsByChannel[p.channel_id]) { continue; }
    var startMs = toMs(p.start);
    var endMs = toMs(p.end);
    if (startMs === null || endMs === null) { continue; }
    // Clip to the visible grid window so a 6-hour program rendered in a
    // 4-hour window doesn't overflow the row container.
    if (endMs <= gridStartMs || startMs >= gridEndMs) { continue; }
    var clippedStart = Math.max(startMs, gridStartMs);
    var clippedEnd = Math.min(endMs, gridEndMs);
    var leftPx = ((clippedStart - gridStartMs) / (SLOT_MINUTES * 60 * 1000)) * SLOT_PIXELS;
    var widthPx = ((clippedEnd - clippedStart) / (SLOT_MINUTES * 60 * 1000)) * SLOT_PIXELS;
    programsByChannel[p.channel_id].push({
      program: p,
      leftPx: leftPx,
      widthPx: widthPx,
      startMs: startMs,
      endMs: endMs,
    });
  }

  // ── Focus model ─────────────────────────────────────────────────────────
  // focus = { rowIdx, colIdx } where colIdx is the program index within
  // the row (NOT the time-slot column). -1 in colIdx means the channel
  // label is focused.
  var focusState = React.useState({ rowIdx: 0, colIdx: -1 });
  var focus = focusState[0];
  var setFocus = focusState[1];

  var scrollRef = React.useRef(null);

  // Auto-scroll the focused row into view + the "now" line into view on mount.
  React.useEffect(function() {
    var el = scrollRef.current;
    if (!el) { return; }
    // Start the user a little before "now" so they see the current program.
    var nowOffsetPx = ((nowMs - gridStartMs) / (SLOT_MINUTES * 60 * 1000)) * SLOT_PIXELS;
    var targetLeft = Math.max(0, nowOffsetPx - 120);
    el.scrollLeft = targetLeft;
    // We intentionally don't scroll vertically on mount — that would
    // override the user's last position when re-rendering on new data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Virtualisation hook ─────────────────────────────────────────────────
  // Off-screen rows (channels above/below the viewport) are not rendered
  // at all when the channel count exceeds the helper's threshold (100).
  // The two spacer divs below preserve the scrollbar geometry.
  var virt = useGridVirtualizer({
    scrollRef: scrollRef,
    itemCount: channels.length,
    columns: 1,
    rowHeight: ROW_HEIGHT,
    overscan: 2,
  });

  // ── Keyboard navigation ────────────────────────────────────────────────
  function handleKeyDown(e) {
    var key = e.key;
    if (key !== 'ArrowUp' && key !== 'ArrowDown'
        && key !== 'ArrowLeft' && key !== 'ArrowRight'
        && key !== 'Enter' && key !== ' ') {
      return;
    }
    e.preventDefault();
    var rowList = programsByChannel[channels[focus.rowIdx] && channels[focus.rowIdx].id] || [];
    if (key === 'ArrowUp') {
      var prevRow = Math.max(0, focus.rowIdx - 1);
      setFocus({ rowIdx: prevRow, colIdx: focus.colIdx });
      return;
    }
    if (key === 'ArrowDown') {
      var nextRow = Math.min(channels.length - 1, focus.rowIdx + 1);
      setFocus({ rowIdx: nextRow, colIdx: focus.colIdx });
      return;
    }
    if (key === 'ArrowLeft') {
      // -1 means "channel label". Walk left until we hit it.
      var leftCol = Math.max(-1, focus.colIdx - 1);
      setFocus({ rowIdx: focus.rowIdx, colIdx: leftCol });
      return;
    }
    if (key === 'ArrowRight') {
      var rightCol = Math.min(rowList.length - 1, focus.colIdx + 1);
      setFocus({ rowIdx: focus.rowIdx, colIdx: rightCol });
      return;
    }
    if (key === 'Enter' || key === ' ') {
      if (focus.colIdx === -1) {
        if (onChannelSelect) { onChannelSelect(channels[focus.rowIdx]); }
      } else {
        var prog = rowList[focus.colIdx];
        if (prog && onProgramSelect) { onProgramSelect(prog.program); }
      }
    }
  }

  // ── Layout positions for the "now" indicator ───────────────────────────
  var nowOffsetPx = ((nowMs - gridStartMs) / (SLOT_MINUTES * 60 * 1000)) * SLOT_PIXELS;

  // Total scroll width = channel column + every visible slot.
  var totalGridWidthPx = CHANNEL_COL_WIDTH + (slotsToShow * SLOT_PIXELS);

  // ── Inject keyframes for the "now" pulse + cell hover lift ─────────────
  // One-time append (matches the Skeleton.jsx pattern). The keyframe must
  // inline its color stops because Chrome 76 has a bug where CSS custom
  // properties don't resolve inside @keyframes.
  React.useEffect(function() {
    if (typeof document === 'undefined') { return; }
    var KEYFRAME_ID = 'hermes-epg-keyframes';
    if (document.getElementById(KEYFRAME_ID)) { return; }
    var styleEl = document.createElement('style');
    styleEl.id = KEYFRAME_ID;
    styleEl.appendChild(document.createTextNode(
      '@keyframes hermes-epg-now-pulse {'
      + '  0%   { opacity: 0.85; }'
      + '  50%  { opacity: 1; }'
      + '  100% { opacity: 0.85; }'
      + '}'
      + '.hermes-epg-cell {'
      + '  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1);'
      + '  will-change: transform;'
      + '}'
      + '.hermes-epg-cell:hover,'
      + '.hermes-epg-cell.epg-focused {'
      + '  transform: translateY(-1px);'
      + '  box-shadow: var(--shadow-md);'
      + '}'
      + '@media (prefers-reduced-motion: reduce) {'
      + '  .hermes-epg-now { animation: none !important; }'
      + '  .hermes-epg-cell { transition: none !important; transform: none !important; }'
      + '}'
    ));
    document.head.appendChild(styleEl);
  }, []);

  // ── Render rows ─────────────────────────────────────────────────────────
  // Range slice from the virtualiser. When virtualisation is off
  // (channel count below threshold) startIndex=0 / endIndex=channels.length
  // so we render everything.
  var rows = [];
  for (var r = virt.startIndex; r < virt.endIndex && r < channels.length; r++) {
    var ch = channels[r];
    var rowPrograms = programsByChannel[ch.id] || [];
    var isChannelFocused = (focus.rowIdx === r && focus.colIdx === -1);

    rows.push(
      <div
        key={ch.id}
        role="row"
        style={{
          display: 'flex',
          height: ROW_HEIGHT + 'px',
          borderBottom: '1px solid var(--border, #30363d)',
          position: 'relative',
        }}
      >
        {/* Sticky channel label */}
        <div
          role="rowheader"
          tabIndex={isChannelFocused ? 0 : -1}
          onClick={function(channel) {
            return function() {
              if (onChannelSelect) { onChannelSelect(channel); }
            };
          }(ch)}
          onFocus={function(rowIdx) {
            return function() { setFocus({ rowIdx: rowIdx, colIdx: -1 }); };
          }(r)}
          style={{
            position: 'sticky',
            left: 0,
            zIndex: 2,
            width: CHANNEL_COL_WIDTH + 'px',
            minWidth: CHANNEL_COL_WIDTH + 'px',
            backgroundColor: 'var(--surface-raised, #1c2128)',
            borderRight: '1px solid var(--border, #30363d)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0 0.75rem',
            cursor: onChannelSelect ? 'pointer' : 'default',
            outline: isChannelFocused ? '2px solid var(--accent)' : 'none',
            outlineOffset: '-2px',
          }}
        >
          {ch.logo_url ? (
            <img
              src={ch.logo_url}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              style={{
                width: '40px',
                height: '40px',
                objectFit: 'contain',
                flexShrink: 0,
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg, #0d1117)',
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: '40px',
                height: '40px',
                flexShrink: 0,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--gradient-accent)',
                opacity: 0.6,
              }}
            />
          )}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 'calc(0.9rem * var(--font-scale, 1))',
              fontWeight: 600,
              color: 'var(--text, #e6edf3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ch.name}
          </div>
        </div>

        {/* Program cells — absolutely positioned over the row's time area */}
        <div style={{ position: 'relative', flex: 1, minWidth: (slotsToShow * SLOT_PIXELS) + 'px' }}>
          {rowPrograms.map(function(entry, pIdx) {
            var isProgFocused = (focus.rowIdx === r && focus.colIdx === pIdx);
            var prog = entry.program;
            var classNames = 'hermes-epg-cell' + (isProgFocused ? ' epg-focused' : '');
            return (
              <div
                key={prog.id || (ch.id + '-' + entry.startMs)}
                role="gridcell"
                tabIndex={isProgFocused ? 0 : -1}
                className={classNames}
                aria-label={prog.title + ', ' + fmtTime(entry.startMs) + ' to ' + fmtTime(entry.endMs)}
                onClick={function(p) {
                  return function() {
                    if (onProgramSelect) { onProgramSelect(p); }
                  };
                }(prog)}
                onFocus={function(rowIdx, colIdx) {
                  return function() { setFocus({ rowIdx: rowIdx, colIdx: colIdx }); };
                }(r, pIdx)}
                style={{
                  position: 'absolute',
                  top: '4px',
                  bottom: '4px',
                  left: entry.leftPx + 'px',
                  width: Math.max(60, entry.widthPx - 4) + 'px',
                  backgroundColor: 'var(--surface, #161b22)',
                  border: isProgFocused
                    ? '2px solid var(--accent)'
                    : '1px solid var(--border, #30363d)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.4rem 0.6rem',
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  overflow: 'hidden',
                  boxShadow: isProgFocused ? 'var(--shadow-md)' : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                    fontWeight: 600,
                    color: 'var(--text, #e6edf3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {prog.title || 'Untitled'}
                </div>
                <div
                  style={{
                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                    color: 'var(--muted, #8b949e)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {fmtTime(entry.startMs) + ' – ' + fmtTime(entry.endMs)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Wrap rows with virtualiser spacers (no-ops when virtualisation off) ─
  var renderedRows = [
    virt.enabled
      ? <div key="top-spacer" style={{ height: virt.topSpacer + 'px' }} aria-hidden="true" />
      : null,
    rows,
    virt.enabled
      ? <div key="bottom-spacer" style={{ height: virt.bottomSpacer + 'px' }} aria-hidden="true" />
      : null,
  ];

  return (
    <div
      role="grid"
      aria-label="Electronic Program Guide"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        backgroundColor: 'var(--bg, #0d1117)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: '320px',
      }}
    >
      {/* Scroll container — horizontal for time, vertical for channels */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <div style={{ position: 'relative', minWidth: totalGridWidthPx + 'px' }}>
          {/* Sticky time header */}
          <div
            role="rowheader"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 3,
              display: 'flex',
              height: TIME_HEADER_HEIGHT + 'px',
              background: 'var(--gradient-accent)',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            {/* Corner cell — sits over the channel column */}
            <div
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 4,
                width: CHANNEL_COL_WIDTH + 'px',
                minWidth: CHANNEL_COL_WIDTH + 'px',
                background: 'var(--gradient-accent)',
                borderRight: '1px solid rgba(255,255,255,0.18)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 0.75rem',
                fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Channels
            </div>
            {slots.map(function(slotMs) {
              return (
                <div
                  key={slotMs}
                  style={{
                    width: SLOT_PIXELS + 'px',
                    minWidth: SLOT_PIXELS + 'px',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '0.6rem',
                    fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                    fontWeight: 600,
                    color: '#ffffff',
                    borderRight: '1px solid rgba(255,255,255,0.18)',
                  }}
                >
                  {fmtTime(slotMs)}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div style={{ position: 'relative' }}>
            {renderedRows}

            {/* "Now" indicator — vertical line at the current time. Sits
                above all rows but below the sticky header (z-index 1 vs 3). */}
            {nowMs >= gridStartMs && nowMs <= gridEndMs && (
              <div
                className="hermes-epg-now"
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: (CHANNEL_COL_WIDTH + nowOffsetPx) + 'px',
                  width: '2px',
                  backgroundColor: 'var(--accent)',
                  boxShadow: '0 0 8px var(--accent)',
                  animation: 'hermes-epg-now-pulse 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite',
                  zIndex: 1,
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EPGGrid;
