# DaveTV Agent Instructions

This is the canonical instruction file for agents working in this repo. It is
for Codex, Claude Code/Desktop, Kilo Code, and Windsurf. Keep tool-specific
files short and point back here.

User-facing brand: **DaveTV**. Repo/package/backend identifiers may still use
`HermesTV`, `hermes-tv-api`, or `hermestv.*` as technical namespaces.

## Mission

Build a private-household Samsung Tizen IPTV/AI experience for Dave and family.
The TV app must be remote-first, instant-play, and simple. The backend must own
provider ingest, auth, credentials, catalog normalization, playback proxying,
AI routing, and proof.

## Required Process

Every non-trivial feature must move through four gates:

1. Specify: write what/why, user journeys, success criteria, non-goals, and
   proof requirements.
2. Plan: add technical architecture, constraints, data contracts, security,
   tests, deployment impact, and rollback.
3. Tasks: break into small independently testable chunks.
4. Implement: code task-by-task, prove each task, then report exact files,
   commands, and residual risk.

Use `specs/templates/` for the first three gates. Do not skip gates for provider,
auth, playback, VPS, QR, remote-navigation, or user-visible UI changes.

## Hard Rules

- No fake, mocked, placeholder, demo, or stub behavior in production paths.
- Markdown templates may contain fill-in fields, but completed specs, plans,
  tasks, docs, and production code must not leave unresolved placeholders.
- Test fixtures are allowed only in tests, docs/proof, or explicitly named
  fixture tools. They must never be shown as real user data.
- Never claim "done", "working", "complete", or "release ready" without proof
  from commands, browser checks, live provider proof, or screenshots as needed.
- QR codes must encode real generated setup URLs and pairing codes. Static QR
  art is forbidden in user-facing flows.
- Social login buttons must render only when real provider credentials and URLs
  are configured on the server.
- Provider data must come from the provider registry/store, env, or durable
  disk config. Static provider arrays are not acceptable.
- Provider credentials, stream URLs, tokens, usernames, passwords, API keys, and
  cookies must not be logged, committed, exposed to the browser, or written to
  proof artifacts.
- Playback UX is instant-play by default. Do not add "choose action" popups to
  watch Live, Movies, or Series. Options belong in settings or explicit menus.
- DaveTV's voice agent must be natural-language and voice-first. Exact phrase
  command tables are allowed only as a fast path, not as the agent brain.
- The default assistant name and wake phrase are DaveTV / "Hey DaveTV"; users
  may change or disable the trigger phrase when a real supported trigger path
  exists.
- Remote navigation must be smooth, focusable, scrollable, and usable on Samsung
  TV remotes before a UI is called complete.
- DaveTV auth is invite-only family access. Anonymous bots must not access
  protected APIs.
- Do not deploy to the VPS unless private `.env` requirements are present and
  the deploy safety gate passes.

## Completion Contract

For every implementation response, include:

- What changed.
- Exact proof commands run and result.
- Any browser/device proof, screenshots, or live endpoint checks.
- Any files intentionally not touched.
- Remaining blockers, with owner: agent, Dave, VPS secret, real TV, provider.

If proof cannot be run, say why and mark the task blocked. Do not substitute a
mock proof for live-provider proof.

## Must-Read Docs

- `docs/HANDOFF_FOR_CODEX.md`
- `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
- `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
- `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`
- `docs/49_TRUTH_AUDIT_RELEASE_READINESS_CONTRACT.md`
- `docs/50_NATURAL_VOICE_AGENT_CONTRACT.md`
- `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`
- `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md`
- `.agents/constitution.md`

## Repo Map

- Web TV UI: `apps/hermes-web-tv/src/`
- Tizen native shell: `apps/hermes-tv-tizen-native/`
- API backend: `services/hermes-tv-api/src/`
- API tests: `services/hermes-tv-api/test/`
- VPS compose/deploy: `upstream/docker-vps/`, `.github/workflows/deploy-vps.yml`
- Provider proof tools: `tools/test-provider-e2e.js`
- Spec workflow: `specs/`

## Proof Commands

Run the smallest relevant set, then broaden when risk is high.

```bash
npm test --prefix services/hermes-tv-api
npm run build --prefix apps/hermes-web-tv
npm run validate:schemas
node tools/test-provider-e2e.js
```

For local authenticated API proof, use temporary env and never commit the auth
store. For VPS provider proof, use `DAVETV_PROOF_EMAIL` and
`DAVETV_PROOF_PASSWORD` secrets for a real invited account.

## Coding Standards

- Follow existing repo patterns before adding new abstractions.
- Keep edits scoped to the task. Do not refactor unrelated files.
- Use real parsers/APIs for structured data.
- Validate all inputs at route boundaries.
- Return clear errors instead of pretending success.
- Add tests for new routes, stores, parsing, provider identity, auth, and
  playback behavior.
- Keep browser-targeted JS compatible with Tizen Chromium 76 unless the file is
  explicitly server-only.
- Preserve user changes. Never reset or revert work you did not make.

## Multi-Agent Rules

- Split work by lane and file ownership.
- Agents must not edit the same files in parallel unless an integrator owns the
  merge.
- Each agent must produce evidence: files changed, commands run, pass/fail, and
  blockers.
- A truth/proof agent may reject a feature as incomplete even if code exists.
- Reference apps may be used for behavior patterns, not copy-pasted licensed
  code. Extract contracts, not source blobs.

## Deployment Rules

Canonical public project host: `https://tv.daveai.tech`.

Keep `iptv.daveai.tech` for another project unless Dave explicitly changes the
assignment.

Before deploying auth-gated DaveTV builds, the private VPS `.env` must contain:

```env
DAVETV_AUTH_REQUIRED=true
DAVETV_AUTH_ENFORCE_API=true
DAVETV_PUBLIC_APP_URL=https://tv.daveai.tech
DAVETV_ADMIN_EMAIL=<real Dave email>
DAVETV_ADMIN_PASSWORD=<real initial password>
```

Never commit those real values.
