import React from 'react';
import ALL_LAYOUTS from '../layouts/manifests/index.js';

// CAT_ORDER drives the section order in the layout picker modal. Layouts
// whose `cat` value isn't in this list are hidden from the picker even
// though /api/layouts still serves them — wave-9 added "Live TV" and
// "Classic Players" because LiveTVShell + IptvnatorShell ship in the
// bundle and the registry but were silently dropped here, leaving users
// unable to pick them.
var CAT_ORDER = ['Live TV', 'IPTV Players', 'Classic Players', 'Streaming Services', 'Modern Players', 'Smart TV Shells', 'Special Modes'];

// Some shell IDs differ from their display names (e.g. ynotv → "Lean TV",
// extreme-infinitv → "Power user"). Showing the ID as a small subtitle in
// the modal keeps developers and DaveTV (voice/chat) able to grep / refer to the
// internal name while users see the friendly label.
var ID_SUBTITLE_OVERRIDES = {
  'ynotv': 'ynotv',
  'extreme-infinitv': 'extreme-infinitv'
};

function ViewPreview(props) {
  var layout = props.layout || {};
  var accent = props.accent || layout.accent || '#1f6feb';
  var rgb = hexToRgb(accent);
  var id = layout.id || 'grid-standard';
  var nav = layout.nav_style || '';
  var hero = layout.hero_style || '';
  var grid = layout.grid_style || '';
  var hasSidebar = nav === 'sidebar' || id === 'tivimate' || id === 'iptvnator' || id === 'dave-power';
  var hasHero = hero !== 'none' && hero !== '';
  var isGuide = hero.indexOf('epg') !== -1 || grid.indexOf('guide') !== -1 || id === 'live-tv' || id === 'tivimate';
  var isStreaming = id === 'netflix' || id === 'plex' || id === 'stremio' || id === 'apple-tv';
  var isSimple = id === 'mom-mode' || id === 'ynotv';
  var cols = isSimple ? 3 : (isGuide ? 4 : 5);
  var cells = [];
  for (var i = 0; i < (isSimple ? 6 : 10); i++) {
    cells.push(
      <span
        key={i}
        style={{
          display: 'block',
          minHeight: isSimple ? '18px' : '14px',
          borderRadius: isGuide ? '4px' : '6px',
          background: i === 0
            ? 'rgba(' + rgb + ',0.95)'
            : 'rgba(232,237,245,' + (0.18 + ((i % 3) * 0.08)) + ')',
        }}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        background: '#090d14',
        display: 'flex',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      {hasSidebar && (
        <div
          style={{
            width: '18%',
            minWidth: '18%',
            background: 'rgba(' + rgb + ',0.18)',
            borderRight: '1px solid rgba(255,255,255,0.07)',
            padding: '7px 5px',
            display: 'grid',
            gridTemplateRows: 'repeat(5, 1fr)',
            gap: '5px',
          }}
        >
          {[0, 1, 2, 3, 4].map(function(n) {
            return (
              <span
                key={n}
                style={{
                  display: 'block',
                  borderRadius: '3px',
                  background: n === 0 ? 'rgba(' + rgb + ',0.95)' : 'rgba(255,255,255,0.16)',
                }}
              />
            );
          })}
        </div>
      )}
      <div style={{ flex: 1, padding: '7px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {hasHero && (
          <div
            style={{
              flex: isStreaming ? '0 0 43%' : '0 0 34%',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, rgba(' + rgb + ',0.85), rgba(232,237,245,0.12))',
            }}
          />
        )}
        {isGuide ? (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.1fr repeat(3, 1fr)', gap: '4px' }}>
            {cells.slice(0, 8).map(function(cell) { return cell; })}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', 1fr)', gap: '5px' }}>
            {cells}
          </div>
        )}
      </div>
    </div>
  );
}

function groupBycat(layouts) {
  var groups = {};
  for (var i = 0; i < layouts.length; i++) {
    var l = layouts[i];
    if (!groups[l.cat]) groups[l.cat] = [];
    groups[l.cat].push(l);
  }
  return groups;
}

function LayoutSwitcher(props) {
  var isOpen = props.isOpen;
  var activeLayout = props.activeLayout;
  var tier = props.tier;
  var onSelect = props.onSelect;
  var onClose = props.onClose;
  // Optional `profile` prop is forward-compatible: when the parent eventually
  // wires it through we read mom_mode directly; today we infer it from the
  // already-applied --font-scale CSS variable so this file remains the sole
  // surface that changes for the a11y polish pass.
  var profile = props.profile || null;

  // Read the live --font-scale CSS variable so mom-mode auto-adapts even when
  // the caller did not pass `profile`. Reads run only while the modal is open
  // and on resize (rare) — the cost is one getComputedStyle call per gate.
  var fontScaleResult = React.useState(1);
  var fontScale = fontScaleResult[0];
  var setFontScale = fontScaleResult[1];

  React.useEffect(function() {
    if (!isOpen) return;
    function readScale() {
      try {
        var raw = getComputedStyle(document.documentElement).getPropertyValue('--font-scale');
        var n = parseFloat(raw);
        if (!isNaN(n) && n > 0) setFontScale(n);
      } catch (_) { /* SSR / odd environments — keep default 1 */ }
    }
    readScale();
    window.addEventListener('resize', readScale);
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return function() {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', readScale);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  var groups = groupBycat(ALL_LAYOUTS);
  // Mom-mode: when the profile flag is set OR the font scale crosses the
  // legibility threshold, switch to a 1-column tall list with 56-px hit
  // targets. Sherri's TV always satisfies either condition (see
  // user_profiles_sherri_dave) so she gets the larger touch surface.
  var isMomMode = (profile && profile.mom_mode) || fontScale >= 1.4;
  var categoryColumns = isMomMode ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))';
  var gridColumns = '1fr';
  var cardPadding = isMomMode ? '20px 20px' : '14px 16px';
  // Touch-target floor: Sherri sometimes uses the TV as a tablet, so each
  // layout tile must be at least 64×64 (WCAG 2.5.5 target-size + the
  // wave-8 Mom-mode audit requirement). Was 56 → 64.
  var cardMinHeight = isMomMode ? '64px' : 'auto';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-modal-title"
      onClick={function(e) { if (e.target === e.currentTarget) onClose(); }}
      className="hermes-modal-overlay"
      style={{
        position: 'fixed',
        inset: '0',
        background: 'rgba(5,8,14,0.78)',
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        className="hermes-modal-panel"
        style={{
          width: 'calc(100vw - 64px)',
          maxWidth: '1500px',
          maxHeight: '88vh',
          background: '#15151d',
          border: '1px solid #2a2b3a',
          borderRadius: '20px',
          boxShadow: '0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header — gradient surface-raised → surface */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 18px',
          borderBottom: '1px solid #2a2b3a',
          flexShrink: 0,
          background: 'linear-gradient(180deg, #1c1c28, #15151d)',
        }}>
          <div>
            <div id="view-modal-title" style={{ fontSize: 'calc(1.2rem * var(--font-scale, 1))', fontWeight: 800, color: '#e8edf5', letterSpacing: '0.01em' }}>Choose Your View</div>
            <div style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: '#8a8f9b', marginTop: '2px' }}>Pick a View — you can change it anytime</div>
          </div>
          <button
            onClick={onClose}
            autoFocus
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid #2a2b3a',
              color: '#e8edf5', fontSize: '18px', cursor: 'pointer',
              width: '40px', height: '40px', borderRadius: '50%',
              outline: 'none', lineHeight: 1, padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              transition: 'transform 160ms cubic-bezier(0.16,1,0.3,1), background-color 160ms ease',
            }}
            onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'scale(1)'; }}
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent-color, var(--accent, #58a6ff))'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            &times;
          </button>
        </div>

        {/* Layout groups */}
        <div style={{ overflowY: 'auto', padding: '22px 32px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: categoryColumns, gap: '18px', alignItems: 'start' }}>
          {CAT_ORDER.map(function(cat) {
            var items = groups[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', fontWeight: 700, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: gridColumns, gap: '10px' }}>
                  {items.map(function(layout) {
                    var isActive = layout.id === activeLayout;
                    // Wave-9: removed tier_required gating. DaveTV is a 2-profile
                    // app (Sherri's QN85 + Dave's QN85) — both run "enhanced".
                    // The earlier resolver mismatch was silently disabling Nuvio
                    // on Dave's QN85Q7FAAFXZA. Leaving the gate would re-introduce
                    // unreachable shells without delivering real value.
                    var isDisabled = false;
                    var idSubtitle = ID_SUBTITLE_OVERRIDES[layout.id];
                    return (
                      <button
                        key={layout.id}
                        data-layout-id={layout.id}
                        tabIndex={isDisabled ? -1 : 0}
                        onClick={function() {
                          if (!isDisabled) {
                            if (onSelect) onSelect(layout.id);
                          }
                        }}
                        onKeyDown={function(e) {
                          // Native <button> already fires click on Enter/Space,
                          // but Tizen 6.5's remote OK key surfaces as 'Enter'
                          // only after keydown→keypress sequence that some
                          // older WebKit builds drop. Handling keydown here
                          // guarantees activation on every remote variant.
                          if (isDisabled) return;
                          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                            e.preventDefault();
                            if (onSelect) onSelect(layout.id);
                          }
                        }}
                        disabled={isDisabled}
                        style={{
                          textAlign: 'left',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          padding: cardPadding,
                          minHeight: cardMinHeight,
                          borderRadius: '14px',
                          border: isActive ? ('2px solid ' + layout.accent) : '1px solid #2a2b3a',
                          background: isActive
                            ? ('linear-gradient(135deg, rgba(' + hexToRgb(layout.accent) + ',0.16), rgba(' + hexToRgb(layout.accent) + ',0.04))')
                            : '#1a1a24',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          opacity: isDisabled ? 0.5 : 1,
                          boxShadow: isActive
                            ? ('0 8px 24px rgba(' + hexToRgb(layout.accent) + ',0.28)')
                            : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                          transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), border-color 160ms ease, background-color 160ms ease',
                          outline: 'none',
                          willChange: 'transform',
                          transform: 'translateY(0)',
                        }}
                        onMouseEnter={function(e) {
                          if (!isActive && !isDisabled) {
                            e.currentTarget.style.borderColor = layout.accent;
                            e.currentTarget.style.background = '#202030';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }
                        }}
                        onMouseLeave={function(e) {
                          if (!isActive && !isDisabled) {
                            e.currentTarget.style.borderColor = '#2a2b3a';
                            e.currentTarget.style.background = '#1a1a24';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }
                        }}
                        onFocus={function(e) {
                          if (!isDisabled) {
                            e.currentTarget.style.outline = '2px solid ' + layout.accent;
                            e.currentTarget.style.outlineOffset = '2px';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                          }
                        }}
                        onBlur={function(e) {
                          e.currentTarget.style.outline = 'none';
                          if (!isActive) e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <ViewPreview layout={layout} />
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: 'calc(0.9rem * var(--font-scale, 1))', color: isActive ? layout.accent : '#c8d0db' }}>
                            {layout.name}
                            {idSubtitle && (
                              <span style={{ fontWeight: 500, fontSize: 'calc(0.65rem * var(--font-scale, 1))', color: '#6b7280', marginLeft: '6px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} title="Internal layout id (also accepted by DaveTV voice)">
                              {idSubtitle}
                              </span>
                            )}
                          </span>
                          {isActive && (
                            <span style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', fontWeight: 800, color: layout.accent, border: '1px solid ' + layout.accent, borderRadius: '999px', padding: '2px 9px', letterSpacing: '0.08em', background: 'rgba(' + hexToRgb(layout.accent) + ',0.1)' }}>
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: '#8a8f9b', lineHeight: 1.4 }}>{layout.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Default grid option */}
          <div style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', fontWeight: 700, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Default</div>
            <button
              data-layout-id="grid-standard"
              tabIndex={0}
              onClick={function() { if (onSelect) onSelect(''); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                  e.preventDefault();
                  if (onSelect) onSelect('');
                }
              }}
              style={{
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: cardPadding,
                minHeight: cardMinHeight,
                borderRadius: '14px',
                border: (!activeLayout || activeLayout === '') ? '2px solid #1f6feb' : '1px solid #2a2b3a',
                background: (!activeLayout || activeLayout === '')
                  ? 'linear-gradient(135deg, rgba(31,111,235,0.16), rgba(31,111,235,0.04))'
                  : '#1a1a24',
                cursor: 'pointer',
                outline: 'none',
                width: '100%',
                boxShadow: (!activeLayout || activeLayout === '') ? '0 8px 24px rgba(31,111,235,0.28)' : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                transition: 'transform 180ms cubic-bezier(0.16,1,0.3,1), border-color 160ms ease, background-color 160ms ease',
                willChange: 'transform',
              }}
              onMouseEnter={function(e) {
                if (activeLayout && activeLayout !== '') {
                  e.currentTarget.style.borderColor = '#1f6feb';
                  e.currentTarget.style.background = '#202030';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }
              }}
              onMouseLeave={function(e) {
                if (activeLayout && activeLayout !== '') {
                  e.currentTarget.style.borderColor = '#2a2b3a';
                  e.currentTarget.style.background = '#1a1a24';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent-color, #1f6feb)'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; if (activeLayout && activeLayout !== '') e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <ViewPreview layout={{ id: 'grid-standard', accent: '#1f6feb', nav_style: 'topbar', hero_style: 'none', grid_style: 'poster-grid' }} accent="#1f6feb" />
              <div style={{ fontWeight: 700, fontSize: 'calc(0.9rem * var(--font-scale, 1))', color: (!activeLayout || activeLayout === '') ? '#1f6feb' : '#c8d0db', marginBottom: '4px' }}>
                Standard Grid {(!activeLayout || activeLayout === '') ? <span style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', fontWeight: 800, border: '1px solid #1f6feb', borderRadius: '999px', padding: '2px 9px', marginLeft: '8px', letterSpacing: '0.08em', background: 'rgba(31,111,235,0.1)' }}>ACTIVE</span> : ''}
              </div>
              <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: '#8a8f9b' }}>Classic catalog grid view — works on all devices</div>
            </button>
          </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #2a2b3a', flexShrink: 0 }}>
          <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: '#8a8f9b', textAlign: 'center' }}>
            Tip: Ask DaveTV to change your View anytime — try &quot;switch to Netflix view&quot;
          </div>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '255,255,255';
  return parseInt(result[1], 16) + ',' + parseInt(result[2], 16) + ',' + parseInt(result[3], 16);
}

export default LayoutSwitcher;
