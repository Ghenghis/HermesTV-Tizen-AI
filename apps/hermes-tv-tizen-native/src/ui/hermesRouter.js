(function() {
  'use strict';

  /**
   * hermesRouter.js — window.hermesRouter
   *
   * Boot handoff called from main.js after the 'profile:updated' event fires.
   * Receives the resolved profile object and capabilities map, then:
   *   1. Applies the active theme via hermesTheme.applyProfile()
   *   2. Stamps the layout class onto #app-root
   *   3. Mounts overlay modules (hermesOverlay, hermesStatsOverlay)
   *   4. Registers Tizen remote key events via the Tizen webapi
   *   5. Attaches the global keydown handler (D-pad + BACK)
   *   6. Fetches the channel list and renders the home screen root
   *
   * @param {Object} profile  Resolved profile from /api/profiles/:id
   * @param {Object} cap      Capability map from hermesCap (hermesCapabilities.js)
   */
  function hermesRouter(profile, cap) {
    if (!profile || !cap) return;

    var themeId  = profile.active_theme  || 'midnight_steel';
    var layoutId = profile.active_layout || 'classic_cable_grid';

    // 1. Apply theme
    if (window.hermesTheme) {
      window.hermesTheme.applyProfile(profile);
    }

    // 2. Apply layout class on #app-root
    var root = document.getElementById('app-root');
    if (root) {
      // Remove any previous layout-- class, then add the current one
      var classes = root.className.split(' ').filter(function(c) {
        return !c.startsWith('layout--');
      });
      classes.push('layout--' + layoutId);
      root.className = classes.join(' ').trim();
    }

    // 3. Mount overlay modules
    if (window.hermesOverlay && root) {
      window.hermesOverlay.mount(root);
    }
    if (window.hermesStatsOverlay && root) {
      window.hermesStatsOverlay.mount(root);
    }

    // 4. Register Tizen remote key events
    try {
      tizen.tvinputdevice.registerKey('MediaPlayPause');
      tizen.tvinputdevice.registerKey('MediaStop');
      tizen.tvinputdevice.registerKey('MediaFastForward');
      tizen.tvinputdevice.registerKey('MediaRewind');
      tizen.tvinputdevice.registerKey('ChannelUp');
      tizen.tvinputdevice.registerKey('ChannelDown');
      tizen.tvinputdevice.registerKey('ColorF0Red');
      tizen.tvinputdevice.registerKey('ColorF1Green');
      tizen.tvinputdevice.registerKey('ColorF2Yellow');
      tizen.tvinputdevice.registerKey('ColorF3Blue');
    } catch (e) {
      // Not on Tizen — dev/browser mode; key registration is a no-op
    }

    // 5. Global keydown handler
    document.addEventListener('keydown', function(e) {
      // D-pad / focus navigation handled first
      if (window.hermesFocus && window.hermesFocus.handleKey(e.keyCode)) {
        e.preventDefault();
        return;
      }
      // Screen-level handling
      if (window.hermesScreen) {
        if (e.keyCode === 10009) { // BACK
          e.preventDefault();
          window.hermesScreen.pop();
        }
      }
    });

    // 6. Load catalog and render home screen
    _loadHomeScreen(profile, cap);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  function _loadHomeScreen(profile, cap) {
    var api = window.hermesApi;
    if (!api) {
      // hermesApi not yet loaded — render with empty channel list
      _renderHomeRoot(profile, []);
      return;
    }

    api.getChannels(function(err, data) {
      // Channel rail render (B2 — placeholder for now)
      _renderHomeRoot(profile, data && data.channels ? data.channels : []);
    });
  }

  function _renderHomeRoot(profile, channels) {
    var root = document.getElementById('app-root');
    if (!root) return;

    // Clear placeholder boot splash
    root.innerHTML = '';

    // Top bar
    var topbar = document.createElement('div');
    topbar.className = 'region-topbar';

    var title = document.createElement('span');
    title.textContent = 'HermesTV — ' + (profile.display_name || profile.profile_id);
    title.style.fontSize = 'calc(20px * var(--font-scale, 1))';
    topbar.appendChild(title);
    root.appendChild(topbar);

    // Channel count info (placeholder until B2 channel rail component)
    var info = document.createElement('div');
    info.style.padding = '24px';
    info.style.color   = 'var(--text-secondary, #B7BDC6)';
    info.textContent   = channels.length + ' channels loaded. UI rendering in B2.';
    root.appendChild(info);

    // Register any focusable elements with hermesFocus
    if (window.hermesFocus) {
      var focusables = root.querySelectorAll('[tabindex]');
      window.hermesFocus.register(Array.prototype.slice.call(focusables), 'home');
    }
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  window.hermesRouter = hermesRouter;

}());
