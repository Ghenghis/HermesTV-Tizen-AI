'use strict';

const { configureLocalNoAuth } = require('./local-noauth-env');

try {
  configureLocalNoAuth(process.env);
} catch (err) {
  console.error('[DaveTV] ' + (err && err.message ? err.message : String(err)));
  process.exit(1);
}

console.warn('[DaveTV] Local dev auth is disabled for this API process only.');
console.warn('[DaveTV] Production still defaults to DAVETV_AUTH_REQUIRED=true.');
console.warn('[DaveTV] iptv-org public channels enabled for local dev; cache=' + process.env.IPTV_ORG_CACHE_DIR);

require('../services/hermes-tv-api/src/index.js');
