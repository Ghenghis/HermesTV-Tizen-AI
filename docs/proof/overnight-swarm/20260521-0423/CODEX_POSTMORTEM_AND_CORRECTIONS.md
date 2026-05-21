# Codex Postmortem And Corrections

Date: 2026-05-21
Run reviewed: `docs/proof/overnight-swarm/20260521-0423/`
Reviewer: Codex

## Verdict

This was not a valid overnight 24-agent swarm. It was a short single-agent
proof burst that fixed useful harness bugs, but it stopped far too early and
overstated "software lanes green."

## Root Causes

1. **Single-agent execution was treated as a swarm.**
   `agent-ledger.md` explicitly says "Single-agent overnight execution."
   That is fine as a fallback, but it should have walked all 24 lanes
   sequentially. It did not.

2. **Blocked live proof ended too much work.**
   Missing live provider credentials should block only live-provider proof. It
   should have triggered fixture provider, no-provider, provider save/reload,
   provider UI, and playback-path proof.

3. **Deep authenticated UI proof was incorrectly blocked on Dave's real admin
   password.**
   Production-admin proof needs Dave's secret. Local deep UI proof can be run
   by starting an isolated API on another port with a temporary auth store and
   throwaway admin.

4. **No minimum runtime or lane quota existed.**
   The prompt did not reject a 15-minute run. It now requires release PASS,
   a Dave-given short time box, or a real multi-hour run with all unblocked
   P0/P1 work ledgered.

5. **The run did not consume the unblocked backlog.**
   It did not continue into instant playback popups, remote navigation, provider
   UI persistence, View pack adoption, QLED proof, deploy workflow static checks,
   or secure provider setup.

6. **Playwright proof was too narrow.**
   It only proved unauthenticated login boundary behavior. It did not prove the
   actual DaveTV authenticated app, provider screens, playback, settings, Views,
   or remote navigation.

7. **The new Playwright spec hard-coded one proof folder timestamp.**
   Future runs would keep writing to `20260521-0423`. Codex corrected it to use
   `DAVETV_SWARM_PROOF_DIR` / `DAVETV_PROOF_DIR` with a safe local fallback.

8. **The secret scanner excluded `docs/` from grep scans.**
   That weakened the claim that proof artifacts were scanned. Codex corrected
   the scanner to include Markdown/text/proof artifacts and not skip comment
   lines.

## Corrections Applied

- `docs/54_OVERNIGHT_24_AGENT_RELEASE_SWARM_CONTRACT.md`
  - Added minimum overnight completion quotas.
  - Added a blocker substitution matrix.
  - Changed blocked proof from a stop condition into a pivot condition.
  - Clarified that owner-only blockers block only the exact live proof.

- `prompts/CLAUDE_OVERNIGHT_24_AGENT_RELEASE_SWARM_PROMPT.md`
  - Added the "FAIL - stopped early" rule for short non-PASS runs.
  - Required all 24 lanes to be ledgered even in single-agent fallback.
  - Required substitute proof for live provider, auth, SMTP, VPS, TV, and DNS
    blockers.
  - Required isolated local authenticated Playwright proof when Dave admin
    credentials are unavailable.

- `tests/playwright/specs/swarm-20260521-boundary-proof.spec.ts`
  - Removed hard-coded `20260521-0423` proof path.
  - Added env-driven proof folder support.

- `tools/secret-scan.sh`
  - Removed blanket docs exclusion.
  - Added Markdown/text scanning.
  - Stopped skipping comment lines.
  - Improved redaction for Windows drive-letter paths.

## New Rule For Future Claude Runs

If release is not PASS and the run lasts less than 4 hours, Claude must report:

```text
FAIL - stopped early
```

It must not report `BLOCKED` unless every unblocked substitute lane has also
been exhausted and ledgered.
