// HermesTV Focus Engine — spatial D-pad focus management for Samsung Tizen TV.
// CSS :focus is unreliable on Tizen; this engine manages focus manually via a
// registry of focusable elements, applying the 'focus-active' CSS class.
(function() {
  'use strict';

  // Key codes (from sharedKeys.js HERMES_KEYS, duplicated here for standalone safety).
  var KEY_UP    = 38;
  var KEY_DOWN  = 40;
  var KEY_LEFT  = 37;
  var KEY_RIGHT = 39;

  // Cone angle: only consider candidates within 170° in the navigation direction.
  // We store half-angle in radians for dot-product comparison.
  var CONE_HALF_RAD = (170 / 2) * (Math.PI / 180); // 85°

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Map of groupId → Array of HTMLElements
  var _groups = {};

  // Focus stack: array of groupId strings. Top = current active group.
  var _stack = [];

  // Currently focused element (or null).
  var _active = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _getRect(el) {
    try {
      return el.getBoundingClientRect();
    } catch (e) {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    }
  }

  function _centerOf(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top  + rect.height / 2
    };
  }

  // Direction vector for a key code: { dx, dy }
  function _dirVector(keyCode) {
    if (keyCode === KEY_UP)    return { dx:  0, dy: -1 };
    if (keyCode === KEY_DOWN)  return { dx:  0, dy:  1 };
    if (keyCode === KEY_LEFT)  return { dx: -1, dy:  0 };
    if (keyCode === KEY_RIGHT) return { dx:  1, dy:  0 };
    return null;
  }

  // Dot product of two { dx, dy } vectors.
  function _dot(a, b) {
    return a.dx * b.dx + a.dy * b.dy;
  }

  // Length of a { dx, dy } vector.
  function _len(v) {
    return Math.sqrt(v.dx * v.dx + v.dy * v.dy);
  }

  // Get all registered elements across all groups in the active group context.
  function _getCandidates() {
    var groupId = _stack.length > 0 ? _stack[_stack.length - 1] : null;
    var candidates = [];

    if (groupId) {
      // When a group is pushed (e.g. modal), only consider that group's elements.
      var g = _groups[groupId];
      if (g) {
        for (var i = 0; i < g.length; i++) {
          if (g[i] !== _active) candidates.push(g[i]);
        }
      }
    } else {
      // No stack: consider all registered elements across all groups.
      Object.keys(_groups).forEach(function(gid) {
        var g = _groups[gid];
        for (var i = 0; i < g.length; i++) {
          if (g[i] !== _active) candidates.push(g[i]);
        }
      });
    }

    return candidates;
  }

  // ---------------------------------------------------------------------------
  // Spatial navigation algorithm
  //
  // For a candidate element in the key direction:
  //   score = primary_distance + 0.3 * lateral_offset
  // Only candidates within a 170° cone in the navigation direction are considered.
  // Primary distance = component of the center-to-center vector along the nav axis.
  // Lateral offset = component perpendicular to the nav axis.
  // ---------------------------------------------------------------------------

  function _findNearest(keyCode) {
    if (!_active) return null;

    var dir = _dirVector(keyCode);
    if (!dir) return null;

    var fromRect   = _getRect(_active);
    var fromCenter = _centerOf(fromRect);
    var candidates = _getCandidates();

    var best      = null;
    var bestScore = Infinity;

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      // Skip hidden elements.
      if (el.offsetParent === null && el.tagName !== 'BODY') continue;

      var rect   = _getRect(el);
      var center = _centerOf(rect);

      var delta = {
        dx: center.x - fromCenter.x,
        dy: center.y - fromCenter.y
      };

      var dist = _len(delta);
      if (dist === 0) continue;

      // Check cone: cos(angle) = dot(dir, normalized_delta) must be ≥ cos(85°).
      var cosCone = Math.cos(CONE_HALF_RAD); // ≈ 0.0872
      var dotVal  = _dot(dir, { dx: delta.dx / dist, dy: delta.dy / dist });
      if (dotVal < cosCone) continue;

      // Primary distance: projection onto navigation direction.
      var primary = Math.abs(_dot(dir, delta)); // always positive since dotVal > 0

      // Lateral offset: perpendicular component.
      var lateral = Math.sqrt(Math.max(0, dist * dist - primary * primary));

      var score = primary + 0.3 * lateral;

      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    return best;
  }

  // ---------------------------------------------------------------------------
  // Focus application
  // ---------------------------------------------------------------------------

  function setActive(element) {
    if (_active === element) return;

    // Remove from previous.
    if (_active) {
      _active.classList.remove('focus-active');
    }

    _active = element;

    if (_active) {
      _active.classList.add('focus-active');

      // Scroll into view if needed.
      try {
        _active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (e) {
        // Older Chromium does not support options object; plain call.
        try { _active.scrollIntoView(); } catch (e2) {}
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function register(elements, groupId) {
    if (!groupId) groupId = '__default__';
    var arr = [];
    // Accept NodeList or Array.
    if (elements && typeof elements.length === 'number') {
      for (var i = 0; i < elements.length; i++) {
        arr.push(elements[i]);
      }
    }
    if (!_groups[groupId]) {
      _groups[groupId] = [];
    }
    for (var j = 0; j < arr.length; j++) {
      if (_groups[groupId].indexOf(arr[j]) === -1) {
        _groups[groupId].push(arr[j]);
      }
    }
  }

  function unregister(groupId) {
    if (!groupId) groupId = '__default__';
    var group = _groups[groupId];
    if (group) {
      // If the active element is in this group, clear it.
      if (_active && group.indexOf(_active) !== -1) {
        _active.classList.remove('focus-active');
        _active = null;
      }
    }
    delete _groups[groupId];

    // Remove from stack if present.
    var idx = _stack.indexOf(groupId);
    if (idx !== -1) {
      _stack.splice(idx, 1);
    }
  }

  function getActive() {
    return _active;
  }

  function handleKey(keyCode) {
    if (keyCode !== KEY_UP && keyCode !== KEY_DOWN &&
        keyCode !== KEY_LEFT && keyCode !== KEY_RIGHT) {
      return false;
    }

    if (!_active) {
      // Nothing focused yet: pick the first element in the active group (or any group).
      var initial = _getCandidates();
      if (initial.length > 0) {
        setActive(initial[0]);
        return true;
      }
      return false;
    }

    var next = _findNearest(keyCode);
    if (next) {
      setActive(next);
      return true;
    }

    return false;
  }

  function pushGroup(groupId) {
    if (!groupId) return;
    _stack.push(groupId);

    // Move focus to first element of the pushed group.
    var g = _groups[groupId];
    if (g && g.length > 0) {
      setActive(g[0]);
    }
  }

  function popGroup() {
    if (_stack.length === 0) return;
    var popped = _stack.pop();

    // Remove focus-active from elements in the popped group.
    if (_active && _groups[popped] && _groups[popped].indexOf(_active) !== -1) {
      _active.classList.remove('focus-active');
      _active = null;
    }

    // Restore focus to first element of the new top group (or nothing if stack empty).
    var newTop = _stack.length > 0 ? _stack[_stack.length - 1] : null;
    if (newTop && _groups[newTop] && _groups[newTop].length > 0) {
      setActive(_groups[newTop][0]);
    }
  }

  // ---------------------------------------------------------------------------
  // Global keydown listener
  // ---------------------------------------------------------------------------

  document.addEventListener('keydown', function(e) {
    var handled = handleKey(e.keyCode);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true); // capture phase so overlays can intercept first

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.hermesFocus = {
    register:   register,
    unregister: unregister,
    setActive:  setActive,
    getActive:  getActive,
    handleKey:  handleKey,
    pushGroup:  pushGroup,
    popGroup:   popGroup
  };
}());
