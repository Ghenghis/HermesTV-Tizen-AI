# 31 — Provider Credentials Vault

**Branch**: `ops/phase-3-plan`
**Predecessors**:
- [20_VPS_PHASE_1_AUDIT_FINDINGS.md](20_VPS_PHASE_1_AUDIT_FINDINGS.md)
- [26_VPS_SECRETS_VAULT.md](26_VPS_SECRETS_VAULT.md) (architectural overview — this doc is the operational follow-up)
- [28_VPS_PHASE_2_DEPLOY_PLAN.md](28_VPS_PHASE_2_DEPLOY_PLAN.md)
- [30_VPS_PHASE_3_DEPLOY_PLAN.md](30_VPS_PHASE_3_DEPLOY_PLAN.md) (sibling — IPTV containers)
- [32_JELLYFIN_INTEGRATION_PLAN.md](32_JELLYFIN_INTEGRATION_PLAN.md) (sibling — Jellyfin contract)

This document is **planning only**. It does NOT add credentials anywhere. It does NOT touch the VPS. The credential values themselves are entered by the operator on the VPS at deploy time, into a `.env` file that is gitignored and never touched from this branch.

---

## Status of preceding gates

| Gate | Required state |
|---|---|
| Phase 2 stack live + healthy 24+ h | ✅ before Phase 3 starts |
| `/home/operator/hermestv/.env` exists, mode `0600`, owner `operator:operator` | ✅ created in Phase 2 (currently with placeholder values per [29_HERMESTV_DEPLOY_RUNBOOK.md §Step 2](29_HERMESTV_DEPLOY_RUNBOOK.md)) |
| `.gitignore` already excludes `.env` | ✅ confirmed in repo root |
| Operator has SSH access via Tailscale | ✅ confirmed in Phase 1.5 |
| Operator has personal offline encrypted vault (Bitwarden / 1Password) | ✅ — sole rotator is Ghenghis per [26_VPS_SECRETS_VAULT.md §5](26_VPS_SECRETS_VAULT.md) |

If the operator does not have an offline encrypted vault, do NOT populate any keys. Set the vault up first.

---

## Why this doc exists alongside doc 26

[26_VPS_SECRETS_VAULT.md](26_VPS_SECRETS_VAULT.md) defines the **architecture** — the inventory table, the location of `.env`, validation rules, rotation policy. It was written when the VPS was still being designed in the abstract.

This doc (31) is the **Phase 3 operational mapping** — for each credential the Phase 3 deploy actually needs, where the operator obtains it from the provider, how it lands in `.env`, what the API boot log should look like once it is present, and how often to rotate. It is meant to be read alongside the Phase 3 runbook (sibling PR after this one), not in place of doc 26.

When there is a conflict, doc 26 is the architectural source of truth; this doc is the working-time operator guide.

---

## Credential inventory for Phase 3

| Key | Required? | Lives in | Used by | Without it, fallback |
|---|---|---|---|---|
| `APOLLO_M3U_URL` | Required for live channels | `/home/operator/hermestv/.env` **AND** Threadfin admin UI (one source of truth for the live system is Threadfin's volume) | `hermes-tv-api` → Threadfin via Docker DNS; Threadfin pulls the M3U directly | API returns mock catalog only |
| `APOLLO_EPG_URL` | Required for EPG grid | `.env` + Threadfin admin UI | `hermes-tv-api` `/api/epg-grid` route | EPG grid returns mock fixtures |
| `APOLLO_USERNAME` | Required by some Apollo plans | `.env` + Threadfin admin UI | Threadfin upstream auth | M3U URL may include token instead — see provider docs |
| `APOLLO_PASSWORD` | Required by some Apollo plans | `.env` + Threadfin admin UI | Threadfin upstream auth | Same as above |
| `XTREMEHD_M3U_URL` | Required for XtremeHD channels | `.env` + Threadfin admin UI | `hermes-tv-api` → Threadfin; Threadfin pulls directly | XtremeHD channels missing from catalog |
| `XTREMEHD_EPG_URL` | Required for XtremeHD EPG | `.env` + Threadfin admin UI | EPG grid | XtremeHD shows as blank rows in the grid |
| `XTREMEHD_USERNAME` | Required by some XtremeHD plans | `.env` + Threadfin admin UI | Threadfin upstream auth | M3U URL may include token instead |
| `XTREMEHD_PASSWORD` | Required by some XtremeHD plans | `.env` + Threadfin admin UI | Threadfin upstream auth | Same as above |
| `JELLYFIN_URL` | Required for Jellyfin catalog | `.env` only | `hermes-tv-api` `/api/catalog` and `/api/providers` | Catalog falls back to in-repo mock; see [32_JELLYFIN_INTEGRATION_PLAN.md](32_JELLYFIN_INTEGRATION_PLAN.md) |
| `JELLYFIN_API_KEY` | Required for Jellyfin catalog | `.env` only | Same | Same |
| `ANTHROPIC_API_KEY` | **Optional** | `.env` only | Chatbot validator backbone — upgrades unfamiliar phrasing handling | Chatbot uses the existing local pattern matcher; all 22 commands already work (see [23_CHATBOT_COMMAND_REFERENCE.md](23_CHATBOT_COMMAND_REFERENCE.md)) |
| `OPENAI_API_KEY` | **Optional** (fallback to Anthropic) | `.env` only | Chatbot validator backbone — fallback if Anthropic is unavailable | Same as Anthropic missing |
| `AZURE_TTS_KEY` | **Optional** (but enables Mom's voice) | `.env` only | `services/hermes-tv-api/src/routes/tts.js` `azureConfigured()` gate | TTS endpoints return HTTP 202 stub; web app and Tizen app render normally, only audio is silent — see [26_VPS_SECRETS_VAULT.md §8](26_VPS_SECRETS_VAULT.md) |
| `AZURE_TTS_REGION` | Required with `AZURE_TTS_KEY` | `.env` only | Same as above | Same as above |

> **Two-source-of-truth pattern for IPTV providers.** Threadfin stores the M3U URL inside its own volume (`hermestv-vps-threadfin-data`), entered through the admin UI. We additionally write the same URL into `/home/operator/hermestv/.env` so the `hermes-tv-api` boot log can record presence/absence (see "Validation" below) and so a future implementation pass can verify Threadfin is configured before serving non-mock data. The operator must re-enter the URL if it ever changes — once in Threadfin, once in `.env`. There is no automatic propagation. This is intentional: a misconfigured automation between an encrypted volume and a plaintext env file is a bigger risk than the operator copy-pasting once per rotation.

---

## Where the operator obtains each credential

> **No specific portal URLs are recorded in this repo** — provider portals change, and a stale link encourages bad habits. The operator follows the provider's current documented login flow. The list below is the workflow class, not the click path.

### Apollo Group

- Operator logs into the Apollo customer portal with their existing subscriber username + password.
- Locates the "M3U URL" / "Playlist URL" / "Live TV URL" section. Different plans show this in different places — billing tab, account tab, or a dedicated "Stream URLs" page.
- Locates the matching "EPG URL" / "XMLTV URL" / "Guide URL".
- For plans that use plain URL tokens (the URL ends in `?token=<long string>`), the URL itself is the credential and `APOLLO_USERNAME` / `APOLLO_PASSWORD` are left blank.
- For plans that require HTTP Basic auth or Xtream API auth, the operator captures the username + password the portal displays.
- The operator does NOT screenshot the page, does NOT paste the URL into chat, does NOT email it, does NOT post in a Discord. Copy → paste → into `.env` → save → close clipboard manager.

### XtremeHD

- Same workflow class as Apollo, against the XtremeHD customer portal.
- Some XtremeHD tiers expose Xtream Codes API instead of plain M3U. In that case `xtreamfilter` becomes useful (see [30_VPS_PHASE_3_DEPLOY_PLAN.md](30_VPS_PHASE_3_DEPLOY_PLAN.md)). The Xtream Codes URL is of the form `http://<host>:<port>/get.php?username=<u>&password=<p>&type=m3u_plus` — that whole URL is the credential.

### Jellyfin

- Operator opens the workstation Jellyfin web UI (locally on the workstation — Jellyfin stays on the workstation, never moves to the VPS; see [32_JELLYFIN_INTEGRATION_PLAN.md](32_JELLYFIN_INTEGRATION_PLAN.md)).
- Dashboard → Advanced → API Keys → "+" → name it `hermestv-vps-api` → copy the generated key.
- `JELLYFIN_URL` is the workstation's Tailscale IP, like `http://100.x.y.z:8096` (NOT the LAN IP — the VPS reaches the workstation via Tailscale only).

### Anthropic (optional)

- Operator logs into `console.anthropic.com` with the account that owns the API budget.
- Settings → API Keys → Create Key → name it `hermestv-vps`, scope it to the model the chatbot uses (Haiku 4.5 today per `LLM_DEFAULT_MODEL` in `.env.example`).
- Copy the key (Anthropic shows it once — paste into `.env` immediately or back out and regenerate).
- Set a usage cap on the key in the Anthropic console as a belt-and-braces hedge.

### OpenAI (optional, fallback)

- Operator logs into `platform.openai.com`.
- API Keys → Create new secret key → scope to chat completions only.
- Copy → paste into `.env`. Set a usage cap.
- Skip entirely if `ANTHROPIC_API_KEY` is populated and the operator is happy with single-provider posture.

### Azure Cognitive Services — TTS

- Operator logs into the Azure portal with their subscription account.
- Speech service → Keys and Endpoint → Key 1 → copy. Note the region (e.g., `eastus`).
- Set `AZURE_TTS_KEY=<key>` and `AZURE_TTS_REGION=<region>` in `.env`.
- Without this pair, the chatbot still works in text-only mode (Aria et al. just do not produce audio — see `azureConfigured()` check in `services/hermes-tv-api/src/routes/tts.js`).

---

## How credentials land in `/home/operator/hermestv/.env`

The file already exists from Phase 2 (created with placeholders per [29_HERMESTV_DEPLOY_RUNBOOK.md §Step 2](29_HERMESTV_DEPLOY_RUNBOOK.md)). Phase 3 only updates it; the file is never recreated.

```
# On the VPS, as operator
cd /home/operator/hermestv
ls -la .env
# Expect: -rw------- 1 operator operator <bytes> ... .env

# Edit. The operator MUST do this alone — never on a shared screen, never
# over screen-sharing, never paired. Mode 0600 stays enforced.
nano .env
# (paste values into the keys listed below — see template)

# Verify perms unchanged
ls -la .env
# Expect: -rw------- 1 operator operator <bytes> ... .env

# Restart the API container so it re-reads .env via env_file
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  restart hermes-tv-api

# Tail one line of the boot log to confirm key presence (see Validation)
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  logs --tail=20 hermes-tv-api | grep '\[HermesAPI\] env:'
```

### Template of the populated `.env` (placeholders, never real values in this repo)

```
NODE_ENV=production
PORT=3011
PUBLIC_HOST=tv.daveai.tech

# Azure TTS — paste from Azure portal → Speech service → Keys
AZURE_TTS_KEY=<paste-here-and-only-here>
AZURE_TTS_REGION=eastus

# Workstation Jellyfin over Tailscale — see doc 32
JELLYFIN_URL=http://<workstation-tailscale-ip>:8096
JELLYFIN_API_KEY=<paste-here-and-only-here>

# Apollo Group — see provider portal workflow above
APOLLO_M3U_URL=<paste>
APOLLO_EPG_URL=<paste>
APOLLO_USERNAME=<paste-or-blank>
APOLLO_PASSWORD=<paste-or-blank>

# XtremeHD — see provider portal workflow above
XTREMEHD_M3U_URL=<paste>
XTREMEHD_EPG_URL=<paste>
XTREMEHD_USERNAME=<paste-or-blank>
XTREMEHD_PASSWORD=<paste-or-blank>

# Internal Docker DNS — never changes, never sensitive
THREADFIN_URL=http://threadfin:34400
M3U_EDITOR_URL=http://m3u-editor:4200
XTREAMFILTER_URL=http://xtreamfilter:3456

# Optional — see "LLM keys" section
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
LLM_DEFAULT_MODEL=claude-haiku-4-5-20251001

# CORS — operator confirms the public domain matches the host nginx site.
# Both canonical (tv.daveai.tech) and alias (hermestv.daveai.tech) must be
# accepted so any client typing either Host header succeeds.
EXTRA_CORS_ORIGINS=https://tv.daveai.tech,https://hermestv.daveai.tech
PUBLIC_DOMAIN=tv.daveai.tech
ACME_EMAIL=admin@daveai.tech
```

### Forbidden in this step

- ❌ Pasting any of the above values into a chat window, PR description, commit message, issue, screenshot, or shared screen.
- ❌ Emailing the values to yourself.
- ❌ Making `.env` world-readable (`chmod 644` would expose it to every container that mounts `/home/operator/hermestv/` — none do today, but the rule stands).
- ❌ Adding `.env` to git. The repo's `.gitignore` already excludes it; if `git status` ever shows `.env` as untracked but not ignored, **stop** and fix the `.gitignore` before proceeding.
- ❌ Storing the file outside `/home/operator/hermestv/`. The operator's encrypted offline vault keeps a backup copy; that is the only other location.
- ❌ Using the same `.env` for dev and production. Local dev uses `services/hermes-tv-api/.env` with placeholders; only the VPS file has real values.

---

## Validation

On boot, `services/hermes-tv-api/src/index.js` already prints a structured request log per [doc 26 §7](26_VPS_SECRETS_VAULT.md). Phase 3 implementation will add (or confirm) a single line summarising key presence without echoing values:

```
[HermesAPI] env: azure=true jellyfin=true apollo=true xtremehd=true anthropic=false openai=false
```

The flags come from presence checks only:

| Flag | Definition |
|---|---|
| `azure` | `!!(process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION)` (existing `azureConfigured()` in `routes/tts.js`) |
| `jellyfin` | `!!(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY)` |
| `apollo` | `!!process.env.APOLLO_M3U_URL` (URL is the minimum; auth fields are plan-dependent) |
| `xtremehd` | `!!process.env.XTREMEHD_M3U_URL` |
| `anthropic` | `!!process.env.ANTHROPIC_API_KEY` |
| `openai` | `!!process.env.OPENAI_API_KEY` |

If any flag is `false`, a second line emits to declare the degraded path:

```
[HermesAPI] degraded: jellyfin missing → catalog falls back to mock fixtures
[HermesAPI] degraded: anthropic missing → chatbot falls back to local pattern matcher
[HermesAPI] degraded: azure missing → /api/tts/* returns 202 stub
```

The code MUST NOT log:
- key values
- key prefixes or suffixes (no "key starts with sk-ant-..." messages)
- key lengths
- outbound HTTP requests with keys in headers — request logger MUST sanitise `Authorization`, `x-api-key`, and any `?token=`/`?password=` query string before writing the log line

After paste + restart, the operator runs:

```
docker compose -f upstream/docker-vps/VPS_COMPOSE.yml -p hermestv-vps \
  logs --tail=20 hermes-tv-api | grep -E '\[HermesAPI\] (env|degraded):'
```

Expected (with all keys populated):

```
[HermesAPI] env: azure=true jellyfin=true apollo=true xtremehd=true anthropic=true openai=false
```

If a key shows `=false` but the operator just pasted it: the `env_file` directive on the compose service points at the wrong file, or the file was edited but the container was not restarted, or the operator forgot to save (`Ctrl+O` in nano). Re-check and re-restart. Do NOT echo the value to confirm.

---

## Rotation cadence

Rotations are scheduled per-credential. The operator (Ghenghis is the sole rotator per [26_VPS_SECRETS_VAULT.md §5](26_VPS_SECRETS_VAULT.md)) sets calendar reminders.

| Credential | Cadence | Triggered by |
|---|---|---|
| `AZURE_TTS_KEY` | 90 days | Calendar reminder OR suspected compromise OR rate-limit anomaly in Azure portal |
| `JELLYFIN_API_KEY` | Yearly | Calendar reminder OR workstation re-image OR Jellyfin major upgrade OR suspected compromise |
| `APOLLO_M3U_URL` + creds | When provider forces it OR yearly check-in | Provider notice email OR subscription renewal OR suspected compromise (e.g., M3U URL appearing in a third party's playlist) |
| `XTREMEHD_M3U_URL` + creds | Same as Apollo | Same |
| `ANTHROPIC_API_KEY` | 180 days | Calendar reminder OR Anthropic console usage anomaly OR compromise |
| `OPENAI_API_KEY` | 180 days | Same |

Rotation procedure for any key:

1. Operator opens the relevant provider portal (Azure / Jellyfin / Apollo / XtremeHD / Anthropic / OpenAI).
2. Generate the new key/URL. Do NOT revoke the old one yet.
3. Paste the new value into `/home/operator/hermestv/.env` (and into Threadfin's admin UI for the M3U / EPG URLs).
4. `docker compose ... restart hermes-tv-api` (and `restart threadfin` if M3U URL changed).
5. Verify the boot log still shows the flag as `true`.
6. Run a quick smoke test against `/api/catalog`, `/api/tts/voices` (or whichever endpoint the rotated key powers).
7. Once smoke test passes, **then** revoke the old key in the provider portal.
8. Update the operator's offline encrypted vault entry with the new value + rotation date + reason.

Never revoke first, paste later. The boot log line is the live check.

---

## LLM keys — when to populate

`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are **optional**. The chatbot already handles all 22 commands documented in [23_CHATBOT_COMMAND_REFERENCE.md](23_CHATBOT_COMMAND_REFERENCE.md) via local pattern matching in `services/hermes-tv-api/src/routes/uiCommand.js`. No network calls.

The LLM keys upgrade two specific cases:

1. **Unfamiliar phrasing** — when a user (especially Mom) says something close to a known command but in a way the pattern matcher does not anticipate. The LLM validator can nudge it into one of the 22 canonical commands.
2. **Conversational ambiguity** — "no, the other one" / "go back to that movie" / "what was that thing you said?" — the LLM can use short context to disambiguate.

If `ANTHROPIC_API_KEY` is populated, the API uses Anthropic (default model from `LLM_DEFAULT_MODEL=claude-haiku-4-5-20251001`).
If only `OPENAI_API_KEY` is populated, the API falls back to OpenAI.
If both are populated, Anthropic is preferred — OpenAI is used only if Anthropic returns a 5xx or times out.
If neither is populated, the chatbot stays on the local pattern matcher. **This is not a regression** — all 22 commands still work, and Mom never sees a "feature disabled" message. The chatbot is just less forgiving of phrasing that does not match a known pattern.

Recommendation: leave Anthropic + OpenAI **blank** through the first week of Phase 3. If Mom or Dave reports phrasing the chatbot misses, populate `ANTHROPIC_API_KEY` then. Avoid pre-emptive key spread.

---

## Azure TTS — Phase 2.5 or Phase 3?

The user has two reasonable paths:

### Path A — Azure key as a separate Phase 2.5 step

Add `AZURE_TTS_KEY` + `AZURE_TTS_REGION` to `/home/operator/hermestv/.env` immediately after Phase 2 lands, **before** Phase 3 starts. Mom gets her voice the moment the Phase 2 site is browsable. The Azure rotation cadence kicks in immediately.

- Pro: Mom's voice works day 1 of public access.
- Pro: The TTS rollout is independent of any IPTV/Jellyfin work — if those slip, voice still ships.
- Con: One more deploy event (restart `hermes-tv-api` after the paste).

### Path B — Azure key rolled into Phase 3

Postpone the Azure paste until the Phase 3 deploy batch (alongside IPTV + Jellyfin keys), so the operator only restarts `hermes-tv-api` once with all keys present.

- Pro: One restart, one validation pass.
- Con: Mom's voice is silent for the 24+ hours of Phase 2 stability soak.

**Default plan: Path A (Phase 2.5).** Mom's voice is a higher-impact, lower-risk addition than any IPTV piece. The TTS code path is already mature (`azureConfigured()` gate is implemented, voice catalog tested, web app + Tizen app already plumb audio output). Adding the key is a 30-second operator action with an obvious smoke test (Aria speaks the sample line).

If the operator prefers Path B, no code change is needed — just hold the Azure key in the offline vault until the Phase 3 paste.

---

## What never goes in this repo

- ❌ Any real M3U URL — not from Apollo, not from XtremeHD, not from any other provider, not "for testing", not even commented-out.
- ❌ Any password — provider, Jellyfin, Azure subscription, none.
- ❌ Any API key or token — Anthropic, OpenAI, Azure, Jellyfin, none.
- ❌ Any Tailscale auth key.
- ❌ Any HTTP `Authorization` header with a real value.
- ❌ Any commit message, PR description, or doc that quotes part of a key "to identify which one it was".
- ❌ Any test fixture that contains a real provider URL — fixtures use `https://hermestv.local/...` or `apl-live-espn` style synthetic IDs (see `services/hermes-tv-api/src/routes/catalog.js`).
- ❌ Any log file that includes the request body of a `/api/setup/*` route (those are the only routes that ever touch credentials, and they MUST not be logged — see `services/hermes-tv-api/src/middleware/credentialGuard.js`).

If a real credential is ever accidentally committed:

1. Rotate the credential in the provider portal **immediately**.
2. Do NOT just delete the file in a follow-up commit — the value is in git history.
3. Use `git filter-repo` or BFG Repo-Cleaner to scrub the value from history.
4. Force-push the cleaned branch (this is the **one** exception to the "never force-push to main" rule, and only after operator sign-off).
5. Audit GitHub Insights → Traffic for the affected file path.
6. Note the incident in the operator's offline vault.

---

## What changes in this PR (`ops/phase-3-plan`)

This doc is plan-only. It does NOT add credentials, edit `.env`, edit `.env.example`, or modify any code. It documents the operator-time workflow for Phase 3.

| File | Change |
|---|---|
| `docs/31_PROVIDER_CREDENTIALS_VAULT.md` | **NEW** — this document |

Files intentionally NOT touched:

- `upstream/docker-vps/.env.example` — already lists all required keys with empty values from Phase 1.5. No new keys this PR.
- `services/hermes-tv-api/src/middleware/credentialGuard.js` — existing implementation already wraps `res.json` to block leaks; Phase 3 implementation PR may extend the pattern list but not in this plan PR.
- `services/hermes-tv-api/src/index.js` — env-presence boot log line is added in the Phase 3 implementation PR, not here.
- Any code path that reads any of the keys listed above.

---

## Hard guarantees of this PR (same as Phase 1.5, Phase 2)

- ❌ Did NOT add any credential value to any file in this repo
- ❌ Did NOT SSH into the VPS
- ❌ Did NOT modify `.env`, `.env.example`, or any compose file
- ❌ Did NOT touch host nginx, Caddy, ufw, iptables, systemd, or `/etc/`, `/var/`, `/home/` on the VPS
- ❌ Did NOT `apt install/remove/purge`
- ❌ Did NOT run `docker compose up` or any other write-mode docker command
- ❌ Did NOT modify any of the 9 daveai.tech nginx sites
- ❌ Did NOT change the Phase 2 stack behaviour

The credential paste is operator-only, performed once per credential, on the VPS, alone, mode-0600, and backed up to the operator's offline encrypted vault.
