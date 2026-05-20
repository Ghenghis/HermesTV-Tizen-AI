# Task Breakdown: Natural Voice Agent

Status: In Progress

## Tasks

- [ ] T001: Audit and freeze current command/chat limitations.
  - Files: `services/hermes-tv-api/src/routes/uiCommand.js`,
    `apps/hermes-web-tv/src/components/FloatingChatbot.jsx`,
    `apps/hermes-web-tv/src/utils/commandMatchers.js`,
    `apps/hermes-web-tv/src/i18n/en.json`
  - Proof: Markdown audit with exact file/line evidence and no code changes.

- [x] T002: Add backend agent route skeleton with honest unavailable states.
  - Files: `services/hermes-tv-api/src/routes/agent.js`,
    `services/hermes-tv-api/src/index.js`,
    `services/hermes-tv-api/test/agent.route.test.js`
  - Proof: `node services/hermes-tv-api/test/agent.route.test.js` -> 13 PASS,
    0 FAIL. Route tests show real validation, no fake provider/search results,
    and no raw utterance echo.

- [ ] T003: Implement profile-scoped memory store.
  - Files: `services/hermes-tv-api/src/lib/agentMemoryStore.js`,
    `services/hermes-tv-api/test/agentMemoryStore.test.js`
  - Proof: CRUD tests, restart survival test, secret scan.

- [x] T004: Implement profile-scoped agent config store.
  - Files: `services/hermes-tv-api/src/lib/agentConfigStore.js`,
    `services/hermes-tv-api/test/agentConfigStore.test.js`,
    `services/hermes-tv-api/src/routes/agent.js`
  - Proof: `node services/hermes-tv-api/test/agentConfigStore.test.js` ->
    14 PASS, 0 FAIL. Default assistant is DaveTV, default trigger phrase is
    "Hey DaveTV", users can change/disable it, unsupported wake phrase states
    are honest.

- [x] T005: Implement provider catalog search adapter.
  - Files: `services/hermes-tv-api/src/lib/agentProviderSearch.js`,
    catalog/provider modules as needed,
    `services/hermes-tv-api/test/agentProviderSearch.test.js`
  - Proof: `node services/hermes-tv-api/test/agentProviderSearch.test.js` ->
    7 PASS, 0 FAIL. Searches the real merged/provider catalog shape, supports
    provider filtering, strips unsafe media URLs, and returns honest empty
    candidates when no provider item matches.

- [ ] T006: Implement intent planner and confidence model.
  - Files: `services/hermes-tv-api/src/lib/agentIntentPlanner.js`,
    `services/hermes-tv-api/test/agentIntentPlanner.test.js`
  - Proof: natural utterance tests for movies, providers, sports, settings,
    wrong-result correction, and ambiguity.

- [ ] T007: Implement action policy and safe command mapping.
  - Files: `services/hermes-tv-api/src/lib/agentActionPolicy.js`,
    `schemas/commands/*.json`, `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`
  - Proof: sensitive actions require confirmation; blocked actions are rejected.

- [ ] T008: Implement `/api/agent/utterance` orchestration.
  - Files: `services/hermes-tv-api/src/lib/agentOrchestrator.js`,
    `services/hermes-tv-api/src/routes/agent.js`,
    `services/hermes-tv-api/test/agentOrchestrator.test.js`
  - Proof: exact match -> play action, ambiguity -> clarify, unavailable ->
    honest empty/blocked state.

- [ ] T009: Implement background research job store.
  - Files: `services/hermes-tv-api/src/lib/agentJobs.js`,
    `services/hermes-tv-api/src/routes/agent.js`,
    `services/hermes-tv-api/test/agentJobs.test.js`
  - Proof: create/status/cancel/complete tests; playback not blocked.

- [ ] T010: Wire web app agent API client.
  - Files: `apps/hermes-web-tv/src/api/api.js`,
    `apps/hermes-web-tv/src/api/agentClient.js`
  - Proof: web build and API client tests if available.

- [ ] T011: Build voice-first overlay and secondary chat routing.
  - Files: `apps/hermes-web-tv/src/components/VoiceAgentOverlay.jsx`,
    `apps/hermes-web-tv/src/components/FloatingChatbot.jsx`,
    `apps/hermes-web-tv/src/i18n/en.json`
  - Proof: Playwright screenshot/proof that voice affordance opens listening
    state, identifies as DaveTV, and text chat is secondary.

- [ ] T012: Wire trigger phrase settings UI.
  - Files: `apps/hermes-web-tv/src/components/settings/VoiceSettings.jsx`,
    `apps/hermes-web-tv/src/api/agentClient.js`
  - Proof: user can change/disable "Hey DaveTV"; unsupported always-listening
    state is shown honestly.

- [ ] T013: Wire instant playback and wrong-result correction.
  - Files: `apps/hermes-web-tv/src/App.jsx`,
    player components as needed
  - Proof: browser test: "find Batman 1989" starts playback; "wrong one" stops
    playback and resumes search flow.

- [ ] T014: Wire background completion alerts.
  - Files: `apps/hermes-web-tv/src/App.jsx`,
    `apps/hermes-web-tv/src/components/VoiceAgentOverlay.jsx`
  - Proof: browser test: user keeps watching during job, completion alert offers
    "watch now" and "save for later".

- [ ] T015: Add memory UI/admin controls.
  - Files: settings/profile/admin components, API routes
  - Proof: user can inspect and delete learned profile preferences.

- [ ] T016: Add real STT integration plan/proof.
  - Files: Tizen/native voice capture path, API STT route/config docs
  - Proof: real microphone/STT proof on supported device or explicit blocked
    status if Samsung remote/browser cannot expose audio capture.

- [ ] T017: Live provider E2E proof.
  - Files: proof docs and tools only unless bugs are found
  - Proof: real provider search -> play -> wrong-result stop -> background
    follow-up, with secret scan clean.

## Integration Order

1. Audit current limitations.
2. Backend route, memory, provider search, planner, policy.
3. Orchestrator and background jobs.
4. Web API client and voice overlay.
5. Playback/wrong-result/background UX.
6. Real STT and live provider proof.

## Required Final Proof

```bash
npm test --prefix services/hermes-tv-api
npm run build --prefix apps/hermes-web-tv
node tools/test-provider-e2e.js
```

Plus browser/TV proof for voice overlay, instant playback, wrong-result stop,
and background completion.

## Blockers

- Production STT provider/device capture path - owner: agent + real TV
- Real metadata/search API credentials - owner: Dave/VPS secret
- Live provider credentials and reachable provider catalog - owner: Dave/VPS
- Real Samsung remote voice button behavior - owner: real TV
