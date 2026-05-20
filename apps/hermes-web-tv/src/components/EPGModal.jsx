import React from 'react';
import EPGGrid from './EPGGrid.jsx';
import { fetchEPG } from '../api/epgClient.js';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import ErrorState from './ErrorState.jsx';

// EPGModal — full-screen modal that wraps the shipped EPGGrid component.
// Fetches /api/epg via the epgClient on mount, shows a skeleton while
// loading, surfaces an operator-actionable error banner on failure, and
// closes on Escape / Tizen Back. The grid itself handles keyboard nav.
//
// Reached from the "EPG" button in the App header (always visible) so the
// user can launch the guide without opening the LayoutSwitcher modal.
// Per the wiring spec: data comes from fetchEPG(providerFilter, 4) — i.e.
// whichever provider is currently selected in the FilterBar, with a 4 hour
// look-ahead window matching the EPGGrid default render window.
//
// Tizen 6.5 / Chrome 76 safe — no destructuring in params, no arrow funcs,
// no optional chaining, no nullish coalescing.

// ── Day tabs ──────────────────────────────────────────────────────────────
// Three views, all backed by the same /api/epg endpoint:
//   now      — 4-hour rolling window anchored at "now - 30min" (legacy)
//   today    — from "now - 30min" to midnight, max 24h
//   tomorrow — from tomorrow 00:00 local to tomorrow 23:59 local (24h)
// The client converts the local midnight boundaries to ISO and passes them
// as `start`. Hours = ceil((end - start) / 1h). The backend honours start
// when supplied and caps `hours` at 48.
var DAY_TABS = [
  { id: 'now',      label: 'Now'      },
  { id: 'today',    label: 'Today'    },
  { id: 'tomorrow', label: 'Tomorrow' },
];

function _localMidnight(daysFromToday) {
  var d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Resolve a tab id to { hours, startIso, windowStartMs, hoursForward }.
// hours/startIso feed fetchEPG; windowStartMs/hoursForward feed EPGGrid.
function _tabWindow(tabId) {
  if (tabId === 'today') {
    var nowMs = Date.now();
    var anchorMs = nowMs - 30 * 60 * 1000;
    var endMs = _localMidnight(1).getTime();
    var hoursToEnd = Math.max(1, Math.ceil((endMs - anchorMs) / (60 * 60 * 1000)));
    return {
      hours: Math.min(48, hoursToEnd),
      startIso: new Date(anchorMs).toISOString(),
      windowStartMs: anchorMs,
      hoursForward: Math.min(48, hoursToEnd),
    };
  }
  if (tabId === 'tomorrow') {
    var startMs = _localMidnight(1).getTime();
    return {
      hours: 24,
      startIso: new Date(startMs).toISOString(),
      windowStartMs: startMs,
      hoursForward: 24,
    };
  }
  // 'now' (default) — legacy 4-hour rolling window. Omit startIso so the
  // backend uses its own `now - 30min` anchor.
  return { hours: 4, startIso: '', windowStartMs: undefined, hoursForward: 4 };
}

function EPGModal(props) {
  var isOpen = props.isOpen;
  var providerFilter = props.providerFilter;
  var onClose = props.onClose;
  var onProgramSelect = props.onProgramSelect;
  var onChannelSelect = props.onChannelSelect;

  // Active day tab — defaults to 'now' so opening the modal looks
  // identical to before this PR.
  var tabResult = React.useState('now');
  var activeTab = tabResult[0];
  var setActiveTab = tabResult[1];

  // Local fetch state — { status, channels, programs, errorMessage }.
  // status: 'idle' | 'loading' | 'ready' | 'error'.
  var dataResult = React.useState({ status: 'idle', channels: [], programs: [], errorMessage: '' });
  var data = dataResult[0];
  var setData = dataResult[1];

  // Bumped by the ErrorState retry button to force a re-fetch without
  // changing isOpen / providerFilter / activeTab.
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

  // Re-fetch whenever the modal opens, the provider filter changes, or the
  // user switches day tabs. fetchEPG maps providerFilter='all' → empty
  // string for the backend's "default provider" path. The tab resolves to
  // hours + an optional startIso anchor — see _tabWindow above.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    var cancelled = false;
    setData({ status: 'loading', channels: [], programs: [], errorMessage: '' });
    var provider = providerFilter && providerFilter !== 'all' ? providerFilter : '';
    var win = _tabWindow(activeTab);
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
  }, [isOpen, providerFilter, activeTab, retryNonce]);

  if (!isOpen) { return null; }

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
                {data.channels.length} channels &middot; {data.programs.length} programs
              </span>
            )}

            {/* Day tabs — Now / Today / Tomorrow. Switching re-fetches with
                a different window anchor. Disabled while a fetch is in
                flight so rapid clicks can't pile up requests. */}
            <div
              role="tablist"
              aria-label="EPG day"
              style={{ display: 'inline-flex', gap: '0.35rem', marginLeft: '0.5rem' }}
            >
              {DAY_TABS.map(function(t) {
                var active = t.id === activeTab;
                var loading = data.status === 'loading';
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    tabIndex={0}
                    disabled={loading && !active}
                    onClick={function() { if (!loading || active) { setActiveTab(t.id); } }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                      fontWeight: active ? 800 : 600,
                      color: active ? 'var(--text, #e6edf3)' : 'var(--muted, #8b949e)',
                      background: active ? 'rgba(31,111,235,0.18)' : 'transparent',
                      border: '1px solid ' + (active ? 'var(--accent, #1f6feb)' : 'var(--border, #30363d)'),
                      borderRadius: 'var(--radius-pill, 999px)',
                      cursor: (loading && !active) ? 'wait' : 'pointer',
                      letterSpacing: '0.03em',
                      outline: 'none',
                      transition: 'border-color 140ms ease, color 140ms ease, background-color 140ms ease',
                      opacity: (loading && !active) ? 0.55 : 1,
                    }}
                    onFocus={function(e) {
                      e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
                      e.currentTarget.style.outlineOffset = '2px';
                    }}
                    onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
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

          {data.status === 'ready' && (function() {
            var win = _tabWindow(activeTab);
            return (
              <EPGGrid
                channels={data.channels}
                programs={data.programs}
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
