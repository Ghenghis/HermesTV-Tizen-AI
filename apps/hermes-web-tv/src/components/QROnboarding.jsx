import React from 'react';
import * as hermesApi from '../api/hermesApi.js';
import * as mockApi from '../api/mockApi.js';

// Poll interval — every 5s the TV asks the API "did the operator's phone
// complete this pairing yet?" Cheap LAN HTTP call; modal closes the second
// status flips to 'completed' (or surfaces 'expired' for a retry button).
var POLL_INTERVAL_MS = 5000;

// Simple static SVG QR code placeholder — black squares pattern.
// Phase 2 will replace this with a real QR encoding the pairing URL
// (hermestv.local/setup/provider?code=HRM-XXXX). For Phase 1 the pairing
// code itself is the surface the operator types into their phone — the
// QR pattern is decorative.
function QRPlaceholder() {
  return (
    <svg
      width="100"
      height="100"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="QR code placeholder"
      style={{ display: 'block' }}
    >
      <rect width="100" height="100" fill="#ffffff" />
      {/* Top-left finder pattern */}
      <rect x="5" y="5" width="25" height="25" fill="#000000" />
      <rect x="10" y="10" width="15" height="15" fill="#ffffff" />
      <rect x="13" y="13" width="9" height="9" fill="#000000" />
      {/* Top-right finder pattern */}
      <rect x="70" y="5" width="25" height="25" fill="#000000" />
      <rect x="75" y="10" width="15" height="15" fill="#ffffff" />
      <rect x="78" y="13" width="9" height="9" fill="#000000" />
      {/* Bottom-left finder pattern */}
      <rect x="5" y="70" width="25" height="25" fill="#000000" />
      <rect x="10" y="75" width="15" height="15" fill="#ffffff" />
      <rect x="13" y="78" width="9" height="9" fill="#000000" />
      {/* Mock data modules */}
      <rect x="35" y="5" width="5" height="5" fill="#000000" />
      <rect x="45" y="5" width="5" height="5" fill="#000000" />
      <rect x="55" y="5" width="5" height="5" fill="#000000" />
      <rect x="35" y="15" width="5" height="5" fill="#000000" />
      <rect x="50" y="15" width="5" height="5" fill="#000000" />
      <rect x="40" y="25" width="5" height="5" fill="#000000" />
      <rect x="55" y="25" width="5" height="5" fill="#000000" />
      <rect x="5" y="35" width="5" height="5" fill="#000000" />
      <rect x="15" y="35" width="5" height="5" fill="#000000" />
      <rect x="35" y="35" width="5" height="5" fill="#000000" />
      <rect x="45" y="35" width="5" height="5" fill="#000000" />
      <rect x="60" y="35" width="5" height="5" fill="#000000" />
      <rect x="70" y="35" width="5" height="5" fill="#000000" />
      <rect x="80" y="35" width="5" height="5" fill="#000000" />
      <rect x="90" y="35" width="5" height="5" fill="#000000" />
      <rect x="5" y="45" width="5" height="5" fill="#000000" />
      <rect x="20" y="45" width="5" height="5" fill="#000000" />
      <rect x="40" y="45" width="5" height="5" fill="#000000" />
      <rect x="55" y="45" width="5" height="5" fill="#000000" />
      <rect x="65" y="45" width="5" height="5" fill="#000000" />
      <rect x="80" y="45" width="5" height="5" fill="#000000" />
      <rect x="10" y="55" width="5" height="5" fill="#000000" />
      <rect x="25" y="55" width="5" height="5" fill="#000000" />
      <rect x="35" y="55" width="5" height="5" fill="#000000" />
      <rect x="50" y="55" width="5" height="5" fill="#000000" />
      <rect x="60" y="55" width="5" height="5" fill="#000000" />
      <rect x="75" y="55" width="5" height="5" fill="#000000" />
      <rect x="90" y="55" width="5" height="5" fill="#000000" />
      <rect x="35" y="65" width="5" height="5" fill="#000000" />
      <rect x="45" y="65" width="5" height="5" fill="#000000" />
      <rect x="60" y="65" width="5" height="5" fill="#000000" />
      <rect x="75" y="65" width="5" height="5" fill="#000000" />
      <rect x="90" y="65" width="5" height="5" fill="#000000" />
      <rect x="35" y="75" width="5" height="5" fill="#000000" />
      <rect x="50" y="75" width="5" height="5" fill="#000000" />
      <rect x="65" y="75" width="5" height="5" fill="#000000" />
      <rect x="80" y="75" width="5" height="5" fill="#000000" />
      <rect x="40" y="85" width="5" height="5" fill="#000000" />
      <rect x="55" y="85" width="5" height="5" fill="#000000" />
      <rect x="70" y="85" width="5" height="5" fill="#000000" />
      <rect x="85" y="85" width="5" height="5" fill="#000000" />
      <rect x="35" y="90" width="5" height="5" fill="#000000" />
      <rect x="50" y="90" width="5" height="5" fill="#000000" />
    </svg>
  );
}

// Format MS as MM:SS for the countdown line. Caps at 00:00.
function formatCountdown(ms) {
  if (!ms || ms < 0) { return '00:00'; }
  var total = Math.floor(ms / 1000);
  var mm = Math.floor(total / 60);
  var ss = total % 60;
  return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
}

function QROnboarding(props) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var online = props.online !== false; // default true unless explicitly offline
  var onCompleted = props.onCompleted; // optional — called when status flips to 'completed'

  var initialState = {
    pairingCode: null,        // string from POST /api/pair (or 'HRM-MOCK' offline)
    status: 'loading',        // 'loading' | 'pending' | 'completed' | 'expired' | 'error'
    expiresAt: null,          // ISO timestamp
    remainingMs: 600000,      // 10:00 — refreshed every tick
    errorMessage: '',
  };
  var stateHook = React.useState(initialState);
  var pairState = stateHook[0];
  var setPairState = stateHook[1];

  // Patch helper to mirror App.jsx style.
  function patchPair(patch) {
    setPairState(function(prev) { return Object.assign({}, prev, patch); });
  }

  // Mint a fresh pairing code on open. Re-runs if isOpen flips false→true.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }

    var cancelled = false;
    var api = online ? hermesApi : mockApi;

    // Reset to loading on every open.
    setPairState(initialState);

    api.createPairing().then(function(envelope) {
      if (cancelled) { return; }
      patchPair({
        pairingCode: envelope.pairing_code,
        status: envelope.status || 'pending',
        expiresAt: envelope.expires_at,
        remainingMs: envelope.ttl_ms || 600000,
        errorMessage: '',
      });
    }).catch(function(err) {
      if (cancelled) { return; }
      patchPair({
        status: 'error',
        errorMessage: (err && err.message) ? err.message : 'Failed to create pairing code',
      });
    });

    return function() { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, online]);

  // Countdown ticker — updates remainingMs every second while pending.
  React.useEffect(function() {
    if (!isOpen || !pairState.expiresAt) { return undefined; }
    if (pairState.status !== 'pending') { return undefined; }

    var tick = function() {
      var remaining = Date.parse(pairState.expiresAt) - Date.now();
      if (remaining <= 0) {
        patchPair({ remainingMs: 0, status: 'expired' });
      } else {
        patchPair({ remainingMs: remaining });
      }
    };
    var handle = setInterval(tick, 1000);
    return function() { clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pairState.expiresAt, pairState.status]);

  // Status polling — every 5s ask the API if the operator's phone completed
  // the pairing. Stops the moment status leaves 'pending'.
  React.useEffect(function() {
    if (!isOpen) { return undefined; }
    if (pairState.status !== 'pending') { return undefined; }
    if (!pairState.pairingCode) { return undefined; }

    var cancelled = false;
    var api = online ? hermesApi : mockApi;

    var poll = function() {
      if (cancelled) { return; }
      api.getPairingStatus(pairState.pairingCode).then(function(envelope) {
        if (cancelled) { return; }
        if (envelope.status === 'completed') {
          patchPair({ status: 'completed' });
          if (typeof onCompleted === 'function') {
            try { onCompleted(envelope); }
            catch (e) { /* never let callback errors break the modal */ }
          }
          // Auto-close after a brief confirmation moment.
          setTimeout(function() {
            if (!cancelled && typeof onClose === 'function') { onClose(); }
          }, 1200);
        } else if (envelope.status === 'expired') {
          patchPair({ status: 'expired', remainingMs: 0 });
        }
        // 'pending' → keep polling.
      }).catch(function(err) {
        // Soft-fail the poll — keep the modal usable. Operator can close +
        // retry. Don't flip to 'error' for transient network blips.
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[QROnboarding] pairing poll failed:', err && err.message);
        }
      });
    };

    var handle = setInterval(poll, POLL_INTERVAL_MS);
    return function() { cancelled = true; clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, online, pairState.pairingCode, pairState.status]);

  if (!isOpen) { return null; }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (onClose) { onClose(); }
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      if (onClose) { onClose(); }
    }
  }

  function handleRetry() {
    // Force a fresh mint cycle — the create-effect re-fires when state
    // resets to the initial 'loading' shape because pairingCode is null
    // and the effect's dependency on isOpen is unchanged.
    setPairState(initialState);
    var api = online ? hermesApi : mockApi;
    api.createPairing().then(function(envelope) {
      patchPair({
        pairingCode: envelope.pairing_code,
        status: envelope.status || 'pending',
        expiresAt: envelope.expires_at,
        remainingMs: envelope.ttl_ms || 600000,
        errorMessage: '',
      });
    }).catch(function(err) {
      patchPair({
        status: 'error',
        errorMessage: (err && err.message) ? err.message : 'Failed to create pairing code',
      });
    });
  }

  // Render the pairing code (or a placeholder while loading/error).
  var displayCode = pairState.pairingCode || (pairState.status === 'error' ? '----' : '...');

  var statusBlock;
  if (pairState.status === 'completed') {
    statusBlock = (
      <div
        style={{
          fontSize: 'calc(0.9rem * var(--font-scale, 1))',
          color: 'var(--accent)',
          fontWeight: '600',
          backgroundColor: 'rgba(0,128,0,0.15)',
          borderRadius: '6px',
          padding: '0.6rem 1rem',
        }}
      >
        Provider added — closing…
      </div>
    );
  } else if (pairState.status === 'expired') {
    statusBlock = (
      <div
        style={{
          fontSize: 'calc(0.85rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          backgroundColor: 'rgba(255,128,0,0.12)',
          borderRadius: '6px',
          padding: '0.6rem 1rem',
          textAlign: 'center',
        }}
      >
        Code expired. Press <strong style={{ color: 'var(--text)' }}>Get new code</strong> below.
      </div>
    );
  } else if (pairState.status === 'error') {
    statusBlock = (
      <div
        style={{
          fontSize: 'calc(0.85rem * var(--font-scale, 1))',
          color: '#ff8080',
          backgroundColor: 'rgba(255,0,0,0.10)',
          borderRadius: '6px',
          padding: '0.6rem 1rem',
          textAlign: 'center',
        }}
      >
        {pairState.errorMessage || 'Unable to create pairing code.'}
      </div>
    );
  } else {
    statusBlock = (
      <div
        style={{
          fontSize: 'calc(0.8rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderRadius: '6px',
          padding: '0.5rem 1rem',
        }}
      >
        This code expires in <strong style={{ color: 'var(--text)' }}>{formatCountdown(pairState.remainingMs)}</strong>
      </div>
    );
  }

  var primaryButtonLabel = (pairState.status === 'expired' || pairState.status === 'error')
    ? 'Get new code'
    : 'Close';
  var primaryButtonHandler = (pairState.status === 'expired' || pairState.status === 'error')
    ? handleRetry
    : onClose;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a Provider"
      onKeyDown={handleKeyDown}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '16px',
          padding: '2.5rem',
          maxWidth: '420px',
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          color: 'var(--text)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'calc(1.5rem * var(--font-scale, 1))',
            fontWeight: '700',
            color: 'var(--text)',
            textAlign: 'center',
          }}
        >
          Add a Provider
        </h2>

        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            padding: '12px',
            display: 'inline-block',
            opacity: pairState.status === 'completed' || pairState.status === 'expired' ? 0.4 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          <QRPlaceholder />
        </div>

        {/* Pairing code */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'calc(0.8rem * var(--font-scale, 1))',
              color: 'var(--muted)',
              marginBottom: '0.4rem',
              letterSpacing: '0.03em',
            }}
          >
            Pairing code
          </div>
          <div
            aria-live="polite"
            style={{
              fontSize: 'calc(1.75rem * var(--font-scale, 1))',
              fontWeight: '800',
              letterSpacing: '0.2em',
              color: 'var(--accent)',
              fontFamily: 'monospace',
            }}
          >
            {displayCode}
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 'calc(0.9rem * var(--font-scale, 1))',
            color: 'var(--muted)',
            textAlign: 'center',
            lineHeight: '1.5',
          }}
        >
          Scan this code on your phone to add a provider at{' '}
          <span style={{ color: 'var(--accent)', fontWeight: '600' }}>hermestv.local</span>
        </p>

        {statusBlock}

        <button
          tabIndex={0}
          autoFocus
          onClick={primaryButtonHandler}
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem 2rem',
            backgroundColor: 'var(--surface-raised, var(--surface))',
            border: '2px solid var(--border, #30363d)',
            borderRadius: '8px',
            color: 'var(--text)',
            fontSize: 'calc(1rem * var(--font-scale, 1))',
            cursor: 'pointer',
            fontWeight: '600',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={function(e) {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={function(e) {
            e.currentTarget.style.borderColor = 'var(--border, #30363d)';
            e.currentTarget.style.outline = 'none';
          }}
        >
          {primaryButtonLabel}
        </button>
      </div>
    </div>
  );
}

export default QROnboarding;
