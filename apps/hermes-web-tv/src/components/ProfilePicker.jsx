import React from 'react';
import * as profileStore from '../store/profileStore.js';

function ProfilePicker(props) {
  var onSelect = props.onSelect;

  function handleSelect(profileId) {
    profileStore.setActiveProfileId(profileId);
    if (onSelect) {
      onSelect(profileId);
    }
  }

  function handleKeyDown(e, profileId) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(profileId);
    }
  }

  return (
    <div
      className="hermes-modal-overlay"
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #1a2030 0%, #0d1117 60%, #08090d 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3rem',
      }}
    >
      <h1
        className="hermes-modal-panel"
        style={{
          color: '#e6edf3',
          fontSize: '2.75rem',
          fontWeight: '700',
          margin: 0,
          letterSpacing: '0.01em',
        }}
      >
        Who&apos;s watching?
      </h1>

      <div
        className="hermes-modal-panel"
        style={{
          display: 'flex',
          gap: '3rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {/* Dave */}
        <button
          tabIndex={0}
          onClick={function() { handleSelect('dave_tv'); }}
          onKeyDown={function(e) { handleKeyDown(e, 'dave_tv'); }}
          style={{
            width: '260px',
            height: '260px',
            background: 'linear-gradient(180deg, #1c2128, #161b22)',
            border: '2px solid #30363d',
            borderRadius: '20px',
            color: '#e6edf3',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1), border-color 160ms ease, box-shadow 160ms ease',
            outline: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px rgba(0,0,0,0.4)',
            willChange: 'transform',
          }}
          onMouseEnter={function(e) { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = '#1f6feb'; }}
          onMouseLeave={function(e) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#30363d'; }}
          onFocus={function(e) {
            e.currentTarget.style.borderColor = '#1f6feb';
            e.currentTarget.style.outline = '3px solid #1f6feb';
            e.currentTarget.style.outlineOffset = '3px';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.borderColor = '#30363d';
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1f6feb, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.2rem',
              color: '#ffffff',
              fontWeight: '800',
              boxShadow: '0 6px 18px rgba(31,111,235,0.35)',
            }}
          >
            D
          </div>
          <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#e6edf3' }}>Dave</span>
          <span style={{ fontSize: '0.825rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Night Blue</span>
        </button>

        {/* Sherri / Mom */}
        <button
          tabIndex={0}
          onClick={function() { handleSelect('mom_tv'); }}
          onKeyDown={function(e) { handleKeyDown(e, 'mom_tv'); }}
          style={{
            width: '260px',
            height: '260px',
            background: 'linear-gradient(180deg, #352820, #2a201a)',
            border: '2px solid #4a3828',
            borderRadius: '20px',
            color: '#f5ede6',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            transition: 'transform 220ms cubic-bezier(0.16,1,0.3,1), border-color 160ms ease, box-shadow 160ms ease',
            outline: 'none',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 24px rgba(0,0,0,0.4)',
            willChange: 'transform',
          }}
          onMouseEnter={function(e) { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = '#e07b39'; }}
          onMouseLeave={function(e) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = '#4a3828'; }}
          onFocus={function(e) {
            e.currentTarget.style.borderColor = '#e07b39';
            e.currentTarget.style.outline = '3px solid #e07b39';
            e.currentTarget.style.outlineOffset = '3px';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onBlur={function(e) {
            e.currentTarget.style.borderColor = '#4a3828';
            e.currentTarget.style.outline = 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #e07b39, #f0a030)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.2rem',
              color: '#ffffff',
              fontWeight: '800',
              boxShadow: '0 6px 18px rgba(224,123,57,0.4)',
            }}
          >
            S
          </div>
          <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f5ede6' }}>Sherri</span>
          <span style={{ fontSize: '0.825rem', color: '#c4a882', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Mom Calm</span>
        </button>
      </div>

      <p
        style={{
          color: '#8b949e',
          fontSize: '0.875rem',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Your choice is saved on this TV. Press Enter or OK to select.
      </p>
    </div>
  );
}

export default ProfilePicker;
