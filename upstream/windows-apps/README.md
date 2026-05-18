# Upstream: Windows-Native IPTV & Media Apps

Windows-native media applications for the RTX 3090 Ti workstation. These supplement the Docker-based services and provide local testing, transcoding, and playback capabilities. Sherri's QN85 QLED runs 16-18 hours per day — the workstation's GPU acceleration is what makes reliable 4K delivery possible.

---

## App Reference

### 1. Jellyfin Media Server

| Field | Value |
|---|---|
| **GitHub** | https://github.com/jellyfin/jellyfin |
| **Download** | https://jellyfin.org/downloads/windows (or use Docker — preferred) |
| **RTX 3090 Ti** | Yes — NVENC hardware encoding, NVDEC hardware decoding |
| **Credential handling** | Provider credentials (M3U, Xtream) added via admin UI at runtime only |

Jellyfin is the primary media server in the HermesTV stack. Run it via Docker (`docker/workstation/compose.yml` — jellyfin service on port 8096) rather than the Windows installer to keep it portable and reproducible. The Docker path supports GPU passthrough via NVIDIA Container Toolkit — see `JELLYFIN_DOCKER_SETUP.md`.

Jellyfin's Live TV feature accepts M3U playlists and Xtream Codes API endpoints. All credentials go into the Jellyfin admin UI at runtime, never into config files tracked in git.

---

### 2. Stremio

| Field | Value |
|---|---|
| **Website** | https://www.stremio.com/downloads |
| **GitHub** | Not public (client is proprietary; server components partial OSS) |
| **RTX 3090 Ti** | No direct GPU acceleration in the client |
| **Credential handling** | Add-on credentials stay in the local Stremio profile — not synced to any repo |

Stremio aggregates streaming sources via add-ons. Useful as a secondary testing client for validating stream availability. Do not configure provider add-ons until the provider's terms of service have been reviewed. No credentials go into any repo.

---

### 3. VLC Media Player

| Field | Value |
|---|---|
| **Website** | https://www.videolan.org/vlc/download-windows.html |
| **GitHub** | https://github.com/videolan/vlc |
| **RTX 3090 Ti** | Yes — GPU-accelerated decoding (DXVA2/D3D11VA) |
| **Credential handling** | Import M3U from local vault file only; never paste Xtream URLs into shared configs |

VLC is the primary local testing tool for M3U playlists. Workflow: export an M3U from the private vault, open in VLC, validate streams, then discard the exported file. Do not save M3U files in the repo or in shared cloud storage.

Useful flags for stream testing:
```
vlc --network-caching=3000 --live-caching=3000 "path\to\local.m3u"
```

---

### 4. Kodi

| Field | Value |
|---|---|
| **Website** | https://kodi.tv/download/windows |
| **GitHub** | https://github.com/xbmc/xbmc |
| **RTX 3090 Ti** | Yes — DXVA2/D3D11 hardware decoding via Windows |
| **Credential handling** | PVR add-on credentials (Xtream, M3U) stored in Kodi userdata profile — not in repo |

Kodi with the PVR IPTV Simple Client add-on is a good HTPC-style testing client. It closely mimics the EPG grid and channel-switching UX that Sherri uses on the QN85. Useful for validating that EPG data (from Threadfin or Dispatcharr) renders correctly before pushing to the Tizen app.

---

### 5. Plex Media Server

| Field | Value |
|---|---|
| **Website** | https://www.plex.tv/media-server-downloads/#plex-media-server |
| **GitHub** | Proprietary — no public source |
| **RTX 3090 Ti** | Yes — NVENC/NVDEC with Plex Pass (paid) |
| **Credential handling** | Plex account and provider tokens managed in Plex admin UI only |

Plex is an alternative to Jellyfin. Free tier available but hardware transcoding requires a Plex Pass subscription. Included here as a reference — Jellyfin is preferred in the HermesTV stack because it is fully open-source and free with no feature gating.

---

## RTX 3090 Ti Acceleration

The RTX 3090 Ti supports both **NVENC** (encoding) and **NVDEC** (decoding), making the workstation capable of transcoding multiple simultaneous 4K streams without CPU bottleneck.

### What this means for Sherri's TV

Sherri's QN85 QLED may request streams at resolutions or codecs that differ from what the provider delivers. The workstation acts as a transcoding middleman:

```
Provider stream (e.g., H.265 4K) → Jellyfin/Plex on workstation → RTX 3090 Ti NVENC → H.264 stream → QN85 TV
```

The RTX 3090 Ti can handle **multiple simultaneous transcodes** (typically 8-12 concurrent 4K streams depending on bitrate). For a single-TV household this is far more than needed — the headroom exists if additional devices are added.

### Codec support on RTX 3090 Ti

| Codec | NVDEC (decode) | NVENC (encode) | Notes |
|---|---|---|---|
| H.264 (AVC) | Yes | Yes | Universal compatibility |
| H.265 (HEVC) | Yes | Yes | Required for 4K HDR |
| AV1 | Yes (decode) | Yes | Jellyfin 10.9+ |
| VP9 | Yes | No | Common in web streams |

### Enabling hardware transcoding

Hardware transcoding is configured per application:

- **Jellyfin Docker**: See `JELLYFIN_DOCKER_SETUP.md` for GPU passthrough configuration.
- **Plex**: Enable in Settings → Transcoder → Use hardware acceleration when available (requires Plex Pass).
- **VLC/Kodi**: Hardware decoding is enabled by default on Windows via DXVA2/D3D11VA — no extra setup needed for local playback.

---

## Credential handling — hard rules

- M3U URLs and Xtream Codes API credentials (username, password, host) stay in `G:\private\` vault.
- Load credentials into app admin UIs at runtime.
- Never paste provider credentials into config files, READMEs, scripts, or environment files tracked in git.
- Never share M3U export files via cloud storage or messaging.

---

## See also

- `JELLYFIN_DOCKER_SETUP.md` — GPU passthrough and compose integration for Jellyfin on the workstation.
- `../web-apps/README.md` — Browser-based frontends accessible from the TV and workstation.
- `../../docker/workstation/compose.yml` — Running compose stack.
