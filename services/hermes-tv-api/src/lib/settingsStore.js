'use strict';

/**
 * settingsStore.js — File-backed per-profile settings store
 *
 * Mirrors the pattern of feat/voice-preference-persistence (lib/profileStore.js):
 *  - JSON file at HERMES_SETTINGS_STORE (default /var/lib/hermestv/settings.json)
 *  - In-memory cache hydrated on first read, kept in sync with file writes
 *  - Atomic writes: tmp file + rename so a crash mid-write cannot corrupt
 *  - Crash-safe public API: never throws — logs a warning and serves from cache
 *  - No credentials, no stream URLs, no tokens ever live in this file
 *
 * File format:
 *   {
 *     "version": 1,
 *     "settings": {
 *       "<profile_id>": { <merged settings overrides> },
 *       ...
 *     }
 *   }
 *
 * Volume note: on the VPS, /var/lib/hermestv is the shared persistence dir
 * for hermes-tv-api (settings.json today, voice prefs sibling PR). The
 * docker volume mount is declared in upstream/docker-vps/VPS_COMPOSE.yml.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STORE_VERSION = 1;
const STORE_PATH = process.env.HERMES_SETTINGS_STORE || '/var/lib/hermestv/settings.json';

// Per-profile default settings — TV-safe, no credentials.
// Profile-specific tuning lives here so a brand new TV gets a sane shape
// even before any PATCH lands.
const DEFAULT_PROFILE_SETTINGS = {
  mom_tv: {
    font_scale: 1.35,
    reduced_motion: true,
    active_layout: 'jumbo-rail',
    audio_feedback: true,
    preferred_provider: 'all',
  },
  dave_tv: {
    font_scale: 1.1,
    reduced_motion: false,
    active_layout: 'grid-standard',
    audio_feedback: false,
    preferred_provider: 'all',
  },
};

// Cache: { version, settings: { <profile_id>: {...} } }
let cache = null;
let hydrated = false;

/**
 * Make sure the parent dir exists. Best-effort: a failure here is logged
 * and the store falls back to memory-only mode (caller is unaffected).
 */
function ensureDir() {
  try {
    const dir = path.dirname(STORE_PATH);
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.warn(`[settingsStore] mkdir failed (${err.code || 'unknown'}): ${err.message} — continuing in memory-only mode`);
  }
}

/**
 * Read + parse the JSON file. Returns a fresh empty store shape on any error
 * (missing file, parse failure, partial write, etc.) so callers never see
 * a thrown exception.
 */
function readStoreFile() {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { version: STORE_VERSION, settings: {} };
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.settings || typeof parsed.settings !== 'object') {
      console.warn('[settingsStore] file shape invalid — starting fresh in-memory store');
      return { version: STORE_VERSION, settings: {} };
    }
    return { version: parsed.version || STORE_VERSION, settings: parsed.settings };
  } catch (err) {
    console.warn(`[settingsStore] read failed (${err.code || 'unknown'}): ${err.message} — using empty store`);
    return { version: STORE_VERSION, settings: {} };
  }
}

/**
 * Atomic write: stage to <file>.tmp-<pid>-<rand>, fsync, rename onto target.
 * A rename on the same filesystem is atomic on POSIX and on Windows NTFS,
 * which means a crash mid-write leaves either the old contents or the new,
 * never a half-written file. Never throws — logs and continues.
 */
function writeStoreFile(state) {
  try {
    ensureDir();
    const dir = path.dirname(STORE_PATH);
    const tmp = path.join(dir, `.settings.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`);
    const payload = JSON.stringify({ version: STORE_VERSION, settings: state.settings }, null, 2) + os.EOL;
    fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.warn(`[settingsStore] write failed (${err.code || 'unknown'}): ${err.message} — cache updated, disk skipped`);
  }
}

/**
 * Lazy hydration so import order doesn't matter and we don't pay disk cost
 * until the first call.
 */
function hydrate() {
  if (hydrated) return;
  ensureDir();
  cache = readStoreFile();
  hydrated = true;
}

/**
 * Shallow-on-top deep merge for plain objects. Arrays are replaced wholesale
 * (settings here are scalar/flat anyway, no array fields today).
 */
function deepMerge(target, patch) {
  if (!patch || typeof patch !== 'object') return target;
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * getSettings(profileId) → { ...defaults, ...persisted overrides }
 * Always returns an object. Unknown profiles get an empty {} (no defaults),
 * matching the contract that this store only knows what's been written or
 * what's in DEFAULT_PROFILE_SETTINGS.
 */
function getSettings(profileId) {
  try {
    hydrate();
    const base = DEFAULT_PROFILE_SETTINGS[profileId] || {};
    const persisted = (cache.settings && cache.settings[profileId]) || {};
    return deepMerge(base, persisted);
  } catch (err) {
    console.warn(`[settingsStore] getSettings(${profileId}) failed: ${err.message} — returning defaults`);
    return { ...(DEFAULT_PROFILE_SETTINGS[profileId] || {}) };
  }
}

/**
 * updateSettings(profileId, partial) → Promise<merged settings>
 * Deep-merges the partial into existing per-profile settings, writes the
 * whole file atomically, returns the resolved view (defaults + persisted).
 * Never throws: on write failure the cache is still updated, so the running
 * process serves correct data even if disk is temporarily unwritable.
 */
async function updateSettings(profileId, partial) {
  hydrate();
  const existing = (cache.settings && cache.settings[profileId]) || {};
  const merged = deepMerge(existing, partial || {});
  cache.settings[profileId] = merged;
  writeStoreFile(cache);
  // Return the resolved view (defaults + persisted) so callers see the
  // shape they'd get from a follow-up GET.
  return deepMerge(DEFAULT_PROFILE_SETTINGS[profileId] || {}, merged);
}

/**
 * getAllSettings() → { <profile_id>: {...resolved}, ... }
 * Debug-only. Intentionally NOT exposed via HTTP — see settings.js route.
 */
function getAllSettings() {
  hydrate();
  const out = {};
  const profileIds = new Set([
    ...Object.keys(DEFAULT_PROFILE_SETTINGS),
    ...Object.keys(cache.settings || {}),
  ]);
  for (const id of profileIds) {
    out[id] = getSettings(id);
  }
  return out;
}

/**
 * _clearCache() — test hook so unit tests can force re-hydration from disk
 * (e.g. simulating a process restart). Not part of the public contract.
 */
function _clearCache() {
  cache = null;
  hydrated = false;
}

module.exports = {
  getSettings,
  updateSettings,
  getAllSettings,
  _clearCache,
  // Exported for visibility in logs / tests, not part of the contract.
  _STORE_PATH: STORE_PATH,
  _DEFAULT_PROFILE_SETTINGS: DEFAULT_PROFILE_SETTINGS,
};
