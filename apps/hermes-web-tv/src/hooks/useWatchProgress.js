// useWatchProgress.js — React hook for the play surface.
//
// Returns `{ progress, recordTick }` where:
//   - `progress` is the most recently loaded watch_history row for
//     (profileId, item.id), or null if there's no prior playback.
//   - `recordTick(positionSec)` is a throttled writer. The video element
//     fires position updates every requestAnimationFrame (~60Hz on PC,
//     ~30Hz on Tizen); we don't want to thrash IDB or wear the flash.
//     One write every 5 seconds is plenty for "continue watching".
//
// Throttle behavior: the first call after a 5s window fires immediately;
// subsequent calls within the window are coalesced into a single trailing
// write so we never lose the last position when the user pauses. We rely
// on the unmount cleanup to flush whatever's pending.
//
// Hook contract:
//   var hp = useWatchProgress({
//     profileId: 'mom_tv',
//     item: { id: 'mv_42', type: 'movies', title: 'Casablanca' },
//     durationSec: 6420
//   });
//   hp.progress             // → { position_seconds: 1230, percent_complete: 19.2, ... } | null
//   hp.recordTick(1234.5)   // → throttled write
//
// Style: matches the project's React.useState array-destructure pattern
// (see VoicePickerModal.jsx) — no `var [x, setX]` destructuring because
// the Tizen 6.5 webview was originally cautious about destructuring perf.

import React from 'react';
import * as watchHistoryStore from '../store/watchHistoryStore.js';

var THROTTLE_MS = 5000;

function useWatchProgress(opts) {
  var profileId = opts && opts.profileId;
  var item = opts && opts.item;
  var durationSec = opts && typeof opts.durationSec === 'number' ? opts.durationSec : 0;
  var itemId = item && item.id ? String(item.id) : null;

  var progressResult = React.useState(null);
  var progress = progressResult[0];
  var setProgress = progressResult[1];

  // Refs hold the throttle state. We avoid putting these in useState because
  // a re-render on every tick would defeat the throttling.
  var lastWriteAtRef = React.useRef(0);
  var pendingTimerRef = React.useRef(null);
  var pendingPositionRef = React.useRef(null);

  // Load existing progress when the (profile, item) pair changes.
  React.useEffect(function() {
    var cancelled = false;
    if (!profileId || !itemId) {
      setProgress(null);
      return undefined;
    }
    watchHistoryStore.getProgress(profileId, itemId).then(function(row) {
      if (!cancelled) {
        setProgress(row);
      }
    });
    return function() { cancelled = true; };
  }, [profileId, itemId]);

  // Flush any pending write on unmount or when the (profile, item) pair changes.
  React.useEffect(function() {
    return function cleanup() {
      if (pendingTimerRef.current !== null) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      var pos = pendingPositionRef.current;
      if (pos !== null && profileId && item && item.id) {
        watchHistoryStore.recordWatch(profileId, item, pos, durationSec);
        pendingPositionRef.current = null;
      }
    };
  }, [profileId, itemId, durationSec, item]);

  function _doWrite(positionSec) {
    lastWriteAtRef.current = Date.now();
    pendingPositionRef.current = null;
    watchHistoryStore.recordWatch(profileId, item, positionSec, durationSec).then(function(record) {
      if (record) { setProgress(record); }
    });
  }

  function recordTick(positionSec) {
    if (!profileId || !item || !item.id) { return; }
    if (typeof positionSec !== 'number' || positionSec < 0) { return; }
    var now = Date.now();
    var elapsed = now - lastWriteAtRef.current;
    if (elapsed >= THROTTLE_MS) {
      // Leading edge: write immediately.
      _doWrite(positionSec);
      return;
    }
    // Within the window: store the most recent position for the trailing
    // write, and arm a timer if none is set yet.
    pendingPositionRef.current = positionSec;
    if (pendingTimerRef.current === null) {
      var remaining = THROTTLE_MS - elapsed;
      pendingTimerRef.current = setTimeout(function() {
        pendingTimerRef.current = null;
        var pos = pendingPositionRef.current;
        if (pos !== null) {
          _doWrite(pos);
        }
      }, remaining);
    }
  }

  return { progress: progress, recordTick: recordTick };
}

export { useWatchProgress };
export default useWatchProgress;
