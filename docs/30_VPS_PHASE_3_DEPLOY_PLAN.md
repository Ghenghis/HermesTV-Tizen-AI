# 30 — VPS Phase 3 Deploy Plan

**Branch**: `ops/phase-3-plan`
**Predecessors**:
- [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md)
- [21_VPS_PHASE_1_5_REMEDIATION_PLAN.md](21_VPS_PHASE_1_5_REMEDIATION_PLAN.md)
- [22_CREATE_OPERATOR_USER_RUNBOOK.md](22_CREATE_OPERATOR_USER_RUNBOOK.md) (executed 2026-05-18)
- [28_VPS_PHASE_2_DEPLOY_PLAN.md](28_VPS_PHASE_2_DEPLOY_PLAN.md)
- [29_HERMESTV_DEPLOY_RUNBOOK.md](29_HERMESTV_DEPLOY_RUNBOOK.md)
- [31_PROVIDER_CREDENTIALS_VAULT.md](31_PROVIDER_CREDENTIALS_VAULT.md) (sibling — credential workflow)
- [32_JELLYFIN_INTEGRATION_PLAN.md](32_JELLYFIN_INTEGRATION_PLAN.md) (sibling — workstation Jellyfin reachability)

This document is **planning only**. It does NOT deploy. It does NOT touch the VPS. It does NOT add credentials anywhere. No `docker`, `ssh`, `scp`, or `nginx` command is executed from this branch.

---

## Status of preceding gates

Phase 3 is gated on Phase 2 being live and stable for **at least 24 consecutive hours** with no regressions. The gate checklist below must be fully green before any Phase 3 step starts.

| Gate | Required state | Evidence path |
|---|---|---|
| Phase 2 PR merged to `main` | ✅ | `Merge pull request #9` commit on `main` |
| `hermestv-vps-api` healthy | ✅ for 24+ h | `docker inspect -f '{{.State.Health.Status}}' hermestv-vps-api` returns `healthy`, `docker inspect -f '{{.State.StartedAt}}' ...` ≥ 24 h ago |
| `hermestv-vps-web` healthy | ✅ for 24+ h | Same as above for `hermestv-vps-web` |
| All 9 existing daveai.tech sites still 200 | ✅ | Workstation `curl` sweep saved to `/home/operator/hermestv-deploy-logs/pre-phase-3-$TS.txt` |
| Phase 2 acceptance tests still pass | ✅ | `/health` returns 200, `/api/layouts` returns 7 entries, real browser renders profile picker, layout switcher modal works |
| No new errors in API logs | ✅ | `docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps logs --since 24h hermes-tv-api` shows no unhandled exceptions |
| Disk + RAM headroom | ✅ | `df -h /` ≥ 5 GB free, `free -m` ≥ 2 GB RAM free |

If any row is not green, Phase 3 stays in plan-only state. We do not deploy through warnings.

---

## What Phase 3 adds

Three IPTV-proxy containers, isolated on the existing `hermestv-vps-internal` Docker network only. None of them gets a public port. None of them gets a host-port binding either — they live exclusively on the internal Docker bridge and are reached by the operator over **Tailscale only**, via the VPS's tailnet IP and `docker exec` / port-forward for one-time setup.

| Container | Image | Internal port | Role |
|---|---|---|---|
| `hermestv-vps-threadfin` | `ghcr.io/threadfin/threadfin:latest` | 34400 (inside Docker network) | M3U → HDHomeRun proxy + XMLTV EPG. Native Jellyfin integration. Successor to xTeVe. |
| `hermestv-vps-m3u-editor` | `ghcr.io/sparkison/m3u-editor:latest` | 4200 (inside Docker network) | Web UI to manage, filter, reorder M3U playlists from Apollo / XtremeHD before Threadfin ingests them. |
| `hermestv-vps-xtreamfilter` | `ghcr.io/spanishst/xtreamfilter:latest` | 3456 (inside Docker network) | Filters Xtream Codes API streams by category, quality, or name. Used when a provider exposes Xtream API instead of plain M3U. |

The reasoning for keeping all three internal-only: provider credentials end up inside each container's admin UI, and the admin UIs have **no authentication on first run** (Threadfin is open until the operator sets an admin password; the others are similar). Publishing them on a host port — even loopback-only — risks a misconfigured nginx site exposing them. Tailscale-only reach is the safer default.

### Why three containers, not one

- Threadfin alone handles M3U → HDHomeRun + EPG, but does not transform or filter the upstream playlists. Apollo and XtremeHD ship channel lists that include categories Mom does not want (adult, foreign-language, regional sports we do not subscribe to). m3u-editor strips those out before Threadfin sees them.
- xtreamfilter is only needed if a provider exposes the Xtream Codes API instead of a plain M3U URL. If both Apollo and XtremeHD ship plain M3U, xtreamfilter sits idle and the operator can disable it via `docker compose stop hermestv-vps-xtreamfilter`. It still ships in this phase to avoid a separate later deploy.

### Network isolation

All three containers join `hermestv-vps-internal` **only**. They never connect to:
- `bridge` (default Docker network) — would expose them to other VPS containers
- Any `daveai-*` network — would let Dave's stack reach them
- The host network — would expose them on 0.0.0.0

The existing `hermes-tv-api` container on the same network reaches them by Docker DNS name (`http://threadfin:34400`, `http://m3u-editor:4200`, `http://xtreamfilter:3456`). No host-port hop is involved for east-west traffic.

### Operator access to the admin UIs

The operator reaches each admin UI by:

1. SSH to VPS via Tailscale (already in place — `ssh operator@<vps-tailnet-name>`)
2. Port-forward locally for one-time setup:
   ```
   ssh -L 34400:hermestv-vps-internal-ip:34400 operator@<vps-tailnet-name>
   ```
   where `hermestv-vps-internal-ip` is the bridge-network IP of the container, looked up by `docker inspect hermestv-vps-threadfin --format '{{.NetworkSettings.Networks.hermestv-vps-internal.IPAddress}}'`.
3. Open `http://localhost:34400/web` in the workstation browser
4. Enter Apollo / XtremeHD M3U URLs and credentials directly into the admin UI
5. Disconnect the port-forward

Provider credentials live inside the named volumes (`hermestv-vps-threadfin-data`, etc.) on the VPS. They never enter the repo, never enter `/home/operator/hermestv/.env`, and never enter any log file. The operator records what was configured in their offline encrypted vault (see [31_PROVIDER_CREDENTIALS_VAULT.md](31_PROVIDER_CREDENTIALS_VAULT.md)).

> **Alternative considered:** binding each admin UI to `127.0.0.1:<port>` on the VPS, then reaching it via Tailscale + `ssh -L` to the loopback port. Functionally equivalent. Rejected because it adds three more host-port bindings to track for collision purposes, and Docker DNS plus port-forward through the bridge IP works fine for what is a once-per-rotation operation.

---

## Compose changes needed in this PR

This PR is plan-only — no compose changes are committed here. The actual edits land in a **separate** PR opened after Phase 2 has been live for 24 h. That follow-up PR will:

1. Add the three services back to `upstream/docker-vps/VPS_COMPOSE.yml`. The current file already has stub definitions from before Phase 2 (kept intact in Phase 2; just not started). Phase 3's PR confirms or adjusts:
   - Each container on `networks: [hermestv-vps-internal]` **only**
   - No `ports:` block at all (no host binding) — east-west via Docker DNS
   - Named volumes: `hermestv-vps-threadfin-data`, `hermestv-vps-m3u-editor-data`, `hermestv-vps-xtreamfilter-data` (already declared)
   - `restart: unless-stopped` and a basic healthcheck on each

2. Add three new env-pointer entries (no values) to `upstream/docker-vps/.env.example`:
   ```
   THREADFIN_URL=http://threadfin:34400
   M3U_EDITOR_URL=http://m3u-editor:4200
   XTREAMFILTER_URL=http://xtreamfilter:3456
   ```
   These are already present today — Phase 3 confirms they stay.

3. Add a `hermes-tv-api` env-pointer for Threadfin's EPG endpoint:
   ```
   THREADFIN_EPG_URL=http://threadfin:34400/xmltv.xml
   ```
   The API reads this when assembling `/api/epg-grid` responses from real data.

4. Leave Caddy out (Phase 2 decision — host nginx is the edge).

The current `upstream/docker-vps/VPS_COMPOSE.yml` (post-Phase 2) already retains the three IPTV service definitions in the file but they are not in the Phase 2 `up` set. Phase 3 simply adds them to the explicit `up` command and adjusts any port stanza so admin UIs are not host-bound.

---

## Phase 3 deploy summary (operator-run, separate runbook)

The Phase 3 runbook will live in a sibling doc opened with the implementation PR. Summary of the steps that runbook will contain:

1. Operator SSH session as `operator@<vps-tailnet-name>`
2. `cd /home/operator/hermestv && git fetch && git checkout <phase-3 merge SHA> && git pull --ff-only`
3. Pre-deploy baseline: snapshot the 9 daveai.tech sites + the 2 Phase 2 endpoints
4. `docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps pull threadfin m3u-editor xtreamfilter`
5. `docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps up -d threadfin m3u-editor xtreamfilter`
6. Wait for healthchecks (up to 90 s — Threadfin's first boot can be slow)
7. One-time admin UI setup (port-forward → enter provider creds → close)
8. Run acceptance tests (next section)
9. If pass: announce Phase 3 done. If fail: rollback (also below).

---

## Acceptance tests for each container

Run from the workstation (NOT from the VPS), via Tailscale + `ssh -L` port-forward, immediately after `docker compose up -d`:

### Threadfin

```
# Inside the operator SSH session, on the VPS
docker exec hermestv-vps-threadfin wget -qO- http://localhost:34400/api/status
# Expect: JSON with "status":"ok" and a version field
```

Then from the workstation via port-forward:

```
# Open in browser: http://localhost:34400/web
# Expect: Threadfin welcome screen, no error banner
# Operator pastes Apollo M3U URL → Threadfin shows channel count > 0
# Operator pastes XtremeHD M3U URL → Threadfin shows additional channels
# Threadfin exposes XMLTV at http://threadfin:34400/xmltv.xml (reachable from
# hermes-tv-api container only — verified by `docker exec hermestv-vps-api wget -qO- http://threadfin:34400/xmltv.xml | head -5`)
```

### m3u-editor

```
docker exec hermestv-vps-m3u-editor wget -qO- http://localhost:4200
# Expect: HTML response starting with <!doctype html> or <html
```

From workstation via port-forward at `http://localhost:4200`:
- Login screen renders (m3u-editor sets admin user on first run)
- Operator imports an Apollo M3U URL, applies a category filter (drops adult + foreign-language), exports the filtered playlist
- The filtered output URL points to `http://m3u-editor:4200/<token>` — operator pastes that URL into Threadfin as a source

### xtreamfilter

```
docker exec hermestv-vps-xtreamfilter wget -qO- http://localhost:3456
# Expect: 200 OK with a UI HTML response
```

If no provider currently exposes Xtream Codes API, this container can stay idle. Test passes if the container is healthy and responds; live filter rules are configured only when a provider switches to Xtream.

### hermes-tv-api integration check

The whole point of Phase 3 is that `hermes-tv-api` starts serving a real catalog instead of the mock. Validation after credentials are in place (covered fully in [31_PROVIDER_CREDENTIALS_VAULT.md](31_PROVIDER_CREDENTIALS_VAULT.md) and [32_JELLYFIN_INTEGRATION_PLAN.md](32_JELLYFIN_INTEGRATION_PLAN.md)):

```
# From workstation
curl -s https://tv.daveai.tech/api/catalog?profile_id=mom_tv | python3 -c "import sys,json; d=json.load(sys.stdin); print('items=', d.get('total'), 'mock=', d.get('_meta',{}).get('mock_data',False))"
# Expect: items > 5, mock=False once Threadfin + Jellyfin are wired
```

### Existing-sites regression sweep (every Phase deploy repeats this)

```
for s in daveai.tech diy.daveai.tech fleet.daveai.tech game.daveai.tech \
         hermes.daveai.tech hermes3d.daveai.tech openhands.daveai.tech \
         voice.daveai.tech www.daveai.tech; do
  code=$(curl -sI -o /dev/null -w "%{http_code}" "https://$s/" 2>/dev/null)
  echo "  $s : $code"
done
```

All 9 must return 200. Plus `https://tv.daveai.tech/health` (and its alias `https://hermestv.daveai.tech/health`) must still return 200.

---

## Rollback plan

If any acceptance test fails OR any of the 9 existing sites stops returning 200 OR the API health endpoint stops returning 200:

### Immediate stop (60-second action)

```
cd /home/operator/hermestv
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  stop threadfin m3u-editor xtreamfilter
echo "phase-3 containers stopped; volumes intact"
```

Phase 2 stack (`hermes-tv-api`, `hermes-web-tv`) remains running. The whole site stays up on the Phase 2 functionality (mock catalog + working layouts + Azure TTS if enabled).

### Verify Phase 2 still healthy

```
docker inspect -f '{{.State.Health.Status}}' hermestv-vps-api
docker inspect -f '{{.State.Health.Status}}' hermestv-vps-web
curl -sI https://tv.daveai.tech/health
```

Both containers must still be `healthy` and `/health` must still return 200. If not, Phase 2 was destabilised — that is a separate incident; pull `hermes-tv-api` logs and treat as Phase 2 rollback per [29_HERMESTV_DEPLOY_RUNBOOK.md](29_HERMESTV_DEPLOY_RUNBOOK.md).

### Capture diagnostics before any further action

```
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
for c in hermestv-vps-threadfin hermestv-vps-m3u-editor hermestv-vps-xtreamfilter; do
  docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
    logs --tail=300 ${c#hermestv-vps-} > /home/operator/hermestv-deploy-logs/rollback-${c}-$TS.log
done
docker inspect hermestv-vps-threadfin hermestv-vps-m3u-editor hermestv-vps-xtreamfilter \
  > /home/operator/hermestv-deploy-logs/rollback-inspect-$TS.json
```

Workstation pulls via `scp` for offline analysis. **Never** paste these logs anywhere — Threadfin logs can include the M3U URL with the provider token in the path.

### Worst case — fully back out Phase 3

Only after operator sign-off and root cause known:

```
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  rm -f threadfin m3u-editor xtreamfilter
# Do NOT remove the volumes (-v). Provider config still lives there. The
# next Phase 3 attempt does NOT need to re-enter Apollo/XtremeHD creds.
```

Phase 2 stays up. The next attempt re-runs the Phase 3 runbook from step 4.

### Forbidden in rollback (same hard rules as Phase 1.5 and Phase 2)

- ❌ `docker compose down -v` — wipes the Threadfin / m3u-editor / xtreamfilter volumes, forcing a re-entry of all provider credentials. Use `stop` then `rm -f` instead, with no `-v`.
- ❌ `docker system prune` — touches Dave's daveai.tech stack and Phase 2 volumes.
- ❌ `docker volume rm hermestv-vps-threadfin-data` (or the other two volumes) — same reason.
- ❌ Any change to host nginx, Caddy (none present), ufw, iptables, systemd, `/etc/`, `/var/`, or `/home/` outside `/home/operator/hermestv/`.
- ❌ `apt install / remove / purge`.
- ❌ Stopping or restarting any Phase 2 container while diagnosing a Phase 3 failure (the two are independent; do not destabilise the working layer).
- ❌ Stopping any `hermes1`...`hermes5`, `pipelines`, `open-webui`, `shiba-postgres`, `model-server`, `edge-tts-server`, or any other pre-existing daveai.tech container (`NEVER_TOUCH_SYSTEM_CRITICAL` per [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md)).

---

## Out of scope for Phase 3

Explicitly NOT in this phase:

- ❌ **TLS certificates inside the stack.** Cloudflare Flexible mode keeps the origin HTTP-only and the host nginx (managed by the operator, not us) handles the public TLS endpoint. We do not introduce a stack-internal TLS layer in Phase 3.
- ❌ **Re-introducing Caddy.** Removed in Phase 2 (see [28_VPS_PHASE_2_DEPLOY_PLAN.md §Caddy: removed](28_VPS_PHASE_2_DEPLOY_PLAN.md)). The `Caddyfile` stays in the repo as reference for a hypothetical future scenario only.
- ❌ **Public host-port bindings for Threadfin / m3u-editor / xtreamfilter.** Admin UIs are reached over Tailscale + `ssh -L` only. We do not bind them to `127.0.0.1:<port>` either, to keep the host-port collision matrix from growing.
- ❌ **Provider credential automation.** Operator pastes credentials manually into each admin UI. There is no script, no env-var fan-out, no Ansible play. See [31_PROVIDER_CREDENTIALS_VAULT.md](31_PROVIDER_CREDENTIALS_VAULT.md).
- ❌ **Workstation Jellyfin migration to the VPS.** Jellyfin stays on the workstation; the VPS reaches it over Tailscale. See [32_JELLYFIN_INTEGRATION_PLAN.md](32_JELLYFIN_INTEGRATION_PLAN.md).
- ❌ **LLM-key rollout.** `ANTHROPIC_API_KEY` is optional; the chatbot's local pattern matcher already handles all 22 commands. The LLM upgrade ships in Phase 3 alongside provider creds only if the operator wants better handling of unfamiliar phrasing. See [31_PROVIDER_CREDENTIALS_VAULT.md §LLM keys](31_PROVIDER_CREDENTIALS_VAULT.md).
- ❌ **HermesTV-side TLS / cert-manager / Let's Encrypt.** Phase 4 if we ever leave Cloudflare-Flexible. Not on the roadmap today.
- ❌ **Touching any of the 19 `NEVER_TOUCH_SYSTEM_CRITICAL` services** identified in [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md).

---

## What changes in this PR (`ops/phase-3-plan`)

| File | Change |
|---|---|
| `docs/30_VPS_PHASE_3_DEPLOY_PLAN.md` | **NEW** — this document |
| `docs/31_PROVIDER_CREDENTIALS_VAULT.md` | **NEW** — provider credentials inventory + workflow |
| `docs/32_JELLYFIN_INTEGRATION_PLAN.md` | **NEW** — workstation Jellyfin reachability + API contract |

### Files intentionally NOT changed in this PR

- `upstream/docker-vps/VPS_COMPOSE.yml` — Phase 3 compose edits land in a separate PR after Phase 2 is stable for 24 h.
- `upstream/docker-vps/.env.example` — no edits in this plan-only PR. Phase 3 implementation PR will confirm three URL pointers stay (already present today).
- `services/hermes-tv-api/src/*` — no code changes. The `azureConfigured()`-style presence checks already in place are enough; Phase 3 implementation PR adds parallel `jellyfinConfigured()`, `apolloConfigured()`, etc.
- Host nginx site config — left exactly as installed in Phase 1.5.
- `/home/operator/hermestv/.env` on the VPS — operator populates this manually at deploy time (Phase 3 implementation PR's runbook step). Never committed here.

---

## Hard guarantees of this PR (same as Phase 1.5, Phase 2)

- ❌ Did NOT SSH into the VPS at any point during this PR
- ❌ Did NOT start, stop, restart, remove, or modify any container — existing or new
- ❌ Did NOT touch host nginx, Caddy, ufw, iptables, systemd, or any file under `/etc/`, `/var/`, `/home/` on the VPS
- ❌ Did NOT touch `.env`, provider credentials, Azure key, Jellyfin key, Anthropic key, OpenAI key, or any M3U URL
- ❌ Did NOT `apt install/remove/purge`
- ❌ Did NOT run `docker compose up` or any other write-mode docker command
- ❌ Did NOT modify any of the 9 daveai.tech nginx sites
- ❌ Did NOT modify the Phase 2 stack (`hermestv-vps-api`, `hermestv-vps-web`)

When this PR merges, the next gate is **24 hours of clean Phase 2 operation**. After that, a separate implementation PR opens with the compose edits and runbook.
