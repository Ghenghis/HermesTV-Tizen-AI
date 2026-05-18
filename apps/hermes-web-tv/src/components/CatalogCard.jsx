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
  var tier = props.tier || 'degraded';

  var title = item.title || 'Untitled';
  var contentType = item.content_type || item.type || 'live';
  var quality = item.quality || item.metadata || {};
  var providerTags = item.provider_tags || (item.provider ? [item.provider] : []);
  var epg = item.epg || {};
  var catchUpAvailable = item.catch_up_available || quality.has_catchup || false;

  var typeLabel = CONTENT_TYPE_LABELS[contentType] || contentType.toUpperCase();
  var typeColor = CONTENT_TYPE_COLORS[contentType] || 'var(--muted)';

  var isJumbo = profile.active_layout === 'jumbo-rail';
  var cardHeight = isJumbo ? '180px' : '140px';

  var isEnhanced = tier === 'enhanced';

  // Resolution checks
  var resolution = quality.resolution || '';
  var is4K = resolution === '4K' || resolution === '2160p';
  var hdrFormat = quality.hdr_format || null;
  var bitrate = quality.bitrate_kbps || null;
  var codec = quality.codec || null;

  // Poster image: enhanced uses full res, degraded uses thumbnail
  var posterUrl = isEnhanced
    ? (item.poster_url || item.logo_url || null)
    : (item.thumbnail_url || item.logo_url || null);

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Future: trigger playback / detail view
    }
  }

  // CSS class list for card
  var cardClasses = ['catalog-card'];
  if (isEnhanced) {
    cardClasses.push('card--enhanced-focus');
  }

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={title + ', ' + typeLabel}
      className={cardClasses.join(' ')}
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
        transition: isEnhanced ? 'border-color 0.15s' : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
      onFocus={function(e) {
        e.currentTarget.classList.add('focus-active');
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.outline = '2px solid var(--accent)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={function(e) {
        e.currentTarget.classList.remove('focus-active');
        e.currentTarget.style.borderColor = 'var(--border, #30363d)';
        e.currentTarget.style.outline = 'none';
      }}
    >
      {/* Poster image (enhanced: full res; degraded: thumbnail/logo) */}
      {posterUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            overflow: 'hidden',
            borderRadius: '6px',
          }}
        >
          <img
            src={posterUrl}
            alt=""
            aria-hidden="true"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: isEnhanced ? 0.18 : 0.1,
              imageRendering: isEnhanced ? 'auto' : 'pixelated',
            }}
          />
        </div>
      )}

      {/* Card content sits above any poster overlay */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
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

          {/* 4K badge — prominent on enhanced QN TVs */}
          {is4K && (
            <span
              className={isEnhanced ? 'quality-badge--prominent' : undefined}
              style={{
                fontSize: isEnhanced ? 'calc(0.75rem * var(--font-scale, 1))' : 'calc(0.6rem * var(--font-scale, 1))',
                fontWeight: '900',
                color: isEnhanced ? '#FFD700' : '#e3b341',
                letterSpacing: '0.06em',
                border: isEnhanced ? '2px solid #FFD700' : '1px solid #e3b341',
                borderRadius: '3px',
                padding: isEnhanced ? '0.15rem 0.5rem' : '0.1rem 0.35rem',
                backgroundColor: isEnhanced ? 'rgba(255,215,0,0.15)' : 'rgba(227,179,65,0.1)',
              }}
            >
              4K
            </span>
          )}

          {/* HDR badge — prominent on enhanced tier */}
          {hdrFormat && (
            <span
              style={{
                fontSize: isEnhanced ? 'calc(0.7rem * var(--font-scale, 1))' : 'calc(0.6rem * var(--font-scale, 1))',
                fontWeight: '800',
                color: isEnhanced ? '#a78bfa' : 'var(--muted)',
                letterSpacing: '0.05em',
                border: '1px solid ' + (isEnhanced ? '#a78bfa' : 'var(--muted)'),
                borderRadius: '3px',
                padding: '0.1rem 0.4rem',
                backgroundColor: isEnhanced ? 'rgba(167,139,250,0.15)' : 'transparent',
              }}
            >
              {hdrFormat}
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

        {/* Enhanced: full quality detail row (bitrate dot + codec on focus) */}
        {isEnhanced && (bitrate || codec) && (
          <div
            className="quality-badge-wrap"
            style={{
              fontSize: 'calc(0.7rem * var(--font-scale, 1))',
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {bitrate && (
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: bitrate >= 8000 ? '#3fb950' : bitrate >= 4000 ? '#e3b341' : '#f85149',
                    marginRight: '4px',
                    verticalAlign: 'middle',
                  }}
                />
                {(bitrate / 1000).toFixed(1)}Mbps
              </span>
            )}
            {codec && (
              <span className="codec-label">{codec}</span>
            )}
          </div>
        )}

        {/* Bottom row: quality + provider badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <QualityBadge quality={quality} />
          <ProviderBadge providerTags={providerTags} />
        </div>
      </div>
    </div>
  );
}

export default CatalogCard;
