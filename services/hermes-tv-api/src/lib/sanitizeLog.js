'use strict';

/**
 * lib/sanitizeLog.js — log-line sanitizer.
 *
 * Any console.error / console.warn that prints err.message or other
 * caller-supplied free-form text MUST go through `sanitizeForLog()` first.
 *
 * Why: middleware/credentialGuard.js prevents credentials from leaking
 * through HTTP responses, but it never inspects what we write to STDOUT.
 * Container logs are shipped to disk and (in production) to whatever
 * log aggregator the operator has wired up. The Azure Speech SDK in
 * particular has been observed including subscription keys in its raw
 * error strings; we mustn't echo those through to the operator's log
 * pipeline. Same goes for Xtream Codes M3U URLs (the username/password
 * is embedded in the URL itself) when they show up inside an fetch /
 * AbortError stack.
 *
 * The patterns mirror the response-side credentialGuard list so the
 * two stay in sync — anything blocked in response bodies is also
 * blocked in log lines.
 *
 * Hard length cap: 240 chars. Stops a runaway error string from
 * filling logs with megabytes of garbage. Logs that need more
 * context should structured-log explicit fields (status code, route,
 * error code) instead of dumping a giant message.
 */

var FORBIDDEN_PATTERNS = [
  /\/get\.php\?username=[^\s'"]*/gi,         // Xtreme Codes M3U URL
  /\/player_api\.php[^\s'"]*/gi,             // Xtreme Codes API endpoint
  /x-ui-token[^\s'"]*/gi,                    // 3X-UI session token
  /client_secret[^\s'"]*/gi,                 // OAuth secret
  /AZURE_TTS_KEY[^\s'"]*/gi,                 // Azure env var (only the name, but if
                                             // a log line has 'AZURE_TTS_KEY=<value>'
                                             // we want to drop the whole assignment)
  /DEEPSEEK_API_KEY[^\s'"]*/gi,              // DeepSeek env var
  /api[_\-]?key\s*[:=]\s*[^\s'"]*/gi,        // Generic api_key assignment
  /password\s*[:=]\s*[^\s'"]*/gi,            // Generic password assignment
  /bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,        // Bearer token value
  /sk-[A-Za-z0-9_\-]{20,}/gi,                // OpenAI-style key prefix
  /Ocp-Apim-Subscription-Key:\s*[^\s'"]*/gi, // Azure Speech header
  /m3u_plus[^\s'"]*/gi,                      // Xtream Codes flag-laden URLs
];

var MAX_LOG_LEN = 240;

function sanitizeForLog(input) {
  if (input === null || input === undefined) { return ''; }
  var s = (typeof input === 'string') ? input : String(input);
  for (var i = 0; i < FORBIDDEN_PATTERNS.length; i++) {
    s = s.replace(FORBIDDEN_PATTERNS[i], '[REDACTED]');
  }
  if (s.length > MAX_LOG_LEN) {
    s = s.slice(0, MAX_LOG_LEN) + '…(truncated)';
  }
  return s;
}

module.exports = {
  sanitizeForLog: sanitizeForLog,
  // Exported for tests only.
  _FORBIDDEN_PATTERNS: FORBIDDEN_PATTERNS,
  _MAX_LOG_LEN: MAX_LOG_LEN,
};
