import React from 'react';

// MultiviewLayoutPicker — small toolbar that lets the user swap the
// active Multiview tile arrangement on the fly. Mirrors the layout
// chooser pattern from IPTV Player Zero's Multiview PiP layer.
//
// Layouts:
//   "1+1" — two equal panels side-by-side (lightest GPU load)
//   "1+2" — one large + two small (balanced)
//   "1+3" — one large + three small (premium-tier feel)
//   "2x2" — equal 2×2 grid (heaviest GPU load — enhanced tier only)
//
// Tier policy (see project_tier_policy_change.md):
//   - degraded (un-class TV) — 2x2 hidden; user can pick "1+1" or "1+2".
//   - enhanced (QN-class) — all four layouts available.
// This is a hard cap so a degraded TV can never accidentally render
// four HLS decoders at once and stutter the entire shell.
//
// Tizen 6.5 / Chrome 76 safe — no destructuring, no arrow funcs.

var LAYOUT_DEFS = [
  {
    id: '1+1',
    label: 'Two side-by-side',
    icon: '|⬜|⬜|',
    description: 'Two equal panels',
  },
  {
    id: '1+2',
    label: 'One large + two small',
    icon: '⬛|⬜⬜',
    description: 'Focus + two thumbs',
  },
  {
    id: '1+3',
    label: 'One large + three small',
    icon: '⬛|⬜⬜⬜',
    description: 'Focus + three thumbs',
  },
  {
    id: '2x2',
    label: 'Two by two grid',
    icon: '⬜⬜/⬜⬜',
    description: '2×2 grid (enhanced)',
    enhancedOnly: true,
  },
];

function MultiviewLayoutPicker(props) {
  var activeLayout = props.activeLayout;
  var onLayoutChange = props.onLayoutChange;
  var tier = props.tier || 'enhanced';

  function renderButton(def) {
    if (def.enhancedOnly && tier === 'degraded') {
      // Hard-hide on degraded TVs. The 2×2 case would force four HLS
      // pipelines into the QN85 GPU budget at once which has been
      // documented as a stutter risk on un-class panels.
      return null;
    }

    var isActive = activeLayout === def.id;

    var baseStyle = {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.2rem',
      padding: '0.45rem 0.7rem',
      minWidth: '64px',
      border: '1px solid ' + (isActive ? 'transparent' : 'var(--border, #30363d)'),
      borderRadius: 'var(--radius-md, 12px)',
      background: isActive
        ? 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))'
        : 'transparent',
      color: isActive ? '#ffffff' : 'var(--text, #e6edf3)',
      cursor: 'pointer',
      outline: 'none',
      fontSize: 'calc(0.7rem * var(--font-scale, 1))',
      fontWeight: isActive ? '700' : '600',
      letterSpacing: '0.02em',
      transition: 'transform 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), box-shadow 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1)), background 180ms var(--ease-out, cubic-bezier(0.16,1,0.3,1))',
      boxShadow: isActive ? 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))' : 'none',
    };

    return (
      <button
        key={def.id}
        type="button"
        tabIndex={0}
        aria-pressed={isActive}
        aria-label={'Switch to ' + def.label + ' layout'}
        title={def.label}
        onClick={function() {
          if (onLayoutChange) { onLayoutChange(def.id); }
        }}
        onKeyDown={function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onLayoutChange) { onLayoutChange(def.id); }
          }
        }}
        onFocus={function(e) {
          e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px var(--accent, #00d4ff))';
        }}
        onBlur={function(e) {
          e.currentTarget.style.boxShadow = isActive ? 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))' : 'none';
        }}
        style={baseStyle}
      >
        <span
          aria-hidden="true"
          style={{
            fontSize: 'calc(0.95rem * var(--font-scale, 1))',
            lineHeight: 1,
            fontFamily: 'monospace',
            letterSpacing: '-0.05em',
          }}
        >
          {/* Inline glyph mini-diagram. Kept inline so we don't pull
              an icon library — Tizen prefers self-contained shells. */}
          <MultiviewLayoutGlyph variant={def.id} active={isActive} />
        </span>
        <span style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', opacity: 0.92 }}>
          {def.id}
        </span>
      </button>
    );
  }

  return (
    <div
      role="toolbar"
      aria-label="Multiview layout picker"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--surface-raised, #1c2128)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: 'var(--radius-md, 12px)',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontSize: 'calc(0.7rem * var(--font-scale, 1))',
          fontWeight: '700',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--muted, #8b949e)',
          marginRight: '0.25rem',
        }}
      >
        Layout
      </span>
      {LAYOUT_DEFS.map(renderButton)}
    </div>
  );
}

// MultiviewLayoutGlyph — small inline SVG diagrams so the picker is
// self-contained (no icon library, no unicode misrendering on Tizen).
function MultiviewLayoutGlyph(props) {
  var variant = props.variant;
  var active = props.active;
  var stroke = active ? '#ffffff' : 'var(--text, #e6edf3)';
  var fill = active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';

  var rects = [];
  if (variant === '1+1') {
    rects = [
      { x: 1, y: 1, w: 12, h: 16 },
      { x: 15, y: 1, w: 12, h: 16 },
    ];
  } else if (variant === '1+2') {
    rects = [
      { x: 1, y: 1, w: 16, h: 16 },
      { x: 19, y: 1, w: 8, h: 7 },
      { x: 19, y: 10, w: 8, h: 7 },
    ];
  } else if (variant === '1+3') {
    rects = [
      { x: 1, y: 1, w: 14, h: 16 },
      { x: 17, y: 1, w: 10, h: 4.5 },
      { x: 17, y: 6.75, w: 10, h: 4.5 },
      { x: 17, y: 12.5, w: 10, h: 4.5 },
    ];
  } else if (variant === '2x2') {
    rects = [
      { x: 1, y: 1, w: 12, h: 7.5 },
      { x: 15, y: 1, w: 12, h: 7.5 },
      { x: 1, y: 9.5, w: 12, h: 7.5 },
      { x: 15, y: 9.5, w: 12, h: 7.5 },
    ];
  }

  return (
    <svg
      width="28"
      height="18"
      viewBox="0 0 28 18"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {rects.map(function(r, i) {
        return (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            rx="1.5"
            ry="1.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}

export default MultiviewLayoutPicker;
export { LAYOUT_DEFS };
