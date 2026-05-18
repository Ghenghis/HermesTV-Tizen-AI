// HermesTV Command Router — validated JSON command client.
// Wraps window.hermesApi.sendCommand() with allowlist validation, command ID generation,
// and CustomEvent emission. Never stores credentials in the command log.
(function() {
  'use strict';

  var ALLOWED_ACTIONS = [
    'update_layout',
    'update_theme',
    'update_background',
    'update_font_scale',
    'update_motion_density',
    'update_audio_feedback',
    'update_agent_name',
    'update_display_name',
    'update_preferred_provider',
    'update_quality_filter',
    'show_notification',
    'show_action_card',
    'dismiss_overlay',
    'recall_memory',
    'save_memory'
  ];

  var VALID_PROFILE_IDS = ['dave_tv', 'mom_tv'];

  // Credential field names stripped from the log before storage.
  var CREDENTIAL_FIELDS = ['password', 'api_key', 'secret', 'token', 'auth', 'credential'];

  // Rolling log of last 100 sent commands (credential-stripped).
  var _log = [];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // 26-character alphanumeric command ID (a-z0-9).
  function _generateCommandId() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var id = '';
    for (var i = 0; i < 26; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  // Strip any top-level params fields that look like credentials.
  function _sanitizeForLog(params) {
    if (!params || typeof params !== 'object') return params;
    var safe = {};
    Object.keys(params).forEach(function(k) {
      var lower = k.toLowerCase();
      var isCredential = CREDENTIAL_FIELDS.some(function(cf) {
        return lower.indexOf(cf) !== -1;
      });
      safe[k] = isCredential ? '[REDACTED]' : params[k];
    });
    return safe;
  }

  function _emitEvent(name, detail) {
    var ev;
    try {
      ev = new CustomEvent(name, { bubbles: true, cancelable: false, detail: detail });
    } catch (e) {
      // Tizen 6.5 / Chromium 76 supports CustomEvent constructor, but guard anyway.
      ev = document.createEvent('CustomEvent');
      ev.initCustomEvent(name, true, false, detail);
    }
    document.dispatchEvent(ev);
  }

  function _appendLog(entry) {
    _log.push(entry);
    if (_log.length > 100) {
      _log.shift();
    }
  }

  // ---------------------------------------------------------------------------
  // Core send
  // ---------------------------------------------------------------------------

  function _doSend(profileId, action, params, dryRun, callback) {
    // --- Validate profileId ---
    if (VALID_PROFILE_IDS.indexOf(profileId) === -1) {
      var pidErr = new Error('[commandRouter] Invalid profileId: ' + profileId);
      _emitEvent('hermes:command:rejected', {
        reason: 'invalid_profile_id',
        profileId: profileId,
        action: action
      });
      if (typeof callback === 'function') callback(pidErr, null);
      return;
    }

    // --- Validate action ---
    if (ALLOWED_ACTIONS.indexOf(action) === -1) {
      var actErr = new Error('[commandRouter] Action not in allowlist: ' + action);
      _emitEvent('hermes:command:rejected', {
        reason: 'action_not_allowed',
        profileId: profileId,
        action: action
      });
      if (typeof callback === 'function') callback(actErr, null);
      return;
    }

    var commandId = _generateCommandId();
    var cmd = {
      command_id: commandId,
      profile_id: profileId,
      action: action,
      params: params || {}
    };

    if (dryRun) {
      cmd.dry_run = true;
    }

    // Log before sending (stripped of credentials).
    var logEntry = {
      command_id: commandId,
      profile_id: profileId,
      action: action,
      params: _sanitizeForLog(params),
      dry_run: dryRun || false,
      sent_at: Date.now()
    };
    _appendLog(logEntry);

    _emitEvent('hermes:command:sent', {
      command_id: commandId,
      profile_id: profileId,
      action: action,
      dry_run: dryRun || false
    });

    if (!window.hermesApi || typeof window.hermesApi.sendCommand !== 'function') {
      var apiErr = new Error('[commandRouter] window.hermesApi.sendCommand not available');
      if (typeof callback === 'function') callback(apiErr, null);
      return;
    }

    window.hermesApi.sendCommand(cmd, function(err, response) {
      if (typeof callback === 'function') callback(err, response);
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  var commandRouter = {
    send: function(profileId, action, params, callback) {
      _doSend(profileId, action, params, false, callback);
    },

    dryRun: function(profileId, action, params, callback) {
      _doSend(profileId, action, params, true, callback);
    },

    getLog: function() {
      // Return a shallow copy to prevent external mutation.
      return _log.slice();
    }
  };

  window.hermesCommandRouter = commandRouter;
}());
