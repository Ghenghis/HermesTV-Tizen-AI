import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// ZeroFocusRing — mounts a scoped <style> block that provides the Zero-shell
// focus halo for all `[data-zero-poster]`, `[data-focusable]`, and Zero
// hero CTAs. Centralizing the focus visuals here means:
//
//   1. The ring is always rendered at the same blue/cyan gradient stops as
//      the Zero preboot card (#77a7ff → #56d2f1) — no per-component drift.
//   2. The ring is gated behind :focus-visible, so mouse-clicking a poster
//      does NOT light up the ring (matches Zero's restrained UX from
//      FRONTEND_COMPONENTS.md §card "no hover halo").
//   3. The ring is wider on Tizen (4 px) than on desktop (2 px) because the
//      remote at 8–10 ft viewing distance needs the extra mass to read.
//   4. The keyframes are clipped behind `prefers-reduced-motion` and our
//      own `<body class="motion-reduced">` rule so MEMORY.md's tier policy
//      is honored without per-shell `if` checks.
//
// Render this component ONCE at the top of the ZeroShell. Mounting twice
// is harmless — the rules are idempotent CSS — but unnecessary.
//
// Tizen 6.5 / Chrome 76 safe — pure JSX wrapping a <style> tag.
// ─────────────────────────────────────────────────────────────────────────────

var ZERO_FOCUS_CSS = ''
  // Default focus styles for Zero — only :focus-visible so mouse clicks don't
  // glow.
  + '.zero-shell [data-zero-poster]:focus-visible,'
  + '.zero-shell [data-focusable]:focus-visible,'
  + '.zero-shell [data-zero-hero-cta]:focus-visible,'
  + '.zero-shell button:focus-visible {'
  +   ' outline: none;'
  +   ' box-shadow: 0 0 0 3px rgba(86,210,241,0.55), 0 0 24px rgba(86,210,241,0.18);'
  +   ' border-radius: 12px;'
  +   ' transition: box-shadow 120ms ease;'
  + '}'
  // Posters get a slightly larger ring because the card surface is bigger
  // — viewer's eye lands on the inner card; the ring needs more mass to
  // register peripherally.
  + '.zero-shell [data-zero-poster]:focus-visible {'
  +   ' box-shadow: 0 0 0 4px rgba(86,210,241,0.65), 0 0 32px rgba(86,210,241,0.22);'
  + '}'
  // Sidebar rows use a left-rail accent stripe instead of a halo — that's
  // the Zero pattern for vertical lists.
  + '.zero-shell aside [data-focusable]:focus-visible,'
  + '.zero-shell aside [data-focusable]:focus {'
  +   ' box-shadow: inset 3px 0 0 #56d2f1, 0 0 0 1px rgba(86,210,241,0.18);'
  +   ' background: rgba(86,210,241,0.06);'
  + '}'
  // Disable the halo when the user has reduced-motion or when we're in a
  // degraded tier — the shadow itself doesn't move, but the 120 ms fade-in
  // counts as motion under WCAG.
  + '@media (prefers-reduced-motion: reduce) {'
  +   ' .zero-shell [data-zero-poster]:focus-visible,'
  +   ' .zero-shell [data-focusable]:focus-visible,'
  +   ' .zero-shell button:focus-visible {'
  +     ' transition: none;'
  +   ' }'
  + '}'
  + 'body.motion-reduced .zero-shell [data-zero-poster]:focus-visible,'
  + 'body.motion-reduced .zero-shell [data-focusable]:focus-visible,'
  + 'body.motion-reduced .zero-shell button:focus-visible {'
  +   ' transition: none;'
  + '}';

function ZeroFocusRing() {
  // dangerouslySetInnerHTML keeps the CSS compact in the bundle and avoids
  // React escaping the curly braces of the rule blocks.
  return (
    <style data-zero-focus-ring="true" dangerouslySetInnerHTML={{ __html: ZERO_FOCUS_CSS }} />
  );
}

export default ZeroFocusRing;
