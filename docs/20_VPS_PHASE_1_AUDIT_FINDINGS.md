# 20 — VPS Phase 1 Audit Findings

**Audit date**: 2026-05-18
**Audit tool**: [`tools/vps-audit-phase-1.ps1`](../tools/vps-audit-phase-1.ps1) (read-only)
**Raw run report**: `docs/research/vps-phase-1-audit-RUN-2026-05-18T09-52-17Z.md` (gitignored)
**Audit template**: [`docs/research/vps-phase-1-audit-2026-05-18.md`](research/vps-phase-1-audit-2026-05-18.md)

---

## Bottom line

**The VPS is NOT empty.** It hosts Dave's production AI/web stack at `daveai.tech`. HermesTV will install **alongside** that stack without stopping, restarting, removing, or otherwise modifying any existing service. Two blockers must be resolved before Phase 2 deploy:

1. **Port 3001 conflict** — already bound by an existing `next-server`. HermesTV API moves to **3011**. Patched in this branch (`ops/phase-1-5-vps-remediation`).
2. **`operator` user does not exist** — sysadmin creates it before re-audit. Runbook at [22_CREATE_OPERATOR_USER_RUNBOOK.md](22_CREATE_OPERATOR_USER_RUNBOOK.md).

---

## VPS profile

| Item | Observed |
|---|---|
| OS | Ubuntu 24.04.4 LTS (Noble Numbat) |
| Kernel | Linux 6.8.0-101 x86_64 (KVM) |
| Hostname | `srv1376124` (Hostinger) |
| Uptime | 8 days, load 0.10 (healthy, production) |
| Disk | 88 GB used / 193 GB total — 105 GB free (46% used) |
| RAM | 12.5 GB available / 15.6 GB total (3.4 GB in use, 4 GB swap free) |
| Docker | v29.4.3 + Compose v5.1.3 |
| Tailscale | v1.96.4 — authenticated and running |
| Firewall | `ufw inactive` — fail2ban active, Hostinger network firewall presumed |

Plenty of room for HermesTV (~1 GB image footprint, ~600 MB RAM peak).

---

## Existing daveai.tech stack — OFF-LIMITS

**Containers (8-day uptime, all classified `NEVER_TOUCH_SYSTEM_CRITICAL`)**:

| Container | Image | Ports | Notes |
|---|---|---|---|
| `pipelines` | `ghcr.io/open-webui/pipelines:main` | 9099 | Public AI middleware |
| `open-webui` | `ghcr.io/open-webui/open-webui:main` | 7860 | Public AI front-end (healthy) |
| `hermes1` … `hermes5` | `nousresearch/hermes-agent:latest` | — | Pre-existing agent fleet — name collision with our project but separate codebase |
| `shiba-postgres` | `pgvector/pgvector:pg16` | 5499 | Vector DB for the Shiba memory stack (healthy) |
| `model-server` | `nginx:1.25-alpine` | 8080 | Model serving front |
| `edge-tts-server` | `kilocode-voice-edge-tts-server` | — | Exited 127, 8d ago — flagged `UNKNOWN_NEEDS_USER_REVIEW`, do not prune |

**Listening ports** (subset relevant to us):

| Port | Process | Action |
|---|---|---|
| **3001** | `next-server` (PID 1154) | **CONFLICT — HermesTV moved to 3011** |
| 80 / 443 | host `nginx` (5 workers) | Coexist via additional nginx site config |
| 11434 | `ollama` (loopback) | Optional integration target |
| 4000, 16465 | `litellm` | Off-limits |
| 18789 | `node` (unknown app) | `UNKNOWN_NEEDS_USER_REVIEW` |
| 8888 | `python` (probably notebook) | `UNKNOWN_NEEDS_USER_REVIEW` |
| 22 | `sshd` | Untouched |

**Active nginx sites under daveai.tech** (10):
- `daveai.tech`, `diy.daveai.tech`, `fleet.daveai.tech`, `game.daveai.tech`, `hermes-chat`, **`hermes.daveai.tech`**, `hermes3d.daveai.tech`, `openhands.daveai.tech`, `voice.daveai.tech`, `www-redirect`

> **`hermes.daveai.tech` is already taken by a separate project.** HermesTV uses `hermestv.daveai.tech` (added in Phase 1.5). On 2026-05-18 the short canonical `tv.daveai.tech` was added as an additive nginx alias — same VPS IP, same upstream — so both URLs answer. `tv.daveai.tech` is the new canonical; `hermestv.daveai.tech` remains valid indefinitely.

**Active systemd services** (selection):
`docker`, `containerd`, `nginx`, `fail2ban`, `ollama`, `litellm`, `postgresql@16`, `nats`, `pm2-root`, `kilocode-runtime`, `kilocode-settings`, `kilocode-webui`, `shiba-gateway`. All `NEVER_TOUCH_SYSTEM_CRITICAL`.

---

## HermesTV-side state

| Item | Status |
|---|---|
| `operator` user on VPS | **ABSENT** — Phase 1.5 blocker |
| `/home/operator/hermestv/` | absent (good — fresh install path) |
| `caddy` host binary | absent (good — we ship Caddy in Docker if used) |

---

## Classification summary

| Category | Count |
|---|---|
| `KEEP_FOR_HERMESTV` | 7 |
| `STOP_NON_HERMESTV` | **0** (no shutdowns approved) |
| `UNKNOWN_NEEDS_USER_REVIEW` | 4 |
| `NEVER_TOUCH_SYSTEM_CRITICAL` | 19 |

Full per-item table is in the raw run report (`docs/research/vps-phase-1-audit-RUN-*.md`).

---

## Hard rules carried into Phase 1.5 and beyond

- ❌ Never `docker stop`, `docker rm`, `docker compose down -v`, `docker system prune`, `docker volume rm` against any existing container/volume.
- ❌ Never modify host `nginx`, host `Caddy` (none present), `ufw`, `iptables`, `systemd`, or any service under `kilocode-*` / `shiba-*` / `daveai.tech` sites.
- ❌ Never modify `.env`, provider credentials, host-level config files, or anything under `/etc/` from this side.
- ❌ Never run `apt install/remove/purge` from this side. Sysadmin handles host packages.
- ✅ HermesTV lives **only** under `/home/operator/hermestv/`, on its own Docker network `hermestv-vps-internal`, on its own port 3011, behind its own subdomain `hermestv.daveai.tech`.

---

## What changes in this PR (`ops/phase-1-5-vps-remediation`)

| File | Change |
|---|---|
| `upstream/docker-vps/VPS_COMPOSE.yml` | `hermes-tv-api` `PORT: "3001"` → `"3011"`, healthcheck URL updated |
| `upstream/docker-vps/Caddyfile` | `reverse_proxy hermes-tv-api:3001` → `:3011` |
| `upstream/docker-vps/.env.example` | `PORT=3001` → `PORT=3011`; domain default → `hermestv.daveai.tech` |
| `apps/hermes-web-tv/nginx.conf` | `proxy_pass http://hermes-tv-api:3001` → `:3011` |
| `services/hermes-tv-api/Dockerfile` | Container default `PORT=3011`, parametric healthcheck |
| `docker/vps/compose.yml` | `hermes-tv-api` `PORT: '3001'` → `'3011'`, healthcheck URL updated |
| `docker/vps/Caddyfile` | `reverse_proxy hermes-tv-api:3001` → `:3011` |
| `upstream/nginx/hermestv.daveai.tech.conf.example` | **NEW** — operator-owned host nginx site template |
| `docs/20_VPS_PHASE_1_AUDIT_FINDINGS.md` | **NEW** — this document |
| `docs/21_VPS_PHASE_1_5_REMEDIATION_PLAN.md` | **NEW** — the plan |
| `docs/22_CREATE_OPERATOR_USER_RUNBOOK.md` | **NEW** — sysadmin runbook (do not auto-execute) |
| `tools/vps-audit-phase-1.{sh,ps1}` | Forbidden-pattern fix (bare `>` was over-broad; explicit destructive patterns still enforced) |
| `.gitignore` | Add `docs/research/vps-phase-1-audit-RUN-*.md` (raw runs stay local) |

**Not changed** (intentional):
- `services/hermes-tv-api/.env.example` keeps `PORT=3001` — local-dev convention.
- `services/hermes-tv-api/src/index.js` keeps `process.env.PORT || 3001` fallback — local-dev default.
- `apps/hermes-web-tv/src/api/hermesApi.js` keeps `http://localhost:3001` auto-detection — local-dev only.
- `apps/hermes-web-tv/index.html` CSP already allows both ports.

---

## Next gates before Phase 2

1. PR `ops/phase-1-5-vps-remediation` reviewed and merged.
2. Sysadmin runs the [operator-user runbook](22_CREATE_OPERATOR_USER_RUNBOOK.md) on the VPS — manual, not automated from this side.
3. Sysadmin adds DNS A record `hermestv.daveai.tech` → VPS public IP (Cloudflare panel).
4. Sysadmin installs the [nginx upstream template](../upstream/nginx/hermestv.daveai.tech.conf.example) into `/etc/nginx/sites-enabled/` and reloads nginx.
5. **Re-audit as `operator@` user** (re-run [vps-audit-phase-1.ps1](../tools/vps-audit-phase-1.ps1) with `VPS_USER=operator`).
6. Phase 2 deploy plan opens a separate PR.

No Phase 2 work proceeds until all 5 gates are green.
