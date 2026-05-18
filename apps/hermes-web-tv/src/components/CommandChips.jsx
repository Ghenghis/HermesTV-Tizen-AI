import React from 'react';

var CHIPS = [
  { label: 'Show Movies', command: 'show movies' },
  { label: 'Show Live', command: 'show live' },
  { label: 'Show 4K', command: 'show 4K' },
  { label: 'Mom Mode', command: 'mom mode' },
  { label: 'Dark Theme', command: 'dark theme' },
  { label: 'Light Theme', command: 'light theme' },
  { label: 'Show All', command: 'show all providers' },
  { label: 'Show Series', command: 'show series' },
];

function CommandChips(props) {
  var onSend = props.onSend;

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.4rem',
        overflowX: 'auto',
        padding: '0.5rem 1rem',
        borderTop: '1px solid var(--border, #30363d)',
        flexShrink: 0,
        scrollbarWidth: 'none',
      }}
      aria-label="Quick commands"
    >
      {CHIPS.map(function(chip) {
        return (
          <button
            key={chip.command}
            tabIndex={0}
            onClick={function() { if (onSend) { onSend(chip.command); } }}
            style={{
              flexShrink: 0,
              padding: '0.25rem 0.65rem',
              fontSize: 'calc(0.7rem * var(--font-scale, 1))',
              fontWeight: '600',
              backgroundColor: 'transparent',
              border: '1px solid var(--accent)',
              borderRadius: '12px',
              color: 'var(--accent)',
              cursor: 'pointer',
              outline: 'none',
              whiteSpace: 'nowrap',
              transition: 'background-color 0.1s',
            }}
            onFocus={function(e) {
              e.currentTarget.style.outline = '2px solid var(--accent)';
              e.currentTarget.style.outlineOffset = '2px';
            }}
            onBlur={function(e) {
              e.currentTarget.style.outline = 'none';
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
