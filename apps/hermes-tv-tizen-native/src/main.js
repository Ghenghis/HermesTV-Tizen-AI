// HermesTV — app entry point
// Bootstraps platform detection, then hands off to UI once the backend profile arrives.
(function() {
  'use strict';

  // Set the API base URL from the <meta name="hermes-api-url"> tag as early as possible,
  // before profileStore fires its DOMContentLoaded listener and fetches the profile.
  // Both listeners fire in document order; this script tag must come before profileStore
  // in the bundle entry point (or be loaded as a separate earlier <script>).
  document.addEventListener('DOMContentLoaded', function() {
    var metaApi = document.querySelector('meta[name="hermes-api-url"]');
    if (metaApi && window.hermesApi) {
      window.hermesApi.setBaseUrl(metaApi.getAttribute('content'));
    }
  });

  // React to profile arriving from backend (profileStore emits 'profile:updated').
  // This fires after profileStore's DOMContentLoaded fetches the profile successfully.
  document.addEventListener('profile:updated', function(e) {
    var profile = e.detail && e.detail.profile;
    var cap = window.HERMES_CAP || {};

    // Apply profile-driven body classes.
    if (profile) {
      var body = document.body;
      // profile_id is one of: 'mom_tv', 'dave_tv'
      body.classList.add('profile--' + profile.profile_id);
      if (profile.accessibility && profile.accessibility.mom_mode) {
        body.classList.add('body--mom-mode');
      }
      if (profile.accessibility && profile.accessibility.reduced_motion) {
        body.classList.add('body--reduced-motion');
      }
    }

    // Log boot info (stripped in prod builds via Webpack DefinePlugin).
    if (typeof console !== 'undefined' && console.log) {
      console.log('[HermesTV] Boot — Tizen ' + (cap.tizenVersion || '?') +
        ' | Model: ' + (cap.modelCode || 'unknown') +
        ' | Tier: ' + (cap.isEnhancedTier ? 'Enhanced' : 'Baseline') +
        ' | Profile: ' + (profile ? profile.profile_id : 'none'));
    }

    // Hand off to UI router (implemented in B2+).
    if (typeof window.hermesRouter === 'function') {
      window.hermesRouter(profile, cap);
    } else {
      // B1 placeholder — show minimal safe splash.
      // Use textContent (not innerHTML) to prevent any XSS from profile data.
      var root = document.getElementById('app-root');
      if (root && profile) {
        var splash = document.createElement('div');
        splash.className = 'boot-splash';

        var title = document.createElement('p');
        title.textContent = 'DaveTV';

        var welcome = document.createElement('p');
        // display_name comes from the backend; textContent prevents injection.
        welcome.textContent = 'Welcome, ' + (profile.display_name || profile.profile_id);

        var tier = document.createElement('p');
        tier.textContent = 'Tier: ' + (cap.isEnhancedTier ? 'Enhanced' : 'Baseline');

        splash.appendChild(title);
        splash.appendChild(welcome);
        splash.appendChild(tier);
        root.appendChild(splash);
      }
    }
  });

  // Always intercept Back/Return — never let the TV OS terminate the app.
  // KEY_BACK = KEY_RETURN = 10009 (Samsung Tizen constant).
  document.addEventListener('keydown', function(e) {
    if (e.keyCode === 10009) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.hermesHandleBack === 'function') {
        window.hermesHandleBack();
      }
    }
  });
}());
