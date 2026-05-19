import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ErrorState — shared, focusable error pane for failed loads.
//
// Replaces hand-rolled "Something went wrong" + raw <button>Retry</button>
// JSX scattered across feature shells, modals, and rails. Two design goals:
//
//   1. Tizen-remote ergonomics. The Retry button is `:focus-visible` ready
//      with a thick accent halo, accepts Enter/Space, and lives at the top
//      of the focus order inside the pane. If a `secondary` action is
//      provided (e.g., "Switch profile"), it gets its own focusable button
//      that follows Retry in tab/arrow order.
//
//   2. Mom-mode awareness. When the active profile inflates --font-scale
//      to 1.4+ (Sherri's preset), the title becomes a heading-sized type
//      ramp and the buttons gain padding so they read from 8-10 ft. This
//      matches MEMORY.md's "Mom's TV is never system-limited" rule —
//      Mom-mode UI should always feel one notch larger.
//
// Constraints:
//   • Tizen 6.5 / Chrome 76 safe (no `?.`, no `??`, no class fields).
//   • No new deps — only React + the existing accent CSS vars from
//     index.css (`--accent`, `--accent-hover`, `--surface`, etc).
//   • Pure component — owns no state beyond a focus-on-mount effect.
// ─────────────────────────────────────────────────────────────────────────────

function readFontScale() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 1.0;
  }
  try {
    var raw = window.getComputedStyle(document.documentElement)
      .getPropertyValue('--font-scale');
    var n = parseFloat(raw);
    if (isNaN(n) || n <= 0) { return 1.0; }
    return n;
  } catch (e) {
    return 1.0;
  }
}

// Tizen remote handler: Enter (key 13) and Spacebar (key 32) both fire the
// action. The TV remote sends the same keycodes Chrome 76 does, so a single
// `onKeyDown` covers desktop, web preview, and the device.
function makeKeyHandler(action) {
  return function (e) {
    if (!action) { return; }
    if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
      e.preventDefault();
      action();
    }
  };
}

function ErrorState(props) {
  var title = props.title || 'Something went wrong';
  var message = props.message || '';
  var onRetry = props.onRetry;
  var secondary = props.secondary; // { label, onClick }
  var className = props.className || '';
  var inlineStyle = props.style || {};

  var stateTuple = React.useState(function () { return readFontScale(); });
  var fontScale = stateTuple[0];
  var setFontScale = stateTuple[1];

  React.useEffect(function () {
    var next = readFontScale();
    if (next !== fontScale) { setFontScale(next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  var momMode = fontScale >= 1.4;

  // Auto-focus the primary action when the error first mounts so remote
  // users can press Enter immediately without having to D-pad into the
  // pane. Only auto-focuses if onRetry exists (otherwise nothing to focus).
  var retryRef = React.useRef(null);
  React.useEffect(function () {
    if (onRetry && retryRef.current && typeof retryRef.current.focus === 'function') {
      try { retryRef.current.focus(); } catch (e) { /* ignore */ }
    }
  }, [onRetry]);

  var titleFontSize = momMode ? '1.85rem' : '1.4rem';
  var messageFontSize = momMode ? '1.15rem' : '0.95rem';
  var buttonFontSize = momMode ? '1.1rem' : '0.95rem';
  var buttonPadding = momMode ? '0.85rem 1.6rem' : '0.6rem 1.2rem';
  var iconSize = momMode ? '3.2rem' : '2.4rem';

  var wrapperClass = ['hermes-error-state', className].filter(Boolean).join(' ');

  return (
    <div
      role="alert"
      aria-live="polite"
      className={wrapperClass}
      data-mom-mode={momMode ? 'true' : 'false'}
      style={Object.assign({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: momMode ? '1.1rem' : '0.85rem',
        padding: momMode ? '2.5rem 1.5rem' : '2rem 1.25rem',
        textAlign: 'center',
        color: 'var(--text, #e6edf3)',
        background: 'var(--surface, rgba(22,27,34,0.6))',
        borderRadius: '12px',
        border: '1px solid var(--border, #30363d)',
      }, inlineStyle)}
    >
      <div
        aria-hidden="true"
        style={{
          fontSize: iconSize,
          lineHeight: 1,
          filter: 'grayscale(0.2)',
        }}
      >
        {'⚠️' /* ⚠️ — keep escaped to avoid source-file emoji */}
      </div>
      <h3
        style={{
          margin: 0,
          fontSize: titleFontSize,
          fontWeight: 600,
          color: 'var(--text, #e6edf3)',
        }}
      >
        {title}
      </h3>
      {message ? (
        <p
          style={{
            margin: 0,
            fontSize: messageFontSize,
            color: 'var(--text-muted, #8b949e)',
            maxWidth: '48ch',
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
      ) : null}
      {(onRetry || secondary) ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: momMode ? '0.85rem' : '0.6rem',
            marginTop: momMode ? '0.4rem' : '0.2rem',
          }}
        >
          {onRetry ? (
            <button
              ref={retryRef}
              type="button"
              className="hermes-focusable"
              onClick={onRetry}
              onKeyDown={makeKeyHandler(onRetry)}
              style={{
                fontSize: buttonFontSize,
                padding: buttonPadding,
                background: 'var(--accent, #1f6feb)',
                color: '#ffffff',
                border: '2px solid transparent',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: momMode ? '180px' : '140px',
              }}
            >
              Retry
            </button>
          ) : null}
          {secondary ? (
            <button
              type="button"
              className="hermes-focusable"
              onClick={secondary.onClick}
              onKeyDown={makeKeyHandler(secondary.onClick)}
              style={{
                fontSize: buttonFontSize,
                padding: buttonPadding,
                background: 'transparent',
                color: 'var(--text, #e6edf3)',
                border: '2px solid var(--border, #30363d)',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                minWidth: momMode ? '180px' : '140px',
              }}
            >
              {secondary.label || 'Cancel'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export { ErrorState };
export default ErrorState;
