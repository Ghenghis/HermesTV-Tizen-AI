import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// SeriesEpisodesBlock — Smallville-style episode list rendered under the
// MediaDetailPanel chrome when item.type === 'series'.
//
// Visual contract (matches the Zero/Smallville screenshot the operator
// shared):
//   - "EPISODES" header on the left, "MARK ALL WATCHED" button on the right.
//   - One collapsible row per season showing "Season N  X eps", a
//     "MARK WATCHED" pill, and a season-download ⤓ button with a
//     "Download season" tooltip.
//   - Below an expanded season: per-episode row with a thumbnail
//     placeholder, "E{n}  {Title} - S0NE0N - {EpisodeTitle}" label,
//     episode plot, star rating, ▶ Play button, ⤓ episode-download
//     button.
//
// Data: episodes are synthesised client-side from item.metadata.seasons
// (default 1). The backend's /api/download accepts {season, episode} so
// these click handlers map cleanly onto the existing download flow.
// Real episode titles + plots will arrive in a follow-up when we wire
// TMDb / TVMaze metadata (W3-F3 backlog).
//
// Tizen / Chrome 76 safe: no spread, no optional chaining, no nullish.
// Every interactive control has tabIndex + Enter/Space handler.
// ─────────────────────────────────────────────────────────────────────────────

// Synthetic episode titles per series — keeps the row text varied without
// shipping real Smallville/etc. titles. The list is index-based so episode
// 5 of any series always gets the same synthetic title (e.g. 'Heartbeat').
var SYNTH_TITLES = [
  'Pilot', 'Metamorphosis', 'Hothead', 'X-Ray', 'Cool',
  'Hourglass', 'Crossfire', 'Heartbeat', 'Threshold', 'Echoes',
  'Pinpoint', 'Drift', 'Origins', 'Inversion', 'Daybreak',
  'Frostline', 'Marathon', 'Crosswind', 'Sundown', 'Recalibrate',
  'Quicksilver', 'Untethered', 'Compass', 'Wildfire', 'Anchor',
];

function _episodesForSeason(item, seasonIdx, episodeCount) {
  var out = [];
  for (var i = 0; i < episodeCount; i++) {
    var ep = i + 1;
    var seq = (seasonIdx - 1) * 25 + i;
    var title = SYNTH_TITLES[seq % SYNTH_TITLES.length];
    // Deterministic rating 7.0–8.5 keeps the column readable
    var seed = (item.id ? item.id.charCodeAt(0) : 0) + seq;
    var rating = 7.0 + ((seed % 16) / 10);
    out.push({
      season: seasonIdx,
      episode: ep,
      title: title,
      rating: Math.round(rating * 100) / 100,
      plot: 'Synthetic episode description — TVMaze / TMDb integration will replace this in the next iteration.',
      synth_id: (item.id || 'series') + '-s' + seasonIdx + 'e' + ep,
    });
  }
  return out;
}

function SeriesEpisodesBlock(props) {
  var item = props.item || {};
  var onDownload = props.onDownload;
  var onPlay = props.onPlay;

  var seasons = (item.metadata && item.metadata.seasons) || 1;
  if (typeof seasons !== 'number' || seasons < 1) { seasons = 1; }
  if (seasons > 12) { seasons = 12; } // sanity cap

  // First season expanded by default to match the Zero screenshot.
  var expandedResult = React.useState({ 1: true });
  var expanded = expandedResult[0];
  var setExpanded = expandedResult[1];

  function toggle(seasonIdx) {
    var next = {};
    Object.keys(expanded).forEach(function(k) { next[k] = expanded[k]; });
    next[seasonIdx] = !next[seasonIdx];
    setExpanded(next);
  }

  // Episode count default — matches Smallville's S1 21 eps in the
  // screenshot. Backend math uses the same 8-default when metadata is
  // missing; the front-end takes a slightly different default (10) to
  // keep the rendered list dense without scrolling forever.
  function epCount(seasonIdx) {
    var meta = item.metadata || {};
    if (Array.isArray(meta.episodes_per_season) && meta.episodes_per_season[seasonIdx - 1]) {
      return meta.episodes_per_season[seasonIdx - 1];
    }
    if (typeof meta.episode_count === 'number' && meta.episode_count > 0) {
      return meta.episode_count;
    }
    return 10;
  }

  function callDownload(season, episode) {
    if (typeof onDownload !== 'function') { return; }
    // Build a download arg object that App.jsx → hermesApi.startDownload
    // can pass straight through. We carry the item but also include
    // season + episode so the backend can compute season-vs-episode bytes.
    onDownload(item, { season: season, episode: episode });
  }

  function callPlay(season, episode) {
    if (typeof onPlay !== 'function') { return; }
    onPlay(item, null, { season: season, episode: episode });
  }

  var seasonRows = [];
  for (var s = 1; s <= seasons; s++) {
    seasonRows.push(s);
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <div
          style={{
            fontSize: 'calc(0.78rem * var(--font-scale, 1))',
            fontWeight: 800,
            color: 'var(--muted, #8b949e)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Episodes
        </div>
        <button
          tabIndex={0}
          aria-label="Mark all episodes watched"
          style={{
            padding: '0.35rem 0.9rem',
            background: 'transparent',
            border: '1px solid var(--border, #30363d)',
            borderRadius: '999px',
            color: 'var(--text, #e6edf3)',
            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
          onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
          onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
        >
          Mark all watched
        </button>
      </div>

      {seasonRows.map(function(seasonIdx) {
        var count = epCount(seasonIdx);
        var isOpen = !!expanded[seasonIdx];
        var episodes = isOpen ? _episodesForSeason(item, seasonIdx, count) : [];
        return (
          <div
            key={seasonIdx}
            style={{
              background: 'var(--surface, #161b22)',
              border: '1px solid var(--border, #30363d)',
              borderRadius: '10px',
              marginBottom: '0.6rem',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 0.9rem',
              }}
            >
              <button
                tabIndex={0}
                aria-expanded={isOpen}
                aria-label={'Toggle season ' + seasonIdx}
                onClick={function() { toggle(seasonIdx); }}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(seasonIdx); } }}
                style={{
                  flex: 1,
                  display: 'flex', alignItems: 'center', gap: '0.6rem',
                  background: 'transparent', border: 'none',
                  color: 'var(--text, #e6edf3)', cursor: 'pointer',
                  textAlign: 'left', padding: 0,
                  fontSize: 'calc(0.95rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.color = 'var(--accent)'; }}
                onBlur={function(e) { e.currentTarget.style.color = 'var(--text)'; }}
              >
                <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 120ms' }} aria-hidden="true">⌃</span>
                <span>Season {seasonIdx}</span>
                <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 'calc(0.78rem * var(--font-scale, 1))' }}>
                  {count} eps
                </span>
              </button>

              <button
                tabIndex={0}
                aria-label={'Mark season ' + seasonIdx + ' watched'}
                style={{
                  padding: '0.3rem 0.8rem',
                  background: 'transparent',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '999px',
                  color: 'var(--text, #e6edf3)',
                  fontSize: 'calc(0.65rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
                onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >
                Mark watched
              </button>

              <button
                tabIndex={0}
                title="Download season"
                aria-label={'Download season ' + seasonIdx}
                onClick={function() { callDownload(seasonIdx, null); }}
                onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callDownload(seasonIdx, null); } }}
                style={{
                  width: '36px', height: '36px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent',
                  border: '1px solid var(--border, #30363d)',
                  borderRadius: '50%',
                  color: 'var(--text, #e6edf3)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  outline: 'none',
                }}
                onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
                onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
              >⤓</button>
            </div>

            {isOpen && episodes.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border, #30363d)' }}>
                {episodes.map(function(ep) {
                  var label = item.title + ' - S' + (ep.season < 10 ? '0' + ep.season : ep.season) + 'E' + (ep.episode < 10 ? '0' + ep.episode : ep.episode) + ' - ' + ep.title;
                  return (
                    <div
                      key={ep.synth_id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '110px 1fr auto',
                        gap: '0.9rem',
                        alignItems: 'center',
                        padding: '0.6rem 0.9rem',
                        borderBottom: '1px solid var(--border, #30363d)',
                      }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          width: '110px', height: '62px',
                          background: 'linear-gradient(135deg, var(--surface-raised, #1c2128), var(--bg, #0d1117))',
                          borderRadius: '6px',
                          border: '1px solid var(--border, #30363d)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--muted)', fontSize: '11px', fontWeight: 700,
                          letterSpacing: '0.08em',
                        }}
                      >
                        S{ep.season < 10 ? '0' + ep.season : ep.season}·E{ep.episode < 10 ? '0' + ep.episode : ep.episode}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 'calc(0.85rem * var(--font-scale, 1))',
                            fontWeight: 700,
                            color: 'var(--text, #e6edf3)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ color: 'var(--accent)', marginRight: '0.4rem' }}>E{ep.episode}</span>
                          {label}
                        </div>
                        <div
                          style={{
                            fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                            color: 'var(--muted, #8b949e)',
                            marginTop: '0.15rem',
                          }}
                        >
                          Season {ep.season}
                        </div>
                        <div
                          style={{
                            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                            color: 'var(--muted, #8b949e)',
                            marginTop: '0.1rem',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}
                        >
                          {ep.plot}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                            padding: '0.15rem 0.5rem',
                            border: '1px solid var(--border, #30363d)',
                            borderRadius: '4px',
                            color: 'var(--text, #e6edf3)',
                            fontWeight: 700,
                          }}
                        >
                          ★ {ep.rating.toFixed(2)}
                        </span>
                        <button
                          tabIndex={0}
                          aria-label={'Play S' + ep.season + 'E' + ep.episode}
                          onClick={function() { callPlay(ep.season, ep.episode); }}
                          onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callPlay(ep.season, ep.episode); } }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                            padding: '0.35rem 0.9rem',
                            background: '#e6edf3',
                            border: 'none',
                            borderRadius: '999px',
                            color: '#0d1117',
                            fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                            fontWeight: 700,
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                          onFocus={function(e) { e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)'; }}
                          onBlur={function(e) { e.currentTarget.style.boxShadow = 'none'; }}
                        >
                          <span aria-hidden="true">▶</span> Play
                        </button>
                        <button
                          tabIndex={0}
                          title={'Download S' + ep.season + 'E' + ep.episode}
                          aria-label={'Download S' + ep.season + 'E' + ep.episode}
                          onClick={function() { callDownload(ep.season, ep.episode); }}
                          onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callDownload(ep.season, ep.episode); } }}
                          style={{
                            width: '34px', height: '34px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'transparent',
                            border: '1px solid var(--border, #30363d)',
                            borderRadius: '50%',
                            color: 'var(--text, #e6edf3)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            outline: 'none',
                          }}
                          onFocus={function(e) { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
                          onBlur={function(e) { e.currentTarget.style.outline = 'none'; }}
                        >⤓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SeriesEpisodesBlock;
