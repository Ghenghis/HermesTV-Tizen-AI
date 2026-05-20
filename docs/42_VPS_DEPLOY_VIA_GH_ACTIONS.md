# 42 · VPS Deploy via GitHub Actions

This is the click-button way to redeploy HermesTV to the Hostinger VPS. It
replaces the workstation-only flow that required a working local SSH config
plus an accepted host key — neither of which the operator had on
2026-05-18, which blocked that day's deploy.

The laptop script (`tools/redeploy-vps.sh`) is still here as a fallback. Both
paths do the same thing: pull the requested ref on the VPS, rebuild + restart
the two HermesTV containers, wait for healthchecks, then run auth-aware smoke
probes.

> Companion runbook: `docs/29_HERMESTV_DEPLOY_RUNBOOK.md` covers the
> manual / loopback steps when neither path is usable.

---

## 1 · One-time setup — GitHub repo secrets

The workflow needs these repository secrets. Create them in:

**GitHub → Settings → Secrets and variables → Actions → New repository secret.**

| Name | What it holds | How to find it |
| --- | --- | --- |
| `VPS_HOST` | Hostname or IPv4 of the Hostinger VPS. | Hostinger panel → VPS → your server → Overview. Either `srv1376124.hstgr.cloud` or the raw IP works; the public side of the workflow uses the canonical `tv.daveai.tech`, so this secret only affects SSH-target resolution. |
| `VPS_USER` | The username to log in as (typically `operator`). | See `docs/22_CREATE_OPERATOR_USER_RUNBOOK.md`. If you SSH today with `ssh operator@srv1376124`, the value is `operator`. |
| `VPS_PASS` | The password for `VPS_USER`. | Hostinger/operator credentials. The workflow passes it through `sshpass -e`, not on the process command line. |
| `VPS_PORT` | Optional SSH port. | Leave unset for `22`, or set the custom Hostinger SSH port. |
| `DAVETV_PROOF_EMAIL` | Optional, required only when `run_provider_live=true`. | A real invited DaveTV account email used for provider proof. Prefer a normal viewer account, not Dave's admin. |
| `DAVETV_PROOF_PASSWORD` | Optional, required only when `run_provider_live=true`. | Password for `DAVETV_PROOF_EMAIL`. Never commit it. |

**No secret value belongs in `.github/workflows/deploy-vps.yml` or in any
markdown file.** The workflow reads them by name from `${{ secrets.* }}`.

### Verifying VPS login works

Before triggering the workflow, confirm the operator account works:

```sh
ssh -o ConnectTimeout=10 operator@<vps-host> 'echo ok'
```

If that prints `ok`, the same host/user/password values should work from the
runner.

### Required private VPS `.env`

Before deploying the auth-gated DaveTV build, the private file
`/home/operator/hermestv/.env` on the VPS must contain real values:

```env
DAVETV_AUTH_REQUIRED=true
DAVETV_AUTH_ENFORCE_API=true
DAVETV_PUBLIC_APP_URL=https://tv.daveai.tech
DAVETV_ADMIN_EMAIL=<Dave real email>
DAVETV_ADMIN_PASSWORD=<Dave real initial password>
```

The deploy workflow checks these keys before rebuilding. It prints only key
names, never the values. If any are missing, deploy stops before the running
site is changed.

---

## 2 · Triggering a deploy

1. Go to the repo on GitHub.
2. **Actions** tab → in the left sidebar pick **Deploy VPS**.
3. Click **Run workflow** (top-right of the run list).
4. Leave `Branch: main` selected, leave the `ref` input at `main`, click
   the green **Run workflow** button.
5. For provider-live proof, set `run_provider_live=true` only after
   `DAVETV_PROOF_EMAIL` and `DAVETV_PROOF_PASSWORD` secrets exist.
6. The run appears in the list within a few seconds. Click it to watch
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
  PASS: /api/version git_sha=<deployed sha>
  PASS: /api/auth/me configured=true required=true api_enforced=true
  PASS: /api/providers anonymous request blocked with 401
  PASS: web root -> 200
=== VPS redeploy complete — 5 PASS, 0 FAIL ===
```

The blocking deploy gate is the SSH redeploy step plus container health. The
public smoke step can be informational because Cloudflare may block GitHub
runner IPs; when the edge is reachable, the five probes above should report
`PASS`.

---

## 4 · What failure looks like and what to do

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Job stops in **Pre-seed known_hosts** with `Secret VPS_HOST is empty`. | `VPS_HOST` secret is unset. | Add the hostname/IP and re-run. |
| Job stops in **SSH to VPS and redeploy** with `Permission denied`. | `VPS_USER`, `VPS_PASS`, host, or port is wrong. | Correct the repo secrets and confirm `ssh operator@<vps-host> 'echo ok'` from a workstation. |
| SSH step hangs to timeout. | VPS firewall is dropping inbound from the GitHub runner IP. | Confirm port 22 (or the configured port) accepts global inbound. Hostinger panel → Firewall. |
| SSH step reports `.env missing required DAVETV_*`. | Auth-gated build would lock the site because the private VPS env is incomplete. | SSH to the VPS and set the required keys in `/home/operator/hermestv/.env`, mode `0600`. |
| `containers did not reach healthy within 60s`. | Bad build, missing env var, or the API/web image crashed on boot. | SSH manually and run `docker compose -p hermestv-vps logs --tail=200 hermes-tv-api hermes-web-tv`. |
| Smoke probe reports `/api/auth/me` not configured. | Dave admin bootstrap env was missing or the auth store has no admin. | Set `DAVETV_ADMIN_EMAIL` and `DAVETV_ADMIN_PASSWORD`, then redeploy/restart before inviting users. |
| Smoke probe reports `/api/providers` did not return 401. | Public API auth gate is not enabled. | Set `DAVETV_AUTH_ENFORCE_API=true` on the VPS. |

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
