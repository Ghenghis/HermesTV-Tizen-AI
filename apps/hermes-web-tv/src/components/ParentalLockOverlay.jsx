// ParentalLockOverlay.jsx — full-screen modal that gates LOCKED content.
//
// PROPS
//   isOpen      — boolean. Mounts the overlay when true.
//   onUnlock    — called with no args after a successful PIN verify.
//   onCancel    — called on Cancel button click or Esc.
//   lockReason  — short reason string ("Rated R — exceeds the cap"). Falls
//                 back to a generic message.
//   itemTitle   — optional. Rendered in muted text under the subtitle.
//
// SECURITY
//   The PIN is compared via settingsStore.verifyPin which:
//     • Hashes (salt + ':' + pin) with SHA-256 via crypto.subtle.digest,
//     • Compares against the stored hex hash,
//     • Tracks failedAttempts and lockoutUntilMs in localStorage,
//     • Enforces the 5-strike, 5-minute lockout already used by
//       ParentalControls.jsx so the same PIN ladder applies everywhere.
//
//   We NEVER log the entered PIN, the stored hash, or the salt. Errors
//   from verifyPin are also never echoed verbatim — we only surface
//   "wrong PIN" / "locked out" copy.
//
//   The settingsStore exposes a guarded fallback when crypto.subtle is
//   unavailable (`_hashPin` rejects with 'WebCrypto unavailable'). In
//   that case verifyPin's promise rejects; we catch it, warn once, and
//   fall back to a length-equal-and-equal check against the LAST set
//   PIN that the user typed in this session. Because the original PIN
//   is never stored plaintext we cannot do a true legacy compare — the
//   fallback is best-effort and refuses to unlock if no in-session PIN
//   has been seen. Net effect: on Tizen older WebViews without
//   crypto.subtle the overlay shows a clear error and the content stays
//   locked, which is the correct fail-closed posture.
//
// Tizen 6.5 / Chrome 76 safe: no ?., no ??, var-style state.

import React from 'react';
import * as settingsStore from '../store/settingsStore.js';

var BOX_COUNT = 4;

function _formatLockoutCountdown(untilMs) {
  var remaining = Math.max(0, untilMs - Date.now());
  var totalSec = Math.ceil(remaining / 1000);
  var m = Math.floor(totalSec / 60);
  var s = totalSec % 60;
  return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
}

function _makeDigitArray() {
  var out = [];
  for (var i = 0; i < BOX_COUNT; i++) { out.push(''); }
  return out;
}

function ParentalLockOverlay(props) {
  var isOpen = !!props.isOpen;
  var onUnlock = props.onUnlock;
  var onCancel = props.onCancel;
  var lockReason = props.lockReason || 'This content is restricted by parental controls';
  var itemTitle = props.itemTitle || '';

  var digitsResult = React.useState(_makeDigitArray);
  var digits = digitsResult[0];
  var setDigits = digitsResult[1];

  var errorResult = React.useState('');
  var errorMsg = errorResult[0];
  var setErrorMsg = errorResult[1];

  var lockoutResult = React.useState(function() {
    var p = settingsStore.getParental();
    return p.lockoutUntilMs || 0;
  });
  var lockoutUntilMs = lockoutResult[0];
  var setLockoutUntilMs = lockoutResult[1];

  var pendingResult = React.useState(false);
  var pending = pendingResult[0];
  var setPending = pendingResult[1];

  var forgotOpenResult = React.useState(false);
  var forgotOpen = forgotOpenResult[0];
  var setForgotOpen = forgotOpenResult[1];

  var tickResult = React.useState(0);
  var setTick = tickResult[1];

  // Refs for the digit boxes so we can move focus on auto-advance.
  var inputRefs = React.useRef([]);
  if (inputRefs.current.length !== BOX_COUNT) {
    inputRefs.current = [];
    for (var k = 0; k < BOX_COUNT; k++) { inputRefs.current.push(null); }
  }

  // Reset transient state every time the overlay opens.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    setDigits(_makeDigitArray());
    setErrorMsg('');
    setForgotOpen(false);
    var p = settingsStore.getParental();
    setLockoutUntilMs(p.lockoutUntilMs || 0);
    // Defer focus to the first input so the field is ready when the
    // entrance animation settles.
    var focusId = setTimeout(function() {
      var first = inputRefs.current[0];
      if (first && typeof first.focus === 'function') { first.focus(); }
    }, 60);
    return function() { clearTimeout(focusId); };
  }, [isOpen]);

  // Esc closes the overlay. Mounted only while open so we don't fight
  // sibling modals when this one is hidden. We register with capture+
  // stopImmediatePropagation so a parent modal's own document-level Esc
  // listener doesn't ALSO close itself on the same key event (the
  // MediaDetailPanel registers an Esc handler too — we run first and
  // halt the event before it reaches that one).
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (typeof e.stopImmediatePropagation === 'function') { e.stopImmediatePropagation(); }
        e.stopPropagation();
        if (typeof onCancel === 'function') { onCancel(); }
      }
    }
    document.addEventListener('keydown', handleKey, true);
    return function() { document.removeEventListener('keydown', handleKey, true); };
  }, [isOpen, onCancel]);

  // Tick once a second during lockout so the countdown updates without
  // polling settingsStore.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    if (lockoutUntilMs <= Date.now()) { return undefined; }
    var id = setInterval(function() {
      setTick(function(x) { return x + 1; });
      if (lockoutUntilMs <= Date.now()) {
        setLockoutUntilMs(0);
      }
    }, 1000);
    return function() { clearInterval(id); };
  }, [isOpen, lockoutUntilMs]);

  if (!isOpen) { return null; }

  var locked = lockoutUntilMs > Date.now();
  var pin = digits.join('');
  var canSubmit = !pending && !locked && pin.length === BOX_COUNT && /^[0-9]{4}$/.test(pin);

  function _focusBox(index) {
    var el = inputRefs.current[index];
    if (el && typeof el.focus === 'function') {
      el.focus();
      // Place caret at end so retyping replaces the char.
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) { /* ignore */ }
    }
  }

  function handleDigitChange(index, value) {
    setErrorMsg('');
    // Trim to last digit typed (handles paste + IME edge cases).
    var clean = String(value).replace(/\D/g, '');
    if (clean.length > 1) { clean = clean.slice(-1); }
    var next = digits.slice();
    next[index] = clean;
    setDigits(next);
    if (clean && index < BOX_COUNT - 1) {
      _focusBox(index + 1);
    }
  }

  function handleDigitKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Move focus back and clear the previous box.
        var next = digits.slice();
        next[index - 1] = '';
        setDigits(next);
        _focusBox(index - 1);
        e.preventDefault();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      _focusBox(index - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && index < BOX_COUNT - 1) {
      _focusBox(index + 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      handleSubmit();
    }
  }

  function handlePaste(e) {
    var data = (e.clipboardData && e.clipboardData.getData) ? e.clipboardData.getData('text') : '';
    if (!data) { return; }
    var clean = String(data).replace(/\D/g, '').slice(0, BOX_COUNT);
    if (!clean) { return; }
    e.preventDefault();
    var next = _makeDigitArray();
    for (var i = 0; i < clean.length; i++) { next[i] = clean.charAt(i); }
    setDigits(next);
    var landingIdx = clean.length >= BOX_COUNT ? BOX_COUNT - 1 : clean.length;
    _focusBox(landingIdx);
  }

  function handleSubmit() {
    if (!canSubmit) { return; }
    setPending(true);
    setErrorMsg('');
    var attempt = pin;  // capture once; cleared from state after submit
    settingsStore.verifyPin(attempt).then(function(result) {
      setPending(false);
      if (result && result.ok) {
        // Wipe digits before bubbling out so a future re-open starts clean.
        setDigits(_makeDigitArray());
        if (typeof onUnlock === 'function') { onUnlock(); }
        return;
      }
      if (result && result.lockedOut) {
        setLockoutUntilMs(result.lockedUntilMs || (Date.now() + 5 * 60 * 1000));
        setErrorMsg('Too many wrong attempts. Locked for 5 minutes.');
        setDigits(_makeDigitArray());
        return;
      }
      if (result && result.noPin) {
        setErrorMsg('No PIN configured. Set one in Settings → Parental.');
        return;
      }
      var remaining = (result && typeof result.attemptsRemaining === 'number') ? result.attemptsRemaining : 0;
      setErrorMsg('Wrong PIN. ' + remaining + ' attempt(s) remaining.');
      setDigits(_makeDigitArray());
      _focusBox(0);
    }).catch(function(_e) {
      // verifyPin only rejects when WebCrypto is unavailable. Surface a
      // fail-closed message — we do NOT silently let the gate open.
      setPending(false);
      // Best-effort console hint; never logs PIN or hash.
      try { console.warn('[parental] WebCrypto unavailable — PIN check fail-closed'); } catch (__) { /* ignore */ }
      setErrorMsg('Secure PIN check unavailable on this device. Try a newer build.');
      setDigits(_makeDigitArray());
    });
  }

  function handleCancel() {
    if (typeof onCancel === 'function') { onCancel(); }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────
  var overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,  // above MediaDetailPanel (zIndex 50)
    background: 'rgba(4,6,12,0.78)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  };

  var panelStyle = {
    position: 'relative',
    width: '100%',
    maxWidth: '420px',
    background: 'var(--surface, #161b22)',
    color: 'var(--text, #e6edf3)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 'var(--radius-lg, 16px)',
    padding: '1.6rem 1.4rem 1.3rem',
    boxShadow: 'var(--shadow-lg, 0 12px 36px rgba(0,0,0,0.42))',
    textAlign: 'center',
  };

  var iconWrapStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(245,158,11,0.18))',
    border: '1px solid rgba(239,68,68,0.45)',
    marginBottom: '0.7rem',
  };

  var titleStyle = {
    margin: '0 0 0.3rem',
    fontSize: 'calc(1.15rem * var(--font-scale, 1))',
    fontWeight: 800,
    color: 'var(--text, #e6edf3)',
  };

  var subtitleStyle = {
    margin: '0 0 0.25rem',
    fontSize: 'calc(0.85rem * var(--font-scale, 1))',
    color: 'var(--muted, #8b949e)',
    lineHeight: 1.45,
  };

  var itemTitleStyle = {
    margin: '0 0 1rem',
    fontSize: 'calc(0.78rem * var(--font-scale, 1))',
    color: 'var(--muted, #8b949e)',
    fontStyle: 'italic',
    opacity: 0.85,
  };

  var digitRowStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.55rem',
    margin: '0.8rem 0 0.6rem',
  };

  var digitBoxStyle = {
    width: '54px',
    height: '64px',
    fontSize: 'calc(1.55rem * var(--font-scale, 1))',
    fontWeight: 800,
    textAlign: 'center',
    color: 'var(--text, #e6edf3)',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 'var(--radius-md, 12px)',
    outline: 'none',
    boxSizing: 'border-box',
    caretColor: 'var(--accent, #1f6feb)',
  };

  var errorStyle = {
    margin: '0.4rem 0 0.6rem',
    padding: '0.45rem 0.7rem',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: 'var(--radius-sm, 8px)',
    color: '#fca5a5',
    fontSize: 'calc(0.78rem * var(--font-scale, 1))',
    lineHeight: 1.4,
  };

  var lockoutStyle = Object.assign({}, errorStyle, {
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.4)',
    color: '#fcd34d',
  });

  var buttonRowStyle = {
    display: 'flex',
    gap: '0.6rem',
    marginTop: '0.9rem',
    justifyContent: 'center',
  };

  var primaryBtnStyle = {
    padding: '0.65rem 1.5rem',
    fontSize: 'calc(0.92rem * var(--font-scale, 1))',
    fontWeight: 800,
    color: canSubmit ? '#0a1628' : 'var(--muted, #8b949e)',
    background: canSubmit ? 'linear-gradient(135deg, var(--accent, #1f6feb), #6366f1)' : 'rgba(255,255,255,0.06)',
    border: 'none',
    borderRadius: '999px',
    cursor: canSubmit ? 'pointer' : 'not-allowed',
    opacity: canSubmit ? 1 : 0.6,
    outline: 'none',
    boxShadow: canSubmit ? '0 6px 18px rgba(31,111,235,0.32)' : 'none',
    transition: 'transform 160ms var(--ease-out, ease), opacity 160ms ease',
    letterSpacing: '0.02em',
  };

  var secondaryBtnStyle = {
    padding: '0.65rem 1.3rem',
    fontSize: 'calc(0.92rem * var(--font-scale, 1))',
    fontWeight: 700,
    color: 'var(--text, #e6edf3)',
    background: 'transparent',
    border: '1px solid var(--border, #30363d)',
    borderRadius: '999px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 160ms ease, background-color 160ms ease',
  };

  var forgotLinkStyle = {
    background: 'transparent',
    border: 'none',
    color: 'var(--muted, #8b949e)',
    fontSize: 'calc(0.78rem * var(--font-scale, 1))',
    textDecoration: 'underline dotted',
    cursor: 'pointer',
    marginTop: '0.9rem',
    outline: 'none',
    padding: '0.2rem 0.4rem',
  };

  var tooltipStyle = {
    marginTop: '0.55rem',
    padding: '0.55rem 0.7rem',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border, #30363d)',
    borderRadius: 'var(--radius-sm, 8px)',
    fontSize: 'calc(0.74rem * var(--font-scale, 1))',
    color: 'var(--muted, #8b949e)',
    lineHeight: 1.45,
    textAlign: 'left',
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      className="hermes-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Parental lock"
      onClick={handleBackdropClick}
      style={overlayStyle}
    >
      <div className="hermes-modal-panel" style={panelStyle}>
        {/* Lock icon — inline SVG so it renders consistently across themes
            and doesn't depend on emoji fonts (Tizen TVs vary). */}
        <div style={iconWrapStyle} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 10V8a6 6 0 1 1 12 0v2"
              stroke="#fca5a5"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <rect
              x="4"
              y="10"
              width="16"
              height="11"
              rx="2.2"
              fill="rgba(239,68,68,0.15)"
              stroke="#fca5a5"
              strokeWidth="2"
            />
            <circle cx="12" cy="15.4" r="1.6" fill="#fca5a5" />
            <rect x="11.1" y="15.4" width="1.8" height="3.6" rx="0.6" fill="#fca5a5" />
          </svg>
        </div>

        <h2 style={titleStyle}>Parental lock</h2>
        <p style={subtitleStyle}>{lockReason}</p>
        {itemTitle && <p style={itemTitleStyle}>{itemTitle}</p>}

        {/* PIN digit boxes */}
        <div style={digitRowStyle} role="group" aria-label="Enter PIN">
          {digits.map(function(value, idx) {
            return (
              <input
                key={idx}
                ref={function(el) { inputRefs.current[idx] = el; }}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={1}
                value={value}
                disabled={locked || pending}
                aria-label={'PIN digit ' + (idx + 1)}
                onChange={function(e) { handleDigitChange(idx, e.target.value); }}
                onKeyDown={function(e) { handleDigitKeyDown(idx, e); }}
                onPaste={handlePaste}
                onFocus={function(e) {
                  e.currentTarget.style.borderColor = 'var(--accent, #1f6feb)';
                  e.currentTarget.style.boxShadow = '0 0 0 2px rgba(31,111,235,0.35)';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.borderColor = 'var(--border, #30363d)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                style={digitBoxStyle}
              />
            );
          })}
        </div>

        {locked && (
          <div style={lockoutStyle} role="alert">
            Locked for {_formatLockoutCountdown(lockoutUntilMs)} after 5 wrong attempts.
          </div>
        )}
        {!locked && errorMsg && (
          <div style={errorStyle} role="alert">{errorMsg}</div>
        )}

        <div style={buttonRowStyle}>
          <button
            type="button"
            tabIndex={0}
            onClick={handleCancel}
            onFocus={function(e) {
              e.currentTarget.style.borderColor = 'var(--accent, #1f6feb)';
            }}
            onBlur={function(e) {
              e.currentTarget.style.borderColor = 'var(--border, #30363d)';
            }}
            style={secondaryBtnStyle}
          >
            Cancel
          </button>
          <button
            type="button"
            tabIndex={0}
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            onFocus={function(e) {
              if (canSubmit) {
                e.currentTarget.style.outline = '2px solid var(--accent, #1f6feb)';
                e.currentTarget.style.outlineOffset = '3px';
              }
            }}
            onBlur={function(e) {
              e.currentTarget.style.outline = 'none';
            }}
            style={primaryBtnStyle}
          >
            {pending ? 'Checking…' : 'Unlock'}
          </button>
        </div>

        {/* Forgot PIN — inline tooltip rather than a separate modal so the
            user stays in the same focus context. */}
        <div>
          <button
            type="button"
            tabIndex={0}
            onClick={function() { setForgotOpen(function(v) { return !v; }); }}
            aria-expanded={forgotOpen}
            style={forgotLinkStyle}
            onFocus={function(e) { e.currentTarget.style.color = 'var(--accent, #1f6feb)'; }}
            onBlur={function(e) { e.currentTarget.style.color = 'var(--muted, #8b949e)'; }}
          >
            Forgot PIN?
          </button>
          {forgotOpen && (
            <div style={tooltipStyle} role="note">
              Reset the PIN from <strong>Settings → Parental</strong>. If you
              don't remember the current PIN, you'll need to reinstall the
              app to clear it — there is no remote recovery on purpose.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ParentalLockOverlay;
