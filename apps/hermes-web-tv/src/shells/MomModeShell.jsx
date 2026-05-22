import React from 'react';
import { applyShellFilters, posterBg, useGridVirtualizer } from './shellHelpers.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';
import WatchlistRail from '../components/WatchlistRail.jsx';
import { isMovie, isSeries, isLive } from '../utils/contentFilters.js';

// ─────────────────────────────────────────────────────────────────────────────
// MomModeShell — Sherri's primary layout.
//
// Design intent (per CLAUDE.md): Mom's TV is NEVER system-limited. We
// upgrade the calm/warm aesthetic rather than degrade it. Larger font
// scale already arrives via profile; this polish layer adds:
//   - Softer, larger radii (var(--radius-lg) / --radius-xl on cards and CTAs)
//   - Gentler shadows (var(--shadow-md) at rest, --shadow-lg on hover)
//   - --gradient-warm on the primary play indicator for a hearth-fire feel
//   - 180ms ease-out hover-lift (translateY(-2px)) — gated on reduced_motion
//
// The mom-calm palette (#1a1a2e bg, #ff7eb3 accent, #f0e6ff text) stays
// EXACTLY as-is. We only swap the geometry tokens and the play-indicator
// gradient; we do NOT touch the colour identity.
//
// Tizen 6.5 / Chrome 76 safe — no :has(), no @container, no logical props.
// ─────────────────────────────────────────────────────────────────────────────

var MOM_TABS = [
  { icon: '📡', label: 'Live TV', type: 'live' },
  { icon: '🎬', label: 'Movies', type: 'movies' },
  { icon: '📺', label: 'Series', type: 'series' },
];

var MOM_ACCENT = '#ff7eb3';
var MOM_ACCENT_SOFT = 'rgba(255,126,179,0.35)';
var MOM_EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

function getGreeting() {
  var h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTimeStr() {
  var d = new Date();
  var h = d.getHours();
  var m = d.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
}

function MomModeShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);
  var fontScale = Math.max(1.4, (profile && profile.font_scale) || 1.4);
  var displayName = (profile && profile.display_name) || 'Sherri';
  // Reduced-motion is honoured by short-circuiting the transform-on-hover.
  // The shared .motion-reduced body class already clamps animation durations
  // globally — this guard keeps us from kicking off transform changes that
  // would still render once before that clamp catches them.
  var reducedMotion = !!(profile && profile.reduced_motion);

  var activeTabResult = React.useState(0);
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];

  var timeResult = React.useState(getTimeStr());
  var currentTime = timeResult[0];
  var setCurrentTime = timeResult[1];

  React.useEffect(function() {
    var interval = setInterval(function() { setCurrentTime(getTimeStr()); }, 30000);
    return function() { clearInterval(interval); };
  }, []);

  React.useEffect(function() {
    var el = document.querySelector('[data-focusable="true"], [tabindex="0"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  var activeType = MOM_TABS[activeTab].type;
  var tabItems = activeType === 'live'
    ? filtered.filter(isLive)
    : activeType === 'movies'
    ? filtered.filter(isMovie)
    : filtered.filter(isSeries);
  var displayItems = tabItems.length > 0 ? tabItems : filtered;

  // Mom's TV is never system-limited — we use an auto-fill grid keyed off
  // a senior-friendly minimum card width (320 px). At the 1920×1080 TV
  // viewport that yields ~5 columns of ~336 px-wide cards, well within
  // presbyopia readable distance from the couch; at 1280 it drops to 3-4,
  // at 720 to 2. Tier is intentionally ignored — Mom's shell never reads
  // a degraded layout per the never-limited rule.
  var MOM_MIN_CARD_PX = 320;
  // Virtualization row height keyed to the new card geometry. With auto-fill
  // we cannot read the rendered column count at hook time, so we estimate
  // the dominant case: a 320-px-wide card with the live 5:3 aspect renders
  // a ~192 px image; +14+16 padding +18 title row +8 sub-row = ~70 px text
  // block; +20 px row gap → 282 px. Round up to 290 to be slightly
  // conservative (a too-large rowHeight just mounts a few extra rows).
  var gridScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: gridScrollRef,
    itemCount: displayItems.length,
    // Estimate of rendered columns at this viewport for the virtualizer's
    // index math. The on-screen grid uses auto-fill and is not constrained
    // by this number — it only affects how many rows are kept mounted.
    columns: Math.max(2, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 1920) / (MOM_MIN_CARD_PX + 20))),
    rowHeight: 290,
    // W9-VIRTUALIZE: Mom gets a larger overscan (4 rows) so the next row is
    // ready before her slower remote-scroll reaches it. Dave-shells use 2.
    // This is a perf-feel tweak, not a content cap — Mom still sees the
    // entire filtered catalog (see MEMORY: "Mom's TV is never system-limited").
    overscan: 4,
  });

  function _focusMomTab(index) {
    var el = document.querySelector('[data-mom-tab-index="' + index + '"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }

  function _handleMomTabKey(e, index) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.stopPropagation) { e.stopPropagation(); }
      setActiveTab(index);
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Right') {
      e.preventDefault();
      if (e.stopPropagation) { e.stopPropagation(); }
      _focusMomTab((index + 1) % MOM_TABS.length);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'Left') {
      e.preventDefault();
      if (e.stopPropagation) { e.stopPropagation(); }
      _focusMomTab((index + MOM_TABS.length - 1) % MOM_TABS.length);
    }
  }

  return (
    <div style={{ background: '#1a1a2e', color: '#f0e6ff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* Greeting banner — gentle warm overlay over the calm-purple base */}
      <div style={{ background: 'linear-gradient(135deg, #1e2a4a, #2a1a3e)', padding: '20px 28px', flexShrink: 0, borderBottom: '1px solid #2a2a4a' }}>
        <h1 style={{ fontSize: 'calc(24px * ' + fontScale + ')', fontWeight: 700, color: '#f0e6ff', letterSpacing: '-0.01em', margin: 0 }}>
          {getGreeting()}, <span style={{ color: MOM_ACCENT }}>{displayName}</span>! 👋
        </h1>
        <h2 style={{ fontSize: 'calc(14px * ' + fontScale + ')', color: '#c8b8e8', marginTop: '6px', marginBottom: 0, fontWeight: 'normal' }}>
          What would you like to watch today?
        </h2>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '0', flexShrink: 0, background: '#16213e', borderBottom: '1px solid #2a2a4a' }}>
        {MOM_TABS.map(function(tab, i) {
          var isActive = i === activeTab;
          return (
            <button
              key={tab.label}
              data-focusable="true"
              data-mom-tab-index={i}
              tabIndex={0}
              aria-label={tab.label}
              onClick={function() { setActiveTab(i); }}
              onKeyDown={function(e) { _handleMomTabKey(e, i); }}
              style={{
                flex: 1,
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                borderBottom: isActive ? '4px solid ' + MOM_ACCENT : '4px solid transparent',
                background: isActive ? 'rgba(255,126,179,0.12)' : 'transparent',
                color: isActive ? MOM_ACCENT : '#c8b8e8',
                fontSize: 'calc(17px * ' + fontScale + ')',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'color 180ms ease, background-color 180ms ease, box-shadow 180ms ease',
                outline: 'none',
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '3px solid ' + MOM_ACCENT;
                e.currentTarget.style.outlineOffset = '-3px';
                e.currentTarget.style.boxShadow = '0 0 0 3px ' + MOM_ACCENT_SOFT;
              }}
              onBlur={function(e) {
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <span style={{ fontSize: 'calc(22px * ' + fontScale + ')' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content grid */}
      <div ref={gridScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Continue Watching — first row of the scrolling content, with WARM
            gradient on the progress bar so it harmonises with the calm
            mom-mode palette. Returns null on profiles with no history. */}
        <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} warmGradient={true} />
        {/* Watchlist — Sherri's "Save for Later". Renders null when empty so
            Mom-mode never shows a noisy header until she's actually added a
            title. The rail picks up profile.font_scale automatically, so
            Mom-mode's larger type carries through. */}
        <WatchlistRail profile={profile} items={filtered} onItemSelect={onItemSelect} fontScale={fontScale} />
        {displayItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', fontSize: 'calc(18px * ' + fontScale + ')', color: '#c8b8e8', lineHeight: 1.6 }}>
            Nothing here yet.<br />Try another category or ask DaveTV!
          </div>
        ) : (
          <React.Fragment>
            {/* Top spacer — preserves scrollbar geometry for unmounted rows.
                height=0 when virtualization is off (catalog < threshold). */}
            {virt.topSpacer > 0 && (
              <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(' + MOM_MIN_CARD_PX + 'px, 1fr))', gap: '20px' }}>
            {displayItems.slice(virt.startIndex, virt.endIndex).map(function(item, sliceIdx) {
              var idx = virt.startIndex + sliceIdx;
              return (
                <div
                  key={item.id || idx}
                  data-focusable="true"
                  tabIndex={0}
                  role="button"
                  onClick={function() { if (onItemSelect) onItemSelect(item); }}
                  onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onItemSelect) onItemSelect(item); } }}
                  style={{
                    // Larger, softer radius — the calm aesthetic carries on
                    // every corner; xl on the card body, the inner play
                    // indicator gets pill rounding below.
                    borderRadius: 'var(--radius-xl)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '2px solid #2a2a4a',
                    // Hover-lift on the shared 180ms ease-out; transform is
                    // gated on reduced_motion so Sherri's preference wins.
                    transition: 'border-color 180ms ease, transform 180ms ' + MOM_EASE_OUT + ', box-shadow 180ms ease',
                    background: '#16213e',
                    boxShadow: 'var(--shadow-md)',
                    willChange: 'transform',
                    transform: 'translateY(0)',
                    outline: 'none',
                  }}
                  onMouseEnter={function(e) {
                    e.currentTarget.style.borderColor = MOM_ACCENT;
                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                    if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={function(e) {
                    e.currentTarget.style.borderColor = '#2a2a4a';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.borderColor = MOM_ACCENT;
                    e.currentTarget.style.boxShadow = 'var(--shadow-focus)';
                    if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.borderColor = '#2a2a4a';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ aspectRatio: (item.type === 'vod' || item.type === 'movies' || item.type === 'movie' || item.type === 'series') ? '2 / 3' : '5 / 3', background: posterBg(item, idx), position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Primary play indicator — warm gradient + pill radius +
                        soft lifted shadow. This is the "primary CTA" surface
                        Mom sees on every card so it gets the warm token. */}
                    <div style={{
                      width: '72px',
                      height: '72px',
                      borderRadius: 'var(--radius-pill)',
                      background: 'var(--gradient-warm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '30px',
                      color: '#fff',
                      boxShadow: 'var(--shadow-md)',
                    }}>▶</div>
                    {item.quality && (
                      <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', color: MOM_ACCENT, fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-pill)' }}>{item.quality}</div>
                    )}
                    {item.type === 'live' && (
                      <div style={{ position: 'absolute', top: '10px', left: '10px', background: '#e50914', color: '#fff', fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-pill)' }}>🔴 LIVE</div>
                    )}
                  </div>
                  <div style={{ padding: '14px 16px 16px' }}>
                    <div style={{ fontSize: 'calc(18px * ' + fontScale + ')', fontWeight: 700, color: '#f0e6ff', lineHeight: 1.3, marginBottom: '6px' }}>{item.title}</div>
                    {(item.year || item.genre) && (
                      <div style={{ fontSize: 'calc(13px * ' + fontScale + ')', color: '#c8b8e8' }}>
                        {[item.year, item.genre].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
            {/* Bottom spacer — preserves scrollbar geometry for unmounted
                trailing rows. height=0 when virtualization is off. */}
            {virt.bottomSpacer > 0 && (
              <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
            )}
          </React.Fragment>
        )}
      </div>

      {/* Bottom status bar */}
      <div style={{ background: '#16213e', borderTop: '1px solid #2a2a4a', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontSize: 'calc(22px * ' + fontScale + ')', fontWeight: 700, color: MOM_ACCENT }}>{currentTime}</div>
        <div style={{ fontSize: 'calc(13px * ' + fontScale + ')', color: '#c8b8e8', textAlign: 'right' }}>
          DaveTV is here to help — just ask! 💬
        </div>
      </div>
    </div>
  );
}

export default MomModeShell;
