# Technical Plan: Natural Voice Agent

Status: Draft

## Architecture

Build a real agent pipeline while preserving the existing safe command executor.
The current `/api/ui-command/validate` route becomes a fast-path for simple
commands only. New agent routes handle natural language, provider search,
background jobs, memory, and safe actions.

Flow:

1. TV captures remote voice, receives a typed transcript, or receives a real
   "Hey DaveTV" activation event when the device supports it.
2. API receives transcript via `POST /api/agent/utterance`.
3. Agent orchestrator builds an intent plan from profile context, current UI
   state, provider availability, and memory.
4. Provider search adapter searches the normalized catalog, EPG, series, live,
   and provider-specific sources.
5. If confidence is high and action is safe, the response includes a validated
   action such as `play_item`, `stop_playback`, `open_settings`, or
   `filter_provider`.
6. If ambiguous, the response includes a short clarification prompt.
7. If research is slow, the response returns a background `job_id`; the TV keeps
   playback interactive and later receives a completion alert.
8. Memory store records confirmed preferences and repeated patterns per profile.
9. All UI mutations go through the safe JSON command/action policy.

## Files Expected To Change

- `services/hermes-tv-api/src/index.js`: mount agent routes.
- `services/hermes-tv-api/src/routes/agent.js`: utterance, job, memory routes.
- `services/hermes-tv-api/src/lib/agentOrchestrator.js`: natural language flow.
- `services/hermes-tv-api/src/lib/agentIntentPlanner.js`: intent and confidence.
- `services/hermes-tv-api/src/lib/agentProviderSearch.js`: catalog/provider/EPG
  search.
- `services/hermes-tv-api/src/lib/agentJobs.js`: background research jobs.
- `services/hermes-tv-api/src/lib/agentMemoryStore.js`: profile-scoped memory.
- `services/hermes-tv-api/src/lib/agentConfigStore.js`: profile-scoped
  assistant name, trigger phrase, and trigger support status.
- `services/hermes-tv-api/src/lib/agentActionPolicy.js`: allowed actions and
  confirmation rules.
- `services/hermes-tv-api/test/agent*.test.js`: proof tests.
- `apps/hermes-web-tv/src/api/api.js`: agent API client calls.
- `apps/hermes-web-tv/src/components/FloatingChatbot.jsx`: demote text chat to
  secondary path and route natural utterances to the agent.
- `apps/hermes-web-tv/src/components/VoiceAgentOverlay.jsx`: voice-first
  listening, thinking, alert, and clarification UI.
- `apps/hermes-web-tv/src/App.jsx`: handle agent actions, background job
  completions, wrong-result stop, and instant playback.
- `apps/hermes-web-tv/src/i18n/*.json`: remove canned "try these commands"
  language from primary voice path.
- `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`: document how natural agent
  actions map into validated commands.

## Constraints

- Tizen Chromium 76 compatibility for browser code.
- No production mocks, placeholders, canned fake learning, or fake provider
  search.
- No credential, stream URL, raw transcript, cookie, or token leaks.
- Azure TTS remains the only voice output path.
- STT must be real or unavailable honestly; do not fake microphone recognition.
- Wake phrase support must be real or unavailable honestly; do not fake
  always-on "Hey DaveTV" listening.
- Provider data comes from provider registry/catalog, not static arrays.
- Long research must not freeze playback or remote navigation.

## Contracts

`POST /api/agent/utterance`

Request:

```json
{
  "profile_id": "warren",
  "utterance": "find the Batman movie from 1989",
  "input_mode": "voice",
  "screen_state": {
    "active_view": "home",
    "playing_item_id": null,
    "provider_filter": ["xtremehd", "apollo_group"]
  }
}
```

`GET /api/agent/config/:profile_id`

Response:

```json
{
  "profile_id": "sherri",
  "assistant_name": "DaveTV",
  "trigger_phrase": "Hey DaveTV",
  "trigger_enabled": true,
  "trigger_mode": "remote_button",
  "wake_phrase_supported": false,
  "voice_first": true
}
```

Response:

```json
{
  "status": "action|clarify|background|blocked|empty",
  "spoken_text": "I found Batman from 1989 on Apollo. Playing it now.",
  "confidence": 0.94,
  "actions": [
    {
      "action": "play_item",
      "params": {
        "item_id": "movie.apollo.batman-1989",
        "provider_id": "apollo_group"
      },
      "requires_user_confirm": false
    }
  ],
  "candidates": [],
  "job_id": null,
  "memory_suggestions": []
}
```

Background completion:

```json
{
  "job_id": "job_01",
  "status": "complete",
  "spoken_text": "I found the movie you meant. Watch now or save for later?",
  "actions": [
    { "action": "play_item", "params": { "item_id": "...", "provider_id": "..." } },
    { "action": "save_for_later", "params": { "item_id": "..." } }
  ]
}
```

Memory item:

```json
{
  "memory_id": "mem_01",
  "profile_id": "warren",
  "type": "sports_team",
  "value": "Arizona Cardinals",
  "source": "user_confirmed",
  "created_at": "2026-05-20T00:00:00Z"
}
```

## Tests

- Unit:
  - Intent classification for natural movie/provider/sports/settings requests.
  - Provider ranking and ambiguity detection.
  - Memory write/delete policy.
  - Action policy confirmation rules.
  - Agent config validation and trigger phrase normalization.
- Integration:
  - `/api/agent/utterance` exact match -> play action.
  - Ambiguous request -> clarification.
  - Wrong-result utterance while playing -> stop action + search continuation.
  - Background job create/status/cancel/complete.
  - Memory CRUD per profile.
- Browser/UI:
  - Voice overlay opens immediately from remote voice affordance.
  - User can continue playback while background search runs.
  - Completion alert supports "watch now" and "save for later".
- Live/VPS:
  - Real connected provider search proof.
  - No secrets in logs/proof.

## Rollback

Keep `/api/ui-command/validate` available during migration. A feature flag can
disable `/api/agent/utterance` and route existing command chips back to the old
validator. Do not remove old tests until the new agent proof fully passes.

## Risks

- STT support on Samsung remote may be limited -> accept transcript input first,
  then wire real STT path when verified on device.
- External research can leak private data -> redact aggressively and send only
  generic titles/years/teams, never provider or profile secrets.
- Agent may act too aggressively -> confidence thresholds and action policy
  require clarification or confirmation for uncertain/sensitive actions.
- Background jobs can confuse users -> show lightweight status and completion
  alert without stealing focus from playback.
