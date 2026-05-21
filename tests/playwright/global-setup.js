const fs = require('fs');
const path = require('path');
const { request } = require('@playwright/test');

const AUTH_DIR = path.resolve(__dirname, '.auth');
const AUTH_STATE = path.join(AUTH_DIR, 'davetv-user.json');

function truthy(value) {
  return /^(1|true|yes)$/i.test(String(value || '').trim());
}

function webBaseUrl() {
  return process.env.DAVETV_E2E_WEB_URL || 'http://localhost:5173';
}

function apiBaseUrl() {
  if (process.env.DAVETV_E2E_API_URL) return process.env.DAVETV_E2E_API_URL;
  const web = webBaseUrl();
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(web)) {
    return 'http://localhost:3001';
  }
  return web.replace(/\/+$/, '');
}

async function createApiContext() {
  return request.newContext({
    baseURL: apiBaseUrl(),
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Accept: 'application/json' },
  });
}

async function login(api, email, password) {
  const response = await api.post('/api/auth/login', {
    data: { email, password },
  });
  if (!response.ok()) {
    throw new Error('Playwright login failed: HTTP ' + response.status());
  }
  const body = await response.json();
  if (!body || !body.user || !body.user.email) {
    throw new Error('Playwright login did not return a user.');
  }
  return body.user;
}

async function ensureLocalAccount(api, email, password) {
  if (!truthy(process.env.DAVETV_E2E_ALLOW_ACCOUNT_SETUP)) return;

  const me = await api.get('/api/auth/me');
  if (!me.ok()) return;
  const status = await me.json();
  if (!status || !status.auth || status.auth.configured === false) return;

  const adminEmail = process.env.DAVETV_E2E_ADMIN_EMAIL || process.env.DAVETV_ADMIN_EMAIL;
  const adminPassword = process.env.DAVETV_E2E_ADMIN_PASSWORD || process.env.DAVETV_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;

  try {
    await login(api, adminEmail, adminPassword);
  } catch (_) {
    return;
  }

  let usersResponse = await api.get('/api/admin/users');
  if (usersResponse.ok()) {
    const usersBody = await usersResponse.json();
    const users = Array.isArray(usersBody.users) ? usersBody.users : [];
    const existing = users.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
    if (existing) {
      const setPassword = await api.post('/api/admin/users/' + encodeURIComponent(existing.id) + '/password', {
        data: { password },
      });
      if (!setPassword.ok()) {
        throw new Error('Could not update Playwright account password: HTTP ' + setPassword.status());
      }
      await api.post('/api/auth/logout', { data: {} }).catch(() => {});
      return;
    }
  }

  const created = await api.post('/api/admin/users', {
    data: {
      email,
      display_name: 'Dave',
      duration_days: 365,
      role: 'admin',
    },
  });
  if (!created.ok()) {
    throw new Error('Could not create Playwright account: HTTP ' + created.status());
  }
  const createdBody = await created.json();
  const user = createdBody && createdBody.user;
  if (!user || !user.id) {
    throw new Error('Playwright account creation did not return a user id.');
  }
  const setPassword = await api.post('/api/admin/users/' + encodeURIComponent(user.id) + '/password', {
    data: { password },
  });
  if (!setPassword.ok()) {
    throw new Error('Could not set Playwright account password: HTTP ' + setPassword.status());
  }
  await api.post('/api/auth/logout', { data: {} }).catch(() => {});
}

module.exports = async function globalSetup() {
  const email = process.env.DAVETV_E2E_EMAIL || 'playwright-dave@example.test';
  const password = process.env.DAVETV_E2E_PASSWORD || 'PlaywrightDave123!';
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const api = await createApiContext();
  try {
    let me = await api.get('/api/auth/me');
    if (!me.ok()) {
      // API unreachable: write empty cookie + warn. Boundary specs
      // (storageState override) can still prove the login surface; auth-
      // required specs will fail honestly with their own assertions.
      console.warn('[global-setup] /api/auth/me unreachable (HTTP ' + me.status() + '); writing empty cookie. Auth-gated specs will fail honestly.');
      fs.writeFileSync(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }, null, 2));
      return;
    }
    const status = await me.json();
    if (status && status.auth && status.auth.required === false) {
      fs.writeFileSync(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }, null, 2));
      return;
    }

    try {
      await ensureLocalAccount(api, email, password);
      await login(api, email, password);
      await api.storageState({ path: AUTH_STATE });
    } catch (err) {
      // No admin creds in env, or login failed. Per docs/54 anti-skip
      // policy this is BLOCKED owner=Dave/VPS-secret, not a fake pass.
      // We still write an empty cookie so boundary specs (which override
      // storageState) can run and report the unauthenticated boundary.
      console.warn('[global-setup] login failed (' + (err && err.message ? err.message : err) + '); writing empty cookie. Auth-required specs will surface as honest failures, not fake passes.');
      fs.writeFileSync(AUTH_STATE, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    }
  } finally {
    await api.dispose();
  }
};
