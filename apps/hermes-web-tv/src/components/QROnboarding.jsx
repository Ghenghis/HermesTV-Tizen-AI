import React from 'react';

// Simple static SVG QR code placeholder — black squares pattern
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

function QROnboarding(props) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;

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
            style={{
              fontSize: 'calc(1.75rem * var(--font-scale, 1))',
              fontWeight: '800',
              letterSpacing: '0.2em',
              color: 'var(--accent)',
              fontFamily: 'monospace',
            }}
          >
            HRM-M0K
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

        <div
          style={{
            fontSize: 'calc(0.8rem * var(--font-scale, 1))',
            color: 'var(--muted)',
            backgroundColor: 'rgba(0,0,0,0.3)',
            borderRadius: '6px',
            padding: '0.5rem 1rem',
          }}
        >
          This code expires in <strong style={{ color: 'var(--text)' }}>10:00</strong>
        </div>

        <button
          tabIndex={0}
          autoFocus
          onClick={onClose}
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
          Close
        </button>
      </div>
    </div>
  );
}

export default QROnboarding;
