// settingsStyles.js — small helper pack shared by the deep-settings
// section components (Network, Playback, Parental, Backup, Diagnostics).
//
// Re-uses the design tokens so radii, easings, and focus rings stay
// consistent with the rest of the Settings modal. Pure JS — no JSX,
// no React. Tizen 6.5 / Chrome 76 safe.

import { RADII, EASE, DURATION } from '../../design/tokens.js';

export var CARD_STYLE = {
  background: 'var(--surface-raised, #1c2128)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: RADII.md + 'px',
  padding: '1rem 1.1rem',
  marginBottom: '0.85rem',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
};

export var CARD_HEADER_STYLE = {
  fontWeight: 800,
  fontSize: 'calc(0.95rem * var(--font-scale, 1))',
  marginBottom: '0.4rem',
  color: 'var(--text, #e6edf3)',
};

export var CARD_TAGLINE_STYLE = {
  fontSize: 'calc(0.78rem * var(--font-scale, 1))',
  color: 'var(--muted)',
  marginBottom: '0.7rem',
};

export var LABEL_STYLE = {
  display: 'block',
  fontSize: 'calc(0.78rem * var(--font-scale, 1))',
  color: 'var(--muted)',
  marginBottom: '0.25rem',
  fontWeight: 600,
};

export var INPUT_STYLE = {
  width: '100%',
  padding: '0.5rem 0.7rem',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border, #30363d)',
  borderRadius: RADII.sm + 'px',
  color: 'var(--text, #e6edf3)',
  fontSize: 'calc(0.85rem * var(--font-scale, 1))',
  outline: 'none',
  transition: 'border-color ' + DURATION.fast + 'ms ' + EASE.out + ', box-shadow ' + DURATION.fast + 'ms ' + EASE.out,
  // Tizen-safe — boxSizing default in modern Chromes is content-box.
  boxSizing: 'border-box',
};

export var SELECT_STYLE = Object.assign({}, INPUT_STYLE, {
  // Native <select> inherits the same look. The dropdown chrome itself
  // is OS-painted on Tizen and can't be fully restyled, which is fine.
  appearance: 'none',
  // Caret-down chevron via inline SVG background so the field looks
  // styled even though the popup is OS-native.
  background: 'rgba(255,255,255,0.04) url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'><path fill=\'%23e6edf3\' d=\'M0 0l5 6 5-6z\'/></svg>") no-repeat right 0.7rem center',
  paddingRight: '2rem',
});

export var BUTTON_STYLE = function(variant) {
  var filled = variant === 'filled';
  var danger = variant === 'danger';
  var bg;
  var color;
  var border;
  if (filled) {
    bg = 'linear-gradient(135deg, var(--accent, #00d4ff), #6366f1)';
    color = '#0a1628';
    border = 'none';
  } else if (danger) {
    bg = 'linear-gradient(135deg, #ef4444, #b91c1c)';
    color = '#ffffff';
    border = 'none';
  } else {
    bg = 'transparent';
    color = 'var(--text, #e6edf3)';
    border = '1px solid var(--border, #30363d)';
  }
  return {
    padding: '0.55rem 1.05rem',
    background: bg,
    border: border,
    borderRadius: filled || danger ? '999px' : RADII.sm + 'px',
    color: color,
    fontSize: 'calc(0.82rem * var(--font-scale, 1))',
    fontWeight: 700,
    cursor: 'pointer',
    outline: 'none',
    boxShadow: filled ? '0 6px 18px rgba(0,212,255,0.28)' : (danger ? '0 6px 18px rgba(239,68,68,0.32)' : 'none'),
    transition: 'transform ' + DURATION.fast + 'ms ' + EASE.out + ', background-color ' + DURATION.fast + 'ms ' + EASE.out,
  };
};

export function focusHandler(e) {
  e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent, #00d4ff)';
  e.currentTarget.style.outline = 'none';
}
export function blurHandler(e) {
  e.currentTarget.style.boxShadow = 'none';
}

export var ROW_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0.45rem 0',
  borderTop: '1px solid var(--border, #30363d)',
  gap: '0.75rem',
};

export var WARNING_BOX = {
  padding: '0.55rem 0.75rem',
  marginTop: '0.5rem',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.4)',
  borderRadius: RADII.sm + 'px',
  color: '#fca5a5',
  fontSize: 'calc(0.75rem * var(--font-scale, 1))',
  lineHeight: 1.45,
};

export var SUCCESS_BOX = {
  padding: '0.55rem 0.75rem',
  marginTop: '0.5rem',
  background: 'rgba(34,197,94,0.08)',
  border: '1px solid rgba(34,197,94,0.4)',
  borderRadius: RADII.sm + 'px',
  color: '#86efac',
  fontSize: 'calc(0.75rem * var(--font-scale, 1))',
  lineHeight: 1.45,
};

// Reusable toggle switch (matches the one inside SettingsPanelTabbed's _Card).
export function ToggleSwitch(props) {
  var on = !!props.checked;
  var ariaLabel = props.ariaLabel || 'Toggle';
  var disabled = !!props.disabled;
  var onChange = props.onChange;
  return {
    on: on,
    ariaLabel: ariaLabel,
    disabled: disabled,
    onChange: onChange,
  };
}
