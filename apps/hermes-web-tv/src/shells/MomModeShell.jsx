import React from 'react';
import { applyShellFilters, posterBg, useGridVirtualizer } from './shellHelpers.js';

var MOM_TABS = [
  { icon: '📡', label: 'Live TV', type: 'live' },
  { icon: '🎬', label: 'Movies', type: 'movies' },
  { icon: '📺', label: 'Series', type: 'series' },
];

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
    ? filtered.filter(function(i) { return i.type === 'live'; })
    : activeType === 'movies'
    ? filtered.filter(function(i) { return i.type === 'movies' || i.type === 'movie'; })
    : filtered.filter(function(i) { return i.type === 'series'; });
  var displayItems = tabItems.length > 0 ? tabItems : filtered;

  var cols = tier === 'enhanced' && fontScale < 1.5 ? 3 : 2;

  // Virtualize the poster grid when the catalog exceeds the threshold
  // (~100 items). Mom Mode renders the largest cards in the whole shell set
  // (260 px image + ~70 px title block + 20 px gap = ~360 px row), so the
  // raw paint cost on a long catalog is the highest of any shell. Below the
  // threshold the helper short-circuits to a full render with zero overhead.
  var gridScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: gridScrollRef,
    itemCount: displayItems.length,
    columns: cols,
    rowHeight: 360,
    overscan: 1,
  });

  return (
    <div style={{ background: '#1a1a2e', color: '#f0e6ff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* Greeting banner */}
      <div style={{ background: 'linear-gradient(135deg, #1e2a4a, #2a1a3e)', padding: '20px 28px', flexShrink: 0, borderBottom: '1px solid #2a2a4a' }}>
        <h1 style={{ fontSize: 'calc(24px * ' + fontScale + ')', fontWeight: 700, color: '#f0e6ff', letterSpacing: '-0.01em', margin: 0 }}>
          {getGreeting()}, <span style={{ color: '#ff7eb3' }}>{displayName}</span>! 👋
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
              tabIndex={0}
              aria-label={tab.label}
              onClick={function() { setActiveTab(i); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab(i);
                }
              }}
              style={{
                flex: 1,
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                border: 'none',
                borderBottom: isActive ? '4px solid #ff7eb3' : '4px solid transparent',
                background: isActive ? 'rgba(255,126,179,0.12)' : 'transparent',
                color: isActive ? '#ff7eb3' : '#c8b8e8',
                fontSize: 'calc(17px * ' + fontScale + ')',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: 'all 120ms',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '3px solid #ff7eb3'; e.currentTarget.style.outlineOffset = '-3px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
            >
              <span style={{ fontSize: 'calc(22px * ' + fontScale + ')' }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content grid */}
      <div ref={gridScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {displayItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', fontSize: 'calc(18px * ' + fontScale + ')', color: '#c8b8e8', lineHeight: 1.6 }}>
            Nothing here yet.<br />Try another category or ask Hermes!
          </div>
        ) : (
          <React.Fragment>
            {/* Top spacer — preserves scrollbar geometry for unmounted rows.
                height=0 when virtualization is off (catalog < threshold). */}
            {virt.topSpacer > 0 && (
              <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gap: '20px' }}>
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
                    borderRadius: '14px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '2px solid #2a2a4a',
                    transition: 'border-color 150ms, transform 150ms, box-shadow 150ms',
                    background: '#16213e',
                  }}
                  onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#ff7eb3'; if (!(profile && profile.reduced_motion)) e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#2a2a4a'; e.currentTarget.style.transform = 'scale(1)'; }}
                  onFocus={function(e) { e.currentTarget.style.borderColor = '#ff7eb3'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,126,179,0.35)'; }}
                  onBlur={function(e) { e.currentTarget.style.borderColor = '#2a2a4a'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ height: '260px', background: posterBg(item, idx), position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(255,126,179,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>▶</div>
                    {item.quality && (
                      <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', color: '#ff7eb3', fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 700, padding: '3px 8px', borderRadius: '4px' }}>{item.quality}</div>
                    )}
                    {item.type === 'live' && (
                      <div style={{ position: 'absolute', top: '10px', left: '10px', background: '#e50914', color: '#fff', fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 700, padding: '3px 8px', borderRadius: '4px' }}>🔴 LIVE</div>
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
        <div style={{ fontSize: 'calc(22px * ' + fontScale + ')', fontWeight: 700, color: '#ff7eb3' }}>{currentTime}</div>
        <div style={{ fontSize: 'calc(13px * ' + fontScale + ')', color: '#c8b8e8', textAlign: 'right' }}>
          Hermes is here to help — just ask! 💬
        </div>
      </div>
    </div>
  );
}

export default MomModeShell;
