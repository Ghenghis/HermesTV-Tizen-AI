// HermesTV Screen/Route Stack — single-page TV app screen management.
// Screens are mounted/unmounted via registered mount/unmount functions.
// CSS classes 'screen-active' and 'screen-inactive' are applied to screen root elements.
(function() {
  'use strict';

  // Registry: screenId → { mountFn, unmountFn, rootEl }
  var _registry = {};

  // Stack of { screenId, rootEl, params } — top is current screen.
  var _stack = [];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _current() {
    return _stack.length > 0 ? _stack[_stack.length - 1] : null;
  }

  function _deactivate(entry) {
    if (!entry) return;
    if (entry.rootEl) {
      entry.rootEl.classList.remove('screen-active');
      entry.rootEl.classList.add('screen-inactive');
    }
  }

  function _activate(entry) {
    if (!entry) return;
    if (entry.rootEl) {
      entry.rootEl.classList.remove('screen-inactive');
      entry.rootEl.classList.add('screen-active');
    }
  }

  // Call the mount function for a screen, capture the returned root element.
  function _mount(screenId, params) {
    var def = _registry[screenId];
    if (!def) {
      if (typeof console !== 'undefined') {
        console.warn('[screen] Unknown screen: ' + screenId);
      }
      return null;
    }

    var rootEl = null;
    try {
      rootEl = def.mountFn(params) || null;
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.error('[screen] Error mounting screen ' + screenId + ':', e);
      }
      return null;
    }

    var entry = { screenId: screenId, rootEl: rootEl, params: params || {} };
    return entry;
  }

  function _unmount(entry) {
    if (!entry) return;
    var def = _registry[entry.screenId];
    if (def && typeof def.unmountFn === 'function') {
      try {
        def.unmountFn(entry.rootEl, entry.params);
      } catch (e) {
        if (typeof console !== 'undefined') {
          console.error('[screen] Error unmounting screen ' + entry.screenId + ':', e);
        }
      }
    }
    // Remove root element from DOM if present.
    if (entry.rootEl && entry.rootEl.parentNode) {
      entry.rootEl.parentNode.removeChild(entry.rootEl);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function register(screenId, mountFn, unmountFn) {
    if (!screenId || typeof mountFn !== 'function') {
      if (typeof console !== 'undefined') {
        console.warn('[screen] register() requires a screenId string and mountFn function.');
      }
      return;
    }
    _registry[screenId] = {
      mountFn:   mountFn,
      unmountFn: typeof unmountFn === 'function' ? unmountFn : function() {}
    };
  }

  function push(screenId, params) {
    // Deactivate the current top screen (keep it visible but inactive).
    var prev = _current();
    _deactivate(prev);

    // Mount and activate the new screen.
    var entry = _mount(screenId, params);
    if (!entry) return;

    _stack.push(entry);
    _activate(entry);
  }

  function pop() {
    if (_stack.length === 0) return;

    // Unmount and remove the current top screen.
    var top = _stack.pop();
    _unmount(top);

    // Reactivate the previous screen if any.
    var prev = _current();
    if (prev) {
      _activate(prev);
    }
  }

  function replace(screenId, params) {
    // Unmount current without restoring previous.
    if (_stack.length > 0) {
      var top = _stack.pop();
      _unmount(top);
    }

    // Mount the new screen.
    var entry = _mount(screenId, params);
    if (!entry) return;

    _stack.push(entry);
    _activate(entry);
  }

  function getCurrent() {
    var c = _current();
    return c ? c.screenId : null;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.hermesScreen = {
    register:   register,
    push:       push,
    pop:        pop,
    replace:    replace,
    getCurrent: getCurrent
  };
}());
