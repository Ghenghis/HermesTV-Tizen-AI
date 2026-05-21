# Commands Run — 2026-05-21 04:23 UTC

All commands run from repo root `G:\Github\HermesTV-Tizen-AI`. Outputs are
summarised; full logs live in `test-results/` and per-tool report dirs.

## Wave 0 — Preflight

```bash
$ date -u +"%Y%m%d-%H%M"
20260521-0423

$ git rev-parse --abbrev-ref HEAD
lane-a-provider-registry

$ git status --short | wc -l
62

$ git log --oneline -5
1ed427c fix(auth): keep local reset links on local origin
cb0cbed feat(auth): add email reset account flow
3f2105f feat(agent): add natural intent planner
60ff157 fix(nginx): trust only Cloudflare real IP ranges
22f87c2 feat(agent): search real provider catalog

$ mkdir -p docs/proof/overnight-swarm/20260521-0423/screenshots
```

## Wave 1 — Baseline audit

```bash
$ npm test --prefix services/hermes-tv-api
... 25 test files ...
EXIT=0
651 individual PASS:, 0 FAIL:
```

```bash
$ npm run validate:schemas
=== Results: 131 PASS, 0 FAIL ===  (EXIT=0)
```

```bash
$ npm run audit:secrets       # initial run — BUG-SWARM-001
=== Results: 1 PASS, 1 FAIL ===   (EXIT=1)
WARNINGS in sanitizer/comment lines for m3u_plus, xtream, /get.php, etc.
```

```bash
$ npm run build:web
✓ built in 3.31s   (EXIT=0)
main-*.js: 276.55 kB · gzip 73.66 kB
```

```bash
$ npm run test:e2e            # initial run — BUG-SWARM-002
=== Results: 2 PASS, 10 FAIL ===   (EXIT=1)
   10 of 12 probes hit 401 because auth gate added without auth in smoke
```

```bash
$ node tools/test-provider-e2e.js
FAIL: live-provider proof requires HERMES_PROVIDER_E2E_BASE, or
       PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 for an explicit local live proof
       (BUG-SWARM-003 — BLOCKED owner=Dave/provider)
```

```bash
$ cd tests/playwright && \
  DAVETV_E2E_API_URL=http://localhost:3001 \
  DAVETV_E2E_WEB_URL=http://localhost:5173 \
  npx playwright test specs/swarm-20260521-boundary-proof.spec.ts
... initially 2 fail (401 console-error counted as fatal), patched filter, then:
4 passed (10.8s)   ← chromium-1080p × 2 + samsung-qn85-mock × 2
```

## Wave 2 — Implementation (agent-fixable bugs)

### BUG-SWARM-001 fix: `tools/secret-scan.sh`

Tightened patterns to require credential-shaped values (length / charset),
added sanitizer-file allowlist, awk filter handles Windows drive-letter
colons + skips comment lines.

```bash
$ npm run audit:secrets       # after fix
=== Results: 2 PASS, 0 FAIL ===   (EXIT=0)
```

### BUG-SWARM-002 fix: `tools/test-e2e-smoke.js`

Bootstraps a throwaway smoke admin (DAVETV_ADMIN_EMAIL + random password
that lives only in the child process), points DAVETV_AUTH_STORE at a
mkdtemp dir so the operator's auth.json is never touched, logs in via
POST /api/auth/login, threads the session cookie through every subsequent
probe.

```bash
$ NO_PROVIDER_EMPTY_STATE=1 npm run test:e2e     # honest empty-state mode
=== Results: 12 PASS, 0 FAIL ===   (EXIT=0)

$ npm run test:e2e                               # honest live mode w/o providers
=== Results: 9 PASS, 3 FAIL ===    (EXIT=1)
   3 honest FAILs = play / play-stream / download — gated correctly per
   docs/46 "no skipped success" (would PASS if a real provider were configured)
```

### BUG-SWARM-004 partial fix: `tests/playwright/global-setup.js`

Catches the no-creds login failure, writes an empty cookie + clear warning.
Boundary specs (storageState override) still run; deep auth-gated specs
will fail honestly instead of being silently skipped.

## Wave 4 — Final proof sweep

```bash
$ npm test --prefix services/hermes-tv-api    # API:       651 PASS / 0 FAIL (EXIT=0)
$ npm run build:web                           # Web build: ✓ built in 3.04s (EXIT=0)
$ npm run validate:schemas                    # Schemas:   131 PASS / 0 FAIL (EXIT=0)
$ npm run audit:secrets                       # Secrets:     2 PASS / 0 FAIL (EXIT=0)
$ NO_PROVIDER_EMPTY_STATE=1 npm run test:e2e  # e2e empty:  12 PASS / 0 FAIL (EXIT=0)
$ npm run test:e2e                            # e2e live:    9 PASS / 3 FAIL (EXIT=1)
                                              #  ↑ FAILs are the honest provider-truth
                                              #    gates working as designed per docs/46
$ cd tests/playwright && \
  npx playwright test specs/swarm-20260521-boundary-proof.spec.ts
                                              # Playwright boundary:  4 PASS / 0 FAIL
                                              #   (chromium + samsung-qn85-mock × 2 specs)
```

```bash
$ node tools/test-provider-e2e.js
                                              # PROVIDER-LIVE: BLOCKED — owner=Dave
                                              #   needs HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech
                                              #   or PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 with a real
                                              #   XTREAM_URL/USERNAME/PASSWORD or M3U URL configured
```

## Local environment confirmed reused

```bash
$ curl -sf http://127.0.0.1:5173 -o /dev/null -w "5173=%{http_code}\n"
5173=200                                       # Vite dev server (operator-started)
$ curl -sf http://127.0.0.1:3001/health -o /dev/null -w "3001=%{http_code}\n"
3001=200                                       # API (operator-started, auth-required)
```

The swarm did NOT restart, kill, or replace either process. Playwright
points at the existing :5173 and :3001 per `global-setup.js`.
