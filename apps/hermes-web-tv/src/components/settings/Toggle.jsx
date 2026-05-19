import React from 'react';

// Toggle — accessible switch styled to match the rest of the Settings
// modal. Tizen 6.5 / Chrome 76 safe; uses role=switch + aria-checked
// so screen readers and the TV remote's accessibility layer agree on
// the on/off state.
//
// Props:
//   checked   boolean
//   onChange  fn(nextChecked: boolean)
//   ariaLabel string
//   disabled  boolean
function Toggle(props) {
  var on = !!props.checked;
  var disabled = !!props.disabled;
  var ariaLabel = props.ariaLabel || 'Toggle';
  function flip(e) {
    if (disabled) { return; }
    if (e && e.preventDefault) { e.preventDefault(); }
    if (typeof props.onChange === 'function') { props.onChange(!on); }
  }
  return (
    <button
      tabIndex={0}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={flip}
      onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { flip(e); } }}
      onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)'; }}
      onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
      style={{
        width: '44px', height: '24px',
        borderRadius: '999px',
        background: on ? 'var(--accent, #00d4ff)' : 'var(--border, #30363d)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        position: 'relative',
        transition: 'background 120ms ease',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '2px',
          left: on ? '22px' : '2px',
          width: '20px', height: '20px',
          borderRadius: '50%',
          background: '#ffffff',
          transition: 'left 120ms ease',
        }}
      />
    </button>
  );
}

export default Toggle;
