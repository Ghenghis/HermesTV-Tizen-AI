'use strict';

const { Router } = require('express');
const agentConfigStore = require('../lib/agentConfigStore');
const agentProviderSearch = require('../lib/agentProviderSearch');
const { sanitizeForLog } = require('../lib/sanitizeLog');

const router = Router();

function validationError(res, err) {
  return res.status(400).json({
    error: 'validation_failed',
    message: err && err.message ? err.message : 'Invalid agent request',
  });
}

router.get('/api/agent/config/:profile_id', async function(req, res) {
  try {
    var config = await agentConfigStore.get(req.params.profile_id);
    res.json({
      config: config,
      capability: {
        speech_to_text: 'unconfigured',
        wake_phrase: config.wake_phrase_supported ? 'supported' : 'unsupported',
        active_trigger: config.wake_phrase_supported && config.trigger_enabled,
      },
    });
  } catch (err) {
    if (err && err.code === 'VALIDATION_FAILED') { return validationError(res, err); }
    console.warn('[agent] config get failed: ' + sanitizeForLog(err && err.message));
    res.status(500).json({ error: 'config_failed', message: 'Could not load agent config.' });
  }
});

router.patch('/api/agent/config/:profile_id', async function(req, res) {
  try {
    var config = await agentConfigStore.update(req.params.profile_id, req.body || {});
    res.json({
      config: config,
      capability: {
        speech_to_text: 'unconfigured',
        wake_phrase: config.wake_phrase_supported ? 'supported' : 'unsupported',
        active_trigger: config.wake_phrase_supported && config.trigger_enabled,
      },
    });
  } catch (err) {
    if (err && err.code === 'VALIDATION_FAILED') { return validationError(res, err); }
    console.warn('[agent] config update failed: ' + sanitizeForLog(err && err.message));
    res.status(500).json({ error: 'config_failed', message: 'Could not save agent config.' });
  }
});

router.post('/api/agent/utterance', async function(req, res) {
  var body = req.body || {};
  if (typeof body.profile_id !== 'string' || body.profile_id.trim().length === 0) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'profile_id is required and must be a string.',
    });
  }
  if (typeof body.utterance !== 'string' || body.utterance.trim().length === 0) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'utterance is required and must be a non-empty string.',
    });
  }
  if (body.utterance.length > 500) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'utterance must be 500 characters or fewer.',
    });
  }
  if (body.input_mode !== undefined && ['voice', 'text', 'remote_button'].indexOf(body.input_mode) === -1) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'input_mode must be voice, text, or remote_button.',
    });
  }

  var config;
  try {
    config = await agentConfigStore.get(body.profile_id);
  } catch (err) {
    if (err && err.code === 'VALIDATION_FAILED') { return validationError(res, err); }
    console.warn('[agent] utterance config failed: ' + sanitizeForLog(err && err.message));
    return res.status(500).json({ error: 'agent_failed', message: 'Could not load agent config.' });
  }

  var search;
  try {
    search = await agentProviderSearch.search({
      query: body.utterance,
      trigger_phrase: config.trigger_phrase,
      media_type: body.media_type || body.type,
      provider_ids: body.provider_ids || body.provider_id,
      limit: body.limit || 8,
      refresh_on_empty: body.refresh_on_empty === true,
    });
  } catch (err2) {
    if (err2 && err2.code === 'VALIDATION_FAILED') { return validationError(res, err2); }
    console.warn('[agent] provider search failed: ' + sanitizeForLog(err2 && err2.message));
    return res.status(500).json({ error: 'agent_failed', message: 'Could not search provider catalog.' });
  }

  var found = search.candidates.length > 0;
  return res.json({
    status: found ? 'candidates' : 'no_results',
    error: null,
    spoken_text: found
      ? 'I found real provider matches. I will not start playback automatically until the playback checks are wired.'
      : 'I searched the real provider catalog and did not find a match.',
    confidence: search.confidence,
    actions: [],
    candidates: search.candidates,
    job_id: null,
    memory_suggestions: [],
    config: {
      profile_id: config.profile_id,
      assistant_name: config.assistant_name,
      trigger_phrase: config.trigger_phrase,
      trigger_enabled: config.trigger_enabled,
      trigger_mode: config.trigger_mode,
      wake_phrase_supported: config.wake_phrase_supported,
      voice_first: config.voice_first,
    },
    search: {
      returned: search.returned,
      total: search.total,
      source: search._meta.source,
      refreshed: search._meta.refreshed,
      provider_filters: search._meta.provider_filters,
      type_filter: search._meta.type_filter,
    },
    proof_required: [
      'agentOrchestrator implementation',
      'action policy validation',
      'background job proof',
      'no-secret transcript/search proof',
    ],
  });
});

router.get('/api/agent/jobs/:job_id', function(req, res) {
  res.status(501).json({
    status: 'blocked',
    error: 'agent_jobs_unavailable',
    message: 'Background agent jobs are not implemented yet.',
    job_id: req.params.job_id,
  });
});

router.post('/api/agent/jobs/:job_id/cancel', function(req, res) {
  res.status(501).json({
    status: 'blocked',
    error: 'agent_jobs_unavailable',
    message: 'Background agent jobs are not implemented yet.',
    job_id: req.params.job_id,
  });
});

module.exports = router;
