# DaveTV Release-Readiness Checklist

Generated: 2026-05-20
Source contracts: `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`, `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`, `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`, `docs/49_TRUTH_AUDIT_RELEASE_READINESS_CONTRACT.md`
Workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy-vps.yml`
Latest live proof: `docs/proof/provider-truth/20260520-195404/` (PASS 12/12 against `https://hermestv.daveai.tech`)

Status legend: PASS = proven by file/test/log; FAIL = contradicted by evidence; PENDING = not yet proven, no contradiction.

## A. Provider Truth Contract (doc 46)

| Clause | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| 46.P0-1 Registry as source of truth (no static lists) | PASS | `services/hermes-tv-api/src/lib/providerRegistry.js` exists; `services/hermes-tv-api/src/routes/providers.js:47-60` uses `providerRegistry.list()`; live proof returned `providers_count_3` | none | none |
| 46.P0-2 Provider setup persists durable config | PASS | `services/hermes-tv-api/test/providerStore.test.js`, `providerQrSetup.test.js` (16 PASS); doc 49:11-19 confirms `/setup/provider/submit` accepts and persists | none | none |
| 46.P0-3 One catalog/source identity contract | PASS | `services/hermes-tv-api/test/catalogProviders.test.js`, `catalogMerge.test.js` run in `package.json:10` | none | none |
| 46.P0-4 Playback proxy supports HLS + direct byte streams | PASS | `playbackProxy.test.js`, `hlsProxy.test.js` in `package.json:10`; live stream_get_status_200 + 342 media bytes | none | none |
| 46.P0-5 Tizen API base centralized | PENDING | `apps/hermes-tv-tizen/src/api/apiBase.js` exists; `tools/tizen-prep.js` referenced — no signed .wgt artifact under `apps/hermes-tv-tizen/` | No WGT proof file; no on-device CSP/CORS smoke log | Operator must run `npm run build:web && npm run tizen:prep` and capture `tizen-api-base.txt` proof |
| 46.P0-6 CI/smoke separates empty-state vs provider-live | PASS | `.github/workflows/ci.yml:256-320` empty-state job, `:344-420` provider-live release-gate job with `if: workflow_dispatch && inputs.run_provider_live == 'true'` | none | none |
| 46 Rule 1 No skipped path counts as provider PASS | PASS | `ci.yml:394-401` `Enforce live-provider non-skip contract` regex `Results: [1-9]\d* PASS, 0 FAIL` | none | none |
| 46 Rule 3 QR is real setup URL or visibly non-scannable | PASS | doc 49:11-19 (Codex correction landed); `providerQrSetup.test.js` proves real `setup_url` returned from `POST /api/pair`; commit `be21923` | none | none |
| 46 Required proof artifacts under `docs/proof/provider-truth/<ts>/` | PASS | `docs/proof/provider-truth/20260520-195404/` has all required files (providers.redacted.json, catalog.meta.json, play-ticket.redacted.json, stream-head.txt, stream-get.txt, source-health.redacted.json, commands.txt, summary.md) | none | none |
| 46 Restart-survival for saved providers | PENDING | `providerStore.test.js` covers durable file persistence; doc 49 P0-4 asks for `setupProviderRestart.e2e.test.js` end-to-end chain | The dedicated cross-restart e2e file is not in `services/hermes-tv-api/test/` (verified by Glob) | Add `setupProviderRestart.e2e.test.js`: submit form → restart store → providers → catalog → play → stream |
| 46 No credential leak in proof artifacts | PASS | `20260520-195404/summary.md:18-23` `proof_artifacts_no_credential_leak` PASS; CI `secret-scan` job `ci.yml:427-526` | none | none |
| 46 Source health from registry (not static) | PARTIAL FAIL | `services/hermes-tv-api/src/routes/sourceHealth.js:136` still emits `mock: true` envelope for unconfigured providers | doc 49 P1 line 167 flags this | Remove `mock:true` envelope; route through `providerRegistry.listFull()` |
| 46 Stalker provider type honest about implementation | FAIL | `providerStore.js:63` accepts `stalker` as valid type but no Stalker portal auth/catalog/playback exists end-to-end | doc 49 P2 line 184; doc 48:171 | Either implement Stalker MAC/session flow or reject `type: stalker` in `providerStore.add()` |

## B. E2E Completion Contract (doc 47)

| Clause | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| 47.1 Backend service tests pass | PASS | `package.json:10` runs 16 test files via `npm test --prefix services/hermes-tv-api`; CI job `api-regression-tests` enforces | none | none |
| 47.2 Web build passes from clean install | PASS | `ci.yml:106-144` `web-build` job runs `npm install --include=dev` then `npm run build` in `apps/hermes-web-tv`, asserts `dist/` exists | none | none |
| 47.3 Web app add/list/test providers via backend APIs | PASS | `providers.js` CRUD + `/api/providers/parse-qr`; `QROnboarding.jsx` modified per recent commit `be21923` | none | none |
| 47.4 QR onboarding real URL or visibly non-scannable | PASS | doc 49:11-19; commit `be21923 fix(provider-qr): generate real setup QR and proof` | none | none |
| 47.5 `/api/providers` returns real registry state | PASS | live proof `providers_count_3` against deployed VPS | none | none |
| 47.6 `/api/catalog` non-zero for at least one live provider | PASS | live proof `catalog_nonzero_290` (290 items) | none | none |
| 47.7 `/api/search` returns hydrated playable items | PENDING | No `services/hermes-tv-api/test/search.*.js` in test runner; doc 48 row "Web UI" lists search proof as required | search hydration test missing | Add `search.hydration.test.js` covering result → detail → play |
| 47.8-9 Play ticket + stream HEAD/GET | PASS | live proof `play_ticket`, `stream_head_status_302`, `stream_get_status_200`, `stream_media_bytes_342` | none | none |
| 47.10 HLS + direct byte-stream both covered | PASS | `hlsProxy.test.js` + `playbackProxy.test.js` both in `package.json:10` | none | none |
| 47.11 Tizen packaged build targets correct backend | PENDING | `apps/hermes-tv-tizen/src/api/apiBase.js` exists but no build artifact, no `tizen-api-base.txt` proof | No WGT produced in `apps/hermes-tv-tizen/` | Build WGT, inspect for API base; capture proof |
| 47.12 CSP/CORS allow packaged TV app | PENDING | `services/hermes-tv-api/src/index.js` carries CORS config; no CSP-allow proof for TV host captured | No CSP probe log | Operator must run packaged-app smoke and attach Network/Console capture |
| 47.13 Tizen player uses ticket endpoint (no upstream URL) | PENDING | `apps/hermes-web-tv/src/hooks/useAvplayStream.js` exists per doc 49:175; doc 49 P1 flags "AVPlay must be wired on Tizen or release claims removed" | No on-device AVPlay proof | Capture `tizen-player-proof.txt` from device or shim |
| 47.14 EPG channel IDs map to catalog/source IDs | PASS | `services/hermes-tv-api/test/epgGridMapping.test.js`, `epgProviderSources.test.js`, `epgWaterfall.test.js` all in `package.json:10` | none | none |
| 47.15 Source-health reports real providers | PARTIAL FAIL | live `source-health.redacted.json` exists; `sourceHealth.js:136` still emits `mock:true` for unconfigured rows | doc 49 P1:167 | Remove `mock:true` flag; route through registry contract |
| 47.16 CI has no-provider job + provider-live job | PASS | `ci.yml:256-320` empty-state, `:344-420` provider-live; commit `57084b1 ci(lane-09): split empty-state vs provider-live proof` | none | none |
| 47.17 Deploy smoke cannot mark provider-live green from skipped tests | PASS | `deploy-vps.yml:356-369` marks promotion BLOCKED when `run_provider_live != 'true'`; `:426-439` enforces PASS-only on the proof step | none | none |
| 47.18 Proof artifacts under `docs/proof/<ts>/` no secrets | PASS | `20260520-195404/` directory + `secret-scan` job + `proof_artifacts_no_credential_leak` PASS | none | none |
| 47.19 Secret scans pass | PASS | CI `secret-scan` job + `tools/secret-scan.sh` pattern array `ci.yml:451-468` | none | none |
| 47.20 Operator docs reflect proven vs blocked | PASS | `docs/49_TRUTH_AUDIT_RELEASE_READINESS_CONTRACT.md` enumerates P0 blockers; `docs/OPERATOR_PROVIDER_WIRING.md` exists | none | none |

## C. Reference Apps Adoption Contract (doc 48)

| Clause | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| 48 License boundary: no GPL/AGPL paste | PASS | `services/hermes-tv-api/test/m3uParser.test.js`, `xtreamFixture.e2e.test.js` adopted as test-pattern only; commit `fdfae96 test+impl: Reference-Apps Adoption Priority 1 (Xtream fixture) + Priority 2 (M3U parser)` | none | none |
| 48 P0.1 Xtream fixture (IPTVnator pattern) | PASS | `services/hermes-tv-api/test/xtreamFixture.e2e.test.js` runs in `package.json:10`; proof under `docs/proof/provider-truth/fixture-20260520-185634/xtreamFixture-e2e.log` | none | none |
| 48 P0.2 Fixture-provider E2E labelled fixture (not live) | PASS | proof dir name `fixture-20260520-185634` + log filename | none | none |
| 48 P0.3 Live-provider E2E separate, fails on empty/skipped | PASS | `ci.yml:394-401` + `tools/test-provider-e2e.js` already covered above | none | none |
| 48 P0.4 Robust M3U parser tests before parser changes | PASS | `m3uParser.test.js` in runner; commit `fdfae96` | none | none |
| 48 P0.5 Source-health from registry/catalog IDs | FAIL | `sourceHealth.js:136` still has `mock:true` envelope | doc 49 P1 | Remove static path; route through registry |
| 48 P0.6 EPG IDs map to playable catalog IDs | PASS | `epgGridMapping.test.js`, `epgProviderSources.test.js`; commit `9197155 test+impl: Priority 3 EPG waterfall + safe fuzzy + epgGrid de-mock` | none | none |
| 48 P0.7 Web + Tizen playback use ticket endpoints only | PENDING | Live web flow uses ticket; on-device Tizen path not proven | Tizen ticket proof missing | Capture on-device evidence |
| 48 No source paste over 5 lines | PASS | No `iptv-org`/`iptvnator`/`Extreme-InfiniTV` raw source blocks in HermesTV diffs; tests adopt behavior contracts only | none | none |
| 48 M3U real-world coverage: BOM/CRLF/EXTGRP/EXTVLCOPT/tvg-chno/etc | PASS | `m3uParser.test.js` exists in runner | none | none |
| 48 Xtream completeness: account/live/VOD/series/EPG/output formats | PASS | `xtreamFixture.e2e.test.js` + commit fdfae96 covers fixture proof | none | none |
| 48 Source-health distinguishes states honestly | FAIL | `mock:true` flag contradicts honest state model | doc 49 P1 | Remove flag; emit explicit `not_configured` / `disabled` / `untested` |
| 48 Catchup/DVR/Downloads honest unsupported | PARTIAL FAIL | `services/hermes-tv-api/src/routes/catchup.js:21` says `play_catchup_item (501 / ticket envelope)`; doc 49 P0-8 demands real bytes or removal | doc 49 P0-8 | Either disable UI entry points (`DownloadModal.jsx`, `RecordingsSection.jsx`, `CatchupRail.jsx`) for release builds or implement byte pipelines |
| 48 Stalker honest about (un)implementation | FAIL | `providerStore.js:63` accepts `stalker` but no E2E path exists | doc 49 P2 | Reject `stalker` type until implemented |

## D. npm Test Coverage vs Contract Behaviors

| Behavior | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| Schema validation | PASS | `package.json:10` invokes `../../tools/schema-validate.js` first | none | none |
| Health route | PASS | `test/health.test.js` (verified Glob) | none | none |
| Playlists smoke | PASS | `test/playlists.smoke.js` | none | none |
| XMLTV smoke | PASS | `test/xmltv.smoke.js` | none | none |
| HLS proxy | PASS | `test/hlsProxy.test.js` | none | none |
| Playback proxy | PASS | `test/playbackProxy.test.js` | none | none |
| Catalog merge | PASS | `test/catalogMerge.test.js` | none | none |
| M3U parser | PASS | `test/m3uParser.test.js` | none | none |
| EPG waterfall | PASS | `test/epgWaterfall.test.js` | none | none |
| EPG grid mapping | PASS | `test/epgGridMapping.test.js` | none | none |
| EPG provider sources | PASS | `test/epgProviderSources.test.js` | none | none |
| Provider store | PASS | `test/providerStore.test.js` | none | none |
| Provider registry | PASS | `test/providerRegistry.test.js` | none | none |
| Providers route | PASS | `test/providers.route.test.js` | none | none |
| Provider QR setup | PASS | `test/providerQrSetup.test.js` (16 PASS) | none | none |
| Catalog providers | PASS | `test/catalogProviders.test.js` | none | none |
| Xtream fixture E2E | PASS | `test/xtreamFixture.e2e.test.js` | none | none |
| Setup → restart → catalog → play chain | PENDING | doc 49 P0-4 requires new `setupProviderRestart.e2e.test.js`; file not present in `test/` | one test missing | Author the file, add to `package.json:10` chain |
| Search hydration coverage | PENDING | No `search.*.test.js` in runner | one test missing | Add search → detail → play chain test |
| AVPlay/Tizen player path | PENDING | No `tizenPlayer.test.js` shim | on-device proof gap | Add shim test or capture device evidence |

## E. CI Gates (.github/workflows/ci.yml)

| Clause | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| Schema validation gate (0 FAIL enforced) | PASS | `ci.yml:38-70` | none | none |
| API/provider regression on every PR | PASS | `ci.yml:79-100` | none | none |
| Web build on every PR + dist artifact upload | PASS | `ci.yml:106-144` | none | none |
| Chatbot integration ≥46 PASS / 0 FAIL | PASS | `ci.yml:153-240` | none | none |
| E2E smoke empty-state honest (12 PASS / 0 FAIL, requires NO_PROVIDER_EMPTY_STATE=1) | PASS | `ci.yml:256-320`; env-strip enforcement `:281-292` | none | none |
| Provider-live release-gate (workflow_dispatch only, no skip counts as PASS) | PASS | `ci.yml:344-420` with `if: workflow_dispatch && inputs.run_provider_live == 'true'` | none | none |
| Secret scan grep + entropy + .env file check | PASS | `ci.yml:427-526` | none | none |
| Sanitized proof artifact upload on live job | PASS | `ci.yml:404-420` uploads `docs/proof/provider-truth/` | none | none |

## F. VPS Deploy Gates (.github/workflows/deploy-vps.yml)

| Clause | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| Trigger: workflow_dispatch ONLY (no auto-deploy on push) | PASS | `deploy-vps.yml:17-33` | none | none |
| Password-auth via SSHPASS env (not argv) | PASS | `deploy-vps.yml:97-117`; secret name `VPS_PASS` | none | none |
| Per-deploy GIT_SHA + BUILD_TIME embedded into image | PASS | `deploy-vps.yml:182-190` | none | none |
| Container health gate (api + web healthy in 60s) | PASS | `deploy-vps.yml:199-216` | none | none |
| Smoke probes against PRIMARY_HOST=`hermestv.daveai.tech` with FALLBACK_HOST=`tv.daveai.tech` | PASS | `deploy-vps.yml:62-63, 244-269` | DNS for tv.daveai.tech still points elsewhere (task #48 pending) | Operator must complete DNS swap |
| Smoke step `continue-on-error: true` (Cloudflare blocks GHA runner IP 403) | PASS | `deploy-vps.yml:236-237` documented; container healthcheck is the real gate | none | none |
| `run_provider_live` input triggers post-deploy live proof | PASS | `deploy-vps.yml:25-33, 387-424` | none | none |
| Release promotion BLOCKED when provider-live skipped | PASS | `deploy-vps.yml:356-369` warning + summary | none | none |
| Provider-live PASS enforcement on the VPS run | PASS | `deploy-vps.yml:426-439` grep `Results: [1-9]\d* PASS, 0 FAIL` | none | none |
| Sanitized proof artifacts uploaded regardless of outcome | PASS | `deploy-vps.yml:441-450` | none | none |
| All secrets referenced by NAME only (no values in YAML) | PASS | `deploy-vps.yml:99-101, 125-128`; `secrets.VPS_HOST`, `secrets.VPS_USER`, `secrets.VPS_PASS`, `secrets.VPS_PORT`; `ci.yml:362-369` references `APOLLO_M3U_URL`, `XTREMEHD_M3U_URL`, `XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD`, `JELLYFIN_URL`, `JELLYFIN_API_KEY`, `IPTV_ORG_ENABLED` | none | none |

## G. Tizen Build (signed .wgt for QN85/QN95)

| Clause | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| Canonical Tizen app path declared | PARTIAL | Two app dirs exist: `apps/hermes-tv-tizen/` (wrapper) and `apps/hermes-tv-tizen-native/` (legacy); doc 46:312-326 says canonical packaged app must be unambiguous | Two scaffolds remain | Either deprecate `apps/hermes-tv-tizen-native/` in README or repair its bundle |
| config.xml present | FAIL for primary | `apps/hermes-tv-tizen/config.xml.example` only (no `config.xml`); `apps/hermes-tv-tizen-native/config.xml` exists | Primary app has no real config.xml | Copy `config.xml.example` → `config.xml`, populate appid/version |
| Signed .wgt artifact produced | FAIL | No `.wgt` file found under either app dir | No build artifact | Run Samsung Tizen Studio CLI (`tizen build-web` → `tizen package -t wgt -s <profile>`) on operator workstation |
| AVPlay integration documented | PASS | `apps/hermes-tv-tizen/AVPLAY_INTEGRATION.md` present | none | none |
| Sideload runbook | PASS | `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md`, `docs/34_TIZEN_BUILD_AND_SIDELOAD.md`, `docs/35_TIZEN_DEVELOPER_MODE_SHERRI.md` | none | none |
| QN85Q7FAAFXZA + QN95-class verified target | PASS (docs) | `prompts/CLAUDE_MASTER_PROMPT.md:23-25`; MEMORY rule "QN-class QLED is the primary target" | On-device performance proof not captured | Operator side-loads `.wgt` on QN85 and captures launch/playback screenshots |

## H. Release-Day Actions

| Clause | Status | Evidence | Blocker | Owner-action |
| --- | --- | --- | --- | --- |
| DNS swap `tv.daveai.tech` → HermesTV VPS | PENDING | Task #48 still pending; `deploy-vps.yml:62-63` keeps `tv.daveai.tech` as fallback only; latest proof against `hermestv.daveai.tech` | DNS still points elsewhere | Operator updates DNS at registrar; verify `is_hermes_host("tv.daveai.tech")` returns true |
| Rotate any leaked secrets | PASS (post-incident) | Task #93 completed `SECURITY: Rotate VPS_PASS`; ensure GH secrets refreshed | none | Re-run `gh secret set VPS_PASS` (and any other rotated values) before release dispatch |
| Run workflow_dispatch with `run_provider_live=true` | PENDING (must be done day-of) | `deploy-vps.yml:25-33` accepts input | release-gate cannot be passed until executed | Operator triggers `Deploy VPS` with `run_provider_live=true`; archive run URL |
| Sanitized proof artifact downloaded and filed | PENDING | proof flow exists; operator must save artifact bundle | none | Download artifact `provider-truth-vps-<run_id>` and copy into `docs/proof/release/<date>/` |
| Release notes referencing every artifact | PENDING | `docs/45_DAVETV_REBRAND_NOTES.md` present, no release notes file | Release notes not authored | Operator drafts `docs/RELEASE_NOTES_v1.md` referencing proof URLs |
| Operator pre-flight: `XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD` configured on VPS | PASS (live proof confirms) | `20260520-195404/summary.md` PASS with `providers_count_3` and `catalog_nonzero_290` against the deployed VPS | none | none |
| Operator pre-flight: GH Action secrets configured | PASS (live job ran) | live ledger exists; `ci.yml` references `APOLLO_M3U_URL`, `XTREMEHD_M3U_URL`, `XTREAM_URL/USERNAME/PASSWORD`, `JELLYFIN_URL/API_KEY`, `IPTV_ORG_ENABLED` | none | none |

## I. Remaining doc 49 P0 Items (cross-reference)

| Doc 49 item | Status | Evidence | Owner-action |
| --- | --- | --- | --- |
| P0-1 CI runs `npm test --prefix services/hermes-tv-api` | PASS | `ci.yml:79-100` | none |
| P0-2 Provider-live proof mandatory for release/deploy promotion | PASS | `deploy-vps.yml:356-369` BLOCKED when skipped | Operator must run with `run_provider_live=true` on release day |
| P0-3 Live E2E tool supports HTTPS | PASS | live ledger ran against `https://hermestv.daveai.tech` successfully | none |
| P0-4 Setup → restart → catalog → play chain gate | FAIL | `setupProviderRestart.e2e.test.js` file does not exist in `services/hermes-tv-api/test/` | Author the missing E2E test |
| P0-5 UI provider filters from real provider data | PENDING | No live evidence captured in this audit | Operator must confirm in deployed UI |
| P0-6 Fake EPG/program schedules removed | PASS | commit `9197155 test+impl: Priority 3 EPG waterfall + safe fuzzy + epgGrid de-mock`; live `LiveTVShell.jsx` and `epgGrid.js` modified in working tree | none |
| P0-7 Synthetic series/episode metadata removed | PENDING | doc 49:138 flags `SeriesEpisodesBlock.jsx`, `SeriesNextUp.jsx`; no commit evidence in current branch range removing these | Audit and remove fabricated episode metadata |
| P0-8 Visible download/DVR/catch-up must be real or disabled | FAIL | `catchup.js:21` explicitly mentions `501 / ticket envelope`; doc 49 lists UI components still exposing these | Disable UI entry points for release build OR implement byte pipelines |

## J. Top 3 Release Blockers

1. **Tizen .wgt build + on-device proof missing.** No signed package, no `config.xml` (only `config.xml.example`), no AVPlay device evidence. Owner-action: operator runs Samsung Tizen Studio CLI `tizen build-web && tizen package -t wgt -s <profile>` on `apps/hermes-tv-tizen/`, side-loads on QN85, captures launch + catalog + playback screenshots to `docs/proof/tizen/<date>/`.
2. **DVR / Downloads / Catch-up UI lies to operator.** `services/hermes-tv-api/src/routes/catchup.js:21` admits the path returns 501; UI components in `apps/hermes-web-tv/src/components/DownloadModal.jsx`, `settings/RecordingsSection.jsx`, `CatchupRail.jsx` remain visible. Owner-action: gate these UI entry points behind a `release_build=true` feature flag that hides them, OR land real byte pipelines before flip.
3. **`setupProviderRestart.e2e.test.js` chain proof not authored.** Doc 49 P0-4 demands a single E2E covering form submit → process restart → catalog → play → stream bytes; no such file in `services/hermes-tv-api/test/`. Owner-action: author the test, add to `services/hermes-tv-api/package.json:10` test chain, commit.

## K. Constraints Honored

- All secrets referenced by NAME only (`VPS_HOST`, `VPS_USER`, `VPS_PASS`, `VPS_PORT`, `APOLLO_M3U_URL`, `XTREMEHD_M3U_URL`, `XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD`, `JELLYFIN_URL`, `JELLYFIN_API_KEY`, `IPTV_ORG_ENABLED`, `AZURE_TTS_KEY`, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`).
- No credential values quoted. No `G:\private\` contents echoed.
- Public host names (`hermestv.daveai.tech`, `tv.daveai.tech`) referenced only as already-public deployment targets.
