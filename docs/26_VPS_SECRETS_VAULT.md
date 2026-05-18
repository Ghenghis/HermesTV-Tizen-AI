# 26 — VPS Secrets Vault

Centralised secrets architecture for the HermesTV Hostinger VPS.

---

## 1. Purpose

The Hostinger Linux VPS is the **single source of truth** for every API
credential the HermesTV system uses. Two clients render the experience:

- **Mom's QN85 QLED** running the HermesTV Tizen app (`apps/hermes-tv-tizen/`).
- **Dave's Windows workstation** running the HermesTV web app
  (`apps/hermes-web-tv/`) in a browser.

Both clients call the **same** VPS endpoints under
`https://hermestv.example.com/api/*`. Keys for Azure TTS, Jellyfin, IPTV
providers, and the LLM/agent backbone live exclusively in
`/home/operator/hermestv/.env` on the VPS. They are **never** bundled into the
Tizen `.wgt`, never embedded in the React build, never written into any git
repository.

Per asymmetric-performance policy, this vault still treats both TVs identically
at the data layer — only client-side rendering applies caps to Dave's TV. The
VPS itself does not gate Mom's TV on quality, ever.

---

## 2. Key inventory

| Key | Source | Used by | Client-visible? |
|---|---|---|---|
| `AZURE_TTS_KEY` | Azure Portal → Speech service → Keys and Endpoint | `services/hermes-tv-api/src/tts.js`, voice synthesis | NO |
| `AZURE_TTS_REGION` | Azure Portal → Speech service | `services/hermes-tv-api/src/tts.js` | NO |
| `JELLYFIN_URL` | Workstation Jellyfin instance over Tailscale | `services/hermes-tv-api/src/catalog.js`, `providers.js` | NO |
| `JELLYFIN_API_KEY` | Jellyfin admin → Dashboard → API Keys | `catalog.js`, `providers.js` | NO |
| `APOLLO_M3U_URL` | Apollo provider account | `providers.js`, scanner | NO |
| `APOLLO_EPG_URL` | Apollo provider account | `providers.js`, EPG fetcher | NO |
| `APOLLO_USERNAME` / `APOLLO_PASSWORD` | Apollo provider account | `providers.js`, Threadfin | NO |
| `XTREMEHD_M3U_URL` | XtremeHD provider account | `providers.js` | NO |
| `XTREMEHD_EPG_URL` | XtremeHD provider account | `providers.js`, EPG fetcher | NO |
| `XTREMEHD_USERNAME` / `XTREMEHD_PASSWORD` | XtremeHD provider account | `providers.js`, Threadfin | NO |
| `THREADFIN_URL` | Internal Docker DNS | `providers.js`, Caddy `/threadfin/*` proxy | NO |
| `M3U_EDITOR_URL` | Internal Docker DNS | Provider-management UI proxy | NO |
| `XTREAMFILTER_URL` | Internal Docker DNS | Provider-management UI proxy | NO |
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys | Agent backbone, chatbot | NO |
| `OPENAI_API_KEY` | platform.openai.com → API Keys | Agent backbone (fallback) | NO |
| `LLM_DEFAULT_MODEL` | Configuration choice | Agent backbone | NO |
| `EXTRA_CORS_ORIGINS` | Configuration choice | Express CORS middleware | NO |
| `PUBLIC_DOMAIN` | DNS configuration | Caddyfile substitution | YES (it is the URL) |
| `ACME_EMAIL` | Sysadmin email | Caddy Let's Encrypt registration | NO |

> Bixby is intentionally absent from this inventory. Azure is the **only**
> TTS path. The Samsung microphone is permitted only as optional speech
> capture; no Bixby AI, TTS, memory, or personality layer is allowed.

---

## 3. Where the `.env` lives

```
/home/operator/hermestv/.env
```

- Owner: `operator:operator`
- Permissions: `0600` (read/write for owner only — `chmod 600 .env`)
- Read by Docker Compose via the `env_file:` directive on each service that
  needs it (`hermes-tv-api`, `threadfin`, etc.).
- **Never** committed to any git repository. The repo only ships
  `upstream/docker-vps/.env.example` with empty values for documentation.
- `.gitignore` must include `.env` and `**/.env.local` at the repo root.

---

## 4. How to populate

1. Sysadmin (Ghenghis) SSHes to the VPS:
   `ssh operator@hermestv.example.com`
2. `cp /opt/hermestv/upstream/docker-vps/.env.example /home/operator/hermestv/.env`
3. `chmod 600 /home/operator/hermestv/.env`
4. Edit with `nano` or `vim`. Paste each key value once.
5. Restart the affected service:
   `docker compose -f /opt/hermestv/upstream/docker-vps/docker-compose.yml up -d hermes-tv-api`
6. Verify via boot log line (see section 7).

**Hard rules:**

- Never paste a key into a chat window, PR description, commit message,
  issue, or screenshot.
- Never email a key.
- Never check a populated `.env` into git, even on a private branch.
- If a key is accidentally exposed, rotate it within 1 hour (see section 5).

---

## 5. Rotation

| Key | Recommended cadence | Triggered by | Rotation steps |
|---|---|---|---|
| `AZURE_TTS_KEY` | 90 days | Calendar reminder, or compromise | Azure Portal → Speech service → Keys → Regenerate Key1, paste into `.env`, `docker compose restart hermes-tv-api` |
| `JELLYFIN_API_KEY` | Yearly | Calendar reminder, staff change, compromise | Jellyfin → Dashboard → API Keys → revoke old, create new, paste into `.env`, restart |
| `APOLLO_*` / `XTREMEHD_*` | When forced by provider | Provider notice, subscription renewal, compromise | Provider account portal → reset password / get new M3U URL → paste → restart |
| `ANTHROPIC_API_KEY` | 180 days or compromise | Calendar reminder, compromise | console.anthropic.com → Settings → API Keys → revoke old, create new, paste, restart |
| `OPENAI_API_KEY` | 180 days or compromise | Calendar reminder, compromise | platform.openai.com → API Keys → revoke, create, paste, restart |

**Owner:** Ghenghis is the sole rotator. Document each rotation in the
encrypted vault (section 6) with date and reason. No rotation may happen via
shared screen or paired session — keys are entered alone.

---

## 6. Backup

- The populated `.env` is backed up to Ghenghis's **encrypted local vault**
  (Bitwarden or 1Password, item type "Secure Note") as a single entry titled
  `HermesTV VPS .env (production)`.
- Backup occurs immediately after every rotation.
- **Never** back up to: GitHub (any repo, public or private), email
  (sent or draft), cloud Drive folders without per-file encryption,
  Slack/Discord/Signal, screenshots, or printed paper.
- Vault entry includes: full `.env` contents, rotation date, last
  validated timestamp.

---

## 7. Validation

On boot, `services/hermes-tv-api/src/index.js` logs a single line summarizing
which keys are present, **without** revealing any values:

```
[HermesAPI] env: azure=true jellyfin=true apollo=true xtremehd=false anthropic=true openai=false
```

Each flag is the result of a presence check only (e.g., `azureConfigured()`
inspects `process.env.AZURE_TTS_KEY` and `AZURE_TTS_REGION` and returns a
boolean). The code MUST NOT log:

- key values
- key prefixes or suffixes
- key lengths
- HTTP requests with keys in headers (sanitize before logging)

A second startup line emits when a feature degrades to stub mode:

```
[HermesAPI] degraded: azure missing → TTS endpoints return 202 stub
[HermesAPI] degraded: jellyfin missing → catalog endpoints return mock fixtures
```

---

## 8. Local dev

For local development on the workstation, both apps can run without any real
credentials:

- `services/hermes-tv-api/.env` may contain placeholder values or be empty.
- Without `AZURE_TTS_KEY`: `/api/tts/*` returns HTTP 202 with a stub body
  describing what would have been spoken. The web app and Tizen app render
  identically; only audio is silent.
- Without `JELLYFIN_API_KEY`: `/api/catalog` and `/api/providers` return a
  small in-repo mock catalog (see `services/hermes-tv-api/src/fixtures/`).
- Without `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`: the agent backbone returns
  a canned "no LLM configured" response for any chatbot request.

This means a contributor can clone the repo, run `npm install && npm run dev`,
and exercise the full UI — including layout switching, profile selection,
and command routing — with zero secrets. Real audio and real catalog
require the populated VPS `.env`.

---

## 9. Blocker reference

The Hostinger VPS SSH credentials and DNS pointer for `hermestv.example.com`
are not yet configured. Production deployment of this vault is blocked on:

- See [`docs/research/BLOCKER_VPS_SSH.md`](research/BLOCKER_VPS_SSH.md).

Until that blocker is resolved, the `.env.example` and this document define
the **target** vault. Local dev (section 8) proceeds without it.
