# 47 - Remaining E2E Completion Contract

Generated: 2026-05-20

Status: BINDING for all Claude/Codex/agent work that claims HermesTV is
complete, ready, deployable, or working end to end.

This contract extends `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`. The provider
truth contract remains the authority for provider proof. This document covers
the remaining work needed after provider registry/catalog/playback code paths
exist: frontend, Tizen, live-provider proof, EPG/source-health, CI, deploy, and
operator evidence.

## Current Truth

As of this contract:

- Lane A provider registry/config has local proof.
- Lane B catalog/search hydration has local service proof.
- Lane C direct stream proxy has local service proof.
- Full provider truth is not complete until a real configured provider produces
  non-zero catalog, play ticket, stream response, no credential leak, and
  sanitized proof artifacts.
- Web build may fail on machines where web dependencies are not installed.
- Tizen packaged app API base, CSP, CORS, AVPlay path, and WGT proof are not
  complete.
- EPG/source-health are not yet aligned to the new provider registry.
- CI/deploy can still be too permissive unless provider-live proof is separated
  from no-provider empty-state proof.

No agent may convert "local service tests pass" into "HermesTV is done."

## Definition Of E2E Done

HermesTV is E2E done only when all of these pass:

1. Backend service tests pass.
2. Web build passes from a clean dependency install.
3. Web app can add/list/test providers using backend APIs.
4. QR provider onboarding either scans a real setup URL or renders no fake QR.
5. `/api/providers` returns real registry state.
6. `/api/catalog` returns non-zero real provider items for at least one live
   configured provider.
7. `/api/search` returns hydrated playable items.
8. `POST /api/play` returns a ticket for a real catalog item.
9. `GET` and `HEAD /api/play/:ticket/stream` return playable stream responses.
10. HLS manifest and direct byte-stream proxy paths are both covered by tests.
11. Tizen packaged build targets the correct backend API base.
12. CSP and CORS allow the packaged TV app to call the backend.
13. Tizen player path uses the ticket endpoint and does not see upstream URLs.
14. EPG, if configured, maps guide channel IDs to catalog/source IDs.
15. Source-health reports configured real providers, not only static heuristics.
16. CI has a no-provider empty-state job and a provider-live proof job.
17. Deploy smoke cannot mark provider playback green from skipped tests.
18. Proof artifacts are saved under `docs/proof/provider-truth/<timestamp>/`
    with no secrets.
19. Secret scans pass against source and proof artifacts.
20. Operator docs describe exactly what is proven, blocked, or unsupported.

## Non-Negotiable Rules

1. No secrets in code, docs, logs, screenshots, browser storage, or git.
2. Do not read `G:\private` or any operator vault path.
3. Do not use mock catalog data for provider-live proof.
4. Do not let provider-live tests pass because no providers are configured.
5. Do not claim Tizen works until packaged API base, CSP/CORS, and player
   proof exist.
6. Do not claim EPG/source-health works unless IDs match catalog/play IDs.
7. Any unsupported feature must say unsupported, not return fake success.
8. Agents must write proof or report blockers. No vague "done" summaries.

## 20-Agent Work Plan

Agents must stay in their lane. If a lane needs another lane's files, report
the dependency instead of editing across ownership boundaries.

### Agent 01 - Truth Lead And Integrator

Owns:

- `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
- `docs/proof/provider-truth/**/summary.md`
- release/evidence checklist docs

Tasks:

- Keep the proof ledger honest.
- Integrate lane reports.
- Reject claims without proof.

Proof:

- Final summary names every pass, fail, and blocker.

### Agent 02 - Live Provider Proof

Owns:

- `tools/test-provider-e2e.js`
- `docs/proof/provider-truth/**`

Tasks:

- Create the live-provider proof runner.
- Sanitize all outputs.
- Fail when no provider is configured unless explicitly in empty-state mode.

Proof:

- Non-zero catalog, play ticket, stream `HEAD/GET`, no leaks.

### Agent 03 - Provider UX And QR

Owns:

- `apps/hermes-web-tv/src/components/QROnboarding.jsx`
- provider setup/add-provider components
- `apps/hermes-web-tv/src/api/hermesApi.js`
- QR parser utilities

Tasks:

- Make QR encode a real setup URL.
- Make provider add/list/test flows use backend provider APIs.
- Remove fake/scannable placeholder QR behavior.

Proof:

- Browser test or screenshot showing real setup URL path and provider add flow.

### Agent 04 - Tizen API Base, CSP, CORS

Owns:

- `apps/hermes-web-tv/src/api/*`
- `apps/hermes-web-tv/index.html`
- `apps/hermes-tv-tizen/src/api/*`
- `tools/tizen-prep.js`
- `services/hermes-tv-api/src/index.js`

Tasks:

- Centralize API-base resolution for web and packaged Tizen.
- Configure CSP and CORS for production TV hosts.
- Honor documented extra origins if supported by env docs.

Proof:

- Packaged build calls the intended backend host.
- CSP/CORS smoke confirms catalog and play requests are allowed.

### Agent 05 - TV Playback Path

Owns:

- `apps/hermes-web-tv/src/components/PlayerModal.jsx`
- `apps/hermes-web-tv/src/hooks/useHlsStream.js`
- `apps/hermes-web-tv/src/hooks/useAvplayStream.js`
- Tizen player bridge files

Tasks:

- Ensure web and Tizen playback use ticket endpoints.
- Use AVPlay on Tizen where available.
- Do not expose upstream provider URLs to the client.

Proof:

- Web playback smoke plus Tizen player-path proof.

### Agent 06 - Source Health Truth

Owns:

- `services/hermes-tv-api/src/routes/sourceHealth.js`
- `services/hermes-tv-api/src/lib/sourceHealthAggregator.js`
- source-health tests

Tasks:

- Source-health must consume provider registry/catalog source IDs.
- Remove static provider assumptions.
- Report disabled, configured, unreachable, and untested honestly.

Proof:

- Source-health response includes registry-backed M3U/Xtream providers.

### Agent 07 - EPG Mapping

Owns:

- `services/hermes-tv-api/src/routes/epg.js`
- `services/hermes-tv-api/src/routes/epgGrid.js`
- XMLTV/channel-map code and tests
- `apps/hermes-web-tv/src/api/epgClient.js`
- `apps/hermes-web-tv/src/components/EPGModal.jsx`

Tasks:

- Map XMLTV channels to real catalog/source IDs.
- Preserve EPG `_meta` in UI diagnostics.
- Replace fake grid data or mark unsupported honestly.

Proof:

- Guide program resolves to a playable catalog item when XMLTV is configured.

### Agent 08 - Search, Detail, And Filters UI

Owns:

- `apps/hermes-web-tv/src/components/SearchModal.jsx`
- `apps/hermes-web-tv/src/components/MediaDetailPanel.jsx`
- `apps/hermes-web-tv/src/components/ProviderFilter.jsx`
- `apps/hermes-web-tv/src/App.jsx`

Tasks:

- Ensure search result -> detail -> watch/download uses hydrated item shape.
- Derive provider filter options from backend state.
- Remove hard-coded Apollo/Xtreme-only assumptions.

Proof:

- UI test or browser proof for search -> play with provider-backed item.

### Agent 09 - CI Provider Gates

Owns:

- `tools/test-e2e-smoke.js`
- `tools/test-provider-e2e.js`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vps.yml`

Tasks:

- Split no-provider and provider-live jobs.
- Fail provider-live job on skip/no-provider.
- Keep empty-state test honest.

Proof:

- CI config shows separate gates and no provider-live skip pass.

### Agent 10 - Secret And Proof Sanitizer

Owns:

- `tools/secret-scan.sh`
- secret-scan config/workflow sections
- proof redaction helper scripts

Tasks:

- Scan source and proof artifacts.
- Redact tickets, URLs, usernames, passwords, API keys, and provider query
  params.

Proof:

- Secret scan passes after proof artifacts are generated.

### Agent 11 - VPS Deploy And Env Wiring

Owns:

- `upstream/docker-vps/**`
- deploy runbooks
- env examples
- compose files

Tasks:

- Make provider env file behavior unambiguous.
- Ensure container receives the same vars documented in runbooks.
- Confirm data volume persists `providers.json`.

Proof:

- Redacted VPS env/provider config proof, no values.

### Agent 12 - Web Dependency And Build Gate

Owns:

- root/package web workspace setup
- `apps/hermes-web-tv/package.json`
- lockfiles
- build docs/scripts

Tasks:

- Make `npm run build:web` reproducible from clean install.
- Resolve missing local `vite` dependency situations.

Proof:

- Clean install then `npm run build:web` passes.

### Agent 13 - Browser E2E

Owns:

- browser/playwright/smoke tests
- web E2E test fixtures

Tasks:

- Add browser proof for provider add/list/catalog/search/play shell.
- Avoid real credentials in fixtures.

Proof:

- Browser run artifacts with no secrets.

### Agent 14 - Tizen Build And Sideload

Owns:

- `apps/hermes-tv-tizen/**`
- `apps/hermes-tv-tizen-native/**` if kept
- Tizen build/sideload docs

Tasks:

- Make canonical Tizen app path clear.
- Build WGT and prove sideload prerequisites.
- Deprecate or repair native scaffold.

Proof:

- WGT build log and device/simulator launch evidence.

### Agent 15 - DVR, Download, Catch-Up Truth

Owns:

- `services/hermes-tv-api/src/routes/dvr.js`
- `services/hermes-tv-api/src/routes/downloads.js`
- `services/hermes-tv-api/src/routes/catchup.js`
- related UI clients/components

Tasks:

- Mark unsupported paths honestly or implement real pipelines.
- Do not show fake recording/download/catch-up success.

Proof:

- Unsupported paths return explicit unsupported status, or real on-disk
  pipeline proof exists.

### Agent 16 - Observability And Diagnostics

Owns:

- request logging
- diagnostics endpoints
- proof metadata helpers

Tasks:

- Add non-secret diagnostics for provider registry, catalog source, proxy path,
  EPG mode, Tizen API base, and current build.

Proof:

- Diagnostics export has enough detail to debug without secrets.

### Agent 17 - Operator Docs Truth Update

Owns:

- `docs/OPERATOR_PROVIDER_WIRING.md`
- deployment/setup docs
- README status sections

Tasks:

- Remove stale "ready" wording unless proof exists.
- Clearly separate implemented, proven, blocked, and unsupported.

Proof:

- Docs point to proof artifacts and do not overclaim.

### Agent 18 - Regression Harness

Owns:

- service regression tests
- web smoke tests
- fixture helpers

Tasks:

- Make provider registry/catalog/playback regressions cheap to catch.
- Keep fixtures fake but structurally equivalent and explicitly non-live.

Proof:

- Regressions fail if disk providers stop populating catalog/playback.

### Agent 19 - Performance And Stability

Owns:

- catalog fetch latency tests
- timeout/fallback behavior
- stream proxy timeout behavior

Tasks:

- Ensure slow providers do not freeze catalog.
- Ensure playback fallback remains bounded.

Proof:

- Timeout tests and latency summary.

### Agent 20 - Release Manager

Owns:

- final PR/checklist
- release notes
- branch hygiene

Tasks:

- Collect all lane reports.
- Verify no unrelated changes are mixed into release claim.
- Produce final pass/fail release decision.

Proof:

- Final release report links every required command and artifact.

## Required Commands

Baseline:

```powershell
npm install
npm run build:web
npm test --prefix services/hermes-tv-api
npm run test:e2e
```

Provider proof:

```powershell
node services/hermes-tv-api/test/providerRegistry.test.js
node services/hermes-tv-api/test/catalogProviders.test.js
node services/hermes-tv-api/test/playbackProxy.test.js
node tools/test-provider-e2e.js
```

Tizen proof:

```powershell
npm run build:web
npm run tizen:prep --if-present
npm run build --prefix apps/hermes-tv-tizen
```

If a command is not implemented, the responsible agent must either implement it
or report it as a blocker. Do not silently skip.

## Proof Artifact Layout

```text
docs/proof/e2e-completion/<YYYYMMDD-HHMMSS>/
  environment.redacted.json
  backend-tests.txt
  web-build.txt
  provider-live.redacted.json
  stream-head.txt
  source-health.redacted.json
  epg-meta.redacted.json
  tizen-build.txt
  tizen-api-base.txt
  browser-smoke.txt
  secret-scan.txt
  summary.md
```

Proof files must not contain credentials, raw paid-provider URLs, provider query
params, usernames, passwords, API keys, or reusable tickets.

## Agent Report Format

Every agent must end with:

```text
Agent:
Lane:
Changed files:
Commands/proof run:
E2E status: PASS | FAIL | BLOCKED
Secrets exposed: NO
Remaining blockers:
Next required lane:
```

The words `complete`, `ready`, `done`, or `working` are allowed only when the
lane's proof is PASS or the sentence explicitly describes a narrower completed
code change.
