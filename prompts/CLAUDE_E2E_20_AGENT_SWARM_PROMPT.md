# CLAUDE_E2E_20_AGENT_SWARM_PROMPT - HermesTV Remaining E2E

Use this prompt when starting Claude or a 20-agent swarm to finish the remaining
HermesTV end-to-end work.

## Mission

Complete the remaining HermesTV E2E tasks without overclaiming. The goal is not
more planning. The goal is provable working behavior across backend, web,
provider onboarding, playback, Tizen packaging, source-health, EPG, CI, deploy,
and proof artifacts.

Start by reading, in this order:

1. `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
2. `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
3. `prompts/CLAUDE_PROVIDER_FINISH_PROMPT.md`
4. `prompts/CLAUDE_MASTER_PROMPT.md`

The E2E completion contract supersedes stale phase notes, old "ready" language,
and any agent report that claims success without proof.

## Current Known State

Treat this as starting truth:

- Provider registry/config has local proof.
- Catalog/search hydration has local service proof.
- Direct stream proxy has local service proof.
- Full live-provider proof is still required.
- Web build may be blocked by missing local dependencies until dependency setup
  is fixed.
- Tizen API base/CSP/CORS/player proof is not complete.
- EPG/source-health still need registry/source ID alignment.
- CI/deploy gates must be hardened so provider-live proof cannot pass by skip.

Do not ask the user for provider secrets in chat. The operator configures
secrets outside the repo.

## Hard Rules

1. No secrets in code, docs, logs, screenshots, browser storage, or git.
2. Do not read `G:\private` or any operator vault path.
3. No mock catalog data for provider-live proof.
4. No provider-live PASS when `/api/catalog` is empty.
5. No Tizen PASS without packaged API-base/CSP/CORS/player proof.
6. No EPG/source-health PASS unless IDs match catalog/play IDs.
7. Unsupported features must return honest unsupported status.
8. Each agent must report changed files, proof run, blockers, and secret status.

## Coordination Instructions

Use 20 agents. Assign exactly one lane per agent from
`docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`.

Agents must not all edit the same files. If two lanes need the same file, the
Truth Lead coordinates sequence and integration.

Recommended order:

1. Agent 01 Truth Lead starts the ledger.
2. Agents 02, 09, 10, 12, and 18 build proof infrastructure first.
3. Agents 03, 04, 05, 06, 07, and 08 finish user-facing and runtime paths.
4. Agents 11, 13, 14, 16, 17, 19, and 20 validate deploy, docs, stability, and
   release.
5. Agent 15 only claims DVR/download/catch-up if real pipelines exist; otherwise
   make those paths honestly unsupported.

## Agent Assignments

Agent 01 - Truth Lead And Integrator:
Read all lane reports. Maintain `docs/proof/e2e-completion/<timestamp>/summary.md`.
Reject any "done" claim without proof.

Agent 02 - Live Provider Proof:
Implement or finish `tools/test-provider-e2e.js`. It must fail when provider-live
mode has no configured provider. It must redact outputs.

Agent 03 - Provider UX And QR:
Finish provider add/list/test UI and real QR setup URL behavior. Remove fake
scannable QR placeholders.

Agent 04 - Tizen API Base, CSP, CORS:
Make packaged Tizen/web builds call the intended backend. Fix CSP/CORS proof.

Agent 05 - TV Playback Path:
Ensure web/Tizen player uses ticket endpoints. Use AVPlay on Tizen when
available. Never expose upstream URLs.

Agent 06 - Source Health Truth:
Make source-health consume provider registry/catalog source IDs, not static
provider assumptions.

Agent 07 - EPG Mapping:
Map XMLTV/EPG channels to real catalog/source IDs and preserve EPG diagnostics.

Agent 08 - Search, Detail, And Filters UI:
Make search result -> detail -> watch work with hydrated provider/source shape.
Derive filters from backend providers.

Agent 09 - CI Provider Gates:
Separate no-provider empty-state tests from provider-live tests. Fail
provider-live on skip.

Agent 10 - Secret And Proof Sanitizer:
Ensure source and proof artifacts are scanned and redacted.

Agent 11 - VPS Deploy And Env Wiring:
Make compose/env/data volume behavior match the docs. Prove provider config
persists on VPS without exposing values.

Agent 12 - Web Dependency And Build Gate:
Make `npm run build:web` reproducible from clean install.

Agent 13 - Browser E2E:
Add browser proof for provider add/list/catalog/search/play shell.

Agent 14 - Tizen Build And Sideload:
Clarify canonical Tizen app path. Build WGT or report signing/device blockers.

Agent 15 - DVR, Download, Catch-Up Truth:
Make unsupported paths honest or implement real pipelines. No fake success.

Agent 16 - Observability And Diagnostics:
Add non-secret diagnostics for provider, catalog, proxy, EPG, Tizen API base,
and build identity.

Agent 17 - Operator Docs Truth Update:
Remove stale "ready" language. Docs must say implemented, proven, blocked, or
unsupported.

Agent 18 - Regression Harness:
Add regression tests for disk provider -> catalog -> play and search hydration.

Agent 19 - Performance And Stability:
Test provider/catalog timeouts, playback fallback bounds, and proxy timeout
behavior.

Agent 20 - Release Manager:
Collect all proof. Produce the final release decision. Do not approve release
unless the E2E contract passes or blockers are explicitly listed.

## Required Commands

Run or make runnable:

```powershell
npm install
npm run build:web
npm test --prefix services/hermes-tv-api
npm run test:e2e
node services/hermes-tv-api/test/providerRegistry.test.js
node services/hermes-tv-api/test/catalogProviders.test.js
node services/hermes-tv-api/test/playbackProxy.test.js
node tools/test-provider-e2e.js
```

Tizen-related lanes also run or report blockers for:

```powershell
npm run tizen:prep --if-present
npm run build --prefix apps/hermes-tv-tizen
```

## Final Report Format

Every agent must report:

```text
Agent:
Lane:
Changed files:
Commands/proof run:
E2E status: PASS | FAIL | BLOCKED
Secrets exposed: NO
Remaining blockers:
Next required lane:
```

The final swarm report must include:

```text
Overall E2E status: PASS | FAIL | BLOCKED
Provider-live status:
Web build status:
Tizen package status:
Playback status:
EPG/source-health status:
CI/deploy gate status:
Proof artifact path:
Release decision:
```

If any live provider proof is blocked by missing operator configuration, say:

```text
Provider-live proof is BLOCKED because no live provider is configured in this
environment. No secrets were requested or exposed.
```

Do not replace that with "providers are working."
