# 22 — Create `operator` User Runbook (sysadmin)

**Status**: review-only. Commands below are for the sysadmin to execute manually on the VPS. **This repo does not run them.**

**Why**: Phase 1 audit established that the `operator` user does not exist on the VPS. HermesTV must NOT run as `root`. A dedicated unprivileged user, with `docker` group membership and `sudo` for explicit privileged steps, isolates HermesTV from the rest of Dave's daveai.tech stack and keeps the blast radius small.

**Pre-check**: the audit ran successfully as `root` and confirmed `/home/operator/` is absent. If a previous attempt created the user, abort and pull the existing state into this doc before re-running anything.

---

## Step 0 — Connect to the VPS as root

```bash
ssh root@<vps-host>
```

Confirm you're on the correct host:

```bash
hostname     # expect: srv1376124
uname -a     # expect: Linux 6.8.0-101 Ubuntu 24.04
```

If hostname or kernel does not match, **stop**. Wrong VPS.

---

## Step 1 — Create the user with no password (key-only auth)

```bash
sudo adduser --disabled-password --gecos "" operator
```

- `--disabled-password` means no password-based SSH login. Key auth only.
- `--gecos ""` skips the interactive name/phone/email prompts.

Verify:

```bash
id operator
# expect: uid=NNNN(operator) gid=NNNN(operator) groups=NNNN(operator)
```

---

## Step 2 — Add operator to `sudo` and `docker` groups

```bash
sudo usermod -aG sudo,docker operator
```

Verify:

```bash
groups operator
# expect: operator sudo docker
```

---

## Step 3 — Configure passwordless sudo for operator (optional but recommended)

This avoids interactive password prompts during compose runs. Sudoers entry is restricted to docker commands so the blast radius stays bounded.

```bash
sudo tee /etc/sudoers.d/operator-docker > /dev/null <<'EOF'
# Phase 1.5 — passwordless sudo for the HermesTV operator user, restricted
# to docker and systemctl operations on hermestv-* units.
operator ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose, /usr/bin/systemctl status hermestv-*, /usr/bin/systemctl reload hermestv-*
EOF
sudo chmod 0440 /etc/sudoers.d/operator-docker
sudo visudo -cf /etc/sudoers.d/operator-docker
```

If `visudo -cf` does not print "parsed OK", **delete the file and try again** — never leave a broken sudoers entry, it can lock root out:

```bash
sudo rm /etc/sudoers.d/operator-docker
```

---

## Step 4 — Install the workstation pubkey into operator's authorized_keys

The workstation's `id_ed25519.pub` was installed for root in the Phase 1 bootstrap. Copy that same key over to operator:

```bash
sudo mkdir -p /home/operator/.ssh
sudo cp /root/.ssh/authorized_keys /home/operator/.ssh/authorized_keys
sudo chown -R operator:operator /home/operator/.ssh
sudo chmod 700 /home/operator/.ssh
sudo chmod 600 /home/operator/.ssh/authorized_keys
```

Verify:

```bash
sudo -u operator cat /home/operator/.ssh/authorized_keys | wc -l
# expect: >= 1 (one line per pubkey installed)
```

---

## Step 5 — Test key auth as operator from the workstation

From the workstation (NOT the VPS):

```bash
ssh -o BatchMode=yes -o PreferredAuthentications=publickey operator@<vps-host> 'echo KEY_AUTH_OK && id -un && groups'
# expect: KEY_AUTH_OK / operator / operator sudo docker
```

If the test fails, do not proceed. Check `/var/log/auth.log` on the VPS:

```bash
sudo tail -50 /var/log/auth.log
```

Common causes:
- `authorized_keys` permissions wrong (must be 600, owned by operator)
- `/home/operator/.ssh` permissions wrong (must be 700, owned by operator)
- SELinux/AppArmor blocking — Hostinger Ubuntu usually leaves AppArmor permissive for ssh; if blocking, investigate.

---

## Step 6 — Confirm operator can use docker without sudo

From the workstation:

```bash
ssh operator@<vps-host> 'docker ps --format "{{.Names}}" | wc -l'
# expect: the existing container count (the audit saw 10) — operator can read but won't be modifying anything yet
```

If permission denied, the docker group membership didn't take effect — log out and log back in (the new group membership requires a fresh session).

---

## Step 7 — Re-run the Phase 1 audit as operator

From the workstation:

```powershell
$env:VPS_HOST = 'operator@<vps-host>'
Set-Location G:\Github\HermesTV-Tizen-AI
.\tools\vps-audit-phase-1.ps1
```

Compare the new run report against `docs/research/vps-phase-1-audit-RUN-2026-05-18T*.md` (local). The only differences should be:

- Section 8 (`operator-home`) shows the operator user exists and `/home/operator/` is empty (good — fresh install path)
- Section 7 (`firewall`) may show `firewall_check_skipped_no_sudo` if `sudo -n` requires a password — that's expected for operator with the restricted sudoers entry. Operator can run `sudo ufw status verbose` interactively if needed.
- Sections 1–6, 9, 10 are unchanged

If anything else changed (new container, port, service), STOP and investigate before Phase 2.

---

## Step 8 — Commit the operator-side state

The operator-user creation is irreversible-ish (you can `userdel` but it's destructive). Document the change:

```bash
# On the VPS, as root:
date -u +"%Y-%m-%dT%H:%M:%SZ" >> /root/hermestv-phase-1-5-completed.txt
echo "operator user created, key auth verified, docker group OK" >> /root/hermestv-phase-1-5-completed.txt
```

This file is just a marker. The audit-tool re-run is the real proof.

---

## Rollback (if needed)

If the operator user causes any unexpected behavior (it shouldn't — it's a standard unprivileged user):

```bash
# As root on the VPS:
sudo userdel -r operator                # remove user + home
sudo rm /etc/sudoers.d/operator-docker  # remove restricted sudoers entry
```

Verify nothing else broke:

```bash
sudo systemctl status nginx docker
# expect: both active (running)
```

---

## What this runbook does NOT do

- ❌ Does not install Docker (already present, v29.4.3)
- ❌ Does not modify host `nginx`, `Caddy`, `ufw`, `iptables`
- ❌ Does not stop, start, or modify any existing container
- ❌ Does not pull any Docker image
- ❌ Does not touch `.env`, secrets, or provider credentials
- ❌ Does not run `docker compose up`

It is **only** the user-account setup. Phase 2 plan handles deployment.
