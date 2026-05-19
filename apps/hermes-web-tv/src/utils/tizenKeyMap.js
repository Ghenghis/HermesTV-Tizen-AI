'use strict';

// Tizen TV remote key map — canonical reference for Samsung Tizen 6.5
// (QN85/QN95 QLED is the design target; older UN-class TVs get graceful
// degradation). Codes come from Samsung's documented set:
//   https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html
//
// This module is the single source of truth for the raw keyCode → name map,
// the registered-key list, and the boot-time registration helper. Shell-
// specific overlays (Zero, TiviMate, etc.) compose on top of this — see
// zeroTizenKeyMap.js for the canonical example.
//
// We intentionally keep this module in classic ES5 syntax (no `?.`, no
// template literals, no `for...of`, no arrow funcs) because the Tizen 6.5
// webview ships Chromium 76 and we want the same source to work in dev AND
// on-TV without a transpile pass for these tiny helpers.
//
// Developer reference: docs/45_TIZEN_REMOTE_KEYMAP.md

// ─── Raw keyCode → key-name map ─────────────────────────────────────────────
// Comprehensive coverage of every key a Samsung Tizen IPTV/streaming app
// realistically needs. Names are stable strings; the route-dispatcher table
// (see TIZEN_KEY_ROUTES below) maps each name to a logical handler kind.
var TIZEN_KEY_CODES = {
  // Directional D-pad — JS keyCodes match standard browser arrows.
  // Tizen docs also note 4/5/6/7 as alternate codes on a few older remotes;
  // we register both so spatial nav works regardless of remote firmware.
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  4:  'left',   // alternate (older Samsung remotes)
  5:  'up',     // alternate
  6:  'right',  // alternate
  7:  'down',   // alternate

  // Selection
  13: 'enter',

  // System navigation
  10009: 'back',
  10182: 'exit',
  10071: 'smart_hub',
  10072: 'source',
  10135: 'tools',
  10073: 'channel_list',
  10190: 'previous_channel',

  // Color buttons (often used as colored shortcuts on Samsung remotes)
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',

  // Transport / media keys (require registerKey on Tizen)
  415:   'play',
  19:    'pause',
  10252: 'play_pause',
  413:   'stop',
  417:   'fast_forward',
  412:   'rewind',

  // EPG / info / guide
  457:   'info',
  10232: 'guide',

  // Channel up/down (require registerKey)
  427: 'channel_up',
  428: 'channel_down',

  // Volume / mute (Tizen TVs usually handle these in HW; registerKey
  // surfaces them to the app so we can sync UI state)
  447: 'volume_up',
  448: 'volume_down',
  449: 'mute',

  // Numeric keypad (1..9, 0). Useful for channel number entry.
  48: 'num_0',
  49: 'num_1',
  50: 'num_2',
  51: 'num_3',
  52: 'num_4',
  53: 'num_5',
  54: 'num_6',
  55: 'num_7',
  56: 'num_8',
  57: 'num_9'
};

// Alias the canonical map under the simpler TIZEN_KEYS export name the caller
// asked for. Both names refer to the same object — pure aliasing, never
// reassigned. The longer original name stays for backwards compat with the
// existing zeroTizenKeyMap.js import.
var TIZEN_KEYS = TIZEN_KEY_CODES;

// ─── Logical-route table ────────────────────────────────────────────────────
// Maps each keyCode → a "route kind" that consumers switch on. Lets the
// dispatchToRoute helper stay tiny: it looks up the route once, then calls
// the handler the caller registered for that route. Routes are intentionally
// coarse — fine-grained behavior (e.g. "Red toggles favorites HERE but
// deletes recording THERE") lives in the per-shell overlay map.
var TIZEN_KEY_ROUTES = {
  // Navigation
  37: 'nav',     38: 'nav',     39: 'nav',     40: 'nav',
  4:  'nav',     5:  'nav',     6:  'nav',     7:  'nav',
  13: 'select',

  // System
  10009: 'back',
  10182: 'exit',
  10071: 'smart_hub',
  10072: 'source',
  10135: 'tools',
  10073: 'channel_list',
  10190: 'previous_channel',

  // Colors
  403: 'color',  404: 'color',  405: 'color',  406: 'color',

  // Transport
  415:   'transport',  19:    'transport',  10252: 'transport',
  413:   'transport',  417:   'transport',  412:   'transport',

  // EPG / info
  457:   'info',
  10232: 'guide',

  // Channel
  427: 'channel',
  428: 'channel',

  // Volume
  447: 'volume',  448: 'volume',  449: 'volume',

  // Numeric
  48: 'numeric', 49: 'numeric', 50: 'numeric', 51: 'numeric', 52: 'numeric',
  53: 'numeric', 54: 'numeric', 55: 'numeric', 56: 'numeric', 57: 'numeric'
};

// Subset of TIZEN_KEY_CODES that maps to a chatbot command. Pressing these
// shortcuts the user straight into a layout / filter command without
// opening the chat panel. Channel/volume/transport keys are intentionally
// NOT mapped to chatbot commands — they pass through to the dedicated
// handlers in App.jsx (or are reserved for future PlayerModal binding).
var KEY_TO_COMMAND = {
  10135: 'toggle layout switcher', // Tools
  10071: 'toggle layout switcher', // Smart Hub
  10232: 'show live',               // Guide
  403:   'change layout to tivimate', // Red
  404:   'show live',                 // Green
  405:   'show movies',               // Yellow
  406:   'dark theme'                 // Blue
};

// Keys that must be explicitly registered with the Tizen TV input device
// API so the app receives keydown events for them. Without registration the
// platform consumes the key and the app never sees it. This list maps the
// Samsung-documented key NAME (passed to registerKey) to the JS keyCode
// produced when that key fires — so consumers can pick either the names
// (for registerKeyBatch) or the codes (for switch statements on keydown).
//
// See: https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvinputdevice-api.html
var TIZEN_REGISTERED_KEYS = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
  'MediaTrackPrevious',
  'MediaTrackNext',
  'ChannelUp',
  'ChannelDown',
  'PreviousChannel',
  'ChannelList',
  'VolumeUp',
  'VolumeDown',
  'VolumeMute',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'Info',
  'Guide',
  'Menu',
  'Source',
  'Tools',
  'Caption',
  'Exit',
  'Minus',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
];

function getKeyName(keyCode) {
  return TIZEN_KEY_CODES[keyCode] || null;
}

function getKeyRoute(keyCode) {
  return TIZEN_KEY_ROUTES[keyCode] || null;
}

function getKeyCommand(keyCode) {
  return KEY_TO_COMMAND[keyCode] || null;
}

// Backwards-compatible alias the caller asked for. Same semantics as
// registerTizenRemoteKeys() — keep BOTH exports so existing consumers
// (zeroTizenKeyMap.js, App.jsx wiring) don't break.
function registerTizenKeys() {
  return registerTizenRemoteKeys();
}

// Register the full remote-key set with the Tizen platform so the app
// receives keydown events for channel/volume/transport/color keys. Safe to
// call from any browser — the tizen namespace is only present on-TV, so
// dev/desktop Chromium silently skips registration.
//
// Returns the number of keys successfully registered (0 in dev). Logs (but
// does not throw) on any individual registration failure — Tizen's API will
// reject keys that aren't supported on a given model and the app should
// keep going on the rest.
function registerTizenRemoteKeys() {
  if (typeof window === 'undefined') { return 0; }
  // tizen.tvinputdevice may not exist on dev or on older Samsung TVs.
  // Guard every property access — never assume the chain.
  var w = window;
  if (!w.tizen || !w.tizen.tvinputdevice ||
      typeof w.tizen.tvinputdevice.registerKey !== 'function') {
    return 0;
  }

  // Prefer registerKeyBatch when present (single SDB round-trip on-TV).
  var dev = w.tizen.tvinputdevice;
  if (typeof dev.registerKeyBatch === 'function') {
    try {
      dev.registerKeyBatch(TIZEN_REGISTERED_KEYS);
      return TIZEN_REGISTERED_KEYS.length;
    } catch (batchErr) {
      // fall through to per-key registration
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tizenKeyMap] registerKeyBatch failed, falling back per-key:', batchErr);
      }
    }
  }

  // Per-key fallback. Count successful registrations so the caller can
  // log a one-line summary at boot.
  var count = 0;
  for (var i = 0; i < TIZEN_REGISTERED_KEYS.length; i++) {
    var name = TIZEN_REGISTERED_KEYS[i];
    try {
      dev.registerKey(name);
      count++;
    } catch (keyErr) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tizenKeyMap] registerKey skipped:', name, keyErr && keyErr.message);
      }
    }
  }
  return count;
}

// dispatchToRoute — given a raw keydown event and a `routes` object whose
// keys are route kinds ('nav','select','back','exit','smart_hub','tools',
// 'source','color','transport','info','guide','channel','volume','numeric',
// 'channel_list','previous_channel'), look up the route for the event's
// keyCode and invoke the matching handler with a tiny payload describing
// the press.
//
// Returns whatever the matched handler returned, or null if no route
// matched. Truthy handler returns are treated as "I handled this" by most
// callers — they then preventDefault to stop the key bubbling to the
// platform.
//
// The handler signature is:
//   handler({ keyCode, name, route, event })
// where `event` is the original KeyboardEvent so the handler can call
// preventDefault / stopPropagation itself.
//
// This stays pure — no document-level listeners, no global state. The
// caller wires it up inside their own keydown listener (which already
// exists in App.jsx and ZeroShell.jsx).
function dispatchToRoute(keyEvent, routes) {
  if (!keyEvent || !routes) { return null; }
  var code = keyEvent.keyCode;
  var route = TIZEN_KEY_ROUTES[code];
  if (!route) { return null; }
  var handler = routes[route];
  if (typeof handler !== 'function') { return null; }
  var payload = {
    keyCode: code,
    name: TIZEN_KEY_CODES[code] || null,
    route: route,
    event: keyEvent
  };
  return handler(payload);
}

// installTizenKeyHandler — global Tizen remote handler.
// onCommand: invoked for color/Smart-Hub/Guide keys that map to chatbot commands.
// onBack: invoked for the Back (10009) / Exit (10182) keys. If the handler
// returns truthy the default browser behavior is suppressed (e.preventDefault).
// Tizen TVs hard-exit the app if Back bubbles to the OS, so the handler MUST
// preventDefault when the app has an open modal it wants to close instead.
//
// Auto-registers the full TIZEN_REGISTERED_KEYS set on first install so the
// remote's transport/channel/volume keys reach the page. On dev this is a
// no-op.
function installTizenKeyHandler(onCommand, onBack) {
  if (typeof window === 'undefined') {
    return function() {};
  }
  // Register media/channel/color/numpad keys with the Tizen platform so the
  // app actually receives keydown events for them. Idempotent on Tizen and
  // a no-op in dev.
  registerTizenRemoteKeys();

  function handler(e) {
    if (e.keyCode === 10009 || e.keyCode === 10182) {
      if (typeof onBack === 'function') {
        var handled = onBack(e.keyCode);
        if (handled) {
          if (typeof e.preventDefault === 'function') { e.preventDefault(); }
          if (typeof e.stopPropagation === 'function') { e.stopPropagation(); }
        }
      }
      return;
    }
    var cmd = getKeyCommand(e.keyCode);
    if (cmd && typeof onCommand === 'function') {
      onCommand(cmd);
    }
  }
  document.addEventListener('keydown', handler);
  return function() {
    document.removeEventListener('keydown', handler);
  };
}

export {
  TIZEN_KEYS,
  TIZEN_KEY_CODES,
  TIZEN_KEY_ROUTES,
  KEY_TO_COMMAND,
  TIZEN_REGISTERED_KEYS,
  getKeyName,
  getKeyRoute,
  getKeyCommand,
  registerTizenKeys,
  registerTizenRemoteKeys,
  dispatchToRoute,
  installTizenKeyHandler
};
