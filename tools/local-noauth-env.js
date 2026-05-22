'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PRIVATE_ENV_ALLOWLIST = {
  AZURE_TTS_KEY: true,
  AZURE_TTS_REGION: true,
  AZURE_SPEECH_KEY: true,
  AZURE_SPEECH_REGION: true,
};

function parseEnvLine(line) {
  var m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line || '');
  if (!m) { return null; }
  var value = m[2] || '';
  if ((value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') ||
      (value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")) {
    value = value.slice(1, -1);
  }
  return { key: m[1], value: value };
}

function loadWhitelistedEnvFile(env, filePath) {
  var target = env || process.env;
  var loaded = [];
  if (!filePath || !fs.existsSync(filePath)) { return loaded; }
  var lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    if (/^\s*(#|$)/.test(lines[i])) { continue; }
    var parsed = parseEnvLine(lines[i]);
    if (!parsed || !PRIVATE_ENV_ALLOWLIST[parsed.key]) { continue; }
    if (parsed.value.length === 0) { continue; }
    if (target[parsed.key] === undefined || target[parsed.key] === '') {
      target[parsed.key] = parsed.value;
      loaded.push(parsed.key);
    }
  }
  return loaded;
}

function loadLocalPrivateEnv(env) {
  var explicit = process.env.DAVETV_LOCAL_ENV_FILE;
  var candidates = [];
  if (explicit) { candidates.push(explicit); }
  candidates.push('G:\\private\\.env');
  candidates.push(path.join(os.homedir(), 'DaveTV', 'private', '.env'));
  var loaded = [];
  for (var i = 0; i < candidates.length; i++) {
    var keys = loadWhitelistedEnvFile(env, candidates[i]);
    for (var j = 0; j < keys.length; j++) {
      if (loaded.indexOf(keys[j]) === -1) { loaded.push(keys[j]); }
    }
  }
  return loaded;
}

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

module.exports = {
  configureLocalNoAuth: configureLocalNoAuth,
  loadLocalPrivateEnv: loadLocalPrivateEnv,
  loadWhitelistedEnvFile: loadWhitelistedEnvFile,
};
