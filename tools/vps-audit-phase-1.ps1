# ============================================================================
# READ-ONLY AUDIT — NO VPS MODIFICATIONS
# ============================================================================
# HermesTV VPS Phase 1 audit runner (PowerShell 7+).
#
# What this does:
#   - SSH into $env:VPS_HOST and run 10 read-only inspection commands
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
# Usage (PowerShell):
#   $env:VPS_HOST = 'operator@your-vps-ip'
#   .\tools\vps-audit-phase-1.ps1
#
# Refusal conditions (the script exits 1 without contacting the VPS):
#   - VPS_HOST env is unset or empty
#   - Any planned remote command matches a forbidden destructive pattern
# ============================================================================

$ErrorActionPreference = 'Stop'

# --- Safety: refuse unless VPS_HOST is set ---------------------------------
if (-not $env:VPS_HOST -or $env:VPS_HOST.Trim() -eq '') {
    Write-Error @"
READ-ONLY AUDIT — NO VPS MODIFICATIONS

VPS_HOST is not set.
Usage:
  `$env:VPS_HOST = 'operator@your-vps-ip'
  .\tools\vps-audit-phase-1.ps1
"@
    exit 1
}

# --- Safety: forbidden destructive patterns --------------------------------
$ForbiddenPatterns = @(
    'docker rm',
    'docker volume rm',
    'docker system prune',
    'docker compose down -v',
    'docker compose down --volumes',
    'rm -rf',
    'apt remove',
    'apt-get remove',
    'apt purge',
    'apt-get purge',
    'systemctl disable',
    'systemctl stop',
    'ufw disable',
    'ufw delete',
    'iptables -F',
    'shutdown',
    'reboot',
    'mkfs',
    'dd if=',
    '>'
)

function Test-ContainsForbidden {
    param([string]$Command)
    foreach ($pat in $ForbiddenPatterns) {
        if ($Command.Contains($pat)) { return $true }
    }
    return $false
}

# --- Audit commands (name -> command) --------------------------------------
$AuditChecks = @(
    [pscustomobject]@{ Name = '1-ssh-and-host';           Command = 'uname -a && uptime && cat /etc/os-release | head -4' }
    [pscustomobject]@{ Name = '2-disk-and-memory';        Command = 'df -h / && echo --- && free -m' }
    [pscustomobject]@{ Name = '3-docker-version';         Command = 'docker --version 2>/dev/null && docker compose version 2>/dev/null || echo docker_absent' }
    [pscustomobject]@{ Name = '4-containers-list';        Command = "docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || echo docker_absent" }
    [pscustomobject]@{ Name = '4-docker-networks';        Command = 'docker network ls 2>/dev/null || echo docker_absent' }
    [pscustomobject]@{ Name = '4-docker-volumes';         Command = 'docker volume ls 2>/dev/null || echo docker_absent' }
    [pscustomobject]@{ Name = '5-listening-ports';        Command = 'ss -ltnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo no_port_tool' }
    [pscustomobject]@{ Name = '6-tailscale';              Command = 'tailscale status --json 2>/dev/null || which tailscale 2>/dev/null || echo tailscale_absent' }
    [pscustomobject]@{ Name = '7-firewall';               Command = 'sudo -n ufw status verbose 2>/dev/null || sudo -n iptables -L -n 2>/dev/null | head -40 || echo firewall_check_skipped_no_sudo' }
    [pscustomobject]@{ Name = '8-operator-home';          Command = 'id operator 2>/dev/null && ls -la /home/operator/ 2>/dev/null || echo operator_absent' }
    [pscustomobject]@{ Name = '8-hermestv-dir';           Command = 'ls -la /home/operator/hermestv/ 2>/dev/null || echo hermestv_dir_absent' }
    [pscustomobject]@{ Name = '9-existing-reverse-proxy'; Command = 'which caddy 2>/dev/null && caddy version 2>/dev/null || echo caddy_absent; echo ---; ls /etc/nginx/sites-enabled/ 2>/dev/null; echo ---; ls /etc/apache2/sites-enabled/ 2>/dev/null' }
    [pscustomobject]@{ Name = '10-running-services';      Command = 'systemctl list-units --type=service --state=running --no-pager 2>/dev/null | head -30 || echo systemctl_unavailable' }
)

# --- Pre-flight: scan every command before SSH opens -----------------------
Write-Host 'READ-ONLY AUDIT — NO VPS MODIFICATIONS'
Write-Host ''
Write-Host "Pre-flight: scanning $($AuditChecks.Count) commands against forbidden patterns..."

$abort = $false
foreach ($check in $AuditChecks) {
    if (Test-ContainsForbidden -Command $check.Command) {
        Write-Host "  ABORT [$($check.Name)]: command contains a forbidden pattern."
        $abort = $true
    }
}

if ($abort) {
    Write-Host ''
    Write-Host 'One or more planned commands violated the safety policy. NOT contacting VPS.'
    exit 1
}
Write-Host '  OK — all commands are read-only.'
Write-Host ''

# --- Compute report path ---------------------------------------------------
$ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ssZ')
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$report = Join-Path $repoRoot "docs\research\vps-phase-1-audit-RUN-$ts.md"

# --- Header ----------------------------------------------------------------
@"
# VPS Phase 1 Audit — RUN $ts

**Mode**: READ-ONLY
**VPS host**: ``$($env:VPS_HOST)`` (printed for record; not a secret)
**Tool**: tools/vps-audit-phase-1.ps1
**Template**: docs/research/vps-phase-1-audit-2026-05-18.md

This run captures the existing state of the VPS. No modifications were made.

---

"@ | Out-File -FilePath $report -Encoding utf8

# --- Run each check --------------------------------------------------------
$sshFailures = 0
foreach ($check in $AuditChecks) {
    Write-Host "[$($check.Name)] running..."

    @"
## $($check.Name)

**Command**:
``````bash
ssh `"`$VPS_HOST`" '$($check.Command)'
``````

**Captured output**:
``````
"@ | Out-File -FilePath $report -Encoding utf8 -Append

    # Use BatchMode to prevent any interactive prompt — fails fast if SSH
    # cannot authenticate with the existing key.
    $sshArgs = @(
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=15',
        '-o', 'StrictHostKeyChecking=accept-new',
        $env:VPS_HOST,
        $check.Command
    )

    try {
        $output = & ssh @sshArgs 2>&1
        $rc = $LASTEXITCODE
        if ($null -ne $output) {
            $output | Out-File -FilePath $report -Encoding utf8 -Append
        }
        if ($rc -ne 0) {
            "" | Out-File -FilePath $report -Encoding utf8 -Append
            "(SSH or remote command exited with code $rc — captured as-is, no remediation attempted)" |
                Out-File -FilePath $report -Encoding utf8 -Append
            $sshFailures++
        }
    } catch {
        "" | Out-File -FilePath $report -Encoding utf8 -Append
        "(SSH invocation threw: $($_.Exception.Message))" | Out-File -FilePath $report -Encoding utf8 -Append
        $sshFailures++
    }

    @"
``````

**Classification** (fill in by hand): KEEP / STOP / UNKNOWN / NEVER_TOUCH

---

"@ | Out-File -FilePath $report -Encoding utf8 -Append
}

# --- Final checklist -------------------------------------------------------
@"
## Final Phase 1 checklist

- [ ] SSH reachable (section 1-ssh-and-host)
- [ ] Docker installed and version recorded (section 3-docker-version)
- [ ] Existing containers inventoried (section 4-containers-list)
- [ ] Existing Docker networks inventoried (section 4-docker-networks)
- [ ] Existing Docker volumes inventoried (section 4-docker-volumes)
- [ ] Listening ports inventoried with PID (section 5-listening-ports)
- [ ] Tailscale status known (section 6-tailscale)
- [ ] Existing website stack identified (sections 4 + 9-existing-reverse-proxy + 10-running-services)
- [ ] HermesTV separation plan drafted in template doc
- [ ] Rollback plan documented in template doc
- [ ] All observed items classified KEEP / STOP / UNKNOWN / NEVER_TOUCH
- [ ] Operator review + sign-off on classification before Phase 2

SSH failures during this run: $sshFailures

When every box above is checked AND the operator approves the table,
Phase 2 (deployment) may be planned. Not before.
"@ | Out-File -FilePath $report -Encoding utf8 -Append

Write-Host ''
Write-Host "Audit report written to: $report"
Write-Host "SSH failures: $sshFailures"
Write-Host ''
Write-Host 'Next step: open the report, fill in the classification column, and get operator sign-off.'
