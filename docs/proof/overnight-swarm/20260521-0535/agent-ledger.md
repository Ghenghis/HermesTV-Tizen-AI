# Agent Ledger — 2026-05-21 05:35 UTC (Wave 2 deep continuation)

Continuation of `docs/proof/overnight-swarm/20260521-0423/agent-ledger.md`.
This ledger records what the *single* on-duty agent did during the Wave 2
deep continuation walk (Dave's "PRs are checkpoints, not completion" rule).

| Slot | Lane | Status | Output |
| --- | --- | --- | --- |
| W2-A | secret-scan tightening (BUG-SWARM-001) | **PASS** | `tools/secret-scan.sh` rewritten; sanitizer-file allowlist; Windows-path awk |
| W2-B | smoke runner auth thread (BUG-SWARM-002) | **PASS** | `tools/test-e2e-smoke.js` bootstraps admin + threads cookie; 12/0 empty-state, 9/3 honest live |
| W2-C | boundary spec | **PASS** | `tests/playwright/specs/swarm-20260521-boundary-proof.spec.ts` 4/0 |
| W2-D | sidecar API deep proof | **PASS** | `tests/playwright/specs/swarm-20260521-sidecar-api.spec.ts` 6/0 |
| W2-E | provider-reload UI proof | **PASS** (adapted) | `tests/playwright/specs/swarm-20260521-provider-reload-ui.spec.ts` 1/0 + BUG-SWARM-009 logged |
| W2-F | HANDOFF #4 setup→restart e2e | **PASS** | `test/setupProviderRestart.e2e.test.js` 16/0 |
| W2-G | HANDOFF #6 sourceHealth disk providers | **PASS** | `src/lib/sourceHealthAggregator.js` iterates disk keys |
| W2-H | HANDOFF #7 credentialGuard sync | **PASS** | `middleware/credentialGuard.js` + `test/credentialGuardSync.test.js` 32/0 |
| W2-I | HANDOFF #8 EPG mapping persistence | **PASS** | `src/lib/epgMappingStore.js` + `test/epgMappingRestart.test.js` 10/0 |
| W2-J | HANDOFF #10 IptvnatorShell real EPG | **PASS** | `shells/IptvnatorShell.jsx` fetches `/api/epg/grid`; placeholder helper deleted |
| W2-K | HANDOFF #9 dev-mock gate | **PASS-in-working-tree** | `App.jsx` gated behind `import.meta.env.DEV`; verified dead-code in prod bundle |
| W2-L | HANDOFF #1 Jellyfin | **BLOCKED** | owner=Dave (JELLYFIN_URL/KEY env required) |
| W2-M | HANDOFF #3 AVPlay on Tizen | **BLOCKED** | owner=Dave/Tizen TV (sideload-only proof) |
| W2-N | HANDOFF #2 DVR/Downloads/Catch-up UI lies | **open** | Not yet touched — next-up Wave 3 candidate |
| W2-O | HANDOFF #5 Tizen scaffold dedup | **open** | Static dedup possible; not yet touched |

## Constraints honoured

- No mocks, no fakes, no placeholder success.
- No credentials printed, committed, screenshot, or logged. Two secret-scan
  passes against every artifact in this folder.
- Anti-skip contract honoured: smoke live-mode shows 9/3 honest FAIL when
  no providers configured, not 12/0 with fake passes.
- DaveTV naming honoured in user-facing strings touched this walk.
- No reverts of Codex or user changes. Codex's postmortem in 0423/ was read
  and its corrections applied before continuing.

## Cumulative output (this folder + 0423)

- 5 commits on `claude/swarm-20260521-0423` (576b5dc..5b0a5b4)
- PR #150 (draft) targeting `lane-a-provider-registry`
- 26 API test files, ALL green
- 11/11 Playwright suites scoped to this swarm green across chromium-1080p +
  samsung-qn85-mock
- 1 file fixed in working tree (HANDOFF #9) — pending commit
- 2 honest BLOCKED handoffs (Jellyfin, AVPlay) — owner=Dave
- 2 still-open agent-fixable handoffs (#2 UI lies, #5 Tizen dedup) — Wave 3
