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

- Severity: **P1** per docs/49 P0-2 — initially logged based on incomplete reading of the workflow
- Area: deploy pipeline
- File/line: `.github/workflows/deploy-vps.yml`
- **CORRECTION (Wave 2.2 static check):** The live-provider gate IS already wired:
  - `run_provider_live` workflow_dispatch input (line 25-26)
  - "Mark release promotion blocked when provider-live proof is skipped" step (line 366-381)
  - "Provider-live truth proof (against deployed VPS)" step runs `tools/test-provider-e2e.js` with `PROVIDER_E2E_MODE=live` against the deployed host (line 397-441)
  - "Enforce provider-live PASS (no skip allowed)" step explicitly fails if log isn't `=== Results: N PASS, 0 FAIL` with N>=1 (line 443-456)
  - Proof artifacts uploaded sanitized
- Status: **rejected (already-implemented)** — the gate is wired correctly. The original BUG was an incorrect reading of the workflow by this swarm. Operator just needs to dispatch with `run_provider_live=true` and provide `DAVETV_PROOF_EMAIL` + `DAVETV_PROOF_PASSWORD` secrets for an invited account.

## BUG-SWARM-007 — Web app BASE_URL is hard-coded; isolated sidecar UI proof needs Lane A change

- Severity: **P2**
- Area: Web app API base resolution
- File/line: `apps/hermes-web-tv/src/api/hermesApi.js:7-14`
- Observed behavior: `BASE_URL` is determined at module load by sniffing `window.location.hostname`. There is no env override, build flag, or localStorage override.
- Implication: a sidecar API on `:3299` (per Codex postmortem's "isolated API" guidance) cannot be reached by the running Vite at `:5173` without patching this file (Lane A territory).
- Workaround used: Wave 2.3 sidecar API proof runs via Playwright's `request.newContext()` against the sidecar directly (covers auth → providers → catalog → layouts → logout end-to-end at the HTTP level — see `specs/swarm-20260521-sidecar-api.spec.ts`).
- Fix owner: **agent (after Lane A merges)** — add a `VITE_API_BASE` or localStorage `hermestv:api_base_override` escape hatch for E2E test contexts only (production behaviour unchanged).
- Status: **open** — deferred to post-Lane-A swarm

## BUG-SWARM-004 — partial remediation update (Wave 2.3)

- Earlier status: partially fixed (global-setup tolerant); deep authed UI still BLOCKED
- **Wave 2.3 progress:** Created `tests/playwright/specs/swarm-20260521-sidecar-api.spec.ts` which spins up an isolated API on `:3299` with a throwaway admin, then runs deep authenticated proof via Playwright's HTTP request fixture. Result: **3/3 PASS**, no secret leaks.
- Coverage now provided at the API protocol level:
  - auth-required boundary (401 without session)
  - admin login → session cookie → providers/catalog/layouts (all 200)
  - logout invalidates session (401 again)
  - honest empty-state (no providers → total:0, source:no-providers; no "mock"/"seed" fields)
- Still blocked: deep **browser** UI proof against the isolated API. Needs BUG-SWARM-007 first. Per Codex postmortem corrections, this is documented honestly rather than skipped.
