import React from 'react';

var BITRATE_DOT_COLORS = {
  low: '#8b949e',
  medium: '#e3b341',
  high: '#3fb950',
  ultra: '#79c0ff',
};

function QualityBadge(props) {
  var quality = props.quality || {};
  var resolution = quality.resolution || '?';
  var codec = quality.codec || '';
  var bitrateBucket = quality.bitrate_bucket || 'low';

  var dotColor = BITRATE_DOT_COLORS[bitrateBucket] || BITRATE_DOT_COLORS.low;

  return (
    <div
      className="quality-badge-wrap"
      tabIndex={0}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        backgroundColor: 'rgba(0,0,0,0.5)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '4px',
        padding: '0.2rem 0.5rem',
        outline: 'none',
      }}
      onFocus={function(e) {
        e.currentTarget.style.outline = '2px solid var(--accent)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={function(e) {
        e.currentTarget.style.outline = 'none';
      }}
    >
      {/* Bitrate bucket dot */}
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          display: 'inline-block',
          flexShrink: 0,
        }}
        title={bitrateBucket + ' bitrate'}
      />

      {/* Resolution — always visible */}
      <span
        style={{
          fontSize: 'calc(0.75rem * var(--font-scale, 1))',
          fontWeight: '700',
          color: 'var(--text)',
          letterSpacing: '0.03em',
        }}
      >
        {resolution}
      </span>

      {/* Codec — only shown when badge has focus (via CSS .codec-label) */}
      {codec && (
        <span
          className="codec-label"
          style={{
            fontSize: 'calc(0.65rem * var(--font-scale, 1))',
            color: 'var(--muted)',
            letterSpacing: '0.02em',
            marginLeft: '0.2rem',
          }}
        >
          {codec}
        </span>
      )}
    </div>
  );
}

export default QualityBadge;
