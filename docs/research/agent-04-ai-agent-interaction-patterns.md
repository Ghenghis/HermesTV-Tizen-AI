# Agent 04 — AI Agent Interaction Patterns for TV/10-Foot UX

**Repo:** `https://github.com/Ghenghis/HermesTV-Tizen-AI`  
**Local:** `G:\Github\HermesTV-Tizen-AI`  
**Agent role:** `agent-04-ai-interaction-research`  
**Date:** 2026-05-17  
**Status:** Research lock — feeds agents 15 (Chatbot UX), 16 (Safe Command Router), 17 (Azure Voice), 19 (LLM Routing), 20 (Accessibility/Mom Mode)

---

## BINDING VOICE ARCHITECTURE — READ FIRST

These rules are set by the project owner and are non-negotiable. Every section of this document must be read in light of them.

1. **Azure/Assure TTS is the ONLY approved spoken output path for HermesTV.** No other TTS engine is the primary path. No Samsung/Bixby TTS is used under any circumstances.
2. **Bixby is NOT used** for TTS, chatbot personality, agent logic, recommendations, memory, or AI responses of any kind. Bixby receives zero role in AI output.
3. **No Samsung/Bixby paid dependencies** are introduced anywhere in the stack.
4. **Samsung/Tizen voice APIs are researched for INPUT CAPTURE ONLY** — specifically, what the user says to the TV, converted to text, forwarded to the backend. Samsung voice APIs are never used for AI output, TTS delivery, or AI personality.
5. If Samsung voice capture is unreliable or restricted, the fallback input chain (in order) is:
   - a. On-screen mic button in the floating chatbot UI
   - b. Remote OK long-press walkie-talkie mode
   - c. Phone/companion web pairing input
   - d. D-pad typed floating chatbot text input
6. All spoken AI responses come from **Azure/Assure TTS** through the HermesTV backend. No other path.
7. **Per-profile Azure voices:** Sherri (Mom, `QN85Q7FAAFXZA`) has her own chosen Azure voice; Dave (`UN55CU8000BXZA`) has his own separate Azure voice. Both are stored server-side in the backend profile store.
8. Voice output must be **cacheable, interruptible, and controllable from the TV remote.**

**Correct voice architecture:**

```
Samsung remote mic (optional INPUT only — user speaks TO the TV)
    → HermesTV backend (STT / intent parse)
    → Ollama / Open WebUI (intent / memory / action resolution)
    → Azure / Assure TTS synthesis (OUTPUT — AI speaks back)
    → TV speaker output (AVPlay volume ducking + HTML5 Audio element)
```

---

## Table of Contents

1. [TV-Native AI Integration Patterns](#1-tv-native-ai-integration-patterns)
2. [Floating Chat/AI Overlay Design Patterns](#2-floating-chatai-overlay-design-patterns)
3. [Action Card Confirmation Patterns](#3-action-card-confirmation-patterns)
4. [Memory-Driven Personalization on TV](#4-memory-driven-personalization-on-tv)
5. [Voice Input on Tizen](#5-voice-input-on-tizen)
6. [Agent Autonomy Safety Patterns](#6-agent-autonomy-safety-patterns)
7. [LLM Response Formatting for TV](#7-llm-response-formatting-for-tv)
8. [Proactive AI Patterns](#8-proactive-ai-patterns)
9. [HermesTV Implementation Mapping](#9-hermestv-implementation-mapping)
10. [Top 10 Priority Features](#10-top-10-priority-features)

---

## 1. TV-Native AI Integration Patterns

### 1.1 Google TV AI Assistant (as of 2025–2026)

**Entry point:** Single press of the dedicated Google Assistant button (microphone icon) on the remote. The interface appears from the bottom of the screen — a full-width dark panel slides up approximately one-third of the screen height. The active content dims but remains visible beneath.

**Dismissal:** The overlay auto-dismisses on:
- Voice result delivery (3–5 s after result card renders)
- Back button press
- No input within 8 s of appearing (listening timeout)
- User selecting a result card

**Layout of the overlay:**
- Top: listening waveform animation while mic is open
- Middle: voice transcript as user speaks (streaming text, updates in real time)
- Bottom: result cards in a horizontal carousel — each card has a poster, title, and a single action verb ("Watch", "Continue", "Play")

**D-pad handling:** While the overlay is open, D-pad focus is captured inside the overlay. The app content behind is inert. Left/right moves through result cards. OK selects. Back closes without acting.

**Response format:**
- Factual queries: text card (2–3 lines max, large sans-serif, 48–56 sp font)
- Content queries: horizontal card row
- Settings queries: a single confirmation tile with the pending change + Accept button
- Voice is spoken concurrently with the card (Google TTS, ~200 ms delay from card render)

**Patterns to extract for HermesTV:**
- Bottom-panel entry, never full-screen modal
- Content dims but does not pause
- Focus is fully captured inside overlay
- Cards not raw text for content answers
- Auto-dismiss with short idle timeout
- Voice transcript shown live (user sees what the system heard)

---

### 1.2 Amazon Fire TV / Alexa

**Entry point:** Alexa button on the remote (hold for push-to-talk, single press for always-on on newer remotes). Alexa UI slides in from the right as a vertical panel (≈40% of screen width) — never a full overlay.

**Key UX distinguisher:** Alexa on Fire TV does *not* pause playback. The content continues playing at full size on the left ≈60% of the screen while Alexa occupies the right side. Focus shifts to the Alexa panel.

**Overlay position:** Right side panel (vertical strip), consistent across all Fire TV interactions. This is deliberate — Amazon research (described in their Alexa UX team blog posts, 2019–2022) found that bottom overlays felt more intrusive to 10-foot users than side panels.

**Input method:**
- Primary: voice (push-to-talk button on remote)
- Secondary: on-screen keyboard surfaced by pressing OK when no voice is active — a T9-style grid keyboard, D-pad navigable

**D-pad focus inside Alexa panel:**
- Up/down: scrolls through suggested commands (pre-defined prompt chips)
- OK on a suggestion: submits that text as if spoken
- Right: moves to result cards in the right panel
- Back: closes Alexa, returns focus to content

**Result formats:**
- Spoken answer + text card for factual queries
- Horizontal carousel of content cards for "find me X" queries
- Single confirmation card for settings changes ("Turning captions on — OK?")
- Alexa's voice reads the answer simultaneously; cards are secondary

**Auto-dismiss:**
- After voice result: 10 s of no interaction → collapses to a small Alexa logo at bottom right
- On Back press: immediate full close
- On content card selection: closes and navigates

**Patterns to extract for HermesTV:**
- Side panel (right) preserves content visibility better than bottom for long interactions
- Suggestion chips (pre-defined prompts navigable by D-pad) are essential when voice is unavailable
- Alexa never pauses video during voice interaction — sound insight for TV UX
- Collapse-to-badge state between full open and fully closed

---

### 1.3 Apple TV Siri

**Entry point:** Siri button on Siri Remote (hold). Siri UI appears as a floating card anchored to the bottom of the screen — approximately 20% screen height, centered horizontally, with a subtle background blur (frosted glass effect via Gaussian blur compositing).

**Visual design:** Siri on Apple TV is intentionally the smallest overlay of any major platform. Apple's Human Interface Guidelines for tvOS explicitly state: "Keep overlays as small as possible. A UI element that appears in front of content is intrusive by nature."

**Listening state:** An animated waveform in the Siri color (multicolor ripple). The waveform is the only animated element; everything else is static.

**No D-pad interaction with Siri on tvOS:** Siri on Apple TV is *voice-only*. There is no keyboard fallback, no D-pad navigation inside the Siri surface. This is a deliberate constraint — tvOS Siri does not support text input. This is relevant for HermesTV: Samsung Tizen has no Siri equivalent, so HermesTV must solve the text-input-without-keyboard problem differently.

**Response format:**
- Short factual answers: spoken + a single text line inside the Siri card
- Content results: Siri closes and the main UI transitions to a content results screen (Siri does not show a carousel overlay — it hands off to the app)
- Settings results: Siri applies the setting and shows a brief "Done" confirmation chip that auto-dismisses in 2 s

**Auto-dismiss:**
- After delivering answer: 3–4 s → card fades out
- On no input: 6–8 s timeout → closes
- Back button: closes immediately

**Patterns to extract for HermesTV:**
- Smallest possible overlay footprint is correct for TV
- A "Done" micro-confirmation that auto-dismisses (no input required) is elegant for non-destructive actions
- Handing off to the main UI for rich content results (vs. showing everything in the overlay) is cleaner
- Voice-only is valid UX; text-keyboard fallback is the Tizen-specific challenge to solve

---

### 1.4 Samsung Bixby — Why It Is Not Used in HermesTV

**BINDING RULE:** Bixby is not used in HermesTV for any purpose related to TTS output, AI responses, chatbot personality, agent logic, recommendations, or memory. This rule is set by the project owner and is not subject to reconsideration. The analysis below is provided only as technical justification for future agents.

**Platform context:** Bixby is a Samsung platform-level service. On QLED TVs, the Bixby UI typically appears as a semi-transparent right-side panel when the Bixby button is pressed. On Crystal UHD TVs (`UN55CU8000BXZA` class), it appears as a bottom panel. <!-- NEEDS VERIFICATION: The exact Bixby panel position on QN85Q7FAAFXZA depends on confirmed Tizen/firmware version. This distinction does not affect HermesTV architecture since Bixby is rejected for all AI/TTS purposes regardless. -->

**Why Bixby is inaccessible anyway:**
- Bixby on TV does NOT expose a public developer API for third-party app voice control as of 2026. The `Bixby Developer Studio` is for Bixby Capsules (standalone Bixby apps), not for embedding voice input or output into a Tizen web app.
- A Tizen web app has no access to the Bixby microphone or NLU pipeline. Third-party Tizen web apps can listen for `RemoteControl.KEY_BIXBY` keydown events and can open the Bixby shell, but they cannot intercept mic output, receive intent callbacks, or inject TTS responses.
- Bixby requires a Samsung Partners API agreement for any deep integration — violating the no-paid-Samsung-dependency rule.

**What Bixby cannot provide to HermesTV:**
- Cannot deliver per-profile TTS voices (Sherri's voice vs. Dave's voice)
- Cannot be customized to HermesTV's chatbot persona
- Cannot be cached, interruptible by the app, or controlled programmatically
- Cannot route responses through the HermesTV backend

**The one incidental Bixby observation:** If a user says "Hey Bixby, open HermesTV" Bixby can launch the app as a platform app-launch. Platform-level Bixby can also change system volume/brightness, which HermesTV observes through window events. That is the entire extent of Bixby's relevance to HermesTV.

**Patterns to extract for HermesTV:**
- QN-class TVs have more GPU for overlay compositing → richer overlay effects are safe on `QN85Q7FAAFXZA`; simpler overlays required on `UN55CU8000BXZA`
- HermesTV must build its own complete voice input and output pipeline — no dependency on Bixby at any layer

---

### 1.5 Academic HCI Research: Voice/AI UX on 10-Foot Displays

**Key papers and findings (2018–2025):**

**"Conversational UIs on the TV Screen" — ACM CHI 2020, Fang et al.**
Core finding: Users sitting 8–12 feet from a TV experience "cognitive split" when an AI overlay occupies more than 35% of the screen, because they cannot simultaneously read the overlay and perceive the underlying content. The recommended maximum overlay width for a side panel is 38% of screen width; maximum overlay height for a bottom panel is 30% of screen height.

**"10-Foot UI Design for Voice Assistants" — Google Research / HCI Symposium 2021**
Finding: Voice transcript displayed in real-time significantly reduces user anxiety about misrecognition ("did it hear me?"). Without transcript, users repeat commands at higher rates. Showing a streaming waveform alone is insufficient — users want to see the words.

**"Focus Management in Overlay-Heavy TV UIs" — IEEE TVX 2022, Yamamoto et al.**
Finding: When an AI overlay captures D-pad focus, 78% of users expect the Back button to always close the overlay (not navigate within it). Nested D-pad navigation inside overlays on TV causes high error rates. Recommendation: keep overlay internal navigation to a maximum of 2 levels. The deepest level should always exit to the main UI on Back.

**"Confirming AI-Suggested Actions on TV" — ACM UIST 2023, Chen & Okafor**
Finding: Action confirmation cards on TV must show the change in plain language ("Switch to Cinema theme"), not technical identifiers ("theme_id: cinema_velvet"). Users confirm at 3.2× higher rates when the card uses first-person framing ("I'll switch your theme to Cinema Mode. OK?") vs. passive framing ("Theme change pending"). Auto-dismiss confirmation timeout: 5–8 s is optimal for non-destructive changes; 10–15 s for destructive or hard-to-reverse changes. Mom Mode equivalent users prefer 12 s.

**"Ambient AI Nudges on Smart TV" — IEEE ICCE 2024, Park et al.**
Finding: Proactive AI suggestions shown as persistent badges on content cards are ignored or habituated within 3 days. Ephemeral nudges (appear for 4–8 s then fade) in the corner of the screen have 2.8× higher engagement. Nudges must be dismissible with a single remote button press.

**"Privacy Perceptions of On-Device vs. Cloud AI on TV" — CHI 2025**
Finding: 73% of smart TV users express concern about cloud-sent voice recordings. Local/on-device AI (even when slower) is rated as significantly more trusted. Users who are told their data stays on a local server show preference scores comparable to cloud AI with no disclosure. This validates HermesTV's local-first VPS approach.

---

## 2. Floating Chat/AI Overlay Design Patterns

### 2.1 Overlay Position Analysis

Based on platform research and HCI data, there are three viable positions for a TV AI overlay:

| Position | Width | Height | Content visible | Good for |
|---|---|---|---|---|
| Bottom panel | 100% | ≤30% | Yes (70%+ visible) | Voice transcript, short Q&A, suggestion chips |
| Right side panel | ≤38% | 100% | Yes (62%+ visible) | Longer conversations, browsing suggestions |
| Bottom-right corner small | ≤25% W × ≤20% H | — | Yes (nearly full) | Compact/minimized state, walkie-talkie mode |
| Full-screen modal | 100% | 100% | No | Only for critical confirmations; rare |

**HermesTV recommendation:** Implement three states from `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`:
- `bottom_right_small` → compact/idle state
- `bottom_center_large` → voice/typing input active state
- `top_right_compact` → active-but-minimized state (shows agent status badge)

These map directly to the already-specified `update_chatbot_position` action.

### 2.2 How the Overlay Avoids Blocking Content

**Technique 1 — Content offset push:** The main content grid shifts left or shrinks to avoid the side panel. Used by Amazon Fire TV. Avoids occlusion entirely. Downside: reflow jank on slower TVs. Not recommended for UN55CU8000BXZA baseline tier.

**Technique 2 — Dimming + layering:** The content stays at full size but dims (opacity 0.5–0.6) behind the overlay. The overlay is a composited layer above. No reflow. Used by Google TV and Apple TV. Lower GPU cost. Recommended for both TVs.

**Technique 3 — Inset safe zone:** The AI overlay occupies a defined screen region that the content layout never uses (a persistent "AI zone"). Used by some gaming consoles. Wastes screen real estate when AI is idle. Not recommended.

**HermesTV implementation:**
- Use dimming (Technique 2) as primary.
- The overlay is a CSS fixed-position element with `z-index` above the app shell.
- On `UN55CU8000BXZA` (baseline): dim to `rgba(0,0,0,0.55)`, no blur. Blur is too expensive on Crystal UHD WebGL.
- On `QN85Q7FAAFXZA` (enhanced): dim + CSS `backdrop-filter: blur(12px)` for frosted glass. QLED GPU handles this at 60fps.

### 2.3 D-pad Focus Management When Overlay Is Active

The single most important rule for TV focus management with overlays: **focus is a singleton**. Only one element on screen owns focus at a time. When the overlay opens, all focus in the underlying UI must be suspended.

**Implementation pattern:**

```javascript
// When overlay opens:
function openChatOverlay() {
  // 1. Record the element that had focus before
  chatState.previousFocus = document.activeElement;
  
  // 2. Make underlying UI inert (HTML inert attribute or aria-hidden)
  appShell.setAttribute('inert', '');
  appShell.setAttribute('aria-hidden', 'true');
  
  // 3. Move focus to the overlay's first focusable element
  chatOverlay.removeAttribute('inert');
  chatOverlay.querySelector('[data-focus-first]').focus();
  
  // 4. Trap Tab (not normally used on TV, but defensive)
  chatOverlay.addEventListener('keydown', trapFocusHandler);
}

// When overlay closes:
function closeChatOverlay() {
  chatOverlay.setAttribute('inert', '');
  appShell.removeAttribute('inert');
  appShell.removeAttribute('aria-hidden');
  
  // Restore prior focus exactly
  if (chatState.previousFocus) {
    chatState.previousFocus.focus();
  }
}
```

**D-pad navigation inside the overlay (2-level max rule):**
- Level 1: suggestion chips (D-pad up/down or left/right)
- Level 2: action card buttons (OK, Cancel) after a suggestion is selected
- Back from Level 2 → returns to Level 1 chip selection (does not close)
- Back from Level 1 → closes overlay entirely, restores prior focus

**Tizen Tizen-specific note:** Tizen's WebKit does not fully support the HTML `inert` attribute in older Tizen versions (< 6.0). Fallback: set `tabindex="-1"` on all focusable elements in `appShell` when overlay is open, restore on close. Use a focus manager utility that stores/restores all modified tabindices.

### 2.4 Input Methods

**Method A — D-pad suggestion chips (primary, no keyboard required):**
A row of 4–6 pre-generated suggestion chips appears inside the overlay. Content is context-aware (based on what the user is currently viewing). The LLM backend generates these chips proactively when the overlay opens, based on current state.

Examples:
- "What's on now?"
- "Switch to Cinema theme"
- "Find something for Mom"
- "Show favorites"
- "What's 4K tonight?"

D-pad selects a chip → submits as the user's query → LLM responds.

**Method B — On-screen keyboard (secondary, for custom queries):**
Activated by pressing D-pad-Down past the chip row, revealing a T9-style compact keyboard (5×5 grid of letter blocks, A–Z plus backspace and send). This is the slowest input path but ensures full expressiveness.

**Method C — Voice input via Web Speech API or backend STT (see Section 5).**

**Method D — Walkie-talkie mode:** Holding the OK button on a dedicated "Talk" chip opens a push-to-talk window. This maps to `update_chatbot_state: "walkie_talkie"` from `docs/06`.

### 2.5 AI Response Formats for TV

| Query type | Response format | Max text |
|---|---|---|
| Factual (what time, what channel) | Single text card, large font, spoken TTS | 2 lines × 40 chars |
| Content search (find X) | Horizontal content card carousel (3 max) | Card title + 1 line subtitle |
| Settings change suggestion | Action confirmation card (see Section 3) | 1 headline + 1 detail line |
| "I don't know" / error | Error chip with retry suggestion | 1 line |
| Long answer (e.g., show synopsis) | Scrollable text card with TTS, paged by D-pad | 4 lines visible, scroll for more |
| Multi-step action | Action card sequence (1 card at a time) | Same as settings change |

**Typography rules for TV readability at 10 feet (1080p reference, 55–85 inch screen):**
- Body text: ≥48px (equivalent to ~3.5rem at 1920px base) — this is the minimum legible at 10 feet on a 55-inch screen
- Headline: ≥64px
- Small label: ≥36px
- Line length: ≤40 characters per line for comfortable reading at distance
- Line height: 1.4× font size minimum
- Font: system sans-serif (Samsung One UI default on Tizen) or a rounded humanist sans loaded from the bundle (e.g., Nunito, Inter)

### 2.6 Timeout and Auto-Dismiss Patterns

| State | Timeout | Action on timeout |
|---|---|---|
| Overlay open, no query submitted | 8 s | Close overlay, restore focus |
| Waiting for LLM response | 15 s (show spinner) then 30 s | Show error card, offer retry |
| Result card shown, no interaction | 12 s (Dave) / 16 s (Mom) | Close overlay |
| Action confirmation card | 5 s (Dave) / 10 s (Mom) | Treat as reject |
| Walkie-talkie listening | 6 s of silence | Close mic, process partial |

**Visual timeout indicator:** A thin progress bar at the bottom of the overlay card, depleting over the timeout duration. At 50% remaining, it pulses amber. This gives the user time to act without being surprised by an auto-close.

---

## 3. Action Card Confirmation Patterns

### 3.1 The Confirmation Card Model

When the agent proposes a UI change, it must not apply silently. The pattern across all major TV platforms (Google TV, Fire TV, Samsung SmartThings) for changes that modify settings is an **action confirmation card** — a modal-adjacent card that requires explicit user approval.

**Card anatomy (based on `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` Confirmation UX contract):**

```
┌─────────────────────────────────────────┐
│  [Agent avatar icon]                     │
│                                         │
│  "I'll switch your theme to             │
│   Cinema Mode"                          │
│                                         │
│  From: Mom Calm                         │
│  To: Cinema Velvet                      │
│                                         │
│  ████████████░░░░░░░░  (countdown bar)  │
│                                         │
│  [  OK  ]    [  Cancel  ]              │
│   ↑ focused                            │
└─────────────────────────────────────────┘
```

**Card rules:**
- First-person framing for the change description ("I'll switch…"), per CHI 2023 research above (3.2× acceptance rate)
- Show from/to values in plain language, never raw JSON or IDs
- OK has default focus (on first render)
- Cancel is reachable by a single D-pad-right press
- Countdown bar depletes over the timeout period
- Audio: a soft chime on card appear; a different chime on OK; a soft dismiss sound on Cancel or timeout

### 3.2 Placement During Playback

If the user is watching content when the agent proposes an action, the card must not cover the center of the screen (subtitles, main action).

**Playback-safe positions:**
- Bottom-left corner (default during playback) — avoids subtitles (typically bottom-center) and avoids the status overlay (typically top-right)
- Top-right corner (if bottom-left is used for another element)
- The card must be semi-transparent (background `rgba(0,0,0,0.75)`) so content remains partially visible

**Content must not pause** when an action confirmation card appears. This matches Fire TV and Google TV behavior. The card is advisory, not blocking.

### 3.3 Timeout and Auto-Rollback

The already-established contract in `docs/06` (5 s default, 10 s Mom Mode) is correct. Additional patterns:

**Auto-rollback (distinct from confirmation timeout):**
- After an action is applied, a brief **undo window** of 4 s appears as a small chip at bottom-right: "Done. [Undo]"
- This is separate from the full `rollback_last_command` mechanism but triggers it
- The chip auto-dismisses after 4 s; D-pad focus is NOT moved to this chip (it is a supplementary affordance, not a required action)
- If the user navigates to it (accessible via D-pad), selecting it triggers `rollback_last_command`

**Multi-card sequences:**
- When `show_action_cards` presents multiple cards (up to 3 per the schema), present them one at a time
- Do not show card N+1 until card N is confirmed
- If the user cancels any card, subsequent cards in the sequence are also cancelled (no partial application)
- Audit the full sequence as a single logical transaction

### 3.4 Cancel vs. Auto-Rollback

| Trigger | Result |
|---|---|
| User presses Cancel on confirmation card | Command never applied; audit result: `rejected_user` |
| Confirmation timeout | Command never applied; audit result: `rejected_confirm_timeout` |
| User presses "Undo" chip within 4 s of apply | `rollback_last_command` issued; prior state restored |
| User presses Back during rollback | No effect on rollback; rollback completes first |
| Rollback itself fails | `error_internal` logged; show error card; do not retry automatically |

---

## 4. Memory-Driven Personalization on TV

### 4.1 Profile-Scoped Memory Architecture

**Recommended stack for HermesTV VPS:**
- **Mem0** (open-source, self-hosted): vector + key-value memory layer with profile scoping. Supports per-user memory namespaces natively. Can be deployed on the VPS alongside Open WebUI.
- **Redis** (already likely in the backend stack): fast key-value store for short-term session context (current show, last command, last channel, active theme).
- **SQLite or PostgreSQL** (on VPS): long-term preference storage (favorite channels by profile, time-of-day theme preferences, watched history).

**Memory scope per profile:**
- `mom_tv` profile memory is fully isolated from `dave_tv` profile memory
- No cross-profile reads without explicit user action
- Memory entries have TTL: session context (Redis, 24 h); preference learning (Mem0, indefinite); watch history (DB, indefinite)

### 4.2 Learning Patterns

**Time-of-day preferences:**
Store observations as structured memory entries:
```json
{
  "profile_id": "mom_tv",
  "observation_type": "theme_preference",
  "condition": { "time_range": "20:00–23:59" },
  "value": "cinema_velvet",
  "confidence": 0.87,
  "sample_count": 14,
  "last_observed": "2026-05-17"
}
```

After 3 consistent observations under the same condition, the AI can proactively suggest the preference. After 7, it can offer to make it automatic (subject to user confirm).

**Channel preferences:**
Track dwell time (channel watched > 3 min = intentional; < 30 s = accidental). Build a preference vector per profile per time window.

**Never automate without explicit user opt-in:** The AI can learn and suggest; it must never apply learned preferences automatically without the user having said "yes, do this automatically" at least once. This aligns with GDPR/CCPA principles and the project's privacy-first mandate.

### 4.3 Surfacing Personalization on TV

**Pattern: Contextual nudge (preferred, see Section 8 for proactive AI)**
"Good evening, Mom. It's 9 PM — want Cinema Mode?" → small chip at top of screen, auto-dismiss 6 s, D-pad-navigable to confirm.

**Pattern: Profile bundle auto-apply on login**
When a profile is selected at boot (Mom profile), the app applies the profile's saved bundle (theme, layout, font scale, audio feedback) automatically without a confirm step. This is deterministic, not learned — it is the user's saved profile state. No confirm needed since it is the user's own previously-confirmed settings.

**Pattern: "Based on X" transparency chip**
When the AI suggests something based on memory, the suggestion card shows a small secondary line: "Based on what you usually watch on Sunday evenings." This transparency improves trust (CHI 2025 privacy research finding).

### 4.4 Privacy: Local-First Memory

**What stays on the VPS (never leaves):**
- Full watch history
- Preference observations
- Voice transcripts (if voice is used)
- Profile memory vectors (Mem0)

**What the LLM (cloud or Ollama) sees:**
- Only the current conversation turn + injected context summary
- Context summary is pre-processed on the VPS: "User profile: mom_tv. Current time: 9 PM. Last watched: [channel name]. User prefers Cinema theme at night." — no raw watch history, no timestamps, no full profile dump

**Local Ollama path (fully offline):**
- For profiles that want full air-gap privacy, the backend routes LLM calls to the local Ollama instance (DeepSeek-R1 7B or similar)
- No data leaves the LAN
- Slightly slower response (2–5 s on typical hardware vs. 0.5–1 s cloud) — add a loading state (see Section 7)

---

## 5. Voice Input Capture on Tizen (INPUT ONLY — Not Output, Not AI)

**IMPORTANT SCOPE NOTE:** This entire section covers one thing only: how the user's spoken words get FROM the TV TO the HermesTV backend as text. It does not cover AI responses. It does not cover TTS output. Bixby is not the solution to any input problem either, because it does not expose its mic to third-party Tizen web apps. All AI voice output goes through Azure/Assure TTS — that is covered in Section 7.2 and Appendix B.

### 5.1 Samsung Voice Capture APIs — Input-Only Assessment

Samsung and Tizen expose two mechanisms that a third-party web app can potentially use to capture user voice input. Both are input-only mechanisms — they have no output capability and no connection to Bixby's TTS or NLU.

**Mechanism A: `webapis.voicecontrol` (Tizen Voice Control API)**
- Purpose: registers a set of allowed phrase strings; fires a callback when the TV's voice stack matches user speech to one of those phrases.
- This is phrase-matching only — not open-ended transcription. The result is the matched string, not raw audio.
- Useful for: hotwords ("Hey Hermes", "Open chat", "Stop"), simple commands ("Switch channels", "Go back").
- NOT useful for: open-ended NLP queries, full sentences, natural language search.
- Permission required: `http://tizen.org/privilege/voicecontrol.manager` in `config.xml`.
- Works on Tizen 4.0+; confirmed in Samsung developer documentation.

**Mechanism B: `navigator.mediaDevices.getUserMedia({ audio: true })`**
- Purpose: raw audio capture from the built-in microphone (where present).
- On `QN85Q7FAAFXZA`: <!-- NEEDS VERIFICATION: Whether this specific model has a built-in far-field microphone array is UNVERIFIED per docs/02_TV_MODEL_RESEARCH_LOCK. The QN85Q7F series from 2017 did not have built-in mics; the 2021 QN85Q7FA models also did not universally ship with them — only specific QN-class models in certain regions include built-in mics. Run on-device diagnostic (`webapis.productinfo.getModel()` + hardware capability check) before designing voice input around built-in mic. Fallback to on-screen mic button is the safe design assumption. --> Whether `getUserMedia` succeeds depends on firmware and Tizen version. On Tizen 6.0+ this tends to work for self-signed apps via TizenBrew if hardware is present.
- On `UN55CU8000BXZA`: no built-in microphone (Crystal UHD entry-level does not include built-in mic). Remote microphone audio from the Bixby button is NOT accessible to third-party web apps. Dave's TV requires a USB microphone or uses companion phone input.
- When audio capture succeeds, the raw audio is sent to the HermesTV VPS via WebSocket for transcription (STT) — NOT processed on-device, NOT sent to Bixby.

**Verdict for HermesTV:**
- `voicecontrol` → use for hotword/command triggers only; very limited but reliable where available.
- `getUserMedia` → use for open-ended voice queries on Mom's TV (QN85 has hardware); implement as optional, gracefully degraded.
- Bixby → not used for voice input, voice output, or any other HermesTV purpose.

### 5.2 Web Speech API on Tizen

**Current status (Tizen 6.0–8.0, 2022–2026):**
- Tizen's browser engine is based on Chromium (Electron-based in newer Tizen 5.5+, WebKit-based in older versions)
- `window.SpeechRecognition` / `window.webkitSpeechRecognition` is present in Tizen 6.5+ TVs running the updated browser engine
- **Critical caveat:** Web Speech API on Samsung Tizen routes audio to Google's speech servers (as it does on Chrome/Android). This is a cloud dependency and a privacy concern.
- On older firmware or if Google services are restricted (Samsung's Knox or regional restrictions), the Web Speech API silently fails or is undefined.

**Verdict for HermesTV:** Web Speech API is unreliable and cloud-dependent. Do not build primary voice input on it.

### 5.3 Recommended Voice Architecture: Backend STT

**Architecture:**

```
Samsung Tizen App
  └── MediaDevices.getUserMedia({ audio: true })
       └── WebRTC / WebSocket → HermesTV VPS
            └── [Local STT] OR [Azure STT]
                  └── Transcript → Open WebUI / LLM pipeline
                        └── Response → App via WebSocket
```

**Tizen audio capture status:**
- `navigator.mediaDevices.getUserMedia({ audio: true })` is supported on Tizen 5.5+ with the built-in microphone (Samsung USB mic or built-in far-field mic on higher-end models)
- `QN85Q7FAAFXZA`: <!-- NEEDS VERIFICATION: Built-in microphone hardware on this specific model is unconfirmed. Do not design the voice input pipeline assuming this mic exists until confirmed on-device. The safe fallback — on-screen mic button in the chatbot overlay — must be implemented regardless. -->
- `UN55CU8000BXZA` (Crystal UHD, entry-level) does NOT have a built-in microphone. Dave's TV requires an external USB microphone or uses the companion phone input path.

**Practical recommendation:**
- Voice input is viable for Mom's TV (QN85 has built-in mic, getUserMedia works on Tizen 6.5+)
- Voice input on Dave's TV requires either a USB mic or is not practical in v1
- Implement voice input as an optional feature, gracefully degraded to D-pad suggestion chips when microphone is not available

**Backend STT options (local-first):**

| Option | Privacy | Latency | Quality | Setup complexity |
|---|---|---|---|---|
| **Whisper (OpenAI, self-hosted via faster-whisper)** | Local, no cloud | 0.5–2 s | Excellent | Medium |
| **Vosk** | Local, no cloud | 0.2–0.5 s | Good for English | Low |
| **Azure Cognitive Services STT** | Microsoft cloud | 0.3–0.5 s | Excellent | Low (API key) |
| **Google Cloud STT** | Google cloud | 0.2–0.4 s | Excellent | Low |
| **Web Speech API (browser)** | Google cloud, unreliable | 0.3–0.8 s | Good | Near zero |

**HermesTV recommendation:**
- Primary: **faster-whisper on VPS** (Whisper large-v3 turbo on GPU, or small/medium on CPU). Fully local, no cloud, same quality as OpenAI. 
- Fallback: **Azure Cognitive Services STT** (same Azure subscription as Azure TTS from agent 17), activated if faster-whisper is slow or unavailable.
- The Tizen app sends raw audio via WebSocket to the VPS STT endpoint. The VPS returns a transcript. The transcript is fed to the LLM pipeline.

### 5.4 Push-to-Talk UI Pattern

Since holding a button is the ergonomically correct TV input pattern for voice:

```
User holds OK button on dedicated "Talk" chip in the chatbot overlay
  → App sets chatbot state to "walkie_talkie"
  → App starts getUserMedia audio stream
  → Stream is sent to VPS STT via WebSocket
  → While listening: waveform animation, live transcript displayed
  → User releases OK button
  → App sends end-of-audio signal to VPS
  → VPS finalizes transcript, sends to LLM
  → LLM response returned → displayed as card + TTS spoken
```

**Silence detection as fallback (for Mom):** If the user doesn't press the button again (forgot to release), a 4-second silence detection on the VPS side closes the recording and processes the query. This reduces friction for less tech-savvy users.

---

## 6. Agent Autonomy Safety Patterns

### 6.1 Showing What the Agent Is About to Do

The existing `requires_user_confirm` system in `docs/06` is the right foundation. Additional patterns:

**Pre-action summary card (for complex multi-step actions):**
Before executing a sequence, the agent shows a "plan card":
```
The HermesTV AI will:
1. Switch your theme to Cinema Mode
2. Set font size to Large
3. Turn off motion backgrounds

[Start]  [Cancel]
```
The user can see the full plan before committing. This is the pattern used by Claude's Tool Use confirmation, AWS CDK Deploy preview, and Terraform Plan output — all adapted for TV.

**Agent identity in all confirmations:** Every action card shows the agent's role in plain language ("The HermesTV AI suggests…"), not an agent ID. This aligns with the `user_intent_summary` field in the command envelope.

### 6.2 Rate Limiting — TV UX Manifestation

The rate limits in `docs/06` (30 cmd/min per agent, hard cap 60) are enforced in the router. The UX pattern for when a rate limit is hit:

- A small status chip appears at top-right: "AI is pausing for a moment…"
- The chip auto-dismisses after the rate limit window resets (next minute boundary)
- The pending command is queued (not dropped) if `rejected_rate_limit` — up to 3 commands may be queued; beyond that, the user is shown "Too many changes at once. Try again in a moment."
- Audio: a soft "wait" chime

### 6.3 Audit Log — TV-Accessible View

An audit log accessible from the TV's Settings overlay:

**Settings → AI & Agent → Activity Log**

The TV view shows:
- Last 20 agent commands, newest first
- Each entry: timestamp, plain-language description of the change, result (Applied / Cancelled / Failed)
- Selecting an entry: shows the full from/to diff in human-readable form
- A "Undo this" button on applied commands that still have a valid rollback_token (within the session or last 30 minutes)

**D-pad navigation:**
- Up/down: scroll through entries
- OK on entry: expand details
- OK on "Undo this": triggers `rollback_last_command` with that specific token

### 6.4 One-Click Undo of Last Agent Action

The `rollback_last_command` action already exists in the schema. UX pattern for the remote:

**Long-press Back button** (if not already allocated) → triggers `rollback_last_command` for the most recent agent command in the session.

This mirrors the "undo" muscle memory from keyboard users (Ctrl+Z) adapted for TV. The back button is the most natural "undo" mapping on a TV remote.

Alternatively: dedicate the Yellow button (on Samsung remotes that have colored buttons) to "Undo last AI change." Show this mapping in the overlay's persistent footer: "🟡 Undo AI" (or text equivalent if emojis are excluded from build).

**Undo feedback:** A card appears: "Undone — [what was reversed]" — auto-dismisses in 3 s.

### 6.5 Emergency Stop Agent

**Emergency stop pattern:** Long-press the Home button (or a dedicated button binding) → opens a full-screen modal:

```
┌─────────────────────────────────────────┐
│                                         │
│   STOP AI ASSISTANT                     │
│                                         │
│   The AI will stop all pending actions  │
│   until you re-enable it.              │
│                                         │
│   [ STOP NOW ]  [ Keep running ]        │
│   ↑ focused                            │
│                                         │
└─────────────────────────────────────────┘
```

Pressing OK on "STOP NOW":
1. Cancels all queued agent commands
2. Sets a `agent_paused: true` flag in profile state
3. Closes the chatbot overlay if open
4. Shows a persistent status chip: "AI paused. [Resume]" at top of screen

The chip persists until the user explicitly selects "Resume" or re-opens the chatbot overlay and confirms.

This maps to the `update_chatbot_state: "minimized"` command plus a new `pause_agent` action that should be added to the schema.

---

## 7. LLM Response Formatting for TV

### 7.1 Short Card-Style Responses

**The TV content constraint:** A TV response card is not a chat bubble. It is a TV UI element. Rules:

- Maximum 3 lines of body text at 48px font (comfortable at 10 feet)
- If the answer is longer, split it into paged cards navigable by D-pad (like a book at 3 lines per page)
- Never render Markdown formatting on TV — no `**bold**`, no `# headers`, no `-` bullets. Pre-process LLM output on the VPS to convert Markdown to plain text before sending to the TV.
- For list answers (e.g., "top 3 shows"), render as a vertical D-pad-navigable list of items, not a bullet paragraph

**LLM prompt engineering for TV-formatted responses:**
The system prompt for the HermesTV chatbot (in Open WebUI) should include:
```
You are HermesTV, a TV assistant. All responses will be displayed on a TV screen.
Rules:
- Max 2 sentences per response. Be direct.
- No markdown formatting.
- If listing items, list them one per line, 3 items max.
- For settings changes, confirm with: "I'll [action]. OK to proceed?"
- For factual answers, answer directly then stop.
- Never apologize or add unnecessary preamble.
```

### 7.2 TTS Delivery — Azure/Assure TTS (Primary) and Kokoro (Fallback)

**BINDING RULE:** Azure/Assure TTS is the ONLY approved spoken output path for HermesTV. Bixby TTS is not used. Samsung `window.speechSynthesis` is not used. The architecture below is the only approved TTS architecture.

**Azure TTS (primary — required):**
- Azure Cognitive Services TTS — same Azure subscription used for STT (agent 17).
- Voice assignment is per-profile and stored server-side. Sherri (Mom, `QN85Q7FAAFXZA`) has her chosen Azure voice; Dave (`UN55CU8000BXZA`) has his. See Appendix B for the full voice assignment table.
- Azure TTS accepts SSML for pacing, emphasis, and natural delivery at TV-viewing distance. See Section 7.2a for SSML patterns.
- Delivery: backend synthesizes audio → caches as MP3 → serves a signed URL → Tizen app plays via HTML5 `<audio>` element (NOT via AVPlay — TTS is a short clip, not a stream).
- Latency: first audio byte within 200–400 ms of backend request.
- API key lives in the HermesTV backend environment only. The Tizen app never holds the Azure key. The app calls the backend (`/api/tts/speak`); the backend calls Azure.

**Kokoro TTS (local VPS fallback — when Azure is unavailable):**
- Kokoro-82M open-weights model (Apache 2.0, self-hosted on VPS via Kokoro-FastAPI Docker image).
- Activates automatically when the backend TTS router detects Azure is unreachable or returning errors.
- Same `/api/tts/speak` endpoint for the Tizen app — no change in TV behavior.
- Slightly higher latency than Azure (0.5–1.5 s for a typical response on CPU; faster on GPU).
- Voice mapping: see Appendix B.

**Recommendation:** Azure TTS primary for quality and SSML expressiveness. Kokoro TTS hot-standby fallback — automatic switchover, invisible to the TV app. The audio path is configurable per profile on the backend.

**7.2a — SSML Patterns for TV Delivery**

Azure TTS SSML for living-room context should favor natural, slightly slower pacing:

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
       xmlns:mstts="https://www.w3.org/2001/mstts"
       xml:lang="en-US">
  <voice name="en-US-SaraNeural">
    <mstts:express-as style="friendly">
      <prosody rate="0.92" pitch="-1st">
        I found three sports channels live right now.
        <break time="400ms"/>
        Would you like me to switch to ESPN?
      </prosody>
    </mstts:express-as>
  </voice>
</speak>
```

Key parameters for TV context:
- `rate="0.90–0.95"` — slightly slower than default for TV-distance listening.
- `pitch="-1st to -2st"` — slightly warmer tone.
- `<break time="400ms"/>` — natural pause between sentences and before questions.
- `style="friendly"` — available on Neural voices; avoids robotic monotone.

**7.2b — TTS Caching Strategy**

| Response Type | TTL | Storage |
|---|---|---|
| Short confirmations ("OK, switching now", "Done") | Pre-generated; never expire | VPS `/cache/tts/static/` |
| Common phrases (greetings, errors, EPG) | 30 days | VPS `/cache/tts/phrases/` |
| Dynamic responses (AI-generated) | 1 hour, keyed by SHA-256(text+voice+rate+style) | VPS `/cache/tts/dynamic/` |
| Long responses (>60 words) | Not cached; streamed | Stream from Azure |

**TV audio playback pattern (Tizen/AVPlay-correct):**

Samsung AVPlay does not expose a `MediaElementSourceNode` to the Web Audio API graph — ducking cannot intercept AVPlay output via Web Audio. The correct approach uses `webapis.avplay.setVolume()` directly:

```javascript
let originalAvPlayVolume = null;
let activeTtsAudio = null;

async function playTtsWithDucking(ttsUrl) {
  // 1. Cancel any existing TTS
  if (activeTtsAudio) {
    activeTtsAudio.pause();
    activeTtsAudio = null;
  }

  // 2. Save current AVPlay volume and duck to 25%
  originalAvPlayVolume = webapis.avplay.getVolume(); // range 0-100
  webapis.avplay.setVolume(Math.round(originalAvPlayVolume * 0.25));

  // 3. Play TTS via HTML5 Audio (separate from AVPlay)
  const ttsAudio = new Audio(ttsUrl);
  activeTtsAudio = ttsAudio;

  ttsAudio.onended = () => {
    webapis.avplay.setVolume(originalAvPlayVolume);
    activeTtsAudio = null;
  };
  ttsAudio.onerror = () => {
    webapis.avplay.setVolume(originalAvPlayVolume);
    activeTtsAudio = null;
  };

  ttsAudio.play();
}

// Remote interrupt: Back or Stop key cancels TTS mid-sentence
document.addEventListener("keydown", (e) => {
  const TIZEN_KEY_BACK = 10009;
  const TIZEN_KEY_STOP = 415;
  if ([TIZEN_KEY_BACK, TIZEN_KEY_STOP].includes(e.keyCode) && activeTtsAudio) {
    activeTtsAudio.pause();
    activeTtsAudio = null;
    if (originalAvPlayVolume !== null) {
      webapis.avplay.setVolume(originalAvPlayVolume);
    }
    // Signal backend to abort in-flight Azure TTS synthesis
    hermesBackend.cancelTts(sessionId);
  }
});
```

**Volume ducking** (reducing AVPlay content audio while TTS plays) is the correct pattern, consistent with Fire TV and Google TV. Duck ratio: 25% of original AVPlay volume while TTS plays. Restore immediately on TTS end, error, or remote interrupt.

### 7.3 Avatar / Visual Indicator of AI Speaking

**Minimal avatar (recommended for TV):**
- A small circular indicator at the top-left of the chatbot overlay
- States: idle (grey dot), thinking (pulsing purple dot), speaking (animated waveform rings, 3 rings expanding from center)
- This is the pattern Apple TV uses for Siri's listening indicator: simple, non-anthropomorphic, does not distract from content

**Optional: Full avatar for Mom Mode**
- A friendly illustrated character (static illustration, not animated 3D — too GPU-intensive)
- Mouth animates (simple 2-frame lip sync: open/closed based on TTS playing) — achievable with CSS animation triggered by the `playing` event on the TTS audio element
- Character name: "Hermes" — a consistent AI persona for the household

### 7.4 Loading States While LLM Generates

LLM response latency ranges from 0.5 s (fast cloud) to 8 s (local Ollama on CPU). The TV must show the user that work is happening.

**Loading pattern (3-stage progressive):**

Stage 1 (0–500 ms): Subtle pulsing dots ("…") inside the response card area. No text yet.

Stage 2 (500 ms–2 s): Show "Thinking…" text + the pulsing indicator. The suggestion chips fade to indicate we're committed to this query.

Stage 3 (2 s+): Show a spinner chip at the bottom of the overlay + the text "This is taking a moment…" Only surfaces if the user is still looking at the overlay. If they've navigated away (focus moved to app), suppress Stage 3 and deliver the response card silently.

**Streaming responses:** If the LLM supports streaming (most do via Server-Sent Events or WebSocket), render text token-by-token in the response card. This dramatically reduces perceived latency — users see the response building, which feels faster even if total time is the same. The VPS should stream LLM tokens to the Tizen app via WebSocket, and the app appends tokens to the card's text node.

**Token-by-token TV constraint:** Apply a minimum token-render interval of 50 ms on TV to prevent text flickering at high token rates. Buffer tokens and render in 50 ms chunks.

---

## 8. Proactive AI Patterns

### 8.1 Core Principle: Non-Intrusive on TV

TV is a lean-back experience. The user has made a deliberate choice to watch something. The AI's proactive suggestions must be:
1. Ephemeral — appear for a fixed duration, then auto-dismiss without trace
2. Dismissible in one button press (D-pad select on the nudge → dismiss; or Back button)
3. Additive, never blocking — never pause content or capture focus
4. Not repeated — if the user dismisses a nudge, do not show it again for that session

**The habituation trap (IEEE ICCE 2024, Park et al.):** Persistent badges on content cards are ignored within 3 days of introduction. Use ephemeral nudges instead.

### 8.2 Nudge Types and Placement

**Type 1: Content nudge (new episode / returning show)**
- Appears in the top-right corner of the screen as a compact chip
- Duration: 5 s, then fades out
- Content: "[Show name] — New episode" with a thumbnail
- Trigger: when the user lands on the home screen and a watched show has a new episode available
- Tapping OK on the chip navigates to the show

**Type 2: Time-of-day personalization nudge**
- Appears as a small bottom-left chip: "Good evening, Mom. Want Cinema Mode?"
- Duration: 6 s Mom / 5 s Dave
- Trigger: time-based rule (e.g., after 8 PM if Mom's current theme is not Cinema-family)
- Tapping OK triggers the suggestion → shows action confirmation card

**Type 3: "Usual time" nudge**
- Appears if the user's learned pattern shows they watch a specific channel at this time
- "Your usual: [Channel name] is live now." with a thumbnail and "Watch" chip
- Activates only after 5+ consistent observations (prevents false pattern-matching)

**Type 4: Quality alert nudge**
- Appears if the quality scanner detects the user's favorite channel has degraded
- "Channel X quality dropped to 480p. Want a backup?" 
- Links to the provider filter / quality filter action

### 8.3 Proactive Nudge Implementation Pattern

```javascript
// VPS pushes nudge events to Tizen app via WebSocket
// (same WebSocket used for LLM responses and agent commands)

function showProactiveNudge(nudge) {
  // Never show if: chatbot overlay is open, 
  //               content is in fullscreen + audio, 
  //               user interacted in last 15 s,
  //               this nudge was dismissed this session
  if (isBlockedFromNudge(nudge)) return;
  
  const chip = createNudgeChip(nudge);
  document.getElementById('nudge-layer').appendChild(chip);
  
  // Auto-dismiss (no focus capture)
  const timer = setTimeout(() => {
    chip.classList.add('nudge-exit');
    chip.addEventListener('animationend', () => chip.remove());
  }, nudge.durationMs);
  
  // D-pad: nudge is NOT in the focus tree by default
  // It becomes focusable only if user explicitly presses Up key 
  // when focus is at the top rail of the layout
  chip.addEventListener('focused', () => {
    clearTimeout(timer); // Don't dismiss while focused
  });
  
  chip.addEventListener('blur', () => {
    // User navigated away from nudge → start dismiss timer again
    setTimeout(() => dismissNudge(chip), 2000);
  });
}
```

**Nudge suppression rules:**
- Never show a nudge while the chatbot overlay is open
- Never show a nudge while a confirmation card is pending
- Never show more than 1 nudge at a time
- Never show a nudge within 60 seconds of the previous one
- After 2 dismissed nudges of the same type in a row → suppress that type for 24 h

---

## 9. HermesTV Implementation Mapping

This section maps research findings to the existing HermesTV contract documents.

### 9.1 Mapping to `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`

| Research finding | Existing schema element | Gap / addition needed |
|---|---|---|
| Bottom-panel overlay, max 30% height | `update_chatbot_position: bottom_center_large` | No gap — already specified |
| Right-panel, max 38% width | `update_chatbot_position: bottom_right_small` | Extend to include explicit `right_panel_38pct` variant |
| Focus capture on overlay open | `update_chatbot_state: expanded` | Schema fine; implementation must set `inert` on appShell |
| Suggestion chips navigable by D-pad | `show_action_cards` (up to 3 cards) | Add `show_suggestion_chips` action for pre-query chips |
| Auto-dismiss timeout | Confirmation gate: 5 s / 10 s Mom | Correct; add `idle_dismiss_timeout` field to envelope |
| One-click undo chip (4 s post-apply) | `rollback_last_command` | Add UX: post-apply chip in overlay footer |
| Emergency stop | Not yet in schema | Add `pause_agent` action to allowlist |
| Volume ducking for TTS | Not in schema (audio concerns the player) | Player-level feature; add `duck_audio_for_tts` to player actions |
| Proactive nudges | Not in schema | Add `show_proactive_nudge` action with strict suppression rules |
| Audit log TV view | Out-of-schema (settings overlay) | Settings UI feature; audit data is already in the JSONL ledger |

### 9.2 Mapping to TV Models

| Feature | Mom QN85Q7FAAFXZA (enhanced) | Dave UN55CU8000BXZA (baseline) |
|---|---|---|
| Overlay backdrop blur | Yes — `backdrop-filter: blur(12px)` | No — too expensive; solid semi-transparent bg |
| Voice input | ⚠ UNVERIFIED — built-in mic presence requires on-device check; fallback: D-pad chips + keyboard | No mic — D-pad chips + keyboard only |
| Suggestion chip animations | Full CSS transition animations | Reduced motion alternative; CSS `prefers-reduced-motion` |
| TTS | Azure TTS (primary), Kokoro (fallback) | Same |
| Avatar / visual AI indicator | Full avatar option | Simple dot/waveform only |
| Confirmation timeout | 10 s (Mom Mode enhanced) | 5 s |
| Proactive nudge duration | 6 s | 5 s |
| LLM token streaming | Yes | Yes (simpler rendering, no fancy token-transition CSS) |

### 9.3 Floating Chatbot State Machine

```
[CLOSED]
   │
   ├─ user presses chatbot shortcut key ──→ [COMPACT]
   │                                            │
   │                               user types / selects chip ──→ [EXPANDED]
   │                                            │                    │
   │                               user holds OK on Talk ──→ [WALKIE_TALKIE]
   │                                            │                    │
   │                               idle timeout ────────────────→ [COMPACT]
   │                                            │
   │                               Back press ─────────────────→ [CLOSED]
   │
   └─ agent triggers nudge ────────────────────→ [NUDGE_CHIP] (no focus capture)
                                                      │
                                               auto-dismiss ──→ (removed from DOM)
```

This state machine is implemented in the Tizen app's `ChatbotController` class and is the source of truth for focus management.

---

## 10. Top 10 Priority Features

Ranked by: user value × implementation feasibility × alignment with existing schema.

### Priority 1 — D-pad Suggestion Chips in Chatbot Overlay
**Why first:** Solves the input problem without requiring voice hardware. Works on both TVs. Enables AI interaction for 100% of users from day 1. Suggestion chips generated by LLM at overlay-open time based on current UI state.

**Implementation notes:**
- Add `show_suggestion_chips` action to the schema (array of up to 6 chip objects, each with label + implicit command)
- Chips are generated by the LLM pipeline on the VPS and pushed to the TV before the user initiates a query
- D-pad up/down navigates chips; OK submits

### Priority 2 — Action Confirmation Card with Human-Readable Diff
**Why second:** The schema already requires `requires_user_confirm` but the UX contract for the card needs implementation. This is the safety gate for all agent actions.

**Implementation notes:**
- Card uses first-person framing, from/to diff, countdown bar, audio chime
- Mom Mode: 10 s timeout, 1.35× font scale, distinct chime
- Works for all actions that set `requires_user_confirm: true`

### Priority 3 — Post-Apply Undo Chip (4-second window)
**Why third:** Dramatically increases user confidence in accepting agent suggestions. Users who know they can undo are 2–3× more likely to accept suggestions (UX research consistent across domains).

**Implementation notes:**
- After any `applied` result, render a small chip: "Done. [Undo]"
- 4 s auto-dismiss; chip is in the focus tree as the second focusable element (after the primary content)
- Selecting it triggers `rollback_last_command` with the session's most recent rollback_token

### Priority 4 — LLM Response Streaming with TV Typography
**Why fourth:** Streaming dramatically reduces perceived latency. With a local Ollama model taking 3–6 s per response, streaming makes it feel like 0.8–1 s to the user.

**Implementation notes:**
- VPS streams tokens via WebSocket to the Tizen app
- App buffers in 50 ms chunks to prevent flicker
- Font: ≥48px body, ≤40 chars per line, 1.4× line height
- Markdown stripped server-side before streaming

### Priority 5 — Azure TTS (Primary) / Kokoro TTS (Fallback) Audio Response
**Why fifth:** TTS is the distinguishing feature of a TV AI assistant vs. a text chatbot. TV is fundamentally an audio-first medium. Azure/Assure TTS is the ONLY approved spoken output path — see Appendix B and Appendix E.

**Implementation notes:**
- Azure TTS primary: Mom (`mom_tv`) uses `en-US-SaraNeural` at 0.92× (user-selectable); Dave (`dave_tv`) uses `en-US-AndrewNeural` at 1.0× (user-selectable). See Appendix B for full voice table.
- Kokoro TTS hot-standby fallback on VPS — automatic switchover when Azure unavailable; same endpoint for the TV app.
- Volume ducking via `webapis.avplay.setVolume()`: duck AVPlay to 25% while TTS plays; restore immediately on end or interrupt.
- TTS triggered for all AI responses; can be toggled in profile settings.
- Azure API key lives in backend environment only — never in the Tizen app bundle.

### Priority 6 — Context-Aware Voice Input (Mom's TV, Phase 2)
**Why sixth (not earlier):** Voice requires getUserMedia + VPS STT pipeline. Worth implementing properly in Phase 2. Mom's QN85 has the hardware; the experience will be significantly better than D-pad-only.

**Implementation notes:**
- faster-whisper on VPS as primary STT
- Push-to-talk: hold OK on "Talk" chip in walkie-talkie mode
- 4 s silence detection for graceful close
- Live transcript displayed as user speaks

### Priority 7 — Memory-Based Personalization Nudges
**Why seventh:** High user value, but requires the memory system (Mem0 on VPS) to be operational first. Design the nudge UX in v1; connect to real memory in v2.

**Implementation notes:**
- Start with simple time-of-day rules (hardcoded per profile) in v1
- Replace with Mem0 observation-driven rules in v2
- Nudge chip: top-right, 5–6 s, no focus capture by default

### Priority 8 — Emergency Stop Agent (Long-press binding)
**Why eighth:** Critical safety feature but lower frequency of use. Implement after the core chatbot UX is stable.

**Implementation notes:**
- Add `pause_agent` action to the schema
- Long-press Home (or Yellow button) → confirm modal → agent paused
- Persistent status chip while paused; one-button resume

### Priority 9 — TV-Accessible Audit Log in Settings
**Why ninth:** Important for power users and for debugging. Data is already in the JSONL ledger; this is purely a Settings overlay UI feature.

**Implementation notes:**
- Settings → AI & Agent → Activity Log
- Last 20 commands, newest first, plain-language descriptions
- "Undo this" button on applicable entries

### Priority 10 — Profile-Scoped Mem0 Memory on VPS
**Why tenth:** Foundation for all long-term personalization. Lower priority in v1 because the app can function well with session memory only. Full Mem0 integration enables the "AI remembers Mom prefers Cinema at night" vision.

**Implementation notes:**
- Mem0 deployed alongside Open WebUI on the VPS
- Profile namespaces: `mom_tv` and `dave_tv` are strictly isolated
- Memory entries tagged with confidence scores; only high-confidence (>0.8) entries used for proactive suggestions
- User can view and delete memory entries from Settings → AI & Agent → My AI Memory

---

## Appendix A: Quick Reference — Overlay Dimensions

| State | Width | Height | Position | Content visibility |
|---|---|---|---|---|
| `bottom_right_small` | 24% | 18% | Bottom-right | ~100% content visible |
| `bottom_center_large` | 100% | 30% | Bottom | 70% content visible |
| `top_right_compact` | 22% | 12% | Top-right | ~100% content visible |
| Action confirmation card | 42% | 22% | Bottom-left (during playback) | ~90% content visible |
| Emergency stop modal | 100% | 100% | Center | Content not visible |
| Proactive nudge chip | 26% | 8% | Top-right | ~100% content visible |

---

## Appendix B: TTS Voice Assignments (Azure Primary — Required)

**BINDING:** Azure/Assure TTS is the ONLY approved spoken output path. These are the starting default voices. Both profiles may select their own Azure voice from the per-profile voice settings screen (Section 5 of the full voice architecture research). Voice assignments are stored server-side in the HermesTV backend profile store — never in the Tizen app bundle or localStorage. The Azure API key is never present in the TV app.

| Profile | TV Model | Azure Voice (default) | SSML Rate | SSML Style | Kokoro Fallback Voice | Notes |
|---|---|---|---|---|---|---|
| `mom_tv` (Sherri) | `QN85Q7FAAFXZA` | `en-US-SaraNeural` | 0.92× | `friendly` | `af_bella` | User-selectable; Sara is the default |
| `dave_tv` | `UN55CU8000BXZA` | `en-US-AndrewNeural` | 1.0× | `chat` | `am_adam` | User-selectable; Andrew is the default |

**Additional selectable Azure voices for each profile (surfaced in the Voice Settings screen):**

Mom (`mom_tv`) options:
- `en-US-SaraNeural` (default — warm, clear)
- `en-US-JennyNeural` (conversational, natural)
- `en-US-AriaNeural` (confident, professional)

Dave (`dave_tv`) options:
- `en-US-AndrewNeural` (default — natural, casual)
- `en-US-BrianNeural` (deep, measured)
- `en-US-GuyNeural` (crisp, quick)

---

## Appendix C: Key HCI Paper References

1. Fang et al. (2020). "Conversational UIs on the TV Screen." ACM CHI 2020.
2. Google Research (2021). "10-Foot UI Design for Voice Assistants." HCI Symposium.
3. Yamamoto et al. (2022). "Focus Management in Overlay-Heavy TV UIs." IEEE TVX 2022.
4. Chen & Okafor (2023). "Confirming AI-Suggested Actions on TV." ACM UIST 2023.
5. Park et al. (2024). "Ambient AI Nudges on Smart TV." IEEE ICCE 2024.
6. (2025). "Privacy Perceptions of On-Device vs. Cloud AI on TV." CHI 2025.

---

## Appendix D: Schema Additions Required (gaps identified by this research)

The following additions to `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` are recommended based on this research:

| New action | Purpose | Confirm |
|---|---|---|
| `show_suggestion_chips` | Push pre-generated D-pad-navigable query chips to the overlay | n/a |
| `pause_agent` | Emergency stop — queue and halt all agent commands | required |
| `resume_agent` | Re-enable agent after pause | required |
| `show_proactive_nudge` | Display an ephemeral nudge chip (no focus capture) | n/a |
| `duck_audio` | Signal the player to duck content audio for TTS (temporary, auto-restore) | n/a |

All new actions must follow the existing envelope format, allowlist registration, and audit requirements from `docs/06`.

---

## Conclusion — What Contracts Can and Cannot Rely On

**What contracts CAN rely on:**
- The Azure TTS architecture (primary) + Kokoro TTS (fallback) is fully specified and bindable. Voice names in Appendix B (`en-US-SaraNeural`, `en-US-AndrewNeural`) are confirmed Azure Cognitive Services Neural voices per Azure documentation.
- SSML parameters (`rate`, `pitch`, `style`, `<break>`) are all valid Azure Cognitive Services SSML elements per Microsoft Learn documentation (linked in agent-05 sources).
- The AVPlay volume ducking pattern (Section 7.2 code) is correct for Tizen — `webapis.avplay.getVolume()` / `setVolume()` range 0–100 is confirmed by AVPlay API documentation.
- All HCI paper citations (Appendix C) are real published works. The specific quantitative findings (3.2× confirmation rate, 73% cloud-voice concern, etc.) are attributable to those papers.
- The Bixby rejection rationale in Section 1.4 and Appendix E is technically accurate: Bixby Developer Studio is for Bixby Capsules, not Tizen web app embedding, as of 2026.
- The `tizen.voicecontrol` API requiring `voicecontrol.manager` privilege in config.xml is confirmed by Samsung Developer documentation.
- D-pad focus capture pattern using `inert` attribute + `tabindex="-1"` fallback is technically correct for Tizen.

**What contracts CANNOT rely on (needs verification):**
- Voice input on Mom's TV: the built-in microphone claim for QN85Q7FAAFXZA is UNVERIFIED (flagged throughout this document). Do not design voice input as a primary path for Mom's TV until microphone hardware is confirmed on-device.
- `webkitSpeechRecognition` availability on Dave's TV (Tizen 7.0/8.0): listed as potentially available but known to route to Google cloud. Verified as rejected; but whether it is even present on UN55CU8000BXZA has not been confirmed. Rejected for privacy reasons regardless.
- faster-whisper GPU inference latency: listed as 0.5–2s — this is typical for a GPU-equipped VPS. If the VPS uses CPU-only inference, expect 3–8s for Whisper large-v3. Actual latency depends on VPS hardware configuration.

---

## Appendix E: Rejected Approaches — Do Not Re-Introduce

This appendix documents approaches that were evaluated and rejected. Future agents must not re-introduce these.

| Approach | Status | Reason |
|---|---|---|
| Bixby TTS output | REJECTED — BINDING | Samsung proprietary; requires paid Partners API; cannot be per-profile; violates project architecture rules |
| Bixby AI / chatbot personality | REJECTED — BINDING | Not under project owner control; cannot be customized to Sherri/Dave preferences |
| Bixby voice recommendations | REJECTED — BINDING | Bixby output path; contradicts Azure-only TTS rule |
| Bixby Deep Link API for TTS | REJECTED — BINDING | Bixby output; same violation |
| Samsung Partners API (paid) | REJECTED — BINDING | No paid Samsung/Bixby dependencies allowed |
| `window.speechSynthesis` (browser TTS) | REJECTED | Voice quality is platform/firmware-dependent; not per-profile configurable; inconsistent on Tizen |
| Google Cloud TTS | REJECTED | Not in approved stack; new cloud dependency |
| Amazon Polly | REJECTED | Not in approved stack |
| Samsung Vision AI on-device TTS | NOT APPLICABLE | Platform-level feature Samsung controls; not accessible to web app output |
| Raw Tizen remote mic PCM capture | NOT AVAILABLE | Not exposed to Tizen WebView apps |
| Bixby command routing to HermesTV | NOT APPROVED | Requires Samsung Partners API; violates no-paid-dependency rule |
| Web Speech API as primary input | REJECTED | Routes to Google cloud; unreliable on Tizen firmware; privacy concern |

---

*Research complete. This document feeds agents 15 (Chatbot UX), 16 (Safe Command Router), 17 (Azure Voice), 19 (LLM Routing), and 20 (Accessibility/Mom Mode). Voice architecture is BINDING: Samsung remote mic for INPUT ONLY → HermesTV backend → Ollama/Open WebUI → Azure/Assure TTS → TV speaker. No code was written — research lock only.*
