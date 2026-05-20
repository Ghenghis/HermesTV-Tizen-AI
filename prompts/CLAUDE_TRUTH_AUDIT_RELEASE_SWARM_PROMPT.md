# Claude Prompt: Truth Audit Release Swarm

You are Claude coordinating the HermesTV truth/release swarm.

Repo:

```text
G:\Github\HermesTV-Tizen-AI
```

Read first:

```text
docs/49_TRUTH_AUDIT_RELEASE_READINESS_CONTRACT.md
docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md
docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md
docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md
```

Hard rule:

```text
No mocked, fake, placeholder, decorative, stubbed, cosmetic-only, or skipped-success behavior may remain in release paths.
If a feature is not real, remove/disable it or return an honest unavailable state.
Every correction needs proof that fails when the behavior breaks.
Never include real provider credentials in files, logs, tests, screenshots, or prompts.
```

## Current Known Fix Already In Codex Worktree

Codex fixed the provider QR path locally:

- real `setup_url` returned from `POST /api/pair`
- real QR generated in `QROnboarding`
- setup form posts real provider fields
- provider-id-only pairing completion rejected
- `providerQrSetup.test.js` added

Do not regress these. Keep or improve the proof.

## Agent Lanes

### Agent 01: Truth Lead / Integrator

Owns `docs/49_TRUTH_AUDIT_RELEASE_READINESS_CONTRACT.md`, final merge order, and proof ledger. Reject any lane that marks fake/skipped behavior as pass.

### Agent 02: CI Provider Gates

Files:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vps.yml`
- `package.json`
- `services/hermes-tv-api/package.json`

Goal:
Make `npm test --prefix services/hermes-tv-api`, browser release proof, and provider-live proof mandatory for release/deploy promotion.

Proof:

```bash
npm test --prefix services/hermes-tv-api
```

### Agent 03: HTTPS Live Proof Tool

Files:

- `tools/test-provider-e2e.js`

Goal:
Use `https.request` for HTTPS bases; strengthen stream proof to require HEAD + GET, media content type or valid HLS body, non-zero bytes, and zero credential leakage.

Proof:

```bash
HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech PROVIDER_E2E_MODE=live node tools/test-provider-e2e.js
```

### Agent 04: Setup Restart Chain

Files:

- `services/hermes-tv-api/test/setupProviderRestart.e2e.test.js`
- existing fixture server/tools as needed

Goal:
Prove setup submit -> durable provider store -> simulated restart -> providers -> catalog -> play -> stream bytes.

Proof:

```bash
node services/hermes-tv-api/test/setupProviderRestart.e2e.test.js
```

### Agent 05: UI Provider Truth

Files:

- `apps/hermes-web-tv/src/components/ProviderFilter.jsx`
- `apps/hermes-web-tv/src/App.jsx`
- `apps/hermes-web-tv/src/components/CatalogGrid.jsx`
- provider settings UI as needed

Goal:
Remove fixed Apollo/Xtreme filter truth. Derive filters from `/api/providers` and catalog sources.

Proof:
Fixture with only one disk provider shows only that provider and filters correctly.

### Agent 06: EPG Truth

Files:

- `apps/hermes-web-tv/src/shells/LiveTVShell.jsx`
- `apps/hermes-web-tv/src/shells/IptvnatorShell.jsx`
- `apps/hermes-web-tv/src/shells/YnotvShell.jsx`
- `apps/hermes-web-tv/src/shells/ZeroShell.jsx`
- `apps/hermes-web-tv/src/components/zero/ZeroNowNext.jsx`
- `services/hermes-tv-api/src/routes/epg.js`

Goal:
Remove fabricated schedules. Use real XMLTV/provider EPG or honest no-guide states.

Proof:
No invented titles with EPG disabled; real XMLTV fixture titles with EPG enabled.

### Agent 07: Series Metadata Truth

Files:

- `apps/hermes-web-tv/src/components/SeriesEpisodesBlock.jsx`
- `apps/hermes-web-tv/src/components/SeriesNextUp.jsx`
- `services/hermes-tv-api/src/routes/series.js`

Goal:
Remove synthetic episode metadata. Render backend/provider metadata only.

Proof:
No generated episode descriptions, ratings, or fake next-up rows.

### Agent 08: Download/DVR/Catch-Up Release Truth

Files:

- `apps/hermes-web-tv/src/components/DownloadModal.jsx`
- `apps/hermes-web-tv/src/components/settings/RecordingsSection.jsx`
- `apps/hermes-web-tv/src/api/dvrClient.js`
- `apps/hermes-web-tv/src/components/CatchupRail.jsx`
- `services/hermes-tv-api/src/routes/downloads.js`
- `services/hermes-tv-api/src/routes/dvr.js`
- `services/hermes-tv-api/src/routes/catchup.js`

Goal:
Implement real byte/file/playback paths or disable release UI entry points.

Proof:
Download returns bytes; recording creates playable file; catch-up plays, or UI does not expose the feature.

### Agent 09: Source Health Truth

Files:

- `services/hermes-tv-api/src/routes/sourceHealth.js`
- `services/hermes-tv-api/src/lib/sourceHealthAggregator.js`

Goal:
Source health must use provider registry and actual catalog item source IDs. Remove `mock:true`.

Proof:
Disk provider fixture appears in aggregate and per-item health probes the actual stream.

### Agent 10: Provider Routes Registry Contract

Files:

- `services/hermes-tv-api/src/routes/providers.js`
- `services/hermes-tv-api/src/lib/providerRegistry.js`
- `services/hermes-tv-api/src/lib/providerStore.js`

Goal:
CRUD/test must return canonical registry masked shape. Extension fields must round-trip. Env disable must be real or readonly.

Proof:
Add/update/list/test with disk provider preserves registry contract and leaks no credentials.

### Agent 11: Parse-QR Credential Safety

Files:

- `services/hermes-tv-api/src/routes/providers.js`
- `apps/hermes-web-tv` QR import consumers
- tests

Goal:
Do not echo raw username/password from parse-QR responses. Save via safe server flow or return masked candidate only.

Proof:
`xtream://user:pass@host` response contains neither `user` nor `pass`, while save still works.

### Agent 12: Metadata Truth

Files:

- `services/hermes-tv-api/src/lib/m3uClient.js`
- `services/hermes-tv-api/src/lib/xtreamClient.js`
- catalog tests

Goal:
Remove fake 1x1 logos and guessed HD/1080p metadata. Use `null`/`unknown` unless provider/probe supplies truth.

Proof:
Fixture with no logo/resolution emits no placeholder logo or guessed resolution.

### Agent 13: Phone Remote Fail-Closed

Files:

- `apps/hermes-web-tv/src/remote/remoteClient.js`
- `apps/hermes-web-tv/src/remote/RemoteApp.jsx`

Goal:
Network failure must not validate arbitrary pairing codes.

Proof:
With API down, pair code is rejected and not stored.

### Agent 14: Multiview Truth

Files:

- `apps/hermes-web-tv/src/components/MultiviewPlayer.jsx`
- `apps/hermes-web-tv/src/components/MultiviewModal.jsx`

Goal:
“Add stream” must open a real stream picker and start playback, or become honest non-clickable empty state.

Proof:
Clicking empty slot either adds real stream or no interactive false affordance exists.

### Agent 15: Settings Toggle Truth

Files:

- `apps/hermes-web-tv/src/components/SettingsPanelTabbed.jsx`

Goal:
Cosmetic toggles must be wired to backend behavior or removed from release UI.

Proof:
Every visible toggle changes real behavior and survives through backend contract.

### Agent 16: Tizen AVPlay Truth

Files:

- `apps/hermes-web-tv/src/hooks/useAvplayStream.js`
- `apps/hermes-web-tv/src/components/PlayerModal.jsx`

Goal:
Wire AVPlay on Samsung/Tizen or remove AVPlay release claims.

Proof:
On-device or automated shim proof shows `open -> prepareAsync -> play` path drives playback.

### Agent 17: Browser E2E Release Suite

Files:

- `tests/playwright/specs/*.ts`

Goal:
Unskip/fix release-critical flows: search, EPG tabs, recording, chatbot actions, playback, Tizen back, provider QR setup.

Proof:

```bash
cd tests/playwright && npm test
```

### Agent 18: Proof Ledger

Files:

- `tools/proof-ledger-validate.js`
- `docs/proof/**`

Goal:
Proof artifacts must be labeled `EMPTY_STATE_PASS`, `FIXTURE_PASS`, `LIVE_PASS`, or `BLOCKED`; release cannot use empty/fixture proof as live proof.

Proof:

```bash
node tools/proof-ledger-validate.js
```

### Agent 19: Stalker Feature Boundary

Files:

- `services/hermes-tv-api/src/lib/providerStore.js`
- `services/hermes-tv-api/src/routes/playlists.js`
- `services/hermes-tv-api/src/routes/providers.js`

Goal:
Remove `stalker` as accepted provider type until implemented, or implement real Stalker portal auth/catalog/playback.

Proof:
Adding stalker fails honestly, or fixture proves real catalog/playback.

### Agent 20: Final Release Auditor

Goal:
After all lanes merge, independently rerun the whole release ladder and search for remaining `mock`, `fake`, `placeholder`, `stub`, `not_implemented`, `Phase`, `TODO`, `fixme`, skipped tests, and cosmetic-only UI. Open blockers instead of approving.

Required proof:

```bash
npm test --prefix services/hermes-tv-api
npm run build --prefix apps/hermes-web-tv
cd tests/playwright && npm test
HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech PROVIDER_E2E_MODE=live node tools/test-provider-e2e.js
node tools/proof-ledger-validate.js
```

## Output Required From Every Agent

Return:

- files changed
- exact fake/stub/mock removed
- exact behavior implemented or honestly disabled
- proof commands run
- proof result
- remaining blockers

No “PASS” without proof.
