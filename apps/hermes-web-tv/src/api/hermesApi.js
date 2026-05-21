import { resolveApiBase, buildApiUrl as _buildApiUrl } from './apiBase.js';

var BASE_URL = resolveApiBase();

function getApiBaseUrl() {
  return BASE_URL;
}

function buildApiUrl(path) {
  return _buildApiUrl(path, BASE_URL);
}
// Cold-cache /api/catalog returns ~540 KB over Cloudflare; on a cold worker
// the full transfer occasionally crosses 8 s. Bumped to 20 s so Mom doesn't
// see "Profile load failed: Request timed out" on cold boot. The /health
// probe stays tight at 3 s — it's a single byte response and a 3 s timeout
// is still the right "reachable?" signal.
var DEFAULT_TIMEOUT = 20000;
var HEALTH_TIMEOUT = 3000;

function makeNetworkError(message) {
  var err = new Error(message);
  err.offline = true;
  return err;
}

function fetchWithTimeout(url, options, timeoutMs) {
  var timeout = timeoutMs || DEFAULT_TIMEOUT;
  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(makeNetworkError('Request timed out: ' + url));
    }, timeout);

    var finalOptions = Object.assign({ credentials: 'include' }, options || {});
    fetch(url, finalOptions).then(function(response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      clearTimeout(timer);
      var networkErr = makeNetworkError('Network error: ' + (err.message || 'unknown'));
      reject(networkErr);
    });
  });
}

function getAuthMe() {
  return fetchWithTimeout(BASE_URL + '/api/auth/me', { method: 'GET' }, HEALTH_TIMEOUT).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Auth status failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

function login(email, password) {
  return fetchWithTimeout(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password }),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Login failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function logout() {
  return fetchWithTimeout(BASE_URL + '/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).then(function(response) {
    if (!response.ok) { throw makeNetworkError('Logout failed: HTTP ' + response.status); }
    return response.json();
  });
}

function registerWithToken(token, password) {
  return fetchWithTimeout(BASE_URL + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token, password: password }),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Registration failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function requestPasswordReset(email) {
  return fetchWithTimeout(BASE_URL + '/api/auth/password/forgot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email }),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Reset request failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function resetPassword(token, password) {
  return fetchWithTimeout(BASE_URL + '/api/auth/password/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token, password: password }),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Password reset failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function getAdminUsers() {
  return fetchWithTimeout(BASE_URL + '/api/admin/users').then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Admin users failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function createInvite(args) {
  return fetchWithTimeout(BASE_URL + '/api/admin/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Invite failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function createUserAccount(args) {
  return fetchWithTimeout(BASE_URL + '/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Account creation failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function adminSetPassword(userId, password) {
  return fetchWithTimeout(BASE_URL + '/api/admin/users/' + encodeURIComponent(userId) + '/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password }),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = new Error((body && body.message) || ('Password update failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function isReachable() {
  return fetchWithTimeout(BASE_URL + '/health', { method: 'GET' }, HEALTH_TIMEOUT).then(function(response) {
    return response.ok;
  }).catch(function() {
    return false;
  });
}

function getProfile(profileId) {
  return fetchWithTimeout(BASE_URL + '/api/profile/' + profileId).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Profile fetch failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

// PATCH /api/profiles/:id — partial update of a profile record.
// Whitelisted fields (server-side): display_name, agent_name, preferred_voice_id,
// font_scale, audio_feedback, reduced_motion, active_theme. Returns the updated
// record on success. Throws a network-style Error on HTTP >= 400 with the
// server's message stitched on so the modal can surface "Profile saved" /
// "Mom Mode requires font_scale >= 1.25" verbatim.
function patchProfile(profileId, patch) {
  return fetchWithTimeout(BASE_URL + '/api/profiles/' + encodeURIComponent(profileId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  }).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var msg = (body && body.message) ? body.message : ('Profile save failed: HTTP ' + response.status);
        var err = new Error(msg);
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function getProviders(options) {
  options = options || {};
  var url = BASE_URL + '/api/providers';
  var fetchOptions = undefined;
  if (options.refresh === true) {
    url += '?refresh=1&_ts=' + encodeURIComponent(String(Date.now()));
    fetchOptions = {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    };
  }
  return fetchWithTimeout(url, fetchOptions).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Providers fetch failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

// Wave-20 — multi-provider CRUD endpoints backing the AddProviderModal.
// Every payload is JSON. The server returns MASKED rows (no username /
// password) on every endpoint except /parse-qr (which returns the parsed
// candidate fields back to the same client that just submitted the raw
// QR text, so the confirm sub-step can pre-fill the form).
function listProviders() {
  return fetchWithTimeout(BASE_URL + '/api/providers').then(function(response) {
    if (!response.ok) { throw makeNetworkError('Providers list failed: HTTP ' + response.status); }
    return response.json();
  });
}

function addProvider(body) {
  return fetchWithTimeout(BASE_URL + '/api/providers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(function(response) {
    return response.json().then(function(parsed) {
      parsed._status = response.status;
      if (!response.ok && response.status !== 201) {
        var msg = (parsed && parsed.errors && parsed.errors.length > 0)
          ? parsed.errors.join('; ')
          : ('Add provider failed: HTTP ' + response.status);
        var err = new Error(msg);
        err.status = response.status;
        err.body = parsed;
        throw err;
      }
      return parsed;
    });
  });
}

function updateProvider(id, patch) {
  return fetchWithTimeout(BASE_URL + '/api/providers/' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {}),
  }).then(function(response) {
    return response.json().then(function(parsed) {
      parsed._status = response.status;
      if (!response.ok) {
        var msg = (parsed && parsed.errors && parsed.errors.length > 0)
          ? parsed.errors.join('; ')
          : ('Update provider failed: HTTP ' + response.status);
        var err = new Error(msg);
        err.status = response.status;
        err.body = parsed;
        throw err;
      }
      return parsed;
    });
  });
}

function removeProvider(id) {
  return fetchWithTimeout(BASE_URL + '/api/providers/' + encodeURIComponent(id), {
    method: 'DELETE',
  }).then(function(response) {
    if (response.status === 204) { return { ok: true }; }
    return response.json().then(function(parsed) {
      var err = new Error((parsed && parsed.message) || ('Remove provider failed: HTTP ' + response.status));
      err.status = response.status;
      err.body = parsed;
      throw err;
    });
  });
}

function testProvider(id) {
  return fetchWithTimeout(BASE_URL + '/api/providers/' + encodeURIComponent(id) + '/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }, 15000).then(function(response) {
    return response.json().then(function(parsed) {
      parsed._status = response.status;
      return parsed;
    });
  });
}

function parseQrText(text) {
  return fetchWithTimeout(BASE_URL + '/api/providers/parse-qr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: String(text || '') }),
  }).then(function(response) {
    return response.json().then(function(parsed) {
      parsed._status = response.status;
      return parsed;
    });
  });
}

function getCatalog(options) {
  options = options || {};
  var url = BASE_URL + '/api/catalog';
  var qs = [];
  var fetchOptions = undefined;
  var timeoutMs = undefined;
  if (options.refresh === true) {
    qs.push('refresh=1');
    qs.push('_ts=' + encodeURIComponent(String(Date.now())));
    fetchOptions = {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    };
  }
  if (typeof options.waitForColdMs === 'number' && options.waitForColdMs > 0) {
    qs.push('wait_for_cold_ms=' + encodeURIComponent(String(Math.floor(options.waitForColdMs))));
    timeoutMs = Math.max(DEFAULT_TIMEOUT, Math.floor(options.waitForColdMs) + 5000);
  }
  if (qs.length > 0) { url += '?' + qs.join('&'); }
  return fetchWithTimeout(url, fetchOptions, timeoutMs).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Catalog fetch failed: HTTP ' + response.status);
    }
    var sourceHeader = response.headers.get('X-Catalog-Source') || null;
    return response.json().then(function(body) {
      // Surface the response header on the returned object so the UI can
      // render an honest "data source" badge (Live providers / Jellyfin /
      // iptv-org / empty). Tizen 6.5 / Chrome 76 safe — no spread.
      body._source_header = sourceHeader;
      return body;
    });
  });
}

function getEpg(channelId) {
  return fetchWithTimeout(BASE_URL + '/api/epg/' + channelId).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('EPG fetch failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

function getSeriesDetails(seriesId, profileId) {
  var qs = profileId ? ('?profile_id=' + encodeURIComponent(profileId)) : '';
  return fetchWithTimeout(BASE_URL + '/api/series/' + encodeURIComponent(seriesId) + qs).then(function(response) {
    return response.json().then(function(body) {
      if (!response.ok) {
        var err = makeNetworkError((body && body.message) || ('Series details failed: HTTP ' + response.status));
        err.status = response.status;
        err.body = body;
        throw err;
      }
      return body;
    });
  });
}

function submitCommand(commandEnvelope) {
  return fetchWithTimeout(BASE_URL + '/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(commandEnvelope),
  }).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Command submit failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

function validateCommand(payload) {
  return fetchWithTimeout(BASE_URL + '/api/ui-command/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Command validation failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

/**
 * Request a play ticket for the given catalog item. Returns the ticket envelope
 * from POST /api/play (no stream URL — server keeps that). Throws on HTTP error
 * or network failure.
 */
function startPlayback(args) {
  return fetchWithTimeout(BASE_URL + '/api/play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  }).then(function(response) {
    if (!response.ok) {
      var err = makeNetworkError('Play ticket request failed: HTTP ' + response.status);
      err.status = response.status;
      throw err;
    }
    return response.json();
  });
}

/**
 * Request a download for a movie / episode / series item. Until the real
 * server-side download worker exists, the API returns an honest 503
 * download_pipeline_not_available body with no job_id or size fields.
 *
 * Resolves with the server JSON body on any status. Caller is responsible
 * for branching on body.error so the UI can present the route's concrete
 * reason instead of pretending a queue exists.
 */
function startDownload(args) {
  return fetchWithTimeout(BASE_URL + '/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  }).then(function(response) {
    return response.json().then(function(body) {
      body._status = response.status;
      return body;
    });
  });
}

function listDownloads() {
  return fetchWithTimeout(BASE_URL + '/api/downloads').then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Downloads list failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

function cancelDownload(jobId) {
  return fetchWithTimeout(BASE_URL + '/api/download/' + encodeURIComponent(jobId), {
    method: 'DELETE',
  }).then(function(response) {
    return response.json().then(function(body) {
      body._status = response.status;
      return body;
    });
  });
}

/**
 * Mint a fresh pairing code for the "Add a Provider" QR flow.
 * Returns { pairing_code, setup_url, status, issued_at, expires_at, ttl_ms }
 * from POST /api/pair. The TV displays the pairing_code under the QR and then
 * polls getPairingStatus(code) every 5s until status === 'completed'.
 */
function createPairing() {
  return fetchWithTimeout(BASE_URL + '/api/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }).then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Pairing create failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

/**
 * Poll for pairing completion. Returns the envelope from GET /api/pair/:code
 * with status one of 'pending' | 'completed' | 'expired'. On 'completed' the
 * envelope also carries provider_id so the UI can refresh /api/providers.
 */
function getPairingStatus(code) {
  return fetchWithTimeout(BASE_URL + '/api/pair/' + encodeURIComponent(code)).then(function(response) {
    if (response.status === 404) {
      // Treat as 'expired' so the modal can recover by minting a new code,
      // rather than throwing — server restart wipes the in-memory store.
      return { pairing_code: code, status: 'expired' };
    }
    if (!response.ok) {
      throw makeNetworkError('Pairing status failed: HTTP ' + response.status);
    }
    return response.json();
  });
}

export {
  isReachable, getProfile, patchProfile, getProviders, getCatalog, getEpg,
  getSeriesDetails, submitCommand, validateCommand, startPlayback,
  startDownload, listDownloads, cancelDownload,
  createPairing, getPairingStatus,
  getApiBaseUrl, buildApiUrl,
  getAuthMe, login, logout, registerWithToken, requestPasswordReset, resetPassword,
  getAdminUsers, createInvite, createUserAccount, adminSetPassword,
  // Wave-20 multi-provider CRUD
  listProviders, addProvider, updateProvider, removeProvider, testProvider, parseQrText,
};
