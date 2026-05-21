import { test, expect, type Route, type Request as PWRequest } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { mkdtempSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import fs from 'fs';

// Overnight swarm — deep authed UI proof.
//
// Sister spec to swarm-20260521-provider-reload-ui.spec.ts which logged
// BUG-SWARM-009 (AuthGate's React state stayed on LoginView even though
// the proxied /api/auth/me returned hasUser=true).
//
// Root-cause hypothesis (this spec is the proof): the original spec's
// route handler stripped the `Origin` header before forwarding to the
// sidecar. The sidecar's cors() middleware (services/hermes-tv-api/src/index.js)
// reflects the Origin header into Access-Control-Allow-Origin. Without
// an Origin, no Allow-Origin is set. The browser then BLOCKS the
// credentialed response (fetch with credentials:'include' requires an
// exact Allow-Origin match), AuthGate.catch fires, setUser(null) lands,
// and LoginView renders even though the sidecar successfully authed.
//
// Fix in this spec: PRESERVE Origin on proxied requests. CORS reflects
// correctly, browser accepts the response, AuthGate.then runs,
// setUser(body.user) sticks, AuthGate renders <App/>.
//
// This spec runs the full deep authed surface proof:
//   1. Boot Vite app via page.goto
//   2. Wait for AuthGate to clear (LoginView gone)
//   3. Assert the authed catalog surface mounts
//   4. No leaked credentials at any point

const SIDECAR_API_PORT = 3295;
const SIDECAR_API_BASE = `http://127.0.0.1:${SIDECAR_API_PORT}`;
const SMOKE_EMAIL = 'authed-ui@example.invalid';
const SMOKE_PASSWORD = `AuthedUI-${Math.random().toString(36).slice(2, 14)}`;
const FIXTURE_USER = 'authedui';
const FIXTURE_PASS = 'authedui';

const PROOF_DIR = path.resolve(
  process.env.DAVETV_SWARM_PROOF_DIR ||
    process.env.DAVETV_PROOF_DIR ||
    path.join(__dirname, '..', '..', '..', 'docs', 'proof', 'overnight-swarm', '20260521-0535', 'screenshots')
);

let sidecarProc: ChildProcessWithoutNullStreams | null = null;
let fixtureProc: ChildProcessWithoutNullStreams | null = null;
let smokeAuthDir = '';
let smokeProvDir = '';
let fixturePort = 0;
let sessionCookie = '';

function shot(name: string) { mkdirSync(PROOF_DIR, { recursive: true }); return path.join(PROOF_DIR, `${name}.png`); }

function waitForHttp200(url: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function probe() {
      const req = http.get(url, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode === 200) return resolve();
          if (Date.now() > deadline) return reject(new Error(`${url} never 200`));
          setTimeout(probe, 250);
        });
      });
      req.on('error', () => {
        if (Date.now() > deadline) return reject(new Error(`${url} unreachable`));
        setTimeout(probe, 250);
      });
    }
    probe();
  });
}

function readFixturePort(stream: NodeJS.ReadableStream): Promise<number> {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const m = buf.match(/127\.0\.0\.1:(\d{2,5})/);
      if (m) { stream.off('data', onData); resolve(parseInt(m[1], 10)); }
    };
    stream.on('data', onData);
    setTimeout(() => { stream.off('data', onData); reject(new Error('fixture port not announced')); }, 5000);
  });
}

function sidecarCall(method: string, p: string, opts: { body?: any; form?: boolean; accept?: string } = {}):
  Promise<{ status: number; body: any; raw: string; setCookie: string }> {
  return new Promise((resolve) => {
    const url = new URL(SIDECAR_API_BASE + p);
    const headers: Record<string, string> = { Accept: opts.accept || 'application/json' };
    let data: string | null = null;
    if (opts.body !== undefined && opts.body !== null) {
      if (opts.form) {
        const parts: string[] = [];
        Object.entries(opts.body as Record<string, any>).forEach(([k, v]) => {
          parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v == null ? '' : v)));
        });
        data = parts.join('&');
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        data = JSON.stringify(opts.body);
        headers['Content-Type'] = 'application/json';
      }
      headers['Content-Length'] = String(Buffer.byteLength(data));
    }
    if (sessionCookie) { headers['Cookie'] = sessionCookie; }
    const req = http.request({
      method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search, headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: any = null;
        try { body = JSON.parse(raw); } catch (_) {}
        let cookie = '';
        const sc = res.headers['set-cookie'];
        if (Array.isArray(sc)) {
          const session = sc.find((s) => /^davetv_session=/.test(s));
          if (session) { cookie = session.split(';')[0]; }
        }
        resolve({ status: res.statusCode || 0, body, raw, setCookie: cookie });
      });
    });
    req.on('error', () => resolve({ status: 0, body: null, raw: '', setCookie: '' }));
    req.setTimeout(15000, () => { try { req.destroy(); } catch (_) {} });
    if (data) { req.write(data); }
    req.end();
  });
}

test.beforeAll(async () => {
  smokeAuthDir = mkdtempSync(path.join(os.tmpdir(), 'davetv-authed-ui-auth-'));
  smokeProvDir = mkdtempSync(path.join(os.tmpdir(), 'davetv-authed-ui-prov-'));
  mkdirSync(PROOF_DIR, { recursive: true });

  const fixtureEntry = path.resolve(__dirname, '..', '..', '..', 'tools', 'xtream-fixture-server.js');
  fixtureProc = spawn('node', [fixtureEntry], {
    env: { ...process.env, PORT: '0',
      XTREAM_FIXTURE_USER: FIXTURE_USER, XTREAM_FIXTURE_PASS: FIXTURE_PASS },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  fixtureProc.stderr.on('data', (b) => process.stderr.write(`[xtream-fixture stderr] ${b}`));
  fixturePort = await readFixturePort(fixtureProc.stdout);

  const apiEntry = path.resolve(__dirname, '..', '..', '..', 'services', 'hermes-tv-api', 'src', 'index.js');
  sidecarProc = spawn('node', [apiEntry], {
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(SIDECAR_API_PORT),
      DAVETV_AUTH_REQUIRED: 'true', DAVETV_AUTH_ENFORCE_API: 'true',
      DAVETV_ADMIN_EMAIL: SMOKE_EMAIL, DAVETV_ADMIN_PASSWORD: SMOKE_PASSWORD,
      DAVETV_AUTH_STORE: path.join(smokeAuthDir, 'auth.json'),
      HERMES_PROVIDER_DATA_DIR: smokeProvDir,
      APOLLO_M3U_URL: '', XTREMEHD_M3U_URL: '',
      XTREAM_URL: '', XTREAM_USERNAME: '', XTREAM_PASSWORD: '',
      JELLYFIN_URL: '', JELLYFIN_API_KEY: '', IPTV_ORG_ENABLED: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  sidecarProc.stderr.on('data', (b) => process.stderr.write(`[sidecar-api stderr] ${b}`));
  sidecarProc.stdout.on('data', () => {});
  await waitForHttp200(`${SIDECAR_API_BASE}/health`, 20000);

  const loginResp = await sidecarCall('POST', '/api/auth/login', {
    body: { email: SMOKE_EMAIL, password: SMOKE_PASSWORD },
  });
  if (loginResp.status !== 200 || !loginResp.setCookie) {
    throw new Error('sidecar login failed: status=' + loginResp.status);
  }
  sessionCookie = loginResp.setCookie;

  const pairResp = await sidecarCall('POST', '/api/pair', { body: {} });
  if (pairResp.status !== 201 || !pairResp.body) { throw new Error('pair failed'); }
  const pairCode = pairResp.body.pairing_code || pairResp.body.code;

  const submitResp = await sidecarCall('POST', '/api/setup/provider/submit', {
    form: true,
    body: {
      pairing_code: pairCode, type: 'xtream', label: 'AuthedUI Fixture',
      url: `http://127.0.0.1:${fixturePort}`,
      username: FIXTURE_USER, password: FIXTURE_PASS,
    },
    accept: 'application/json',
  });
  if (submitResp.status !== 201) { throw new Error('submit failed: ' + submitResp.raw.slice(0, 200)); }
});

test.afterAll(async () => {
  if (sidecarProc && !sidecarProc.killed) { sidecarProc.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 200)); }
  if (fixtureProc && !fixtureProc.killed) { fixtureProc.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 200)); }
  try { fs.rmSync(smokeAuthDir, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(smokeProvDir, { recursive: true, force: true }); } catch (_) {}
});

const LEAK_PATTERNS = [
  new RegExp('\\b' + FIXTURE_USER + '\\b'),
  new RegExp('\\b' + FIXTURE_PASS + '\\b'),
  new RegExp('\\b' + SMOKE_PASSWORD + '\\b'),
  /\/get\.php\?username=/i,
  /\/player_api\.php\?username=/i,
  /\bm3u_plus\b/i,
];
function expectNoLeaks(raw: string, label: string) {
  for (const pat of LEAK_PATTERNS) {
    expect(raw, `${label} leaked pattern ${pat}`).not.toMatch(pat);
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

const VITE_BASE = process.env.DAVETV_E2E_WEB_URL || 'http://localhost:5173';
const VITE_API_FROM_PAGE = 'http://localhost:3001';

// BUG-SWARM-009 FIX: PRESERVE the Origin header so the sidecar's cors()
// can reflect it into Access-Control-Allow-Origin. Without that, the
// browser blocks the credentialed response and AuthGate falls into its
// .catch handler — even though the sidecar successfully authed.
async function routeApiToSidecarWithCors(page: import('@playwright/test').Page) {
  const handler = async (route: Route) => {
    const req: PWRequest = route.request();
    const pageUrl = new URL(req.url());
    const sidecarUrl = SIDECAR_API_BASE + pageUrl.pathname + pageUrl.search;
    const upstreamHeaders: Record<string, string> = {};
    Object.entries(req.headers()).forEach(([k, v]) => {
      // Strip `host` (we're rewriting it). PRESERVE `origin` so the
      // sidecar's cors() middleware reflects Access-Control-Allow-Origin
      // back to the browser — REQUIRED for credentialed cross-origin
      // requests. PRESERVE `referer` too (no harm; cors() ignores it).
      if (k === 'host') return;
      upstreamHeaders[k] = v;
    });
    upstreamHeaders['cookie'] = (upstreamHeaders['cookie'] ? upstreamHeaders['cookie'] + '; ' : '') + sessionCookie;
    const body = req.postDataBuffer();
    const u = new URL(sidecarUrl);
    return new Promise<void>((resolve) => {
      const upstream = http.request({
        method: req.method(), hostname: u.hostname, port: u.port,
        path: u.pathname + u.search, headers: upstreamHeaders,
      }, (resp) => {
        const chunks: Buffer[] = [];
        resp.on('data', (c) => chunks.push(c));
        resp.on('end', async () => {
          const respBody = Buffer.concat(chunks);
          const respHeaders: Record<string, string> = {};
          Object.entries(resp.headers).forEach(([k, v]) => {
            if (k === 'set-cookie') return;
            if (k === 'transfer-encoding' || k === 'content-length') return;
            if (Array.isArray(v)) { respHeaders[k] = v.join(', '); }
            else if (v != null) { respHeaders[k] = String(v); }
          });
          await route.fulfill({
            status: resp.statusCode || 502, headers: respHeaders, body: respBody,
          });
          resolve();
        });
      });
      upstream.on('error', async () => {
        await route.fulfill({ status: 502, body: '{"error":"sidecar_proxy_failed"}' });
        resolve();
      });
      if (body) { upstream.write(body); }
      upstream.end();
    });
  };
  await page.route(`${VITE_API_FROM_PAGE}/api/**`, handler);
  await page.route(`${VITE_API_FROM_PAGE}/health`, handler);
  await page.route(`${VITE_API_FROM_PAGE}/setup/**`, handler);
}

test.describe('Overnight swarm — deep authed UI proof (BUG-SWARM-009 fix)', () => {
  test('AuthGate clears with Origin-preserving proxy, authed surface mounts, no leaks', async ({ page, browserName }, testInfo) => {
    test.skip(!process.env.DAVETV_E2E_WEB_URL && browserName !== 'chromium',
      'Authed UI proof is chromium-only by default');

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        // Allow the "intentional 401 before login" error from any cold boot
        // race the spec doesn't control. The asserts below cover the
        // important things.
        if (/401\b/.test(txt)) return;
        consoleErrors.push(txt);
      }
    });

    await routeApiToSidecarWithCors(page);

    await page.goto(VITE_BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});

    // BUG-SWARM-009 PROOF: with Origin preserved, AuthGate clears and the
    // authed app mounts. The login surface MUST NOT appear.
    // Wait up to 6s for React StrictMode's double-mount + the async
    // getAuthMe round-trip to settle. The authed surface is identifiable
    // by the absence of the "Family login" / "Sign in" heading and the
    // presence of the catalog scaffold.
    await page.waitForFunction(() => {
      const body = document.body.innerText;
      const hasLoginHeader = /Family login|Sign in/.test(body);
      const hasAuthedShell = /Profile|Catalog|Live|Movies|Series|Settings|Now Playing|Pick a profile|Welcome/.test(body);
      return !hasLoginHeader && hasAuthedShell;
    }, { timeout: 8000 }).catch(() => {});

    await page.screenshot({ path: shot('authed-01-after-boot'), fullPage: true });

    const bodyA = await page.locator('body').innerText();
    expectNoLeaks(bodyA, 'body after authed boot');

    // The AuthGate must have cleared — login surface should be gone.
    expect(bodyA, 'AuthGate must clear when proxied auth/me succeeds with Origin preserved')
      .not.toMatch(/Family login/);

    // And the authed shell must have something the LoginView didn't have.
    // Profile picker is the most likely first authed surface for a fresh
    // login with no active profile.
    expect(bodyA, 'authed shell must render past AuthGate')
      .toMatch(/Pick a profile|Welcome|Catalog|Live|Movies|Series|Settings|DaveTV/);

    // Reload-survival: the authed surface must come back cleanly across
    // reloads (page.route stays active for the page's lifetime).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForFunction(() => {
      return !/Family login|Sign in/.test(document.body.innerText);
    }, { timeout: 8000 }).catch(() => {});
    await page.screenshot({ path: shot('authed-02-after-reload'), fullPage: true });
    const bodyB = await page.locator('body').innerText();
    expectNoLeaks(bodyB, 'body after authed reload');
    expect(bodyB, 'AuthGate must stay cleared after reload').not.toMatch(/Family login/);

    // Console-error budget — credentialed CORS failures would surface here.
    expect(consoleErrors, 'no credentialed-CORS or fetch errors after Origin preserve')
      .toEqual([]);

    // Final proof snapshot.
    await page.screenshot({ path: shot('authed-03-final'), fullPage: true });
  });
});
