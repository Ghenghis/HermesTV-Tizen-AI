'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// zeroTizenKeyMap — Zero-shell flavored Tizen remote bindings.
//
// This module COMPOSES with the existing tizenKeyMap.js — it never replaces
// it. The base module owns the canonical Samsung keyCode → key-name map and
// the registerTizenRemoteKeys() bootstrap. THIS module owns the Zero-shell-
// specific behavior layered on top:
//
//   1. ZERO_KEY_TO_COMMAND  — Zero-style color/Smart-Hub bindings tailored
//      to the IPTV-Player-Zero UX (Red=favorites toggle, Green=Live tab,
//      Yellow=Movies tab, Blue=Catch-up tab, Smart Hub=open layout switcher).
//      Source: IPTV_Player_Zero/docs/SAMSUNG_TIZEN_PORT.md §Method 1 Step 6
//      "Handle TV Remote Keys" — Zero uses the four color buttons as quick
//      filters / favorites toggle. We mirror that on HermesTV but keep our
//      command vocabulary (no proprietary IPTV-Zero strings).
//
//   2. installZeroShellTizenHandler(opts) — drop-in replacement for
//      installTizenKeyHandler that adds three extra Zero-shell hooks:
//        - onTabSwitch(tabId) for color-button → tab nav (Green/Yellow/Blue).
//        - onSearchOpen() for the Tools / Source key (Zero binds search here).
//        - onPlayerKey({ keyCode, kind }) for transport keys (play/pause/
//          stop/ff/rewind/info/guide) so the PlayerModal can subscribe
//          without re-wiring the global handler.
//      All three are optional — a Zero-shell page that doesn't need search
//      passes onSearchOpen=undefined and the binding is a no-op.
//
//   3. extendCommandMap(extra) — small helper that returns a NEW merged
//      command-map object without mutating the base KEY_TO_COMMAND. Useful
//      when a Zero feature wants to remap one of the standard keys for a
//      single screen only (e.g. RecordingsPanel binds Red to "delete
//      recording" instead of the default "tivimate layout").
//
// Tizen 6.5 / Chrome 76 safe — no template literals, no arrow funcs, no
// destructuring, no optional chaining. Matches the ES5 style of the rest of
// the apps/hermes-web-tv/src/utils/ directory so the same file ships to
// dev Chromium AND on-TV without a transpile pass.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TIZEN_KEY_CODES,
  KEY_TO_COMMAND,
  TIZEN_REGISTERED_KEYS,
  getKeyName,
  registerTizenRemoteKeys,
  installTizenKeyHandler
} from './tizenKeyMap.js';

// ─── Zero-specific command bindings ──────────────────────────────────────────
// Re-binds the four color buttons + Smart Hub + Guide to the Zero-style
// layout. These OVERLAY the base KEY_TO_COMMAND; the merged map is exposed
// as ZERO_MERGED_KEY_TO_COMMAND below.
//
// Color-button conventions sourced from IPTV_Player_Zero/docs/
//   FRONTEND_COMPONENTS.md (Live / Movies / Series / Sports tabs) plus
//   USER_JOURNEYS.md §Journey 2 (color shortcuts hop between content type).
//
// We deliberately keep the chatbot command vocabulary identical to the rest
// of the app (see commandMatchers.js) so the same key press fires the same
// command from any shell.
var ZERO_KEY_TO_COMMAND = {
  // Smart Hub → open the layout switcher (shared with base map).
  10135: 'toggle layout switcher',
  // Guide → jump to Live (EPG lives off the Live page).
  10232: 'show live',
  // Tools (10135 on some remotes) → open chatbot search; falls through to
  // the player-key hook on remotes where this code is unused.
  // 10135 is Smart Hub above; Tools = 10133 on Samsung 2018+.
  10133: 'open search',
  // Red — Zero binds to favorites. Map to our favorites rail toggle.
  403:   'show favorites',
  // Green — Live TV tab.
  404:   'show live',
  // Yellow — Movies tab.
  405:   'show movies',
  // Blue — Catch-up tab. We re-use the catchup chatbot command; if the
  // shell hasn't surfaced catchup yet the matcher gracefully no-ops.
  406:   'show catchup'
};

// Merge base + Zero overlays into a single map. Pure function — never
// mutates the base export so the rest of the app keeps the original.
var ZERO_MERGED_KEY_TO_COMMAND = {};
(function _merge() {
  var k;
  for (k in KEY_TO_COMMAND) {
    if (Object.prototype.hasOwnProperty.call(KEY_TO_COMMAND, k)) {
      ZERO_MERGED_KEY_TO_COMMAND[k] = KEY_TO_COMMAND[k];
    }
  }
  for (k in ZERO_KEY_TO_COMMAND) {
    if (Object.prototype.hasOwnProperty.call(ZERO_KEY_TO_COMMAND, k)) {
      ZERO_MERGED_KEY_TO_COMMAND[k] = ZERO_KEY_TO_COMMAND[k];
    }
  }
})();

// Color-button → Zero tab id. The Zero shell tabs are: live / catchup /
// movies / series. We don't bind Series to a color (no spare button); the
// user reaches it via D-pad or the chatbot.
var ZERO_COLOR_TO_TAB = {
  404: 'live',     // Green
  405: 'movies',   // Yellow
  406: 'catchup'   // Blue
  // 403 (Red) is favorites — handled separately so it doesn't switch tab.
};

// Transport / player keys forwarded to the player hook. Each entry is the
// numeric keyCode → a stable string the player can switch on.
var ZERO_PLAYER_KEYS = {
  415:   'play',
  19:    'pause',
  10252: 'play_pause',
  413:   'stop',
  417:   'fast_forward',
  412:   'rewind',
  457:   'info',
  10232: 'guide',
  10233: 'channel_list',
  427:   'channel_up',
  428:   'channel_down',
  10190: 'previous_channel'
};

function getZeroKeyCommand(keyCode) {
  return ZERO_MERGED_KEY_TO_COMMAND[keyCode] || null;
}

function getZeroTabForColorKey(keyCode) {
  return ZERO_COLOR_TO_TAB[keyCode] || null;
}

function getZeroPlayerKeyKind(keyCode) {
  return ZERO_PLAYER_KEYS[keyCode] || null;
}

// extendCommandMap — return a NEW merged map with caller-supplied overrides
// layered on top. Lets a Zero-screen (e.g. RecordingsPanel) remap a key for
// its own lifetime without leaking into the global map.
function extendCommandMap(extra) {
  var out = {};
  var k;
  for (k in ZERO_MERGED_KEY_TO_COMMAND) {
    if (Object.prototype.hasOwnProperty.call(ZERO_MERGED_KEY_TO_COMMAND, k)) {
      out[k] = ZERO_MERGED_KEY_TO_COMMAND[k];
    }
  }
  if (extra) {
    for (k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) {
        out[k] = extra[k];
      }
    }
  }
  return out;
}

// ─── installZeroShellTizenHandler ────────────────────────────────────────────
// Replacement for installTizenKeyHandler that adds the Zero-shell hooks:
//   opts.onCommand      — fired for chatbot command bindings (color/SmartHub).
//   opts.onBack         — fired for Back / Exit; return truthy to swallow.
//   opts.onTabSwitch    — fired with a tab id ('live' / 'movies' / 'catchup')
//                         BEFORE onCommand, so the shell can switch tab
//                         without going through the chatbot pipeline. If the
//                         handler returns truthy, onCommand is suppressed
//                         for that key press.
//   opts.onFavoritesKey — fired for the Red button (403). Same suppression
//                         semantics as onTabSwitch.
//   opts.onSearchOpen   — fired for Tools key (10133). Same suppression.
//   opts.onPlayerKey    — fired for any transport / channel / info / guide
//                         key with { keyCode, kind }. Returns truthy to
//                         suppress chatbot follow-up.
//
// Returns an unmount fn — call it from useEffect cleanup. Idempotent on
// repeated mounts; auto-registers the full TIZEN_REGISTERED_KEYS set on
// first install (or no-op in dev).
function installZeroShellTizenHandler(opts) {
  if (typeof window === 'undefined') {
    return function noop() {};
  }
  // Always re-register the key batch so a hot-reloaded shell still receives
  // transport keys. registerTizenRemoteKeys() is idempotent on Tizen.
  registerTizenRemoteKeys();

  var onCommand      = opts && opts.onCommand;
  var onBack         = opts && opts.onBack;
  var onTabSwitch    = opts && opts.onTabSwitch;
  var onFavoritesKey = opts && opts.onFavoritesKey;
  var onSearchOpen   = opts && opts.onSearchOpen;
  var onPlayerKey    = opts && opts.onPlayerKey;

  function handler(e) {
    // 1. Back / Exit — highest priority because Tizen hard-exits the app
    //    if Back bubbles to the OS.
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

    // 2. Player / transport keys — forward to onPlayerKey first. If the
    //    handler returns truthy we don't also fire onCommand.
    var playerKind = getZeroPlayerKeyKind(e.keyCode);
    if (playerKind && typeof onPlayerKey === 'function') {
      var swallowedByPlayer = onPlayerKey({ keyCode: e.keyCode, kind: playerKind });
      if (swallowedByPlayer) {
        if (typeof e.preventDefault === 'function') { e.preventDefault(); }
        return;
      }
    }

    // 3. Favorites (Red) — single-purpose hook so the shell can toggle the
    //    favorites rail without parsing chatbot output.
    if (e.keyCode === 403 && typeof onFavoritesKey === 'function') {
      var swallowedByFav = onFavoritesKey();
      if (swallowedByFav) {
        if (typeof e.preventDefault === 'function') { e.preventDefault(); }
        return;
      }
    }

    // 4. Tab switch (Green/Yellow/Blue). Same suppress-on-truthy contract.
    var tabId = getZeroTabForColorKey(e.keyCode);
    if (tabId && typeof onTabSwitch === 'function') {
      var swallowedByTab = onTabSwitch(tabId);
      if (swallowedByTab) {
        if (typeof e.preventDefault === 'function') { e.preventDefault(); }
        return;
      }
    }

    // 5. Search (Tools).
    if (e.keyCode === 10133 && typeof onSearchOpen === 'function') {
      var swallowedBySearch = onSearchOpen();
      if (swallowedBySearch) {
        if (typeof e.preventDefault === 'function') { e.preventDefault(); }
        return;
      }
    }

    // 6. Generic chatbot command fallback.
    var cmd = getZeroKeyCommand(e.keyCode);
    if (cmd && typeof onCommand === 'function') {
      onCommand(cmd);
    }
  }

  document.addEventListener('keydown', handler);
  return function unmount() {
    document.removeEventListener('keydown', handler);
  };
}

// Re-export the base bindings so consumers only need to import this file.
// (Avoids the case where someone forgets to ALSO import the base module
// and unintentionally drops Tizen-platform key registration.)
export {
  TIZEN_KEY_CODES,
  TIZEN_REGISTERED_KEYS,
  KEY_TO_COMMAND,
  ZERO_KEY_TO_COMMAND,
  ZERO_MERGED_KEY_TO_COMMAND,
  ZERO_COLOR_TO_TAB,
  ZERO_PLAYER_KEYS,
  getKeyName,
  getZeroKeyCommand,
  getZeroTabForColorKey,
  getZeroPlayerKeyKind,
  extendCommandMap,
  registerTizenRemoteKeys,
  installTizenKeyHandler,
  installZeroShellTizenHandler
};
