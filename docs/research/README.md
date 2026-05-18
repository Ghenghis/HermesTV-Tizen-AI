# docs/research/

Agent research reports for the HermesTV Tizen AI project.

Each file corresponds to one of the 24 agent lanes defined in `docs/00_MASTER_CONTRACT_CLAUDE_20_AGENT_SWARM.md`.

## Files

| File | Agent | Status |
|---|---|---|
| `agent-01-github-iptv-projects.md` | Agent 01 — Samsung TV Model Research | Audited |
| `agent-02-tizen-os-capabilities.md` | Agent 02 — Tizen CLI + Sideload Pipeline | Audited (NEEDS VERIFICATION flags added) |
| `agent-03-sota-features-may2026.md` | Agent 03 — NuvioWeb Pattern Audit | Audited |
| `agent-04-ai-agent-interaction-patterns.md` | Agent 04 — NuvioTVTizen Wrapper Audit | Audited |
| `agent-05-named-profiles-agent-personas.md` | Agent 05 — TizenBrew Installer Audit | Audited |
| `agent-06-epg-content-discovery.md` | Agent 06 — EPG + Schedule Intelligence | Audited |
| `agent-07-tv-model-capability.md` | Agent 07 — QN85Q7FAAFXZA + UN55CU8000BXZA Model Research | Complete (NEEDS VERIFICATION on Chromium/Tizen sub-version) |
| `agent-08-tizen-build-sideload.md` | Agent 08 — Tizen Studio CLI 5.6, .wgt Build, Sideload Pipeline | Complete |
| `agent-09-iptv-ux-research.md` | Agent 09 — IPTV UX SOTA Research (14 apps audited) | Complete |
| `agent-10-provider-catalog-research.md` | Agent 10 — IPTV Provider Catalog (Xtream Codes / M3U Protocol) | Complete (NEEDS VERIFICATION flags present) |
| `agent-11-backend-vps-isolation.md` | Agent 11 — Backend VPS Isolation, Tailscale, Caddy, Resource Estimates | Complete |
| `agent-12-security-no-secret-audit.md` | Agent 12 — Security + No-Secret Audit (47 files, 5 warnings) | Complete — W-01..W-04 remediated |
| `agent-13-nuvio-source-audit.md` | Agent 13 — NuvioWeb Hosted-App Pattern, Stremio WASM, Scoped Storage | Complete |

## NEEDS VERIFICATION markers

Files that contain `<!-- NEEDS VERIFICATION -->` require on-device testing or operator confirmation before the finding can be promoted to a contract commitment. Do not remove these markers without providing the actual verified evidence.

## Rules

- Research docs must not contain real provider URLs, credentials, tokens, or Xtream data
- Findings must be specific — no generic "Samsung TVs support X" claims without TV model evidence
- Every research doc must have a Conclusion section stating what contracts can rely on vs. what needs verification
