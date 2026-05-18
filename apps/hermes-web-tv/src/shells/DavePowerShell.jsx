import React from 'react';
import { applyShellFilters, posterBg } from './shellHelpers.js';

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
  var fontScale = (profile && profile.font_scale) || 1.0;
  var activeIconResult = React.useState(0);
  var activeIcon = activeIconResult[0];
  var setActiveIcon = activeIconResult[1];
  var searchResult = React.useState('');
  var searchQuery = searchResult[0];
  var setSearchQuery = searchResult[1];

  React.useEffect(function() {
    var el = document.querySelector('[data-focusable="true"], [tabindex="0"]');
    if (el && typeof el.focus === 'function') {
      try { el.focus(); } catch (_) {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
              data-focusable="true"
              tabIndex={0}
              aria-label={item.label}
              onClick={function() { setActiveIcon(i); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveIcon(i);
                }
              }}
              title={item.label}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '8px',
                border: 'none',
                background: activeIcon === i ? 'rgba(0,212,170,0.15)' : 'transparent',
                color: activeIcon === i ? '#00d4aa' : '#8a98ab',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 120ms, color 120ms',
                outline: 'none',
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid #00d4aa'; e.currentTarget.style.outlineOffset = '-2px'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
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
          <div style={{ fontSize: 'calc(11px * ' + fontScale + ')', color: '#8a98ab', flex: 1 }}>{filterLabel}</div>
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
          <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab' }}>Ctrl+L: layout</div>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gap: '8px' }}>
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
                    borderRadius: '4px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid #1a2030',
                    transition: 'border-color 100ms, box-shadow 100ms',
                    outline: 'none',
                  }}
                  onMouseEnter={function(e) { e.currentTarget.style.borderColor = '#00d4aa'; }}
                  onMouseLeave={function(e) { e.currentTarget.style.borderColor = '#1a2030'; }}
                  onFocus={function(e) { e.currentTarget.style.borderColor = '#00d4aa'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,212,170,0.35)'; }}
                  onBlur={function(e) { e.currentTarget.style.borderColor = '#1a2030'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ height: '90px', background: posterBg(item, idx), position: 'relative' }}>
                    {item.quality && <div style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,212,170,0.9)', color: '#000', fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>{item.quality}</div>}
                    {item.type === 'live' && <div style={{ position: 'absolute', top: '3px', left: '3px', background: '#e50914', color: '#fff', fontSize: '8px', fontWeight: 700, padding: '1px 4px', borderRadius: '2px' }}>LIVE</div>}
                  </div>
                  <div style={{ padding: '5px 6px', background: '#0d1120' }}>
                    <div style={{ fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 600, color: '#e0e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                    <div style={{ fontSize: 'calc(9px * ' + fontScale + ')', color: '#8a98ab', marginTop: '2px' }}>
                      {(item.provider_id || '') + (item.year ? ' · ' + item.year : '')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {displayItems.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8a98ab', fontSize: 'calc(13px * ' + fontScale + ')' }}>
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
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', marginBottom: '6px' }}>TOTAL</div>
            <div style={{ fontSize: 'calc(24px * ' + fontScale + ')', fontWeight: 700, color: '#e0e8f0' }}>{(catalog || []).length}</div>
          </div>

          <div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', marginBottom: '6px' }}>BY TYPE</div>
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
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', marginBottom: '6px' }}>QUALITY</div>
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
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', marginBottom: '6px' }}>FILTERED</div>
            <div style={{ fontSize: 'calc(18px * ' + fontScale + ')', fontWeight: 700, color: '#00d4aa' }}>{displayItems.length}</div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', marginTop: '2px' }}>of {(catalog || []).length}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DavePowerShell;
