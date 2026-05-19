import React from 'react';
import { applyShellFilters, useGridVirtualizer } from './shellHelpers.js';

var NAV_ITEMS = [
  { icon: '📺', label: 'Live' },
  { icon: '🎬', label: 'Movies' },
  { icon: '📺', label: 'Series' },
  { icon: '🔍', label: 'Search' },
];

var TIME_SLOTS = ['Now', '+30m', '+1h', '+90m', '+2h'];

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
        <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: 'calc(18px * ' + fontScale + ')', color: '#fff', borderBottom: '1px solid #1b1f27', letterSpacing: '0.5px', flexShrink: 0 }}>
          Hermes<span style={{ color: '#ff7d3a' }}>TV</span>
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
                  borderLeft: isActive ? '3px solid #ff7d3a' : '3px solid transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  background: isActive ? 'linear-gradient(90deg, rgba(255,125,58,0.18) 0%, transparent 100%)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 120ms, box-shadow 120ms',
                  color: isActive ? '#fff' : '#8b95a5',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                onMouseEnter={function(e) { if (!isActive) e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={function(e) { if (!isActive) e.currentTarget.style.color = '#8b95a5'; }}
                onFocus={function(e) { e.currentTarget.style.borderLeft = '3px solid #ff7d3a'; e.currentTarget.style.boxShadow = 'inset 0 0 0 2px rgba(255,125,58,0.35)'; e.currentTarget.style.color = '#fff'; }}
                onBlur={function(e) { e.currentTarget.style.borderLeft = isActive ? '3px solid #ff7d3a' : '3px solid transparent'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.color = isActive ? '#fff' : '#8b95a5'; }}
              >
                <span style={{ color: '#8c95a5', fontSize: 'calc(11px * ' + fontScale + ')', width: '26px', fontWeight: 600 }}>{idx + 1}</span>
                <span style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#1d2330', display: 'grid', placeItems: 'center', fontSize: '14px', flexShrink: 0 }}>📺</span>
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

        {/* Bottom nav */}
        <div style={{ borderTop: '1px solid #1b1f27', padding: '8px 0', flexShrink: 0 }}>
          {NAV_ITEMS.map(function(n) {
            return (
              <div key={n.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', fontSize: 'calc(12px * ' + fontScale + ')', color: '#8c95a5', cursor: 'pointer' }}>
                <span>{n.icon}</span><span>{n.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main EPG area */}
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', overflow: 'hidden' }}>
        {/* Time header */}
        <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)', background: '#13171f', borderBottom: '1px solid #1b1f27', padding: '10px 0', fontSize: 'calc(11px * ' + fontScale + ')', color: '#8c95a5', fontWeight: 600, flexShrink: 0 }}>
          <div style={{ padding: '0 12px' }}>Channel</div>
          {TIME_SLOTS.map(function(t, i) {
            return <div key={t} style={{ padding: '0 12px', color: i === 0 ? '#ff7d3a' : '#8c95a5' }}>{t}</div>;
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
                  <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#1d2330', display: 'grid', placeItems: 'center', fontSize: '14px' }}>📺</div>
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
                      onClick={function() { if (onItemSelect) onItemSelect(prog); }}
                      onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onItemSelect) onItemSelect(prog); } }}
                      style={{
                        borderLeft: '1px solid #161a22',
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        background: isLive ? 'linear-gradient(90deg, rgba(255,125,58,0.22) 0%, rgba(255,125,58,0.05) 100%)' : 'transparent',
                        borderLeftColor: isLive ? '#ff7d3a' : '#161a22',
                        borderLeftWidth: isLive ? '2px' : '1px',
                        transition: 'background 120ms, box-shadow 120ms',
                        overflow: 'hidden',
                        outline: 'none',
                      }}
                      onMouseEnter={function(e) { if (!isLive) e.currentTarget.style.background = 'rgba(255,125,58,0.07)'; }}
                      onMouseLeave={function(e) { if (!isLive) e.currentTarget.style.background = 'transparent'; }}
                      onFocus={function(e) { e.currentTarget.style.background = isLive ? 'linear-gradient(90deg, rgba(255,125,58,0.32) 0%, rgba(255,125,58,0.1) 100%)' : 'rgba(255,125,58,0.15)'; e.currentTarget.style.boxShadow = 'inset 0 0 0 2px #ff7d3a'; }}
                      onBlur={function(e) { e.currentTarget.style.background = isLive ? 'linear-gradient(90deg, rgba(255,125,58,0.22) 0%, rgba(255,125,58,0.05) 100%)' : 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
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
