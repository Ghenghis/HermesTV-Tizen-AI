// ─────────────────────────────────────────────────────────────────────────────
// Screensaver — ambient overlay that takes over after N minutes of idle.
//
// Shows a large clock + soft gradient + "Press any key to resume" hint.
// Mounts at App.jsx top-level via useScreensaverIdle(profile.screensaver_min_idle).
// Auto-dismisses on first keydown/mousemove (the hook handles it).
//
// Animations gated on !profile.reduced_motion. The clock updates every second.
//
// Tizen 6.5 / Chrome 76 safe: ES5 only.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

function Screensaver(props) {
  var profile = props.profile;
  var onResume = props.onResume; // optional explicit dismiss callback

  var nowState = React.useState(function() { return new Date(); });
  var now = nowState[0];
  var setNow = nowState[1];

  React.useEffect(function() {
    var id = setInterval(function() { setNow(new Date()); }, 1000);
    return function cleanup() { clearInterval(id); };
  }, []);

  React.useEffect(function() {
    function handleAny(e) {
      if (typeof onResume === 'function') onResume(e);
    }
    var events = ['keydown', 'mousemove', 'mousedown', 'touchstart'];
    for (var i = 0; i < events.length; i++) {
      window.addEventListener(events[i], handleAny, { passive: true, once: true });
    }
    return function cleanup() {
      for (var j = 0; j < events.length; j++) {
        window.removeEventListener(events[j], handleAny);
      }
    };
  }, [onResume]);

  var reduced = !!(profile && profile.reduced_motion);
  var hh = now.getHours();
  var mm = now.getMinutes();
  var ampm = hh >= 12 ? 'PM' : 'AM';
  var h12 = hh % 12 === 0 ? 12 : hh % 12;
  var hhmm = h12 + ':' + (mm < 10 ? '0' + mm : mm);
  var weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  var datePart = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screensaver"
      data-screensaver="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 40%, #1f2937 0%, #050609 80%)',
        color: '#e6edf3',
        animation: reduced ? 'none' : 'screensaver-fade 800ms ease',
      }}
    >
      <style>{
        '@keyframes screensaver-fade { from { opacity: 0; } to { opacity: 1; } }'
      }</style>
      <div
        style={{
          fontSize: 'clamp(6rem, 18vw, 14rem)',
          fontWeight: 200,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          textShadow: '0 4px 24px rgba(0,0,0,0.5)',
        }}
      >
        {hhmm}
        <span style={{ fontSize: '0.35em', marginLeft: '0.25em', verticalAlign: 'top', color: 'var(--accent, #58a6ff)' }}>
          {ampm}
        </span>
      </div>
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: 'clamp(1.2rem, 2vw, 1.8rem)',
          color: 'var(--muted, #8b95a3)',
          fontWeight: 400,
        }}
      >
        {weekday + ', ' + datePart}
      </div>
      <div
        style={{
          marginTop: '4rem',
          fontSize: 'clamp(0.9rem, 1.2vw, 1.1rem)',
          color: 'var(--muted, #8b95a3)',
          fontWeight: 500,
          letterSpacing: '0.05em',
        }}
      >
        Press any key to resume
      </div>
    </div>
  );
}

export default Screensaver;
