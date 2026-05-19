# HermesTV — Chatbot Command Reference

**Version:** 1.1.0
**Date:** 2026-05-19
**For:** Dave and Sherri

This guide explains how to use the HermesTV chatbot and covers every command you can say or type to it.

---

## 1. How to Open the Chatbot

Look for the small floating circle in the **bottom-right corner** of the screen. That is Hermes (or whatever name you have given the assistant).

- **Tap or click it once** — the chatbot opens in compact mode, showing your last two messages and a text box.
- **Tap the expand icon** (the arrows in the chatbot header) — it opens fully so you can see your full history.
- **Tap the microphone icon** in the chatbot header — it switches to walkie-talkie voice mode (coming fully live in B3; currently shows a placeholder with text fallback).

### Quick chips

When the chatbot is open, a row of shortcut buttons appears above the text box. These are quick chips — single-tap buttons for the most common commands. You do not have to type anything; just tap the chip that matches what you want.

### To close the chatbot

Tap the X button in the chatbot header, or tap anywhere outside the chatbot panel.

---

## 2. All Commands

Type any of the following phrases into the chatbot text box, then press Enter (or the OK button on your remote). You do not need to match the capitalization exactly — the chatbot is not case-sensitive.

Commands are grouped below by what they do.

### Content Filters

These narrow down what you see in the catalog.

| Say this... | What happens |
|---|---|
| `show movies` | Filters the catalog to movies only |
| `show series` | Filters to TV series only |
| `show live` | Filters to live channels only |
| `show 4K` | Shows only channels and titles available in 4K quality |
| `show apollo` | Filters the catalog to Apollo Group content only |
| `show xtremehd` | Filters the catalog to XtremeHD content only |
| `show all providers` | Removes any provider filter — shows everything from both providers |
| `show hallmark` | Filters to Hallmark Channel entries (great shortcut for Sherri) |
| `show sports` | Filters to sports channels (great shortcut for Dave) |
| `show action` | Filters to action genre titles |
| `show mysteries` | Filters to mystery genre titles |
| `show family` | Filters to family-rated content |

### Appearance — Layout and Tile Size

These change how the screen is arranged.

| Say this... | What happens |
|---|---|
| `bigger tiles` | Makes the content tiles larger (switches to XL tile size in the current layout) |
| `large tiles` | Same as "bigger tiles" — increases tile size to large/XL |

### Appearance — Theme and Colors

These change the color palette of the whole app.

| Say this... | What happens |
|---|---|
| `dark theme` | Switches to a dark color theme. On Sherri's TV this applies Mom Calm (a softer dark palette). On Dave's TV this applies Midnight Steel |
| `dark mode` | Same as "dark theme" |
| `light theme` | Switches to a light color theme (Morning Paper or Mom Garden, depending on your profile) |
| `premium theme` | Applies the Cinema Velvet premium dark theme |
| `cinema theme` | Same as "premium theme" |

### Performance

| Say this... | What happens |
|---|---|
| `low memory mode` | Reduces background animation and cache use to free up memory. Note: this command only works on Dave's TV — it is blocked on Sherri's TV by design (see Sherri's notes below) |
| `performance mode` | Same as "low memory mode" |

### Profiles and Modes

These switch the whole app to a preset bundle of layout, theme, and content filters.

| Say this... | What happens |
|---|---|
| `mom mode` | Switches the entire app to Sherri's layout — larger tiles, bigger text, warmer colors, and Sherri's content preferences. Works from either profile |
| `sherri mode` | Same as "mom mode" |
| `dave mode` | Switches the app back to Dave's layout, theme, and content filters |

### What is Playing Right Now

| Say this... | What happens |
|---|---|
| `what is this` | Shows information about the currently selected channel or title — name, description, genre, and quality |
| `find more with this actor` | Searches the catalog for other titles featuring the actor shown in the current selection |

### Search

| Say this... | What happens |
|---|---|
| `search` | Opens the global search overlay (same as pressing **/** or **Ctrl+K** on the keyboard) |
| `open search` | Same as `search` |
| `search for` | Same as `search` |
| `find something` | Same as `search` |

### Play the Focused Item

These act on whatever you have selected on screen — a tile in the catalog, a card in the detail panel, etc. If nothing is focused, the command is a silent no-op.

| Say this... | What happens |
|---|---|
| `play this` | Starts playback of the focused item |
| `play it` | Same as `play this` |
| `watch this` | Same as `play this` |
| `watch it` | Same as `play this` |

### Record (DVR)

These open the **Schedule Recording** dialog for whatever live channel is on screen — the focused MediaDetailPanel item, or the channel currently in PlayerModal. If nothing live is on screen, the command is a silent no-op.

| Say this... | What happens |
|---|---|
| `record this` | Opens Schedule Recording for the focused live channel |
| `schedule recording` | Same as `record this` |
| `record now` | Same as `record this` |

---

## 3. Notes for Sherri

- **Text size is always protected.** Hermes will never shrink your text below 1.35x (about 35% larger than the default). If you type a command that would reduce font size below this level, the app ignores that part of the command and keeps your text at a safe size. The minimum the system will ever go is 1.25x, even if Dave switches to your profile and adjusts settings.
- **"Mom mode" always restores your full setup.** If something looks wrong — tiles are too small, the colors changed, or the content list seems off — just type `mom mode` and everything snaps back to your saved preferences.
- **Audio confirmation is coming.** In the next update (B3), after you type or say a command, Hermes will speak a short confirmation out loud through your TV's speakers using Azure voice — for example: *"OK, switching to Hallmark now."* In the current version, commands work silently (the screen changes but there is no voice reply yet).

---

## 4. Notes for Dave

- **Most commands work in the browser too.** If you are testing HermesTV in a PC browser while using the TV as a monitor, all chatbot commands function the same way. The chatbot panel is fully interactive with a mouse.
- **"Mom mode" switches the whole app, not just a tab.** Typing `mom mode` replaces your current layout and theme with Sherri's settings for the rest of that session. To go back to your own setup, type `dave mode`.
- **"Low memory mode" is available on your TV.** Because Dave's TV is a UN-series model, you can use `low memory mode` to reduce background effects if the app feels sluggish. This command is automatically blocked on Sherri's QN-series TV (her TV is always fully powered on).
- **4K filter works with your providers.** `show 4K` filters to 4K-tagged entries from both Apollo Group and XtremeHD. In mock mode you will see placeholder 4K entries; on real provider data, only genuine 4K streams appear.

---

## 5. What Commands Do NOT Do

To be clear about what Hermes cannot and will never do through the chatbot:

- **Commands do not touch your provider login details.** Portal URLs, usernames, passwords, and API keys are stored separately in a secure vault and are completely unreachable from the chatbot. Typing any word like "password", "token", "api_key", or "secret" causes the chatbot to immediately reject the message with an error — nothing is sent to the server.
- **Commands do not change stream URLs.** The actual addresses your TV uses to receive video are not accessible to the chatbot or any agent command.
- **Commands do not access private config files.** Backend settings, VPS server addresses, and provider endpoints are locked in the backend and cannot be read or changed through the chatbot.
- **Commands do not affect the other person's profile.** Typing `mom mode` while on Dave's profile changes your own view to Sherri's layout — it does not modify Sherri's saved profile. Each person's favorites, watch history, and preferences are kept completely separate.

---

## 6. Offline Behavior

The chatbot keeps working even when the backend server is temporarily unreachable.

- Commands are matched on the device itself (local matching), so switching themes, changing tile size, switching to mom mode, and adjusting content filters all work without an internet or server connection.
- When the server is offline, the chatbot shows a small indicator. Commands that only need the app (layout, theme, filters) still apply immediately. Commands that require the server — like fetching new catalog data — are queued and completed when the connection returns.
- There is no message saying the command failed just because the server is offline. If the action can be done locally, it is done locally.

---

## 7. Coming in B3

The next major update adds:

- **Voice confirmation from Hermes.** After you type or say a command, Hermes will speak a brief confirmation through the TV speakers using Azure voice. For example: *"OK, switching to Hallmark now."* or *"Done — dark theme applied."* This uses Azure Cognitive Services voice only (not Samsung Bixby or any built-in TV voice).
- **More commands.** The B3 command set is being expanded. Additional genre filters, layout presets, and personalization shortcuts are planned.
- **Walkie-talkie voice input.** The microphone button in the chatbot header will accept real push-to-talk input using the Samsung mic, with the spoken query transcribed and matched to the command list.

---

*For setup help, see `docs/17_FIRST_RUN_FOR_DAVE_AND_SHERRI.md`. For the full technical command schema used by agents, see `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`.*
