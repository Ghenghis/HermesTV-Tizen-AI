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

// GET /api/settings
router.get('/api/settings', (req, res) => {
  res.json(DEFAULT_SETTINGS);
});

module.exports = router;
