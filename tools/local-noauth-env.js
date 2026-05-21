'use strict';

const os = require('os');
const path = require('path');

function configureLocalNoAuth(env) {
  var target = env || process.env;
  if (String(target.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('Refusing to disable DaveTV auth when NODE_ENV=production.');
  }
  target.NODE_ENV = target.NODE_ENV || 'development';
  target.DAVETV_AUTH_REQUIRED = 'false';
  target.DAVETV_AUTH_ENFORCE_API = 'false';
  target.IPTV_ORG_ENABLED = target.IPTV_ORG_ENABLED || 'true';
  target.IPTV_ORG_COUNTRIES = target.IPTV_ORG_COUNTRIES || 'US,GB,CA,AU';
  target.IPTV_ORG_CATEGORIES = target.IPTV_ORG_CATEGORIES || 'general,news,sports,movies,entertainment,kids,documentary,lifestyle,music';
  target.IPTV_ORG_CACHE_DIR = target.IPTV_ORG_CACHE_DIR || path.join(os.homedir(), '.hermestv', 'iptv-org-cache');
  return target;
}

module.exports = { configureLocalNoAuth };
