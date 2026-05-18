import React from 'react';
import ActorCard from './ActorCard.jsx';
import StreamingQualityBar from './StreamingQualityBar.jsx';
import SourceComparePanel from './SourceComparePanel.jsx';
import SeriesEpisodesBlock from './SeriesEpisodesBlock.jsx';

function MediaDetailPanel(props) {
  var item = props.item || {};
  var actors = props.actors || [];
  var onClose = props.onClose;
  var onSelectProvider = props.onSelectProvider;
  var selectedProviderId = props.selectedProviderId || '';
  var globalProviders = props.globalProviders || [];
  var onPlay = props.onPlay;  // (item, providerId?) → parent calls /api/play
  var onFindSimilarActor = props.onFindSimilarActor;  // (actor) → parent filters catalog by actor_id
  var onDownload = props.onDownload;  // (item) → parent opens DownloadModal w/ /api/download envelope

  // Compute whether playback is currently possible — disable the Watch button
  // when no provider is configured (source_health.status === 'not_configured').
  var canPlay = false;
  var noPlayReason = '';
  var providersOnItem = Array.isArray(item.providers) ? item.providers : [];
  if (providersOnItem.length === 0) {
    noPlayReason = 'No provider serves this item yet.';
  } else {
    for (var pp = 0; pp < providersOnItem.length; pp++) {
      var ph = providersOnItem[pp].source_health || {};
      if (ph.status === 'ok' || ph.status === 'degraded' || !ph.status) { canPlay = true; break; }
    }
    if (!canPlay) {
      noPlayReason = 'Provider not configured — paste credentials per docs/41_OPERATOR_CREDENTIALS_RUNBOOK.md';
    }
  }

  // ESC key closes the panel — cleaned up on unmount
  React.useEffect(function() {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        if (onClose) { onClose(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return function() {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Metadata fields — handle both flat and nested formats
  var metadata = item.metadata || {};
  var title = item.title || metadata.title || 'Untitled';
  var year = item.year || metadata.year || '';
  var ratingMpaa = item.rating_mpaa || metadata.rating_mpaa || '';
  var backdropUrl = item.backdrop_url || metadata.backdrop_url || '';
  var plot = item.plot || metadata.plot || '';
  var castIds = Array.isArray(metadata.cast_ids) ? metadata.cast_ids : [];

  // Quality fields
  var quality = item.quality || {};
  var resolution = item.resolution || quality.resolution || '';
  var hasHdr = item.has_hdr || quality.hdr_format || false;

  // Find cast actors from the actors array by actor_id
  var castActors = [];
  if (castIds.length > 0 && actors.length > 0) {
    for (var i = 0; i < castIds.length; i++) {
      for (var j = 0; j < actors.length; j++) {
        if (actors[j].actor_id === castIds[i]) {
          castActors.push(actors[j]);
          break;
        }
      }
    }
  }

  function handleMoreWithActor(actor) {
    if (typeof onFindSimilarActor === 'function') {
      onFindSimilarActor(actor);
    }
  }

  function handleBackdropClick(e) {
    // Only close if clicking the backdrop overlay itself, not its children
    if (e.target === e.currentTarget) {
      if (onClose) { onClose(); }
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={'Details for ' + title}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 50,
        backgroundColor: 'rgba(0,0,0,0.88)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Inner panel — constrained width, centred */}
      <div
        style={{
          position: 'relative',
          margin: '2rem auto',
          width: '100%',
          maxWidth: '900px',
          backgroundColor: 'var(--surface)',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
          color: 'var(--text)',
        }}
      >
        {/* Close button — top-right */}
        <button
          tabIndex={0}
          autoFocus
          onClick={onClose}
          aria-label="Close details"
          style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.55)',
            border: '1px solid var(--border, #30363d)',
            color: '#ffffff',
            fontSize: '1.1rem',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            outline: 'none',
            lineHeight: '1',
          }}
          onFocus={function(e) {
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
          }}
        >
          &times;
        </button>

        {/* Backdrop image */}
        {backdropUrl && (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '260px',
              overflow: 'hidden',
              backgroundColor: 'var(--bg)',
            }}
          >
            <img
              src={backdropUrl}
              alt=""
              aria-hidden="true"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.55,
              }}
            />
            {/* Gradient overlay for legibility */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '50%',
                background: 'linear-gradient(to bottom, transparent, var(--surface))',
              }}
            />
          </div>
        )}

        {/* Content body */}
        <div style={{ padding: '1.5rem' }}>
          {/* Title row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              flexWrap: 'wrap',
              marginBottom: '0.5rem',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 'calc(1.4rem * var(--font-scale, 1))',
                fontWeight: '800',
                color: 'var(--text)',
                lineHeight: '1.2',
              }}
            >
              {title}
            </h2>

            {/* Year */}
            {year && (
              <span
                style={{
                  fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                  color: 'var(--muted)',
                  alignSelf: 'center',
                  flexShrink: 0,
                }}
              >
                {year}
              </span>
            )}

            {/* MPAA rating */}
            {ratingMpaa && (
              <span
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  color: 'var(--muted)',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '3px',
                  padding: '0.1rem 0.4rem',
                  alignSelf: 'center',
                  flexShrink: 0,
                }}
              >
                {ratingMpaa}
              </span>
            )}

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
                  alignSelf: 'center',
                  flexShrink: 0,
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
                  alignSelf: 'center',
                  flexShrink: 0,
                }}
              >
                HDR
              </span>
            )}
          </div>

          {/* Plot */}
          {plot && (
            <p
              style={{
                margin: '0.5rem 0 1rem',
                fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                color: 'var(--muted)',
                lineHeight: '1.55',
              }}
            >
              {plot}
            </p>
          )}

          {/* Watch button — primary CTA. Disabled when no provider is configured;
              the disabled-reason tooltip points the operator at the runbook so
              they know exactly what to do. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0 1.25rem' }}>
            <button
              tabIndex={0}
              autoFocus
              disabled={!canPlay}
              title={canPlay ? 'Start playback' : noPlayReason}
              onClick={function() {
                if (canPlay && typeof onPlay === 'function') {
                  onPlay(item, selectedProviderId || null);
                }
              }}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: 'calc(1rem * var(--font-scale, 1))',
                fontWeight: 800,
                color: canPlay ? '#fff' : 'var(--muted, #8b949e)',
                backgroundColor: canPlay ? '#e50914' : 'transparent',
                border: canPlay ? 'none' : '1px solid var(--border, #30363d)',
                borderRadius: '6px',
                cursor: canPlay ? 'pointer' : 'not-allowed',
                outline: 'none',
                opacity: canPlay ? 1 : 0.65,
              }}
              onFocus={function(e) {
                if (canPlay) {
                  e.currentTarget.style.outline = '3px solid #fff';
                  e.currentTarget.style.outlineOffset = '2px';
                }
              }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              {canPlay ? '▶ Watch' : '▶ Provider not configured'}
            </button>

            {/* Download button — Zero-shell parity. Opens the exact-size
                modal which calls POST /api/download. Disabled when no
                provider serves the item (same gate as the Watch button)
                because the streamResolver path is the data source for
                both flows. Hidden for live channels — operators don't
                download live broadcasts; they record them, and that
                surface lands with the Phase 4 recording pipeline. */}
            {item.type !== 'live' && (
              <button
                tabIndex={0}
                disabled={!canPlay}
                title={canPlay ? 'Download for offline viewing' : noPlayReason}
                onClick={function() {
                  if (canPlay && typeof onDownload === 'function') { onDownload(item); }
                }}
                aria-label={'Download ' + (item.title || 'item')}
                style={{
                  padding: '0.75rem 1.2rem',
                  fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  color: canPlay ? 'var(--text, #e6edf3)' : 'var(--muted, #8b949e)',
                  background: 'transparent',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '6px',
                  cursor: canPlay ? 'pointer' : 'not-allowed',
                  outline: 'none',
                  opacity: canPlay ? 1 : 0.6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                onFocus={function(e) {
                  if (canPlay) {
                    e.currentTarget.style.outline = '2px solid var(--accent)';
                    e.currentTarget.style.outlineOffset = '2px';
                  }
                }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >
                <span aria-hidden="true">⤓</span> Download
              </button>
            )}

            {!canPlay && (
              <span style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: 'var(--muted, #8b949e)', maxWidth: '320px' }}>
                {noPlayReason}
              </span>
            )}
          </div>

          {/* Cast row */}
          {castActors.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  color: 'var(--muted)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: '0.6rem',
                }}
              >
                Cast
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  overflowX: 'auto',
                  paddingBottom: '0.25rem',
                }}
              >
                {castActors.map(function(actor) {
                  return (
                    <ActorCard
                      key={actor.actor_id}
                      actor={actor}
                      onMoreWithActor={handleMoreWithActor}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Streaming quality section */}
          <div style={{ marginBottom: '1.25rem' }}>
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
              Streaming Quality
            </div>
            <StreamingQualityBar item={item} provider_id={selectedProviderId} />
          </div>

          {/* Source compare section */}
          <div style={{ marginBottom: '1.25rem' }}>
            <SourceComparePanel
              item={item}
              onSelectProvider={onSelectProvider}
              selectedProviderId={selectedProviderId}
              globalProviders={globalProviders}
            />
          </div>

          {/* Episodes block (series only) — Zero / Smallville-style episode
              list with per-season + per-episode download buttons. Movies
              and live channels never see this block. */}
          {item.type === 'series' && (
            <SeriesEpisodesBlock
              item={item}
              onPlay={onPlay}
              onDownload={onDownload}
            />
          )}

          {/* Similar titles placeholder */}
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: 'var(--surface-raised, #1c2128)',
              borderRadius: '8px',
              fontSize: 'calc(0.8rem * var(--font-scale, 1))',
              color: 'var(--muted)',
              fontStyle: 'italic',
              textAlign: 'center',
              marginTop: '1.25rem',
            }}
          >
            More like this — coming in B3
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaDetailPanel;
