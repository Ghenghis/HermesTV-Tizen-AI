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

var POWER_ICONS = [
  { icon: '📡', label: 'Live' },
  { icon: '🎬', label: 'Movies' },
  { icon: '📺', label: 'Series' },
  { icon: '📊', label: 'Stats' },
];

function DavePowerShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);
  var fontScale = (profile && profile.font_scale) || 0.9;
  var activeIconResult = React.useState(0);
  var activeIcon = activeIconResult[0];
  var setActiveIcon = activeIconResult[1];
  var searchResult = React.useState('');
  var searchQuery = searchResult[0];
  var setSearchQuery = searchResult[1];

  var displayItems = searchQuery
    ? filtered.filter(function(i) { return (i.title || '').toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1; })
    : filtered;

  var liveCount = (catalog || []).filter(function(i) { return i.type === 'live'; }).length;
  var movieCount = (catalog || []).filter(function(i) { return i.type === 'movies' || i.type === 'movie'; }).length;
  var seriesCount = (catalog || []).filter(function(i) { return i.type === 'series'; }).length;
  var qualityBreakdown = {};
  (catalog || []).forEach(function(i) {
    var q = (i.quality || 'Unknown').split(' ')[0];
    qualityBreakdown[q] = (qualityBreakdown[q] || 0) + 1;
  });

  var cols = tier === 'enhanced' ? 6 : 4;
  var filterLabel = [
    contentFilter !== 'all' ? contentFilter : 'All',
    providerFilter !== 'all' ? providerFilter : 'All Providers',
    qualityFilter !== 'all' ? qualityFilter : 'Any Quality',
  ].join(' · ');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr' + (tier === 'enhanced' ? ' 200px' : ''), height: '100%', background: '#0a0e1a', color: '#e0e8f0', overflow: 'hidden', fontFamily: "'Consolas', 'Courier New', monospace" }}>

      {/* Icon sidebar */}
      <div style={{ background: '#0d1120', borderRight: '1px solid #1a2030', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '12px', gap: '4px' }}>
        {POWER_ICONS.map(function(item, i) {
          return (
            <button
              key={item.label}
              onClick={function() { setActiveIcon(i); }}
              title={item.label}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                border: 'none',
                background: activeIcon === i ? 'rgba(0,212,170,0.15)' : 'transparent',
                color: activeIcon === i ? '#00d4aa' : '#6b7a8d',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 120ms, color 120ms',
              }}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{ background: '#0d1120', borderBottom: '1px solid #1a2030', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'calc(15px * ' + fontScale + ')', color: '#e0e8f0' }}>
            Hermes<span style={{ color: '#00d4aa' }}>TV</span>
          </div>
          <div style={{ fontSize: 'calc(11px * ' + fontScale + ')', color: '#6b7a8d', flex: 1 }}>{filterLabel}</div>
          <input
            type="text"
            value={searchQuery}
            onChange={function(e) { setSearchQuery(e.target.value); }}
            placeholder="Search..."
            style={{
              background: '#131827',
              border: '1px solid #1a2030',
              borderRadius: '4px',
              color: '#e0e8f0',
              padding: '5px 10px',
              fontSize: 'calc(12px * ' + fontScale + ')',
              outline: 'none',
              width: '160px',
            }}
          />
          <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#6b7a8d' }}>Ctrl+L: layout</div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gap: '8px' }}>
            {displayItems.map(function(item, idx) {
              return (
                <div
                  key={item.id || idx}
                  onClick={function() { if (onItemSelect) onItemSelect(item); }}
                  style={{
                    borderRadius: '4px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid #1a2030',
                    transition: 'border-color 100ms',
                  }}
                  onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#00d4aa'; }}
                  onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#1a2030'; }}
                >
                  <div style={{ height: '90px', background: posterBg(item, idx), position: 'relative' }}>
                    {item.quality && <div style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,212,170,0.9)', color: '#000', fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>{item.quality}</div>}
                    {item.type === 'live' && <div style={{ position: 'absolute', top: '3px', left: '3px', background: '#e50914', color: '#fff', fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>LIVE</div>}
                  </div>
                  <div style={{ padding: '5px 6px', background: '#0d1120' }}>
                    <div style={{ fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 600, color: '#e0e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                    <div style={{ fontSize: 'calc(9px * ' + fontScale + ')', color: '#6b7a8d', marginTop: '2px' }}>
                      {(item.provider_id || '') + (item.year ? ' · ' + item.year : '')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {displayItems.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7a8d', fontSize: 'calc(13px * ' + fontScale + ')' }}>
              No results{searchQuery ? ' for "' + searchQuery + '"' : ''}.
            </div>
          )}
        </div>
      </div>

      {/* Stats panel — enhanced tier only */}
      {tier === 'enhanced' && (
        <div style={{ background: '#0d1120', borderLeft: '1px solid #1a2030', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          <div style={{ fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 700, color: '#00d4aa', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Catalog Stats</div>

          <div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#6b7a8d', marginBottom: '6px' }}>TOTAL</div>
            <div style={{ fontSize: 'calc(24px * ' + fontScale + ')', fontWeight: 700, color: '#e0e8f0' }}>{(catalog || []).length}</div>
          </div>

          <div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#6b7a8d', marginBottom: '6px' }}>BY TYPE</div>
            {[
              { label: 'Live', count: liveCount, color: '#e50914' },
              { label: 'Movies', count: movieCount, color: '#e5a00d' },
              { label: 'Series', count: seriesCount, color: '#1428a0' },
            ].map(function(s) {
              return (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: 'calc(11px * ' + fontScale + ')' }}>
                  <span style={{ color: s.color }}>{s.label}</span>
                  <span style={{ color: '#e0e8f0', fontWeight: 600 }}>{s.count}</span>
                </div>
              );
            })}
          </div>

          <div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#6b7a8d', marginBottom: '6px' }}>QUALITY</div>
            {Object.keys(qualityBreakdown).slice(0, 5).map(function(q) {
              return (
                <div key={q} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: 'calc(11px * ' + fontScale + ')' }}>
                  <span style={{ color: '#00d4aa' }}>{q}</span>
                  <span style={{ color: '#e0e8f0', fontWeight: 600 }}>{qualityBreakdown[q]}</span>
                </div>
              );
            })}
          </div>

          <div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#6b7a8d', marginBottom: '6px' }}>FILTERED</div>
            <div style={{ fontSize: 'calc(18px * ' + fontScale + ')', fontWeight: 700, color: '#00d4aa' }}>{displayItems.length}</div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#6b7a8d', marginTop: '2px' }}>of {(catalog || []).length}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DavePowerShell;
