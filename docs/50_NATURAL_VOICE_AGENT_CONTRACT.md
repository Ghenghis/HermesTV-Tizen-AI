# 50 - Natural Voice Agent Contract

Status: BINDING
Owner: DaveTV agent lane
Date: 2026-05-20

This is the product contract for DaveTV's voice-first agent. It captures Dave's
actual vision: most family members should be able to press the remote voice
button, speak naturally, and have DaveTV understand, act, search, play, explain,
or remember without forcing them into text chat or menus.

## Core Product Truth

The DaveTV agent is not a hard-coded chatbot. It is the voice control layer for
the TV experience.

The assistant identity is DaveTV. User-facing agent text and speech should not
call itself Hermes.

The existing command table may remain only as a fast-path for simple known
actions. It must not be the main understanding layer, and it must not define
the limits of what the user can say.

## Required User Experience

- Voice is first-class. Text chat is optional and mainly for Dave/admin use.
- The remote voice button should open a listening state immediately.
- The default wake/trigger phrase is "Hey DaveTV" when a real supported
  listening mode is active.
- Users can change the trigger phrase for their profile or disable phrase
  activation entirely.
- DaveTV must not pretend to support always-on wake-word listening unless the
  target TV/browser/platform exposes a real supported capture path and the user
  has opted in.
- The user may speak in normal language, with partial details, corrections,
  follow-ups, and uncertain wording.
- The agent should ask a short clarifying question only when needed.
- If confidence is high and the action is safe, the agent should act directly.
- If the requested movie/channel/show is an exact high-confidence match, DaveTV
  should begin playback automatically.
- If playback starts and the user says it is wrong, playback stops immediately
  and the search/disambiguation continues.
- Long searches run in the background. The user may keep watching something
  else while the agent searches.
- When background search completes, the agent returns with a gentle alert:
  "I found it. Watch now or save for later?"
- The agent can navigate the app, open settings, change allowed settings, open
  provider views, filter providers, show content, start playback, stop playback,
  and save reminders/favorites through validated commands.
- The agent cannot change TV operating-system settings unless a real supported
  Tizen API path exists and the action is explicitly allowlisted.

## Natural Language Scope

The agent must understand requests like:

- "Hey DaveTV, find the Batman movie from 1989."
- "Find the Batman movie from 1989."
- "I think it had Michael Keaton in it."
- "Play the newest Mission Impossible."
- "Find the one with the guy from Top Gun."
- "Show me only Apollo movies."
- "Search XtremeHD and Apollo but skip IPTV-org."
- "What's on for the Cardinals tonight?"
- "Remind Warren when his team plays."
- "This isn't the right one. Stop it and keep looking."
- "Open the place where I change the view."
- "Make this easier for Sherri to see."

Hard-coded exact phrases do not satisfy this requirement.

## Provider Search Requirements

Search must use real catalog/provider data:

- XtremeHD, Apollo Group TV, IPTV-org, and any future provider registered in
  `providerRegistry`.
- Provider-specific filters: one provider, two providers, all providers, or any
  subset selected by the user.
- Movie, series, live channel, catch-up, and EPG search where the provider
  supports those surfaces.
- Provider result identity must include provider id, item id, content type,
  title, year when known, source health if known, and playable status.
- If multiple providers have the same title, the agent should choose the best
  playable source by health/quality/profile preference, or ask if ambiguous.
- No fake provider rows, fake search hits, or demo results are allowed.

## Research Requirements

When local catalog data is insufficient, the agent may research using configured
real metadata/search providers. This can include movie/TV metadata APIs, sports
schedule APIs, or web search tools configured server-side.

Research must never expose provider credentials, stream URLs, cookies, tokens,
or private watch history to third-party search providers.

When research produces a likely target, the agent must map it back to local
provider catalog entries before offering playback. If the content is not
available from a connected provider, the agent must say so honestly and offer to
save the request or keep watching for it later.

## Conversation And Memory

DaveTV should learn per profile:

- Favorite genres, actors, teams, channels, providers, and languages.
- Repeated watch/search patterns.
- Preferred providers and quality choices.
- Accessibility preferences and pacing.
- Reminders the user accepts.

Memory must be transparent and controllable:

- Store memories per profile, not globally.
- Do not store raw transcripts by default.
- Store compact facts/events such as `likes_team: Arizona Cardinals` only after
  explicit user confirmation or repeated observed pattern.
- Provide "forget this", "forget my sports preferences", and admin reset paths.
- Never store credentials, stream URLs, or secrets as memory.

## Speed Requirements

The voice path should feel immediate:

- Open/listening visual response: under 300 ms from button press.
- First acknowledgement for network-backed requests: under 1 second when online.
- Local catalog search response: target under 500 ms after transcript.
- Playback handoff after high-confidence match: target under 1 second after
  decision, excluding provider stream startup.
- Background research starts without blocking current playback.

If the full answer will take longer, acknowledge quickly and continue in the
background.

## Architecture Contract

The production design must separate these layers:

1. Voice capture: remote/app captures speech or transcript.
2. Speech-to-text: real configured STT path or honest unavailable state.
3. Agent orchestrator: plans, clarifies, searches, chooses actions.
4. Provider search: real provider registry/catalog/EPG/metadata search.
5. Research jobs: background external research with safe redaction.
6. Memory: per-profile preference and reminder store.
7. Command execution: validated JSON actions from `docs/06`.
8. Voice response: Azure TTS output only.

Agent configuration is profile-scoped:

```json
{
  "profile_id": "warren",
  "assistant_name": "DaveTV",
  "trigger_phrase": "Hey DaveTV",
  "trigger_enabled": true,
  "trigger_mode": "remote_button|active_listening|unsupported",
  "voice_first": true
}
```

The current `/api/ui-command/validate` route can become the fast-path parser,
but it cannot remain the only agent route.

Required new route family:

- `POST /api/agent/utterance`
- `GET /api/agent/config/:profile_id`
- `PATCH /api/agent/config/:profile_id`
- `POST /api/agent/jobs/:job_id/cancel`
- `GET /api/agent/jobs/:job_id`
- `GET /api/agent/memory/:profile_id`
- `PATCH /api/agent/memory/:profile_id`
- `DELETE /api/agent/memory/:profile_id/:memory_id`

## Action Policy

Safe direct actions:

- Search local catalog.
- Open provider/content views.
- Start playback on high-confidence playable match.
- Stop playback when user says it is wrong or asks to stop.
- Open settings/view picker/help.
- Apply non-sensitive display filters.
- Save non-sensitive reminders/favorites after confirmation where needed.

Confirmation required:

- Account/admin changes.
- Parental controls.
- Deleting memories/reminders/favorites.
- Any paid/purchase/install action.
- Any external app launch that leaves DaveTV.
- Any provider enable/disable action.

Blocked unless a real platform integration exists:

- Changing TV OS settings.
- Installing apps.
- Reading arbitrary TV/device data outside DaveTV.
- Sending private provider or profile data to external research.

## Anti-Patterns

- Do not respond only with "try these commands."
- Do not require exact phrases.
- Do not use canned robotic repetition for every reply.
- Do not show fake results while searching.
- Do not fake "learning" by hard-coding Warren, Dave, or Sherri preferences.
- Do not use text chat as the primary path for family users.
- Do not block the TV while long research runs.
- Do not start a different movie silently after the user says the first was
  wrong; ask or explain the next candidate.

## Proof Required

This feature is complete only when all proof passes:

- Unit tests for intent planning, provider ranking, memory policy, and action
  safety.
- Integration tests for `/api/agent/utterance`, background jobs, and memory.
- Provider-backed search proof with real configured providers.
- Browser proof that the remote voice affordance opens listening state quickly.
- Playback proof for high-confidence "find and play" request.
- Wrong-result proof: user rejection stops playback and resumes search.
- Background proof: user can keep watching while search continues.
- Secret scan proving no provider URLs/credentials/transcripts leak.

Until then, call it "planned" or "partial", not complete.
