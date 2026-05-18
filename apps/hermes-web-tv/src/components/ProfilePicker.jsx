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
      style={{
        minHeight: '100vh',
        backgroundColor: '#0d1117',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3rem',
      }}
    >
      <h1
        style={{
          color: '#e6edf3',
          fontSize: '2.5rem',
          fontWeight: '600',
          margin: 0,
          letterSpacing: '0.02em',
        }}
      >
        Who&apos;s watching?
      </h1>

      <div
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
            width: '240px',
            height: '240px',
            backgroundColor: '#161b22',
            border: '2px solid #30363d',
            borderRadius: '16px',
            color: '#e6edf3',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            transition: 'border-color 0.15s, background-color 0.15s',
            outline: 'none',
          }}
          onFocus={function(e) {
            e.currentTarget.style.borderColor = '#1f6feb';
            e.currentTarget.style.backgroundColor = '#1c2128';
            e.currentTarget.style.outline = '2px solid #1f6feb';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={function(e) {
            e.currentTarget.style.borderColor = '#30363d';
            e.currentTarget.style.backgroundColor = '#161b22';
            e.currentTarget.style.outline = 'none';
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: '#1f6feb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              color: '#ffffff',
              fontWeight: '700',
            }}
          >
            D
          </div>
          <span style={{ fontSize: '1.5rem', fontWeight: '600', color: '#e6edf3' }}>Dave</span>
          <span style={{ fontSize: '0.875rem', color: '#8b949e' }}>Night Blue</span>
        </button>

        {/* Sherri / Mom */}
        <button
          tabIndex={0}
          onClick={function() { handleSelect('mom_tv'); }}
          onKeyDown={function(e) { handleKeyDown(e, 'mom_tv'); }}
          style={{
            width: '240px',
            height: '240px',
            backgroundColor: '#2a201a',
            border: '2px solid #4a3828',
            borderRadius: '16px',
            color: '#f5ede6',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            transition: 'border-color 0.15s, background-color 0.15s',
            outline: 'none',
          }}
          onFocus={function(e) {
            e.currentTarget.style.borderColor = '#e07b39';
            e.currentTarget.style.backgroundColor = '#352820';
            e.currentTarget.style.outline = '2px solid #e07b39';
            e.currentTarget.style.outlineOffset = '2px';
          }}
          onBlur={function(e) {
            e.currentTarget.style.borderColor = '#4a3828';
            e.currentTarget.style.backgroundColor = '#2a201a';
            e.currentTarget.style.outline = 'none';
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: '#e07b39',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2rem',
              color: '#ffffff',
              fontWeight: '700',
            }}
          >
            S
          </div>
          <span style={{ fontSize: '1.5rem', fontWeight: '600', color: '#f5ede6' }}>Sherri</span>
          <span style={{ fontSize: '0.875rem', color: '#c4a882' }}>Mom Calm</span>
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
