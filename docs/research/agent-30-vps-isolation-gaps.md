# Lane 17 — VPS Isolation Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**Files:** docker/vps/compose.yml, docker/vps/Caddyfile, docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md

---

## Summary

The VPS compose file is correctly isolated (no AI/media services), has healthchecks on all services, and uses secrets for the postgres password. The Caddyfile uses `hermestv.local` with `tls internal` — appropriate for LAN use. The VPS architecture correctly separates AI and heavy compute to the workstation. The primary gap is that the secrets/pg_password.txt file path must be created on the VPS before first deploy, which requires SSH access.

---

## VPS Compose Isolation Check

| Check | Result | Notes |
|---|---|---|
| No Jellyfin on VPS | PASS — not present in vps compose |
| No Tunarr on VPS | PASS |
| No Dispatcharr on VPS | PASS |
| No Ollama on VPS | PASS |
| No Open WebUI on VPS | PASS |
| No GPU runtime on VPS | PASS — NVIDIA runtime absent from vps compose |
| HermesTV API on VPS | PASS — lightweight node:20-alpine |
| Postgres on VPS | PASS — config/state only |
| Redis on VPS | PASS — cache only |
| Caddy on VPS | PASS — TLS termination and reverse proxy |

---

## VPS Postgres Healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U hermestv"]
  interval: 30s
  timeout: 5s
  retries: 5
```

PASS — correct healthcheck. The hermes-tv-api service waits for postgres health before starting (`condition: service_healthy`). The caddy service waits for hermes-tv-api health. Correct startup dependency order.

---

## VPS Redis Healthcheck

```yaml
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 30s
  timeout: 5s
  retries: 3
```

PASS — correct healthcheck.

---

## Caddyfile Review

```
hermestv.local {
    reverse_proxy hermes-tv-api:3001
    tls internal
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy no-referrer
    }
}
```

| Check | Result | Notes |
|---|---|---|
| Reverse proxy to hermes-tv-api:3001 | PASS |
| tls internal (self-signed for LAN) | PASS — correct for local network use |
| Security headers present | PASS |
| No public exposure | PASS — hermestv.local is LAN-only |
| No wildcard origin | PASS |
| HSTS header | NOT PRESENT — minor gap. With tls internal, HSTS is less critical but recommended. |
| No /setup/* path exposed publicly | ASSUMED — Caddyfile only has one route. Setup/QR endpoints should be Tailscale-protected per contract. |

**Gap:** The Caddyfile does not have explicit path restrictions. According to docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md, the /setup/provider endpoint should be Tailscale-protected. The current Caddyfile exposes ALL /api/* and /setup/* routes through the reverse proxy to anyone on the LAN. On a VPS (public internet), this would be a security issue. For home LAN use only, acceptable for B2.

---

## Docker Network Isolation

```yaml
networks:
  hermestv-vps-internal:
    driver: bridge
    internal: true    # No internet access from internal network
  hermestv-vps-external:
    driver: bridge
```

PASS — postgres, redis, and hermes-tv-api are on the `internal: true` network (no internet egress). Only caddy has access to both internal and external networks (for TLS renewal and internet connectivity). This is the correct pattern for DMZ-style isolation.

---

## Secrets Management

```yaml
postgres:
  environment:
    POSTGRES_PASSWORD_FILE: /run/secrets/pg_password
  secrets: [pg_password]

secrets:
  pg_password:
    file: ./secrets/pg_password.txt
```

PASS — password is not in the compose file. It reads from a Docker secret file at `./secrets/pg_password.txt`. The `docker/vps/secrets/` directory is git-ignored.

**Gap:** The `./secrets/pg_password.txt` file must be created on the VPS before `docker compose up`. There is no setup guide documenting this step.

---

## Tailscale Plan

Per docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md:
- VPS is a Tailscale node (LAN bridge to workstation)
- Admin endpoints are Tailscale-protected

**Status:** Tailscale is mentioned in the contract but NOT configured in the compose.yml. No Tailscale container or sidecar is present. The compose assumes the host OS has Tailscale installed as a daemon.

This is architecturally correct (Tailscale runs at the OS level, not inside Docker), but:
- There is no documentation for installing Tailscale on the Hostinger VPS
- There is no Tailscale auth key management plan

---

## BLOCKER File

See: `docs/research/BLOCKER_VPS_SSH.md`

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| No guide for creating secrets/pg_password.txt on VPS | P1 | Required before first deploy |
| Caddyfile does not restrict /setup/* to Tailscale | P1 | Security gap if VPS is internet-facing |
| No Tailscale setup documentation | P2 | Required for admin endpoint security |
| HSTS header missing from Caddyfile | P3 | Minor hardening |
| No VPS firewall rules documented | P2 | UFW/iptables rules for blocking public ports |
