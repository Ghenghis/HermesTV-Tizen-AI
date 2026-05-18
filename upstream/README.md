# Upstream Reference — HermesTV Tizen AI

Curated upstream knowledge base for the HermesTV Tizen AI project. All content here is
reference material — documentation, tool evaluations, and integration guides. No provider
credentials, stream URLs, or private configuration live in this folder.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Windows 11 Workstation (RTX 3090 Ti)               │
│                                                     │
│  docker compose -p hermestv-workstation             │
│    ├── jellyfin      :8096  (Live TV, DVR, VOD)     │
│    ├── open-webui    :3000  (Hermes AI chat)         │
│    ├── tunarr        :8000  (virtual channels)       │
│    ├── dispatcharr   :9191  (stream manager)         │
│    └── api / dev     :3001  (HermesTV REST/WS API)  │
│                                                     │
│  npm run dev → HermesTV web app  :5173              │
│                                                     │
│  Windows native apps:                               │
│    VLC, Kodi, IPTVnator, Stremio                    │
│                 │                                   │
│  ┌──────────────┘                                   │
│  │ HDMI output                                      │
│  ▼                                                  │
│  Samsung UN55CU8000BXZA  ← Dave's TV (PC monitor)  │
└─────────────────────────────────────────────────────┘
                 │
                 │ Home LAN
                 │
┌────────────────▼────────────────────────────────────┐
│  Samsung QN85Q7FAAFXZA  ← Sherri's TV (QLED)       │
│                                                     │
│  Primary:   HermesTV Tizen app (.wgt)               │
│               → calls workstation API :3001         │
│  Secondary: Samsung Internet browser                │
│               → http://<workstation-ip>:5173        │
└─────────────────────────────────────────────────────┘
```

---

## Who Accesses What

### Dave (developer / operator)

Dave's UN55 is connected to his workstation via HDMI as a PC monitor. It runs no Tizen
apps. Dave accesses HermesTV and media services through the workstation:

- Opens HermesTV at `http://localhost:5173` in Chrome for content discovery
- Manages the stack via Docker Compose on Windows
- Launches streams in VLC, Kodi, or IPTVnator — all output to the UN55 via HDMI
- Accesses all Docker service UIs (Jellyfin, Tunarr, Dispatcharr, Open WebUI) in Chrome
- Runs QN85 mirror tests by opening `http://<workstation-ip>:5173` from Sherri's TV browser

See `DAVE_WORKFLOW.md` for the complete daily usage guide.

### Sherri (primary viewer)

Sherri's QN85Q7FAAFXZA is the design target. She uses the system 16-18 hours per day.

- **Primary path**: HermesTV Tizen app installed on the QN85. All UI, navigation, and voice
  interaction run on the TV itself. The app calls the workstation API over LAN.
- **Secondary path**: Samsung Internet browser on the QN85 pointing to the Vite dev server.
  Used by Dave for mirror testing. Sherri may use it as a fallback if the Tizen app is
  being updated.

### Testing (Dave as QA)

Dave tests what Sherri will see by opening the Vite dev server from the QN85's Samsung
Internet browser. This gives real-device rendering without a Tizen build-deploy cycle.
See `mirror-testing/README.md` for the full setup.

---

## Folder Structure

```
upstream/
  awesome-iptv/      — curated IPTV tools and references
  docker-vps/        — VPS-side compose services (BLOCKER: VPS SSH not configured)
  forks/             — git submodule targets for Ghenghis-forked repos
  mirror-testing/    — QN85 mirror test setup, firewall rules, e2e checklist
  web-apps/          — browser-based apps for the Windows workstation
  windows-apps/      — Windows-native apps and Jellyfin setup guides
  DAVE_WORKFLOW.md   — Dave's daily usage pattern and operator setup guide
```

---

## Contents

| Folder / File | What it covers |
|---|---|
| [`awesome-iptv/`](awesome-iptv/README.md) | Tools, EPG sources, channel datasets, and public providers drawn from the awesome-iptv community list. Primary reference for backend tool selection and pipeline smoke testing. |
| `docker-vps/` | Compose services intended for the VPS side of the stack (Nginx reverse proxy, Cloudflare tunnel, external EPG caching). **BLOCKER**: VPS SSH is not yet configured. This folder is a forward reference for when the VPS is onboarded — no README yet. |
| [`forks/`](web-apps/FORK_SETUP.md) | Git submodule targets for repos forked to the Ghenghis GitHub account. Populated after running the `gh repo fork` commands in `web-apps/FORK_SETUP.md`. Empty until operator runs the fork commands. |
| [`mirror-testing/`](mirror-testing/README.md) | Full guide for testing the HermesTV UI on the physical QN85 without a Tizen deploy. Covers LAN binding, Windows Firewall rules, Samsung Remote Web Inspector, and the pre-release e2e checklist. |
| [`web-apps/`](web-apps/README.md) | Browser-based media apps (Jellyfin Web, iptv-checker, Open WebUI) that run in Chrome/Edge on the workstation. Reference table, compose port mapping, and fork status. |
| [`windows-apps/`](windows-apps/README.md) | Windows-native installers and setup guides: Jellyfin, VLC, Kodi, IPTVnator, Stremio, Plex. Includes RTX 3090 Ti NVENC/NVDEC hardware acceleration details. |
| [`DAVE_WORKFLOW.md`](DAVE_WORKFLOW.md) | Dave's daily usage pattern: compose startup, Chrome access points, native player workflows, Sherri setup checklist, credential flow, and mirror testing quick-reference. |

---

## Design Priority

Sherri uses the QN85 QLED for **16-18 hours per day**. All upstream integrations must
prioritize stream reliability over features. Prefer hardware-accelerated playback paths.

The RTX 3090 Ti in the Windows workstation is the transcoding backbone. Jellyfin with
NVENC/NVDEC means the workstation can deliver hardware-transcoded 4K streams to Sherri's
TV without CPU saturation. When evaluating upstream tools, prefer those that integrate
cleanly with Jellyfin's transcoding pipeline over standalone clients that add their own
decode overhead.

The QN85 is the primary design target for UI, layout, and performance decisions. UN-class
TVs (including Dave's UN55 when used as a browser test surface) receive graceful degradation
only — they are not the performance floor.

---

## Hard Rules (apply to all subfolders)

- Never add provider credentials, M3U URLs, Xtream Codes usernames/passwords, or
  subscription tokens to any file in this directory.
- Never commit `compose.override.yml` or any operator-specific path configuration.
- All live provider configuration goes into application admin UIs at runtime and is sourced
  from `G:\private\` vault on the workstation.
- This folder tracks upstream knowledge, not live configuration. Runtime config lives in
  `docker/`, `services/`, and vault.

---

## Forked Repos

The following upstream repos are flagged for forking to the Ghenghis GitHub account.
See [`web-apps/FORK_SETUP.md`](web-apps/FORK_SETUP.md) for `gh` CLI commands.

| Repo | Upstream | Why |
|---|---|---|
| `jellyfin/jellyfin-web` | https://github.com/jellyfin/jellyfin-web | HermesTV may need Tizen-specific UI patches to the Jellyfin web client |
| `iptv-org/iptv-checker` | https://github.com/iptv-org/iptv-checker | Track fixes to the M3U validation tool used for pre-screening provider streams |
| `4gray/iptvnator` | https://github.com/4gray/iptvnator | IPTVnator desktop — Dave's primary Windows IPTV player alongside VLC |
| `Threadfin/Threadfin` | https://github.com/Threadfin/Threadfin | M3U proxy / EPG multiplexer used between providers and Jellyfin |
| `iptv-org/awesome-iptv` | https://github.com/iptv-org/awesome-iptv | Community IPTV resource list — basis for `upstream/awesome-iptv/` |
| `iptv-org/m3u-editor` (or equiv) | https://github.com/iptv-org/m3u-editor | M3U playlist editor for filtering/reordering provider channel lists |
| `iptv-org/iptv-checker` | (same as row 2 — included for completeness) | Validator used before loading any new M3U into Jellyfin |
| `jellyfin/jellyfin` | https://github.com/jellyfin/jellyfin | Jellyfin server — reference for API changes that affect the HermesTV integration layer |
