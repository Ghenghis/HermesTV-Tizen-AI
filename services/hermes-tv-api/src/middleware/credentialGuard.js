'use strict';

/**
 * middleware/credentialGuard.js
 *
 * Final-layer response middleware that scans every JSON body before it reaches
 * a TV client and blocks any response that contains credential-like patterns.
 *
 * Mount AFTER all route handlers, before the error handler:
 *
 *   const credentialGuard = require('./middleware/credentialGuard');
 *   app.use(credentialGuard);
 *
 * If a forbidden pattern is detected:
 *   - The response is replaced with a 500 security error JSON.
 *   - A console.error line is written with the pattern and route (NOT the
 *     credential value itself — only the pattern name and path).
 *   - The original body is discarded; it is never sent.
 */

// Patterns that must NEVER appear in API responses going to TV clients.
// Ordered from most-specific to least-specific for fast short-circuit.
//
// HANDOFF blocker #7 (2026-05-21): mirror lib/sanitizeLog.FORBIDDEN_PATTERNS.
// If a string is dangerous to log it is dangerous to return; divergence between
// these two lists is a real release-blocker. Equivalence is exercised by
// services/hermes-tv-api/test/credentialGuardSync.test.js — any new pattern
// must be added to BOTH files.
const FORBIDDEN_PATTERNS = [
  /\/get\.php\?username=/i,           // Xtreme Codes / IPTV M3U credential URL
  /\/player_api\.php/i,               // Xtreme Codes player API endpoint
  /x-ui-token/i,                      // 3X-UI panel session token header value
  /client_secret/i,                   // OAuth client secret
  /AZURE_TTS_KEY/i,                   // Azure TTS subscription key env var name
  /DEEPSEEK_API_KEY/i,                // DeepSeek API key env var name
  /api[_\-]?key\s*[:=]/i,            // Generic API key assignment
  /[?&]api[_\-]?key=/i,              // Generic API key query string
  /password\s*[:=]/i,                 // Generic password assignment
  /bearer\s+[A-Za-z0-9\-._~+/]+=*/i, // Bearer token value
  /m3u_plus/i,                        // Xtream Codes flag-laden URL marker (added 2026-05-21 / HANDOFF #7)
  /sk-[A-Za-z0-9_\-]{20,}/i,         // OpenAI-style key prefix (added 2026-05-21 / HANDOFF #7)
  /Ocp-Apim-Subscription-Key/i,       // Azure Speech subscription header (added 2026-05-21 / HANDOFF #7)
  /X-Emby-Token/i,                    // Jellyfin API token header
];

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function credentialGuard(req, res, next) {
  var originalJson = res.json.bind(res);

  res.json = function(body) {
    var str;
    try {
      str = JSON.stringify(body);
    } catch (_) {
      // Unserializable body — let Express handle it normally
      return originalJson(body);
    }

    for (var i = 0; i < FORBIDDEN_PATTERNS.length; i++) {
      if (FORBIDDEN_PATTERNS[i].test(str)) {
        // Log only the pattern name and route path — NOT the credential value.
        console.error(
          '[SECURITY] credentialGuard blocked response with forbidden pattern:',
          FORBIDDEN_PATTERNS[i].toString(),
          'on route:',
          req.path
        );
        return originalJson.call(res, {
          error: 'Internal security policy violation',
          code:  'CREDENTIAL_LEAK_BLOCKED',
        });
      }
    }

    return originalJson(body);
  };

  next();
}

// Exported for the credentialGuardSync test — kept underscore-prefixed so
// downstream consumers don't accidentally rely on the internal pattern list.
credentialGuard._FORBIDDEN_PATTERNS = FORBIDDEN_PATTERNS;

module.exports = credentialGuard;
