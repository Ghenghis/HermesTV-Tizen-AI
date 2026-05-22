// api/dvrClient.js — Frontend client for the /api/dvr/* routes.
import { resolveApiBase } from './apiBase.js';
//
// Mirrors the BASE_URL auto-detect logic in api/hermesApi.js so the same
// three deployment shapes (local Vite dev, LAN mirror via 192.168.x.x,
// production https://hermestv.daveai.tech) all just work without an env
// file. Tizen 6.5 / Chrome 76 compatible — no async/await, no spread in
// function bodies, no optional chaining.
//
// Backed by routes/dvr.js. The wire contract is:
//   POST   /api/dvr/schedule        body { channel_id, profile_id, start_utc, end_utc, title?, series_id? }
//   GET    /api/dvr/recordings      query ?profile_id=...
//   GET    /api/dvr/recording/:id
//   DELETE /api/dvr/recording/:id   body { profile_id }
//   POST   /api/dvr/recording/:id/play (forward-looking — backend may 503 until Phase 4)
//   GET    /api/dvr/settings
//   PATCH  /api/dvr/settings        body { profile_id, ...patch }
//
// Each function returns a Promise. Rejections carry an Error with
// `.status`, `.code`, and `.body` set when the server replied with a
// JSON envelope so the modal can render an actionable message.

var BASE_URL = resolveApiBase();

var DEFAULT_TIMEOUT_MS = 10000;

function _fetchWithTimeout(url, options, timeoutMs) {
  var timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      var err = new Error('Request timed out: ' + url);
      err.code = 'timeout';
      reject(err);
    }, timeout);
    fetch(url, options || {}).then(function(response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      clearTimeout(timer);
      var netErr = new Error('Network error: ' + (err && err.message ? err.message : 'unknown'));
      netErr.code = 'network';
      reject(netErr);
    });
  });
}

function _handleJson(response) {
  return response.json().then(function(body) {
    if (response.ok) { return body; }
    var msg = (body && body.message) ? body.message : ('HTTP ' + response.status);
    var err = new Error(msg);
    err.status = response.status;
    err.code = (body && body.error) ? body.error : 'http_error';
    err.body = body;
    throw err;
  }, function(parseErr) {
    var err = new Error('Server returned a non-JSON response (HTTP ' + response.status + ')');
    err.status = response.status;
    err.code = 'bad_response';
    err.parseError = parseErr;
    throw err;
  });
}

/**
 * Schedule a recording.
 *
 * @param {Object} opts
 * @param {string} opts.channel_id
 * @param {string} opts.profile_id  - 'dave_tv' | 'mom_tv'
 * @param {string} opts.start_utc   - ISO 8601
 * @param {string} opts.end_utc     - ISO 8601
 * @param {string=} opts.title
 * @param {string=} opts.series_id
 * @returns {Promise<{success:boolean, recording:Object}>}
 */
function scheduleRecording(opts) {
  opts = opts || {};
  var body = {
    channel_id: opts.channel_id,
    profile_id: opts.profile_id,
    start_utc: opts.start_utc,
    end_utc: opts.end_utc,
  };
  if (opts.title) { body.title = opts.title; }
  if (opts.series_id) { body.series_id = opts.series_id; }
  return _fetchWithTimeout(BASE_URL + '/api/dvr/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(_handleJson);
}

/**
 * List all recordings. Optionally filter by profile.
 * @param {string=} profileId
 * @returns {Promise<{recordings: Array, total: number}>}
 */
function listRecordings(profileId) {
  var url = BASE_URL + '/api/dvr/recordings';
  if (profileId) { url += '?profile_id=' + encodeURIComponent(profileId); }
  return _fetchWithTimeout(url, { method: 'GET' }).then(_handleJson);
}

/**
 * Fetch a single recording envelope.
 * @param {string} id
 */
function getRecording(id) {
  if (typeof id !== 'string' || id.length === 0) {
    return Promise.reject(new Error('getRecording requires a recording id'));
  }
  return _fetchWithTimeout(BASE_URL + '/api/dvr/recording/' + encodeURIComponent(id), {
    method: 'GET',
  }).then(_handleJson);
}

/**
 * Cancel or delete a recording. The backend requires a profile_id in the
 * body for the write op even for DELETE.
 * @param {string} id
 * @param {string} profileId
 */
function cancelRecording(id, profileId) {
  if (typeof id !== 'string' || id.length === 0) {
    return Promise.reject(new Error('cancelRecording requires a recording id'));
  }
  if (typeof profileId !== 'string' || profileId.length === 0) {
    return Promise.reject(new Error('cancelRecording requires a profile id'));
  }
  return _fetchWithTimeout(BASE_URL + '/api/dvr/recording/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId }),
  }).then(_handleJson);
}

/**
 * Request a stream ticket for a completed recording. The backend route
 * (`POST /api/dvr/recording/:id/play`) is forward-looking — until the
 * Phase 4 muxer lands, the server will return 503 with a friendly
 * `message`. Callers should treat the 503 as a "pipeline pending"
 * state and surface the message verbatim instead of an error toast.
 *
 * Response shape (when implemented):
 *   { success: true, ticket: { stream_endpoint, expires_at, item: {...}, provider: {...} } }
 *
 * @param {string} id  recording_id
 * @param {string=} profileId  Optional — sent in the body so the backend
 *   can scope auth the same way it does for cancel/schedule.
 */
function playRecording(id, profileId) {
  if (typeof id !== 'string' || id.length === 0) {
    return Promise.reject(new Error('playRecording requires a recording id'));
  }
  var body = {};
  if (typeof profileId === 'string' && profileId.length > 0) {
    body.profile_id = profileId;
  }
  return _fetchWithTimeout(BASE_URL + '/api/dvr/recording/' + encodeURIComponent(id) + '/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(_handleJson);
}

/**
 * Fetch the global DVR settings envelope.
 * @returns {Promise<Object>}
 */
function getSettings() {
  return _fetchWithTimeout(BASE_URL + '/api/dvr/settings', { method: 'GET' }).then(_handleJson);
}

/**
 * Patch the global DVR settings. profile_id is required in the body.
 * @param {Object} patch
 * @param {string} patch.profile_id
 */
function patchSettings(patch) {
  patch = patch || {};
  return _fetchWithTimeout(BASE_URL + '/api/dvr/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).then(_handleJson);
}

/**
 * Bulk-cancel/delete multiple recordings in parallel.
 *
 * The backend has no native bulk endpoint — Phase 4 may add one, but until
 * then this just fans out N concurrent DELETE calls. We wrap each one in a
 * `.then(...).catch(...)` so a single failure doesn't reject the whole
 * batch — instead, callers get a settled-style result list they can use to
 * show per-row error toasts.
 *
 * Returns Promise<Array<{id, ok, error?}>> with one entry per input id, in
 * the same order. Never rejects (unless inputs are invalid).
 *
 * @param {Array<string>} ids
 * @param {string} profileId
 */
function deleteMany(ids, profileId) {
  if (!Array.isArray(ids)) {
    return Promise.reject(new Error('deleteMany requires an array of ids'));
  }
  if (typeof profileId !== 'string' || profileId.length === 0) {
    return Promise.reject(new Error('deleteMany requires a profile id'));
  }
  if (ids.length === 0) { return Promise.resolve([]); }
  var jobs = ids.map(function(id) {
    return cancelRecording(id, profileId).then(function() {
      return { id: id, ok: true };
    }, function(err) {
      var msg = (err && err.message) ? err.message : 'Could not delete recording.';
      return { id: id, ok: false, error: msg };
    });
  });
  return Promise.all(jobs);
}

/**
 * Fetch aggregate storage stats for the recording library.
 *
 * The /api/dvr/storage-stats endpoint is **forward-looking** — until the
 * Phase 4 muxer lands the server may not implement it, in which case the
 * route returns 404. We catch that here and resolve with a sentinel
 * envelope (`available: false`) so the caller can render
 * "Storage stats unavailable" without error styling.
 *
 * Any other failure (network, 5xx, malformed body) is also normalised to
 * the same shape — the caller never has to handle a rejection.
 *
 * Expected shape when implemented:
 *   { available: true,
 *     used_bytes: number,
 *     total_bytes: number,
 *     recording_count: number,
 *     average_bytes: number }
 *
 * @returns {Promise<Object>}
 */
function getStorageStats() {
  return _fetchWithTimeout(BASE_URL + '/api/dvr/storage-stats', { method: 'GET' })
    .then(_handleJson)
    .then(function(body) {
      if (!body || typeof body !== 'object') {
        return { available: false, reason: 'bad_response' };
      }
      return Object.assign({ available: true }, body);
    }, function(err) {
      var code = err && err.code ? err.code : 'unknown';
      return { available: false, reason: code, status: err && err.status };
    });
}

export {
  scheduleRecording,
  listRecordings,
  getRecording,
  cancelRecording,
  playRecording,
  getSettings,
  patchSettings,
  deleteMany,
  getStorageStats,
};
