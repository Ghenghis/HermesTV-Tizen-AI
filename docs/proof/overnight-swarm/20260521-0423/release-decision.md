# Release Decision — 2026-05-21 04:23 UTC

**Decision: BLOCKED** — agent-fixable lanes PASS; live-provider proof and
authed UI proof require human-owned dependencies (Dave admin creds + real
provider env / VPS).

Per docs/54 §"Anti-Skip Completion Rules":
> `BLOCKED`: human-owned dependency prevents proof.

This is the honest status, not a fake skip-pass.

---

## P0 fixed

- **BUG-SWARM-001** `npm run audit:secrets` was failing on sanitizer self-
  references. Patterns tightened to require credential-shaped values; sanitizer
  file allowlist + comment-line filter added; Windows drive-letter colon path
  handling fixed in the awk filter. **Now: 2 PASS, 0 FAIL** (EXIT=0).
  File: `tools/secret-scan.sh`.

- **BUG-SWARM-002** `npm run test:e2e` was 10/12 FAIL because the auth gate
  landed in lane-a-provider-registry but the smoke runner had no session.
  Smoke now bootstraps a throwaway admin in a mkdtemp store, logs in,
  threads the session cookie. **Empty-state mode 12 PASS / 0 FAIL; live
  mode 9 PASS / 3 honest FAIL** (correctly gated by docs/46 anti-skip).
  File: `tools/test-e2e-smoke.js`.

## P1 fixed

- **BUG-SWARM-004 (partial)** Playwright `global-setup.js` now tolerates the
  no-admin-creds case (writes empty cookie + clear warning) so unauth boundary
  specs run without skipping. Deep authed UI proof remains BLOCKED (see below).
  File: `tests/playwright/global-setup.js`.

- **Unauth boundary UI proof** — new spec exercises login screen controls
  with keyboard/D-pad style navigation, intentionally-bad creds, Enter
  submit, Escape recovery, scroll on small viewport. 4 tests PASS across
  chromium-1080p and samsung-qn85-mock projects. 7 screenshots saved with
  interaction-before-capture provenance. No secret leak in any image.
  File: `tests/playwright/specs/swarm-20260521-boundary-proof.spec.ts`.

## Open P0 / P1 — agent-fixable

(none — all agent-fixable items either fixed or already verified clean)

## Open P0 / P1 — BLOCKED with owner

- **BUG-SWARM-003 — Live provider proof** (P0)
  - Owner: **Dave / provider credentials**
  - Cause: no real provider env vars in the agent's process; the
    `tools/test-provider-e2e.js` runner correctly refuses to PASS without
    `HERMES_PROVIDER_E2E_BASE` or `PROVIDER_E2E_ALLOW_LOCAL_LIVE=1`
  - Unblock: configure one of these in a private VPS or local env:
    - `APOLLO_M3U_URL` (real Apollo Group M3U)
    - `XTREMEHD_M3U_URL` (real xTremeHD M3U)
    - `XTREAM_URL` + `XTREAM_USERNAME` + `XTREAM_PASSWORD`
  - Then run: `PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 node tools/test-provider-e2e.js`

- **BUG-SWARM-004 — Deep authed UI proof** (P1 remainder)
  - Owner: **Dave / VPS-secret**
  - Cause: the running API was started with `DAVETV_ADMIN_EMAIL` +
    `DAVETV_ADMIN_PASSWORD` in the operator's shell env; those values are
    not in the agent's process env and per the constitution the agent must
    not attempt to extract them
  - Unblock: re-run Playwright with `DAVETV_E2E_ADMIN_EMAIL` and
    `DAVETV_E2E_ADMIN_PASSWORD` and `DAVETV_E2E_ALLOW_ACCOUNT_SETUP=1`
    set to the real admin pair the running API was bootstrapped with
  - Then run: `cd tests/playwright && npm run proof` (auth-proof + gallery)

- **BUG-SWARM-006 — Deploy-VPS live-provider gate** (P1)
  - Owner: **Dave** (deploy authorization)
  - Cause: the post-deploy smoke probe needs the `provider-live` mode
    wired into `.github/workflows/deploy-vps.yml`. The contract spec is in
    docs/49 §P0-2; enforcement is not yet wired into the deploy YAML.
  - Status: agent has not yet patched the deploy workflow this overnight
    because (a) PR #109 just landed touching this file and (b) deploying
    requires human authorization. Logged as a fix to land in the next
    daylight session with explicit Dave authorization.

## P2 / P3 carried forward

- **BUG-SWARM-005** `audit:secrets` wrapper surfaces only exit-1, not the
  underlying message. Cosmetic. Not fixed this swarm.

## Overall release status

| Gate | Status |
| --- | --- |
| API tests (651 PASS / 0 FAIL across 25 suites) | **PASS** |
| Web build | **PASS** |
| Schema validation (131 / 0) | **PASS** |
| Secret scan | **PASS** |
| E2E smoke — empty-state mode (12 / 0) | **PASS** |
| E2E smoke — live mode | **honest FAIL** (no real providers — gate working as designed) |
| Playwright unauth boundary proof (4 / 0) | **PASS** |
| Playwright authed deep UI | **BLOCKED** — Dave admin creds |
| `tools/test-provider-e2e.js` live | **BLOCKED** — Dave / provider creds |
| Deploy-VPS live-provider gate | **BLOCKED** — Dave authorization |
| `.env` / `.pem` / `.authkey` committed | **NONE** (PASS) |
| Secrets in proof artifacts | **NONE** (PASS — checked) |

**Release decision: BLOCKED.**

Software lanes are green and the anti-skip gates are working honestly.
Final release requires:

1. Dave/operator supplies the real Dave admin password (so Playwright deep
   UI proof can run end-to-end) — or — accepts the unauth boundary proof
   as the current Playwright surface.
2. Dave/operator configures at least one real provider (Apollo Group M3U,
   xTremeHD M3U, or Xtream Codes) on the local or VPS instance and runs
   `node tools/test-provider-e2e.js` in live mode against it.
3. Dave/operator authorizes a deploy run, after which the agent (or a
   follow-up swarm) wires the live-provider gate into the deploy YAML.
4. Real Samsung Tizen TV sideload + smoothness proof (per docs/49
   §"Release Definition" item 11).

## Next exact command for Dave

```bash
# Step 1: confirm the working tree, then bundle this swarm's evidence:
cd /g/Github/HermesTV-Tizen-AI
git status --short
ls -la docs/proof/overnight-swarm/20260521-0423/

# Step 2: review the 3 modified files this swarm touched
git diff tools/secret-scan.sh tools/test-e2e-smoke.js tests/playwright/global-setup.js

# Step 3: review the 2 new files this swarm added
git status --short docs/proof/overnight-swarm/20260521-0423/
git status --short tests/playwright/specs/swarm-20260521-boundary-proof.spec.ts

# Step 4 (Dave): unblock live-provider proof
# Provide ONE of:
#   - PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 against a locally-configured provider
#     (XTREAM_URL/USERNAME/PASSWORD or APOLLO_M3U_URL etc.)
#   - HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech (real VPS)
# Then run:
PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 node tools/test-provider-e2e.js
# OR
HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech PROVIDER_E2E_MODE=live \
  node tools/test-provider-e2e.js
```
