import mockData from '../../mock/catalog.mock.json';

var VALID_PROFILE_IDS = ['dave_tv', 'mom_tv'];

var FALLBACK_PROFILES = {
  dave_tv: {
    profile_id: 'dave_tv', display_name: 'Dave', tv_model: 'UN55CU8000BXZA',
    tier: 'degraded', is_primary_target: false, mom_mode: false,
    active_layout: 'grid-standard', active_theme: 'night-blue',
    font_scale: 1.1, reduced_motion: false, audio_feedback: false,
    agent_name: 'Hermes', agent_voice: 'azure-en-us-guy-neural',
    display_size_inches: 55,
    quality_preference: { resolution_floor: '720p', prefer_4k: false, hdr_preferred: false, bitrate_floor_kbps: 2000 },
  },
  mom_tv: {
    profile_id: 'mom_tv', display_name: 'Sherri', tv_model: 'QN85Q7FAAFXZA',
    tier: 'enhanced', is_primary_target: true, mom_mode: true,
    active_layout: 'jumbo-rail', active_theme: 'mom-calm',
    font_scale: 1.35, reduced_motion: true, audio_feedback: true,
    agent_name: 'Hermes', agent_voice: 'azure-en-us-aria-neural',
    display_size_inches: 85,
    quality_preference: { resolution_floor: '1080p', prefer_4k: true, hdr_preferred: true, bitrate_floor_kbps: 4000 },
  },
};

function getProfile(profileId) {
  if (VALID_PROFILE_IDS.indexOf(profileId) === -1) {
    return Promise.reject(new Error('Invalid profile ID: ' + profileId));
  }
  var profiles = mockData.profiles || [];
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].profile_id === profileId) {
      return Promise.resolve(Object.assign({}, profiles[i]));
    }
  }
  if (FALLBACK_PROFILES[profileId]) {
    return Promise.resolve(Object.assign({}, FALLBACK_PROFILES[profileId]));
  }
  return Promise.reject(new Error('Profile not found: ' + profileId));
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

// ── Mock voice catalog (offline) ──────────────────────────────────────────────
var MOCK_VOICE_CATALOG = [
  { id: 'en-US-AriaNeural',  name: 'Aria (mock)',  gender: 'female', locale: 'en-US', tone: 'warm',     sample: 'Hi Sherri! Welcome back.' },
  { id: 'en-US-JennyNeural', name: 'Jenny (mock)', gender: 'female', locale: 'en-US', tone: 'friendly', sample: 'Hello! Ready to find a show?' },
  { id: 'en-US-GuyNeural',   name: 'Guy (mock)',   gender: 'male',   locale: 'en-US', tone: 'casual',   sample: 'Hey Dave, what are we watching?' },
];

function listVoices() {
  return Promise.resolve({
    voices: MOCK_VOICE_CATALOG,
    count: MOCK_VOICE_CATALOG.length,
    azure_configured: false,
    profile_defaults: { mom_tv: 'en-US-AriaNeural', dave_tv: 'en-US-GuyNeural' },
  });
}

function getProfileVoice(profileId) {
  var defaults = { mom_tv: 'en-US-AriaNeural', dave_tv: 'en-US-GuyNeural' };
  var vid = defaults[profileId] || 'en-US-AriaNeural';
  return Promise.resolve({ profile_id: profileId, voice_id: vid, voice: MOCK_VOICE_CATALOG.find(function(v) { return v.id === vid; }) || null });
}

function setProfileVoice(profileId, voiceId) {
  return Promise.resolve({ profile_id: profileId, voice_id: voiceId });
}

function speakStub(text, profileId, voiceId) {
  return Promise.resolve({ played: false, status: 'mock_mode', message: 'Mock mode — speech disabled offline.' });
}

// ── Mock pairing (offline) ────────────────────────────────────────────────
// Offline = no backend. The QR modal still shows a code so the UX shape is
// honest. createPairing returns a stable mock; getPairingStatus always
// reports 'pending' (the user can scan all they want — there's nothing to
// complete the handshake against).
var MOCK_PAIRING_TTL_MS = 10 * 60 * 1000;

function createPairing() {
  var now = new Date();
  return Promise.resolve({
    pairing_code: 'HRM-MOCK',
    status: 'pending',
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + MOCK_PAIRING_TTL_MS).toISOString(),
    ttl_ms: MOCK_PAIRING_TTL_MS,
    mock: true,
  });
}

function getPairingStatus(code) {
  return Promise.resolve({
    pairing_code: code || 'HRM-MOCK',
    status: 'pending',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + MOCK_PAIRING_TTL_MS).toISOString(),
    mock: true,
  });
}

export {
  getProfile, getProviders, getCatalog, getEpg, validateCommand,
  listVoices, getProfileVoice, setProfileVoice, speakStub,
  createPairing, getPairingStatus,
};
