// TV capability detection — runs once at boot, result cached on window.HERMES_CAP.
//
// HARD RULES:
//   - Tier (enhanced / baseline) is determined ONLY by the QN/UN model prefix from
//     webapis.productinfo.getModelCode(). It is NEVER hardcoded and NEVER derived
//     from Tizen version alone (both target TVs run Tizen 6.5).
//   - QN-prefix (e.g. QN85Q7FAAFXZA) = enhanced tier (Sherri/Mom's TV).
//   - UN-prefix (e.g. UN55CU8000BXZA) = baseline tier (Dave's TV).
//   - The Tizen version fallback for tier is intentionally conservative (false)
//     because version alone cannot distinguish QN from UN on the same Tizen release.
//   - All feature flags below reflect Tizen 6.5 capabilities (doc 09 lock).
//     If on-device diagnostics reveal a different version, update these thresholds
//     in a follow-up commit with the diagnostic proof artifact attached.
(function() {
  'use strict';

  function detectTVCapabilities() {
    var v = 0;
    try {
      v = parseFloat(
        tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version')
      );
    } catch (e) {}

    // NOTE: isSherrisTv / isDavesTv are HINTS ONLY for logging. The real
    // tier decision is made by detectPerformanceTier() via model code prefix.
    // Both target TVs are confirmed Tizen 6.5 (doc 09). Version thresholds
    // below are therefore set for 6.5-class hardware.
    return {
      tizenVersion:         v,
      // UNVERIFIED: exact sub-version must be confirmed on-device (doc 02).
      // These are placeholders based on the Tizen 6.5 class lock in doc 09.
      isSherrisTv:          false,  // Set by detectPerformanceTier() after QN/UN detection
      isDavesTv:            false,  // Set by detectPerformanceTier() after QN/UN detection
      isEnhancedTier:       false,  // Set by detectPerformanceTier() — do NOT preset here
      modelCode:            '',     // Set by detectPerformanceTier()
      supportsLowLatency:   v >= 5.0,
      supportsModernDrm:    v >= 5.0,
      supportsWasm:         v >= 6.5,   // QN class only; check isEnhancedTier before use
      supportsAvExtension:  v >= 6.0,
      supportsNavConn:      v >= 6.0,
      supportsIntersectObs: v >= 5.0,
      supportsResizeObs:    v >= 5.0,
      supportsCssGrid:      v >= 4.0,
      supportsFetch:        v >= 4.0
    };
  }

  // QN-prefix = enhanced tier (Sherri's QN85Q7FAAFXZA — QLED).
  // UN-prefix = baseline tier (Dave's UN55CU8000BXZA — Crystal UHD).
  // Both TVs are Tizen 6.5 so version cannot distinguish them — model code is authoritative.
  function detectPerformanceTier(caps) {
    var modelCode = '';
    try {
      if (typeof webapis !== 'undefined' && webapis.productinfo) {
        modelCode = webapis.productinfo.getModelCode() || '';
      }
    } catch (e) {}

    caps.modelCode      = modelCode;
    caps.isEnhancedTier = /^QN/i.test(modelCode);   // QN → enhanced; UN or unknown → baseline
    caps.isSherrisTv    = /^QN/i.test(modelCode);   // Mom's TV is QN-class
    caps.isDavesTv      = /^UN/i.test(modelCode);   // Dave's TV is UN-class

    if (!modelCode) {
      // Fallback when webapis is unavailable (e.g. browser dev environment).
      // Conservative: default to baseline so enhanced features are not accidentally
      // enabled on unknown hardware. Tier CANNOT be inferred from Tizen version alone.
      caps.isEnhancedTier = false;
      caps.isSherrisTv    = false;
      caps.isDavesTv      = false;
      if (typeof console !== 'undefined') {
        console.warn('[capabilities] webapis.productinfo unavailable — defaulting to baseline tier.');
      }
    }

    return caps;
  }

  window.HERMES_CAP = detectTVCapabilities();
  detectPerformanceTier(window.HERMES_CAP);

  // Apply tier class to <html> immediately (used by CSS tier-gate paths).
  // 'body--loading' is replaced by the tier class once detection is complete.
  var tierClass = window.HERMES_CAP.isEnhancedTier ? 'body--enhanced' : 'body--baseline';
  var html = document.documentElement;
  html.className = (html.className || '').replace(/\bbody--loading\b/g, '').trim();
  html.className += (html.className ? ' ' : '') + tierClass;
}());
