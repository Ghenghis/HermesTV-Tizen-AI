var STORAGE_KEY = 'hermestv_profile_id';
var VALID_IDS = ['dave_tv', 'mom_tv'];

function isValidId(id) {
  return VALID_IDS.indexOf(id) !== -1;
}

function getActiveProfileId() {
  try {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidId(stored)) {
      return stored;
    }
    return null;
  } catch (e) {
    return null;
  }
}

function setActiveProfileId(id) {
  if (!isValidId(id)) {
    throw new Error('Invalid profile ID: ' + id + '. Must be dave_tv or mom_tv.');
  }
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch (e) {
    // localStorage unavailable — silent fail; profile won't persist
  }
}

function clearActiveProfileId() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // silent
  }
}

export { getActiveProfileId, setActiveProfileId, clearActiveProfileId };
