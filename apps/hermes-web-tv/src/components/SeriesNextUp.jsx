import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// SeriesNextUp — pinned "Next up" hero card rendered above the season list
// inside SeriesEpisodesBlock.
//
// Picks the first unwatched episode for the series. Resolution rules:
//   1. Walk seasons from newest → oldest. The first season that has *any*
//      progress (a percent_complete > 0 anywhere) is considered "in flight".
//   2. Inside that season, the next-up episode is the lowest-numbered
//      episode whose percent_complete is either undefined or < 0.9 (90%).
//   3. If no progress at all → pick S01E01 — that's the first-watch path.
//
// Watch history isn't wired yet (parallel agent owns watchHistoryStore.js);
// when it lands, the `progressFor(seasonIdx, episodeIdx)` function is the
// only place that needs to swap from "always returns null" to reading the
// store. Until then the component renders the S01E01 first-watch CTA with
// no progress bar.
//
// Tizen / Chrome 76 safe — no spread, no optional chaining, no nullish.
// ─────────────────────────────────────────────────────────────────────────────

// Heuristic: when watch history is unavailable, always recommend S01E01.
// TODO: wire when watchHistoryStore lands — replace this with a function
// that takes (seriesId, totalSeasons, episodeCountFn) and returns the
// next-up { season, episode, percent_complete } record.
function _computeNextUp(item, episodeCountFn) {
  var meta = item.metadata || {};
  var seasons = (typeof meta.seasons === 'number' && meta.seasons > 0) ? meta.seasons : 1;
  // Default — series is fresh, kick the user off at S01E01.
  return {
    season: 1,
    episode: 1,
    is_first_watch: true,
    percent_complete: 0,
    totalSeasons: seasons,
    totalEpisodesInSeason: episodeCountFn(1),
  };
}

function SeriesNextUp(props) {
  var item = props.item || {};
  var episodeCountFn = props.episodeCountFn || function() { return 10; };
  var onPlay = props.onPlay;
  // Static title list shared with SeriesEpisodesBlock — kept inline so the
  // component is self-contained and the next-up label matches whatever
  // synthetic title the episode list shows for the same (season, episode).
  var SYNTH_TITLES = [
    'Pilot', 'Metamorphosis', 'Hothead', 'X-Ray', 'Cool',
    'Hourglass', 'Crossfire', 'Heartbeat', 'Threshold', 'Echoes',
    'Pinpoint', 'Drift', 'Origins', 'Inversion', 'Daybreak',
    'Frostline', 'Marathon', 'Crosswind', 'Sundown', 'Recalibrate',
    'Quicksilver', 'Untethered', 'Compass', 'Wildfire', 'Anchor',
  ];

  var nextUp = _computeNextUp(item, episodeCountFn);
  var seq = (nextUp.season - 1) * 25 + (nextUp.episode - 1);
  var epTitle = SYNTH_TITLES[seq % SYNTH_TITLES.length];
  var label = 'S' + (nextUp.season < 10 ? '0' + nextUp.season : nextUp.season) +
              'E' + (nextUp.episode < 10 ? '0' + nextUp.episode : nextUp.episode);

  function handleClick() {
    if (typeof onPlay !== 'function') { return; }
    onPlay(item, null, { season: nextUp.season, episode: nextUp.episode });
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
      {/* Soft darken overlay so the white text stays legible across all themes */}
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
          {nextUp.is_first_watch ? 'Start with' : 'Next up'}
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
          {label} <span style={{ opacity: 0.85, fontWeight: 600 }}>· {epTitle}</span>
        </div>
        {nextUp.percent_complete > 0 && (
          <div
            aria-label={'Resume at ' + Math.round(nextUp.percent_complete * 100) + ' percent'}
            style={{
              marginTop: '0.45rem',
              height: '4px',
              width: '100%',
              background: 'rgba(255,255,255,0.22)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: Math.round(nextUp.percent_complete * 100) + '%',
                height: '100%',
                background: '#ffffff',
                transition: 'width 240ms var(--ease-out, ease)',
              }}
            />
          </div>
        )}
      </div>
      <button
        tabIndex={0}
        aria-label={(nextUp.percent_complete > 0 ? 'Resume ' : 'Play ') + label}
        onClick={handleClick}
        onKeyDown={handleKey}
        style={{
          position: 'relative',
          padding: '0.5rem 1.1rem',
          background: '#ffffff',
          color: '#0d1117',
          border: 'none',
          borderRadius: 'var(--radius-pill, 9999px)',
          fontWeight: 800,
          fontSize: 'calc(0.78rem * var(--font-scale, 1))',
          cursor: 'pointer',
          outline: 'none',
          flexShrink: 0,
          letterSpacing: '0.04em',
          transition: 'transform 160ms var(--ease-out, ease)',
        }}
        onFocus={function(e) {
          e.currentTarget.style.outline = '2px solid #ffffff';
          e.currentTarget.style.outlineOffset = '3px';
          e.currentTarget.style.transform = 'scale(1.04)';
        }}
        onBlur={function(e) {
          e.currentTarget.style.outline = 'none';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        onMouseEnter={function(e) { e.currentTarget.style.transform = 'scale(1.04)'; }}
        onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <span aria-hidden="true">▶</span> {nextUp.percent_complete > 0 ? 'Resume' : 'Play'}
      </button>
    </div>
  );
}

export default SeriesNextUp;
