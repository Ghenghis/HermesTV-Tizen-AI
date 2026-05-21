# Overnight Swarm — Wave 2 deep continuation — 2026-05-21 05:35 UTC

Status: **IN_PROGRESS** (continuation of 20260521-0423 — same swarm,
deeper Wave 2 walk per user's "PRs are checkpoints, not completion" rule).

PR: https://github.com/Ghenghis/HermesTV-Tizen-AI/pull/150 (draft)
Branch: `claude/swarm-20260521-0423` — 5 commits at last push:

  1. `576b5dc` — initial swarm (secret-scan + e2e-smoke + boundary spec)
  2. `752916f` — Wave 2.1-2.6 audits + sidecar API spec (6/0)
  3. `94b8ea8` — HANDOFF blockers #4 #6 #7 + UI proof boundary
  4. `939b31a` — HANDOFF blocker #8 (EPG mapping persistence)
  5. `5b0a5b4` — HANDOFF blocker #10 (IptvnatorShell real EPG)

## HANDOFF blockers from docs/HANDOFF_FOR_CODEX.md §2 status

| # | Blocker | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Jellyfin items unplayable | **BLOCKED** — owner=Dave (JELLYFIN_URL/KEY env required) | Branch design noted in bug-ledger; integration cannot run without env |
| 2 | DVR/Downloads/Catch-up UI lies | **open** | Not yet touched by this swarm |
| 3 | AVPlay never invoked on Tizen | **BLOCKED** — owner=Dave/Tizen TV | Needs sideload to verify |
| 4 | setupProviderRestart.e2e.test.js missing | **PASS** | New 16/0 test in commit `94b8ea8` |
| 5 | Two competing Tizen scaffolds | **open** | Static dedup possible |
| 6 | sourceHealth ignores disk providers | **PASS** | Fix in `sourceHealthAggregator.js` (commit `94b8ea8`) |
| 7 | credentialGuard missing m3u_plus | **PASS** | Patterns synced + new 32/0 test (commit `94b8ea8`) |
| 8 | EPG mapping in-memory only | **PASS** | New `epgMappingStore.js` + 10/0 test (commit `939b31a`) |
| 9 | hermestv_dev_mock ships to prod | **PASS** (in working tree) | App.jsx edit gated behind `import.meta.env.DEV`; build sized 276.85 kB; prod bundle's dev-mock branch is dead code (P=!1 short-circuit). Not in commit yet because file is co-located with Lane A WIP. |
| 10 | IptvnatorShell placeholder EPG | **PASS** | Real /api/epg/grid fetch + honest empty (commit `5b0a5b4`) |

## Other swarm-tracked items

| ID | Status | Notes |
| --- | --- | --- |
| BUG-SWARM-001 | **PASS** | tools/secret-scan.sh — false-positive sanitizer matches fixed |
| BUG-SWARM-002 | **PASS** | tools/test-e2e-smoke.js — admin bootstrap + cookie threading |
| BUG-SWARM-003 | **BLOCKED** owner=Dave/provider | Live provider proof needs real credentials |
| BUG-SWARM-004 | **partial** | global-setup tolerant; sidecar API deep proof 6/0 PASS at HTTP layer |
| BUG-SWARM-005 | **open** P2 cosmetic | audit:secrets wrapper exit-code surfacing |
| BUG-SWARM-006 | **REJECTED** | deploy-vps live gate already correctly wired |
| BUG-SWARM-007 | **PASS** | apiBase.js escape hatch exists (`window.__HERMES_API_BASE__`) |
| BUG-SWARM-008 | n/a | (numbering skipped) |
| BUG-SWARM-009 | **open** | AuthGate React state doesn't trust proxied /api/auth/me response (HTTP layer correct, React state stuck on `auth.configured=false`). Logged for Lane A investigation. |

## API test suite (npm test --prefix services/hermes-tv-api)

26 test files, EXIT=0 across the whole chain:

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
setupProviderRestart.e2e.test     16 PASS / 0 FAIL  ← new (this swarm)
credentialGuardSync.test.js       32 PASS / 0 FAIL  ← new (this swarm)
epgMappingRestart.test.js         10 PASS / 0 FAIL  ← new (this swarm)
```

## Playwright suites passing under both projects (chromium-1080p + samsung-qn85-mock)

- `swarm-20260521-boundary-proof.spec.ts` — 4/0 (login surface controls + focus + reload)
- `swarm-20260521-sidecar-api.spec.ts` — 6/0 (sidecar API deep authed proof, no leaks)
- `swarm-20260521-provider-reload-ui.spec.ts` — 1/0 (boundary reload via sidecar proxy)

## Web build + secret scan + smoke

- `npm run build:web` — green (Vite 3.31s, main 276.85 kB)
- `npm run audit:secrets` — 2 PASS / 0 FAIL (EXIT=0)
- `NO_PROVIDER_EMPTY_STATE=1 npm run test:e2e` — 12 / 0
- `npm run test:e2e` (live mode, no providers) — 9 / 3 honest FAIL (anti-skip)

See `commands.md` for the full output log.

## Final swarm-owned files

```
src/lib/epgMappingStore.js                      (new)
src/lib/sourceHealthAggregator.js               (modified — disk provider walk)
src/middleware/credentialGuard.js               (modified — 3 missing patterns)
src/routes/epg.js                               (modified — store delegation)
package.json                                    (modified — 2 new tests in chain)
test/credentialGuardSync.test.js                (new — 32/0)
test/epgMappingRestart.test.js                  (new — 10/0)
test/setupProviderRestart.e2e.test.js           (new — 16/0)

apps/hermes-web-tv/src/shells/IptvnatorShell.jsx (modified — real EPG)

tests/playwright/global-setup.js                (new — no-creds tolerant)
tests/playwright/specs/swarm-20260521-boundary-proof.spec.ts          (new — 4/0)
tests/playwright/specs/swarm-20260521-sidecar-api.spec.ts             (new — 6/0)
tests/playwright/specs/swarm-20260521-provider-reload-ui.spec.ts      (new — 1/0)

tools/secret-scan.sh                            (modified — tighter patterns)
tools/test-e2e-smoke.js                         (modified — auth bootstrap)

docs/proof/overnight-swarm/20260521-0423/       (initial proof folder)
docs/proof/overnight-swarm/20260521-0535/       (this continuation's ledgers)
```

Secrets exposed: NO. Every artifact in both proof folders scanned.

## Next exact command for Dave

```bash
cd /g/Github/HermesTV-Tizen-AI
gh pr view 150 --web      # Review the PR (5 commits, all CI-runnable when retargeted)

# Unblock live-provider proof — pick ONE:
PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 node tools/test-provider-e2e.js
# — OR (against deployed VPS) —
HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech PROVIDER_E2E_MODE=live \
  node tools/test-provider-e2e.js
```
