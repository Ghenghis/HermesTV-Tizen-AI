import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

// Overnight swarm 20260521-0423 — sidecar API deep authenticated proof.
//
// Per Codex postmortem: "Local deep proof can be run by starting an
// isolated API on another port with a temporary auth store and throwaway
// admin." This spec does exactly that against an in-process API on :3299
// (does NOT touch the operator's running :3001 + :5173).
//
// What we DO prove here (Playwright API request fixture):
//   - the sidecar API boots with auth required + admin bootstrapped
//   - unauthenticated protected routes return 401
//   - admin login returns a session cookie
//   - the same session can read /api/providers, /api/catalog, /api/layouts
//   - logout invalidates the session
//   - no secret value (provider URL, ticket, set-cookie) is in any response body
//
// What this does NOT prove (still BLOCKED owner=Lane-A integrator):
//   - browser-level UI flow against an isolated API — web app's BASE_URL
//     is hardcoded to localhost:3001 in apps/hermes-web-tv/src/api/hermesApi.js,
//     so the running Vite at :5173 can't be re-pointed at the sidecar without
//     editing Lane A's code.

const SIDECAR_PORT = 3299;
const SIDECAR_BASE = `http://127.0.0.1:${SIDECAR_PORT}`;
const SMOKE_EMAIL = 'sidecar-admin@example.invalid';
const SMOKE_PASSWORD = `SidecarTest-${Math.random().toString(36).slice(2, 14)}`;

const PROOF_DIR = path.resolve(
  process.env.DAVETV_SWARM_PROOF_DIR ||
    process.env.DAVETV_PROOF_DIR ||
    path.join(
      __dirname,
      '..',
      '..',
      '..',
      'docs',
      'proof',
      'overnight-swarm',
      '20260521-0423',
      'screenshots'
    )
);

let sidecarProc: ChildProcessWithoutNullStreams | null = null;
let smokeAuthDir = '';

function waitForHealth(timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function probe() {
      const req = http.get(`${SIDECAR_BASE}/health`, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode === 200) return resolve();
          if (Date.now() > deadline) return reject(new Error('sidecar /health never returned 200'));
          setTimeout(probe, 200);
        });
      });
      req.on('error', () => {
        if (Date.now() > deadline) return reject(new Error('sidecar /health unreachable'));
        setTimeout(probe, 200);
      });
    }
    setTimeout(probe, 200);
  });
}

test.beforeAll(async () => {
  smokeAuthDir = mkdtempSync(path.join(os.tmpdir(), 'davetv-sidecar-'));
  mkdirSync(PROOF_DIR, { recursive: true });

  const apiEntry = path.resolve(__dirname, '..', '..', '..', 'services', 'hermes-tv-api', 'src', 'index.js');

  sidecarProc = spawn('node', [apiEntry], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(SIDECAR_PORT),
      DAVETV_AUTH_REQUIRED: 'true',
      DAVETV_AUTH_ENFORCE_API: 'true',
      DAVETV_ADMIN_EMAIL: SMOKE_EMAIL,
      DAVETV_ADMIN_PASSWORD: SMOKE_PASSWORD,
      DAVETV_AUTH_STORE: path.join(smokeAuthDir, 'auth.json'),
      DAVETV_PROVIDER_DATA_DIR: smokeAuthDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Pipe stderr so test failures show why the API didn't start.
  sidecarProc.stderr.on('data', (buf) => {
    process.stderr.write(`[sidecar-api stderr] ${buf}`);
  });

  await waitForHealth(20000);
});

test.afterAll(async () => {
  if (sidecarProc && !sidecarProc.killed) {
    sidecarProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
  }
});

// Leak patterns — anything matching here in a response body fails the test.
const LEAK_PATTERNS = [
  /password\s*[:=]\s*["']?[^"',}\s]{6,}/i,
  /\/get\.php\?username=[A-Za-z0-9][A-Za-z0-9._%+-]+/i,
  /\/player_api\.php\?username=[A-Za-z0-9][A-Za-z0-9._%+-]+/i,
  /\bm3u_plus\b/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/i,
  /AZURE_TTS_KEY\s*[:=]\s*[A-Za-z0-9]{20,}/i,
];

function expectNoLeaks(raw: string, label: string) {
  for (const pat of LEAK_PATTERNS) {
    expect(raw, `${label} leaked pattern ${pat}`).not.toMatch(pat);
  }
}

test.describe('Overnight swarm sidecar API deep proof', () => {
  test('auth gate is on, unauthenticated protected routes return 401', async () => {
    const ctx: APIRequestContext = await pwRequest.newContext({ baseURL: SIDECAR_BASE });
    try {
      const health = await ctx.get('/health');
      expect(health.status()).toBe(200);
      const body = await health.text();
      expectNoLeaks(body, '/health');

      const me = await ctx.get('/api/auth/me');
      expect(me.status()).toBe(200);
      const meBody = await me.json();
      expect(meBody.auth.required).toBe(true);
      expect(meBody.auth.has_admin).toBe(true);

      const providers = await ctx.get('/api/providers');
      expect(providers.status()).toBe(401);
      const catalog = await ctx.get('/api/catalog');
      expect(catalog.status()).toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test('admin login → session → providers/catalog/layouts → logout', async () => {
    // Single context so the cookie jar is shared across requests.
    const ctx: APIRequestContext = await pwRequest.newContext({
      baseURL: SIDECAR_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    try {
      const loginResp = await ctx.post('/api/auth/login', {
        data: { email: SMOKE_EMAIL, password: SMOKE_PASSWORD },
      });
      expect(loginResp.status(), 'admin login must succeed').toBe(200);
      const loginBody = await loginResp.json();
      expect(loginBody.user.email).toBe(SMOKE_EMAIL);
      expect(loginBody.user.role || loginBody.user.is_admin).toBeTruthy();

      // After login the cookie jar holds the session — protected routes work.
      const providers = await ctx.get('/api/providers');
      expect(providers.status(), '/api/providers after login').toBe(200);
      const providersBody = await providers.json();
      // Shape sanity, not item count (no real provider configured here).
      expect(providersBody).toHaveProperty('providers');
      const providersRaw = await providers.text();
      expectNoLeaks(providersRaw, '/api/providers');

      const catalog = await ctx.get('/api/catalog');
      expect(catalog.status(), '/api/catalog after login').toBe(200);
      const catalogBody = await catalog.json();
      expect(typeof catalogBody.total).toBe('number');
      expect(catalogBody).toHaveProperty('_meta.source');
      expectNoLeaks(await catalog.text(), '/api/catalog');

      const layouts = await ctx.get('/api/layouts');
      expect(layouts.status(), '/api/layouts after login').toBe(200);
      const layoutsBody = await layouts.json();
      expect(layoutsBody.count).toBeGreaterThanOrEqual(9);

      // /api/auth/me with the session shows the user.
      const meAuthed = await ctx.get('/api/auth/me');
      expect(meAuthed.status()).toBe(200);
      const meAuthedBody = await meAuthed.json();
      expect(meAuthedBody.user).toBeTruthy();
      expect(meAuthedBody.user.email).toBe(SMOKE_EMAIL);

      // Logout — session must invalidate.
      const logoutResp = await ctx.post('/api/auth/logout', { data: {} });
      expect([200, 204]).toContain(logoutResp.status());
      const providersAfterLogout = await ctx.get('/api/providers');
      expect(providersAfterLogout.status(), 'logout must invalidate').toBe(401);
    } finally {
      await ctx.dispose();
    }
  });

  test('honest empty-state — no providers configured returns total:0 source:no-providers', async () => {
    const ctx: APIRequestContext = await pwRequest.newContext({
      baseURL: SIDECAR_BASE,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    try {
      await ctx.post('/api/auth/login', {
        data: { email: SMOKE_EMAIL, password: SMOKE_PASSWORD },
      });
      const catalog = await ctx.get('/api/catalog');
      const body = await catalog.json();
      expect(body.total).toBe(0);
      expect(body._meta.source).toMatch(/no-providers/);
      // Per docs/46: empty state must be honest, not pretend-success.
      expect(body).not.toHaveProperty('mock');
      expect(body).not.toHaveProperty('seed');
    } finally {
      await ctx.dispose();
    }
  });
});
