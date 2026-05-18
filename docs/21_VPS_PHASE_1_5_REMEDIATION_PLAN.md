# 21 — VPS Phase 1.5 Remediation Plan

**Branch**: `ops/phase-1-5-vps-remediation`
**Predecessor**: [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md)
**Successor**: Phase 2 deploy plan (not yet opened)

---

## Why Phase 1.5 exists

Phase 1 was a read-only audit. It produced two facts that block Phase 2:

1. The VPS has a hot port conflict on **3001** (`next-server` is already there).
2. The `operator` system user that HermesTV deploys under **does not exist** on the VPS yet.

Phase 1.5 closes both gaps **without touching the VPS**. It only modifies files in this repo and documents the manual steps the sysadmin runs on the box. Once Phase 1.5 lands, a re-audit happens, and only then can Phase 2 ship.

---

## Hard guarantees of Phase 1.5

This phase does NOT:

- ❌ SSH into the VPS for anything beyond the (already-completed) read-only audit
- ❌ Start, stop, restart, remove, or modify any existing container
- ❌ Touch host `nginx`, host `Caddy`, `ufw`, `iptables`, `systemd`, or any system service
- ❌ Touch `.env`, provider credentials, or any file under `/etc/`, `/var/`, or `/home/` on the VPS
- ❌ `apt install`, `apt remove`, `apt purge`, `apt-get …`
- ❌ Add a DNS record, request a TLS cert, or pull any Docker image to the VPS
- ❌ Run `docker compose up`

This phase DOES:

- ✅ Patch HermesTV repo files so the API listens on **3011** in VPS context (3001 stays for local dev)
- ✅ Add an nginx site template the sysadmin can paste in (operator-owned, not auto-installed)
- ✅ Add docs explaining the audit findings, the remediation, and the operator-user setup
- ✅ Add the operator-user runbook (review-only — sysadmin executes it manually)

---

## Repo changes in this PR

### Port migration: 3001 → 3011 (VPS only)

Files touched (all VPS-context):

```
upstream/docker-vps/VPS_COMPOSE.yml      # hermes-tv-api PORT env + healthcheck
upstream/docker-vps/Caddyfile            # reverse_proxy upstream
upstream/docker-vps/.env.example         # PORT=3011, PUBLIC_DOMAIN=hermestv.daveai.tech
apps/hermes-web-tv/nginx.conf            # /api proxy_pass
services/hermes-tv-api/Dockerfile        # container default PORT + parametric healthcheck
docker/vps/compose.yml                   # hermes-tv-api PORT env + healthcheck
docker/vps/Caddyfile                     # reverse_proxy upstream
```

Files NOT touched (intentional — local-dev convention):

```
services/hermes-tv-api/.env.example      # PORT=3001 (local dev)
services/hermes-tv-api/src/index.js      # process.env.PORT || 3001 fallback
apps/hermes-web-tv/src/api/hermesApi.js  # http://localhost:3001 auto-detect
apps/hermes-web-tv/src/api/azureVoiceClient.js  # ditto
apps/hermes-web-tv/index.html            # CSP already allows both 3001 and 3011 origins via 'self' + LAN range
```

Rationale: local dev keeps the conventional 3001. VPS deployment overrides via env. Both work in their context with zero source-code changes.

### New files

```
docs/20_VPS_PHASE_1_AUDIT_FINDINGS.md
docs/21_VPS_PHASE_1_5_REMEDIATION_PLAN.md  (this document)
docs/22_CREATE_OPERATOR_USER_RUNBOOK.md
upstream/nginx/hermestv.daveai.tech.conf.example
```

### Audit-tool fix

The Phase 1 audit script had a bare `>` entry in the forbidden-pattern list that also matched safe stderr/null redirects (`2>/dev/null`, `>/dev/null`), aborting the audit prematurely. Replaced with explicit destructive patterns (already in place — `rm -rf`, `docker rm`, etc.). The fix is the difference between the audit not running at all (broken safety) and running cleanly (good safety).

Files: `tools/vps-audit-phase-1.sh`, `tools/vps-audit-phase-1.ps1`.

### Gitignore

Raw audit run reports (`docs/research/vps-phase-1-audit-RUN-*.md`) are now gitignored. They contain hostnames + container inventory and stay local. The numbered summary doc (`docs/20_…`) carries only what's safe to share.

---

## Manual steps the sysadmin runs (NOT automated)

After this PR lands:

1. **Create the `operator` user** following [22_CREATE_OPERATOR_USER_RUNBOOK.md](22_CREATE_OPERATOR_USER_RUNBOOK.md). One ssh session. Copies the existing workstation pubkey from `/root/.ssh/authorized_keys` into `/home/operator/.ssh/authorized_keys`. Adds operator to `sudo` and `docker` groups.

2. **Add the DNS A record** in Cloudflare:
   - Name: `hermestv`
   - Type: `A`
   - Value: VPS public IP
   - Proxied: operator's call (start with DNS-only to let Caddy/Let's Encrypt validate, switch to proxied after).

3. **Install the nginx site config**:
   - `sudo cp upstream/nginx/hermestv.daveai.tech.conf.example /etc/nginx/sites-available/hermestv.daveai.tech`
   - `sudo ln -s /etc/nginx/sites-available/hermestv.daveai.tech /etc/nginx/sites-enabled/`
   - `sudo nginx -t` (validate)
   - `sudo systemctl reload nginx` (no restart — graceful reload only)
   - Confirm the 10 existing daveai.tech sites still serve 200s.

4. **Re-audit as `operator@<vps>`**:
   - `$env:VPS_HOST = 'operator@<vps-host>'`
   - `.\tools\vps-audit-phase-1.ps1`
   - Compare against the raw run report from 2026-05-18 — only differences should be the operator user now existing, and (if the nginx site is installed) `hermestv.daveai.tech` showing up.

When all four are green, Phase 2 plan opens as a separate PR.

---

## What Phase 2 will (eventually) do

Out of scope for this PR — listed only so the constraints stay visible:

- `cd /home/operator/hermestv && docker compose -f VPS_COMPOSE.yml -p hermestv-vps up -d` (operator-owned)
- Containers bind to `hermestv-vps-internal` Docker network ONLY
- Caddy in our stack stays bound to non-standard ports (host nginx owns 80/443)
- Host nginx reverse-proxies `hermestv.daveai.tech` to the internal HermesTV web/api
- TLS terminated by host nginx (already has Certbot/Let's Encrypt for the other 10 sites — coexist)
- Verification: `curl -I https://hermestv.daveai.tech/health` returns 200 from our API; the 10 existing sites still return 200

If anything regresses on the existing sites, Phase 2 rollback is `docker compose -p hermestv-vps stop` (stop only — no `down`, no `-v`).

---

## Out-of-band items already deferred

- **VPS Phase 1 raw report** stays local (gitignored). Operator sign-off captured in the classification table at the bottom of that report file.
- **`UNKNOWN_NEEDS_USER_REVIEW` items** from Phase 1 (4 entries — stale `edge-tts-server` container, ports 18789 and 8888, `ufw` posture) still need operator confirmation before Phase 2 starts. They don't block Phase 1.5.
- **Tailscale ACL** review — Phase 2 will need to confirm that the VPS can reach the workstation Jellyfin over the tailnet. Not a Phase 1.5 task.
