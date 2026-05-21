# Claude Instructions For DaveTV

Read `AGENTS.md` first. It is the canonical repo contract.

Critical rules:

- Do not add fake, mocked, placeholder, stub, or demo behavior to production
  paths.
- Do not claim completion without proof commands and exact results.
- Use the four gates for non-trivial work: Specify, Plan, Tasks, Implement.
- Provider, QR, auth, playback, VPS, and TV remote-navigation work requires
  tests or live/browser proof.
- Keep changes focused. Do not revert user or other-agent work.
- Never expose credentials, stream URLs, tokens, cookies, usernames, passwords,
  or API keys.

Start each session by checking:

```bash
git status --short --branch
```

For release-critical work, read:

- `docs/HANDOFF_FOR_CODEX.md`
- `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
- `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
- `docs/50_NATURAL_VOICE_AGENT_CONTRACT.md`
- `.agents/constitution.md`

Preferred proof:

```bash
npm test --prefix services/hermes-tv-api
npm run build --prefix apps/hermes-web-tv
```

If a task cannot be proven, mark it blocked and explain the missing proof.
