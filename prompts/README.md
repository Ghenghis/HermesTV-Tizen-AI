# prompts/

Master prompts and agent prompt templates for HermesTV.

## Files (planned)

- `CLAUDE_MASTER_PROMPT.md` — root prompt for Claude agent swarm; references all contract docs
- `CLAUDE_PROVIDER_FINISH_PROMPT.md` — provider-completion handoff prompt; use before any provider, playback, QR onboarding, source-health, or Tizen API-base work
- `CLAUDE_E2E_20_AGENT_SWARM_PROMPT.md` — remaining E2E completion prompt for the 20-agent release/proof swarm
- `CLAUDE_REFERENCE_APPS_E2E_SWARM_PROMPT.md` — reference-app adoption prompt; use when agents pull working IPTV patterns from `G:\Github\IPTV-Apps`
- `CLAUDE_TRUTH_AUDIT_RELEASE_SWARM_PROMPT.md` — truth-audit prompt for removing remaining mocks/placeholders/stubs and making release gates real
- `CLAUDE_OVERNIGHT_24_AGENT_RELEASE_SWARM_PROMPT.md` — unattended 24-agent overnight controller prompt with E2E policies, waves, bug ledger, proof gates, and release decision rules
- `agent-XX-*.md` — per-agent prompt templates matching the 24 roles in doc 00

## Rules

- Prompts must not include real credentials, provider URLs, or vault contents
- Agent prompts reference contract docs by path, not by copying contract content
- The master prompt is the entry point for any new Claude conversation on this repo

## See also

`docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md`
`docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
`docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
`docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`
`docs/49_TRUTH_AUDIT_RELEASE_READINESS_CONTRACT.md`
`docs/54_OVERNIGHT_24_AGENT_RELEASE_SWARM_CONTRACT.md`
