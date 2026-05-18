var BASE_URL = 'http://hermestv.local';
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
    return response.json();
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

export { isReachable, getProfile, getProviders, getCatalog, getEpg, submitCommand };
