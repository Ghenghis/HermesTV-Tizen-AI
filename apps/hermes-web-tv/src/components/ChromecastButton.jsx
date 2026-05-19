import React from 'react';
import useCastSession from '../hooks/useCastSession.js';

/**
 * ChromecastButton — small icon button that opens the browser's native
 * cast device picker. Auto-hides when the Cast SDK is unavailable, which
 * is always the case inside the Tizen webview (no `window.chrome.cast`).
 *
 * Three rendered states:
 *   - idle:       outlined icon button
 *   - connecting: pulsing accent border (transform/opacity only,
 *                 disabled when body has .motion-reduced)
 *   - connected:  filled var(--gradient-accent) + green dot badge
 *
 * Props:
 *   mediaUrl   — HLS or progressive URL (required to actually cast)
 *   mediaTitle — string shown on the receiver UI
 *   mediaType  — 'video/mp4' | 'application/vnd.apple.mpegurl'
 *   posterUrl  — optional poster image for receiver UI
 *
 * Tizen 6.5 / Chrome 76 safe — no optional chaining, no nullish coalescing.
 */

var PULSE_KEYFRAMES =
  '@keyframes hermes-cast-pulse { ' +
  '  0%, 100% { transform: scale(1); opacity: 1; } ' +
  '  50%      { transform: scale(1.05); opacity: 0.72; } ' +
  '} ' +
  '.motion-reduced .hermes-cast-pulse { animation: none !important; transform: none !important; opacity: 1 !important; } ' +
  '@media (prefers-reduced-motion: reduce) { ' +
  '  .hermes-cast-pulse { animation: none !important; transform: none !important; opacity: 1 !important; } ' +
  '}';

// Inline Cast glyph — matches Google's reference outline geometry without
// pulling in an icon library. `currentColor` so the parent's color prop
// controls the stroke/fill.
function CastIcon(props) {
  var size = props.size || 18;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Outer rectangle — the screen */}
      <path d="M21 4H3a1 1 0 0 0-1 1v3" />
      <path d="M2 19h2" />
      <path d="M2 15a6 6 0 0 1 6 6" />
      <path d="M2 11a10 10 0 0 1 10 10" />
      <path d="M22 8v11a1 1 0 0 1-1 1h-7" />
    </svg>
  );
}

function ChromecastButton(props) {
  var mediaUrl = props.mediaUrl || '';
  var mediaTitle = props.mediaTitle || '';
  var mediaType = props.mediaType || 'video/mp4';
  var posterUrl = props.posterUrl || '';

  var cast = useCastSession();
  var state = cast.state;
  var deviceName = cast.deviceName;
  var available = cast.available;

  // Hide entirely when the SDK is unavailable (Tizen, no Chromecasts on LAN,
  // gstatic blocked by CSP, etc.).
  if (!available) { return null; }

  function handleClick() {
    if (!mediaUrl) {
      // No media — open the picker without loading anything. The user can
      // still connect to a device; the integrator wires media later.
      return;
    }
    if (state === 'connected') {
      // Already connected — clicking again disconnects.
      cast.stopCast();
      return;
    }
    // Picker opens during castMedia() → requestSession() when no session.
    cast.castMedia({
      url: mediaUrl,
      title: mediaTitle,
      type: mediaType,
      poster: posterUrl,
    }).then(function() {
      // No-op — state transitions are pushed via subscribeSession.
    }, function() {
      // Picker cancelled or load failed — no UI noise here. State stays idle.
    });
  }

  // Visual properties per state.
  var isConnected = state === 'connected';
  var isConnecting = state === 'connecting';

  var bgStyle;
  var borderStyle;
  var iconColor;
  if (isConnected) {
    bgStyle = 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))';
    borderStyle = '1px solid transparent';
    iconColor = '#ffffff';
  } else if (isConnecting) {
    bgStyle = 'rgba(255,255,255,0.04)';
    borderStyle = '2px solid var(--accent, #1f6feb)';
    iconColor = 'var(--accent, #1f6feb)';
  } else {
    bgStyle = 'transparent';
    borderStyle = '1px solid var(--border, #30363d)';
    iconColor = 'var(--text, #e6edf3)';
  }

  var ariaLabel = 'Cast to other device';
  if (isConnected) {
    ariaLabel = deviceName ? 'Casting to ' + deviceName + '. Click to stop.' : 'Casting. Click to stop.';
  } else if (isConnecting) {
    ariaLabel = 'Connecting to cast device';
  }

  return (
    <React.Fragment>
      <style>{PULSE_KEYFRAMES}</style>
      <button
        type="button"
        onClick={handleClick}
        aria-label={ariaLabel}
        aria-pressed={isConnected ? 'true' : 'false'}
        title={isConnected && deviceName ? 'Casting to ' + deviceName : 'Cast to other device'}
        className={isConnecting ? 'hermes-cast-pulse' : ''}
        style={{
          position: 'relative',
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-md, 12px)',
          background: bgStyle,
          border: borderStyle,
          color: iconColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
          outline: 'none',
          // Animate transform/opacity only — same constraint the rest of
          // the app honours for the QN85 (Chrome 76) animation budget.
          transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), opacity 160ms ease',
          willChange: isConnecting ? 'transform, opacity' : 'auto',
          animation: isConnecting ? 'hermes-cast-pulse 1.4s ease-in-out infinite' : 'none',
        }}
        onMouseEnter={function(e) {
          if (!isConnected) { e.currentTarget.style.transform = 'scale(1.06)'; }
        }}
        onMouseLeave={function(e) {
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onFocus={function(e) {
          e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px var(--accent, #1f6feb))';
        }}
        onBlur={function(e) {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <CastIcon size={18} />
        {/* Connected dot — green pip in the corner for at-a-glance status */}
        {isConnected && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 6px rgba(34,197,94,0.65)',
              border: '1px solid rgba(0,0,0,0.35)',
            }}
          />
        )}
      </button>
    </React.Fragment>
  );
}

export default ChromecastButton;
