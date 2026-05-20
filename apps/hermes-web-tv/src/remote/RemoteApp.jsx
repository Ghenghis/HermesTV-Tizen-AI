// RemoteApp.jsx — Samsung-phone-as-remote virtual D-pad.
//
// Mounts at /remote.html via Vite multi-entry build (see vite.config.js).
// Communicates with the TV over /api/remote/event (LAN HTTP POST). The TV
// listens on /api/remote/events?pair_code=HRM-XXXX (SSE) and dispatches
// the keys into its focus engine.
//
// CONSTRAINTS
//   - ES5-target React (Chrome 76 / Samsung Internet compat). No optional
//     chaining in production code paths, no nullish coalescing, no top-level
//     await. Vite/esbuild will downcompile to ES5 per build.target: 'chrome76'.
//   - No new deps. Everything is React + plain CSS-in-JS.
//   - Touch-first. Buttons >= 56x56 px. trackpad uses touch-action: none.
//   - Dark only. Bg #0d1117, fg #ffffff.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sendEvent, verifyPairCode } from './remoteClient.js';

// ---------------------------------------------------------------------------
// Constants

var PAIR_CODE_PATTERN = /^HRM-[A-Z0-9]{4}$/;
var STORAGE_KEY = 'hermestv:remote:paired';

// Trackpad gesture thresholds. Picked to feel like a Magic-Trackpad-style
// fling on a 6" phone — small enough that a deliberate finger nudge fires
// one arrow, large enough that a thumb-rest doesn't fire 12 arrows per
// second of natural micro-jitter.
var SWIPE_THRESHOLD_PX = 36;
var REPEAT_INTERVAL_MS = 140;  // hold-to-repeat cadence for D-pad long-press
var REPEAT_INITIAL_DELAY_MS = 320;

// ---------------------------------------------------------------------------
// Helpers

function readPairCodeFromUrl() {
  if (typeof window === 'undefined') { return ''; }
  try {
    var qs = new URLSearchParams(window.location.search);
    var code = (qs.get('pair') || '').toUpperCase();
    return PAIR_CODE_PATTERN.test(code) ? code : '';
  } catch (_) { return ''; }
}

function readPairCodeFromStorage() {
  if (typeof window === 'undefined' || !window.localStorage) { return ''; }
  try {
    var stored = window.localStorage.getItem(STORAGE_KEY) || '';
    return PAIR_CODE_PATTERN.test(stored) ? stored : '';
  } catch (_) { return ''; }
}

function persistPairCode(code) {
  if (typeof window === 'undefined' || !window.localStorage) { return; }
  try { window.localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
}

function clearPairCode() {
  if (typeof window === 'undefined' || !window.localStorage) { return; }
  try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
}

function vibrate(ms) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(ms || 10); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Styles. Inline so the bundle stays under one chunk and no stylesheet
// fetches block first paint on the phone.

var STYLES = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100vh',
    minHeight: '100vh',
    background: '#0d1117',
    color: '#ffffff',
    boxSizing: 'border-box',
    padding: '14px 16px calc(14px + env(safe-area-inset-bottom)) 16px',
    overflow: 'hidden',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brand: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0.2,
  },
  status: {
    fontSize: 12,
    color: '#8b949e',
    padding: '4px 8px',
    border: '1px solid #30363d',
    borderRadius: 999,
    background: '#161b22',
  },
  statusOk: {
    color: '#3fb950',
    borderColor: '#238636',
  },
  pairCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    flex: 1,
    gap: 14,
    padding: '20px 8px',
  },
  pairLabel: {
    fontSize: 15,
    color: '#c9d1d9',
    textAlign: 'center',
  },
  pairInput: {
    fontSize: 22,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    letterSpacing: 4,
    textAlign: 'center',
    padding: '14px 12px',
    background: '#161b22',
    color: '#ffffff',
    border: '1px solid #30363d',
    borderRadius: 10,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    textTransform: 'uppercase',
  },
  pairBtn: {
    minHeight: 56,
    fontSize: 17,
    fontWeight: 600,
    background: '#238636',
    color: '#ffffff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
  },
  pairBtnDisabled: {
    background: '#30363d',
    color: '#8b949e',
    cursor: 'not-allowed',
  },
  pairError: {
    color: '#f85149',
    fontSize: 13,
    textAlign: 'center',
    minHeight: 16,
  },
  trackpad: {
    flex: 1,
    background: 'linear-gradient(180deg, #161b22 0%, #11161d 100%)',
    border: '1px solid #30363d',
    borderRadius: 16,
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    touchAction: 'none',  // <- critical: prevents page scroll during swipe
    overflow: 'hidden',
  },
  trackpadHint: {
    color: '#6e7681',
    fontSize: 13,
    textAlign: 'center',
    pointerEvents: 'none',
    padding: '0 24px',
    lineHeight: 1.5,
  },
  trackpadFlash: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(56, 139, 253, 0.18)',
    opacity: 0,
    transition: 'opacity 160ms ease-out',
    pointerEvents: 'none',
  },
  trackpadFlashOn: { opacity: 1 },
  controlsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gridTemplateRows: 'auto auto auto',
    gap: 8,
  },
  btn: {
    minHeight: 56,
    minWidth: 56,
    background: '#21262d',
    color: '#ffffff',
    border: '1px solid #30363d',
    borderRadius: 12,
    fontSize: 18,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
  },
  btnPressed: {
    background: '#388bfd',
    borderColor: '#388bfd',
  },
  okBtn: {
    background: '#1f6feb',
    borderColor: '#1f6feb',
    fontSize: 20,
    minHeight: 64,
  },
  backBtn: {
    background: '#21262d',
  },
  micBtn: {
    background: '#21262d',
  },
  footer: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 11,
    color: '#6e7681',
  },
  unpairLink: {
    background: 'transparent',
    border: 'none',
    color: '#58a6ff',
    fontSize: 12,
    cursor: 'pointer',
    padding: '6px 8px',
  },
};

// ---------------------------------------------------------------------------
// Sub-components

function PairScreen(props) {
  var onPair = props.onPair;
  var [value, setValue] = useState('');
  var [busy, setBusy] = useState(false);
  var [error, setError] = useState('');

  var normalized = value.toUpperCase().replace(/\s+/g, '');
  // Auto-prefix HRM- if user typed only 4 chars.
  var withPrefix = normalized;
  if (/^[A-Z0-9]{4}$/.test(normalized)) { withPrefix = 'HRM-' + normalized; }
  var isValidShape = PAIR_CODE_PATTERN.test(withPrefix);

  var handleSubmit = useCallback(function() {
    if (!isValidShape || busy) { return; }
    setBusy(true);
    setError('');
    verifyPairCode(withPrefix).then(function(result) {
      setBusy(false);
      if (result.valid) {
        vibrate(15);
        persistPairCode(withPrefix);
        onPair(withPrefix);
      } else if (result.error === 'not_found') {
        setError('No TV is waiting for this code. Check the screen.');
      } else {
        setError('Could not verify code. Try again.');
      }
    }).catch(function() {
      setBusy(false);
      setError('Network error. Make sure your phone is on the same WiFi.');
    });
  }, [withPrefix, isValidShape, busy, onPair]);

  return (
    <div style={STYLES.pairCard}>
      <div style={STYLES.pairLabel}>Enter the pair code shown on your TV</div>
      <input
        style={STYLES.pairInput}
        value={value}
        onChange={function(e) { setValue(e.target.value); setError(''); }}
        placeholder="HRM-XXXX"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        maxLength={8}
        onKeyDown={function(e) { if (e.key === 'Enter') { handleSubmit(); } }}
      />
      <div style={STYLES.pairError}>{error}</div>
      <button
        type="button"
        style={Object.assign({}, STYLES.pairBtn, (!isValidShape || busy) ? STYLES.pairBtnDisabled : null)}
        onClick={handleSubmit}
        disabled={!isValidShape || busy}
      >
        {busy ? 'Pairing...' : 'Pair'}
      </button>
    </div>
  );
}

function Trackpad(props) {
  var onArrow = props.onArrow;
  var onTap = props.onTap;
  var onTwoFingerTap = props.onTwoFingerTap;
  var ref = useRef(null);
  var [flash, setFlash] = useState(false);

  // Track gesture state in a ref so re-renders don't reset mid-swipe.
  var gesture = useRef({
    activeId: null,
    startX: 0, startY: 0,
    lastFiredX: 0, lastFiredY: 0,
    moved: false,
    touchCount: 0,
  });

  var flashOnce = useCallback(function() {
    setFlash(true);
    // Use a short timer instead of CSS animation so back-to-back flashes
    // restart cleanly. Old timer is overwritten harmlessly.
    if (gesture.current._flashHandle) { clearTimeout(gesture.current._flashHandle); }
    gesture.current._flashHandle = setTimeout(function() { setFlash(false); }, 160);
  }, []);

  var fire = useCallback(function(key) {
    flashOnce();
    vibrate(8);
    onArrow(key);
  }, [onArrow, flashOnce]);

  var handleTouchStart = useCallback(function(e) {
    var touches = e.touches;
    gesture.current.touchCount = touches.length;
    if (touches.length === 1) {
      var t = touches[0];
      gesture.current.activeId = t.identifier;
      gesture.current.startX = t.clientX;
      gesture.current.startY = t.clientY;
      gesture.current.lastFiredX = t.clientX;
      gesture.current.lastFiredY = t.clientY;
      gesture.current.moved = false;
    }
  }, []);

  var handleTouchMove = useCallback(function(e) {
    if (gesture.current.activeId === null) { return; }
    var touch = null;
    for (var i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === gesture.current.activeId) { touch = e.touches[i]; break; }
    }
    if (!touch) { return; }

    var dx = touch.clientX - gesture.current.lastFiredX;
    var dy = touch.clientY - gesture.current.lastFiredY;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD_PX && absDy < SWIPE_THRESHOLD_PX) { return; }
    gesture.current.moved = true;

    if (absDx > absDy) {
      fire(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
      gesture.current.lastFiredX = touch.clientX;
      gesture.current.lastFiredY = touch.clientY;
    } else {
      fire(dy > 0 ? 'ArrowDown' : 'ArrowUp');
      gesture.current.lastFiredX = touch.clientX;
      gesture.current.lastFiredY = touch.clientY;
    }
  }, [fire]);

  var handleTouchEnd = useCallback(function(e) {
    // Two-finger tap detection: both touches lifted together with no
    // motion -> Back. Single tap with no motion -> OK.
    var endedCount = gesture.current.touchCount;
    gesture.current.touchCount = e.touches.length;
    if (e.touches.length > 0) { return; }  // still mid-gesture, wait for last release

    if (!gesture.current.moved) {
      if (endedCount >= 2) {
        flashOnce();
        vibrate(12);
        onTwoFingerTap();
      } else {
        flashOnce();
        vibrate(8);
        onTap();
      }
    }
    gesture.current.activeId = null;
    gesture.current.moved = false;
  }, [onTap, onTwoFingerTap, flashOnce]);

  // Attach touch handlers via ref + passive:false so we can preventDefault
  // touchmove and stop iOS Safari from bouncing the page during swipes.
  useEffect(function() {
    var el = ref.current;
    if (!el) { return; }
    var onMove = function(ev) {
      ev.preventDefault();
      handleTouchMove(ev);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return function() { el.removeEventListener('touchmove', onMove); };
  }, [handleTouchMove]);

  return (
    <div
      ref={ref}
      style={STYLES.trackpad}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div style={STYLES.trackpadHint}>
        Swipe to move<br />
        Tap = OK &nbsp;&middot;&nbsp; Two-finger tap = Back
      </div>
      <div style={Object.assign({}, STYLES.trackpadFlash, flash ? STYLES.trackpadFlashOn : null)} />
    </div>
  );
}

function DpadButton(props) {
  // Hold-to-repeat handler. Touch users expect a held arrow to scroll a
  // long list; without repeat, only the very first press registers.
  var [pressed, setPressed] = useState(false);
  var timers = useRef({ initial: null, interval: null });

  var stopRepeat = useCallback(function() {
    if (timers.current.initial) { clearTimeout(timers.current.initial); timers.current.initial = null; }
    if (timers.current.interval) { clearInterval(timers.current.interval); timers.current.interval = null; }
    setPressed(false);
  }, []);

  var handleDown = useCallback(function(e) {
    e.preventDefault();
    setPressed(true);
    vibrate(8);
    props.onFire();
    timers.current.initial = setTimeout(function() {
      timers.current.interval = setInterval(function() { props.onFire(); }, REPEAT_INTERVAL_MS);
    }, REPEAT_INITIAL_DELAY_MS);
  }, [props]);

  useEffect(function() { return stopRepeat; }, [stopRepeat]);

  return (
    <button
      type="button"
      style={Object.assign({}, STYLES.btn, pressed ? STYLES.btnPressed : null, props.style || null)}
      onTouchStart={handleDown}
      onTouchEnd={stopRepeat}
      onTouchCancel={stopRepeat}
      onMouseDown={handleDown}
      onMouseUp={stopRepeat}
      onMouseLeave={stopRepeat}
      aria-label={props.label}
    >
      {props.children}
    </button>
  );
}

function SimpleButton(props) {
  var [pressed, setPressed] = useState(false);
  var fire = useCallback(function(e) {
    if (e && typeof e.preventDefault === 'function') { e.preventDefault(); }
    setPressed(true);
    vibrate(10);
    props.onFire();
    setTimeout(function() { setPressed(false); }, 120);
  }, [props]);
  return (
    <button
      type="button"
      style={Object.assign({}, STYLES.btn, pressed ? STYLES.btnPressed : null, props.style || null)}
      onTouchStart={fire}
      onClick={fire}
      aria-label={props.label}
    >
      {props.children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Top-level component

function RemoteApp() {
  // Pair-code source priority: URL > localStorage > prompt.
  var [pairCode, setPairCode] = useState(function() {
    return readPairCodeFromUrl() || readPairCodeFromStorage() || '';
  });

  // If we got the code from the URL, persist it so a reload skips the prompt.
  useEffect(function() {
    var fromUrl = readPairCodeFromUrl();
    if (fromUrl && fromUrl !== readPairCodeFromStorage()) {
      persistPairCode(fromUrl);
    }
  }, []);

  // Surface API errors as a small status badge. Reset to 'idle' after
  // 2.5s so transient single-failure errors fade automatically.
  var [status, setStatus] = useState('idle');  // 'idle' | 'sending' | 'ok' | 'error'
  var statusResetHandle = useRef(null);

  var dispatch = useCallback(function(key, opts) {
    if (!pairCode) { return; }
    setStatus('sending');
    sendEvent(pairCode, key, opts).then(function(result) {
      setStatus(result.accepted ? 'ok' : 'error');
    }).catch(function() {
      setStatus('error');
    });
    if (statusResetHandle.current) { clearTimeout(statusResetHandle.current); }
    statusResetHandle.current = setTimeout(function() { setStatus('idle'); }, 2500);
  }, [pairCode]);

  // Hardware-keyboard fallback (operator with a Bluetooth keyboard, or a
  // desktop browser preview). Maps arrow keys + Enter + Escape to the same
  // dispatch path the touch UI uses.
  useEffect(function() {
    if (!pairCode) { return; }
    var onKey = function(ev) {
      var map = {
        ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown',
        ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
        Enter: 'Enter', Escape: 'Escape', Backspace: 'Escape',
      };
      var key = map[ev.key];
      if (key) { ev.preventDefault(); dispatch(key); }
    };
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [pairCode, dispatch]);

  var handleUnpair = useCallback(function() {
    clearPairCode();
    setPairCode('');
  }, []);

  var statusLabel = useMemo(function() {
    if (!pairCode) { return 'Tap to pair'; }
    if (status === 'error') { return 'Connection lost'; }
    return 'Paired: ' + pairCode;
  }, [pairCode, status]);

  var statusStyle = pairCode && status !== 'error'
    ? Object.assign({}, STYLES.status, STYLES.statusOk)
    : STYLES.status;

  return (
    <div style={STYLES.shell}>
      <div style={STYLES.header}>
        <div style={STYLES.brand}>DaveTV Remote</div>
        <div style={statusStyle}>{statusLabel}</div>
      </div>

      {!pairCode ? (
        <PairScreen onPair={setPairCode} />
      ) : (
        <React.Fragment>
          <Trackpad
            onArrow={function(key) { dispatch(key); }}
            onTap={function() { dispatch('Enter'); }}
            onTwoFingerTap={function() { dispatch('Escape'); }}
          />
          <div style={STYLES.controlsGrid}>
            {/* Row 1: Up */}
            <div />
            <DpadButton label="Up" onFire={function() { dispatch('ArrowUp'); }}>Up</DpadButton>
            <div />
            {/* Row 2: Left / OK / Right */}
            <DpadButton label="Left" onFire={function() { dispatch('ArrowLeft'); }}>Left</DpadButton>
            <SimpleButton label="OK" style={STYLES.okBtn} onFire={function() { dispatch('Enter'); }}>OK</SimpleButton>
            <DpadButton label="Right" onFire={function() { dispatch('ArrowRight'); }}>Right</DpadButton>
            {/* Row 3: Back / Down / Mic */}
            <SimpleButton label="Back" style={STYLES.backBtn} onFire={function() { dispatch('Escape'); }}>Back</SimpleButton>
            <DpadButton label="Down" onFire={function() { dispatch('ArrowDown'); }}>Down</DpadButton>
            <SimpleButton label="Mic" style={STYLES.micBtn} onFire={function() { dispatch('voice'); }}>Mic</SimpleButton>
          </div>
          <div style={STYLES.footer}>
            <span>LAN only &middot; no data leaves your network</span>
            <button type="button" style={STYLES.unpairLink} onClick={handleUnpair}>Unpair</button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

export default RemoteApp;
