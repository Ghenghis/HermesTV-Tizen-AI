# Bug Ledger — 2026-05-21 04:23 UTC

Schema (per docs/54):

```
ID:
Severity: P0 | P1 | P2 | P3
Area:
File/line:
Observed failure:
Expected behavior:
Proof command/screenshot:
Suspected cause:
Fix owner:
Status: open | in_progress | fixed | blocked | rejected
```

---

## BUG-SWARM-001 — `npm run audit:secrets` fails on its own redactor patterns

- Severity: **P1**
- Area: secret-scan tooling
- File/line: `tools/secret-scan.sh:47-69` (PATTERNS list + grep)
- Observed failure: `npm run audit:secrets` exits `1`. Every match is in code that itself looks for / redacts these patterns. Examples:
  - `services/hermes-tv-api/src/lib/m3uClient.js:322` defines `CRED_BEARING_LOGO = [/get\.php\?username=/i, /\/player_api\.php/i, /m3u_plus/i]`
  - `services/hermes-tv-api/src/lib/sanitizeLog.js:43` `/m3u_plus[^\s'"]*/gi` (sanitizer regex)
  - `services/hermes-tv-api/src/lib/streamResolver.js:49` `/m3u_plus/i`
  - `apps/hermes-web-tv/src/utils/qrParse.js:21` comment describing Xtream URL format
  - `services/hermes-tv-api/src/routes/playlists.js:288` comment describing Xtream URL shape
  - `services/hermes-tv-api/src/lib/oauthProviders.js:140` literal `Authorization: 'Bearer ' + accessToken,` header SET
  - `.github/workflows/ci.yml` env-var name references (XTREAM_URL etc.) — names, never values
- Expected behavior: scanner ignores literal pattern declarations inside source code that defines redactors, and only fires on actual `key=value` pairs whose value looks like a real secret (long hex/base64/credential URL)
- Proof command: `npm run audit:secrets` → EXIT=1
- Suspected cause: pattern list uses raw substrings (`m3u_plus`, `xtream`) without an allow-list for source files that legitimately reference them; no `KEY=<looks_like_real_value>` constraint
- Fix owner: agent (this swarm)
- Status: **open** — fix targeted in Wave 2

## BUG-SWARM-002 — `npm run test:e2e` 10/12 FAIL after auth gate landed

- Severity: **P0** (release-blocking smoke regression)
- Area: smoke test runtime
- File/line: `tools/test-e2e-smoke.js` (probes don't authenticate); API: every protected route post-auth-bootstrap
- Observed failure:
  ```
  FAIL: GET /api/layouts — status=401
  FAIL: GET /api/catalog — status=401
  FAIL: GET /api/actors — status=401
  FAIL: POST /api/play — no provider items in catalog (live mode requires at least one)
  FAIL: GET /api/play/:ticket/stream — live mode requires a real catalog item
  FAIL: POST /api/download — live mode requires a real catalog item
  FAIL: GET /api/downloads — status=401
  FAIL: POST /api/ui-command/validate — status=401
  FAIL: GET /api/tts/voices — status=401
  FAIL: POST /api/tts — status=401 raw={"error":"auth_required","message":"DaveTV login is required."}
  === Results: 2 PASS, 10 FAIL ===
  ```
- Expected behavior: smoke needs to either (a) authenticate before probing protected routes, or (b) be split into `auth-off-empty-state` and `auth-on-with-session` jobs per the doc 47 / 49 / 54 contract requirement that no-provider proof and provider-live proof live in separate gates
- Proof command: `npm run test:e2e` against the running API on :3001 with `DAVETV_AUTH_REQUIRED=true`
- Suspected cause: smoke runner was written before the auth gate landed in this lane-a-provider-registry branch
- Fix owner: agent (this swarm) — extend the runner to login first when admin email/password is provided in env, otherwise mark protected probes BLOCKED honestly (not skip-pass)
- Status: **open** — fix targeted in Wave 2

## BUG-SWARM-003 — live-provider proof BLOCKED (no real provider env or VPS access)

- Severity: **P0** per docs/46 / 49 — release cannot be PASS without this
- Area: provider truth
- File/line: `tools/test-provider-e2e.js` honest gate; `services/hermes-tv-api/.env.example:51` for `XTREAM_URL`/`XTREAM_USERNAME`/`XTREAM_PASSWORD`
- Observed failure: `node tools/test-provider-e2e.js` returns `FAIL: live-provider proof requires HERMES_PROVIDER_E2E_BASE, or PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 for an explicit local live proof`
- Expected behavior: at least one of these must produce a live PASS (per docs/46 §"Definition Of Finished"):
  - APOLLO_M3U_URL path with real Apollo Group M3U
  - XTREMEHD_M3U_URL path with real xTremeHD M3U
  - XTREAM_URL/USERNAME/PASSWORD path with real Xtream Codes panel
  - iptv-org is acceptable as a supplemental public provider but NOT a substitute for paid provider proof
- Suspected cause: agent does not have access to the real provider credentials stored in `G:\private\env\Dave-MoM-IPTV.txt` (per memory rule, agent may read but never echo). VPS deploy is a separate blocked path.
- Fix owner: **Dave / provider credentials** (human)
- Status: **blocked** — honest blocker, not a fake skip-pass

## BUG-SWARM-004 — Playwright auth-required specs cannot run without admin password

- Severity: **P1**
- Area: Playwright proof harness
- File/line: `tests/playwright/global-setup.js:107-130` (login function needs creds); `tests/playwright/specs/00-auth-proof.spec.ts`, plus 03-16 specs
- Observed failure: global-setup login fails with HTTP 401 (the seeded Playwright account does not exist; admin password is in the running API process env which the agent cannot read)
- Expected behavior: when `DAVETV_E2E_ADMIN_EMAIL`/`DAVETV_E2E_ADMIN_PASSWORD` are available, global-setup creates the test viewer through admin and writes a valid cookie. Without them, deep UI specs surface as honest failures.
- Proof command: `cd tests/playwright && npx playwright test specs/swarm-20260521-boundary-proof.spec.ts` — passes (boundary spec uses empty storageState). Auth-required specs would fail honestly.
- Suspected cause: agent has no admin creds; running API was started by the operator with their own env
- Fix owner: **Dave / VPS-secret / agent-write-after** — agent extended global-setup to tolerate the no-creds case (writes empty cookie + clear warning, no fake pass). Full UI proof still BLOCKED until creds available.
- Status: **partially fixed** — graceful fallback shipped (`tests/playwright/global-setup.js` extended in this swarm); the actual deep UI proof remains blocked

## BUG-SWARM-005 — `audit:secrets` is wrapped in a try/catch that may mask non-grep failures

- Severity: **P2**
- Area: tooling
- File/line: `package.json` `audit:secrets` script
- Observed failure: script reads `try{execSync('bash tools/secret-scan.sh',{stdio:'inherit'})}catch(e){process.exit(1)}` — this is OK on shape, but the failure message is just `exit 1` with no surface explanation
- Expected behavior: surface the underlying scanner's exit code and message so CI can show the real reason without re-running
- Suspected cause: cosmetic wrapper
- Fix owner: agent (low priority)
- Status: **open** — not addressed in this swarm (P2)

## BUG-SWARM-006 — provider-live proof needs a per-deploy smoke probe step in deploy-vps.yml

- Severity: **P1** per docs/49 P0-2 — currently flagged in the contract; spec exists in docs but not enforced
- Area: deploy pipeline
- File/line: `.github/workflows/deploy-vps.yml` (deploy smoke job)
- Observed failure: I cannot trigger deploy from this swarm. Need to verify `live` mode is enforced for the deploy-promote path.
- Expected behavior: every successful deploy runs `HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech PROVIDER_E2E_MODE=live node tools/test-provider-e2e.js` against the production host and FAILS the deploy if no provider produces a live ticket+stream
- Proof command: would need a VPS deploy run; agent has no authorization to trigger one in this session
- Suspected cause: contract spec not yet wired into the deploy workflow
- Fix owner: **Dave** (deploy authorization) + agent (wiring)
- Status: **blocked** — awaiting deploy authorization
