import React from 'react';

var GRADIENT_PALETTE = [
  'linear-gradient(135deg,#1a1a2e,#16213e)',
  'linear-gradient(135deg,#0f3460,#e94560)',
  'linear-gradient(135deg,#1b1b2f,#2b2d42)',
  'linear-gradient(135deg,#2c003e,#6a0572)',
  'linear-gradient(135deg,#0d1117,#1f6feb)',
  'linear-gradient(135deg,#1a0a00,#ff7d3a)',
];

function ShellDetailDrawer(props) {
  var item = props.item;
  var isOpen = props.isOpen;
  var onClose = props.onClose;

  React.useEffect(function() {
    if (!isOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return function() { document.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  var heroBg = item.poster
    ? 'url(' + item.poster + ') center/cover no-repeat'
    : item.thumb
    ? 'url(' + item.thumb + ') center/cover no-repeat'
    : GRADIENT_PALETTE[(item.id ? item.id.charCodeAt(0) : 0) % GRADIENT_PALETTE.length];

  var meta = [
    item.year,
    item.genre,
    item.quality,
    item.duration,
    item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : null,
  ].filter(Boolean);

  return (
    <div
      onClick={function(e) { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: '0',
        background: 'rgba(0,0,0,0.75)',
        WebkitBackdropFilter: 'blur(8px)',
        backdropFilter: 'blur(8px)',
        zIndex: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '700px',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: '#15151d',
          border: '1px solid #2a2b3a',
          borderRadius: '14px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          autoFocus
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            border: 'none',
            color: '#fff',
            fontSize: '18px',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2,
            outline: 'none',
          }}
          onFocus={function(e) { e.currentTarget.style.outline = '2px solid #fff'; e.currentTarget.style.outlineOffset = '2px'; }}
          onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
        >
          &times;
        </button>

        {/* Hero */}
        <div
          style={{
            height: '220px',
            background: heroBg,
            borderRadius: '14px 14px 0 0',
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            padding: '18px',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: '0',
              background: 'linear-gradient(180deg, transparent 30%, rgba(21,21,29,0.95) 100%)',
              borderRadius: '14px 14px 0 0',
            }}
          />
          <h2 style={{ position: 'relative', zIndex: 1, margin: 0, fontSize: '1.6rem', fontWeight: 700, color: '#fff' }}>
            {item.title}
          </h2>
        </div>

        {/* Body */}
        <div style={{ padding: '18px' }}>
          {/* Meta badges */}
          {meta.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {meta.map(function(m, i) {
                return (
                  <span
                    key={i}
                    style={{
                      padding: '3px 9px',
                      background: '#22232f',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: '#9aa3b2',
                    }}
                  >
                    {m}
                  </span>
                );
              })}
              {item.type === 'live' && (
                <span style={{ padding: '3px 9px', background: 'rgba(229,9,20,0.2)', borderRadius: '4px', fontSize: '0.75rem', color: '#e50914', fontWeight: 700 }}>
                  🔴 LIVE
                </span>
              )}
            </div>
          )}

          {/* Description */}
          {item.description && (
            <p style={{ color: '#c9d0db', lineHeight: 1.6, fontSize: '0.9rem', margin: '0 0 16px' }}>
              {item.description}
            </p>
          )}
          {!item.description && item.genre && (
            <p style={{ color: '#c9d0db', lineHeight: 1.6, fontSize: '0.9rem', margin: '0 0 16px' }}>
              {item.genre} content available on HermesTV.
            </p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.875rem',
                background: '#fff',
                color: '#000',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={function(e) { e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.transform = 'none'; }}
            >
              &#9654; Watch
            </button>
            <button
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.875rem',
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            >
              + Add to List
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShellDetailDrawer;
