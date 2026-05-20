# 46 - Provider Truth and Proof Contract

Generated: 2026-05-20

Status: BINDING for all Claude/Codex/agent work on provider completion.

This contract exists because the repository currently contains many real-looking
provider surfaces, but the provider system is not finished end to end. Agents
must stop treating phase labels, UI screens, runbooks, mocked catalogs, skipped
tests, or 501 placeholders as proof.

Provider work is not done until a configured provider can be added, listed,
cataloged, played, and verified with sanitized evidence.

## Executive Truth

Current state:

- The UI shell is far ahead of the provider backend.
- Some ingest paths are real, especially env-backed M3U, iptv-org, Jellyfin,
  and generic Xtream Codes.
- Provider onboarding, provider registry truth, provider identity normalization,
  direct stream proxying, QR setup, EPG mapping, DVR/download/catch-up, Tizen API
  base wiring, and CI proof are incomplete.
- The current e2e smoke path can pass while `/api/catalog` returns
  `total: 0` and `_meta.source: "no-providers"`.

Therefore, provider completion is BLOCKED until the proof gates in this file
pass without skipping the live-provider path.

## Non-Negotiable Truth Rules

1. No test may report provider playback as passing because no provider items
   were configured. A no-provider scenario is allowed only in a test named as an
   honest empty-state test.
2. A working provider means all of these are true for at least one configured
   source:
   - The provider can be configured by a documented server-side config path.
   - `GET /api/providers` returns real provider state, not a hard-coded list.
   - `GET /api/catalog` returns non-zero items and does not report
     `_meta.source: "no-providers"`.
   - Catalog items contain normalized provider/source identity used by UI,
     source-health, EPG, and playback.
   - `POST /api/play` returns a ticket for a real item.
   - `GET/HEAD /api/play/:ticket/stream` returns `200`, `206`, or a safe `302`
     with a playable media content type.
   - No credential, token, username, password, raw paid-provider URL, or API key
     appears in API responses, logs, screenshots, proof artifacts, browser
     storage, or git-tracked files.
3. A QR code is not allowed to be decorative if it looks scannable. It must
   encode a real setup URL, or the UI must clearly render a non-scannable
   setup state.
4. Agents may not claim a feature is finished when the current implementation
   returns `501`, uses in-memory-only state for provider config, or depends on a
   local mock/dev flag.
5. CI and deployment smoke tests must fail provider-completion jobs when the
   only evidence is a skipped provider path.

## P0 Underlying Issues

### 1. Provider Registry Is Not Real State

Files:

- `services/hermes-tv-api/src/routes/providers.js`
- `services/hermes-tv-api/src/routes/sourceHealth.js`
- `services/hermes-tv-api/src/lib/sourceHealthAggregator.js`
- `apps/hermes-web-tv/src/components/ProviderFilter.jsx`
- `apps/hermes-web-tv/src/App.jsx`

Observed issue:

- `/api/providers` is a static array.
- Provider IDs disagree across the codebase (`apollo`, `apollo_group`,
  `xtremehd`, `xtream`, `iptv-org`, `jellyfin`).
- Source-health supports only a subset of provider IDs and often probes config
  placeholders instead of item streams.
- Frontend filters are hard-coded to Apollo/XtremeHD and ignore canonical
  `sources` for several flows.

Correction required:

- Create one provider registry/service as the source of truth.
- Normalize every provider ID and label through that service.
- Make `/api/providers`, `/api/catalog`, source-health, EPG, search, play, and
  frontend filters consume the same provider identity model.

Finished when:

- Static provider lists are gone or limited to display metadata.
- Every configured provider appears with truthful status, item counts, and
  last-checked data.
- Unknown or disabled providers are represented honestly.

### 2. Provider Setup Does Not Store Usable Config

Files:

- `services/hermes-tv-api/src/routes/setup.js`
- `services/hermes-tv-api/src/routes/pairing.js`
- `services/hermes-tv-api/src/routes/playlists.js`
- `services/hermes-tv-api/src/lib/m3uClient.js`
- `services/hermes-tv-api/src/lib/xtreamClient.js`
- `services/hermes-tv-api/.env.example`
- `upstream/docker-vps/.env.example`

Observed issue:

- `/setup/provider/submit` returns `501`.
- Pairing completion is in memory and stores no credentials.
- Playlist import preview/save can fetch real data, but saved playlists are
  in-memory and do not feed catalog/playback after restart.
- Xtream env vars exist in code but are incomplete or inconsistent in examples.
- Local `.env` docs imply config loading that the API process may not perform.

Correction required:

- Implement a server-side provider config source of truth.
- Accept only server-side secrets, never client-side storage.
- Persist non-secret provider metadata separately from secret values.
- Wire saved M3U/Xtream configs into catalog, play resolution, source-health,
  and `/api/providers` without requiring restart unless the chosen design says
  restart is mandatory and documented.

Finished when:

- Operator env config and setup/import config both produce the same registry
  shape.
- A saved provider survives process restart.
- No secret value is returned by any endpoint.

### 3. Catalog Ingest Is Partial and Identity Is Fragmented

Files:

- `services/hermes-tv-api/src/routes/catalog.js`
- `services/hermes-tv-api/src/lib/m3uClient.js`
- `services/hermes-tv-api/src/lib/xtreamClient.js`
- `services/hermes-tv-api/src/lib/catalogMerge.js`
- `services/hermes-tv-api/src/lib/jellyfinClient.js`
- `apps/hermes-web-tv/src/components/SearchModal.jsx`
- `apps/hermes-web-tv/src/components/MediaDetailPanel.jsx`

Observed issue:

- Env-backed M3U and public iptv-org paths can populate catalog, but only when
  env is present.
- Generic Xtream emits provider identity not accepted everywhere.
- Jellyfin mapping can be blocked or incomplete in the shared provider/source
  shape.
- Search results can open details without full provider/source hydration, which
  disables Watch/Download.

Correction required:

- Enforce one catalog item contract with `providers`, `sources`, and
  `preferred_source` where applicable.
- Make search either return full playable catalog items or hydrate result
  selections by ID before detail/play.
- Ensure each ingest client maps to the same provider/source contract.

Finished when:

- Search result -> detail -> watch works for a real provider item.
- Catalog filters do not drop valid providers because of ID mismatch.
- Every playable item has enough source metadata for play and health checks.

### 4. Playback Proxy Assumes HLS Even When Streams Are Not HLS

Files:

- `services/hermes-tv-api/src/routes/play.js`
- `services/hermes-tv-api/src/lib/streamResolver.js`
- `services/hermes-tv-api/src/lib/hlsProxy.js`
- `services/hermes-tv-api/src/lib/xtreamClient.js`
- `apps/hermes-web-tv/src/components/PlayerModal.jsx`
- `apps/hermes-web-tv/src/hooks/useHlsStream.js`
- `apps/hermes-web-tv/src/hooks/useAvplayStream.js`

Observed issue:

- Credential-bearing streams are routed through an HLS playlist proxy.
- Xtream live URLs are often `.ts` byte streams, not playlists.
- The stream endpoint hides `.m3u8`, while frontend HLS detection can depend on
  `.m3u8` in the URL.
- Tizen AVPlay support exists as a hook/reference, but the main React player is
  not truly using it as the TV playback path.

Correction required:

- Add a generic credential-safe stream proxy that supports HLS playlists,
  direct byte streams, range requests, and correct content headers.
- Preserve source secrecy while letting browser and Tizen players identify the
  media type from headers or ticket metadata.
- Make web playback and Tizen playback share the same play-ticket contract.

Finished when:

- At least one real M3U/HLS source and one direct Xtream byte-stream source can
  pass `POST /api/play` plus `HEAD/GET /stream`.
- The TV app can play through the ticket endpoint without seeing the upstream
  URL.

### 5. Tizen Package May Not Reach The Real API

Files:

- `apps/hermes-web-tv/src/api/hermesApi.js`
- `apps/hermes-web-tv/index.html`
- `apps/hermes-tv-tizen/src/api/apiBase.js`
- `tools/tizen-prep.js`
- `services/hermes-tv-api/src/index.js`

Observed issue:

- The packaged Tizen app is built from the web app, but the web API base
  resolver falls back to same-origin outside localhost/LAN/hermestv.local.
- The Tizen-specific API-base helper is not the one imported by the web bundle.
- Web CSP and server CORS can block VPS API calls even after API-base is fixed.

Correction required:

- Centralize API-base resolution for web and packaged Tizen builds.
- Add explicit production API hosts to CSP and CORS through config.
- Prove packaged build calls the intended backend.

Finished when:

- A built Tizen package or packaged web artifact calls the real API base.
- CSP/CORS proof shows catalog and play endpoints reachable.

### 6. CI And Smoke Tests Allow False Green

Files:

- `tools/test-e2e-smoke.js`
- `tools/schema-validate.js`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vps.yml`

Observed issue:

- E2E can pass with no provider items.
- Playback `503` and TTS stub responses are accepted in broad smoke contexts.
- Schema validation contains stale mock assumptions and provider ID drift.
- Deploy smoke probes can continue despite missing real playback proof.

Correction required:

- Split empty-state tests from provider-truth tests.
- Add provider-proof tests that fail if no configured provider can produce a
  playable item.
- Update schema and smoke gates to match the real provider/source contract.

Finished when:

- CI has one honest no-provider job and one real-provider proof job.
- Release/deploy readiness cannot be marked green from skipped provider tests.

## P1 Issues To Finish After P0

### EPG Is Only Partly Connected

Files:

- `services/hermes-tv-api/src/routes/epg.js`
- `services/hermes-tv-api/src/routes/epgGrid.js`
- `apps/hermes-web-tv/src/api/epgClient.js`
- `apps/hermes-web-tv/src/components/EPGModal.jsx`

Required correction:

- Replace hard-coded grid/mock flows with XMLTV/provider-backed data where
  configured.
- Map EPG channel IDs to catalog/provider source IDs.
- Preserve `_meta.source` in UI diagnostics.
- Implement refresh/clear/import paths or remove the UI affordance claiming
  they work.

### Downloads, DVR, And Catch-Up Are Not End-To-End

Files:

- `services/hermes-tv-api/src/routes/downloads.js`
- `services/hermes-tv-api/src/routes/dvr.js`
- `services/hermes-tv-api/src/routes/catchup.js`
- `apps/hermes-web-tv/src/api/dvrClient.js`
- `apps/hermes-web-tv/src/components/ScheduleRecordingModal.jsx`

Required correction:

- Do not represent recording/download/catch-up as complete until an on-disk
  pipeline and playback path exist.
- Where providers do not support catch-up, return honest unsupported status.

### Local-Only UI State Must Be Classified

Files:

- `apps/hermes-web-tv/src/store/providerVisibilityStore.js`
- `apps/hermes-web-tv/src/store/watchHistoryStore.js`
- `apps/hermes-web-tv/src/store/recentSearchesStore.js`
- `apps/hermes-web-tv/src/store/profileStore.js`
- `apps/hermes-web-tv/src/store/commandStore.js`

Required correction:

- Decide which state is allowed to be local-only and which must be backend
  durable.
- Provider visibility and provider enablement must not be confused.

### Native Tizen Scaffold Is Not The Product Path Unless Repaired

Files:

- `apps/hermes-tv-tizen-native/index.html`
- `apps/hermes-tv-tizen-native/webpack.config.js`
- `apps/hermes-tv-tizen-native/src/main.js`
- `apps/hermes-tv-tizen-native/src/ui/hermesRouter.js`

Required correction:

- Either deprecate the native scaffold in docs or repair its bundle, router,
  API, and AVPlay integration.
- The canonical packaged app must be unambiguous.

## Finish Lanes For Agents

Agents must work in lanes with non-overlapping write ownership.

### Lane A - Provider Registry And Config

Owns:

- `services/hermes-tv-api/src/lib/providerRegistry*`
- `services/hermes-tv-api/src/routes/providers.js`
- `services/hermes-tv-api/src/routes/setup.js`
- `services/hermes-tv-api/src/routes/pairing.js`
- `services/hermes-tv-api/src/routes/playlists.js`
- env examples and provider setup docs

Deliver:

- Durable provider config.
- Real `/api/providers`.
- No secrets returned.
- Restart survival proof.

### Lane B - Catalog And Identity Normalization

Owns:

- `services/hermes-tv-api/src/routes/catalog.js`
- `services/hermes-tv-api/src/lib/m3uClient.js`
- `services/hermes-tv-api/src/lib/xtreamClient.js`
- `services/hermes-tv-api/src/lib/jellyfinClient.js`
- `services/hermes-tv-api/src/lib/catalogMerge.js`
- catalog/search schemas and tests

Deliver:

- One provider/source identity contract.
- Catalog and search return playable hydrated items.

### Lane C - Playback Proxy

Owns:

- `services/hermes-tv-api/src/routes/play.js`
- `services/hermes-tv-api/src/lib/streamResolver.js`
- `services/hermes-tv-api/src/lib/hlsProxy.js`
- new generic stream proxy module if needed
- playback tests

Deliver:

- HLS playlist proxy and direct byte-stream proxy.
- Range request support where required.
- Sanitized ticket contract.

### Lane D - EPG And Source Health

Owns:

- `services/hermes-tv-api/src/routes/epg.js`
- `services/hermes-tv-api/src/routes/epgGrid.js`
- `services/hermes-tv-api/src/routes/sourceHealth.js`
- `services/hermes-tv-api/src/lib/sourceHealthAggregator.js`
- EPG/source-health tests

Deliver:

- EPG channel IDs mapped to catalog/source IDs.
- Source-health derives from real configured sources.
- Stub endpoints either implemented or clearly marked unsupported.

### Lane E - Frontend/Tizen Provider UX

Owns:

- `apps/hermes-web-tv/src/api/*`
- `apps/hermes-web-tv/src/components/QROnboarding.jsx`
- `apps/hermes-web-tv/src/components/ProviderFilter.jsx`
- `apps/hermes-web-tv/src/components/PlayerModal.jsx`
- `apps/hermes-web-tv/src/hooks/useAvplayStream.js`
- `apps/hermes-web-tv/index.html`
- `apps/hermes-tv-tizen/**`
- `tools/tizen-prep.js`

Deliver:

- Real QR URL generation.
- Provider filters from API state.
- Search/details/play hydration fixed.
- Production API base, CSP, CORS, and Tizen player proof.

### Lane F - Proof, CI, And Release Gates

Owns:

- `tools/test-e2e-smoke.js`
- new provider proof tools under `tools/`
- service tests under `services/hermes-tv-api/test/`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vps.yml`
- `docs/proof/provider-truth/**`

Deliver:

- No-provider and provider-live tests separated.
- CI cannot call provider playback complete from skipped tests.
- Sanitized proof bundle template and validation.

## Required Proof Artifacts

All provider proof artifacts go under:

```text
docs/proof/provider-truth/<YYYYMMDD-HHMMSS>/
```

Required files:

- `environment.redacted.json` - host, commit, branch, enabled provider IDs, no
  values.
- `providers.redacted.json` - sanitized `/api/providers`.
- `catalog.meta.json` - `_meta`, total counts, provider counts, no raw source
  URLs.
- `play-ticket.redacted.json` - response shape without ticket secret if ticket
  value is sensitive.
- `stream-head.txt` - sanitized status line and content headers.
- `source-health.redacted.json` - no credentials or raw paid-provider URLs.
- `commands.txt` - exact commands run, with secrets redacted.
- `summary.md` - pass/fail table and remaining blockers.

Optional files:

- `epg.meta.json` if XMLTV is configured.
- `tizen-api-base.txt` proving packaged API target.
- screenshots only when they reveal no credential, token, or provider URL.

## Required Commands

Baseline commands:

```powershell
npm run build:web
npm run test --prefix services/hermes-tv-api
npm run test:e2e
```

Provider proof commands to add or keep green:

```powershell
node services/hermes-tv-api/test/providerTruth.test.js
node services/hermes-tv-api/test/playbackProxy.test.js
node tools/test-provider-e2e.js
```

The provider proof command must fail when no live provider is configured unless
it is explicitly run in `NO_PROVIDER_EMPTY_STATE=1` mode.

Manual live-provider proof shape:

```bash
curl -sf "$BASE/api/providers" | jq '{providers: [.providers[] | {provider_id,status,items_live,last_checked_at}]}'
curl -sf "$BASE/api/catalog" | jq '{total, meta: ._meta}'
curl -sf -X POST "$BASE/api/play" \
  -H 'Content-Type: application/json' \
  -d '{"item_id":"<real_catalog_id>","profile_id":"dave_tv"}' | jq '{ticket, stream_endpoint, provider_id, source_id}'
curl -sI "$BASE/api/play/<ticket>/stream" | sed -E 's/(token|password|username|api_key|ticket)=[^& ]+/\1=<redacted>/g'
```

Do not commit command output containing real ticket values if tickets are
long-lived or reusable.

## Definition Of Finished

Provider work is finished only when:

1. At least one real configured provider is green end to end.
2. Apollo Group M3U env path works when `APOLLO_M3U_URL` is configured.
3. xTremeHD M3U env path works when `XTREMEHD_M3U_URL` is configured.
4. Generic Xtream Codes works when `XTREAM_URL`, `XTREAM_USERNAME`, and
   `XTREAM_PASSWORD` are configured.
5. iptv-org remains an optional public provider, not a substitute for paid
   provider proof.
6. Jellyfin is either working through the same source contract or marked
   unsupported with a specific blocker.
7. `/api/providers`, `/api/catalog`, `/api/play`, `/api/source-health`, search,
   and frontend filters agree on provider/source IDs.
8. Tizen/web playback uses a backend ticket endpoint and never sees paid
   provider credentials.
9. CI and deploy gates cannot pass provider completion by skipping live-provider
   playback.

## Stop Conditions

Agents must stop and report a blocker when any of these occurs:

- A task requires reading or exposing files under `G:\private`.
- A proof command would print a real provider URL, username, password, token, or
  reusable ticket.
- A feature can only be made to pass by using mock catalog data.
- `/api/catalog` is empty and the task is not the honest no-provider empty-state
  test.
- The fix would require destructive service or filesystem operations not
  explicitly approved by the operator.

## Agent Report Template

Every agent working this contract must report:

```text
Lane:
Changed files:
Tests/proof run:
Provider proof status: PASS | FAIL | BLOCKED
Secrets exposed: NO
Remaining blockers:
Next required lane:
```

No report may use "done", "complete", "ready", or "working" unless the proof
status is `PASS` or the sentence explicitly describes a narrower completed code
change.
