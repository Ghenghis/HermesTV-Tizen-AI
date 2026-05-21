# CLAUDE_REFERENCE_APPS_E2E_SWARM_PROMPT - HermesTV Reference Apps E2E

Use this prompt when Claude or agents need to use `G:\Github\IPTV-Apps` to
finish HermesTV end to end. The goal is not another audit. The goal is to turn
working reference-app behavior into HermesTV tests, implementation, and proof.

## Read First

Read these files in order:

1. `docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md`
2. `docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md`
3. `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`
4. `docs/FEATURE_GAP_2026.md`
5. `prompts/CLAUDE_E2E_20_AGENT_SWARM_PROMPT.md`

Then inspect only the reference paths needed for your assigned lane. Do not
bulk-copy source from `G:\Github\IPTV-Apps`.

## Mission

Make HermesTV robust against real IPTV provider behavior by adopting useful
patterns from working apps:

- IPTVnator: MIT-licensed Xtream fixture server, EPG progress, diagnostics.
- Extreme-InfiniTV: real-world M3U, EPG, player-runtime test behavior.
- ynotv: provider/source/channel/EPG/player architecture and failover model.
- NuvioWeb: shared web app plus thin Tizen/webOS wrapper build/sync pattern.

Every claim must be backed by tests or proof artifacts. Route existence does
not count. Mock/stub/placeholder success does not count. Fixture proof does not
count as live-provider proof.

## Hard Rules

1. No secrets in code, logs, docs, screenshots, browser storage, or proof.
2. Do not read `G:\private` or any operator vault path.
3. Do not copy GPL/AGPL/uncleared source into HermesTV.
4. MIT code may be adapted only with license/attribution preserved.
5. Add tests before or with implementation for each adopted behavior.
6. Provider-live proof must fail on no provider, empty catalog, or skipped
   playback.
7. Unsupported features must return honest unsupported status.
8. Do not let fixture provider proof replace live provider proof.

## 20-Agent Assignment

Agent 01 - Truth Lead And Integrator

- Owns the proof ledger and final merge report.
- Maintains the pass/fail/blocker list.
- Rejects any "done" claim without proof.
- Confirms license risk for every reference-app adoption.

Agent 02 - Fixture Provider Proof

- Use IPTVnator's Xtream mock-server pattern as the reference.
- Add a HermesTV fixture provider runner/server if missing.
- Prove fixture config -> providers -> catalog -> search -> play -> stream.
- Label all results `fixture`, never `live`.

Agent 03 - Live Provider Proof

- Own `tools/test-provider-e2e.js` live mode.
- It must fail on no configured provider, empty catalog, skipped play, or stream
  non-response.
- Sanitize all artifacts.

Agent 04 - Provider Registry Schema

- Extend registry/config shape only where needed.
- Consider `additional_epg_urls`, `user_agent`, `referer`, `epg_timeshift_hours`,
  `preferred_stream_type`, `backup_urls`, `enabled`, `display_order`,
  `advanced_epg_matching`, and provider account fields.
- Keep `/api/providers` masked.

Agent 05 - M3U Real-World Parser

- Port behavior from Extreme-InfiniTV tests into Hermes tests.
- Cover BOM/CRLF, header EPG URLs, `#EXTGRP`, unquoted attrs, escaped/malformed
  quotes, `#EXTVLCOPT`, catchup, `tvg-chno`, radio, orphan URLs, HLS sublists.
- Then fix `m3uClient`.

Agent 06 - Xtream Completeness

- Prove account info, live/VOD/series categories, live/VOD/series streams,
  series info, short/full EPG, output formats, auth failure, and per-provider
  cache separation.
- Ensure stream URLs are never returned to clients.

Agent 07 - Stalker/Ministra Reality Check

- Determine whether HermesTV should implement now or explicitly mark
  unsupported.
- If implemented, add MAC/session/token tests and no-secret proof.
- If not implemented, ensure UI/API says unsupported honestly.

Agent 08 - EPG Import And Mapping

- Use Extreme-InfiniTV and ynotv as behavior references.
- Implement/prove multi-source XMLTV, gzip detection, Xtream `xmltv.php`,
  M3U header EPG, additional URLs, waterfall merge, timeshift, fuzzy matching,
  and ambiguity rejection.
- Programs must map to playable catalog IDs.

Agent 09 - Source Health Truth

- Remove static Apollo/xTreme-only assumptions.
- Source-health must consume provider registry/catalog source IDs.
- Distinguish disabled, unconfigured, bad credentials, unreachable, stale,
  untested, degraded, and healthy.

Agent 10 - Playback Proxy And Headers

- Cover HLS manifests, relative/absolute segments, rendition URIs, TS/MP4 byte
  streams, redirects, Range/HEAD, expired tickets, SSRF block.
- Carry allowed user-agent/referrer metadata server-side.
- Never expose upstream URLs.

Agent 11 - Playback Diagnostics

- Add or improve diagnostics using reference patterns.
- Report MIME, status, redirect, range support, latency, provider status,
  likely failure cause, and safe user message.
- No credentials in diagnostics.

Agent 12 - Player Features

- Add or prove audio track picker, subtitle picker, subtitle styling, sidecar
  subtitles, aspect ratio, loudness toggle, retry/failover display.
- Tizen AVPlay path must remain ticket-only.

Agent 13 - Catchup And Timeshift

- Implement or honestly block catchup.
- Xtream catchup must use provider archive fields, EPG history, and safe
  timeshift URL construction.
- `POST /api/catchup/play` cannot remain fake success.

Agent 14 - DVR And Downloads

- Either implement real byte-writing pipelines or keep all UI/API status
  explicitly unsupported.
- A queued envelope is not enough. Proof requires bytes written, file readback,
  cancel/failure handling, and secret-safe paths.

Agent 15 - Web Provider UX

- Provider add/list/test, QR setup URL, source-health, bad credentials, disabled
  provider, no-provider empty state, catalog/search/detail/play must work in
  browser proof.
- No hard-coded provider assumptions.

Agent 16 - Tizen Wrapper Proof

- Use NuvioWeb as wrapper pattern reference.
- Prove API base, CSP, CORS, WGT inspection, remote navigation, AVPlay/ticket
  path, and no upstream URL in bundle/storage/logs.

Agent 17 - Catalog UX Parity

- Prove categories/groups, hide/reorder, favorites-only, HD/has-EPG/has-catchup
  filters, VOD/series browse, recently watched, continue watching, and watchlist
  against real or fixture provider data.

Agent 18 - Metadata And Logos

- Track TMDB/TVDB/FanArt/picon enrichment.
- Implement only if API keys/config are cleanly server-side and optional.
- Otherwise document as blocked, not fake.

Agent 19 - CI Gates

- Add separate jobs for no-provider empty state, fixture provider proof, and
  live provider proof.
- Provider-live job must not pass on skip.
- Upload sanitized proof artifacts.

Agent 20 - Security, License, And Docs

- Run secret scans.
- Verify proof artifacts.
- Update operator docs with exactly what is implemented, unsupported, blocked,
  and how to run proof.
- Confirm GPL/AGPL/uncleared source was not copied.

## Required Final Report

Each agent must report exactly:

```text
Agent:
Reference apps consulted:
Hermes files changed:
Implemented:
Honestly unsupported:
Blocked:
Tests/proof run:
Proof artifacts:
Secrets exposed: YES/NO
License risk: NONE / PATTERN-ONLY / NEEDS REVIEW
Next required lane:
```

The integrator must produce one final summary that separates:

- backend unit proof
- fixture provider proof
- live provider proof
- web proof
- Tizen proof
- unsupported features
- blockers

No "mostly done" language. Mark each item PASS, FAIL, UNSUPPORTED, or BLOCKED.
