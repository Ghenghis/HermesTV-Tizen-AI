// ─────────────────────────────────────────────────────────────────────────────
// shellHelpers — single source of truth for shell-level catalog helpers.
//
// Three concerns, one module:
//   1. `applyShellFilters(catalog, content, provider, quality)` — the
//      content/provider/quality predicate every shell ANDs together. Was
//      duplicated verbatim across seven shells before this refactor.
//   2. `posterBg(item, idx)` — turns a catalog item into a CSS `background`
//      string. Honours every artwork field the seed catalog and external
//      providers expose (see PR #68) before falling back to a deterministic
//      gradient hashed by item.id.
//   3. `useGridVirtualizer({ scrollRef, itemCount, columns, rowHeight })` —
//      minimal row-windowing hook that mounts only the poster rows visible
//      inside the scroll container + 1 row of overscan above/below. No new
//      dependency — we deliberately don't pull react-window so the bundle
//      stays lean (Tizen 6.5 cold-load budget).
//
// Tizen 6.5 / Chrome 76 safe: no arrow funcs, no destructuring, no template
// strings, no optional chaining. Pure ES5-style function declarations.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

// Eight-color fallback palette. Kept identical to the historical inline copy
// so callers that fell through to a gradient render the same color they did
// before this refactor.
export var GRADIENT_PALETTE = [
  'linear-gradient(135deg,#1a1a2e,#16213e)',
  'linear-gradient(135deg,#0f3460,#e94560)',
  'linear-gradient(135deg,#1b1b2f,#2b2d42)',
  'linear-gradient(135deg,#2c003e,#6a0572)',
  'linear-gradient(135deg,#0d1117,#1f6feb)',
  'linear-gradient(135deg,#1a0a00,#ff7d3a)',
  'linear-gradient(135deg,#001a0d,#00d4aa)',
  'linear-gradient(135deg,#1a0000,#e50914)',
];

// Filter logic shared by every shell. Three independent predicates ANDed
// together: content type, provider id, and a coarse quality tier.
export function applyShellFilters(catalog, contentFilter, providerFilter, qualityFilter) {
  return (catalog || []).filter(function (item) {
    if (contentFilter !== 'all' && item.type !== contentFilter) { return false; }
    if (providerFilter !== 'all' && item.provider_id !== providerFilter) { return false; }
    if (qualityFilter !== 'all') {
      var q = (item.quality || '').toUpperCase();
      if (qualityFilter === '4K' && q.indexOf('4K') === -1 && q.indexOf('2160') === -1) { return false; }
      if (qualityFilter === '1080p+' && q.indexOf('1080') === -1 && q.indexOf('4K') === -1 && q.indexOf('2160') === -1) { return false; }
      if (qualityFilter === '720p+' && q.indexOf('720') === -1 && q.indexOf('1080') === -1 && q.indexOf('4K') === -1) { return false; }
    }
    return true;
  });
}

// Deterministic id → palette index. Sum the char codes of the id string so a
// given item always lands on the same gradient between renders (no flicker on
// re-mount). Falls back to the supplied numeric idx when the item has no id.
function _hashToPaletteIdx(item, idx) {
  if (item && typeof item.id === 'string' && item.id.length > 0) {
    var h = 0;
    for (var i = 0; i < item.id.length; i++) {
      h = (h + item.id.charCodeAt(i)) | 0;
    }
    if (h < 0) { h = -h; }
    return h % GRADIENT_PALETTE.length;
  }
  return (idx || 0) % GRADIENT_PALETTE.length;
}

// Resolve a catalog item to a CSS `background` value. Checks every known
// artwork field in priority order before falling back to a deterministic
// gradient. Priority matches PR #68 seed shape:
//
//   1. item.poster_url         — seed catalog primary field
//   2. item.poster             — legacy field still used by some mocks
//   3. item.logo_url           — channel-style art (live tiles)
//   4. item.thumb              — fallback thumbnail
//   5. item.metadata.poster_url — nested under metadata when surfaced from
//                                an external provider response
//   6. deterministic gradient  — last resort, hashed by item.id
//
// Returns a CSS `background` shorthand string. Callers drop it straight into
// a style object (e.g. `style={{ background: posterBg(item, idx) }}`).
export function posterBg(item, idx) {
  if (item) {
    var url = item.poster_url
      || item.poster
      || item.logo_url
      || item.thumb
      || (item.metadata && item.metadata.poster_url);
    if (url) {
      return 'url(' + url + ') center/cover no-repeat';
    }
  }
  return GRADIENT_PALETTE[_hashToPaletteIdx(item, idx)];
}

// Threshold below which virtualization is more overhead than gain.
// Empirically the scroll-handler + spacer divs cost ~0.4 ms per pass on
// the QN85; under ~100 items that's pure waste because the full grid
// already paints in <8 ms.
export var VIRTUALIZE_MIN_ITEMS = 100;

/**
 * useGridVirtualizer
 * @param {Object} opts
 * @param {React.MutableRefObject<HTMLElement|null>} opts.scrollRef
 *   Ref to the SCROLLING ancestor (the element with overflow-y: auto).
 * @param {number} opts.itemCount Total items in the dataset.
 * @param {number} opts.columns Grid columns (0 = list / single-column).
 * @param {number} opts.rowHeight Pixel height of a row including gap.
 * @param {number} [opts.overscan=1] Extra rows above/below viewport.
 *
 * @returns {{
 *   enabled: boolean,
 *   startIndex: number,
 *   endIndex: number,
 *   topSpacer: number,
 *   bottomSpacer: number,
 * }}
 *
 * Contract:
 *   - When enabled is false (item count below the threshold) the consumer
 *     should render every item as before — startIndex=0, endIndex=itemCount.
 *     The hook still attaches no listeners in that case so it stays cheap.
 *   - When enabled is true the consumer renders items[startIndex..endIndex]
 *     and wraps them with two `<div style={{height: topSpacer/bottomSpacer}} />`
 *     spacers so the scrollbar reflects the full dataset.
 */
export function useGridVirtualizer(opts) {
  var scrollRef = opts.scrollRef;
  var itemCount = opts.itemCount || 0;
  var cols = opts.columns && opts.columns > 0 ? opts.columns : 1;
  var rowHeight = opts.rowHeight && opts.rowHeight > 0 ? opts.rowHeight : 240;
  var overscan = typeof opts.overscan === 'number' ? opts.overscan : 1;

  var enabled = itemCount > VIRTUALIZE_MIN_ITEMS;

  // useState is cheap when the value never changes; keep the hook order
  // stable regardless of the `enabled` short-circuit so React doesn't see
  // a different hook count between renders.
  var rangeState = React.useState({ start: 0, end: itemCount });
  var range = rangeState[0];
  var setRange = rangeState[1];

  React.useEffect(function() {
    if (!enabled) {
      // Make sure a transition out of virtualized mode resets to full range
      // (catalog shrank past the threshold).
      setRange({ start: 0, end: itemCount });
      return undefined;
    }
    var el = scrollRef && scrollRef.current;
    if (!el) { return undefined; }

    function compute() {
      var clientHeight = el.clientHeight || 600;
      var scrollTop = el.scrollTop || 0;
      var rowsVisible = Math.ceil(clientHeight / rowHeight);
      var firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
      var lastRow = firstRow + rowsVisible + overscan * 2;
      var start = firstRow * cols;
      var end = Math.min(itemCount, lastRow * cols);
      // Only setState when the visible window actually changed — avoids
      // re-rendering the grid on every scroll-tick of identical math.
      setRange(function(prev) {
        if (prev.start === start && prev.end === end) { return prev; }
        return { start: start, end: end };
      });
    }

    compute();
    // Passive listener so we never block the Tizen scroll-frame producer.
    el.addEventListener('scroll', compute, { passive: true });
    // Re-compute on viewport resize (e.g. user opens an overlay that
    // shrinks the grid container).
    var winListenerAttached = false;
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('resize', compute);
      winListenerAttached = true;
    }
    return function() {
      el.removeEventListener('scroll', compute);
      if (winListenerAttached) {
        window.removeEventListener('resize', compute);
      }
    };
  }, [scrollRef, enabled, itemCount, cols, rowHeight, overscan]);

  if (!enabled) {
    return { enabled: false, startIndex: 0, endIndex: itemCount, topSpacer: 0, bottomSpacer: 0 };
  }

  var startRow = Math.floor(range.start / cols);
  var endRow = Math.ceil(range.end / cols);
  var totalRows = Math.ceil(itemCount / cols);
  var topSpacer = startRow * rowHeight;
  var bottomSpacer = Math.max(0, (totalRows - endRow) * rowHeight);
  return {
    enabled: true,
    startIndex: range.start,
    endIndex: range.end,
    topSpacer: topSpacer,
    bottomSpacer: bottomSpacer,
  };
}
