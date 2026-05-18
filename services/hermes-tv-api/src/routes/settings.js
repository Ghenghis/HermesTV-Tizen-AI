'use strict';

const { Router } = require('express');
const router = Router();

// App-level settings — no credentials, no stream URLs, no tokens
const DEFAULT_SETTINGS = {
  version: '0.1.0',
  phase: 'B1-scaffold',
  features: {
    mock_mode: true,
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
    mock_only: ['apollo_group', 'xtremehd'],
  },
};

// In-memory overrides — reset on server restart (B2 mock mode)
let UI_OVERRIDES = {};

const VALID_LAYOUTS = [
  'tivimate', 'netflix', 'plex', 'apple-tv', 'samsung-tizen',
  'mom-mode', 'dave-power', 'grid-standard', 'discovery-walls', '',
];

const VALID_THEMES = [
  'night-blue', 'dawn-pink', 'forest-green', 'gold-qled',
  'tivimate', 'netflix', 'plex', 'apple-tv', 'samsung-tizen',
  'mom-mode', 'dave-power',
];

// GET /api/settings
router.get('/api/settings', (req, res) => {
  const merged = Object.assign({}, DEFAULT_SETTINGS, {
    ui: Object.assign({}, DEFAULT_SETTINGS.ui, {
      active_layout: UI_OVERRIDES.active_layout !== undefined
        ? UI_OVERRIDES.active_layout
        : DEFAULT_SETTINGS.ui.default_layout,
      active_theme: UI_OVERRIDES.active_theme !== undefined
        ? UI_OVERRIDES.active_theme
        : DEFAULT_SETTINGS.ui.default_theme,
    }),
  });
  res.json(merged);
});

// PATCH /api/settings
router.patch('/api/settings', (req, res) => {
  const { active_layout, active_theme } = req.body || {};
  const errors = {};

  if (active_layout !== undefined && !VALID_LAYOUTS.includes(active_layout)) {
    errors.active_layout = `Invalid layout. Allowed: ${VALID_LAYOUTS.join(', ')}`;
  }
  if (active_theme !== undefined && !VALID_THEMES.includes(active_theme)) {
    errors.active_theme = `Invalid theme. Allowed: ${VALID_THEMES.join(', ')}`;
  }
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ error: 'validation_failed', fields: errors });
  }

  if (active_layout !== undefined) UI_OVERRIDES.active_layout = active_layout;
  if (active_theme !== undefined) UI_OVERRIDES.active_theme = active_theme;

  const merged = Object.assign({}, DEFAULT_SETTINGS, {
    ui: Object.assign({}, DEFAULT_SETTINGS.ui, {
      active_layout: UI_OVERRIDES.active_layout !== undefined
        ? UI_OVERRIDES.active_layout
        : DEFAULT_SETTINGS.ui.default_layout,
      active_theme: UI_OVERRIDES.active_theme !== undefined
        ? UI_OVERRIDES.active_theme
        : DEFAULT_SETTINGS.ui.default_theme,
    }),
  });

  res.json(merged);
});

module.exports = router;
