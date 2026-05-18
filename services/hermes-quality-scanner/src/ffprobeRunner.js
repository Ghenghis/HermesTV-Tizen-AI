'use strict';

const { execFile } = require('child_process');

// Use FFPROBE_PATH env var if set, otherwise rely on PATH.
const FFPROBE_BIN = process.env.FFPROBE_PATH || 'ffprobe';

// ffprobe timeout: 15 s expressed in microseconds for the -timeout flag.
// execFile timeout: 20 s wall-clock safety net.
const FFPROBE_TIMEOUT_US = 15000000;
const EXEC_TIMEOUT_MS = 20000;

/**
 * Run ffprobe against a stream URL.
 *
 * SECURITY: streamUrl is NEVER logged. Only streamId and providerId are safe
 * to include in log output because streamUrl may contain authentication tokens.
 *
 * @param {string} streamId    Safe identifier for log output.
 * @param {string} providerId  Safe provider label for log output.
 * @param {string} streamUrl   The IPTV stream URL — never logged.
 * @param {function(err, raw)} callback
 *   err  → { code, message, stream_id, failure_mode }
 *   raw  → parsed ffprobe JSON object
 */
function probe(streamId, providerId, streamUrl, callback) {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    '-timeout', String(FFPROBE_TIMEOUT_US),
    streamUrl,
  ];

  const startMs = Date.now();

  // Log the start without the URL.
  console.log(`[ffprobe] START stream_id=${streamId} provider_id=${providerId}`);

  execFile(
    FFPROBE_BIN,
    args,
    { timeout: EXEC_TIMEOUT_MS },
    function (err, stdout, _stderr) {
      const durationMs = Date.now() - startMs;

      if (err) {
        let failureMode = 'probe_error';

        if (err.killed || err.signal === 'SIGTERM' || durationMs >= EXEC_TIMEOUT_MS) {
          failureMode = 'timeout';
        } else if (err.code === 'ECONNREFUSED') {
          failureMode = 'connection_refused';
        } else if (
          typeof err.message === 'string' &&
          (err.message.includes('401') || err.message.includes('403') ||
           err.message.includes('Unauthorized') || err.message.includes('Forbidden'))
        ) {
          failureMode = 'auth_failed';
        } else if (
          typeof err.message === 'string' &&
          err.message.includes('Invalid data found')
        ) {
          failureMode = 'unsupported_codec';
        }

        console.error(
          `[ffprobe] FAIL stream_id=${streamId} provider_id=${providerId} ` +
          `failure_mode=${failureMode} duration_ms=${durationMs}`
        );

        return callback({
          code: err.code,
          message: 'ffprobe failed',
          stream_id: streamId,
          failure_mode: failureMode,
          probe_duration_ms: durationMs,
        });
      }

      let raw;
      try {
        raw = JSON.parse(stdout);
      } catch (parseErr) {
        console.error(
          `[ffprobe] PARSE_ERROR stream_id=${streamId} provider_id=${providerId} duration_ms=${durationMs}`
        );
        return callback({
          code: 'PARSE_ERROR',
          message: 'JSON parse failed',
          stream_id: streamId,
          failure_mode: 'parse_error',
          probe_duration_ms: durationMs,
        });
      }

      console.log(
        `[ffprobe] OK stream_id=${streamId} provider_id=${providerId} duration_ms=${durationMs}`
      );

      // Attach probe duration so the normalizer can embed it in scan_meta.
      raw.__probe_duration_ms = durationMs;

      callback(null, raw);
    }
  );
}

module.exports = { probe };
