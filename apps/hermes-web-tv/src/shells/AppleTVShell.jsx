import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';
import { capForProfile } from '../utils/isSystemLimited.js';

// ─────────────────────────────────────────────────────────────────────────────
// AppleTVShell — DaveTV's clean, glass-blur, big-typography layout, inspired
// by streaming-service visual vocabulary (cool blue accent, near-black canvas,
// wide spacious rows, glass nav, large pill CTAs). All copy is DaveTV
// branding — never reference "Apple TV" in user-visible strings. Polish pass
// mirrors the SOTA shared vocabulary from index.css + design/tokens.js:
//   - Radii consume var(--radius-md/lg/xl/pill) so the chunky rounded look
//     stays distinct from Netflix's tighter geometry but joins the same scale.
//   - Cards use the .hermes-card-hover utility (translateY(-2px) on hover/focus).
//   - Easing leans on var(--ease-out) and shadow tokens var(--shadow-md/lg).
//   - Primary Play CTA wears the white → faint-blue gradient pill so it keeps
//     the iconic Apple-TV cream look while gaining the cross-shell polish.
//   - Focus-visible state pulls var(--shadow-focus) so the remote nav glow is
//     identical to every other shell in the suite.
//   - Honours .motion-reduced on <body> by gating every transform/box-shadow
//     animation behind the `allowMotion` boolean we compute from the profile.
// Tizen 6.5 / Chrome 76 safe: no :has(), no @container, function(){} only.
// ─────────────────────────────────────────────────────────────────────────────

var APPLE_TABS = ['For You', 'Live TV', 'Movies', 'TV Shows'];

function HScrollRow(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  var cardW = props.cardW || 240;
  var cardH = props.cardH || 135;
  var fontScale = props.fontScale;
  var profile = props.profile;
  var tier = props.tier;
  // allowMotion is the single gate that respects the motion-reduced body
  // class — when the profile sets reduced_motion=true (or the tier is
  // degraded) we skip every transform animation. The .motion-reduced rule
  // in index.css clamps transition-duration to 0.01ms as belt + braces.
  var allowMotion = tier === 'enhanced' && !(profile && profile.reduced_motion);

  if (!items || items.length === 0) return null;
  // Mom-never-limited rule: Dave caps Apple rails at 10, Mom bypasses entirely.
  var rowCap = capForProfile(profile, 10);
  return (
    <div style={{ marginBottom: '32px' }}>
      <h3 style={{ margin: '0 0 12px 32px', fontSize: 'calc(17px * ' + fontScale + ')', fontWeight: 600, color: '#f5f5f7', letterSpacing: '-0.01em' }}>{title}</h3>
      <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', padding: '6px 32px 10px', scrollbarWidth: 'none' }}>
        {items.slice(0, rowCap).map(function(item, idx) {
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
                width: cardW + 'px',
                cursor: 'pointer',
                // md radius on the outer container — the artwork sits inside
                // with the same radius minus 2px for a clean inset look.
                borderRadius: 'var(--radius-md)',
                padding: '2px',
                border: '2px solid transparent',
                // Cross-shell card hover: translateY(-2px) lift, shared easing.
                transition: allowMotion
                  ? 'transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out), border-color 160ms ease'
                  : 'border-color 160ms ease, box-shadow 160ms ease',
                outline: 'none',
                willChange: allowMotion ? 'transform' : 'auto',
              }}
              onMouseEnter={function(e) {
                if (allowMotion) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={function(e) {
                if (allowMotion) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
              onFocus={function(e) {
                e.currentTarget.style.borderColor = '#0071e3';
                // Reuse the shared focus shadow so the keyboard/remote nav
                // halo matches Zero/Netflix/Mom-Mode exactly.
                e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                if (allowMotion) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onBlur={function(e) {
                e.currentTarget.style.borderColor = 'transparent';
                e.currentTarget.style.boxShadow = 'none';
                if (allowMotion) {
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              <div style={{ width: cardW + 'px', height: cardH + 'px', borderRadius: 'var(--radius-sm)', background: posterBg(item, idx), position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }}>
                {item.type === 'live' && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: 'linear-gradient(135deg, #e50914, #c1121f)',
                    color: '#fff',
                    fontSize: '9px',
                    fontWeight: 800,
                    padding: '3px 7px',
                    // Pill the LIVE badge to match the chip family across
                    // PlayerModal / Netflix quality badges.
                    borderRadius: 'var(--radius-pill)',
                    letterSpacing: '0.06em',
                    boxShadow: '0 2px 6px rgba(229,9,20,0.4)',
                  }}>LIVE</div>
                )}
              </div>
              <div style={{ marginTop: '8px', fontSize: 'calc(12px * ' + fontScale + ')', color: '#f5f5f7', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.005em' }}>{item.title}</div>
              {item.genre && <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#98989d', marginTop: '2px' }}>{item.genre}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AppleTVShell(props) {
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
  // Single source of truth for whether hero CTAs lift on hover/focus.
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

  // Nav style picks up the QN85 glass blur when tier is enhanced — the
  // -webkit- prefix is required for Chrome 76 (Tizen 6.5). On degraded
  // tiers we fall back to a solid surface so we don't tax the compositor.
  var navStyle = {
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    flexShrink: 0,
    zIndex: 10,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  };
  if (tier === 'enhanced') {
    navStyle.background = 'rgba(28,28,30,0.78)';
    navStyle['-webkit-backdrop-filter'] = 'blur(20px)';
    navStyle.backdropFilter = 'blur(20px)';
  } else {
    navStyle.background = '#1c1c1e';
  }

  return (
    <div style={{ background: '#1c1c1e', color: '#f5f5f7', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif" }}>

      {/* Nav */}
      <header style={navStyle}>
        <div style={{ fontWeight: 700, fontSize: 'calc(18px * ' + fontScale + ')', letterSpacing: '-0.02em' }}>
          ▶ Dave<span style={{ color: '#0071e3' }}>TV</span>
        </div>
        <nav style={{ display: 'flex', gap: '4px' }}>
          {APPLE_TABS.map(function(tab, i) {
            var isActive = activeTab === i;
            return (
              <button
                key={tab}
                data-focusable="true"
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
                  // Active tab gets the shared accent gradient as a soft
                  // background tint — keeps Apple-TV's monochrome chrome
                  // but joins the cross-shell accent family.
                  background: isActive ? 'var(--gradient-accent)' : 'transparent',
                  border: 'none',
                  color: isActive ? '#fff' : '#98989d',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-md)',
                  transition: 'background 160ms var(--ease-out), color 160ms ease',
                  outline: 'none',
                  letterSpacing: '-0.005em',
                }}
                onMouseEnter={function(e) {
                  if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }
                }}
                onMouseLeave={function(e) {
                  if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#98989d'; }
                }}
                onFocus={function(e) {
                  // Cross-shell focus halo — same recipe as Netflix/Zero so
                  // remote-nav users see one consistent glow.
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                  e.currentTarget.style.color = '#fff';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.color = isActive ? '#fff' : '#98989d';
                }}
              >
                {tab}
              </button>
            );
          })}
        </nav>
        <div style={{ width: '120px' }} />
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Continue Watching — first row above the hero. Returns null when
            the profile has no playback history yet so the hero remains the
            visual anchor for fresh-install users. */}
        <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} />

        {/* Hero */}
        {featured && (
          <div style={{ position: 'relative', height: '380px', background: posterBg(featured, 0), flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #1c1c1e 0%, rgba(28,28,30,0.4) 60%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: '40px', left: '32px', maxWidth: '520px' }}>
              <div style={{ fontSize: 'calc(38px * ' + fontScale + ')', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '10px', lineHeight: 1.1, textShadow: '0 2px 12px rgba(0,0,0,0.5)' }}>{featured.title}</div>
              {(featured.genre || featured.year) && (
                <div style={{ fontSize: 'calc(14px * ' + fontScale + ')', color: '#cfcfd3', marginBottom: '20px', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
                  {[featured.year, featured.genre, featured.duration].filter(Boolean).join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px' }}>
                {/* Primary Play CTA — keep the iconic cream-white look (it's
                    the Apple-TV signature) but layer a faint accent on hover
                    via box-shadow so it ties into the cross-shell vocab. */}
                <button
                  data-focusable="true"
                  tabIndex={0}
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onItemSelect) onItemSelect(featured);
                    }
                  }}
                  style={{
                    padding: '12px 30px',
                    background: 'linear-gradient(135deg, #ffffff, #f0f4ff)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 700,
                    fontSize: 'calc(14px * ' + fontScale + ')',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: 'var(--shadow-md)',
                    transition: 'transform 160ms var(--ease-out), box-shadow 160ms ease',
                    letterSpacing: '-0.005em',
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
                      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    }
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(-1px)'; }
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(0)'; }
                  }}
                >
                  ▶ Play
                </button>
                {/* Secondary — translucent glass, pill radius, matches the
                    primary so the pair reads as a balanced unit. */}
                <button
                  data-focusable="true"
                  tabIndex={0}
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onItemSelect) onItemSelect(featured);
                    }
                  }}
                  style={{
                    padding: '12px 30px',
                    background: 'rgba(255,255,255,0.18)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.14)',
                    borderRadius: 'var(--radius-pill)',
                    fontWeight: 600,
                    fontSize: 'calc(14px * ' + fontScale + ')',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'transform 160ms var(--ease-out), background-color 160ms ease',
                    letterSpacing: '-0.005em',
                  }}
                  onMouseEnter={function(e) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.28)';
                    if (allowMotion) { e.currentTarget.style.transform = 'translateY(-1px)'; }
                  }}
                  onMouseLeave={function(e) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.18)';
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
                  + Add to Library
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ paddingTop: '24px' }}>
          <HScrollRow title="Up Next" items={filtered} onItemSelect={onItemSelect} cardW={240} cardH={135} fontScale={fontScale} profile={profile} tier={tier} />
          <HScrollRow title="Trending Now" items={filtered.slice(2)} onItemSelect={onItemSelect} cardW={240} cardH={135} fontScale={fontScale} profile={profile} tier={tier} />
          <HScrollRow title="Movies" items={movies.length > 0 ? movies : filtered.slice(3)} onItemSelect={onItemSelect} cardW={130} cardH={195} fontScale={fontScale} profile={profile} tier={tier} />
          <HScrollRow title="Live Channels" items={liveItems.length > 0 ? liveItems : filtered.slice(1)} onItemSelect={onItemSelect} cardW={240} cardH={135} fontScale={fontScale} profile={profile} tier={tier} />
        </div>

        <footer style={{ textAlign: 'center', padding: '24px', fontSize: 'calc(11px * ' + fontScale + ')', color: '#9fa0a6' }}>DaveTV</footer>
      </div>
    </div>
  );
}

export default AppleTVShell;
