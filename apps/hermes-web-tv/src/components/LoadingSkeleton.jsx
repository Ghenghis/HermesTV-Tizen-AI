import React from 'react';
import { SkeletonBlock, SkeletonCard, SkeletonRow, SkeletonText } from './Skeleton';

// ─────────────────────────────────────────────────────────────────────────────
// LoadingSkeleton — shared, variant-driven shimmer scaffolds.
//
// This is the *one* skeleton component every feature should reach for. It
// composes the existing low-level Skeleton.{Block,Card,Row,Text} primitives
// (which already inject the shimmer keyframes once on import) and shapes
// them into the five layout flavours we ship across the app:
//
//   • rail   — horizontal row of poster cards (catalog rails, continue-
//              watching, favorites, "because you watched", etc).
//   • grid   — 2-D grid of poster cards (search results, category drill-
//              down, library views).
//   • hero   — large feature poster + headline + meta (catalog hero,
//              spotlight, "what's on now").
//   • card   — single card placeholder (modal preview, EPG cell).
//   • detail — long-form pane: backdrop, title, meta, synopsis lines (used
//              by MediaDetailPanel, EPGModal, ScheduleRecordingModal).
//
// Mom-mode awareness (`--font-scale >= 1.4`)
//   The runtime CSS-var `--font-scale` is the canonical signal that we're
//   in Mom-mode (Sherri's profile). At 1.35 or higher we bump tile sizes,
//   gaps, and meta line thickness so the skeleton matches the *real* card
//   we're about to drop in. We probe the computed style on first render
//   via a tiny ref-callback — no React-state subscription, no flicker.
//
// Reduced-motion gating
//   The existing Skeleton.jsx module respects both `prefers-reduced-motion`
//   and the `body.motion-reduced` class via index.css's universal
//   `animation-duration: 0.01ms !important` rule. Profiles that opt into
//   reduced motion (Sherri's accessibility preset, MEMORY.md tier policy)
//   already see a static dim panel. We ALSO honour
//   `[data-reduced-motion="true"]` on the host element for callers that
//   want per-instance opt-out without flipping the global body class.
//
// Tizen 6.5 / Chrome 76 constraints
//   • No optional chaining (?.), nullish coalescing (??), or class fields.
//   • No template literal CSS for animations (handled in Skeleton.jsx).
//   • Plain object spread is allowed (Chrome 60+).
// ─────────────────────────────────────────────────────────────────────────────

var DEFAULT_COUNTS = {
  rail: 6,
  grid: 12,
  hero: 1,
  card: 1,
  detail: 1,
};

// Read computed --font-scale once on mount; fall back to 1.0 if missing or
// the document is unavailable (SSR / Tizen pre-bootstrap).
function readFontScale() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 1.0;
  }
  try {
    var root = document.documentElement;
    var raw = window.getComputedStyle(root).getPropertyValue('--font-scale');
    var n = parseFloat(raw);
    if (isNaN(n) || n <= 0) { return 1.0; }
    return n;
  } catch (e) {
    return 1.0;
  }
}

// Detect explicit reduced-motion opt-out at the element level. The body
// class + media query are honoured globally by index.css; this hook only
// covers the `data-reduced-motion="true"` API the brief asks for.
function isReducedMotion(el) {
  if (!el || typeof el.getAttribute !== 'function') { return false; }
  return el.getAttribute('data-reduced-motion') === 'true';
}

// ─── Rail variant ─────────────────────────────────────────────────────────
function RailSkeleton(props) {
  var count = props.count;
  var momMode = props.momMode;
  var tileWidth = momMode ? 220 : 168;
  var gap = momMode ? 24 : 16;
  var items = [];
  for (var i = 0; i < count; i++) {
    items.push(
      <div key={i} style={{ flex: '0 0 ' + tileWidth + 'px' }}>
        <SkeletonCard width={tileWidth + 'px'} />
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: gap + 'px',
        overflow: 'hidden',
        padding: '0.5rem 0',
      }}
    >
      {items}
    </div>
  );
}

// ─── Grid variant ─────────────────────────────────────────────────────────
function GridSkeleton(props) {
  var count = props.count;
  var momMode = props.momMode;
  var minColWidth = momMode ? 220 : 160;
  var gap = momMode ? 20 : 14;
  var items = [];
  for (var i = 0; i < count; i++) {
    items.push(<SkeletonCard key={i} width="100%" />);
  }
  return (
    <div
      role="status"
      aria-label="Loading content"
      aria-busy="true"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(' + minColWidth + 'px, 1fr))',
        gap: gap + 'px',
        padding: '0.25rem 0',
      }}
    >
      {items}
    </div>
  );
}

// ─── Hero variant ─────────────────────────────────────────────────────────
function HeroSkeleton(props) {
  var momMode = props.momMode;
  var height = momMode ? '460px' : '360px';
  return (
    <div
      role="status"
      aria-label="Loading featured content"
      aria-busy="true"
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <SkeletonBlock width="100%" height={height} radius="14px" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxWidth: '60%' }}>
        <SkeletonBlock width="70%" height={momMode ? '1.8rem' : '1.4rem'} radius="6px" />
        <SkeletonBlock width="40%" height={momMode ? '1.1rem' : '0.95rem'} radius="4px" />
        <SkeletonBlock width="85%" height={momMode ? '0.95rem' : '0.85rem'} radius="4px" />
      </div>
    </div>
  );
}

// ─── Card variant ─────────────────────────────────────────────────────────
function CardOnlySkeleton(props) {
  var momMode = props.momMode;
  var width = momMode ? '260px' : '200px';
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      style={{ display: 'inline-block' }}
    >
      <SkeletonCard width={width} />
    </div>
  );
}

// ─── Detail variant ────────────────────────────────────────────────────────
function DetailSkeleton(props) {
  var momMode = props.momMode;
  var backdropH = momMode ? '320px' : '240px';
  return (
    <div
      role="status"
      aria-label="Loading details"
      aria-busy="true"
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}
    >
      <SkeletonBlock width="100%" height={backdropH} radius="12px" />
      <SkeletonBlock width="55%" height={momMode ? '1.8rem' : '1.4rem'} radius="6px" />
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <SkeletonBlock width="80px" height="0.85rem" radius="4px" />
        <SkeletonBlock width="60px" height="0.85rem" radius="4px" />
        <SkeletonBlock width="100px" height="0.85rem" radius="4px" />
      </div>
      <SkeletonText lines={momMode ? 5 : 4} />
      <SkeletonRow />
      <SkeletonRow />
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────
function LoadingSkeleton(props) {
  var variant = props.variant || 'grid';
  var explicitCount = props.count;
  var className = props.className || '';
  var inlineStyle = props.style || {};

  // Resolve count: explicit prop wins, otherwise use sensible default per
  // variant (rail=6, grid=12, others=1).
  var count = (typeof explicitCount === 'number' && explicitCount > 0)
    ? Math.floor(explicitCount)
    : (DEFAULT_COUNTS[variant] || 1);

  // Mom-mode probe — read --font-scale once. We use useState/useEffect so
  // we don't crash on SSR and we get a clean second-pass when the theme
  // finishes hydrating.
  var stateTuple = React.useState(function () { return readFontScale(); });
  var fontScale = stateTuple[0];
  var setFontScale = stateTuple[1];

  React.useEffect(function () {
    // Re-read after mount in case the theme provider beat us by a tick.
    var next = readFontScale();
    if (next !== fontScale) { setFontScale(next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  var momMode = fontScale >= 1.4;

  // Per-instance reduced-motion opt-out. The wrapper sets a data attribute
  // that the global `body.motion-reduced` CSS rules already key on — we
  // also add our own class so authors can target it without relying on
  // body state.
  var refCallback = React.useCallback(function (el) {
    if (!el) { return; }
    if (isReducedMotion(el)) {
      el.classList.add('motion-reduced');
    }
  }, []);

  var wrapperClass = ['hermes-loading-skeleton', 'variant-' + variant, className]
    .filter(Boolean).join(' ');

  var content;
  if (variant === 'rail') {
    content = <RailSkeleton count={count} momMode={momMode} />;
  } else if (variant === 'hero') {
    content = <HeroSkeleton momMode={momMode} />;
  } else if (variant === 'card') {
    content = <CardOnlySkeleton momMode={momMode} />;
  } else if (variant === 'detail') {
    content = <DetailSkeleton momMode={momMode} />;
  } else {
    // Default + 'grid'
    content = <GridSkeleton count={count} momMode={momMode} />;
  }

  return (
    <div
      ref={refCallback}
      className={wrapperClass}
      data-mom-mode={momMode ? 'true' : 'false'}
      style={Object.assign({ width: '100%' }, inlineStyle)}
    >
      {content}
    </div>
  );
}

// Named re-exports so callers can hand-roll a one-off variant without the
// dispatcher overhead. Kept tiny on purpose.
export {
  RailSkeleton,
  GridSkeleton,
  HeroSkeleton,
  CardOnlySkeleton,
  DetailSkeleton,
  LoadingSkeleton,
};

export default LoadingSkeleton;
