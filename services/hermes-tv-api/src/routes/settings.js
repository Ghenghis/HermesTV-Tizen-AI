'use strict';

const { Router } = require('express');
const settingsStore = require('../lib/settingsStore');
const profileIds = require('../lib/profileIds');
const router = Router();

// App-level settings — no credentials, no stream URLs, no tokens.
// Profile-scoped overrides (font_scale, active_layout, etc.) live in the
// file-backed settingsStore at HERMES_SETTINGS_STORE (default
// /var/lib/hermestv/settings.json). The DEFAULT_SETTINGS object below is
// the global app shell — everything in it is static across profiles.
const DEFAULT_SETTINGS = {
  version: '0.1.0',
  phase: 'B1-scaffold',
  features: {
    azure_tts: false,
    real_providers: false,
    vps_connected: false,
    jellyfin_connected: false,
  },
  ui: {
    default_theme: 'night-blue',
    default_layout: 'discovery_walls',
    enhanced_animations: true,
    chatbot_enabled: true,
  },
  providers: {
    configured: [],
  },
};

// Legacy in-memory overrides for global UI selection (active_layout /
// active_theme). These are still process-scoped because no profile was
// historically attached to PATCH /api/settings. Profile-scoped persistence
// flows through settingsStore via the profile_id field.
let UI_OVERRIDES = {};

const VALID_LAYOUTS = [
  'tivimate', 'netflix', 'plex', 'apple-tv', 'samsung-tizen',
  'mom-mode', 'dave-power', 'grid-standard', 'discovery-walls',
  'jumbo-rail', '',
];

const VALID_THEMES = [
  'night-blue', 'dawn-pink', 'forest-green', 'gold-qled',
  'tivimate', 'netflix', 'plex', 'apple-tv', 'samsung-tizen',
  'mom-mode', 'dave-power', 'mom-calm',
];

/**
 * Build the merged response shape. Adds a per-profile `profile` block when
 * a profile_id is supplied so callers can read persisted settings in one
 * round-trip. The legacy top-level shape is preserved for back-compat.
 */
function buildResponse(profileId) {
  const merged = Object.assign({}, DEFAULT_SETTINGS, {
    features: { ...DEFAULT_SETTINGS.features },
    ui: Object.assign({}, DEFAULT_SETTINGS.ui, {
      active_layout: UI_OVERRIDES.active_layout !== undefined
        ? UI_OVERRIDES.active_layout
        : DEFAULT_SETTINGS.ui.default_layout,
      active_theme: UI_OVERRIDES.active_theme !== undefined
        ? UI_OVERRIDES.active_theme
        : DEFAULT_SETTINGS.ui.default_theme,
    }),
    providers: { ...DEFAULT_SETTINGS.providers },
  });

  if (profileId && profileIds.isValidProfileId(profileId)) {
    merged.profile_id = profileId;
    merged.profile = settingsStore.getSettings(profileId);
  }

  return merged;
}

// GET /api/settings?profile_id=mom_tv
router.get('/api/settings', (req, res) => {
  const profileId = req.query.profile_id;
  if (profileId && !profileIds.isValidProfileId(profileId)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: profileIds.profileValidationMessage(),
    });
  }
  res.json(buildResponse(profileId));
});

// PATCH /api/settings
// Body forms supported:
//   { active_layout?, active_theme? }              — global UI selection (legacy)
//   { profile_id: "mom_tv", <any settings> }      — per-profile persisted settings
// Both can be combined in one request.
router.patch('/api/settings', async (req, res) => {
  const body = req.body || {};
  const { active_layout, active_theme, profile_id, ...rest } = body;
  const errors = {};

  if (active_layout !== undefined && !VALID_LAYOUTS.includes(active_layout)) {
    errors.active_layout = `Invalid layout. Allowed: ${VALID_LAYOUTS.join(', ')}`;
  }
  if (active_theme !== undefined && !VALID_THEMES.includes(active_theme)) {
    errors.active_theme = `Invalid theme. Allowed: ${VALID_THEMES.join(', ')}`;
  }
  if (profile_id !== undefined && !profileIds.isValidProfileId(profile_id)) {
    errors.profile_id = profileIds.profileValidationMessage();
  }

  // Light type validation for the common per-profile fields. Unknown fields
  // are accepted as-is so this endpoint can carry future settings without
  // a schema bump — the store just persists what it's told.
  if (rest.font_scale !== undefined && typeof rest.font_scale !== 'number') {
    errors.font_scale = 'font_scale must be a number';
  }
  if (rest.reduced_motion !== undefined && typeof rest.reduced_motion !== 'boolean') {
    errors.reduced_motion = 'reduced_motion must be a boolean';
  }
  if (rest.audio_feedback !== undefined && typeof rest.audio_feedback !== 'boolean') {
    errors.audio_feedback = 'audio_feedback must be a boolean';
  }
  if (rest.active_layout !== undefined && !VALID_LAYOUTS.includes(rest.active_layout)) {
    // per-profile active_layout uses the same allow-list as the global one
    errors.active_layout = `Invalid layout. Allowed: ${VALID_LAYOUTS.join(', ')}`;
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'validation_failed', fields: errors });
  }

  if (active_layout !== undefined) UI_OVERRIDES.active_layout = active_layout;
  if (active_theme !== undefined) UI_OVERRIDES.active_theme = active_theme;

  // Per-profile persistence: anything that's not a known legacy global key
  // is written to the profile slot in the file store.
  if (profile_id) {
    try {
      await settingsStore.updateSettings(profile_id, rest);
    } catch (err) {
      // settingsStore is crash-safe and won't normally reject, but defend
      // anyway so a disk failure can't 500 the request — the cache is
      // already updated by the store.
      console.warn(`[settings] persist warning for ${profile_id}: ${err.message}`);
    }
  }

  res.json(buildResponse(profile_id));
});

module.exports = router;
