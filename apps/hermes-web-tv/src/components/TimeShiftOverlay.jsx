// ─────────────────────────────────────────────────────────────────────────────
// TimeShiftOverlay — pause/rewind live TV indicator + jump-to-live button.
//
// Mainstream IPTV apps (TiviMate, IPTV Smarters, Plex Live TV) let users
// pause / rewind live content using the local HLS buffer. When the user is
// behind the live edge, we surface a clear "Live • -2:34" indicator and a
// "↪ Jump to LIVE" button.
//
// This component is a DATA-DRIVEN OVERLAY — it never touches the video
// element directly; it reads videoRef.current.currentTime and seekable.end
// and exposes a Jump-to-LIVE handler that calls videoRef.current.currentTime =
// seekable.end. PlayerModal can mount this without restructuring.
//
// Props:
//   videoRef:   React ref to the <video> element
//   isLive:     boolean — only render when the source is a live channel
//   profile:    current profile for Mom-mode sizing
//
// Mount in PlayerModal when ticket.item.type === 'live' (orchestrator to wire).
//
// Tizen 6.5 / Chrome 76 safe: ES5 only (var, function exprs, no template
// strings, no destructuring, no arrow funcs in JSX).
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

function TimeShiftOverlay(props) {
  var videoRef = props.videoRef;
  var isLive = props.isLive !== false;
  var profile = props.profile;

  var behindState = React.useState(0); // seconds behind live edge
  var secondsBehind = behindState[0];
  var setSecondsBehind = behindState[1];

  var visibleState = React.useState(false);
  var visible = visibleState[0];
  var setVisible = visibleState[1];

  var hideTimerRef = React.useRef(null);

  // Periodically check how far behind the live edge the user is. When we
  // detect >2 seconds of lag, the overlay flips visible. Re-hides itself
  // 6s after the user returns to live (or stops interacting).
  React.useEffect(function() {
    if (!isLive) return;
    var intervalId = setInterval(function() {
      var v = videoRef && videoRef.current;
      if (!v) return;
      try {
        if (!v.seekable || v.seekable.length === 0) return;
        var liveEdge = v.seekable.end(v.seekable.length - 1);
        var lag = liveEdge - v.currentTime;
        if (lag < 0) lag = 0;
        setSecondsBehind(Math.round(lag));
        if (lag > 2) {
          setVisible(true);
          if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
        } else if (visible) {
          // Schedule a fade-out 6s after returning to live.
          if (!hideTimerRef.current) {
            hideTimerRef.current = setTimeout(function() {
              setVisible(false);
              hideTimerRef.current = null;
            }, 6000);
          }
        }
      } catch (_) { /* ignore one-off seekable race */ }
    }, 1000);
    return function cleanup() {
      clearInterval(intervalId);
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
  }, [isLive, videoRef, visible]);

  if (!isLive || !visible) return null;

  function handleJumpLive() {
    var v = videoRef && videoRef.current;
    if (!v) return;
    try {
      if (v.seekable && v.seekable.length > 0) {
        v.currentTime = v.seekable.end(v.seekable.length - 1);
      }
      if (v.paused) v.play().catch(function() {});
    } catch (_) {}
  }

  function formatLag(s) {
    if (s < 60) return '-0:' + (s < 10 ? '0' + s : s);
    var m = Math.floor(s / 60);
    var rem = s % 60;
    return '-' + m + ':' + (rem < 10 ? '0' + rem : rem);
  }

  var isMom = profile && (profile.mom_mode === true || (profile.font_scale && profile.font_scale >= 1.4));
  var buttonScale = isMom ? 1.4 : 1.0;

  return (
    <div
      role="status"
      aria-live="polite"
      data-time-shift-overlay="true"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 'calc(6rem * var(--font-scale, 1))',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        background: 'rgba(0,0,0,0.78)',
        border: '1px solid var(--border, #23272f)',
        borderRadius: '999px',
        padding: '0.5rem 1rem',
        color: '#fff',
        zIndex: 950,
        fontSize: 'calc(0.95rem * var(--font-scale, 1))',
        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '0.6rem',
          height: '0.6rem',
          borderRadius: '50%',
          background: '#ef4444',
        }}
        aria-hidden="true"
      />
      <span style={{ fontWeight: 700 }}>{'Live ' + formatLag(secondsBehind)}</span>
      <button
        type="button"
        onClick={handleJumpLive}
        onKeyDown={function(e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleJumpLive();
          }
        }}
        tabIndex={0}
        aria-label="Jump to live"
        style={{
          background: 'var(--accent, #58a6ff)',
          color: '#fff',
          border: 'none',
          borderRadius: '999px',
          padding: (isMom ? '0.55rem 1.2rem' : '0.35rem 0.9rem'),
          fontWeight: 700,
          cursor: 'pointer',
          fontSize: (0.85 * buttonScale) + 'rem',
        }}
      >
        ↪ Jump to LIVE
      </button>
    </div>
  );
}

export default TimeShiftOverlay;
