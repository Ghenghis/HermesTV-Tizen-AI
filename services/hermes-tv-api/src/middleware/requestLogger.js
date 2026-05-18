'use strict';

/**
 * Request logger middleware.
 * Logs: [HermesAPI] METHOD /path → STATUS Xms
 * Never logs body content — bodies may contain credentials.
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[HermesAPI] ${req.method} ${req.path} → ${res.statusCode} ${ms}ms`);
  });

  next();
}

module.exports = requestLogger;
