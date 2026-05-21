---
trigger: always_on
---

# DaveTV Windsurf Rules

Use `AGENTS.md` as the canonical project instruction file.

Always follow:

- `.agents/constitution.md`
- `docs/HANDOFF_FOR_CODEX.md`
- `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
- `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
- `docs/53_UPSTREAM_VIEW_PACK_CONTRACT.md`
- `docs/54_OVERNIGHT_24_AGENT_RELEASE_SWARM_CONTRACT.md`
- `docs/50_NATURAL_VOICE_AGENT_CONTRACT.md`

Hard rules:

- No fake/mocked/placeholder/stub production behavior.
- No credential leaks.
- No completion claims without proof.
- Instant playback by default; do not add blocking watch popups.
- Keep changes scoped and preserve user/agent work.

For non-trivial features, use Specify -> Plan -> Tasks -> Implement via the
templates in `specs/templates/`.
