# Upstream Reference — HermesTV Tizen AI

Curated upstream knowledge base for the HermesTV Tizen AI project. All content here is reference material — documentation, tool evaluations, and integration guides. No provider credentials, stream URLs, or private configuration live in this folder.

---

## Folder Structure

```
upstream/
  awesome-iptv/    — curated IPTV tools and references (existing)
  web-apps/        — browser-based apps for the Windows workstation
  windows-apps/    — Windows-native apps and Jellyfin setup guides
  forks/           — git submodules for Ghenghis-forked repos (populated by operator)
```

---

## Contents

| Folder | What it covers |
|---|---|
| [`awesome-iptv/`](awesome-iptv/README.md) | Tools, EPG sources, channel datasets, and public providers drawn from the awesome-iptv community list. Primary reference for backend tool selection and pipeline smoke testing. |
| [`web-apps/`](web-apps/README.md) | Browser-based media apps (Jellyfin Web, Dim, iptv-checker, Open WebUI) that run in Chrome/Edge on the workstation without installation. Accessible from Sherri's TV browser over LAN. |
| [`windows-apps/`](windows-apps/README.md) | Windows-native installers and setup guides: Jellyfin, Stremio, VLC, Kodi, Plex. Includes RTX 3090 Ti NVENC/NVDEC hardware acceleration details. |
| [`forks/`](web-apps/FORK_SETUP.md) | Git submodule targets for repos forked to the Ghenghis GitHub account. Populated after running the `gh repo fork` commands in `web-apps/FORK_SETUP.md`. Empty until operator runs the fork commands. |

---

## Design priority

Mom (Sherri) uses the QN85 QLED for 16-18 hours per day. All upstream integrations must prioritize stream reliability over features. Prefer hardware-accelerated playback paths.

The RTX 3090 Ti in the Windows workstation is the transcoding backbone. Jellyfin with NVENC/NVDEC means the workstation can deliver hardware-transcoded 4K streams to Sherri's TV without CPU saturation. When evaluating upstream tools, prefer those that integrate cleanly with Jellyfin's transcoding pipeline over standalone clients that add their own decode overhead.

---

## Hard rules (apply to all subfolders)

- Never add provider credentials, M3U URLs, Xtream Codes usernames/passwords, or subscription tokens to any file in this directory.
- Never commit `compose.override.yml` or any operator-specific path configuration.
- All live provider configuration goes into application admin UIs at runtime and is sourced from `G:\private\` vault.
- This folder tracks upstream knowledge, not live configuration. Runtime config lives in `docker/`, `services/`, and vault.

---

## Forked repos

Two upstream repos are flagged for forking to the Ghenghis GitHub account. See [`web-apps/FORK_SETUP.md`](web-apps/FORK_SETUP.md) for `gh` CLI commands.

| Repo | Why |
|---|---|
| `jellyfin/jellyfin-web` | HermesTV may need Tizen-specific UI patches to the Jellyfin web client |
| `iptv-org/iptv-checker` | Track fixes to the M3U validation tool used for pre-screening provider streams |
