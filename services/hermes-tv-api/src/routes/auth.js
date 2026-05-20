'use strict';

const { Router } = require('express');
const authStore = require('../lib/authStore');
const authMailer = require('../lib/authMailer');
const oauthProviders = require('../lib/oauthProviders');
const { sanitizeForLog } = require('../lib/sanitizeLog');

const router = Router();

function authRequired() {
  return String(process.env.DAVETV_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
}

function apiEnforced() {
  const configured = process.env.DAVETV_AUTH_ENFORCE_API;
  if (configured !== undefined) {
    return String(configured).toLowerCase() === 'true';
  }
  if (process.env.NODE_ENV === 'test') return false;
  return authRequired();
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(function(part) {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try { out[key] = decodeURIComponent(val); } catch (_) { out[key] = val; }
  });
  return out;
}

function sessionToken(req) {
  return parseCookies(req)[authStore.SESSION_COOKIE] || '';
}

function publicBaseUrl(req) {
  const configured = String(process.env.DAVETV_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  const origin = req.get('origin');
  if (origin && process.env.NODE_ENV !== 'production') {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname.toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return parsed.origin;
      }
    } catch (_) {
      // Fall back to the API host below.
    }
  }

  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return proto + '://' + host;
}

function secureCookie(req) {
  return (req.get('x-forwarded-proto') || req.protocol) === 'https' || process.env.NODE_ENV === 'production';
}

function setSessionCookie(req, res, loginResult) {
  const expiresAt = loginResult.session && loginResult.session.expires_at
    ? Date.parse(loginResult.session.expires_at)
    : Date.now() + 365 * 24 * 60 * 60 * 1000;
  const maxAge = Math.max(0, expiresAt - Date.now());
  res.cookie(authStore.SESSION_COOKIE, loginResult.token, {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

function clearSessionCookie(req, res) {
  res.clearCookie(authStore.SESSION_COOKIE, {
    httpOnly: true,
    secure: secureCookie(req),
    sameSite: 'lax',
    path: '/',
  });
}

function currentSession(req) {
  return authStore.getSession(sessionToken(req));
}

function requireAdmin(req, res, next) {
  const s = currentSession(req);
  if (!s || !s.user || s.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', message: 'DaveTV admin access is required.' });
  }
  req.auth = s;
  return next();
}

function linkFor(req, kind, token) {
  const param = kind === 'reset' ? 'reset_token' : 'register_token';
  return publicBaseUrl(req) + '/?' + param + '=' + encodeURIComponent(token);
}

function deviceLabel(req) {
  return String(req.get('user-agent') || '').slice(0, 80);
}

function authStatus() {
  const users = authStore.userCount();
  const admin = authStore.hasAdmin();
  return {
    required: authRequired(),
    api_enforced: apiEnforced(),
    configured: users > 0 && admin,
    user_count: users,
    has_admin: admin,
    allowed_names: authStore.ALLOWED_NAMES,
    allowed_durations_days: authStore.ALLOWED_DURATIONS,
    oauth_providers: oauthProviders.listConfigured(),
    smtp_configured: authMailer.isConfigured(),
  };
}

router.get('/api/auth/me', (req, res) => {
  const s = currentSession(req);
  res.json({
    auth: authStatus(),
    user: s ? authStore.publicUser(s.user) : null,
  });
});

router.get('/api/auth/providers', (req, res) => {
  res.json({ providers: oauthProviders.listConfigured() });
});

router.post('/api/auth/login', (req, res) => {
  try {
    const login = authStore.loginWithPassword(req.body && req.body.email, req.body && req.body.password, deviceLabel(req));
    setSessionCookie(req, res, login);
    res.json({ user: login.user });
  } catch (err) {
    res.status(401).json({ error: err.code || 'login_failed', message: err.message || 'Login failed.' });
  }
});

router.post('/api/auth/logout', (req, res) => {
  authStore.destroySession(sessionToken(req));
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

router.post('/api/auth/register', (req, res) => {
  try {
    const login = authStore.registerWithInvite(req.body && req.body.token, req.body && req.body.password, deviceLabel(req));
    setSessionCookie(req, res, login);
    res.status(201).json({ user: login.user });
  } catch (err) {
    res.status(400).json({ error: err.code || 'register_failed', message: err.message || 'Registration failed.' });
  }
});

router.post('/api/auth/password/forgot', async (req, res) => {
  try {
    const reset = authStore.createPasswordReset(req.body && req.body.email, 'self-service');
    if (reset) {
      const resetUrl = linkFor(req, 'reset', reset.token);
      const delivery = await authMailer.sendReset(reset.user.email, resetUrl);
      return res.json({
        ok: true,
        delivery,
        reset_url: delivery.sent ? undefined : resetUrl,
      });
    }
    return res.json({ ok: true, delivery: { sent: false, reason: 'no_matching_active_user' } });
  } catch (err) {
    console.warn('[auth] forgot password failed: ' + sanitizeForLog(err.message));
    return res.status(400).json({ error: 'reset_failed', message: 'Password reset could not be created.' });
  }
});

router.post('/api/auth/password/reset', (req, res) => {
  try {
    const user = authStore.resetPassword(req.body && req.body.token, req.body && req.body.password);
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.code || 'reset_failed', message: err.message || 'Password reset failed.' });
  }
});

router.get('/api/auth/oauth/:provider/start', (req, res) => {
  try {
    const provider = String(req.params.provider || '');
    const state = authStore.createOAuthState(provider, req.query.invite_token || '', req.query.return_to || '/');
    const url = oauthProviders.buildAuthorizeUrl(provider, state, req);
    res.redirect(url);
  } catch (err) {
    res.status(400).json({ error: err.code || 'oauth_start_failed', message: err.message || 'OAuth login is not configured.' });
  }
});

router.get('/api/auth/oauth/:provider/callback', async (req, res) => {
  try {
    const provider = String(req.params.provider || '');
    const state = authStore.consumeOAuthState(req.query.state || '');
    if (!state || state.provider !== provider) {
      return res.redirect('/?auth_error=oauth_state');
    }
    const accessToken = await oauthProviders.exchangeCode(provider, req.query.code || '', req);
    const identity = await oauthProviders.getOAuthIdentity(provider, accessToken);
    let inviteToken = '';
    if (state.invite_hash && req.query.invite_token) inviteToken = req.query.invite_token;
    const login = authStore.loginOrRegisterOAuth({
      provider,
      email: identity.email,
      provider_user_id: identity.provider_user_id,
      display_name: identity.display_name,
      invite_token: inviteToken,
      invite_hash: state.invite_hash || null,
    }, deviceLabel(req));
    setSessionCookie(req, res, login);
    return res.redirect(state.return_to || '/');
  } catch (err) {
    console.warn('[auth] oauth callback failed: ' + sanitizeForLog(err.message));
    return res.redirect('/?auth_error=oauth_failed');
  }
});

router.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ users: authStore.listUsers(), invites: authStore.listInvites() });
});

router.post('/api/admin/invites', requireAdmin, async (req, res) => {
  try {
    const created = authStore.createInvite({
      email: req.body && req.body.email,
      display_name: req.body && req.body.display_name,
      duration_days: req.body && req.body.duration_days,
      role: req.body && req.body.role,
      created_by: req.auth.user.id,
    });
    const inviteUrl = linkFor(req, 'register', created.token);
    const delivery = await authMailer.sendInvite(
      created.invite.email,
      inviteUrl,
      created.invite.display_name,
      created.invite.expires_at
    );
    res.status(201).json({
      invite: created.invite,
      delivery,
      invite_url: delivery.sent ? undefined : inviteUrl,
    });
  } catch (err) {
    res.status(400).json({ error: err.code || 'invite_failed', message: err.message || 'Invite failed.' });
  }
});

router.post('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  try {
    const user = authStore.adminSetPassword(req.params.id, req.body && req.body.password, req.auth.user.id);
    res.json({ user });
  } catch (err) {
    const status = err.code === 'not_found' ? 404 : 400;
    res.status(status).json({ error: err.code || 'password_update_failed', message: err.message || 'Password update failed.' });
  }
});

function authMiddleware(req, res, next) {
  if (!apiEnforced()) return next();
  if (req.method === 'OPTIONS') return next();
  function isOpenRoute() {
    if (/^\/health$/.test(req.path)) return true;
    if (/^\/api\/health$/.test(req.path)) return true;
    if (/^\/api\/version$/.test(req.path)) return true;
    if (/^\/api\/auth\//.test(req.path)) return true;
    if (/^\/api\/setup\/provider/.test(req.path)) return true;
    if (/^\/setup\/provider/.test(req.path)) return true;
    // Pair-code creation itself requires a logged-in DaveTV session. The
    // short-code status/complete endpoints stay public because the scanned
    // phone page has only the HRM-XXXX code, not the TV's session cookie.
    if (/^\/api\/pair\/[^/]+/.test(req.path)) return true;
    // Phone remote events are authorized by the short-lived pair code minted
    // by a logged-in TV session.
    if (/^\/api\/remote\//.test(req.path)) return true;
    return false;
  }
  if (isOpenRoute()) return next();
  const s = currentSession(req);
  if (!s) return res.status(401).json({ error: 'auth_required', message: 'DaveTV login is required.' });
  req.auth = s;
  return next();
}

router.authMiddleware = authMiddleware;
router._test_helpers = {
  parseCookies,
  authStatus,
};

module.exports = router;
