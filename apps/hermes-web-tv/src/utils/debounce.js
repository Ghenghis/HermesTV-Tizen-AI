// debounce.js — tiny no-dep debouncer for input handlers.
//
// Why: typing "spo" into the catalog search re-filters the catalog on every
// keystroke. With 200+ items each pass burns frames Mom can feel as lag
// (user rule: "lag is restricted in this app, must be instant"). Debouncing
// keystrokes to 120 ms collapses bursty typing into a single filter pass
// while feeling instant to a human — under the ~150 ms motor-to-visual
// perception threshold.
//
// Tizen 6.5 (Chromium 76) compatible: no async/await, no spread args, no
// optional chaining. setTimeout/clearTimeout only. Drop-in replacement for
// lodash.debounce's common subset — we don't ship lodash here to keep the
// vendor chunk tight.

export function debounce(fn, waitMs) {
  var wait = typeof waitMs === 'number' ? waitMs : 120;
  var timer = null;
  function debounced() {
    var args = arguments;
    var ctx = this;
    if (timer !== null) { clearTimeout(timer); }
    timer = setTimeout(function() {
      timer = null;
      fn.apply(ctx, args);
    }, wait);
  }
  debounced.cancel = function() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
  return debounced;
}
