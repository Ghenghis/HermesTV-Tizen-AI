import React from 'react';

// Score to color helper
function scoreColor(score) {
  if (typeof score !== 'number') { return '#8b949e'; }
  if (score >= 80) { return '#3fb950'; }
  if (score >= 50) { return '#e3b341'; }
  return '#f85149';
}

// Normalise a provider entry that may come from item.providers (rich) or
// be synthesised from the flat provider_tags + provider_health fields.
function buildProviderCards(item, globalProviders) {
  // Rich format: item.providers is an array of objects
  if (Array.isArray(item.providers) && item.providers.length > 0) {
    return item.providers.map(function(p) {
      // Look up display_name from the global providers list
      var displayName = p.display_name || p.provider_id || '';
      if (!displayName && Array.isArray(globalProviders)) {
        for (var i = 0; i < globalProviders.length; i++) {
          if (globalProviders[i].provider_id === p.provider_id) {
            displayName = globalProviders[i].display_label || p.provider_id;
            break;
          }
        }
      }
      // source_health may be nested (catalog.mock.json) or flat (legacy catalog.js format)
      var sh = p.source_health || p;
      return {
        provider_id: p.provider_id,
        display_name: displayName || p.provider_id,
        health_score: typeof sh.health_score === 'number' ? sh.health_score : null,
        health_label: sh.health_label || '',
        bitrate_bucket: sh.bitrate_bucket || p.bitrate_bucket || '',
        startup_latency_ms: typeof sh.startup_latency_ms === 'number' ? sh.startup_latency_ms : null,
        fallback_available: sh.fallback_available || p.fallback_available || false,
      };
    });
  }

  // Flat format: synthesise from provider_tags + provider_health
  var tags = Array.isArray(item.provider_tags) ? item.provider_tags : [];
  var health = item.provider_health || {};
  return tags.map(function(tag) {
    var displayName = tag;
    if (Array.isArray(globalProviders)) {
      for (var i = 0; i < globalProviders.length; i++) {
        if (globalProviders[i].provider_id === tag) {
          displayName = globalProviders[i].display_label || tag;
          break;
        }
      }
    }
    var healthStr = health[tag] || 'unknown';
    // Map string health to a numeric score for display
    var healthScore = healthStr === 'ok' ? 90 : healthStr === 'degraded' ? 55 : null;
    return {
      provider_id: tag,
      display_name: displayName,
      health_score: healthScore,
      health_label: healthStr,
      bitrate_bucket: (item.quality && item.quality.bitrate_bucket) || '',
      startup_latency_ms: null,
      fallback_available: false,
    };
  });
}

function SourceComparePanel(props) {
  var item = props.item || {};
  var onSelectProvider = props.onSelectProvider;
  var selectedProviderId = props.selectedProviderId || '';
  var globalProviders = props.globalProviders || [];

  var cards = buildProviderCards(item, globalProviders);
  var isSingle = cards.length <= 1;

  function handleSelect(providerId) {
    if (onSelectProvider) {
      onSelectProvider(providerId);
    }
  }

  if (!cards.length) {
    return (
      <div
        style={{
          padding: '0.75rem',
          color: 'var(--muted)',
          fontSize: 'calc(0.8rem * var(--font-scale, 1))',
        }}
      >
        No provider information available.
      </div>
    );
  }

  return (
    <div>
      {!isSingle && (
        <div
          style={{
            fontSize: 'calc(0.75rem * var(--font-scale, 1))',
            fontWeight: '700',
            color: 'var(--muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '0.5rem',
          }}
        >
          Source Comparison
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {cards.map(function(card) {
          var isSelected = card.provider_id === selectedProviderId;
          var color = scoreColor(card.health_score);
          var barWidth = card.health_score !== null ? Math.min(100, Math.max(0, card.health_score)) : 0;

          return (
            <div
              key={card.provider_id}
              style={{
                flex: '1 1 180px',
                minWidth: '160px',
                maxWidth: '280px',
                backgroundColor: isSelected ? 'rgba(31,111,235,0.12)' : 'var(--surface-raised, #1c2128)',
                border: '2px solid ' + (isSelected ? 'var(--accent)' : 'var(--border, #30363d)'),
                borderRadius: '8px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {/* Provider name + selected badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.4rem',
                }}
              >
                <span
                  style={{
                    fontSize: 'calc(0.875rem * var(--font-scale, 1))',
                    fontWeight: '700',
                    color: isSelected ? 'var(--accent)' : 'var(--text)',
                  }}
                >
                  {card.display_name}
                </span>
                {isSelected && (
                  <span
                    style={{
                      fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                      fontWeight: '700',
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: '3px',
                      padding: '0.1rem 0.35rem',
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </div>

              {/* Health score bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div
                  style={{
                    flex: 1,
                    height: '4px',
                    backgroundColor: 'var(--border, #30363d)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: barWidth + '%',
                      height: '100%',
                      backgroundColor: color,
                      borderRadius: '2px',
                    }}
                  />
                </div>
                {card.health_score !== null && (
                  <span
                    style={{
                      fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                      color: color,
                      fontWeight: '600',
                      flexShrink: 0,
                    }}
                  >
                    {card.health_score}
                  </span>
                )}
              </div>

              {/* Health label */}
              {card.health_label && (
                <span
                  style={{
                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                    color: color,
                    fontWeight: '600',
                    textTransform: 'capitalize',
                  }}
                >
                  {card.health_label}
                </span>
              )}

              {/* Bitrate bucket */}
              {card.bitrate_bucket && (
                <span
                  style={{
                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                    color: 'var(--muted)',
                  }}
                >
                  Bitrate: {card.bitrate_bucket}
                </span>
              )}

              {/* Startup latency */}
              {card.startup_latency_ms !== null && (
                <span
                  style={{
                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                    color: 'var(--muted)',
                  }}
                >
                  Start: {card.startup_latency_ms}ms
                </span>
              )}

              {/* Fallback available */}
              <span
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  color: card.fallback_available ? '#3fb950' : 'var(--muted)',
                }}
              >
                {card.fallback_available ? '✓ Fallback available' : 'No fallback'}
              </span>

              {/* Select button */}
              <button
                tabIndex={0}
                onClick={function() { handleSelect(card.provider_id); }}
                disabled={isSelected}
                style={{
                  marginTop: '0.25rem',
                  padding: '0.35rem 0.75rem',
                  backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                  border: '1px solid var(--accent)',
                  borderRadius: '5px',
                  color: isSelected ? '#ffffff' : 'var(--accent)',
                  fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                  fontWeight: '600',
                  cursor: isSelected ? 'default' : 'pointer',
                  outline: 'none',
                }}
                onFocus={function(e) {
                  if (!isSelected) {
                    e.currentTarget.style.outline = '2px solid var(--accent)';
                    e.currentTarget.style.outlineOffset = '2px';
                  }
                }}
                onBlur={function(e) {
                  e.currentTarget.style.outline = 'none';
                }}
                aria-label={'Select ' + card.display_name}
                aria-pressed={isSelected}
              >
                {isSelected ? 'Selected' : 'Select ' + card.display_name}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SourceComparePanel;
