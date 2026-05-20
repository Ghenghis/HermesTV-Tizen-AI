// Local dev (Vite at localhost:5173) → cross-origin to the API on :3001.
// LAN mirror (Mom's QN85 hitting workstation by IP) → same auto-detect.
// Production (https://tv.daveai.tech, with hermestv.daveai.tech as an
// additive alias, both served by host nginx that also proxies /api/ to
// the API container) → same-origin, so BASE_URL is empty. The browser
// just hits whichever Host it loaded from.
var BASE_URL = (function() {
  if (typeof window === 'undefined') return '';
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return 'http://' + h + ':3001';
  if (h === 'hermestv.local') return 'http://hermestv.local';
  return '';
})();
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

    fetch(url, options || {}).then(function(response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      clearTimeout(timer);
      var networkErr = makeNetworkError('Network error: ' + (err.message || 'unknown'));
      reject(networkErr);
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

function getProviders() {
  return fetchWithTimeout(BASE_URL + '/api/providers').then(function(response) {
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

function getCatalog() {
  return fetchWithTimeout(BASE_URL + '/api/catalog').then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Catalog fetch failed: HTTP ' + response.status);
    }
    var sourceHeader = response.headers.get('X-Catalog-Source') || null;
    return response.json().then(function(body) {
      // Surface the response header on the returned object so the UI can
      // render an honest "data source" badge (Live providers / Jellyfin /
      // iptv-org / Mock seed). Tizen 6.5 / Chrome 76 safe — no spread.
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
 * Queue a download for a movie / episode / series item. Returns the
 * exact-size envelope (job_id, exact_size_human, status: 'queued') so the
 * DownloadModal can show "EXACT DOWNLOAD SIZE NNN MB" and a Proceed button.
 *
 * Resolves with the server JSON body on any status. Caller is responsible
 * for branching on body.error — that lets the modal distinguish a 503
 * threadfin_proxy_required from a real exception so the UI can present a
 * 'configure THREADFIN_URL' tip instead of a generic error.
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
 * Returns { pairing_code, status, issued_at, expires_at, ttl_ms } from
 * POST /api/pair. The TV displays the pairing_code under the QR and then
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
  submitCommand, validateCommand, startPlayback,
  startDownload, listDownloads, cancelDownload,
  createPairing, getPairingStatus,
  // Wave-20 multi-provider CRUD
  listProviders, addProvider, updateProvider, removeProvider, testProvider, parseQrText,
};
