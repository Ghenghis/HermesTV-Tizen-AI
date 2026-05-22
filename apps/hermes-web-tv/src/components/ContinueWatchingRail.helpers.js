// ─────────────────────────────────────────────────────────────────────────────
// ContinueWatchingRail.helpers — pure helpers for the Continue Watching rail.
//
// Two concerns:
//   1. formatTimeRemaining(positionSec, durationSec) — turn a position +
//      runtime into a human-readable "12 min left" style label. Returns
//      '~half done' when the math is unreliable (no duration recorded yet,
//      which happens on live items where Zero's seed catalog doesn't carry
//      duration_seconds). Always returns a string.
//   2. progressPercent(item) — clamped + rounded percent for the 2px progress
//      bar. Reads item.percent_complete first (the watch-history store caches
//      it), then derives from position/duration as a fallback. 0..100.
//
// Kept ES5-style (no arrow funcs, no destructuring, no template strings, no
// optional chaining) so Tizen 6.5 / Chrome 76 can swallow the bundle without
// a transform pass.
// ─────────────────────────────────────────────────────────────────────────────

// Format the "N min left" suffix label for a continue-watching card.
//
// Behaviour:
//   - duration missing or zero  → '~half done'  (live items, partial data)
//   - position >= duration      → 'Almost done' (we don't say "0 left" — looks broken)
//   - remaining < 60 sec        → '< 1 min left'
//   - remaining < 60 min        → 'NN min left'
//   - remaining >= 60 min       → 'Hh Mmin left' (e.g. '1h 12 min left')
//
// Returns a string in every case so the caller can drop it into JSX without
// needing a guard around it.
function formatTimeRemaining(positionSec, durationSec) {
  var pos = typeof positionSec === 'number' && isFinite(positionSec) && positionSec >= 0 ? positionSec : 0;
  var dur = typeof durationSec === 'number' && isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  if (dur <= 0) {
    return '~half done';
  }
  if (pos >= dur - 5) {
    // Within 5 sec of the end is "Almost done" — avoids the user seeing
    // "0 min left" on a card they're about to mark watched.
    return 'Almost done';
  }
  var remaining = dur - pos;
  if (remaining < 60) {
    return '< 1 min left';
  }
  if (remaining < 60 * 60) {
    var min = Math.round(remaining / 60);
    return min + ' min left';
  }
  var hours = Math.floor(remaining / 3600);
  var leftover = remaining - hours * 3600;
  var minutesPart = Math.round(leftover / 60);
  // Round-up edge: 59.6 min ceilings to 60 — promote to a clean hour.
  if (minutesPart >= 60) {
    hours += 1;
    minutesPart = 0;
  }
  if (minutesPart === 0) {
    return hours + 'h left';
  }
  return hours + 'h ' + minutesPart + ' min left';
}

// Clamp + round the progress percentage for the 2px progress bar at the
// bottom of the card. Three input shapes are supported because the watch-
// history store evolved over time and older records may not have a cached
// percent_complete column:
//   1. item.percent_complete (number)   → preferred (cached on write)
//   2. item.progress (0..1 number)      → seedCatalog convention (Nuvio uses)
//   3. position_seconds / duration_seconds → derive
//
// Always returns an integer in [0, 100]. 0 when the math isn't possible —
// callers can decide whether to hide the bar entirely on a 0% read.
function progressPercent(item) {
  if (!item) { return 0; }
  if (typeof item.percent_complete === 'number') {
    return _clamp(item.percent_complete);
  }
  if (typeof item.progress === 'number') {
    // seedCatalog uses 0..1; convert to percent for the bar width.
    if (item.progress >= 0 && item.progress <= 1) {
      return _clamp(item.progress * 100);
    }
    // Some legacy seeds already store progress as 0..100 — accept either.
    return _clamp(item.progress);
  }
  var pos = typeof item.position_seconds === 'number' ? item.position_seconds : 0;
  var dur = typeof item.duration_seconds === 'number' ? item.duration_seconds : 0;
  if (!isFinite(pos) || !isFinite(dur)) { return 0; }
  if (dur <= 0) { return 0; }
  return _clamp((pos / dur) * 100);
}

function _clamp(v) {
  if (typeof v !== 'number' || isNaN(v) || !isFinite(v)) { return 0; }
  if (v < 0) { return 0; }
  if (v > 100) { return 100; }
  return Math.round(v);
}

export { formatTimeRemaining, progressPercent };
