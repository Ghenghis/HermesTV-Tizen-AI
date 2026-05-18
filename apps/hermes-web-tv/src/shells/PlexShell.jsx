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

var SIDEBAR_SECTIONS = [
  { icon: '🏠', label: 'Home' },
  { icon: '📡', label: 'Live TV' },
  { icon: '🎬', label: 'Movies' },
  { icon: '📺', label: 'Series' },
  { icon: '🗂️', label: 'My Library' },
];

function GridSection(props) {
  var title = props.title;
  var items = props.items;
  var onItemSelect = props.onItemSelect;
  var fontScale = props.fontScale;
  var profile = props.profile;
  var allowMotion = !(profile && profile.reduced_motion);

  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginBottom: '28px' }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 'calc(14px * ' + fontScale + ')', color: '#c8d2e0', fontWeight: 700 }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {items.slice(0, 8).map(function(item, idx) {
          return (
            <div
              key={item.id || idx}
              data-focusable="true"
              tabIndex={0}
              role="button"
              onClick={function() { if (onItemSelect) onItemSelect(item); }}
              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onItemSelect) onItemSelect(item); } }}
              style={{ cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: '1px solid #2a2c2f', transition: 'border-color 120ms, transform 120ms, box-shadow 120ms', outline: 'none' }}
              onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#e5a00d'; if (allowMotion) e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#2a2c2f'; e.currentTarget.style.transform = 'none'; }}
              onFocus={function(e) { e.currentTarget.style.borderColor = '#e5a00d'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(229,160,13,0.35)'; }}
              onBlur={function(e) { e.currentTarget.style.borderColor = '#2a2c2f'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ aspectRatio: '16/9', background: posterBg(item, idx), position: 'relative' }}>
                {item.quality && (
                  <div style={{ position: 'absolute', top: '4px', right: '4px', background: '#e5a00d', color: '#000', fontSize: '9px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>
                    {item.quality}
                  </div>
                )}
                {item.type === 'live' && (
                  <div style={{ position: 'absolute', top: '4px', left: '4px', background: '#e50914', color: '#fff', fontSize: '9px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>
                    LIVE
                  </div>
                )}
              </div>
              <div style={{ padding: '8px', background: '#191b1d' }}>
                <div style={{ fontSize: 'calc(12px * ' + fontScale + ')', fontWeight: 600, color: '#eaeaea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                {item.year && <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#6c7177', marginTop: '2px' }}>{item.year}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlexShell(props) {
  var catalog = props.catalog;
  var profile = props.profile;
  var tier = props.tier;
  var providers = props.providers;
  var onItemSelect = props.onItemSelect;
  var contentFilter = props.contentFilter;
  var providerFilter = props.providerFilter;
  var qualityFilter = props.qualityFilter;

  var filtered = applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter);
  var featured = filtered[0] || null;
  var liveItems = filtered.filter(function(i) { return i.type === 'live'; });
  var movies = filtered.filter(function(i) { return i.type === 'movies' || i.type === 'movie'; });
  var series = filtered.filter(function(i) { return i.type === 'series'; });
  var fontScale = (profile && profile.font_scale) || 1;

  var activeSectionResult = React.useState(0);
  var activeSection = activeSectionResult[0];
  var setActiveSection = activeSectionResult[1];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%', background: '#1f2326', color: '#eaeaea', overflow: 'hidden', fontFamily: "'Open Sans', 'Inter', sans-serif" }}>

      {/* Sidebar */}
      <div style={{ background: '#191b1d', borderRight: '1px solid #2a2c2f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px 14px', fontWeight: 800, color: '#e5a00d', fontSize: 'calc(20px * ' + fontScale + ')', flexShrink: 0 }}>PLEX</div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '14px 22px 6px', fontSize: 'calc(10px * ' + fontScale + ')', color: '#6c7177', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Library</div>
          {SIDEBAR_SECTIONS.map(function(s, i) {
            var isActive = activeSection === i;
            return (
              <button
                key={s.label}
                data-focusable="true"
                onClick={function() { setActiveSection(i); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  textAlign: 'left',
                  padding: isActive ? '14px 22px 14px 19px' : '14px 22px',
                  fontSize: 'calc(13px * ' + fontScale + ')',
                  cursor: 'pointer',
                  color: isActive ? '#e5a00d' : '#b2b9c1',
                  background: isActive ? '#22252a' : 'transparent',
                  borderLeft: isActive ? '3px solid #e5a00d' : '3px solid transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  transition: 'all 80ms, box-shadow 120ms',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
                onMouseEnter={function(e) { if (!isActive) e.currentTarget.style.background = '#22252a'; }}
                onMouseLeave={function(e) { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                onFocus={function(e) { e.currentTarget.style.background = '#22252a'; e.currentTarget.style.boxShadow = 'inset 0 0 0 2px rgba(229,160,13,0.6)'; }}
                onBlur={function(e) { e.currentTarget.style.background = isActive ? '#22252a' : 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}

          {providers && providers.length > 0 && (
            <div>
              <div style={{ padding: '14px 22px 6px', fontSize: 'calc(10px * ' + fontScale + ')', color: '#6c7177', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Providers</div>
              {providers.map(function(p) {
                return (
                  <div key={p.id} style={{ padding: '7px 22px', fontSize: 'calc(12px * ' + fontScale + ')', color: '#b2b9c1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                    {p.name || p.id}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div style={{ overflowY: 'auto', padding: '22px 28px' }}>

        {/* Hero card */}
        {featured && (
          <div
            onClick={function() { if (onItemSelect) onItemSelect(featured); }}
            style={{ height: '280px', borderRadius: '6px', background: posterBg(featured, 0), marginBottom: '24px', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(31,35,38,0.95) 0%, rgba(31,35,38,0.2) 60%, transparent 100%)' }} />
            <div style={{ position: 'absolute', bottom: '20px', left: '20px' }}>
              <div style={{ fontSize: 'calc(24px * ' + fontScale + ')', fontWeight: 700, marginBottom: '6px' }}>{featured.title}</div>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                {featured.year && <span style={{ fontSize: 'calc(12px * ' + fontScale + ')', color: '#b2b9c1' }}>{featured.year}</span>}
                {featured.genre && <span style={{ fontSize: 'calc(12px * ' + fontScale + ')', color: '#b2b9c1' }}>{featured.genre}</span>}
              </div>
              <button onClick={function(e) { e.stopPropagation(); if (onItemSelect) onItemSelect(featured); }} style={{ padding: '9px 20px', background: '#e5a00d', color: '#000', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: 'calc(13px * ' + fontScale + ')', cursor: 'pointer' }}>
                ▶ Play
              </button>
            </div>
          </div>
        )}

        <GridSection title="On Now" items={liveItems.length > 0 ? liveItems : filtered.slice(0, 4)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />
        <GridSection title="Movies" items={movies.length > 0 ? movies : filtered.slice(2, 10)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />
        <GridSection title="Series" items={series.length > 0 ? series : filtered.slice(4)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />
        <GridSection title="Recently Added" items={filtered.slice().reverse().slice(0, 8)} onItemSelect={onItemSelect} fontScale={fontScale} profile={profile} />

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: '#6c7177', fontSize: 'calc(14px * ' + fontScale + ')' }}>
            No content matches your current filters.
          </div>
        )}
      </div>
    </div>
  );
}

export default PlexShell;
