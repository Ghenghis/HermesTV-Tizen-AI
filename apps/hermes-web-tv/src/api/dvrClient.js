// api/dvrClient.js — Frontend client for the /api/dvr/* routes.
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
//   GET    /api/dvr/settings
//   PATCH  /api/dvr/settings        body { profile_id, ...patch }
//
// Each function returns a Promise. Rejections carry an Error with
// `.status`, `.code`, and `.body` set when the server replied with a
// JSON envelope so the modal can render an actionable message.

var BASE_URL = (function() {
  if (typeof window === 'undefined') { return ''; }
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') { return 'http://localhost:3001'; }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) { return 'http://' + h + ':3001'; }
  if (h === 'hermestv.local') { return 'http://hermestv.local'; }
  return '';
})();

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

export {
  scheduleRecording,
  listRecordings,
  getRecording,
  cancelRecording,
  getSettings,
  patchSettings,
};
