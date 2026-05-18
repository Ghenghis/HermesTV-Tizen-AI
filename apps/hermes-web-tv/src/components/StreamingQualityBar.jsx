import React from 'react';

// Pick color based on health_score: 80+ green, 50-79 yellow, below red
function scoreColor(score) {
  if (typeof score !== 'number') { return '#8b949e'; }
  if (score >= 80) { return '#3fb950'; }
  if (score >= 50) { return '#e3b341'; }
  return '#f85149';
}

function scoreLabel(score) {
  if (typeof score !== 'number') { return 'gray'; }
  if (score >= 80) { return 'green'; }
  if (score >= 50) { return 'yellow'; }
  return 'red';
}

function StreamingQualityBar(props) {
  var item = props.item || {};
  var providerId = props.provider_id || '';

  // Find matching provider entry from item.providers array
  var providerEntry = null;
  if (Array.isArray(item.providers)) {
    for (var i = 0; i < item.providers.length; i++) {
      if (item.providers[i].provider_id === providerId) {
        providerEntry = item.providers[i];
        break;
      }
    }
  }

  // Top-level fallback fields from item directly (old flat format)
  var resolution = item.resolution || (item.quality && item.quality.resolution) || '';
  var hasHdr = item.has_hdr || (item.quality && item.quality.hdr_format) || false;
  var codec = item.codec || (item.quality && item.quality.codec) || '';

  // No provider entry and no health data
  if (!providerEntry) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'var(--surface-raised, #1c2128)',
          borderRadius: '6px',
          fontSize: 'calc(0.8rem * var(--font-scale, 1))',
          color: 'var(--muted)',
          flexWrap: 'wrap',
        }}
      >
        {resolution && (
          <span
            style={{
              fontSize: 'calc(0.7rem * var(--font-scale, 1))',
              fontWeight: '700',
              color: 'var(--text)',
              border: '1px solid var(--border, #30363d)',
              borderRadius: '3px',
              padding: '0.1rem 0.4rem',
            }}
          >
            {resolution}
          </span>
        )}
        {hasHdr && (
          <span
            style={{
              fontSize: 'calc(0.7rem * var(--font-scale, 1))',
              fontWeight: '700',
              color: '#a78bfa',
              border: '1px solid #a78bfa',
              borderRadius: '3px',
              padding: '0.1rem 0.4rem',
            }}
          >
            HDR
          </span>
        )}
        {codec && (
          <span style={{ color: 'var(--muted)', fontSize: 'calc(0.7rem * var(--font-scale, 1))' }}>
            {codec}
          </span>
        )}
        <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Quality data loading...</span>
      </div>
    );
  }

  var healthScore = typeof providerEntry.health_score === 'number' ? providerEntry.health_score : null;
  var healthLabel = providerEntry.health_label || (healthScore !== null ? scoreLabel(healthScore) : 'unknown');
  var startupMs = typeof providerEntry.startup_latency_ms === 'number' ? providerEntry.startup_latency_ms : null;
  var sessionStatus = providerEntry.session_limit_status || '';
  var dotColor = scoreColor(healthScore);
  var barWidth = healthScore !== null ? Math.min(100, Math.max(0, healthScore)) : 0;

  var showSessionWarning = sessionStatus === 'near_limit' || sessionStatus === 'at_limit';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--surface-raised, #1c2128)',
        borderRadius: '6px',
        flexWrap: 'wrap',
        fontSize: 'calc(0.8rem * var(--font-scale, 1))',
      }}
    >
      {/* Health dot */}
      <span
        title={'Health: ' + healthLabel}
        aria-label={'Health status: ' + healthLabel}
        style={{
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />

      {/* Resolution badge */}
      {resolution && (
        <span
          style={{
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            fontWeight: '700',
            color: 'var(--text)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '3px',
            padding: '0.1rem 0.4rem',
          }}
        >
          {resolution}
        </span>
      )}

      {/* HDR badge */}
      {hasHdr && (
        <span
          style={{
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            fontWeight: '700',
            color: '#a78bfa',
            border: '1px solid #a78bfa',
            borderRadius: '3px',
            padding: '0.1rem 0.4rem',
          }}
        >
          HDR
        </span>
      )}

      {/* Codec badge */}
      {codec && (
        <span
          style={{
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            color: 'var(--muted)',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '3px',
            padding: '0.1rem 0.4rem',
          }}
        >
          {codec}
        </span>
      )}

      {/* Startup latency */}
      {startupMs !== null && (
        <span style={{ color: 'var(--muted)', fontSize: 'calc(0.75rem * var(--font-scale, 1))' }}>
          {startupMs}ms start
        </span>
      )}

      {/* Health score bar */}
      {healthScore !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            flex: 1,
            minWidth: '80px',
          }}
        >
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
                backgroundColor: dotColor,
                borderRadius: '2px',
              }}
            />
          </div>
          <span style={{ color: 'var(--muted)', fontSize: 'calc(0.7rem * var(--font-scale, 1))', flexShrink: 0 }}>
            {healthScore}
          </span>
        </div>
      )}

      {/* Session limit warning */}
      {showSessionWarning && (
        <span
          style={{
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            fontWeight: '700',
            color: sessionStatus === 'at_limit' ? '#f85149' : '#e3b341',
            border: '1px solid ' + (sessionStatus === 'at_limit' ? '#f85149' : '#e3b341'),
            borderRadius: '3px',
            padding: '0.1rem 0.4rem',
            backgroundColor: sessionStatus === 'at_limit' ? 'rgba(248,81,73,0.1)' : 'rgba(227,179,65,0.1)',
          }}
        >
          {sessionStatus === 'at_limit' ? 'Stream limit reached' : 'Near stream limit'}
        </span>
      )}
    </div>
  );
}

export default StreamingQualityBar;
