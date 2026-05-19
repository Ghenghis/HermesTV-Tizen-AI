// useParentalGate.js — React hook that decides whether a media item is
// gated by the parental rating cap and, if so, prompts the user to enter
// the PIN before letting the action proceed.
//
// USAGE
//   var gate = useParentalGate();
//   gate.isContentLocked(item)            // → boolean
//   gate.requestUnlock(item)              // → Promise<{ ok, reason? }>
//   <ParentalLockOverlay {...gate.overlayProps} />  // mount once in your tree
//
// DESIGN
//   The hook owns one piece of UI state (the overlay open/closed) plus a
//   session-scoped Set of "items the user already unlocked in this session"
//   so re-clicking Play on the same title doesn't re-prompt. The Set lives
//   in module scope (NOT React state) so two MediaDetailPanels mounted in
//   sequence still share the unlocked-list — that's the same UX Netflix /
//   Apple TV ship.
//
//   Rating comparison uses a fixed tier ladder identical to settingsStore's
//   RATING_TIERS: G < PG < PG-13 < R < NC-17. "unrestricted" means no cap.
//   We read item.metadata.rating_mpaa OR item.rating_mpaa (MediaDetailPanel
//   handles both, so we mirror that). Anything we can't classify is treated
//   as UNLOCKED — the gate is opt-in, not a panic shutdown.
//
//   The actual PIN comparison lives in settingsStore.verifyPin which already
//   uses the salted SHA-256 hash + handles the 5-wrong-attempts lockout.
//   Hash + salt never leave that module; the overlay just calls verifyPin
//   with the user-typed PIN and reads the boolean result.
//
// Tizen 6.5 / Chrome 76 safe: no ?., no ??, var-style state, function
// expressions for callbacks.

import React from 'react';
import * as settingsStore from '../store/settingsStore.js';

// Lower index = lower restriction. 'unrestricted' is the absence of a cap.
var TIER_ORDER = ['G', 'PG', 'PG-13', 'R', 'NC-17'];

// MPAA-style strings that map onto our tier ladder. Anything outside this
// map is treated as "unknown → not locked" — better to under-block than
// hide content the user legitimately owns.
var MPAA_MAP = {
  'G': 'G',
  'PG': 'PG',
  'PG-13': 'PG-13',
  'PG13': 'PG-13',
  'R': 'R',
  'NC-17': 'NC-17',
  'NC17': 'NC-17',
  // TV equivalents — collapse into the closest MPAA tier so the cap still
  // applies to series that ship a TV-rating instead of an MPAA rating.
  'TV-Y': 'G',
  'TV-Y7': 'G',
  'TV-G': 'G',
  'TV-PG': 'PG',
  'TV-14': 'PG-13',
  'TV-MA': 'R',
};

function _normalizeRating(raw) {
  if (typeof raw !== 'string') { return null; }
  var trimmed = raw.trim().toUpperCase();
  if (trimmed === '') { return null; }
  if (MPAA_MAP[trimmed]) { return MPAA_MAP[trimmed]; }
  return null;
}

function _itemRating(item) {
  if (!item || typeof item !== 'object') { return null; }
  var meta = item.metadata || {};
  // MediaDetailPanel reads both flat and nested; mirror that priority.
  var raw = item.rating_mpaa || meta.rating_mpaa || meta.rating || item.rating || '';
  return _normalizeRating(raw);
}

function _itemKey(item) {
  if (!item || typeof item !== 'object') { return ''; }
  // Prefer stable id fields; fall back to title so we still de-dupe.
  return String(item.id || item.item_id || item.stream_id || item.title || '');
}

// Module-scoped recent-unlocks. Resets on page reload (per session).
var _recentlyUnlocked = new Set();

function useParentalGate() {
  // Overlay state.
  var openResult = React.useState(false);
  var isOpen = openResult[0];
  var setIsOpen = openResult[1];

  var itemResult = React.useState(null);
  var pendingItem = itemResult[0];
  var setPendingItem = itemResult[1];

  // The unlock promise — we resolve it from the overlay callbacks. Storing
  // the resolver in a ref keeps the latest one available across renders
  // without making the promise stale when React re-renders.
  var resolverRef = React.useRef(null);

  // The hook returns a stable `unlocked` flag callers can read if they want
  // to render UI hints — we tick this each time `_recentlyUnlocked` mutates
  // so consumers re-render on unlock.
  var unlockedResult = React.useState(0);
  var unlockedTick = unlockedResult[0];
  var setUnlockedTick = unlockedResult[1];

  // ── isContentLocked ──────────────────────────────────────────────────
  // Returns true ONLY when:
  //   1. A PIN is configured (so the gate has a "key"),
  //   2. The user's ratingCap is set to something other than 'unrestricted',
  //   3. The item's rating exceeds the cap,
  //   4. The item is NOT already in the recently-unlocked set.
  // The settings.parental.hideAdultCategories switch lives upstream (catalog
  // filtering); this hook handles the per-item override path.
  function isContentLocked(item) {
    if (!item) { return false; }
    if (!settingsStore.hasPin()) { return false; }
    var parental = settingsStore.getParental();
    if (parental.ratingCap === 'unrestricted') { return false; }
    var itemRating = _itemRating(item);
    if (!itemRating) { return false; }  // unknown → not locked
    var itemIdx = TIER_ORDER.indexOf(itemRating);
    var capIdx = TIER_ORDER.indexOf(parental.ratingCap);
    if (itemIdx < 0 || capIdx < 0) { return false; }  // out-of-band
    if (itemIdx <= capIdx) { return false; }  // within the cap
    // Item exceeds the cap. Last check: did the user already unlock it
    // earlier in this session?
    if (_recentlyUnlocked.has(_itemKey(item))) { return false; }
    return true;
  }

  // ── requestUnlock ────────────────────────────────────────────────────
  // Opens the overlay and returns a promise that resolves with
  // { ok: true } on successful unlock or { ok: false, reason: 'cancelled' }
  // when the user cancels / hits Esc.
  function requestUnlock(item) {
    return new Promise(function(resolve) {
      // If we already have a pending request, reject the previous one so we
      // don't strand its resolver.
      if (resolverRef.current) {
        try { resolverRef.current({ ok: false, reason: 'superseded' }); }
        catch (_) { /* swallow */ }
      }
      resolverRef.current = resolve;
      setPendingItem(item || null);
      setIsOpen(true);
    });
  }

  // ── Overlay callbacks ────────────────────────────────────────────────
  function _handleUnlock() {
    if (pendingItem) {
      _recentlyUnlocked.add(_itemKey(pendingItem));
    }
    setIsOpen(false);
    var resolver = resolverRef.current;
    resolverRef.current = null;
    setPendingItem(null);
    setUnlockedTick(function(n) { return n + 1; });
    if (resolver) { resolver({ ok: true }); }
  }

  function _handleCancel() {
    setIsOpen(false);
    var resolver = resolverRef.current;
    resolverRef.current = null;
    var cancelled = pendingItem;
    setPendingItem(null);
    if (resolver) { resolver({ ok: false, reason: 'cancelled' }); }
    // Silence eslint about unused
    void cancelled;
  }

  // Stable derived values for the overlay component.
  var overlayProps = {
    isOpen: isOpen,
    onUnlock: _handleUnlock,
    onCancel: _handleCancel,
    lockReason: (function() {
      if (!pendingItem) { return ''; }
      var rating = _itemRating(pendingItem);
      if (!rating) { return 'This content is restricted by parental controls'; }
      return 'Rated ' + rating + ' — exceeds the configured rating cap';
    })(),
    itemTitle: (function() {
      if (!pendingItem) { return ''; }
      var meta = pendingItem.metadata || {};
      return pendingItem.title || meta.title || '';
    })(),
  };

  return {
    isContentLocked: isContentLocked,
    requestUnlock: requestUnlock,
    overlayProps: overlayProps,
    // Tick value purely so React knows to re-render on unlock; exposed
    // as 'unlocked' for the documented hook surface.
    unlocked: unlockedTick,
  };
}

// Test-only escape hatch — lets unit tests clear the in-memory recently-
// unlocked set between cases without re-mounting the hook.
function _resetSessionUnlocks() {
  _recentlyUnlocked = new Set();
}

export default useParentalGate;
export { useParentalGate, _resetSessionUnlocks };
