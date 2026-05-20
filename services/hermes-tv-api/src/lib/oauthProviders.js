'use strict';

/**
 * Real OAuth provider wiring.
 *
 * Providers are only returned when their real client id + client secret are
 * configured. The UI must not render unconfigured providers as buttons.
 */

const PROVIDERS = {
  google: {
    label: 'Google',
    env: 'GOOGLE',
    auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    userinfo_url: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
  },
  github: {
    label: 'GitHub',
    env: 'GITHUB',
    auth_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    userinfo_url: 'https://api.github.com/user',
    emails_url: 'https://api.github.com/user/emails',
    scope: 'read:user user:email',
  },
  facebook: {
    label: 'Facebook',
    env: 'FACEBOOK',
    auth_url: 'https://www.facebook.com/v20.0/dialog/oauth',
    token_url: 'https://graph.facebook.com/v20.0/oauth/access_token',
    userinfo_url: 'https://graph.facebook.com/me?fields=id,name,email',
    scope: 'email public_profile',
  },
  discord: {
    label: 'Discord',
    env: 'DISCORD',
    auth_url: 'https://discord.com/oauth2/authorize',
    token_url: 'https://discord.com/api/oauth2/token',
    userinfo_url: 'https://discord.com/api/users/@me',
    scope: 'identify email',
  },
  samsung: {
    label: 'Samsung',
    env: 'SAMSUNG',
    auth_url: process.env.SAMSUNG_AUTH_URL || '',
    token_url: process.env.SAMSUNG_TOKEN_URL || '',
    userinfo_url: process.env.SAMSUNG_USERINFO_URL || '',
    scope: process.env.SAMSUNG_SCOPE || 'openid email profile',
  },
};

function envValue(provider, suffix) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return '';
  return process.env[cfg.env + '_' + suffix] || '';
}

function isConfigured(provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg) return false;
  return !!(
    envValue(provider, 'CLIENT_ID') &&
    envValue(provider, 'CLIENT_SECRET') &&
    cfg.auth_url &&
    cfg.token_url &&
    cfg.userinfo_url
  );
}

function listConfigured() {
  return Object.keys(PROVIDERS).filter(isConfigured).map(function(id) {
    return { id, label: PROVIDERS[id].label };
  });
}

function redirectUri(req, provider) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return proto + '://' + host + '/api/auth/oauth/' + encodeURIComponent(provider) + '/callback';
}

function buildAuthorizeUrl(provider, state, req) {
  const cfg = PROVIDERS[provider];
  if (!cfg || !isConfigured(provider)) {
    const err = new Error('OAuth provider is not configured.');
    err.code = 'provider_not_configured';
    throw err;
  }
  const u = new URL(cfg.auth_url);
  u.searchParams.set('client_id', envValue(provider, 'CLIENT_ID'));
  u.searchParams.set('redirect_uri', redirectUri(req, provider));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', cfg.scope);
  u.searchParams.set('state', state);
  if (provider === 'google') {
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'select_account');
  }
  return u.toString();
}

async function exchangeCode(provider, code, req) {
  const cfg = PROVIDERS[provider];
  if (!cfg || !isConfigured(provider)) {
    const err = new Error('OAuth provider is not configured.');
    err.code = 'provider_not_configured';
    throw err;
  }
  const body = new URLSearchParams();
  body.set('client_id', envValue(provider, 'CLIENT_ID'));
  body.set('client_secret', envValue(provider, 'CLIENT_SECRET'));
  body.set('code', String(code || ''));
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', redirectUri(req, provider));

  const response = await fetch(cfg.token_url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const parsed = await response.json().catch(function() { return {}; });
  if (!response.ok || !parsed.access_token) {
    const err = new Error('OAuth token exchange failed.');
    err.code = 'oauth_token_failed';
    err.status = response.status;
    throw err;
  }
  return parsed.access_token;
}

async function fetchJson(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + accessToken,
      'User-Agent': 'DaveTV/0.1',
    },
  });
  const parsed = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    const err = new Error('OAuth profile fetch failed.');
    err.code = 'oauth_profile_failed';
    err.status = response.status;
    throw err;
  }
  return parsed;
}

async function getOAuthIdentity(provider, accessToken) {
  const cfg = PROVIDERS[provider];
  const profile = await fetchJson(cfg.userinfo_url, accessToken);
  let email = profile.email || '';
  if (!email && provider === 'github' && cfg.emails_url) {
    const emails = await fetchJson(cfg.emails_url, accessToken);
    if (Array.isArray(emails)) {
      const primary = emails.find(function(e) { return e && e.primary && e.verified && e.email; })
        || emails.find(function(e) { return e && e.verified && e.email; });
      email = primary ? primary.email : '';
    }
  }
  if (!email) {
    const err = new Error('OAuth provider did not return a verified email.');
    err.code = 'email_required';
    throw err;
  }
  return {
    email,
    provider_user_id: String(profile.sub || profile.id || ''),
    display_name: profile.name || profile.login || profile.username || '',
  };
}

module.exports = {
  listConfigured,
  isConfigured,
  buildAuthorizeUrl,
  exchangeCode,
  getOAuthIdentity,
  _PROVIDERS: PROVIDERS,
};
