# 41 — Operator Credentials Runbook (Apollo / xTremeHD / iptv-org / Jellyfin)

**Status**: review-only. Commands below are executed by the operator on the VPS and on the workstation. **This repo does not run them.**

**Audience**: the human operator (Dave) holding the private IPTV vault on the workstation. Nobody else needs to read this file.

---

## 1. Purpose

This runbook is how the operator transfers IPTV provider credentials from their **local private vault** on the workstation to the **VPS `.env` file**, so that `/api/catalog` stops returning the 147-item seed catalog and starts returning real channel data from Threadfin (Apollo + xTremeHD), iptv-org, and Jellyfin.

The runbook is intentionally a "open file X, copy the field labeled Y, paste it into env var Z" procedure. No credential values appear in this repo — by design.

---

## 2. The local vault

The operator's IPTV credentials live on the workstation, **outside this repo**, at:

- **Path**: `G:\Github\DaveAI-IPTV\private\`
- **Files**:
  - `Apollo.txt` — primary Apollo IPTV provider details
  - `Apollo-XtremeHD.txt` — xTremeHD provider details (often bundled with Apollo)
  - `Dave-MoM-IPTV.txt` — combined notes covering Dave's and Sherri's IPTV
  - `iptv-DaveTV.md` — operator notes / changelog of provider details
  - `private.zip` — full bundle, in case the folder needs to be re-extracted on a fresh workstation

**Rules:**

- Never commit these files. The `DaveAI-IPTV/private/` path is in `.gitignore` and is on a separate disk path entirely from this repo.
- Treat them like passwords. Don't paste them into chat, screenshots, screen-shares, or this runbook.
- If the workstation is rebuilt, restore the vault from `private.zip` (kept on the operator's encrypted backup, not in git).

---

## 3. The VPS `.env` file

The production `.env` lives at:

```
/home/operator/hermestv/.env
```

- Mode: `0600` (read/write by the file owner only).
- Owner: `operator:operator`.
- Read by Docker Compose via the `env_file` directive in `upstream/docker-vps/VPS_COMPOSE.yml`.
- **Gitignored** — never appears in this repo.
- Schema reference: `services/hermes-tv-api/.env.example` is the authoritative list of variable names and what each one means. If a variable in the steps below is unclear, that file is the source of truth.

**Permissions check (run any time):**

```bash
ssh operator@<vps-host>
ls -l /home/operator/hermestv/.env
# expect: -rw------- 1 operator operator
```

If the mode is anything other than `0600` or the owner is anything other than `operator:operator`, **stop** and fix permissions before proceeding:

```bash
chmod 0600 /home/operator/hermestv/.env
chown operator:operator /home/operator/hermestv/.env
```

---

## 4. Step-by-step paste procedure

Do these in order. Each provider is independent — if the operator only wants one (say, just Jellyfin), skip the others. Empty/unset env vars cause the corresponding adapter to fall back gracefully.

### 4a. Threadfin (M3U proxy front for Apollo + xTremeHD)

Threadfin runs on the VPS as a sibling container. The IPTV adapters in `services/hermes-tv-api/lib/threadfinClient.js` talk to Threadfin over the internal docker network — never directly to the upstream Apollo / xTremeHD endpoints. The credentials go **into Threadfin's admin UI**, not into HermesTV's `.env`. HermesTV's `.env` only needs the **internal Threadfin URL** plus the **playlist names** the operator created.

**Step 1.** SSH to the VPS. Open the Threadfin admin UI in a browser, reachable **over Tailscale only**:

```
http://<vps-tailscale-ip>:34400/web
```

If the URL is unreachable, the admin port is correctly firewalled — start a Tailscale session from the workstation and retry. The admin UI must **never** be exposed on the public internet (see Safety reminders below).

**Step 2.** On the workstation, open `Apollo.txt` in the local vault folder. Identify these fields in that file:

- The **M3U URL** (often labeled `M3U URL`, `playlist`, or `get.php`)
- The **EPG / XMLTV URL** (often labeled `EPG`, `XMLTV`, or `epg.xml`)
- Optionally: Xtream Codes **host**, **port**, **username**, **password**, if the operator wants to use Threadfin's Xtream Codes mode instead of plain M3U

**Step 3.** In Threadfin admin UI → **Playlist** tab → **Add new** → paste the M3U URL from `Apollo.txt`. Name the playlist exactly `apollo` (lowercase). Save.

Repeat for the EPG / XMLTV URL → **XMLTV** tab → **Add new** → paste → save.

**Step 4.** Repeat **step 2 + step 3** using `Apollo-XtremeHD.txt`. Name the playlist exactly `xtremehd`. Save.

**Step 5.** Back in the VPS terminal, edit the .env:

```bash
ssh operator@<vps-host>
nano /home/operator/hermestv/.env
```

Add or update these lines (these are the destination variables — values shown are the **internal docker URLs only**, not the upstream Apollo URLs):

```
THREADFIN_URL=http://threadfin:34400
APOLLO_M3U_URL=http://threadfin:34400/m3u/apollo
APOLLO_EPG_URL=http://threadfin:34400/xmltv.xml
XTREMEHD_M3U_URL=http://threadfin:34400/m3u/xtremehd
XTREMEHD_EPG_URL=http://threadfin:34400/xmltv.xml
```

Save and exit. These values reference the **internal Threadfin container** — no real Apollo or xTremeHD URL appears in `.env`. That is the entire point of fronting them with Threadfin.

**Step 6.** Restart the HermesTV API container so it picks up the new env:

```bash
cd /home/operator/hermestv
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api
```

**Step 7.** Verify from the workstation:

```bash
curl -s -i https://tv.daveai.tech/api/catalog | head -20
```

Expected response headers:

- `X-Catalog-Source: threadfin-merged` (or `merged-with-jellyfin` if Jellyfin is also configured)
- Body `total` field ≥ 200 (Apollo + xTremeHD typically returns several hundred channels)

If the header still reports `seed-147` or `mock`, check the API logs:

```bash
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml logs --tail=100 hermes-tv-api
```

Common causes: Threadfin playlist name typo (`apollo` not `Apollo`), Threadfin still parsing the upstream M3U (give it 30 s), or `THREADFIN_URL` pointing at `localhost` instead of the container name `threadfin`.

---

### 4b. iptv-org (public, no credentials needed)

iptv-org is a public, free, no-auth catalog. The adapter in `services/hermes-tv-api/lib/iptvOrg.js` fetches and caches it locally. **No vault file is involved.**

**Step 1.** SSH to the VPS. Edit `/home/operator/hermestv/.env`. Set:

```
IPTV_ORG_ENABLED=true
```

Optional tuning (the defaults are fine):

```
IPTV_ORG_COUNTRIES=US,CA,GB
IPTV_ORG_CATEGORIES=news,sports,kids,movies
```

**Step 2.** Restart the API:

```bash
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api
```

**Step 3.** Wait ~30 seconds for the first cache fetch to land in `/var/cache/iptv-org/` inside the container. Subsequent fetches use the cache.

**Step 4.** Verify:

```bash
curl -s https://tv.daveai.tech/api/catalog | jq '._meta.provider_counts'
```

Expected: `"iptv-org": 250+` (or higher, depending on the country/category filters).

---

### 4c. Jellyfin (workstation library)

Jellyfin runs on Dave's workstation (the same box where the vault is). The VPS reaches it over Tailscale. The adapter is `services/hermes-tv-api/lib/jellyfin.js`.

**Step 1.** On the workstation, open Jellyfin in a browser → **Dashboard** → **API Keys** → **Add new**. Give it a memorable name like `hermestv-vps-2026`. Generate a **long-lived** key. Copy the key to clipboard.

**Step 2.** On the workstation, get the Tailscale IP and Jellyfin port:

```powershell
tailscale ip -4
```

Note the workstation's Tailscale IP (it starts with `100.`). The Jellyfin default port is `8096` (or whatever the operator configured locally).

**Step 3.** SSH to the VPS. Edit `/home/operator/hermestv/.env`. Set:

```
JELLYFIN_URL=http://<workstation-tailscale-ip>:8096
JELLYFIN_API_KEY=<paste-the-key-from-step-1>
```

Replace `<workstation-tailscale-ip>` with the actual Tailscale IP from step 2, and `<paste-the-key-from-step-1>` with the API key from step 1.

**Step 4.** Restart the API:

```bash
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api
```

**Step 5.** Verify:

```bash
curl -s -i https://tv.daveai.tech/api/catalog | grep -i X-Catalog-Source
```

Expected: `X-Catalog-Source: jellyfin` (if Jellyfin alone) or `X-Catalog-Source: merged-with-iptv-org` (if iptv-org is also on) or `X-Catalog-Source: threadfin-merged` (if all three are on — Jellyfin contributes the on-disk library and Threadfin contributes the live channels).

If verification fails, confirm Tailscale connectivity from the VPS:

```bash
ssh operator@<vps-host>
curl -sf -o /dev/null -w '%{http_code}\n' http://<workstation-tailscale-ip>:8096/System/Info/Public
# expect: 200
```

If that returns anything else, the VPS cannot reach the workstation over Tailscale and the upstream issue is in Tailscale ACLs, not in HermesTV.

---

### 4d. Azure TTS (already done in Phase 2.5 — for completeness)

Phase 2.5 set the Azure TTS credentials. They live in the same `/home/operator/hermestv/.env` file as:

```
AZURE_TTS_KEY=...
AZURE_TTS_REGION=...
```

The voice picker (`/api/tts/voices`) reports `source: 'azure_live'` with ~99–110 English voices when these are set. If the voice picker reports `source: 'fallback-static'`, the Azure credentials are missing or wrong — that is outside the scope of this runbook, see `docs/29_HERMESTV_DEPLOY_RUNBOOK.md`.

---

## 5. Verification checklist

After all four (or however many the operator configured) steps above are done, run through this end-to-end:

- [ ] **Health endpoint**:
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://tv.daveai.tech/health
  ```
  → `200`

- [ ] **Catalog endpoint reports the right merged sources**:
  ```bash
  curl -s -i https://tv.daveai.tech/api/catalog | grep -E 'X-Catalog-Source|total'
  ```
  → `X-Catalog-Source: threadfin-merged` (or whatever combination the operator enabled) and `total: 200+`

- [ ] **Browser smoke test**: visit `https://tv.daveai.tech` in a desktop browser. The header chip in the top right shows a green **"Live providers"** badge (or **"Jellyfin"** if Jellyfin is the only enabled adapter). It should NOT show **"Seed catalog"** or **"Mock"**.

- [ ] **Sherri profile / Mom Mode**: pick the **Sherri** profile from the profile picker. Mom Mode populates with **200+ channels**, not the 5-item mock and not the 147-item seed.

- [ ] **Voice command "show 4K"**: from the desktop browser or from the TV, say or type "show 4K". A rail of 4K channels appears (assuming Apollo / xTremeHD has 4K channels, which they typically do).

- [ ] **Voice command "show hallmark"**: returns a populated rail of Hallmark / family channels.

If any of these fail, see the per-step verification at the end of each `4a`/`4b`/`4c` section above.

---

## 6. Rollback

Each provider can be disabled independently by clearing its env vars and restarting the API container.

**Disable Threadfin (Apollo + xTremeHD)**:

```bash
ssh operator@<vps-host>
nano /home/operator/hermestv/.env
# Set these to empty strings (don't delete the lines — empty is the explicit "off" signal):
#   THREADFIN_URL=
#   APOLLO_M3U_URL=
#   APOLLO_EPG_URL=
#   XTREMEHD_M3U_URL=
#   XTREMEHD_EPG_URL=
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api
```

**Disable iptv-org**:

```bash
# Set IPTV_ORG_ENABLED=false (or empty) and restart:
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api
```

**Disable Jellyfin**:

```bash
# Set JELLYFIN_URL= and JELLYFIN_API_KEY= to empty strings and restart:
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api
```

**Full rollback (all providers off, back to seed catalog)**:

```bash
# Clear all of THREADFIN_URL, APOLLO_*, XTREMEHD_*, IPTV_ORG_ENABLED, JELLYFIN_URL, JELLYFIN_API_KEY:
docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api
curl -s -i https://tv.daveai.tech/api/catalog | grep X-Catalog-Source
# expect: X-Catalog-Source: seed-147
```

The 147-item seed catalog is intentionally a working fallback — the layout shells still render fully populated even with everything disabled, so a rollback never produces an empty UI.

---

## 7. Safety reminders

- The `.env` on the VPS is mode `0600` owned by `operator:operator`. **Do not** `chmod 644` it. **Do not** copy it into the repo. **Do not** include it in tarballs that get sent off the VPS.
- **Never** paste M3U URLs, Xtream Codes credentials, or Jellyfin API keys into git-tracked files in this repo. Use the operator's local vault (`G:\Github\DaveAI-IPTV\private\`) and the VPS `.env` only.
- **Never** share the Jellyfin API key over chat, email, or screen-share. If a key is accidentally exposed (e.g. shown in a screenshot), **immediately revoke it** in Jellyfin → Dashboard → API Keys → delete → generate a new one → re-paste into the VPS `.env`.
- The Threadfin admin UI on port `34400` must remain bound to `127.0.0.1` or the Tailscale interface only. **Never** expose port `34400` to the public internet. The `upstream/docker-vps/VPS_COMPOSE.yml` `ports:` mapping for Threadfin should bind to the Tailscale IP, not `0.0.0.0`.
- The vault files (`Apollo.txt`, `Apollo-XtremeHD.txt`, `Dave-MoM-IPTV.txt`, `iptv-DaveTV.md`, `private.zip`) must stay on disk only — they are explicitly outside the repo's directory tree, so `git status` from this repo will never see them. Don't move them inside this repo "just to make editing easier".
- If the operator workstation is decommissioned, the new workstation must restore the vault from the encrypted backup of `private.zip` — not from any other location, and definitely not from this repo.

---

## What this runbook does NOT do

- ❌ Does not contain any real Apollo, xTremeHD, Jellyfin, or Xtream Codes credential value
- ❌ Does not modify any code in this repo
- ❌ Does not run `docker compose up` from this repo — the operator runs that command manually on the VPS
- ❌ Does not touch the Threadfin docker container's own configuration files (those live inside the Threadfin volume; the admin UI is the supported interface)
- ❌ Does not cover Azure TTS setup (see `docs/29_HERMESTV_DEPLOY_RUNBOOK.md` Phase 2.5)
- ❌ Does not cover initial `operator` user creation (see `docs/22_CREATE_OPERATOR_USER_RUNBOOK.md`)

This is **only** the credential-paste procedure. Everything else is in other runbooks.
