# HermesTV — Doc 08: Backend Stack Contract

**Version:** 1.1.0  
**Branch:** research/sota-features-may2026  
**Applies to:** QN85Q7FAAFXZA (Sherri — enhanced tier) · UN55CU8000BXZA (Dave — baseline tier)  
**Status:** BINDING — agents must not add unapproved services without updating this contract  
**Cross-refs:** `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` (agent 18/19) · `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md` (vault, QR, stream slots)

---

## 1. Purpose

This contract defines the VPS backend stack that powers HermesTV: what each service does, how services interconnect, port assignments, environment variables, and the gap analysis of services that must still be added.

All services run as Docker Compose on a single VPS. No Samsung cloud services are used. No Bixby or Samsung AI services are in the stack.

---

## 2. Approved Service Inventory

### 2.1 Currently Deployed (V3 Stack)

| Service | Image / Source | Port | Role |
|---|---|---|---|
| **Jellyfin** | `jellyfin/jellyfin:latest` | 8096 | Media server — VoD library, Live TV EPG, Continue Watching, metadata |
| **Tunarr** | `ghcr.io/chrisbenincasa/tunarr:edge` | 8000 | Virtual channel DVR — builds linear channel schedules from Jellyfin content |
| **Dispatcharr** | `ghcr.io/dispatcharr/dispatcharr:latest` | 9191 | IPTV channel management — M3U playlist management, provider routing |
| **Threadfin** | `fyb3roptik/threadfin:latest` | 34400 | M3U proxy — aggregates and re-serves M3U + XMLTV EPG to Jellyfin/Tunarr |
| **Open WebUI** | `ghcr.io/open-webui/open-webui:main` | 3000 | AI chat interface + Ollama gateway — Hermes agent front-end |
| **Uptime Kuma** | `louislam/uptime-kuma:1` | 3001 | Service health monitoring — streams health to HermesTV UI |

### 2.2 Required — Not Yet Deployed

| Service | Recommended Image | Port | Role | Priority |
|---|---|---|---|---|
| **Ollama** | `ollama/ollama:latest` | 11434 | Local LLM engine for Open WebUI — GPU-accelerated on RTX 3090 Ti; CPU fallback required | **Critical** |
| **ffprobe Quality Scanner** | Custom (`services/hermes-quality-scanner`) | 8400 | Scans stream URLs, caches quality JSON (doc 07 schema) | **Critical** |
| **Azure TTS Proxy** | Custom (`services/hermes-tts-proxy`) | 8500 | Caches and serves Azure Cognitive TTS audio per profile voice; Kokoro TTS is optional local fallback | **Critical** |
| **Safe JSON Command Router** | Custom (`services/hermes-cmd-router`) | 8600 | Validates + routes agent JSON commands (doc 06 schema) | **Critical** |
| **Redis** | `redis:7-alpine` | 6379 | Cache layer — quality scan results, TTS audio cache, rate-limit counters; password-protected via `REDIS_PASSWORD` | **Critical** |
| **Mem0 / Profile Memory** | `mem0ai/mem0:latest` | 8700 | Long-term user memory for Sherri and Dave — AI personalization; profiles strictly isolated | High |
| **Pipelines (AI routing)** | `ghcr.io/open-webui/pipelines:main` | 9099 | AI request routing between Open WebUI and Ollama + remote AI providers (MiniMax, DeepSeek, SiliconFlow, LM Studio) | High |
| **Caddy** | `caddy:2-alpine` | 80/443 | Reverse proxy + automatic TLS for all services; LAN-only for setup page and QR onboarding | High |
| **Netdata** | `netdata/netdata:latest` | 19999 | VPS performance telemetry visible in HermesTV settings | Medium |
| **Tailscale** | `tailscale/tailscale:latest` | (sidecar) | Mesh VPN — provides encrypted LAN-equivalent access between VPS, workstation, and TVs without public port exposure | High |

---

## 3. Service Interconnection Map

```
HermesTV Tizen App
    │  (all traffic via Caddy on ${VPS_DOMAIN}:443 — TLS terminated)
    │  (Tailscale ensures TV ↔ VPS path is private mesh; no public port exposure required)
    │
    ├── GET /api/channels     → Dispatcharr (9191) → Threadfin M3U (34400)
    ├── GET /api/epg          → Jellyfin (8096) / Threadfin XMLTV (34400)
    ├── GET /api/quality/{id} → ffprobe Scanner (8400) → Redis (6379)
    ├── POST /api/cmd         → Safe CMD Router (8600) → audit ledger (Redis)
    ├── POST /api/voice       → Azure TTS Proxy (8500) → Azure Cognitive Services TTS
    ├── WS  /api/chat         → Open WebUI (3000) → Pipelines (9099) → AI backend (see §4.6)
    ├── GET /api/memory       → Mem0 (8700)
    ├── GET /api/status       → Uptime Kuma REST API (3001/api/status-page/hermes)
    ├── GET /api/metrics      → Netdata (19999)
    └── STREAM avplay://      → Jellyfin / Tunarr / Dispatcharr stream URLs (backend-resolved, never raw provider URL to TV)

Uptime Kuma → (webhook push on status change) → HermesTV backend webhook receiver → TV notification
```

### Caddy Reverse Proxy Routing (443 → internal ports)

The Caddyfile pattern below applies to both the VPS public domain and the LAN `hermes.local` hostname.
The QR onboarding setup page (`/setup/provider`) is bound to the LAN interface only and is blocked from
public internet access by firewall rule — not by Caddy alone.

```caddyfile
${VPS_DOMAIN} {
    reverse_proxy /api/channels*    dispatcharr:9191
    reverse_proxy /api/epg*         threadfin:34400
    reverse_proxy /api/quality*     quality-scanner:8400
    reverse_proxy /api/cmd*         cmd-router:8600
    reverse_proxy /api/voice*       tts-proxy:8500
    reverse_proxy /api/chat*        open-webui:3000
    reverse_proxy /api/memory*      mem0:8700
    reverse_proxy /api/status*      uptime-kuma:3001
    reverse_proxy /api/metrics*     netdata:19999
    reverse_proxy /jellyfin*        jellyfin:8096
    reverse_proxy /setup/provider*  {
        to      hermes-backend:8800
        header_up X-Forwarded-For {remote_host}
        # Block non-LAN source IPs at firewall level; Caddy provides path routing only
    }
}
```

### Tailscale Routing Strategy

- All VPS services listen on Docker internal network only (no `0.0.0.0` binding for sensitive ports).
- Caddy is the sole external-facing entry point (ports 80/443).
- Tailscale is deployed as a Docker sidecar (`network_mode: service:tailscale` or host mode) so the VPS, workstation (RTX 3090 Ti), and both TVs share a private Tailscale mesh IP space (e.g. `100.x.x.x`).
- TVs connect to the backend via Tailscale IP or the `hermes.local` mDNS alias — no public IP required.
- The workstation's Ollama and LM Studio instances are reachable from the VPS via Tailscale IP only.
- Tailscale ACLs must restrict: TVs → VPS only; workstation → VPS + TVs; no peer-to-peer TV traffic.
- Tailscale auth key is stored in `G:\private\tailscale.env` and injected at container startup; never committed.

---

## 4. Service Contracts

### 4.1 ffprobe Quality Scanner (`services/hermes-quality-scanner`)

- **Input:** stream URL via `POST /scan { "stream_id": "ch_12_hd", "url": "..." }`
- **Output:** Quality JSON schema (doc 07, section 4) stored in Redis with 30-min TTL
- **Scan trigger:** First play of any stream (cold scan) + scheduled re-scan every 15 minutes for active streams
- **ffprobe command:** `ffprobe -v quiet -print_format json -show_streams -show_format -analyzeduration 10000000 -probesize 5000000 "$URL"`
- **Redis key:** `quality:{stream_id}` with 30-min TTL
- **API GET:** `GET /scan/{stream_id}` returns cached JSON or 404 if not yet scanned

### 4.2 Azure TTS Proxy (`services/hermes-tts-proxy`)

**Voice architecture:**
```
Hermes AI response text
  → POST /tts { "text": "...", "profile": "sherri" | "dave", "ssml": true }
  → Check Redis cache (key: hash of text + voice_id)
  → Cache hit: return cached .mp3 bytes
  → Cache miss: call Azure Cognitive Services TTS → cache result → return .mp3
  → Tizen app: play .mp3 via HTML Audio element (not AVPlay)
```

**Per-profile voice configuration (env var names — values sourced from `G:\private\.env` at runtime):**
```
AZURE_TTS_KEY          # Azure Cognitive Services key — never hardcoded; loaded from G:\private\.env
AZURE_TTS_REGION       # e.g. eastus — non-secret; set in .env.example
SHERRI_VOICE_ID        # Azure Neural voice name for Sherri — e.g. en-US-JennyNeural
DAVE_VOICE_ID          # Azure Neural voice name for Dave — e.g. en-US-GuyNeural
```

**Rules:**
- Users can change their voice in Settings > AI > Voice — triggers a test phrase playback
- Responses must be interruptible: Tizen app fires `audio.pause()` on any remote button press during TTS
- Short responses (< 10 words) are cached indefinitely; longer responses cached 24h
- TTS audio plays at reduced volume over live/playing content (JavaScript Web Audio ducking or AVPlay volume reduction)
- Kokoro TTS (self-hosted) may be used as fallback if Azure API is unavailable — same proxy interface

### 4.3 Safe JSON Command Router (`services/hermes-cmd-router`)

- Validates all agent JSON commands against the allowlist (doc 06)
- Enforces QN-class protection: rejects permanent tier downgrade for Sherri's TV
- Enforces rate limits (doc 06, section 8)
- Writes to audit ledger in Redis
- Exposes: `POST /cmd` (validate + forward) · `GET /cmd/audit` (last 50 entries)

### 4.4 Mem0 Profile Memory (`services/hermes-mem0`)

- Stores long-term user memories per profile (Sherri and Dave are isolated)
- Backed by Redis or local vector store
- Exposes: `POST /memory` (add fact) · `GET /memory?profile=sherri&query=theme+preference`
- Open WebUI / Pipelines queries Mem0 before generating any personalized response
- **Privacy:** No memory data leaves the VPS. No cloud sync.
- Memory includes: theme preference, favorite genres, typical viewing time, agent name preference, last action, channel preferences

### 4.5 Ollama (`ollama/ollama`)

- Runs local LLM models (Llama 3.2, Mistral, Gemma 2, etc.)
- Open WebUI sends requests to Ollama for all HermesTV AI responses
- Pipelines can route to different models based on request type (fast model for quick commands, larger model for complex questions)
- GPU acceleration preferred; CPU fallback required

### 4.6 Open WebUI + Pipelines

- Open WebUI: chat UI + API gateway; HermesTV connects via WebSocket for streaming responses
- Pipelines: middleware layer between Open WebUI and all AI backends — handles: model routing, Mem0 context injection, rate limiting, system prompt injection (Hermes persona + user name)
- System prompt injection per profile:
  ```
  You are Hermes (or {{agent_name}}), the AI assistant for HermesTV.
  The current user is {{user_display_name}}.
  Their TV is a {{tv_model}}.
  Relevant memories: {{mem0_context}}
  Keep responses concise (< 3 sentences for TV display).
  ```

### 4.7 AI Routing Policy (Pipelines)

All AI requests from the Tizen app route through Open WebUI → Pipelines. Pipelines selects the backend model according to the following priority chain. Remote AI providers are reached via Tailscale from the VPS only; their API keys are in `G:\private\.env` and are never returned to the TV.

| Request class | Primary model | Fallback 1 | Fallback 2 | Notes |
|---|---|---|---|---|
| Quick TV command (< 20 tokens out) | Ollama: `llama3.2:3b` on VPS | LM Studio on workstation (Tailscale) | Ollama: `mistral:7b` | Sub-200ms response target |
| Conversational (Hermes chat) | Ollama: `llama3.2:8b` on VPS | DeepSeek API (via SiliconFlow gateway) | MiniMax API | Mem0 context always injected |
| Complex reasoning / research | Ollama: `llama3.2:70b` on workstation GPU | DeepSeek-R1 (SiliconFlow) | MiniMax `abab6.5s` | RTX 3090 Ti 24 GB required |
| Image / vision tasks | Ollama: `llava:13b` on workstation GPU | MiniMax Vision API | — | Used for screenshot QA only |
| TTS text pre-processing | Ollama: `llama3.2:3b` on VPS | — | — | SSML tag injection; no remote call needed |

**Fallback rules:**
1. If the primary model returns no response in 3 seconds, escalate to Fallback 1.
2. If Fallback 1 fails or is unreachable (Tailscale/network), escalate to Fallback 2.
3. If all providers fail, return a canned "AI temporarily unavailable" response to the TV — do not expose error details.
4. Remote AI provider selection (MiniMax, DeepSeek, SiliconFlow) rotates based on rate-limit headroom tracked in Redis.
5. LM Studio on workstation is accessible only when the workstation is online and reachable via Tailscale. Pipelines must treat it as optional, not required.
6. No AI request payload ever includes provider credentials, stream URLs, or profile passwords.

---

## 5. docker-compose.yml Structure

All services share the `hermes-net` internal bridge network. Only Caddy exposes ports 80/443 externally.
Redis is password-protected; all services that use Redis set `REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379`.
Every service carries `restart: unless-stopped` for always-on VPS operation.

```yaml
version: "3.9"

networks:
  hermes-net:
    driver: bridge

services:
  # ── Core media stack ────────────────────────────────────────────────────────
  jellyfin:
    image: jellyfin/jellyfin:latest
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["8096:8096"]
    volumes:
      - ./config/jellyfin:/config
      - /media:/media:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8096/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  tunarr:
    image: ghcr.io/chrisbenincasa/tunarr:edge
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["8000:8000"]
    volumes: ["./config/tunarr:/home/node/app/.tunarr"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/status"]
      interval: 30s
      timeout: 10s
      retries: 3

  dispatcharr:
    image: ghcr.io/dispatcharr/dispatcharr:latest
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["9191:9191"]
    volumes: ["./config/dispatcharr:/config"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9191/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  threadfin:
    image: fyb3roptik/threadfin:latest
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["34400:34400"]
    volumes: ["./config/threadfin:/home/threadfin/conf"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:34400/api/version"]
      interval: 60s
      timeout: 10s
      retries: 3

  # ── AI stack ─────────────────────────────────────────────────────────────────
  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["11434:11434"]
    volumes: ["./config/ollama:/root/.ollama"]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/version"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["3000:8080"]
    environment:
      - OLLAMA_BASE_URL=http://ollama:11434
      - ENABLE_OLLAMA_API=true
      - WEBUI_AUTH=true
      - WEBUI_SECRET_KEY=${WEBUI_SECRET_KEY}
    volumes: ["./config/open-webui:/app/backend/data"]
    depends_on: [ollama, redis]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080"]
      interval: 30s
      timeout: 10s
      retries: 3

  pipelines:
    image: ghcr.io/open-webui/pipelines:main
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["9099:9099"]
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      # Remote AI provider keys — sourced from G:\private\.env; never hardcoded
      - MINIMAX_API_KEY=${MINIMAX_API_KEY}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - SILICONFLOW_API_KEY=${SILICONFLOW_API_KEY}
      - LM_STUDIO_URL=${LM_STUDIO_URL}   # Tailscale IP of workstation, e.g. http://100.x.x.x:1234
    volumes: ["./config/pipelines:/app/pipelines"]
    depends_on: [open-webui, redis]

  # ── Custom services ───────────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    networks: [hermes-net]
    # Redis port NOT exposed to host; internal network only
    volumes: ["./config/redis:/data"]
    command: >
      redis-server
      --save 60 1
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
      --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3

  quality-scanner:
    build: ./services/hermes-quality-scanner
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["8400:8400"]
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
    depends_on: [redis]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8400/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  tts-proxy:
    build: ./services/hermes-tts-proxy
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["8500:8500"]
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
      - AZURE_TTS_KEY=${AZURE_TTS_KEY}
      - AZURE_TTS_REGION=${AZURE_TTS_REGION}
      - SHERRI_VOICE_ID=${SHERRI_VOICE_ID}
      - DAVE_VOICE_ID=${DAVE_VOICE_ID}
    depends_on: [redis]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8500/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  cmd-router:
    build: ./services/hermes-cmd-router
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["8600:8600"]
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
    depends_on: [redis]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8600/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  mem0:
    image: mem0ai/mem0:latest
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["8700:8700"]
    environment:
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
    depends_on: [redis]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8700/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ── Observability ─────────────────────────────────────────────────────────────
  uptime-kuma:
    image: louislam/uptime-kuma:1
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["3001:3001"]
    volumes: ["./config/uptime-kuma:/app/data"]

  netdata:
    image: netdata/netdata:latest
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["19999:19999"]
    cap_add: [SYS_PTRACE]
    security_opt: [apparmor:unconfined]
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /etc/os-release:/host/etc/os-release:ro
      - ./config/netdata:/etc/netdata

  # ── Network mesh ──────────────────────────────────────────────────────────────
  tailscale:
    image: tailscale/tailscale:latest
    restart: unless-stopped
    network_mode: host
    cap_add: [NET_ADMIN, NET_RAW]
    environment:
      - TS_AUTHKEY=${TAILSCALE_AUTHKEY}   # from G:\private\.env; single-use reusable key
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    volumes:
      - ./config/tailscale:/var/lib/tailscale
      - /dev/net/tun:/dev/net/tun

  # ── Reverse proxy ─────────────────────────────────────────────────────────────
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    networks: [hermes-net]
    ports: ["80:80", "443:443"]
    volumes:
      - ./config/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./config/caddy/data:/data
      - ./config/caddy/config:/config
    depends_on:
      - jellyfin
      - dispatcharr
      - open-webui
      - quality-scanner
      - tts-proxy
      - cmd-router
      - mem0
```

---

## 6. Secrets Vault Strategy and `.env.example`

### Vault location and `.gitignore` rule

Real secret values are **never** committed to the repo. The operator maintains a local secrets file:

```
G:\private\.env        # real values — operator-controlled, not in repo
G:\private\tailscale.env  # Tailscale auth key — not in repo
```

The repo contains only `.env.example` with placeholder strings. The `.gitignore` entry is:

```gitignore
.env
G:/private/
private/
*.authkey
```

Provider credential references follow the `vault:providers/{id}` pointer scheme from
`docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md` — actual credentials load only at backend
startup from `G:\private\.env`; they are never returned to the TV or written to logs.

### `.env.example` (commit this file; never commit the real `.env`)

```bash
# ── Azure TTS ─────────────────────────────────────────────────────────────────
AZURE_TTS_KEY=REPLACE_WITH_AZURE_KEY          # from Azure portal — never commit real value
AZURE_TTS_REGION=eastus
SHERRI_VOICE_ID=en-US-JennyNeural
DAVE_VOICE_ID=en-US-GuyNeural

# ── Domain ────────────────────────────────────────────────────────────────────
VPS_DOMAIN=hermes.yourdomain.com              # public domain or Tailscale hostname

# ── Jellyfin ──────────────────────────────────────────────────────────────────
JELLYFIN_API_KEY=REPLACE_WITH_JELLYFIN_KEY

# ── Dispatcharr / Threadfin ───────────────────────────────────────────────────
DISPATCHARR_API_KEY=REPLACE_WITH_DISPATCHARR_KEY

# ── Open WebUI ────────────────────────────────────────────────────────────────
WEBUI_SECRET_KEY=REPLACE_WITH_RANDOM_SECRET

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_PASSWORD=REPLACE_WITH_STRONG_PASSWORD

# ── Remote AI providers (routed via Pipelines; keys never reach TV) ───────────
MINIMAX_API_KEY=REPLACE_WITH_MINIMAX_KEY
DEEPSEEK_API_KEY=REPLACE_WITH_DEEPSEEK_KEY
SILICONFLOW_API_KEY=REPLACE_WITH_SILICONFLOW_KEY
LM_STUDIO_URL=http://100.x.x.x:1234          # Tailscale IP of workstation — not a secret

# ── Tailscale ─────────────────────────────────────────────────────────────────
TAILSCALE_AUTHKEY=REPLACE_WITH_TS_AUTHKEY     # reusable key from Tailscale admin; never commit real value

# ── Provider credentials — DO NOT add real values here ───────────────────────
# Provider credentials (Apollo, XtremeHD) are onboarded exclusively via the
# QR flow (docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md).
# They are written to G:\private\ by the backend at onboarding time.
# They must never appear in this file, in docker-compose.yml, or in any log.
```

---

## 7. Service Health Checks (Uptime Kuma Monitors)

Uptime Kuma polls services from inside the Docker network. On status change it fires a webhook
to the HermesTV backend webhook receiver, which relays the update to the Tizen app.
The TV fetches the current status page via `GET /api/status` (Caddy → Uptime Kuma REST API at
`http://uptime-kuma:3001/api/status-page/hermes`) — Uptime Kuma does NOT expose a `/api/health`
path at its root; use the status-page API endpoint.

| Monitor Name | Type | Target | Expected | TV alert |
|---|---|---|---|---|
| Jellyfin | HTTP | `http://jellyfin:8096/health` | 200 | "Media server offline" badge |
| Tunarr | HTTP | `http://tunarr:8000/api/status` | 200 | Channel tiles grey out |
| Dispatcharr | HTTP | `http://dispatcharr:9191/api/health` | 200 | Provider badge shows warning |
| Threadfin | HTTP | `http://threadfin:34400/api/version` | 200 | EPG data stale indicator |
| Open WebUI | HTTP | `http://open-webui:3000` | 200 | Hermes AI unavailable toast |
| Ollama | HTTP | `http://ollama:11434/api/version` | 200 | AI offline indicator |
| Quality Scanner | HTTP | `http://quality-scanner:8400/health` | 200 | Quality badges hidden |
| TTS Proxy | HTTP | `http://tts-proxy:8500/health` | 200 | Voice output disabled; text-only mode |
| CMD Router | HTTP | `http://cmd-router:8600/health` | 200 | Agent commands blocked toast |
| Redis | Redis | `redis://:${REDIS_PASSWORD}@redis:6379` | PONG | Cache miss warning; degraded performance |
| Mem0 | HTTP | `http://mem0:8700/health` | 200 | Memory features disabled toast |
| Netdata | HTTP | `http://netdata:19999/api/v1/alarms` | 200 | Performance metrics unavailable |
| Tailscale | TCP | `localhost:41641` (Tailscale magic port) | connected | VPN connectivity warning |

**Watchdog rule:** If Jellyfin + Dispatcharr are both down simultaneously, the TV shows a full-screen
"Backend offline" overlay (not just badges). Resume normal UI immediately when either recovers.

Uptime Kuma webhook target: `POST /api/internal/health-event` on the HermesTV backend receiver (port 8800).
The TV displays service status in **Settings > System > Backend Health**.

---

## 8. Custom Service Specs

### 8.1 `services/hermes-quality-scanner`

- **Runtime:** Node.js 20 or Python 3.11
- **Dependencies:** `fluent-ffmpeg` (Node) or `ffmpeg-python` (Python), `ioredis`
- **Dockerfile:** FROM node:20-alpine + ffprobe binary
- **Endpoints:** `POST /scan`, `GET /scan/:stream_id`, `GET /health`
- **Concurrency:** Process up to 4 simultaneous scans; queue excess

### 8.2 `services/hermes-tts-proxy`

- **Runtime:** Python 3.11 + FastAPI
- **Dependencies:** `azure-cognitiveservices-speech`, `redis`, `aiohttp`
- **Endpoints:** `POST /tts`, `GET /voices`, `GET /health`
- **Caching:** Redis key = `tts:{sha256(text+voice_id)}`, TTL: short responses indefinite, long responses 24h
- **Kokoro fallback:** If `AZURE_TTS_KEY` is unset, route to local Kokoro TTS service

### 8.3 `services/hermes-cmd-router`

- **Runtime:** Node.js 20
- **Dependencies:** `express`, `ioredis`, `ajv` (JSON schema validation)
- **Endpoints:** `POST /cmd`, `GET /cmd/audit`, `GET /health`
- **Schema:** Validates against doc 06 allowlist + QN-class protection rules
- **Rate limiting:** Redis-backed sliding window counters

---

## 9. Backup and Recovery

### 9.1 What to back up

| Asset | Location | Backup method | Frequency |
|---|---|---|---|
| Service config volumes | `./config/` (all subdirs) | `rsync` or `tar` to operator storage | Daily |
| Redis RDB snapshot | `./config/redis/dump.rdb` | Included in config backup | Every 60 s (Redis `--save 60 1`) |
| Provider vault | `G:\private\.env` | Encrypted copy to offline storage | On any credential change |
| Caddy TLS data | `./config/caddy/data/` | Included in config backup | Daily |
| Tailscale state | `./config/tailscale/` | Included in config backup | Daily |
| Mem0 vector data | `./config/mem0/` | Included in config backup | Daily |

### 9.2 Recovery procedure

1. Restore `./config/` from backup.
2. Restore `G:\private\.env` from encrypted backup.
3. Run `docker compose up -d` — services restart using restored config.
4. Verify all services pass health checks (section 7).
5. Verify Redis reloads RDB snapshot: `redis-cli -a $REDIS_PASSWORD DBSIZE` should be non-zero.
6. Verify Mem0 memory recall works for both profiles (BACKEND-GATE-08).
7. Provider credentials are re-loaded from vault on startup — no re-onboarding required unless vault was lost.
8. If vault is lost, re-onboard providers via the QR flow (doc 07 section: QR credential onboarding flow).

### 9.3 Disaster recovery invariant

The VPS can be rebuilt from scratch by:
1. Cloning the repo (no secrets in repo).
2. Restoring `G:\private\.env` from encrypted backup.
3. Running `docker compose up -d`.

No manual service configuration via web UI should be required after a clean restore.

---

## 10. Proof Gates

| Gate | Requirement |
|---|---|
| BACKEND-GATE-01 | All 13 monitored services (§7 table) respond healthy simultaneously |
| BACKEND-GATE-02 | Ollama returns a streamed response for a test prompt via Open WebUI WebSocket |
| BACKEND-GATE-03 | ffprobe scanner returns valid quality JSON (matching doc 07 schema) for 3 test stream URLs |
| BACKEND-GATE-04 | Azure TTS proxy returns playable MP3 for a test phrase in both Sherri (`SHERRI_VOICE_ID`) and Dave (`DAVE_VOICE_ID`) voices |
| BACKEND-GATE-05 | Safe CMD Router rejects a forbidden command (e.g., `wipe_app`) with `rejected_policy` response |
| BACKEND-GATE-06 | Safe CMD Router rejects a permanent QN tier downgrade command for Sherri's profile with `qn_protected` error |
| BACKEND-GATE-07 | Redis stores a quality scan result with 30-min TTL and returns it on `GET /scan/{id}` within TTL |
| BACKEND-GATE-08 | Mem0 stores and retrieves a user memory fact for `dave_tv` profile and independently for `sherri_tv` profile; cross-profile query returns empty |
| BACKEND-GATE-09 | Caddy routes all `/api/*` paths with valid TLS cert; HTTP redirects to HTTPS |
| BACKEND-GATE-10 | Uptime Kuma status-change webhook fires to `/api/internal/health-event` within 60 s of a service going down; TV displays the alert |
| BACKEND-GATE-11 | Tailscale mesh is active; VPS, workstation, and both TV IPs are reachable from each other via `tailscale ping` |
| BACKEND-GATE-12 | Pipelines routes a complex reasoning request to remote AI fallback when Ollama is offline; response reaches TV with no credential leak |
| BACKEND-GATE-13 | `git log --all -p \| grep -iE "(password\|token\|key\|m3u\|xtream\|portal)" returns zero secret-value matches` (placeholder strings in .env.example are acceptable) |
| BACKEND-GATE-14 | Backup restore drill: wipe `./config/`, restore from backup, `docker compose up -d`, all GATE-01 services healthy within 10 minutes |

---

## 11. Out of Scope

- Samsung cloud services, Bixby AI, or SmartThings integration
- Transcoding performance tuning (Jellyfin ops concern)
- DRM license server setup (provider-dependent)
- VPS hardware provisioning (infrastructure, not this contract)
- Mobile companion app backend (future doc)
