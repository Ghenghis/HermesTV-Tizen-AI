# HermesTV Truth Audit And Release Readiness Contract

Date: 2026-05-20  
Status: **NOT RELEASE READY** until P0 lanes are fixed and proven.

This contract consolidates the Codex subagent audits for fake, mocked, placeholder, stubbed, incomplete, or weakly proven code. The release rule is simple:

> If the UI says a feature works, it must be backed by real provider/backend behavior and an E2E proof that fails when that behavior breaks.

## Already Corrected In Current Codex Worktree

- Provider QR onboarding no longer renders a decorative/static QR pattern.
- `POST /api/pair` now returns a concrete `setup_url` for `/setup/provider?code=HRM-XXXX`.
- `QROnboarding` generates a real QR code from the pairing URL using `qrcode`.
- `/setup/provider` form names now match `providerStore.add()` (`type`, `label`, `url`, `username`, `password`, `epg_url`).
- `/setup/provider/submit` accepts form posts, persists a durable provider, and completes the pairing.
- `/api/pair/:code/complete` rejects provider-id-only completion with `provider_config_required`.
- Proof added: `services/hermes-tv-api/test/providerQrSetup.test.js`.
- Proof run: `node services/hermes-tv-api/test/providerQrSetup.test.js` -> 16 PASS / 0 FAIL.
- Full API proof run: `npm test --prefix services/hermes-tv-api` -> PASS.
- TV build proof run: `npm run build --prefix apps/hermes-web-tv` -> PASS.

## P0 Release Blockers

### P0-1: CI Must Run Provider/API Regression Tests

Files:
- `.github/workflows/ci.yml`
- `services/hermes-tv-api/package.json`

Problem:
The strongest API/provider tests run locally but are not mandatory PR/push gates.

Correction:
Add CI job for:

```bash
npm test --prefix services/hermes-tv-api
```

Proof:
CI fails on provider registry, setup QR, catalog, playback proxy, or Xtream fixture regressions.

### P0-2: Provider-Live Proof Must Be Mandatory For Release

Files:
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vps.yml`
- `tools/test-provider-e2e.js`

Problem:
Live-provider proof is optional/manual and can be skipped while deploy still reports success.

Correction:
Make release/deploy promotion require live proof or mark release `BLOCKED`.

Proof:

```bash
HERMES_PROVIDER_E2E_BASE=https://hermestv.daveai.tech PROVIDER_E2E_MODE=live node tools/test-provider-e2e.js
```

### P0-3: Live E2E Tool Must Support HTTPS Correctly

File:
- `tools/test-provider-e2e.js`

Problem:
The tool uses `http.request` even for `https://` targets.

Correction:
Use `https.request` when URL protocol is `https:`.

Proof:
The live provider proof succeeds against the active HermesTV host (`https://hermestv.daveai.tech` until `tv.daveai.tech` is routed back to HermesTV) without plain-HTTP TLS failure.

### P0-4: One Chain Gate Must Prove Setup -> Restart -> Catalog -> Play

Files:
- `services/hermes-tv-api/test/providerQrSetup.test.js`
- New: `services/hermes-tv-api/test/setupProviderRestart.e2e.test.js`

Problem:
Existing tests prove pieces, but not the whole release chain after restart.

Correction:
Add one E2E that posts provider config through `/setup/provider/submit`, restarts or reloads the provider store with the same `HERMES_PROVIDER_DATA_DIR`, then proves `/api/providers`, `/api/catalog`, `/api/play`, and `/stream`.

Proof:

```bash
node services/hermes-tv-api/test/setupProviderRestart.e2e.test.js
```

### P0-5: UI Provider Filters Must Come From Real Provider Data

Files:
- `apps/hermes-web-tv/src/components/ProviderFilter.jsx`
- `apps/hermes-web-tv/src/App.jsx`
- `apps/hermes-web-tv/src/components/CatalogGrid.jsx`

Problem:
UI still hard-codes Apollo/XtremeHD provider filters and can hide real disk providers.

Correction:
Derive provider filter options from `/api/providers` and actual catalog `sources/providers`.

Proof:
With only a disk M3U or Xtream provider configured, UI shows that provider and filtering returns matching catalog items.

### P0-6: Fake EPG/Program Schedules Must Be Removed

Files:
- `apps/hermes-web-tv/src/shells/LiveTVShell.jsx`
- `apps/hermes-web-tv/src/shells/IptvnatorShell.jsx`
- `apps/hermes-web-tv/src/shells/YnotvShell.jsx`
- `apps/hermes-web-tv/src/shells/ZeroShell.jsx`
- `apps/hermes-web-tv/src/components/zero/ZeroNowNext.jsx`
- `services/hermes-tv-api/src/routes/epg.js`

Problem:
Shells fabricate guide/program text when provider EPG is missing.

Correction:
Render honest “No guide data from provider” states unless real XMLTV/provider EPG data exists. Backend must load EPG URLs from provider registry, not env-only.

Proof:
With EPG disabled, no invented program names appear. With XMLTV fixture configured, real program titles render.

### P0-7: Synthetic Series/Episode Metadata Must Be Removed

Files:
- `apps/hermes-web-tv/src/components/SeriesEpisodesBlock.jsx`
- `apps/hermes-web-tv/src/components/SeriesNextUp.jsx`

Problem:
Client fabricates episode titles, descriptions, ratings, counts, and next-up rows.

Correction:
Render only provider/backend episode metadata or hide the episode list behind an honest unavailable state.

Proof:
Fixture/live series shows provider episode titles; no generated descriptions or ratings appear.

### P0-8: Visible Download/DVR/Catch-Up Must Be Real Or Disabled

Files:
- `apps/hermes-web-tv/src/components/DownloadModal.jsx`
- `apps/hermes-web-tv/src/components/settings/RecordingsSection.jsx`
- `apps/hermes-web-tv/src/api/dvrClient.js`
- `apps/hermes-web-tv/src/components/CatchupRail.jsx`
- `services/hermes-tv-api/src/routes/downloads.js`
- `services/hermes-tv-api/src/routes/dvr.js`
- `services/hermes-tv-api/src/routes/catchup.js`

Problem:
UI exposes features whose backend paths are pending, in-memory, estimated, or 503.

Correction:
Either implement byte-producing/download/DVR/catch-up playback pipelines or remove/disable these UI entry points for release builds.

Proof:
Download returns real bytes; recording completes to a playable file; catch-up play opens actual playback.

## P1 Blockers

- `services/hermes-tv-api/src/routes/sourceHealth.js`: source health must use `providerRegistry.listFull()` and actual catalog/source IDs; remove `mock:true`.
- `services/hermes-tv-api/src/routes/playlists.js`: URL/Xtream save must fail if durable provider persistence fails; file imports must be clearly preview-only or durable.
- `services/hermes-tv-api/src/routes/providers.js`: CRUD/test should route through provider registry contract and preserve canonical masked shape.
- `services/hermes-tv-api/src/routes/providers.js`: `/api/providers/parse-qr` must not echo raw username/password.
- `services/hermes-tv-api/src/lib/m3uClient.js` and `src/lib/xtreamClient.js`: remove fake logos and guessed resolution metadata.
- `apps/hermes-web-tv/src/remote/remoteClient.js`: fail closed when pair code cannot be verified.
- `apps/hermes-web-tv/src/components/MultiviewPlayer.jsx`: “Add stream” must work or be non-clickable.
- `apps/hermes-web-tv/src/components/SettingsPanelTabbed.jsx`: cosmetic/localStorage feature toggles must be bound to real behavior or removed.
- `apps/hermes-web-tv/src/hooks/useAvplayStream.js`: AVPlay must be wired on Tizen or release claims removed.
- `tests/playwright/specs/*.ts`: release-critical `fixme`/skipped search, EPG, recording, chatbot, and Tizen back specs must be unskipped with deterministic provider fixtures.

## P2 Cleanup

- `providerRegistry.setEnabled()` env provider override currently does not affect env rows.
- `providerStore.listFull()` omits schema extensions such as `additional_epg_urls`, `user_agent`, `epg_timeshift_hours`, and `disable_provider_epg`.
- `stalker` is accepted as a provider type but not implemented end-to-end.
- Artwork placeholders should be explicitly presented as “No artwork” unless real provider/TMDb/channel artwork is available.
- Proof docs should distinguish `EMPTY_STATE_PASS`, `FIXTURE_PASS`, `LIVE_PASS`, and `BLOCKED`.

## Required Release Proof Ladder

1. Unit/fixture proof:

```bash
npm test --prefix services/hermes-tv-api
```

2. TV build proof:

```bash
npm run build --prefix apps/hermes-web-tv
```

3. Browser release proof:

```bash
cd tests/playwright && npm test
```

4. Provider-live proof:

```bash
HERMES_PROVIDER_E2E_BASE=https://hermestv.daveai.tech PROVIDER_E2E_MODE=live node tools/test-provider-e2e.js
```

5. Proof ledger:

```bash
node tools/proof-ledger-validate.js
```

Release is green only when all required proof commands pass without skips masquerading as pass.
