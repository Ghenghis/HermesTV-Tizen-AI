# Agent Ledger — 2026-05-21 04:23 UTC

Single-agent overnight execution. Lane assignments by wave.

## Pre-existing user WIP (preserved, not reverted)

Branch: `lane-a-provider-registry`

Dirty modified files (62 total — provider/auth/voice/playlists/playwright).
Assumption: this is Lane A finished/in-progress work owned by Dave + a
prior agent. The swarm audited and proved it; nothing was undone.

## Wave 0 — Preflight

| Lane | Action | Result |
| --- | --- | --- |
| Truth Lead | Created proof folder + 5 ledgers | DONE |
| Truth Lead | Read AGENTS, constitution, 54, 46, 47, 49 | DONE |
| Repo State | Inventoried dirty files, scripts, branch | DONE |
| Secret Safety | Confirmed G:/private/env access (read-only, no echo) | DONE |

## Wave 1 — Truth Audit

| Lane | Action | Finding |
| --- | --- | --- |
| Provider Registry | API tests + xtream fixture e2e | PASS — 651 individual PASS across 25 suites |
| Catalog/Search | `npm run validate:schemas` | PASS — 131 / 0 |
| Web Build | `npm run build:web` | PASS |
| Auth/Admin/SMTP | auth.test.js + authStoreBootstrap.test.js | PASS — invite/reset/SMTP-not-configured fallbacks honest |
| Smoke E2E | `npm run test:e2e` | BUG-SWARM-002 — 2/10 PASS after auth gate landed |
| Secret Safety | `npm run audit:secrets` | BUG-SWARM-001 — false positive on sanitizer self-references |
| Provider-Live | `node tools/test-provider-e2e.js` | BUG-SWARM-003 — BLOCKED owner=Dave (no real provider env) |
| Playwright Proof | spec layout audit | BUG-SWARM-004 — global-setup throws without admin creds |
| Deploy VPS | review .github/workflows/deploy-vps.yml | BUG-SWARM-006 — INITIALLY logged, later REJECTED (already wired) |

## Wave 2 — Implementation (priority order per docs/54)

### Wave 2.0 — Tooling fixes (this run's main deliverable)

| Lane | Change | Proof |
| --- | --- | --- |
| Secret Safety | `tools/secret-scan.sh`: tightened patterns, Windows path fix, sanitizer allowlist | `npm run audit:secrets` → 2 / 0 (was 1/1) |
| CI/Regression | `tools/test-e2e-smoke.js`: throwaway admin bootstrap, session cookie threading | `NO_PROVIDER_EMPTY_STATE=1 npm run test:e2e` → 12 / 0 (was 2/10) |
| Playwright Proof | `tests/playwright/global-setup.js`: tolerate no-creds login, write empty cookie + warn | global-setup no longer throws; boundary specs run while auth-gated specs fail honestly |
| Playwright Proof | New `swarm-20260521-boundary-proof.spec.ts` (unauth boundary) | 4 / 0 across chromium + samsung-qn85-mock projects |

### Wave 2.1 — Instant playback popup audit (P0)

- Searched 14+ shells + App.jsx for `showActionPicker` / `showWatchPopup` / `showPlayMenu` style state — **none found**
- App.jsx:1235 `handleItemClick`: routes `live|vod|movie|movies|series|show` directly to `handlePlay()` (instant playback)
- The only "interruption" between click and play is the parental gate, which IS a contract requirement, not a violation
- Info key (`i`, Tizen 457) is the explicit "details first" gesture
- All 14 shells consistently call `onItemSelect={handleItemClick}` via ShellRenderer
- **Verdict: PASS** at code level. docs/54 P0 "Instant Playback" satisfied.

### Wave 2.2 — Deploy workflow static check

- Read `.github/workflows/deploy-vps.yml` end-to-end
- **Finding: BUG-SWARM-006 was incorrect.** The live-provider gate IS already wired:
  - `run_provider_live` workflow_dispatch input
  - "Mark release promotion blocked when provider-live proof is skipped" step
  - "Provider-live truth proof (against deployed VPS)" step runs `tools/test-provider-e2e.js` with `PROVIDER_E2E_MODE=live`
  - "Enforce provider-live PASS (no skip allowed)" step explicitly fails if log isn't `=== Results: N PASS, 0 FAIL` with N>=1
  - Requires `DAVETV_PROOF_EMAIL` + `DAVETV_PROOF_PASSWORD` secrets — an invited account, not Dave's admin
- **Verdict: ALREADY-IMPLEMENTED** (rejected the bug). Operator just needs to dispatch with `run_provider_live=true`.

### Wave 2.3 — Sidecar-API authenticated Playwright proof

- Per Codex postmortem: "Local deep proof can be run by starting an isolated API on another port"
- New `tests/playwright/specs/swarm-20260521-sidecar-api.spec.ts`:
  - Spawns `node services/hermes-tv-api/src/index.js` on `:3299` with throwaway admin email/password + `DAVETV_AUTH_STORE` pointing at a per-test `mkdtemp` dir
  - Uses Playwright's `request.newContext()` to drive the API HTTP-level
  - Asserts: auth-required boundary (401), admin login → session → providers/catalog/layouts (all 200), logout invalidates, honest empty-state (`total:0`, `_meta.source: no-providers`, no fake `mock`/`seed` fields)
  - Scans every response body for credential-leak patterns
- **Result: 6 / 0 PASS across chromium-1080p + samsung-qn85-mock projects**, no secret leaks
- Discovered **BUG-SWARM-007**: web app's `BASE_URL` is hardcoded in `apps/hermes-web-tv/src/api/hermesApi.js`. Browser-level deep UI against an isolated API needs a Lane-A-owned escape hatch (env or localStorage override).

### Wave 2.4 — Voice / TTS proof

- `tools/test-e2e-smoke.js probeVoices` and `probeTtsSpeak` already cover the surface
- Empty-state run: `GET /api/tts/voices` → 12 voices listed (en-US-AriaNeural first); `POST /api/tts/speak` → 202 "azure_not_configured" stub (correct without AZURE_TTS_KEY)
- **Verdict: PASS** at API contract level. Real Azure synth proof BLOCKED owner=Dave (needs `AZURE_TTS_KEY` env).

### Wave 2.5 — Secure provider setup redaction

- Ran `node services/hermes-tv-api/test/providers.route.test.js` → 26 PASS / 0 FAIL
- `providers.route.test.js:124` explicitly asserts `POST response carries no password field`
- Ran `node services/hermes-tv-api/test/providerStore.test.js` → 31 PASS / 0 FAIL
- Plus existing redactor regex coverage in `m3uClient.js`, `sanitizeLog.js`, `streamResolver.js`
- **Verdict: PASS** — redaction is enforced + proven.

### Wave 2.6 — Upstream View pack license audit

- `upstream/web-apps/IPTV_WEB_25_VIEW_PACK_MANIFEST.md` exists, lists all 25 source projects with:
  - Source path
  - License status read from the local source tree
  - Adoption mode (Native View / Source Pack / Sandbox App / Pattern Only)
  - GPL / AGPL / Apache / MIT / Boost / PolyForm / no-license cases each correctly classified
- `docs/reference-apps/LICENSE_ATTRIBUTION.md` exists (294 lines)
- **Verdict: PASS** — provenance and license obligations documented per docs/54 P1.

## Wave 3 — SWAT

Folded into Wave 2 (single-agent execution). All agent-fixable P0/P1 bugs
were fixed in Wave 2; remaining items are honestly BLOCKED with owners.

## Wave 4 — Final Proof

| Command | Result |
| --- | --- |
| `npm test --prefix services/hermes-tv-api` | **651 PASS / 0 FAIL** (EXIT=0, 25 suites) |
| `npm run build:web` | **PASS** |
| `npm run validate:schemas` | **131 / 0** |
| `npm run audit:secrets` | **2 / 0** |
| `NO_PROVIDER_EMPTY_STATE=1 npm run test:e2e` | **12 / 0** |
| `npm run test:e2e` (live mode) | **9 / 3** — honest fail per docs/46 anti-skip |
| `npx playwright test specs/swarm-20260521-boundary-proof.spec.ts` | **4 / 0** |
| `npx playwright test specs/swarm-20260521-sidecar-api.spec.ts` | **6 / 0** |
| `node tools/test-provider-e2e.js` | **BLOCKED** — owner=Dave/provider |

Decision lives in `release-decision.md`.

## Secrets exposure

NO. Every command output recorded in `commands.md` was scanned. No real
password, token, ticket, provider URL, or set-cookie value appears in the
proof folder. Sidecar API runs with a per-test mkdtemp auth store; the
operator's `/var/lib/hermestv/auth.json` is never touched.
