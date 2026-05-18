# HermesTV — VPS-Hostable Docker Services Guide

**Target host:** Hostinger Linux VPS (KVM, Ubuntu 22.04)
**Companion workstation stack:** `docker/workstation/compose.yml`
**VPS compose file:** `upstream/docker-vps/VPS_COMPOSE.yml`
**Hard blocker:** VPS SSH access is not yet configured. See [`docs/research/BLOCKER_VPS_SSH.md`](../../docs/research/BLOCKER_VPS_SSH.md) before attempting any VPS deployment.

---

## Architecture Overview

Two separate Docker Compose stacks. They share no networks, no volumes, and no credentials. The workstation carries all heavy compute and credential-adjacent services. The VPS carries public-facing proxy, EPG distribution, and playlist management tools.

```
┌─────────────────────────────────────────────────────────────────┐
│  Windows Workstation  (docker/workstation/compose.yml)          │
│  Project: hermestv-workstation  — LAN only, no public exposure  │
│                                                                 │
│  Jellyfin      :8096  — media server, NVENC/NVDEC (RTX 3090Ti) │
│  Tunarr        :8000  — channel schedule builder                │
│  Dispatcharr   :9191  — M3U playlist management, provider mgmt  │
│  Open WebUI    :3000  — AI chat interface (Ollama gateway)      │
│  Ollama        :11434 — local LLM inference, GPU required       │
│  Threadfin     :34400 — M3U proxy → Jellyfin EPG (workstation)  │
│  hermes-tv-api :3001  — HermesTV backend API                    │
│                                                                 │
│  Credential vault: G:\private\  (never committed, never echoed) │
│  Network: hermestv-internal (bridge, not shared with VPS stack) │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ Tailscale mesh VPN (encrypted, private)
                         │ VPS-to-workstation only — TVs cannot
                         │ reach workstation directly
                         │
┌─────────────────────────────────────────────────────────────────┐
│  Hostinger VPS  (upstream/docker-vps/VPS_COMPOSE.yml)           │
│  Project: hermestv-vps  — public-facing proxy/EPG/stream tools  │
│                                                                 │
│  Caddy         :80/:443  — reverse proxy, TLS termination       │
│  Threadfin     :34400    — M3U proxy for EPG (VPS instance)     │
│  m3u-editor    :4200     — web-based playlist editor            │
│  xtreamfilter  :3456     — Xtream API stream filter             │
│                                                                 │
│  Network: hermestv-vps-internal (bridge, isolated from          │
│           all other VPS projects including daveai-web)          │
└─────────────────────────────────────────────────────────────────┘
                         │
                         │ HTTPS (Caddy TLS)
                         │
┌─────────────────────────────────────────────────────────────────┐
│  Samsung TVs (Tizen thin clients)                               │
│  QN85Q7FAAFXZA  — Mom/Sherri — enhanced tier (no caps)         │
│  UN55CU8000BXZA — Dave       — baseline tier                    │
└─────────────────────────────────────────────────────────────────┘
```

**Isolation rule:** The `hermestv-vps` and `hermestv-workstation` Docker Compose projects must never share a Docker network, volume, or environment file. The two projects are on separate machines. The Tailscale mesh is the only communication path between them.

---

## Blocker: VPS SSH Access Not Yet Set Up

**Nothing in this guide can be deployed until this blocker is resolved.**

- See [`docs/research/BLOCKER_VPS_SSH.md`](../../docs/research/BLOCKER_VPS_SSH.md) for required steps.
- Required: SSH key, Hostinger VPS credentials, root/sudo access, Docker CE installation on VPS.
- The local workstation demo (B2) runs entirely without the VPS. This blocker only applies to production deployment.

---

## What Is Already Running on the Workstation

The following services are live in `docker/workstation/compose.yml`. They do not need to be added to the VPS stack.

| Service | Image | Port | Role |
|---|---|---|---|
| Jellyfin | `jellyfin/jellyfin:latest` | 8096 | Media server — hardware transcoding via RTX 3090 Ti |
| Tunarr | `ghcr.io/chrisbenincasa/tunarr:edge` | 8000 | Channel schedule builder, depends on Jellyfin |
| Dispatcharr | `ghcr.io/dispatcharr/dispatcharr:latest` | 9191 | IPTV channel management, M3U routing |
| Open WebUI | `ghcr.io/open-webui/open-webui:main` | 3000→8080 | AI chat interface, Ollama gateway |
| Ollama | `ollama/ollama:latest` | 11434 | Local LLM inference — GPU required (RTX 3090 Ti) |

These services must remain on the workstation. They cannot move to the VPS due to GPU requirements (Ollama), credential proximity (Dispatcharr), and RAM/CPU requirements (Jellyfin). See `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` for the binding rule.

---

## Docker Tools Reference: Full Ecosystem Matrix

All Docker-compatible IPTV tools evaluated for HermesTV. Column "Run on" indicates the target deployment for this project.

| Tool | GitHub | Docker Image | Default Port | Purpose | Run on | Ghenghis fork needed? |
|---|---|---|---|---|---|---|
| **Threadfin** | [Threadfin-Org/Threadfin](https://github.com/Threadfin-Org/Threadfin) | `ghcr.io/threadfin/threadfin` | 34400 | M3U proxy for Jellyfin/Emby EPG — successor to xTeVe | Workstation (primary) + VPS (EPG distribution) | No — use upstream |
| **xTeVe** | [xteve-project/xTeVe](https://github.com/xteve-project/xTeVe) | `dnsforge/xteve` | 34400 | Legacy M3U proxy — replaced by Threadfin | Workstation (fallback only) | No — superseded |
| **sparkison/m3u-editor** | [sparkison/m3u-editor](https://github.com/sparkison/m3u-editor) | `ghcr.io/sparkison/m3u-editor:latest` | 4200 | Web-based M3U playlist editor | VPS | No — use upstream |
| **SpanishST/xtreamfilter** | [SpanishST/xtreamfilter](https://github.com/SpanishST/xtreamfilter) | `ghcr.io/spanishst/xtreamfilter:latest` | 3456 | Filter and transform Xtream API streams | VPS | No — use upstream |
| **Jellyfin** | [jellyfin/jellyfin](https://github.com/jellyfin/jellyfin) | `jellyfin/jellyfin:latest` | 8096 | Media server — hardware transcoding | Workstation only | Fork `jellyfin-web` for Tizen patches (see upstream/forks/) |
| **ViniPlay** | [github search: ViniPlay docker](https://github.com/search?q=ViniPlay+IPTV+docker) | Community image | varies | Docker IPTV player/proxy | Evaluate — not deployed | Evaluate before forking |
| **nodecast-tv** | [github search: nodecast-tv](https://github.com/search?q=nodecast-tv) | Community image | varies | M3U → DLNA bridge | Evaluate for DLNA casting path | Evaluate before forking |
| **neTV** | [github search: neTV IPTV](https://github.com/search?q=neTV+self-hosted+iptv) | Community image | varies | Self-hosted IPTV webapp | Evaluate — not deployed | Evaluate before forking |
| **akshaynikhare/FireVisionIPTVServer** | [akshaynikhare/FireVisionIPTVServer](https://github.com/akshaynikhare/FireVisionIPTVServer) | Community image | varies | IPTV server for FireTV/Android | Evaluate for TV casting path | Evaluate before forking |
| **Tunarr** | [chrisbenincasa/tunarr](https://github.com/chrisbenincasa/tunarr) | `ghcr.io/chrisbenincasa/tunarr:edge` | 8000 | Channel schedule builder | Workstation only | No — use upstream |
| **Dispatcharr** | [Dispatcharr/Dispatcharr](https://github.com/Dispatcharr/Dispatcharr) | `ghcr.io/dispatcharr/dispatcharr:latest` | 9191 | IPTV channel/provider management | Workstation only | No — use upstream |

### Tool Status Key

- **Deployed (workstation):** Running in `docker/workstation/compose.yml` today.
- **Deployed (VPS):** In `upstream/docker-vps/VPS_COMPOSE.yml` — deploys once SSH blocker is cleared.
- **Evaluate:** Not yet deployed; warrants research before integrating.
- **Fallback:** Available as a backup option, not primary path.

---

## Threadfin: Primary M3U Proxy Recommendation

**Threadfin is the chosen M3U proxy for HermesTV on both the workstation and VPS stacks.**

### Why Threadfin over xTeVe

| Criterion | Threadfin | xTeVe |
|---|---|---|
| Maintenance status | Actively maintained (2024–2026) | Largely abandoned; last meaningful commit 2022 |
| Jellyfin/Emby compatibility | Native — Jellyfin uses Threadfin as the recommended proxy | Works but requires manual configuration workarounds |
| Multi-provider M3U merging | Built-in — merge multiple M3U sources into one unified feed | Manual M3U concatenation only |
| XMLTV/EPG support | Full XMLTV ingest + remapping, Jellyfin-compatible endpoint | XMLTV support present but less reliable with non-standard feeds |
| Docker image | Official `ghcr.io/threadfin/threadfin` via GitHub Container Registry | `dnsforge/xteve` — third-party maintained |
| Channel mapping UI | Modern web UI with drag-and-drop channel mapping | Older UI; same core function |
| API | REST API for programmatic channel updates | No REST API |
| Authentication | Built-in user management | None |

**Recommendation:** Use Threadfin on both the workstation (primary M3U proxy → Jellyfin Live TV) and the VPS (EPG distribution endpoint for external clients). xTeVe remains available as a fallback on the workstation only if Threadfin encounters issues with a specific provider format.

Threadfin GitHub: https://github.com/Threadfin-Org/Threadfin
Docker image: `ghcr.io/threadfin/threadfin`
Port: 34400 (default, configurable)

---

## Caddy: VPS Reverse Proxy Gateway

Caddy is the reverse proxy for the VPS stack. It terminates TLS, routes requests to internal services, and enforces that no raw credentials appear in any proxied URL.

**Why Caddy:**
- Automatic TLS certificate management (Let's Encrypt via DNS-01 challenge for private domains)
- `bind` directive allows binding to Tailscale IP only — HermesTV-specific services never appear on the public IP
- Compact Caddyfile syntax vs. Nginx for this use case
- `caddy:latest` is ~50MB; ~25–30MB RAM at idle

### Sample Caddyfile

This Caddyfile is for reference. Replace `hermestv.example.com` with the actual domain. The Tailscale IP bind (`100.x.x.x`) must be set to the real VPS Tailscale IP at deploy time. See `docker/vps/Caddyfile` for the production version.

```caddyfile
# VPS Caddyfile — HermesTV public-facing services
# Domain placeholder: hermestv.example.com
# Replace 100.x.x.x with the actual VPS Tailscale IP before deploying.
# This file is mounted read-only from ./Caddyfile into the Caddy container.

{
    # Global options
    admin off
    # email operator@hermestv.example.com
}

# Public-facing EPG and playlist endpoints
hermestv.example.com {
    # Route EPG/M3U proxy requests to Threadfin
    handle /epg* {
        reverse_proxy threadfin:34400
    }

    # Route playlist editor (admin — restrict to Tailscale/LAN in production)
    handle /m3u-editor* {
        # In production: add IP restriction to Tailscale subnet (100.64.0.0/10)
        reverse_proxy m3u-editor:4200
    }

    # Route Xtream filter admin (private — never expose publicly)
    handle /xtreamfilter* {
        # This path must be restricted to Tailscale subnet in production
        reverse_proxy xtreamfilter:3456
    }

    # Block any URL with credential-pattern query parameters at proxy layer
    @credential_leak {
        query username=* password=* token=* m3u=* xtream=* api_key=*
    }
    respond @credential_leak 400 "Blocked: credential pattern in URL"

    # Security headers
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options SAMEORIGIN
        Referrer-Policy strict-origin-when-cross-origin
        -Server
    }
}
```

The `./Caddyfile` is mounted as a read-only volume into the `caddy` service. Store this file at `upstream/docker-vps/Caddyfile` and copy or symlink it to the VPS deployment directory before running `docker compose up`.

---

## Credential Handling

**Hard rule: No M3U URLs, Xtream credentials, provider tokens, or API keys are stored in any Docker Compose file, Caddyfile, environment file committed to Git, or container environment variable with a real value.**

### Where credentials live

| Credential type | Location | How it reaches the service |
|---|---|---|
| M3U playlist URLs | `G:\private\` vault (workstation) | Pasted into Dispatcharr or Threadfin admin UI at runtime — never in compose files |
| Xtream username/password | `G:\private\` vault (workstation) | Entered into Dispatcharr or xtreamfilter admin UI at runtime |
| Provider portal URLs | `G:\private\` vault (workstation) | Admin UI only — never in any config file |
| Azure TTS key | `G:\private\` vault (workstation) | Injected at workstation service start from vault — not in any VPS container |
| Tailscale auth key | `G:\private\tailscale.env` (workstation) | Injected via environment variable `${TAILSCALE_AUTHKEY}` — not committed |
| VPS Postgres password | `/home/operator/private/` on VPS | Docker secret file — never in compose file value |
| VPS Redis password | `/home/operator/private/` on VPS | Environment variable from `.env.hermestv` — file not committed |

### Operator workflow

1. Deploy the VPS compose stack with placeholder environment variables (see `VPS_COMPOSE.yml`).
2. Open each service's admin UI (Threadfin at `:34400`, m3u-editor at `:4200`, xtreamfilter at `:3456`) from the Tailscale network or LAN.
3. Enter provider credentials manually in the UI. The services persist credentials in their own mounted volumes (`hermestv-vps-threadfin-data`, `hermestv-vps-m3u-editor-data`, `hermestv-vps-xtreamfilter-data`).
4. Credentials are stored in the service volumes — on the VPS filesystem — and never in any Git-tracked file.

### What never goes in any file

```
# FORBIDDEN — never add real values for these
THREADFIN_M3U_URL=<real url>
XTREAM_USERNAME=<real username>
XTREAM_PASSWORD=<real password>
M3U_EDITOR_SOURCE=<real url>
AZURE_TTS_KEY=<real key>
```

If you see any of the above with real values in any committed file, treat it as a secret exposure incident and rotate the credential immediately.

---

## VPS Deployment Sequence (when SSH blocker is resolved)

These steps are blocked until [`docs/research/BLOCKER_VPS_SSH.md`](../../docs/research/BLOCKER_VPS_SSH.md) is resolved.

1. SSH into the Hostinger VPS.
2. Install Docker CE: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker $USER`
3. Install Docker Compose plugin: `sudo apt-get install -y docker-compose-plugin`
4. Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up --authkey=<key from G:\private\>`
5. Copy `upstream/docker-vps/VPS_COMPOSE.yml` to the VPS (e.g., `/home/operator/hermestv-vps/compose.yml`).
6. Copy `upstream/docker-vps/Caddyfile` to `/home/operator/hermestv-vps/Caddyfile`.
7. Create `/home/operator/private/` and add any VPS-level secrets (Postgres password, Redis password). These files are never committed.
8. Run: `docker compose -p hermestv-vps up -d`
9. Verify: `docker compose -p hermestv-vps ps` — all services should show `Up (healthy)` or `Up`.
10. Open Threadfin admin UI, m3u-editor, and xtreamfilter from LAN or Tailscale and enter provider configuration.

---

## See Also

- `docker/workstation/compose.yml` — workstation heavy services stack
- `docker/vps/compose.yml` — VPS control plane (Postgres, Redis, Caddy, hermestv-api)
- `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` — binding isolation rules, proof gates, phase procedures
- `docs/research/agent-11-backend-vps-isolation.md` — detailed Tailscale, Caddy, and Docker isolation research
- `docs/research/BLOCKER_VPS_SSH.md` — SSH blocker tracking
- `upstream/awesome-iptv/tools.md` — npm library tools (non-Docker) for the backend pipeline
