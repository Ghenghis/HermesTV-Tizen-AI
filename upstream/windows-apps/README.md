# Upstream: Windows-Native IPTV & Media Apps — Dave's Workstation

Dave runs IPTV and media workloads on a Windows 11 workstation with an RTX 3090 Ti. His Samsung
UN55CU8000BXZA (55" 4K UN-class) is connected via HDMI as a PC monitor — Windows apps send
audio/video directly through the display connection. This is a fundamentally different architecture
from Sherri's setup: Sherri's QN85 QLED runs the Tizen app natively on the TV itself. Dave's TV
is just a display; all compute happens on the PC.

Docker services (Jellyfin, Tunarr, Dispatcharr, Open WebUI, Ollama) are already defined in
`../../docker/workstation/compose.yml`. This document covers the Windows-native apps that
complement that stack.

---

## Dave's Recommended Toolkit

### Tier 1 — Install First

These three cover the core use cases immediately.

| App | Why |
|---|---|
| **Jellyfin** (via Docker — already in compose) | Central media server; Live TV via M3U/Xtream; NVENC transcoding; EPG grid |
| **VLC** | Fast M3U validation, stream debugging, lightweight local playback |
| **IPTVnator Desktop** | Dedicated IPTV client; M3U + Xtream Codes; EPG grid; favorites; multi-provider |

### Tier 2 — Install When Needed

| App | Why |
|---|---|
| **Kodi + PVR IPTV Simple Client** | Full HTPC UI with EPG; good for testing how Sherri's channel-grid UX will feel |
| **IPTV Checker CLI** | Bulk-validate M3U playlists before loading into Jellyfin or IPTVnator |
| **Stream-Recorder** | Save live streams for offline playback and regression testing |

### Tier 3 — Optional / Specialty

| App | Why |
|---|---|
| **MPC-HC** | Ultra-lightweight player for quick spot-checks; low overhead |
| **Threadfin** | EPG proxy (xTeVe successor) — add to compose if Jellyfin Live TV needs XMLTV aggregation |
| **PotPlayer** | Alternative player with strong D3D11VA hardware decode; useful for codec edge cases |

---

## IPTVnator Desktop — Top IPTV-Specific Pick

**GitHub:** https://github.com/4gray/iptvnator  
**Fork needed:** Yes — fork to `Ghenghis/iptvnator` for tracking modifications.

IPTVnator is the strongest standalone IPTV client for Windows. It is Electron-based and ships a
proper desktop installer. Key features relevant to Dave's workflow:

- M3U URL and local file import
- Xtream Codes API support (username + password + host)
- EPG grid with XMLTV source configuration
- Favorites list and channel grouping
- Multi-provider management (switch providers without reconfiguring)
- Built-in video player powered by Chromium's media stack (DXVA hardware-accelerated on Windows)

Download: https://github.com/4gray/iptvnator/releases/latest  
Select the `.exe` installer for Windows.

Credential handling: Enter M3U URLs and Xtream credentials in the IPTVnator UI at runtime.
Source values from `G:\private\` vault. Never save provider URLs to any config file tracked in git.

---

## Threadfin — EPG Proxy for Jellyfin Live TV

**GitHub:** https://github.com/Threadfin-Org/Threadfin  
**Fork needed:** Yes — fork to `Ghenghis/Threadfin` for tracking.

Threadfin is the active successor to xTeVe (xTeVe is abandoned). It aggregates multiple M3U
playlists and XMLTV EPG sources and exposes them as a single HDHomeRun-compatible endpoint that
Jellyfin's Live TV tuner can consume.

Add Threadfin to the workstation compose stack when Jellyfin's built-in M3U tuner is insufficient
for EPG merging across multiple providers:

```yaml
# Add to docker/workstation/compose.yml under services:
  threadfin:
    image: ghcr.io/threadfin-org/threadfin:latest
    volumes:
      - threadfin-data:/home/threadfin/.threadfin
    ports: ['34400:34400']
    restart: unless-stopped
    networks: [hermestv-internal]
```

Also add `threadfin-data:` to the `volumes:` block.

Threadfin admin UI: http://localhost:34400  
After configuring, point Jellyfin Live TV → Add tuner device → HDHomeRun → `http://localhost:34400`.

---

## Full App Reference Table

All Windows apps evaluated from the awesome-iptv list.

| App | GitHub / Source | Free/Paid | RTX 3090 Ti GPU Accel | Use Case | Priority Tier |
|---|---|---|---|---|---|
| **VLC** | https://github.com/videolan/vlc | Free | Yes — DXVA2/D3D11VA decode | General player; M3U validation; stream debugging | 1 |
| **Jellyfin** (Docker) | https://github.com/jellyfin/jellyfin | Free | Yes — NVDEC decode + NVENC encode | Central media server; Live TV; EPG; transcoding | 1 |
| **IPTVnator** | https://github.com/4gray/iptvnator | Free | Partial — Chromium DXVA in Electron | Dedicated IPTV client; M3U + Xtream; EPG grid | 1 |
| **Kodi** | https://github.com/xbmc/xbmc | Free | Yes — DXVA2/D3D11VA decode | HTPC UI; PVR IPTV Simple Client add-on; EPG testing | 2 |
| **IPTV Checker** (CLI) | https://github.com/iptv-org/iptv-checker | Free | No (CPU validation task) | Bulk validate M3U playlists; dead-channel detection | 2 |
| **Stream-Recorder** | https://github.com/malvanos/stream-recorder | Free | No (disk I/O task) | Save live streams for offline testing | 2 |
| **MPC-HC** | https://github.com/clsid2/mpc-hc | Free | Yes — DXVA2/D3D11VA decode | Lightweight spot-check player; minimal overhead | 3 |
| **Threadfin** | https://github.com/Threadfin-Org/Threadfin | Free | No (proxy task) | EPG aggregation proxy for Jellyfin Live TV | 3 |
| **PotPlayer** | https://potplayer.tv | Free (closed source) | Yes — D3D11VA decode | Codec edge-case testing; alternative player | 3 |
| **Kodi PVR IPTV Simple** | https://github.com/kodi-pvr/pvr.iptvsimple | Free | Via Kodi | Kodi IPTV add-on; required with Kodi | 2 |
| **QMPlay2** | https://github.com/zaps166/QMPlay2 | Free | Partial — DXVA2 | Lightweight player with built-in IPTV browser | Optional |
| **Megacubo** | https://github.com/EdenwareApps/Megacubo | Free | No | Brazilian IPTV aggregator; limited relevance | Skip |
| **termv** | https://github.com/Roshan-R/termv | Free | No | Terminal IPTV player (mpv-based); dev/debug use | Optional |
| **Zoom Player** | https://www.inmatrix.com/zplayer | Free / Paid Pro | Yes — DXVA2/D3D11VA | Feature-rich Windows player; niche | Optional |
| **SimpleTV** | https://simpleiptv.net | Free | Partial | Legacy IPTV player; largely superseded | Skip |
| **Open TV** | https://github.com/fredclausen/openTV | Free | No | Open-source IPTV player; early-stage | Optional |
| **Xtream IPTV Player** | Varies (multiple forks) | Free | No | Xtream Codes client; superseded by IPTVnator | Skip |
| **MAC & Stalker IPTV Player** | Varies | Free | No | Stalker portal client; niche | Skip |
| **M3U IPTV** | Varies | Free | No | Basic M3U player; superseded | Skip |
| **AndyTV** | Not maintained | Free | No | Abandoned; skip | Skip |
| **QiTV** | https://github.com/MohamedElashri/qitv | Free | No | Qt-based player; lightweight but limited | Optional |
| **Jellyfin Desktop** (jellyfin-media-player) | https://github.com/jellyfin/jellyfin-media-player | Free | Yes — via mpv DXVA | Standalone desktop client for Jellyfin server | Optional |
| **ynoTV** | Limited public info | Free | No | Niche; evaluate if needed | Skip |
| **PlayOnTV** | Limited public info | Free | No | Niche; evaluate if needed | Skip |
| **AuthoIPTV** | Limited public info | Free | No | Niche; evaluate if needed | Skip |
| **SupercamBR** | https://github.com/SupercamBR/SupercamBR | Free | No | Brazilian regional focus; skip | Skip |
| **WebGrab+Plus** | http://www.webgrabplus.com | Free | No (EPG scraper) | XMLTV EPG scraper for Threadfin/Jellyfin | Optional |
| **Streamlink** | https://github.com/streamlink/streamlink | Free | No (pipe to player) | Extract streams from web players; pipe to VLC | Optional |
| **IPTV Link Validator** | Varies | Free | No | URL health check; IPTV Checker CLI preferred | Skip |
| **Threadfin** (Windows service) | https://github.com/Threadfin-Org/Threadfin | Free | No (proxy task) | Can run as native Windows service instead of Docker | 3 |
| **xTeVe** | https://github.com/xteve-project/xTeVe | Free | No | Legacy EPG proxy; abandoned — use Threadfin instead | Skip |
| **IPTV Controller Pro** | Varies | Paid | No | Commercial EPG manager; Threadfin preferred | Skip |

---

## RTX 3090 Ti Acceleration

The RTX 3090 Ti provides both NVDEC (hardware decode) and NVENC (hardware encode), eliminating
CPU bottlenecks for 4K stream processing. Dave's workstation decodes and re-encodes streams that
Jellyfin serves to Sherri's QN85 when transcoding is required.

### NVDEC codec support

| Codec | NVDEC Decode | NVENC Encode | Notes |
|---|---|---|---|
| H.264 (AVC) | Yes | Yes | Universal; most IPTV providers default to this |
| H.265 (HEVC) | Yes | Yes | Required for 4K HDR streams |
| AV1 | Yes | Yes | Growing provider adoption; Jellyfin 10.9+ |
| VP9 | Yes | No | Used in some web-based streams |
| MPEG-2 | Yes | No | Legacy broadcast streams |
| VC-1 | Yes | No | Rare; some older content |

### Hardware decode per Windows app

| App | Method | Notes |
|---|---|---|
| VLC | DXVA2 / D3D11VA | Enabled by default; Tools → Preferences → Input/Codecs → Hardware-accelerated decoding |
| Kodi | DXVA2 | Enabled by default on Windows; Settings → Player → Videos → Allow hardware acceleration |
| PotPlayer | D3D11VA | Configure in Preferences → Video → D3D11 Video Decoder |
| MPC-HC | DXVA2 / D3D11 | View → Options → Internal Filters → Video Decoder → Hardware Acceleration |
| IPTVnator | Chromium DXVA (Electron) | Automatic via Chromium media pipeline; no user config needed |
| Jellyfin (Docker) | NVDEC + NVENC | Configured in JELLYFIN_DOCKER_SETUP.md; GPU passthrough via nvidia-container-toolkit |

### Jellyfin transcoding path

```
Provider stream (H.265 4K HDR)
  → Jellyfin in Docker (hermestv-workstation)
  → RTX 3090 Ti NVDEC (decode)
  → RTX 3090 Ti NVENC (re-encode to H.264 if device requires it)
  → Jellyfin HTTP output
  → Sherri's QN85 QLED (Tizen app) or Dave's UN55 via Windows player
```

The RTX 3090 Ti can sustain 8–12 concurrent 4K transcodes. For a two-TV household this is
essentially unlimited headroom.

---

## HDMI Monitor Workflow — Dave's UN55CU8000BXZA

Dave's 55" Samsung UN55CU8000BXZA is connected to the workstation via HDMI as a Windows display.
It is not running any Samsung apps or the Tizen platform in this role — it is a monitor.

All playback happens through Windows:

```
Windows app (VLC / IPTVnator / Jellyfin Desktop / browser)
  → Windows display output
  → HDMI cable
  → UN55CU8000BXZA (behaves as a standard HDMI display)
```

Audio follows the same HDMI path. Windows should show the TV as an HDMI audio output device in
Sound settings. Set the TV as the default audio device when using it as the primary display.

This is entirely separate from Sherri's QN85 setup, where the TV itself runs the Tizen app and
pulls streams directly from Jellyfin over the local network. Dave does not use the HermesTV Tizen
app at all on his side.

Practical notes:
- Windows display scaling: The UN55CU8000BXZA is a 4K panel. Set Windows display scale to 150%
  for comfortable desktop use at normal viewing distance, or 100% for full-resolution content work.
- Full-screen playback: Use the app's full-screen mode (F11 in VLC/Kodi/browser) to fill the panel.
- HDR: Windows HDR toggle is in Settings → System → Display → HDR. Turn on when watching HDR
  content; turn off for normal desktop work to preserve color accuracy.

---

## Stream-Recorder

**GitHub:** https://github.com/malvanos/stream-recorder

Useful for capturing a live stream segment to a local file for offline playback, regression testing,
or codec inspection without staying connected to a provider.

Basic usage (PowerShell, after installing via pip or binary):

```powershell
# Record 60 seconds of a stream to disk
stream-recorder --url "https://example-provider.com/stream.m3u8" --output "G:\private\test-capture.ts" --duration 60
```

Alternatively, VLC can record streams directly:

```
vlc --sout "#std{access=file,mux=ts,dst=G:\private\test-capture.ts}" "stream-url-here"
```

Saved files go to `G:\private\` only. Never commit captured stream files to the repo.

---

## IPTV Checker CLI

**GitHub:** https://github.com/iptv-org/iptv-checker  
**Install:** `npm install -g iptv-checker` (requires Node.js)

Validates every URL in an M3U playlist and reports which streams are live, dead, or timing out.
Run this against a provider's M3U export before loading it into Jellyfin or IPTVnator to filter
out dead channels before they clutter the guide.

```powershell
# Check a playlist and write results to a file
iptv-checker "G:\private\provider-export.m3u" --output "G:\private\checked.m3u"
```

The `--output` flag writes a new M3U containing only the channels that responded. Load that
cleaned file into Jellyfin or IPTVnator instead of the raw provider export.

---

## Credential Handling — Hard Rules

- M3U URLs, Xtream Codes hosts, usernames, and passwords stay in `G:\private\` vault only.
- Load credentials into app admin UIs at runtime (Jellyfin Live TV tuner, IPTVnator, Kodi PVR).
- Never paste provider credentials into config files, compose files, READMEs, scripts, or
  environment files tracked in git.
- Never save M3U export files outside `G:\private\` or share them via cloud storage or messaging.
- The `compose.yml` file contains no secrets — keep it that way.

---

## See Also

- `JELLYFIN_DOCKER_SETUP.md` — GPU passthrough configuration and compose integration for Jellyfin.
- `../../docker/workstation/compose.yml` — Full workstation Docker stack (Jellyfin, Tunarr,
  Dispatcharr, Open WebUI, Ollama).
- `../web-apps/README.md` — Browser-based frontends accessible from the workstation.
