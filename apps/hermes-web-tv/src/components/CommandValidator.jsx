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
  'save_memory',
];

var VALID_PROFILE_IDS = ['dave_tv', 'mom_tv'];

// 26-char ULID-like: 01J... or similar — must be exactly 26 alphanumeric chars
var COMMAND_ID_PATTERN = /^[0-9A-Za-z]{26}$/;

function validateCommand(envelope) {
  var errors = [];

  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, errors: ['Command envelope must be an object'] };
  }

  if (envelope.schema !== 'hermestv.ui.v1') {
    errors.push('schema must be "hermestv.ui.v1", got: ' + envelope.schema);
  }

  if (!envelope.action || ALLOWED_ACTIONS.indexOf(envelope.action) === -1) {
    errors.push('action "' + envelope.action + '" is not in the allowed action list');
  }

  if (!envelope.profile_id || VALID_PROFILE_IDS.indexOf(envelope.profile_id) === -1) {
    errors.push('profile_id must be "dave_tv" or "mom_tv", got: ' + envelope.profile_id);
  }

  if (!envelope.command_id || !COMMAND_ID_PATTERN.test(envelope.command_id)) {
    errors.push('command_id must be a 26-character alphanumeric string');
  }

  if (errors.length > 0) {
    return { valid: false, errors: errors };
  }

  return { valid: true };
}

function generateCommandId() {
  // 26-char mock ID: timestamp base36 + random chars
  var ts = Date.now().toString(36).toUpperCase();
  var chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var random = '';
  var needed = 26 - ts.length;
  for (var i = 0; i < needed; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  var id = (ts + random).slice(0, 26);
  // Pad if needed
  while (id.length < 26) {
    id += '0';
  }
  return id;
}

export { validateCommand, generateCommandId, ALLOWED_ACTIONS };
