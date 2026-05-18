# VPS Phase 1 Audit — 2026-05-18

**Status**: SCAFFOLD ONLY — no audit has been run yet.
**Mode**: READ-ONLY. This phase captures the existing state of the Hostinger VPS without modifying it.
**Blocker**: SSH access not yet configured. See [BLOCKER_VPS_SSH.md](BLOCKER_VPS_SSH.md).

---

## Why this phase exists

The VPS is **shared infrastructure**. It already hosts the user's public website stack, possibly with Plesk/Apache, an existing Docker daemon, mail services, etc. HermesTV must be installed **alongside** that without:

- Stopping any running container that belongs to the existing stack
- Binding ports already in use by the public site
- Sharing Docker networks with the public site (must use `hermestv-vps-internal` exclusively)
- Modifying `.env`, provider credentials, or any file outside `/home/operator/hermestv/`
- Adding any package via `apt` until the audit is reviewed

A wrong move here takes the public website offline. The audit is the price of admission for Phase 2.

---

## Pre-flight (before running any audit command)

| Item | Status |
|---|---|
| SSH key registered with Hostinger control panel | ⬜ |
| `ssh -o BatchMode=yes operator@<vps-ip> 'echo ok'` returns `ok` | ⬜ |
| SSH key fingerprint recorded locally | ⬜ |
| Sudo access scope confirmed (operator group memberships) | ⬜ |
| User authorizes Phase 1 read-only audit start | ⬜ |

Until every box is checked, **do not run the audit scripts**.

---

## 1. SSH reachability + host identity

**Command** (run from workstation):
```bash
ssh "$VPS_HOST" 'uname -a && uptime && cat /etc/os-release | head -4'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- `uname -a` → Linux kernel + arch. Hostinger Linux VPS is typically Ubuntu 22.04 x86_64 KVM.
- `uptime` → days since last reboot. High uptime means the box has been live for a while; treat as production.
- `os-release` → confirms distro + version family.

**Risk notes**:
- If uptime is months-long, **anything running on it is load-bearing for the public site** until proven otherwise.
- An unfamiliar distro (CentOS, AlmaLinux, etc.) means `ufw`/`apt` commands may not apply; switch to `firewalld`/`dnf` equivalents.

**Classification** (after audit): KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 2. Disk + memory snapshot

**Command**:
```bash
ssh "$VPS_HOST" 'df -h / && echo --- && free -m'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- `df -h /` → root partition usage. Hostinger entry-tier VPS is 80–200 GB.
- `free -m` → RAM in MB. Entry-tier is 2–8 GB.

**Risk notes**:
- If root partition is > 80% full, HermesTV image pulls (~1 GB total: nginx + node + caddy + threadfin + m3u-editor + xtreamfilter) may run the disk out. **Abort Phase 2 until disk is freed by the operator**, not by us.
- If free RAM < 1 GB, refuse to deploy — Node + Threadfin + Caddy together need ~600 MB.

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 3. Docker presence + version

**Command**:
```bash
ssh "$VPS_HOST" 'docker --version 2>/dev/null && docker compose version 2>/dev/null || echo "docker absent"'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- Compose v2 plugin (e.g. `Docker Compose version v2.x.x`) is required by `VPS_COMPOSE.yml`.
- Docker Engine 20.10+ is fine.

**Risk notes**:
- If Docker is absent, **installation requires apt/sudo and is OUT OF SCOPE for Phase 1**. The operator installs Docker, not us.
- If only Compose v1 (`docker-compose`) is present, our compose file likely still works but flag it.

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 4. Existing containers inventory

**Command**:
```bash
ssh "$VPS_HOST" 'docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "docker absent"'
ssh "$VPS_HOST" 'docker network ls 2>/dev/null'
ssh "$VPS_HOST" 'docker volume ls 2>/dev/null'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- A name prefix of `plesk_*` or `cpanel-*` indicates a managed hosting panel — **NEVER_TOUCH**.
- `nginx`, `apache`, `caddy`, `traefik` containers without `hermestv-vps-` prefix likely belong to the public website — **KEEP, NEVER_TOUCH** unless explicitly confirmed.
- `mariadb`, `mysql`, `postgres`, `redis` without `hermestv-vps-` prefix → public website data — **NEVER_TOUCH**.
- `bridge`/`host`/`none` networks are Docker defaults → ignore.
- Custom networks not prefixed `hermestv-vps-` likely connect public services → never bind HermesTV containers to them.

**Risk notes**:
- Any container with `Status: Up (X days/weeks)` and a public port (80/443/2222/etc.) is presumed load-bearing.
- Stopped containers (`Status: Exited`) may still be the operator's staging copies — **do not prune**.

**Classification**: per container, fill the table below.

---

## 5. Listening ports / port conflicts

**Command**:
```bash
ssh "$VPS_HOST" 'ss -ltnp 2>/dev/null || netstat -tlnp 2>/dev/null'
```

**Captured output**:
```
<empty — fill after audit>
```

**HermesTV ports needed**:
| Port | Service |
|---|---|
| 80 | Caddy (HTTP → HTTPS redirect) |
| 443 | Caddy (HTTPS) |
| 3001 | hermes-tv-api (internal, behind Caddy) |
| 34400 | Threadfin admin UI (internal) |
| 4200 | m3u-editor admin UI (internal) |
| 3456 | xtreamfilter admin UI (internal) |

**Risk notes**:
- 80/443 are almost certainly already bound by Plesk/Apache. **Plan B**: bind Caddy to Tailscale interface only, OR have Plesk reverse-proxy `hermestv.<domain>` to `127.0.0.1:8080`/`8443` (and reconfigure our Caddyfile accordingly). **Do not stop the existing 80/443 listener**.
- 3001/34400/4200/3456 should be free; if not, choose new ports in our compose file before deploy.

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 6. Tailscale state

**Command**:
```bash
ssh "$VPS_HOST" 'tailscale status --json 2>/dev/null || which tailscale 2>/dev/null || echo "tailscale absent"'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- If Tailscale is installed and authenticated: `tailscale status --json` returns the tailnet membership. We need the workstation's tailnet IP to reach Jellyfin from the VPS.
- If absent: HermesTV will fall back to mock catalog data until the operator installs Tailscale separately. **Do not run `tailscale up` from this audit.**

**Risk notes**:
- If the operator's other services use Tailscale ACLs, our connections must respect those — don't touch ACLs.

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 7. Firewall rules

**Command**:
```bash
ssh "$VPS_HOST" 'sudo ufw status verbose 2>/dev/null || sudo iptables -L -n 2>/dev/null | head -40 || echo "no fw tool"'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- Look for rules allowing/denying 80, 443, 22, and the hosting-panel admin port (commonly 8443, 2083, 8880).
- Hostinger commonly preinstalls `ufw` with `default deny incoming` + `allow 22` + `allow 80/443`.

**Risk notes**:
- **Never `ufw disable` or `ufw delete` in this audit. Read-only `status verbose` only.**
- If we need to open a new port for HermesTV (we shouldn't — Caddy fronts everything), the operator does it, not us.

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 8. `/home/operator/` state

**Command**:
```bash
ssh "$VPS_HOST" 'id operator 2>/dev/null && ls -la /home/operator/ 2>/dev/null || echo "operator user/dir absent"'
ssh "$VPS_HOST" 'ls -la /home/operator/hermestv/ 2>/dev/null || echo "hermestv dir absent (good — fresh)"'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- `operator` user should exist (created by the sysadmin) with sudo + docker group memberships.
- `/home/operator/hermestv/` should be absent for a fresh install. If present, the operator may have started already — **do not overwrite**.

**Risk notes**:
- If `id operator` fails, the operator account hasn't been created. **Halt Phase 2.** Phase 1.5 is "ask sysadmin to create operator user".
- If `/home/operator/hermestv/.env` already exists, leave it alone and read its key list (without printing values).

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 9. DNS check

**Command**:
```bash
ssh "$VPS_HOST" 'getent hosts <your-domain.tld> 2>/dev/null || echo "domain not resolving from VPS"'
ssh "$VPS_HOST" 'getent hosts hermestv.<your-domain.tld> 2>/dev/null || echo "subdomain absent — to be added"'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- The bare domain should resolve to the VPS public IP if the operator already owns it.
- The `hermestv.` subdomain almost certainly does not exist yet; the operator adds an A record before Phase 2.

**Risk notes**:
- Caddy auto-TLS requires the subdomain to point to the VPS public IP **before** `docker compose up` is run, or ACME will fail and bombard Let's Encrypt's rate limit.

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## 10. Caddy / existing reverse-proxy presence

**Command**:
```bash
ssh "$VPS_HOST" 'which caddy 2>/dev/null && caddy version 2>/dev/null || echo "caddy binary absent (good — we ship it via Docker)"'
ssh "$VPS_HOST" 'ls /etc/nginx/sites-enabled/ 2>/dev/null && echo "--- apache ---" && ls /etc/apache2/sites-enabled/ 2>/dev/null'
```

**Captured output**:
```
<empty — fill after audit>
```

**Expected output notes**:
- Standalone Caddy binary absent is expected — we ship it as a Docker container.
- `nginx/sites-enabled` or `apache2/sites-enabled` listing tells us the existing reverse-proxy topology — that's what we have to coexist with.

**Risk notes**:
- If a host-level nginx is bound to 80/443, our Docker Caddy can't be. Plan B: bind Caddy inside Docker to a non-80/443 port (8080/8443) and have host nginx reverse-proxy `hermestv.<domain>` → `127.0.0.1:8080`.

**Classification**: KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

## Classification table (fill in after audit)

The single most important deliverable from this phase. Every container, port, process, and file path observed in sections 1–10 lands here. If it's not in this table after the audit, the audit isn't finished.

| Item | Where observed | Classification | Reason | Phase 2 action |
|---|---|---|---|---|
| _example: plesk_ | section 4 | NEVER_TOUCH | Hosting control panel | Coexist; do not stop |
| _example: existing nginx on 80/443_ | section 5 | KEEP | Public website front | Reverse-proxy `hermestv.<domain>` through it |
| _example: stale `test_redis` container_ | section 4 | UNKNOWN | Unknown purpose | Ask operator before any action |

**Definitions**:
- **KEEP**: belongs to the existing stack, must stay running. We coexist.
- **STOP**: confirmed-by-operator dead-weight that conflicts with HermesTV. Operator stops it manually — we never run `docker stop`.
- **UNKNOWN**: needs explicit operator confirmation before any action. Default for everything until classified.
- **NEVER_TOUCH**: load-bearing for the public site or another tenant. We never reference it in compose, network, or volume config.

---

## HermesTV separation plan (drafted post-audit)

After the table above is filled in, fill this section:

- **Network**: HermesTV uses Docker bridge network `hermestv-vps-internal` only. It is created by `VPS_COMPOSE.yml` and never bridged to any existing network.
- **Volumes**: Prefix `hermestv-vps-*`. No mount points into `/var/www/`, `/etc/nginx/`, `/etc/apache2/`, or any directory belonging to the public site.
- **Filesystem**: Everything lives under `/home/operator/hermestv/`. Compose project name is `hermestv-vps`.
- **Ports**: Decision recorded after section 5 — either bind to public 80/443 (if free) or behind existing reverse proxy on non-conflicting ports.
- **Secrets**: `.env` at `/home/operator/hermestv/.env`, mode 0600, owned by `operator:operator`. Never committed, never logged, never echoed.
- **Logs**: `docker logs hermestv-vps-*` only. No syslog injection.

---

## Rollback plan

If Phase 2 deployment causes any visible regression on the public website:

1. **Immediate**: `docker compose -f /home/operator/hermestv/VPS_COMPOSE.yml -p hermestv-vps stop` (stop only, no `down`, no `-v`).
2. **Verify public site recovers** within 60 seconds. If not, the issue isn't HermesTV — escalate to the operator.
3. **Investigate via Docker logs and the audit table** before any further action.
4. **Resume** only after the root cause is patched in our compose file and re-audited.

**Never** during rollback:
- `docker rm` any container
- `docker volume rm` any volume
- `docker system prune` anything
- `docker compose down -v` (the `-v` would wipe HermesTV volumes — bad)
- Touch files outside `/home/operator/hermestv/`

---

## Final Phase 1 checklist

- [ ] SSH reachable (section 1)
- [ ] Docker installed and version recorded (section 3)
- [ ] Existing containers inventoried with names + images + status + ports (section 4)
- [ ] Listening ports inventoried with PID/process name (section 5)
- [ ] Tailscale status known (section 6)
- [ ] Existing website stack identified (sections 4, 10)
- [ ] HermesTV separation plan ready (this doc, post-audit)
- [ ] Rollback plan documented (this doc, above)
- [ ] Every observed item classified KEEP / STOP / UNKNOWN / NEVER_TOUCH (table above)
- [ ] Operator review + sign-off on classification table before Phase 2 begins

When every box is checked AND the operator approves the table, Phase 2 (deployment) may be planned. Not before.
