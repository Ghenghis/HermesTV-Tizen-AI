import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';
import FavoritesRail from '../components/FavoritesRail.jsx';
import RecentlyWatchedRail from '../components/RecentlyWatchedRail.jsx';
import WatchlistRail from '../components/WatchlistRail.jsx';
import useFavorites from '../hooks/useFavorites.js';

// ─────────────────────────────────────────────────────────────────────────────
// PlexShell — HermesTV's media-server-style layout.
//
// Visual identity: amber/gold sidebar with landscape tile grid (16:9), drawing
// from the home-media-server design language without copying brand assets.
// HermesTV branding only — never reference upstream player names in copy.
//
// SOTA polish per PR #75: design tokens (--radius-*, --shadow-*, --gradient-*,
// --ease-out), hover-lift cards (.hermes-card-hover style transform), focus-
// visible shadow halo, gradient primary CTA, and reduced-motion respect.
//
// Tizen 6.5 / Chrome 76 safe: no :has(), no @container, no logical properties,
// ES5-style function declarations to match the rest of the shell layer.
// ─────────────────────────────────────────────────────────────────────────────

var SIDEBAR_SECTIONS = [
  { icon: '🏠', label: 'Home' },
  { icon: '📡', label: 'Live TV' },
  { icon: '🎬', label: 'Movies' },
  { icon: '📺', label: 'Series' },
  { icon: '🗂️', label: 'My Library' },
];

// Plex shell's signature amber accent — used inline as a fallback when the
// active theme doesn't override --accent. Keep this local so the shell's
// identity stays intact even on a CSS variable miss.
var PLEX_ACCENT = '#e5a00d';

function GridSection(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  var fontScale = props.fontScale;
  var profile = props.profile;
  // Honour the user's reduced-motion preference — agents respect the
  // .motion-reduced body class globally, but reading the profile flag here
  // lets us skip the translateY hover-lift before the CSS even applies.
  var allowMotion = !(profile && profile.reduced_motion);

  // Per-card heart toggle wiring — shares one favorites read per row.
  var profileId = (profile && (profile.profile_id || profile.id)) || 'mom_tv';
  var fav = useFavorites(profileId);

  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginBottom: '28px' }}>
      <h3 style={{
        margin: '0 0 12px',
        fontSize: 'calc(14px * ' + fontScale + ')',
        color: '#c8d2e0',
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}>{title}</h3>
      {/* auto-fill minmax keeps the grid dense at 1920×1080 without
          scrolling past the viewport: ~7 cols of 220 px tiles, 16/9
          aspect-ratio caps row height so 3+ rows are visible at once. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
        {items.slice(0, 14).map(function(item, idx) {
          return (
            <div
              key={item.id || idx}
              data-focusable="true"
              tabIndex={0}
              role="button"
              aria-label={item.title || 'Untitled'}
              onClick={function() { if (onItemSelect) onItemSelect(item); }}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onItemSelect) onItemSelect(item); } }}
              style={{
                cursor: 'pointer',
                // var(--radius-md) gives every tile the same 12px softening
                // that ZeroShell + the modal layer use; the inline 12px is a
                // belt-and-braces fallback if the var is unresolved.
                borderRadius: 'var(--radius-md, 12px)',
                overflow: 'hidden',
                border: '1px solid #2a2c2f',
                // Shared --shadow-md token — keeps every shell's drop shadow
                // in lockstep without a per-shell shadow recipe.
                boxShadow: 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))',
                // Animate transform + border-color only. Box-shadow is set
                // up-front so we don't pay for a layout-affecting shadow tween.
                transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1), border-color 180ms ease, box-shadow 180ms ease',
                outline: 'none',
                background: '#191b1d',
              }}
              onMouseEnter={function(e) {
                e.currentTarget.style.borderColor = PLEX_ACCENT;
                if (allowMotion) e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={function(e) {
                e.currentTarget.style.borderColor = '#2a2c2f';
                e.currentTarget.style.transform = 'none';
              }}
              onFocus={function(e) {
                e.currentTarget.style.borderColor = PLEX_ACCENT;
                // --shadow-focus is the shared accent halo recipe; fall back
                // to a hand-rolled amber ring if the variable doesn't resolve.
                e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px rgba(229,160,13,0.45), 0 12px 36px rgba(229,160,13,0.25))';
                if (allowMotion) e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onBlur={function(e) {
                e.currentTarget.style.borderColor = '#2a2c2f';
                e.currentTarget.style.boxShadow = 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ aspectRatio: (item.type === 'live') ? '16 / 9' : '2 / 3', background: posterBg(item, idx), backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                {item.quality && (
                  <div style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    background: PLEX_ACCENT,
                    color: '#000',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    // Pill-shaped quality chip — matches ZeroShell's 999px
                    // star chip so badges feel like one family across shells.
                    borderRadius: 'var(--radius-pill, 9999px)',
                    letterSpacing: '0.05em',
                  }}>
                    {item.quality}
                  </div>
                )}
                {item.type === 'live' && (
                  <div style={{
                    position: 'absolute',
                    top: '6px',
                    left: '6px',
                    background: '#e50914',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-pill, 9999px)',
                    letterSpacing: '0.05em',
                  }}>
                    LIVE
                  </div>
                )}
                {item.id && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={fav.isFavorite(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                    aria-pressed={fav.isFavorite(item.id)}
                    onClick={function(e) { e.stopPropagation(); fav.toggleFavorite(item); }}
                    onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fav.toggleFavorite(item); } }}
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      right: '6px',
                      width: '28px', height: '28px',
                      borderRadius: '50%',
                      border: '1px solid ' + (fav.isFavorite(item.id) ? '#ef4444' : 'rgba(255,255,255,0.4)'),
                      background: fav.isFavorite(item.id) ? 'rgba(239,68,68,0.22)' : 'rgba(0,0,0,0.6)',
                      color: fav.isFavorite(item.id) ? '#ef4444' : '#fff',
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      outline: 'none',
                      transition: 'background-color 140ms ease, color 140ms ease',
                      zIndex: 2,
                    }}
                  >
                    {fav.isFavorite(item.id) ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <div style={{ padding: '10px 10px 12px', background: '#191b1d' }}>
                <div style={{ fontSize: 'calc(12px * ' + fontScale + ')', fontWeight: 600, color: '#eaeaea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                {item.year && <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8b8f95', marginTop: '3px' }}>{item.year}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlexShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);
  var featured = filtered[0] || null;
  var liveItems = filtered.filter(function(i) { return isLive(i); });
  var movies = filtered.filter(function(i) { return isMovie(i); });
  var series = filtered.filter(function(i) { return isSeries(i); });
  var fontScale = (profile && profile.font_scale) || 1;
  var allowMotion = !(profile && profile.reduced_motion);

  var activeSectionResult = React.useState(0);
  var activeSection = activeSectionResult[0];
  var setActiveSection = activeSectionResult[1];

  React.useEffect(function() {
    var el = document.querySelector('[data-focusable="true"], [tabindex="0"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%', background: '#1f2326', color: '#eaeaea', overflow: 'hidden', fontFamily: "'Open Sans', 'Inter', sans-serif" }}>

      {/* Sidebar */}
      <div style={{ background: '#191b1d', borderRight: '1px solid #2a2c2f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Wordmark — HermesTV branding only, never reference upstream player
            names in user-visible strings. Gold gradient text echoes the
            shell's amber identity without claiming the upstream brand. */}
        <div style={{
          padding: '18px 22px 14px',
          fontWeight: 800,
          fontSize: 'calc(20px * ' + fontScale + ')',
          flexShrink: 0,
          backgroundImage: 'linear-gradient(135deg, ' + PLEX_ACCENT + ', #f5c053)',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          letterSpacing: '0.04em',
        }}>HermesTV</div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '14px 22px 6px', fontSize: 'calc(10px * ' + fontScale + ')', color: '#8b8f95', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Library</div>
          {SIDEBAR_SECTIONS.map(function(s, i) {
            var isActive = activeSection === i;
            return (
              <button
                key={s.label}
                data-focusable="true"
                tabIndex={0}
                onClick={function() { setActiveSection(i); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveSection(i);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  textAlign: 'left',
                  padding: isActive ? '14px 22px 14px 19px' : '14px 22px',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  cursor: 'pointer',
                  color: isActive ? PLEX_ACCENT : '#b2b9c1',
                  // Active row gets a subtle amber-tinted gradient that
                  // matches the gradient header recipe — surface-raised
                  // sliding into surface — so the row reads "this is
                  // current" without painting a heavy block.
                  background: isActive ? 'linear-gradient(90deg, rgba(229,160,13,0.14) 0%, #22252a 100%)' : 'transparent',
                  borderLeft: isActive ? '3px solid ' + PLEX_ACCENT : '3px solid transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  // Match the 180ms hover-lift duration used by .hermes-card-hover
                  // so every transition in the shell feels like one cadence.
                  transition: 'background-color 180ms cubic-bezier(0.16, 1, 0.3, 1), color 180ms ease, box-shadow 180ms ease',
                  fontFamily: 'inherit',
                  outline: 'none',
                  // Even the side-rail rows get a small radius on the right
                  // edge so the active strip doesn't slam into the panel edge.
                  borderTopRightRadius: 'var(--radius-sm, 8px)',
                  borderBottomRightRadius: 'var(--radius-sm, 8px)',
                }}
                onMouseEnter={function(e) { if (!isActive) e.currentTarget.style.background = '#22252a'; }}
                onMouseLeave={function(e) { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                onFocus={function(e) {
                  e.currentTarget.style.background = isActive
                    ? 'linear-gradient(90deg, rgba(229,160,13,0.24) 0%, #22252a 100%)'
                    : '#22252a';
                  // Shared focus halo so remote-control users see the same
                  // accent glow ZeroShell paints on its poster cards.
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus, inset 0 0 0 2px rgba(229,160,13,0.6))';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.background = isActive
                    ? 'linear-gradient(90deg, rgba(229,160,13,0.14) 0%, #22252a 100%)'
                    : 'transparent';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}

          {providers && providers.length > 0 && (
            <div>
              <div style={{ padding: '14px 22px 6px', fontSize: 'calc(10px * ' + fontScale + ')', color: '#8b8f95', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Providers</div>
              {providers.map(function(p) {
                return (
                  <div key={p.id} style={{ padding: '7px 22px', fontSize: 'calc(12px * ' + fontScale + ')', color: '#b2b9c1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-pill, 9999px)', background: '#22c55e', display: 'inline-block' }} />
                    {p.name || p.id}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ overflowY: 'auto', padding: '22px 28px' }}>

        {/* Hero card — bigger radius (lg) than the tile grid so it reads as
            the visual anchor of the page. Shared --shadow-lg sits under it. */}
        {featured && (
          <div
            onClick={function() { if (onItemSelect) onItemSelect(featured); }}
            style={{
              height: '280px',
              borderRadius: 'var(--radius-lg, 16px)',
              background: posterBg(featured, 0),
              marginBottom: '24px',
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg, 0 12px 36px rgba(0,0,0,0.42))',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(31,35,38,0.95) 0%, rgba(31,35,38,0.2) 60%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: '20px', left: '24px', right: '24px' }}>
              <div style={{ fontSize: 'calc(26px * ' + fontScale + ')', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.01em' }}>{featured.title}</div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {featured.year && <span style={{ fontSize: 'calc(12px * ' + fontScale + ')', color: '#b2b9c1' }}>{featured.year}</span>}
                {featured.genre && <span style={{ fontSize: 'calc(12px * ' + fontScale + ')', color: '#b2b9c1' }}>{featured.genre}</span>}
              </div>
              {/* Primary CTA: pill-shaped, accent gradient, soft drop shadow.
                  Matches PR #75 modal CTAs. The amber stop in the gradient
                  preserves Plex shell identity; the indigo stop slides toward
                  the shared --gradient-accent direction so this button reads
                  as part of the same family as ZeroShell's Z logo wordmark. */}
              <button
                data-focusable="true"
                tabIndex={0}
                onClick={function(e) { e.stopPropagation(); if (onItemSelect) onItemSelect(featured); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onItemSelect) onItemSelect(featured);
                  }
                }}
                style={{
                  padding: '11px 28px',
                  background: 'linear-gradient(135deg, ' + PLEX_ACCENT + ', #f59e0b)',
                  color: '#0a0e1a',
                  border: 'none',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  fontWeight: 800,
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  letterSpacing: '0.04em',
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))',
                  transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms ease',
                }}
                onMouseEnter={function(e) { if (allowMotion) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={function(e) { e.currentTarget.style.transform = 'none'; }}
                onFocus={function(e) {
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px rgba(229,160,13,0.5), 0 12px 36px rgba(229,160,13,0.35))';
                  if (allowMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.boxShadow = 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))';
                  e.currentTarget.style.transform = 'none';
                }}
              >
                ▶ Play
              </button>
            </div>
          </div>
        )}

        {/* Layout order: Favorites → Continue Watching → Recently Watched →
            On Now / Movies / Series grids. Each rail is purely additive and
            returns null when empty. */}
        <FavoritesRail
          profileId={profile && (profile.profile_id || profile.id)}
          onItemSelect={onItemSelect}
          profile={profile}
          fontScale={fontScale}
          catalog={filtered}
        />
        <WatchlistRail profile={profile} items={filtered} onItemSelect={onItemSelect} fontScale={fontScale} />
        <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} />
        <RecentlyWatchedRail
          profileId={profile && (profile.profile_id || profile.id)}
          onItemSelect={onItemSelect}
          profile={profile}
          fontScale={fontScale}
          catalog={filtered}
        />
        <GridSection title="On Now" items={liveItems.length > 0 ? liveItems : filtered.slice(0, 4)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />
        <GridSection title="Movies" items={movies.length > 0 ? movies : filtered.slice(2, 10)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />
        <GridSection title="Series" items={series.length > 0 ? series : filtered.slice(4)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />
        <GridSection title="Recently Added" items={filtered.slice().reverse().slice(0, 8)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#8b8f95', fontSize: 'calc(14px * ' + fontScale + ')' }}>
            No content matches your current filters.
          </div>
        )}
      </div>
    </div>
  );
}

export default PlexShell;
