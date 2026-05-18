# 16 — Running HermesTV Today — Local Mock Mode

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.
Audience: Dave — tech-savvy, not a developer. No terminal expertise required.

This guide covers everything you need to run HermesTV on your PC right now, in Local Mock Mode. No real TV, no streaming account, no credentials required.

---

## Prerequisites

You need these installed before starting. All are free.

| Tool | Version | Where to get it |
|---|---|---|
| Node.js | 20 or higher | https://nodejs.org (download LTS) |
| npm | comes with Node.js | — |
| Git | any recent version | https://git-scm.com/downloads |
| Chrome or Edge | any current version | already on your PC |

To verify Node.js is installed, open a terminal (PowerShell or Command Prompt) and run:

```
node --version
```

You should see something like `v20.x.x`. If you see an error, install Node.js first.

---

## Step 1 — Clone the repo

If you have never downloaded the project before, run this once:

```bash
git clone https://github.com/Ghenghis/HermesTV-Tizen-AI.git
cd HermesTV-Tizen-AI
```

If you already have the folder from a previous session, skip this step and just open a terminal in the `HermesTV-Tizen-AI` folder.

---

## Step 2 — Install dependencies

From inside the `HermesTV-Tizen-AI` folder, run:

```bash
npm run install:all
```

This installs everything for both the backend API and the web app in one command. It takes about 1–2 minutes on a normal connection. You only need to do this once (or after pulling new code).

---

## Step 3 — Start the backend API (Terminal 1)

Open a terminal, navigate to the `HermesTV-Tizen-AI` folder, and run:

```bash
npm run start:api
```

Leave this terminal open. You should see:

```
[HermesAPI] hermes-tv-api v0.1.0 listening on port 3001
```

If you see that line, the API is running. Do not close this terminal while using the app.

---

## Step 4 — Start the web app (Terminal 2)

Open a **second** terminal, navigate to the same `HermesTV-Tizen-AI` folder, and run:

```bash
npm run dev:web
```

You should see:

```
  Local:   http://localhost:5173
```

---

## Step 5 — Open the app in your browser

Open Chrome or Edge and go to:

```
http://localhost:5173
```

That is it. The app loads in your browser window.

---

## What you will see

### Profile picker

The first screen is a profile picker. You will see two profiles:

- **Dave** — your profile (UN55CU8000BXZA — standard mode)
- **Sherri** — Mom's profile (QN85Q7FAAFXZA — enhanced mode)

Click a name to enter that profile.

### Catalog grid

After picking a profile you land in the catalog grid. It shows mock content organized by category. The layout and number of columns adjusts based on the profile you picked.

---

## How to switch profile

Click your profile name in the **top-left corner** of the screen. A dropdown or picker appears letting you switch to the other profile without restarting anything.

---

## How to change TV model

Click the **gear icon** (settings) in the top-right corner. Inside settings there is a dropdown labeled "TV Model." Changing the TV model adjusts performance tier (QN = enhanced, UN = standard) and layout density. In mock mode this is instant — no reboot needed.

---

## How the chatbot works

You will see a **floating circle** in the **bottom-right corner** of the screen. Click it to open the chatbot panel. Type a command in the text box and press Enter.

The chatbot parses your command and applies it immediately to the UI. No page reload.

---

## Commands that work today (mock mode)

These commands are fully functional right now:

| What to type | What happens |
|---|---|
| `show movies` | Filters the catalog to movies only |
| `show 4K` | Filters to 4K content only |
| `mom mode` | Switches to Mom preset (larger font, calm theme, Hallmark-friendly layout) |
| `dark theme` | Switches to the dark theme (Midnight Steel) |
| `show apollo` | Filters to Apollo Group catalog entries |
| `show live` | Filters to live channel entries |
| `show action` | Filters to action genre |
| `show hallmark` | Filters to Hallmark channel entries |
| `bigger tiles` | Increases tile size in the grid |
| `dave mode` | Switches to Dave preset (sports-first layout, standard columns) |
| `show 1080p` | Filters to 1080p content |
| `light theme` | Switches to a light theme variant |

More commands are added as development continues. If a command is not recognized, the chatbot displays a "not understood" message and does nothing else.

---

## Limitations in mock mode

These things are intentionally not real in mock mode:

- **No actual TV required.** The app runs entirely in your browser.
- **No real streaming.** Clicking a content tile does not play video. Playback is a placeholder.
- **No real provider accounts.** Apollo Group and XtremeHD entries are fictional placeholder data.
- **No real quality scores.** Source health bars show static mock scores from the catalog file.
- **No voice output.** Azure TTS is stubbed — the chatbot processes your text but does not speak aloud.
- **No EPG schedule.** Guide data is placeholder only.

---

## What is real right now

Even in mock mode, these features are fully implemented and working correctly:

- **UI layout system** — all 12 layout presets from `docs/04` switch instantly.
- **Theme engine** — all 24 themes from `docs/05` apply immediately.
- **Profile system** — Dave and Sherri profiles are independent with separate settings.
- **Chatbot command routing** — commands are parsed, validated against the safe JSON schema (`docs/06`), and applied.
- **Quality badges** — resolution labels (4K, 1080p, etc.) and health tier colors display correctly.
- **Tier detection** — QN-prefix TV model = enhanced tier (Sherri gets all enhanced features). UN-prefix = standard tier (Dave gets correct performance footprint).
- **Cinematic metadata panel** — clicking a content tile shows plot, cast, and source health panel.
- **Actor cards** — mock cast members appear in the detail panel.

---

## Stopping the app

Press `Ctrl+C` in each terminal to stop the API and the web app. Your browser tab will go blank — that is normal.

---

## Next steps

- `docs/17_FIRST_RUN_FOR_DAVE_AND_SHERRI.md` — detailed first run walkthrough for each profile.
- `docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md` — when you are ready to push to the actual Samsung TV.
- `docs/19_PROVIDER_ONBOARDING_WITHOUT_SECRETS.md` — how to add Apollo Group or XtremeHD safely.
