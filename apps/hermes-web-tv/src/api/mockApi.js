import mockData from '../../mock/catalog.mock.json';

var VALID_PROFILE_IDS = ['dave_tv', 'mom_tv'];

function getProfile(profileId) {
  if (VALID_PROFILE_IDS.indexOf(profileId) === -1) {
    return Promise.reject(new Error('Invalid profile ID: ' + profileId));
  }
  var profiles = mockData.profiles || [];
  var found = null;
  for (var i = 0; i < profiles.length; i++) {
    if (profiles[i].profile_id === profileId) {
      found = profiles[i];
      break;
    }
  }
  if (!found) {
    return Promise.reject(new Error('Profile not found in mock data: ' + profileId));
  }
  return Promise.resolve(Object.assign({}, found));
}

function getProviders() {
  return Promise.resolve((mockData.providers || []).slice());
}

function getCatalog() {
  return Promise.resolve((mockData.catalog || []).slice());
}

function getEpg(channelId) {
  return Promise.resolve({ status: 'mock', channelId: channelId, programs: [] });
}

export { getProfile, getProviders, getCatalog, getEpg };
