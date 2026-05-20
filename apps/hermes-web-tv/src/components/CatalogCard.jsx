import React from 'react';
import QualityBadge from './QualityBadge.jsx';
import ProviderBadge from './ProviderBadge.jsx';
import * as watchHistoryStore from '../store/watchHistoryStore.js';
import useFavorites from '../hooks/useFavorites.js';
import WatchlistButton from './WatchlistButton.jsx';
import { installLongPress } from '../utils/touchGestures.js';
import { getChannelArt } from '../utils/channelArt.js';

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

  // Continue Watching badge — thin progress bar at the bottom of the card
  // when watchHistoryStore has a non-zero position for (profile, item).
  // We resolve profileId from props.profile.profile_id, falling back to
  // 'mom_tv' for unauthenticated dev sessions. The IDB read is per-card
  // but cheap: indexedDB.get on a synthetic key is O(1), and the parent
  // grid memoises CatalogCard via its key prop so cards don't refetch
  // on every render of the grid.
  var profileId = (profile && profile.profile_id) || 'mom_tv';

  // Favorites — heart toggle in the poster slot. useFavorites owns the
  // optimistic state so the heart flips instantly without an IDB round-trip.
  // We stop propagation in the click handler so toggling the heart does NOT
  // also open the detail panel via the card's outer onClick.
  var fav = useFavorites(profileId);
  var isFavorited = fav.isFavorite(item && item.id);

  // Card root ref — used by the touch long-press handler below so finger
  // gestures coexist with mouse/click and keyboard onKeyDown (the card
  // continues to open the detail panel on a normal tap/click; only a
  // 500ms hold flips the favorite).
  var cardRef = React.useRef(null);

  var progressState = React.useState(0);
  var progressPct = progressState[0];
  var setProgressPct = progressState[1];
  React.useEffect(function() {
    if (!item || !item.id) { return undefined; }
    var cancelled = false;
    watchHistoryStore.getProgress(profileId, item.id).then(function(row) {
      if (cancelled) { return; }
      if (row && typeof row.percent_complete === 'number' && row.percent_complete > 0) {
        // Clamp to a thin visible minimum so the bar never disappears for
        // tiny progress values (a 0.3% sliver would otherwise look broken).
        var pct = row.percent_complete;
        if (pct > 0 && pct < 2) { pct = 2; }
        if (pct > 100) { pct = 100; }
        setProgressPct(pct);
      } else {
        setProgressPct(0);
      }
    });
    return function() { cancelled = true; };
  }, [profileId, item.id]);

  // Touch long-press — Samsung tablets + phones. Holding a card for ~500ms
  // toggles the favorite (mirroring the heart button so users without a
  // visible heart still have an affordance). Short taps fall through to
  // the existing onClick, and existing keyDown/click handlers remain
  // untouched so remote/keyboard navigation continues to work.
  React.useEffect(function() {
    var el = cardRef.current;
    if (!el || !item || !item.id) { return undefined; }
    var unmount = installLongPress(el, function() {
      try { fav.toggleFavorite(item); } catch (_e) {}
    }, { delayMs: 500, tolPx: 10 });
    return unmount;
  }, [item && item.id, fav.toggleFavorite]);

  var title = item.title || 'Untitled';
  var contentType = item.content_type || item.type || 'live';
  var quality = item.quality || item.metadata || {};
  // W16-PROVIDERS — derive providerTags from the richest source available.
  // Wave-13 canonicalises providers under item.sources[].provider_id; older
  // shapes still use item.providers[].provider_id or a flat item.provider.
  // We prefer sources → providers → provider_tags → provider so the corner
  // badge correctly identifies "iptv-org / xtremehd / apollo_group" on any
  // catalog shape the merge step produces.
  var providerTags = item.provider_tags;
  if (!providerTags || !providerTags.length) {
    providerTags = [];
    if (Array.isArray(item.sources)) {
      for (var spi = 0; spi < item.sources.length; spi++) {
        var spid = item.sources[spi] && item.sources[spi].provider_id;
        if (spid && providerTags.indexOf(spid) === -1) { providerTags.push(spid); }
      }
    }
    if (!providerTags.length && Array.isArray(item.providers)) {
      for (var ppi = 0; ppi < item.providers.length; ppi++) {
        var ppid = item.providers[ppi] && item.providers[ppi].provider_id;
        if (ppid && providerTags.indexOf(ppid) === -1) { providerTags.push(ppid); }
      }
    }
    if (!providerTags.length && item.provider) { providerTags = [item.provider]; }
  }
  var epg = item.epg || {};
  var catchUpAvailable = item.catch_up_available || quality.has_catchup || false;

  var typeLabel = CONTENT_TYPE_LABELS[contentType] || contentType.toUpperCase();
  var typeColor = CONTENT_TYPE_COLORS[contentType] || 'var(--muted)';

  var isEnhanced = tier === 'enhanced';

  // Resolution checks
  var resolution = quality.resolution || '';
  var is4K = resolution === '4K' || resolution === '2160p';
  var hdrFormat = quality.hdr_format || null;
  var bitrate = quality.bitrate_kbps || null;
  var codec = quality.codec || null;

  // Aspect-ratio per content type — live channels are 16:9 landscape
  // thumbnails (channel logo or NOW-playing still), VOD/movies/series are
  // 2:3 portrait posters. Mixing the two in the same row without per-type
  // aspect produced the stretched-poster bug the user flagged in audit-03.
  var isLive = (contentType === 'live');
  var aspectStr = isLive ? '16 / 9' : '2 / 3';

  // Poster source — live items prefer landscape thumbs (then logo as a
  // last resort), VOD prefers the 2:3 poster. Falling back the other way
  // is what stretched a square channel logo into a portrait box.
  //
  // Reject picsum.photos URLs — pre-wave-9 the seed catalog shipped random
  // nature photos under those URLs labelled with channel names, which read
  // as broken art. Null-out picsum so the channelArt placeholder fires.
  function _realArt(u) {
    return typeof u === 'string' && u.length > 0 && u.indexOf('picsum.photos') === -1;
  }
  function _pick() {
    for (var i = 0; i < arguments.length; i++) {
      if (_realArt(arguments[i])) { return arguments[i]; }
    }
    return null;
  }
  var posterUrl;
  if (isLive) {
    posterUrl = isEnhanced
      ? _pick(item.thumbnail_url, item.logo_url, item.poster_url)
      : _pick(item.thumbnail_url, item.logo_url);
  } else {
    posterUrl = isEnhanced
      ? _pick(item.poster_url, item.thumbnail_url, item.logo_url)
      : _pick(item.thumbnail_url, item.poster_url, item.logo_url);
  }

  // Resolve the channelArt placeholder once so the empty-poster branch and
  // the focus ring share a stable gradient. Two-letter initials over a
  // deterministic gradient — looks correct at every aspect ratio (16:9
  // live, 2:3 VOD/series) and never shows a wrong-aspect random photo.
  var art = getChannelArt(item);

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (props.onClick) { props.onClick(item); }
    }
  }

  // CSS class list for card
  var cardClasses = ['catalog-card'];
  if (isEnhanced) {
    cardClasses.push('card--enhanced-focus');
  }

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      role="button"
      aria-label={title + ', ' + typeLabel}
      aria-description="Long-press to favorite"
      className={cardClasses.join(' ')}
      onClick={function() { if (props.onClick) { props.onClick(item); } }}
      onKeyDown={handleKeyDown}
      style={{
        backgroundColor: 'var(--surface)',
        border: '2px solid var(--border, #30363d)',
        borderRadius: '8px',
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        cursor: 'pointer',
        outline: 'none',
        transition: isEnhanced ? 'border-color 0.15s' : 'none',
        position: 'relative',
        overflow: 'hidden',
        // Stretch each card to fill its grid row so the type-segregated
        // aspect-ratio poster on top still leaves equal-height text blocks
        // below across the row (works with grid-auto-rows: 1fr).
        height: '100%',
        // Tablet/phone polish — kills the 300ms double-tap-to-zoom delay
        // on Samsung tablets so taps register as fast as clicks. Paired
        // with the global rule in index.css so this works even if the
        // cascade is overridden by a wrapper.
        touchAction: 'manipulation',
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
      {/* Poster slot — drives card height via aspect-ratio so a 16:9 live
          tile and a 2:3 movie tile never share the same shape. object-fit:
          cover crops without distortion; when posterUrl is absent we fall
          back to a deterministic gradient via background-color so the slot
          still maintains the type-correct ratio. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: aspectStr,
          // When no real art is present, use the channelArt gradient so the
          // tile reads as branded (matching initials overlay below) rather
          // than a dark void. The neutral grey gradient is only used when
          // an <img> covers the slot.
          background: posterUrl
            ? 'linear-gradient(135deg, #1f2430, #11151c)'
            : 'linear-gradient(135deg,' + art.gradient[0] + ',' + art.gradient[1] + ')',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              // For live, channel logos are often square — contain keeps the
              // mark intact; for movies the 2:3 art fills with cover.
              objectFit: isLive ? 'contain' : 'cover',
              imageRendering: isEnhanced ? 'auto' : 'pixelated',
              backgroundColor: isLive ? 'rgba(0,0,0,0.35)' : 'transparent',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.95)',
              fontWeight: 800,
              letterSpacing: '0.05em',
              fontSize: 'clamp(1.4rem, 3.2vw, 2.6rem)',
              textShadow: '0 2px 12px rgba(0,0,0,0.45)',
              fontFamily: 'system-ui,-apple-system,sans-serif',
            }}
          >
            {art.initials}
          </div>
        )}

        {/* Heart toggle — sits in the top-right of the poster, doubles as a
            "favorite this" affordance everywhere the grid renders. Filled red
            when favorited, outline white otherwise. We stop propagation so a
            heart-click doesn't also fire the card's outer onClick. */}
        {item && item.id && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={isFavorited}
            title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            onClick={function(e) {
              e.stopPropagation();
              fav.toggleFavorite(item);
            }}
            onKeyDown={function(e) {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                fav.toggleFavorite(item);
              }
            }}
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              width: '30px',
              height: '30px',
              borderRadius: '50%',
              backgroundColor: isFavorited ? 'rgba(239,68,68,0.22)' : 'rgba(0,0,0,0.55)',
              border: '1px solid ' + (isFavorited ? '#ef4444' : 'rgba(255,255,255,0.35)'),
              color: isFavorited ? '#ef4444' : '#ffffff',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'background-color 140ms ease, color 140ms ease, transform 140ms ease',
              zIndex: 3,
              lineHeight: 1,
            }}
            onMouseEnter={function(e) { e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {isFavorited ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
              </svg>
            )}
          </button>
        )}

        {/* Watchlist (Save for Later) toggle — sits left-of the heart so the
            user has two distinct affordances: heart = "love it" (synced to
            favorites store), plus = "watch later" (per-profile watchlist).
            Wrap in a span that stops propagation so click/keyboard activation
            on the inner button doesn't bubble to the card's outer onClick. */}
        {item && item.id && (
          <span
            onClick={function(e) { e.stopPropagation(); }}
            onKeyDown={function(e) {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); }
            }}
            style={{
              position: 'absolute',
              top: '6px',
              right: '42px',
              zIndex: 3,
              display: 'inline-flex',
            }}
          >
            <WatchlistButton profile={profile} item={item} />
          </span>
        )}

        {/* W16-PROVIDERS — provider corner badge. Subtle 10-11 px chip in the
            bottom-right of the poster so the user can instantly see whether
            a card is iptv-org, xtremehd, or apollo. Translucent black bg +
            provider-tinted border keeps it readable on any poster. */}
        <ProviderBadge providerTags={providerTags} corner />
      </div>

      {/* Card content body — sits BELOW the poster, not behind it. */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, padding: '0.75rem 0.85rem 0.9rem' }}>
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

      {/* Continue Watching progress bar — only rendered when the user has
          previously watched some of this title. Sits absolutely at the
          bottom edge of the card so it doesn't push the content above
          out of layout. The thin 3px track is intentional — the parallel
          agent's Continue Watching rail is the primary surface; this is
          just a peripheral signal so the user spots in-progress titles
          anywhere they appear in the catalog. */}
      {progressPct > 0 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '3px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderBottomLeftRadius: '6px',
            borderBottomRightRadius: '6px',
            overflow: 'hidden',
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: progressPct + '%',
              height: '100%',
              background: 'var(--gradient-accent, linear-gradient(90deg, #1f6feb, #6366f1))',
              boxShadow: '0 0 6px rgba(31,111,235,0.55)',
            }}
          />
        </div>
      )}
    </div>
  );
}

export default CatalogCard;
