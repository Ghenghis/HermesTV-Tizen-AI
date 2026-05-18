'use strict';

const { Router } = require('express');
const router = Router();

// ---------------------------------------------------------------------------
// Command table — 22 safe mock commands, no real provider calls.
// Each entry: { patterns: string[], action: string, params: object }
// Matching is case-insensitive, input is trimmed before comparison.
// ---------------------------------------------------------------------------
const COMMAND_TABLE = [
  // --- Provider filters ---
  {
    patterns: ['show apollo', 'show apollo group'],
    action: 'filter_provider',
    params: { provider_id: 'apollo_group' },
  },
  {
    patterns: ['show xtremehd', 'show extreme'],
    action: 'filter_provider',
    params: { provider_id: 'xtremehd' },
  },
  {
    patterns: ['show all providers', 'show all'],
    action: 'filter_provider',
    params: { provider_id: 'all' },
  },
  // --- Content type filters ---
  {
    patterns: ['show movies'],
    action: 'filter_content',
    params: { content_type: 'movies' },
  },
  {
    patterns: ['show series', 'show tv shows'],
    action: 'filter_content',
    params: { content_type: 'series' },
  },
  {
    patterns: ['show live', 'live channels'],
    action: 'filter_content',
    params: { content_type: 'live' },
  },
  // --- Quality filter ---
  {
    patterns: ['show 4k', '4k only'],
    action: 'filter_quality',
    params: { quality: '4K' },
  },
  // --- Profile switch ---
  {
    patterns: ['mom mode', 'sherri mode'],
    action: 'switch_profile',
    params: { profile_id: 'mom_tv' },
  },
  {
    patterns: ['dave mode'],
    action: 'switch_profile',
    params: { profile_id: 'dave_tv' },
  },
  // --- Layout update ---
  {
    patterns: ['bigger tiles', 'large tiles'],
    action: 'update_layout',
    params: { layout: 'mom_jumbo_rail' },
  },
  // --- Theme updates ---
  {
    patterns: ['dark theme', 'dark mode'],
    action: 'update_theme',
    params: { theme: 'night-blue' },
  },
  {
    patterns: ['premium theme', 'cinema theme'],
    action: 'update_theme',
    params: { theme: 'cinema_amber' },
  },
  // --- Motion / performance ---
  {
    patterns: ['low memory mode', 'performance mode'],
    action: 'update_motion',
    params: { density: 'off' },
  },
  // --- Detail / discovery ---
  {
    patterns: ['what is this'],
    action: 'show_detail',
    params: { target: 'focused_item' },
  },
  {
    patterns: ['find more with this actor', 'more with actor'],
    action: 'find_similar_actor',
    params: { target: 'focused_actor' },
  },
  // --- Content type filters (additional) ---
  {
    patterns: ['show sports', 'sports channels'],
    action: 'filter_content',
    params: { content_type: 'sports' },
  },
  {
    patterns: ['show action', 'show action movies'],
    action: 'filter_content',
    params: { content_type: 'action' },
  },
  {
    patterns: ['show family', 'family movies'],
    action: 'filter_content',
    params: { content_type: 'family' },
  },
  {
    patterns: ['show mysteries', 'show mystery'],
    action: 'filter_content',
    params: { content_type: 'mysteries' },
  },
  {
    patterns: ['show hallmark', 'hallmark channel'],
    action: 'filter_content',
    params: { content_type: 'hallmark' },
  },
  // --- Theme updates (additional) ---
  {
    patterns: ['light theme', 'light mode'],
    action: 'update_theme',
    params: { theme: 'mom-calm' },
  },
  // --- Reset ---
  {
    patterns: ['reset filters', 'clear filters', 'show everything'],
    action: 'reset_filters',
    params: {},
  },
];

const VALID_PROFILES = ['dave_tv', 'mom_tv'];

const NO_MATCH_ERROR =
  'Command not recognized. Try: show movies, mom mode, dark theme, show 4K, show sports, reset filters';

/**
 * Resolve a trimmed, lowercased command string against the command table.
 * Returns the matched entry or null.
 */
function resolveCommand(normalised) {
  for (const entry of COMMAND_TABLE) {
    for (const pattern of entry.patterns) {
      if (normalised === pattern.toLowerCase()) {
        return entry;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// POST /api/ui-command/validate
// ---------------------------------------------------------------------------
router.post('/api/ui-command/validate', (req, res) => {
  const { command_text, profile_id } = req.body || {};

  // --- Input validation ---
  if (typeof command_text !== 'string' || command_text.trim().length === 0) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'command_text is required and must be a non-empty string.',
    });
  }

  if (profile_id !== undefined && !VALID_PROFILES.includes(profile_id)) {
    return res.status(400).json({
      error: 'validation_failed',
      message: `Invalid profile_id '${profile_id}'. Valid values: dave_tv, mom_tv`,
    });
  }

  const normalised = command_text.trim().toLowerCase();
  const match = resolveCommand(normalised);

  if (!match) {
    return res.json({
      valid: false,
      action: null,
      params: null,
      error: NO_MATCH_ERROR,
    });
  }

  return res.json({
    valid: true,
    action: match.action,
    params: match.params,
    error: null,
  });
});

module.exports = router;
