// ─────────────────────────────────────────────────────────────────────────────
// useScreensaverIdle — returns idle: boolean after N minutes of no input.
//
// Listens to keydown / mousemove / touchstart / wheel. When `idleMinutes`
// elapses with no activity, returns `{ idle: true }`. Any input resets the
// timer.
//
// Usage:
//   const { idle, lastActivity } = useScreensaverIdle(10); // 10 minutes
//   if (idle) return <Screensaver onResume={...} />;
//
// Tizen 6.5 / Chrome 76 safe: ES5 only.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

var DEFAULT_IDLE_MIN = 10;

function useScreensaverIdle(idleMinutes) {
  var minutes = typeof idleMinutes === 'number' && idleMinutes > 0 ? idleMinutes : DEFAULT_IDLE_MIN;
  var idleMs = minutes * 60 * 1000;

  var lastActivityRef = React.useRef(Date.now());
  var idleState = React.useState(false);
  var idle = idleState[0];
  var setIdle = idleState[1];

  React.useEffect(function() {
    function bump() {
      lastActivityRef.current = Date.now();
      if (idle) setIdle(false);
    }
    var events = ['keydown', 'mousemove', 'mousedown', 'touchstart', 'wheel'];
    for (var i = 0; i < events.length; i++) {
      window.addEventListener(events[i], bump, { passive: true });
    }

    var tickId = setInterval(function() {
      if (Date.now() - lastActivityRef.current > idleMs) {
        setIdle(true);
      }
    }, 5000);

    return function cleanup() {
      for (var j = 0; j < events.length; j++) {
        window.removeEventListener(events[j], bump);
      }
      clearInterval(tickId);
    };
  }, [idleMs, idle]);

  return { idle: idle, lastActivity: lastActivityRef.current };
}

export default useScreensaverIdle;
