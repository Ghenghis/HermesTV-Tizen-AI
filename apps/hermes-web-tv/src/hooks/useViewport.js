// ─────────────────────────────────────────────────────────────────────────────
// useViewport — React hook reporting viewport dimensions + orientation +
// breakpoint. Listens to `resize` and `orientationchange` so any component
// that consumes this re-renders when Mom rotates her Samsung tablet.
//
// Breakpoints chosen to match the layout-engine intent:
//   - tv      ≥ 1600 px (QN85 / QN95 / desktop 1080p+)
//   - desktop ≥ 1024 px (laptops, big tablets in landscape)
//   - tablet  ≥  600 px (most tablets in portrait, large phones)
//   - phone   <  600 px (compact phones)
//
// SSR-safe default 1920×1080 landscape/tv so server-rendered React doesn't
// crash before window is available.
//
// Tizen 6.5 / Chrome 76 safe — no destructuring, no arrows, var only.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

function getViewport() {
  if (typeof window === 'undefined') {
    return {
      width: 1920,
      height: 1080,
      orientation: 'landscape',
      isPortrait: false,
      isLandscape: true,
      breakpoint: 'tv',
    };
  }
  var w = window.innerWidth;
  var h = window.innerHeight;
  var orientation = w >= h ? 'landscape' : 'portrait';
  var breakpoint;
  if (w >= 1600) { breakpoint = 'tv'; }
  else if (w >= 1024) { breakpoint = 'desktop'; }
  else if (w >= 600) { breakpoint = 'tablet'; }
  else { breakpoint = 'phone'; }
  return {
    width: w,
    height: h,
    orientation: orientation,
    isPortrait: orientation === 'portrait',
    isLandscape: orientation === 'landscape',
    breakpoint: breakpoint,
  };
}

function useViewport() {
  var vpResult = React.useState(getViewport);
  var vp = vpResult[0];
  var setVp = vpResult[1];
  React.useEffect(function() {
    function onResize() { setVp(getViewport()); }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return function() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return vp;
}

export default useViewport;
export { getViewport };
