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
      onClick={function(e) { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.82)',
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '660px',
          maxHeight: '82vh',
          background: '#15151d',
          border: '1px solid #2a2b3a',
          borderRadius: '16px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid #2a2b3a',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e8edf5' }}>Choose Your Look</div>
            <div style={{ fontSize: '0.8rem', color: '#6b7384', marginTop: '2px' }}>Pick any style — you can change it anytime</div>
          </div>
          <button
            onClick={onClose}
            autoFocus
            style={{ background: 'none', border: 'none', color: '#6b7384', fontSize: '1.4rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', outline: 'none', lineHeight: 1 }}
            onFocus={function(e) { e.currentTarget.style.color = '#e8edf5'; }}
            onBlur={function(e) { e.currentTarget.style.color = '#6b7384'; }}
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
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5b6373', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>{cat}</div>
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
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: isActive ? ('2px solid ' + layout.accent) : '1px solid #2a2b3a',
                          background: isActive ? ('rgba(' + hexToRgb(layout.accent) + ',0.1)') : '#1a1a24',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          opacity: isDisabled ? 0.5 : 1,
                          boxShadow: isActive ? ('0 0 12px rgba(' + hexToRgb(layout.accent) + ',0.25)') : 'none',
                          transition: 'border-color 120ms, background 120ms, box-shadow 120ms',
                          outline: 'none',
                        }}
                        onMouseEnter={function(e) {
                          if (!isActive && !isDisabled) {
                            e.currentTarget.style.borderColor = layout.accent;
                            e.currentTarget.style.background = '#202030';
                          }
                        }}
                        onMouseLeave={function(e) {
                          if (!isActive && !isDisabled) {
                            e.currentTarget.style.borderColor = '#2a2b3a';
                            e.currentTarget.style.background = '#1a1a24';
                          }
                        }}
                        onFocus={function(e) {
                          if (!isActive && !isDisabled) {
                            e.currentTarget.style.outline = '2px solid ' + layout.accent;
                            e.currentTarget.style.outlineOffset = '2px';
                          }
                        }}
                        onBlur={function(e) {
                          e.currentTarget.style.outline = 'none';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: isActive ? layout.accent : '#c8d0db' }}>
                            {layout.name}
                          </span>
                          {isActive && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: layout.accent, border: '1px solid ' + layout.accent, borderRadius: '3px', padding: '1px 5px', letterSpacing: '0.05em' }}>
                              ACTIVE
                            </span>
                          )}
                          {isDisabled && (
                            <span style={{ fontSize: '0.6rem', color: '#5b6373', border: '1px solid #2a2b3a', borderRadius: '3px', padding: '1px 5px' }}>
                              QN85 only
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7384', lineHeight: 1.4 }}>{layout.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Default grid option */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#5b6373', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>Default</div>
            <button
              onClick={function() { if (onSelect) onSelect(''); }}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: '10px',
                border: (!activeLayout || activeLayout === '') ? '2px solid #1f6feb' : '1px solid #2a2b3a',
                background: (!activeLayout || activeLayout === '') ? 'rgba(31,111,235,0.1)' : '#1a1a24',
                cursor: 'pointer',
                outline: 'none',
                width: '100%',
                transition: 'border-color 120ms',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: (!activeLayout || activeLayout === '') ? '#1f6feb' : '#c8d0db', marginBottom: '4px' }}>
                Standard Grid {(!activeLayout || activeLayout === '') ? <span style={{ fontSize: '0.65rem', border: '1px solid #1f6feb', borderRadius: '3px', padding: '1px 5px', marginLeft: '6px' }}>ACTIVE</span> : ''}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7384' }}>Classic catalog grid view — works on all devices</div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px 16px', borderTop: '1px solid #2a2b3a', flexShrink: 0 }}>
          <div style={{ fontSize: '0.75rem', color: '#5b6373', textAlign: 'center' }}>
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
