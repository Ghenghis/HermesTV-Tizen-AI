# 17 — First Run Guide for DaveTV — Dave and Sherri

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This guide walks through the first-run experience for each profile of **DaveTV**, the user-facing app name. Follow `docs/16_TODAY_READY_SETUP_GUIDE.md` first to get the app running, then come back here.

---

## For Dave — UN55CU8000BXZA profile

### Selecting the Dave profile

On the profile picker screen, click **Dave**.

The app loads Dave's profile immediately. No password or confirmation required in mock mode.

### TV model and performance tier

Dave's TV model is **UN55CU8000BXZA**. The `UN` prefix tells the system this is a Crystal UHD entry-level Samsung. The app detects this at boot and applies **standard mode** automatically.

What standard mode means for Dave:
- Catalog grid shows **4 columns maximum** (optimized for UN-class performance).
- Background animations are reduced to static gradients and slow fades.
- No animated focus rings (static thick ring only).
- `SourceComparePanel` is suppressed — a compact single-row quality badge replaces it.
- Font scale defaults to 1.0 (100%).

You do not need to configure this. It is automatic based on the TV model string.

### What Dave sees in the catalog

Dave's content profile is pre-configured for:
- **Sports channels** — ESPN, NFL RedZone, and related entries appear first.
- **Action movies** — featured prominently in the first category row.
- **Series** — drama and action series in a separate row.
- **Provider filter** — shows entries from both Apollo Group and XtremeHD catalogs.

The default layout for Dave is `classic_cable_grid` — a familiar grid look similar to what a cable TV guide shows.

### Switching between providers

In the catalog header there is a **Provider** filter chip. Click it to toggle between:
- `Apollo Group` only
- `XtremeHD` only
- `All providers`

In mock mode, both providers show placeholder content. The filtering itself is fully functional.

### Dave's chatbot commands

Open the chatbot (floating circle, bottom-right) and try:

| Command | What it does |
|---|---|
| `show dave mode` | Restores Dave's default layout, theme, and content filters if you have changed them |
| `show live` | Filters the catalog to live channel entries only |
| `show action` | Filters to action genre |
| `dark theme` | Applies Midnight Steel dark theme |
| `show 4K` | Shows only 4K entries |
| `show apollo` | Filters to Apollo Group catalog only |
| `show sports` | Filters to sports channels |

### Performance notes for Dave's TV

Because the UN55CU8000BXZA is a standard-tier TV:
- The 4-column grid maximum is a hard cap for performance, not a style choice.
- Agents cannot permanently upgrade Dave's TV to enhanced tier. This is by design.
- Dave can adjust his own settings (font size, theme, layout) through the Settings panel without these caps applying — user-initiated adjustments are always allowed.

---

## For Sherri / Mom — QN85Q7FAAFXZA profile

### Selecting the Sherri profile

On the profile picker screen, click **Sherri**.

The app loads Sherri's profile. The screen layout changes immediately — you will notice larger tiles, bigger text, and a warmer color palette compared to Dave's profile.

### TV model and performance tier

Sherri's TV model is **QN85Q7FAAFXZA**. The `QN` prefix tells the system this is a QLED Samsung. The app detects this at boot and applies **enhanced mode** automatically.

What enhanced mode means for Sherri:
- Catalog grid shows up to **8 columns** in the discovery wall layout.
- **Cinematic hero banner** at the top of the catalog with a featured title and background art.
- **Animated focus ring** (glowing animated style) on the selected tile.
- Full **SourceComparePanel** available for comparing provider quality.
- **Animated background** — slow-fade gradient or ambient motion pack (depending on theme).
- Font scale defaults to **1.35x** for comfortable viewing at typical TV-watching distance.

Enhanced mode is never artificially reduced on Sherri's TV. This is a hard system rule.

### What Sherri sees in the catalog

Sherri's content profile is pre-configured for:
- **Hallmark Channel** — appears at the top of the content list.
- **Lifestyle content** — cooking, home, and garden channels.
- **Family movies** — featured in the hero banner and first movie row.
- **Mysteries** — featured in a dedicated row.

The default layout for Sherri is `mom_jumbo_rail` — large tiles on a horizontal rail, easy to navigate with TV remote or click.

### Font and visual accessibility

Sherri's profile uses a 1.35x font scale by default. This means:
- Channel names and titles are approximately 35% larger than the base size.
- The minimum font scale for Sherri's profile is **1.25x**. It cannot be reduced below that by any automated agent without an explicit user-confirmed step.
- Reduced motion is off by default (animations are on). Sherri can toggle reduced motion in Settings if preferred.

### Enhanced animations

On the QN TV, Sherri's profile features:
- Smooth tile selection animations (400ms ease-out).
- Hero banner crossfade transitions between featured titles.
- Background ambient motion (slow-moving gradient pack by default).
- Source quality bars animate when the detail panel opens.

All animations respect system accessibility settings. If "Reduce Motion" is enabled in Settings, all animations fall back to instant transitions.

### Sherri's chatbot commands

Open the chatbot (floating circle, bottom-right) and try:

| Command | What it does |
|---|---|
| `show mom mode` | Restores Sherri's default layout, theme, and content filters |
| `show hallmark` | Filters to Hallmark Channel entries |
| `show movies` | Filters the catalog to movies only |
| `bigger tiles` | Increases tile size to XL (largest available in the current layout) |
| `light theme` | Applies Mom Garden or Morning Paper light theme |
| `dark theme` | Applies Mom Calm dark theme (softer dark palette optimized for Sherri's profile) |
| `show mysteries` | Filters to mystery genre |
| `show family` | Filters to family-rated content |

### Audio feedback (coming in B3)

Sherri's profile has audio feedback enabled for chatbot responses. In B3, when a command is accepted, Azure TTS will speak a brief confirmation ("OK, switching to Hallmark now."). In mock mode (B2), TTS is stubbed — the chatbot processes commands and updates the UI silently.

### Protecting Sherri's settings

The system prevents automated agents from:
- Switching Sherri out of Mom Mode without an explicit user-confirmed step.
- Reducing her font scale below 1.25x.
- Disabling audio feedback (when it is live in B3).
- Disabling reduced motion without confirmation.

These protections are enforced in the agent command router (`docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`), not just in the UI. They apply even if an agent or external command tries to override them.

---

## Switching between profiles mid-session

You can switch between Dave and Sherri at any time without restarting:

1. Click the profile name in the top-left corner.
2. Select the other profile from the picker.
3. The entire UI — layout, theme, content filter, font scale — swaps instantly to the selected profile's saved state.

Settings changes you make in one profile do not affect the other profile.

---

## Next steps

- `docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md` — push to the actual Samsung TV when ready.
- `docs/19_PROVIDER_ONBOARDING_WITHOUT_SECRETS.md` — add real Apollo Group or XtremeHD credentials safely.
- `docs/proof/B2_USABLE_LOCAL_MOCK_RUNBOOK.md` — exact commands to verify mock mode is fully working.

_(Rebranded HermesTV → DaveTV 2026-05-19 per user request; repo URL and local path are technical identifiers and remain unchanged.)_
