import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';
import FavoritesRail from '../components/FavoritesRail.jsx';
import RecentlyWatchedRail from '../components/RecentlyWatchedRail.jsx';
import WatchlistRail from '../components/WatchlistRail.jsx';
import useFavorites from '../hooks/useFavorites.js';
import { capForProfile } from '../utils/isSystemLimited.js';

// ─────────────────────────────────────────────────────────────────────────────
// NetflixShell — DaveTV's cinematic horizontal-rail layout, inspired by the
// streaming-service visual vocabulary (bold red accent, dark canvas, hero
// banner, dense card rows). All copy is DaveTV branding — never reference
// "Netflix" in user-visible strings. Polish pass mirrors the SOTA shared
// vocabulary from index.css + design/tokens.js:
//   - Radii consume var(--radius-sm/md/lg/xl/pill) for parity with other shells.
//   - Cards use the .hermes-card-hover utility (translateY(-2px) on hover/focus).
//   - Easing leans on var(--ease-out) and shadow tokens var(--shadow-md/lg).
//   - Primary Watch CTA wears the Netflix-red → indigo gradient pill so it
//     still reads as "Netflix-style red" but joins the cross-shell accent family.
//   - Focus-visible state pulls var(--shadow-focus) so the remote nav glow is
//     identical to every other shell in the suite.
//   - Honours .motion-reduced on <body> by gating every transform/box-shadow
//     animation behind the `allowMotion` boolean we compute from the profile.
// Tizen 6.5 / Chrome 76 safe: no :has(), no @container, function(){} only.
// ─────────────────────────────────────────────────────────────────────────────

var NAV_TABS = ['Home', 'Live TV', 'Movies', 'Series', 'Search'];

function CardRow(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  // onItemFocus drives the hero preview without opening the detail panel.
  // focusedItemId lets each card know whether *it* is the currently-previewed
  // card so a second click commits to onItemSelect (open modal).
  var onItemFocus = props.onItemFocus;
  var focusedItemId = props.focusedItemId;
  var tier = props.tier;
  var fontScale = props.fontScale;
  var profile = props.profile;
  // allowMotion is the single gate that respects the motion-reduced body
  // class — when the profile sets reduced_motion=true (or the tier is
  // degraded) we skip every transform/box-shadow animation so the .motion-
  // reduced rule in index.css doesn't have to fight us.
  var allowMotion = tier === 'enhanced' && !(profile && profile.reduced_motion);

  // Per-card heart toggle — shares one favorites store with the entire shell.
  var profileId = (profile && (profile.profile_id || profile.id)) || 'mom_tv';
  var fav = useFavorites(profileId);

  if (!items || items.length === 0) return null;

  // Per Mom-never-limited rule: Dave's rails cap at 12, Mom's cap is bypassed
  // so Sherri sees every card we have for that row (poster rows are cheap on
  // the QN85 — the perf cost we were avoiding is a UN-class concern).
  var rowCap = capForProfile(profile, 12);

  return (
    <div style={{ marginBottom: '28px' }}>
      <h3 style={{ margin: '0 0 12px', padding: '0 24px', fontSize: 'calc(16px * ' + fontScale + ')', fontWeight: 700, color: '#e5e5e5', letterSpacing: '0.3px' }}>{title}</h3>
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '6px 24px 10px', scrollbarWidth: 'none' }}>
        {items.slice(0, rowCap).map(function(item, idx) {
          // Per-card aspect: live channels are landscape 16:9 logos/thumbs,
          // VOD/movies/series stay 2:3 portrait posters. Cards in a single
          // rail mix gracefully because the row-flex stretches vertically;
          // we widen the live card so its height roughly matches a 2:3 tile
          // (180 * 1.5 = 270 ≈ 280 * 9/16 = ~158, so 280px wide live ≈ 158
          // tall; 180px wide VOD ≈ 270 tall — still slightly mismatched but
          // far better than stretching a square logo into a 2:3 box).
          var isLiveCard = isLive(item);
          var cardWidth = isLiveCard ? '280px' : '180px';
          var posterAspect = isLiveCard ? '16 / 9' : '2 / 3';
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
                flexShrink: 0,
                width: cardWidth,
                cursor: 'pointer',
                // Use the shared sm radius — matches the rest of the suite
                // without softening Netflix's tight, dense card look too much.
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                border: '2px solid transparent',
                // Animate transform + box-shadow + border-color only —
                // matches the hermes-card-hover utility recipe so the lift
                // feels identical to ZeroShell + LayoutSwitcher.
                transition: allowMotion
                  ? 'transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out), border-color 160ms ease'
                  : 'border-color 160ms ease, box-shadow 160ms ease',
                outline: 'none',
                willChange: allowMotion ? 'transform' : 'auto',
              }}
              onMouseEnter={function(e) {
                if (allowMotion) {
                  // translateY(-2px) lift + medium shadow — the SOTA card
                  // recipe shared with hermes-card-hover.
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={function(e) {
                if (allowMotion) {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
              onFocus={function(e) {
                e.currentTarget.style.borderColor = '#e50914';
                // Reuse the shared focus shadow so keyboard/remote nav
                // glows with the same halo as every other shell.
                e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                if (allowMotion) {
                  e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                }
              }}
              onBlur={function(e) {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
                if (allowMotion) {
                  e.currentTarget.style.transform = 'translateY(0) scale(1)';
                }
              }}
            >
              <div style={{ aspectRatio: posterAspect, background: posterBg(item, idx), backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 'var(--radius-sm)', position: 'relative' }}>
                {item.quality && (
                  <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-pill)', letterSpacing: '0.05em' }}>
                    {item.quality}
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
                      top: '6px',
                      left: '6px',
                      width: '26px', height: '26px',
                      borderRadius: '50%',
                      border: '1px solid ' + (fav.isFavorite(item.id) ? '#ef4444' : 'rgba(255,255,255,0.35)'),
                      background: fav.isFavorite(item.id) ? 'rgba(239,68,68,0.22)' : 'rgba(0,0,0,0.55)',
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
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 21s-7.5-4.6-10-9.2C0.6 8.6 2 4.5 5.7 4 8 3.7 10 5 12 7c2-2 4-3.3 6.3-3 3.7 0.5 5.1 4.6 3.7 7.8C19.5 16.4 12 21 12 21z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <div style={{ padding: '6px 4px', fontSize: 'calc(11px * ' + fontScale + ')', color: '#e5e5e5', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NetflixShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);
  var featured = filtered[0] || null;
  var liveItems = filtered.filter(function(i) { return isLive(i); });
  var movies = filtered.filter(function(i) { return isMovie(i); });
  var fontScale = (profile && profile.font_scale) || 1;
  // Hero CTAs only lift when motion is allowed. We compute it once so the
  // markup stays declarative.
  var allowMotion = tier === 'enhanced' && !(profile && profile.reduced_motion);

  var activeTabResult = React.useState(0);
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];

  React.useEffect(function() {
    var el = document.querySelector('[data-focusable="true"], [tabindex="0"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: '#141414', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* Top nav */}
      <header style={{ position: 'relative', zIndex: 10, background: 'linear-gradient(180deg, rgba(20,20,20,1) 0%, rgba(20,20,20,0.8) 100%)', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', gap: '32px', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 'calc(20px * ' + fontScale + ')', letterSpacing: '0.05em' }}>
          Dave<span style={{ color: '#e50914' }}>TV</span>
        </div>
        <nav style={{ display: 'flex', gap: '20px' }}>
          {NAV_TABS.map(function(tab, i) {
            var isActive = activeTab === i;
            return (
              <button
                key={tab}
                className="hermes-focusable hermes-press"
                tabIndex={0}
                aria-pressed={isActive}
                onClick={function() { setActiveTab(i); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveTab(i);
                  }
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isActive ? '#fff' : '#b3b3b3',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  padding: '12px 0',
                  borderBottom: isActive ? '2px solid transparent' : '2px solid transparent',
                  borderImage: isActive ? 'var(--gradient-accent) 1' : 'none',
                  outline: 'none',
                  transition: 'color 120ms ease',
                  borderRadius: 'var(--radius-sm)',
                }}
                onMouseEnter={function(e) { e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={function(e) { e.currentTarget.style.color = isActive ? '#fff' : '#b3b3b3'; }}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Hero banner */}
        {featured && (
          <div style={{ position: 'relative', height: '320px', background: posterBg(featured, 0), flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #141414 0%, rgba(20,20,20,0.6) 50%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: '32px', left: '32px', maxWidth: '480px' }}>
              <div style={{ fontSize: 'calc(32px * ' + fontScale + ')', fontWeight: 700, marginBottom: '8px', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{featured.title}</div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {featured.year && <span style={{ fontSize: 'calc(13px * ' + fontScale + ')', color: '#a3a3a3' }}>{featured.year}</span>}
                {featured.genre && <span style={{ fontSize: 'calc(13px * ' + fontScale + ')', color: '#a3a3a3' }}>{featured.genre}</span>}
                {featured.quality && (
                  <span style={{
                    fontSize: 'calc(11px * ' + fontScale + ')',
                    fontWeight: 700,
                    color: '#e5a00d',
                    border: '1px solid #e5a00d',
                    // Pill the quality badge so it joins the chip family used
                    // across PlayerModal/MediaDetailPanel.
                    borderRadius: 'var(--radius-pill)',
                    padding: '2px 8px',
                    background: 'rgba(229,160,13,0.08)',
                  }}>{featured.quality}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {/* Primary Watch CTA — the Netflix-red → indigo gradient
                    pill. Keeps the brand red on the left edge while joining
                    the cross-shell accent family on the right. */}
                <button
                  className="hermes-focusable hermes-press"
                  tabIndex={0}
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onItemSelect) onItemSelect(featured);
                    }
                  }}
                  style={{
                    padding: '11px 26px',
                    background: 'linear-gradient(135deg, #e50914, #c1121f 60%, #6366f1)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 800,
                    fontSize: 'calc(14px * ' + fontScale + ')',
                    cursor: 'pointer',
                    boxShadow: '0 6px 18px rgba(229,9,20,0.35)',
                    transition: 'transform 160ms var(--ease-out), box-shadow 160ms ease',
                    outline: 'none',
                    letterSpacing: '0.02em',
                  }}
                  onMouseEnter={function(e) {
                    if (allowMotion) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                    }
                  }}
                  onMouseLeave={function(e) {
                    if (allowMotion) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(229,9,20,0.35)';
                    }
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(-1px)'; }
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.boxShadow = '0 6px 18px rgba(229,9,20,0.35)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(0)'; }
                  }}
                >
                  ▶ Watch
                </button>
                {/* Secondary CTA — translucent surface, pill radius to match
                    the primary so they read as a paired set. */}
                <button
                  className="hermes-focusable hermes-press"
                  tabIndex={0}
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onItemSelect) onItemSelect(featured);
                    }
                  }}
                  style={{
                    padding: '11px 26px',
                    background: 'rgba(109,109,110,0.7)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 700,
                    fontSize: 'calc(14px * ' + fontScale + ')',
                    cursor: 'pointer',
                    transition: 'transform 160ms var(--ease-out), background-color 160ms ease',
                    outline: 'none',
                  }}
                  onMouseEnter={function(e) {
                    e.currentTarget.style.background = 'rgba(140,140,142,0.78)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(-1px)'; }
                  }}
                  onMouseLeave={function(e) {
                    e.currentTarget.style.background = 'rgba(109,109,110,0.7)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(0)'; }
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(-1px)'; }
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.boxShadow = 'none';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(0)'; }
                  }}
                >
                  ⓘ More Info
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content rows */}
        <div style={{ paddingTop: '24px' }}>
          {/* Layout order per audit: Favorites → Continue Watching → Recently
              Watched → catalog. Each rail is purely additive — returns null
              when empty so degraded states never flash an empty header. */}
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
          <CardRow title="Top Picks For You" items={filtered} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} profile={profile} />
          <CardRow title="Live Now" items={liveItems} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} profile={profile} />
          <CardRow title="Movies" items={movies} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} profile={profile} />
          <CardRow title="New Arrivals" items={filtered.slice().reverse()} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} profile={profile} />
        </div>
      </div>
    </div>
  );
}

export default NetflixShell;
