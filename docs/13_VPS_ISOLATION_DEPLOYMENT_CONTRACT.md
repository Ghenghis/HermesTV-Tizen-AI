# 13 — VPS Isolation and Deployment Contract

Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
Local: `G:\Github\HermesTV-Tizen-AI`
Target TVs: Mom `QN85Q7FAAFXZA`; Dave `UN55CU8000BXZA`.

This document is the binding contract for VPS and workstation role separation, Docker isolation, private endpoint security, AI agent routing, and the credential vault protection model. It is referenced by `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` agents 18 (Backend Stack), 19 (LLM Routing), 23 (Security / Legal Boundary), and 24 (Release Manager / Truth Gate).

---

## Hard rules

1. The Hostinger VPS is a **private gateway and control plane only**. It must never become a transcoding box, IPTV stream relay, public M3U proxy, or mixed public-website-plus-IPTV chaos stack.
2. HermesTV services run under their own Docker Compose project name, network, volumes, and env files. They must never share a Docker network with public website containers.
3. No provider credentials, M3U URLs, Xtream tokens, portal URLs, or API keys may exist in any public-facing container, public Docker port, public Caddy/Nginx route, public log, or GitHub commit.
4. The credential vault at `G:\private\` (workstation) and `G:\Github\DaveAI-IPTV\private\` are **never displayed, logged, echoed, printed, exported, or included in any diagnostic or screenshot**. Agents may read vault references (pointer paths) but must never output vault content to any channel. These locations exist to keep secrets off all networks and off GitHub.
5. Public website (`daveai.tech`) and HermesTV must not share Caddy/Nginx virtual hosts, Docker networks, volumes, environment files, or service containers.
6. All HermesTV admin, setup, QR pairing, and provider management endpoints are private-only. They must be behind Tailscale and/or Cloudflare Access. No public TCP port may expose them.
7. Heavy compute (transcoding, ffprobe mass scans, catalog rebuild, EPG processing, AI inference, LLM) belongs on the Windows workstation unless a specific lightweight service is explicitly proven safe and sized for VPS resources.
8. The `stop` procedure for existing VPS services must use `docker compose stop` or `systemctl stop` — **never `rm`, `down -v`, or data-destructive commands** — until the operator explicitly authorizes removal.
9. AI agents must never transmit user private data, credentials, vault contents, or provider tokens to any external API — including AI model APIs. Only task descriptions, code snippets, and non-sensitive context may be sent to model endpoints.
10. Agents selecting AI models must prefer MiniMax Highspeed 2.7 or DeepSeek v4 for standard tasks. Model selection is automatic based on task class; users do not need to specify models manually.

---

## Deployment topology

```
┌─────────────────────────────────────────────────────┐
│  Hostinger VPS (private control plane)              │
│  - Tailscale node (LAN bridge to workstation)       │
│  - Caddy private gateway (Tailscale-only routes)    │
│  - HermesTV lightweight API (if needed)             │
│  - QR pairing endpoint (Tailscale-protected)        │
│  - Update manifest / version endpoint               │
│  - Postgres (small, config/state only)              │
│  - Redis (session/cache only, password-protected)   │
│  - Uptime Kuma (health dashboard, private)          │
└─────────────────────────────────────────────────────┘
                        │ Tailscale mesh
                        │
┌─────────────────────────────────────────────────────┐
│  Windows Workstation (heavy engine)                  │
│  - Dispatcharr / m3u-editor / Threadfin / tuliprox  │
│  - Jellyfin / Tunarr                                │
│  - ffprobe quality scanner                          │
│  - Catalog rebuild jobs                             │
│  - EPG processing                                   │
│  - Open WebUI / Pipelines / AI routing              │
│  - Ollama / LM Studio (local inference)             │
│  - MiniMax / DeepSeek / SiliconFlow (via Pipelines) │
│  - Preview thumbnail generation                     │
│  - Credential vault (G:\private\)                   │
└─────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────┐
│  Samsung TVs (thin clients)                         │
│  - QN85Q7FAAFXZA (Mom/Sherri — enhanced tier)       │
│  - UN55CU8000BXZA (Dave — baseline tier)            │
│  - Receive only: catalog, EPG, quality badges,      │
│    layout state, voice audio, agent commands        │
│  - Never receive: credentials, tokens, stream URLs  │
│    in raw form, provider portal URLs                │
└─────────────────────────────────────────────────────┘
```

---

## What the VPS must run

| Service | Purpose | Access |
|---|---|---|
| Tailscale | Mesh VPN — connects VPS to workstation and TVs | Private only |
| Caddy | Private HTTPS gateway; routes HermesTV API and setup pages | Tailscale + Cloudflare Access |
| HermesTV lightweight API | Thin proxy/gateway if backend cannot be reached directly from TVs | Private only |
| QR pairing endpoint | Credential onboarding flow (serves phone/PC setup page) | LAN / Tailscale only |
| Update manifest endpoint | TV app version check and update delivery | Tailscale only |
| Postgres | Config state, profile state, pairing tokens, session metadata | Container-internal + Tailscale |
| Redis | Session cache, rate-limit counters, job queues | Container-internal; no public port |
| Uptime Kuma | Service health monitoring; push-webhook from services | Private only |

---

## What the VPS must NOT run

| Forbidden service | Reason |
|---|---|
| Public IPTV stream relay | Provider terms; public exposure of private subscription |
| Transcoding (ffmpeg heavy) | VPS CPU not sized for it; belongs on workstation |
| Jellyfin / Plex playback | Heavy RAM/CPU; workstation only |
| ffprobe mass quality scans | I/O and CPU intensive; workstation only |
| Large EPG processing jobs | Memory-intensive; workstation handles this |
| Public M3U / Xtream proxy | Must never be public-facing |
| Provider portal URLs / Xtream endpoints | Credentials; must never be on public network |
| Open WebUI / Ollama inference | GPU required; workstation only |
| Public AI API proxy | No AI API calls may carry user private data |
| Any container sharing network with daveai.tech public stack | Isolation rule; see Docker separation below |

---

## VPS isolation procedure — three phases

The VPS must be converted to a HermesTV-only control plane using a strict three-phase process. **No service is stopped until the audit is complete and the operator has reviewed and approved the shutdown plan.** Nothing is ever deleted.

---

### PHASE 1 — Audit only (no stops, no changes)

Run the following inventory commands on the VPS and save the full output to `/root/hermestv-audit/VPS_AUDIT_BEFORE_SHUTDOWN.md`. Create the directory first: `mkdir -p /root/hermestv-audit`.

```bash
echo "=== HOSTNAME ===" && hostname
echo "=== UPTIME ===" && uptime
echo "=== OS ===" && cat /etc/os-release
echo "=== PUBLIC IP ===" && curl -s ifconfig.me
echo "=== TAILSCALE IP ===" && tailscale ip -4 2>/dev/null || echo "Tailscale not active"
echo "=== DISK ===" && df -h
echo "=== MEMORY ===" && free -h
echo "=== TOP 20 PROCESSES (MEM) ===" && ps aux --sort=-%mem | head -21
echo "=== TOP 20 PROCESSES (CPU) ===" && ps aux --sort=-%cpu | head -21
echo "=== DOCKER CONTAINERS ===" && docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
echo "=== DOCKER COMPOSE PROJECTS ===" && docker compose ls 2>/dev/null || docker ps --format "{{.Labels}}" | grep -o 'com.docker.compose.project=[^,]*' | sort -u
echo "=== DOCKER NETWORKS ===" && docker network ls
echo "=== DOCKER VOLUMES ===" && docker volume ls
echo "=== LISTENING PORTS ===" && ss -tulpn
echo "=== SYSTEMD SERVICES ===" && systemctl --type=service --state=running --no-pager
echo "=== NGINX STATUS ===" && systemctl is-active nginx 2>/dev/null || echo "not installed"
echo "=== CADDY STATUS ===" && systemctl is-active caddy 2>/dev/null || echo "not installed"
echo "=== APACHE STATUS ===" && systemctl is-active apache2 2>/dev/null || echo "not installed"
echo "=== UFW STATUS ===" && ufw status verbose 2>/dev/null || iptables -L -n 2>/dev/null | head -40
echo "=== ROOT CRONTAB ===" && crontab -l 2>/dev/null || echo "no root crontab"
```

**Redact before saving anywhere outside the VPS:** replace public IP with `[VPS_PUBLIC_IP]`, Tailscale IP with `[VPS_TAILSCALE_IP]`, any token or key values with `[REDACTED]`.

A sanitized copy (IPs and tokens redacted) must also be saved to the repo at:
`docs/proof/VPS_AUDIT_BEFORE_SHUTDOWN_TEMPLATE.md`

This phase produces no changes on the server. **Gate VPS-AUDIT-01 must pass before proceeding to Phase 2.**

---

### PHASE 2 — User-approved stop only (no delete, no prune)

#### Step 2a — Build the shutdown plan

Write `/root/hermestv-audit/VPS_SHUTDOWN_PLAN.md` before running any stop command. Classify every running container and systemd service using exactly these four labels:

| Label | Meaning |
|---|---|
| `KEEP_FOR_HERMESTV` | Required for HermesTV IPTV project — do not stop |
| `STOP_NON_HERMESTV` | Not needed for HermesTV — stop after user approval |
| `UNKNOWN_NEEDS_USER_REVIEW` | Cannot classify confidently — do not stop without explicit operator decision |
| `NEVER_TOUCH_SYSTEM_CRITICAL` | OS-level service (sshd, systemd-resolved, networking, ufw, cron) — never stop |

The shutdown plan must include, for every `STOP_NON_HERMESTV` entry:
- Container or service name
- Image or binary
- What it was serving
- Exact rollback command to restart it

**Gate VPS-AUDIT-02 and VPS-AUDIT-03 must pass (plan exists, operator has approved) before any stop command runs.**

#### Step 2b — Stop only approved non-HermesTV services

Use only these commands. No other form is permitted:

```bash
# Stop a Docker Compose project (safe — does not remove volumes or containers)
docker compose -p <project-name> stop

# Stop a single container (safe — does not remove it)
docker stop <container-name>

# Stop a systemd service (safe — does not remove or purge it)
systemctl stop <service-name>

# Optionally disable auto-start (safe — does not remove; rollback: systemctl enable)
systemctl disable <service-name>
```

**Permanently forbidden — never run these:**

```bash
# FORBIDDEN — destroys volumes:
docker compose down -v

# FORBIDDEN — destroys containers:
docker rm <container>
docker rm -f <container>

# FORBIDDEN — destroys images and volumes:
docker system prune
docker image prune
docker volume prune

# FORBIDDEN — removes packages:
apt remove / apt purge / apt autoremove

# FORBIDDEN — deletes files:
rm -rf <anything>
```

#### Step 2c — Write after-stop reports

After stopping approved services, write two files on the VPS:

**`/root/hermestv-audit/VPS_AUDIT_AFTER_SHUTDOWN.md`**
```
Date: <ISO timestamp>
Operator: <who approved>
Services stopped: <list>
Services kept: <list>
Services classified UNKNOWN (not touched): <list>
Containers still running: <docker ps output>
Ports still listening: <ss -tulpn output>
```

**`/root/hermestv-audit/VPS_CHANGELOG_HERMESTV_ONLY.md`**
```
# VPS Change Log — HermesTV-only conversion

## Stopped services (non-destructive)
| Service | Was running | Stopped at | Rollback command |
|---|---|---|---|
| <name> | <image/binary> | <timestamp> | <exact command to restart> |

## Services retained
| Service | Role |
|---|---|
| <name> | KEEP_FOR_HERMESTV / NEVER_TOUCH_SYSTEM_CRITICAL |
```

A sanitized copy of `VPS_CHANGELOG_HERMESTV_ONLY.md` (no IPs, no tokens) must be committed to the repo at:
`docs/proof/VPS_CHANGELOG_HERMESTV_ONLY.md`

---

### PHASE 3 — Verify HermesTV-only VPS

After Phase 2, verify all of the following before declaring the VPS converted:

```bash
# Only HermesTV-approved containers are running
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# No public IPTV or M3U ports are listening
ss -tulpn | grep -E ":(8088|8080|1935|554|9981|9982|4022|8096|8920)"
# Expected: no output (none of those ports open to 0.0.0.0)

# SSH is still available
systemctl is-active sshd && echo "SSH OK"

# Tailscale is still connected
tailscale status

# No M3U/Xtream/credential patterns in running container env
docker inspect $(docker ps -q) | grep -iE "(m3u|xtream|password|token|api_key)" | grep -v "REPLACE_WITH"
# Expected: no output (or only REPLACE_WITH placeholders)

# daveai.tech containers are stopped but not removed (data intact)
docker ps -a --filter "name=daveai" --format "table {{.Names}}\t{{.Status}}"
# Expected: containers listed with status "Exited" — not absent
```

All results must be saved to `/root/hermestv-audit/VPS_AUDIT_AFTER_SHUTDOWN.md` as proof.

---

## Docker Compose project separation

HermesTV must use a distinct Docker Compose project to prevent any network or volume cross-contamination with existing VPS services:

```yaml
# G:\Github\HermesTV-Tizen-AI\docker\vps\compose.yml
# Run as: docker compose -p hermestv-vps up -d

name: hermestv-vps

networks:
  hermestv-vps-net:
    driver: bridge
    # This network is NOT shared with any other project

volumes:
  hermestv-postgres-data:
  hermestv-redis-data:
  hermestv-caddy-data:
  hermestv-caddy-config:

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    networks: [hermestv-vps-net]
    volumes: [hermestv-postgres-data:/var/lib/postgresql/data]
    env_file: .env.hermestv
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER}"]
      interval: 30s
      timeout: 5s
      retries: 3

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    networks: [hermestv-vps-net]
    volumes: [hermestv-redis-data:/data]
    command: redis-server --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 30s
      timeout: 5s
      retries: 3

  hermestv-api:
    image: ghcr.io/ghenghis/hermestv-api:latest
    restart: unless-stopped
    networks: [hermestv-vps-net]
    env_file: .env.hermestv
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    depends_on:
      postgres: {condition: service_healthy}
      redis: {condition: service_healthy}

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    networks: [hermestv-vps-net]
    volumes:
      - hermestv-caddy-data:/data
      - hermestv-caddy-config:/config
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    ports:
      # Only bind on Tailscale interface — not 0.0.0.0
      - "100.x.x.x:443:443"   # Tailscale IP only — operator must set this
      - "100.x.x.x:80:80"
```

The project name `hermestv-vps` ensures Docker creates isolated networks and volumes with that prefix. No other project can join `hermestv-vps-net` without explicitly specifying it.

---

## Caddy private gateway (route separation)

All HermesTV routes must be served only on the Tailscale interface or behind Cloudflare Access. Public-facing `daveai.tech` routes must be in a separate Caddyfile or Caddy instance:

```caddyfile
# /docker/vps/Caddyfile — HermesTV private gateway only

# Bind only to Tailscale IP (100.x.x.x — operator must set)
{
  auto_https off
  bind 100.x.x.x
}

# HermesTV API — Tailscale only
hermestv.internal.ts.net {
  reverse_proxy hermestv-api:8080

  # Block any request with credential-pattern query params
  @credential_leak {
    query username=* password=* token=* m3u=* xtream=*
  }
  respond @credential_leak 400 "Blocked"
}

# QR pairing setup page — LAN/Tailscale only, 10-minute session TTL enforced at app level
hermestv.internal.ts.net /setup/provider* {
  reverse_proxy hermestv-api:8080/setup/provider
}

# Never route these publicly:
# /api/providers — contains provider catalog data
# /setup/* — credential onboarding
# /admin/* — all admin routes
# /api/catalog — catalog data (private)
# /api/epg — EPG data (private)
```

The public `daveai.tech` Caddyfile must reside in a separate file and a separate Caddy instance (or at minimum a separate Caddy site block with no shared upstream to hermestv-api).

---

## Env file separation

HermesTV VPS env file: `/docker/vps/.env.hermestv` (not committed to GitHub, listed in `.gitignore`).

This file contains only VPS-level service credentials (Postgres password, Redis password, Tailscale auth key, Caddy internal config). It must never contain:
- Provider credentials (M3U, Xtream, portal URLs)
- API keys for AI providers
- Azure TTS keys

Those belong in the workstation vault at `G:\private\`.

```
# .env.hermestv — VPS only
# Do not commit. Do not log. Do not display.
POSTGRES_USER=REPLACE_WITH_OPERATOR_VALUE
POSTGRES_PASSWORD=REPLACE_WITH_OPERATOR_VALUE
POSTGRES_DB=hermestv
REDIS_PASSWORD=REPLACE_WITH_OPERATOR_VALUE
TAILSCALE_AUTHKEY=REPLACE_WITH_OPERATOR_VALUE
HERMESTV_API_SECRET=REPLACE_WITH_OPERATOR_VALUE
```

---

## AI agent routing policy

Agents must select the best model automatically based on task class. Users do not need to specify models. The routing table below applies to all agent tasks across this project.

| Task class | Primary model | Fallback 1 | Fallback 2 | Notes |
|---|---|---|---|---|
| Quick command / UI change | MiniMax Highspeed 2.7 | DeepSeek V4 | Ollama local | Fast, low latency |
| Conversational / chatbot | MiniMax Highspeed 2.7 | DeepSeek V4 | Ollama local | Default agent voice path |
| Complex reasoning / planning | DeepSeek V4 | MiniMax Highspeed 2.7 | Ollama local | Multi-step tasks |
| Research / web-augmented | DeepSeek V4 + web search | MiniMax Highspeed 2.7 | — | Agent fetches sources before answering |
| Sensitive / edge-case query | SiliconFlow uncensored (auto-selected) | DeepSeek V4 | — | Automatic switch; no user action required |
| Vision / screenshot analysis | MiniMax Highspeed 2.7 vision | DeepSeek V4 vision | — | |
| Code generation | DeepSeek V4 | MiniMax Highspeed 2.7 | LM Studio local | |
| TTS preprocessing | Azure Cognitive Services | — | Silent text-only | Azure-only; no substitute TTS engine |

### Sensitive query handling

When a user query is classified as edge-case, research-heavy, or outside the default safety profile, the agent routing layer automatically selects the best available uncensored model from the SiliconFlow model catalog. This selection is:
- Transparent to the user (agent announces which model it is using)
- Automatic — users do not need to ask for a model switch
- Confined to the task at hand — subsequent turns revert to the standard model if the query class changes

### Agent self-correction and research

Agents must:
1. Search online (via web search tool) before making decisions they are uncertain about. Do not guess; verify.
2. Cross-reference multiple sources before citing a capability, version number, API behavior, or hardware spec.
3. When a mistake is identified (by the user or by the agent itself), correct it explicitly: state what was wrong, what the correct value is, and update any affected files.
4. When selecting a model for a task, agents may research the current SiliconFlow / MiniMax / DeepSeek model catalog to confirm the best available option — model APIs and capabilities change; do not rely on stale knowledge.
5. Never transmit user private data, credentials, vault file paths, or vault contents to any model API endpoint, even for "research" purposes.

---

## Credential vault protection rules

Two vault locations exist for this project:

| Vault | Purpose | Who may access |
|---|---|---|
| `G:\private\` | Workstation-local secrets: provider credentials, API keys, Azure TTS key, AI provider keys | Workstation processes only. Never displayed, never logged, never sent to any API or network. |
| `G:\Github\DaveAI-IPTV\private\` | IPTV-specific private config | Workstation processes only. Same rules as above. |

**Agent rules for vaults:**
- Agents may reference these paths by name when explaining where a secret lives.
- Agents must never read and display the contents of files in these paths.
- Agents must never include vault contents in any tool call output, commit message, log line, diagnostic export, or chat response.
- If a task requires a secret from the vault, the agent must instruct the operator to supply it at runtime — the agent does not handle it directly.

---

## daveai.tech public site isolation

The public website at `daveai.tech` must remain functional and isolated from HermesTV. The following must hold at all times:

1. `daveai.tech` containers run under their own Docker Compose project name (e.g., `daveai-web`) with a separate network.
2. No HermesTV container joins the `daveai-web` network and vice versa.
3. No Caddy route for `daveai.tech` upstreams to any HermesTV service.
4. `daveai.tech` Caddy config has no knowledge of provider catalog, M3U, Xtream, QR pairing, or HermesTV admin paths.
5. If the public website needs to be intentionally disabled during a migration, a rollback plan must exist before stopping it (document current container names, image tags, and env file backup location).

---

## Health checks

| Check | Target | Method | Frequency |
|---|---|---|---|
| HermesTV API liveness | `http://hermestv-api:8080/health` | Uptime Kuma HTTP | Every 60s |
| Postgres | `pg_isready` | Docker healthcheck | Every 30s |
| Redis | `redis-cli ping` | Docker healthcheck | Every 30s |
| Tailscale mesh | `tailscale ping <workstation-node>` | Uptime Kuma script | Every 5m |
| Caddy gateway | HTTPS response on Tailscale IP | Uptime Kuma HTTPS | Every 60s |
| QR endpoint | `GET /setup/health` returns 200 | Uptime Kuma HTTP | Every 5m |
| daveai.tech public site | `GET https://daveai.tech` | Uptime Kuma HTTPS | Every 5m |
| Workstation backend | `GET http://<tailscale-ip>:8080/health` | Uptime Kuma HTTP | Every 60s |

If any HermesTV service fails its health check for 3 consecutive intervals, Uptime Kuma sends a push notification. The TV app shows a degraded-service overlay using the provider health indicator from `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`.

---

## Backup and restore

### VPS backup targets

| Target | Method | Frequency | Retention |
|---|---|---|---|
| Postgres dump | `pg_dump` → compressed file → Tailscale to workstation | Daily | 7 days |
| Redis RDB | `BGSAVE` + copy via Tailscale | Daily | 3 days |
| HermesTV API config | Git commit of non-secret config | On change | Indefinite |
| `.env.hermestv` | Encrypted backup in `G:\private\backups\` | On change | Indefinite |

### Restore procedure

1. Stop HermesTV VPS stack: `docker compose -p hermestv-vps stop`
2. Restore Postgres: `docker exec -i hermestv-vps-postgres-1 psql -U $POSTGRES_USER < backup.sql`
3. Restore Redis: copy RDB file into volume, restart Redis container
4. Verify health checks pass before bringing TV clients back online
5. daveai.tech public site must not be affected by this procedure (separate stack)

---

## Update and rollback

```
Update flow:
1. New image pushed to ghcr.io/ghenghis/hermestv-api
2. Update manifest endpoint on VPS signals TVs that a new version is available
3. Operator pulls new image: docker compose -p hermestv-vps pull hermestv-api
4. Rolling restart: docker compose -p hermestv-vps up -d --no-deps hermestv-api
5. Health check confirms new container is healthy
6. TVs receive updated feature flags on next API poll

Rollback:
1. docker compose -p hermestv-vps stop hermestv-api
2. docker compose -p hermestv-vps run hermestv-api <previous-image-tag>
3. Or: docker tag <previous-image> ghcr.io/ghenghis/hermestv-api:rollback
       docker compose -p hermestv-vps up -d --no-deps hermestv-api
```

---

## Proof gates

No implementation is accepted without evidence for all of the following.

### VPS isolation audit gates (must complete in order before any stop command)

| Gate | Evidence required |
|---|---|
| VPS-AUDIT-01: Before inventory exists | `/root/hermestv-audit/VPS_AUDIT_BEFORE_SHUTDOWN.md` exists on VPS and `docs/proof/VPS_AUDIT_BEFORE_SHUTDOWN_TEMPLATE.md` exists in repo (redacted). No stop command has run yet. |
| VPS-AUDIT-02: Shutdown plan exists | `/root/hermestv-audit/VPS_SHUTDOWN_PLAN.md` exists with every running container and service classified as KEEP_FOR_HERMESTV / STOP_NON_HERMESTV / UNKNOWN_NEEDS_USER_REVIEW / NEVER_TOUCH_SYSTEM_CRITICAL |
| VPS-AUDIT-03: Operator approval before stop | Operator has reviewed VPS_SHUTDOWN_PLAN.md and explicitly approved the STOP_NON_HERMESTV list. No UNKNOWN service is on the stop list. |
| VPS-AUDIT-04: No destructive commands used | `/root/hermestv-audit/VPS_CHANGELOG_HERMESTV_ONLY.md` shows only `docker stop`, `docker compose stop`, `systemctl stop`. Shell history contains no `docker rm`, `down -v`, `prune`, `rm -rf`, `apt remove`, `apt purge`. |
| VPS-AUDIT-05: After inventory shows HermesTV-only active | `docker ps` output captured in `VPS_AUDIT_AFTER_SHUTDOWN.md` shows only HermesTV-approved containers running. Non-HermesTV containers appear as `Exited` — not absent. |
| VPS-AUDIT-06: Rollback commands documented | Every STOP_NON_HERMESTV entry in VPS_CHANGELOG_HERMESTV_ONLY.md has an exact rollback command. Operator can run it without additional research. |
| VPS-AUDIT-07: SSH and Tailscale preserved | `systemctl is-active sshd` returns `active`; `tailscale status` shows connected node. Confirmed after all stops complete. |
| VPS-AUDIT-08: No secrets in any audit file | `grep -rE "(password|token|m3u|xtream|api_key|secret)" /root/hermestv-audit/` returns only REPLACE_WITH placeholders, not real values. Repo copy at `docs/proof/` has all IPs replaced with `[VPS_PUBLIC_IP]` / `[VPS_TAILSCALE_IP]`. |

### VPS runtime gates (after HermesTV services are deployed)

| Gate | Evidence required |
|---|---|
| VPS-GATE-01: HermesTV project isolated | `docker network ls` shows `hermestv-vps_hermestv-vps-net` separate from all other project networks |
| VPS-GATE-02: No shared network with daveai.tech | `docker network inspect hermestv-vps_hermestv-vps-net` shows zero containers from the daveai-web project |
| VPS-GATE-03: No public IPTV port | `ss -tlnp` on VPS shows no listening port for M3U, Xtream, or stream relay services |
| VPS-GATE-04: HermesTV admin routes not public | `curl https://daveai.tech/api/providers` returns 404 or connection refused; `curl https://daveai.tech/setup/provider` same |
| VPS-GATE-05: QR endpoint Tailscale-only | HTTP request from public IP to QR endpoint returns connection refused; request via Tailscale IP succeeds |
| VPS-GATE-06: No credentials in VPS containers | `docker inspect` all HermesTV containers: no env var contains `m3u`, `xtream`, `token`, `azure_tts_key`, `deepseek`, `minimax` credential values |
| VPS-GATE-07: Redis no public port | `docker inspect hermestv-vps-redis-1` shows `PortBindings` is empty or bound to 127.0.0.1 only |
| VPS-GATE-08: daveai.tech still works | `curl -I https://daveai.tech` returns 200 or expected redirect; public site is unaffected |
| VPS-GATE-09: Vault files never in logs | `docker logs hermestv-vps-hermestv-api-1 2>&1 \| grep -iE "(G:\\\\private\|DaveAI-IPTV\\\\private\|password\|token\|m3u)"` returns zero matches |
| VPS-GATE-10: Tailscale mesh active | `tailscale ping <workstation-node>` from VPS returns pong with latency; `tailscale ping <vps-node>` from workstation same |
| VPS-GATE-11: AI routing no credential leak | Backend request log for a completed AI task shows model name, token count, and result only — no credential fields, no vault paths in the outbound payload |
| VPS-GATE-12: Uncensored model auto-switch | Test query classified as sensitive: agent log shows model switch to SiliconFlow uncensored model and reverts to MiniMax/DeepSeek on next standard query |
| VPS-GATE-13: Secret scan | `trufflehog filesystem G:\Github\HermesTV-Tizen-AI --only-verified` returns zero verified secrets |
| VPS-GATE-14: .env.hermestv not in repo | `git -C G:\Github\HermesTV-Tizen-AI log --all -- docker/vps/.env.hermestv` returns no commits |

---

## Integration with other contracts

| Contract | Dependency |
|---|---|
| `docs/08_BACKEND_STACK_CONTRACT.md` | Workstation Docker services that this VPS contract delegates to |
| `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md` | QR onboarding flow is hosted by the VPS gateway; provider records stay on workstation |
| `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` | Agent command router runs on workstation backend; VPS proxies commands only |
| `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md` | VPS proof gates (VPS-GATE-01 through VPS-GATE-14) feed into the top-level acceptance gate checklist |
| `docs/11_USER_AGENT_PERSONA_NAMING_CONTRACT.md` | AI model routing table in this doc supersedes the generic "AI provider" references in doc 11 |
