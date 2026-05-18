# BLOCKER — VPS SSH Access Required

**Created:** 2026-05-17
**Lane:** 17 — VPS Isolation Gaps

---

## What Is Blocked

- Deploying the VPS compose stack to Hostinger
- Creating secrets/pg_password.txt on the VPS
- Verifying postgres healthcheck passes
- Setting up Tailscale on the VPS
- Testing VPS-to-workstation Tailscale mesh networking
- Full end-to-end LAN streaming path verification

---

## What Is Required

1. **SSH access** to the Hostinger VPS (IP, SSH key)
2. **Root or sudo access** to install Docker, Docker Compose, and Tailscale
3. **Tailscale auth key** from https://login.tailscale.com/admin/settings/keys
4. **Hostinger VPS credentials** (panel login or SSH key — stored in G:\private\)

---

## Setup Steps (when SSH available)

1. Install Docker and Docker Compose on VPS
2. Install Tailscale: `curl -fsSL https://tailscale.com/install.sh | sh && tailscale up --authkey=<key>`
3. Clone repo (or rsync docker/vps/) to VPS
4. Create `docker/vps/secrets/pg_password.txt` with a strong password
5. Run: `docker compose -p hermestv-vps up -d`
6. Verify: `docker compose -p hermestv-vps ps` — all services healthy
7. Test: `curl http://hermestv.local/health` from within the Tailscale network

---

## Non-Blocking for B2

The B2 local mock demo runs entirely on the workstation. The VPS is not required for the local demo. This blocker only applies to production deployment.
