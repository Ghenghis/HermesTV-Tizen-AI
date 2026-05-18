# Jellyfin Docker Setup — RTX 3090 Ti Workstation

Quick setup guide for running Jellyfin with full GPU acceleration in Docker on the Windows workstation. This expands the base `docker/workstation/compose.yml` with NVENC/NVDEC passthrough and explains how to connect provider content and the HermesTV API.

---

## Prerequisites

Before starting, ensure the following are installed on the workstation:

1. **Docker Desktop for Windows** — https://www.docker.com/products/docker-desktop/ (WSL2 backend recommended)
2. **NVIDIA Container Toolkit** — enables GPU passthrough into Docker containers
   - Install guide: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
   - On Windows with Docker Desktop, this is enabled via: Settings → Resources → GPU and then using the `nvidia` runtime
3. **NVIDIA drivers** — RTX 3090 Ti requires driver 525+ for full NVENC/NVDEC support in containers

Verify GPU is visible to Docker:
```powershell
docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu22.04 nvidia-smi
```

If you see the RTX 3090 Ti listed, GPU passthrough is working.

---

## Step 1 — GPU Passthrough Configuration

The base `docker/workstation/compose.yml` includes a `jellyfin` service but intentionally omits GPU config (hardware-specific). Add the following override to enable NVENC/NVDEC.

Create `docker/workstation/compose.override.yml` (this file is gitignored — never commit it):

```yaml
# docker/workstation/compose.override.yml
# GPU passthrough for RTX 3090 Ti — LOCAL OVERRIDE, DO NOT COMMIT

services:
  jellyfin:
    image: jellyfin/jellyfin:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, video]
    environment:
      NVIDIA_VISIBLE_DEVICES: all
      NVIDIA_DRIVER_CAPABILITIES: compute,video,utility
```

Docker Compose automatically merges `compose.yml` and `compose.override.yml`. Run as usual:

```powershell
docker compose -p hermestv-workstation up -d
```

---

## Step 2 — Enable Hardware Transcoding in Jellyfin Admin UI

After Jellyfin starts (port 8096), open the admin UI:

```
http://localhost:8096
```

Navigate to: **Admin Dashboard → Playback → Transcoding**

1. Set **Hardware acceleration** to: `Nvidia NVENC`
2. Enable:
   - [x] Enable hardware decoding for H.264
   - [x] Enable hardware decoding for H.265 (HEVC)
   - [x] Enable hardware decoding for AV1 (Jellyfin 10.9+)
   - [x] Enable hardware encoding
   - [x] Allow encoding in HEVC format
3. Save

---

## Step 3 — Volume Mounts for Media

The base `compose.yml` omits hardcoded media paths (operator-specific). Add media volume binds to your `compose.override.yml`:

```yaml
services:
  jellyfin:
    volumes:
      # Keep the named volumes from base compose
      - jellyfin-config:/config
      - jellyfin-cache:/cache
      # Add your actual media paths (adjust for your drive layout)
      - G:/Media/Movies:/media/movies:ro
      - G:/Media/TV:/media/tv:ro
      - G:/Media/IPTV-Recordings:/media/recordings
```

Use `:ro` (read-only) for library folders to prevent Jellyfin from accidentally modifying source files.

---

## Step 4 — Adding IPTV Providers

> **All provider credentials go into the Jellyfin admin UI at runtime. Never put them in compose files, override files, or any file tracked in git.**

Navigate to: **Admin Dashboard → Live TV**

### M3U Playlist

1. Click **Add** under Tuner Devices
2. Select **M3U Tuner**
3. Enter the M3U URL from your private vault — e.g., `http://provider.example.com:port/get.php?username=USER&password=PASS&type=m3u_plus`
4. Save — Jellyfin will import channels

### Xtream Codes API

1. Click **Add** under Tuner Devices
2. Select **Xtream Codes API**
3. Enter host, username, password from your private vault
4. Save

### EPG (Electronic Programme Guide)

1. Under **TV Guide Data Providers**, click **Add**
2. Enter an XMLTV URL (see `../awesome-iptv/epg-sources.md` for public sources) or the Dispatcharr EPG output URL (from `docker/workstation/compose.yml` — dispatcharr on port 9191)
3. Set refresh interval to 24h

---

## Step 5 — Connecting HermesTV API to Jellyfin

The `hermes-tv-api` service (port 3001) can query Jellyfin's REST API for stream metadata, playback status, and channel info.

Jellyfin's API base URL within the Docker network:

```
http://jellyfin:8096
```

(Services on `hermestv-internal` network resolve by service name.)

From outside the container (workstation browser or HermesTV Tizen app):

```
http://hermestv.local:8096
```

or

```
http://localhost:8096
```

### Generate an API key

1. Jellyfin Admin Dashboard → Advanced → API Keys
2. Click the `+` button, name it `hermes-tv-api`
3. Copy the key — paste it into `G:\private\hermes-secrets.env` as `JELLYFIN_API_KEY=...`
4. Reference it in `hermes-tv-api` via environment injection (not hardcoded)

---

## Verify Everything Works

```powershell
# Check all workstation services are up
docker compose -p hermestv-workstation ps

# Check Jellyfin health
curl http://localhost:8096/health

# Check GPU is in use during a transcode (run while a 4K stream is playing)
docker exec -it hermestv-workstation-jellyfin-1 nvidia-smi
```

Expected: `nvidia-smi` shows the RTX 3090 Ti with non-zero GPU utilization during active transcoding.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `nvidia-smi` not found in container | NVIDIA Container Toolkit not installed or Docker Desktop GPU not enabled | Re-run prerequisite check; toggle GPU in Docker Desktop settings |
| Jellyfin shows "Software" encoder | Hardware acceleration not saved in admin UI | Re-check Step 2; restart jellyfin container after saving |
| Container exits immediately | Missing GPU runtime | Verify `docker run --rm --gpus all nvidia/cuda:12.0-base-ubuntu22.04 nvidia-smi` works first |
| Channels missing after M3U import | M3U URL typo or provider credential error | Validate URL in VLC first (from vault export); check Jellyfin logs |

---

## Hard rules

- `compose.override.yml` is gitignored — never commit it. It contains your hardware-specific paths.
- Provider credentials entered in the Jellyfin admin UI are stored in the `jellyfin-config` Docker volume — on disk at the Docker volumes location, not in this repo.
- API keys go in `G:\private\` only.

---

## See also

- `../../docker/workstation/compose.yml` — base compose definition
- `README.md` (this folder) — app overview and RTX 3090 Ti codec table
- `../web-apps/README.md` — Jellyfin Web browser client
