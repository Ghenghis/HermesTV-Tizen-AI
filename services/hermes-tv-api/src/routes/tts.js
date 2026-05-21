'use strict';

const express = require('express');
const azureVoices = require('../lib/azureVoices');
const router = express.Router();

// ── Voice catalog ─────────────────────────────────────────────────────────────
// The 12 hand-curated Mom-friendly voices live in lib/azureVoices.js. The full
// English-only Azure catalog (~99-110 voices) is fetched live and cached for
// 24h by that module. We keep a local reference to the curated list here for
// the dev fallback (when AZURE_TTS_KEY is missing) and for the voice_id
// allowlist used by /speak when the live catalog has not finished loading yet.
const VOICE_CATALOG = azureVoices.CURATED_VOICES;

const PROFILE_DEFAULT_VOICE = {
  mom_tv:  'en-US-AriaNeural',
  dave_tv: 'en-US-GuyNeural',
};

// Resolve a voice id to the live English catalog (Promise) so the /speak
// allowlist tracks whatever Azure currently offers. Falls back to the
// 12 curated voices when Azure is unreachable.
function isVoiceAllowed(voiceId) {
  return azureVoices.getAllVoices().then(function(result) {
    for (let i = 0; i < result.voices.length; i++) {
      if (result.voices[i].id === voiceId) return true;
    }
    // Defensive: also accept any curated voice in case the live catalog
    // failed to load and we have not yet warmed the curated fallback.
    return azureVoices.isCurated(voiceId);
  });
}

// ── In-memory profile voice overrides (B2 — replace with profile store later) ─
const PROFILE_VOICE_OVERRIDES = {};

// ── Patterns that must never appear in TTS payload ────────────────────────────
const CREDENTIAL_PATTERN = /api[_\s\-]?key|password|secret|token|bearer\s/i;

// ── Lazy Azure SDK loader — keeps server boot fast if SDK not installed ──────
let sdkInstance = null;
function loadAzureSdk() {
  if (sdkInstance !== null) return sdkInstance;
  try {
    sdkInstance = require('microsoft-cognitiveservices-speech-sdk');
    return sdkInstance;
  } catch (e) {
    sdkInstance = false;
    return false;
  }
}

function azureConfigured() {
  const config = azureVoices.azureSpeechConfig();
  return !!(config.key && config.region);
}

// ── GET /api/tts/voices ──────────────────────────────────────────────────────
// Returns the live English-only Azure catalog (~99-110 voices) when AZURE_TTS_KEY
// is configured, otherwise the 12 curated fallback voices. The `source` field
// lets the UI tell apart 'azure_live' (real catalog) from 'fallback_curated'
// (dev / Azure unreachable).
router.get('/api/tts/voices', async (req, res) => {
  try {
    const result = await azureVoices.getAllVoices();
    res.json({
      voices: result.voices,
      count: result.voices.length,
      source: result.source,
      cached_at: result.cachedAt,
      azure_configured: azureConfigured(),
      profile_defaults: PROFILE_DEFAULT_VOICE,
    });
  } catch (e) {
    // Last-ditch — getAllVoices already swallows its own errors, but be
    // defensive so a bug never bricks the picker UI.
    res.json({
      voices: VOICE_CATALOG,
      count: VOICE_CATALOG.length,
      source: 'fallback_curated_on_error',
      azure_configured: azureConfigured(),
      profile_defaults: PROFILE_DEFAULT_VOICE,
    });
  }
});

// ── GET /api/tts/voice/:profile_id ────────────────────────────────────────────
router.get('/api/tts/voice/:profile_id', async (req, res) => {
  const pid = req.params.profile_id;
  const voiceId = PROFILE_VOICE_OVERRIDES[pid] || PROFILE_DEFAULT_VOICE[pid] || PROFILE_DEFAULT_VOICE.mom_tv;
  let voice = null;
  try {
    voice = await azureVoices.getVoiceById(voiceId);
  } catch (_) { /* fall through to curated */ }
  if (!voice) {
    voice = VOICE_CATALOG.find(v => v.id === voiceId) || null;
  }
  res.json({ profile_id: pid, voice_id: voiceId, voice: voice });
});

// ── PATCH /api/tts/voice/:profile_id  body: { voice_id } ─────────────────────
router.patch('/api/tts/voice/:profile_id', async (req, res) => {
  const pid = req.params.profile_id;
  const body = req.body || {};
  if (!body.voice_id || typeof body.voice_id !== 'string') {
    return res.status(400).json({
      error: 'invalid_voice_id',
      message: 'voice_id is required and must be a string from GET /api/tts/voices.',
    });
  }
  const allowed = await isVoiceAllowed(body.voice_id);
  if (!allowed) {
    return res.status(400).json({
      error: 'invalid_voice_id',
      message: 'voice_id must be one of the catalog IDs from GET /api/tts/voices.',
    });
  }
  PROFILE_VOICE_OVERRIDES[pid] = body.voice_id;
  let voice = null;
  try {
    voice = await azureVoices.getVoiceById(body.voice_id);
  } catch (_) { /* fall through */ }
  if (!voice) {
    voice = VOICE_CATALOG.find(v => v.id === body.voice_id) || null;
  }
  res.json({ profile_id: pid, voice_id: body.voice_id, voice: voice });
});

// ── POST /api/tts/speak  body: { text, profile_id, voice_id? } ───────────────
router.post('/api/tts/speak', async (req, res) => {
  const body = req.body || {};
  const text = body.text;
  const profileId = body.profile_id;
  const voiceOverride = body.voice_id;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'text is required and must be a non-empty string',
    });
  }
  if (text.length > 800) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'text exceeds maximum length of 800 characters',
      max: 800,
    });
  }
  if (CREDENTIAL_PATTERN.test(text)) {
    return res.status(400).json({
      error: 'credential_pattern_blocked',
      message: 'Text contains a forbidden pattern. Credential-like strings may not be synthesised.',
      code: 'TTS_CREDENTIAL_PATTERN_BLOCKED',
    });
  }
  if (!profileId) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required',
    });
  }

  let selectedVoice = PROFILE_VOICE_OVERRIDES[profileId] || PROFILE_DEFAULT_VOICE[profileId] || PROFILE_DEFAULT_VOICE.mom_tv;
  if (voiceOverride !== undefined && voiceOverride !== null) {
    const allowed = await isVoiceAllowed(voiceOverride);
    if (!allowed) {
      return res.status(400).json({
        error: 'invalid_voice_id',
        message: 'voice_id is not in the permitted catalog',
      });
    }
    selectedVoice = voiceOverride;
  }

  if (!azureConfigured()) {
    // Stub response when the Azure subscription credentials are not set on the
    // server. The credentialGuard middleware (middleware/credentialGuard.js)
    // strips any response body that mentions the env-var name literally, so we
    // describe what is missing without naming the env vars — the operator-
    // facing docs in README explain the exact key/region variable names.
    return res.status(202).json({
      status: 'azure_not_configured',
      message: 'TTS unconfigured: server is missing the Azure Speech subscription credentials. See README for setup.',
      voice: selectedVoice,
      profile_id: profileId,
      text_length: text.length,
    });
  }

  const sdk = loadAzureSdk();
  if (!sdk) {
    return res.status(503).json({
      status: 'sdk_missing',
      message: 'microsoft-cognitiveservices-speech-sdk is not installed on the server. Run: npm install microsoft-cognitiveservices-speech-sdk',
    });
  }

  try {
    const speechConfig = azureVoices.azureSpeechConfig();
    const config = sdk.SpeechConfig.fromSubscription(speechConfig.key, speechConfig.region);
    config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;
    config.speechSynthesisVoiceName = selectedVoice;

    const synth = new sdk.SpeechSynthesizer(config, null);

    // Guard against the Azure SDK firing BOTH the success and error callbacks
    // (rare but observed in the wild). Without this, the second invocation
    // would call res.send / res.json after the response has already finished
    // and crash the process with "Cannot set headers after they are sent."
    // See audit W3-A1 for the race-condition writeup.
    let responded = false;
    function safeRespond(fn) {
      if (responded) { return; }
      responded = true;
      try { fn(); } catch (_) { /* response already detached; swallow */ }
    }

    synth.speakTextAsync(
      text,
      result => {
        safeRespond(function() {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Voice', selectedVoice);
            res.setHeader('X-Profile-Id', profileId);
            res.send(Buffer.from(result.audioData));
          } else {
            // Don't leak Azure's raw errorDetails to the client — could contain
            // SDK internal state. Surface a stable code instead. (Audit W3-A4.)
            res.status(502).json({
              error: 'tts_synthesis_failed',
              code: (result && result.errorCode) ? String(result.errorCode) : 'unknown',
            });
          }
        });
        try { synth.close(); } catch (_) { /* idempotent */ }
      },
      err => {
        safeRespond(function() {
          // Same — don't echo the SDK error string back; it may include the
          // key in pathological cases (Azure SDK has been known to do this).
          var code = (err && err.code) ? String(err.code) : 'unknown';
          res.status(502).json({ error: 'tts_synthesis_error', code: code });
        });
        try { synth.close(); } catch (_) { /* idempotent */ }
      }
    );
  } catch (err) {
    // Stable error code for sync failures (e.g. SpeechConfig.fromSubscription
    // refuses an empty key). Don't echo err.message — could leak.
    res.status(500).json({ error: 'tts_internal_error', code: (err && err.code) ? String(err.code) : 'init_failed' });
  }
});

// ── Backwards-compat aliases (do not remove) ──────────────────────────────────
router.post('/api/tts', (req, res) => {
  req.url = '/api/tts/speak';
  router.handle(req, res, () => {});
});
router.get('/api/tts', (req, res) => {
  req.url = '/api/tts/voices';
  router.handle(req, res, () => {});
});

module.exports = router;
