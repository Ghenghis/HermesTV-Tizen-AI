import React from 'react';
import { applyShellFilters, useGridVirtualizer } from './shellHelpers.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// TiviMateShell — HermesTV's IPTV / EPG-style layout.
//
// Visual identity: narrow channel rail on the left, EPG time grid on the right
// with the orange sunset accent reading "live event guide." HermesTV branding
// only — never reference upstream IPTV-player names in user-visible strings.
//
// SOTA polish per PR #75: design tokens (--radius-*, --shadow-*, --ease-out,
// --shadow-focus), hover-lift on EPG cells + channel rows, gradient-accent
// primary CTA (the bottom-nav "Search" pill), focus-visible halo, reduced-
// motion respect.
//
// Tizen 6.5 / Chrome 76 safe: no :has(), no @container, no logical props,
// ES5-style function declarations to match the rest of the shell layer.
// ─────────────────────────────────────────────────────────────────────────────

var NAV_ITEMS = [
  { icon: '📺', label: 'Live' },
  { icon: '🎬', label: 'Movies' },
  { icon: '📺', label: 'Series' },
  { icon: '🔍', label: 'Search' },
];

var TIME_SLOTS = ['Now', '+30m', '+1h', '+90m', '+2h'];

// TiviMate shell's signature orange accent — used inline as a fallback when
// the active theme doesn't override --accent. Identity-preserving.
var TM_ACCENT = '#ff7d3a';

function TiviMateShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);
  var liveItems = filtered.filter(function(i) { return i.type === 'live'; });
  var channelList = liveItems.length > 0 ? liveItems : filtered;

  var activeIdxResult = React.useState(0);
  var activeIdx = activeIdxResult[0];
  var setActiveIdx = activeIdxResult[1];

  // Honour the profile-level reduced-motion flag so we can skip the
  // translateY hover-lift before the .motion-reduced CSS even applies.
  // This is belt-and-braces — the body class already collapses transition
  // durations to 0.01ms — but it lets us avoid setting a transform style
  // at all on the reduced-motion path.
  var allowMotion = !(profile && profile.reduced_motion);

  React.useEffect(function() {
    var el = document.querySelector('[data-focusable="true"], [tabindex="0"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  var fontScale = (profile && profile.font_scale) || 1;

  // Virtualize both the sidebar channel list and the EPG row list. Both
  // surfaces render the same `channelList` so on a 500-channel M3U they
  // each previously mounted ~500 buttons / rows. Tizen 6.5 RAM budget
  // can't take that. Sidebar rows are roughly 44 px (compact button),
  // EPG rows are a fixed 64 px (`height: 64px` below). Both short-circuit
  // when channelList.length < threshold.
  var sidebarScrollRef = React.useRef(null);
  var sidebarVirt = useGridVirtualizer({
    scrollRef: sidebarScrollRef,
    itemCount: channelList.length,
    columns: 1,
    rowHeight: 44,
    overscan: 3,
  });
  var epgScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: epgScrollRef,
    itemCount: channelList.length,
    columns: 1,
    rowHeight: 64,
    overscan: 2,
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%', background: '#0e1217', color: '#e6e9ef', fontFamily: "'Roboto', sans-serif", overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{ background: '#0a0d12', borderRight: '1px solid #1b1f27', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          padding: '16px 18px',
          fontWeight: 800,
          fontSize: 'calc(18px * ' + fontScale + ')',
          color: '#fff',
          borderBottom: '1px solid #1b1f27',
          letterSpacing: '0.04em',
          flexShrink: 0,
          // Gradient header band — mirrors the .hermes-gradient-header
          // recipe so the shell's top edge tells the same story as every
          // modal in the app.
          background: 'linear-gradient(180deg, #131720, #0a0d12)',
        }}>
          Hermes<span style={{
            // Wordmark accent gets a gradient fill so the "TV" stop reads
            // as part of the shared --gradient-accent family.
            backgroundImage: 'linear-gradient(135deg, ' + TM_ACCENT + ', #f59e0b)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
          }}>TV</span>
        </div>

        <div ref={sidebarScrollRef} style={{ flex: 1, overflowY: 'auto' }}>
          {/* Top spacer — preserves scrollbar geometry for unmounted rows.
              height=0 when virtualization is off (channels < threshold). */}
          {sidebarVirt.topSpacer > 0 && (
            <div aria-hidden="true" style={{ height: sidebarVirt.topSpacer + 'px' }} />
          )}
          {channelList.slice(sidebarVirt.startIndex, sidebarVirt.endIndex).map(function(item, sliceIdx) {
            var idx = sidebarVirt.startIndex + sliceIdx;
            var isActive = idx === activeIdx;
            return (
              <button
                key={item.id || idx}
                data-focusable="true"
                tabIndex={0}
                aria-label={item.title || 'Channel ' + (idx + 1)}
                onClick={function() { setActiveIdx(idx); if (onItemSelect) onItemSelect(item); }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveIdx(idx);
                    if (onItemSelect) onItemSelect(item);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  textAlign: 'left',
                  padding: isActive ? '11px 18px 11px 15px' : '11px 18px',
                  borderLeft: isActive ? '3px solid ' + TM_ACCENT : '3px solid transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  background: isActive ? 'linear-gradient(90deg, rgba(255,125,58,0.20) 0%, transparent 100%)' : 'transparent',
                  cursor: 'pointer',
                  // 180ms cubic-bezier cadence matches the .hermes-card-hover
                  // and PlexShell tile transitions — every interactive
                  // surface in the app shares one easing curve.
                  transition: 'background-color 180ms cubic-bezier(0.16, 1, 0.3, 1), color 180ms ease, box-shadow 180ms ease',
                  color: isActive ? '#fff' : '#8b95a5',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  fontFamily: 'inherit',
                  outline: 'none',
                  // Soften the right edge of the channel row so the active
                  // strip doesn't slam into the panel border.
                  borderTopRightRadius: 'var(--radius-sm, 8px)',
                  borderBottomRightRadius: 'var(--radius-sm, 8px)',
                }}
                onMouseEnter={function(e) { if (!isActive) e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={function(e) { if (!isActive) e.currentTarget.style.color = '#8b95a5'; }}
                onFocus={function(e) {
                  e.currentTarget.style.borderLeft = '3px solid ' + TM_ACCENT;
                  // Shared --shadow-focus halo — falls back to an inset
                  // orange ring keyed to the shell's identity color.
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus, inset 0 0 0 2px rgba(255,125,58,0.5))';
                  e.currentTarget.style.color = '#fff';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.borderLeft = isActive ? '3px solid ' + TM_ACCENT : '3px solid transparent';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.color = isActive ? '#fff' : '#8b95a5';
                }}
              >
                <span style={{ color: '#8c95a5', fontSize: 'calc(11px * ' + fontScale + ')', width: '26px', fontWeight: 600 }}>{idx + 1}</span>
                <span style={{
                  width: '34px',
                  height: '34px',
                  // Channel logo bubble uses --radius-sm (8px) so it reads
                  // as a tile rather than a sharp square — matches the
                  // EPG cell rounding below.
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: '#1d2330',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: '14px',
                  flexShrink: 0,
                  boxShadow: 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))',
                }}>📺</span>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Channel ' + (idx + 1)}</span>
              </button>
            );
          })}
          {/* Bottom spacer — preserves scrollbar geometry for unmounted
              trailing rows. height=0 when virtualization is off. */}
          {sidebarVirt.bottomSpacer > 0 && (
            <div aria-hidden="true" style={{ height: sidebarVirt.bottomSpacer + 'px' }} />
          )}
        </div>

        {/* Bottom nav — gradient header band visually anchors the rail's foot */}
        <div style={{
          borderTop: '1px solid #1b1f27',
          padding: '10px 12px',
          flexShrink: 0,
          background: 'linear-gradient(180deg, #0a0d12, #060810)',
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
        }}>
          {NAV_ITEMS.map(function(n) {
            // The "Search" entry is the primary CTA — gets the gradient
            // accent pill treatment so it reads like a tab anchor, not just
            // another rail item.
            var isPrimary = n.label === 'Search';
            return (
              <div
                key={n.label}
                tabIndex={0}
                role="button"
                aria-label={n.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  // var(--radius-pill) pill geometry on every bottom-nav
                  // entry — even the secondary ones — so the cluster reads
                  // like a tab strip rather than rail rows.
                  padding: '8px 14px',
                  fontSize: 'calc(12px * ' + fontScale + ')',
                  color: isPrimary ? '#0a0e1a' : '#8c95a5',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-pill, 9999px)',
                  background: isPrimary
                    ? 'linear-gradient(135deg, ' + TM_ACCENT + ', #f59e0b)'
                    : 'transparent',
                  fontWeight: isPrimary ? 800 : 500,
                  letterSpacing: isPrimary ? '0.04em' : '0',
                  boxShadow: isPrimary
                    ? 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))'
                    : 'none',
                  transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 180ms ease, color 180ms ease, box-shadow 180ms ease',
                  outline: 'none',
                }}
                onMouseEnter={function(e) {
                  if (!isPrimary) e.currentTarget.style.color = '#fff';
                  if (allowMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={function(e) {
                  if (!isPrimary) e.currentTarget.style.color = '#8c95a5';
                  e.currentTarget.style.transform = 'none';
                }}
                onFocus={function(e) {
                  e.currentTarget.style.boxShadow = 'var(--shadow-focus, 0 0 0 3px rgba(255,125,58,0.5))';
                  if (allowMotion) e.currentTarget.style.transform = 'translateY(-2px)';
                  if (!isPrimary) e.currentTarget.style.color = '#fff';
                }}
                onBlur={function(e) {
                  e.currentTarget.style.boxShadow = isPrimary
                    ? 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))'
                    : 'none';
                  e.currentTarget.style.transform = 'none';
                  if (!isPrimary) e.currentTarget.style.color = '#8c95a5';
                }}
              >
                <span>{n.icon}</span><span>{n.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main EPG area */}
      <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', overflow: 'hidden' }}>
        {/* Continue Watching — compact 4-card rail above the EPG. Returns
            null when the profile has no history, so the EPG stays flush
            against the top edge for fresh-install users. */}
        <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} max={4} />
        {/* Time header — gradient surface band matches sidebar foot recipe */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '200px repeat(5, 1fr)',
          background: 'linear-gradient(180deg, #161b25, #13171f)',
          borderBottom: '1px solid #1b1f27',
          padding: '12px 0',
          fontSize: 'calc(11px * ' + fontScale + ')',
          color: '#8c95a5',
          fontWeight: 600,
          flexShrink: 0,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          <div style={{ padding: '0 12px' }}>Channel</div>
          {TIME_SLOTS.map(function(t, i) {
            return <div key={t} style={{ padding: '0 12px', color: i === 0 ? TM_ACCENT : '#8c95a5' }}>{t}</div>;
          })}
        </div>

        {/* EPG rows */}
        <div ref={epgScrollRef} style={{ overflowY: 'auto' }}>
          {/* Top spacer — preserves scrollbar geometry for unmounted rows.
              height=0 when virtualization is off (channels < threshold). */}
          {virt.topSpacer > 0 && (
            <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
          )}
          {channelList.slice(virt.startIndex, virt.endIndex).map(function(item, sliceIdx) {
            var idx = virt.startIndex + sliceIdx;
            var prog1 = channelList[(idx + 1) % channelList.length];
            var prog2 = channelList[(idx + 2) % channelList.length];
            var prog3 = channelList[(idx + 3) % channelList.length];
            return (
              <div key={item.id || idx} style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)', borderBottom: '1px solid #161a22', height: '64px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 12px', background: '#10131a' }}>
                  <span style={{ color: '#8c95a5', fontSize: 'calc(11px * ' + fontScale + ')', width: '26px', fontWeight: 600 }}>{idx + 1}</span>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: 'var(--radius-sm, 8px)',
                    background: '#1d2330',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: '14px',
                    boxShadow: 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))',
                  }}>📺</div>
                  <span style={{ fontSize: 'calc(13px * ' + fontScale + ')', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                </div>
                {[item, prog1, prog2, prog3, prog3].map(function(prog, si) {
                  var isLive = si === 0;
                  return (
                    <div
                      key={si}
                      data-focusable="true"
                      tabIndex={0}
                      role="button"
                      aria-label={(prog && prog.title) || 'Programme'}
                      onClick={function() { if (onItemSelect) onItemSelect(prog); }}
                      onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onItemSelect) onItemSelect(prog); } }}
                      style={{
                        borderLeft: '1px solid #161a22',
                        // EPG cells round inside the row so each programme
                        // reads as a card rather than a hard grid cell.
                        // Margins keep the 1px row dividers intact.
                        margin: '6px 4px',
                        borderRadius: 'var(--radius-sm, 8px)',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: isLive ? 'linear-gradient(90deg, rgba(255,125,58,0.22) 0%, rgba(255,125,58,0.05) 100%)' : 'transparent',
                        borderLeftColor: isLive ? TM_ACCENT : '#161a22',
                        borderLeftWidth: isLive ? '2px' : '1px',
                        // 180ms cubic-bezier — same easing as the modal layer
                        transition: 'background-color 180ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 180ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                        overflow: 'hidden',
                        outline: 'none',
                      }}
                      onMouseEnter={function(e) {
                        if (!isLive) e.currentTarget.style.background = 'rgba(255,125,58,0.07)';
                        if (allowMotion) e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={function(e) {
                        if (!isLive) e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.transform = 'none';
                      }}
                      onFocus={function(e) {
                        e.currentTarget.style.background = isLive ? 'linear-gradient(90deg, rgba(255,125,58,0.34) 0%, rgba(255,125,58,0.12) 100%)' : 'rgba(255,125,58,0.18)';
                        // Shared focus halo — same recipe the modal panels
                        // use, so remote-control users see a single visual
                        // language whether they're in an EPG cell or a modal.
                        e.currentTarget.style.boxShadow = 'var(--shadow-focus, inset 0 0 0 2px rgba(255,125,58,0.6))';
                        if (allowMotion) e.currentTarget.style.transform = 'translateY(-1px)';
                      }}
                      onBlur={function(e) {
                        e.currentTarget.style.background = isLive ? 'linear-gradient(90deg, rgba(255,125,58,0.22) 0%, rgba(255,125,58,0.05) 100%)' : 'transparent';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <div style={{ fontSize: 'calc(12px * ' + fontScale + ')', fontWeight: 600, color: '#e6e9ef', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {(prog && prog.title) || '—'}
                      </div>
                      <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8c95a5', marginTop: '3px' }}>
                        {isLive ? '🔴 LIVE' : (prog && prog.genre) || ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {/* Bottom spacer — preserves scrollbar geometry for unmounted
              trailing rows. height=0 when virtualization is off. */}
          {virt.bottomSpacer > 0 && (
            <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
          )}
          {channelList.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8c95a5', fontSize: 'calc(14px * ' + fontScale + ')' }}>
              No channels match your current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TiviMateShell;
