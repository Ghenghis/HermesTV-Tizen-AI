'use strict';

const DEFAULT_PROFILE_IDS = ['dave_tv', 'mom_tv'];

function normaliseProfileId(raw) {
  return String(raw || '').trim();
}

function isValidProfileId(raw) {
  const id = normaliseProfileId(raw);
  if (!id || id.length > 64) return false;
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id);
}

function profileValidationMessage() {
  return 'profile_id must be a safe DaveTV profile id (letters, numbers, underscore, hyphen; 1-64 chars).';
}

function itemVisibleToProfile(item, profileId) {
  if (!profileId) return true;
  if (!item || !Array.isArray(item.profile_access)) return true;
  return item.profile_access.indexOf(profileId) !== -1;
}

module.exports = {
  DEFAULT_PROFILE_IDS,
  normaliseProfileId,
  isValidProfileId,
  profileValidationMessage,
  itemVisibleToProfile,
};
