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

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%', background: '#0e1217', color: '#e6e9ef', fontFamily: "'Roboto', sans-serif", overflow: 'hidden' }}>

      {/* Sidebar */}
      <div style={{ background: '#0a0d12', borderRight: '1px solid #1b1f27', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontWeight: 800, fontSize: 'calc(18px * ' + fontScale + ')', color: '#fff', borderBottom: '1px solid #1b1f27', letterSpacing: '0.5px', flexShrink: 0 }}>
          Hermes<span style={{ color: '#ff7d3a' }}>TV</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {channelList.map(function(item, idx) {
            var isActive = idx === activeIdx;
            return (
              <button
                key={item.id || idx}
                data-focusable="true"
                onClick={function() { setActiveIdx(idx); if (onItemSelect) onItemSelect(item); }}
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
        <div style={{ overflowY: 'auto' }}>
          {channelList.map(function(item, idx) {
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
