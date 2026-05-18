// Local dev (Vite at localhost:5173) → cross-origin to the API on :3001.
// LAN mirror (Mom's QN85 hitting workstation by IP) → same auto-detect.
// Production (https://hermestv.daveai.tech served by host nginx that also
// proxies /api/ to the API container) → same-origin, so BASE_URL is empty.
var BASE_URL = (function() {
  if (typeof window === 'undefined') return '';
  var h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return 'http://' + h + ':3001';
  if (h === 'hermestv.local') return 'http://hermestv.local';
  return '';
})();
var DEFAULT_TIMEOUT = 8000;
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

function getProviders() {
  return fetchWithTimeout(BASE_URL + '/api/providers').then(function(response) {
    if (!response.ok) {
      throw makeNetworkError('Providers fetch failed: HTTP ' + response.status);
    }
    return response.json();
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

export { isReachable, getProfile, getProviders, getCatalog, getEpg, submitCommand, validateCommand, startPlayback };
