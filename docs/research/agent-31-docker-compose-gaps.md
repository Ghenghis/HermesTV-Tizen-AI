# Lane 18 — Docker/Compose Gaps

**Date:** 2026-05-17
**Branch:** feature/b2-usable-local-mock
**File:** docker/workstation/compose.yml

---

## Summary

The workstation compose correctly configures NVIDIA runtime for both Jellyfin (NVENC/NVDEC) and Ollama (LLM inference). Both use `NVIDIA_VISIBLE_DEVICES: all`. All services have healthchecks. No changes are required to the compose file — it is correctly configured.

---

## NVIDIA GPU Runtime — Jellyfin

```yaml
jellyfin:
  runtime: nvidia
  environment:
    JELLYFIN_PublishedServerUrl: http://hermestv.local:8096
    NVIDIA_VISIBLE_DEVICES: all
    NVIDIA_DRIVER_CAPABILITIES: all
```

| Check | Result | Notes |
|---|---|---|
| runtime: nvidia | PASS | Required for nvidia-container-toolkit GPU pass-through |
| NVIDIA_VISIBLE_DEVICES: all | PASS | Exposes all GPUs (RTX 3090 Ti) to container |
| NVIDIA_DRIVER_CAPABILITIES: all | PASS | Enables all NVENC/NVDEC/video capabilities |
| Healthcheck present | PASS | wget to localhost:8096 |
| Hermestv internal network | PASS |

**Assessment:** Jellyfin is correctly configured for RTX 3090 Ti hardware transcoding via NVENC/NVDEC.

---

## NVIDIA GPU Runtime — Ollama

```yaml
ollama:
  runtime: nvidia
  environment:
    NVIDIA_VISIBLE_DEVICES: all
```

| Check | Result | Notes |
|---|---|---|
| runtime: nvidia | PASS |
| NVIDIA_VISIBLE_DEVICES: all | PASS |
| NVIDIA_DRIVER_CAPABILITIES | NOT SET | Optional for Ollama — it uses CUDA, not video capabilities. Default is sufficient. |
| Healthcheck | NOT PRESENT | Ollama does not expose a simple health endpoint by default. `ollama serve` is the process. Could add a TCP check. |

**Minor gap:** Ollama has no healthcheck defined. This means Docker Compose will report Ollama as always "running" even if the model server is not yet ready. For B3 open-webui which depends_on ollama, this could cause initialization races.

---

## Volume Paths — Operator Customization

| Service | Volume | Note |
|---|---|---|
| Jellyfin | jellyfin-config, jellyfin-cache | Named volumes — portable |
| Jellyfin media | Comment: "Media paths are mounted by operator — not hardcoded here" | PASS — correct approach |
| Tunarr | tunarr-data | Named volume |
| Dispatcharr | dispatcharr-data | Named volume |
| Open WebUI | open-webui-data | Named volume |
| Ollama | ollama-data | Named volume |

All media paths are correctly not hardcoded. The comment explicitly notes this.

---

## .env.example Check

No `.env.example` file was found in `docker/workstation/`. The compose.yml does not reference any `.env` file for the workstation stack (all env vars are hardcoded or passed via service environment blocks). The only sensitive variable in the workstation compose is the JELLYFIN_PublishedServerUrl which is not a secret.

**Assessment:** For the workstation compose, no .env.example is strictly required. However, for the VPS compose, the postgres password needs a secrets file. A README or DEPLOY_GUIDE.md in docker/ would improve this.

---

## Service Network Configuration

```yaml
networks:
  hermestv-internal:
    driver: bridge
    internal: false
```

Note: The workstation network has `internal: false` (allows internet egress). This is intentional — Jellyfin, Ollama, and Open WebUI need internet access for updates, model downloads, and online sync. Unlike the VPS network which uses `internal: true` for the backend services.

---

## hermes-tv-api in Workstation Compose

The workstation compose also runs `hermes-tv-api` as a development instance:
```yaml
hermes-tv-api:
  image: node:20-alpine
  volumes: ['../../services/hermes-tv-api:/app']
  command: npm start
  ports: ['3001:3001']
```

This mounts the local source directly for development. PASS.

---

## Proposed Patch: Ollama Healthcheck (minor improvement)

Since the compose already has `--no-healthcheck` equivalent absence, consider adding:

```yaml
ollama:
  healthcheck:
    test: ["CMD-SHELL", "curl -sf http://localhost:11434/api/version || exit 1"]
    interval: 30s
    timeout: 10s
    retries: 5
    start_period: 30s
```

This is a non-critical improvement — the compose file does not need a patch for B2 to function.

---

## Priority Gap List

| Gap | Priority | Description |
|---|---|---|
| Ollama missing healthcheck | P3 | open-webui depends_on without health condition |
| No DEPLOY_GUIDE.md for workstation | P3 | Prerequisites (nvidia-container-toolkit) not documented in repo |
| No .env.example (VPS stack) | P2 | VPS deploy steps not documented |
