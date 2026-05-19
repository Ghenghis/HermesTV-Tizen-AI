# 42 · VPS Deploy via GitHub Actions

This is the click-button way to redeploy HermesTV to the Hostinger VPS. It
replaces the workstation-only flow that required a working local SSH config
plus an accepted host key — neither of which the operator had on
2026-05-18, which blocked that day's deploy.

The laptop script (`tools/redeploy-vps.sh`) is still here as a fallback. Both
paths do the same thing: pull `main` on the VPS, rebuild + restart the two
HermesTV containers, wait for healthchecks, then run five smoke probes.

> Companion runbook: `docs/29_HERMESTV_DEPLOY_RUNBOOK.md` covers the
> manual / loopback steps when neither path is usable.

---

## 1 · One-time setup — GitHub repo secrets

The workflow needs three secrets. Create them in:

**GitHub → Settings → Secrets and variables → Actions → New repository secret.**

| Name | What it holds | How to find it |
| --- | --- | --- |
| `VPS_SSH_KEY` | The **full private key** of the deploy keypair, including the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines and the blank line at the end. | On your workstation, `cat ~/.ssh/id_ed25519` (or whichever key matches the `IdentityFile` line for `srv1376124` in `~/.ssh/config`). If you don't have one yet, generate `ssh-keygen -t ed25519 -C "github-actions-vps-deploy"`, then `ssh-copy-id -i ~/.ssh/id_ed25519.pub operator@<vps>` to authorize the public half. |
| `VPS_HOST` | Hostname or IPv4 of the Hostinger VPS. | Hostinger panel → VPS → your server → Overview. Either `srv1376124.hstgr.cloud` or the raw IP works; the public side of the workflow uses the canonical `tv.daveai.tech`, so this secret only affects SSH-target resolution. |
| `VPS_USER` | The username to log in as (typically `operator`). | See `docs/22_CREATE_OPERATOR_USER_RUNBOOK.md`. If you SSH today with `ssh operator@srv1376124`, the value is `operator`. |

**No secret value belongs in `.github/workflows/deploy-vps.yml` or in any
markdown file.** The workflow reads them by name from `${{ secrets.* }}`.

### Verifying the deploy key works

Before triggering the workflow, confirm the keypair actually opens the
operator account:

```sh
# On your workstation, with the matching private key in the SSH agent:
ssh -o BatchMode=yes -o ConnectTimeout=10 operator@<vps-host> 'echo ok'
```

If that prints `ok`, the same key plus a fresh `ssh-keyscan` (which the
workflow runs for you) will work from the runner.

---

## 2 · Triggering a deploy

1. Go to the repo on GitHub.
2. **Actions** tab → in the left sidebar pick **Deploy VPS**.
3. Click **Run workflow** (top-right of the run list).
4. Leave `Branch: main` selected, leave the `ref` input at `main`, click
   the green **Run workflow** button.
5. The run appears in the list within a few seconds. Click it to watch
   the live log.

The workflow is **manual only** — there is no `push: main` trigger. You
will never deploy by accident.

---

## 3 · What success looks like

A successful run finishes with this summary in the run page:

```text
## VPS deploy summary

- Host probed: https://tv.daveai.tech
- Ref deployed: main
- Result: 5 PASS, 0 FAIL
```

Inside the log, the **Smoke-probe public HTTPS edge** step prints:

```text
  PASS: /health -> 200
  PASS: /api/layouts count=8
  PASS: /api/download exact_size_human='12.4 GB'   # value varies
  PASS: /api/pair pairing_code='HRM-AB1C'          # value varies
  PASS: /api/catalog _meta.source='m3u'            # source varies
=== VPS redeploy complete — 5 PASS, 0 FAIL ===
```

The job is green only when **all five probes** report PASS **and** the
SSH redeploy step exited zero. Any FAIL turns the run red.

---

## 4 · What failure looks like and what to do

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Job stops in **Start SSH agent**. | `VPS_SSH_KEY` secret is empty, malformed, or missing the trailing newline. | Re-paste the full file contents including header, footer, and final newline. |
| Job stops in **Pre-seed known_hosts** with `Secret VPS_HOST is empty`. | `VPS_HOST` secret is unset. | Add the hostname/IP and re-run. |
| Job stops in **SSH to VPS and redeploy** with `Permission denied (publickey)`. | The public half of `VPS_SSH_KEY` is not in `~operator/.ssh/authorized_keys` on the VPS. | On the VPS, append the matching public key to `/home/operator/.ssh/authorized_keys`. |
| SSH step hangs to timeout. | VPS firewall is dropping inbound from the GitHub runner IP. | Confirm port 22 (or the configured port) accepts global inbound. Hostinger panel → Firewall. |
| `containers did not reach healthy within 60s`. | Bad build, missing env var, or the API/web image crashed on boot. | SSH manually and run `docker compose -p hermestv-vps logs --tail=200 hermes-tv-api hermes-web-tv`. |
| Smoke probe 2 reports `count='7'`. | The deployed build predates PR #58. | The redeploy ran but the ref didn't include #58. Pass a newer commit to the `ref` input and re-run. |
| Smoke probe 3 reports `exact_size_human missing`. | The deployed build predates PR #59. | Same as above. |
| Smoke probe 4 reports `pairing_code` empty or wrong shape. | The deployed build predates PR #67. | Same as above. |

The full container logs are not echoed into the job log (they would leak
unrelated detail). If a probe fails after a clean SSH step, SSH manually
to pull the last 200 lines — that's the same step the runbook describes.

---

## 5 · Rollback runbook

If a deploy ships a bad build, the workflow itself is the fastest
rollback path. **Do not** delete the bad commit from `main` first.

1. Find the last known-good commit on `main`. Either:
   - the `Actions` tab → previous green **Deploy VPS** run → click into
     the run summary; the `Ref deployed` line shows the SHA, **or**
   - `git log --oneline origin/main` on your workstation.
2. Trigger **Deploy VPS** again with the `ref` input set to that SHA.
   Branches, tags, and 40-char SHAs all work.
3. The workflow detects the detached-HEAD case and skips the `git pull
   --ff-only` (a detached HEAD has no upstream branch to fast-forward
   from), then rebuilds and restarts on that exact commit.
4. The smoke probes after rollback should match what they printed on
   the last green run for that ref.

When the underlying bug is fixed on `main`, the next click-deploy with
the default `ref: main` re-promotes the fix.

---

## 6 · Why both paths exist

`tools/redeploy-vps.sh` runs from a laptop with a configured SSH agent.
The GHA workflow runs from a hosted runner that we provision per-job.

| Path | Authoritative when | Quirks |
| --- | --- | --- |
| **`tools/redeploy-vps.sh`** (laptop) | Your local SSH config works and the VPS host key is already trusted. Useful offline, in a coffee-shop, or when GitHub Actions is degraded. | Requires `~/.ssh/known_hosts` to already contain the VPS fingerprint. `BatchMode=yes` makes the first connection from a fresh laptop fail loudly — `ssh-keyscan` it once and retry. |
| **`.github/workflows/deploy-vps.yml`** (this doc) | Default. Always works for anyone with repo access. | Builds run on the VPS, not on the runner; the runner only opens an SSH session, so build-machine speed is the same as the laptop path. |

Both paths use the same compose project (`hermestv-vps`), the same
compose file (`upstream/docker-vps/VPS_COMPOSE.yml`), and the same two
target services (`hermes-tv-api`, `hermes-web-tv`). They never touch
threadfin, m3u-editor, or xtreamfilter.

---

## 7 · Audit / safety

- The workflow file is `permissions: contents: read`. It cannot push,
  open PRs, or modify the repo.
- `concurrency: { group: vps-deploy, cancel-in-progress: false }` queues
  back-to-back clicks; no two builds race on the same image layer cache.
- `timeout-minutes: 12` caps a stuck SSH session at twelve minutes. The
  worst-case observed real deploy is ~6 minutes.
- The private key lives in the runner's in-memory SSH agent only; it is
  never written to disk and `actions/upload-artifact` is not used.
- The smoke probes run against the public HTTPS edge so they exercise
  the same path the user's browser sees (Cloudflare → host nginx →
  Docker container). Loopback probes would miss CF/nginx misconfig.
