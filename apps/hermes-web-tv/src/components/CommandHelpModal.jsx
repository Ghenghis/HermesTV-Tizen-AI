import React from 'react';

var COMMAND_GROUPS = [
  {
    category: 'Filter Content',
    commands: [
      { text: 'show movies', desc: 'Show only movies' },
      { text: 'show series', desc: 'Show only TV series' },
      { text: 'show live', desc: 'Show live channels' },
      { text: 'show 4K', desc: 'Filter to 4K titles only' },
    ],
  },
  {
    category: 'Filter Provider',
    commands: [
      { text: 'show apollo', desc: 'Apollo Group content only' },
      { text: 'show xtremehd', desc: 'XtremeHD content only' },
      { text: 'show all providers', desc: 'Show all providers' },
    ],
  },
  {
    category: 'Profile & Mode',
    commands: [
      { text: 'mom mode', desc: 'Switch to Sherri\'s profile' },
      { text: 'dave mode', desc: 'Switch to Dave\'s profile' },
    ],
  },
  {
    category: 'Theme & Layout',
    commands: [
      { text: 'dark theme', desc: 'Apply Night Blue dark theme' },
      { text: 'light theme', desc: 'Apply Mom Calm light theme' },
      { text: 'premium theme', desc: 'Apply Cinema Amber theme' },
      { text: 'bigger tiles', desc: 'Switch to large tile layout' },
    ],
  },
  {
    category: 'Performance',
    commands: [
      { text: 'low memory mode', desc: 'Reduce animations for low-end TVs' },
    ],
  },
];

function CommandHelpModal(props) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;

  React.useEffect(function() {
    if (!isOpen) { return; }
    function handleKey(e) {
      if (e.key === 'Escape') { onClose(); }
    }
    document.addEventListener('keydown', handleKey);
    return function() { document.removeEventListener('keydown', handleKey); };
  }, [isOpen, onClose]);

  if (!isOpen) { return null; }

  return (
    <div
      onClick={function(e) { if (e.target === e.currentTarget) { onClose(); } }}
      style={{
        position: 'fixed',
        top: 0, left: 0, width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.7)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '12px',
          padding: '1.5rem',
          maxWidth: '480px',
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          color: 'var(--text)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <span style={{ fontWeight: '700', fontSize: 'calc(1rem * var(--font-scale, 1))' }}>
            Available Commands
          </span>
          <button
            autoFocus
            tabIndex={0}
            onClick={onClose}
            aria-label="Close help"
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.25rem', cursor: 'pointer', outline: 'none' }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
          >&times;</button>
        </div>

        {/* Command groups */}
        {COMMAND_GROUPS.map(function(group) {
          return (
            <div key={group.category} style={{ marginBottom: '1rem' }}>
              <div style={{
                fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--accent)',
                marginBottom: '0.4rem',
              }}>
                {group.category}
              </div>
              {group.commands.map(function(cmd) {
                return (
                  <div key={cmd.text} style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '0.75rem',
                    padding: '0.2rem 0',
                    borderBottom: '1px solid var(--border, #30363d)',
                  }}>
                    <code style={{
                      fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                      color: 'var(--accent)',
                      backgroundColor: 'rgba(31,111,235,0.1)',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                      flexShrink: 0,
                    }}>{cmd.text}</code>
                    <span style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: 'var(--muted)' }}>{cmd.desc}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CommandHelpModal;
