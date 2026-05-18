# services/hermes-tv-api

HermesTV backend API — the brain of the system.

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

## Credential rules

- Provider credentials are NEVER returned to the TV app
- Credentials live in `G:\private\` and are loaded at startup via env vars
- The API returns only catalog-safe data (provider IDs, display labels, quality badges, EPG)

## Target

- Python (FastAPI) or Node.js (Express/Fastify) — TBD at B2 kickoff
- Docker container: `ghcr.io/ghenghis/hermestv-api:latest`
- Runs on Windows workstation primarily; thin gateway instance may run on Hostinger VPS

## Key endpoints (planned)

- `GET /health` — liveness probe
- `GET /api/profile/:id` — profile state (dave_tv / mom_tv)
- `GET /api/providers` — TV-safe provider list
- `GET /api/catalog` — unified catalog
- `GET /api/epg/:channel_id` — EPG data
- `POST /api/commands` — safe JSON UI command ingestion
- `GET /setup/provider` — QR pairing page (Tailscale only)
- `GET /api/versions/manifest` — update manifest

## See also

- `docs/08_BACKEND_STACK_CONTRACT.md`
- `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md`
- `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md`
