#!/usr/bin/env bash
# ============================================================================
# HermesTV VPS redeploy — pull main, rebuild + restart the two HermesTV
# containers, then smoke-probe the public HermesTV domain.
# ============================================================================
# This script is run from the operator's workstation. It SSHes into the
# Hostinger VPS, fast-forwards /home/operator/hermestv to origin/main,
# rebuilds and restarts ONLY the two HermesTV containers (hermes-tv-api
# and hermes-web-tv), waits for both healthchecks to flip to "healthy",
# and then runs smoke probes against https://tv.daveai.tech. The older
# hermestv.daveai.tech host stays as a compatibility alias.
#
# Why this exists:
#   On 2026-05-18 the agent triaging prod confirmed hermestv.daveai.tech
#   was running a build from before PR #56 — the Zero shell was missing,
#   the chatbot showed "Couldn't reach the server", and other stale-build
#   symptoms were visible. PRs #58-#68 are merged but the VPS hasn't been
#   redeployed. This script makes "pull + rebuild + smoke" one command.
#
# What this script will do on the VPS:
#   - cd /home/operator/hermestv
#   - git fetch origin && git checkout main && git pull --ff-only
#   - docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml \
#       build hermes-tv-api hermes-web-tv
#   - docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml \
#       up -d hermes-tv-api hermes-web-tv
#   - Wait up to 60s for both containers to reach `healthy`
#
# What this script will NEVER do:
#   - Touch any other compose service (threadfin / m3u-editor / xtreamfilter)
#   - Modify .env or any provider credential
#   - Run `docker system prune` or `docker volume rm`
#   - Open or close firewall rules
#   - Embed SSH keys, passwords, or any secret in this file
#
# Usage:
#   bash tools/redeploy-vps.sh
#   OPERATOR_HOST=operator@srv1376124 bash tools/redeploy-vps.sh
#
# Auth:
#   This script uses your existing SSH agent / ~/.ssh/config. If you can
#   `ssh $OPERATOR_HOST` without a password prompt, this script can run.
#   No keys are read or written.
#
# Dependencies on the workstation: bash, ssh, curl, jq
# Dependencies on the VPS:         bash, git, docker, docker compose
# ============================================================================

set -euo pipefail

# --- Configuration --------------------------------------------------------
# OPERATOR_HOST defaults to the Hostinger VPS hostname recorded in
# docs/29_HERMESTV_DEPLOY_RUNBOOK.md (`srv1376124`). Operators with a
# matching `Host srv1376124` block in ~/.ssh/config can run this with
# no env vars. Anyone else exports OPERATOR_HOST=operator@<their-host>.
OPERATOR_HOST="${OPERATOR_HOST:-srv1376124}"

# Active DaveTV public domain we smoke-probe after the deploy.
PUBLIC_HOST="tv.daveai.tech"
ALIAS_HOST="hermestv.daveai.tech"
DEPLOY_REF="${DEPLOY_REF:-main}"

# Compose project + file paths, mirroring docs/29 exactly. If these drift,
# rollback / log-grep instructions in the runbook stop matching reality.
COMPOSE_PROJECT="hermestv-vps"
COMPOSE_FILE="upstream/docker-vps/VPS_COMPOSE.yml"
REPO_DIR="/home/operator/hermestv"
API_CONTAINER="hermestv-vps-api"
WEB_CONTAINER="hermestv-vps-web"

# --- Local dep check (fail fast, no SSH yet) ------------------------------
# We rely on curl + jq for the smoke probe. Both are on every modern Linux
# / macOS workstation; failing here saves the operator from a confusing
# "command not found" half-way through.
for bin in ssh curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "ERROR: required command \`$bin\` not found on PATH." >&2
    echo "Install $bin and retry." >&2
    exit 1
  fi
done

echo "=== HermesTV VPS redeploy ==="
echo "Operator host : $OPERATOR_HOST"
echo "Public domain : https://$PUBLIC_HOST  (alias: https://$ALIAS_HOST)"
echo "Repo on VPS   : $REPO_DIR"
echo "Compose file  : $COMPOSE_FILE (project: $COMPOSE_PROJECT)"
echo "Deploy ref    : $DEPLOY_REF"
echo

# --- Step 1: pull + rebuild + up over SSH ---------------------------------
# We pipe a single multi-line heredoc into one `ssh` invocation. Keeping it
# one connection (rather than one ssh per command) is faster and means
# `set -e` aborts the remote half on the first failure. BatchMode=yes
# disables any interactive password prompt — if the SSH agent / config is
# not set up, we fail loud here instead of hanging.
echo "[1/3] SSH to $OPERATOR_HOST and redeploy..."
ssh -o BatchMode=yes -o ConnectTimeout=30 "$OPERATOR_HOST" bash -se <<REMOTE
set -euo pipefail

echo "  remote: hostname=\$(hostname)"
echo "  remote: cd $REPO_DIR"
cd "$REPO_DIR"

echo "  remote: git fetch origin"
git fetch origin

echo "  remote: git checkout $DEPLOY_REF && git pull --ff-only (if branch)"
git checkout "$DEPLOY_REF"
if git symbolic-ref -q HEAD >/dev/null; then
  git pull --ff-only
else
  echo "  remote: detached HEAD on $DEPLOY_REF — skipping pull"
fi

NEW_SHA=\$(git rev-parse HEAD)
echo "  remote: HEAD is now \$NEW_SHA"

echo "  remote: verifying DaveTV production auth env in $REPO_DIR/.env"
if [ ! -f .env ]; then
  echo "  remote: ERROR — $REPO_DIR/.env is missing. Refusing to deploy an auth-gated build." >&2
  exit 3
fi
missing=0
require_env_key() {
  key="\$1"
  if ! grep -Eq "^\${key}=.+" .env; then
    echo "  remote: ERROR — .env missing required \${key}" >&2
    missing=1
  fi
}
require_env_key DAVETV_AUTH_REQUIRED
require_env_key DAVETV_AUTH_ENFORCE_API
require_env_key DAVETV_PUBLIC_APP_URL
require_env_key DAVETV_ADMIN_EMAIL
require_env_key DAVETV_ADMIN_PASSWORD
app_url=\$(grep -E '^DAVETV_PUBLIC_APP_URL=' .env | tail -n1 | cut -d= -f2-)
if [ "\$app_url" != "https://tv.daveai.tech" ]; then
  echo "  remote: ERROR — DAVETV_PUBLIC_APP_URL must be https://tv.daveai.tech (value redacted)" >&2
  missing=1
fi
if [ "\$missing" -ne 0 ]; then
  echo "  remote: Auth env preflight failed. Set real values in $REPO_DIR/.env; never commit them." >&2
  exit 3
fi
echo "  remote: DaveTV auth env preflight passed (values redacted)"

echo "  remote: docker compose build $API_CONTAINER+$WEB_CONTAINER (this can take 3-6 min)"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \\
  build hermes-tv-api hermes-web-tv

echo "  remote: docker compose up -d hermes-tv-api hermes-web-tv"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" \\
  up -d hermes-tv-api hermes-web-tv

echo "  remote: waiting for both containers to report healthy (up to 60s)..."
api="starting"; web="starting"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  api=\$(docker inspect -f '{{.State.Health.Status}}' "$API_CONTAINER" 2>/dev/null || echo absent)
  web=\$(docker inspect -f '{{.State.Health.Status}}' "$WEB_CONTAINER" 2>/dev/null || echo absent)
  echo "    tick \$i (5s) — api=\$api  web=\$web"
  if [ "\$api" = "healthy" ] && [ "\$web" = "healthy" ]; then
    break
  fi
  sleep 5
done

if [ "\$api" != "healthy" ] || [ "\$web" != "healthy" ]; then
  echo "  remote: ERROR — containers did not reach healthy within 60s (api=\$api web=\$web)" >&2
  echo "  remote: see \`docker compose -p $COMPOSE_PROJECT logs --tail=200 hermes-tv-api hermes-web-tv\`" >&2
  exit 2
fi

echo "  remote: both containers healthy at sha=\$NEW_SHA"
REMOTE

REMOTE_RC=$?
if [ "$REMOTE_RC" -ne 0 ]; then
  echo
  echo "Remote redeploy step exited with code $REMOTE_RC — aborting before smoke probe."
  echo "=== VPS redeploy complete — 0 PASS, 1 FAIL ==="
  exit "$REMOTE_RC"
fi

echo
echo "[2/3] Containers healthy. Pausing 3s for nginx → upstream warm-up..."
# Brief pause: nginx's upstream is keep-alive'd; the first request after a
# container restart can land on a half-torn-down worker. Three seconds is
# well below the 60s patience budget and avoids a flaky first probe.
sleep 3

# --- Step 2: smoke probes -------------------------------------------------
# We run five functional probes against the public HTTPS edge (not the VPS
# loopback) so we are exercising the full path the user's browser sees:
# Cloudflare → host nginx → docker container. A loopback probe would miss
# any nginx or CF misconfiguration. A sixth probe hits the alias host
# (hermestv.daveai.tech) to confirm both Host headers route to the same
# upstream after the 2026-05-18 short-canonical change.
echo
echo "[3/3] Smoke-probing https://$PUBLIC_HOST (and alias https://$ALIAS_HOST) ..."

pass_count=0
fail_count=0

probe_pass() {
  echo "  PASS: $1"
  pass_count=$((pass_count + 1))
}
probe_fail() {
  echo "  FAIL: $1"
  fail_count=$((fail_count + 1))
}

# --- Probe 1: /health returns 200 ----------------------------------------
# `curl -sI` gets only the HTTP response headers; `-w '%{http_code}'` plus
# `-o /dev/null` would also work, but -I is the established style elsewhere
# in this repo (docs/29 Step 7). Either path yields the same 3-digit code.
echo "  probe 1: GET /health"
HEALTH_CODE=$(curl -sI -o /dev/null -w "%{http_code}" "https://$PUBLIC_HOST/health" 2>/dev/null || echo "000")
if [ "$HEALTH_CODE" = "200" ]; then
  probe_pass "/health → 200"
else
  probe_fail "/health → $HEALTH_CODE (expected 200)"
fi

# --- Probe 2: /api/version carries deployed SHA --------------------------
echo "  probe 2: GET /api/version → expect git_sha"
VERSION_JSON=$(curl -sf "https://$PUBLIC_HOST/api/version" 2>/dev/null || echo "{}")
VERSION_SHA=$(echo "$VERSION_JSON" | jq -r '.git_sha // empty')
if [ -n "$VERSION_SHA" ] && [ "$VERSION_SHA" != "unknown" ]; then
  probe_pass "/api/version git_sha=$VERSION_SHA"
else
  probe_fail "/api/version git_sha missing or unknown"
fi

# --- Probe 3: auth gate configured ---------------------------------------
echo "  probe 3: GET /api/auth/me → expect configured auth gate"
AUTH_JSON=$(curl -sf "https://$PUBLIC_HOST/api/auth/me" 2>/dev/null || echo "{}")
AUTH_CONFIGURED=$(echo "$AUTH_JSON" | jq -r '.auth.configured // false')
AUTH_REQUIRED=$(echo "$AUTH_JSON" | jq -r '.auth.required // false')
API_ENFORCED=$(echo "$AUTH_JSON" | jq -r '.auth.api_enforced // false')
if [ "$AUTH_CONFIGURED" = "true" ] && [ "$AUTH_REQUIRED" = "true" ] && [ "$API_ENFORCED" = "true" ]; then
  probe_pass "/api/auth/me configured=true required=true api_enforced=true"
else
  probe_fail "/api/auth/me auth state configured=$AUTH_CONFIGURED required=$AUTH_REQUIRED api_enforced=$API_ENFORCED"
fi

# --- Probe 4: protected API rejects anonymous bots -----------------------
echo "  probe 4: GET /api/providers without cookie → expect 401"
PROVIDERS_CODE=$(curl -s -o /tmp/davetv-providers.json -w "%{http_code}" "https://$PUBLIC_HOST/api/providers" 2>/dev/null || echo "000")
if [ "$PROVIDERS_CODE" = "401" ]; then
  probe_pass "/api/providers anonymous request blocked with 401"
else
  probe_fail "/api/providers anonymous status=$PROVIDERS_CODE (expected 401)"
fi

# --- Probe 5: web root reachable ----------------------------------------
echo "  probe 5: GET / → expect 200"
ROOT_CODE=$(curl -sI -o /dev/null -w "%{http_code}" "https://$PUBLIC_HOST/" 2>/dev/null || echo "000")
if [ "$ROOT_CODE" = "200" ]; then
  probe_pass "web root → 200"
else
  probe_fail "web root → $ROOT_CODE (expected 200)"
fi

# --- Probe 6: alias host /health returns 200 -----------------------------
# The nginx server_name on the VPS lists BOTH tv.daveai.tech and
# hermestv.daveai.tech (additive change so existing bookmarks/QR codes
# never break). This probe confirms the legacy Host header still routes
# to the same upstream. A failure here means the nginx server_name line
# was reverted or the DNS A record for hermestv.* drifted.
echo "  probe 6: GET /health on alias host $ALIAS_HOST"
ALIAS_CODE=$(curl -sI -o /dev/null -w "%{http_code}" "https://$ALIAS_HOST/health" 2>/dev/null || echo "000")
if [ "$ALIAS_CODE" = "200" ]; then
  probe_pass "alias /health → 200 (hermestv.daveai.tech still resolves)"
else
  probe_fail "alias /health → $ALIAS_CODE (expected 200 — nginx server_name missing $ALIAS_HOST?)"
fi

# --- Final summary --------------------------------------------------------
echo
echo "=== VPS redeploy complete — $pass_count PASS, $fail_count FAIL ==="

if [ "$fail_count" -gt 0 ]; then
  exit 1
fi
exit 0
