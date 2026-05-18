// commandMatchers.js — local command pattern table, mirrors services/hermes-tv-api/src/routes/uiCommand.js
// Used by mockApi.validateCommand for offline command resolution.
// When the backend command table changes, update this file to match.

var OFFLINE_COMMAND_TABLE = [
  // --- Provider filters ---
  { patterns: ['show apollo', 'show apollo group'], action: 'filter_provider', params: { provider_id: 'apollo_group' } },
  { patterns: ['show xtremehd', 'show extreme'], action: 'filter_provider', params: { provider_id: 'xtremehd' } },
  { patterns: ['show all providers', 'show all'], action: 'filter_provider', params: { provider_id: 'all' } },
  // --- Content type filters ---
  { patterns: ['show movies'], action: 'filter_content', params: { content_type: 'movies' } },
  { patterns: ['show series', 'show tv shows'], action: 'filter_content', params: { content_type: 'series' } },
  { patterns: ['show live', 'live channels'], action: 'filter_content', params: { content_type: 'live' } },
  { patterns: ['show sports', 'sports channels'], action: 'filter_content', params: { content_type: 'sports' } },
  { patterns: ['show action', 'show action movies'], action: 'filter_content', params: { content_type: 'action' } },
  { patterns: ['show family', 'family movies'], action: 'filter_content', params: { content_type: 'family' } },
  { patterns: ['show mysteries', 'show mystery'], action: 'filter_content', params: { content_type: 'mysteries' } },
  { patterns: ['show hallmark', 'hallmark channel'], action: 'filter_content', params: { content_type: 'hallmark' } },
  // --- Quality filter ---
  { patterns: ['show 4k', '4k only'], action: 'filter_quality', params: { quality: '4K' } },
  // --- Profile switch ---
  { patterns: ['mom mode', 'sherri mode'], action: 'switch_profile', params: { profile_id: 'mom_tv' } },
  { patterns: ['dave mode'], action: 'switch_profile', params: { profile_id: 'dave_tv' } },
  // --- Layout ---
  { patterns: ['bigger tiles', 'large tiles'], action: 'update_layout', params: { layout: 'mom_jumbo_rail' } },
  // --- Theme ---
  { patterns: ['dark theme', 'dark mode'], action: 'update_theme', params: { theme: 'night-blue' } },
  { patterns: ['light theme', 'light mode'], action: 'update_theme', params: { theme: 'mom-calm' } },
  { patterns: ['premium theme', 'cinema theme'], action: 'update_theme', params: { theme: 'cinema_amber' } },
  // --- Motion ---
  { patterns: ['low memory mode', 'performance mode'], action: 'update_motion', params: { density: 'off' } },
  // --- Reset ---
  { patterns: ['reset filters', 'clear filters', 'show everything'], action: 'reset_filters', params: {} },
  // --- Detail ---
  { patterns: ['what is this'], action: 'show_detail', params: { target: 'focused_item' } },
  { patterns: ['find more with this actor', 'more with actor'], action: 'find_similar_actor', params: { target: 'focused_actor' } },
];

var NO_MATCH_ERROR = 'Command not recognized. Try: show movies, mom mode, dark theme, show 4K, show sports, reset filters';

function resolveOfflineCommand(commandText) {
  var normalised = (commandText || '').trim().toLowerCase();
  for (var i = 0; i < OFFLINE_COMMAND_TABLE.length; i++) {
    var entry = OFFLINE_COMMAND_TABLE[i];
    for (var j = 0; j < entry.patterns.length; j++) {
      if (normalised === entry.patterns[j]) {
        return { valid: true, action: entry.action, params: entry.params, error: null };
      }
    }
  }
  return { valid: false, action: null, params: null, error: NO_MATCH_ERROR };
}

export { OFFLINE_COMMAND_TABLE, NO_MATCH_ERROR, resolveOfflineCommand };
