(function() {
  'use strict';

  /**
   * tizenAdapter.js — window.hermesAdapter
   *
   * Thin wrapper around Tizen-specific webapis and tizen.* APIs.
   * When webapis / tizen are not present (browser dev mode, Jest, etc.)
   * every method falls back to a safe no-op or logs a dev-mode message.
   *
   * SECURITY NOTE: Stream URLs passed to avplayOpen() originate from the
   * HermesTV backend (/api/commands), not from any client-side config.
   * The adapter accepts an opaque URL and passes it directly to AVPlay
   * without logging it.
   */

  var isOnTizen = (typeof tizen !== 'undefined') && (typeof webapis !== 'undefined');

  var adapter = {

    /** True when running inside a Tizen TV browser context. */
    isOnTizen: isOnTizen,

    /**
     * Returns the Samsung model code string (e.g. "QN85QN900B").
     * Returns empty string in dev/browser mode.
     * @returns {string}
     */
    getModelCode: function() {
      if (!isOnTizen) return '';
      try {
        return webapis.productinfo.getModel();
      } catch (e) {
        return '';
      }
    },

    /**
     * Returns the Tizen firmware/platform version string (e.g. "6.5").
     * Returns '0.0' in dev/browser mode or on capability query failure.
     * @returns {string}
     */
    getTizenVersion: function() {
      if (!isOnTizen) return '0.0';
      try {
        var info = tizen.systeminfo.getCapability(
          'http://tizen.org/feature/platform.version'
        );
        return info || '0.0';
      } catch (e) {
        return '0.0';
      }
    },

    /**
     * Asynchronously returns available system memory in MB.
     * Calls callback(0) in dev/browser mode or on query failure.
     * @param {function(number): void} callback
     */
    getAvailableMemoryMB: function(callback) {
      if (!isOnTizen) {
        callback(0);
        return;
      }
      try {
        tizen.systeminfo.getPropertyValue(
          'MEMORY',
          function(mem) {
            callback(mem ? Math.round(mem.available / 1024 / 1024) : 0);
          },
          function() {
            callback(0);
          }
        );
      } catch (e) {
        callback(0);
      }
    },

    /**
     * Registers a Tizen remote control key so keydown events are dispatched.
     * No-op in dev/browser mode.
     * @param {string} keyName  e.g. 'MediaPlayPause', 'ChannelUp'
     */
    registerKey: function(keyName) {
      if (!isOnTizen) return;
      try {
        tizen.tvinputdevice.registerKey(keyName);
      } catch (e) {
        // Silently ignore — key may already be registered or unsupported
      }
    },

    /**
     * Opens an AVPlay media source.
     * URL comes from the backend; never logged.
     * @param {string} url  Stream URL (opaque — do not log)
     */
    avplayOpen: function(url) {
      if (!isOnTizen) {
        // Dev mode: acknowledge the call without logging the URL
        console.log('[Adapter] AVPlay.open (dev mock):', url ? '[URL provided]' : 'no url');
        return;
      }
      webapis.avplay.open(url);
    },

    /**
     * Prepares AVPlay asynchronously after avplayOpen().
     * @param {function} successCb
     * @param {function} errorCb
     */
    avplayPrepareAsync: function(successCb, errorCb) {
      if (!isOnTizen) {
        if (successCb) successCb();
        return;
      }
      webapis.avplay.prepareAsync(successCb, errorCb);
    },

    /**
     * Starts AVPlay playback. Requires avplayPrepareAsync to have completed.
     */
    avplayPlay: function() {
      if (!isOnTizen) {
        console.log('[Adapter] AVPlay.play (dev mock)');
        return;
      }
      webapis.avplay.play();
    },

    /**
     * Stops AVPlay playback. Safe to call when already stopped.
     */
    avplayStop: function() {
      if (!isOnTizen) return;
      try {
        webapis.avplay.stop();
      } catch (e) {
        // Ignore — may already be stopped
      }
    },

    /**
     * Closes the AVPlay media source and releases resources.
     * Call after avplayStop() before opening a new source.
     */
    avplayClose: function() {
      if (!isOnTizen) return;
      try {
        webapis.avplay.close();
      } catch (e) {
        // Ignore — may already be closed
      }
    },

  };

  window.hermesAdapter = adapter;

}());
