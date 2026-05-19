#!/usr/bin/env bash
# ============================================================================
# HermesTV VPS redeploy — pull main, rebuild + restart the two HermesTV
# containers, then smoke-probe the public domain.
# ============================================================================
# This script is run from the operator's workstation. It SSHes into the
# Hostinger VPS, fast-forwards /home/operator/hermestv to origin/main,
# rebuilds and restarts ONLY the two HermesTV containers (hermes-tv-api
# and hermes-web-tv), waits for both healthchecks to flip to "healthy",
# and then runs five smoke probes against https://tv.daveai.tech (the
# new canonical) plus one alias probe against https://hermestv.daveai.tech
# to confirm the additive nginx server_name entry still resolves.
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

# Public domain we smoke-probe after the deploy. tv.daveai.tech is the
# canonical short URL (added 2026-05-18). hermestv.daveai.tech remains a
# valid alias served by the same nginx server_name line. We probe the
# canonical for the five functional smokes, and run one extra HEAD probe
# against the alias to confirm both Host headers route to the same upstream.
PUBLIC_HOST="tv.daveai.tech"
ALIAS_HOST="hermestv.daveai.tech"

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

echo "  remote: git checkout main && git pull --ff-only"
git checkout main
git pull --ff-only

NEW_SHA=\$(git rev-parse HEAD)
echo "  remote: HEAD is now \$NEW_SHA"

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

# --- Probe 2: /api/layouts count == 8 (PR #58 added Zero) -----------------
# Pre-PR-#58 the manifest dir held 7 layouts (apple-tv, dave-power, mom-mode,
# netflix, plex, samsung-tizen, tivimate). PR #58 added zero.json. A count
# of 8 is the canary that "git pull && rebuild" actually shipped #58.
echo "  probe 2: GET /api/layouts → expect count=8"
LAYOUTS_COUNT=$(curl -sf "https://$PUBLIC_HOST/api/layouts" 2>/dev/null | jq -r '.count // empty' || echo "")
if [ "$LAYOUTS_COUNT" = "8" ]; then
  probe_pass "/api/layouts count=8"
else
  probe_fail "/api/layouts count='$LAYOUTS_COUNT' (expected 8 — Zero shell from PR #58 missing?)"
fi

# --- Probe 3: POST /api/download returns exact_size_human (PR #59) --------
# Body uses live-100 (a known seed channel id) and mom_tv as the profile.
# We don't care WHAT exact size the API picks — only that the field is
# present and non-empty, which proves the PR #59 download envelope shipped.
echo "  probe 3: POST /api/download → expect exact_size_human"
DOWNLOAD_SIZE=$(
  curl -sf -X POST "https://$PUBLIC_HOST/api/download" \
    -H "Content-Type: application/json" \
    -d '{"item_id":"live-100","profile_id":"mom_tv"}' 2>/dev/null \
  | jq -r '.exact_size_human // empty' || echo ""
)
if [ -n "$DOWNLOAD_SIZE" ]; then
  probe_pass "/api/download exact_size_human='$DOWNLOAD_SIZE'"
else
  probe_fail "/api/download exact_size_human missing (PR #59 not deployed?)"
fi

# --- Probe 4: POST /api/pair returns HRM-XXXX (PR #67) --------------------
# Pairing codes are minted fresh on every call and live in-memory. The
# format is fixed: 'HRM-' + 4 alphanumerics. We accept the looser regex
# 'HRM-.+' so a future format bump (e.g. 5 chars) doesn't break the smoke
# without an actual regression.
echo "  probe 4: POST /api/pair → expect 'HRM-XXXX'"
PAIRING_CODE=$(
  curl -sf -X POST "https://$PUBLIC_HOST/api/pair" 2>/dev/null \
  | jq -r '.pairing_code // empty' || echo ""
)
case "$PAIRING_CODE" in
  HRM-*)
    probe_pass "/api/pair pairing_code='$PAIRING_CODE'"
    ;;
  *)
    probe_fail "/api/pair pairing_code='$PAIRING_CODE' (expected HRM-* — PR #67 not deployed?)"
    ;;
esac

# --- Probe 5: /api/catalog _meta.source — log only, no fail --------------
# The catalog source is environment-dependent (jellyfin if reachable via
# Tailscale, m3u if Threadfin has a playlist loaded, iptv-org if its 24h
# cache is warm, mock otherwise). We don't assert a value — we just log
# what the API resolved to so the operator can spot "still mock" surprises
# without that being a deploy failure. Counts toward PASS as long as the
# field is reachable; a missing field would indicate a deeper API break.
echo "  probe 5: GET /api/catalog → log _meta.source"
CATALOG_SOURCE=$(curl -sf "https://$PUBLIC_HOST/api/catalog" 2>/dev/null | jq -r '._meta.source // empty' || echo "")
if [ -n "$CATALOG_SOURCE" ]; then
  probe_pass "/api/catalog _meta.source='$CATALOG_SOURCE'"
else
  probe_fail "/api/catalog _meta.source missing"
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
