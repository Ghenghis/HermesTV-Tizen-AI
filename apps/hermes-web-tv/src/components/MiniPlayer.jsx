import React from 'react';

function MiniPlayer(props) {
  var channel = props.channel;
  var isOpen = props.isOpen;
  var onClose = props.onClose;

  if (!isOpen || !channel) return null;

  return (
    <>
      <style>{`
        @keyframes hermes-pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '80px',
          left: '16px',
          width: '240px',
          height: '135px',
          background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1a2e 100%)',
          border: '1px solid #2a2b3a',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 180,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            width: '22px',
            height: '22px',
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.6)',
            border: 'none',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            zIndex: 2,
            outline: 'none',
          }}
        >
          &times;
        </button>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '12px', gap: '6px' }}>
          {/* Play icon placeholder */}
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(229,9,20,0.2)', border: '2px solid rgba(229,9,20,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#e50914' }}>
            &#9654;
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#e8edf5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
              {channel.title || 'Live Channel'}
            </div>
            {channel.genre && (
              <div style={{ fontSize: '10px', color: '#6b7384', marginTop: '2px' }}>{channel.genre}</div>
            )}
          </div>
        </div>

        {/* Footer bar */}
        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#e50914',
                animation: 'hermes-pulse-dot 1.4s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#e50914', letterSpacing: '0.05em' }}>LIVE</span>
          </div>
          {channel.quality && (
            <span style={{ fontSize: '9px', color: '#6b7384', fontWeight: 600 }}>{channel.quality}</span>
          )}
        </div>

        {/* Preview note */}
        <div style={{ background: '#0a0e1a', padding: '4px 10px', textAlign: 'center', fontSize: '9px', color: '#3a3f4a', flexShrink: 0 }}>
          Preview requires active stream
        </div>
      </div>
    </>
  );
}

export default MiniPlayer;
