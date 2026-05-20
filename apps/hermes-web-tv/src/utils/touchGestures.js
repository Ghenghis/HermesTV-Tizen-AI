/* ─────────────────────────────────────────────────────────────────────────
 * touchGestures.js — small ES5 helper for tablet/phone gesture support.
 *
 * Three primitives, each returns an "unmount" function the caller invokes
 * in React.useEffect's cleanup. No deps, no destructuring, no arrow funcs,
 * no const/let — strict ES5 so Tizen 6.5 (Chrome 76) and older Samsung
 * tablets parse without a transpile pass.
 *
 *  - installLongPress(el, handler, opts?)
 *  - installSwipe(el, handlers, opts?)
 *  - isCoarsePointer()
 *
 * Touch handlers MUST coexist with existing click/keyDown — they only
 * suppress the synthetic click when a gesture (long-press or swipe) was
 * actually recognised. Short taps fall through to the browser-synthesised
 * click so existing onClick handlers still fire.
 * ───────────────────────────────────────────────────────────────────── */

function noop() {}

function getTouchPoint(ev) {
  if (ev && ev.touches && ev.touches.length > 0) {
    return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  }
  if (ev && ev.changedTouches && ev.changedTouches.length > 0) {
    return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
  }
  return null;
}

/**
 * installLongPress
 * Attach touchstart/move/end listeners. Fires handler(event) after delayMs
 * if the finger has not moved more than tolPx from the starting point.
 *
 * Returns an unmount function.
 *
 * opts:
 *   delayMs  default 500
 *   tolPx    default 10
 */
function installLongPress(el, handler, opts) {
  if (!el || typeof handler !== 'function') { return noop; }
  var options = opts || {};
  var delayMs = typeof options.delayMs === 'number' ? options.delayMs : 500;
  var tolPx = typeof options.tolPx === 'number' ? options.tolPx : 10;

  var timerId = null;
  var startX = 0;
  var startY = 0;
  var triggered = false;

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function onStart(ev) {
    var pt = getTouchPoint(ev);
    if (!pt) { return; }
    triggered = false;
    startX = pt.x;
    startY = pt.y;
    clearTimer();
    timerId = setTimeout(function () {
      triggered = true;
      timerId = null;
      try { handler(ev); } catch (_e) {}
    }, delayMs);
  }

  function onMove(ev) {
    if (timerId === null) { return; }
    var pt = getTouchPoint(ev);
    if (!pt) { return; }
    var dx = pt.x - startX;
    var dy = pt.y - startY;
    if (dx < 0) { dx = -dx; }
    if (dy < 0) { dy = -dy; }
    if (dx > tolPx || dy > tolPx) {
      clearTimer();
    }
  }

  function onEnd(ev) {
    // If we already triggered the long-press, swallow the synthetic click
    // so a long-press doesn't also fire the underlying onClick handler.
    if (triggered) {
      if (ev && typeof ev.preventDefault === 'function') {
        try { ev.preventDefault(); } catch (_e) {}
      }
    }
    clearTimer();
  }

  function onCancel() {
    clearTimer();
  }

  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: true });
  el.addEventListener('touchend', onEnd, false);
  el.addEventListener('touchcancel', onCancel, { passive: true });

  return function unmount() {
    clearTimer();
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
  };
}

/**
 * installSwipe
 * Detects horizontal/vertical swipes. Calls the matching handler when the
 * primary axis crosses the threshold and dominates the secondary axis.
 *
 * handlers: { onLeft, onRight, onUp, onDown }
 * opts:     { thresholdPx (default 40) }
 *
 * Returns an unmount function.
 */
function installSwipe(el, handlers, opts) {
  if (!el) { return noop; }
  var h = handlers || {};
  var options = opts || {};
  var threshold = typeof options.thresholdPx === 'number' ? options.thresholdPx : 40;

  var startX = 0;
  var startY = 0;
  var active = false;

  function onStart(ev) {
    var pt = getTouchPoint(ev);
    if (!pt) { active = false; return; }
    startX = pt.x;
    startY = pt.y;
    active = true;
  }

  function onEnd(ev) {
    if (!active) { return; }
    active = false;
    var pt = getTouchPoint(ev);
    if (!pt) { return; }
    var dx = pt.x - startX;
    var dy = pt.y - startY;
    var absX = dx < 0 ? -dx : dx;
    var absY = dy < 0 ? -dy : dy;

    // Pick the dominant axis. If neither axis crosses the threshold, treat
    // it as a tap and stay out of the way (no preventDefault).
    if (absX < threshold && absY < threshold) { return; }

    if (absX >= absY) {
      if (dx < 0 && typeof h.onLeft === 'function') {
        try { h.onLeft(ev); } catch (_e) {}
      } else if (dx > 0 && typeof h.onRight === 'function') {
        try { h.onRight(ev); } catch (_e) {}
      }
    } else {
      if (dy < 0 && typeof h.onUp === 'function') {
        try { h.onUp(ev); } catch (_e) {}
      } else if (dy > 0 && typeof h.onDown === 'function') {
        try { h.onDown(ev); } catch (_e) {}
      }
    }
  }

  function onCancel() {
    active = false;
  }

  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchend', onEnd, { passive: true });
  el.addEventListener('touchcancel', onCancel, { passive: true });

  return function unmount() {
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
  };
}

/**
 * isCoarsePointer
 * True on touch-first devices (tablets, phones). Components can use this
 * to bump hit-target sizes, swap hover affordances for tap affordances,
 * or hide focus rings that are only meaningful for keyboard/remote nav.
 * Returns false in SSR or where matchMedia is unavailable.
 */
function isCoarsePointer() {
  if (typeof window === 'undefined' || !window.matchMedia) { return false; }
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch (_e) {
    return false;
  }
}

export { installLongPress, installSwipe, isCoarsePointer };
export default {
  installLongPress: installLongPress,
  installSwipe: installSwipe,
  isCoarsePointer: isCoarsePointer
};
