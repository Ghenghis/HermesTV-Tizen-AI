/**
 * routes/tts.js — Azure TTS proxy endpoint
 *
 * The TV apps NEVER call Azure directly. This backend is the only caller of
 * the Azure Cognitive Services Speech SDK. The Azure API key stays server-side.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * B2 IMPLEMENTATION NOTES
 * ────────────────────────────────────────────────────────────────────────────
 * 1. Install:  npm install microsoft-cognitiveservices-speech-sdk
 * 2. Env vars: AZURE_TTS_KEY  (subscription key — NEVER log this)
 *              AZURE_TTS_REGION  (e.g. "eastus")
 * 3. Replace the 202 stub in POST /api/tts with:
 *
 *    const sdk = require('microsoft-cognitiveservices-speech-sdk');
 *    const config = sdk.SpeechConfig.fromSubscription(
 *      process.env.AZURE_TTS_KEY,   // never log
 *      process.env.AZURE_TTS_REGION
 *    );
 *    config.speechSynthesisOutputFormat =
 *      sdk.SpeechSynthesisOutputFormat.Audio24Khz96KBitRateMonoMp3;
 *    config.speechSynthesisVoiceName = selectedVoice;
 *
 *    const pull = sdk.AudioOutputStream.createPullStream();
 *    const audioConfig = sdk.AudioConfig.fromStreamOutput(pull);
 *    const synth = new sdk.SpeechSynthesizer(config, audioConfig);
 *
 *    synth.speakTextAsync(text, result => {
 *      if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
 *        res.setHeader('Content-Type', 'audio/mpeg');
 *        res.setHeader('X-Profile-Id', profile_id);
 *        res.setHeader('X-Voice', selectedVoice);
 *        res.send(Buffer.from(result.audioData));
 *      } else {
 *        res.status(502).json({ error: 'TTS synthesis failed', detail: result.errorDetails });
 *      }
 *      synth.close();
 *    }, err => {
 *      synth.close();
 *      res.status(502).json({ error: 'TTS synthesis error' });
 *    });
 *
 * 4. NEVER log process.env.AZURE_TTS_KEY anywhere in this file.
 * 5. Stream the MP3 buffer back; do not write it to disk.
 * ────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const express = require('express');
const router = express.Router();

// ── Voice configuration ───────────────────────────────────────────────────────
const PROFILE_VOICE_MAP = {
  dave_tv: 'en-US-GuyNeural',
  mom_tv:  'en-US-AriaNeural',
};

// Voices that may be requested via voice_override.
// Restrict to a short, known-safe allowlist to prevent SSML injection.
const ALLOWED_VOICE_OVERRIDE = new Set([
  'en-US-GuyNeural',
  'en-US-AriaNeural',
  'en-US-JennyNeural',
  'en-US-DavisNeural',
  'en-GB-RyanNeural',
  'en-GB-SoniaNeural',
  'en-AU-NatashaNeural',
  'en-AU-WilliamNeural',
]);

// ── Patterns that must never appear in the text payload ───────────────────────
// Prevents the TTS proxy from being used to exfiltrate credentials via audio.
const CREDENTIAL_PATTERN = /api[_\s\-]?key|password|secret|token/i;

// ── POST /api/tts ─────────────────────────────────────────────────────────────
router.post('/', function(req, res) {
  const { text, profile_id, voice_override } = req.body || {};

  // Validate text
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required and must be a non-empty string' });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'text exceeds maximum length of 500 characters', max: 500 });
  }

  // Credential guard on text content
  if (CREDENTIAL_PATTERN.test(text)) {
    return res.status(400).json({
      error: 'Text contains a forbidden pattern. Credential-like strings may not be synthesised.',
      code: 'TTS_CREDENTIAL_PATTERN_BLOCKED',
    });
  }

  // Validate profile_id
  if (!profile_id || !PROFILE_VOICE_MAP[profile_id]) {
    return res.status(400).json({
      error: 'profile_id must be one of: ' + Object.keys(PROFILE_VOICE_MAP).join(', '),
    });
  }

  // Resolve voice
  let selectedVoice = PROFILE_VOICE_MAP[profile_id];
  if (voice_override !== undefined && voice_override !== null) {
    if (!ALLOWED_VOICE_OVERRIDE.has(voice_override)) {
      return res.status(400).json({
        error: 'voice_override is not in the permitted allowlist',
        allowed: Array.from(ALLOWED_VOICE_OVERRIDE),
      });
    }
    selectedVoice = voice_override;
  }

  // B1 stub — Azure SDK integration pending B2
  return res.status(202).json({
    status:   'pending',
    message:  'Azure TTS integration pending B2. Install azure-cognitiveservices-speech package and set AZURE_TTS_KEY + AZURE_TTS_REGION env vars.',
    profile_id,
    voice:       selectedVoice,
    text_length: text.length,
  });
});

// ── GET /api/tts/voices ───────────────────────────────────────────────────────
router.get('/voices', function(req, res) {
  return res.status(200).json(PROFILE_VOICE_MAP);
});

module.exports = router;
