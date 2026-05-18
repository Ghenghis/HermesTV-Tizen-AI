// HermesTV Theme Manager — applies CSS variable sets by injecting/updating a <style> tag.
// Depends on window.hermesThemeColors (themeColors.js).
(function() {
  'use strict';

  var STYLE_TAG_ID = 'hermes-theme-vars';

  var _currentThemeId = null;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _getOrCreateStyleTag() {
    var tag = document.getElementById(STYLE_TAG_ID);
    if (!tag) {
      tag = document.createElement('style');
      tag.id = STYLE_TAG_ID;
      document.head.appendChild(tag);
    }
    return tag;
  }

  // Map a flat token object to CSS custom property declarations.
  // Token keys use underscores (bg_0) → CSS vars use dashes (--bg-0).
  function _tokensToCss(tokens) {
    var lines = [':root {'];
    Object.keys(tokens).forEach(function(key) {
      var cssVar = '--' + key.replace(/_/g, '-');
      lines.push('  ' + cssVar + ': ' + tokens[key] + ';');
    });
    lines.push('}');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function apply(themeId) {
    if (!window.hermesThemeColors) {
      if (typeof console !== 'undefined') {
        console.warn('[themeManager] window.hermesThemeColors not loaded.');
      }
      return;
    }

    // hermesThemeColors.get() returns { name, family, tokens: {...} }.
    // Also accept a bare token object for forward-compatibility.
    var result = window.hermesThemeColors.get(themeId);
    if (!result) {
      if (typeof console !== 'undefined') {
        console.warn('[themeManager] Unknown theme: ' + themeId);
      }
      return;
    }

    // Unwrap .tokens if present (schema-generated format); otherwise use result directly.
    var tokens = (result && result.tokens) ? result.tokens : result;

    var tag  = _getOrCreateStyleTag();
    tag.textContent = _tokensToCss(tokens);
    _currentThemeId = themeId;
  }

  function getCurrent() {
    return _currentThemeId;
  }

  // Apply a full profile object: theme, font_scale, reduced_motion.
  function applyProfile(profile) {
    if (!profile) return;

    // Apply theme.
    if (profile.active_theme) {
      apply(profile.active_theme);
    }

    // Apply font scale as CSS var.
    var fontScale = profile.font_scale != null ? profile.font_scale : 1;

    // Mom Mode: font_scale must be ≥ 1.25.
    if (profile.profile_id === 'mom_tv' && fontScale < 1.25) {
      fontScale = 1.25;
    }

    var tag  = _getOrCreateStyleTag();

    // Append/update font-scale and reduced-motion in the same style block by re-parsing.
    // Strategy: read current content, strip any existing :root { --font-scale: ... } override,
    // then append a second :root block with the profile-level overrides.
    var existing = tag.textContent || '';

    // Remove previous profile-override block (marked by comment sentinel).
    var sentinel = '/* hermes-profile-overrides */';
    var sentinelIdx = existing.indexOf(sentinel);
    if (sentinelIdx !== -1) {
      existing = existing.substring(0, sentinelIdx);
    }

    // Append profile overrides.
    existing += '\n' + sentinel + '\n:root {\n  --font-scale: ' + fontScale + ';\n}\n';
    tag.textContent = existing;

    // Reduced motion class on body.
    var reducedMotion = profile.profile_id === 'mom_tv'
      ? true // Mom Mode: reduced_motion locked ON
      : !!profile.reduced_motion;

    if (reducedMotion) {
      document.body.classList.add('reduced-motion');
    } else {
      document.body.classList.remove('reduced-motion');
    }
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  window.hermesTheme = {
    apply:        apply,
    getCurrent:   getCurrent,
    applyProfile: applyProfile
  };
}());
