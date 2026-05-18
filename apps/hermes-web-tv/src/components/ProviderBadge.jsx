import React from 'react';

var PROVIDER_CONFIG = {
  apollo: { label: 'APL', color: '#1f6feb', bg: 'rgba(31,111,235,0.15)' },
  xtremehd: { label: 'XHD', color: '#3fb950', bg: 'rgba(63,185,80,0.15)' },
};

function ProviderBadge(props) {
  var providerTags = props.providerTags || [];

  if (!providerTags.length) {
    return null;
  }

  return (
    <div style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap' }}>
      {providerTags.map(function(tag) {
        var config = PROVIDER_CONFIG[tag];
        if (!config) { return null; }
        return (
          <span
            key={tag}
            style={{
              display: 'inline-block',
              padding: '0.15rem 0.45rem',
              borderRadius: '3px',
              backgroundColor: config.bg,
              border: '1px solid ' + config.color,
              color: config.color,
              fontSize: 'calc(0.65rem * var(--font-scale, 1))',
              fontWeight: '700',
              letterSpacing: '0.05em',
            }}
          >
            {config.label}
          </span>
        );
      })}
    </div>
  );
}

export default ProviderBadge;
