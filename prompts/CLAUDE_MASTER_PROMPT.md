# CLAUDE_MASTER_PROMPT — HermesTV Tizen AI

Use this prompt at the start of every new Claude session on this project.

---

## Project

**HermesTV Tizen AI** — a private-household Samsung Tizen IPTV/AI experience for Dave and Mom (Sherri).

- Repo: `https://github.com/Ghenghis/HermesTV-Tizen-AI`
- Local: `G:\Github\HermesTV-Tizen-AI`
- Branch convention: feature work on `feature/*` or `scaffold/*`; never commit directly to `main`

## Architecture in one sentence

Thin Samsung Tizen TV app (remote-first, dark-first UI shell + player) talks only to the HermesTV backend. The backend is the brain — it holds all credentials, runs all AI, processes all IPTV data, and returns only safe catalog/profile data to the TV.

## Target TVs — ALWAYS research both before implementing anything

| Profile | TV Model | Screen | Tier |
|---|---|---|---|
| Mom / Sherri (`mom_tv`) | `QN85Q7FAAFXZA` | 85" QLED | **PRIMARY TARGET** — Enhanced tier, all bells and whistles, full performance |
| Dave (`dave_tv`) | `UN55CU8000BXZA` | 55" Crystal UHD | Graceful degradation — not the design floor, UN-class may not be smooth |
| Extended target | QN95-class | 95" QLED | Same as mom_tv — all enhanced features, QN95 parity target |

## Providers (no credentials ever in code/docs)

- Apollo Group (`apollo`) — Xtream/M3U/VOD/Series
- XtremeHD (`xtremehd`) — Xtream/M3U/VOD/Series
- Credentials live in `G:\private\` — agents never read, display, or transmit vault contents
- Provider completion must follow `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
  and `prompts/CLAUDE_PROVIDER_FINISH_PROMPT.md`. Skipped provider tests,
  mocked catalogs, static provider lists, or 501 endpoints are not proof.
- Remaining release/E2E work must follow
  `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md` and
  `prompts/CLAUDE_E2E_20_AGENT_SWARM_PROMPT.md`.
- Any work using `G:\Github\IPTV-Apps` as reference material must follow
  `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md` and
  `prompts/CLAUDE_REFERENCE_APPS_E2E_SWARM_PROMPT.md`.

## Profiles

- `dave_tv` — Dave. Baseline tier. Standard font. Full feature access.
- `mom_tv` — Sherri/Mom. Enhanced tier. Mom Mode: font scale ≥ 1.25, reduced motion ON, audio feedback ON. Never capped by agents.

## Voice / TTS

- Azure TTS ONLY. No Bixby AI, no Samsung AI voice, no Web Speech API.
- Samsung mic = optional input capture only.

## Must-read contract docs before any implementation

Read these in order — they supersede any generic assumption:

1. `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md` — 24-agent roster, phases, acceptance rule
2. `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md` — TV model research lock
3. `docs/04_LAYOUT_LIBRARY_12_STATIC_MODES.md` — 12 layout presets
4. `docs/05_THEME_BACKGROUND_ENGINE_CONTRACT.md` — 24 themes, 12 background packs
5. `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md` — safe JSON command schema (all UI mutations go through this)
6. `docs/07_PROVIDER_CATALOG_AND_QR_ONBOARDING_CONTRACT.md` — provider catalog, QR onboarding, stream slot protection
7. `docs/07_QUALITY_STREAM_STATS_CONTRACT.md` — quality scanner (ffprobe, resolution/codec/bitrate badges)
8. `docs/08_BACKEND_STACK_CONTRACT.md` — backend Docker stack (workstation + VPS)
9. `docs/09_TIZEN_BUILD_SIDELOAD_CONTRACT.md` — Tizen CLI build, .wgt, sideload
10. `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md` — acceptance gates (proof required, not claims)
11. `docs/11_USER_AGENT_PERSONA_NAMING_CONTRACT.md` — Dave/Mom profiles, agent naming, Azure TTS
12. `docs/12_EPG_CONTENT_DISCOVERY_CONTRACT.md` — EPG, XMLTV, fuzzy match, catch-up
13. `docs/13_VPS_ISOLATION_DEPLOYMENT_CONTRACT.md` — VPS isolation, AI routing policy, vault protection
14. `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md` — provider truth gate, root issues, proof artifacts
15. `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md` — remaining E2E release gates and 20-agent lane plan
16. `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md` — reference-app adoption gates, missing IPTV features, and E2E proof matrix

## Safe execution mode

Continue automatically for: markdown, docs, schemas, scaffold, config, test, lint, PR prep.

Stop and ask before: deleting files, docker prune/rm, stopping VPS services, touching .env secrets, reading vault contents, merging to main.

## AI agent routing (from doc 13)

- Standard tasks: MiniMax Highspeed 2.7 → DeepSeek V4 → Ollama fallback
- Complex reasoning: DeepSeek V4 primary
- Sensitive/edge queries: SiliconFlow uncensored (auto-switch, transparent to user)
- TTS: Azure only

## Phase status

**Architecture note:** QN85/QN95 QLED is now the PRIMARY design target. Enhanced tier is the design assumption, not an opt-in override. UN-class (UN55CU8000BXZA) receives graceful degradation only — it is not the design floor and smooth performance on UN-class hardware is not guaranteed.

| Phase | Status |
|---|---|
| R0 — Research lock | In progress (research/ docs accumulating, NEEDS VERIFICATION flags require on-device) |
| R1 — UX design lock | Contracts written (04, 05, 06) — awaiting visual proof |
| B1 — Repo scaffold | In progress (schemas, mock, web-tv shell, tizen app skeleton committed) |
| B2 — MVP | Not started |
| B3 — Full UX | Not started |
| B4 — Provider integration | Partially implemented, not complete; blocked until `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md` passes |

## Agent 24-lane assignments (from doc 00)

When fanning out work, assign agents by lane number. Each agent writes a report to `docs/research/agent-XX-*.md` before any implementation.

## Key directories

```
apps/hermes-tv-tizen/         — Samsung Tizen .wgt app (canonical, web-mirror wrapper)
apps/hermes-tv-tizen-native/  — Samsung Tizen .wgt app (legacy native scaffold, AVPlay reference)
apps/hermes-web-tv/       — React web TV UI (dev + hosted-app delivery)
services/hermes-tv-api/   — Backend API (FastAPI or Express)
schemas/                  — JSON schemas (command envelope, provider, session, theme, layout)
docker/                   — Docker Compose for workstation and VPS
docs/                     — All contract docs and research
docs/proof/               — Evidence artifacts (screenshots, audit logs, gate pass/fail)
docs/research/            — Agent research reports
prompts/                  — Agent prompts
tools/                    — Dev/operator tooling
```

## Hard rules for every agent

1. No credentials anywhere in code, docs, logs, screenshots, git history, or TV local storage.
2. No direct provider API calls from the Tizen/web TV app — all data from hermestv.local backend.
3. No AI API call that carries credential or user-private data.
4. Every UI mutation goes through `schemas/ui-command.schema.json` command envelope.
5. Mom's TV is NEVER artificially limited.
6. The design target is QN85/QN95 QLED. UN-class TVs receive graceful degradation only. Performance on UN-class TVs is not guaranteed to be smooth.
7. The project is built for the 85" and 95" Samsung QLED TVs at full enhanced tier capacity.
8. Claims require proof. Screenshots, CLI output, schema validation — not assertions.
9. Mark unverifiable findings `<!-- NEEDS VERIFICATION: <what to check> -->` rather than guessing.
10. Provider claims require live-provider proof: non-zero catalog, real provider
   registry, play ticket, stream response, sanitized proof artifacts, and no
   skipped provider-live path.
11. E2E/release claims require the remaining E2E contract: web build, Tizen
   packaged API/player proof, source-health/EPG alignment, CI/deploy gates, and
   sanitized proof artifacts.
12. Reference-app work must use tests and behavior contracts first. Do not copy
   GPL/AGPL/uncleared source into HermesTV.
