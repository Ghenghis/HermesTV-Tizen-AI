import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// SamsungShell — brand-native Tizen-feeling layout.
//
// Keeps the cobalt (#1428a0) accent as the Samsung-firmware visual cue but
// upgrades every surface to the shared design tokens introduced in PR #69 /
// #75:
//   - radii: var(--radius-xs|sm|md|lg|xl)
//   - shadows: var(--shadow-md|lg|focus)
//   - gradients: var(--gradient-accent) for the primary CTA
//   - hover-lift: translateY(-2px) on cards with the 180ms shared easing
//
// Tizen 6.5 (Chrome 76) safe — no :has(), no @container, no logical props.
// The cobalt accent is preserved as a literal (#1428a0) because that's the
// brand-firmware cue, not a tokenised value.
// ─────────────────────────────────────────────────────────────────────────────

var SAMSUNG_TABS = ['Live', 'Movies', 'Series', 'Sports', 'Kids'];
var SAMSUNG_ACCENT = '#1428a0';
var SAMSUNG_ACCENT_SOFT = 'rgba(20,40,160,0.25)';
var SAMSUNG_EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function SamsungShell(props) {
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
  var series = filtered.filter(function(i) { return isSeries(i); });
  var fontScale = (profile && profile.font_scale) || 1;
  var reducedMotion = !!(profile && profile.reduced_motion);
  var activeTabResult = React.useState(0);
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];

  React.useEffect(function() {
    var el = document.querySelector('[data-focusable="true"], [tabindex="0"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function SamsungRow(rowProps) {
    var title = rowProps.title;
    var items = rowProps.items;
    var cardW = rowProps.cardW || 200;
    var cardH = rowProps.cardH || 112;
    var showLive = rowProps.showLive;

    if (!items || items.length === 0) return null;
    return (
      <div style={{ marginBottom: '28px' }}>
        <h3 style={{ margin: '0 0 10px 24px', fontSize: 'calc(15px * ' + fontScale + ')', fontWeight: 600, color: '#e8e8e8' }}>{title}</h3>
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '4px 24px 8px', scrollbarWidth: 'none' }}>
          {items.slice(0, 10).map(function(item, idx) {
            return (
              <div
                key={item.id || idx}
                data-focusable="true"
                role="button"
                onClick={function() { if (onItemSelect) onItemSelect(item); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (onItemSelect) onItemSelect(item);
                  }
                }}
                style={{
                  flexShrink: 0,
                  width: cardW + 'px',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  border: '2px solid transparent',
                  // Hover-lift + box-shadow upgrade per PR #75 vocabulary. We
                  // animate transform + border-color + box-shadow only (no
                  // layout properties), capped at 180ms on the shared ease-out.
                  transition: 'transform 180ms ' + SAMSUNG_EASE_OUT + ', border-color 180ms ease, box-shadow 180ms ease',
                  willChange: 'transform',
                  transform: 'translateY(0)',
                  boxShadow: 'var(--shadow-md)',
                  outline: 'none',
                }}
                onMouseEnter={function(e) {
                  e.currentTarget.style.borderColor = SAMSUNG_ACCENT;
                  e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                  if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={function(e) {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                onFocus={function(e) {
                  e.currentTarget.style.borderColor = SAMSUNG_ACCENT;
                  e.currentTarget.style.boxShadow = '0 0 0 3px ' + SAMSUNG_ACCENT_SOFT + ', 0 12px 36px rgba(20,40,160,0.35)';
                  if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                tabIndex={0}
              >
                <div style={{ width: cardW + 'px', height: cardH + 'px', background: posterBg(item, idx), position: 'relative' }}>
                  {showLive && (
                    <div style={{ position: 'absolute', top: '6px', left: '6px', background: '#e50914', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-xs)', letterSpacing: '0.05em' }}>LIVE</div>
                  )}
                  {item.quality && (
                    <div style={{ position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: 'var(--radius-xs)' }}>{item.quality}</div>
                  )}
                </div>
                <div style={{ background: '#111', padding: '6px 8px', fontSize: 'calc(11px * ' + fontScale + ')', color: '#e8e8e8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#0d0d0d', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Samsung One', 'Noto Sans', sans-serif" }}>

      {/* Top bar — gentle gradient lift (surface-raised → surface) */}
      <header style={{ background: 'linear-gradient(180deg, #1a1a1a, #111)', height: '56px', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '24px', flexShrink: 0, borderBottom: '1px solid #222' }}>
        <div style={{ fontWeight: 700, fontSize: 'calc(18px * ' + fontScale + ')', color: '#fff' }}>
          Hermes<span style={{ color: SAMSUNG_ACCENT }}>TV</span>
        </div>
        <nav style={{ display: 'flex', gap: '4px' }}>
          {SAMSUNG_TABS.map(function(tab, i) {
            return (
              <button
                key={tab}
                data-focusable="true"
                tabIndex={0}
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
                  borderBottom: activeTab === i ? '3px solid ' + SAMSUNG_ACCENT : '3px solid transparent',
                  color: activeTab === i ? '#fff' : '#888',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  fontWeight: activeTab === i ? 600 : 400,
                  cursor: 'pointer',
                  padding: '0 14px',
                  height: '56px',
                  borderRadius: 'var(--radius-sm)',
                  transition: 'color 180ms ease, background-color 180ms ease',
                  outline: 'none',
                }}
                onFocus={function(e) {
                  e.currentTarget.style.outline = '2px solid ' + SAMSUNG_ACCENT;
                  e.currentTarget.style.outlineOffset = '-2px';
                  e.currentTarget.style.boxShadow = '0 0 0 3px ' + SAMSUNG_ACCENT_SOFT;
                }}
                onBlur={function(e) {
                  e.currentTarget.style.outline = 'none';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {tab}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* Featured banner */}
        {featured && (
          <div style={{ position: 'relative', height: '300px', background: posterBg(featured, 0), flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #0d0d0d 0%, rgba(13,13,13,0.3) 60%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: '24px', left: '24px', maxWidth: '460px' }}>
              {featured.genre && <div style={{ fontSize: 'calc(11px * ' + fontScale + ')', color: SAMSUNG_ACCENT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>{featured.genre}</div>}
              <div style={{ fontSize: 'calc(28px * ' + fontScale + ')', fontWeight: 700, marginBottom: '8px' }}>{featured.title}</div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {featured.year && <span style={{ fontSize: 'calc(12px * ' + fontScale + ')', color: '#888', background: '#1a1a1a', padding: '2px 10px', borderRadius: 'var(--radius-pill)' }}>{featured.year}</span>}
                {featured.quality && <span style={{ fontSize: 'calc(12px * ' + fontScale + ')', color: '#fff', background: SAMSUNG_ACCENT, padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>{featured.quality}</span>}
              </div>
              {/* Primary CTA — gradient accent + pill radius + shadow lift */}
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
                  padding: '10px 24px',
                  background: 'var(--gradient-accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  fontWeight: 700,
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: 'var(--shadow-md)',
                  transition: 'transform 180ms ' + SAMSUNG_EASE_OUT + ', box-shadow 180ms ease',
                  willChange: 'transform',
                }}
                onMouseEnter={function(e) {
                  e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                  if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={function(e) {
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                onFocus={function(e) {
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                  if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                ▶ Watch
              </button>
            </div>
          </div>
        )}

        <div style={{ paddingTop: '20px' }}>
          {/* Continue Watching — first row, sits above the Live / Movies /
              Series rows. Returns null on profiles with no playback history. */}
          <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} />
          <SamsungRow title="Live Channels" items={liveItems.length > 0 ? liveItems : filtered.slice(0, 6)} cardW={200} cardH={112} showLive={true} />
          <SamsungRow title="Trending Movies" items={movies.length > 0 ? movies : filtered.slice(2)} cardW={130} cardH={195} showLive={false} />
          <SamsungRow title="Popular Series" items={series.length > 0 ? series : filtered.slice(3)} cardW={130} cardH={195} showLive={false} />
        </div>
      </div>
    </div>
  );
}

export default SamsungShell;
