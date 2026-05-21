'use strict';

const { Router } = require('express');
const router = Router();

const VALID_PROFILES = ['dave_tv', 'mom_tv'];

// Mom Mode floor: font_scale must never drop below this for mom_tv
const MOM_FONT_SCALE_FLOOR = 1.25;

// Default TV-safe profile objects — no credentials, no stream URLs, no tokens
const PROFILES = {
  dave_tv: {
    profile_id: 'dave_tv',
    display_name: 'Dave',
    tv_model: 'UN55CU8000BXZA',
    tier: 'degraded',
    is_primary_target: false,
    mom_mode: false,
    active_layout: 'grid-standard',
    active_theme: 'night-blue',
    font_scale: 1.1,
    reduced_motion: false,
    audio_feedback: false,
    agent_name: 'DaveTV',
    agent_voice: 'azure-en-us-guy-neural',
    display_size_inches: 55,
    quality_preference: {
      resolution_floor: '720p',
      prefer_4k: false,
      hdr_preferred: false,
      bitrate_floor_kbps: 2000,
    },
  },
  mom_tv: {
    profile_id: 'mom_tv',
    display_name: 'Sherri',
    tv_model: 'QN85Q7FAAFXZA',
    tier: 'enhanced',
    is_primary_target: true,
    mom_mode: true,
    active_layout: 'jumbo-rail',
    active_theme: 'mom-calm',
    font_scale: 1.35,
    reduced_motion: true,
    audio_feedback: true,
    agent_name: 'DaveTV',
    agent_voice: 'azure-en-us-aria-neural',
    display_size_inches: 85,
    quality_preference: {
      resolution_floor: '1080p',
      prefer_4k: true,
      hdr_preferred: true,
      bitrate_floor_kbps: 4000,
    },
  },
};

// In-memory store (resets to defaults on restart — no DB yet)
const profileStore = {
  dave_tv: { ...PROFILES.dave_tv },
  mom_tv: { ...PROFILES.mom_tv },
};

// GET /api/profiles — list all profiles (TV-safe metadata only)
router.get('/api/profiles', (req, res) => {
  res.json({
    profiles: VALID_PROFILES.map((id) => profileStore[id]),
    total: VALID_PROFILES.length,
  });
});

// GET /api/profile/:id
router.get('/api/profile/:id', (req, res) => {
  const { id } = req.params;

  if (!VALID_PROFILES.includes(id)) {
    return res.status(404).json({
      error: 'not_found',
      message: `Profile '${id}' does not exist. Valid profiles: dave_tv, mom_tv`,
    });
  }

  res.json(profileStore[id]);
});

// Fields the management modal is allowed to update via PATCH. Anything not in
// this list is silently dropped before merge so a stray field from a future
// client build can't corrupt the in-memory record. Kept centralized so the
// /api/profile/:id and /api/profiles/:id handlers stay in lockstep.
const PATCHABLE_FIELDS = [
  'display_name',
  'agent_name',
  'preferred_voice_id',
  'agent_voice',          // legacy alias used by dvr/tts callers
  'font_scale',
  'audio_feedback',
  'reduced_motion',
  'active_theme',
  'active_layout',
  'nickname',
  'avatar_emoji',
  'tier_override',
  'display_size_inches',
  'quality_preference',
];

function applyProfilePatch(id, updates, res) {
  if (!VALID_PROFILES.includes(id)) {
    return res.status(404).json({
      error: 'not_found',
      message: `Profile '${id}' does not exist. Valid profiles: dave_tv, mom_tv`,
    });
  }

  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Request body must be a JSON object',
    });
  }

  // Validate Mom Mode font_scale floor
  if (id === 'mom_tv' && updates.font_scale !== undefined) {
    if (typeof updates.font_scale !== 'number') {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'font_scale must be a number',
      });
    }
    if (updates.font_scale < MOM_FONT_SCALE_FLOOR) {
      return res.status(400).json({
        error: 'mom_mode_floor_violation',
        message: `Mom Mode requires font_scale >= ${MOM_FONT_SCALE_FLOOR}. Requested: ${updates.font_scale}`,
        floor: MOM_FONT_SCALE_FLOOR,
      });
    }
  }

  // Validate display_name when present — non-empty trimmed string, <= 30 chars
  if (updates.display_name !== undefined) {
    if (typeof updates.display_name !== 'string') {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'display_name must be a string',
      });
    }
    const trimmed = updates.display_name.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'display_name cannot be empty',
      });
    }
    if (trimmed.length > 30) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'display_name must be 30 characters or fewer',
      });
    }
    updates.display_name = trimmed;
  }

  // Validate agent_name when present — string, <= 30 chars. Empty falls back
  // to default 'DaveTV' on the server so the client stays simple.
  if (updates.agent_name !== undefined) {
    if (typeof updates.agent_name !== 'string') {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'agent_name must be a string',
      });
    }
    const trimmedAgent = updates.agent_name.trim();
    if (trimmedAgent.length > 30) {
      return res.status(400).json({
        error: 'validation_failed',
        message: 'agent_name must be 30 characters or fewer',
      });
    }
    updates.agent_name = trimmedAgent.length === 0 || trimmedAgent.toLowerCase() === 'hermes'
      ? 'DaveTV'
      : trimmedAgent;
  }

  // Guard: never allow overwriting protected identity fields via PATCH
  const PROTECTED = ['profile_id', 'tv_model', 'tier', 'mom_mode'];
  for (const key of PROTECTED) {
    if (key in updates) {
      return res.status(400).json({
        error: 'validation_failed',
        message: `Field '${key}' is read-only and cannot be updated via PATCH`,
      });
    }
  }

  // Drop anything not in the allowlist BEFORE merging so unknown fields can't
  // pollute the in-memory record. This is a defense-in-depth check — the UI
  // already sends only allowlisted keys, but a future client build or a
  // hand-crafted curl shouldn't be able to slip arbitrary data through.
  const filtered = {};
  for (const key of Object.keys(updates)) {
    if (PATCHABLE_FIELDS.indexOf(key) !== -1) {
      filtered[key] = updates[key];
    }
  }

  // Apply partial update in-memory
  profileStore[id] = { ...profileStore[id], ...filtered };

  return res.json(profileStore[id]);
}

// PATCH /api/profile/:id — singular form, retained for v0 callers.
router.patch('/api/profile/:id', (req, res) => {
  return applyProfilePatch(req.params.id, req.body, res);
});

// PATCH /api/profiles/:id — plural form, used by ProfileManagementModal so
// the URL matches GET /api/profiles. Behaviour is identical to the singular
// route; both share the validation + merge logic above.
router.patch('/api/profiles/:id', (req, res) => {
  return applyProfilePatch(req.params.id, req.body, res);
});

module.exports = router;
