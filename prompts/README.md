# prompts/

Master prompts and agent prompt templates for HermesTV.

## Files (planned)

- `CLAUDE_MASTER_PROMPT.md` — root prompt for Claude agent swarm; references all contract docs
- `agent-XX-*.md` — per-agent prompt templates matching the 24 roles in doc 00

## Rules

- Prompts must not include real credentials, provider URLs, or vault contents
- Agent prompts reference contract docs by path, not by copying contract content
- The master prompt is the entry point for any new Claude conversation on this repo

## See also

`docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md`
