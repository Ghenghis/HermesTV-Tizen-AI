import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// CategorySidebar — channel-groups quick filter shared by every live-focused
// shell (TiviMate, LiveTV, Iptvnator, DavePower, Mom Mode, ExtremeInfiniTV).
//
// Renders a list of category chips ("All", "Sports (135)", "News (89)" …)
// derived from the supplied catalog so the rail always reflects what the
// shell will actually paint. Counts are computed from the live items the
// caller passes in — never from a hard-coded label set — so a Hallmark-only
// playlist still shows "Hallmark (12)" rather than a stale rainbow of empty
// chips.
//
// Variants:
//   - vertical (default): 200/220/240 px wide rail, chip per line, count on
//     the right. Used by TiviMate, LiveTV, DavePower, ExtremeInfiniTV.
//   - horizontal: wraps a flex row of chips at the top of a tab pane —
//     Mom Mode uses this above her Live TV grid because she prefers
//     horizontal scanning to vertical lists.
//   - mom (vertical or horizontal): larger chips, font scale defaults to
//     1.4× the supplied fontScale, only the Top 6 categories are surfaced
//     so Sherri never has to skim a 12-entry list.
//
// Keyboard navigation: Up/Down arrows move focus through chips, Enter / Space
// activates. ArrowLeft / ArrowRight on the horizontal variant. All chips are
// tabIndex={0} so the Tizen remote's d-pad steps through them. The active
// chip carries aria-pressed="true".
//
// Tizen 6.5 / Chrome 76 safe — ES5-style declarations, no template strings,
// no arrow funcs, no destructuring, no optional chaining, no `:has()`.
// ─────────────────────────────────────────────────────────────────────────────

// Friendly labels for the catalog's category slugs. Anything not in this map
// renders title-cased ("foo" → "Foo"). Categories appear in the rail when
// the supplied catalog contains at least one matching item — never when the
// label has zero items, because empty chips look broken.
var CATEGORY_LABELS = {
  sports: 'Sports',
  news: 'News',
  movies: 'Movies',
  kids: 'Kids',
  family: 'Family',
  music: 'Music',
  documentary: 'Documentary',
  international: 'International',
  lifestyle: 'Lifestyle',
  religious: 'Religious',
  entertainment: 'Entertainment',
  hallmark: 'Hallmark',
  mysteries: 'Mysteries',
  mystery: 'Mysteries',
  drama: 'Drama',
  romance: 'Romance',
  action: 'Action',
  general: 'General',
};

// Top-6 whitelist for Mom Mode. Order is the order the chips render in.
// We never show Mom 12 categories — she'll get lost. Anything outside this
// set still counts toward "All" but never gets its own chip.
var MOM_TOP_CATEGORIES = ['sports', 'news', 'movies', 'family', 'lifestyle', 'music'];

function _titleCase(slug) {
  if (!slug) { return 'Other'; }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function _labelFor(slug) {
  if (CATEGORY_LABELS[slug]) { return CATEGORY_LABELS[slug]; }
  return _titleCase(slug);
}

// Derive the {slug, label, count} list from the supplied items. Sorts by
// descending count then alphabetically so the busiest groups float to the
// top — same contract LiveTVShell already uses internally.
function _deriveGroups(items, momMode) {
  var counts = {};
  var total = items ? items.length : 0;
  if (items && items.length) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var slug = (it && it.category)
        || (it && it.metadata && it.metadata.genre)
        || 'other';
      // Normalise to lower-case so 'Sports' and 'sports' don't split the
      // bucket between API providers.
      slug = String(slug).toLowerCase();
      counts[slug] = (counts[slug] || 0) + 1;
    }
  }
  var slugs = Object.keys(counts);
  slugs.sort(function(a, b) {
    if (counts[b] !== counts[a]) { return counts[b] - counts[a]; }
    return a < b ? -1 : 1;
  });
  if (momMode) {
    // Filter to the Mom whitelist, preserving the count-desc order.
    slugs = slugs.filter(function(s) {
      for (var k = 0; k < MOM_TOP_CATEGORIES.length; k++) {
        if (MOM_TOP_CATEGORIES[k] === s) { return true; }
      }
      return false;
    });
  }
  var groups = [{ id: 'all', label: 'All', count: total }];
  for (var j = 0; j < slugs.length; j++) {
    groups.push({ id: slugs[j], label: _labelFor(slugs[j]), count: counts[slugs[j]] });
  }
  return groups;
}

// Move focus to the sibling chip in the requested direction. Wraps the rail
// so ArrowDown past the last chip lands back on the first — mirrors the
// existing ProviderFilter pattern.
function _focusSibling(currentEl, delta) {
  if (!currentEl || !currentEl.parentElement) { return; }
  var siblings = currentEl.parentElement.querySelectorAll('[data-category-chip="true"]');
  var idx = -1;
  for (var i = 0; i < siblings.length; i++) {
    if (siblings[i] === currentEl) { idx = i; break; }
  }
  if (idx === -1 || siblings.length === 0) { return; }
  var next = (idx + delta + siblings.length) % siblings.length;
  var target = siblings[next];
  if (target && typeof target.focus === 'function') {
    try { target.focus(); } catch (_) {}
  }
}

function CategorySidebar(props) {
  var items = props.items || [];
  var activeId = props.activeId || 'all';
  var onSelect = props.onSelect;
  var variant = props.variant || 'vertical'; // 'vertical' | 'horizontal'
  var momMode = !!props.momMode;
  var accent = props.accent || 'var(--accent, #00d4ff)';
  var fontScale = props.fontScale || 1;
  var title = props.title; // optional rail heading; null = no heading
  var width = props.width; // for vertical only — caller can override 200/220/240

  var groups = React.useMemo(function() {
    return _deriveGroups(items, momMode);
  }, [items, momMode]);

  // Single chip — re-used by both layouts so styling stays in sync.
  function _renderChip(g) {
    var isActive = g.id === activeId;
    // Mom chips are taller / larger; tier-degraded font is bumped via fontScale.
    var basePx = momMode ? 16 : 13;
    var verticalPad = momMode ? '10px 14px' : '8px 10px';
    var horizontalPad = momMode ? '10px 18px' : '6px 12px';
    var px = variant === 'horizontal' ? horizontalPad : verticalPad;
    return (
      <button
        key={g.id}
        type="button"
        tabIndex={0}
        data-category-chip="true"
        data-category-id={g.id}
        aria-pressed={isActive}
        aria-label={g.label + ', ' + g.count + (g.count === 1 ? ' channel' : ' channels')}
        onClick={function() { if (typeof onSelect === 'function') { onSelect(g.id); } }}
        onKeyDown={function(e) {
          var key = e.key;
          if (key === 'Enter' || key === ' ') {
            e.preventDefault();
            if (typeof onSelect === 'function') { onSelect(g.id); }
            return;
          }
          if (variant === 'horizontal') {
            if (key === 'ArrowRight') { e.preventDefault(); _focusSibling(e.currentTarget, 1); return; }
            if (key === 'ArrowLeft')  { e.preventDefault(); _focusSibling(e.currentTarget, -1); return; }
          } else {
            if (key === 'ArrowDown') { e.preventDefault(); _focusSibling(e.currentTarget, 1); return; }
            if (key === 'ArrowUp')   { e.preventDefault(); _focusSibling(e.currentTarget, -1); return; }
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: variant === 'horizontal' ? 'auto' : '100%',
          padding: px,
          marginBottom: variant === 'horizontal' ? 0 : (momMode ? '6px' : '3px'),
          background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
          color: isActive ? accent : 'var(--text, #e6edf3)',
          borderTop: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          borderLeft: variant === 'vertical'
            ? (isActive ? '3px solid ' + accent : '3px solid transparent')
            : 'none',
          // Horizontal variant uses a pill outline; vertical uses a left rail.
          borderRadius: variant === 'horizontal'
            ? (momMode ? '999px' : '999px')
            : (momMode ? '10px' : '6px'),
          boxShadow: variant === 'horizontal' && isActive
            ? '0 0 0 2px ' + accent
            : 'none',
          cursor: 'pointer',
          fontSize: 'calc(' + basePx + 'px * ' + fontScale + ')',
          fontWeight: isActive ? 700 : 500,
          textAlign: 'left',
          outline: 'none',
          letterSpacing: '0.01em',
          // Horizontal chips need their own outline ring on the right side
          // because the active state uses a pill, not a left strip.
          flexShrink: 0,
        }}
        onFocus={function(e) {
          e.currentTarget.style.boxShadow = '0 0 0 2px ' + accent;
        }}
        onBlur={function(e) {
          e.currentTarget.style.boxShadow = variant === 'horizontal' && isActive
            ? '0 0 0 2px ' + accent
            : 'none';
        }}
        onMouseEnter={function(e) {
          if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }
        }}
        onMouseLeave={function(e) {
          if (!isActive) { e.currentTarget.style.background = 'transparent'; }
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.label}
        </span>
        <span style={{
          marginLeft: '8px',
          color: 'var(--muted, #8b949e)',
          fontSize: 'calc(' + (basePx - 2) + 'px * ' + fontScale + ')',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
        }}>
          {g.count}
        </span>
      </button>
    );
  }

  if (variant === 'horizontal') {
    return (
      <div
        role="toolbar"
        aria-label="Channel categories"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '8px 12px',
          background: 'transparent',
        }}
      >
        {groups.map(function(g) { return _renderChip(g); })}
      </div>
    );
  }

  // Vertical (default)
  var widthStyle = {};
  if (width) { widthStyle.width = width; }
  return (
    <div
      role="toolbar"
      aria-label="Channel categories"
      style={Object.assign({
        display: 'flex',
        flexDirection: 'column',
        padding: momMode ? '10px 6px' : '6px 4px',
        background: 'transparent',
        overflowY: 'auto',
        overflowX: 'hidden',
      }, widthStyle)}
    >
      {title && (
        <div style={{
          padding: momMode ? '4px 12px 8px' : '4px 10px 6px',
          fontSize: 'calc(' + (momMode ? 12 : 10) + 'px * ' + fontScale + ')',
          color: 'var(--muted, #8b949e)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 700,
        }}>{title}</div>
      )}
      {groups.map(function(g) { return _renderChip(g); })}
    </div>
  );
}

export default CategorySidebar;
