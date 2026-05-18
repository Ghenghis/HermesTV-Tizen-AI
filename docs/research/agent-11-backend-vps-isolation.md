# Agent 11 — Backend VPS / Workstation Isolation: Architecture and Best Practices

**Repo:** `https://github.com/Ghenghis/HermesTV-Tizen-AI`  
**Local:** `G:\Github\HermesTV-Tizen-AI`  
**Agent role:** `agent-11-backend-vps-isolation`  
**Date:** 2026-05-17  
**Status:** Research lock — feeds agents 18 (Backend Stack), 19 (LLM Routing), 23 (Security / Legal Boundary), 24 (Release Manager / Truth Gate)  
**Cross-refs:**  
- `docs/08_BACKEND_STACK_CONTRACT.md` — workstation service inventory and Docker Compose structure  
- `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` — binding topology, phase procedures, and proof gates  

---

## Table of Contents

1. [Tailscale Mesh VPN](#1-tailscale-mesh-vpn)
2. [Caddy Reverse Proxy — Private Binding and Route Separation](#2-caddy-reverse-proxy)
3. [Docker Project Isolation](#3-docker-project-isolation)
4. [Hostinger VPS — Tiers, Docker, and Firewall](#4-hostinger-vps)
5. [Services Safe to Run on the Lightweight VPS](#5-services-safe-on-vps)
6. [Services That Must Stay on the Workstation](#6-services-that-must-stay-on-workstation)
7. [QR Pairing Endpoint — Local-Network-Only via VPS](#7-qr-pairing-endpoint)
8. [Backup Strategy — pg_dump over Tailscale](#8-backup-strategy)
9. [Resource Estimates Table](#9-resource-estimates-table)
10. [Conclusion](#10-conclusion)

---

## 1. Tailscale Mesh VPN

### 1.1 What Tailscale is and why it fits this architecture

Tailscale is a hosted WireGuard-based mesh VPN. Every enrolled node receives a stable `100.x.x.x` address (the "Tailscale IP") that persists regardless of where the node is or what its public IP is. Nodes find each other via Tailscale's coordination server (hosted) and then establish direct peer-to-peer WireGuard tunnels; the coordination server is never on the data path after the handshake. This matters for HermesTV: the VPS and the home workstation form a reliable private tunnel even though the workstation is behind a NAT router and has no fixed public IP.

### 1.2 Enrollment and node roles

Four node types join the tailnet for HermesTV:

| Node | Role in tailnet |
|---|---|
| Hostinger VPS | Control plane — receives TV traffic, proxies to workstation |
| Windows workstation | Heavy engine — Ollama, Jellyfin, Open WebUI, Dispatcharr |
| Samsung TV (QN85Q7FAAFXZA — Sherri) | Tizen client — thin consumer |
| Samsung TV (UN55CU8000BXZA — Dave) | Tizen client — thin consumer |

Tizen does not have a native Tailscale client as of 2026-05. The TVs therefore connect to the VPS via HTTPS (Caddy on port 443) using the VPS's Tailscale IP or a private DNS alias; Tailscale protects the VPS-to-workstation leg. <!-- NEEDS VERIFICATION: confirm whether any Tailscale client exists for Tizen OS 6+ or whether the TV-to-VPS connection must rely on Cloudflare Tunnel / Cloudflare Access as a substitute for the TV side -->

### 1.3 Enrolling the VPS node

On Ubuntu VPS:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-REPLACE_WITH_KEY --hostname=hermestv-vps
```

Alternatively, run Tailscale as a Docker sidecar (as specified in `docs/08_BACKEND_STACK_CONTRACT.md`):
```yaml
tailscale:
  image: tailscale/tailscale:latest
  network_mode: host
  cap_add: [NET_ADMIN, NET_RAW]
  environment:
    - TS_AUTHKEY=${TAILSCALE_AUTHKEY}
    - TS_STATE_DIR=/var/lib/tailscale
    - TS_USERSPACE=false
  volumes:
    - ./config/tailscale:/var/lib/tailscale
    - /dev/net/tun:/dev/net/tun
```

`TS_USERSPACE=false` (kernel WireGuard) is preferred for performance on modern Ubuntu kernels. The `network_mode: host` is required so the Tailscale container can set up the `tailscale0` network interface visible to the entire VPS host, not just to the container. <!-- NEEDS VERIFICATION: confirm Hostinger Ubuntu 22.04 images ship with the WireGuard kernel module loaded by default; some budget VPS providers use stripped kernels -->

### 1.4 Enrolling the Windows workstation

Install Tailscale for Windows from `https://tailscale.com/download`. The Windows Tailscale GUI tray app handles enrollment. Key settings:

- Enable "Run unattended" so Tailscale starts automatically at Windows login without requiring a GUI session.
- Enable "Accept routes" if the VPS advertises any subnet routes (not required for this topology — point-to-point Tailscale IPs are sufficient).
- Set the workstation hostname in the Tailscale admin console to something identifiable (e.g., `hermestv-workstation`).

The workstation's Tailscale IP (e.g., `100.x.x.x`) is referenced in the VPS Compose env as `LM_STUDIO_URL=http://100.x.x.x:1234` and is used by Pipelines to reach Ollama on the workstation.

### 1.5 Routing TV traffic through the VPS

The TVs do not join the tailnet directly. Traffic flow is:

```
Samsung TV
  → HTTPS to VPS Tailscale IP (or DNS alias) on port 443
  → Caddy on VPS (terminates TLS)
  → Internal Docker network → lightweight VPS services (Redis, Postgres, lightweight API)
  → OR → Tailscale tunnel → Workstation (for Ollama, Jellyfin, Open WebUI)
```

This means the VPS acts as a TLS-terminating proxy even for services that ultimately run on the workstation. Caddy on the VPS reverse-proxies those paths to the workstation Tailscale IP. Example Caddyfile snippet:

```caddyfile
# Proxy AI chat to Open WebUI on workstation via Tailscale
reverse_proxy /api/chat* http://100.x.x.x:3000
```

### 1.6 Tailscale ACL policy for HermesTV

Tailscale ACLs are defined in the Tailscale admin console (not in a local file). The policy below restricts communication to what HermesTV needs:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:hermestv-tv"],
      "dst": ["tag:hermestv-vps:443", "tag:hermestv-vps:80"]
    },
    {
      "action": "accept",
      "src": ["tag:hermestv-vps"],
      "dst": ["tag:hermestv-workstation:3000", "tag:hermestv-workstation:11434",
               "tag:hermestv-workstation:8096", "tag:hermestv-workstation:9191",
               "tag:hermestv-workstation:1234"]
    },
    {
      "action": "accept",
      "src": ["tag:hermestv-workstation"],
      "dst": ["tag:hermestv-vps:*"]
    }
  ],
  "tagOwners": {
    "tag:hermestv-vps":         ["autogroup:admin"],
    "tag:hermestv-workstation": ["autogroup:admin"],
    "tag:hermestv-tv":          ["autogroup:admin"]
  }
}
```

Key rules encoded above:
- TVs can only reach the VPS on ports 80/443. They cannot directly reach the workstation or other TVs.
- The VPS can reach specific workstation ports (Open WebUI 3000, Ollama 11434, Jellyfin 8096, Dispatcharr 9191, LM Studio 1234).
- The workstation can reach all VPS ports (for admin and backup operations).
- No TV-to-TV traffic is possible.

<!-- NEEDS VERIFICATION: Tailscale tags require an auth key issued for a specific tag; confirm the reusable auth key workflow in Tailscale admin generates a key bound to tag:hermestv-vps -->

### 1.7 Auth key management

A reusable, non-ephemeral Tailscale auth key is stored at `G:\private\tailscale.env` on the workstation and injected into VPS containers as `${TAILSCALE_AUTHKEY}`. This key is never committed to GitHub. Rotating the key requires re-running `tailscale up --authkey=NEW_KEY` on each node.

---

## 2. Caddy Reverse Proxy

### 2.1 Why Caddy over Nginx

Caddy is chosen because:
1. It obtains and renews TLS certificates automatically — including via DNS challenge, which works on private/internal domains.
2. Its Caddyfile syntax is significantly more compact than Nginx for simple reverse proxy configs.
3. It binds to specific IP addresses (`bind` directive) without requiring complex listen block syntax.
4. The official `caddy:2-alpine` image is ~50MB and uses under 30MB RAM at rest.

### 2.2 Binding to the Tailscale interface only

The critical security property is that the HermesTV Caddy instance must only accept connections arriving on the Tailscale interface (`tailscale0`, address `100.x.x.x`). This prevents the VPS public IP from accidentally serving HermesTV private routes.

```caddyfile
# /docker/vps/Caddyfile
{
  # Disable automatic HTTPS redirect on the global level;
  # manage per-site below. Tailscale provides encryption for
  # the TV-to-VPS leg; Caddy provides TLS termination here.
  admin off
}

# Bind only to Tailscale interface
(tailscale_bind) {
  bind 100.x.x.x  # replace with actual Tailscale IP at deploy time
}

hermestv.ts.net {
  import tailscale_bind

  # Lightweight VPS services
  reverse_proxy /api/status*  uptime-kuma:3001
  reverse_proxy /api/health*  hermestv-api:8080

  # Workstation services via Tailscale — operator sets WORKSTATION_TS_IP in .env.hermestv
  reverse_proxy /api/chat*    http://{$WORKSTATION_TS_IP}:3000
  reverse_proxy /api/channels* http://{$WORKSTATION_TS_IP}:9191
  reverse_proxy /api/epg*     http://{$WORKSTATION_TS_IP}:34400
  reverse_proxy /jellyfin*    http://{$WORKSTATION_TS_IP}:8096
  reverse_proxy /api/voice*   http://{$WORKSTATION_TS_IP}:8500
  reverse_proxy /api/quality* http://{$WORKSTATION_TS_IP}:8400

  # QR pairing — Tailscale + LAN only; firewall blocks public access
  reverse_proxy /setup/*      hermestv-api:8080

  # Block credential-pattern query params at proxy layer
  @cred_leak query username=* password=* token=* m3u=* xtream=*
  respond @cred_leak 400 "Blocked"
}
```

The `bind 100.x.x.x` directive causes Caddy's listener to bind only on the Tailscale IP. Requests arriving on the VPS public IP never reach this Caddy instance. <!-- NEEDS VERIFICATION: on some Docker setups the bind directive must match the interface visible inside the container; confirm whether `network_mode: host` or a macvlan is required for Caddy to see the `tailscale0` interface. Without host networking, Caddy sees only the Docker bridge. A common workaround is to use `network_mode: host` for both Tailscale and Caddy containers, or to publish Caddy via the Tailscale container's network namespace. -->

### 2.3 Cloudflare DNS challenge for HTTPS on private domains

Because the HermesTV domain is only reachable on the Tailscale network (not from the public internet), the standard ACME HTTP-01 challenge does not work: the Let's Encrypt validation server cannot reach the VPS's private address. The DNS-01 challenge is the correct method here — no inbound HTTP required, just a DNS TXT record.

Caddy ships with DNS challenge support via the `caddy-dns/cloudflare` plugin. The official `caddy:2-alpine` image does NOT include it by default; a custom build or the `caddy/caddy` base with the Cloudflare plugin is required:

```dockerfile
# Dockerfile.caddy
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

Updated Caddyfile global config:
```caddyfile
{
  email operator@example.com
  acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}
}
```

The `CLOUDFLARE_API_TOKEN` must have the `Zone:DNS:Edit` permission scoped to `daveai.tech`. It is stored in `.env.hermestv` and injected as an environment variable — never hardcoded in the Caddyfile.

For the private `hermestv.ts.net` domain (a Tailscale MagicDNS name), no certificate is needed since MagicDNS provides `.ts.net` certificates automatically when Tailscale HTTPS is enabled in the admin console. <!-- NEEDS VERIFICATION: confirm Tailscale HTTPS cert provisioning works for a Docker sidecar node (not a system-installed node) -->

### 2.4 Route separation between public daveai.tech and private HermesTV

Per `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` hard rule 5, the two Caddy instances must be completely separate — different containers, different Caddyfiles, different Docker networks, no shared upstreams.

The public `daveai.tech` Caddy instance:
- Runs under the `daveai-web` Docker Compose project.
- Binds to the VPS public IP on 80/443.
- Has no knowledge of `hermestv-api`, `hermestv-vps-net`, or any HermesTV route.

The private HermesTV Caddy instance:
- Runs under the `hermestv-vps` Docker Compose project.
- Binds to the Tailscale IP on 80/443.
- Has no knowledge of `daveai.tech` web containers.

Since both Caddy instances want port 443, port conflicts are avoided by binding to different IPs: one to the public IP, one to the Tailscale IP. Both can coexist on the same VPS host without port collision.

---

## 3. Docker Project Isolation

### 3.1 How `docker compose -p <name>` creates namespace isolation

When Docker Compose creates resources (networks, volumes, containers) it prefixes their names with the project name. Running with `-p hermestv-vps` or setting `name: hermestv-vps` in the compose file results in:

- Network: `hermestv-vps_hermestv-vps-net`
- Volume: `hermestv-vps_hermestv-postgres-data`
- Container: `hermestv-vps-postgres-1`

A second project `daveai-web` creates `daveai-web_daveai-web-net` — a completely separate Docker bridge network. Containers in one project cannot resolve DNS names or send packets to containers in another project's network unless:
1. They are explicitly connected to the same network using `networks:` in the compose file, OR
2. One of the networks is declared as `external: true` in both compose files.

Neither of those will be done for HermesTV vs. daveai.tech. This provides network isolation by default.

### 3.2 Verifying isolation between two projects

After deploying both projects, verify they cannot communicate:

```bash
# Step 1: Confirm networks are separate
docker network ls
# Expected: hermestv-vps_hermestv-vps-net and daveai-web_daveai-net appear as distinct entries

# Step 2: Inspect HermesTV network — should show zero daveai-web containers
docker network inspect hermestv-vps_hermestv-vps-net | grep '"Name"'
# Expected: only hermestv-vps-* container names appear

# Step 3: Attempt a cross-project ping (should fail)
docker exec hermestv-vps-hermestv-api-1 ping -c 1 daveai-web-nginx-1
# Expected: "ping: daveai-web-nginx-1: Name or service not known"
# (cross-project DNS does not resolve on separate bridge networks)

# Step 4: VPS-GATE-01 from doc 13 — project network fully isolated
docker network inspect hermestv-vps_hermestv-vps-net --format '{{range .Containers}}{{.Name}} {{end}}'
# Expected output: only containers prefixed hermestv-vps-*
```

### 3.3 Volume isolation

Docker named volumes are also project-scoped by default. `hermestv-vps_hermestv-postgres-data` cannot be mounted by a container in the `daveai-web` project unless explicitly referenced by full name with `external: true`. That must never be done.

### 3.4 Hostinger-specific Docker support

Hostinger VPS plans (VPS 1 through VPS 4 as of 2026) run Ubuntu 20.04 or 22.04 and support the standard Docker CE installation via the official `get.docker.com` script. Docker Compose V2 (the `docker compose` plugin, not the standalone `docker-compose` binary) is the recommended form.

<!-- NEEDS VERIFICATION: Hostinger KVM2-class VPS plans (VPS 2+) have confirmed Docker support. VPS 1 (1 vCPU / 4GB / 50GB) should work but nested virtualization and OverlayFS filesystem support on the specific kernel version should be confirmed after provisioning with `docker info | grep "Storage Driver"`. Expected: `overlay2`. If `vfs` is shown, contact Hostinger support — `vfs` is extremely slow and will make Redis/Postgres I/O painful. -->

Installation commands on fresh Hostinger Ubuntu VPS:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt-get install -y docker-compose-plugin
docker compose version  # should print v2.x.x
```

---

## 4. Hostinger VPS

### 4.1 Available tiers (as of 2026)

Hostinger's KVM VPS lineup (Linux):

| Plan | vCPU | RAM | SSD | Bandwidth | Monthly (approx USD) |
|---|---|---|---|---|---|
| VPS 1 | 1 vCPU | 4 GB | 50 GB NVMe | 1 TB | ~$5–7 |
| VPS 2 | 2 vCPU | 8 GB | 100 GB NVMe | 2 TB | ~$10–14 |
| VPS 4 | 4 vCPU | 16 GB | 200 GB NVMe | 4 TB | ~$20–30 |
| VPS 8 | 8 vCPU | 32 GB | 400 GB NVMe | 8 TB | ~$40–60 |

<!-- NEEDS VERIFICATION: Hostinger pricing changes frequently and promotional pricing may differ significantly. Verify at hostinger.com/vps-hosting before committing. -->

For HermesTV control plane only (Postgres + Redis + Caddy + Uptime Kuma + lightweight API + Tailscale), **VPS 2 (2 vCPU / 8 GB / 100 GB NVMe) is the recommended minimum.** VPS 1 is viable but leaves very little headroom for OS overhead, Docker daemon, and log buffering — a memory spike from Uptime Kuma or Redis under load could cause OOM kills.

### 4.2 Docker support on Hostinger

Hostinger KVM VPS instances run full Ubuntu VMs (not containers or LXC), so:
- The Docker Engine runs natively with kernel-level support.
- `overlay2` storage driver is available on Ubuntu 22.04 with kernel 5.15+.
- `/dev/net/tun` is available, which Tailscale requires.
- No Docker license or feature restrictions exist (standard community edition works).

<!-- NEEDS VERIFICATION: Confirm `/dev/net/tun` availability immediately after provisioning: `ls -la /dev/net/tun`. If missing, it may need to be enabled via the Hostinger control panel KVM kernel options. -->

### 4.3 Tailscale on Hostinger Ubuntu VPS

Tailscale requires:
1. `/dev/net/tun` — available on Hostinger KVM (see above)
2. `ip_tables` and `ip6_tables` kernel modules — present on standard Ubuntu 22.04
3. Either kernel WireGuard (`TS_USERSPACE=false`) or userspace WireGuard (`TS_USERSPACE=true`)

Kernel WireGuard is available on Ubuntu 22.04 (kernel 5.15.x ships it as `wireguard.ko`). Set `TS_USERSPACE=false` for best performance (~30% lower CPU overhead than userspace mode for the VPN tunnel).

<!-- NEEDS VERIFICATION: Run `modprobe wireguard && echo "WG OK"` on the Hostinger VPS after provisioning to confirm the kernel module loads. Some older Hostinger VPS 1 instances shipped Ubuntu 20.04 with kernel 5.4, which requires a manual `apt install wireguard` to get the module. -->

### 4.4 UFW firewall considerations on Hostinger

Hostinger VPS instances ship with UFW disabled by default but with iptables rules already in place at the hypervisor level. Recommended UFW setup for HermesTV:

```bash
# Allow SSH (critical — do this first to avoid lockout)
sudo ufw allow ssh

# Allow Tailscale (UDP 41641 for direct connections; fallback via 443)
sudo ufw allow 41641/udp

# Deny all public-facing access to HermesTV ports
# (Caddy binds to Tailscale IP only, so this is defense-in-depth)
sudo ufw deny 3001   # Uptime Kuma — never public
sudo ufw deny 5432   # Postgres — never public
sudo ufw deny 6379   # Redis — never public
sudo ufw deny 8080   # HermesTV API — never public

# Allow HTTPS only from Tailscale subnet (100.64.0.0/10)
sudo ufw allow from 100.64.0.0/10 to any port 443
sudo ufw allow from 100.64.0.0/10 to any port 80

# Enable
sudo ufw enable
```

Important Hostinger-specific note: if Hostinger provides a hardware firewall layer in the control panel, configure it to block all inbound traffic except SSH (22), Tailscale UDP (41641), and optionally the public IP 80/443 if `daveai.tech` public Caddy instance also runs here. HermesTV-specific ports must be denied at both the hardware firewall and UFW layers.

<!-- NEEDS VERIFICATION: Check whether Hostinger's built-in VPS firewall (accessible via hPanel) conflicts with UFW iptables rules. On some KVM setups, Hostinger firewall rules take precedence and UFW rules are applied inside them. Confirm by running `iptables -L -n -v` after enabling UFW. -->

---

## 5. Services Safe on VPS

### 5.1 Selection criteria

A service is safe for the lightweight VPS if:
- It has no GPU requirement.
- Its RAM footprint at steady-state is under ~300 MB.
- Its CPU usage is near-zero at idle and spikes only briefly on request.
- It handles config/state, not media or inference data flows.
- It does not perform CPU-intensive transforms (transcoding, ML inference, FFT/FFprobe bulk scanning).

### 5.2 Postgres (config and state only, small DB)

Postgres for HermesTV's control plane stores:
- User profiles and preferences (Sherri, Dave)
- Pairing tokens (QR onboarding session state)
- Update manifest records
- Session metadata (active TV clients)
- Provider health status records

This is a very small, low-write database. Realistic row counts:

| Table | Expected rows |
|---|---|
| users | 2 |
| tv_clients | 2–4 |
| pairing_sessions | 0–5 (short-lived) |
| provider_health | 20–50 |
| update_manifests | 10–50 |
| session_tokens | 10–100 |

**RAM estimate:** Postgres `shared_buffers` defaults to 128MB on a fresh install; effective working set for <1000 rows total is well under 50MB of actual data pages. The Postgres process itself uses ~20–40MB resident set. Total steady-state: **~50–80 MB RAM**.

**CPU estimate:** Near-zero at idle; spikes to <5% for a fraction of a second on a simple config read. Not a meaningful VPS load.

**Storage estimate:** <100 MB for the entire database including WAL, even after months of operation.

Postgres `postgres:16-alpine` image is ~80MB on disk; the container at runtime adds ~25MB RAM overhead.

**Configuration for VPS resource constraints:**
```yaml
postgres:
  image: postgres:16-alpine
  environment:
    - POSTGRES_SHARED_BUFFERS=64MB   # Reduce from default 128MB
    - POSTGRES_WORK_MEM=4MB
    - POSTGRES_MAX_CONNECTIONS=20    # Only hermestv-api connects; default 100 wastes RAM
```

### 5.3 Redis (session cache, small)

Redis on the VPS stores:
- TV client session tokens and rate-limit counters
- Lightweight health event cache
- Uptime Kuma trigger state

The heavy Redis caching (TTS audio cache, quality scan JSON, AI response rate limiting) belongs on the workstation's Redis instance alongside the services that generate that data.

**RAM estimate:** Base Redis process ~8 MB; with `--maxmemory 128mb` cap and expected few hundred keys: **~20–40 MB RAM** in steady operation.

**Storage estimate:** With `--save 60 1`, the RDB snapshot for this dataset is under 1 MB.

```yaml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --maxmemory 128mb
    --maxmemory-policy allkeys-lru
    --save 60 1
    --requirepass ${REDIS_PASSWORD}
```

### 5.4 Caddy

Caddy's resource profile is remarkably lean:
- **RAM:** ~25–30 MB at idle; peaks to ~60 MB during TLS handshake bursts.
- **CPU:** Near-zero at idle; a single vCPU handles thousands of concurrent TLS proxy connections. For HermesTV's 2–4 TV clients, load is negligible.
- **Storage:** TLS certificate data and ACME state fit in ~5 MB.

`caddy:2-alpine` image is ~50 MB on disk.

### 5.5 Uptime Kuma

Uptime Kuma is a Node.js application with an embedded SQLite database. It polls monitored endpoints on configurable intervals and sends webhooks on state change.

**RAM estimate:** The Uptime Kuma process uses 80–150 MB RAM depending on how many monitors are configured. With the 13 monitors specified in `docs/08_BACKEND_STACK_CONTRACT.md`, expect **~100–130 MB RAM** steady-state.

**CPU estimate:** Near-zero between polls; brief spike every 30–60 seconds per monitor.

**Storage:** SQLite DB for HermesTV's 13 monitors with 30-day history: ~20 MB.

The Uptime Kuma public dashboard must not be exposed on a public port. It is accessible via Tailscale IP only (or proxied by the HermesTV Caddy behind Tailscale).

### 5.6 HermesTV lightweight API (hermestv-api)

This is the thin proxy/gateway layer that:
- Serves the update manifest endpoint
- Validates TV client JWT sessions
- Forwards authenticated requests to workstation services
- Handles the QR pairing flow's server-side session state

Built as a lean Node.js or Python FastAPI service.

**RAM estimate:** ~50–80 MB RAM at steady-state for a Node.js Express app or Python FastAPI.

**CPU estimate:** Near-zero at idle; brief spikes on incoming TV requests that are forwarded to the workstation. No compute-intensive work happens in this service.

### 5.7 VPS total memory budget (VPS 2 with 8 GB RAM)

| Service | Steady-state RAM |
|---|---|
| Ubuntu OS + systemd | ~400 MB |
| Docker daemon + overhead | ~150 MB |
| Tailscale (kernel WireGuard) | ~30 MB |
| Postgres | ~80 MB |
| Redis | ~40 MB |
| Caddy | ~30 MB |
| Uptime Kuma | ~120 MB |
| hermestv-api | ~70 MB |
| Buffer / peaks / Docker layer cache | ~500 MB |
| **Total** | **~1.42 GB** |

On an 8 GB VPS, this leaves over 6 GB free — ample headroom. On a 4 GB VPS (VPS 1), it leaves ~2.5 GB free, which is workable but monitoring is warranted.

---

## 6. Services That Must Stay on the Workstation

The following services are explicitly forbidden from running on the lightweight VPS per `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md`. The reasons are technical, not arbitrary.

### 6.1 Ollama (GPU inference engine)

- **Why workstation only:** Ollama serves local LLM models. Even the smallest model (`llama3.2:3b`) requires ~3 GB VRAM or 4–6 GB system RAM to run at acceptable inference speed. Running a 7B parameter model requires 8+ GB RAM just for the model weights. A budget VPS with 4–8 GB RAM total cannot hold even a small model without starving all other services.
- **GPU requirement:** The RTX 3090 Ti (24 GB VRAM) on the workstation is required for the `llama3.2:70b` and vision models (`llava:13b`) used in the AI routing table. No VPS tier at any reasonable price includes a GPU.
- **RAM estimate on VPS (forbidden):** `llama3.2:3b` alone would consume 4–6 GB RAM — more than the entire HermesTV VPS service stack.

### 6.2 Open WebUI (AI chat interface + Ollama gateway)

- **Why workstation only:** Open WebUI is a Next.js web application that communicates with Ollama. It carries session state, model management UI, and its own SQLite/Postgres backend.
- **RAM estimate:** ~200–400 MB RAM at idle; spikes to 1+ GB during active model management.
- **Dependency:** Ollama must be reachable at `localhost` or a low-latency address. Routing Open WebUI on VPS to Ollama on workstation over Tailscale adds ~1–5ms of latency per token, which is acceptable for conversational chat but adds up for streaming 1000-token responses.
- **Workstation placement:** Open WebUI runs at `http://workstation-ts-ip:3000`; the VPS Caddy proxies `/api/chat*` to it via Tailscale.

### 6.3 Jellyfin (media server)

- **Why workstation only:** Jellyfin streams video content. Even without hardware transcoding, the process of reading media files, applying metadata, serving IPTV streams, and handling EPG XML requires significant RAM for its in-memory index.
- **RAM estimate:** Jellyfin with a modest library (1000–5000 items) uses 500 MB – 2 GB RAM. With live TV EPG processing, peaks can hit 3+ GB.
- **Storage:** The media files themselves are on the workstation. Running Jellyfin on a VPS would require either NFS-mounting the workstation's media (latency-heavy and fragile over Tailscale) or copying terabytes of media to VPS SSD storage (prohibitively expensive).

### 6.4 Dispatcharr (IPTV channel management)

- **Why workstation only:** Dispatcharr manages M3U playlists and provider routing. It holds provider credential references and must have direct access to provider URLs. Per contract hard rule 3, no provider credentials may exist in public-facing containers. The workstation vault at `G:\private\` is the secure credential store; Dispatcharr must run where it can read that vault.
- **RAM estimate:** ~200–400 MB at steady-state.
- **Security reason:** If Dispatcharr were on the VPS, the M3U URLs and Xtream credentials would exist on a public-internet-facing server. Per `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` hard rule 3, this is forbidden.

### 6.5 Threadfin / Tunarr

- **Same rationale as Dispatcharr:** These services aggregate M3U streams and build channel schedules. They must be co-located with the credential vault and away from any public-internet exposure.
- **RAM estimate:** Threadfin ~100–200 MB; Tunarr ~150–300 MB.

### 6.6 ffprobe mass quality scanner

- **Why workstation only:** The ffprobe quality scanner (`services/hermes-quality-scanner`) probes active stream URLs and extracts codec, bitrate, resolution, and audio metadata. A single `ffprobe` call on a live IPTV stream takes 10–30 seconds and can consume 100–200% of a single CPU core during the analysis window (due to the `-analyzeduration 10000000 -probesize 5000000` flags).
- **With 4 concurrent scans** (as specified in `docs/08_BACKEND_STACK_CONTRACT.md`), this spikes to 400–800% CPU — trivial on the 32-core workstation, catastrophic on a 2-vCPU VPS where it would starve Postgres, Redis, and Caddy.
- **Workstation placement:** The scanner runs at `http://workstation-ts-ip:8400`; the VPS Caddy proxies `/api/quality*` to it.

### 6.7 Pipelines (AI routing middleware)

- **Why workstation only:** Pipelines is the middleware that routes AI requests between Open WebUI and various AI backends (Ollama, LM Studio, remote APIs). It injects Mem0 context (requires low-latency access to Mem0 and Ollama), applies rate limits, and handles model fallback logic.
- **RAM estimate:** ~200–400 MB.
- **Co-location requirement:** Pipelines must be on the same Docker network as Open WebUI and Ollama for sub-10ms latency. Over Tailscale, inter-service latency would be 1–5ms per call; with the iterative Mem0 → Ollama → rate limit → response chain, this compounds.

### 6.8 Azure TTS Proxy

- **Why workstation only:** The TTS proxy calls the Azure Cognitive Services API using `${AZURE_TTS_KEY}`. That key must remain in the workstation vault at `G:\private\`. Running the proxy on the VPS would require putting the Azure TTS key in `.env.hermestv` — a file stored on a networked server — rather than the isolated local vault. Per hard rule 3 and vault protection rules in `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md`, AI API keys belong exclusively in `G:\private\`.
- **RAM estimate:** ~80–120 MB (FastAPI + Azure SDK).

---

## 7. QR Pairing Endpoint

### 7.1 What the QR endpoint does

The QR pairing endpoint serves a short-lived (10-minute TTL) web page that allows the TV operator to scan a QR code on the TV screen with a phone or PC browser, then enter provider credentials (M3U URL, Xtream username/password) into a form. The backend receives these credentials, writes them to `G:\private\` on the workstation (via Tailscale), and returns a success token to the TV.

Full contract in `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`.

### 7.2 Why this endpoint lives on the VPS (not directly on the workstation)

The TV needs to reach the QR session management endpoint. The TV is on the home LAN. The workstation is also on the home LAN. However:
- The QR session token (not the credential) must be accessible from both the TV (home LAN) and the operator's phone (also home LAN or Tailscale).
- The VPS has a stable DNS name and TLS certificate; the workstation's LAN IP may change.
- The VPS acts as the trusted rendezvous point for the QR session. The actual credential never travels to or through the VPS — only the session token.

Credential write path:
```
Phone browser → HTTPS to VPS QR endpoint
  → VPS creates session token in Redis (Tailscale-accessible)
  → Operator enters credential in form
  → VPS receives credential payload
  → VPS POSTs credential (over Tailscale) to workstation hermestv-api
  → Workstation writes credential to G:\private\
  → VPS session token invalidated immediately
  → TV receives session success signal (no credential in payload)
```

### 7.3 Binding the QR endpoint to LAN + Tailscale only

The QR setup page must never be accessible from the public internet. Two enforcement layers:

**Layer 1 — Caddy binding:** The HermesTV Caddy instance binds to the Tailscale IP only (see §2.2). Because the TV and the operator's phone are both on the home LAN, they must reach the VPS via either:
- The Tailscale IP directly (if the TV is a Tailscale node — currently not the case)
- A private DNS entry pointing the QR domain to the Tailscale IP, resolving only within the home network

<!-- NEEDS VERIFICATION: A home router with local DNS (e.g., Pi-hole, AdGuard Home, or router DNAT) that resolves `hermestv.local` → VPS Tailscale IP allows the TV to reach the QR endpoint via a friendly hostname without joining Tailscale. Confirm this works with Samsung SmartTV browser navigation. -->

**Layer 2 — UFW rule:** The UFW rule added in §4.4 allows port 443 only from `100.64.0.0/10` (Tailscale subnet) and optionally from the home LAN subnet (e.g., `192.168.1.0/24`). Public internet requests to port 443 on the VPS reach the `daveai.tech` Caddy instance (bound to the public IP), not the HermesTV Caddy instance.

### 7.4 Session TTL enforcement

The QR session is created in Redis with a 10-minute TTL:
```
SETEX qr:session:{token} 600 {session_json}
```

After TTL expiry, the QR page returns 410 Gone. The TV's QR display regenerates a new session token automatically. This prevents stale QR codes from being usable.

### 7.5 Serving the setup page with Caddy

```caddyfile
# QR setup page — private only
hermestv.ts.net /setup/* {
  reverse_proxy hermestv-api:8080/setup
  
  # Enforce that only Tailscale-range IPs reach this path
  @not_tailscale not remote_ip 100.64.0.0/10 192.168.0.0/16 10.0.0.0/8
  respond @not_tailscale 403 "Access denied"
}
```

---

## 8. Backup Strategy

### 8.1 pg_dump over Tailscale

The VPS Postgres database (config/state only) must be backed up to the workstation daily. Because both nodes are in the Tailscale mesh, `pg_dump` can be piped directly over SSH or via `psql` to the workstation without any public internet exposure.

**Recommended approach — SSH over Tailscale from workstation to VPS:**

```bash
# Run on workstation (Windows — via WSL or Git Bash)
# WORKSTATION_SCRIPT: backup-hermestv-postgres.sh

VPS_TS_IP="100.x.x.x"          # Replace with actual Tailscale IP
BACKUP_DIR="G:/private/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/hermestv_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

ssh root@${VPS_TS_IP} \
  "docker exec hermestv-vps-postgres-1 pg_dump -U \${POSTGRES_USER} hermestv" \
  | gzip > "$BACKUP_FILE"

echo "Backup written to $BACKUP_FILE"
```

Alternatively, run the dump from inside the VPS and push to the workstation via `scp` over Tailscale:

```bash
# Run on VPS — cron job or systemd timer
VPS_SIDE_BACKUP=/root/hermestv-backups/hermestv_$(date +%Y%m%d).sql.gz

docker exec hermestv-vps-postgres-1 \
  pg_dump -U $POSTGRES_USER hermestv | gzip > $VPS_SIDE_BACKUP

# Push to workstation via SSH over Tailscale
scp $VPS_SIDE_BACKUP \
  workstation-user@100.x.x.x:"G:/private/backups/postgres/"
```

<!-- NEEDS VERIFICATION: `scp` to a Windows path via OpenSSH on Windows requires that the target directory exists and the path uses POSIX-style slashes when accessed from scp. Confirm the exact target path syntax or use `rsync` with Windows SSH server. -->

### 8.2 Frequency

| Data type | Backup frequency | Method | Retention | Storage location |
|---|---|---|---|---|
| Postgres full dump | Daily (02:00 UTC) | pg_dump + gzip via SSH over Tailscale | 7 daily + 4 weekly | `G:\private\backups\postgres\` |
| Redis RDB snapshot | Daily (02:30 UTC) | `docker exec redis redis-cli BGSAVE` → scp over Tailscale | 3 days | `G:\private\backups\redis\` |
| Caddy TLS + config | Daily (03:00 UTC) | `docker cp` or volume tar via SSH | 7 days | `G:\private\backups\caddy\` |
| `.env.hermestv` | On every change | Manual encrypted copy | Indefinite | `G:\private\backups\env\` |
| Tailscale state | Weekly | `docker cp` from Tailscale volume | 2 copies | `G:\private\backups\tailscale\` |

### 8.3 Compression and size estimates

- Postgres dump (compressed): ~50–200 KB for the small config database
- Redis RDB (compressed): ~1–5 KB for session-only data
- Caddy data (compressed): ~50–100 KB

Total daily backup footprint: under 1 MB. Seven daily copies = under 7 MB. This is trivially small.

### 8.4 Automating the backup on the VPS

Using a `systemd` timer (preferred over `cron` on Ubuntu 22.04):

```ini
# /etc/systemd/system/hermestv-backup.service
[Unit]
Description=HermesTV Postgres daily backup over Tailscale

[Service]
Type=oneshot
User=root
ExecStart=/root/hermestv-backup.sh
```

```ini
# /etc/systemd/system/hermestv-backup.timer
[Unit]
Description=Run HermesTV backup daily at 02:00 UTC

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl enable hermestv-backup.timer
systemctl start hermestv-backup.timer
```

### 8.5 Restore verification (monthly drill)

Per `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` restore procedure and `docs/08_BACKEND_STACK_CONTRACT.md` BACKEND-GATE-14:

1. Stop HermesTV VPS stack: `docker compose -p hermestv-vps stop`
2. Drop and recreate Postgres volume: ensure backup RDB is copied into volume path before restart
3. Restore dump: `docker exec -i hermestv-vps-postgres-1 psql -U $POSTGRES_USER hermestv < backup.sql`
4. Start stack: `docker compose -p hermestv-vps up -d`
5. Verify all health checks pass within 5 minutes
6. Confirm row count is non-zero: `docker exec hermestv-vps-postgres-1 psql -U $POSTGRES_USER -c "SELECT COUNT(*) FROM users;"`

---

## 9. Resource Estimates Table

| Service | Location | Steady-state RAM | Peak RAM | CPU idle | Disk (image+data) | Notes |
|---|---|---|---|---|---|---|
| Ubuntu OS + systemd | VPS | ~400 MB | ~500 MB | ~1% | 2 GB | Base OS overhead |
| Docker daemon | VPS | ~150 MB | ~300 MB | <1% | ~1 GB layer cache | Shared across all containers |
| Tailscale (kernel WireGuard) | VPS | ~30 MB | ~50 MB | <1% | ~100 MB | `TS_USERSPACE=false` |
| Postgres 16 (config DB) | VPS | ~80 MB | ~120 MB | ~0% | ~180 MB | <1000 rows; `max_connections=20` |
| Redis 7 (session cache) | VPS | ~40 MB | ~128 MB (cap) | ~0% | ~50 MB | `maxmemory 128mb` |
| Caddy 2 (private gateway) | VPS | ~30 MB | ~60 MB | ~0% | ~55 MB | TLS proxy for 2–4 TV clients |
| Uptime Kuma 1 | VPS | ~120 MB | ~200 MB | <1% | ~100 MB | 13 monitors; SQLite |
| hermestv-api (thin proxy) | VPS | ~70 MB | ~150 MB | ~0% | ~100 MB | Node.js or FastAPI |
| **VPS total** | **VPS** | **~920 MB** | **~1.5 GB** | **~3%** | **~3.6 GB** | Fits VPS 2 (8 GB) with >6 GB headroom |
| | | | | | | |
| Ollama (3b model loaded) | Workstation | ~4 GB RAM + 3 GB VRAM | ~8 GB | ~0% idle | ~10 GB | RTX 3090 Ti required for 70b |
| Open WebUI | Workstation | ~300 MB | ~1 GB | ~1% | ~1 GB | Co-located with Ollama |
| Pipelines | Workstation | ~300 MB | ~600 MB | ~1% | ~200 MB | |
| Jellyfin | Workstation | ~800 MB | ~3 GB | ~2% | ~1 GB + media | Media library index |
| Dispatcharr | Workstation | ~300 MB | ~500 MB | ~1% | ~400 MB | |
| Threadfin | Workstation | ~150 MB | ~300 MB | <1% | ~200 MB | |
| Tunarr | Workstation | ~200 MB | ~400 MB | ~1% | ~300 MB | |
| ffprobe scanner | Workstation | ~100 MB | ~800 MB | ~0% idle | ~200 MB | Spikes to 800% CPU during 4x concurrent scans |
| Azure TTS proxy | Workstation | ~100 MB | ~200 MB | ~0% | ~150 MB | |
| Redis 7 (workstation cache) | Workstation | ~150 MB | ~512 MB (cap) | ~0% | ~100 MB | TTS cache, quality JSON |
| mem0 | Workstation | ~200 MB | ~400 MB | <1% | ~300 MB | Vector store |

All RAM figures are estimates based on typical Docker container behavior for the respective images. <!-- NEEDS VERIFICATION: Run `docker stats` on the actual deployed VPS for 48 hours to capture real steady-state and peak usage. Estimates for Node.js and Python services are based on typical production profiles; actual values depend on configured worker count and request concurrency. -->

---

## 10. Conclusion

The HermesTV split-plane architecture is well-suited to a budget Hostinger VPS (VPS 2 recommended: 2 vCPU / 8 GB / 100 GB) because the VPS carries only stateless-or-tiny-state services. The entire VPS control plane fits comfortably within 1–1.5 GB RAM at steady-state, leaving substantial headroom on an 8 GB instance.

**Key architecture decisions confirmed by this research:**

1. **Tailscale is the correct mesh VPN choice.** It is the simplest way to create an encrypted private channel between the VPS and the Windows workstation without requiring a static workstation IP or port-forwarding through the home router. The ACL policy restricts TVs to VPS-only access and prevents TV-to-TV or TV-to-workstation direct connections.

2. **Caddy binding to the Tailscale IP is a critical security control.** Without this binding, any service deployed on the HermesTV Caddy instance would be reachable from the public internet. The `bind` directive + UFW rule combination creates two independent enforcement layers.

3. **Docker Compose project namespacing provides strong isolation.** The `hermestv-vps` project creates its own network (`hermestv-vps_hermestv-vps-net`) that is structurally impossible for the `daveai-web` project to join unless the operator explicitly connects them. No configuration code does this.

4. **VPS services are appropriate for the tier.** Postgres (config only), Redis (session only), Caddy, and Uptime Kuma together use less than 300 MB RAM for data services, well within any Hostinger VPS 2 plan.

5. **The workstation boundary is enforced by both technical and policy constraints.** Ollama/GPU services cannot physically run on a budget VPS. Dispatcharr and credential-adjacent services must not run on any internet-facing server per the credential vault protection policy.

6. **QR pairing is viable on the VPS** because the endpoint only handles session tokens, not credentials. Credentials transit from the operator's phone to the VPS and are immediately forwarded to the workstation over Tailscale, with the VPS never persisting them.

7. **Backup is trivially small.** The control-plane database contains less than 1000 rows. Compressed daily pg_dump and Redis RDB backups are under 1 MB total. Storing 7 daily copies on the workstation consumes under 10 MB.

**Outstanding items that need verification on real Hostinger hardware:**

- WireGuard kernel module availability (`modprobe wireguard`)
- Docker `overlay2` storage driver (vs. `vfs`)
- `/dev/net/tun` device availability out of the box
- Tailscale `.ts.net` certificate provisioning for Docker sidecar mode
- Caddy `bind` directive behavior when both Tailscale and Docker bridge interfaces are present (may require `network_mode: host` for Caddy)
- `scp` path syntax for Windows SSH server target
- Hostinger hardware firewall interaction with UFW iptables rules

All `<!-- NEEDS VERIFICATION -->` annotations in this document mark these items. None of them are blockers for the architecture design, but each should be confirmed during the first provisioning session before declaring the VPS ready for production.

**Implementation sequence:**
1. Provision VPS 2. Confirm Docker, overlay2, WireGuard, and /dev/net/tun.
2. Install Tailscale on VPS; enroll workstation. Run `tailscale ping` in both directions.
3. Deploy `hermestv-vps` compose project (Postgres + Redis + Caddy + Uptime Kuma + hermestv-api).
4. Configure ACL policy in Tailscale admin console.
5. Configure UFW rules on VPS.
6. Deploy `daveai-web` compose project on separate network; confirm VPS-GATE-02 (no shared network).
7. Run Phase 1 audit (VPS-AUDIT-01) per `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md`.
8. Configure backup systemd timer; run first backup; verify restore drill.
9. Run all VPS-GATE-01 through VPS-GATE-14 proof gates.
