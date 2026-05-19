# W5 — HermesTV VPS redeploy runbook (PRs #58–#68)

On 2026-05-18 the agent triaging prod confirmed `hermestv.daveai.tech` was running a build from before PR #56. Symptoms the user saw:

- Zero shell missing from the layout switcher
- Chatbot showed "Couldn't reach the server"
- Other stale-build artefacts

This runbook brings the VPS up to the head of `origin/main` (PRs #58–#68 inclusive) and verifies the result with five public-edge smoke probes.

---

## What's in this redeploy

The catch-up bundle ships ten merged PRs:

- **#58** — `feat(web): Zero shell + 6 new themes (IPTV Player Zero look-alike)` — adds the eighth layout manifest (`zero.json`), so `/api/layouts` returns `count: 8` after this deploy.
- **#59** — `feat: 1-click download flow w/ exact-size disclosure modal (Zero-shell parity)` — adds `POST /api/download` returning `exact_size_human` before any bytes move.
- **#60** — `feat: Smallville-style series detail w/ per-episode + per-season download` — series detail surfaces per-episode and per-season download targets through the same `/api/download` shape.
- **#61** — `feat(web): tabbed Settings panel — Zero-style 7-tab modal` — Settings panel is now seven tabs (General, Playback, Voice, Theme, Providers, Diagnostics, About) instead of one wall.
- **#62** — `fix(web): wire onClick + keyboard activation across all 8 shells` — every shell now honours mouse + remote DPad activation on cards.
- **#63** — `fix(web): remove duplicate ENHANCED badge from TV Model selector` — visual cleanup; no API change.
- **#64** — `fix(web): chatbot greetings + clearer no-match message` — fixes the "Couldn't reach the server" symptom; chatbot now reports a friendly no-match message and greets correctly.
- **#65** — `fix(web): Azure TTS sample playback in VoicePickerModal + boot greeting` — voice picker preview audio works and the boot greeting plays.
- **#66** — `chore(ci): E2E smoke test exercises all 12 critical endpoints` — CI guards the API surface so a future regression on these endpoints is caught before merge.
- **#67** — `feat: pairing-code endpoint shape for Add Provider QR (Phase 1 surface)` — adds `POST /api/pair` returning a fresh `HRM-XXXX` code for the QR onboarding flow.
- **#68** — `feat(api): real artwork URLs on seed catalog items (TMDb + Wikipedia + picsum fallback)` — seed catalog now ships real poster URLs so the grid no longer looks empty before providers are wired.

---

## Deploy — single command

From the operator's workstation:

```bash
bash tools/redeploy-vps.sh
```

If your `~/.ssh/config` doesn't resolve `srv1376124`, override the host:

```bash
OPERATOR_HOST=operator@<your-vps-host> bash tools/redeploy-vps.sh
```

The script does the following on the VPS, in one SSH session:

1. `cd /home/operator/hermestv && git fetch origin && git checkout main && git pull --ff-only`
2. `docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml build hermes-tv-api hermes-web-tv`
3. `docker compose -p hermestv-vps -f upstream/docker-vps/VPS_COMPOSE.yml up -d hermes-tv-api hermes-web-tv`
4. Waits up to 60 s (12 × 5 s) for both containers to report `healthy` via `docker inspect`.

The other three services in the compose file (`threadfin`, `m3u-editor`, `xtreamfilter`) are never named on the build/up lines, so they keep running untouched.

---

## Smoke probes (run from your workstation against the public edge)

Once both containers are healthy the script runs five probes against `https://hermestv.daveai.tech`:

| # | Probe | Expected | Why it matters |
| --- | --- | --- | --- |
| 1 | `GET /health` | HTTP 200 | API reachable through CF → host nginx → container |
| 2 | `GET /api/layouts \| jq .count` | `8` | Confirms PR #58's Zero manifest shipped |
| 3 | `POST /api/download {"item_id":"live-100","profile_id":"mom_tv"} \| jq .exact_size_human` | non-empty size string | Confirms PR #59's download envelope shipped |
| 4 | `POST /api/pair \| jq .pairing_code` | `HRM-XXXX` | Confirms PR #67's pairing route shipped |
| 5 | `GET /api/catalog \| jq ._meta.source` | logged, not asserted | Shows whether catalog resolved to `jellyfin` / `iptv-org` / `m3u` / `mock` |

The final line is exactly:

```
=== VPS redeploy complete — N PASS, M FAIL ===
```

Non-zero `FAIL` count means non-zero exit code so the script is CI-grep-friendly.

---

## What this runbook does NOT do

- Restart `threadfin`, `m3u-editor`, or `xtreamfilter` — the build/up lines explicitly name only `hermes-tv-api` + `hermes-web-tv`.
- Touch `.env` or any provider credential — `.env` is gitignored and lives at `/home/operator/hermestv/.env` (mode 0600), untouched by `git pull`.
- Run `docker compose down`, `docker system prune`, or remove any volume. Volumes (`hermestv-vps-settings-store`, `hermestv-vps-iptv-org-cache`) survive.
- Reconfigure nginx, ufw, or any other host service.
- Embed any SSH key, password, or token. The script uses the operator's existing SSH agent / `~/.ssh/config`. No secret values are read or written.

---

## If a probe fails

- **Probe 1 (`/health`) fails** → API container is up but unreachable through nginx. Check `sudo nginx -t` on the VPS and `docker compose -p hermestv-vps logs --tail=200 hermes-tv-api`.
- **Probe 2 (`count != 8`)** → A stale image is still running. Re-run the script; the build step should pick up the new manifest. If it persists, check that `apps/hermes-web-tv/src/layouts/manifests/zero.json` exists in the cloned repo on the VPS.
- **Probe 3 / 4 fail** → API route missing or returning the old shape. Check the running image SHA against the latest commit on `origin/main`.
- **Probe 5** never fails the script (logged only). A `mock` source on a freshly redeployed prod is expected; switching to `iptv-org` happens on the first 24 h cron tick or when an operator wires Threadfin.

For any container that fails to reach `healthy` within 60 s, the script aborts before the smoke probes and prints the exact `docker compose logs` command to pull diagnostics. The rollback path is the same as in `docs/29_HERMESTV_DEPLOY_RUNBOOK.md` — `docker compose -p hermestv-vps stop hermes-tv-api hermes-web-tv` returns the system to its pre-redeploy state.
