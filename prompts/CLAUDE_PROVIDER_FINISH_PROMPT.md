# CLAUDE_PROVIDER_FINISH_PROMPT - HermesTV Provider Completion

Use this prompt when starting Claude, Codex, or any agent swarm on the provider
completion work.

## Mission

Finish real provider support for HermesTV. Do not polish around the issue. Do
not mark provider work complete from mocked catalogs, skipped tests, local-only
state, static provider lists, or 501 endpoints.

First read:

1. `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
2. `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`
3. `docs/12_EPG_CONTENT_DISCOVERY_CONTRACT.md`
4. `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md`
5. `prompts/CLAUDE_MASTER_PROMPT.md`

The truth contract supersedes older phase docs, stale runbooks, and any prior
agent report that says provider integration is done without live proof.

## Current Known Truth

As of 2026-05-20:

- `/api/catalog` can honestly return `total: 0` and `_meta.source:
  "no-providers"`.
- Existing smoke tests can still pass in that empty state.
- `/api/providers` is not a trustworthy registry yet.
- `/setup/provider/submit` is not implemented.
- Pairing is in memory and does not store credentials.
- Playlist import can fetch/preview but does not become durable catalog/playback
  config.
- Xtream direct streams and HLS playlists need different proxy behavior.
- Tizen packaged API-base/CSP/CORS proof is missing.

Treat this as the starting point, not a failure to hide.

## Hard Rules

1. No credentials in code, docs, logs, screenshots, browser storage, or git.
2. Do not read `G:\private` or any operator vault path.
3. No direct provider calls from the TV app. The backend owns all provider
   access.
4. Do not use mock catalog data to satisfy provider proof.
5. Do not let provider-live tests pass by skipping because no provider exists.
6. Do not claim "done" unless the provider truth contract proof passes.
7. Keep lanes separate. Do not rewrite another agent's files without first
   integrating their result intentionally.

## Integration Order

Work in this order:

1. Provider registry/config source of truth.
2. Catalog/source identity normalization.
3. Playback proxy for HLS and direct byte streams.
4. Frontend provider filters, QR setup, search/detail hydration, and Tizen API
   base.
5. EPG/source-health alignment.
6. CI/proof gates.
7. DVR/download/catch-up only after real play is green.

Cosmetic UI work waits until P0 provider proof is green.

## Agent Lane Assignments

### Agent A - Provider Registry And Config

Ownership:

- `services/hermes-tv-api/src/lib/providerRegistry*`
- `services/hermes-tv-api/src/routes/providers.js`
- `services/hermes-tv-api/src/routes/setup.js`
- `services/hermes-tv-api/src/routes/pairing.js`
- `services/hermes-tv-api/src/routes/playlists.js`
- `services/hermes-tv-api/.env.example`
- `upstream/docker-vps/.env.example`
- provider setup docs

Task:

- Implement durable provider config and real `/api/providers`.
- Store secrets server-side only.
- Make setup/import output feed the same registry used by catalog and play.

Proof:

- Provider survives process restart.
- `/api/providers` is based on configured providers and exposes no secrets.

### Agent B - Catalog And Search Hydration

Ownership:

- `services/hermes-tv-api/src/routes/catalog.js`
- `services/hermes-tv-api/src/routes/search.js`
- `services/hermes-tv-api/src/lib/m3uClient.js`
- `services/hermes-tv-api/src/lib/xtreamClient.js`
- `services/hermes-tv-api/src/lib/jellyfinClient.js`
- `services/hermes-tv-api/src/lib/catalogMerge.js`
- catalog/search schemas and tests

Task:

- Normalize all provider IDs and source IDs.
- Ensure every playable item has provider/source metadata.
- Make search result activation produce a playable detail item.

Proof:

- Search result -> detail -> play works with a real catalog item.
- Provider filters do not lose `xtream`, `apollo_group`, `xtremehd`,
  `iptv-org`, or `jellyfin` items because of ID drift.

### Agent C - Playback Proxy

Ownership:

- `services/hermes-tv-api/src/routes/play.js`
- `services/hermes-tv-api/src/lib/streamResolver.js`
- `services/hermes-tv-api/src/lib/hlsProxy.js`
- new proxy modules/tests as needed
- playback proof tool support

Task:

- Support HLS playlist proxying and direct byte-stream proxying.
- Preserve range requests and content headers.
- Never expose upstream paid-provider URLs to the TV app.

Proof:

- `POST /api/play` and `HEAD/GET /stream` work for at least one real HLS-like
  source and one real direct Xtream-style stream when configured.

### Agent D - Frontend And Tizen Provider Path

Ownership:

- `apps/hermes-web-tv/src/api/*`
- `apps/hermes-web-tv/src/components/QROnboarding.jsx`
- `apps/hermes-web-tv/src/components/ProviderFilter.jsx`
- `apps/hermes-web-tv/src/components/SearchModal.jsx`
- `apps/hermes-web-tv/src/components/MediaDetailPanel.jsx`
- `apps/hermes-web-tv/src/components/PlayerModal.jsx`
- `apps/hermes-web-tv/src/hooks/useHlsStream.js`
- `apps/hermes-web-tv/src/hooks/useAvplayStream.js`
- `apps/hermes-web-tv/index.html`
- `apps/hermes-tv-tizen/**`
- `tools/tizen-prep.js`

Task:

- Generate real QR setup URLs or remove scannable-looking fake QR.
- Derive provider UI from backend provider state.
- Fix search/detail/play hydration.
- Fix packaged API base, CSP, CORS, and TV player routing.

Proof:

- Packaged/web app calls the intended backend.
- Real provider item can be opened and playback started from the UI.

### Agent E - EPG And Source Health

Ownership:

- `services/hermes-tv-api/src/routes/epg.js`
- `services/hermes-tv-api/src/routes/epgGrid.js`
- `services/hermes-tv-api/src/routes/sourceHealth.js`
- `services/hermes-tv-api/src/lib/sourceHealthAggregator.js`
- `apps/hermes-web-tv/src/api/epgClient.js`
- `apps/hermes-web-tv/src/components/EPGModal.jsx`

Task:

- Map EPG channels to real catalog/source IDs.
- Make source-health report on real configured provider sources.
- Replace or clearly mark stubbed EPG mutation endpoints.

Proof:

- EPG meta is visible in diagnostics.
- A guide program for a real channel can resolve to the same catalog item used
  by play.

### Agent F - Proof And CI Gates

Ownership:

- `tools/test-e2e-smoke.js`
- `tools/test-provider-e2e.js`
- `services/hermes-tv-api/test/providerTruth.test.js`
- `services/hermes-tv-api/test/playbackProxy.test.js`
- `tools/schema-validate.js`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-vps.yml`
- `docs/proof/provider-truth/**`

Task:

- Separate empty-state tests from live-provider tests.
- Make provider-live proof fail on skip/no-provider.
- Produce sanitized proof artifacts.

Proof:

- `npm run build:web`
- `npm run test --prefix services/hermes-tv-api`
- `npm run test:e2e`
- `node services/hermes-tv-api/test/providerTruth.test.js`
- `node services/hermes-tv-api/test/playbackProxy.test.js`
- `node tools/test-provider-e2e.js`

## Required Report Format

Each agent must end with:

```text
Lane:
Changed files:
Tests/proof run:
Provider proof status: PASS | FAIL | BLOCKED
Secrets exposed: NO
Remaining blockers:
Next required lane:
```

If proof is blocked because credentials are not configured, say exactly that
without requesting the secret value in chat. The operator can configure secrets
outside the repo.

## Definition Of A Valid Final Claim

Valid:

```text
Provider registry implementation is complete, but provider proof is BLOCKED
because no live provider is configured in the current environment.
```

Invalid:

```text
Providers are working. E2E passed.
```

That claim is invalid unless the proof includes non-zero catalog data,
successful play-ticket creation, successful stream response, and sanitized proof
artifacts from `docs/proof/provider-truth/<timestamp>/`.
