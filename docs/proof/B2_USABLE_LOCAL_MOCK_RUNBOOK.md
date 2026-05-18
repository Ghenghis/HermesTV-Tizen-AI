# B2 Local Mock Runbook

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Milestone: B2 — Usable Local Mock
Branch: `feature/b2-usable-local-mock`

This runbook contains exact commands to bring up the full B2 mock stack and verify it is working correctly. Run these steps in order.

---

## Exact commands

```bash
# 1. Clone (if not already done)
git clone https://github.com/Ghenghis/HermesTV-Tizen-AI.git
cd HermesTV-Tizen-AI

# 2. Install all dependencies
npm run install:all

# 3. Validate schemas (optional but recommended)
npm run validate:schemas

# 4. Run no-secret audit (optional but recommended)
bash tools/secret-scan.sh

# 5. Start the backend API (Terminal 1)
npm run start:api
# Should print: [HermesAPI] hermes-tv-api v0.1.0 listening on port 3001

# 6. Start the web app (Terminal 2)
npm run dev:web
# Should print: Local: http://localhost:5173

# 7. Open in browser
# http://localhost:5173
```

---

## Expected output at each step

### Step 2 — `npm run install:all`

```
> hermes-tv-root@0.1.0 install:all
> npm install && npm install --prefix apps/hermes-tv-api && npm install --prefix apps/hermes-tv-web

added N packages in Xs
added N packages in Xs
added N packages in Xs
```

No errors. If you see a red `npm ERR!` line, check that Node.js 20+ is installed (`node --version`).

### Step 3 — `npm run validate:schemas`

```
> Validating schemas...
  [OK] schemas/commands/update_layout.json
  [OK] schemas/commands/update_theme.json
  [OK] schemas/catalog/catalog.mock.json
  ... (all schema files listed)
Schema validation complete. 0 errors.
```

If any schema shows `[FAIL]`, a contract file has drifted from its schema definition. Fix before proceeding.

### Step 4 — `bash tools/secret-scan.sh`

```
Scanning for secrets...
  [CLEAN] apps/
  [CLEAN] docs/
  [CLEAN] schemas/
  [CLEAN] tools/
No secrets found. Safe to commit.
```

If any file shows `[WARNING]` or `[SECRET]`, do not commit and investigate the flagged file immediately.

### Step 5 — `npm run start:api`

```
[HermesAPI] hermes-tv-api v0.1.0 listening on port 3001
[HermesAPI] Mock mode: ON — no real provider connections
[HermesAPI] Catalog loaded: catalog.mock.json (N entries)
[HermesAPI] TTS: stub (Azure not configured)
[HermesAPI] QR onboarding: placeholder (B2 mock)
```

### Step 6 — `npm run dev:web`

```
  VITE v5.x.x  ready in Nms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

---

## Verification checklist

After reaching Step 7, verify each item in the browser:

| Check | Pass criteria |
|---|---|
| Profile picker loads | Dave and Sherri cards visible, no blank screen |
| Select Dave profile | Grid loads, 4-column max, standard layout |
| Select Sherri profile | Grid loads, up to 8 columns, larger tiles, larger font |
| Chatbot opens | Floating circle bottom-right responds to click |
| `dark theme` command | Theme changes without crash or blank screen |
| `mom mode` command | Layout switches to mom_jumbo_rail preset |
| `show 4K` command | Catalog filters to 4K entries only |
| `show apollo` command | Catalog filters to Apollo Group entries |
| Content tile click | MediaDetailPanel opens with plot, cast, quality bar |
| Actor cards visible | At least one actor card renders in detail panel |
| Source health bar | Quality score bar renders with correct color tier |
| SourceComparePanel | Visible for Sherri (QN), absent for Dave (UN) |
| Settings gear icon | Opens settings panel with TV model dropdown |
| TV model change | Switching from QN to UN hides enhanced features |
| Profile switch | Switching Dave → Sherri changes layout and font size |
| Back navigation | Browser Back or Escape returns to prior screen |

---

## What is mock-only in B2

The following are intentionally not real in this milestone:

| Feature | Mock behavior | Real version |
|---|---|---|
| All catalog content | Placeholder entries from `catalog.mock.json` | B3: real M3U from Apollo/XtremeHD |
| Source health scores | Static values from `catalog.mock.json` | B3: real ffprobe quality scanner |
| Provider connection status | Always `ok` | B3: real provider health polling |
| TTS voice responses | Stub — returns HTTP 202, no audio | B3: Azure Cognitive Services TTS |
| QR onboarding | Placeholder code `HRM-M0K`, no real form submit | B3: real local-network setup form |
| Video playback | Placeholder player panel, no stream | B4: AVPlay on real Tizen TV |
| EPG schedule data | Not present | B4: Threadfin or XMLTV source |

---

## What requires real infrastructure for later milestones

| Requirement | Where needed | Setup guide |
|---|---|---|
| AVPlay video playback | Samsung TV with Tizen 6.5+ | `docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md` |
| Tizen sideload | Authkey at `G:\private\authkey` + TV in developer mode | `docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md` |
| Apollo Group / XtremeHD streams | Credentials in `G:\private\hermestv.env` | `docs/19_PROVIDER_ONBOARDING_WITHOUT_SECRETS.md` |
| Azure TTS voice | Azure Cognitive Services subscription key | B3 milestone docs (pending) |
| EPG schedule data | Threadfin or XMLTV source configured | B4 milestone docs (pending) |
| VPS backend | Hostinger VPS SSH access + deployment key | B4 milestone docs (pending) |

---

## Proof artifacts for B2 sign-off

The following artifacts must exist before B2 is considered complete:

| Artifact | Location | Description |
|---|---|---|
| Schema validation pass | CI log or `proof/schema-validation-<date>.txt` | All schemas validate clean |
| Secret scan pass | CI log or `proof/secret-scan-<date>.txt` | No secrets in tracked files |
| Profile picker screenshot | `proof/screenshots/profile-picker.png` | Both Dave and Sherri visible |
| Dave catalog screenshot | `proof/screenshots/dave-catalog.png` | 4-column standard layout |
| Sherri catalog screenshot | `proof/screenshots/sherri-catalog.png` | 8-column enhanced layout |
| MediaDetailPanel screenshot | `proof/screenshots/media-detail-panel.png` | Plot, cast, quality bar visible |
| Chatbot command log | `proof/agent-commands/<session_id>.jsonl` | At least 5 commands executed |
| QN vs UN tier proof | `proof/tier-detection/<tv_model>.json` | Both models detected correctly |

---

## Known issues and workarounds in B2

| Issue | Workaround |
|---|---|
| `npm run install:all` fails on Windows with EPERM error | Run terminal as Administrator |
| Port 3001 already in use | Find and kill the process using port 3001: `npx kill-port 3001` |
| Port 5173 already in use | Vite will automatically try 5174, 5175, etc. Check terminal output for actual URL |
| `bash tools/secret-scan.sh` fails on Windows | Run from Git Bash, not PowerShell. Or skip — it is optional in B2 |
| Catalog grid shows blank tiles | API not running. Confirm Terminal 1 shows "listening on port 3001" |
| Theme changes leave white flash | Known visual glitch in B2 — fixed in B3 CSS transition update |

---

## Stopping everything

Press `Ctrl+C` in each terminal (Terminal 1 for API, Terminal 2 for web app). The browser tab will show a Vite connection error — that is expected. Both processes stop immediately.

---

## References

- `docs/15_CINEMATIC_METADATA_AND_SOURCE_HEALTH_CONTRACT.md` — metadata and health schema
- `docs/16_TODAY_READY_SETUP_GUIDE.md` — setup guide for Dave
- `docs/17_FIRST_RUN_FOR_DAVE_AND_SHERRI.md` — first run per profile
- `docs/18_REAL_TV_DEPLOYMENT_CHECKLIST.md` — real TV deployment
- `docs/19_PROVIDER_ONBOARDING_WITHOUT_SECRETS.md` — provider credentials
- `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` — agent command contract
- `docs/04_LAYOUT_LIBRARY_12_STATIC_MODES.md` — layout presets
- `docs/05_THEME_BACKGROUND_ENGINE_CONTRACT.md` — theme engine
