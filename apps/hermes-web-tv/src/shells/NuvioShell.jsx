import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';
import { capForProfile } from '../utils/isSystemLimited.js';

// ─────────────────────────────────────────────────────────────────────────────
// NuvioShell — DaveTV's cinematic, hero-driven layout (9th layout).
//
// Visual language:
//   - Full-bleed featured hero at the top (50vh), gradient fade into content.
//   - Below the hero, three horizontal rails:
//       1. Continue Watching (hidden entirely if no items have progress > 0)
//       2. Movies
//       3. Series
//   - Cards are 2:3 portrait posters on the rails, 16:9 landscape on the hero.
//   - Deep blacks (#0a0a0a base / #16161a raised) with `var(--accent)` highlights.
//   - Top bar is minimal: DaveTV wordmark, search, settings — no sidebar.
//   - Rails are scrolled by horizontal `scrollLeft`. Left/right arrow buttons
//     fade in on rail-hover and use the shared `var(--gradient-accent)` chip.
//
// All copy is DaveTV-branded — the "Nuvio" project name never appears in
// user-visible strings; this is DaveTV's own cinematic layout.
//
// Tizen 6.5 / Chrome 76 safe: no arrow funcs, no destructuring, no template
// strings, no optional chaining. We rely only on transform + opacity for
// animation so the QN85 (Chromium 76) holds 60 fps with the hero parallax.
// ─────────────────────────────────────────────────────────────────────────────

// Hero gradient fade — preserves the bottom-edge legibility regardless of
// how busy the underlying poster is. Uses two stops: a strong fade at 0%
// (bottom) plus a softer top-edge wash so the top bar reads against bright
// backdrops. Pure background gradient, no opacity transitions during scroll.
var HERO_GRADIENT =
  'linear-gradient(180deg,' +
  ' rgba(10,10,10,0.55) 0%,' +
  ' rgba(10,10,10,0.15) 24%,' +
  ' rgba(10,10,10,0.55) 62%,' +
  ' rgba(10,10,10,0.95) 96%,' +
  ' #0a0a0a 100%)';

// One-line subtitle for the hero. Prefer the item's own description; fall back
// to genre + year; final fallback is a neutral "Featured on DaveTV" so we
// never render an empty meta line. Hero already grabs attention from the
// poster alone, so we keep this short and informative.
function _heroSubtitle(item) {
  if (!item) { return ''; }
  if (typeof item.description === 'string' && item.description.length > 0) {
    return item.description;
  }
  var meta = [];
  if (item.year) { meta.push(String(item.year)); }
  if (item.genre) { meta.push(String(item.genre)); }
  if (item.quality) { meta.push(String(item.quality)); }
  if (meta.length > 0) { return meta.join(' · '); }
  return 'Featured on DaveTV';
}

// Find the first item that has any sort of poster artwork. The hero looks
// flat without a real image — if every candidate has only the deterministic
// gradient fallback we'd rather pick the first non-live item and let
// `posterBg` resolve to a gradient than show nothing at all.
function _pickHeroItem(items) {
  if (!items || items.length === 0) { return null; }
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || isLive(it)) { continue; }
    if (it.poster_url || it.poster || it.thumb || (it.metadata && it.metadata.poster_url)) {
      return it;
    }
  }
  // Fallback: first non-live item even without artwork. `posterBg` will
  // resolve to a deterministic gradient — still better than a black hero.
  for (var j = 0; j < items.length; j++) {
    if (items[j] && items[j].type !== 'live') { return items[j]; }
  }
  return items[0] || null;
}

// ─── Rail component ──────────────────────────────────────────────────────────
// A single horizontal-scrolling rail. The ref drives `scrollLeft` directly
// (cheaper than scrollIntoView and avoids the focus side-effects that
// scrollIntoView triggers on Chrome 76). Arrows fade in on hover/focus-within
// — we don't render them when there are fewer items than fit on a single row,
// because in that case there's nothing to scroll to.
function NuvioRail(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  var fontScale = props.fontScale;
  var tier = props.tier;
  var profile = props.profile;
  var allowMotion = tier === 'enhanced' && !(profile && profile.reduced_motion);

  var scrollRef = React.useRef(null);
  var hoverState = React.useState(false);
  var hover = hoverState[0];
  var setHover = hoverState[1];

  if (!items || items.length === 0) { return null; }

  function scrollBy(delta) {
    var el = scrollRef.current;
    if (!el) { return; }
    // Smooth scroll on enhanced, instant on degraded — keeps the scroll-frame
    // budget tight when the GPU is already under load on UN-class panels.
    if (allowMotion && typeof el.scrollTo === 'function') {
      try {
        el.scrollTo({ left: el.scrollLeft + delta, behavior: 'smooth' });
        return;
      } catch (_) { /* fall through */ }
    }
    el.scrollLeft = el.scrollLeft + delta;
  }

  // Arrow size & step roughly map one viewport-width worth of cards per click.
  // Cards are ~180 px wide + 12 px gap → ~192 px per card. One click moves
  // four cards which feels natural on a TV remote.
  var STEP = 768;

  return (
    <section
      style={{ marginBottom: '32px', position: 'relative' }}
      onMouseEnter={function() { setHover(true); }}
      onMouseLeave={function() { setHover(false); }}
      onFocus={function() { setHover(true); }}
      onBlur={function(e) {
        // Only hide arrows when focus leaves the entire rail, not when it
        // moves between cards within the rail.
        if (e.currentTarget && e.currentTarget.contains && !e.currentTarget.contains(e.relatedTarget)) {
          setHover(false);
        }
      }}
    >
      <h2
        style={{
          margin: '0 0 12px',
          padding: '0 32px',
          fontSize: 'calc(20px * ' + fontScale + ')',
          fontWeight: 800,
          letterSpacing: '0.01em',
          color: 'var(--text, #f5f5f5)',
        }}
      >
        {title}
      </h2>

      {/* Scroll viewport — relative so arrows can sit absolutely over it */}
      <div style={{ position: 'relative' }}>
        <div
          ref={scrollRef}
          style={{
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: '8px 32px 28px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {items.slice(0, capForProfile(profile, 24)).map(function(item, idx) {
            var bg = posterBg(item, idx);
            var year = (item.metadata && item.metadata.year) || item.year || '';
            return (
              <button
                key={item.id || idx}
                tabIndex={0}
                data-nuvio-card="true"
                aria-label={(item.title || 'Untitled') + (year ? ' (' + year + ')' : '')}
                onClick={function() { if (typeof onItemSelect === 'function') { onItemSelect(item); } }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (typeof onItemSelect === 'function') { onItemSelect(item); }
                  }
                }}
                style={{
                  position: 'relative',
                  flexShrink: 0,
                  width: '180px',
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  outline: 'none',
                  // transform-only animation honours the QN85 60 fps budget.
                  // Duration + easing pulled from index.css tokens so this
                  // shell matches the rest of DaveTV's motion design.
                  transition: allowMotion
                    ? 'transform 220ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1))'
                    : 'none',
                  willChange: allowMotion ? 'transform' : 'auto',
                }}
                onMouseEnter={function(e) {
                  if (allowMotion) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.zIndex = '2';
                  }
                }}
                onMouseLeave={function(e) {
                  if (allowMotion) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.zIndex = '1';
                  }
                }}
                onFocus={function(e) {
                  if (allowMotion) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                  e.currentTarget.style.zIndex = '3';
                  // Use shared focus shadow so the accent halo matches the
                  // rest of the app exactly (see index.css `--shadow-focus`).
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                  e.currentTarget.style.borderRadius = '12px';
                }}
                onBlur={function(e) {
                  if (allowMotion) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                  e.currentTarget.style.zIndex = '1';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div
                  style={{
                    width: '100%',
                    // Per-type aspect — Nuvio defaults to portrait posters
                    // but a 'live' channel mixed into the rail must render
                    // as a 16:9 landscape thumb or the channel logo gets
                    // stretched vertically.
                    aspectRatio: (item.type === 'live') ? '16 / 9' : '2 / 3',
                    background: bg,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
                  }}
                >
                  {/* Quality chip — tiny, subtle, only when present */}
                  {item.quality && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        padding: '2px 7px',
                        background: 'rgba(10,10,10,0.78)',
                        color: 'var(--text, #f5f5f5)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '4px',
                        fontSize: 'calc(9px * ' + fontScale + ')',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {item.quality}
                    </span>
                  )}
                  {/* Continue-watching progress strip — only when progress is
                      a meaningful number. Width is clamped 0–100 %. */}
                  {typeof item.progress === 'number' && item.progress > 0 && (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        left: '10px',
                        right: '10px',
                        height: '3px',
                        background: 'rgba(255,255,255,0.18)',
                        borderRadius: '999px',
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          height: '100%',
                          width: Math.max(0, Math.min(100, item.progress * 100)) + '%',
                          background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
                        }}
                      />
                    </span>
                  )}
                </div>
                <div
                  style={{
                    marginTop: '10px',
                    fontSize: 'calc(13px * ' + fontScale + ')',
                    fontWeight: 600,
                    color: 'var(--text, #f5f5f5)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.title || 'Untitled'}
                </div>
                {year && (
                  <div
                    style={{
                      marginTop: '2px',
                      fontSize: 'calc(11px * ' + fontScale + ')',
                      color: 'var(--muted, #8b8b8b)',
                      fontWeight: 400,
                    }}
                  >
                    {year}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Left arrow */}
        {items.length > 4 && (
          <button
            tabIndex={-1}
            aria-label={'Scroll ' + title + ' left'}
            onClick={function() { scrollBy(-STEP); }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '8px',
              transform: 'translateY(-50%)',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              color: '#ffffff',
              fontSize: '20px',
              fontWeight: 800,
              background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
              boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
              opacity: hover ? 1 : 0,
              pointerEvents: hover ? 'auto' : 'none',
              transition: 'opacity 200ms var(--ease-out, ease)',
              zIndex: 4,
            }}
          >
            ‹
          </button>
        )}
        {/* Right arrow */}
        {items.length > 4 && (
          <button
            tabIndex={-1}
            aria-label={'Scroll ' + title + ' right'}
            onClick={function() { scrollBy(STEP); }}
            style={{
              position: 'absolute',
              top: '50%',
              right: '8px',
              transform: 'translateY(-50%)',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              color: '#ffffff',
              fontSize: '20px',
              fontWeight: 800,
              background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
              boxShadow: '0 6px 18px rgba(0,0,0,0.55)',
              opacity: hover ? 1 : 0,
              pointerEvents: hover ? 'auto' : 'none',
              transition: 'opacity 200ms var(--ease-out, ease)',
              zIndex: 4,
            }}
          >
            ›
          </button>
        )}
      </div>
    </section>
  );
}

function NuvioShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var fontScale = (profile && profile.font_scale) || 1;
  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);

  var searchInputResult = React.useState('');
  var searchInput = searchInputResult[0];
  var setSearchInput = searchInputResult[1];

  // Apply the local search box on top of the filter chain. Keeps the rail
  // contents in sync with the search box without bouncing through a hook —
  // this is a tiny filter (length under a few hundred) so a debouncer
  // would just add latency.
  var visible = filtered;
  if (searchInput) {
    var q = searchInput.toLowerCase();
    visible = visible.filter(function(i) {
      return (i.title || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  var hero = _pickHeroItem(visible);
  // Build the three rails. Continue Watching is conditional — we only mount
  // it when there's at least one item with progress > 0 so a fresh profile
  // doesn't see an empty rail header.
  var continueWatching = visible.filter(function(i) {
    return typeof i.progress === 'number' && i.progress > 0;
  });
  var movies = visible.filter(function(i) {
    return isMovie(i);
  });
  var series = visible.filter(function(i) {
    return isSeries(i);
  });

  // Initial focus → first card so the Tizen remote starts in a sensible spot.
  // Hero button is the natural target; fall back to the first rail card.
  React.useEffect(function() {
    var el = document.querySelector('[data-nuvio-hero="true"]')
      || document.querySelector('[data-nuvio-card="true"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  var providerCount = (providers && providers.length) || 0;

  return (
    <div
      className="nuvio-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        // Nuvio's signature deep-black ground — slightly darker than the
        // default `--bg` so the hero gradient fades into a clean black floor
        // regardless of which theme palette is active.
        background: '#0a0a0a',
        color: 'var(--text, #f5f5f5)',
        overflow: 'hidden',
        fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
      }}
    >
      {/* ─── Top bar ────────────────────────────────────────────────────────
          Minimal — no sidebar, no breadcrumbs. Wordmark left, search centre,
          settings + provider chip right. Sits over the hero with a subtle
          gradient so it never collides with the artwork below. */}
      <div
        style={{
          position: 'relative',
          zIndex: 20,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: '16px',
          padding: '14px 32px',
          background: 'linear-gradient(180deg, rgba(10,10,10,0.78) 0%, rgba(10,10,10,0) 100%)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            fontSize: 'calc(18px * ' + fontScale + ')',
            letterSpacing: '0.04em',
            backgroundImage: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
          }}
        >
          DaveTV
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <input
            type="search"
            value={searchInput}
            onChange={function(e) { setSearchInput(e.target.value); }}
            placeholder="Search DaveTV"
            aria-label="Search catalog"
            style={{
              width: '320px',
              maxWidth: '50vw',
              padding: '8px 14px',
              background: '#16161a',
              color: 'var(--text, #f5f5f5)',
              border: '1px solid #232328',
              borderRadius: '999px',
              fontSize: 'calc(13px * ' + fontScale + ')',
              outline: 'none',
            }}
            onFocus={function(e) { e.currentTarget.style.borderColor = 'var(--accent, #1f6feb)'; }}
            onBlur={function(e) { e.currentTarget.style.borderColor = '#232328'; }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {providerCount > 0 && (
            <span
              aria-label={providerCount + ' providers connected'}
              style={{
                fontSize: 'calc(11px * ' + fontScale + ')',
                color: 'var(--muted, #8b8b8b)',
                padding: '4px 10px',
                border: '1px solid #232328',
                borderRadius: '999px',
                background: '#16161a',
              }}
            >
              {providerCount} {providerCount === 1 ? 'provider' : 'providers'}
            </span>
          )}
          {/* Avatar — initials from the profile name so the top bar always
              feels personalised without needing a real avatar asset. */}
          <span
            aria-label={'Profile: ' + ((profile && profile.display_name) || 'guest')}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'calc(12px * ' + fontScale + ')',
              fontWeight: 800,
              color: '#ffffff',
              background: 'var(--gradient-accent, linear-gradient(135deg, #1f6feb, #6366f1))',
            }}
          >
            {((profile && profile.display_name) || 'H').charAt(0).toUpperCase()}
          </span>
          <button
            tabIndex={0}
            aria-label="Settings"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: '#16161a',
              border: '1px solid #232328',
              color: 'var(--text, #f5f5f5)',
              cursor: 'pointer',
              fontSize: '15px',
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* ─── Scrollable content (hero + rails) ─────────────────────────────
          Single vertical scroller. The top bar above is sticky-by-position
          (zIndex above the hero) but doesn't follow scroll — TV layouts
          prefer the top bar fading off-screen as the user dives into the
          rails so the rail content gets full vertical real estate. */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          // The negative margin pulls the hero up under the top bar so the
          // wordmark sits over the hero artwork — gives the layout that
          // signature cinematic "the show is the chrome" feel.
          marginTop: '-60px',
          paddingTop: '0',
        }}
      >
        {/* ─── Hero ────────────────────────────────────────────────────── */}
        {hero ? (
          <div
            style={{
              position: 'relative',
              height: '50vh',
              minHeight: '360px',
              background: posterBg(hero, 0),
              flexShrink: 0,
            }}
          >
            {/* Top-down gradient fade — see HERO_GRADIENT comment above. */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background: HERO_GRADIENT,
                pointerEvents: 'none',
              }}
            />
            {/* Hero copy + actions, anchored bottom-left so the gradient floor
                gives them maximum contrast. */}
            <div
              style={{
                position: 'absolute',
                bottom: '36px',
                left: '32px',
                right: '32px',
                maxWidth: '560px',
                zIndex: 2,
              }}
            >
              <div
                style={{
                  fontSize: 'calc(40px * ' + fontScale + ')',
                  fontWeight: 900,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.05,
                  marginBottom: '10px',
                  textShadow: '0 4px 18px rgba(0,0,0,0.7)',
                }}
              >
                {hero.title || 'Featured'}
              </div>
              <div
                style={{
                  fontSize: 'calc(14px * ' + fontScale + ')',
                  fontWeight: 300,
                  color: 'rgba(245,245,245,0.85)',
                  marginBottom: '20px',
                  textShadow: '0 2px 10px rgba(0,0,0,0.6)',
                  // Clamp to roughly 2 lines so a long synopsis doesn't
                  // squeeze the call-to-action buttons off the screen.
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {_heroSubtitle(hero)}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  tabIndex={0}
                  data-nuvio-hero="true"
                  onClick={function() { if (typeof onItemSelect === 'function') { onItemSelect(hero); } }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (typeof onItemSelect === 'function') { onItemSelect(hero); }
                    }
                  }}
                  style={{
                    padding: '12px 28px',
                    fontSize: 'calc(14px * ' + fontScale + ')',
                    fontWeight: 800,
                    color: '#0a0a0a',
                    background: '#ffffff',
                    border: 'none',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'transform 180ms var(--ease-out, ease)',
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                    e.currentTarget.style.transform = 'scale(1.03)';
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  ▶ Play
                </button>
                <button
                  tabIndex={0}
                  onClick={function() { if (typeof onItemSelect === 'function') { onItemSelect(hero); } }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (typeof onItemSelect === 'function') { onItemSelect(hero); }
                    }
                  }}
                  style={{
                    padding: '12px 28px',
                    fontSize: 'calc(14px * ' + fontScale + ')',
                    fontWeight: 700,
                    color: 'var(--text, #f5f5f5)',
                    background: 'rgba(22,22,26,0.72)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: '999px',
                    cursor: 'pointer',
                    outline: 'none',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    transition: 'transform 180ms var(--ease-out, ease), background 180ms ease',
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                    e.currentTarget.style.transform = 'scale(1.03)';
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  ⓘ More Info
                </button>
              </div>
            </div>
          </div>
        ) : (
          // No items at all (filters too tight, or empty catalog). Show a
          // friendly empty-state in the hero slot so the rest of the layout
          // stays visually balanced.
          <div
            style={{
              height: '50vh',
              minHeight: '360px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: '8px',
              color: 'var(--muted, #8b8b8b)',
              background: 'linear-gradient(135deg, #0f0f12, #16161a)',
            }}
          >
            <div style={{ fontSize: '48px' }} aria-hidden="true">∅</div>
            <div style={{ fontSize: 'calc(15px * ' + fontScale + ')' }}>
              No items match the current filters.
            </div>
          </div>
        )}

        {/* ─── Rails ─────────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            // Pull the rail block up over the hero's bottom fade so the
            // transition between hero and rails feels seamless.
            marginTop: '-24px',
            paddingTop: '24px',
            background: '#0a0a0a',
          }}
        >
          {/* Real Continue Watching rail backed by watchHistoryStore — sits
              as the NEW first rail, before the legacy progress-derived rail
              and the Movies/Series rails. Returns null when empty. */}
          <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} />
          {continueWatching.length > 0 && (
            <NuvioRail
              title="Continue Watching"
              items={continueWatching}
              onItemSelect={onItemSelect}
              fontScale={fontScale}
              tier={tier}
              profile={profile}
            />
          )}
          <NuvioRail
            title="Movies"
            items={movies.length > 0 ? movies : visible}
            onItemSelect={onItemSelect}
            fontScale={fontScale}
            tier={tier}
            profile={profile}
          />
          <NuvioRail
            title="Series"
            items={series.length > 0 ? series : visible.slice().reverse()}
            onItemSelect={onItemSelect}
            fontScale={fontScale}
            tier={tier}
            profile={profile}
          />
        </div>
      </div>
    </div>
  );
}

export default NuvioShell;
