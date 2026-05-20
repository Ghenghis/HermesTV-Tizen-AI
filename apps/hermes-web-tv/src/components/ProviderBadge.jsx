import React from 'react';

// W16-PROVIDERS — provider tint palette covers every catalog provider we
// emit, not just the original apollo/xtremehd seed pair. Each entry has a
// short label (3-4 chars, fits the corner chip), an accent colour for the
// border, and a translucent background. New providers added here propagate
// to both the inline row badge AND the corner badge mode.
//
// Aliases: 'apollo' (legacy seed tag) ↔ 'apollo_group' (canonical
//           provider_id) and 'iptv-org' (hyphen) ↔ 'iptv_org' (underscore)
//           — both spellings resolve to the same chip so the badge survives
//           the hyphen/underscore drift between catalog feed and store.
var PROVIDER_CONFIG = {
  apollo:       { label: 'APL', color: '#1f6feb', bg: 'rgba(31,111,235,0.18)'  },
  apollo_group: { label: 'APL', color: '#1f6feb', bg: 'rgba(31,111,235,0.18)'  },
  xtremehd:     { label: 'XHD', color: '#3fb950', bg: 'rgba(63,185,80,0.18)'   },
  'iptv-org':   { label: 'ORG', color: '#e3b341', bg: 'rgba(227,179,65,0.18)'  },
  iptv_org:     { label: 'ORG', color: '#e3b341', bg: 'rgba(227,179,65,0.18)'  },
  xtream:       { label: 'XTR', color: '#a78bfa', bg: 'rgba(167,139,250,0.18)' },
  jellyfin:     { label: 'JLY', color: '#00d4ff', bg: 'rgba(0,212,255,0.18)'   },
};

function _resolve(tag) {
  if (!tag) { return null; }
  return PROVIDER_CONFIG[tag] || null;
}

function ProviderBadge(props) {
  var providerTags = props.providerTags || [];
  // W16-PROVIDERS — corner mode renders a smaller, semi-translucent chip
  // designed to sit in the bottom-right of the poster slot. The legacy
  // inline mode (the default) still renders the row of pill badges under
  // the card body, used by the catalog card bottom row.
  var corner = !!props.corner;

  if (!providerTags.length) {
    return null;
  }

  if (corner) {
    // Dedupe + cap at 2 tags so a 3-provider item doesn't crowd the corner.
    var seen = {};
    var picked = [];
    for (var i = 0; i < providerTags.length; i++) {
      var t = providerTags[i];
      var cfg = _resolve(t);
      if (!cfg) { continue; }
      // Group apollo + apollo_group under one chip.
      var dedupeKey = cfg.label;
      if (seen[dedupeKey]) { continue; }
      seen[dedupeKey] = true;
      picked.push({ tag: t, cfg: cfg });
      if (picked.length >= 2) { break; }
    }
    if (!picked.length) { return null; }
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: '6px',
          bottom: '6px',
          display: 'inline-flex',
          gap: '0.25rem',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          maxWidth: '70%',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        {picked.map(function(p) {
          return (
            <span
              key={p.tag}
              style={{
                display: 'inline-block',
                padding: '0.05rem 0.35rem',
                borderRadius: '3px',
                backgroundColor: 'rgba(0,0,0,0.55)',
                border: '1px solid ' + p.cfg.color,
                color: p.cfg.color,
                fontSize: 'calc(0.6rem * var(--font-scale, 1))',
                fontWeight: '800',
                letterSpacing: '0.06em',
                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                lineHeight: 1.25,
              }}
            >
              {p.cfg.label}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', gap: '0.3rem', flexWrap: 'wrap' }}>
      {providerTags.map(function(tag) {
        var config = _resolve(tag);
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
