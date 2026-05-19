import React from 'react';

// Skeleton — pulsing shimmer placeholders for async UX transitions.
//
// SOTA streaming shells (Netflix, Apple TV+, Disney+) never show a blank
// canvas while data loads — they paint the layout-to-be with a faint
// shimmering gradient so the user sees where content is about to appear.
// HermesTV mirrors that pattern: every catalog fetch, profile switch, modal
// open, and chat round-trip swaps in a skeleton instead of a spinner or
// empty void.
//
// Compatibility constraints (Tizen 6.5 / Chrome 76):
//   - linear-gradient + background-position animation only (well-supported)
//   - No CSS custom properties in @keyframes values (Chrome 76 bug — inline
//     the colour stops in the keyframe declaration)
//   - No optional chaining (?.) or nullish coalescing (??)
//   - Pure CSS animation, no JS timers
//
// The hermes-shimmer keyframe is injected once at module load via a single
// <style> tag appended to <head>. Subsequent imports detect the existing
// node and skip re-injection so HMR + multiple Skeleton callers stay clean.

var KEYFRAME_ID = 'hermes-shimmer-keyframes';

function ensureKeyframes() {
  if (typeof document === 'undefined') { return; }
  if (document.getElementById(KEYFRAME_ID)) { return; }
  var styleEl = document.createElement('style');
  styleEl.id = KEYFRAME_ID;
  // Inline colours (no var() references) — Chrome 76 keyframe-var bug.
  // Three-stop gradient sweeps left → right at 1.4s. The .motion-reduced
  // class and prefers-reduced-motion media query both pin animation-duration
  // to ~0ms via index.css, so reduced-motion users see a static dim panel
  // instead of a moving sweep.
  styleEl.appendChild(document.createTextNode(
    '@keyframes hermes-shimmer {' +
    '  0% { background-position: -200% 0; }' +
    '  100% { background-position: 200% 0; }' +
    '}' +
    '.hermes-skeleton {' +
    '  background-color: #1c2128;' +
    '  background-image: linear-gradient(90deg, #1c2128 0%, #2a3038 50%, #1c2128 100%);' +
    '  background-size: 200% 100%;' +
    '  background-repeat: no-repeat;' +
    '  animation: hermes-shimmer 1.4s ease-in-out infinite;' +
    '  display: block;' +
    '}' +
    '@media (prefers-reduced-motion: reduce) {' +
    '  .hermes-skeleton { animation: none; background-image: none; }' +
    '}'
  ));
  document.head.appendChild(styleEl);
}

// Inject once on module load.
ensureKeyframes();

// SkeletonBlock — primitive pulsing box. All other skeletons compose this.
export function SkeletonBlock(props) {
  var width = props.width || '100%';
  var height = props.height || '1rem';
  var radius = props.radius || '6px';
  var style = props.style || {};
  return (
    <span
      aria-hidden="true"
      className="hermes-skeleton"
      style={Object.assign({
        width: width,
        height: height,
        borderRadius: radius,
      }, style)}
    />
  );
}

// SkeletonCard — 2:3 catalog poster placeholder with title + meta lines.
export function SkeletonCard(props) {
  var width = props.width || '100%';
  return (
    <div style={{ width: width, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <SkeletonBlock width="100%" height={0} radius="10px" style={{ paddingBottom: '150%', height: 0 }} />
      <SkeletonBlock width="80%" height="0.85rem" radius="4px" />
      <SkeletonBlock width="55%" height="0.7rem" radius="4px" />
    </div>
  );
}

// SkeletonRow — series episode / settings list row. Thumbnail + 2 text lines.
export function SkeletonRow() {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.5rem 0' }}>
      <SkeletonBlock width="80px" height="48px" radius="6px" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <SkeletonBlock width="60%" height="0.9rem" radius="4px" />
        <SkeletonBlock width="40%" height="0.7rem" radius="4px" />
      </div>
    </div>
  );
}

// SkeletonText — N stacked text lines (last one shorter for paragraph feel).
export function SkeletonText(props) {
  var lines = (typeof props.lines === 'number' && props.lines > 0) ? props.lines : 3;
  var rows = [];
  for (var i = 0; i < lines; i++) {
    var isLast = i === lines - 1;
    rows.push(
      <SkeletonBlock
        key={i}
        width={isLast ? '65%' : '100%'}
        height="0.8rem"
        radius="4px"
      />
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows}
    </div>
  );
}

// Default export keeps the namespace tidy for callers that prefer it.
var Skeleton = {
  Block: SkeletonBlock,
  Card: SkeletonCard,
  Row: SkeletonRow,
  Text: SkeletonText,
};

export default Skeleton;
