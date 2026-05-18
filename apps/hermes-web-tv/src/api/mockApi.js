import mockData from '../../mock/catalog.mock.json';

var VALID_PROFILE_IDS = ['dave_tv', 'mom_tv'];

function getProfile(profileId) {
  if (VALID_PROFILE_IDS.indexOf(profileId) === -1) {
    return Promise.reject(new Error('Invalid profile ID: ' + profileId));
  }
  var profiles = mockData.profiles || [];
  var found = null;
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].profile_id === profileId) {
      found = profiles[i];
      break;
    }
  }
  if (!found) {
    return Promise.reject(new Error('Profile not found in mock data: ' + profileId));
  }
  return Promise.resolve(Object.assign({}, found));
}

function getProviders() {
  return Promise.resolve((mockData.providers || []).slice());
}

function getCatalog() {
  return Promise.resolve((mockData.catalog || []).slice());
}

function getEpg(channelId) {
  return Promise.resolve({ status: 'mock', channelId: channelId, programs: [] });
}

// Local command table — mirrors the backend uiCommand.js patterns for offline use.
var OFFLINE_COMMANDS = [
  { patterns: ['show apollo', 'show apollo group'], action: 'filter_provider', params: { provider_id: 'apollo_group' } },
  { patterns: ['show xtremehd', 'show extreme'], action: 'filter_provider', params: { provider_id: 'xtremehd' } },
  { patterns: ['show all providers', 'show all'], action: 'filter_provider', params: { provider_id: 'all' } },
  { patterns: ['show movies'], action: 'filter_content', params: { content_type: 'movies' } },
  { patterns: ['show series', 'show tv shows'], action: 'filter_content', params: { content_type: 'series' } },
  { patterns: ['show live', 'live channels'], action: 'filter_content', params: { content_type: 'live' } },
  { patterns: ['show 4k', '4k only'], action: 'filter_quality', params: { quality: '4K' } },
  { patterns: ['mom mode', 'sherri mode'], action: 'switch_profile', params: { profile_id: 'mom_tv' } },
  { patterns: ['dave mode'], action: 'switch_profile', params: { profile_id: 'dave_tv' } },
  { patterns: ['bigger tiles', 'large tiles'], action: 'update_layout', params: { layout: 'mom_jumbo_rail' } },
  { patterns: ['dark theme', 'dark mode'], action: 'update_theme', params: { theme: 'night-blue' } },
  { patterns: ['light theme', 'light mode'], action: 'update_theme', params: { theme: 'mom-calm' } },
  { patterns: ['premium theme', 'cinema theme'], action: 'update_theme', params: { theme: 'cinema_amber' } },
  { patterns: ['low memory mode', 'performance mode'], action: 'update_motion', params: { density: 'off' } },
  { patterns: ['what is this'], action: 'show_detail', params: { target: 'focused_item' } },
  { patterns: ['find more with this actor', 'more with actor'], action: 'find_similar_actor', params: { target: 'focused_actor' } },
];

function validateCommand(payload) {
  var text = (payload && payload.command_text) ? payload.command_text.trim().toLowerCase() : '';
  if (!text) {
    return Promise.resolve({ valid: false, action: null, params: null, error: 'Command text is required.' });
  }
  for (var i = 0; i < OFFLINE_COMMANDS.length; i++) {
    var entry = OFFLINE_COMMANDS[i];
    for (var j = 0; j < entry.patterns.length; j++) {
      if (text === entry.patterns[j]) {
        return Promise.resolve({ valid: true, action: entry.action, params: entry.params, error: null });
      }
    }
  }
  return Promise.resolve({
    valid: false, action: null, params: null,
    error: 'Command not recognized. Try: show movies, mom mode, dark theme, show 4K',
  });
}

export { getProfile, getProviders, getCatalog, getEpg, validateCommand };
