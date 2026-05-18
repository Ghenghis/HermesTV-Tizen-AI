import React from 'react';

function applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter) {
  return (catalog || []).filter(function(item) {
    if (contentFilter !== 'all' && item.type !== contentFilter) return false;
    if (providerFilter !== 'all' && item.provider_id !== providerFilter) return false;
    if (qualityFilter !== 'all') {
      var q = (item.quality || '').toUpperCase();
      if (qualityFilter === '4K' && q.indexOf('4K') === -1 && q.indexOf('2160') === -1) return false;
      if (qualityFilter === '1080p+' && q.indexOf('1080') === -1 && q.indexOf('4K') === -1 && q.indexOf('2160') === -1) return false;
      if (qualityFilter === '720p+' && q.indexOf('720') === -1 && q.indexOf('1080') === -1 && q.indexOf('4K') === -1) return false;
    }
    return true;
  });
}

var GRADIENT_PALETTE = [
  'linear-gradient(135deg,#1a1a2e,#16213e)',
  'linear-gradient(135deg,#0f3460,#e94560)',
  'linear-gradient(135deg,#1b1b2f,#2b2d42)',
  'linear-gradient(135deg,#2c003e,#6a0572)',
  'linear-gradient(135deg,#0d1117,#1f6feb)',
  'linear-gradient(135deg,#1a0a00,#ff7d3a)',
  'linear-gradient(135deg,#001a0d,#00d4aa)',
  'linear-gradient(135deg,#1a0000,#e50914)',
];
function posterBg(item, idx) {
  if (item && item.poster) return 'url(' + item.poster + ') center/cover no-repeat';
  if (item && item.thumb) return 'url(' + item.thumb + ') center/cover no-repeat';
  return GRADIENT_PALETTE[(idx || 0) % GRADIENT_PALETTE.length];
}

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
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {displayItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', fontSize: 'calc(18px * ' + fontScale + ')', color: '#c8b8e8', lineHeight: 1.6 }}>
            Nothing here yet.<br />Try another category or ask Hermes!
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gap: '20px' }}>
            {displayItems.map(function(item, idx) {
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
