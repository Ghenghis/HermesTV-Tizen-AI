# 28 — VPS Phase 2 Deploy Plan

**Branch**: `ops/phase-2-vps-deploy-plan`
**Predecessors**:
- [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md)
- [21_VPS_PHASE_1_5_REMEDIATION_PLAN.md](21_VPS_PHASE_1_5_REMEDIATION_PLAN.md)
- [22_CREATE_OPERATOR_USER_RUNBOOK.md](22_CREATE_OPERATOR_USER_RUNBOOK.md) (executed 2026-05-18)
- [29_HERMESTV_DEPLOY_RUNBOOK.md](29_HERMESTV_DEPLOY_RUNBOOK.md) (sysadmin executes)

---

## Status of preceding gates (all green)

| Gate | Status | Evidence |
|---|---|---|
| Phase 1 audit complete + classified | ✅ | `docs/research/vps-phase-1-audit-RUN-2026-05-18T09-52-17Z.md` (gitignored) |
| Phase 1.5 PR merged | ✅ | `ac5ba8d` on main |
| `operator` user created | ✅ | uid 1001, sudo + docker groups, key auth verified |
| DNS A record `hermestv.daveai.tech` → VPS IP | ✅ | Cloudflare-proxied. `tv.daveai.tech` was later added as an additive short canonical (same IP, same nginx site) — both Host headers route to the same upstream. |
| Host nginx site config installed + reloaded | ✅ | `/etc/nginx/sites-enabled/hermestv.daveai.tech`, all 9 existing sites still 200. Its `server_name` now lists both `tv.daveai.tech` and `hermestv.daveai.tech`. |
| Re-audit as `operator@` | ✅ | `docs/research/vps-phase-1-audit-RUN-2026-05-18T10-50-45Z.md` (gitignored) |
| Re-audit shows only expected deltas | ✅ | new operator user + new nginx site only — no service changes |

---

## What Phase 2 deploys

The minimum stack to put HermesTV in front of the operator-installed host nginx:

| Container | Image | Host port | Why |
|---|---|---|---|
| `hermestv-vps-api` | local build of `services/hermes-tv-api/Dockerfile` | `127.0.0.1:3011` | API for the web + Tizen clients |
| `hermestv-vps-web` | local build of `apps/hermes-web-tv/Dockerfile` | `127.0.0.1:3080` | nginx serving the Vite-built SPA |

That's it. **The IPTV proxy bundle (Threadfin, m3u-editor, xtreamfilter) is NOT part of this Phase 2 deploy** — they ship in a later phase once provider credentials are settled. Phase 2 brings up the customer-facing stack only.

Both host ports bind to `127.0.0.1` only — never `0.0.0.0`. The host nginx site config at `/etc/nginx/sites-enabled/hermestv.daveai.tech` is the only public edge.

### Caddy: removed

The in-stack Caddy service is removed in this PR. Reasoning is in the compose-file comments and in [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md): host nginx already owns 80/443, Cloudflare terminates TLS at the edge in Flexible mode, origin is HTTP-only. A second reverse proxy would compete for ports and break the 10 existing daveai.tech sites.

The `Caddyfile` at `upstream/docker-vps/Caddyfile` is kept as a reference for a future migration scenario (operator decommissions host nginx), but it is not loaded by this stack.

### Frontend BASE_URL fix

`apps/hermes-web-tv/src/api/hermesApi.js` and `apps/hermes-web-tv/src/api/azureVoiceClient.js` had a hardcoded `http://hermestv.local` fallback for non-localhost hostnames. That worked for mDNS LAN tests but breaks under `hermestv.daveai.tech`. Both files now resolve to empty `BASE_URL` (same-origin) when the hostname is anything other than localhost / 192.168.x.x / hermestv.local. The host nginx proxies `/api/*` to the API container — no client-side cross-origin needed in production.

---

## Pre-deploy guards (operator confirms before `compose up`)

1. **`.env` file exists** at `/home/operator/hermestv/.env`, mode `0600`, owned by `operator:operator`. Minimum content:
   ```bash
   NODE_ENV=production
   PORT=3011
   # AZURE_TTS_KEY, JELLYFIN_API_KEY, provider URLs: optional — leave blank
   # for first deploy. The app falls back to mock + 202 TTS-stub responses.
   ```
   Real credentials are added in a later phase. Phase 2 brings up the shell.

2. **Repo cloned** at `/home/operator/hermestv/`:
   ```bash
   cd /home/operator
   git clone https://github.com/Ghenghis/HermesTV-Tizen-AI hermestv
   cd hermestv
   git rev-parse HEAD  # operator records the commit SHA for rollback
   ```

3. **Port preflight** — confirm 3011 and 3080 are still free (Phase 1.5 confirmed them; re-check just before deploy):
   ```bash
   ss -ltn "sport = :3011" | wc -l   # expect: 1 (header only — port free)
   ss -ltn "sport = :3080" | wc -l   # expect: 1
   ```

4. **Existing daveai.tech sites snapshot** — record status codes for rollback baseline:
   ```bash
   for s in daveai.tech diy. fleet. game. hermes. hermes3d. openhands. voice. www.; do
     code=$(curl -sI -o /dev/null -w "%{http_code}" "https://${s}daveai.tech/" 2>/dev/null || echo TIMEOUT)
     echo "${s}daveai.tech : ${code}"
   done
   ```
   Save the output. All 9 should be 200 before AND after deploy.

5. **Disk + RAM headroom** (Phase 1 baseline: 105 GB free, 12.5 GB RAM free):
   ```bash
   df -h /
   free -m
   ```
   If under 5 GB free disk or under 2 GB free RAM, abort — investigate before deploy.

---

## Deploy steps

See [29_HERMESTV_DEPLOY_RUNBOOK.md](29_HERMESTV_DEPLOY_RUNBOOK.md) for the exact commands. Summary:

1. As `operator@<vps>` SSH session
2. `cd /home/operator/hermestv && git pull` (idempotent)
3. `docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps build hermes-tv-api hermes-web-tv`
4. `docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps up -d hermes-tv-api hermes-web-tv`
5. Wait for `healthcheck: healthy` on both
6. Run acceptance tests (next section)
7. If pass: announce deploy done. If fail: rollback (also next section)

### Explicit out of scope (NOT in Phase 2)

- `docker compose up` for `threadfin`, `m3u-editor`, `xtreamfilter` — Phase 3
- Provider credentials (`APOLLO_*`, `XTREMEHD_*`) — Phase 3
- Azure TTS key — Phase 2.5 if Mom needs voice today, otherwise Phase 3
- Jellyfin integration — Phase 3 (workstation Jellyfin already runs; just needs API key + Tailscale route)
- LiteLLM / Anthropic / OpenAI keys — Phase 3
- HermesTV-side TLS — Phase 4 (if we ever move off Cloudflare-Flexible)

---

## Acceptance tests (pass = Phase 2 complete)

Run from workstation, NOT VPS. All must pass within 5 minutes of `compose up`:

```bash
# 1. The 9 existing daveai.tech sites still return 200
for s in daveai.tech diy.daveai.tech fleet.daveai.tech game.daveai.tech \
         hermes.daveai.tech hermes3d.daveai.tech openhands.daveai.tech \
         voice.daveai.tech www.daveai.tech; do
  curl -sI -o /dev/null -w "%{http_code} %{url_effective}\n" "https://$s/"
done

# 2. HermesTV health endpoint returns 200 (both canonical and alias must answer)
curl -sI https://tv.daveai.tech/health
curl -sI https://hermestv.daveai.tech/health
# expect: HTTP/1.1 200 OK on both
# body: {"status":"ok","service":"hermes-tv-api","version":"0.1.0", ...}

# 3. HermesTV /api/layouts returns 200 with 7 layouts
curl -s https://tv.daveai.tech/api/layouts | grep -c '"id"'
# expect: 7

# 4. HermesTV web app loads (returns HTML containing <div id="root">)
curl -s https://tv.daveai.tech/ | grep -c '<div id="root">'
# expect: 1

# 5. From a real browser, https://tv.daveai.tech/ renders the profile picker
#    Sherri + Dave appear, clicking either loads the main app, header shows "🎨 Look",
#    7 layouts available in the switcher modal. No console errors.
```

All five green = Phase 2 done.

---

## Rollback plan

If anything regresses on the public site OR HermesTV refuses to come up:

1. **Immediate stop (NOT `down`, NOT `-v`)**:
   ```bash
   docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps stop hermes-tv-api hermes-web-tv
   ```
   Containers stop but remain on disk; volumes intact.

2. **Verify the 9 existing sites recover** within 60 seconds. If not, the issue isn't HermesTV — investigate host nginx / firewall / Docker daemon. Do NOT remove the nginx site config; nginx serves whatever's at upstream regardless of whether our containers are up (502 from a stopped container is expected, but doesn't affect the other 10 sites).

3. **If HermesTV must be removed entirely** (worst case, with operator sign-off):
   ```bash
   docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps stop hermes-tv-api hermes-web-tv
   docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps rm -f hermes-tv-api hermes-web-tv
   # Do NOT remove volumes (-v) — there are none for these services anyway
   # Do NOT remove the nginx site — keeping it makes the next attempt faster
   ```

4. **Forbidden in rollback** (same hard rules as Phase 1.5):
   - ❌ `docker compose down -v` (would wipe Threadfin/m3u-editor/xtreamfilter volumes — they're prefixed `hermestv-vps-*` and could collide)
   - ❌ `docker system prune` (would touch Dave's stack)
   - ❌ `docker volume rm` anything not explicitly hermestv-vps-*
   - ❌ Any change to host nginx beyond removing `/etc/nginx/sites-enabled/hermestv.daveai.tech` (and that's only if you want a TOTAL revert)
   - ❌ Any change to ufw, iptables, systemd, /etc/

5. **Capture diagnostics before any further action**:
   ```bash
   docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps logs --tail=200 hermes-tv-api > /tmp/api.log
   docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps logs --tail=200 hermes-web-tv > /tmp/web.log
   ```
   Workstation pulls those logs via `scp` for offline analysis. Never paste them anywhere — they may contain stack traces with hostnames.

---

## What changes in this PR (`ops/phase-2-vps-deploy-plan`)

| File | Change |
|---|---|
| `upstream/docker-vps/VPS_COMPOSE.yml` | Add `127.0.0.1:3011` + `127.0.0.1:3080` ports; remove `caddy` service block + its volumes |
| `docker/vps/compose.yml` | Add `127.0.0.1:3011` port; remove `caddy` service block, `hermestv-vps-external` network, `caddy-data` / `caddy-config` volumes |
| `apps/hermes-web-tv/src/api/hermesApi.js` | `BASE_URL` fall-through is now `''` (same-origin) instead of `http://hermestv.local`; keeps localhost / 192.168.x.x dev paths |
| `apps/hermes-web-tv/src/api/azureVoiceClient.js` | Same `BASE_URL` fix |
| `docs/27_WEB_AND_TIZEN_MIRROR.md` | Diagram + prose updated: host nginx is the edge |
| `docs/28_VPS_PHASE_2_DEPLOY_PLAN.md` | **NEW** — this document |
| `docs/29_HERMESTV_DEPLOY_RUNBOOK.md` | **NEW** — operator's step-by-step |

### Files intentionally NOT changed
- `upstream/docker-vps/Caddyfile` — kept as reference for a future migration; commented in compose as "unused"
- `services/hermes-tv-api/.env.example` and `services/hermes-tv-api/src/index.js` — local-dev convention preserved
- `apps/hermes-web-tv/index.html` CSP — `'self'` already covers same-origin production fetches; no edit needed
- Host nginx site config (`/etc/nginx/sites-enabled/hermestv.daveai.tech`) — already installed in Phase 1.5

---

## Verification (in-repo, no VPS contact)

This PR is a **planning + config** PR. It does not deploy.

| Check | Command | Status |
|---|---|---|
| Web build still succeeds | `npm run build:web` | ✅ 75 modules, 277 KB, 74 KB gzipped |
| Schemas still pass | `node tools/schema-validate.js` | ✅ 61/61 PASS |
| Chatbot tests still pass | `node tools/test-chatbot-commands.js` (API running) | ✅ 40/40 PASS |
| Compose syntax valid | `docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps config --quiet` | (operator runs before deploy) |
| nginx site template still parses | `nginx -t` (on VPS) | ✅ done in Phase 1.5 |

---

## Hard guarantees of this PR (same as Phase 1.5)

- ❌ Did NOT SSH into the VPS for anything beyond Phase 1.5 sysadmin gates (already complete)
- ❌ Did NOT start, stop, restart, remove, or modify any existing container
- ❌ Did NOT touch host nginx config beyond the Phase 1.5 site install
- ❌ Did NOT touch `.env`, provider credentials, or any file under `/etc/`, `/var/`, `/home/` on VPS
- ❌ Did NOT `apt install/remove/purge`
- ❌ Did NOT run `docker compose up` (Phase 2 deploy is operator-only)

When this PR merges, the next action is the operator running [29_HERMESTV_DEPLOY_RUNBOOK.md](29_HERMESTV_DEPLOY_RUNBOOK.md).
