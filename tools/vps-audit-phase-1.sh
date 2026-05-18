#!/usr/bin/env bash
# ============================================================================
# READ-ONLY AUDIT — NO VPS MODIFICATIONS
# ============================================================================
# HermesTV VPS Phase 1 audit runner (POSIX shell).
#
# What this does:
#   - SSH into $VPS_HOST and run 10 read-only inspection commands
#   - Capture each command's output verbatim
#   - Append everything to docs/research/vps-phase-1-audit-RUN-<UTC-ts>.md
#
# What this NEVER does:
#   - Modify any file on the VPS
#   - Start, stop, restart, remove, or build any container
#   - Touch .env, provider credentials, or any path outside /home/operator/
#   - Open or close firewall rules
#   - Pull/install/remove any package
#
# Usage:
#   VPS_HOST=operator@your-vps-ip ./tools/vps-audit-phase-1.sh
#
# Refusal conditions (the script exits 1 without contacting the VPS):
#   - VPS_HOST env is unset or empty
#   - Any planned remote command matches a forbidden destructive pattern
# ============================================================================

set -euo pipefail

# --- Safety: refuse unless VPS_HOST is set --------------------------------
if [ -z "${VPS_HOST:-}" ]; then
  echo "READ-ONLY AUDIT — NO VPS MODIFICATIONS" >&2
  echo "" >&2
  echo "ERROR: VPS_HOST is not set." >&2
  echo "Usage: VPS_HOST=operator@your-vps-ip $0" >&2
  exit 1
fi

# --- Safety: forbidden destructive patterns --------------------------------
# Any planned command that matches one of these is rejected before SSH
# even opens. Order matters only for clarity; the scan checks all of them.
FORBIDDEN_PATTERNS=(
  "docker rm"
  "docker volume rm"
  "docker system prune"
  "docker compose down -v"
  "docker compose down --volumes"
  "rm -rf"
  "apt remove"
  "apt-get remove"
  "apt purge"
  "apt-get purge"
  "systemctl disable"
  "systemctl stop"
  "ufw disable"
  "ufw delete"
  "iptables -F"
  "shutdown"
  "reboot"
  "mkfs"
  "dd if="
  ">"  # any output redirection on the remote side — keeps writes off
)

# Scan one command string against FORBIDDEN_PATTERNS; refuse if any match.
# The ">" check is intentionally strict — we never want the remote command
# to write to a file. Everything is captured locally.
contains_forbidden() {
  local cmd="$1"
  local pat
  for pat in "${FORBIDDEN_PATTERNS[@]}"; do
    case "$cmd" in
      *"$pat"*) return 0 ;;
    esac
  done
  return 1
}

# --- Audit commands (NAME|COMMAND) -----------------------------------------
# Every command must be read-only. Output is captured by the local script.
# Section numbers match docs/research/vps-phase-1-audit-2026-05-18.md.
AUDIT_CHECKS=(
  "1-ssh-and-host|uname -a && uptime && cat /etc/os-release | head -4"
  "2-disk-and-memory|df -h / && echo --- && free -m"
  "3-docker-version|docker --version 2>/dev/null && docker compose version 2>/dev/null || echo docker_absent"
  "4-containers-list|docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo docker_absent"
  "4-docker-networks|docker network ls 2>/dev/null || echo docker_absent"
  "4-docker-volumes|docker volume ls 2>/dev/null || echo docker_absent"
  "5-listening-ports|ss -ltnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo no_port_tool"
  "6-tailscale|tailscale status --json 2>/dev/null || which tailscale 2>/dev/null || echo tailscale_absent"
  "7-firewall|sudo -n ufw status verbose 2>/dev/null || sudo -n iptables -L -n 2>/dev/null | head -40 || echo firewall_check_skipped_no_sudo"
  "8-operator-home|id operator 2>/dev/null && ls -la /home/operator/ 2>/dev/null || echo operator_absent"
  "8-hermestv-dir|ls -la /home/operator/hermestv/ 2>/dev/null || echo hermestv_dir_absent"
  "9-existing-reverse-proxy|which caddy 2>/dev/null && caddy version 2>/dev/null || echo caddy_absent; echo ---; ls /etc/nginx/sites-enabled/ 2>/dev/null || true; echo ---; ls /etc/apache2/sites-enabled/ 2>/dev/null || true"
  "10-running-services|systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -30 || echo systemctl_unavailable"
)

# --- Pre-flight: scan every command before SSH opens -----------------------
echo "READ-ONLY AUDIT — NO VPS MODIFICATIONS"
echo ""
echo "Pre-flight: scanning ${#AUDIT_CHECKS[@]} commands against forbidden patterns..."
abort=0
for entry in "${AUDIT_CHECKS[@]}"; do
  name="${entry%%|*}"
  cmd="${entry#*|}"
  if contains_forbidden "$cmd"; then
    echo "  ABORT [$name]: command contains a forbidden pattern."
    abort=1
  fi
done

if [ "$abort" -ne 0 ]; then
  echo ""
  echo "One or more planned commands violated the safety policy. NOT contacting VPS."
  exit 1
fi
echo "  OK — all commands are read-only."
echo ""

# --- Compute report path ---------------------------------------------------
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPORT="$REPO_ROOT/docs/research/vps-phase-1-audit-RUN-$TS.md"

# --- Header ----------------------------------------------------------------
{
  echo "# VPS Phase 1 Audit — RUN $TS"
  echo ""
  echo "**Mode**: READ-ONLY"
  echo "**VPS host**: \`$VPS_HOST\` (printed for record; not a secret)"
  echo "**Tool**: tools/vps-audit-phase-1.sh"
  echo "**Template**: docs/research/vps-phase-1-audit-2026-05-18.md"
  echo ""
  echo "This run captures the existing state of the VPS. No modifications were made."
  echo ""
  echo "---"
  echo ""
} > "$REPORT"

# --- Run each check --------------------------------------------------------
ssh_failures=0
for entry in "${AUDIT_CHECKS[@]}"; do
  name="${entry%%|*}"
  cmd="${entry#*|}"

  echo "[$name] running..."
  {
    echo "## ${name}"
    echo ""
    echo "**Command**:"
    echo '```bash'
    echo "ssh \"\$VPS_HOST\" '$cmd'"
    echo '```'
    echo ""
    echo "**Captured output**:"
    echo '```'
  } >> "$REPORT"

  # Use BatchMode to prevent any interactive prompt — fails fast if SSH
  # cannot authenticate with the existing key.
  if ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new "$VPS_HOST" "$cmd" >> "$REPORT" 2>&1; then
    :
  else
    rc=$?
    echo "" >> "$REPORT"
    echo "(SSH or remote command exited with code $rc — captured as-is, no remediation attempted)" >> "$REPORT"
    ssh_failures=$((ssh_failures + 1))
  fi

  {
    echo '```'
    echo ""
    echo "**Classification** (fill in by hand): KEEP / STOP / UNKNOWN / NEVER_TOUCH"
    echo ""
    echo "---"
    echo ""
  } >> "$REPORT"
done

# --- Final checklist -------------------------------------------------------
{
  echo "## Final Phase 1 checklist"
  echo ""
  echo "- [ ] SSH reachable (section 1-ssh-and-host)"
  echo "- [ ] Docker installed and version recorded (section 3-docker-version)"
  echo "- [ ] Existing containers inventoried (section 4-containers-list)"
  echo "- [ ] Existing Docker networks inventoried (section 4-docker-networks)"
  echo "- [ ] Existing Docker volumes inventoried (section 4-docker-volumes)"
  echo "- [ ] Listening ports inventoried with PID (section 5-listening-ports)"
  echo "- [ ] Tailscale status known (section 6-tailscale)"
  echo "- [ ] Existing website stack identified (sections 4 + 9-existing-reverse-proxy + 10-running-services)"
  echo "- [ ] HermesTV separation plan drafted in template doc"
  echo "- [ ] Rollback plan documented in template doc"
  echo "- [ ] All observed items classified KEEP / STOP / UNKNOWN / NEVER_TOUCH"
  echo "- [ ] Operator review + sign-off on classification before Phase 2"
  echo ""
  echo "SSH failures during this run: $ssh_failures"
  echo ""
  echo "When every box above is checked AND the operator approves the table,"
  echo "Phase 2 (deployment) may be planned. Not before."
} >> "$REPORT"

echo ""
echo "Audit report written to: $REPORT"
echo "SSH failures: $ssh_failures"
echo ""
echo "Next step: open the report, fill in the classification column, and get operator sign-off."
