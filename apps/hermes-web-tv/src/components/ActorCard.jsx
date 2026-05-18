import React from 'react';

function ActorCard(props) {
  var actor = props.actor || {};
  var onMoreWithActor = props.onMoreWithActor;

  var name = actor.name || 'Unknown';
  var photoUrl = actor.photo_url || '';
  var bioShort = actor.bio_short || '';

  // Derive initials for fallback circle
  var initials = name
    .split(' ')
    .filter(function(part) { return part.length > 0; })
    .slice(0, 2)
    .map(function(part) { return part.charAt(0).toUpperCase(); })
    .join('');

  var imgErrorState = React.useState(false);
  var imgError = imgErrorState[0];
  var setImgError = imgErrorState[1];

  function handleMoreClick() {
    if (onMoreWithActor) {
      onMoreWithActor(actor);
    }
  }

  function handleMoreKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleMoreClick();
    }
  }

  var showInitials = !photoUrl || imgError;

  return (
    <div
      style={{
        width: '140px',
        flexShrink: 0,
        backgroundColor: 'var(--surface-raised, #1c2128)',
        border: '1px solid var(--border, #30363d)',
        borderRadius: '10px',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
        textAlign: 'center',
      }}
    >
      {/* Photo or initials fallback */}
      {showInitials ? (
        <div
          aria-hidden="true"
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#ffffff',
            flexShrink: 0,
          }}
        >
          {initials || '?'}
        </div>
      ) : (
        <img
          src={photoUrl}
          alt={name}
          onError={function() { setImgError(true); }}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      )}

      {/* Actor name */}
      <div
        style={{
          fontSize: 'calc(0.8rem * var(--font-scale, 1))',
          fontWeight: '600',
          color: 'var(--text)',
          lineHeight: '1.3',
          wordBreak: 'break-word',
        }}
      >
        {name}
      </div>

      {/* Bio short */}
      {bioShort && (
        <div
          style={{
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            color: 'var(--muted)',
            lineHeight: '1.3',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
          }}
        >
          {bioShort}
        </div>
      )}

      {/* More with actor button */}
      <button
        tabIndex={0}
        onClick={handleMoreClick}
        onKeyDown={handleMoreKeyDown}
        style={{
          marginTop: '0.25rem',
          padding: '0.3rem 0.6rem',
          backgroundColor: 'transparent',
          border: '1px solid var(--accent)',
          borderRadius: '5px',
          color: 'var(--accent)',
          fontSize: 'calc(0.7rem * var(--font-scale, 1))',
          fontWeight: '600',
          cursor: 'pointer',
          outline: 'none',
          width: '100%',
        }}
        onFocus={function(e) {
          e.currentTarget.style.outline = '2px solid var(--accent)';
          e.currentTarget.style.outlineOffset = '2px';
        }}
        onBlur={function(e) {
          e.currentTarget.style.outline = 'none';
        }}
        aria-label={'More with ' + name}
      >
        More with {name.split(' ')[0]}
      </button>
    </div>
  );
}

export default ActorCard;
