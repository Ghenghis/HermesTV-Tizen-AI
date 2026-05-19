'use strict';

// tizenSpatialNav — pure-function spatial navigation helpers for the Samsung
// Tizen remote D-pad (or any arrow-key driven UI).
//
// Why this exists:
//   The CSS `nav-*-up|down|left|right` properties from the WHATWG draft were
//   never implemented in Chromium. Samsung Tizen does ship a `webapis.tv`
//   spatial-navigation polyfill on newer firmware, but it's inconsistent on
//   the QN85/QN95 design target and absent in dev Chromium. So we roll our
//   own — small, pure, deterministic, testable, and no React dependency.
//
//   The helpers below take an HTMLElement (or DOM root) and return either
//   the next focusable in a given direction, or the full focusable set. The
//   only side-effect helper is `installSpatialNav`, which wires a keydown
//   listener and calls `.focus()` on the next element. Everything else is
//   pure.
//
// ES5 only — Tizen 6.5 webview ships Chromium 76. No template literals,
// arrow funcs, destructuring, or optional chaining.
//
// Developer reference: docs/45_TIZEN_REMOTE_KEYMAP.md §Spatial navigation.

// Selectors we treat as focusable. We include `[data-focusable]` so app
// authors can opt cards in without giving them an explicit tabindex (which
// affects browser focus order). Order matters mainly for `findFocusable`
// snapshot stability across test runs.
var FOCUSABLE_SELECTOR = [
  '[data-focusable]',
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="link"]'
].join(',');

// isVisible — element is rendered and big enough to focus. We use the
// browser's getBoundingClientRect rather than offsetParent because the Zero
// shell uses `position: fixed` panels whose offsetParent is null even when
// they're visible. A zero-size rect (display:none, visibility:hidden,
// aria-hidden hidden=true wrappers) filters out the elements we don't want.
function isVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') { return false; }
  if (el.disabled) { return false; }
  if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') { return false; }
  // Walk up checking inline display/visibility — JSDOM doesn't compute
  // styles, so we trust the attributes the test sets. Real browsers will
  // hit the rect check below.
  var rect = el.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) { return false; }
  return true;
}

// findFocusable — returns every focus-eligible element under `root`, in DOM
// order. Filters out hidden / disabled / aria-hidden nodes. Safe to call on
// `document` (which is the default root). Returns a fresh array each call;
// callers can sort / partition without affecting the DOM.
function findFocusable(root) {
  if (typeof document === 'undefined') { return []; }
  var scope = root || document;
  if (!scope || typeof scope.querySelectorAll !== 'function') { return []; }
  var nodes = scope.querySelectorAll(FOCUSABLE_SELECTOR);
  var out = [];
  for (var i = 0; i < nodes.length; i++) {
    if (isVisible(nodes[i])) {
      out.push(nodes[i]);
    }
  }
  return out;
}

// Returns { x, y, width, height, cx, cy } for an element, where cx/cy are
// the rect's centroid. Centroid distance is what the directional picker
// compares — picking the candidate whose center is "most in the right
// direction" while staying inside the directional cone.
function rectOf(el) {
  var r = el.getBoundingClientRect();
  return {
    left:   r.left,
    top:    r.top,
    right:  r.right,
    bottom: r.bottom,
    width:  r.width,
    height: r.height,
    cx:     r.left + r.width  / 2,
    cy:     r.top  + r.height / 2
  };
}

// Direction predicate — does candidate B sit in the requested direction
// relative to A? We require the candidate's near edge to be past A's far
// edge in the primary axis (no partial overlap counts), AND we tolerate a
// small slack on the perpendicular axis so a card directly above-right
// still counts as "right" when the user's intent is obviously horizontal.
function inDirection(a, b, dir) {
  // perpendicular slack: half the smaller dimension. Keeps a row of cards
  // selectable even when their y-positions vary by a few pixels.
  var slack;
  if (dir === 'left' || dir === 'right') {
    slack = Math.min(a.height, b.height) / 2;
    var verticalOverlap = (b.bottom > a.top - slack) && (b.top < a.bottom + slack);
    if (!verticalOverlap) { return false; }
    return dir === 'right' ? b.left >= a.right - 1 : b.right <= a.left + 1;
  }
  // dir === 'up' || dir === 'down'
  slack = Math.min(a.width, b.width) / 2;
  var horizontalOverlap = (b.right > a.left - slack) && (b.left < a.right + slack);
  if (!horizontalOverlap) { return false; }
  return dir === 'down' ? b.top >= a.bottom - 1 : b.bottom <= a.top + 1;
}

// Distance score — Euclidean centroid distance with a heavy weight on the
// primary axis so movement is "sticky" to the requested direction. A
// candidate that's 50px directly right beats one that's 30px right + 200px
// down.
function score(a, b, dir) {
  var dx = b.cx - a.cx;
  var dy = b.cy - a.cy;
  if (dir === 'left' || dir === 'right') {
    return Math.abs(dx) + Math.abs(dy) * 2;
  }
  return Math.abs(dy) + Math.abs(dx) * 2;
}

// nextInDirection — given the currently focused element, a list of
// focusable candidates (typically findFocusable(root)), and a direction
// ('up' / 'down' / 'left' / 'right'), return the element that should
// receive focus next, or null if there's nothing further in that
// direction.
//
// Pure function. Does NOT call .focus() — the caller decides whether to
// move focus (e.g. installSpatialNav does; a unit test does not).
function nextInDirection(current, candidates, direction) {
  if (!current || !candidates || !candidates.length) { return null; }
  if (direction !== 'up' && direction !== 'down' &&
      direction !== 'left' && direction !== 'right') {
    return null;
  }
  var a = rectOf(current);
  var best = null;
  var bestScore = Infinity;
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (c === current) { continue; }
    var b = rectOf(c);
    if (!inDirection(a, b, direction)) { continue; }
    var s = score(a, b, direction);
    if (s < bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

// Map raw keyCode → cardinal direction. Handles the standard arrow keyCodes
// (37/38/39/40) AND the alternate codes (4/5/6/7) Tizen surfaces on some
// older remotes — see TIZEN_KEY_CODES in tizenKeyMap.js.
function directionForKey(keyCode) {
  if (keyCode === 37 || keyCode === 4) { return 'left'; }
  if (keyCode === 38 || keyCode === 5) { return 'up'; }
  if (keyCode === 39 || keyCode === 6) { return 'right'; }
  if (keyCode === 40 || keyCode === 7) { return 'down'; }
  return null;
}

// installSpatialNav — wire arrow-key spatial nav under a root selector.
// Returns an unmount fn so React effects can clean up.
//
// options:
//   rootSelector  — CSS selector for the nav scope. Default: document.
//   onMove        — (next, dir) callback fired AFTER focus moves. Optional.
//   onEdge        — (dir) fired when arrow press has no candidate in
//                   that direction (lets the caller scroll, page, or wrap).
//                   Return truthy to swallow the event (no further default).
//   preventScroll — bool, default true. Passes { preventScroll: true } to
//                   element.focus() so spatial nav doesn't yank the page.
//   keyFilter     — optional fn(event) → bool. Return false to skip handling
//                   (e.g. when an input has focus). Default: skip if event
//                   target is INPUT/TEXTAREA/SELECT or contentEditable.
//
// Wires a single keydown listener at the document level (capturing
// phase=false so element handlers run first). Idempotent across multiple
// calls — but each call adds its own listener; the returned unmount is the
// only way to remove it.
function installSpatialNav(options) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return function noop() {};
  }
  var opts = options || {};
  var rootSelector  = opts.rootSelector || null;
  var onMove        = typeof opts.onMove === 'function' ? opts.onMove : null;
  var onEdge        = typeof opts.onEdge === 'function' ? opts.onEdge : null;
  var preventScroll = opts.preventScroll !== false;
  var keyFilter     = typeof opts.keyFilter === 'function' ? opts.keyFilter : defaultKeyFilter;

  function defaultKeyFilter(e) {
    var t = e && e.target;
    if (!t) { return true; }
    var tag = (t.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return false; }
    if (t.isContentEditable) { return false; }
    return true;
  }

  function handler(e) {
    var dir = directionForKey(e.keyCode);
    if (!dir) { return; }
    if (!keyFilter(e)) { return; }

    var root = rootSelector ? document.querySelector(rootSelector) : document;
    if (!root) { return; }

    var current = document.activeElement;
    // If nothing focused (or body is focused), pick the first focusable.
    var candidates = findFocusable(root);
    if (!candidates.length) { return; }
    if (!current || current === document.body || candidates.indexOf(current) === -1) {
      candidates[0].focus({ preventScroll: preventScroll });
      if (typeof e.preventDefault === 'function') { e.preventDefault(); }
      if (onMove) { onMove(candidates[0], dir); }
      return;
    }

    var next = nextInDirection(current, candidates, dir);
    if (next) {
      try {
        next.focus({ preventScroll: preventScroll });
      } catch (focusErr) {
        // Old Chromium (Tizen 6.0) chokes on the options object — retry
        // without it. Swallow any further error; nothing more we can do.
        try { next.focus(); } catch (e2) {}
      }
      if (typeof e.preventDefault === 'function') { e.preventDefault(); }
      if (onMove) { onMove(next, dir); }
      return;
    }

    // No candidate — let the caller decide (wrap, scroll, beep, etc.).
    if (onEdge) {
      var swallowed = onEdge(dir);
      if (swallowed && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
    }
  }

  document.addEventListener('keydown', handler);
  return function unmount() {
    document.removeEventListener('keydown', handler);
  };
}

export {
  FOCUSABLE_SELECTOR,
  findFocusable,
  nextInDirection,
  directionForKey,
  installSpatialNav
};
