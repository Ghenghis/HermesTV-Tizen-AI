# 29 — HermesTV Deploy Runbook (Phase 2, operator-executed)

**Read this end-to-end before running anything.** This runbook deploys 2 containers (`hermestv-vps-api`, `hermestv-vps-web`) on the Hostinger VPS. It does NOT touch any existing daveai.tech service. Expected duration: 8–12 minutes including verification.

**Predecessors**:
- PR for [docs/28_VPS_PHASE_2_DEPLOY_PLAN.md](28_VPS_PHASE_2_DEPLOY_PLAN.md) merged to main
- Phase 1.5 gates all green ([21_VPS_PHASE_1_5_REMEDIATION_PLAN.md](21_VPS_PHASE_1_5_REMEDIATION_PLAN.md))
- `operator` user exists on VPS ([22_CREATE_OPERATOR_USER_RUNBOOK.md](22_CREATE_OPERATOR_USER_RUNBOOK.md))
- DNS A records `tv.daveai.tech` AND `hermestv.daveai.tech` → VPS IP, Cloudflare-proxied. `tv.daveai.tech` is the canonical short URL; `hermestv.daveai.tech` is kept as an additive alias so historical links keep working.
- Host nginx site `/etc/nginx/sites-enabled/hermestv.daveai.tech` installed (its `server_name` line lists BOTH `tv.daveai.tech` and `hermestv.daveai.tech`), `nginx -t` passes

---

## Step 0 — Open an operator SSH session

```bash
ssh operator@<vps-host>
hostname     # expect: srv1376124
id           # expect: uid=1001(operator) gid=37(operator) groups=...sudo,docker
```

Do **not** use `root` for this runbook. The whole point of Phase 1.5 was to scope HermesTV under the operator user. If `operator` can't run docker, log out, log back in (group membership requires fresh login).

---

## Step 1 — Clone the repo

Idempotent — if `/home/operator/hermestv/` already exists, the clone is skipped and we just `git pull`.

```bash
cd /home/operator
if [ ! -d hermestv/.git ]; then
  git clone https://github.com/Ghenghis/HermesTV-Tizen-AI hermestv
fi
cd /home/operator/hermestv
git fetch origin
git checkout main
git pull --ff-only
git rev-parse HEAD   # RECORD this SHA — for rollback
```

Save the printed SHA in a local notes file. If rollback is ever needed, this is the "known good" commit.

---

## Step 2 — Create the `.env` file

```bash
# Operator creates this manually. Never automated.
sudo -u operator bash -c 'umask 077 && cat > /home/operator/hermestv/.env <<EOF
NODE_ENV=production
PORT=3011
# Provider credentials and Azure key — leave blank for Phase 2.
# The API will return mock catalogs and 202 TTS stubs until these are set.
# Phase 3 fills them in.
EOF
chmod 0600 /home/operator/hermestv/.env'

ls -la /home/operator/hermestv/.env
# expect: -rw------- 1 operator operator <bytes> ... .env
```

**Forbidden in this step**:
- ❌ Pasting any provider API key, Azure key, Jellyfin key, or M3U URL
- ❌ Making the file world-readable
- ❌ Adding the file to git (it's gitignored — confirm `git check-ignore .env` returns the path)

---

## Step 3 — Compose pre-flight (config validates, ports free)

```bash
cd /home/operator/hermestv
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps config --quiet
echo "config OK: $?"

ss -ltn "sport = :3011" | tail -n +2   # must be empty
ss -ltn "sport = :3080" | tail -n +2   # must be empty
echo "ports free"
```

If either port is bound, **stop**. Re-investigate via Phase 1 audit before doing anything else.

---

## Step 4 — Baseline the public sites

Save the response codes for the 9 existing sites before our `compose up`. After the deploy, every one must still match.

```bash
mkdir -p /home/operator/hermestv-deploy-logs
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
{
  echo "Pre-deploy site snapshot: $TS"
  for s in daveai.tech diy.daveai.tech fleet.daveai.tech game.daveai.tech \
           hermes.daveai.tech hermes3d.daveai.tech openhands.daveai.tech \
           voice.daveai.tech www.daveai.tech; do
    code=$(curl -sI -o /dev/null -w "%{http_code}" "https://$s/" 2>/dev/null || echo TIMEOUT)
    echo "  $s : $code"
  done
} | tee /home/operator/hermestv-deploy-logs/pre-deploy-$TS.txt
```

All 9 must be `200`. If any are not, **stop and investigate** before proceeding.

---

## Step 5 — Build the two images (still no `up`)

```bash
cd /home/operator/hermestv
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  build hermes-tv-api hermes-web-tv 2>&1 | tee /home/operator/hermestv-deploy-logs/build-$TS.log
echo "build exit: ${PIPESTATUS[0]}"
```

Expected build time: 3–6 minutes total (npm install + Vite build). Acceptable warnings: deprecated npm packages. Stop on any `error` or non-zero exit.

---

## Step 6 — Bring the two containers up

```bash
cd /home/operator/hermestv
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  up -d hermes-tv-api hermes-web-tv

# Wait for healthchecks (up to 60s)
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  api=$(docker inspect -f '{{.State.Health.Status}}' hermestv-vps-api 2>/dev/null || echo absent)
  web=$(docker inspect -f '{{.State.Health.Status}}' hermestv-vps-web 2>/dev/null || echo absent)
  echo "  $i x 5s  api=$api  web=$web"
  if [ "$api" = "healthy" ] && [ "$web" = "healthy" ]; then break; fi
  sleep 5
done
```

Both must reach `healthy` within 60 seconds. If one stays `starting` or `unhealthy`, jump to rollback (next section) and pull logs.

---

## Step 7 — Acceptance tests

Run from the workstation, NOT from the VPS (CF behavior differs):

```bash
echo "=== 1. existing sites still 200 ==="
for s in daveai.tech diy.daveai.tech fleet.daveai.tech game.daveai.tech \
         hermes.daveai.tech hermes3d.daveai.tech openhands.daveai.tech \
         voice.daveai.tech www.daveai.tech; do
  code=$(curl -sI -o /dev/null -w "%{http_code}" "https://$s/" 2>/dev/null)
  echo "  $s : $code"
done
# All 9 must be 200

echo "=== 2. HermesTV /health (canonical + alias) ==="
curl -sI "https://tv.daveai.tech/health"
# HTTP/1.1 200 OK expected
curl -sI "https://hermestv.daveai.tech/health"
# HTTP/1.1 200 OK expected — alias must match canonical

echo "=== 3. HermesTV /api/layouts ==="
curl -s "https://tv.daveai.tech/api/layouts" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['count'], 'layouts')"
# 7 layouts expected

echo "=== 4. HermesTV web app HTML ==="
curl -s "https://tv.daveai.tech/" | grep -c '<div id="root">'
# 1 expected

echo "=== 5. real browser ==="
# Open https://tv.daveai.tech/ in your workstation Chrome.
# Pick Sherri or Dave. Confirm:
#   - profile picker renders
#   - main app loads (catalog grid)
#   - 🎨 Look button opens layout switcher modal with 7 layouts
#   - no console errors in DevTools
```

All five green = Phase 2 deploy complete.

---

## Rollback — if anything regresses

### Triage decision
- **Existing daveai.tech site regression** (one of the 9 ≠ 200) → IMMEDIATE rollback, then investigate
- **HermesTV unhealthy** (502 on tv.daveai.tech / hermestv.daveai.tech but 9 existing sites still 200) → diagnose first, rollback only if root cause is unclear

### Immediate rollback (60-second action)
```bash
cd /home/operator/hermestv
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  stop hermes-tv-api hermes-web-tv
echo "containers stopped; volumes intact"

# Re-snapshot the 9 sites
for s in daveai.tech diy.daveai.tech fleet.daveai.tech game.daveai.tech \
         hermes.daveai.tech hermes3d.daveai.tech openhands.daveai.tech \
         voice.daveai.tech www.daveai.tech; do
  code=$(curl -sI -o /dev/null -w "%{http_code}" "https://$s/" 2>/dev/null)
  echo "  $s : $code"
done
```

Expected: 9 sites back to 200 within 30 seconds. HermesTV → 502 (containers stopped — that's fine).

### Capture diagnostics before further action
```bash
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  logs --tail=300 hermes-tv-api > /home/operator/hermestv-deploy-logs/rollback-api-$TS.log
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  logs --tail=300 hermes-web-tv > /home/operator/hermestv-deploy-logs/rollback-web-$TS.log
docker inspect hermestv-vps-api  hermestv-vps-web \
  > /home/operator/hermestv-deploy-logs/rollback-inspect-$TS.json
```

From workstation: `scp operator@<vps>:/home/operator/hermestv-deploy-logs/rollback-*-$TS.* ./` for offline analysis.

### Forbidden in rollback
- ❌ `docker compose down` (without `-v` is OK for HermesTV only, but skip — `stop` is enough)
- ❌ `docker compose down -v` (would wipe HermesTV volumes — none today, but habit-forming danger)
- ❌ `docker system prune` (touches Dave's stack)
- ❌ `docker volume rm` anything not `hermestv-vps-*`
- ❌ Removing `/etc/nginx/sites-enabled/hermestv.daveai.tech` — leave it. nginx will 502 (clean), other sites unaffected. Removing it triggers a reload that has a slim chance of misbehaving on the existing 10 sites.
- ❌ `apt`, `systemctl restart nginx`, firewall changes, `ufw enable/disable`

### Worst case — totally back out
Only after operator sign-off and root cause known:
```bash
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  rm -f hermes-tv-api hermes-web-tv
docker image rm hermestv-vps-api hermestv-vps-web 2>/dev/null || true
# Nginx site stays. /home/operator/hermestv/ stays. Next attempt is faster.
```

---

## Post-deploy commit

After all 5 acceptance tests green:

```bash
# On the VPS
date -u +"%Y-%m-%dT%H:%M:%SZ phase-2-deployed sha=$(cat /home/operator/hermestv/.git/HEAD)" \
  >> /home/operator/hermestv-deploy-logs/deploy-marker.txt
```

This file is the only on-VPS record of when Phase 2 went live. The workstation should keep a copy.

---

## What this runbook does NOT do (out of scope)

- ❌ Start Threadfin, m3u-editor, xtreamfilter — Phase 3
- ❌ Configure provider credentials — Phase 3
- ❌ Set Azure TTS key — Phase 2.5 (optional, separate runbook)
- ❌ Connect to workstation Jellyfin — Phase 3 (needs Tailscale ACL review)
- ❌ Configure LLM keys — Phase 3
- ❌ Add new firewall rules, modify ufw, edit systemd
- ❌ Touch any existing Dave/daveai.tech service

Phase 3 plan opens as a separate PR after Phase 2 is live for at least 24 hours with no regressions.
