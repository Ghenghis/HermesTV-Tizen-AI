# Dave's Daily Workflow — HermesTV Operator Guide

Dave is the developer and operator of the HermesTV system. This document covers how Dave
accesses IPTV content on his own workstation and how he sets the system up for Sherri's
use on her QN85 QLED TV. Dave's setup and Sherri's setup are entirely separate — they share
a compose stack on the workstation but use different display hardware and different access paths.

---

## Hardware overview

| Device | Role | Display path |
|---|---|---|
| Windows 11 workstation (RTX 3090 Ti) | Compute/serve/dev | Primary PC monitor |
| Samsung UN55CU8000BXZA (55-inch) | Dave's TV / second monitor | HDMI from workstation GPU |
| Samsung QN85Q7FAAFXZA (85-inch QLED) | Sherri's TV | Tizen app + LAN |

Dave's UN55 is a PC monitor connected via HDMI. It runs no Tizen apps, no Samsung Smart TV
software relevant to HermesTV. Windows sees it as a display output. All media Dave watches
goes through Windows apps or a browser on the workstation and is rendered on the UN55 via
the GPU's HDMI output.

---

## 1. Dave's Daily Usage Pattern

### Morning startup

Start the compose stack before opening any apps:

```powershell
docker compose -p hermestv-workstation up -d
```

Confirm the stack is healthy:

```powershell
docker compose -p hermestv-workstation ps
```

All services should show `Up` or `healthy`. If Sherri is already awake and using her TV,
the stack must be running before she picks up the remote.

### Opening HermesTV

Open Chrome or Edge and navigate to:

```
http://localhost:5173
```

Select the **Dave** profile at the profile picker. The Dave profile has no performance caps —
the workstation browser runs the full QN-enhanced UI tier (same CSS tier the QN85 targets)
because the workstation monitor's resolution and UA string are used for tier detection.

HermesTV at localhost:5173 is Dave's **hub for discovering content**: browsing channel
listings, checking EPG data, searching across providers, and queueing streams. It is the
primary UI for everything Dave does before handing off to a native player.

### Launching streams in native players

Dave does not stream from the browser. He discovers content in HermesTV, then opens the
stream in a Windows native app for actual playback. The native app outputs to the UN55 via
HDMI.

Common workflows:

- **Validate a new provider stream** — copy the stream URL from HermesTV and open it in VLC
  with `File → Open Network Stream`. VLC decodes locally and displays on the UN55 via HDMI.
- **Watch live TV with EPG** — open Kodi. Its PVR IPTV Simple Client loads EPG data from the
  Threadfin/Dispatcharr service on the compose stack. Kodi outputs to the UN55 via HDMI.
- **Browse and queue with IPTVnator** — open IPTVnator desktop. Load the M3U from Jellyfin's
  Live TV playlist endpoint (`http://localhost:8096/LiveTv/Streams/...`). IPTVnator handles
  M3U-based and Xtream Codes sources natively.
- **On-demand via Jellyfin** — open Jellyfin in the browser at `http://localhost:8096/web`
  or use Jellyfin Media Player (Windows app). Either routes audio/video to the UN55 via HDMI.

### End of day

Leave the stack running if Sherri uses her TV late. Shut down at:

```powershell
docker compose -p hermestv-workstation down
```

---

## 2. Dave's Access Points

| App / URL | How accessed | Purpose | Notes |
|---|---|---|---|
| HermesTV web app — `http://localhost:5173` | Chrome or Edge on workstation | Primary IPTV UI — browse, discover, search | Dev server (`npm run dev`); must be running separately from compose |
| Jellyfin — `http://localhost:8096` | Chrome or Jellyfin Media Player (Windows) | Media server with Live TV, DVR, VOD | Part of hermestv-workstation compose; also the LAN endpoint Sherri uses |
| Open WebUI — `http://localhost:3000` | Chrome on workstation | Hermes AI assistant (chat interface) | Part of compose; Azure TTS is the only voice output — Bixby is not used |
| Tunarr — `http://localhost:8000` | Chrome on workstation | Virtual channel builder | Part of compose |
| Dispatcharr — `http://localhost:9191` | Chrome on workstation | Stream manager — health checks, failover | Part of compose |
| IPTVnator desktop | Windows app (installed) | IPTV player with M3U and Xtream Codes support | Outputs to UN55 via HDMI; credentials loaded from vault at runtime |
| VLC | Windows app (installed) | Stream validation and local playback | Use `--network-caching=3000` for live streams; outputs to UN55 via HDMI |
| Kodi | Windows app (installed) | HTPC-style EPG and channel browsing via PVR add-on | PVR credentials in Kodi userdata profile — not in repo; outputs to UN55 via HDMI |

All browser-based apps above are accessed on the **workstation** in Chrome or Edge. The
UN55 TV itself shows whatever Windows outputs to its HDMI input — it does not run any web
apps independently.

---

## 3. Setting Up for Sherri

Dave is the operator. Sherri uses her QN85 but does not manage the infrastructure.

### Pre-session checklist (before Sherri starts using her TV)

1. Start the compose stack: `docker compose -p hermestv-workstation up -d`
2. Confirm Jellyfin is up at `http://localhost:8096` (or `http://hermestv.local:8096`)
3. Confirm the HermesTV dev server is running at `http://localhost:5173`
   (the Tizen app on Sherri's QN85 calls the workstation API at `hermestv.local:3001`)
4. Confirm Threadfin/Dispatcharr is running so EPG data is fresh
5. If provider credentials were cleared or Jellyfin was reset, re-enter credentials via the
   Jellyfin admin UI — credentials come from `G:\private\` vault only

### Sherri's access path

Sherri's QN85Q7FAAFXZA has two ways to reach the HermesTV stack:

- **Primary: Tizen app** — the packaged HermesTV `.wgt` app installed on the QN85. It calls
  the workstation API at `hermestv.local:3001` over the home LAN. This is Sherri's normal
  daily interface.
- **Secondary: Samsung Internet browser** — Sherri (or Dave testing on her behalf) can
  open Samsung Internet on the QN85 and navigate to `http://<workstation-ip>:5173` to load
  the HermesTV web app directly from the Vite dev server. Same bundle, same API calls.

Both paths depend on the workstation compose stack being up. If the stack is down, Sherri
has no access.

### mDNS / hostname resolution

`hermestv.local` should resolve to the workstation on the home LAN via mDNS. If it does
not (common on Windows when mDNS is blocked by the firewall), use the workstation's
static LAN IP address directly. See `upstream/mirror-testing/README.md` for firewall
rules to open the relevant ports.

---

## 4. Provider Credential Flow (no secrets in files)

All IPTV provider credentials (M3U URLs, Xtream Codes host/username/password, EPG token
URLs, Apollo Group tokens) are treated as secrets.

### Where credentials live

```
G:\private\               ← local vault on the workstation, never committed to git
  hermestv-providers.txt  ← provider names, types, and credential references
  m3u-exports\            ← temporary M3U exports for local validation only
```

### How credentials get into the system

1. Dave opens the Jellyfin admin UI at `http://localhost:8096/web/index.html#!/admindashboard`
2. Under **Live TV → Tuners**, Dave adds M3U/Xtream sources by pasting credentials from the
   vault. These are stored in Jellyfin's internal database — not in any file tracked by git.
3. For the HermesTV app API layer, provider config goes into the environment at runtime
   (via Docker secrets or env injection from `G:\private\`). The app itself runs in
   **mock mode** until real provider environment variables are present.

### Mock mode

HermesTV's API service detects missing provider env vars at startup and switches to mock
mode automatically. Mock mode serves synthetic channel/EPG data so the UI and navigation
can be tested without live credentials. This is the default state of a fresh clone.

---

## 5. QN85 Mirror Testing (Dave as developer)

Dave can test what Sherri will see without touching the QN85 remote by using the mirror
test setup:

1. Ensure the Vite dev server is bound to all interfaces (already configured in
   `vite.config.js` via `server: { host: '0.0.0.0', port: 5173 }`)
2. Open `http://<workstation-ip>:5173` from Samsung Internet on the QN85
3. The same JavaScript bundle Dave's Chrome loads is served to the QN85 browser
4. The app's tier-detection code reads the Samsung Internet UA and self-classifies into the
   QN-enhanced tier automatically

See `upstream/mirror-testing/README.md` for:
- Firewall rules to open port 5173 on the workstation
- How to attach Chrome DevTools to the live QN85 browser session
- The full e2e checklist to run before each release

---

## 6. Upstream Apps Workflow

### Web apps

Open in Chrome at the URLs listed in Section 2. Reference documentation:

- `upstream/web-apps/README.md` — app-by-app breakdown, compose port mapping, fork status

### Windows apps (VLC, Kodi, IPTVnator, Stremio)

Install from official sites. Reference documentation for RTX 3090 Ti hardware acceleration
and credential-safe configuration:

- `upstream/windows-apps/README.md` — installers, GPU acceleration notes, credential rules
- `upstream/windows-apps/JELLYFIN_DOCKER_SETUP.md` — Jellyfin Docker GPU passthrough setup

### Docker services

The workstation compose stack is defined in `docker/workstation/compose.yml`. VPS additions
(when the VPS is provisioned) are covered in:

- `upstream/docker-vps/` — VPS-side compose services and deployment notes

Note: VPS SSH is not yet configured. The docker-vps/ folder is a forward reference for
when the VPS is onboarded. The BLOCKER is VPS SSH access — no README exists yet in
`upstream/docker-vps/`; it will be added when VPS provisioning begins.

### Installing additional apps via HermesTV

The Extensions panel (coming in Milestone B3) will surface available upstream apps directly
from within the HermesTV UI. Until then, install Windows apps manually and reference the
`upstream/` docs for setup guidance.

---

## Related files

- `upstream/mirror-testing/README.md` — QN85 mirror test full setup guide
- `upstream/web-apps/README.md` — browser-based app reference
- `upstream/windows-apps/README.md` — Windows-native app reference
- `upstream/docker-vps/README.md` — VPS compose services (pending VPS SSH)
- `docker/workstation/compose.yml` — running compose stack definition
