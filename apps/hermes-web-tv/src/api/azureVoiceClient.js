'use strict';

// Production (https://hermestv.daveai.tech) → same-origin (BASE_URL = '').
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

function speak(text, profileId, voiceId) {
  if (!text || !profileId) {
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
