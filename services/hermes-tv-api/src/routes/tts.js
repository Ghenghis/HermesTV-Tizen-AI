'use strict';

const express = require('express');
const router = express.Router();

// ── Voice catalog ─────────────────────────────────────────────────────────────
// Curated, Mom-friendly voices. Each entry has display name, gender, locale,
// and a short sample line used by the GET /voices preview UI.
const VOICE_CATALOG = [
  { id: 'en-US-AriaNeural',    name: 'Aria',    gender: 'female', locale: 'en-US', tone: 'warm',       sample: 'Hi Sherri! What would you like to watch tonight?' },
  { id: 'en-US-JennyNeural',   name: 'Jenny',   gender: 'female', locale: 'en-US', tone: 'friendly',   sample: 'Hello! I am here to help you find something great.' },
  { id: 'en-US-SaraNeural',    name: 'Sara',    gender: 'female', locale: 'en-US', tone: 'cheerful',   sample: 'Movie night! Let me know what mood you are in.' },
  { id: 'en-US-NancyNeural',   name: 'Nancy',   gender: 'female', locale: 'en-US', tone: 'calm',       sample: 'Just relax. I will queue something nice for you.' },
  { id: 'en-US-AmberNeural',   name: 'Amber',   gender: 'female', locale: 'en-US', tone: 'confident',  sample: 'Ready when you are. Pick a category to begin.' },
  { id: 'en-US-AshleyNeural',  name: 'Ashley',  gender: 'female', locale: 'en-US', tone: 'gentle',     sample: 'Whenever you are ready, I am right here.' },
  { id: 'en-GB-SoniaNeural',   name: 'Sonia',   gender: 'female', locale: 'en-GB', tone: 'british',    sample: 'Good evening. Shall we look at the films?' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha', gender: 'female', locale: 'en-AU', tone: 'australian', sample: 'G\'day! Which channel takes your fancy?' },
  { id: 'en-US-GuyNeural',     name: 'Guy',     gender: 'male',   locale: 'en-US', tone: 'casual',     sample: 'Hey Dave, what are we watching?' },
  { id: 'en-US-DavisNeural',   name: 'Davis',   gender: 'male',   locale: 'en-US', tone: 'professional', sample: 'Good evening. Your library is ready.' },
  { id: 'en-US-TonyNeural',    name: 'Tony',    gender: 'male',   locale: 'en-US', tone: 'energetic',  sample: 'Movie night! Lets find a winner.' },
  { id: 'en-GB-RyanNeural',    name: 'Ryan',    gender: 'male',   locale: 'en-GB', tone: 'british',    sample: 'Right then, what is on tonight?' },
];

const VOICE_IDS = new Set(VOICE_CATALOG.map(v => v.id));

const PROFILE_DEFAULT_VOICE = {
  mom_tv:  'en-US-AriaNeural',
  dave_tv: 'en-US-GuyNeural',
};

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
  return !!(process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION);
}

// ── GET /api/tts/voices ──────────────────────────────────────────────────────
router.get('/api/tts/voices', (req, res) => {
  res.json({
    voices: VOICE_CATALOG,
    count: VOICE_CATALOG.length,
    azure_configured: azureConfigured(),
    profile_defaults: PROFILE_DEFAULT_VOICE,
  });
});

// ── GET /api/tts/voice/:profile_id ────────────────────────────────────────────
router.get('/api/tts/voice/:profile_id', (req, res) => {
  const pid = req.params.profile_id;
  const voiceId = PROFILE_VOICE_OVERRIDES[pid] || PROFILE_DEFAULT_VOICE[pid] || PROFILE_DEFAULT_VOICE.mom_tv;
  const voice = VOICE_CATALOG.find(v => v.id === voiceId);
  res.json({ profile_id: pid, voice_id: voiceId, voice: voice || null });
});

// ── PATCH /api/tts/voice/:profile_id  body: { voice_id } ─────────────────────
router.patch('/api/tts/voice/:profile_id', (req, res) => {
  const pid = req.params.profile_id;
  const body = req.body || {};
  if (!body.voice_id || !VOICE_IDS.has(body.voice_id)) {
    return res.status(400).json({
      error: 'invalid_voice_id',
      message: 'voice_id must be one of the catalog IDs from GET /api/tts/voices.',
      allowed: Array.from(VOICE_IDS),
    });
  }
  PROFILE_VOICE_OVERRIDES[pid] = body.voice_id;
  const voice = VOICE_CATALOG.find(v => v.id === body.voice_id);
  res.json({ profile_id: pid, voice_id: body.voice_id, voice: voice });
});

// ── POST /api/tts/speak  body: { text, profile_id, voice_id? } ───────────────
router.post('/api/tts/speak', (req, res) => {
  const body = req.body || {};
  const text = body.text;
  const profileId = body.profile_id;
  const voiceOverride = body.voice_id;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required and must be a non-empty string' });
  }
  if (text.length > 800) {
    return res.status(400).json({ error: 'text exceeds maximum length of 800 characters', max: 800 });
  }
  if (CREDENTIAL_PATTERN.test(text)) {
    return res.status(400).json({
      error: 'Text contains a forbidden pattern. Credential-like strings may not be synthesised.',
      code: 'TTS_CREDENTIAL_PATTERN_BLOCKED',
    });
  }
  if (!profileId) {
    return res.status(400).json({ error: 'profile_id is required' });
  }

  let selectedVoice = PROFILE_VOICE_OVERRIDES[profileId] || PROFILE_DEFAULT_VOICE[profileId] || PROFILE_DEFAULT_VOICE.mom_tv;
  if (voiceOverride !== undefined && voiceOverride !== null) {
    if (!VOICE_IDS.has(voiceOverride)) {
      return res.status(400).json({
        error: 'voice_id is not in the permitted catalog',
        allowed: Array.from(VOICE_IDS),
      });
    }
    selectedVoice = voiceOverride;
  }

  if (!azureConfigured()) {
    return res.status(202).json({
      status: 'azure_not_configured',
      message: 'Set AZURE_TTS_KEY and AZURE_TTS_REGION on the server to enable speech synthesis. Returning a stub for development.',
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
    const config = sdk.SpeechConfig.fromSubscription(process.env.AZURE_TTS_KEY, process.env.AZURE_TTS_REGION);
    config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;
    config.speechSynthesisVoiceName = selectedVoice;

    const synth = new sdk.SpeechSynthesizer(config, null);
    synth.speakTextAsync(
      text,
      result => {
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Voice', selectedVoice);
          res.setHeader('X-Profile-Id', profileId);
          res.send(Buffer.from(result.audioData));
        } else {
          res.status(502).json({ error: 'TTS synthesis failed', detail: result.errorDetails || 'unknown' });
        }
        synth.close();
      },
      err => {
        synth.close();
        res.status(502).json({ error: 'TTS synthesis error', detail: String(err) });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'tts_internal_error', detail: err.message });
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
