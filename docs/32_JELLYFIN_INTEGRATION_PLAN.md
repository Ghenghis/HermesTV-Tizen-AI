# 32 — Jellyfin Integration Plan

**Branch**: `ops/phase-3-plan`
**Predecessors**:
- [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md)
- [27_WEB_AND_TIZEN_MIRROR.md](27_WEB_AND_TIZEN_MIRROR.md)
- [28_VPS_PHASE_2_DEPLOY_PLAN.md](28_VPS_PHASE_2_DEPLOY_PLAN.md)
- [30_VPS_PHASE_3_DEPLOY_PLAN.md](30_VPS_PHASE_3_DEPLOY_PLAN.md) (sibling — IPTV containers)
- [31_PROVIDER_CREDENTIALS_VAULT.md](31_PROVIDER_CREDENTIALS_VAULT.md) (sibling — credential workflow)

This document is **planning only**. It does NOT deploy anything. It does NOT touch the VPS. It does NOT touch the workstation Jellyfin instance. The Jellyfin server itself was already configured by the operator before HermesTV existed; this plan only documents how HermesTV's VPS-side API will reach into it.

---

## Status of preceding gates

| Gate | Required state |
|---|---|
| Phase 2 stack live + healthy 24+ h | ✅ before Phase 3 / Jellyfin work starts |
| Workstation Jellyfin running and reachable from the workstation itself | ✅ pre-existing — Dave's setup |
| Workstation has Tailscale installed and authenticated to the same tailnet as the VPS | ✅ — operator confirms with `tailscale status` |
| VPS has Tailscale authenticated to the same tailnet | ✅ — confirmed in Phase 1 audit (v1.96.4, authenticated and running per [20_VPS_PHASE_1_AUDIT_FINDINGS.md §VPS profile](20_VPS_PHASE_1_AUDIT_FINDINGS.md)) |
| Tailscale ACL permits VPS → workstation:8096 | ⏳ **Operator confirms before Phase 3 deploy** (see "Pre-requisite" below) |

---

## Architecture

```
+------------------------------------------+
| Workstation (Dave's PC, Windows)         |
|   - Jellyfin server on port 8096         |
|   - Tailscale node, e.g. 100.x.y.z       |
|   - LAN-only otherwise — no port forward |
+----------------+-------------------------+
                 |
                 |  Tailscale WireGuard tunnel
                 |  (encrypted, ACL-gated)
                 |
+----------------v-------------------------+
| VPS (Hostinger, srv1376124)              |
|   - hermestv-vps-api container           |
|       on hermestv-vps-internal network   |
|       env: JELLYFIN_URL=http://100.x.y.z:8096
|            JELLYFIN_API_KEY=<server-side only>
|   - Tailscale node, e.g. 100.a.b.c       |
+------------------------------------------+
                 |
                 |  Cloudflare-Flexible HTTPS
                 |
+----------------v-------------------------+
| Mom's QN85 (Tizen)  /  Dave's browser    |
|   GET https://hermestv.daveai.tech/api/catalog
|   - Sees Jellyfin items in the response  |
|   - NEVER sees JELLYFIN_API_KEY          |
|   - NEVER calls Jellyfin directly        |
+------------------------------------------+
```

Key invariants:

1. **Jellyfin stays on the workstation.** We do NOT migrate Jellyfin to the VPS. Mom's library, transcoding profile, hardware decoding, all live on Dave's PC. The VPS only **reads metadata** from Jellyfin to assemble the catalog.
2. **The VPS reaches Jellyfin over Tailscale, never the public internet.** `JELLYFIN_URL` resolves to the workstation's tailnet IP (e.g., `100.x.y.z`), not its LAN IP, not its public IP, not a domain.
3. **The API key never leaves the VPS.** `hermes-tv-api` reads `JELLYFIN_API_KEY` from `/home/operator/hermestv/.env`, attaches it to outbound requests, and strips any credential-shaped value from `res.json` payloads via the existing credential guard middleware. The web app and Tizen app see metadata only.
4. **Playback streams flow client → workstation Jellyfin directly, NOT through the VPS.** The VPS returns a Jellyfin stream URL (which contains its own short-lived playback token); the client opens that URL. Stream bytes never traverse the VPS. The VPS is a metadata + UI host, not a media relay.
   - This means clients must also have Tailscale (Dave's workstation does; Mom's QN85 does not, today). For Mom's QN85, the workstation Jellyfin exposes a LAN-side address Mom's TV can reach (e.g., `http://192.168.x.x:8096`); the VPS uses Tailscale to fetch metadata, and the catalog response substitutes the LAN URL into `stream_url` fields. **This split-horizon detail is out of scope for the Phase 3 doc — captured here only as a known follow-on for Phase 4. Phase 3's Jellyfin work is metadata only.**

---

## Pre-requisite: Tailscale ACL check

Before Phase 3's Jellyfin-touching steps, the operator confirms the Tailscale ACL permits VPS → workstation:8096.

The ACL is configured in the Tailscale admin console (`login.tailscale.com/admin/acls`). The operator opens the policy file and confirms either:

- An explicit `accept` rule for the VPS's tailnet name → workstation's tailnet name on port 8096, OR
- An open ACL between VPS and workstation (a `*:*` rule scoped to the relevant tag/group) that implicitly covers port 8096

The operator does NOT change the ACL from this branch. If the ACL is missing, the operator edits it manually in the Tailscale console (separate from any HermesTV deploy), waits for the propagation (~30 s), and then runs the smoke check below.

### Smoke check from VPS

After the ACL is in place, from inside the operator SSH session on the VPS:

```
ssh operator@<vps-tailnet-name>
nc -vz <workstation-tailnet-ip> 8096
# Expect: "Connection to <workstation-tailnet-ip> 8096 port [tcp/*] succeeded!"

# Confirm Jellyfin actually answers HTTP at that endpoint
curl -sI http://<workstation-tailnet-ip>:8096/System/Info/Public
# Expect: HTTP/1.1 200 OK
```

If `nc` succeeds but `curl` fails: Jellyfin is not running on the workstation, or it is bound to localhost only. The operator fixes that on the workstation (Jellyfin Dashboard → Networking → Bind to 0.0.0.0 or the Tailscale interface specifically). No VPS-side change.

If `nc` fails: ACL is wrong. Fix the ACL in the Tailscale console. No VPS-side change.

If both succeed: ready to proceed to credential paste (covered in [31_PROVIDER_CREDENTIALS_VAULT.md](31_PROVIDER_CREDENTIALS_VAULT.md)).

---

## API endpoints HermesTV will call

`hermes-tv-api` is the only HermesTV component that talks to Jellyfin. The web app and Tizen app never call Jellyfin directly. The endpoints below are the Jellyfin server's documented HTTP API, used server-to-server with `JELLYFIN_API_KEY` in the `X-Emby-Token` header (or as a query parameter, depending on the route — see Jellyfin docs).

| Jellyfin endpoint | HermesTV usage | Notes |
|---|---|---|
| `GET /System/Info/Public` | **Health check.** No auth required. Returns server name + version. Used at API startup and per request to confirm Jellyfin is reachable before constructing a catalog response. | If this fails, fall back to mock fixtures and emit a `degraded` log line. |
| `POST /Users/AuthenticateByName` | **Skipped.** HermesTV uses an API key (`JELLYFIN_API_KEY`), not username/password. The auth-by-name flow is for interactive users and is not in scope. | Documented here only for completeness — to flag explicitly that we never call it. |
| `GET /Items` | **Catalog backbone.** Server returns the operator's library items (movies, episodes, shows). HermesTV maps the Jellyfin item shape onto its own `CatalogItem` schema (see `services/hermes-tv-api/src/routes/catalog.js`). | Heavy endpoint — page with `Limit=200&StartIndex=...`. Cache the response in-memory for 60 s to avoid hammering Jellyfin on every `/api/catalog` call. |
| `GET /Sessions/Playing` | **"Mom's now-watching" widget.** Returns currently active playback sessions; HermesTV filters by the user that maps to `mom_tv` and surfaces title + progress on the Dave dashboard. | Used by a small "what's Mom watching" panel. If the API returns 401 (key invalid), drop the widget silently — never error the whole catalog response. |
| `GET /Items/Latest` | **"Recently added" rail.** Optional but high-value for Mom's surface. | Same caching as `/Items`. |

All four real calls use `Authorization: MediaBrowser Token="<JELLYFIN_API_KEY>"` or `X-Emby-Token: <JELLYFIN_API_KEY>` per Jellyfin's documented patterns. **The API key never appears in any client-bound response, log line, or stack trace.** The existing credential guard middleware (`services/hermes-tv-api/src/middleware/credentialGuard.js`) already wraps `res.json` to scrub credential-shaped strings — Phase 3 implementation PR confirms the Jellyfin key matches the existing patterns.

### What HermesTV does NOT call

- `POST /Items/<id>/Playing` — playback session reporting. Clients handle this directly with their own session token (Phase 4 work).
- `GET /Videos/<id>/stream` — actual media bytes. Clients open this URL directly; the VPS never proxies it.
- Any `Library/...` admin endpoint — read-only catalog access is enough; we do not modify the operator's Jellyfin library from the VPS.

---

## Environment variables

Already declared in `upstream/docker-vps/.env.example` (placeholder values):

```
JELLYFIN_URL=http://workstation-tailscale-ip:8096
JELLYFIN_API_KEY=
```

Phase 3 operator action: replace `workstation-tailscale-ip` with the workstation's actual tailnet IP (e.g., `100.x.y.z`), and paste the API key obtained from `Jellyfin Dashboard → Advanced → API Keys → +`. See [31_PROVIDER_CREDENTIALS_VAULT.md §Where the operator obtains each credential / Jellyfin](31_PROVIDER_CREDENTIALS_VAULT.md).

No new env vars are added in this plan PR. The Phase 3 implementation PR may add `JELLYFIN_CACHE_TTL_SECONDS` and `JELLYFIN_REQUEST_TIMEOUT_MS` with sensible defaults baked into code, but those are not credentials and not in scope here.

---

## Acceptance test

Once both `JELLYFIN_URL` and `JELLYFIN_API_KEY` are populated in `/home/operator/hermestv/.env` and `hermes-tv-api` is restarted, the acceptance test for this integration is:

```
# From the workstation, NOT from the VPS
curl -s https://hermestv.daveai.tech/api/catalog?profile_id=dave_tv \
  | python3 -c "import sys,json; d=json.load(sys.stdin); items=d.get('catalog',[]); jf=[i for i in items if i.get('source')=='jellyfin']; print('total=', len(items), 'jellyfin=', len(jf), 'mock_meta=', d.get('_meta',{}).get('mock_data', None))"
```

Expected, with both env vars populated and a real workstation Jellyfin library:

- `total` > the mock count (5 items today)
- `jellyfin` ≥ 1 — at least one item with `source: "jellyfin"`
- `mock_meta` is `False` or absent

Expected boot log line on `hermes-tv-api`:

```
[HermesAPI] env: ... jellyfin=true ...
```

(No `degraded: jellyfin missing` line.)

If `mock_meta=True` despite both env vars being populated:
1. Check `docker logs hermestv-vps-api --tail=50` for an outbound HTTP error (timeout, 401, connection refused).
2. Re-run the VPS-side `curl -sI http://<workstation-tailnet-ip>:8096/System/Info/Public` smoke check.
3. If the Jellyfin call succeeds from the VPS shell but the API still returns mock data, the issue is in the API container's resolver — file an issue with the failing log excerpt (key value scrubbed).

---

## Rollback

The Jellyfin integration is **safely toggleable** by env var alone.

```
# To temporarily disable Jellyfin (catalog falls back to mock):
nano /home/operator/hermestv/.env
# Comment out or blank ONE of JELLYFIN_URL or JELLYFIN_API_KEY (blanking either is sufficient)
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps restart hermes-tv-api
# Confirm:
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps logs --tail=20 hermes-tv-api | grep -E '\[HermesAPI\] (env|degraded):'
# Expect: env: ... jellyfin=false ...
#         degraded: jellyfin missing → catalog falls back to mock fixtures
```

The web app and Tizen app see no error — `/api/catalog` keeps returning 200 with the in-repo mock catalog (`services/hermes-tv-api/src/routes/catalog.js` already serves this when the upstream is unreachable). Mom sees the same UI; the catalog rows are the synthetic 5-item set instead of her real library. **This is intentional design** — Mom never sees a "Jellyfin offline" error screen.

When the integration is fixed, paste the real values back, restart, confirm the log line flips to `jellyfin=true`. No re-deploy of any container needed beyond `restart`.

### Rollback hard rules

- ❌ Do NOT `stop` or `rm -f` the `hermes-tv-api` container to "rollback Jellyfin" — that takes the whole site down. Use the env-var toggle above instead.
- ❌ Do NOT `docker compose down -v` — wipes nothing related to Jellyfin (the workstation Jellyfin volume is on the workstation, not the VPS), but the rule still stands for habit reasons.
- ❌ Do NOT revoke `JELLYFIN_API_KEY` in the Jellyfin dashboard while it is still pasted into `.env` and `hermes-tv-api` is running — the API container will start emitting 401s on every catalog refresh until it is restarted or the key is rotated. Coordinate the revoke with a paste-the-replacement + restart.
- ❌ Do NOT change the workstation Jellyfin port from 8096 without updating `JELLYFIN_URL` simultaneously.
- ❌ Do NOT add the workstation's LAN IP to `JELLYFIN_URL` — the VPS reaches the workstation **over Tailscale only**.

---

## Out of scope

Explicitly NOT covered by this plan:

- ❌ **Client-side Jellyfin playback.** The VPS returns metadata + a stream URL pointing at the workstation Jellyfin. The web player (`apps/hermes-web-tv/`) and Tizen player (`apps/hermes-tv-tizen/`) open that URL directly. The client-side player implementation is a Phase 4 concern, not Phase 3, and is covered in `apps/hermes-web-tv/src/player/*` (already scaffolded). The split-horizon URL substitution (workstation tailnet IP for the VPS, workstation LAN IP for Mom's TV) is also Phase 4 — Phase 3 returns the tailnet URL only.
- ❌ **Migrating Jellyfin to the VPS.** Jellyfin stays on the workstation. The VPS does not have the GPU for transcoding, does not have Mom's library mounted, and would multiply the data movement (workstation → VPS → client). Out of architecture.
- ❌ **Multi-user Jellyfin auth.** HermesTV uses a single server-side API key. Per-user Jellyfin sessions for Mom and Dave are out of scope. The `mom_tv` / `dave_tv` profile distinction in the HermesTV UI is profile-only; it does not currently map to a Jellyfin user.
- ❌ **Tailscale ACL editing from this PR.** Operator edits the ACL manually in the Tailscale console if it needs adjustment. We do not commit a Tailscale policy file or any automation that would.
- ❌ **Workstation Jellyfin upgrades, plugins, library scans, or metadata cleanup.** Operator-managed.
- ❌ **TLS between VPS and workstation.** Tailscale's WireGuard tunnel already encrypts the link. The Jellyfin HTTP endpoint stays HTTP over the Tailscale interface — no certificate setup needed inside the tunnel.
- ❌ **Catching workstation downtime gracefully.** Today, if the workstation sleeps or reboots, `hermes-tv-api` calls to Jellyfin will time out per request. The catalog response falls back to mock fixtures during the outage, which is the right behaviour. A future Phase 4 improvement is to cache the last successful Jellyfin response longer (e.g., 5 minutes) and serve from cache during transient outages without flipping to mock. Out of Phase 3 scope.

---

## What changes in this PR (`ops/phase-3-plan`)

This doc is plan-only. It does NOT add code, modify env files, or change any container.

| File | Change |
|---|---|
| `docs/32_JELLYFIN_INTEGRATION_PLAN.md` | **NEW** — this document |

Files intentionally NOT touched:

- `upstream/docker-vps/.env.example` — `JELLYFIN_URL` and `JELLYFIN_API_KEY` already present with empty/placeholder values from Phase 1.5.
- `services/hermes-tv-api/src/routes/catalog.js` — Jellyfin resolver lands in the Phase 3 implementation PR. Today's file serves the in-repo mock catalog; that is exactly the fallback the architecture relies on.
- `apps/hermes-web-tv/` and `apps/hermes-tv-tizen/` — client code makes no Jellyfin assumptions; same-origin `/api/catalog` continues to work whether the upstream is real or mocked.
- The workstation Jellyfin instance — operator-managed, untouched by this PR.

---

## Hard guarantees of this PR (same as Phase 1.5, Phase 2, sibling docs 30 + 31)

- ❌ Did NOT SSH into the VPS
- ❌ Did NOT touch the workstation Jellyfin instance
- ❌ Did NOT add or modify any credential (Jellyfin or otherwise)
- ❌ Did NOT modify `.env`, `.env.example`, or any compose file
- ❌ Did NOT modify any Tailscale ACL
- ❌ Did NOT modify host nginx, Caddy (none present), ufw, iptables, systemd, or `/etc/`, `/var/`, `/home/` on either machine
- ❌ Did NOT `apt install/remove/purge`
- ❌ Did NOT run `docker compose up` or any other write-mode docker command
- ❌ Did NOT modify any of the 9 daveai.tech nginx sites
- ❌ Did NOT change the Phase 2 stack behaviour

When this PR merges, the next gate is the Phase 3 implementation PR (compose edits + the resolver code that consumes `JELLYFIN_URL` + `JELLYFIN_API_KEY`). The operator's credential paste happens after that PR merges, never on this branch.
