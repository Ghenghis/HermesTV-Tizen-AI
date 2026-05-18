'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// azureVoices.js — In-memory cache of the Azure Cognitive Services voice
// catalog, FILTERED TO ENGLISH LOCALES ONLY (en-*). At boot we fetch from
//   GET https://<region>.tts.speech.microsoft.com/cognitiveservices/voices/list
// then drop any voice whose Locale does not start with "en-". This yields
// roughly 99-110 English Neural voices (US, GB, AU, CA, IE, IN, KE, NG, NZ,
// PH, SG, TZ, ZA, HK) — the only ones Sherri and Dave will ever hear. We
// keep the cached result for 24h. On 401 the cache is invalidated so the
// next call refreshes it. When AZURE_TTS_KEY is missing we transparently
// fall back to the hand-curated 12-voice catalog so dev / offline still works.
//
// Public surface:
//   getCuratedVoices()      → the original 12 hand-picked voices (with sample lines)
//   getAllVoices(opts?)     → Promise<{voices, source, cachedAt}> — English voices
//   getVoiceById(id)        → Promise<voice | null>
//   refreshCache()          → Promise<{voices, source, cachedAt}>
//   isCurated(id)           → boolean
//
// Network: uses global fetch (Node 20+). No new dependencies.
// ─────────────────────────────────────────────────────────────────────────────

// Locale prefix used to filter the Azure catalog down to English voices only.
// Sherri and Dave speak English; loading 600+ voices in the picker would be
// hostile for QN85 remote-driven navigation.
const ENGLISH_LOCALE_PREFIX = 'en-';

// ── Curated 12 (was VOICE_CATALOG in routes/tts.js) ──────────────────────────
const CURATED_VOICES = [
  { id: 'en-US-AriaNeural',    name: 'Aria',    gender: 'female', locale: 'en-US', tone: 'warm',         sample: 'Hi Sherri! What would you like to watch tonight?' },
  { id: 'en-US-JennyNeural',   name: 'Jenny',   gender: 'female', locale: 'en-US', tone: 'friendly',     sample: 'Hello! I am here to help you find something great.' },
  { id: 'en-US-SaraNeural',    name: 'Sara',    gender: 'female', locale: 'en-US', tone: 'cheerful',     sample: 'Movie night! Let me know what mood you are in.' },
  { id: 'en-US-NancyNeural',   name: 'Nancy',   gender: 'female', locale: 'en-US', tone: 'calm',         sample: 'Just relax. I will queue something nice for you.' },
  { id: 'en-US-AmberNeural',   name: 'Amber',   gender: 'female', locale: 'en-US', tone: 'confident',    sample: 'Ready when you are. Pick a category to begin.' },
  { id: 'en-US-AshleyNeural',  name: 'Ashley',  gender: 'female', locale: 'en-US', tone: 'gentle',       sample: 'Whenever you are ready, I am right here.' },
  { id: 'en-GB-SoniaNeural',   name: 'Sonia',   gender: 'female', locale: 'en-GB', tone: 'british',      sample: 'Good evening. Shall we look at the films?' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha', gender: 'female', locale: 'en-AU', tone: 'australian',   sample: 'G\'day! Which channel takes your fancy?' },
  { id: 'en-US-GuyNeural',     name: 'Guy',     gender: 'male',   locale: 'en-US', tone: 'casual',       sample: 'Hey Dave, what are we watching?' },
  { id: 'en-US-DavisNeural',   name: 'Davis',   gender: 'male',   locale: 'en-US', tone: 'professional', sample: 'Good evening. Your library is ready.' },
  { id: 'en-US-TonyNeural',    name: 'Tony',    gender: 'male',   locale: 'en-US', tone: 'energetic',    sample: 'Movie night! Lets find a winner.' },
  { id: 'en-GB-RyanNeural',    name: 'Ryan',    gender: 'male',   locale: 'en-GB', tone: 'british',      sample: 'Right then, what is on tonight?' },
];

const CURATED_IDS = new Set(CURATED_VOICES.map(function(v) { return v.id; }));

// ── Cache state ──────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let cache = null;          // { voices, cachedAt, source }
let inFlight = null;       // dedup concurrent refreshes
let refreshCount = 0;      // observability counter

function azureConfigured() {
  return !!(process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION);
}

function nowMs() { return Date.now(); }

function cacheFresh() {
  if (!cache) return false;
  return (nowMs() - cache.cachedAt) < CACHE_TTL_MS;
}

// ── Normalise an Azure voice entry to our flat shape ─────────────────────────
// Azure returns:
//   { Name, DisplayName, LocalName, ShortName, Gender, Locale, LocaleName,
//     SampleRateHertz, VoiceType, Status, StyleList, RolePlayList, VoiceTag, ... }
// We map to lower-case keys our UI already understands, plus extras.
function normaliseAzureVoice(v) {
  const id = v.ShortName || v.Name || '';
  const gender = String(v.Gender || '').toLowerCase();
  const locale = v.Locale || '';
  const displayName = v.DisplayName || v.LocalName || stripLocaleFromShortName(id);
  const localName = v.LocalName || displayName;
  const styles = Array.isArray(v.StyleList) ? v.StyleList.slice() : [];
  const roles = Array.isArray(v.RolePlayList) ? v.RolePlayList.slice() : [];
  return {
    id: id,
    name: displayName,
    local_name: localName,
    gender: gender,
    locale: locale,
    locale_name: v.LocaleName || locale,
    voice_type: v.VoiceType || '',
    sample_rate_hz: v.SampleRateHertz || null,
    styles: styles,
    roles: roles,
    sample: makeDefaultSample(displayName, locale),
    recommended: CURATED_IDS.has(id),
  };
}

function stripLocaleFromShortName(short) {
  // e.g. "en-US-AriaNeural" → "Aria"
  const m = /^[a-z]{2,3}-[A-Z]{2}-(.+?)(Neural|Multilingual|HD)?$/.exec(short);
  if (m && m[1]) return m[1];
  return short;
}

function makeDefaultSample(name, locale) {
  return 'Hello, this is the ' + name + ' voice in ' + locale + '.';
}

// ── Fetch the live catalog from Azure ────────────────────────────────────────
function fetchAzureCatalog() {
  if (!azureConfigured()) {
    return Promise.resolve({
      voices: CURATED_VOICES.map(function(v) {
        return Object.assign({}, v, { recommended: true });
      }),
      source: 'fallback_curated',
      cachedAt: nowMs(),
    });
  }
  const region = process.env.AZURE_TTS_REGION;
  const key = process.env.AZURE_TTS_KEY;
  const url = 'https://' + region + '.tts.speech.microsoft.com/cognitiveservices/voices/list';

  // 10s timeout via AbortController (Node 20+ has both fetch + AbortController globally)
  const ctrl = new AbortController();
  const timer = setTimeout(function() { ctrl.abort(); }, 10000);

  return fetch(url, {
    method: 'GET',
    headers: { 'Ocp-Apim-Subscription-Key': key },
    signal: ctrl.signal,
  })
    .then(function(res) {
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        // Auth failure — invalidate any stale cache and surface the error.
        cache = null;
        const err = new Error('Azure voices/list returned ' + res.status);
        err.code = 'AZURE_UNAUTHORIZED';
        err.status = res.status;
        throw err;
      }
      if (!res.ok) {
        const err = new Error('Azure voices/list returned HTTP ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.json();
    })
    .then(function(list) {
      if (!Array.isArray(list)) {
        throw new Error('Azure voices/list returned non-array body');
      }
      const voices = list
        .map(normaliseAzureVoice)
        .filter(function(v) {
          // English locales only (en-US, en-GB, en-AU, en-CA, en-IE, en-IN,
          // en-KE, en-NG, en-NZ, en-PH, en-SG, en-TZ, en-ZA, en-HK).
          return !!v.id && typeof v.locale === 'string' &&
            v.locale.indexOf(ENGLISH_LOCALE_PREFIX) === 0;
        });
      // Overlay curated samples onto matching live entries so the curated 12
      // keep their Mom-friendly preview lines.
      const curatedById = {};
      CURATED_VOICES.forEach(function(v) { curatedById[v.id] = v; });
      voices.forEach(function(v) {
        if (curatedById[v.id]) {
          v.sample = curatedById[v.id].sample;
          v.tone = curatedById[v.id].tone;
          v.recommended = true;
        }
      });
      return {
        voices: voices,
        source: 'azure_live',
        cachedAt: nowMs(),
      };
    })
    .catch(function(err) {
      clearTimeout(timer);
      throw err;
    });
}

// ── Public API ───────────────────────────────────────────────────────────────
function getCuratedVoices() {
  // Return a defensive copy so callers cannot mutate the module-private array.
  return CURATED_VOICES.map(function(v) { return Object.assign({}, v); });
}

function isCurated(id) {
  return CURATED_IDS.has(id);
}

function getAllVoices(opts) {
  const forceRefresh = !!(opts && opts.force);
  if (!forceRefresh && cacheFresh()) {
    return Promise.resolve(cache);
  }
  if (inFlight) return inFlight;
  inFlight = fetchAzureCatalog()
    .then(function(result) {
      cache = result;
      refreshCount++;
      inFlight = null;
      return result;
    })
    .catch(function(err) {
      inFlight = null;
      // On error, if we have any stale cache, keep serving it (gracefully).
      if (cache) {
        console.warn('[azureVoices] refresh failed (' + err.message + ') — serving stale cache');
        return cache;
      }
      // No cache and no key → fallback curated.
      if (!azureConfigured()) {
        cache = {
          voices: CURATED_VOICES.map(function(v) {
            return Object.assign({}, v, { recommended: true });
          }),
          source: 'fallback_curated',
          cachedAt: nowMs(),
        };
        return cache;
      }
      // Have a key but Azure refused — return fallback so UI still works.
      console.error('[azureVoices] Azure unreachable: ' + err.message);
      cache = {
        voices: CURATED_VOICES.map(function(v) {
          return Object.assign({}, v, { recommended: true });
        }),
        source: 'fallback_curated_on_error',
        cachedAt: nowMs(),
        error: err.message,
      };
      return cache;
    });
  return inFlight;
}

function getVoiceById(id) {
  if (!id) return Promise.resolve(null);
  return getAllVoices().then(function(r) {
    for (let i = 0; i < r.voices.length; i++) {
      if (r.voices[i].id === id) return r.voices[i];
    }
    return null;
  });
}

function refreshCache() {
  cache = null;
  return getAllVoices({ force: true });
}

function getCacheStats() {
  return {
    has_cache: !!cache,
    source: cache ? cache.source : null,
    cached_at: cache ? cache.cachedAt : null,
    age_ms: cache ? (nowMs() - cache.cachedAt) : null,
    voice_count: cache ? cache.voices.length : 0,
    refresh_count: refreshCount,
    azure_configured: azureConfigured(),
  };
}

// ── Warm the cache at module load (best-effort, never throws to caller) ──────
// We kick off a refresh but do not await — the first request will await it via
// getAllVoices().
try {
  getAllVoices().catch(function(err) {
    console.warn('[azureVoices] initial warm failed: ' + err.message);
  });
} catch (e) {
  // Defensive: never let module init blow up the server boot.
}

module.exports = {
  getCuratedVoices: getCuratedVoices,
  getAllVoices: getAllVoices,
  getVoiceById: getVoiceById,
  refreshCache: refreshCache,
  isCurated: isCurated,
  getCacheStats: getCacheStats,
  CURATED_VOICES: CURATED_VOICES,
};
