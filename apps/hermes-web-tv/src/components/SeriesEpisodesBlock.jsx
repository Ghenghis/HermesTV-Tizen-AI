import React from 'react';
import SeriesNextUp from './SeriesNextUp.jsx';
import { getSeriesDetails } from '../api/hermesApi.js';

function _episodeLabel(ep) {
  var season = ep && ep.season ? ep.season : 1;
  var episode = ep && ep.episode ? ep.episode : 1;
  return 'S' + (season < 10 ? '0' + season : season) +
    'E' + (episode < 10 ? '0' + episode : episode);
}

function _groupBySeason(episodes) {
  var groups = {};
  var order = [];
  for (var i = 0; i < episodes.length; i++) {
    var ep = episodes[i];
    var season = ep && ep.season ? ep.season : 1;
    var key = String(season);
    if (!groups[key]) {
      groups[key] = [];
      order.push(season);
    }
    groups[key].push(ep);
  }
  order.sort(function(a, b) { return a - b; });
  return { groups: groups, order: order };
}

function _progressFor(itemId, episodeId) {
  if (!itemId || !episodeId) { return null; }
  try {
    if (typeof window !== 'undefined' && window.__hermesWatchHistory) {
      var rec = window.__hermesWatchHistory.getEpisode(itemId, episodeId);
      if (rec && typeof rec.percent_complete === 'number') { return rec.percent_complete; }
    }
  } catch (e) { /* no persisted progress available */ }
  return null;
}

function SeriesEpisodesBlock(props) {
  var item = props.item || {};
  var onDownload = props.onDownload;
  var onPlay = props.onPlay;
  var profileId = props.profileId || '';

  var detailsState = React.useState({
    loading: true,
    error: '',
    episodes: [],
  });
  var details = detailsState[0];
  var setDetails = detailsState[1];

  var expandedState = React.useState({});
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];

  var openPlotsState = React.useState({});
  var openPlots = openPlotsState[0];
  var setOpenPlots = openPlotsState[1];

  React.useEffect(function() {
    var alive = true;
    if (!item.id) {
      setDetails({ loading: false, error: 'Series item is missing an id.', episodes: [] });
      return function() { alive = false; };
    }
    setDetails({ loading: true, error: '', episodes: [] });
    getSeriesDetails(item.id, profileId).then(function(body) {
      if (!alive) { return; }
      var episodes = body && Array.isArray(body.episodes) ? body.episodes : [];
      setDetails({ loading: false, error: '', episodes: episodes });
      if (episodes.length > 0) {
        var firstSeason = episodes[0].season || 1;
        var nextExpanded = {};
        nextExpanded[firstSeason] = true;
        setExpanded(nextExpanded);
      }
    }).catch(function(err) {
      if (!alive) { return; }
      setDetails({
        loading: false,
        error: (err && err.message) ? err.message : 'Episode metadata is unavailable.',
        episodes: [],
      });
    });
    return function() { alive = false; };
  }, [item.id, profileId]);

  function toggle(seasonIdx) {
    var next = {};
    Object.keys(expanded).forEach(function(k) { next[k] = expanded[k]; });
    next[seasonIdx] = !next[seasonIdx];
    setExpanded(next);
  }

  function togglePlot(key) {
    var next = {};
    Object.keys(openPlots).forEach(function(k) { next[k] = openPlots[k]; });
    next[key] = !next[key];
    setOpenPlots(next);
  }

  function callDownload(ep) {
    if (typeof onDownload !== 'function' || !ep) { return; }
    onDownload(item, {
      season: ep.season,
      episode: ep.episode,
      episode_id: ep.episode_id,
      episode_item_id: ep.play_item_id,
    });
  }

  function callPlay(ep) {
    if (typeof onPlay !== 'function' || !ep || !ep.play_item_id) { return; }
    onPlay(item, null, {
      episode_item_id: ep.play_item_id,
      episode_id: ep.episode_id,
      season: ep.season,
      episode: ep.episode,
    });
  }

  var grouped = _groupBySeason(details.episodes);

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
      </div>

      {details.loading && (
        <div
          style={{
            padding: '1rem',
            border: '1px solid var(--border, #30363d)',
            borderRadius: 'var(--radius-md, 12px)',
            color: 'var(--muted, #8b949e)',
          }}
        >
          Loading provider episode metadata...
        </div>
      )}

      {!details.loading && details.error && (
        <div
          style={{
            padding: '1rem',
            border: '1px solid rgba(248,113,113,0.45)',
            borderRadius: 'var(--radius-md, 12px)',
            color: '#fecaca',
            background: 'rgba(127,29,29,0.18)',
          }}
        >
          {details.error}
        </div>
      )}

      {!details.loading && !details.error && details.episodes.length === 0 && (
        <div
          style={{
            padding: '1rem',
            border: '1px solid var(--border, #30363d)',
            borderRadius: 'var(--radius-md, 12px)',
            color: 'var(--muted, #8b949e)',
          }}
        >
          This provider did not return playable episode metadata for this series.
        </div>
      )}

      {!details.loading && !details.error && details.episodes.length > 0 && (
        <div>
          <SeriesNextUp item={item} episodes={details.episodes} onPlay={onPlay} />

          {grouped.order.map(function(seasonIdx) {
            var key = String(seasonIdx);
            var eps = grouped.groups[key] || [];
            var isOpen = expanded[key] !== false;
            return (
              <div
                key={key}
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
                    onClick={function() { toggle(key); }}
                    onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(key); } }}
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
                      {eps.length} eps
                    </span>
                  </button>
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border, #30363d)' }}>
                    {eps.map(function(ep) {
                      var label = _episodeLabel(ep);
                      var title = ep.title || label;
                      var plotKey = ep.play_item_id || ep.episode_id || label;
                      var plotOpen = !!openPlots[plotKey];
                      var pct = _progressFor(item.id, ep.episode_id);
                      var hasProgress = (typeof pct === 'number' && pct > 0);
                      var hasPlot = typeof ep.plot === 'string' && ep.plot.length > 0;
                      return (
                        <div
                          key={plotKey}
                          style={{
                            position: 'relative',
                            display: 'grid',
                            gridTemplateColumns: '110px 1fr auto',
                            gap: '0.9rem',
                            alignItems: 'flex-start',
                            padding: '0.6rem 0.9rem',
                            borderBottom: '1px solid var(--border, #30363d)',
                          }}
                        >
                          <div
                            aria-hidden="true"
                            style={{
                              width: '110px', height: '62px',
                              background: ep.still_url ? 'transparent' : 'linear-gradient(135deg, var(--surface-raised, #1c2128), var(--bg, #0d1117))',
                              borderRadius: 'var(--radius-sm, 6px)',
                              border: '1px solid var(--border, #30363d)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'var(--muted)', fontSize: '11px', fontWeight: 700,
                              letterSpacing: '0.08em',
                              overflow: 'hidden',
                            }}
                          >
                            {ep.still_url ? (
                              <img src={ep.still_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : label}
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
                              <span style={{ color: 'var(--accent)', marginRight: '0.4rem' }}>{label}</span>
                              {title}
                            </div>
                            <div
                              style={{
                                fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                                color: 'var(--muted, #8b949e)',
                                marginTop: '0.15rem',
                              }}
                            >
                              {ep.runtime_min ? (ep.runtime_min + ' min') : 'Provider episode'}
                            </div>
                            {hasPlot && (
                              <div>
                                <div
                                  style={{
                                    fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                                    color: 'var(--muted, #8b949e)',
                                    marginTop: '0.1rem',
                                    overflow: 'hidden',
                                    textOverflow: plotOpen ? 'clip' : 'ellipsis',
                                    whiteSpace: plotOpen ? 'normal' : 'nowrap',
                                    lineHeight: '1.45',
                                  }}
                                >
                                  {ep.plot}
                                </div>
                                {ep.plot.length > 120 && (
                                  <button
                                    tabIndex={0}
                                    aria-expanded={plotOpen}
                                    aria-label={(plotOpen ? 'Hide' : 'Show') + ' synopsis for ' + label}
                                    onClick={function() { togglePlot(plotKey); }}
                                    onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePlot(plotKey); } }}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      padding: '0.1rem 0',
                                      marginTop: '0.15rem',
                                      color: 'var(--accent)',
                                      fontSize: 'calc(0.68rem * var(--font-scale, 1))',
                                      fontWeight: 700,
                                      letterSpacing: '0.04em',
                                      cursor: 'pointer',
                                      outline: 'none',
                                    }}
                                  >
                                    {plotOpen ? 'Show less' : 'Show more'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {typeof ep.rating === 'number' && (
                              <span
                                style={{
                                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                                  padding: '0.15rem 0.5rem',
                                  border: '1px solid var(--border, #30363d)',
                                  borderRadius: 'var(--radius-xs, 4px)',
                                  color: 'var(--text, #e6edf3)',
                                  fontWeight: 700,
                                }}
                              >
                                ★ {ep.rating.toFixed(1)}
                              </span>
                            )}
                            <button
                              tabIndex={0}
                              aria-label={'Play ' + label}
                              disabled={!ep.play_item_id}
                              onClick={function() { callPlay(ep); }}
                              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callPlay(ep); } }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.35rem 0.9rem',
                                background: '#e6edf3',
                                border: 'none',
                                borderRadius: 'var(--radius-pill, 999px)',
                                color: '#0d1117',
                                fontSize: 'calc(0.72rem * var(--font-scale, 1))',
                                fontWeight: 700,
                                cursor: ep.play_item_id ? 'pointer' : 'not-allowed',
                                outline: 'none',
                                opacity: ep.play_item_id ? 1 : 0.55,
                              }}
                            >
                              <span aria-hidden="true">▶</span> {hasProgress ? 'Resume' : 'Play'}
                            </button>
                            <button
                              tabIndex={0}
                              title={'Download ' + label}
                              aria-label={'Download ' + label}
                              onClick={function() { callDownload(ep); }}
                              onKeyDown={function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); callDownload(ep); } }}
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
                            >⤓</button>
                          </div>
                          {hasProgress && (
                            <div
                              aria-label={'Watched ' + Math.round(pct * 100) + ' percent'}
                              style={{
                                gridColumn: '1 / -1',
                                position: 'relative',
                                height: '3px',
                                width: '100%',
                                background: 'rgba(255,255,255,0.08)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                                marginTop: '0.45rem',
                              }}
                            >
                              <div
                                style={{
                                  width: Math.round(pct * 100) + '%',
                                  height: '100%',
                                  background: 'var(--gradient-accent)',
                                  transition: 'width 240ms var(--ease-out, ease)',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SeriesEpisodesBlock;
