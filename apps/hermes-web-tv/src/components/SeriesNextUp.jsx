import React from 'react';

function _episodeLabel(ep) {
  var season = ep && ep.season ? ep.season : 1;
  var episode = ep && ep.episode ? ep.episode : 1;
  return 'S' + (season < 10 ? '0' + season : season) +
    'E' + (episode < 10 ? '0' + episode : episode);
}

function SeriesNextUp(props) {
  var item = props.item || {};
  var episodes = Array.isArray(props.episodes) ? props.episodes : [];
  var onPlay = props.onPlay;
  if (episodes.length === 0) { return null; }

  var nextUp = null;
  for (var i = 0; i < episodes.length; i++) {
    if (!episodes[i].viewed) { nextUp = episodes[i]; break; }
  }
  if (!nextUp) { nextUp = episodes[0]; }

  var label = _episodeLabel(nextUp);
  var title = nextUp.title || label;

  function handleClick() {
    if (typeof onPlay !== 'function' || !nextUp.play_item_id) { return; }
    onPlay(item, null, {
      episode_item_id: nextUp.play_item_id,
      episode_id: nextUp.episode_id,
      season: nextUp.season,
      episode: nextUp.episode,
    });
  }

  function handleKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        marginBottom: '1rem',
        padding: '0.9rem 1rem',
        background: 'var(--gradient-accent)',
        borderRadius: 'var(--radius-md, 12px)',
        boxShadow: 'var(--shadow-md, 0 6px 18px rgba(0,0,0,0.28))',
        display: 'flex',
        alignItems: 'center',
        gap: '0.85rem',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(90deg, rgba(0,0,0,0.35), rgba(0,0,0,0.1))',
          pointerEvents: 'none',
        }}
      />
      <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'calc(0.65rem * var(--font-scale, 1))',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            opacity: 0.88,
            marginBottom: '0.2rem',
          }}
        >
          {nextUp.viewed ? 'Replay episode' : 'Next up'}
        </div>
        <div
          style={{
            fontSize: 'calc(1rem * var(--font-scale, 1))',
            fontWeight: 800,
            color: '#ffffff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label} <span style={{ opacity: 0.85, fontWeight: 600 }}>{title !== label ? '· ' + title : ''}</span>
        </div>
      </div>
      <button
        tabIndex={0}
        aria-label={'Play ' + label}
        onClick={handleClick}
        onKeyDown={handleKey}
        disabled={!nextUp.play_item_id}
        style={{
          position: 'relative',
          padding: '0.5rem 1.1rem',
          background: '#ffffff',
          color: '#0d1117',
          border: 'none',
          borderRadius: 'var(--radius-pill, 9999px)',
          fontWeight: 800,
          fontSize: 'calc(0.78rem * var(--font-scale, 1))',
          cursor: nextUp.play_item_id ? 'pointer' : 'not-allowed',
          outline: 'none',
          flexShrink: 0,
          letterSpacing: '0.04em',
          opacity: nextUp.play_item_id ? 1 : 0.55,
          transition: 'transform 160ms var(--ease-out, ease)',
        }}
        onFocus={function(e) {
          e.currentTarget.style.outline = '2px solid #ffffff';
          e.currentTarget.style.outlineOffset = '3px';
          if (nextUp.play_item_id) { e.currentTarget.style.transform = 'scale(1.04)'; }
        }}
        onBlur={function(e) {
          e.currentTarget.style.outline = 'none';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseEnter={function(e) { if (nextUp.play_item_id) { e.currentTarget.style.transform = 'scale(1.04)'; } }}
        onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span aria-hidden="true">▶</span> Play
      </button>
    </div>
  );
}

export default SeriesNextUp;
