# Release Decision — 2026-05-21 05:35 UTC (Wave 2 deep continuation)

## Verdict

**BLOCKED** — proven progress, not yet release-ready.

Per docs/54 §"Release Decision Gates" and the Codex postmortem rule
("If release is not PASS and the run lasts less than 4 hours, Claude must
report: FAIL — stopped early"): this swarm has now been running across
two continuation windows. The verdict is **BLOCKED**, not FAIL — every
remaining block has a named human owner with concrete evidence of what's
missing.

## What is PASS

- Auth boundary (sidecar API spec 6/0)
- Auth-required smoke (e2e empty-state 12/0; live anti-skip honest fail)
- Boundary UI focus + keyboard (boundary spec 4/0)
- Provider-reload boundary (provider-reload UI spec 1/0)
- Setup → restart persistence (setup e2e 16/0)
- Source-health includes disk providers (sourceHealthAggregator walk)
- Credential redactor parity (32/0 sync test)
- EPG mapping persistence across restart (10/0)
- Real EPG in IptvnatorShell (no synthetic now-playing)
- Dev-mock dead code in production bundle (HANDOFF #9 fixed in tree)
- 26 API test files, ALL green
- Secret-scan EXIT=0, no value-shaped credentials in any swarm artifact

## What is BLOCKED — owner=Dave

| # | Block | Owner | Unblock command |
| --- | --- | --- | --- |
| 1 | HANDOFF #1 Jellyfin items unplayable | Dave | `JELLYFIN_URL=… JELLYFIN_API_KEY=… npm test --prefix services/hermes-tv-api` after Jellyfin items test ships |
| 2 | HANDOFF #3 AVPlay on Tizen | Dave/Tizen TV | sideload signed `.wgt` and run AVPlay manual proof on QN85 |
| 3 | BUG-SWARM-003 live-provider truth | Dave/provider | `PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 node tools/test-provider-e2e.js` *or* dispatch deploy-vps with `run_provider_live=true` |

## What is BLOCKED — owner=Lane A

| # | Block | Owner | Unblock signal |
| --- | --- | --- | --- |
| BUG-SWARM-009 | AuthGate React state doesn't trust proxied `/api/auth/me` | Lane A | AuthGate respects `hasUser: true` regardless of how the response was delivered |

## What is open agent-fixable — Wave 3 candidates

| # | Block | Why deferred |
| --- | --- | --- |
| HANDOFF #2 | DVR/Downloads/Catch-up UI lies | Needs UI gate behind feature flag + smoke proof of empty-state honesty. ~1.5 h. |
| HANDOFF #5 | Two competing Tizen scaffolds | Static dedup decision (which scaffold survives) needs Dave's input on which Tizen build is the release vehicle. Not blocked, just needs a 1-line confirmation. |

## Decision

This is **not** the moment to flip the release switch. The PR (draft #150)
captures a real, reviewable Wave 2 — every change has tests, no fake
passes, no leaks. But:

1. Live provider proof has never run — the contract in docs/46 cannot be
   satisfied by anything except real credentials.
2. AVPlay on real Tizen hardware has never been confirmed — HANDOFF #3.
3. BUG-SWARM-009 (React state) blocks the deep authed browser proof for
   the next-level UI gate.

Dave's next move (one of):

```bash
# unblock live-provider proof — either:
PROVIDER_E2E_ALLOW_LOCAL_LIVE=1 node tools/test-provider-e2e.js
# or (against deployed VPS, sanitized artifact):
HERMES_PROVIDER_E2E_BASE=https://tv.daveai.tech PROVIDER_E2E_MODE=live \
  node tools/test-provider-e2e.js

# review PR (5 commits)
gh pr view 150 --web
```

Until one of those returns PASS with real provider items, the release
decision stays BLOCKED. This walk's contribution is to make the BLOCKED
state honest, narrow, and named — not to manufacture a PASS that wouldn't
survive the next morning's smoke.
