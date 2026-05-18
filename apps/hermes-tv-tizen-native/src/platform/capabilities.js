// TV capability detection — runs once at boot, result cached on window.HERMES_CAP.
//
// QN-class QLED TVs (QN85, QN95) are the primary design target. Enhanced tier is
// the design assumption. UN-class TVs receive graceful degradation.
//
// HARD RULES:
//   - Tier (enhanced / degraded) is determined ONLY by the QN/UN model prefix from
//     webapis.productinfo.getModelCode(). It is NEVER hardcoded and NEVER derived
//     from Tizen version alone (both target TVs run Tizen 6.5).
//   - QN-prefix (e.g. QN85Q7FAAFXZA, QN95-class) = enhanced tier (primary target).
//   - UN-prefix (e.g. UN55CU8000BXZA) = degraded tier (graceful degradation only).
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
      isEnhancedTier:       false,  // Set by detectPerformanceTier() — QN-class is the design target
      isDegradedMode:       true,   // Set by detectPerformanceTier() — true for UN-class and unknowns
      targetTier:           'degraded', // 'enhanced' for QN-class, 'degraded' for UN-class/unknown
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
    caps.isEnhancedTier = /^QN/i.test(modelCode);   // QN → enhanced (primary); UN or unknown → degraded
    caps.isDegradedMode = !caps.isEnhancedTier;     // true on UN-class — graceful degradation only
    caps.targetTier     = caps.isEnhancedTier ? 'enhanced' : 'degraded';
    caps.isSherrisTv    = /^QN/i.test(modelCode);   // Mom's TV is QN-class (primary target)
    caps.isDavesTv      = /^UN/i.test(modelCode);   // Dave's TV is UN-class (degraded)

    if (!modelCode) {
      // Fallback when webapis is unavailable (e.g. browser dev environment).
      // Conservative: default to degraded so enhanced features are not accidentally
      // enabled on unknown hardware. Tier CANNOT be inferred from Tizen version alone.
      caps.isEnhancedTier = false;
      caps.isDegradedMode = true;
      caps.targetTier     = 'degraded';
      caps.isSherrisTv    = false;
      caps.isDavesTv      = false;
      if (typeof console !== 'undefined') {
        console.warn('[capabilities] webapis.productinfo unavailable — defaulting to degraded mode (UN-class fallback).');
      }
    }

    return caps;
  }

  window.HERMES_CAP = detectTVCapabilities();
  detectPerformanceTier(window.HERMES_CAP);

  // Apply tier classes to <html> immediately (used by CSS tier-gate paths).
  // QN-class → 'body--enhanced'  (full GPU features, no animation suppression)
  // UN-class → 'body--baseline un-degraded'  (CSS degradation overrides active)
  var tierClass = window.HERMES_CAP.isEnhancedTier
    ? 'body--enhanced'
    : 'body--baseline un-degraded';
  var html = document.documentElement;
  html.className = (html.className || '').replace(/\bbody--loading\b/g, '').trim();
  html.className += (html.className ? ' ' : '') + tierClass;

  // Also apply 'un-degraded' to <body> so CSS selectors like
  // 'body.un-degraded .overlay-backdrop' fire on the correct element.
  if (window.HERMES_CAP.isDegradedMode && document.body) {
    document.body.classList.add('un-degraded');
  }
}());
