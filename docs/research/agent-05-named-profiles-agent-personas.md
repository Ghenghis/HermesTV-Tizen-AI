# Agent 05 — Named Profiles and AI Agent Personas

**Project:** HermesTV-Tizen-AI  
**Report date:** 2026-05-17  
**Target TVs:** Mom `QN85Q7FAAFXZA` (QLED 85") · Dave `UN55CU8000BXZA` (Crystal UHD 55")  
**Scope:** Named user profile systems, AI persona customization, personalized greetings, profile data schema, local-first storage, quick name change UX

---

## Executive Summary

This report covers six research areas needed before implementing the HermesTV profile and agent-persona system. The two users are Sherri ("Mom TV") and Dave ("Dave TV"). Each user can choose their own display name and can rename the Hermes AI agent — Sherri may call it "Nova", Dave keeps "Hermes". All patterns are filtered for D-pad remote control usability on Samsung Tizen (web app shell).

Key findings:
- The "Who's Watching" full-screen profile grid is industry standard and works well for D-pad navigation.
- Per-profile data should be stored in a JSON file via `tizen.filesystem` (not localStorage, which is capped at 5 MB for the whole app).
- Agent custom names are fully viable and increase user attachment; SSML `<say-as interpret-as="name">` plus an optional custom lexicon phoneme entry ensures correct TTS pronunciation.
- Mem0 + Redis is the right backend stack for agent memory scoped by `user_id`; on-device localStorage holds only the lightweight profile shell (name, agent_name, avatar, preferences).
- Profile data must never be cross-pollinated between TVs or profiles — every read/write path is gated by `profile_id`.

---

## 1. Named Profile Systems on TV Apps — Industry Patterns

### 1.1 The "Who's Watching" Screen

Every major streaming service (Netflix, Disney+, Apple TV+, Plex, Jellyfin) converges on the same pattern:

| Element | Netflix (2025) | Disney+ | Apple tvOS 26 | Plex Home | HermesTV Target |
|---|---|---|---|---|---|
| Layout | Horizontal row, bottom of screen | Full-screen grid 2×2 | Full-screen grid, circular avatars | Full-screen list | Full-screen 2-column grid |
| Avatar size | 120–160 px (logical) | 140 px | 120 px circular | 120 px | 160 px (TV-distance-safe) |
| Name below avatar | Yes, 24–28 px | Yes, 22 px | Yes, system font | Yes | Yes, 28 px minimum |
| Focus ring | White rounded rect border | Glow/scale | White circle border | White border | Custom theme-colored ring |
| D-pad traversal | Left/Right on row | 4-direction grid | 4-direction grid | Up/Down list | 4-direction grid |
| Initial focus | Last-used profile | First profile | First profile | First profile | Last-used profile |
| Confirm action | OK/Select | OK/Select | Click | OK/Select | OK/Select |
| Back button | Exit app | Exit app | Exit app | Exit app | Exit app (or screensaver) |

**Netflix 2025 repositioning:** Netflix moved profile selection to the bottom of the screen because "the natural interaction zone toward the bottom" reduces arm travel on remotes and follows muscle memory. HermesTV should adopt this: profile grid anchored to the lower third of the screen, content/logo fills the upper area.

### 1.2 Profile Name Display During Playback

- Netflix, Disney+: current profile name NOT shown during playback (avoids distraction).
- Plex: optional "Now Playing as [Name]" in the info overlay.
- Apple TV+: profile shown only in account menu.

**HermesTV recommendation:** Display profile name only in the chatbot / agent overlay and in Settings header. During playback, keep it invisible.

### 1.3 Per-Profile Preference Storage

All services store preferences per profile, not per account:

- Language/subtitle preferences
- Content maturity rating
- Watch history and continue-watching state
- UI/theme preferences (where supported)
- Accessibility options (caption style, audio description)

Preferences are kept server-side in all commercial services. For HermesTV's privacy-first design, preferences are on-device (see Section 5).

### 1.4 Switching Profiles Without Full Logout

**Plex Fast User Switching:** Plex Home members can switch without re-entering credentials. A "Switch User" button sits in the navigation drawer above "Sign Out." PIN-protected profiles require the PIN; unprotected profiles switch immediately.

**Jellyfin multi-login (in progress):** A community-contributed PR stores multiple credential sets locally (localStorage + indexedDB). The "Who's Watching" picker shows stored users; clicking one switches context without a network re-auth round-trip for the current session.

**HermesTV pattern (two-profile household):**
1. On app launch, show the "Who's Watching" screen.
2. Clicking Sherri's avatar loads her profile JSON instantly from `tizen.filesystem` — no network call required.
3. If a profile PIN is set, prompt for 4-digit D-pad PIN pad before loading.
4. The "Switch Profile" action is accessible from the chatbot menu at any time.
5. No full logout required between profile switches; backend session token is scoped per `profile_id`.

### 1.5 Guest / Temporary Mode

| Service | Guest Mode Behavior |
|---|---|
| Roku | Named "Guest Mode"; auto-expires at chosen time; deletes history and credentials on exit |
| YouTube TV (deprecated) | "Use Signed Out" button; no history saved |
| Apple TV (optional) | "Suggestions" can be hidden; profile screen can be disabled |

**HermesTV guest mode recommendation:**
- A third entry on the "Who's Watching" screen: "Guest" with a generic avatar.
- Guest session: watch history disabled, no memory written to Mem0, no agent personalization.
- On exit (back button from home), display "Clear this session?" prompt.
- Guest mode persists only in `sessionStorage`; cleared on app restart.

### 1.6 Profile PIN Protection

Netflix model:
- 4-digit numeric PIN per profile (optional).
- PIN required at profile selection time.
- PIN set/changed in Account settings (not on-TV; requires phone/browser).
- "Lock profile" toggle; if on, PIN gates content playback from that profile.

Plex model:
- PIN set via Plex Home settings.
- PIN prompted when switching to that managed user on any app.

**HermesTV recommendation:**
- Optional 4-digit PIN per profile, settable on-device via D-pad numeric keypad overlay.
- PIN stored as bcrypt hash in the profile JSON (never plaintext).
- "Forgot PIN" path: hold the Back button for 3 seconds on the PIN screen → shows a reset confirmation requiring remote-button chord (e.g., Up+Down+Select) to avoid accidental reset.

---

## 2. AI Persona Naming and Customization

### 2.1 How Voice Assistants Handle Renaming

| Assistant | Rename Support | Mechanism |
|---|---|---|
| Amazon Alexa | Yes (wake word only) | Settings → Device → Wake Word. Options: Alexa, Echo, Amazon, Ziggy, Computer. Not truly free-text. |
| Google Assistant | No wake word rename | "Hey Google" / "OK Google" only. Can set nickname for the *user*, not the assistant. |
| Apple Siri | No rename | Fixed name. |
| Samsung Bixby | No rename | Fixed name. |
| Character.AI | Yes (full persona) | User creates named characters with custom descriptions; the model adopts the persona. |
| ChatGPT Custom GPTs | Yes | Creator sets persona name, instructions, avatar. Published GPTs show custom name in chat. |

**Key insight:** Commercial branded assistants resist renaming to protect brand recognition and wake-word model accuracy. However, because HermesTV's AI agent uses a typed/button-triggered interface (not always-on wake-word listening), free-text renaming is low-risk and high-value.

### 2.2 Why Custom Agent Names Work

Research from ShapeOfAI.com (AI naming pattern database):
- Giving users the option to rename their AI increases attachment and makes it feel integrated into their workflow.
- Name should pair with visual cues (avatar color, icon) that persist with the name.
- Name and communication style must be consistent — a playful name ("Nova") should use a warmer tone than a neutral name ("Hermes").
- The disclosure requirement (AI, not human) must survive renaming: the agent's identity as an AI must be evident regardless of its custom name.

### 2.3 Best UX Pattern for "Rename Your Agent" Flow on TV

**Settings > AI > Agent Name** flow:

```
[Settings]
  └─ [AI Agent]
       ├─ Agent Name: "Hermes"  [EDIT]
       ├─ Agent Voice: "Aria (Female)" [CHANGE]
       └─ Agent Personality: Balanced / Friendly / Professional
```

When user selects [EDIT]:
1. Samsung IME (on-screen keyboard) appears.
2. Current name pre-filled and fully selected.
3. User types new name (e.g., "Nova"). Max 20 characters.
4. "Done" key on keyboard confirms.
5. Immediate on-screen preview: "Hi, I'm Nova — your HermesTV assistant."
6. Agent emits a brief intro TTS: `"Hi Sherri, I've updated my name to Nova. You can still ask me anything."`
7. No app restart required. Name stored to profile JSON synchronously.

**D-pad IME considerations (Samsung Tizen):**
- The QWERTY IME is available on Tizen 6.0 and earlier; ABC-style layout added in Tizen 6.5 (2022+). Dave's UN55CU8000BXZA (2023, Tizen 7.0) supports both.
- Pre-fill the current name in the input field so user can clear and retype.
- Use `maxlength="20"` on the input element.
- Use `autocapitalize="words"` for natural name formatting.
- IME disappears when user confirms with Done; focus returns to the Edit button.

### 2.4 Per-Profile Agent Names

Each profile carries its own `agent_name` field:

- `profile_id: "sherri"` → `agent_name: "Nova"`
- `profile_id: "dave"` → `agent_name: "Hermes"`

When the profile switches, the chatbot UI and all TTS references immediately use the profile's `agent_name`. The backend LLM system prompt is updated with the persona name on every session start.

**System prompt injection pattern:**
```
You are {agent_name}, a personal TV assistant for {user_display_name}.
Your personality is warm and helpful. You are an AI assistant, not a human.
Address the user as "{user_display_name}" in greetings and action cards.
```

### 2.5 Agent Introduction with Custom Name

**First launch (profile created):**
> "Hi Sherri! I'm Nova, your HermesTV assistant. I can find shows, control playback, change the look of the app, and remember your preferences. Just tap the mic button or press the chat button to talk to me."

**Return greeting (subsequent sessions):**
> "Welcome back, Sherri. I'm Nova — ready when you are."

**After renaming:**
> "Done! My name is now Nova. Nice to meet you (again), Sherri."

**Rules:**
- The agent always states its name once at first launch per profile per device.
- Subsequent sessions: the name appears in the chat header but TTS greeting is shortened ("Welcome back, Sherri" — no re-introduction).
- If the user explicitly asks "what's your name?", the agent answers: "I'm Nova — your HermesTV AI assistant."

### 2.6 TTS Voice Adjustment When Name Changes

Azure Cognitive Speech (the contracted TTS engine per doc 00) handles name pronunciation via SSML:

**Standard first-name pronunciation (usually correct):**
```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="en-US-AriaNeural">
    <say-as interpret-as="name">Nova</say-as>
  </voice>
</speak>
```

The `<say-as interpret-as="name">` tag instructs the TTS engine to apply name-specific phonological rules, which handles common English names correctly.

**Custom pronunciation via IPA phoneme (for unusual names):**
```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="en-US-AriaNeural">
    <phoneme alphabet="ipa" ph="ˈnoʊ.və">Nova</phoneme>
  </voice>
</speak>
```

**Custom lexicon approach (best for agent names users might enter):**
The backend maintains a dynamic `agent-name-lexicon.xml` that is rebuilt when the user saves a new agent name. If the name is a known English word, no entry is needed. If it is unusual (e.g., "Zyx"), an IPA entry is auto-generated via a phonemizer library and uploaded to Azure Blob.

**Lexicon entry template:**
```xml
<lexeme>
  <grapheme>Nova</grapheme>
  <phoneme>ˈnoʊ.və</phoneme>
</lexeme>
```

Lexicon cache refresh is up to 15 minutes per Azure documentation. For immediate effect, fall back to inline `<phoneme>` SSML until the cache refreshes.

**Voice consistency:** The agent TTS voice (e.g., `en-US-AriaNeural` for Sherri/Nova, `en-US-GuyNeural` for Dave/Hermes) is set per-profile in the `agent_voice` field. Renaming the agent does NOT change the voice automatically — voice is a separate setting. Both fields are editable independently under Settings > AI.

---

## 3. Personalized AI Greetings and Addressing Users

### 3.1 Context-Aware Greeting Architecture

The greeting is assembled at profile-load time by the backend, using:

```
greeting = f(user_display_name, agent_name, time_of_day, last_session_context)
```

**Time-of-day buckets:**

| Time range | Greeting prefix |
|---|---|
| 05:00 – 11:59 | "Good morning" |
| 12:00 – 17:59 | "Good afternoon" |
| 18:00 – 21:59 | "Good evening" |
| 22:00 – 04:59 | "Late night — " |

**Example greeting assembly (Sherri, 19:42, has continue-watching item):**
> "Good evening, Sherri — you left off at Season 2 Episode 4 of Severance. Want to continue?"

**Example greeting assembly (Dave, 14:05, no recent history):**
> "Good afternoon, Dave. What are we watching today?"

**Example greeting assembly (Sherri, first session of the day, nothing recent):**
> "Good evening, Sherri. Your favorites are ready."

### 3.2 Continuity: Resume Prompt

On profile load, the backend checks the `watch_history` array for the most recent incomplete item:

- If `progress_pct` is between 5% and 95%, it is a "continue watching" candidate.
- The agent surfaces this as both a greeting line and a "Continue Watching" action card with a large D-pad-selectable button.
- If no in-progress item, the agent falls back to "Your favorites are ready" or a top recommendation.

### 3.3 Profile Isolation: Never Address the Wrong User

This is a hard constraint. The rules:

1. The active `profile_id` is set at profile selection time and stored in module-level state (never in a shared variable).
2. Every backend API call includes `profile_id` in the request header.
3. The Mem0 memory queries always filter by `user_id = profile_id`.
4. The greeting text is generated server-side using the `profile_id`-scoped user name — it is never inferred from device identity alone.
5. If a profile switch occurs mid-session (the profile switcher is opened and a new profile is selected), all cached greeting context is flushed and re-fetched for the new profile.
6. Dave's TV (`UN55CU8000BXZA`) and Mom's TV (`QN85Q7FAAFXZA`) are identified by `device_id` (the `webapis.productinfo.getModel()` string). The backend enforces that Dave's device can only activate Dave-created profiles, and Mom's device can only activate Mom-created profiles — preventing cross-device profile leakage if both TVs are on the same network.

### 3.4 Greeting Display

The greeting appears in two places simultaneously:
1. **Agent chat bubble** — the large floating chatbot overlay, auto-expanded for 5 seconds after profile load, then collapses to compact mode.
2. **Action card row** — a horizontal strip of large D-pad-focusable cards generated from the greeting context (Continue Watching, Favorites, What's New, etc.).

TTS: The greeting is spoken once per session start. It is NOT repeated if the user navigates away and returns to the home screen within the same session.

---

## 4. Profile Data Schema

### 4.1 Proposed HermesTV Profile JSON Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "hermestv.profile.v1",
  "title": "HermesTV User Profile",
  "type": "object",
  "required": [
    "schema_version",
    "profile_id",
    "device_id",
    "display_name",
    "agent_name",
    "created_at",
    "updated_at"
  ],
  "properties": {

    "schema_version": {
      "type": "string",
      "description": "Semver of this schema, e.g. 1.0.0",
      "example": "1.0.0"
    },

    "profile_id": {
      "type": "string",
      "description": "Stable slug, snake_case. Never changes once created.",
      "pattern": "^[a-z0-9_]{2,32}$",
      "examples": ["sherri", "dave", "guest"]
    },

    "device_id": {
      "type": "string",
      "description": "Returned by webapis.productinfo.getModel(). Binds the profile to the TV.",
      "examples": ["QN85Q7FAAFXZA", "UN55CU8000BXZA"]
    },

    "display_name": {
      "type": "string",
      "description": "The name the agent uses when addressing this user. User-editable.",
      "maxLength": 32,
      "examples": ["Sherri", "Dave", "Mom", "D"]
    },

    "agent_name": {
      "type": "string",
      "description": "The name this user has given to their Hermes AI agent.",
      "maxLength": 20,
      "default": "Hermes",
      "examples": ["Hermes", "Nova", "Aria", "Spark"]
    },

    "agent_voice": {
      "type": "string",
      "description": "Azure TTS voice name for this profile's agent.",
      "default": "en-US-AriaNeural",
      "examples": ["en-US-AriaNeural", "en-US-GuyNeural", "en-US-JennyNeural"]
    },

    "agent_personality": {
      "type": "string",
      "enum": ["balanced", "friendly", "professional", "concise"],
      "default": "balanced"
    },

    "agent_name_phoneme_ipa": {
      "type": "string",
      "description": "Optional IPA phoneme override for the agent name. Populated automatically by backend phonemizer if the name is unusual. Used to build the SSML custom lexicon.",
      "examples": ["ˈnoʊ.və", "ˈhɜː.miːz"]
    },

    "avatar": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["emoji", "initials", "image_url"],
          "default": "emoji"
        },
        "value": {
          "type": "string",
          "description": "Emoji character, initials string (1–2 chars), or HTTPS URL for custom image.",
          "examples": ["🌙", "SH", "https://hermestv.local/avatars/sherri.png"]
        },
        "bg_color": {
          "type": "string",
          "description": "Background color for emoji/initials avatar. Hex or CSS variable.",
          "examples": ["#6B4CFF", "#00B4A6", "var(--profile-bg-mom)"]
        }
      }
    },

    "pin": {
      "type": "object",
      "description": "Optional profile PIN protection.",
      "properties": {
        "enabled": { "type": "boolean", "default": false },
        "hash": {
          "type": "string",
          "description": "bcrypt hash of the 4-digit PIN. Never store plaintext."
        }
      }
    },

    "ui_preferences": {
      "type": "object",
      "properties": {
        "layout_preset": {
          "type": "string",
          "description": "ID from the 12 static layout presets (doc 04).",
          "examples": ["mom_jumbo_rail", "dave_dense_grid", "standard_rows"]
        },
        "theme_id": {
          "type": "string",
          "description": "ID from the 24 theme packs (doc 05).",
          "examples": ["mom_calm_light", "dave_dark_pro", "midnight_cinema"]
        },
        "font_scale": {
          "type": "number",
          "minimum": 1.0,
          "maximum": 2.5,
          "default": 1.0,
          "description": "Multiplier applied to all UI text sizes. Mom Mode enforces >= 1.25."
        },
        "animation_density": {
          "type": "string",
          "enum": ["full", "reduced", "none"],
          "default": "full"
        },
        "focus_ring_style": {
          "type": "string",
          "enum": ["default", "high_contrast", "glow", "thick_border"],
          "default": "default"
        },
        "card_shape": {
          "type": "string",
          "enum": ["rounded", "square", "pill"],
          "default": "rounded"
        },
        "chatbot_position": {
          "type": "string",
          "enum": ["bottom_right", "bottom_left", "bottom_center"],
          "default": "bottom_right"
        },
        "safe_area_padding_px": {
          "type": "integer",
          "minimum": 0,
          "maximum": 80,
          "default": 32,
          "description": "Extra padding inside the safe area for overscan-prone TVs."
        }
      }
    },

    "accessibility": {
      "type": "object",
      "properties": {
        "mom_mode": {
          "type": "boolean",
          "default": false,
          "description": "Enables Mom Mode protections: large font floor, audio feedback, simplified nav."
        },
        "high_contrast": { "type": "boolean", "default": false },
        "reduced_motion": { "type": "boolean", "default": false },
        "audio_feedback": {
          "type": "boolean",
          "default": false,
          "description": "Plays a soft click sound on D-pad focus changes."
        },
        "captions_default": { "type": "boolean", "default": false },
        "caption_style": {
          "type": "string",
          "enum": ["default", "large_white_black_bg", "yellow_no_bg"],
          "default": "default"
        },
        "audio_description": { "type": "boolean", "default": false }
      }
    },

    "content_preferences": {
      "type": "object",
      "properties": {
        "language": {
          "type": "string",
          "description": "BCP 47 language tag for UI and content preference.",
          "default": "en-US",
          "examples": ["en-US", "es-MX", "fr-FR"]
        },
        "subtitle_language": {
          "type": "string",
          "description": "BCP 47 or 'off'.",
          "default": "off"
        },
        "maturity_rating": {
          "type": "string",
          "enum": ["G", "PG", "PG-13", "R", "TV-MA", "unrestricted"],
          "default": "unrestricted"
        },
        "preferred_quality": {
          "type": "string",
          "enum": ["auto", "1080p", "720p", "480p"],
          "default": "auto"
        }
      }
    },

    "favorites": {
      "type": "array",
      "description": "Array of favorited stream/channel/VOD IDs. Local only, never synced.",
      "items": {
        "type": "object",
        "properties": {
          "item_id": { "type": "string" },
          "item_type": { "type": "string", "enum": ["channel", "vod", "series", "category"] },
          "added_at": { "type": "string", "format": "date-time" }
        }
      }
    },

    "watch_history": {
      "type": "array",
      "description": "Recent viewing history. Local-only. Max 200 entries, FIFO pruned.",
      "items": {
        "type": "object",
        "properties": {
          "item_id": { "type": "string" },
          "item_type": { "type": "string", "enum": ["channel", "vod", "episode"] },
          "title": { "type": "string" },
          "progress_pct": {
            "type": "number",
            "minimum": 0,
            "maximum": 100,
            "description": "Playback progress percentage. 0 = not started, 100 = finished."
          },
          "last_watched_at": { "type": "string", "format": "date-time" },
          "duration_sec": { "type": "integer" },
          "position_sec": { "type": "integer" }
        }
      }
    },

    "memory_context": {
      "type": "object",
      "description": "Hermes AI agent memory metadata. Content lives in Mem0/Redis on backend; this stores only the sync anchors.",
      "properties": {
        "user_id": {
          "type": "string",
          "description": "The user_id key used for all Mem0 API calls. Matches profile_id by convention.",
          "examples": ["sherri", "dave"]
        },
        "namespace": {
          "type": "string",
          "description": "Mem0 namespace for multi-tenant isolation.",
          "examples": ["hermestv_prod_sherri", "hermestv_prod_dave"]
        },
        "memory_enabled": { "type": "boolean", "default": true },
        "last_synced_at": {
          "type": "string",
          "format": "date-time",
          "description": "Timestamp of last successful memory sync with backend."
        },
        "session_id": {
          "type": "string",
          "description": "Current session run_id for Mem0 session-scoped memory."
        }
      }
    },

    "reminders": {
      "type": "array",
      "description": "User-set viewing reminders.",
      "items": {
        "type": "object",
        "properties": {
          "reminder_id": { "type": "string" },
          "item_id": { "type": "string" },
          "title": { "type": "string" },
          "remind_at": { "type": "string", "format": "date-time" },
          "triggered": { "type": "boolean", "default": false }
        }
      }
    },

    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },

    "export_meta": {
      "type": "object",
      "description": "Metadata for JSON export/import backup.",
      "properties": {
        "exported_at": { "type": "string", "format": "date-time" },
        "export_format_version": { "type": "string", "default": "1.0" },
        "include_watch_history": { "type": "boolean" },
        "include_favorites": { "type": "boolean" },
        "include_memory_context": { "type": "boolean", "default": false,
          "description": "Memory content is never exported to JSON; only the namespace anchor." }
      }
    }
  }
}
```

### 4.2 Concrete Example Instances

**Sherri profile (Mom TV):**
```json
{
  "schema_version": "1.0.0",
  "profile_id": "sherri",
  "device_id": "QN85Q7FAAFXZA",
  "display_name": "Sherri",
  "agent_name": "Nova",
  "agent_voice": "en-US-AriaNeural",
  "agent_personality": "friendly",
  "agent_name_phoneme_ipa": "ˈnoʊ.və",
  "avatar": {
    "type": "emoji",
    "value": "🌙",
    "bg_color": "#6B4CFF"
  },
  "pin": { "enabled": false },
  "ui_preferences": {
    "layout_preset": "mom_jumbo_rail",
    "theme_id": "mom_calm_light",
    "font_scale": 1.4,
    "animation_density": "reduced",
    "focus_ring_style": "high_contrast",
    "card_shape": "rounded",
    "chatbot_position": "bottom_right",
    "safe_area_padding_px": 40
  },
  "accessibility": {
    "mom_mode": true,
    "high_contrast": false,
    "reduced_motion": true,
    "audio_feedback": true,
    "captions_default": false,
    "caption_style": "default",
    "audio_description": false
  },
  "content_preferences": {
    "language": "en-US",
    "subtitle_language": "off",
    "maturity_rating": "TV-MA",
    "preferred_quality": "auto"
  },
  "favorites": [],
  "watch_history": [],
  "memory_context": {
    "user_id": "sherri",
    "namespace": "hermestv_prod_sherri",
    "memory_enabled": true,
    "last_synced_at": "2026-05-17T19:00:00Z",
    "session_id": "s_20260517_8b3c"
  },
  "reminders": [],
  "created_at": "2026-05-01T10:00:00Z",
  "updated_at": "2026-05-17T19:00:00Z"
}
```

**Dave profile (Dave TV):**
```json
{
  "schema_version": "1.0.0",
  "profile_id": "dave",
  "device_id": "UN55CU8000BXZA",
  "display_name": "Dave",
  "agent_name": "Hermes",
  "agent_voice": "en-US-GuyNeural",
  "agent_personality": "balanced",
  "agent_name_phoneme_ipa": "ˈhɜː.miːz",
  "avatar": {
    "type": "emoji",
    "value": "🔱",
    "bg_color": "#1A3A5C"
  },
  "pin": { "enabled": false },
  "ui_preferences": {
    "layout_preset": "dave_dense_grid",
    "theme_id": "dave_dark_pro",
    "font_scale": 1.0,
    "animation_density": "full",
    "focus_ring_style": "default",
    "card_shape": "rounded",
    "chatbot_position": "bottom_right",
    "safe_area_padding_px": 32
  },
  "accessibility": {
    "mom_mode": false,
    "high_contrast": false,
    "reduced_motion": false,
    "audio_feedback": false,
    "captions_default": false,
    "caption_style": "default",
    "audio_description": false
  },
  "content_preferences": {
    "language": "en-US",
    "subtitle_language": "off",
    "maturity_rating": "unrestricted",
    "preferred_quality": "auto"
  },
  "favorites": [],
  "watch_history": [],
  "memory_context": {
    "user_id": "dave",
    "namespace": "hermestv_prod_dave",
    "memory_enabled": true,
    "last_synced_at": "2026-05-17T19:00:00Z",
    "session_id": "s_20260517_9d4f"
  },
  "reminders": [],
  "created_at": "2026-05-01T10:00:00Z",
  "updated_at": "2026-05-17T19:00:00Z"
}
```

---

## 5. Local-First Profile Storage

### 5.1 Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ TIZEN TV (on-device)                                        │
│                                                             │
│  localStorage (≤5 MB total app budget)                      │
│    hermestv.active_profile_id = "sherri"                    │
│    hermestv.last_profile_switch = "2026-05-17T19:00:00Z"   │
│    hermestv.device_id = "QN85Q7FAAFXZA"                    │
│    hermestv.guest_session = null                            │
│                                                             │
│  tizen.filesystem (/wgt-private/profiles/)                  │
│    sherri.json     ← full profile JSON (≈20–50 KB)         │
│    dave.json                                                │
│    guest.json      ← ephemeral, cleared on app exit        │
│                                                             │
│  sessionStorage (cleared on app close)                      │
│    hermestv.session_token = "eyJ..."                        │
│    hermestv.greeting_shown = true                           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ VPS / BACKEND                                               │
│                                                             │
│  Redis (profile metadata + session state)                   │
│    hermestv:profile:sherri → JSON blob (hot cache)         │
│    hermestv:session:s_20260517_8b3c → session context      │
│    hermestv:device:QN85Q7FAAFXZA → ["sherri"]              │
│                                                             │
│  Mem0 (AI agent long-term memory)                           │
│    user_id = "sherri", namespace = "hermestv_prod_sherri"  │
│    user_id = "dave",   namespace = "hermestv_prod_dave"    │
│                                                             │
│  Postgres / SQLite (optional, watch stats only)             │
│    No watch history — watch history is local-only          │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Why tizen.filesystem Instead of localStorage

- `localStorage` is capped at **5 MB for the entire app** across all keys.
- Two full profiles with watch history (200 entries each) can easily exceed 2–4 MB.
- `tizen.filesystem` (`/wgt-private/`) has no hard app-level cap beyond device storage.
- Files are app-sandboxed — no other app can read them.
- JSON files can be read/written atomically using `openFile` + `write` + `close`.

**Tizen filesystem write pattern:**
```javascript
// Write profile to filesystem
function saveProfile(profileId, profileData) {
  const path = `wgt-private/profiles/${profileId}.json`;
  const json = JSON.stringify(profileData, null, 2);

  tizen.filesystem.openFile(path, 'w', (fileHandle) => {
    fileHandle.writeString(json,
      () => {
        fileHandle.close(() => {}, (err) => console.error('close err', err));
      },
      (err) => console.error('write err', err)
    );
  }, (err) => console.error('open err', err));
}

// Read profile from filesystem
function loadProfile(profileId, onSuccess, onError) {
  const path = `wgt-private/profiles/${profileId}.json`;

  tizen.filesystem.openFile(path, 'r', (fileHandle) => {
    fileHandle.readAsText((text) => {
      fileHandle.close(() => {}, () => {});
      onSuccess(JSON.parse(text));
    }, onError);
  }, onError);
}
```

### 5.3 Privacy Rules

| Data type | Storage location | Cloud sync | Notes |
|---|---|---|---|
| Display name, agent name, preferences | On-device (`tizen.filesystem`) + Redis cache | VPS Redis only (no external cloud) | Required for backend greeting generation |
| Watch history | On-device only | Never | Strict privacy — not sent anywhere |
| Favorites | On-device only | Never | Local-only |
| Agent memory (Mem0) | Backend (VPS Redis + Mem0) | VPS only | User controls via "Forget me" command |
| PIN hash | On-device only | Never | Never transmitted |
| Session token | `sessionStorage` | Never | Cleared on app close |

### 5.4 Backup and Restore via JSON Export

**Export flow (Settings > Profile > Export Profile):**
1. User triggers export via D-pad in Settings.
2. App assembles a profile export JSON (excluding watch_history if user opts out, excluding PIN hash always, excluding memory_context content).
3. File saved to USB drive if present (`wgt-external/<usb-id>/hermestv-export-sherri-20260517.json`), or downloaded via the companion app if available.
4. A confirmation overlay shows: "Export saved. File: `hermestv-export-sherri-20260517.json`"

**Import flow (Settings > Profile > Import Profile):**
1. User selects import. App lists `.json` files from USB root.
2. User D-pads to select file, presses OK.
3. App validates the JSON against the schema. Shows diff of what will change.
4. Requires "Confirm" button press (with `requires_user_confirm: true` via the safe command schema).
5. Restores all fields except PIN (PIN is reset to disabled on import — user must re-set it).
6. `watch_history` is merged (union), not overwritten.

---

## 6. Quick Name Change UX

### 6.1 Display Name Change (Settings > Profile > Display Name)

```
[Main Menu]
  └─ [Settings]
       └─ [My Profile]
            ├─ Avatar:        🌙  [CHANGE]
            ├─ Display Name:  Sherri  [EDIT]
            ├─ Agent Name:    Nova    [EDIT]
            ├─ PIN:           Off     [SET PIN]
            └─ Export Profile         [EXPORT]
```

**EDIT flow for Display Name:**
1. D-pad to "Display Name: Sherri [EDIT]", press OK.
2. Samsung IME opens with "Sherri" pre-selected.
3. User clears and types new name (max 32 chars).
4. Press Done on keyboard.
5. Overlay confirmation: `"Your name is now [NewName]. Hermes will call you [NewName] from now on."`
6. TTS (agent voice): `"Got it! I'll call you [NewName]."`
7. Profile JSON written to filesystem. `updated_at` timestamp refreshed.
8. All visible instances of the name update without restart (reactive state store).

### 6.2 Agent Name Change (Settings > AI > Agent Name)

Same IME flow as display name but maxlength 20. After confirmation:
1. Profile JSON updated: `agent_name` field.
2. Backend notified via API: `POST /api/profile/sherri/agent-name { "agent_name": "Nova" }`.
3. Backend rebuilds the system prompt for the next session.
4. If the name is not a common English word, backend phonemizer generates IPA and stores in `agent_name_phoneme_ipa`. SSML template is updated.
5. Chatbot header immediately shows the new name.
6. TTS intro: `"Done! You can call me [NewAgentName]. I'm still here to help, [UserName]."`

### 6.3 Immediate UI Reflection (No Restart)

The profile state is held in a reactive store (e.g., a lightweight event-emitter or a Preact/Solid signal if the UI layer supports it). Name-change events emit `profile:updated` with the changed fields. All consumers (chatbot header, greeting overlay, action card label) listen and re-render:

```javascript
profileStore.on('profile:updated', (changes) => {
  if (changes.agent_name) {
    chatbotHeader.setName(changes.agent_name);
    greetingOverlay.refresh();
    actionCards.refresh();
  }
  if (changes.display_name) {
    profileBadge.setName(changes.display_name);
    greetingOverlay.refresh();
  }
});
```

No page reload, no app restart. The update is live within 100 ms of the user pressing Done on the keyboard.

### 6.4 D-pad Settings Flow Design Notes

**Focus order in Settings > My Profile:**
```
Avatar [CHANGE]  →  Display Name [EDIT]
     ↓
Agent Name [EDIT]  →  PIN [SET]
     ↓
Export Profile [EXPORT]
     ↓
[Back]  (returns focus to Settings menu)
```

- Every row is a single focusable item spanning full width: left side shows the label + current value, right side shows the action label in brackets.
- On focus, the row highlights with the profile's `bg_color` tint.
- The action label ("EDIT", "CHANGE", "SET") uses a secondary accent color to signal interactability.
- No nested menus within this screen — all actions open a modal (IME, avatar picker, PIN pad) that dismisses back to this same settings screen, restoring focus to the row that opened it.

**Avatar Picker (modal, D-pad navigable):**
- Grid of emoji: 6 columns × N rows. Each cell is 80×80 px logical (TV-distance safe).
- Scroll: D-pad Up/Down when cursor is at the top/bottom row.
- Selected emoji gets a ring in the profile's `bg_color`.
- Current avatar is pre-focused when picker opens.
- OK confirms, Back cancels with no change.

---

## 7. Consolidated UX Recommendations for D-pad TV Context

### 7.1 Who's Watching Screen

- **Full screen, no scrolling.** Two profiles fit in a single screen. Add "Guest" as a third option in the bottom-left corner, visually smaller than the primary profiles.
- **Profile tile size:** 200×240 px logical (avatar 160 px, name below at 28 px, space below name 16 px).
- **Focus ring:** 4 px solid border, color from the profile's `bg_color` (Sherri: purple, Dave: navy). Scale up tile 5% on focus for tactile feedback.
- **D-pad order:** Left is Sherri (primary user for Mom TV), Right is Dave. Bottom-left is Guest.
- **Auto-focus:** Last-used profile is pre-focused when the screen appears.
- **Hold-to-switch:** If the user holds OK for 2 seconds on a profile tile, skip PIN check and offer "Remove PIN this session" toggle (convenience for the primary user in a private household).
- **Background:** Blurred version of the last-played content (or the active theme's background) — same pattern as Netflix and Disney+.

### 7.2 Profile Badge (In-App)

- **Location:** Top-right corner of the home screen (not during playback).
- **Content:** Small avatar (40 px) + display name (16 px) on the same line.
- **Focus:** D-pad-accessible; pressing OK opens the profile menu (Switch Profile / Settings / Sign Out).
- **During playback:** Hidden entirely. Not shown in the player overlay.

### 7.3 Agent Chatbot Header

- **Agent name always visible** in the chatbot header bar: `[Avatar] Nova` (16 px bold).
- Updates live when agent name changes.
- The word "AI" or a small lightning-bolt icon appears next to the name to satisfy disclosure requirements (the agent is clearly an AI, not a human).

### 7.4 10-Foot Text Rules

Based on Samsung Tizen UX guidelines and TV design standards:

| Element | Minimum size |
|---|---|
| Body text | 24 px logical |
| Profile name on Who's Watching | 28 px |
| Settings label | 22 px |
| Settings current-value text | 22 px |
| Agent greeting text in overlay | 26 px |
| Action card title | 28 px |
| Action card subtitle | 20 px |
| Focus ring width | 4 px |
| Minimum focusable target | 60×60 px |

### 7.5 Samsung IME Integration Checklist

- Use `<input type="text">` for display name and agent name fields.
- Use `autocapitalize="words"` to encourage proper-name capitalization.
- Do NOT use `type="search"` — it triggers a different IME mode on some Tizen versions.
- For the PIN field, use `type="tel"` with `maxlength="4"` — this triggers the numeric keypad on Tizen 6.5+.
- Wrap inputs in a `<form>` tag so the Done/Go button behavior is handled correctly.
- For two-field flows (Display Name → Agent Name in sequence), use `<input name="display_name" enterkeyhint="next">` and `<input name="agent_name" enterkeyhint="done">` to get the Next/Done IME button sequence.
- After IME dismisses, programmatically return focus to the edit button that triggered it.

---

## 8. Backend Integration Points

### 8.1 Mem0 Memory Scoping

All Hermes agent memory calls use these parameters:

| Parameter | Sherri | Dave |
|---|---|---|
| `user_id` | `"sherri"` | `"dave"` |
| `namespace` | `"hermestv_prod_sherri"` | `"hermestv_prod_dave"` |
| `run_id` | Current session ID | Current session ID |

Search filter example:
```python
memories = mem0_client.search(
    query="favorite genres",
    user_id="sherri",
    filters={"namespace": {"eq": "hermestv_prod_sherri"}}
)
```

Memory types used:
- **Semantic** (`memory_type: "semantic"`): User preferences, favorite genres, agent rename history, accessibility needs.
- **Episodic** (`memory_type: "episodic"`): Specific viewing events ("watched the finale of Show X on May 10").
- **Message** (`memory_type: "message"`): Recent conversation turns (short-lived, expires via `run_id`).

### 8.2 Redis Profile Cache

```
KEY: hermestv:profile:{profile_id}
TYPE: JSON (RedisJSON)
TTL: 3600 seconds (1 hour, refreshed on access)
STRUCTURE: full profile JSON object
```

```
KEY: hermestv:device:{device_id}
TYPE: List of profile_ids allowed on this device
TTL: permanent (no expiry)
STRUCTURE: ["sherri"]  # Mom TV only has Sherri's profile
```

```
KEY: hermestv:session:{session_id}
TYPE: Hash
TTL: 86400 seconds (24 hours)
FIELDS:
  profile_id: "sherri"
  device_id: "QN85Q7FAAFXZA"
  agent_name: "Nova"
  display_name: "Sherri"
  greeting_delivered: "true"
  started_at: "2026-05-17T19:00:00Z"
```

### 8.3 Asymmetric Performance Rule (from memory file)

As established in the project memory:
- **Mom's TV (QN85Q7FAAFXZA)** is never system-limited. Enhanced renderer tier applies. Profile loading may use richer animations, higher-resolution avatar processing, and full agent context fetching without timeout shortcuts.
- **Dave's TV (UN55CU8000BXZA)** carries baseline performance caps. Profile loading uses the optimized path: avatar is served at 80 px, watch history is loaded lazily (first 20 items only), agent greeting is pre-cached in Redis to avoid cold LLM latency on the performance-constrained TV.

---

## 9. Open Questions and Risks

| Question | Risk level | Recommended resolution |
|---|---|---|
| Does `tizen.filesystem` `/wgt-private/` persist across app updates on both target TVs? | Medium | Verify on-device at R0 testing. Samsung docs suggest it persists for `.wgt` updates but may clear on uninstall. |
| Is `bcrypt` available in the Tizen web app sandbox for PIN hashing? | Medium | If not, use `crypto.subtle.digest('SHA-256', ...)` with a device-specific salt stored in localStorage. Not as strong as bcrypt but acceptable for a 4-digit PIN on a private household TV. |
| Does the Samsung IME correctly trigger for `<input type="text">` inside a shadow DOM / custom element? | Low–Medium | Test with Tizen Simulator before R1. If not, use a standard DOM input outside shadow roots. |
| Performance of JSON parse for large watch_history on UN55CU8000BXZA at cold launch | Medium | Enforce the 200-entry FIFO limit strictly. Lazy-load watch history after the Who's Watching screen has rendered. |
| Azure TTS custom lexicon 15-minute cache delay after agent rename | Low | Use inline `<phoneme>` SSML as fallback until cache refreshes. No user-visible impact — pronunciation is correct either way. |
| Multi-profile on one TV (if Sherri and Dave share the Mom TV) | Low | The current schema supports multiple profiles per device. `hermestv:device:QN85Q7FAAFXZA` list can contain `["sherri", "dave"]`. Not needed for current household setup but schema is ready. |

---

## Conclusion — What Contracts Can and Cannot Rely On

**What contracts CAN rely on:**
- The profile JSON schema (Section 4) is self-contained and does not depend on any unverified TV hardware claim. It can be used as-is by any implementation agent.
- `tizen.filesystem` `/wgt-private/` read/write pattern (Section 5.2 code) is confirmed by Samsung Filesystem API documentation (linked in sources).
- `localStorage` 5 MB budget is confirmed across all Tizen versions.
- `sessionStorage` clearing on app close is standard web behavior, confirmed on Tizen.
- Azure TTS SSML for name pronunciation (`<say-as interpret-as="name">`, `<phoneme alphabet="ipa">`) is confirmed by Microsoft Learn SSML documentation (linked in sources).
- The "Who's Watching" full-screen profile picker with last-used pre-focus is correct UX — sourced from Netflix 2025, Plex, Apple tvOS 26, all verified against their product documentation and support pages.
- Samsung IME triggers correctly on `<input type="text">` — confirmed by Samsung Developer Text Input documentation (linked in sources). `type="tel"` for PIN numeric keypad is confirmed for Tizen 6.5+.
- bcrypt hash for PIN storage: if bcrypt is unavailable in the Tizen WebView sandbox, the `crypto.subtle.digest('SHA-256', ...)` fallback noted in Section 9 is the correct alternative.
- Mem0 memory scoping pattern (`user_id`, `namespace`) matches Mem0 open-source documentation (docs.mem0.ai, linked in sources).

**What contracts CANNOT rely on (needs verification):**
- `device_id` as returned by `webapis.productinfo.getModel()`: the profile schema uses this for device binding. The actual string returned by `getModel()` for `QN85Q7FAAFXZA` must be verified on-device — it may return a different string than the retail model number. Do not hardcode model strings until the diagnostic screen confirms the exact output.
- `tizen.filesystem` persistence across app updates: noted as a risk in Section 9 (Open Questions). Must be verified during R0 on-device testing before the profile storage architecture is finalized.
- `bcrypt` availability in Tizen WebView: noted as medium risk in Section 9. Must be tested.

---

## Sources Consulted

- [Netflix Help Center — How to switch profiles](https://help.netflix.com/en/node/322532375336036)
- [Netflix Help Center — Profile PIN](https://help.netflix.com/en/node/114277)
- [Netflix TV experience update 2025](https://help.netflix.com/en/node/321880164349028)
- [FlatpanelsHD — Netflix TV redesign 2025](https://flatpanelshd.com/news.php?id=1746708512&subaction=showfull)
- [Jellyfin multi-user discussion #7059](https://github.com/jellyfin/jellyfin-web/discussions/7059)
- [Diverse Tech Geek — Streaming profile avatars 2024](https://www.diversetechgeek.com/streaming-services-profile-avatars-2024-edition/)
- [Plex Fast User Switching](https://support.plex.tv/articles/204232453-fast-user-switching/)
- [Plex Home overview](https://support.plex.tv/articles/203815766-what-is-plex-home/)
- [Apple TV — Switch profiles in Control Center](https://support.apple.com/guide/tv/switch-profiles-atvb5f549664/tvos)
- [Apple TV user profiles screen (tvOS 26)](https://macdailynews.com/2025/12/19/how-to-disable-the-whos-watching-user-profile-selection-screen-on-apple-tv/)
- [ShapeOfAI — AI naming patterns](https://www.shapeof.ai/patterns/name)
- [GeeksforGeeks — How to Change Alexa's Name and Voice](https://www.geeksforgeeks.org/techtips/how-to-change-alexas-name-and-voice/)
- [Android Authority — Change Alexa's name and voice](https://www.androidauthority.com/how-to-change-alexa-name-and-voice-1201758/)
- [Google Assistant — rename discussion](https://support.google.com/assistant/thread/184172050)
- [Samsung Developer — Text Input design](https://developer.samsung.com/smarttv/design/text-input.html)
- [Samsung Developer — Keyboard/IME](https://developer.samsung.com/smarttv/develop/guides/user-interaction/keyboardime.html)
- [Samsung Developer — Using Web Storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/using-web-storage.html)
- [Samsung Developer — Filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
- [Samsung Developer — UX Checklist](https://developer.samsung.com/smarttv/design/ux-checklist.html)
- [ediblecode — State of TV on-screen keyboards](https://ediblecode.com/blog/tv-keyboards/)
- [Roku Guest Mode](https://support.roku.com/article/360015611254)
- [YouTube removing Guest profile from TV apps (2025)](https://9to5google.com/2025/02/03/youtube-guest-profile-tv-apps/)
- [Mem0 — Memory Types](https://docs.mem0.ai/core-concepts/memory-types)
- [Redis — User Profile Storage](https://redis.io/solutions/user-profile-storage/)
- [Redis — AI agent memory architecture](https://redis.io/blog/ai-agent-memory-stateful-systems/)
- [Redis Agent Memory Server — Long-term memory](https://redis.github.io/agent-memory-server/long-term-memory/)
- [Microsoft Learn — SSML Pronunciation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation)
- [Microsoft Learn — SSML Overview](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup)
- [Picovoice — TTS Complete Guide 2025](https://picovoice.ai/blog/complete-guide-to-text-to-speech/)
- [Mindra — Designing AI Agent Personas](https://mindra.co/blog/designing-ai-agent-personas-system-prompts-enterprise)
- [Netflix TechBlog — Pass the Remote: User Input on TV](https://medium.com/netflix-techblog/pass-the-remote-user-input-on-tv-devices-923f6920c9a8)
- [Raw.Studio — Hidden UX Genius of Netflix Welcome Page](https://raw.studio/blog/the-hidden-ux-genius-of-netflixs-new-welcome-page/)
- [ScienceDirect — Personalized adaptive UI for smart TV viewers](https://www.sciencedirect.com/science/article/pii/S1319157823003312)
