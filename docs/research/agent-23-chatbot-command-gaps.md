# Lane 10 — Chatbot Command Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Files:** FloatingChatbot.jsx, uiCommand.js (POST /api/ui-command/validate)

---

## Summary

The chatbot has good UI states (minimized, compact, expanded, walkie-talkie), credential rejection, history display, and walkie-talkie placeholder. The primary gap is that the chatbot does NOT call POST /api/ui-command/validate — it builds its own command envelope internally and submits to a generic `hermesApi.submitCommand`. The 15 UI commands in uiCommand.js are therefore not wired to the chatbot, and chatbot responses do not actually mutate app state.

---

## Command Routing Audit

### What the chatbot does

1. User types text
2. Credential guard check (password, credential, token, api_key, secret)
3. Builds command envelope: `{ action: 'show_notification', payload: { message: text } }`
4. Validates envelope via local `validateCommand()` (CommandValidator.jsx)
5. Records in commandStore
6. Calls `hermesApi.submitCommand(envelope)` (or mock ACK if offline)
7. Shows agent response: "Hermes received your message."

### What the chatbot does NOT do

1. Parse free-text to match the 15 known commands
2. Call POST /api/ui-command/validate to get the resolved action
3. Apply the resolved action to app state (no callback from App.jsx)

**Result:** Typing "show movies" in the chatbot sends `{ action: 'show_notification', payload: { message: 'show movies' } }` to the server. The catalog filter does NOT change.

---

## 15 Commands Wired Up?

| Command | Pattern in uiCommand.js | Connected to chatbot | App state effect |
|---|---|---|---|
| show apollo | DEFINED | NO — chatbot ignores | Content filter unchanged |
| show xtremehd | DEFINED | NO | — |
| show all providers | DEFINED | NO | — |
| show movies | DEFINED | NO | — |
| show series | DEFINED | NO | — |
| show live / live channels | DEFINED | NO | — |
| show 4k / 4k only | DEFINED | NO | — |
| mom mode / sherri mode | DEFINED | NO | — |
| dave mode | DEFINED | NO | — |
| bigger tiles / large tiles | DEFINED | NO | — |
| dark theme / dark mode | DEFINED | NO | — |
| premium theme / cinema theme | DEFINED | NO | — |
| low memory mode / performance mode | DEFINED | NO | — |
| what is this | DEFINED | NO | — |
| find more with this actor | DEFINED | NO | — |

**Summary: 0 of 15 commands are wired to app state.**

---

## Audio Feedback When mom_mode Active

| Check | Result |
|---|---|
| audio_feedback=true in mom_tv profile | PASS — profile has audio_feedback: true |
| TTS called on chatbot response | NOT IMPLEMENTED — chatbot does not call /api/tts |
| Sound or TTS on mom mode | NOT IMPLEMENTED |

No audio feedback path exists in the chatbot for B2. The walkie-talkie mode shows "Listening... (mock mode — Azure TTS only)" which correctly acknowledges this is a placeholder.

---

## Credential Rejection

| Check | Result |
|---|---|
| Blocks "password" | PASS |
| Blocks "credential" | PASS |
| Blocks "token" | PASS |
| Blocks "api_key" | PASS |
| Blocks "secret" | PASS |
| Shows error message | PASS — "Credential input is not accepted. Please use the QR onboarding flow." |
| Does NOT call server | PASS — returns before any network call |

---

## Transcript/History Display

| Check | Result |
|---|---|
| Full history shown in expanded state | PASS — scrollable history list |
| Last 2 messages shown in compact state | PASS — `lastTwo = history.slice(-2)` |
| Submitting indicator | PASS — "Hermes is thinking..." shown while awaiting |
| Error text shown | PASS — red error panel above input |
| History preserved across state changes | PASS — state in React.useState |

---

## Walkie-Talkie Mode

| Check | Result |
|---|---|
| Push-to-talk button exists | PARTIAL — there is a microphone icon circle (decorative) and a "Switch to text" button, but no actual push-to-talk button that records audio |
| Mode switch from expanded | PASS — microphone icon button in header switches to walkie-talkie state |
| Mode accessible | PASS — autoFocus on "Switch to text" button |
| Mic label | "Listening... (mock mode — Azure TTS only)" — correct placeholder |

No actual push-to-talk event is wired to Samsung mic or Web Audio API in B2.

---

## Required Fixes for B2 Completion

### FIX-CHATBOT-01: Wire chatbot to POST /api/ui-command/validate
**Priority:** P1
The chatbot should, after the credential check, call `hermesApi.validateCommand({ command_text: text, profile_id: profileId })` and receive `{ valid, action, params }`. If valid, the action+params should be dispatched to the parent App.jsx via a callback prop (e.g., `props.onCommand`).

App.jsx should accept an `onCommand` prop on FloatingChatbot:
```jsx
<FloatingChatbot profile={profile} online={state.online} onCommand={handleChatbotCommand} />
```

Where `handleChatbotCommand({ action, params })` applies the resolved action to app state.

### FIX-CHATBOT-02: Add hermesApi.validateCommand method
**Priority:** P1
Add to hermesApi.js:
```js
export function validateCommand(payload) {
  return apiFetch('/api/ui-command/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
```

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| Chatbot does not call /api/ui-command/validate | P1 | 15 commands all non-functional |
| Chatbot responses don't mutate app state | P1 | Commands have no effect |
| Audio feedback not implemented | P2 | Mom mode TTS on response needed in B3 |
| Push-to-talk is decorative | P2 | Real mic capture in B3 |
| Agent response is generic ("received your message") | P2 | Should echo resolved action |
