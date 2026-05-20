import React from 'react';
import EPGGrid from './EPGGrid.jsx';
import { fetchEPG } from '../api/epgClient.js';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import ErrorState from './ErrorState.jsx';
import EmptyState from './EmptyState.jsx';

// EPGModal — full-screen modal that wraps the shipped EPGGrid component.
// Fetches /api/epg via the epgClient on mount, shows a skeleton while
// loading, surfaces an operator-actionable error banner on failure, and
// closes on Escape / Tizen Back. The grid itself handles keyboard nav.
//
// Reached from the "EPG" button in the App header (always visible) so the
// user can launch the guide without opening the LayoutSwitcher modal.
// Data comes from fetchEPG(providerFilter, hours, startIso) — provider is
// whichever filter is currently selected in the FilterBar, the day offset
// drives a 24-hour window anchored at the local midnight of the chosen day.
//
// Tizen 6.5 / Chrome 76 safe — no destructuring in params, no arrow funcs,
// no optional chaining, no nullish coalescing, no template strings.

// ── Day picker ────────────────────────────────────────────────────────────
// TiviMate-class prev/next day navigation. The user can move ±7 days from
// today (matches the typical EPG provider data horizon — most XMLTV feeds
// publish ~7 days back and ~7 days forward). Default offset is 0 (today).
var MIN_DAY_OFFSET = -7;
var MAX_DAY_OFFSET = 7;

var WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Compute the local-midnight Date for "today + daysFromToday". Negative
// values look backwards. Returns a fresh Date each call so the caller is
// free to mutate it.
function _localMidnight(daysFromToday) {
  var d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Format the day-picker label based on offset. ±1 special-case to
// "Yesterday" / "Tomorrow", 0 is "Today", ±2..6 show weekday short, beyond
// that fall back to "MMM DD".
function formatDayLabel(offset) {
  if (offset === 0) { return 'Today'; }
  if (offset === 1) { return 'Tomorrow'; }
  if (offset === -1) { return 'Yesterday'; }
  var d = _localMidnight(offset);
  if (offset >= -6 && offset <= 6) {
    return WEEKDAY_SHORT[d.getDay()];
  }
  var day = d.getDate();
  var dayStr = day < 10 ? '0' + day : String(day);
  return MONTH_SHORT[d.getMonth()] + ' ' + dayStr;
}

// Resolve a day offset into { hours, startIso, windowStartMs, hoursForward }.
// The selected day always spans local 00:00 → 24:00 (24 hours) so the
// EPGGrid renders the whole day.
function _dayWindow(offset) {
  var startMs = _localMidnight(offset).getTime();
  return {
    hours: 24,
    startIso: new Date(startMs).toISOString(),
    windowStartMs: startMs,
    hoursForward: 24,
  };
}

// Case-insensitive includes against title + description. Either field may
// be undefined; treat missing as empty string. The query is already
// lower-cased by the debounce setter.
function programMatchesQuery(prog, lowerQuery) {
  if (!lowerQuery) { return true; }
  if (!prog) { return false; }
  var title = (prog.title || '').toString().toLowerCase();
  if (title.indexOf(lowerQuery) !== -1) { return true; }
  var desc = (prog.description || '').toString().toLowerCase();
  if (desc.indexOf(lowerQuery) !== -1) { return true; }
  return false;
}

function EPGModal(props) {
  var isOpen = props.isOpen;
  var providerFilter = props.providerFilter;
  var onClose = props.onClose;
  var onProgramSelect = props.onProgramSelect;
  var onChannelSelect = props.onChannelSelect;

  // Day offset relative to today. 0 == today, ±N == that many days away.
  // Clamped to [MIN_DAY_OFFSET, MAX_DAY_OFFSET].
  var dayResult = React.useState(0);
  var dayOffset = dayResult[0];
  var setDayOffset = dayResult[1];

  // Raw search input value — updated on every keystroke. Debounced into
  // `debouncedQuery` below so filtering doesn't run on every keystroke.
  var rawQueryResult = React.useState('');
  var rawQuery = rawQueryResult[0];
  var setRawQuery = rawQueryResult[1];

  // Debounced, lower-cased query that actually drives the filter. Updated
  // 200ms after the user stops typing.
  var debouncedResult = React.useState('');
  var debouncedQuery = debouncedResult[0];
  var setDebouncedQuery = debouncedResult[1];

  // Local fetch state — { status, channels, programs, errorMessage }.
  // status: 'idle' | 'loading' | 'ready' | 'error'.
  var dataResult = React.useState({ status: 'idle', channels: [], programs: [], errorMessage: '' });
  var data = dataResult[0];
  var setData = dataResult[1];

  // Bumped by the ErrorState retry button to force a re-fetch without
  // changing isOpen / providerFilter / dayOffset.
  var retryResult = React.useState(0);
  var retryNonce = retryResult[0];
  var setRetryNonce = retryResult[1];

  // Esc / Tizen Back closes — keyboard nav inside the grid is owned by
  // EPGGrid itself, so we only handle the modal-level escape here.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Back' || e.keyCode === 10009) {
        e.preventDefault();
        if (onClose) { onClose(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  // Reset day + query state whenever the modal opens. Keeps repeat opens
  // predictable instead of remembering the last session's offset.
  React.useEffect(function() {
    if (isOpen) {
      setDayOffset(0);
      setRawQuery('');
      setDebouncedQuery('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Debounce the search input — wait 200ms after the last keystroke before
  // updating debouncedQuery. Cancels the pending timer on every keystroke.
  React.useEffect(function() {
    var timer = setTimeout(function() {
      setDebouncedQuery((rawQuery || '').toLowerCase());
    }, 200);
    return function() { clearTimeout(timer); };
  }, [rawQuery]);

  // Re-fetch whenever the modal opens, the provider filter changes, or the
  // user moves to a different day. The day offset resolves to a 24-hour
  // window anchored at local midnight.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    var cancelled = false;
    setData({ status: 'loading', channels: [], programs: [], errorMessage: '' });
    var provider = providerFilter && providerFilter !== 'all' ? providerFilter : '';
    var win = _dayWindow(dayOffset);
    fetchEPG(provider, win.hours, win.startIso).then(function(body) {
      if (cancelled) { return; }
      setData({
        status: 'ready',
        channels: body.channels || [],
        programs: body.programs || [],
        errorMessage: '',
      });
    }).catch(function(err) {
      if (cancelled) { return; }
      var msg = (err && err.message) ? err.message : 'EPG fetch failed';
      setData({ status: 'error', channels: [], programs: [], errorMessage: msg });
    });
    return function() { cancelled = true; };
  }, [isOpen, providerFilter, dayOffset, retryNonce]);

  // Memoise the filtered programme list. When the query is empty we return
  // the raw array reference so EPGGrid's prop-equality stays fast.
  var filteredPrograms = React.useMemo(function() {
    if (!debouncedQuery) { return data.programs; }
    var out = [];
    for (var i = 0; i < data.programs.length; i++) {
      if (programMatchesQuery(data.programs[i], debouncedQuery)) {
        out.push(data.programs[i]);
      }
    }
    return out;
  }, [data.programs, debouncedQuery]);

  if (!isOpen) { return null; }

  var canPrev = dayOffset > MIN_DAY_OFFSET;
  var canNext = dayOffset < MAX_DAY_OFFSET;
  var loading = data.status === 'loading';

  function goPrevDay() {
    if (!canPrev || loading) { return; }
    setDayOffset(dayOffset - 1);
  }
  function goNextDay() {
    if (!canNext || loading) { return; }
    setDayOffset(dayOffset + 1);
  }
  function clearQuery() {
    setRawQuery('');
    setDebouncedQuery('');
  }

  // Show the empty-search state when the user has typed something AND the
  // fetch finished AND no programs match. We don't surface this while the
  // initial fetch is still in flight.
  var showSearchEmptyState = data.status === 'ready'
    && debouncedQuery
    && data.programs.length > 0
    && filteredPrograms.length === 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Electronic Program Guide"
      onClick={function(e) { if (e.target === e.currentTarget && onClose) { onClose(); } }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        backgroundColor: 'rgba(5,8,14,0.86)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: '100%',
          maxWidth: '1320px',
          height: '92vh',
          backgroundColor: 'var(--surface, #161b22)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: 'var(--radius-lg, 20px)',
          color: 'var(--text, #e6edf3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
        }}
      >
        {/* Header */}
        <div
          className="hermes-gradient-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border, #30363d)',
            flexShrink: 0,
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 'calc(1.05rem * var(--font-scale, 1))', letterSpacing: '0.01em' }}>
              TV Guide
            </span>
            <span
              style={{
                fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                fontWeight: 700,
                color: 'var(--muted, #8b949e)',
                border: '1px solid var(--border, #30363d)',
                borderRadius: 'var(--radius-pill, 999px)',
                padding: '0.15rem 0.55rem',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              {providerFilter && providerFilter !== 'all' ? providerFilter : 'all providers'}
            </span>
            {data.status === 'ready' && (
              <span
                style={{
                  fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                  color: 'var(--muted, #8b949e)',
                }}
              >
                {data.channels.length} channels &middot; {filteredPrograms.length}
                {debouncedQuery ? ' matches' : ' programs'}
              </span>
            )}
          </div>

          <button
            type="button"
            tabIndex={0}
            autoFocus
            onClick={onClose}
            aria-label="Close TV Guide"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid var(--border, #30363d)',
              color: 'var(--text, #e6edf3)',
              fontSize: '1.2rem',
              cursor: 'pointer',
              padding: 0,
              outline: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 160ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), background-color 160ms ease',
              lineHeight: 1,
            }}
            onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >
            &times;
          </button>
        </div>

        {/* Toolbar — day picker + search. Sits between header and grid so
            both controls are always visible above the EPG content. The
            natural tab order (prev → label → next → search → clear → grid)
            matches the spec's D-pad walk. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.6rem 1rem',
            borderBottom: '1px solid var(--border, #30363d)',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.02)',
            flexWrap: 'wrap',
          }}
        >
          {/* Day picker */}
          <div
            role="group"
            aria-label="Select EPG day"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border, #30363d)',
              borderRadius: 'var(--radius-pill, 999px)',
              padding: '0.2rem 0.35rem',
            }}
          >
            <button
              type="button"
              tabIndex={0}
              disabled={!canPrev || loading}
              onClick={goPrevDay}
              aria-label="Previous day"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: (!canPrev || loading) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border, #30363d)',
                color: (!canPrev || loading) ? 'var(--muted, #8b949e)' : 'var(--text, #e6edf3)',
                cursor: (!canPrev || loading) ? 'not-allowed' : 'pointer',
                padding: 0,
                outline: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                lineHeight: 1,
                transition: 'background-color 140ms ease, border-color 140ms ease',
                opacity: (!canPrev || loading) ? 0.5 : 1,
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              &#9664;
            </button>
            <div
              aria-live="polite"
              style={{
                minWidth: '108px',
                textAlign: 'center',
                fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                fontWeight: 700,
                color: 'var(--text, #e6edf3)',
                letterSpacing: '0.02em',
                padding: '0 0.4rem',
              }}
            >
              {formatDayLabel(dayOffset)}
            </div>
            <button
              type="button"
              tabIndex={0}
              disabled={!canNext || loading}
              onClick={goNextDay}
              aria-label="Next day"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: (!canNext || loading) ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border, #30363d)',
                color: (!canNext || loading) ? 'var(--muted, #8b949e)' : 'var(--text, #e6edf3)',
                cursor: (!canNext || loading) ? 'not-allowed' : 'pointer',
                padding: 0,
                outline: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                lineHeight: 1,
                transition: 'background-color 140ms ease, border-color 140ms ease',
                opacity: (!canNext || loading) ? 0.5 : 1,
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              &#9654;
            </button>
          </div>

          {/* Search input + clear button. Debounced 200ms — see useEffect
              above. We intentionally don't run the filter on every keystroke
              because the user may scroll/jump through long lists. */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              flex: '1 1 280px',
              minWidth: '180px',
              maxWidth: '420px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border, #30363d)',
              borderRadius: 'var(--radius-pill, 999px)',
              padding: '0.15rem 0.6rem',
            }}
          >
            <span aria-hidden="true" style={{ color: 'var(--muted, #8b949e)', fontSize: '0.9rem' }}>
              &#128269;
            </span>
            <input
              type="text"
              tabIndex={0}
              value={rawQuery}
              onChange={function(e) { setRawQuery(e.target.value); }}
              placeholder="Search programmes…"
              aria-label="Search programmes by title or description"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: 'var(--text, #e6edf3)',
                fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                padding: '0.35rem 0.2rem',
                outline: 'none',
              }}
              onFocus={function(e) {
                e.currentTarget.parentNode.style.borderColor = 'var(--accent, #1f6feb)';
                e.currentTarget.parentNode.style.boxShadow = '0 0 0 2px rgba(31,111,235,0.25)';
              }}
              onBlur={function(e) {
                e.currentTarget.parentNode.style.borderColor = 'var(--border, #30363d)';
                e.currentTarget.parentNode.style.boxShadow = 'none';
              }}
            />
            {rawQuery ? (
              <button
                type="button"
                tabIndex={0}
                onClick={clearQuery}
                aria-label="Clear search"
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border, #30363d)',
                  color: 'var(--text, #e6edf3)',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
                onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >
                &times;
              </button>
            ) : null}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0.75rem' }}>
          {(data.status === 'idle' || data.status === 'loading') && (
            <div
              style={{
                flex: 1,
                padding: '0.5rem',
                backgroundColor: 'var(--bg, #0d1117)',
                borderRadius: 'var(--radius-md, 12px)',
                overflow: 'hidden',
              }}
            >
              <LoadingSkeleton variant="detail" />
            </div>
          )}

          {data.status === 'error' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <ErrorState
                title="Could not load TV guide"
                message={data.errorMessage}
                onRetry={function() { setRetryNonce(retryNonce + 1); }}
              />
            </div>
          )}

          {data.status === 'ready' && showSearchEmptyState && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
              <EmptyState
                icon="&#128269;"
                title="No matches"
                message={'No programmes match "' + rawQuery + '" on ' + formatDayLabel(dayOffset) + '.'}
                cta={{ label: 'Clear search', onClick: clearQuery }}
              />
            </div>
          )}

          {data.status === 'ready' && !showSearchEmptyState && (function() {
            var win = _dayWindow(dayOffset);
            return (
              <EPGGrid
                channels={data.channels}
                programs={filteredPrograms}
                onProgramSelect={onProgramSelect}
                onChannelSelect={onChannelSelect}
                windowStartMs={win.windowStartMs}
                hoursForward={win.hoursForward}
              />
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default EPGModal;
