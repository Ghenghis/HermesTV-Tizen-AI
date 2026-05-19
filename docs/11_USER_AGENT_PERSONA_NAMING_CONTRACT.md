# DaveTV — Doc 11: User & Agent Persona Naming Contract

**Version:** 1.1.0  
**Branch:** research/sota-features-may2026  
**Applies to:** QN85Q7FAAFXZA (`mom_tv` — Sherri — enhanced tier) · UN55CU8000BXZA (`dave_tv` — Dave — baseline tier)  
**Status:** BINDING — agents must address users by their chosen display name at all times  
**Cross-references:** `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` (agent command constraints); `docs/05_THEME_BACKGROUND_ENGINE_CONTRACT.md` (renderer tier rules)

---

## 1. Purpose

This contract defines:
- The named user profiles for both household members (Sherri and Dave)
- How users customize their display name and agent name
- How agents (Hermes AI) address users personally in all interactions
- The profile JSON schema
- Profile switching, storage, and privacy rules
- Voice TTS name pronunciation

---

## 2. Household User Profiles

| Field | Sherri's TV | Dave's TV |
|---|---|---|
| **Profile ID** | `mom_tv` | `dave_tv` |
| **Display Name** | Sherri | Dave |
| **Device** | QN85Q7FAAFXZA | UN55CU8000BXZA |
| **Performance Tier** | Enhanced (QN-prefix) — never artificially capped by agents | Baseline (UN-prefix) — software caps apply; agents cannot upgrade above baseline |
| **Default Agent Name** | Hermes | Hermes |
| **Default Agent Voice** | Azure `en-US-AriaNeural` | Azure `en-US-GuyNeural` |
| **Default Theme** | Cinema Dark | Standard Dark |
| **Default Layout** | Layout 09 (Spotlight) | Layout 01 (Grid Standard) |
| **Mom Mode** | ON — font scale ≥ 1.25 (floor), reduced motion locked ON, audio feedback locked ON | OFF |

Both users can change their display name and agent name to anything they want. Changes take effect immediately without restart.

> **Critical tier rule (binding):** Mom's TV (`QN85Q7FAAFXZA`, profile `mom_tv`) is a QN-class enhanced-tier device. Agents must never artificially cap, downgrade, or limit its performance tier. This mirrors the non-negotiable rule in `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` § "QN vs UN tier rule". Dave's TV (`UN55CU8000BXZA`, profile `dave_tv`) stays at baseline — agents cannot upgrade it above baseline.

---

## 3. User Name Rules

1. Agents always address the user by their chosen `display_name` — never "Mom", "User", "Viewer", or "Customer".
2. If `display_name` has not been set, it defaults to the profile's initial value ("Sherri" or "Dave").
3. The display name is used in: AI greetings, action card text, TTS speech, settings headers, and the profile switcher.
4. Display name is per-profile — changing Sherri's name does not affect Dave's profile.
5. Maximum 20 characters. Letters, numbers, spaces, hyphens, apostrophes allowed.

**Example greeting using display name:**
```
Good evening, Sherri — here's what's on tonight.
Hey Dave, you left off at S2E4 of Fallout. Want to continue?
```

---

## 4. Agent Naming Rules

1. The default AI agent name is **Hermes**.
2. Each user profile stores its own preferred agent name. Sherri might rename it to "Nova"; Dave keeps "Hermes".
3. The agent name is used in: chatbot header, TTS self-introduction, action card source attribution, settings page.
4. A small `[AI]` badge always appears next to the agent name in the chatbot header — the agent's nature is always disclosed regardless of what name is chosen.
5. The agent never claims to be human or denies being an AI assistant.
6. Maximum 20 characters. Same character rules as display name.

**Examples:**
- Chatbot header: `Nova  [AI]` (Sherri's choice)
- Action card: `Hermes suggests: Switch to Cinema mode` (Dave's choice)
- TTS introduction: `"Hi Sherri, I'm Nova. How can I help?"`

---

## 5. Profile JSON Schema

Each profile is stored as a JSON file at `tizen://wgt-private/profiles/{profile_id}.json`.

**Profile IDs are fixed:**
- Sherri's profile: `"profile_id": "mom_tv"`
- Dave's profile: `"profile_id": "dave_tv"`

These IDs must match exactly in all JSON commands (doc 06 envelope `target.profile_id`), Redis keys, Mem0 scoping, and API headers. Using any other string (e.g. `"sherri"`, `"dave"`, `"user1"`) is invalid and will be rejected by the router.

```json
{
  "profile_id": "mom_tv",
  "device_id": "QN85Q7FAAFXZA-DUID-XXXXXX",
  "display_name": "Sherri",
  "agent_name": "Nova",
  "agent_voice": "en-US-AriaNeural",
  "agent_voice_engine": "azure",
  "agent_voice_speed": 0.85,
  "agent_personality": "warm_tv_companion",
  "agent_name_phoneme_ipa": "ˈnɒvə",
  "avatar": "✨",
  "pin": null,
  "ui_preferences": {
    "layout_id": "layout_09",
    "theme_id": "cinema_dark",
    "font_scale": 1.4,
    "animation_speed": 0.7,
    "focus_ring_style": "glow",
    "card_shape": "rounded",
    "chatbot_position": "bottom",
    "safe_area_pct": 5
  },
  "accessibility": {
    "mom_mode": true,
    "high_contrast": false,
    "reduced_motion": true,
    "audio_feedback": true,
    "captions_default": true,
    "caption_language": "eng"
  },
  "content_preferences": {
    "preferred_genres": ["Drama", "Documentary", "Nature"],
    "default_audio_language": "eng",
    "parental_rating_max": null
  },
  "favorites": [],
  "watch_history": [],
  "memory_context": {
    "mem0_user_id": "mom_tv-xxxxxxxx",
    "anchors": [
      "Sherri prefers Cinema Dark theme in the evening",
      "Sherri likes nature documentaries on weekends"
    ]
  },
  "created_at": "2026-05-17T00:00:00Z",
  "updated_at": "2026-05-17T22:00:00Z"
}
```

Dave's profile follows the same schema with `"profile_id": "dave_tv"`, `display_name: "Dave"`, `agent_name: "Hermes"`, `agent_voice: "en-US-GuyNeural"`, `mom_mode: false`, `reduced_motion: false`, `audio_feedback: false`, `font_scale: 1.0`.

**`agent_personality` values (binding):**
| Value | Behavior |
|---|---|
| `warm_tv_companion` | Warm, personal, TV-distance readable phrasing; short sentences; never robotic or technical; always addresses user by first name |
| `standard` | Friendly but more concise; still personal; used for Dave's profile by default |

Raw values like `"friendly"` are not valid. All implementations must use one of the enum values above.

---

## 6. Profile Switcher UI

The profile selector appears:
- On first launch (always)
- When the user presses the **Profile** button in the home navigation bar
- When the **Back** button is long-pressed from the home screen (1.5s)

### Layout
- Full-screen overlay, centered vertically in bottom 60% of screen
- 2-column grid of profile tiles (max 4 profiles total)
- Each tile: 200 × 240 px — 160 px avatar (emoji, large) — 28 px display name below
- Auto-focus: last-used profile on that device
- D-pad: left/right/up/down between profiles; OK to select

### Fast Switching (no PIN)
- Selecting a profile immediately applies it — no re-login required
- Profile change emits `profile:updated` event — all UI components respond within 100ms

### PIN-Protected Profiles
- Optional 4-digit PIN per profile (stored as SHA-256 hash with device salt)
- If PIN set: after profile selection, show 4-dot PIN entry overlay before switching
- If PIN forgotten: only recoverable by deleting and recreating the profile (no cloud recovery)
- Dave's profile may optionally set a PIN; Sherri's profile may optionally set a PIN — independent

### Guest Mode
- A "Guest" tile appears at end of profile grid (smaller tile, grey styling)
- Guest uses `sessionStorage` only — watch history and settings cleared on app close
- Guest cannot access watch history, favorites, or AI memory from named profiles

---

## 7. Name Change Flow (Settings)

> **Agent command schema rule (binding):** All profile mutations — including display name changes and agent name changes — that are triggered by an AI agent must go through the safe JSON command schema defined in `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`. Agents cannot call `profileStore.update()` directly, mutate `localStorage` directly, or issue raw JavaScript. Only the Settings UI (triggered by direct user action via the remote) may call `profileStore.update()` directly, because in that path the user — not an agent — is the initiator. The action `update_agent_name` in the doc 06 command router handles agent-initiated renames.

**Settings > Profile > Display Name (user-initiated):**
1. Current name shown in text input field (Samsung IME auto-opens)
2. `autocapitalize="words"`, `enterkeyhint="done"`, max 20 chars
3. Confirming (Enter/Done) calls `profileStore.update({ display_name: newName })` — user-direct path, not agent-commanded
4. `profile:updated` event propagates — chatbot header, greeting overlay, action cards update live
5. TTS proxy notified: next greeting uses new name with correct pronunciation

**Agent-initiated display name / agent name change:**
- The agent emits an `update_agent_name` or `update_display_name` command via the doc 06 envelope with `target.profile_id` set to `mom_tv` or `dave_tv`
- The router validates, confirms with the user (confirm card), applies the change, and writes to the audit ledger
- The agent never writes to the profile store directly

**Settings > AI > Agent Name (user-initiated):**
1. Current agent name shown in text input (same IME pattern)
2. Preview: a short TTS clip plays immediately — "Hi [name], ready to help" — using current voice
3. Confirm to save; calls `profileStore.update({ agent_name: newName })` — user-direct path

**Settings > AI > Agent Voice:**
1. Grid of available **Azure** voices only (female/male/neutral groupings) — see section 8A for the forbidden list
2. D-pad selects; each focus plays a 3-second TTS sample via Azure
3. Confirming applies the voice to all future TTS output for this profile
4. Voice ID stored in profile JSON as `agent_voice`; `agent_voice_engine` is always `"azure"` and is not user-editable

---

## 8A. TTS Engine Constraint (binding)

**Azure TTS is the ONLY permitted voice output engine for this project. No exceptions.**

| Engine | Status |
|---|---|
| Azure Cognitive Services TTS (via VPS Pipelines proxy) | **REQUIRED — sole permitted engine** |
| Bixby AI voice / Samsung AI voice / Bixby TTS | **FORBIDDEN** — must never be invoked for AI responses, agent speech, or any TTS output |
| Samsung on-device TTS (any Samsung-native path) | **FORBIDDEN** — not permitted for agent/AI voice |
| Web Speech API (`SpeechSynthesis`) | **FORBIDDEN** — not permitted for agent/AI voice |
| Any other third-party TTS engine | **FORBIDDEN** |

Samsung microphone (`SpeechRecognition` / Bixby mic hardware) may be used for **input capture only** — capturing the user's spoken query. Samsung mic input may be transcribed and forwarded to the backend for processing. Bixby/Samsung AI must never be used to generate or speak any AI response.

**Azure TTS fallback behavior (if Azure is unavailable):**
1. The VPS Pipelines proxy retries the Azure endpoint up to 3 times with exponential backoff (500 ms, 1 s, 2 s).
2. If all retries fail, the agent's response is delivered as **text only** — displayed in the chatbot overlay / action card. No audio plays.
3. The chatbot overlay shows a muted-speaker icon and the message: "[Display name], I can't reach my voice right now — here's what I'd say: [text]."
4. No fallback TTS engine is substituted. Silent text delivery is the only fallback.
5. The VPS proxy logs the failure with timestamp, Azure error code, and profile ID. It retries the connection health check every 30 seconds and resumes audio when Azure is reachable again.
6. Agents must not surface Azure API errors in raw form — always translate to the user-friendly text fallback message above.

---

## 8. TTS Name Pronunciation

Azure TTS receives agent name and user display name with SSML pronunciation hints:

```xml
<speak>
  <voice name="en-US-AriaNeural">
    Hi <say-as interpret-as="name">Sherri</say-as>,
    I'm <phoneme alphabet="ipa" ph="ˈnɒvə">Nova</phoneme>.
    How can I help?
  </voice>
</speak>
```

For unusual names: IPA phoneme is generated by the VPS Pipelines layer using a phoneme-lookup service and stored in `agent_name_phoneme_ipa`. Falls back to `say-as interpret-as="name"` if no phoneme on record.

Azure TTS custom lexicon on VPS is updated within 15 minutes of a name change. In-flight TTS requests use inline phoneme fallback.

---

## 9. Agent Addressing in All UI Contexts

| Context | Example (Sherri, agent = Nova) |
|---|---|
| Home screen greeting | "Good evening, Sherri — here's what's on" |
| Action card | "Nova suggests: Switch to Cinema mode" |
| Action card confirmation | "Nova switched your theme to Cinema Dark" |
| Settings header | "Nova  [AI]" |
| Error message | "Nova couldn't reach the server — try again?" |
| Resume prompt | "Sherri, you left off at 43:12 in Fallout" |
| Proactive nudge | "Sherri, a new Nature documentary is available" |
| Voice TTS greeting | "Hi Sherri, I'm Nova. How can I help?" |
| TTS action result | "Done, Sherri — switched to Cinema mode" |

Agents must never use generic terms like "User", "Viewer", "you" (in formal context), or "Mom" when the display name is available.

---

## 9A. Mom Mode Constraints (binding)

Mom Mode applies exclusively to profile `mom_tv` (Sherri's TV, `QN85Q7FAAFXZA`). The following constraints are enforced by the doc 06 router and must also be respected by any code path that writes profile state:

| Constraint | Rule |
|---|---|
| Font scale floor | `font_scale` must always be ≥ 1.25. Agents cannot set it lower. The UI settings slider minimum for `mom_tv` is 1.25 (not 1.0). |
| Reduced motion | `reduced_motion` is locked ON while `mom_mode: true`. Agents cannot set `reduced_motion: false` for `mom_tv` without `requires_user_confirm: true` AND a verbal confirmation step (voice confirm token). |
| Audio feedback | `audio_feedback` is locked ON while `mom_mode: true`. Agents cannot disable it without `requires_user_confirm: true` AND verbal confirmation. |
| Confirm card timeout | Any agent confirm card shown to `mom_tv` uses a 10 s timeout (not the 5 s default). |
| Confirm card font | Any agent confirm card shown to `mom_tv` uses font scale ≥ 1.35. |
| Mom Mode disable | Only `agent-20-accessibility` may emit `disable_mom_mode` for `mom_tv`, and only with a valid `voice_confirm_token` issued within the last 60 s. All other agents are rejected. |
| Performance tier | `mom_tv` is a QN-class enhanced-tier device. Agents must never emit any command that permanently downgrades its performance. See section 2 and `docs/06` § "QN vs UN tier rule". |

These rules are additive to the profile isolation rules in section 10. Violating any constraint is a policy rejection (`result: "rejected_policy"`) in the command router.

---

## 10. Profile Isolation Rules

1. Sherri's profile data (watch history, favorites, memories, settings) is never accessible from Dave's profile and vice versa.
2. Every API call to the VPS backend includes `profile_id` and `device_id` in the request header.
3. Mem0 queries are always scoped to `user_id = profile.mem0_user_id` — cross-profile memory contamination is forbidden.
4. Redis keys for profile data always include `{profile_id}:` prefix.
5. If a profile is switched mid-session, all in-flight API requests from the old profile are cancelled.
6. The AI agent cannot read or reference the other user's memories, preferences, or watch history.

---

## 11. Storage Architecture

| Data | Location | Notes |
|---|---|---|
| Full profile JSON | `tizen://wgt-private/profiles/{id}.json` | App-sandboxed, no 5MB cap |
| Active profile ID | `localStorage` key `hermes:active_profile` | Persists across app restarts |
| Last switch timestamp | `localStorage` key `hermes:last_switch` | For session continuity |
| Device ID | `localStorage` key `hermes:device_id` | Derived from `getDuid()` |
| Session token | `sessionStorage` | Cleared on app close |
| Profile hot cache | Redis VPS `profile:{device_id}:{profile_id}` | 1h TTL |
| AI agent memory | Mem0 VPS, keyed by `mem0_user_id` | Long-term, profile-scoped |
| Watch history | On-device only | Never sent to cloud |
| Favorites | On-device only | Never sent to cloud |

**Export/Import:** Users can export their profile to a USB drive as `hermes-profile-sherri.json`. Import validates schema, resets PIN hash (PIN is not exported), merges watch history with device's existing data.

---

## 12. Proof Gates

| Gate | Requirement |
|---|---|
| PROFILE-GATE-01 | Profile switcher renders on app launch with Sherri and Dave tiles |
| PROFILE-GATE-02 | Selecting a profile applies it within 100ms (theme, layout, agent name, font scale) |
| PROFILE-GATE-03 | Changing display name updates chatbot header and action cards without restart |
| PROFILE-GATE-04 | Changing agent name plays TTS preview immediately |
| PROFILE-GATE-05 | TTS uses correct Azure voice per profile (Sherri ≠ Dave voice) |
| PROFILE-GATE-06 | Agent addresses user by display name in all 8 UI contexts listed in section 9 |
| PROFILE-GATE-07 | Profile A watch history is inaccessible from Profile B |
| PROFILE-GATE-08 | PIN protection works: wrong PIN = rejected; correct PIN = profile loaded |
| PROFILE-GATE-09 | Guest mode clears all data on app close |
| PROFILE-GATE-10 | Profile JSON exports and re-imports correctly; PIN is stripped from export |
| PROFILE-GATE-11 | All TTS output routes exclusively through Azure — any request to Bixby AI, Samsung TTS, or Web Speech API is blocked at the VPS proxy layer; proof: proxy access log shows zero calls to non-Azure endpoints |
| PROFILE-GATE-12 | Azure TTS unavailable scenario: agent response appears as text-only with muted-speaker icon; no fallback engine is invoked; audio resumes automatically when Azure recovers |
| PROFILE-GATE-13 | Agent-initiated agent name rename goes through the `update_agent_name` doc 06 command with audit ledger entry; direct `profileStore.update()` from an agent path is rejected |
| PROFILE-GATE-14 | `mom_tv` font scale cannot be set below 1.25 via any agent command — router returns `rejected_policy`; proof: `proof/agent-commands/tests/mom-font-floor/*.json` |
| PROFILE-GATE-15 | `mom_tv` `reduced_motion` and `audio_feedback` cannot be disabled without verbal confirm token — router rejects without it; proof: `proof/agent-commands/tests/mom-mode-lock/*.json` |
| PROFILE-GATE-16 | QN non-limiting: no agent command can permanently downgrade `mom_tv` tier; each attempt returns `rejected_policy`; proof: `proof/agent-commands/tests/qn-non-limiting/*.json` |

_(Rebranded HermesTV → DaveTV 2026-05-19 per user request; "Hermes" the default bot persona name is unchanged — it remains the agent character and stays per-profile renameable. Technical identifiers, localStorage keys, and Redis prefixes unchanged.)_
