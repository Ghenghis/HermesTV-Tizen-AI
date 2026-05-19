'use strict';

import * as voicePrefStore from '../store/voicePrefStore.js';

// Production (https://tv.daveai.tech, with hermestv.daveai.tech as an
// additive alias) → same-origin (BASE_URL = '').
// Local dev / LAN mirror → cross-origin to the workstation API on :3001.
var BASE_URL = (function() {
  if (typeof window === 'undefined') return '';
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return 'http://' + h + ':3001';
  if (h === 'hermestv.local') return 'http://hermestv.local';
  return '';
})();

var currentAudio = null;

// Map an intent string to the per-profile pref flag that gates it.
// 'preview' is special — it always speaks (otherwise the volume preview
// button in the settings panel would be silent when chat is off, which
// would be confusing). 'unknown' / unmapped intents fall through to the
// master switch only.
function _intentGateOk(prefs, intent) {
  if (intent === 'preview') { return true; }
  if (intent === 'welcome' && prefs.welcome_greeting_enabled === false) { return false; }
  if (intent === 'chatbot_reply' && prefs.chatbot_reply_enabled === false) { return false; }
  if (intent === 'command_confirmation' && prefs.command_confirmation_enabled === false) { return false; }
  return true;
}

function _skippedReason(intent) {
  if (intent === 'welcome') { return 'welcome_off'; }
  if (intent === 'chatbot_reply') { return 'chat_off'; }
  if (intent === 'command_confirmation') { return 'cmd_off'; }
  return 'intent_off';
}

function listVoices() {
  return fetch(BASE_URL + '/api/tts/voices', { method: 'GET', headers: { 'Accept': 'application/json' } })
    .then(function(r) {
      if (!r.ok) throw new Error('Failed to load voices: HTTP ' + r.status);
      return r.json();
    });
}

function getProfileVoice(profileId) {
  return fetch(BASE_URL + '/api/tts/voice/' + encodeURIComponent(profileId), { method: 'GET' })
    .then(function(r) {
      if (!r.ok) throw new Error('Failed to load profile voice: HTTP ' + r.status);
      return r.json();
    });
}

function setProfileVoice(profileId, voiceId) {
  return fetch(BASE_URL + '/api/tts/voice/' + encodeURIComponent(profileId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_id: voiceId }),
  }).then(function(r) {
    if (!r.ok) {
      return r.json().then(function(err) { throw new Error(err.message || 'Failed to set voice'); });
    }
    return r.json();
  });
}

// speak — dual-signature for backwards compatibility.
//
//   Legacy (still used by App.jsx boot greeting + FloatingChatbot):
//     speak(text, profileId, voiceId?)
//
//   Granular (new — used by VoiceSettings + future intent-aware callers):
//     speak(text, { profile, intent, voiceId? })
//       profile: full profile object (so we can resolve audio_feedback +
//                preferred_voice_id defaults via voicePrefStore.getVoicePrefs)
//       intent:  'welcome' | 'chatbot_reply' | 'command_confirmation' |
//                'preview' | undefined
//
// When the options form is used, the per-profile prefs gate playback:
//   - master_enabled off                          → resolve { skipped: 'master_off' }
//   - intent flag off (e.g. welcome_greeting_off) → resolve { skipped: 'welcome_off' }
//   - volume                                      → applied to <audio>.volume
//
// The legacy form does NOT gate (callers like App.jsx already check
// profile.audio_feedback before invoking) so that this change is a pure
// extension — existing behaviour stays identical.
function speak(text, profileIdOrOpts, voiceIdLegacy) {
  if (!text) {
    return Promise.reject(new Error('text and profile_id are required'));
  }

  var profileId;
  var voiceId;
  var intent;
  var volume = null;

  if (typeof profileIdOrOpts === 'string') {
    // Legacy call form.
    profileId = profileIdOrOpts;
    voiceId = voiceIdLegacy;
  } else if (profileIdOrOpts && typeof profileIdOrOpts === 'object') {
    // Options form.
    var opts = profileIdOrOpts;
    var profile = opts.profile || {};
    profileId = profile.id;
    intent = opts.intent;
    if (!profileId) {
      return Promise.reject(new Error('text and profile_id are required'));
    }
    var prefs = voicePrefStore.getVoicePrefs(profile);
    if (!prefs.master_enabled) {
      return Promise.resolve({ played: false, skipped: 'master_off' });
    }
    if (!_intentGateOk(prefs, intent)) {
      return Promise.resolve({ played: false, skipped: _skippedReason(intent) });
    }
    voiceId = opts.voiceId || prefs.voice_id || undefined;
    if (typeof prefs.volume === 'number') {
      volume = Math.max(0, Math.min(1, prefs.volume / 100));
    }
  } else {
    return Promise.reject(new Error('text and profile_id are required'));
  }

  if (!profileId) {
    return Promise.reject(new Error('text and profile_id are required'));
  }

  stopSpeaking();

  var payload = { text: text, profile_id: profileId };
  if (voiceId) payload.voice_id = voiceId;

  return fetch(BASE_URL + '/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify(payload),
  }).then(function(r) {
    var contentType = r.headers.get('Content-Type') || '';
    if (contentType.indexOf('audio/') === 0) {
      return r.blob().then(function(blob) {
        var url = URL.createObjectURL(blob);
        var audio = new Audio(url);
        if (volume !== null) {
          try { audio.volume = volume; } catch (_) { /* clamped by element */ }
        }
        currentAudio = audio;
        audio.onended = function() { URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; };
        audio.onerror = function() { URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; };
        var p = audio.play();
        if (p && typeof p.then === 'function') {
          p.catch(function() { /* browser may block autoplay — silently ignore */ });
        }
        return { played: true, voice: r.headers.get('X-Voice') };
      });
    }
    return r.json().then(function(body) {
      return { played: false, status: body.status || 'no_audio', message: body.message || '' };
    });
  });
}

function stopSpeaking() {
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (_) {}
    currentAudio = null;
  }
}

function previewVoice(voiceId, sampleText, profileId) {
  return speak(sampleText, profileId || 'mom_tv', voiceId);
}

export { listVoices, getProfileVoice, setProfileVoice, speak, stopSpeaking, previewVoice };
