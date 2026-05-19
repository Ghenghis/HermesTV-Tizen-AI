import React from 'react';
import ALL_LAYOUTS from '../layouts/manifests/index.js';

var CAT_ORDER = ['IPTV Players', 'Streaming Services', 'Smart TV Shells', 'Special Modes'];

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

  React.useEffect(function() {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  var groups = groupBycat(ALL_LAYOUTS);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="look-modal-title"
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
          width: '100%',
          maxWidth: '660px',
          maxHeight: '82vh',
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
            <div id="look-modal-title" style={{ fontSize: 'calc(1.2rem * var(--font-scale, 1))', fontWeight: 800, color: '#e8edf5', letterSpacing: '0.01em' }}>Choose Your Look</div>
            <div style={{ fontSize: 'calc(0.8rem * var(--font-scale, 1))', color: '#8a8f9b', marginTop: '2px' }}>Pick any style — you can change it anytime</div>
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
            onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent, #ff7eb3)'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'scale(1.06)'; }}
            onBlur={function(e) { e.currentTarget.style.outline = 'none'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            &times;
          </button>
        </div>

        {/* Layout groups */}
        <div style={{ overflowY: 'auto', padding: '16px 24px 8px' }}>
          {CAT_ORDER.map(function(cat) {
            var items = groups[cat];
            if (!items || items.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', fontWeight: 700, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                  {items.map(function(layout) {
                    var isActive = layout.id === activeLayout;
                    var isDisabled = layout.tier_required === 'enhanced' && tier !== 'enhanced';
                    return (
                      <button
                        key={layout.id}
                        onClick={function() {
                          if (!isDisabled) {
                            if (onSelect) onSelect(layout.id);
                          }
                        }}
                        disabled={isDisabled}
                        style={{
                          textAlign: 'left',
                          padding: '14px 16px',
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: 'calc(0.9rem * var(--font-scale, 1))', color: isActive ? layout.accent : '#c8d0db' }}>
                            {layout.name}
                          </span>
                          {isActive && (
                            <span style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', fontWeight: 800, color: layout.accent, border: '1px solid ' + layout.accent, borderRadius: '999px', padding: '2px 9px', letterSpacing: '0.08em', background: 'rgba(' + hexToRgb(layout.accent) + ',0.1)' }}>
                              ACTIVE
                            </span>
                          )}
                          {isDisabled && (
                            <span style={{ fontSize: 'calc(0.6rem * var(--font-scale, 1))', color: '#8a8f9b', border: '1px solid #2a2b3a', borderRadius: '999px', padding: '2px 8px', letterSpacing: '0.05em' }}>
                              QN85 only
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
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: 'calc(0.7rem * var(--font-scale, 1))', fontWeight: 700, color: '#8a8f9b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Default</div>
            <button
              onClick={function() { if (onSelect) onSelect(''); }}
              style={{
                textAlign: 'left',
                padding: '14px 16px',
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
              onFocus={function(e) { e.currentTarget.style.outline = '2px solid #1f6feb'; e.currentTarget.style.outlineOffset = '2px'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onBlur={function(e) { e.currentTarget.style.outline = 'none'; if (activeLayout && activeLayout !== '') e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div style={{ fontWeight: 700, fontSize: 'calc(0.9rem * var(--font-scale, 1))', color: (!activeLayout || activeLayout === '') ? '#1f6feb' : '#c8d0db', marginBottom: '4px' }}>
                Standard Grid {(!activeLayout || activeLayout === '') ? <span style={{ fontSize: 'calc(0.65rem * var(--font-scale, 1))', fontWeight: 800, border: '1px solid #1f6feb', borderRadius: '999px', padding: '2px 9px', marginLeft: '8px', letterSpacing: '0.08em', background: 'rgba(31,111,235,0.1)' }}>ACTIVE</span> : ''}
              </div>
              <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: '#8a8f9b' }}>Classic catalog grid view — works on all devices</div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #2a2b3a', flexShrink: 0 }}>
          <div style={{ fontSize: 'calc(0.75rem * var(--font-scale, 1))', color: '#8a8f9b', textAlign: 'center' }}>
            💬 Tip: Ask Hermes to change your layout anytime — try &quot;switch to Netflix look&quot;
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
