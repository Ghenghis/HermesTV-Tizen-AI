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

var NAV_TABS = ['Home', 'Live TV', 'Movies', 'Series', 'Search'];

function CardRow(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  var tier = props.tier;
  var fontScale = props.fontScale;

  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginBottom: '28px' }}>
      <h3 style={{ margin: '0 0 12px', padding: '0 24px', fontSize: 'calc(16px * ' + fontScale + ')', fontWeight: 700, color: '#e5e5e5', letterSpacing: '0.3px' }}>{title}</h3>
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 24px 8px', scrollbarWidth: 'none' }}>
        {items.slice(0, 12).map(function(item, idx) {
          return (
            <div
              key={item.id || idx}
              onClick={function() { if (onItemSelect) onItemSelect(item); }}
              style={{
                flexShrink: 0,
                width: '140px',
                cursor: 'pointer',
                borderRadius: '4px',
                overflow: 'hidden',
                transition: tier === 'enhanced' ? 'transform 150ms, box-shadow 150ms' : 'none',
              }}
              onMouseEnter={function(e) {
                if (tier === 'enhanced') {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)';
                }
              }}
              onMouseLeave={function(e) {
                if (tier === 'enhanced') {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              <div style={{ height: '210px', background: posterBg(item, idx), borderRadius: '4px', position: 'relative' }}>
                {item.quality && (
                  <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '2px', letterSpacing: '0.05em' }}>
                    {item.quality}
                  </div>
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
  var liveItems = filtered.filter(function(i) { return i.type === 'live'; });
  var movies = filtered.filter(function(i) { return i.type === 'movies' || i.type === 'movie'; });
  var fontScale = (profile && profile.font_scale) || 1;

  return (
    <div style={{ background: '#141414', color: '#fff', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* Top nav */}
      <header style={{ position: 'relative', zIndex: 10, background: 'linear-gradient(180deg, rgba(20,20,20,1) 0%, rgba(20,20,20,0.8) 100%)', padding: '0 24px', height: '56px', display: 'flex', alignItems: 'center', gap: '32px', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 'calc(20px * ' + fontScale + ')', letterSpacing: '0.05em' }}>
          Hermes<span style={{ color: '#e50914' }}>TV</span>
        </div>
        <nav style={{ display: 'flex', gap: '20px' }}>
          {NAV_TABS.map(function(tab, i) {
            return (
              <button key={tab} style={{ background: 'none', border: 'none', color: i === 0 ? '#fff' : '#b3b3b3', fontSize: 'calc(13px * ' + fontScale + ')', fontWeight: i === 0 ? 600 : 400, cursor: 'pointer', padding: '4px 0', borderBottom: i === 0 ? '2px solid #e50914' : 'none' }}>
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
                {featured.quality && <span style={{ fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 700, color: '#e5a00d', border: '1px solid #e5a00d', borderRadius: '2px', padding: '1px 5px' }}>{featured.quality}</span>}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  style={{ padding: '10px 24px', background: '#fff', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: 'calc(14px * ' + fontScale + ')', cursor: 'pointer' }}
                >
                  ▶ Watch
                </button>
                <button
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  style={{ padding: '10px 24px', background: 'rgba(109,109,110,0.7)', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: 'calc(14px * ' + fontScale + ')', cursor: 'pointer' }}
                >
                  ⓘ More Info
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content rows */}
        <div style={{ paddingTop: '24px' }}>
          <CardRow title="Top Picks For You" items={filtered} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} />
          <CardRow title="Live Now" items={liveItems.length > 0 ? liveItems : filtered.slice(0, 8)} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} />
          <CardRow title="Movies" items={movies.length > 0 ? movies : filtered.slice(4)} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} />
          <CardRow title="New Arrivals" items={filtered.slice().reverse()} onItemSelect={onItemSelect} tier={tier} fontScale={fontScale} />
        </div>
      </div>
    </div>
  );
}

export default NetflixShell;
