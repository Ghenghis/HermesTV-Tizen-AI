# Codex Continuation Proof — 2026-05-21

## Scope

Continued from the Claude swarm handoff after PR #150. Focus was agent-fixable release blockers that did not require Dave's private provider credentials or Samsung TV hardware.

## Corrections Landed

- Local no-login development path: added `npm run start:api:noauth`, guarded by `tools/local-noauth-env.js`. It refuses `NODE_ENV=production`.
- iptv-org free provider default: local no-auth dev now enables `IPTV_ORG_ENABLED=true`, sets safe public country/category filters, and caches the public iptv-org JSON under the user's local HermesTV cache. Docker/VPS configs also enable iptv-org by default with a mounted cache at `/var/cache/iptv-org`.
- Local no-login browser path: fixed `127.0.0.1` CORS + web CSP so `http://127.0.0.1:5174` can talk to the no-auth sidecar on `http://127.0.0.1:3331`. The normal `3001` API remains auth-protected.
- API base precedence: runtime `window.__HERMES_API_BASE__` still wins, but `VITE_DAVETV_API_BASE` now wins over stale `localStorage.davetv_api_base` so a no-auth dev server cannot silently fall back to the protected API.
- Provider/family profile access: family profile IDs such as `warren` can use catalog, search, channels, commands, playback, and source-health. Provider rows are no longer stamped Dave/Sherri-only by default.
- Backend family profile API: `/api/profiles` and `/api/profile/:id` now include auth-created family profiles, not only `dave_tv` and `mom_tv`.
- VPS persistence: Dockerfile and compose pin provider/auth/settings stores under `/var/lib/hermestv`; missing private `.env` no longer blocks compose config.
- Playlist import durability: `/api/playlists` now reads durable providerStore rows after route memory reset, and delete removes the real provider row.
- Xtream series playback: clicking a series without an episode now resolves the first real provider episode instead of trying to play the parent series id.
- Real provider movie state: movie watched/favorite endpoints accept normalized real provider movie items.
- Jellyfin filter correctness: Jellyfin-only catalogs respect provider filters and family profiles.
- Source health: Xtream disk-provider counts appear in `/api/source-health`.
- Downloads truthing: `/api/download` now returns honest `503 download_pipeline_not_available` with no `job_id`, queued status, or fake exact-size fields.
- VPS deploy preflight: GitHub Actions and `tools/redeploy-vps.sh` no longer refuse deployment solely because the private `.env` is missing. They warn and continue with compose/image defaults plus persisted `/var/lib/hermestv` data, while still hard-failing a wrong `DAVETV_PUBLIC_APP_URL` when it is explicitly set.
- iptv-org card polish: provider artwork failures now fall back to DaveTV's deterministic gradient/initials tile instead of a broken image icon.

## Proof Commands

- `node services\hermes-tv-api\test\localNoAuthGuard.test.js` → 6 PASS / 0 FAIL
- `node services\hermes-tv-api\test\corsLocalhostContract.test.js` → 4 PASS / 0 FAIL
- `node services\hermes-tv-api\test\webCspContract.test.js` → 4 PASS / 0 FAIL
- `node services\hermes-tv-api\test\playlistProviderPersistence.test.js` → 11 PASS / 0 FAIL
- `node services\hermes-tv-api\test\familyProfileAccess.test.js` → 12 PASS / 0 FAIL
- `node services\hermes-tv-api\test\familyProfilesRoute.test.js` → 6 PASS / 0 FAIL
- `node services\hermes-tv-api\test\vpsPersistenceContract.test.js` → 12 PASS / 0 FAIL
- `node services\hermes-tv-api\test\xtreamSeriesPlayback.test.js` → 15 PASS / 0 FAIL
- `node services\hermes-tv-api\test\jellyfinPlayback.test.js` → 27 PASS / 0 FAIL
- `node services\hermes-tv-api\test\releaseFlagContract.test.js` → 17 PASS / 0 FAIL
- `npm test --prefix services\hermes-tv-api` → PASS, full API chain
- `npm run build:web` → PASS
- `npm run audit:secrets` → 2 PASS / 0 FAIL
- `docker compose -f upstream\docker-vps\VPS_COMPOSE.yml config --quiet` → PASS
- `docker compose -f docker\vps\compose.yml config --quiet` → PASS
- PowerShell-safe E2E smoke: `$env:NO_PROVIDER_EMPTY_STATE='1'; npm run test:e2e` → 12 PASS / 0 FAIL
- `npx playwright test swarm-20260521-api-base.spec.ts` from `tests\playwright` → 4 PASS / 0 FAIL
- Clean Playwright probe against `http://127.0.0.1:5174` → requested `http://127.0.0.1:3331/api/auth/me` and mounted DaveTV onboarding, not login.
- In-app browser proof: skipped onboarding and selected Dave profile; the app opened to the real empty-provider state with no fake catalog rows.
- iptv-org refresh proof: local no-auth API fetched 8/8 public JSON files from `https://iptv-org.github.io/api`, `/api/providers` exposed `env-iptv-org` with no credentials, `/api/source-health` reported iptv-org `status=ok`, and `/api/catalog?provider_id=iptv-org` returned 290 real free live channels.
- Browser proof: forced Dave profile on `http://127.0.0.1:5174/?profile_id=dave_tv`, verified no login gate, no empty state, and visible real iptv-org cards including `10 Bold` and `24 Hour Free Movies`.
- Playback proof: `POST /api/play` for the real iptv-org `10 Bold` catalog item returned a stream endpoint, and `HEAD` on that endpoint returned `200` with `Content-Type: application/x-mpegURL`.
- Deploy preflight proof: `node services\hermes-tv-api\test\vpsPersistenceContract.test.js` now includes 15 PASS / 0 FAIL, covering optional `.env`, iptv-org persistence, and no initial admin-password requirement.
- Artwork proof: `node services\hermes-tv-api\test\viewShellNoFakeRows.test.js` now includes 16 PASS / 0 FAIL, covering the broken-art fallback contract.
- Screenshot: `docs/proof/overnight-swarm/codex-continuation/screenshots/iptv-org-local-catalog.png`.
- Screenshot: `docs/proof/overnight-swarm/codex-continuation/screenshots/iptv-org-local-catalog-art-fallback-settled.png`.

## Remaining Blockers

- Live provider proof still needs Dave's real provider configuration on the local API or VPS.
- Live SMTP proof needs private SMTP settings.
- Live Azure TTS audio proof needs private Azure Speech settings.
- Real Samsung Tizen sideload/smoothness proof needs the physical TV and signing path.
- VPS is not updated by these local edits until the branch/PR is deployed.

## Secret Status

No provider URLs, usernames, passwords, SMTP credentials, Azure keys, cookies, or reset tokens were written to this proof file.
