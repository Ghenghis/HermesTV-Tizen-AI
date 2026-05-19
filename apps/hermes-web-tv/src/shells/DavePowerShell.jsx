import React from 'react';
import { applyShellFilters, posterBg, useGridVirtualizer } from './shellHelpers.js';
import { debounce } from '../utils/debounce.js';
import ContinueWatchingRail from '../components/ContinueWatchingRail.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// DavePowerShell — Dave's preferred dense-info power-user layout.
//
// Design intent: maximise on-screen information density. Cards stay tight
// (90px high) so we keep radii on the SMALL end of the token scale
// (var(--radius-xs) / --radius-sm) to preserve the data-grid feel.
// Where SOTA polish lands:
//   - Sidebar icons + grid cards: var(--radius-sm)
//   - Stats panel numbers stay monospace; pills get var(--radius-pill)
//   - Hover-lift on cards: translateY(-1px) (subtler than other shells
//     because density matters)
//   - Search input upgrades to var(--radius-md) with shared focus shadow
//   - Top-bar layout chip gets pill geometry so it reads as a status pill
//
// Tizen 6.5 / Chrome 76 safe — no :has(), no @container, no logical props.
// The teal accent (#00d4aa) stays literal — it's Dave's identity colour,
// not a tokenised value.
// ─────────────────────────────────────────────────────────────────────────────

var POWER_ICONS = [
  { icon: '📡', label: 'Live' },
  { icon: '🎬', label: 'Movies' },
  { icon: '📺', label: 'Series' },
  { icon: '📊', label: 'Stats' },
];

var DAVE_ACCENT = '#00d4aa';
var DAVE_ACCENT_SOFT = 'rgba(0,212,170,0.35)';
var DAVE_EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

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
  var reducedMotion = !!(profile && profile.reduced_motion);
  var activeIconResult = React.useState(0);
  var activeIcon = activeIconResult[0];
  var setActiveIcon = activeIconResult[1];
  // Two-state search: searchInput is the immediate textbox value (drives the
  // controlled <input>), searchQuery is the debounced value that actually
  // feeds the filter pass. 150 ms collapses bursty Tizen-remote typing into
  // a single filter run while staying under the motor-to-visual threshold.
  var searchInputResult = React.useState('');
  var searchInput = searchInputResult[0];
  var setSearchInput = searchInputResult[1];
  var searchResult = React.useState('');
  var searchQuery = searchResult[0];
  var setSearchQuery = searchResult[1];

  // Build the debouncer once with useMemo so we don't re-create the timer
  // on every render (which would defeat the whole point).
  var debouncedSetSearchQuery = React.useMemo(function() {
    return debounce(function(v) { setSearchQuery(v); }, 150);
  }, []);
  // Cancel any pending timer on unmount so a setState doesn't fire after
  // React has dropped the shell from the tree.
  React.useEffect(function() {
    return function() { debouncedSetSearchQuery.cancel(); };
  }, [debouncedSetSearchQuery]);

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

  // Virtualizer column estimate — auto-fill grid below resolves the actual
  // column count from the viewport. On enhanced QN85 1920×1080 minus rails
  // we land at ~9 cols of 160 px cards; degraded gets ~6. The estimate only
  // drives the row-height math, not the rendered grid.
  var cols = tier === 'enhanced' ? 9 : 6;
  var filterLabel = [
    contentFilter !== 'all' ? contentFilter : 'All',
    providerFilter !== 'all' ? providerFilter : 'All Providers',
    qualityFilter !== 'all' ? qualityFilter : 'Any Quality',
  ].join(' · ');

  // Virtualize the dense Power-user grid. Card is 90 px image + ~40 px
  // title block + 8 px gap = ~140 px per row. DavePower is the densest
  // shell so this is where unbounded-grid cost bites first. Below the
  // ~100-item threshold the helper short-circuits to a full render.
  var gridScrollRef = React.useRef(null);
  var virt = useGridVirtualizer({
    scrollRef: gridScrollRef,
    itemCount: displayItems.length,
    columns: cols,
    rowHeight: 140,
    overscan: 1,
  });

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
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: activeIcon === i ? 'rgba(0,212,170,0.15)' : 'transparent',
                color: activeIcon === i ? DAVE_ACCENT : '#8a98ab',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 180ms ease, color 180ms ease, box-shadow 180ms ease',
                outline: 'none',
              }}
              onFocus={function(e) {
                e.currentTarget.style.outline = '2px solid ' + DAVE_ACCENT;
                e.currentTarget.style.outlineOffset = '-2px';
                e.currentTarget.style.boxShadow = '0 0 0 3px ' + DAVE_ACCENT_SOFT;
              }}
              onBlur={function(e) {
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar — gentle gradient lift, pill-shaped filter chip */}
        <div style={{ background: 'linear-gradient(180deg, #11162a, #0d1120)', borderBottom: '1px solid #1a2030', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 'calc(15px * ' + fontScale + ')', color: '#e0e8f0' }}>
            Hermes<span style={{ color: DAVE_ACCENT }}>TV</span>
          </div>
          {/* Status-pill — surfaces current filter set at a glance */}
          <div style={{
            fontSize: 'calc(11px * ' + fontScale + ')',
            color: '#8a98ab',
            flex: 1,
            padding: '3px 10px',
            background: 'rgba(0,212,170,0.06)',
            border: '1px solid rgba(0,212,170,0.18)',
            borderRadius: 'var(--radius-pill)',
            display: 'inline-block',
            maxWidth: 'fit-content',
            letterSpacing: '0.02em',
          }}>{filterLabel}</div>
          <input
            type="text"
            value={searchInput}
            onChange={function(e) {
              var v = e.target.value;
              // Keep the controlled input instant — only debounce the
              // filter pass, never the keystroke echo.
              setSearchInput(v);
              debouncedSetSearchQuery(v);
            }}
            placeholder="Search..."
            aria-label="Search catalog"
            style={{
              background: '#131827',
              border: '1px solid #1a2030',
              borderRadius: 'var(--radius-md)',
              color: '#e0e8f0',
              padding: '5px 12px',
              fontSize: 'calc(12px * ' + fontScale + ')',
              outline: 'none',
              width: '180px',
              transition: 'border-color 180ms ease, box-shadow 180ms ease',
            }}
            onFocus={function(e) {
              e.currentTarget.style.borderColor = DAVE_ACCENT;
              e.currentTarget.style.boxShadow = '0 0 0 3px ' + DAVE_ACCENT_SOFT;
            }}
            onBlur={function(e) {
              e.currentTarget.style.borderColor = '#1a2030';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', fontFamily: 'inherit' }}>
            <kbd style={{
              padding: '1px 6px',
              borderRadius: 'var(--radius-xs)',
              background: '#131827',
              border: '1px solid #1a2030',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              color: DAVE_ACCENT,
            }}>Ctrl+L</kbd>
            <span style={{ marginLeft: '4px' }}>layout</span>
          </div>
        </div>

        {/* Grid */}
        <div ref={gridScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {/* Top spacer — preserves scrollbar geometry for unmounted rows.
              height=0 when virtualization is off (catalog < threshold). */}
          {virt.topSpacer > 0 && (
            <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
          )}
          {/* Dense data-grid feel: auto-fill minmax(160px) yields ~9 cols
              on QN85 1920×1080 minus the 64px icon rail and 200px stats panel,
              so the user sees 3-4 rows of cards inside the viewport. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
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
                    // Tight radius preserves the data-grid feel; --radius-sm
                    // gives a subtle warmth without softening the dense layout.
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border: '1px solid #1a2030',
                    boxShadow: 'var(--shadow-md)',
                    // Subtler hover-lift than the other shells (1px not 2px)
                    // because dense grids look chaotic if every cell jumps.
                    transition: 'transform 180ms ' + DAVE_EASE_OUT + ', border-color 180ms ease, box-shadow 180ms ease',
                    willChange: 'transform',
                    transform: 'translateY(0)',
                    outline: 'none',
                  }}
                  onMouseEnter={function(e) {
                    e.currentTarget.style.borderColor = DAVE_ACCENT;
                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                    if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={function(e) {
                    e.currentTarget.style.borderColor = '#1a2030';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  onFocus={function(e) {
                    e.currentTarget.style.borderColor = DAVE_ACCENT;
                    e.currentTarget.style.boxShadow = '0 0 0 2px ' + DAVE_ACCENT + ', 0 12px 36px ' + DAVE_ACCENT_SOFT;
                    if (!reducedMotion) e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onBlur={function(e) {
                    e.currentTarget.style.borderColor = '#1a2030';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Per-type aspect — live channels render as 16:9 landscape
                      thumbs (the ~160×90 size the dense data-grid was built
                      for), movies/series render as 2:3 portrait posters so
                      the seed catalog's TMDb art doesn't get crushed. */}
                  <div style={{ aspectRatio: (item.type === 'live') ? '16 / 9' : '2 / 3', background: posterBg(item, idx), backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                    {item.quality && <div style={{ position: 'absolute', top: '3px', right: '3px', background: 'rgba(0,212,170,0.9)', color: '#000', fontSize: '8px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-pill)' }}>{item.quality}</div>}
                    {item.type === 'live' && <div style={{ position: 'absolute', top: '3px', left: '3px', background: '#e50914', color: '#fff', fontSize: '8px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-pill)' }}>LIVE</div>}
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
          {/* Bottom spacer — preserves scrollbar geometry for unmounted
              trailing rows. height=0 when virtualization is off. */}
          {virt.bottomSpacer > 0 && (
            <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
          )}
          {displayItems.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8a98ab', fontSize: 'calc(13px * ' + fontScale + ')' }}>
              No results{searchQuery ? ' for "' + searchQuery + '"' : ''}.
            </div>
          )}
        </div>
      </div>

      {/* Stats panel — enhanced tier only */}
      {tier === 'enhanced' && (
        <div style={{ background: 'linear-gradient(180deg, #11162a, #0d1120)', borderLeft: '1px solid #1a2030', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          {/* Continue Watching — vertical-stack 'compact' variant in the
              right sidebar. Returns null when the profile has no playback
              history so the stats panel stays flush with the top edge. */}
          <ContinueWatchingRail profileId={profile && (profile.profile_id || profile.id)} onItemSelect={onItemSelect} profile={profile} fontScale={fontScale} variant="compact" max={3} />
          <div style={{ fontSize: 'calc(11px * ' + fontScale + ')', fontWeight: 700, color: DAVE_ACCENT, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Catalog Stats</div>

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
                  <span style={{ color: DAVE_ACCENT }}>{q}</span>
                  <span style={{ color: '#e0e8f0', fontWeight: 600 }}>{qualityBreakdown[q]}</span>
                </div>
              );
            })}
          </div>

          <div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', marginBottom: '6px' }}>FILTERED</div>
            <div style={{ fontSize: 'calc(18px * ' + fontScale + ')', fontWeight: 700, color: DAVE_ACCENT }}>{displayItems.length}</div>
            <div style={{ fontSize: 'calc(10px * ' + fontScale + ')', color: '#8a98ab', marginTop: '2px' }}>of {(catalog || []).length}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DavePowerShell;
