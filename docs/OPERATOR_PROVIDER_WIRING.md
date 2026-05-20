# Operator provider wiring — Apollo Group + xTremeHD + Xtream Codes

Generated 2026-05-20 after wave-17.

This doc is the operator-side runbook for turning on the paid IPTV providers
on the production VPS (`tv.daveai.tech` / `hermestv.daveai.tech`). The code
ships ready to consume four real upstream lanes:

| Provider | Env vars on VPS | What you get |
|---|---|---|
| **iptv-org** (free) | `IPTV_ORG_ENABLED=true` | 300+ free public-CDN channels (NASA TV, France 24, Al Jazeera, …) |
| **Apollo Group** (paid M3U) | `APOLLO_M3U_URL` | The full Apollo channel lineup as an M3U playlist |
| **xTremeHD** (paid M3U) | `XTREMEHD_M3U_URL` | The full xTremeHD lineup |
| **Xtream Codes panel** (paid API) | `XTREAM_URL` + `XTREAM_USERNAME` + `XTREAM_PASSWORD` | live + VOD + series via player_api.php — **more reliable than M3U** |

All four lanes activate the moment the env vars are set + the container
restarts. They coexist; wave-13's cross-provider title merge collapses
duplicates (one ESPN card with three source variants).

> **Where to find values:** they're in your own notes / IPTV provider
> dashboards. This doc deliberately does NOT echo any value. The repo
> never contains a credential.

---

## 1. Verify what's set today (no values shown)

SSH to the VPS, then run:

```bash
docker exec hermestv-vps-api sh -c 'env | grep -E "^(APOLLO_M3U_URL|XTREMEHD_M3U_URL|XTREAM_URL|XTREAM_USERNAME|XTREAM_PASSWORD|IPTV_ORG_ENABLED)=" | sed -E "s/=.{4}.*/=<set>/"'
```

This prints `KEY=<set>` for keys that have a value, and prints nothing for
unset ones. The actual values never reach the terminal.

## 2. Set a key from a SecureString prompt (PowerShell, no echo)

On your Windows workstation (where the VPS SSH config is set up):

```powershell
$key = "XTREAM_URL"
$val = Read-Host "Enter value for $key" -AsSecureString
$plain = [System.Net.NetworkCredential]::new("", $val).Password
# Pipe over ssh; the value never appears in PowerShell history or process args
$plain | ssh operator@<vps-host> -p <vps-port> "cat >> /home/operator/hermestv/.env.providers.tmp && echo '$key written'"
Remove-Variable plain
```

Repeat for each of `XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD`,
`APOLLO_M3U_URL`, `XTREMEHD_M3U_URL`. Build the proper `.env.providers`
file by piping each line as `KEY=VALUE` instead of bare value:

```powershell
$kv = "XTREAM_URL=" + $plain
$kv | ssh operator@<vps-host> -p <vps-port> "cat >> /home/operator/hermestv/.env.providers"
```

Then on the VPS, point docker-compose at the env file and restart:

```bash
cd /home/operator/hermestv
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml \
  --env-file .env.providers up -d hermes-tv-api hermes-web-tv
```

## 3. Verify the catalog now reflects the new provider

From the VPS (or any browser that can reach Cloudflare):

```bash
curl -sf https://hermestv.daveai.tech/api/source-health | jq '.providers[] | {id, status, items_live}'
curl -sf https://hermestv.daveai.tech/api/catalog | jq '._meta'
```

Expected: each configured provider shows `status: "ok"` and a non-zero
`items_live`. The `_meta` block shows `source: "merged"` (or
`"providers"` if iptv-org isn't enabled) plus a non-zero count for the
provider you just wired (`m3u_count` / `xtream_count`).

## 4. Test one channel plays end-to-end

Pick a channel ID from the catalog and play it:

```bash
CHID=$(curl -sf https://hermestv.daveai.tech/api/catalog | jq -r '.catalog[0].id')
TICKET=$(curl -sf -X POST https://hermestv.daveai.tech/api/play \
  -H 'Content-Type: application/json' \
  -d "{\"item_id\":\"$CHID\",\"profile_id\":\"dave_tv\"}" | jq -r .ticket)
curl -sI "https://hermestv.daveai.tech/api/play/$TICKET/stream" | head -3
```

Expected: HTTP 200 (HLS proxy returning a rewritten m3u8) for paid
providers, or HTTP 302 (clean redirect) for iptv-org public streams.

## 5. Profiles get the same providers

Wave-13 collapses cross-provider duplicates and wave-16's
`Settings → Providers` tab lets each profile (Sherri / Dave) toggle which
sources they personally want visible. **Default is all-visible.** Mom-rule:
the toggle is opt-in per profile; the system never auto-hides for Sherri.

## 6. Rotate a credential

When a credential rotates, repeat step 2 with the new value and re-run the
docker compose up. The `.env.providers` file lives at
`/home/operator/hermestv/.env.providers` with `0600` perms and is the only
disk artifact carrying any secret. `.gitignore` blocks it from this repo.

## 7. Never put a value in this repo

The CI secret-scan (.github/workflows/ci.yml) greps every PR for shapes
matching `username=`, `/get.php?`, `/player_api.php`, `m3u_plus`, `xtream`,
etc. If you accidentally paste a credential into a tracked file the PR
will refuse to merge. That's intentional. Use `.env.providers` on the VPS.
