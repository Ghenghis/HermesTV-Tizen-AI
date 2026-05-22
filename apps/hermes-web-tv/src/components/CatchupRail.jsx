// ─────────────────────────────────────────────────────────────────────────────
// CatchupRail — "What you missed in the last N hours" rail for live shells.
//
// Mainstream IPTV apps (TiviMate, IPTV Smarters) let users rewatch programs
// from the past 6-12 hours via a "catch-up" backend. Our backend exposes
// GET /api/catchup/:channelId and POST /api/catchup/play (returns 501 stub
// until Phase 4 — handled gracefully here).
//
// Props:
//   profile:        the current viewing profile
//   channels:       array of live items (filter on item.type === 'live')
//   onItemSelect:   callback(item) when the user picks a catch-up program
//   hoursBack:      how far back to look (default 6)
//
// Mount in LiveTVShell, TiviMateShell, ZeroShell after the Continue Watching
// rail (orchestrator to wire). Renders nothing if no catch-up programs found
// across the supplied channels.
//
// Tizen 6.5 / Chrome 76 safe: ES5 only (var, function exprs, no template
// strings, no destructuring, no arrow funcs in JSX).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { capForProfile } from '../utils/isSystemLimited.js';
import { isCatchupEnabled } from '../store/releaseFlags.js';

function CatchupRail(props) {
  // HANDOFF #2 gate. Catch-up playback returns 501 from /api/catchup/play
  // until the timeshift pipeline ships, and /api/catchup/:channelId is an
  // empty `programs: []` array. Rendering the rail header + skeleton in
  // that state is dishonest — the user thinks something is loading when
  // there is nothing to load. Early-return null so the shell composes
  // honestly (no rail at all).
  if (!isCatchupEnabled()) { return null; }
  var profile = props.profile;
  var channels = Array.isArray(props.channels) ? props.channels : [];
  var onItemSelect = props.onItemSelect;
  var hoursBack = typeof props.hoursBack === 'number' ? props.hoursBack : 6;

  var programsState = React.useState([]);
  var programs = programsState[0];
  var setPrograms = programsState[1];

  var loadingState = React.useState(true);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var toastState = React.useState(null);
  var toast = toastState[0];
  var setToast = toastState[1];

  // Pull the 12 most relevant live channels and fetch /api/catchup for each.
  // We MUST filter to channels that advertise catch-up support — the backend
  // only carries a catch-up window for the subset tagged has_catchup=true
  // (mirror of provider timeshift support). Firing /api/catchup/* for any
  // other live channel produces a 404 storm in the console and the server
  // log on every shell mount. Catalog items expose this signal at
  //   item.metadata.has_catchup  (live items only)
  // The fallback also accepts a top-level catch_up_available flag for any
  // channel sourced from /api/channels rather than /api/catalog.
  React.useEffect(function() {
    if (!channels || channels.length === 0) {
      setLoading(false);
      return;
    }
    var liveChannels = [];
    for (var i = 0; i < channels.length && liveChannels.length < 12; i++) {
      var ch = channels[i];
      if (!ch || ch.type !== 'live') continue;
      var hasCatchup = (ch.metadata && ch.metadata.has_catchup === true)
        || ch.catch_up_available === true
        || ch.has_catchup === true;
      if (!hasCatchup) continue;
      liveChannels.push(ch);
    }
    if (liveChannels.length === 0) {
      setLoading(false);
      return;
    }

    var aborted = false;
    var collected = [];
    var pending = liveChannels.length;

    function done() {
      pending = pending - 1;
      if (pending === 0 && !aborted) {
        // Sort by start_utc descending (most recent first) and cap at 24 cards.
        // Mom-never-limited rule: Sherri's TV bypasses the cap so she sees the
        // full catch-up window across all live channels.
        collected.sort(function(a, b) {
          var aT = a && a.start_utc ? new Date(a.start_utc).getTime() : 0;
          var bT = b && b.start_utc ? new Date(b.start_utc).getTime() : 0;
          return bT - aT;
        });
        setPrograms(collected.slice(0, capForProfile(profile, 24)));
        setLoading(false);
      }
    }

    for (var k = 0; k < liveChannels.length; k++) {
      (function(channel) {
        var url = '/api/catchup/' + encodeURIComponent(channel.id) + '?hours=' + hoursBack;
        fetch(url).then(function(res) {
          if (!res.ok) return null;
          return res.json();
        }).then(function(body) {
          if (!body || !Array.isArray(body.programs)) return done();
          for (var j = 0; j < body.programs.length; j++) {
            var p = body.programs[j];
            if (!p) continue;
            if (p.catchup_available === false) continue;
            collected.push({
              channel: channel,
              program: p,
              start_utc: p.start_utc,
            });
          }
          done();
        }).catch(function() { done(); });
      })(liveChannels[k]);
    }

    return function cleanup() { aborted = true; };
  }, [channels, hoursBack]);

  if (loading) return null;
  if (!programs || programs.length === 0) return null;

  var isMom = profile && (profile.mom_mode === true || (profile.font_scale && profile.font_scale >= 1.4));
  var cardW = isMom ? 280 : 220;

  function handleClick(entry) {
    fetch('/api/catchup/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_id: entry.channel.id,
        program_id: entry.program.id,
        profile_id: profile ? profile.id : null,
      }),
    }).then(function(res) {
      if (res.status === 501) {
        setToast('Catch-up playback is coming in Phase 4');
        setTimeout(function() { setToast(null); }, 3500);
        return null;
      }
      return res.json();
    }).then(function(body) {
      if (!body) return;
      // Backend returned a playable item shape — defer to PlayerModal via
      // the onItemSelect callback (already wired to App.jsx).
      if (typeof onItemSelect === 'function') {
        onItemSelect(body.item || entry.channel);
      }
    }).catch(function() {
      setToast('Catch-up unavailable right now');
      setTimeout(function() { setToast(null); }, 3500);
    });
  }

  function formatStart(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      var hh = d.getHours();
      var mm = d.getMinutes();
      var ampm = hh >= 12 ? 'PM' : 'AM';
      var h12 = hh % 12 === 0 ? 12 : hh % 12;
      return h12 + ':' + (mm < 10 ? '0' + mm : mm) + ' ' + ampm;
    } catch (_) { return ''; }
  }

  return (
    <section
      aria-label="Catch up TV"
      data-catchup-rail="true"
      style={{
        padding: 'calc(0.5rem * var(--font-scale, 1)) 0',
        margin: 'calc(0.75rem * var(--font-scale, 1)) 0',
      }}
    >
      <h3
        style={{
          fontSize: 'calc(1.1rem * var(--font-scale, 1))',
          fontWeight: 700,
          margin: '0 0 calc(0.5rem * var(--font-scale, 1)) calc(1rem * var(--font-scale, 1))',
          color: 'var(--text, #e6edf3)',
        }}
      >
        {'↶ What you missed in the last ' + hoursBack + ' hours'}
      </h3>
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          overflowX: 'auto',
          padding: '0 1rem 0.5rem',
          scrollSnapType: 'x mandatory',
        }}
      >
        {programs.map(function(entry, idx) {
          var item = entry.channel;
          var prog = entry.program;
          var title = (prog && prog.title) || 'Catch-up program';
          var chanName = (item && (item.title || item.name)) || '';
          var startLabel = formatStart(entry.start_utc);

          return (
            <button
              key={(item.id || 'c') + '-' + idx}
              type="button"
              onClick={function() { handleClick(entry); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClick(entry);
                }
              }}
              tabIndex={0}
              aria-label={'Catch up: ' + title + ' on ' + chanName + ', started at ' + startLabel}
              style={{
                flex: '0 0 auto',
                width: cardW + 'px',
                background: 'var(--surface, #1a1d23)',
                border: '1px solid var(--border, #23272f)',
                borderRadius: '10px',
                padding: '0.75rem',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text, #e6edf3)',
                scrollSnapAlign: 'start',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  fontSize: 'calc(0.7rem * var(--font-scale, 1))',
                  background: 'var(--accent, #58a6ff)',
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  marginBottom: '0.4rem',
                  fontWeight: 700,
                }}
              >
                ↶ CATCH UP
              </div>
              <div
                style={{
                  fontSize: 'calc(0.95rem * var(--font-scale, 1))',
                  fontWeight: 700,
                  marginBottom: '0.2rem',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontSize: 'calc(0.78rem * var(--font-scale, 1))',
                  color: 'var(--muted, #8b95a3)',
                }}
              >
                {chanName + (startLabel ? ' · ' + startLabel : '')}
              </div>
            </button>
          );
        })}
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '5rem',
            right: '1.5rem',
            background: 'var(--surface, #1a1d23)',
            color: 'var(--text, #e6edf3)',
            border: '1px solid var(--border, #23272f)',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            fontSize: 'calc(0.9rem * var(--font-scale, 1))',
            zIndex: 9000,
          }}
        >
          {toast}
        </div>
      ) : null}
    </section>
  );
}

export default CatchupRail;
