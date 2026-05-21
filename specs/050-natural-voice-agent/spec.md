# Feature Spec: Natural Voice Agent

Status: Draft
Owner: DaveTV agent lane
Date: 2026-05-20

## What And Why

DaveTV needs a voice-first natural agent, not a hard-coded command chatbot.
Family users should be able to press the Samsung remote voice button and speak
normally, or use the default trigger phrase "Hey DaveTV" when a real supported
listening mode is active. The agent should understand what they want, search real connected
providers, ask short clarifying questions when needed, start playback when it is
confident, stop immediately when the user says it is wrong, and continue longer
research in the background while the user watches something else.

This matters because most users will not type into chat. The TV remote voice
button must become the simple interaction path.

## Users And Journeys

- As Sherri, I can say "find a Hallmark Christmas movie with Candace Cameron"
  and DaveTV searches connected providers instead of requiring exact commands.
- As any family user, I can say "Hey DaveTV" to activate agent mode when the
  device supports it, or use the remote voice button when wake phrase support is
  unavailable.
- As any family user, I can change or disable my trigger phrase from settings.
- As Warren, I can ask "when are my teams playing?" and DaveTV learns the teams
  I follow, offers reminders, and keeps those memories on my profile.
- As Dave, I can say "show only XtremeHD and Apollo" and DaveTV filters the
  catalog to those real providers.
- As any family user, I can say "this is the wrong one" during playback and
  DaveTV stops immediately, keeps searching, and asks about the next candidate.
- As any family user, I can keep watching while the agent performs longer
  research, then answer "watch now" or "save it for later" when it returns.
- As any family user, I can ask the agent to open settings, views, provider
  filters, apps, or help surfaces, and DaveTV takes me there when the action is
  allowed.

## Success Criteria

- [ ] Remote voice button opens a listening state quickly.
- [ ] The user-facing assistant name and default trigger phrase are DaveTV.
- [ ] Trigger phrase settings are profile-scoped and honestly report unsupported
  device/browser states.
- [ ] Natural phrasing works beyond exact hard-coded strings.
- [ ] Real provider catalog search covers all enabled providers.
- [ ] High-confidence playable matches can start playback without a popup.
- [ ] Ambiguous matches produce a short clarification, not a long menu.
- [ ] Wrong-result voice correction stops playback immediately.
- [ ] Long research runs in the background without blocking playback.
- [ ] Agent can return with "watch now or save for later" when research ends.
- [ ] Per-profile memory learns confirmed/repeated preferences.
- [ ] Users/admin can inspect and delete memories.
- [ ] No fake search hits, fake learning, mocked providers, or placeholder
  results are shown in production.
- [ ] No credentials, stream URLs, raw transcripts, or tokens leak.

## Non-Goals

- Do not replace the validated command schema from `docs/06`; use it as the
  safe execution layer.
- Do not let the agent change TV operating-system settings unless a real
  supported Tizen integration exists.
- Do not build a general web browser assistant.
- Do not store raw transcripts by default.
- Do not make text chat the primary path for family users.

## Data And API Contracts

See `docs/50_NATURAL_VOICE_AGENT_CONTRACT.md`.

Required route family:

- `POST /api/agent/utterance`
- `GET /api/agent/config/:profile_id`
- `PATCH /api/agent/config/:profile_id`
- `GET /api/agent/jobs/:job_id`
- `POST /api/agent/jobs/:job_id/cancel`
- `GET /api/agent/memory/:profile_id`
- `PATCH /api/agent/memory/:profile_id`
- `DELETE /api/agent/memory/:profile_id/:memory_id`

Required internal modules:

- Agent orchestrator
- Intent planner
- Provider search adapter
- Background job store
- Profile memory store
- Action policy validator
- Azure TTS response path
- STT/captured transcript input path

## Security And Secrets

The agent may use profile preferences and redacted catalog metadata. It must not
send provider credentials, stream URLs, cookies, tokens, private watch history,
or raw transcripts to external research providers. Memories are profile-scoped
and deletable. Provider actions must go through the registry/store and the safe
command schema.

## Proof Required

- Unit tests for intent planning, provider ranking, memory policy, and action
  safety.
- Integration tests for `/api/agent/utterance`, jobs, cancellation, and memory.
- Provider-backed search proof with real connected providers.
- Browser proof for the remote voice affordance and background alert flow.
- Playback proof for exact match, wrong-result stop, and next-candidate flow.
- Secret scan of logs, responses, proof artifacts, and committed files.

## Open Questions

- [ ] Which production STT provider should be used for remote microphone input?
- [ ] Which real metadata/search APIs should be configured for movie, TV, and
  sports research?
- [ ] Should reminders be stored only inside DaveTV or also integrate with an
  external calendar later?
