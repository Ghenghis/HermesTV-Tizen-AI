'use strict';

// Tizen TV remote key map. Codes come from Samsung's documented set:
//   https://developer.samsung.com/smarttv/develop/guides/user-interaction/remote-control.html
//
// The map covers everything an IPTV/streaming app realistically needs on a
// Samsung remote: arrow nav + OK, Back/Exit, color buttons, transport
// (play/pause/stop/ff/rewind), media meta (info/guide), and the channel /
// volume / num-pad keys. Some keys (volume, mute, channel up/down) are
// handled by the Tizen platform by default and only fire keydown events
// for an app when they are explicitly registered via
// `tizen.tvinputdevice.registerKey(...)` — see `registerTizenRemoteKeys`
// below.
//
// We intentionally keep this module in classic ES5 syntax (no `?.`, no
// template literals, no `for...of`) because the Tizen 6.5 webview ships
// Chromium 76 and we want the same source to work in dev AND on-TV without
// a transpile pass for these tiny helpers.

var TIZEN_KEY_CODES = {
  // Directional + selection
  38: 'up',
  40: 'down',
  37: 'left',
  39: 'right',
  13: 'enter',

  // System navigation
  10009: 'back',
  10182: 'exit',
  10135: 'smart_hub',
  10073: 'home',

  // Color buttons (often used as colored shortcuts on Samsung remotes)
  403: 'red',
  404: 'green',
  405: 'yellow',
  406: 'blue',

  // Transport / media keys (require registerKey on Tizen)
  415: 'play',
  19:  'pause',
  10252: 'play_pause',
  413: 'stop',
  417: 'fast_forward',
  412: 'rewind',
  10233: 'channel_list',

  // EPG / info / guide
  457: 'info',
  10232: 'guide',

  // Channel up/down (require registerKey)
  427: 'channel_up',
  428: 'channel_down',
  10190: 'previous_channel',

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

// Subset of TIZEN_KEY_CODES that maps to a chatbot command. Pressing these
// shortcuts the user straight into a layout / filter command without
// opening the chat panel. Channel/volume/transport keys are intentionally
// NOT mapped to chatbot commands — they pass through to the dedicated
// handlers in App.jsx (or are reserved for future PlayerModal binding).
var KEY_TO_COMMAND = {
  10135: 'toggle layout switcher', // Smart Hub
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

function getKeyCommand(keyCode) {
  return KEY_TO_COMMAND[keyCode] || null;
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
  TIZEN_KEY_CODES,
  KEY_TO_COMMAND,
  TIZEN_REGISTERED_KEYS,
  getKeyName,
  getKeyCommand,
  registerTizenRemoteKeys,
  installTizenKeyHandler
};
