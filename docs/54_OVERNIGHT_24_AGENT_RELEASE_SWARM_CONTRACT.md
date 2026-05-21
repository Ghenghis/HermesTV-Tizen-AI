# 54 - Overnight 24-Agent Release Swarm Contract

Status: BINDING when running Claude Code / Claude Desktop / Codex / Kilo Code /
Windsurf agents unattended
Owner: Truth Lead + Release Manager
Date: 2026-05-21

This contract answers the operational question: how can 24 agents work while
Dave sleeps without producing unfinished, fake, skipped, or broken work?

The answer is: do not ask 24 agents to "finish DaveTV" as one vague task. Run
them in gated waves with file ownership, proof gates, a bug ledger, and a
small integrator group that rejects incomplete claims.

## Realistic Overnight Capacity

With 24 agents, one overnight run can complete a lot, but only if work is split
cleanly.

Likely in 6-10 hours:

- 10-25 narrow bug fixes with tests.
- 3-6 medium lanes if file ownership is clean.
- 10-20 Playwright/proof screenshots.
- 5-10 reference-app View audits or first-pass Native Views.
- 1-3 backend route families if tests are already nearby.
- A complete release ledger showing pass/fail/blockers.

Unlikely in one unattended night unless already close:

- Full release on real VPS plus real Samsung TV proof.
- Real live-provider proof if provider credentials/env/VPS are missing.
- Complete natural-language voice agent with memory, search, playback, and
  background jobs.
- 25 fully integrated upstream Views.
- OAuth/social login for all providers plus admin panel plus SMTP plus Tizen
  proof.

Best estimate for DaveTV:

- One good overnight swarm can materially improve the project and clear many
  obvious bugs.
- Two to five focused overnight swarms can push most software lanes to release
  candidate if provider/VPS/env blockers are solved.
- Release-ready still requires human-owned gates: real provider credentials,
  SMTP credentials, VPS deploy access, Cloudflare/DNS correctness, and at
  least one real Samsung TV package/run proof.

## Why Agents Skip Work

Agents usually skip or stop for one of these reasons:

1. The task is too broad.
2. Two agents edit the same files and collide.
3. The agent finds a blocker and has no fallback instruction.
4. The test is failing but the agent treats failure as "report only."
5. Proof requires secrets, VPS, or a real TV.
6. The agent is allowed to call a screenshot or route existence "done."
7. There is no integrator rejecting weak results.

This contract removes those exits.

## Overnight Non-Stop Rule

An agent may stop only when one of these is true:

- Its assigned task passes the required proof.
- Its task is blocked by an owner-only dependency listed in this contract AND it
  has handed the blocker to the ledger, picked up the next unblocked task, or
  the Truth Lead confirms no unblocked work remains in that lane.
- It has created a failing proof/test and logged the bug for a fixer lane.
- Its file ownership conflicts with an active integrator decision.

If an agent finishes early, it must pull the next task from the same wave's
backlog. It must not invent unrelated work.

A blocked proof does not end an overnight run. It only blocks that exact proof.
The agent must continue with fixture proof, local isolated proof, browser proof,
View work, docs/proof work, tests, or bug fixing until the unblocked backlog is
empty.

Creating a branch, commit, draft PR, or proof folder is a checkpoint, not an
endpoint. Agents must continue with the next wave after publishing a PR unless
Dave explicitly says to stop. The final response may link the PR, but it must
also state what wave continues next and keep running if time remains.

## Minimum Overnight Completion Quotas

If Dave asks for an overnight swarm, a short 15-minute proof burst is not a
valid overnight run.

The final report is rejected unless it satisfies one of these:

- Release decision is `PASS`.
- Runtime is at least 4 hours and every unblocked P0/P1 task has a ledger entry.
- Dave gave a shorter explicit time box.

Required minimum work unless release is already `PASS`:

- All 24 agent roles have an `agent-ledger.md` row.
- At least 12 roles perform real audit, implementation, or proof work.
- Every P0/P1 bug has a status of `fixed`, `blocked-with-owner`, or
  `accepted-unsupported` with proof.
- At least one backend proof, one frontend build/proof, one Playwright
  interaction proof, one provider fixture/no-provider proof, and one secret scan
  proof are run.
- If live provider proof is blocked, fixture provider and no-provider empty
  state proof must still run.
- If deep authenticated UI proof is blocked against the operator's running API,
  agents must start an isolated local API with a temporary auth store and
  throwaway admin to prove the UI flow locally.
- If a draft PR is created before the time budget ends, at least one follow-up
  wave or follow-up branch must start immediately for remaining agent-owned
  backlog.

Single-agent execution is allowed only as a fallback, but it must sequentially
walk the 24-role checklist. It may not report itself as a 24-agent swarm.

## Blocker Substitution Matrix

When a human-only blocker appears, agents must pivot:

| Blocked item | Still required before stopping |
| --- | --- |
| Real provider credentials missing | Run fixture provider proof, no-provider empty-state proof, provider save/reload proof with safe fixture data, and verify release-mode live proof fails honestly. |
| Dave admin password missing | Start isolated local API on another port with temporary `DAVETV_AUTH_STORE`, throwaway admin env, and run deep authenticated Playwright UI proof there. Mark only production-admin proof blocked. |
| SMTP credentials missing | Prove reset-link fallback, admin-created user flow, token validation, expired-token rejection, and no token leaks in UI/screenshots. |
| VPS deploy authorization missing | Patch or audit deploy workflow locally, run syntax/static checks, and mark only the live deploy execution blocked. |
| Real Samsung TV unavailable | Run Samsung mock viewport/focus proof, generate a real-TV checklist, and mark only physical sideload/smoothness blocked. |
| Cloudflare/DNS unavailable | Prove local/public config files and run HTTP checks against current host; mark only DNS account action blocked. |

## Powerful E2E Policies

These policies are mandatory. Any agent, integrator, or release manager may
reject a lane that violates them.

### P0 Policy - Truth Beats UI

No user-visible success state is allowed unless the backend state is real and
durable. A polished Settings screen, QR, View, chat response, or toast is a
fail if the data is not saved, loaded after restart, and usable by the next E2E
link.

Required proof:

- save action returns a durable id
- reload/restart can read it
- downstream route consumes it
- UI reflects the saved state after relog/reload

### P0 Policy - Provider E2E Or Honest Blocked

Provider work is complete only when this chain passes:

```text
provider input -> providerStore/providerRegistry -> /api/providers ->
/api/catalog -> /api/search -> /api/play ticket -> /stream HEAD/GET
```

If any link is missing, the status is `FAIL` or `BLOCKED`, never `PASS`.
Fixture proof and live proof must be labeled separately.

### P0 Policy - No Skipped Success

Tests, CI jobs, scripts, and proof tools must not pass by skipping required
work. If a live provider is required and no live provider is configured, the
tool must return `BLOCKED` or non-zero in release mode.

Forbidden:

- `if no creds, pass`
- `if no catalog, pass`
- `if stream unavailable, pass`
- `TODO proof later`
- fake `mock:true` rows in release proof

### P0 Policy - Secrets Never Echo

Provider credentials, stream URLs, reset tokens, cookies, API keys, and raw M3U
URLs must not appear in:

- chat messages
- browser screenshots
- docs/proof
- logs
- localStorage/sessionStorage
- committed files
- agent reports
- CI output

If a proof needs to identify a provider, use provider id, host label, masked
host, item counts, or redacted JSON.

### P0 Policy - Instant Playback

Clicking a live channel, movie, show, or episode must play by default. Agents
must not add blocking "choose action" popups, tiny mouse-first modals, or
multi-click watch paths. Optional actions go in Settings, long-press menus, or
explicit detail Views.

Proof must show:

- click/Enter on a content card calls the play path
- popup does not block the watch path
- Escape/Back behavior remains safe

### P0 Policy - Remote First

Every release-candidate View must be usable without a mouse:

- visible focus
- D-pad left/right/up/down
- page/row scroll
- Back exits the current surface
- no focus traps
- no tiny controls required to watch

Mouse-only success is not TV success.

### P0 Policy - Auth Boundary

Production APIs must fail closed when auth is required. Social login buttons,
admin panels, reset links, and family account actions must only appear when the
server can actually complete the flow.

Proof must include:

- unauthenticated protected API rejection
- Dave admin allowed path
- family user non-admin rejection
- session persistence after reload

### P1 Policy - Secure Agent Assistance

The DaveTV agent may help users set up providers, fix issues, and create custom
Views, but it must not receive raw secrets unless the route is explicitly a
vault session and the agent output is redacted. The agent sees parsed status,
not passwords.

### P1 Policy - License And Source Provenance

Any upstream source copied from `G:\Github\IPTV-web` must have:

- manifest row
- license mode
- attribution
- copied license text when required
- proof command
- no-secret scan for touched files

No-license or no-modification apps are Pattern Only or Sandbox App.

### P1 Policy - Visual Proof

Any claim about UI/UX polish needs a screenshot. Any claim about smoothness or
remote navigation needs browser/Tizen focus proof.

Required screenshot naming:

```text
docs/proof/web-e2e/<area>-<view>-<state>.png
```

### P1 Policy - Fix Forward

Agents must not hide or downgrade broken release paths by deleting UI without
an honest unsupported state. If a real feature cannot be finished, the UI/API
must clearly show `unsupported`, `blocked`, or `not configured` and link to
the next required action.

### P2 Policy - Polish Cannot Mask Broken Truth

QLED polish, theme work, upstream Views, motion, and agent personality are
valuable, but they cannot substitute for provider/auth/playback proof. If P0
truth is red, polish lanes may continue only if they do not block P0 fixers.

If an agent finds a bug, it must either fix it or log it in the ledger with:

```text
ID:
Severity: P0 | P1 | P2 | P3
Area:
File/line:
Observed failure:
Expected behavior:
Proof command/screenshot:
Suspected cause:
Fix owner:
Status: open | in_progress | fixed | blocked | rejected
```

## Required Ledgers

Every overnight run creates one folder:

```text
docs/proof/overnight-swarm/YYYYMMDD-HHMM/
```

Required files:

- `summary.md` - final pass/fail/blocker report.
- `bug-ledger.md` - every bug found and status.
- `agent-ledger.md` - every agent, lane, files changed, proof, result.
- `commands.md` - commands run and results.
- `screenshots.md` - screenshot paths and what they prove.
- `release-decision.md` - PASS, FAIL, or BLOCKED.

No credentials or raw provider URLs may appear in these files.

## Playwright Proof Policy

Playwright is required for UI claims. It must test controls and interactions,
not only capture still images.

If the app is not running, agents must start or reuse the local API and web app.
If `http://localhost:5173` is occupied by the correct DaveTV app, reuse it. If
it is occupied by something else, use another port and record the URL.

Every UI proof must include:

- visible target state
- focusable controls
- keyboard/D-pad style movement where applicable
- click or Enter action
- Back/Escape safety for panels/modals
- scroll proof for overflowing rows/pages
- screenshot after the interaction

Screenshot path:

```text
docs/proof/overnight-swarm/YYYYMMDD-HHMM/screenshots/<lane>-<view>-<state>.png
```

A screenshot without interaction is visual evidence only. It cannot prove that
playback, provider save, settings, focus, or navigation works.

## Wave Structure

### Wave 0 - Preflight And Freeze

Time budget: 20-40 minutes.

Agents:

- Truth Lead
- Repo State Agent
- Dependency Agent
- Secret Safety Agent
- Integrator

Required actions:

1. Record branch and `git status --short`.
2. List dirty files and identify user/other-agent changes.
3. Install/build only if needed.
4. Run a quick secret-risk check on planned paths.
5. Create the proof folder and ledgers.
6. Assign file ownership.

No feature implementation starts until Wave 0 finishes.

### Wave 1 - Truth Audit

Time budget: 60-90 minutes.

Agents audit without broad edits:

- Provider save/catalog/playback
- Auth/admin/SMTP
- Playback UX popups and instant play
- Remote/navigation/focus
- EPG/source health
- Voice/Azure TTS
- Secure provider setup
- View pack/QLED UI
- VPS/deploy
- Playwright proof

Output: bug-ledger entries with file/line evidence and exact proof commands.

### Wave 2 - Implementation

Time budget: 3-5 hours.

Use no more than 10-12 coding agents at once. The other agents should audit,
write tests, or wait for integration windows. More coders than that usually
creates merge friction.

Allowed implementation lanes:

- P0 provider truth fixes.
- P0 auth/admin/session fixes.
- P0 instant playback/no-popup fixes.
- P0 remote focus/scroll fixes.
- P1 Playwright proof automation.
- P1 Azure voice selector and TTS proof.
- P1 secure provider setup redaction.
- P1 View pack Native View candidates.
- P2 QLED polish.

Every coding agent must run at least one focused proof command before handing
off.

### Wave 3 - Bug Fix SWAT

Time budget: 2-3 hours.

Agents:

- Bug Fixer A - backend/API
- Bug Fixer B - frontend/UI
- Bug Fixer C - Playwright/proof
- Bug Fixer D - deploy/env docs
- Truth Lead
- Integrator

Rule: any failing test or open P0/P1 bug must be fixed, downgraded with proof,
or marked blocked with owner. It cannot be ignored.

### Wave 4 - Final Proof And Release Decision

Time budget: 60-120 minutes.

Required proof, when applicable:

```powershell
npm test --prefix services/hermes-tv-api
npm run build --prefix apps/hermes-web-tv
npm run test:web:proof
node tools/test-provider-e2e.js
```

If VPS env is available:

```powershell
# run the repo's deploy/preflight path, never print secrets
```

Final release decision:

- PASS: all P0/P1 gates pass.
- BLOCKED: only human-owned gates remain.
- FAIL: software bugs remain that agents could fix but did not.

## 24-Agent Role Map

Use these lanes for overnight release work:

| Agent | Role | File ownership |
| --- | --- | --- |
| 01 | Truth Lead / Integrator | ledgers, final merge order |
| 02 | Provider Registry/Catalog | API provider/catalog/search files |
| 03 | Provider Save/UI | provider settings/import UI |
| 04 | Playback API/Proxy | play/stream/proxy/backend tests |
| 05 | Instant Playback UX | App click path/player/detail UI |
| 06 | Remote Navigation | focus/keyboard/scroll utilities and UI focus fixes |
| 07 | Auth/Admin/SMTP | auth routes, admin UI, reset flow |
| 08 | Secure Provider Setup | QR/vault/redaction setup paths |
| 09 | EPG/Source Health | EPG/source health backend/UI |
| 10 | Azure Voice/TTS | TTS routes, voice settings, proof |
| 11 | Natural Agent Fast Path | agent command/orchestrator contracts |
| 12 | Memory/Profile | profile/memory stores and privacy docs |
| 13 | View Pack/QLED UI | layout manifests, shells, design tokens |
| 14 | IPTV-web Reference App A | first group of upstream Views |
| 15 | IPTV-web Reference App B | second group of upstream Views |
| 16 | Playwright Proof | browser tests/screenshots/auth state |
| 17 | Tizen Package/API Base | Tizen wrapper/package/CSP/CORS |
| 18 | VPS Deploy/Env | deploy docs/scripts/compose, no secrets |
| 19 | Security/Secret Scan | redaction, logs, no-secret proof |
| 20 | CI/Regression | package scripts/workflows/tests |
| 21 | Performance/Stability | timeouts, virtual lists, smooth movement |
| 22 | Docs/Runbooks | docs that match implemented truth |
| 23 | Bug Fix SWAT | rotating fixer for failed lanes |
| 24 | Release Manager | final decision and proof bundle |

## File Ownership Rules

- Each lane owns its files for the wave.
- Agents may read any file but must not edit another lane's owned file without
  the Integrator assigning a handoff.
- If two lanes need the same file, Truth Lead sequences them.
- No agent may run broad formatting or unrelated refactors.
- No agent may revert user or other-agent work.

## Anti-Skip Completion Rules

Agents must not say "done" unless:

- Code is implemented.
- Tests/proof ran and passed.
- Screenshot/proof exists for UI claims.
- No secret leakage occurred.
- The bug ledger has no open P0/P1 bugs in that lane.

Agents must use these words honestly:

- `PASS`: proof passed.
- `FAIL`: proof failed and agent could not fix in time.
- `BLOCKED`: human-owned dependency prevents proof.
- `UNSUPPORTED`: feature is intentionally disabled/hidden with honest UI/API.

Forbidden phrases:

- "Looks good" without proof.
- "Should work" as a completion claim.
- "Done except tests."
- "Provider works" without provider truth proof.
- "Temporary mock" in production paths.

## Bug Fix Loop

Every bug follows this loop:

1. Reproduce or cite observed proof.
2. Add or identify a failing test/proof.
3. Fix the smallest real cause.
4. Run the proof again.
5. Update the ledger.
6. If still failing, hand to Bug Fix SWAT with exact evidence.

Agents must not skip from step 1 directly to "blocked" unless the blocker is
outside the repo.

## Owner-Only Blockers

Only these may remain blocked overnight:

- Real provider credentials or account status.
- SMTP credentials/provider configuration.
- Cloudflare/DNS account action.
- VPS SSH/deploy credentials or missing private `.env`.
- Physical Samsung TV access, signing keys, or device pairing.
- Paid API keys for metadata/sports/OAuth providers.

These block only the exact live proof that needs the owner. They do not block
fixture proof, local isolated proof, UI proof, docs/proof, tests, workflow
patching, or bug fixing. All other blockers are agent-owned until proven
otherwise.

## Recommended Overnight Target For DaveTV

For the next run, assign the swarm this target:

1. Provider save -> registry -> catalog -> search -> playback proof.
2. Auth/admin reset flow and Dave account proof.
3. Instant playback: remove movie/show popup watch blockers.
4. Remote scroll/focus smoothness.
5. Playwright proof gallery for existing Views.
6. First 3 IPTV-web Native View candidates.
7. Secure Provider Setup spec/tests, at least route skeleton with no-secret
   redaction if full UI cannot finish.
8. Final ledgers and release decision.

Do not spend the whole night on polish while provider truth is broken.
