import React from 'react';
import QualityBadge from './QualityBadge.jsx';
import ProviderBadge from './ProviderBadge.jsx';

var CONTENT_TYPE_LABELS = {
  live: 'LIVE',
  movie: 'MOVIE',
  series: 'SERIES',
};

var CONTENT_TYPE_COLORS = {
  live: '#f85149',
  movie: '#d2a8ff',
  series: '#79c0ff',
};

function CatalogCard(props) {
  var item = props.item || {};
  var profile = props.profile || {};

  var title = item.title || 'Untitled';
  var contentType = item.content_type || 'live';
  var quality = item.quality || {};
  var providerTags = item.provider_tags || [];
  var epg = item.epg || {};
  var catchUpAvailable = item.catch_up_available || false;

  var typeLabel = CONTENT_TYPE_LABELS[contentType] || contentType.toUpperCase();
  var typeColor = CONTENT_TYPE_COLORS[contentType] || 'var(--muted)';

  var isJumbo = profile.active_layout === 'jumbo-rail';
  var cardHeight = isJumbo ? '180px' : '140px';

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Future: trigger playback / detail view
    }
  }

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={title + ', ' + typeLabel}
      onKeyDown={handleKeyDown}
      style={{
        backgroundColor: 'var(--surface)',
        border: '2px solid var(--border, #30363d)',
        borderRadius: '8px',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        cursor: 'pointer',
        outline: 'none',
        minHeight: cardHeight,
        transition: 'border-color 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onFocus={function(e) {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.outline = '2px solid var(--accent)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={function(e) {
        e.currentTarget.style.borderColor = 'var(--border, #30363d)';
        e.currentTarget.style.outline = 'none';
      }}
    >
      {/* Top row: type badge + catch-up badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 'calc(0.65rem * var(--font-scale, 1))',
            fontWeight: '800',
            color: typeColor,
            letterSpacing: '0.08em',
            border: '1px solid ' + typeColor,
            borderRadius: '3px',
            padding: '0.1rem 0.4rem',
            backgroundColor: typeColor + '22',
          }}
        >
          {typeLabel}
        </span>

        {catchUpAvailable && (
          <span
            style={{
              fontSize: 'calc(0.6rem * var(--font-scale, 1))',
              fontWeight: '700',
              color: '#e3b341',
              letterSpacing: '0.05em',
              border: '1px solid #e3b341',
              borderRadius: '3px',
              padding: '0.1rem 0.35rem',
              backgroundColor: 'rgba(227,179,65,0.1)',
            }}
          >
            CATCH-UP
          </span>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 'calc(1rem * var(--font-scale, 1))',
          fontWeight: '600',
          color: 'var(--text)',
          lineHeight: '1.3',
          flex: 1,
          // clamp to 2 lines
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}
      >
        {title}
      </div>

      {/* EPG next program */}
      {epg.next_program && (
        <div
          style={{
            fontSize: 'calc(0.8rem * var(--font-scale, 1))',
            color: 'var(--muted)',
            fontStyle: 'italic',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Up next: {epg.next_program}
        </div>
      )}

      {/* Bottom row: quality + provider badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <QualityBadge quality={quality} />
        <ProviderBadge providerTags={providerTags} />
      </div>
    </div>
  );
}

export default CatalogCard;
