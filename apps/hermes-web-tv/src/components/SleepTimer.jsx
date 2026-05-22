// ─────────────────────────────────────────────────────────────────────────────
// SleepTimer — auto-pause / dim after N minutes.
//
// Modal lets the user pick a duration (15m / 30m / 45m / 1h / 2h / Off).
// Persists per-profile in localStorage `hermestv:sleep-timer:<profile_id>`
// as `{ enabled: bool, end_at_ms: number }`.
//
// When the timer expires, dispatches a CustomEvent `hermes:sleep-timer-fire`
// on window with detail `{ profile_id, end_at_ms }`. PlayerModal can listen
// and pause itself; App.jsx can show a "Are you still watching?" toast.
//
// Mount via:
//   <SleepTimer
//     profile={profile}
//     isOpen={state.sleepTimerOpen}
//     onClose={() => dispatch({ type: 'closeSleepTimer' })}
//   />
//
// And once anywhere in App.jsx mount the head-less ticker via:
//   import { useSleepTimer } from '.../SleepTimer';
//   useSleepTimer(profile);
//
// Tizen 6.5 / Chrome 76 safe: ES5 only.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

var STORAGE_PREFIX = 'hermestv:sleep-timer:';
var OPTIONS_MIN = [15, 30, 45, 60, 120];

function _key(profileId) { return STORAGE_PREFIX + (profileId || 'default'); }

function _readState(profileId) {
  try {
    if (typeof localStorage === 'undefined') return null;
    var raw = localStorage.getItem(_key(profileId));
    if (!raw) return null;
    var obj = JSON.parse(raw);
    if (!obj || !obj.enabled || !obj.end_at_ms) return null;
    return obj;
  } catch (_) { return null; }
}

function _writeState(profileId, state) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (state) localStorage.setItem(_key(profileId), JSON.stringify(state));
    else localStorage.removeItem(_key(profileId));
  } catch (_) {}
}

// Head-less hook — drop into App.jsx once so the fire-event dispatches even
// when the modal isn't mounted. Returns `{ active, remainingMs, cancel }`.
export function useSleepTimer(profile) {
  var pid = profile && profile.id;
  var initial = _readState(pid);
  var stateHook = React.useState(initial);
  var state = stateHook[0];
  var setState = stateHook[1];

  React.useEffect(function() {
    setState(_readState(pid));
  }, [pid]);

  React.useEffect(function() {
    if (!state || !state.end_at_ms) return;
    var msToFire = state.end_at_ms - Date.now();
    if (msToFire <= 0) {
      // Already expired (likely a stale state) — fire immediately and clear.
      _writeState(pid, null);
      setState(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hermes:sleep-timer-fire', {
          detail: { profile_id: pid, end_at_ms: state.end_at_ms },
        }));
      }
      return;
    }
    var t = setTimeout(function() {
      _writeState(pid, null);
      setState(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('hermes:sleep-timer-fire', {
          detail: { profile_id: pid, end_at_ms: state.end_at_ms },
        }));
      }
    }, msToFire);
    return function cleanup() { clearTimeout(t); };
  }, [pid, state && state.end_at_ms]);

  function cancel() {
    _writeState(pid, null);
    setState(null);
  }

  return {
    active: !!(state && state.end_at_ms && state.end_at_ms > Date.now()),
    endAtMs: state ? state.end_at_ms : null,
    remainingMs: state ? Math.max(0, state.end_at_ms - Date.now()) : 0,
    cancel: cancel,
  };
}

function SleepTimer(props) {
  var profile = props.profile;
  var isOpen = props.isOpen;
  var onClose = props.onClose;

  var pid = profile && profile.id;
  var stateHook = React.useState(function() { return _readState(pid); });
  var saved = stateHook[0];
  var setSaved = stateHook[1];

  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function onKeyDown(e) {
      if (e && e.key === 'Escape') {
        e.preventDefault();
        if (typeof onClose === 'function') { onClose(); }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return function cleanup() {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function applyMinutes(min) {
    var newState = {
      enabled: true,
      end_at_ms: Date.now() + min * 60 * 1000,
      minutes: min,
    };
    _writeState(pid, newState);
    setSaved(newState);
    if (typeof onClose === 'function') onClose();
  }

  function cancelTimer() {
    _writeState(pid, null);
    setSaved(null);
    if (typeof onClose === 'function') onClose();
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && typeof onClose === 'function') onClose();
  }

  function fmt(min) {
    if (min >= 60) return (min / 60) + 'h';
    return min + 'm';
  }

  var isMom = profile && (profile.mom_mode === true || (profile.font_scale && profile.font_scale >= 1.4));
  var btnPad = isMom ? '1rem 1.5rem' : '0.7rem 1.1rem';
  var btnFont = isMom ? '1.3rem' : '1rem';

  var remainingLabel = '';
  if (saved && saved.end_at_ms && saved.end_at_ms > Date.now()) {
    var remMin = Math.ceil((saved.end_at_ms - Date.now()) / 60000);
    remainingLabel = 'Sleep in ' + remMin + ' min';
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sleep timer"
      onClick={handleBackdrop}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: 'var(--surface, #1a1d23)',
          color: 'var(--text, #e6edf3)',
          border: '1px solid var(--border, #23272f)',
          borderRadius: '12px',
          padding: 'calc(1.5rem * var(--font-scale, 1))',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'calc(1.4rem * var(--font-scale, 1))', fontWeight: 700 }}>
          Sleep Timer
        </h2>
        <p style={{ marginTop: '0.5rem', color: 'var(--muted, #8b95a3)', fontSize: 'calc(0.95rem * var(--font-scale, 1))' }}>
          {remainingLabel || 'Pick how long until playback should pause.'}
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMom ? '1fr 1fr' : 'repeat(3, 1fr)',
            gap: '0.6rem',
            marginTop: '1rem',
          }}
        >
          {OPTIONS_MIN.map(function(m) {
            return (
              <button
                key={'st-' + m}
                type="button"
                onClick={function() { applyMinutes(m); }}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyMinutes(m); } }}
                tabIndex={0}
                aria-label={'Sleep in ' + fmt(m)}
                style={{
                  padding: btnPad,
                  fontSize: btnFont,
                  fontWeight: 700,
                  background: 'var(--bg, #0e1014)',
                  color: 'var(--text, #e6edf3)',
                  border: '1px solid var(--border, #23272f)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                {fmt(m)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={cancelTimer}
            onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cancelTimer(); } }}
            tabIndex={0}
            aria-label="Cancel sleep timer"
            style={{
              padding: btnPad,
              fontSize: btnFont,
              fontWeight: 700,
              background: 'var(--bg, #0e1014)',
              color: 'var(--muted, #8b95a3)',
              border: '1px solid var(--border, #23272f)',
              borderRadius: '10px',
              cursor: 'pointer',
            }}
          >
            Off
          </button>
        </div>
        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={function() { if (typeof onClose === 'function') onClose(); }}
            tabIndex={0}
            aria-label="Close sleep timer"
            style={{
              padding: '0.55rem 1rem',
              fontSize: 'calc(0.95rem * var(--font-scale, 1))',
              fontWeight: 600,
              background: 'transparent',
              color: 'var(--text, #e6edf3)',
              border: '1px solid var(--border, #23272f)',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SleepTimer;
