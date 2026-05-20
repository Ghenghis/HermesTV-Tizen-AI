import React from 'react';
import CatalogCard from './CatalogCard.jsx';
import EmptyState from './EmptyState.jsx';
import { useGridVirtualizer } from '../shells/shellHelpers.js';
import { isSystemLimited } from '../utils/isSystemLimited.js';

// ─────────────────────────────────────────────────────────────────────────────
// CatalogGrid — the "Standard Grid" fallback shell when no layout is picked.
//
// W9-VIRTUALIZE (wave-9 perf fix)
// On a 1000+ item catalog this used to render every CatalogCard at once —
// scroll heights of ~340 viewports and >300 ms paint bursts on the QN85.
// Now we lean on the shared useGridVirtualizer (same hook as MomMode /
// TiviMate / ExtremeInfiniTV) so only the visible window + overscan is in
// the DOM at any time.
//
// Mom rule (per MEMORY.md): Mom's TV is NEVER system-limited. Virtualization
// is a perf optimisation, not a content cap — Mom still sees every item in
// the list. We just give her a slightly larger overscan (4 rows vs Dave's
// 2) so the next row is ready before her slower remote-scroll reaches it.
//
// Tizen 6.5 / Chrome 76 safe — no arrow funcs, no destructuring, no template
// strings, no optional chaining. Matches shellHelpers' ES5 style.
// ─────────────────────────────────────────────────────────────────────────────

// Walk up the DOM until we hit an element with overflow-y: auto|scroll. That's
// the actual scroll container — usually <main style="overflowY:auto"> in
// App.jsx. We do this once on mount; if nothing matches we fall back to
// `null` and the virtualizer hook short-circuits to "render everything".
function _findScrollParent(el) {
  if (!el || typeof window === 'undefined' || !window.getComputedStyle) { return null; }
  var node = el.parentElement;
  while (node && node !== document.body) {
    var cs;
    try { cs = window.getComputedStyle(node); } catch (_e) { cs = null; }
    if (cs) {
      var oy = cs.overflowY;
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

// Per-card row height (px) estimate at 1920x1080 TV viewport. CatalogCard's
// poster slot is the dominant height — live tiles are 16:9, VOD posters are
// 2:3, so a mixed grid averages ~360px for a 240px-wide card column. We add
// the title/quality block (~70px) and the 16px row gap to land on 446 ≈ 450.
// Slight over-estimate is safer than under (a too-large rowHeight just mounts
// a few extra rows; a too-small one leaves gaps at the bottom of the viewport).
var ROW_HEIGHT_PX = 450;

function CatalogGrid(props) {
  var items = props.items || [];
  var activeTab = props.activeTab || 'all';
  var profile = props.profile || {};
  var tier = props.tier || 'degraded';
  var onItemClick = props.onItemClick || null;
  var onOpenSettings = props.onOpenSettings || null;

  var profileId = profile.profile_id;
  var activeLayout = profile.active_layout || 'grid-standard';

  // W17-PURGE: when items[] is empty, render the honest empty state with an
  // Open Settings CTA. No fake-content fallback (the seed catalog is gone).
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div
        data-empty="true"
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}
      >
        <EmptyState
          icon="📭"
          title="No channels yet"
          message="None of your providers returned content. Open Settings → Providers and verify your iptv-org / xTremeHD / Apollo Group credentials are valid and reachable."
          cta={onOpenSettings ? { label: 'Open Settings', onClick: onOpenSettings } : null}
        />
      </div>
    );
  }

  // Filter by provider tab
  var filtered = items.filter(function(item) {
    if (activeTab === 'all') { return true; }
    var tags = item.provider_tags || [];
    return tags.indexOf(activeTab) !== -1;
  });

  // Filter by profile access
  filtered = filtered.filter(function(item) {
    var access = item.profile_access || [];
    return !profileId || access.indexOf(profileId) !== -1;
  });

  // Determine grid columns from layout and tier
  // enhanced: 5 for grid-standard, 8 for discovery, 2 for jumbo-rail
  // degraded: 3 for grid-standard, 4 for discovery, 2 for jumbo-rail
  var cols;
  if (props.columns !== undefined) {
    // explicit override from App.jsx
    cols = props.columns;
  } else if (activeLayout === 'jumbo-rail') {
    cols = 2;
  } else if (activeLayout === 'discovery') {
    cols = tier === 'enhanced' ? 8 : 4;
  } else {
    // grid-standard and rail-hero
    cols = tier === 'enhanced' ? 5 : 3;
  }

  // CSS class for grid container
  var gridClass = tier === 'enhanced' ? 'enhanced-grid' : 'degraded-grid';

  var gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(' + cols + ', 1fr)',
    // gridAutoRows:1fr aligns every card in a row to the same outer height
    // even when CatalogCard's internal poster aspect differs (16:9 for live,
    // 2:3 for VOD). Without this the row jagged-edges because mixed types
    // produce mixed intrinsic heights — exactly the audit-03 complaint.
    gridAutoRows: '1fr',
    gap: '1rem',
    padding: '1rem 1.5rem',
    flex: 1,
    alignItems: 'stretch',
  };

  // Degraded: disable hover transitions on grid container
  if (tier !== 'enhanced') {
    gridStyle.transition = 'none';
  }

  // ── W9-VIRTUALIZE: discover the scroll parent on mount ───────────────────
  // CatalogGrid is rendered inside a <main style="overflowY:auto"> in App.jsx
  // — that ancestor element is the actual scroll surface. We attach a ref to
  // a sentinel and walk up to find it once on mount.
  //
  // We expose the discovered parent as a React state-held ref-shape object
  // ({ current: parent }). When discovery resolves, we trigger a re-render
  // with a NEW object so useGridVirtualizer's [scrollRef, ...] dep sees a
  // fresh identity and attaches its scroll listener to the real element.
  var sentinelRef = React.useRef(null);
  var scrollRefState = React.useState({ current: null });
  var scrollRefHolder = scrollRefState[0];
  var setScrollRefHolder = scrollRefState[1];
  React.useEffect(function() {
    var parent = _findScrollParent(sentinelRef.current);
    if (parent) { setScrollRefHolder({ current: parent }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mom's TV is NEVER system-limited — virtualization is a perf optimisation,
  // not a content cap. She still sees the full filtered list; she just gets
  // a slightly larger overscan window so scrolling feels even smoother.
  var momProfile = !isSystemLimited(profile);
  var overscan = momProfile ? 4 : 2;

  var virt = useGridVirtualizer({
    scrollRef: scrollRefHolder,
    itemCount: filtered.length,
    columns: cols,
    rowHeight: ROW_HEIGHT_PX,
    overscan: overscan,
  });

  if (!filtered.length) {
    return (
      <div
        ref={sentinelRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 'calc(1rem * var(--font-scale, 1))',
        }}
      >
        No content available for this filter.
      </div>
    );
  }

  // Slice to the visible window. When virtualization is off (small catalog,
  // < 100 items) startIndex=0 / endIndex=length so the slice is a no-op and
  // we render exactly as before.
  var visible = filtered.slice(virt.startIndex, virt.endIndex);

  // Focus restoration on scroll — when the focused card scrolls off the
  // virtualized window and back on, React replaces the DOM node and we
  // lose focus. We track the active card id via focusin on the grid root
  // and restore focus to the same data-card-id once it re-mounts.
  var gridRootRef = React.useRef(null);
  var lastFocusedIdRef = React.useRef(null);
  React.useEffect(function() {
    var root = gridRootRef.current;
    if (!root) { return undefined; }
    function onFocusIn(e) {
      var t = e.target;
      // Walk up to a node carrying data-card-id (the wrapper we render
      // around each CatalogCard). Avoids re-installing listeners per card.
      while (t && t !== root) {
        if (t.getAttribute && t.getAttribute('data-card-id')) {
          lastFocusedIdRef.current = t.getAttribute('data-card-id');
          return;
        }
        t = t.parentElement;
      }
    }
    root.addEventListener('focusin', onFocusIn);
    return function() { root.removeEventListener('focusin', onFocusIn); };
  }, []);

  // After every render, if the last focused id is in the visible slice but
  // the active element isn't inside the matching wrapper, refocus it. This
  // is the no-op path on every render that doesn't involve scroll: the
  // already-focused element keeps focus.
  React.useEffect(function() {
    var root = gridRootRef.current;
    var fid = lastFocusedIdRef.current;
    if (!root || !fid) { return; }
    var active = (typeof document !== 'undefined') ? document.activeElement : null;
    if (active && active !== document.body) {
      // Check whether the active element is already inside the matching
      // wrapper — if so we're done.
      var p = active;
      while (p && p !== root) {
        if (p.getAttribute && p.getAttribute('data-card-id') === fid) {
          return;
        }
        p = p.parentElement;
      }
    }
    // Active element is not the previously focused card — find that card
    // in the freshly rendered DOM and focus its first focusable child.
    var wrapper = root.querySelector('[data-card-id="' + fid + '"]');
    if (wrapper) {
      // CatalogCard renders the focusable element as the outermost child of
      // the wrapper (tabIndex={0}). Pick the first focusable descendant.
      var inner = wrapper.querySelector('[tabindex="0"], [tabindex="-1"]');
      if (inner && typeof inner.focus === 'function') {
        try { inner.focus({ preventScroll: false }); } catch (_e) {
          try { inner.focus(); } catch (_e2) {}
        }
      }
    }
  }, [virt.startIndex, virt.endIndex, filtered.length]);

  return (
    <div ref={sentinelRef}>
      {/* Top spacer — preserves scrollbar geometry for unmounted rows.
          height=0 when virtualization is off (catalog under threshold). */}
      {virt.topSpacer > 0 && (
        <div aria-hidden="true" style={{ height: virt.topSpacer + 'px' }} />
      )}
      <div ref={gridRootRef} className={gridClass} style={gridStyle}>
        {visible.map(function(item, sliceIdx) {
          var idx = virt.startIndex + sliceIdx;
          var cardId = item.item_id || item.id;
          return (
            <div
              key={cardId}
              data-card-id={cardId}
              data-card-index={idx}
            >
              <CatalogCard
                item={item}
                profile={profile}
                tier={tier}
                onClick={onItemClick}
              />
            </div>
          );
        })}
      </div>
      {/* Bottom spacer — preserves scrollbar geometry for unmounted trailing
          rows. height=0 when virtualization is off. */}
      {virt.bottomSpacer > 0 && (
        <div aria-hidden="true" style={{ height: virt.bottomSpacer + 'px' }} />
      )}
    </div>
  );
}

export default CatalogGrid;
