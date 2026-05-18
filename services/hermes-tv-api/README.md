# hermes-tv-api

HermesTV backend API — the brain of the household IPTV experience.

Holds all credentials and provider secrets, runs AI routing, processes IPTV catalog and EPG data, and returns only TV-safe data to Tizen TV apps. TVs never receive credentials, stream tokens, or raw provider URLs.

## Role

The backend does all heavy work. The Tizen/web TV app is a thin client.

Responsibilities:
- Provider credential vault (read-only from `G:\private\`)
- M3U / Xtream / XMLTV ingest and normalization
- Unified catalog (Apollo + XtremeHD merged, each item tagged)
- Quality scanning via ffprobe
- EPG cleanup and fuzzy matching
- Profile memory for Dave and Mom
- AI routing (MiniMax / DeepSeek / SiliconFlow / Ollama / LM Studio)
- Azure TTS voice generation
- Safe JSON UI command router
- QR pairing endpoint (credential onboarding)
- Update manifest endpoint

## Running locally

```bash
cd services/hermes-tv-api
npm install
npm run dev       # node --watch (auto-restart on file change)
# or
npm start         # plain node
```

Server listens on `PORT` env var, defaulting to **3001**.

Copy `.env.example` to `.env` and fill in paths (never credentials).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check — returns service name, version, timestamp |
| GET | `/api/profile/:id` | TV-safe profile for `dave_tv` or `mom_tv` |
| PATCH | `/api/profile/:id` | Partial profile update (in-memory; resets on restart) |
| GET | `/api/providers` | TV-safe provider summaries (no credentials) |
| GET | `/api/catalog` | TV-safe catalog items; `?profile_id=` to filter |
| GET | `/api/epg/:channelId` | EPG stub (pending B4 phase) |
| POST | `/api/commands` | Validated command envelope dispatch |
| GET | `/api/versions/manifest` | Schema and Tizen compatibility manifest |
| GET | `/setup/provider` | QR-based provider onboarding HTML page |
| POST | `/setup/provider/submit` | Provider save (501 — pending B4 phase) |

## Security

- **Credentials never leave this service.** All secrets live in `G:\private\` (configured via `HERMESTV_VAULT_PATH`). No credential fields are included in any API response.
- CORS is restricted to `http://hermestv.local` and `http://localhost:5173` (dev only).
- Request bodies are never logged — they may contain credentials from setup flows.
- Mom Mode (`mom_tv`) enforces a `font_scale >= 1.25` floor on all update paths.
- `mom_tv` performance and quality caps are never applied — only `dave_tv` carries baseline caps.

## Credential rules

- Provider credentials are NEVER returned to the TV app
- Credentials live in `G:\private\` and are loaded at startup via env vars
- The API returns only catalog-safe data (provider IDs, display labels, quality badges, EPG)

## Profiles

| Profile | Display name | TV model | Tier |
|---------|-------------|----------|------|
| `dave_tv` | Dave | UN55CU8000BXZA | baseline |
| `mom_tv` | Sherri | QN85Q7FAAFXZA | enhanced |

## AI routing

| Model | Use case |
|-------|----------|
| MiniMax Highspeed 2.7 | Standard queries |
| DeepSeek V4 | Complex reasoning |
| SiliconFlow uncensored | Auto-switch for sensitive queries |
| Ollama / LM Studio | Local fallback |

TTS: **Azure TTS only** (never Bixby AI or any Samsung AI output path).

## See also

- `docs/08_BACKEND_STACK_CONTRACT.md`
- `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`
- `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md`
