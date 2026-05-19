import React from 'react';

// Suggestions chip bar rendered above the chatbot input. Four curated
// example commands cover the most common UX paths (content filter, quality
// filter, profile switch, theme switch). Clicking a chip inserts the text
// and submits via the parent's onSend handler. Full command list still
// reachable through the ? Help modal.
var SUGGESTIONS = [
  { label: 'Show Movies', command: 'show movies' },
  { label: 'Show 4K', command: 'show 4K' },
  { label: 'Mom Mode', command: 'mom mode' },
  { label: 'Dark Theme', command: 'dark theme' },
];

function CommandChips(props) {
  var onSend = props.onSend;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        overflowX: 'auto',
        padding: '0.4rem 1rem 0.45rem 1rem',
        borderTop: '1px solid var(--border, #30363d)',
        flexShrink: 0,
        scrollbarWidth: 'none',
      }}
      aria-label="Suggestions"
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: 'calc(0.65rem * var(--font-scale, 1))',
          fontWeight: '700',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginRight: '0.15rem',
        }}
      >
        Suggestions
      </span>
      {SUGGESTIONS.map(function(chip) {
        return (
          <button
            key={chip.command}
            tabIndex={0}
            onClick={function() { if (onSend) { onSend(chip.command); } }}
            aria-label={'Send: ' + chip.label}
            style={{
              flexShrink: 0,
              padding: '0.35rem 0.85rem',
              fontSize: 'calc(0.72rem * var(--font-scale, 1))',
              fontWeight: '700',
              background: 'transparent',
              border: '1px solid var(--accent)',
              borderRadius: '999px',
              color: 'var(--accent)',
              cursor: 'pointer',
              outline: 'none',
              whiteSpace: 'nowrap',
              transition: 'background-color 160ms ease, transform 160ms cubic-bezier(0.16,1,0.3,1), color 160ms ease',
              willChange: 'transform',
            }}
            onMouseEnter={function(e) {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.color = '#0a1628';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={function(e) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--accent)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
            onFocus={function(e) {
              e.currentTarget.style.outline = '2px solid var(--accent)';
              e.currentTarget.style.outlineOffset = '2px';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onBlur={function(e) {
              e.currentTarget.style.outline = 'none';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

export default CommandChips;
