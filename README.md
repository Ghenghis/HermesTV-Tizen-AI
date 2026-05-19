# HermesTV Tizen AI — Claude Agent Contract Kit

[![HermesTV CI](https://github.com/Ghenghis/HermesTV-Tizen-AI/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Ghenghis/HermesTV-Tizen-AI/actions/workflows/ci.yml)
[![Deploy VPS](https://github.com/Ghenghis/HermesTV-Tizen-AI/actions/workflows/deploy-vps.yml/badge.svg?branch=main)](https://github.com/Ghenghis/HermesTV-Tizen-AI/actions/workflows/deploy-vps.yml)

Repository target:

- Local: `G:\Github\HermesTV-Tizen-AI`
- GitHub: `https://github.com/Ghenghis/HermesTV-Tizen-AI`

Purpose: design and build a private-household Samsung Tizen IPTV/AI experience for Dave and Mom, with a thin Tizen TV app, a VPS/workstation backend brain, rich IPTV catalog organization, quality tagging, memory, Azure voice, and an extreme TV-first UX customization system.

## Hard direction

The Samsung TV app must stay lightweight. The backend must do the heavy work.

```text
Samsung Tizen app
  - renders catalog and player
  - handles remote/focus/navigation
  - shows quality badges and floating chatbot
  - applies theme/layout/profile commands
  - plays one primary stream safely

HermesTV backend
  - provider credential vault and playlist ingest
  - M3U/Xtream/XMLTV normalization
  - EPG cleanup and catalog enrichment
  - ffprobe quality scan and fake/upscaled detection hints
  - profile memory for Dave and Mom
  - AI routing via Open WebUI/Pipelines/MiniMax/DeepSeek/SiliconFlow/Ollama/LM Studio
  - Azure voice generation
  - safe JSON UI command router
```

## Two real target TVs that MUST be researched and tested

1. Mom's new TV: `QN85Q7FAAFXZA`
2. Dave's older TV: `UN55CU8000BXZA`

No layout, playback, remote, voice, memory, or performance decision is accepted until both models are explicitly researched and then validated on-device.

## Must-read files

1. `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md`
2. `docs/02_TV_MODEL_RESEARCH_LOCK_QN85Q7F_UN55CU8000.md`
3. `docs/03_UX_UI_EXTREME_CUSTOMIZATION_CONTRACT.md`
4. `docs/04_LAYOUT_LIBRARY_12_STATIC_MODES.md`
5. `docs/05_THEME_BACKGROUND_ENGINE_CONTRACT.md`
6. `docs/06_AGENTIC_UI_CONTROL_SAFE_JSON_SCHEMA.md`
7. `docs/10_ACCEPTANCE_GATES_VISUAL_RUNTIME_SECURITY.md`
8. `prompts/CLAUDE_MASTER_PROMPT.md`

## First Claude run

Use `prompts/CLAUDE_MASTER_PROMPT.md` first. Then split work across the 24 agents listed in `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md`.

## Safety and boundaries

This project is for private lawful subscriptions, personal media, public/free lawful streams, and user-owned provider credentials. Do not build bypass, cracking, scraping, credential sharing, unauthorized redistribution, or public restreaming features.
