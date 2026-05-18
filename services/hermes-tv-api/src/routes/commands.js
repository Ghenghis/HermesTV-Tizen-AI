'use strict';

const { Router } = require('express');
const router = Router();

const VALID_SCHEMA = 'hermestv.ui.v1';
const VALID_PROFILES = ['dave_tv', 'mom_tv'];
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const MOM_FONT_SCALE_FLOOR = 1.25;

const ACTION_ALLOWLIST = new Set([
  'update_layout',
  'update_theme',
  'update_background',
  'update_font_scale',
  'update_motion_density',
  'update_audio_feedback',
  'update_agent_name',
  'update_display_name',
  'update_preferred_provider',
  'update_quality_filter',
  'show_notification',
  'show_action_card',
  'dismiss_overlay',
  'recall_memory',
  'save_memory',
]);

// POST /api/commands
router.post('/api/commands', (req, res) => {
  const body = req.body;
  const errors = [];

  // Schema validation
  if (!body.schema || body.schema !== VALID_SCHEMA) {
    errors.push(`schema must be '${VALID_SCHEMA}', got: '${body.schema}'`);
  }

  // Action validation
  if (!body.action) {
    errors.push('action is required');
  } else if (!ACTION_ALLOWLIST.has(body.action)) {
    errors.push(
      `action '${body.action}' is not in the allowed action list. Allowed: ${[...ACTION_ALLOWLIST].join(', ')}`
    );
  }

  // Target validation
  if (!body.target || !body.target.profile_id) {
    errors.push('target.profile_id is required');
  } else if (!VALID_PROFILES.includes(body.target.profile_id)) {
    errors.push(
      `target.profile_id must be 'dave_tv' or 'mom_tv', got: '${body.target.profile_id}'`
    );
  }

  // command_id ULID validation
  if (!body.command_id) {
    errors.push('command_id is required');
  } else if (!ULID_PATTERN.test(body.command_id)) {
    errors.push(
      `command_id must match ULID pattern [0-9A-HJKMNP-TV-Z]{26}, got: '${body.command_id}'`
    );
  }

  // Mom Mode font_scale floor enforcement
  if (
    body.action === 'update_font_scale' &&
    body.target &&
    body.target.profile_id === 'mom_tv' &&
    body.params &&
    body.params.font_scale !== undefined
  ) {
    const scale = body.params.font_scale;
    if (typeof scale !== 'number' || scale < MOM_FONT_SCALE_FLOOR) {
      errors.push(
        `Mom Mode requires font_scale >= ${MOM_FONT_SCALE_FLOOR}. Requested: ${scale}`
      );
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ accepted: false, errors });
  }

  // Log command to console (dev) — never print params that might contain credentials
  console.log(
    `[HermesAPI] command accepted: ${body.action} → ${body.target.profile_id} [${body.command_id}]`
  );

  // Dry-run mode
  if (body.dry_run === true) {
    return res.json({
      accepted: true,
      dry_run: true,
      command_id: body.command_id,
      would_apply: {
        action: body.action,
        target: body.target,
        params: body.params || {},
      },
    });
  }

  res.json({
    accepted: true,
    command_id: body.command_id,
    dry_run_diff: null,
  });
});

module.exports = router;
