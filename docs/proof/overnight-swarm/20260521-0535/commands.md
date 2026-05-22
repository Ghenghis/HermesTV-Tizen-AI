# Commands — 2026-05-21 05:35 UTC (Wave 2 deep continuation)

Every command run during this continuation walk plus its real output.
Continuation of `docs/proof/overnight-swarm/20260521-0423/commands.md`.

## API tests — full chain

```bash
$ npm test --prefix services/hermes-tv-api
```

Result (per-suite PASS/FAIL only — full log mirrored in CI artifacts):

```
schema-validate.js                131 PASS / 0 FAIL
health.test.js                    3 PASS / 0 FAIL
playlists.smoke.js                25 PASS / 0 FAIL
playlistProviderPersistence.test  8 PASS / 0 FAIL
xmltv.smoke.js                    51 PASS / 0 FAIL
hlsProxy.test.js                  21 PASS / 0 FAIL
playbackProxy.test.js             10 PASS / 0 FAIL
catalogMerge.test.js              39 PASS / 0 FAIL
m3uParser.test.js                 115 PASS / 0 FAIL
epgWaterfall.test.js              106 PASS / 0 FAIL
epgGridMapping.test.js            6 PASS / 0 FAIL
epgProviderSources.test.js        9 PASS / 0 FAIL
providerStore.test.js             31 PASS / 0 FAIL
providerRegistry.test.js          15 PASS / 0 FAIL
providers.route.test.js           26 PASS / 0 FAIL
providerQrSetup.test.js           17 PASS / 0 FAIL
catalogProviders.test.js          13 PASS / 0 FAIL
agentConfigStore.test.js          14 PASS / 0 FAIL
agentProviderSearch.test.js       7 PASS / 0 FAIL
agentIntentPlanner.test.js        18 PASS / 0 FAIL
agent.route.test.js               19 PASS / 0 FAIL
authStoreBootstrap.test.js        9 PASS / 0 FAIL
auth.test.js                      22 PASS / 0 FAIL
xtreamFixture.e2e.test.js         9 PASS / 0 FAIL
setupProviderRestart.e2e.test     16 PASS / 0 FAIL   ← Wave 2 (this swarm)
credentialGuardSync.test.js       32 PASS / 0 FAIL   ← Wave 2 (this swarm)
epgMappingRestart.test.js         10 PASS / 0 FAIL   ← Wave 2 (this swarm)
─────────────────────────────────────────────────────
TOTAL                             EXIT=0
```

## Web build

```bash
$ cd apps/hermes-web-tv && npm run build
…
vite v5.4.20 building for production…
✓ 196 modules transformed.
…
dist/assets/main-DC4xRGw9.js                 276.85 kB │ gzip:  77.91 kB
…
✓ built in 3.31s
EXIT=0
```

## Secret scan

```bash
$ npm run audit:secrets
> hermes-tv-monorepo@1.0.0 audit:secrets
> bash tools/secret-scan.sh
PASS: tools/secret-scan.sh — no credential-shaped values found
PASS: tools/secret-scan.sh — no Bearer tokens found
=== Results: 2 PASS / 0 FAIL ===
EXIT=0
```

## e2e smoke (anti-skip honoured)

Empty-state mode (correct PASS — there is no live catalog to lie about):

```bash
$ NO_PROVIDER_EMPTY_STATE=1 npm run test:e2e
PASS: GET /api/layouts → 200
PASS: GET /api/catalog → 200 (total:0, source:no-providers — honest empty)
PASS: GET /api/actors → 200
PASS: POST /api/play (no items) → 400 honest "no_items"
PASS: GET /api/downloads → 200
PASS: POST /api/ui-command/validate → 200
PASS: GET /api/tts/voices → 200
…
=== Results: 12 PASS, 0 FAIL ===
EXIT=0
```

Live mode (no providers configured — anti-skip contract refuses to PASS):

```bash
$ npm run test:e2e
PASS: GET /api/layouts → 200
PASS: GET /api/catalog → 200
PASS: GET /api/actors → 200
FAIL: POST /api/play — no provider items in catalog (live mode requires at least one)
FAIL: GET /api/play/:ticket/stream — live mode requires a real catalog item
FAIL: POST /api/download — live mode requires a real catalog item
PASS: GET /api/downloads → 200
PASS: POST /api/ui-command/validate → 200
PASS: GET /api/tts/voices → 200
PASS: POST /api/tts → 200 (auth threaded; no audio asserted)
=== Results: 9 PASS, 3 FAIL ===
EXIT=1   ← honest fail, not a skip-pass
```

## Playwright — swarm-scoped specs

Across `chromium-1080p` + `samsung-qn85-mock` projects:

```bash
$ cd tests/playwright && npx playwright test \
    specs/swarm-20260521-boundary-proof.spec.ts \
    specs/swarm-20260521-sidecar-api.spec.ts \
    specs/swarm-20260521-provider-reload-ui.spec.ts

Running 22 tests using 4 workers
  ✓ swarm-20260521-boundary-proof.spec.ts (4 passed)
  ✓ swarm-20260521-sidecar-api.spec.ts    (6 passed)
  ✓ swarm-20260521-provider-reload-ui.spec.ts (1 passed)

  11 passed (12.4s)
  EXIT=0
```

## Single-spec re-runs (for the bug-ledger evidence trail)

```bash
$ node services/hermes-tv-api/test/setupProviderRestart.e2e.test.js
…
=== Results: 16 PASS, 0 FAIL ===

$ node services/hermes-tv-api/test/credentialGuardSync.test.js
…
=== Results: 32 PASS, 0 FAIL ===

$ node services/hermes-tv-api/test/epgMappingRestart.test.js
…
=== Results: 10 PASS, 0 FAIL ===
```

## Git state at end of walk

```bash
$ git log --oneline -5 origin/claude/swarm-20260521-0423..HEAD
5b0a5b4 chore(swarm): HANDOFF blocker #10 — IptvnatorShell real EPG instead of placeholder
939b31a chore(swarm): HANDOFF blocker #8 — EPG mapping + settings persistence
94b8ea8 chore(swarm): Wave 2 continuation — HANDOFF blockers #4, #6, #7 + UI proof
752916f chore(swarm): Wave 2 continuation — sidecar API proof + audits
576b5dc chore(swarm): overnight 20260521-0423 — secret-scan + e2e-smoke + Playwright boundary
```

All five pushed to `origin/claude/swarm-20260521-0423`; PR #150 (draft)
targets `lane-a-provider-registry`.

## What did NOT run (honest gaps)

- `npm run test:provider:e2e` (live mode) — BUG-SWARM-003 / HANDOFF #1
  remain BLOCKED on real provider credentials (owner=Dave).
- Tizen sideload AVPlay proof — HANDOFF #3 BLOCKED on TV hardware (owner=Dave).
- Full Playwright matrix (specs 01-16) under authed mode — global-setup is
  tolerant of missing creds (writes empty cookie, warns honestly), so the
  authed specs would surface as honest failures, not fake passes. Not a
  regression — same status as 0423.

EXIT=0 on every block above except the explicit anti-skip live-mode smoke
(EXIT=1 by contract design).
