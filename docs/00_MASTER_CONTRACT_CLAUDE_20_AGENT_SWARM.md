# 00 — HermesTV Tizen AI Master Contract for Claude 20+ Agent Swarm

Project: `HermesTV-Tizen-AI`

Local path: `G:\Github\HermesTV-Tizen-AI`

GitHub: `https://github.com/Ghenghis/HermesTV-Tizen-AI`

Mission: build a private-household Samsung Tizen IPTV/AI experience for Dave and Mom, powered by a thin Tizen TV app and a VPS/workstation backend brain.

## Non-negotiable architecture

1. The Tizen app is not the brain. It is a fast TV UI shell/player.
2. The backend is the brain: catalog, quality scanning, AI, memory, voice, layout state, provider normalization.
3. API keys are never placed inside the Tizen app bundle.
4. Provider credentials are never committed to GitHub.
5. Agents may suggest and apply UI changes only through a constrained JSON command schema.
6. Every feature must be tested against both target TVs:
   - Mom: `QN85Q7FAAFXZA`
   - Dave: `UN55CU8000BXZA`
7. UI must be dark-first, remote-first, TV-distance readable, and configurable for both Dave Mode and Mom Mode.
8. The UX must include a large library of selectable layouts, themes, backgrounds, animation densities, accessibility presets, and agent-adjustable UI commands.

## Uploaded/reference sources to use

- `NuvioWeb-main.zip`: TV-first UI, focus patterns, hosted app strategy, player/controller ideas, theme system.
- `NuvioTVTizen-main (1).zip`: thin Tizen wrapper pattern and remote key registration.
- `TizenBrewInstaller.wgt` and `TizenBrewInstaller-1.1.2.zip`: private/dev install reference only.
- `IPTV_AI_VPS_WORKSTATION_BETA_LAB_V3_FINAL_KIT(1).zip`: backend Docker/Caddy/Open WebUI/Jellyfin/Tunarr/Dispatcharr/Threadfin baseline.
- `stremio-web-5.0.0-beta.37.zip`: discovery/metadata/addon reference only; likely too heavy for main Tizen app.
- `NuvioTV-dev (1).zip`: Android TV reference only.
- `NuvioMobile-cmp-rewrite.zip`: future mobile companion and addon/API reference.

## Agent roster — 24 lanes

Each agent must produce a report under `docs/research/agent-XX-*` before implementation.

1. Samsung TV Model Capability Research — research `QN85Q7FAAFXZA` and `UN55CU8000BXZA`.
2. Tizen CLI + Sideload Pipeline — official Tizen Studio CLI plus optional TizenBrew private/dev path.
3. NuvioWeb Pattern Audit — reusable TV UI architecture and focus patterns.
4. NuvioTVTizen Wrapper Audit — wrapper mechanics and `.wgt` structure.
5. TizenBrew Installer Audit — install flow, service comms, security risks.
6. IPTV Player UX Research — TiviMate, Smarters, Sparkle, Hot IPTV, SmartOne, IPTVnator, Jellyfin, Plex, Stremio, Kodi, YouTube TV, Samsung TV Plus, Pluto, Channels DVR.
7. 12 Static Layout Presets Designer — JSON preset, wireframe, focus order, Dave/Mom variants.
8. Extreme Theme/Background Engine Designer — 24 themes, 12 background packs, agent-safe customization.
9. TV Remote + Focus Engine Designer — directional focus, key handling, long press, back behavior.
10. AVPlay / HTML5 Player Capability Agent — one-player MVP, preview strategy, PiP experiments only if proven.
11. Catalog + Provider Normalization Agent — M3U/Xtream/XMLTV/VOD/series/categories/favorites.
12. Quality Scanner Agent — ffprobe resolution/codec/bitrate/fps/audio/subtitles/possible upscale/dead stream.
13. EPG + Schedule Intelligence Agent — fuzzy matching, guide refresh, backup/swap.
14. Memory + Profile Agent — Dave/Mom profile memory, reminders, watch-later, privacy/forgetting.
15. Floating Chatbot UX Agent — minimized/compact/expanded/walkie-talkie/action cards.
16. Safe Agent Command Router Agent — validated JSON commands only.
17. Azure Voice Agent — Azure voices only, per-profile voice, cache policy, fallback.
18. Backend Stack Agent — Open WebUI/Pipelines/Dispatcharr/Threadfin/Tunarr/Jellyfin/private Caddy/Tailscale.
19. Open WebUI/Pipelines/LLM Routing Agent — MiniMax, DeepSeek, SiliconFlow, Ollama, LM Studio via backend only.
20. Accessibility / Mom Mode Agent — senior-friendly large UI and safe navigation.
21. Visual QA + Screenshot Baseline Agent — all layouts/themes/profile screenshots.
22. Performance Budget Agent — older Dave TV minimum baseline.
23. Security / Legal Boundary Agent — no secrets, no public restreaming, no bypass/crack/scrape.
24. Release Manager / Truth Gate Agent — branches, PR gates, evidence ledger, release proof.

## Required phases

### R0 — Research lock

No code architecture is final until these reports exist:

- TV model capability report for both TVs.
- Layout/player app research matrix.
- Nuvio/TizenBrew/Stremio uploaded-source audit.
- Tizen official docs capability matrix.

### R1 — UX design lock

Deliver:

- 12 static layout presets.
- 24 themes and 12 background packs.
- Mom Mode/Dave Mode.
- Floating chatbot interaction contract.
- Safe JSON UI command schema.

### B1 — Repo scaffold

Create:

```text
apps/tizen-hermes-tv/
apps/hermes-web-tv/
services/hermes-tv-api/
docker/
docs/
prompts/
schemas/
tools/
upstream/
research/
```

### B2 — MVP

Prove:

- Tizen app launches on both TVs.
- Loads backend endpoint.
- Profile picker Dave/Mom.
- Catalog mock -> real adapter path.
- One playable stream.
- Quality badges.
- 3 layouts.
- 6 themes.
- Floating chatbot with typed commands.
- Commands apply through schema and save state.

### B3 — Full UX system

Expand to 12 layouts, 24+ themes, background packs, agent-adjustable layouts, favorites/watch later/recent/watch progress, and basic memory recalls.

### B4 — Provider/backend integration

Integrate only lawful user-owned sources through local secrets, provider ingest pipeline, quality scanner, EPG cleanup, and transactional refresh/backup/swap.

## Acceptance rule

Claude agents are not done until they produce proof, not claims: screenshots, focus traversal proof, player tests, TV model diagnostics, secret scan proof, no public endpoint proof, schema validation proof, and performance proof.
