import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState — shared "nothing-here-yet" pane.
//
// Used when a query, filter, or list legitimately returns zero items
// (search with no matches, fresh continue-watching rail, an unconfigured
// recordings library, etc). This is NOT for error conditions — pair this
// with ErrorState when the call actually failed.
//
// Why a dedicated component:
//   • The shells (Zero, Stremio, Plex, TiviMate, LiveTV) all hand-rolled
//     their own "No results" copy with slightly different padding, font
//     sizes, and icon choices. Centralising here keeps them aligned with
//     Mom-mode font scaling and the design-token spacing scale.
//   • The CTA, when present, must be remote-focusable on Tizen so the
//     user can press Enter from the couch.
//
// Tizen 6.5 / Chrome 76 safe — no `?.`, no `??`, no class fields.
// No new deps; reads `--font-scale`, `--accent`, `--surface` from index.css.
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

function makeKeyHandler(action) {
  return function (e) {
    if (!action) { return; }
    if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
      e.preventDefault();
      action();
    }
  };
}

function EmptyState(props) {
  var icon = (typeof props.icon !== 'undefined' && props.icon !== null)
    ? props.icon
    : '📭'; // 📭 mailbox — neutral "nothing inside" glyph
  var title = props.title || 'Nothing here yet';
  var message = props.message || '';
  var cta = props.cta; // { label, onClick }
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

  var titleFontSize = momMode ? '1.7rem' : '1.3rem';
  var messageFontSize = momMode ? '1.1rem' : '0.95rem';
  var buttonFontSize = momMode ? '1.1rem' : '0.95rem';
  var buttonPadding = momMode ? '0.85rem 1.6rem' : '0.55rem 1.15rem';
  var iconSize = momMode ? '3.8rem' : '2.8rem';

  var wrapperClass = ['hermes-empty-state', className].filter(Boolean).join(' ');

  // Render the icon as text if it's a string/number (emoji glyph), else as
  // a node (React component, SVG element, etc). Avoids `?.` on the node.
  var iconNode;
  if (typeof icon === 'string' || typeof icon === 'number') {
    iconNode = (
      <div
        aria-hidden="true"
        style={{ fontSize: iconSize, lineHeight: 1 }}
      >
        {icon}
      </div>
    );
  } else {
    iconNode = (
      <div aria-hidden="true" style={{ fontSize: iconSize, lineHeight: 1 }}>
        {icon}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={wrapperClass}
      data-mom-mode={momMode ? 'true' : 'false'}
      style={Object.assign({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: momMode ? '1rem' : '0.75rem',
        padding: momMode ? '2.5rem 1.5rem' : '2rem 1.25rem',
        textAlign: 'center',
        color: 'var(--text, #e6edf3)',
        background: 'var(--surface, transparent)',
        borderRadius: '12px',
      }, inlineStyle)}
    >
      {iconNode}
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
      {cta ? (
        <button
          type="button"
          className="hermes-focusable"
          onClick={cta.onClick}
          onKeyDown={makeKeyHandler(cta.onClick)}
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
            marginTop: momMode ? '0.4rem' : '0.2rem',
            minWidth: momMode ? '200px' : '160px',
          }}
        >
          {cta.label || 'Get started'}
        </button>
      ) : null}
    </div>
  );
}

export { EmptyState };
export default EmptyState;
