'use strict';

/**
 * lib/llmFallback.js
 *
 * Second-pass parser for chatbot commands that the regex fast-path could not
 * match. Calls an OpenAI-compatible chat-completions endpoint (OpenAI, a local
 * Ollama proxy, or anything that speaks the same shape) and returns a
 * normalised { action, params } object on success, null on any failure.
 *
 * Hard guarantees:
 *   - Never sends a credential-shaped substring to the LLM provider. Inputs
 *     are scrubbed via FORBIDDEN_PATTERNS (mirror of credentialGuard) before
 *     the outbound fetch.
 *   - 5-second timeout. On timeout / network error / parse error / shape
 *     mismatch returns null so the caller can fall back to the standard
 *     "command_not_recognized" path.
 *   - Logs only outcome counts ("fallback_called", "fallback_succeeded",
 *     "fallback_failed"). Never logs the user's command_text or the LLM's
 *     raw response body.
 *   - The LLM is instructed to emit ONLY a JSON object. The response is
 *     parsed strictly and validated against ALLOWED_ACTIONS / VALID_PARAMS
 *     before being returned. Any drift -> null.
 *
 * Env vars:
 *   - OPENAI_API_KEY (required to enable the fallback)
 *   - OPENAI_BASE_URL (default: https://api.openai.com/v1)
 *   - LLM_DEFAULT_MODEL (required when OPENAI_API_KEY is set)
 *
 * No external dependencies — uses Node's built-in fetch (Node 20+).
 * Tizen safe: no optional chaining, no nullish coalescing in any exported code
 * path. (This file runs server-side only, but follows the project rule for
 * uniformity and to keep grep audits clean.)
 */

// ---------------------------------------------------------------------------
// Credential scrubbing — outbound side.
// We replicate (rather than import) the patterns from middleware/credentialGuard
// because that module is response-bound (wraps res.json). Here we need a
// scrubber for the request payload going out to the LLM provider. The pattern
// list is intentionally identical so that anything the response guard would
// block from going to the TV is also blocked from leaving us to OpenAI.
// ---------------------------------------------------------------------------
var OUTBOUND_FORBIDDEN_PATTERNS = [
  /\/get\.php\?username=[^\s'"]*/gi,           // Xtreme Codes / IPTV M3U URL
  /\/player_api\.php[^\s'"]*/gi,               // Xtreme Codes player API endpoint
  /x-ui-token[^\s'"]*/gi,                      // 3X-UI panel session token
  /client_secret[^\s'"]*/gi,                   // OAuth client secret
  /AZURE_TTS_KEY[^\s'"]*/gi,                   // Azure TTS subscription key env name
  /DEEPSEEK_API_KEY[^\s'"]*/gi,                // DeepSeek API key env name
  /api[_\-]?key\s*[:=]\s*[^\s'"]*/gi,         // Generic API key assignment
  /password\s*[:=]\s*[^\s'"]*/gi,              // Generic password assignment
  /bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,         // Bearer token value
  /sk-[A-Za-z0-9_\-]{20,}/gi,                  // OpenAI-style key prefix
  /\b[A-Za-z0-9_\-]{32,}\b/g,                  // Generic long opaque token blob
];

function scrubOutbound(text) {
  if (typeof text !== 'string') return '';
  var scrubbed = text;
  for (var i = 0; i < OUTBOUND_FORBIDDEN_PATTERNS.length; i++) {
    scrubbed = scrubbed.replace(OUTBOUND_FORBIDDEN_PATTERNS[i], '[REDACTED]');
  }
  // Hard cap length — defends against prompt-injection by sheer volume.
  if (scrubbed.length > 512) {
    scrubbed = scrubbed.slice(0, 512);
  }
  return scrubbed;
}

// ---------------------------------------------------------------------------
// Allowed actions catalog — must mirror the regex COMMAND_TABLE in
// routes/uiCommand.js. If a new regex entry is added there, this list MUST be
// updated too so the LLM can target it. Keeping these as plain data (not
// imports) so the LLM contract stays explicit.
// ---------------------------------------------------------------------------
var ALLOWED_ACTIONS = {
  filter_provider:    { provider_id: ['apollo_group', 'xtremehd', 'all'] },
  filter_content:     { content_type: ['movies', 'series', 'live', 'sports', 'action', 'family', 'mysteries', 'hallmark'] },
  filter_quality:     { quality: ['4K'] },
  switch_profile:     { profile_id: ['dave_tv', 'mom_tv'] },
  update_layout:      { layout: ['mom_jumbo_rail'] },
  update_theme:       { theme: ['night-blue', 'cinema_amber', 'mom-calm'] },
  update_motion:      { density: ['off'] },
  show_detail:        { target: ['focused_item'] },
  find_similar_actor: { target: ['focused_actor'] },
  reset_filters:      {},
};

// ---------------------------------------------------------------------------
// Validates a candidate { action, params } object against ALLOWED_ACTIONS.
// Returns the normalised object on success, null on failure.
// ---------------------------------------------------------------------------
function validateCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  if (typeof candidate.action !== 'string') return null;

  var spec = ALLOWED_ACTIONS[candidate.action];
  if (!spec) return null;

  var params = candidate.params;
  if (params === null || params === undefined) params = {};
  if (typeof params !== 'object' || Array.isArray(params)) return null;

  // Filter params to only known keys with allowed values.
  var normalisedParams = {};
  var specKeys = Object.keys(spec);

  // reset_filters has no params — empty object is required.
  if (specKeys.length === 0) {
    return { action: candidate.action, params: {} };
  }

  for (var i = 0; i < specKeys.length; i++) {
    var key = specKeys[i];
    var allowedValues = spec[key];
    var got = params[key];
    if (typeof got !== 'string') return null;
    if (allowedValues.indexOf(got) === -1) return null;
    normalisedParams[key] = got;
  }

  return { action: candidate.action, params: normalisedParams };
}

// ---------------------------------------------------------------------------
// Build the system prompt. The LLM is told to emit ONLY a JSON object and
// to use null when it cannot confidently map the request to a known action.
// ---------------------------------------------------------------------------
function buildSystemPrompt() {
  var lines = [
    'You are a strict intent parser for HermesTV, a Samsung TV streaming UI.',
    'Map the user request to exactly ONE of the allowed actions below, or return null if no confident match.',
    '',
    'Allowed actions and their parameter values:',
  ];
  var keys = Object.keys(ALLOWED_ACTIONS);
  for (var i = 0; i < keys.length; i++) {
    var action = keys[i];
    var spec = ALLOWED_ACTIONS[action];
    var specKeys = Object.keys(spec);
    if (specKeys.length === 0) {
      lines.push('- ' + action + ': params = {}');
    } else {
      var paramDesc = [];
      for (var j = 0; j < specKeys.length; j++) {
        var k = specKeys[j];
        paramDesc.push(k + ' in [' + spec[k].join(', ') + ']');
      }
      lines.push('- ' + action + ': ' + paramDesc.join('; '));
    }
  }
  lines.push('');
  lines.push('Respond with ONLY a JSON object on a single line. No prose, no markdown fences.');
  lines.push('On a confident match: {"action":"<name>","params":{...}}');
  lines.push('On no confident match: null');
  lines.push('Never invent new action names, parameters, or values.');
  return lines.join('\n');
}

// Cached after first build — system prompt is stable for the process lifetime.
var SYSTEM_PROMPT_CACHE = null;
function systemPrompt() {
  if (SYSTEM_PROMPT_CACHE === null) {
    SYSTEM_PROMPT_CACHE = buildSystemPrompt();
  }
  return SYSTEM_PROMPT_CACHE;
}

// ---------------------------------------------------------------------------
// Try to parse the LLM response content as JSON. Returns null on any error.
// Handles the common "model wrapped JSON in markdown" failure mode.
// ---------------------------------------------------------------------------
function parseLLMResponse(content) {
  if (typeof content !== 'string') return null;
  var trimmed = content.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;

  // Strip a markdown code fence if present.
  var fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    trimmed = fenceMatch[1].trim();
  }

  try {
    var parsed = JSON.parse(trimmed);
    if (parsed === null) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Whether the LLM fallback is enabled (i.e. OPENAI_API_KEY is set).
 * Cheap, env-only check — does not perform a network probe.
 */
function isEnabled() {
  return typeof process.env.OPENAI_API_KEY === 'string' &&
         process.env.OPENAI_API_KEY.trim().length > 0;
}

/**
 * Try to parse an ambiguous command via the configured LLM.
 *
 * @param {string} command_text raw user input (will be scrubbed before send)
 * @param {string} profile_id   target profile, included for LLM context only
 * @returns {Promise<{action: string, params: object} | null>}
 */
async function tryParse(command_text, profile_id) {
  if (!isEnabled()) return null;

  var model = process.env.LLM_DEFAULT_MODEL;
  if (typeof model !== 'string' || model.trim().length === 0) {
    console.warn('[llmFallback] LLM_DEFAULT_MODEL not set — skipping');
    return null;
  }

  var baseUrl = process.env.OPENAI_BASE_URL;
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
    baseUrl = 'https://api.openai.com/v1';
  }
  // Normalise trailing slash.
  while (baseUrl.charAt(baseUrl.length - 1) === '/') {
    baseUrl = baseUrl.slice(0, -1);
  }
  var endpoint = baseUrl + '/chat/completions';

  var safeProfile = (profile_id === 'dave_tv' || profile_id === 'mom_tv') ? profile_id : 'dave_tv';
  var safeText = scrubOutbound(command_text);

  if (safeText.length === 0) return null;

  console.log('[llmFallback] fallback_called profile=' + safeProfile + ' len=' + safeText.length);

  var controller;
  var timeoutId = null;
  try {
    controller = new AbortController();
  } catch (_) {
    // Older Node — AbortController missing. Fail closed.
    console.warn('[llmFallback] AbortController unavailable — skipping');
    return null;
  }
  timeoutId = setTimeout(function() { controller.abort(); }, 5000);

  var body = JSON.stringify({
    model: model,
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user',   content: 'Profile: ' + safeProfile + '\nRequest: ' + safeText },
    ],
    temperature: 0,
    max_tokens: 128,
  });

  var response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      },
      body: body,
      signal: controller.signal,
    });
  } catch (err) {
    if (timeoutId !== null) clearTimeout(timeoutId);
    console.log('[llmFallback] fallback_failed reason=network');
    return null;
  }
  if (timeoutId !== null) clearTimeout(timeoutId);

  if (!response.ok) {
    console.log('[llmFallback] fallback_failed reason=http_' + response.status);
    return null;
  }

  var json;
  try {
    json = await response.json();
  } catch (_) {
    console.log('[llmFallback] fallback_failed reason=parse_outer');
    return null;
  }

  if (!json || !Array.isArray(json.choices) || json.choices.length === 0) {
    console.log('[llmFallback] fallback_failed reason=no_choices');
    return null;
  }
  var first = json.choices[0];
  if (!first || !first.message || typeof first.message.content !== 'string') {
    console.log('[llmFallback] fallback_failed reason=no_content');
    return null;
  }

  var candidate = parseLLMResponse(first.message.content);
  var validated = validateCandidate(candidate);

  if (validated === null) {
    console.log('[llmFallback] fallback_failed reason=shape_mismatch');
    return null;
  }

  console.log('[llmFallback] fallback_succeeded action=' + validated.action);
  return validated;
}

module.exports = {
  isEnabled: isEnabled,
  tryParse: tryParse,
  // Exported for tests only — not part of the stable interface.
  _internal: {
    scrubOutbound: scrubOutbound,
    validateCandidate: validateCandidate,
    parseLLMResponse: parseLLMResponse,
    buildSystemPrompt: buildSystemPrompt,
    ALLOWED_ACTIONS: ALLOWED_ACTIONS,
  },
};
