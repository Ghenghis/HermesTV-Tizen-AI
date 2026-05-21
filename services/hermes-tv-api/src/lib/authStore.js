'use strict';

/**
 * Durable DaveTV auth store.
 *
 * The account system is intentionally small and file-backed because the VPS
 * already persists /var/lib/hermestv through a named Docker volume. It stores
 * password hashes, invite hashes, reset hashes, session hashes, and OAuth
 * identity links. It never stores raw invite/reset/session tokens.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const STORE_VERSION = 1;
const STORE_PATH = process.env.DAVETV_AUTH_STORE || '/var/lib/hermestv/auth.json';
const SESSION_COOKIE = 'davetv_session';
const SESSION_DAYS = 365;
const INVITE_DAYS = 14;
const RESET_HOURS = 2;
const STATE_MINUTES = 10;

const ALLOWED_NAMES = ['Sherri', 'Dave', 'Warren', 'Suzy', 'Jeff', 'Missy', 'Tyler', 'Nick', 'Savanna'];
const ALLOWED_DURATIONS = [30, 90, 180, 365];

let cache = null;
let hydrated = false;

function nowIso() {
  return new Date().toISOString();
}

function addMs(ms) {
  return new Date(Date.now() + ms).toISOString();
}

function addDays(days) {
  return addMs(days * 24 * 60 * 60 * 1000);
}

function isFuture(iso) {
  return !!iso && Date.parse(iso) > Date.now();
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normaliseName(name) {
  return String(name || '').trim().toLowerCase();
}

function publicName(name) {
  const wanted = normaliseName(name);
  for (const allowed of ALLOWED_NAMES) {
    if (normaliseName(allowed) === wanted) return allowed;
  }
  return '';
}

function assertAllowedName(displayName) {
  const canonical = publicName(displayName);
  if (!canonical) {
    const err = new Error('Account display name is not on the DaveTV family allow-list.');
    err.code = 'name_not_allowed';
    throw err;
  }
  return canonical;
}

function assertEmail(email) {
  const n = normaliseEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n)) {
    const err = new Error('A valid email address is required.');
    err.code = 'invalid_email';
    throw err;
  }
  return n;
}

function assertPassword(password) {
  const s = String(password || '');
  if (s.length < 10) {
    const err = new Error('Password must be at least 10 characters.');
    err.code = 'weak_password';
    throw err;
  }
  return s;
}

function token(bytes) {
  return crypto.randomBytes(bytes || 32).toString('base64url');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hashPassword(password) {
  const salt = token(18);
  const hash = crypto.scryptSync(assertPassword(password), salt, 64).toString('base64url');
  return { algorithm: 'scrypt', salt, hash };
}

function verifyPassword(password, record) {
  if (!record || record.algorithm !== 'scrypt' || !record.salt || !record.hash) return false;
  const expected = Buffer.from(record.hash, 'base64url');
  const actual = crypto.scryptSync(String(password || ''), record.salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function ensureDir() {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  } catch (err) {
    console.warn('[authStore] mkdir failed: ' + err.message);
  }
}

function emptyStore() {
  return {
    version: STORE_VERSION,
    users: {},
    invites: {},
    resets: {},
    sessions: {},
    oauth_states: {},
  };
}

function readStoreFile() {
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    return {
      version: parsed.version || STORE_VERSION,
      users: parsed.users && typeof parsed.users === 'object' ? parsed.users : {},
      invites: parsed.invites && typeof parsed.invites === 'object' ? parsed.invites : {},
      resets: parsed.resets && typeof parsed.resets === 'object' ? parsed.resets : {},
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      oauth_states: parsed.oauth_states && typeof parsed.oauth_states === 'object' ? parsed.oauth_states : {},
    };
  } catch (err) {
    console.warn('[authStore] read failed: ' + err.message + ' - using empty store');
    return emptyStore();
  }
}

function writeStoreFile(state) {
  try {
    ensureDir();
    const dir = path.dirname(STORE_PATH);
    const tmp = path.join(dir, '.auth.' + process.pid + '.' + Date.now() + '.' + token(4) + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + os.EOL, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, STORE_PATH);
  } catch (err) {
    console.warn('[authStore] write failed: ' + err.message);
  }
}

function persist() {
  if (cache) writeStoreFile(cache);
}

function hydrate() {
  if (hydrated) return;
  ensureDir();
  cache = readStoreFile();
  hydrated = true;
  bootstrapAdminFromEnv();
}

function userCount() {
  hydrate();
  return Object.keys(cache.users || {}).length;
}

function hasAdmin() {
  hydrate();
  return Object.keys(cache.users).some(function(id) {
    const u = cache.users[id];
    return u && u.role === 'admin' && u.status === 'active';
  });
}

function createUserRecord(args) {
  const displayName = assertAllowedName(args.display_name);
  const email = assertEmail(args.email);
  const now = nowIso();
  const id = 'usr-' + token(9);
  const role = args.role === 'admin' && displayName === 'Dave' ? 'admin' : 'viewer';
  const user = {
    id,
    email,
    display_name: displayName,
    role,
    status: 'active',
    auth_methods: Array.isArray(args.auth_methods) ? args.auth_methods.slice(0, 6) : [],
    oauth: args.oauth && typeof args.oauth === 'object' ? args.oauth : {},
    password: args.password ? hashPassword(args.password) : null,
    account_expires_at: args.account_expires_at || null,
    created_at: now,
    created_by: args.created_by || null,
    last_login_at: null,
    last_seen_at: null,
  };
  if (user.password && user.auth_methods.indexOf('password') === -1) user.auth_methods.push('password');
  cache.users[id] = user;
  return user;
}

function bootstrapAdminFromEnv() {
  if (!cache) return;
  const email = process.env.DAVETV_ADMIN_EMAIL;
  const password = process.env.DAVETV_ADMIN_PASSWORD || '';
  if (!email) return;
  try {
    const existing = findUserByEmail(email);
    if (existing) {
      let changed = false;
      if (existing.display_name !== 'Dave') { existing.display_name = 'Dave'; changed = true; }
      if (existing.role !== 'admin') { existing.role = 'admin'; changed = true; }
      if (existing.status !== 'active') { existing.status = 'active'; changed = true; }
      if (existing.account_expires_at !== null) { existing.account_expires_at = null; changed = true; }
      if (!existing.password && password) {
        existing.password = hashPassword(password);
        if (existing.auth_methods.indexOf('password') === -1) existing.auth_methods.push('password');
        changed = true;
      }
      if (changed) {
        persist();
        console.log('[authStore] ensured Dave admin from env email');
      }
      return;
    }

    createUserRecord({
      email,
      password: password || null,
      display_name: 'Dave',
      role: 'admin',
      auth_methods: password ? ['password'] : [],
      account_expires_at: null,
      created_by: 'env-bootstrap',
    });
    persist();
    console.log('[authStore] bootstrapped Dave admin from env email');
  } catch (err) {
    console.warn('[authStore] admin bootstrap skipped: ' + err.message);
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    role: user.role,
    status: user.status,
    auth_methods: Array.isArray(user.auth_methods) ? user.auth_methods.slice(0) : [],
    account_expires_at: user.account_expires_at || null,
    created_at: user.created_at || null,
    last_login_at: user.last_login_at || null,
    last_seen_at: user.last_seen_at || null,
  };
}

function findUserByEmail(email) {
  hydrate();
  const n = normaliseEmail(email);
  const ids = Object.keys(cache.users);
  for (const id of ids) {
    if (cache.users[id] && cache.users[id].email === n) return cache.users[id];
  }
  return null;
}

function assertActiveUser(user) {
  if (!user || user.status !== 'active') {
    const err = new Error('Account is not active.');
    err.code = 'inactive';
    throw err;
  }
  if (user.account_expires_at && !isFuture(user.account_expires_at)) {
    user.status = 'expired';
    persist();
    const err = new Error('Account has expired.');
    err.code = 'expired';
    throw err;
  }
  return user;
}

function createSession(userId, deviceLabel) {
  hydrate();
  const user = assertActiveUser(cache.users[userId]);
  const raw = token(32);
  const hash = sha256(raw);
  const maxExpiry = addDays(SESSION_DAYS);
  const expiresAt = user.account_expires_at && Date.parse(user.account_expires_at) < Date.parse(maxExpiry)
    ? user.account_expires_at
    : maxExpiry;
  cache.sessions[hash] = {
    id: 'ses-' + token(8),
    user_id: user.id,
    created_at: nowIso(),
    expires_at: expiresAt,
    last_seen_at: nowIso(),
    device_label: String(deviceLabel || '').slice(0, 80),
  };
  user.last_login_at = nowIso();
  user.last_seen_at = user.last_login_at;
  persist();
  return { token: raw, session: cache.sessions[hash], user: publicUser(user) };
}

function getSession(rawToken) {
  hydrate();
  if (!rawToken) return null;
  const hash = sha256(rawToken);
  const session = cache.sessions[hash];
  if (!session) return null;
  if (!isFuture(session.expires_at)) {
    delete cache.sessions[hash];
    persist();
    return null;
  }
  const user = cache.users[session.user_id];
  try {
    assertActiveUser(user);
  } catch (_) {
    delete cache.sessions[hash];
    persist();
    return null;
  }
  const seen = Date.now();
  const last = Date.parse(session.last_seen_at || 0) || 0;
  if (seen - last > 5 * 60 * 1000) {
    session.last_seen_at = nowIso();
    user.last_seen_at = session.last_seen_at;
    persist();
  }
  return { hash, session, user };
}

function destroySession(rawToken) {
  hydrate();
  if (!rawToken) return false;
  const hash = sha256(rawToken);
  if (!cache.sessions[hash]) return false;
  delete cache.sessions[hash];
  persist();
  return true;
}

function destroySessionsForUser(userId) {
  hydrate();
  let count = 0;
  Object.keys(cache.sessions).forEach(function(hash) {
    if (cache.sessions[hash] && cache.sessions[hash].user_id === userId) {
      delete cache.sessions[hash];
      count++;
    }
  });
  if (count > 0) persist();
  return count;
}

function loginWithPassword(email, password, deviceLabel) {
  hydrate();
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.password)) {
    const err = new Error('Invalid email or password.');
    err.code = 'invalid_login';
    throw err;
  }
  return createSession(assertActiveUser(user).id, deviceLabel);
}

function createInvite(args) {
  hydrate();
  const email = assertEmail(args.email);
  const displayName = assertAllowedName(args.display_name);
  const durationDays = Number(args.duration_days || 30);
  if (ALLOWED_DURATIONS.indexOf(durationDays) === -1) {
    const err = new Error('Account duration must be 1 month, 3 months, 6 months, or 1 year.');
    err.code = 'invalid_duration';
    throw err;
  }
  if (findUserByEmail(email)) {
    const err = new Error('A DaveTV account already exists for that email.');
    err.code = 'user_exists';
    throw err;
  }
  const raw = token(32);
  const hash = sha256(raw);
  const id = 'inv-' + token(8);
  const role = args.role === 'admin' && displayName === 'Dave' ? 'admin' : 'viewer';
  cache.invites[hash] = {
    id,
    email,
    display_name: displayName,
    duration_days: durationDays,
    role,
    created_by: args.created_by || null,
    created_at: nowIso(),
    expires_at: addDays(INVITE_DAYS),
    accepted_at: null,
    accepted_by: null,
  };
  persist();
  return { token: raw, invite: publicInvite(cache.invites[hash]) };
}

function createEmailAccount(args) {
  hydrate();
  const email = assertEmail(args.email);
  const displayName = assertAllowedName(args.display_name);
  const durationDays = Number(args.duration_days || 30);
  if (ALLOWED_DURATIONS.indexOf(durationDays) === -1) {
    const err = new Error('Account duration must be 1 month, 3 months, 6 months, or 1 year.');
    err.code = 'invalid_duration';
    throw err;
  }

  let user = findUserByEmail(email);
  let created = false;
  const role = args.role === 'admin' && displayName === 'Dave' ? 'admin' : 'viewer';
  if (!user) {
    user = createUserRecord({
      email,
      display_name: displayName,
      role,
      auth_methods: [],
      account_expires_at: role === 'admin' ? null : addDays(durationDays),
      created_by: args.created_by || null,
    });
    created = true;
    persist();
  } else {
    user.display_name = displayName;
    user.role = role;
    user.status = 'active';
    user.account_expires_at = role === 'admin' ? null : addDays(durationDays);
    persist();
  }

  const reset = createPasswordReset(user.email, args.created_by || 'admin');
  if (!reset) {
    const err = new Error('Password reset could not be created for this account.');
    err.code = 'reset_unavailable';
    throw err;
  }
  return { user: publicUser(user), created, reset };
}

function publicInvite(invite) {
  if (!invite) return null;
  return {
    id: invite.id,
    email: invite.email,
    display_name: invite.display_name,
    duration_days: invite.duration_days,
    role: invite.role,
    created_by: invite.created_by,
    created_at: invite.created_at,
    expires_at: invite.expires_at,
    accepted_at: invite.accepted_at || null,
    accepted_by: invite.accepted_by || null,
  };
}

function getInvite(rawToken) {
  hydrate();
  const invite = cache.invites[sha256(rawToken)];
  if (!invite || invite.accepted_at || !isFuture(invite.expires_at)) return null;
  return invite;
}

function registerWithInvite(rawToken, password, deviceLabel) {
  hydrate();
  const hash = sha256(rawToken);
  const invite = cache.invites[hash];
  if (!invite || invite.accepted_at || !isFuture(invite.expires_at)) {
    const err = new Error('Register link is invalid or expired.');
    err.code = 'invalid_invite';
    throw err;
  }
  if (findUserByEmail(invite.email)) {
    const err = new Error('A DaveTV account already exists for this email.');
    err.code = 'user_exists';
    throw err;
  }
  const user = createUserRecord({
    email: invite.email,
    display_name: invite.display_name,
    role: invite.role,
    password,
    auth_methods: ['password'],
    account_expires_at: addDays(invite.duration_days),
    created_by: invite.created_by,
  });
  invite.accepted_at = nowIso();
  invite.accepted_by = user.id;
  persist();
  return createSession(user.id, deviceLabel);
}

function createPasswordReset(email, createdBy) {
  hydrate();
  const user = findUserByEmail(email);
  if (!user || user.status !== 'active') return null;
  try {
    assertActiveUser(user);
  } catch (_) {
    return null;
  }
  const raw = token(32);
  cache.resets[sha256(raw)] = {
    id: 'rst-' + token(8),
    user_id: user.id,
    created_at: nowIso(),
    created_by: createdBy || null,
    expires_at: addMs(RESET_HOURS * 60 * 60 * 1000),
    used_at: null,
  };
  persist();
  return { token: raw, user: publicUser(user) };
}

function resetPassword(rawToken, password) {
  hydrate();
  const hash = sha256(rawToken);
  const rec = cache.resets[hash];
  if (!rec || rec.used_at || !isFuture(rec.expires_at)) {
    const err = new Error('Reset link is invalid or expired.');
    err.code = 'invalid_reset';
    throw err;
  }
  const user = cache.users[rec.user_id];
  assertActiveUser(user);
  user.password = hashPassword(password);
  if (user.auth_methods.indexOf('password') === -1) user.auth_methods.push('password');
  rec.used_at = nowIso();
  destroySessionsForUser(user.id);
  persist();
  return publicUser(user);
}

function adminSetPassword(userId, password, adminUserId) {
  hydrate();
  const user = cache.users[userId];
  if (!user) {
    const err = new Error('User not found.');
    err.code = 'not_found';
    throw err;
  }
  user.password = hashPassword(password);
  if (user.auth_methods.indexOf('password') === -1) user.auth_methods.push('password');
  user.password_changed_by = adminUserId || null;
  user.password_changed_at = nowIso();
  destroySessionsForUser(user.id);
  persist();
  return publicUser(user);
}

function listUsers() {
  hydrate();
  return Object.keys(cache.users).map(function(id) { return publicUser(cache.users[id]); })
    .sort(function(a, b) { return String(a.display_name).localeCompare(String(b.display_name)); });
}

function listInvites() {
  hydrate();
  return Object.keys(cache.invites).map(function(hash) { return publicInvite(cache.invites[hash]); })
    .sort(function(a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
}

function createOAuthState(provider, inviteToken, returnTo) {
  hydrate();
  const raw = token(24);
  cache.oauth_states[sha256(raw)] = {
    provider,
    invite_hash: inviteToken ? sha256(inviteToken) : null,
    created_at: nowIso(),
    expires_at: addMs(STATE_MINUTES * 60 * 1000),
    return_to: returnTo || '/',
  };
  persist();
  return raw;
}

function consumeOAuthState(rawState) {
  hydrate();
  const hash = sha256(rawState);
  const state = cache.oauth_states[hash];
  if (!state || !isFuture(state.expires_at)) {
    delete cache.oauth_states[hash];
    persist();
    return null;
  }
  delete cache.oauth_states[hash];
  persist();
  return state;
}

function loginOrRegisterOAuth(args, deviceLabel) {
  hydrate();
  const email = assertEmail(args.email);
  const provider = String(args.provider || '').trim();
  const providerUserId = String(args.provider_user_id || '').trim();
  let user = findUserByEmail(email);
  if (!user) {
    const invite = args.invite_hash
      ? cache.invites[args.invite_hash]
      : (args.invite_token ? getInvite(args.invite_token) : null);
    if (!invite || invite.email !== email) {
      const err = new Error('This email needs a DaveTV invite before OAuth login can create an account.');
      err.code = 'invite_required';
      throw err;
    }
    if (invite.accepted_at || !isFuture(invite.expires_at)) {
      const err = new Error('Register link is invalid or expired.');
      err.code = 'invalid_invite';
      throw err;
    }
    user = createUserRecord({
      email,
      display_name: invite.display_name,
      role: invite.role,
      auth_methods: [provider],
      account_expires_at: addDays(invite.duration_days),
      created_by: invite.created_by,
      oauth: {},
    });
    invite.accepted_at = nowIso();
    invite.accepted_by = user.id;
  }
  assertActiveUser(user);
  if (provider && user.auth_methods.indexOf(provider) === -1) user.auth_methods.push(provider);
  if (!user.oauth || typeof user.oauth !== 'object') user.oauth = {};
  user.oauth[provider] = {
    provider_user_id: providerUserId || null,
    linked_at: nowIso(),
  };
  persist();
  return createSession(user.id, deviceLabel);
}

function _resetForTests(storePath) {
  hydrated = false;
  cache = null;
  if (storePath) process.env.DAVETV_AUTH_STORE = storePath;
}

module.exports = {
  SESSION_COOKIE,
  ALLOWED_NAMES,
  ALLOWED_DURATIONS,
  hydrate,
  userCount,
  hasAdmin,
  publicUser,
  findUserByEmail,
  getSession,
  createSession,
  destroySession,
  destroySessionsForUser,
  loginWithPassword,
  createEmailAccount,
  createInvite,
  getInvite,
  registerWithInvite,
  createPasswordReset,
  resetPassword,
  adminSetPassword,
  listUsers,
  listInvites,
  createOAuthState,
  consumeOAuthState,
  loginOrRegisterOAuth,
  _resetForTests,
  _STORE_PATH: STORE_PATH,
};
