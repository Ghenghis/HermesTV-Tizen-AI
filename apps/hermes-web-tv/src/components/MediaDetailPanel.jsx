import React from 'react';
import ActorCard from './ActorCard.jsx';
import StreamingQualityBar from './StreamingQualityBar.jsx';
import SourceComparePanel from './SourceComparePanel.jsx';
import SeriesEpisodesBlock from './SeriesEpisodesBlock.jsx';
import LoadingSkeleton from './LoadingSkeleton.jsx';
import ParentalLockOverlay from './ParentalLockOverlay.jsx';
import useParentalGate from '../hooks/useParentalGate.js';
import { getSkipIntro, setSkipIntro } from '../store/skipIntroPrefStore.js';
import useFavorites from '../hooks/useFavorites.js';

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
  var onScheduleRecording = props.onScheduleRecording;  // (item) → parent opens ScheduleRecordingModal (live items only)
  // Profile id is read from props.profileId when wired, otherwise we use a
  // shared 'shared' bucket so the toggle still works for unauthenticated
  // sessions. App.jsx can pass props.profileId in a follow-up.
  var profileId = props.profileId || 'shared';

  // Parental gate — wraps Play and Download. The hook returns
  // {isContentLocked, requestUnlock, overlayProps} and we render the
  // overlay inside the same modal so the gate appears in-context. When
  // the user types the right PIN, the original handler fires.
  var parentalGate = useParentalGate();

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

  // Optional series-only metadata — every block below is rendered only
  // when the corresponding field is present, so this stays additive and
  // non-breaking for items that don't carry the new shape yet.
  var ratingBreakdown = metadata.rating_breakdown || null;  // { imdb, rotten_tomatoes, metacritic }
  var introEndSeconds = (typeof metadata.intro_end_seconds === 'number') ? metadata.intro_end_seconds : null;
  var creditsStartSeconds = (typeof metadata.credits_start_seconds === 'number') ? metadata.credits_start_seconds : null;
  var hasIntroMarkers = (introEndSeconds !== null || creditsStartSeconds !== null);
  var isSeries = (item.type === 'series');

  // Skip-intro preference — persisted per profile. We mirror the stored
  // value in state so the toggle reflects optimistically and the save
  // happens in the background. Persistence is silent if localStorage is
  // unavailable (Tizen privacy mode); the in-session toggle still works.
  var skipIntroResult = React.useState(false);
  var skipIntroOn = skipIntroResult[0];
  var setSkipIntroOn = skipIntroResult[1];
  React.useEffect(function() {
    setSkipIntroOn(getSkipIntro(profileId));
  }, [profileId]);

  function toggleSkipIntro() {
    var next = !skipIntroOn;
    setSkipIntroOn(next);
    setSkipIntro(profileId, next);
  }

  // Favorites — useFavorites owns the IDB read on mount + the optimistic
  // toggle. The heart button below reflects fav.isFavorite(item.id) and
  // calls fav.toggleFavorite(item) on click. Per-profile keyed via
  // profileId so Sherri and Dave never share favorites.
  var fav = useFavorites(profileId);
  var isFavorited = fav.isFavorite(item && item.id);

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
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 50,
        backgroundColor: 'rgba(8,12,20,0.78)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Inner panel — constrained width, centred. Soft drop-shadow + 18px
          radius + scale-in entrance choreographed by .hermes-modal-panel. */}
      <div
        className="hermes-modal-panel"
        style={{
          position: 'relative',
          margin: '2rem auto',
          width: '100%',
          maxWidth: '900px',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--border, #30363d)',
          borderRadius: '20px',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
          color: 'var(--text)',
        }}
      >
        {/* Favorite heart button — sits to the LEFT of the close X so the
            top-right area still anchors close. Filled red heart = favorited,
            outline = not. Tap-target is 40x40 to match Close. */}
        <button
          type="button"
          tabIndex={0}
          onClick={function() { if (item && item.id) { fav.toggleFavorite(item); } }}
          onKeyDown={function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (item && item.id) { fav.toggleFavorite(item); }
            }
          }}
          aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorited}
          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
          style={{
            position: 'absolute',
            top: '0.9rem',
            right: '3.4rem',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: isFavorited ? 'rgba(239,68,68,0.18)' : 'rgba(0,0,0,0.55)',
            border: '1px solid ' + (isFavorited ? '#ef4444' : 'var(--border, #30363d)'),
            color: isFavorited ? '#ef4444' : '#ffffff',
            fontSize: '1.2rem',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            outline: 'none',
            lineHeight: '1',
            padding: 0,
            transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease, color 160ms ease',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onMouseEnter={function(e) {
            e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseLeave={function(e) {
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onFocus={function(e) {
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
            e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {/* Heart glyph — filled solid heart vs outline heart. Inline SVG
              so we don't depend on font ranges that may differ on Tizen. */}
          {isFavorited ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
            </svg>
          )}
        </button>

        {/* Close button — circular, soft hover bg, accent focus ring */}
        <button
          tabIndex={0}
          autoFocus
          onClick={onClose}
          aria-label="Close details"
          style={{
            position: 'absolute',
            top: '0.9rem',
            right: '0.9rem',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0,0,0,0.55)',
            border: '1px solid var(--border, #30363d)',
            color: '#ffffff',
            fontSize: '1.2rem',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            outline: 'none',
            lineHeight: '1',
            transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onMouseEnter={function(e) {
            e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.14)';
            e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onMouseLeave={function(e) {
            e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.55)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onFocus={function(e) {
            e.currentTarget.style.outline = '2px solid var(--accent)';
            e.currentTarget.style.outlineOffset = '2px';
            e.currentTarget.style.transform = 'scale(1.06)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.transform = 'scale(1)';
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
              loading="lazy"
              decoding="async"
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

            {/* MPAA rating — rounded-pill */}
            {ratingMpaa && (
              <span
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  color: 'var(--muted)',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  alignSelf: 'center',
                  flexShrink: 0,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                {ratingMpaa}
              </span>
            )}

            {/* Resolution badge — rounded-pill */}
            {resolution && (
              <span
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  color: 'var(--text)',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  alignSelf: 'center',
                  flexShrink: 0,
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                {resolution}
              </span>
            )}

            {/* HDR badge — pill with soft glow */}
            {hasHdr && (
              <span
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  fontWeight: '800',
                  color: '#ffffff',
                  border: '1px solid rgba(167,139,250,0.6)',
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  alignSelf: 'center',
                  flexShrink: 0,
                  background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                  boxShadow: '0 0 8px rgba(167,139,250,0.35) inset',
                  letterSpacing: '0.05em',
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

          {/* Rating breakdown — IMDb / RT / Metacritic. Renders only when
              metadata.rating_breakdown is present, so the existing items
              with no breakdown still render unchanged. Each badge uses the
              same pill geometry as the year / MPAA tags for visual
              consistency, but adds a tiny coloured swatch so the source is
              recognisable at a glance. */}
          {ratingBreakdown && (
            <div
              aria-label="External ratings"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.45rem',
                margin: '0 0 1rem',
              }}
            >
              {typeof ratingBreakdown.imdb === 'number' && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.2rem 0.6rem',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: 'var(--radius-pill, 999px)',
                    background: 'rgba(245,197,24,0.08)',
                    fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                    fontWeight: 700,
                    color: 'var(--text)',
                  }}
                >
                  <span aria-hidden="true" style={{ color: '#f5c518', fontSize: '0.95em' }}>IMDb</span>
                  <span>{ratingBreakdown.imdb.toFixed(1)}/10</span>
                </span>
              )}
              {typeof ratingBreakdown.rotten_tomatoes === 'number' && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.2rem 0.6rem',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: 'var(--radius-pill, 999px)',
                    background: 'rgba(250,50,50,0.08)',
                    fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                    fontWeight: 700,
                    color: 'var(--text)',
                  }}
                >
                  <span aria-hidden="true" style={{ color: '#fa3232' }}>RT</span>
                  <span>{ratingBreakdown.rotten_tomatoes}%</span>
                </span>
              )}
              {typeof ratingBreakdown.metacritic === 'number' && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.2rem 0.6rem',
                    border: '1px solid var(--border, #30363d)',
                    borderRadius: 'var(--radius-pill, 999px)',
                    background: 'rgba(102,204,0,0.08)',
                    fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                    fontWeight: 700,
                    color: 'var(--text)',
                  }}
                >
                  <span aria-hidden="true" style={{ color: '#66cc00' }}>MC</span>
                  <span>{ratingBreakdown.metacritic}</span>
                </span>
              )}
            </div>
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
                if (!canPlay || typeof onPlay !== 'function') { return; }
                if (parentalGate.isContentLocked(item)) {
                  parentalGate.requestUnlock(item).then(function(res) {
                    if (res && res.ok) { onPlay(item, selectedProviderId || null); }
                  });
                  return;
                }
                onPlay(item, selectedProviderId || null);
              }}
              style={{
                padding: '0.8rem 1.8rem',
                fontSize: 'calc(1rem * var(--font-scale, 1))',
                fontWeight: 800,
                color: canPlay ? '#fff' : 'var(--muted, #8b949e)',
                background: canPlay ? 'linear-gradient(135deg, #e50914, #c1121f 60%, #6366f1)' : 'transparent',
                border: canPlay ? 'none' : '1px solid var(--border, #30363d)',
                borderRadius: '999px',
                cursor: canPlay ? 'pointer' : 'not-allowed',
                outline: 'none',
                opacity: canPlay ? 1 : 0.65,
                boxShadow: canPlay ? '0 6px 18px rgba(229,9,20,0.35)' : 'none',
                transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), opacity 160ms ease',
                letterSpacing: '0.02em',
              }}
              onFocus={function(e) {
                if (canPlay) {
                  e.currentTarget.style.outline = '3px solid #fff';
                  e.currentTarget.style.outlineOffset = '3px';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseEnter={function(e) { if (canPlay) e.currentTarget.style.transform = 'scale(1.03)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {canPlay ? '▶ Watch' : '▶ Provider not configured'}
            </button>

            {/* Record button — live channels only. Opens the App-level
                ScheduleRecordingModal which posts to /api/dvr/schedule.
                Parental gating happens at the App handler too so a PIN
                prompt covers this path even when the gate cache is empty.
                Hidden + skipped when the parent didn't wire the callback. */}
            {item.type === 'live' && typeof onScheduleRecording === 'function' && (
              <button
                tabIndex={0}
                title="Schedule a recording for this channel"
                aria-label={'Record ' + (item.title || 'channel')}
                onClick={function() {
                  if (parentalGate.isContentLocked(item)) {
                    parentalGate.requestUnlock(item).then(function(res) {
                      if (res && res.ok) { onScheduleRecording(item); }
                    });
                    return;
                  }
                  onScheduleRecording(item);
                }}
                style={{
                  padding: '0.7rem 1.3rem',
                  fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  color: 'var(--text, #e6edf3)',
                  background: 'transparent',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'border-color 160ms ease, background-color 160ms ease',
                }}
                onMouseEnter={function(e) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={function(e) { e.currentTarget.style.borderColor = 'var(--border, #30363d)'; e.currentTarget.style.background = 'transparent'; }}
                onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >
                <span aria-hidden="true" style={{ color: '#ef4444' }}>●</span> Record
              </button>
            )}

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
                  if (!canPlay || typeof onDownload !== 'function') { return; }
                  if (parentalGate.isContentLocked(item)) {
                    parentalGate.requestUnlock(item).then(function(res) {
                      if (res && res.ok) { onDownload(item); }
                    });
                    return;
                  }
                  onDownload(item);
                }}
                aria-label={'Download ' + (item.title || 'item')}
                style={{
                  padding: '0.7rem 1.3rem',
                  fontSize: 'calc(0.9rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  color: canPlay ? 'var(--text, #e6edf3)' : 'var(--muted, #8b949e)',
                  background: 'transparent',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '10px',
                  cursor: canPlay ? 'pointer' : 'not-allowed',
                  outline: 'none',
                  opacity: canPlay ? 1 : 0.6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'border-color 160ms ease, background-color 160ms ease',
                }}
                onMouseEnter={function(e) {
                  if (canPlay) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }
                }}
                onMouseLeave={function(e) {
                  e.currentTarget.style.borderColor = 'var(--border, #30363d)';
                  e.currentTarget.style.background = 'transparent';
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

          {/* Cast row — when castIds exist but the actors array hasn't
              resolved yet, render shimmer rows so the layout doesn't pop
              in once the fetch completes. */}
          {(castActors.length > 0 || castIds.length > 0) && (
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
              {castActors.length > 0 ? (
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
              ) : (
                <LoadingSkeleton variant="rail" count={4} />
              )}
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

          {/* Skip-intro preference — only shown for series carrying
              intro / credits markers in metadata. The toggle persists per
              profile via skipIntroPrefStore. The actual skip happens
              inside PlayerModal in a follow-up; this surface owns the
              preference so series fans can flip it on once and forget
              about it. */}
          {isSeries && hasIntroMarkers && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginTop: '1.25rem',
                padding: '0.7rem 0.9rem',
                background: 'var(--surface-raised, #1c2128)',
                border: '1px solid var(--border, #30363d)',
                borderRadius: 'var(--radius-md, 12px)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 'calc(0.8rem * var(--font-scale, 1))',
                    fontWeight: 700,
                    color: 'var(--text, #e6edf3)',
                  }}
                >
                  Skip intro automatically
                </div>
                <div
                  style={{
                    fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                    color: 'var(--muted, #8b949e)',
                    marginTop: '0.15rem',
                  }}
                >
                  {introEndSeconds !== null && (
                    <span>Intro ends at {Math.round(introEndSeconds)}s. </span>
                  )}
                  {creditsStartSeconds !== null && (
                    <span>Credits start at {Math.round(creditsStartSeconds)}s.</span>
                  )}
                </div>
              </div>
              <button
                tabIndex={0}
                role="switch"
                aria-checked={skipIntroOn}
                aria-label={'Skip intro ' + (skipIntroOn ? 'on' : 'off')}
                onClick={toggleSkipIntro}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSkipIntro(); } }}
                style={{
                  position: 'relative',
                  width: '46px',
                  height: '26px',
                  borderRadius: 'var(--radius-pill, 999px)',
                  background: skipIntroOn ? 'var(--gradient-accent)' : 'rgba(255,255,255,0.12)',
                  border: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  flexShrink: 0,
                  transition: 'background 200ms var(--ease-out, ease)',
                }}
                onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '3px'; }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: skipIntroOn ? '23px' : '3px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    boxShadow: 'var(--shadow-md, 0 2px 6px rgba(0,0,0,0.4))',
                    transition: 'left 200ms var(--ease-out, ease)',
                  }}
                />
              </button>
            </div>
          )}

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

          {/* Similar titles — fetch pending until W3-B3 lands. The
              skeleton rows beat the old static "coming soon" line because
              the user sees where the recommendations will appear instead
              of a dead-end placeholder. We also surface a short copy line
              that explains WHEN the rail will populate, so the operator
              isn't left guessing whether the empty space is a bug. */}
          <div
            aria-label="Recommended titles — loading"
            style={{
              padding: '0.9rem',
              backgroundColor: 'var(--surface-raised, #1c2128)',
              borderRadius: 'var(--radius-md, 12px)',
              border: '1px solid var(--border, #30363d)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 0 24px rgba(0,0,0,0.25)',
              marginTop: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                marginBottom: '0.6rem',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontSize: 'calc(0.75rem * var(--font-scale, 1))',
                  fontWeight: '700',
                  color: 'var(--muted)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                {isSeries ? 'More series like this' : 'More like this'}
              </div>
              <div
                style={{
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  color: 'var(--muted)',
                  fontStyle: 'italic',
                }}
              >
                Recommendations coming soon — we'll surface titles based on cast, genre, and watch history.
              </div>
            </div>
            <LoadingSkeleton variant="rail" count={5} />
          </div>
        </div>
      </div>

      {/* Parental gate overlay — rendered as a sibling of the modal-panel
          (NOT a descendant) so its position:fixed isn't trapped inside the
          panel's will-change/transform containing block. Layered above the
          detail panel via its own zIndex (90 > our 50). */}
      <ParentalLockOverlay {...parentalGate.overlayProps} />
    </div>
  );
}

export default MediaDetailPanel;
