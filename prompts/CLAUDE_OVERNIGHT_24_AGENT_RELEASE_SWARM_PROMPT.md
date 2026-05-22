# Claude Overnight 24-Agent Release Swarm Prompt

Use this prompt when Dave wants Claude Code / Claude Desktop to run many agents
while he sleeps.

Repo:

```text
G:\Github\HermesTV-Tizen-AI
```

Mission:

```text
Move DaveTV toward release with real E2E fixes, not claims. Run 24 agents in
waves. Audit, implement, prove, fix bugs, and produce a release decision. Do
not stop at research. Do not skip hard failures. Do not leak secrets.
```

Read first:

```text
AGENTS.md
.agents/constitution.md
docs/54_OVERNIGHT_24_AGENT_RELEASE_SWARM_CONTRACT.md
docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md
docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md
docs/49_TRUTH_AUDIT_RELEASE_READINESS_CONTRACT.md
docs/50_NATURAL_VOICE_AGENT_CONTRACT.md
docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md
```

## Hard Command

You are not allowed to say "done" unless the required proof passed.

If a bug is found, either fix it or log it in the overnight bug ledger with
file/line evidence, proof command, owner, and status. Do not skip it.

Continue working until one of these is true:

- release decision is PASS
- the time budget is exhausted and every remaining issue is in the ledger
- every unblocked P0/P1/P2 task in the overnight backlog has been audited,
  fixed/proven, or explicitly assigned to a later wave with evidence

Do not stop because one test fails. A failing test starts the bug-fix loop.
Reproduce, fix, rerun, and update the ledger. After three focused attempts,
hand the bug to Bug Fix SWAT with exact evidence.

Do not stop because live provider, SMTP, VPS, Cloudflare, or real Samsung TV
proof is blocked. That blocks only that exact proof. Pivot to fixture provider
proof, isolated local auth proof, Playwright UI proof, View integration,
workflow/static checks, docs/proof, or bug fixing.

Do not stop because you created a commit, pushed a branch, opened a draft PR,
or wrote a proof folder. Those are checkpoints. Continue into the next wave or
start a follow-up branch for remaining agent-owned backlog unless Dave
explicitly says to stop.

If this run lasts less than 4 hours and release is not PASS, the final report
must say `FAIL - stopped early`, not `BLOCKED`. A 15-minute pass over one
boundary screen is not an overnight swarm.

If a draft PR is created before the time budget ends, immediately continue with
the next highest-priority unblocked bug. Do not wait for PR review unless the
next work would edit the exact same files and cannot be isolated.

If only one controller agent is available, emulate the 24-agent run by walking
all 24 role lanes sequentially. Record all 24 lanes in `agent-ledger.md`. Do
not call it a 24-agent swarm if only one lane ran.

If blocked by human-only dependencies, mark `BLOCKED` with the owner:

- Dave
- VPS secret
- provider account
- SMTP account
- Cloudflare/DNS
- real Samsung TV

Everything else is agent-owned.

Human-only blockers require substitute proof:

- provider credentials missing -> fixture provider + no-provider + honest live
  failure proof
- Dave admin password missing -> isolated local API with temp auth store and
  throwaway admin for deep authenticated UI proof
- SMTP missing -> local reset token and expired-token proof
- VPS deploy blocked -> patch/audit workflow locally, mark only deployment
  execution blocked
- real Samsung TV missing -> Samsung mock Playwright proof plus physical-TV
  checklist

## Powerful E2E Policies

Enforce these for every agent:

1. Truth beats UI. No success state without durable backend state.
2. Provider work must prove provider input -> registry -> providers -> catalog
   -> search -> play ticket -> stream HEAD/GET.
3. No skipped success. Release proof cannot pass because credentials/catalog are
   missing.
4. Secrets never echo into chat, screenshots, docs, logs, storage, commits, or
   CI.
5. Instant playback is default. Do not add blocking watch popups.
6. Remote-first is mandatory. Mouse-only UI is not TV-ready.
7. Auth fails closed. Admin/family/session/reset flows need real proof.
8. Secure provider setup gives the agent redacted status, not raw passwords.
9. Upstream source needs manifest, license, attribution, and proof.
10. UI polish needs screenshots; smoothness needs focus/navigation proof.
11. Fix forward. Unsupported features must be honest, not fake.
12. Polish cannot mask broken provider/auth/playback truth.

## Run Structure

Create:

```text
docs/proof/overnight-swarm/YYYYMMDD-HHMM/
```

Inside it, maintain:

```text
summary.md
bug-ledger.md
agent-ledger.md
commands.md
screenshots.md
release-decision.md
```

## Local App And Playwright Fail Safes

Use Playwright as visual and interaction proof, not decoration.

If the web app is not running:

1. Start the API if needed.
2. Start the Vite web app on `http://localhost:5173`.
3. If the port is occupied by the correct app, reuse it.
4. If the port is occupied by something else, use the next open port and record
   the URL in `commands.md`.

If auth is required:

- use the repo Playwright auth setup
- never print passwords, reset tokens, provider URLs, or cookies
- if the operator's running API cannot authenticate because Dave admin
  credentials are unavailable, start an isolated local API on another port with
  temporary `DAVETV_AUTH_STORE`, temporary admin env, and prove the deep
  authenticated UI there. Mark only production-admin proof `BLOCKED`.

Every UI lane must use Playwright to check at least:

- page loads without console errors that break the feature
- target controls are visible and focusable
- keyboard/D-pad style navigation can reach the controls
- click/Enter performs the intended action
- Back/Escape exits modals/panels safely
- scrolling works where rows/pages overflow
- screenshot is saved after the interaction, not just before it

Required screenshot paths:

```text
docs/proof/overnight-swarm/YYYYMMDD-HHMM/screenshots/<lane>-<view>-<state>.png
```

For playback UX claims, Playwright must prove:

- selecting a movie/show/live card enters the play path directly
- no unwanted watch popup blocks playback
- if the stream cannot play because provider proof is blocked, the UI shows an
  honest provider/playback error

For settings/provider claims, Playwright must prove:

- provider/settings controls are reachable by keyboard
- save failures are visible and honest
- reload/relogin reflects saved provider state when a safe fixture is used

For View/QLED polish claims, Playwright must capture:

- home view
- View picker
- at least one focused card/control state
- settings state if settings changed

Do not call a screenshot proof if no interaction was tested.

## Waves

### Wave 0 - Preflight

- Record `git status --short`.
- Identify dirty files.
- Assign file ownership.
- Create proof folder.
- Create a 24-row agent checklist in `agent-ledger.md`.
- Do not implement features yet.

### Wave 1 - Audit

Audit provider save/catalog/playback, auth/admin/SMTP, instant playback,
remote/focus, EPG/source health, Azure voice, secure provider setup, View pack,
VPS/deploy, and Playwright proof.

Every audit finding must go into `bug-ledger.md`.

This wave is not complete until every one of the 24 role lanes has at least one
audit row or a justified "not touched this wave" row.

### Wave 2 - Implement

Use no more than 10-12 coding agents at once. Others write tests, audit, or
prepare proof. Avoid merge collisions.

Priority order:

1. Provider truth and saved provider persistence.
2. Auth/admin/session/reset.
3. Instant playback/no-popup watch path.
4. Remote navigation and scrolling.
5. Playwright proof.
6. Azure voice selector/TTS proof.
7. Secure provider setup redaction.
8. Upstream View pack / QLED polish.

### Wave 3 - Bug Fix SWAT

Assign backend, frontend, Playwright, deploy/docs, and integrator fixers.

Open P0/P1 bugs must become fixed, blocked with owner, or downgraded with proof.
They may not remain ignored.

### Wave 4 - Final Proof

Run the smallest complete proof set possible:

```powershell
npm test --prefix services/hermes-tv-api
npm run build --prefix apps/hermes-web-tv
npm run test:web:proof
node tools/test-provider-e2e.js
```

If a command cannot run, explain why in `commands.md` and `release-decision.md`.
Then run the substitute proof for that blocker before ending the wave.

If release remains blocked but agent-owned P1/P2 backlog exists, Wave 4 creates
a follow-up branch/PR plan and continues into Wave 5.

### Wave 5 - Continuation After PR

Use this wave when a draft PR exists but time remains.

- Do not edit the same files as the open PR unless continuing on that branch.
- Pick the highest-priority unblocked bug from `bug-ledger.md`.
- Prefer browser proof gaps, API base escape hatches, provider UI persistence,
  remote navigation, View screenshots, and secure provider setup.
- Produce another proof update or follow-up draft PR.
- Stop only when the time budget ends, Dave stops the run, or all unblocked
  backlog is exhausted.

## Final Response Format

Return:

```text
Overall status: PASS | FAIL | BLOCKED
Proof folder:
P0 fixed:
P1 fixed:
Open P0/P1:
Blocked by Dave/VPS/provider/TV:
Commands run:
Screenshots:
Secrets exposed: NO
Release decision:
Next exact command for Dave:
```

Do not claim release-ready unless all P0/P1 proof gates pass.
