// ─────────────────────────────────────────────────────────────────────────────
// viewportClass — apply `hermes-vp-*` body classes that shells / CSS can
// react to without each component subscribing to a hook. Drops classes:
//   hermes-vp-{breakpoint}  (tv | desktop | tablet | phone)
//   hermes-vp-{orientation} (landscape | portrait)
//   hermes-vp-narrow        (width < 800 px — handy for phones in landscape)
//   hermes-vp-wide          (width ≥ 800 px)
//
// Call installViewportClasses() ONCE at boot (App.jsx). Returns an uninstall
// function in case the host needs to tear it down (HMR, tests).
//
// SSR-safe (no-ops outside the browser).
// Tizen 6.5 / Chrome 76 safe — no destructuring, no arrows, var only.
// ─────────────────────────────────────────────────────────────────────────────

import { getViewport } from '../hooks/useViewport.js';

function installViewportClasses() {
  if (typeof document === 'undefined') {
    return function noopUninstall() {};
  }

  function apply() {
    var vp = getViewport();
    var body = document.body;
    if (!body) { return; }
    // Strip any prior hermes-vp-* classes before reapplying so we don't
    // accumulate stale tokens on orientation flips.
    var existing = (body.className || '').split(/\s+/);
    var kept = [];
    for (var i = 0; i < existing.length; i++) {
      var c = existing[i];
      if (c && c.indexOf('hermes-vp-') !== 0) { kept.push(c); }
    }
    kept.push('hermes-vp-' + vp.breakpoint);
    kept.push('hermes-vp-' + vp.orientation);
    if (vp.width < 800) { kept.push('hermes-vp-narrow'); }
    else { kept.push('hermes-vp-wide'); }
    body.className = kept.join(' ');
  }

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);

  return function uninstall() {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
  };
}

export { installViewportClasses };
export default installViewportClasses;
