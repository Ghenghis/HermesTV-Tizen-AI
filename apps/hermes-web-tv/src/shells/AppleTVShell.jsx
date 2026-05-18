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

var APPLE_TABS = ['For You', 'Live TV', 'Movies', 'TV Shows'];

function HScrollRow(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  var cardW = props.cardW || 240;
  var cardH = props.cardH || 135;
  var fontScale = props.fontScale;

  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: '32px' }}>
      <h3 style={{ margin: '0 0 12px 32px', fontSize: 'calc(17px * ' + fontScale + ')', fontWeight: 600, color: '#f5f5f7' }}>{title}</h3>
      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '4px 32px 8px', scrollbarWidth: 'none' }}>
        {items.slice(0, 10).map(function(item, idx) {
          return (
            <div
              key={item.id || idx}
              data-focusable="true"
              tabIndex={0}
              role="button"
              onClick={function() { if (onItemSelect) onItemSelect(item); }}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onItemSelect) onItemSelect(item); } }}
              style={{ flexShrink: 0, width: cardW + 'px', cursor: 'pointer', borderRadius: '10px', padding: '2px', border: '2px solid transparent', transition: 'border-color 150ms, box-shadow 150ms', outline: 'none' }}
              onFocus={function(e) { e.currentTarget.style.borderColor = '#0071e3'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,113,227,0.4)'; }}
              onBlur={function(e) { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ width: cardW + 'px', height: cardH + 'px', borderRadius: '8px', background: posterBg(item, idx), position: 'relative', overflow: 'hidden' }}>
                {item.type === 'live' && (
                  <div style={{ position: 'absolute', top: '6px', left: '6px', background: '#e50914', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '3px' }}>LIVE</div>
                )}
              </div>
              <div style={{ marginTop: '6px', fontSize: 'calc(12px * ' + fontScale + ')', color: '#f5f5f7', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
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
  var liveItems = filtered.filter(function(i) { return i.type === 'live'; });
  var movies = filtered.filter(function(i) { return i.type === 'movies' || i.type === 'movie'; });
  var fontScale = (profile && profile.font_scale) || 1;
  var activeTabResult = React.useState(0);
  var activeTab = activeTabResult[0];
  var setActiveTab = activeTabResult[1];

  var navStyle = {
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    flexShrink: 0,
    zIndex: 10,
  };
  if (tier === 'enhanced') {
    navStyle.background = 'rgba(28,28,30,0.85)';
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
          ▶ Hermes<span style={{ color: '#0071e3' }}>TV</span>
        </div>
        <nav style={{ display: 'flex', gap: '4px' }}>
          {APPLE_TABS.map(function(tab, i) {
            return (
              <button
                key={tab}
                onClick={function() { setActiveTab(i); }}
                style={{
                  background: activeTab === i ? 'rgba(255,255,255,0.1)' : 'none',
                  border: 'none',
                  color: activeTab === i ? '#fff' : '#98989d',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: '12px 18px',
                  borderRadius: '8px',
                  transition: 'background 120ms',
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

        {/* Hero */}
        {featured && (
          <div style={{ position: 'relative', height: '380px', background: posterBg(featured, 0), flexShrink: 0 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, #1c1c1e 0%, rgba(28,28,30,0.4) 60%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: '40px', left: '32px', maxWidth: '520px' }}>
              <div style={{ fontSize: 'calc(38px * ' + fontScale + ')', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '10px', lineHeight: 1.1 }}>{featured.title}</div>
              {(featured.genre || featured.year) && (
                <div style={{ fontSize: 'calc(14px * ' + fontScale + ')', color: '#98989d', marginBottom: '20px' }}>
                  {[featured.year, featured.genre, featured.duration].filter(Boolean).join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  style={{ padding: '12px 28px', background: '#fff', color: '#000', border: 'none', borderRadius: '20px', fontWeight: 600, fontSize: 'calc(14px * ' + fontScale + ')', cursor: 'pointer' }}
                >
                  ▶ Play
                </button>
                <button
                  onClick={function() { if (onItemSelect) onItemSelect(featured); }}
                  style={{ padding: '12px 28px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: '20px', fontWeight: 600, fontSize: 'calc(14px * ' + fontScale + ')', cursor: 'pointer' }}
                >
                  + Add to Library
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ paddingTop: '24px' }}>
          <HScrollRow title="Up Next" items={filtered} onItemSelect={onItemSelect} cardW={240} cardH={135} fontScale={fontScale} />
          <HScrollRow title="Trending Now" items={filtered.slice(2)} onItemSelect={onItemSelect} cardW={240} cardH={135} fontScale={fontScale} />
          <HScrollRow title="Movies" items={movies.length > 0 ? movies : filtered.slice(3)} onItemSelect={onItemSelect} cardW={130} cardH={195} fontScale={fontScale} />
          <HScrollRow title="Live Channels" items={liveItems.length > 0 ? liveItems : filtered.slice(1)} onItemSelect={onItemSelect} cardW={240} cardH={135} fontScale={fontScale} />
        </div>

        <footer style={{ textAlign: 'center', padding: '24px', fontSize: 'calc(11px * ' + fontScale + ')', color: '#9fa0a6' }}>HermesTV</footer>
      </div>
    </div>
  );
}

export default AppleTVShell;
