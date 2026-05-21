// api/playlistClient.js — Frontend client for the /api/playlists/* routes.
import { resolveApiBase } from './apiBase.js';
//
// Mirrors the BASE_URL auto-detect logic in api/hermesApi.js so the same
// three deployment shapes (local Vite dev, LAN mirror via 192.168.x.x,
// production https://hermestv.daveai.tech) all just work without an env
// file. Tizen 6.5 / Chrome 76 compatible — no fetch options that need
// async/await transpilation, no AbortController where it isn't necessary.
//
// Honest error paths: every reject carries a human-readable message AND
// the upstream error code so the modal can render a "Try again" hint
// versus a "Not implemented yet" hint without guessing.
//
// Exports:
//   previewPlaylist({ type, url, file, credentials }) → Promise<preview>
//   savePlaylist({ name, provider_id, source }) → Promise<record>
//   listPlaylists() → Promise<{ playlists: [], total }>
//   deletePlaylist(id) → Promise<{ deleted: true, id }>

var BASE_URL = resolveApiBase();

var DEFAULT_TIMEOUT_MS = 20000; // a touch generous since /preview fetches an external URL

function _fetchWithTimeout(url, options, timeoutMs) {
  var timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      var err = new Error('Request timed out: ' + url);
      err.code = 'timeout';
      reject(err);
    }, timeout);
    var finalOptions = Object.assign({ credentials: 'include' }, options || {});
    fetch(url, finalOptions).then(function(response) {
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

// Common JSON envelope handler. Resolves on 2xx, rejects with an Error that
// carries `.status`, `.code`, and the upstream body for honest UI hints.
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

// Build the wire body for /preview and /save from the modal's source shape.
// The modal passes `{ type, url, file, credentials }` where `file` is the
// raw text contents (already read by FileReader on the client) and
// `credentials` carries Xtream / Stalker fields. This keeps the wire shape
// flat and uniform regardless of source type.
function _buildSourceBody(source) {
  source = source || {};
  var type = source.type;
  if (type === 'url') {
    return { type: 'url', url: source.url };
  }
  if (type === 'file') {
    return { type: 'file', text: source.file || source.text || '' };
  }
  if (type === 'xtream') {
    var c = source.credentials || {};
    return {
      type: 'xtream',
      host: c.host || '',
      username: c.username || '',
      password: c.password || '',
    };
  }
  if (type === 'stalker') {
    var s = source.credentials || {};
    return {
      type: 'stalker',
      portal_url: s.portal_url || '',
      mac: s.mac || '',
    };
  }
  // Unknown — pass through so the server's 400 surfaces the real reason.
  return { type: type };
}

/**
 * Preview a source.
 *
 * @param {Object}  source
 * @param {string}  source.type  - 'url' | 'file' | 'xtream' | 'stalker'
 * @param {string=} source.url
 * @param {string=} source.file  - raw m3u text (already read from <input type="file">)
 * @param {Object=} source.credentials
 * @returns {Promise<{channels_count:number, groups_count:number, sample_channels:string[], _meta:Object}>}
 */
function previewPlaylist(source) {
  var body = _buildSourceBody(source);
  return _fetchWithTimeout(BASE_URL + '/api/playlists/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(_handleJson);
}

/**
 * Persist a previewed playlist under a chosen name + provider tag.
 *
 * @param {Object} args
 * @param {string} args.name
 * @param {string} args.provider_id  - 'apollo_group' | 'xtremehd' | 'custom'
 * @param {Object} args.source       - same shape as previewPlaylist input
 * @returns {Promise<{id:string, name:string, provider_id:string, channels_count:number, created_at:string}>}
 */
function savePlaylist(args) {
  args = args || {};
  var body = {
    name: args.name,
    provider_id: args.provider_id,
    source: _buildSourceBody(args.source),
  };
  return _fetchWithTimeout(BASE_URL + '/api/playlists/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(_handleJson);
}

function listPlaylists() {
  return _fetchWithTimeout(BASE_URL + '/api/playlists', { method: 'GET' }).then(_handleJson);
}

function deletePlaylist(id) {
  if (typeof id !== 'string' || id.length === 0) {
    return Promise.reject(new Error('deletePlaylist requires a playlist id'));
  }
  return _fetchWithTimeout(BASE_URL + '/api/playlists/' + encodeURIComponent(id), {
    method: 'DELETE',
  }).then(_handleJson);
}

export { previewPlaylist, savePlaylist, listPlaylists, deletePlaylist };
