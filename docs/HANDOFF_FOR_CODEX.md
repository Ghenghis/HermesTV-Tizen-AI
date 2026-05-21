# CODEX HANDOFF — DaveTV Release Push

> **Status snapshot (2026-05-20):** 20-agent reference-app extraction swarm complete. Server provider-truth core passes (last live proof 12 PASS / 0 FAIL at `docs/proof/provider-truth/20260520-195404/summary.md`). Empty-state + live-provider CI gates separated. 10 FAIL + 15 PENDING items remain in `docs/audit/RELEASE_CHECKLIST.md`. DNS swap `tv.daveai.tech → HermesTV VPS` pending operator (task #48).

> **You are a Codex agent walking in cold.** Everything you need to act safely and correctly is in this document or in the files it cites. Do not skim — the hard rules in §1 are user-mandated and binding. Violating any of them invalidates your work.

---

## 0. Read these documents FIRST (in this order)

**Contracts (binding):**
1. [docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md](46_PROVIDER_TRUTH_PROOF_CONTRACT.md) — registry → catalog → play → stream + sanitized proof artifacts
2. [docs/47_REMAINING_E2E_COMPLETION_CONTRACT.md](47_REMAINING_E2E_COMPLETION_CONTRACT.md) — empty-state vs live-provider proof + CI gate separation
3. [docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md](48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md) — pattern-only adoption, license boundaries
4. `docs/49_*` if present — supplemental release-day items (audits reference clauses P0-4, P0-8, P1)

**Reference-app extracts (16 docs, pattern catalogue for the IPTV domain):**
- [00_ARCHITECTURE_OVERVIEW.md](reference-apps/00_ARCHITECTURE_OVERVIEW.md) — cross-repo topology of `G:\Github\IPTV-Apps`
- `01..03` — IPTVnator (MIT): Xtream fixture, playback diagnostics, EPG data layer
- `04..07` — Extreme-InfiniTV (GPL): M3U parser, stream diagnostics, preferences schema, EPG mapping
- `08..11` — ynotv (AGPL, architecture-only): core types, EPG streaming, failover groups, stream resolver
- `12..13` — NuvioWeb (license unstated, treat as restrictive): Tizen wrapper, shared web app
- [E2E_FLOW_DIAGRAMS.md](reference-apps/E2E_FLOW_DIAGRAMS.md) — 8 mermaid sequence diagrams covering QR onboarding → catalog → play → EPG → CI
- [LICENSE_ATTRIBUTION.md](reference-apps/LICENSE_ATTRIBUTION.md) — attribution text + risk register

**Audits (state of the code right now):**
- [docs/audit/SERVER_GAPS.md](audit/SERVER_GAPS.md) — hermes-tv-api release-blocker inventory
- [docs/audit/WEB_APP_GAPS.md](audit/WEB_APP_GAPS.md) — hermes-web-tv: 21 PASS / 2 PARTIAL / 1 FAIL
- [docs/audit/TIZEN_APP_GAPS.md](audit/TIZEN_APP_GAPS.md) — AVPlay not invoked + signed `.wgt` missing
- [docs/audit/RELEASE_CHECKLIST.md](audit/RELEASE_CHECKLIST.md) — 74 PASS / 10 FAIL / 15 PENDING with file:line evidence

---

## 1. Hard rules (non-negotiable)

User-mandated. If your change violates any of these, the user will reject it and you will have wasted the round-trip.

- **No mocks, no stubs, no placeholders, no seed catalogs, no "coming soon" rails.** Every code path runs against a real provider/API. Empty state on error, never fake content. Enforced by contracts 46 + 47.
- **No popups before playback.** Click a card → video plays. No source picker, quality slider, "More Like This" rail, or Watch/Record modal between click and play.
- **Never echo or commit credentials.** `.env*`, `G:\Github\DaveAI-IPTV\private`, GH secret values, provider URLs with embedded user/pass — none of these may appear in logs, responses, proof artifacts, markdown, or chat. Mask as `[REDACTED]` or `<USER>`/`<PASS>`.
- **Azure TTS is the ONLY voice output.** Browser SpeechSynthesis is forbidden. Bixby is forbidden for AI/TTS/memory/personality. Samsung mic = optional input capture only.
- **Asymmetric performance: Mom's TV (Sherri profile) is NEVER capped.** Universal limits apply only to Dave's profile. Helper: [apps/hermes-web-tv/src/utils/isSystemLimited.js](../apps/hermes-web-tv/src/utils/isSystemLimited.js).
- **QN-class QLED is the design target.** All enhancements ship there. UN-class TVs get graceful degradation only.
- **License boundaries.** No source paste over 5 lines from MIT/GPL/AGPL reference apps. AGPL (ynotv) is architecture-only. Unstated (NuvioWeb) is conservative pattern-only.
- **No skip counts as PASS in provider-live CI.** Empty-state lane allows pass-skip with explicit `NO_PROVIDER_EMPTY_STATE=1` annotation; the live lane does not.

---

## 2. Top release blockers (work top-to-bottom)

Each item cites the audit doc + file:line that established it. Close one, run `npm test`, push, repeat.

| # | Blocker | Source | Fix scope |
|---|---------|--------|-----------|
| 1 | **Jellyfin items unplayable** | SERVER_GAPS §3.4 | `services/hermes-tv-api/src/lib/streamResolver.js` has no `jellyfin-*` branch → 503. Add the branch (use `jellyfinClient.js` if present) or drop Jellyfin from `/api/catalog`. |
| 2 | **DVR / Downloads / Catch-up UI lies** | SERVER_GAPS §11.1, §11.2 | `services/hermes-tv-api/src/routes/catchup.js:21` returns success envelopes without writing bytes. Either ship the byte pipelines or gate the UI behind a release feature flag in `apps/hermes-web-tv/src/components/{DownloadModal,RecordingsSection,CatchupRail}.jsx`. |
| 3 | **AVPlay never invoked on Tizen** | TIZEN_APP_GAPS #1 | `apps/hermes-web-tv/src/components/PlayerModal.jsx:6` imports `useHlsStream` not `useAvplayStream`. Swap, sideload, capture `sdb dlog`. |
| 4 | **`setupProviderRestart.e2e.test.js` missing** | RELEASE_CHECKLIST doc 49 P0-4 | Author `services/hermes-tv-api/test/setupProviderRestart.e2e.test.js` covering form submit → restart → catalog → play → stream bytes. Append to `services/hermes-tv-api/package.json:10` test chain. |
| 5 | **Two competing Tizen scaffolds** | TIZEN_APP_GAPS #5 | Delete `apps/hermes-tv-tizen-native/` or add a build guard. Canonical = `apps/hermes-tv-tizen/`. |
| 6 | **`sourceHealth` ignores disk-backed providers** | SERVER_GAPS §1.6 | `services/hermes-tv-api/src/routes/sourceHealth.js` hard-codes `apollo_group` + `xtremehd` env keys. Rewrite to walk `providerRegistry.listFull()`. |
| 7 | **`credentialGuard` missing `m3u_plus` pattern** | SERVER_GAPS §10.8 | Divergence with `sanitizeLog.FORBIDDEN_PATTERNS`. Add `/m3u_plus/i` to `services/hermes-tv-api/src/lib/credentialGuard.js` + a test exercising both layers with the same payload. |
| 8 | **EPG mapping + settings in-memory only** | SERVER_GAPS §5.8, §5.9 | `services/hermes-tv-api/src/routes/epg.js` `EPG_MAPPING` / `EPG_SETTINGS` wipe on restart. Persist via the atomic-write pattern in `providerStore.js`. |
| 9 | **`hermestv_dev_mock` localStorage flag ships to prod** | WEB_APP_GAPS #4 | `apps/hermes-web-tv/src/App.jsx:938-941`. Gate behind `import.meta.env.DEV` or remove. |
| 10 | **IptvnatorShell still renders placeholder EPG** | WEB_APP_GAPS #5 | `apps/hermes-web-tv/src/shells/IptvnatorShell.jsx:88-94` uses `_placeholderNow(channel)`. Port the `/api/epg/grid` fetch pattern from `LiveTVShell.jsx:212-225` (~30 lines). |

---

## 3. Recommended first task per agent

Assign in this order. Each row is fully self-contained — an agent can take one row and ship a PR.

| Agent | Task | Files to touch | Acceptance |
|-------|------|----------------|------------|
| A1 | Jellyfin stream resolver branch | `services/hermes-tv-api/src/lib/streamResolver.js`, `services/hermes-tv-api/src/integrations/jellyfin.js`, new test | `/api/play` on a Jellyfin item returns 200 with valid `Content-Type` |
| A2 | DVR/Downloads/Catch-up UI gate | `apps/hermes-web-tv/src/components/{DownloadModal,RecordingsSection,CatchupRail}.jsx`, feature flag config | UI affordance hidden until backend ships; routes return 501 honestly |
| A3 | Tizen AVPlay swap | `apps/hermes-web-tv/src/components/PlayerModal.jsx`, `apps/hermes-web-tv/src/main.jsx` (install `installTizenLifecycle()`) | `sdb dlog` shows AVPlay engine, hardware decoder used on QN85 |
| A4 | `setupProviderRestart.e2e.test.js` | new test file + append to `services/hermes-tv-api/package.json` test script | `npm test` passes including the new chain |
| A5 | Tizen scaffold consolidation | delete `apps/hermes-tv-tizen-native/` or add `npm run package` refuse-guard | only canonical path can produce `.wgt` |
| A6 | `sourceHealth` walks registry | `services/hermes-tv-api/src/routes/sourceHealth.js`, `sourceHealthAggregator.js` | response includes every `prov-<hex>` disk row |
| A7 | `credentialGuard` `m3u_plus` pattern | `services/hermes-tv-api/src/lib/credentialGuard.js`, new test | redaction equivalence between `credentialGuard` and `sanitizeLog` |
| A8 | EPG mapping persistence | `services/hermes-tv-api/src/routes/epg.js`, new `services/hermes-tv-api/src/lib/epgMappingStore.js` | mappings survive process restart (`npm run dev` cycle proof) |
| A9 | Remove `hermestv_dev_mock` flag | `apps/hermes-web-tv/src/App.jsx:938-941` | flag inert in prod build; dev-only gate verified |
| A10 | IptvnatorShell EPG fetch | `apps/hermes-web-tv/src/shells/IptvnatorShell.jsx:88-94` | renders real `/api/epg/grid` data; no `_placeholderNow` remains in repo |

---

## 4. Test + CI commands

**Local (must pass before any PR):**
```
cd services/hermes-tv-api && npm test
```
The full chain currently runs 18 test files (see `services/hermes-tv-api/package.json:10`). New tests must be appended in dependency order.

**Empty-state proof (no provider creds required):**
```
NO_PROVIDER_EMPTY_STATE=1 node tools/test-e2e-smoke.js
```
Empty catalog passes only when the env flag is set + the log contains the literal `NO_PROVIDER_EMPTY_STATE=1` annotation (defense-in-depth in `tools/test-e2e-smoke.js`).

**Live-provider proof (operator runs in CI via workflow_dispatch):**
```
GH Actions → "CI" → Run workflow → run_provider_live=true
```
Uses GH secrets `XTREAM_URL`, `XTREAM_USERNAME`, `XTREAM_PASSWORD` (and / or `APOLLO_M3U_URL`, `XTREMEHD_M3U_URL`). Failures must NOT be skipped. Uploads `docs/proof/provider-truth/` artifacts to the workflow run.

**VPS deploy with post-deploy live proof:**
```
GH Actions → "Deploy VPS" → workflow_dispatch with run_provider_live=true
```
Runs `tools/test-provider-e2e.js` against `PRIMARY_HOST` after deploy. Uploads `provider-truth-vps-<run_id>` artifact.

**Artifact format:**
- `docs/proof/provider-truth/<YYYYMMDD-HHMMSS>/summary.md` — sanitized live proof (no URL/user/pass/token)
- `docs/proof/provider-truth/<YYYYMMDD-HHMMSS>/<step>.json` — per-step evidence with redacted strings

---

## 5. Owner-action items (human only — do NOT attempt as an agent)

1. **DNS swap**: `tv.daveai.tech → HermesTV VPS` (task #48).
2. **Trigger workflow_dispatch live proof**: GH Actions → CI → Run workflow → `run_provider_live=true`. Required before each release.
3. **Sideload signed Tizen `.wgt` on QN85**: produce signed package via Samsung Tizen Studio CLI, archive screenshots to `docs/proof/tizen/<date>/`.
4. **Rotate secrets if exposed**: any time bash error logs may have leaked, rotate via `gh secret set NAME` using stdin pipe (`awk … | gh secret set NAME`), never `echo`.
5. **File upstream license issue with NuvioWeb**: request explicit license; current treatment is conservative restrictive.

---

## 6. License risk register

| Reference app | License | DaveTV adoption | Risk | Hard rule |
|---------------|---------|-----------------|------|-----------|
| iptvnator | MIT | Xtream fixture pattern, EPG override pattern, playback diagnostics taxonomy | LOW | Standard MIT attribution in CREDITS |
| Extreme-InfiniTV | GPL-3.0-or-later | M3U parser test cases, EPG behavior contracts, settings schema delta | LOW | Pattern-only; no GPL source paste >5 lines |
| ynotv | AGPL-3.0 | Type contracts, EPG streaming, failover, stream resolver | LOW | Architecture-only; never paste source. Any future PR touching `epgWaterfall.js`, `catalogMerge.js`, `streamProbe.js`, or `play.js` should be diff'd against ynotv to confirm no incidental verbatim copying |
| NuvioWeb | UNSTATED | Tizen sync pipeline pattern, FocusEngine, RouteStateStore | **HIGH** | Conservative pattern-only until upstream clarifies. File an upstream issue requesting license |

Full text in [LICENSE_ATTRIBUTION.md](reference-apps/LICENSE_ATTRIBUTION.md) including ready-to-ship CREDITS entries.

---

## 7. Project memory + context

- **Users**: Mom = Sherri, Dad = Dave. Both support nickname override. Default agent name "Hermes" (renamable per profile).
- **Tier policy**: QN-class QLED = enhanced (full features). UN-class = graceful degradation only. User also uses Samsung TV as PC monitor.
- **Voice**: Azure TTS server-only. Bixby forbidden. Samsung mic optional input capture only.
- **Private folder**: `G:\Github\DaveAI-IPTV\private` holds operator IPTV credentials. Read to inform actions, never echo to chat, never commit.
- **Dynamic UX Shell architecture**: 7+ switchable layouts via shell engine; CSP must allow `localhost:3001` in dev.
- **Today's date**: 2026-05-20. Convert all relative dates to absolute when writing or persisting.

---

## 8. Acceptance criteria for release

From [RELEASE_CHECKLIST.md](audit/RELEASE_CHECKLIST.md), the binary criteria are:
- All 10 FAIL items become PASS
- All 15 PENDING items become PASS, FAIL, or explicitly deferred with operator sign-off
- `docs/proof/provider-truth/<latest>/summary.md` shows ≥1 live provider with ≥1 PASS catalog item + ≥1 PASS stream-bytes step
- `npm test` passes including all new chain tests
- `e2e-smoke-empty-state` lane passes by default in CI
- `provider-live` lane passes when triggered via workflow_dispatch with secrets
- Signed Tizen `.wgt` sideloaded on QN85 with playback screenshot proof
- DNS `tv.daveai.tech` resolves to VPS
- License-attribution spot-review confirms no source paste >5 lines in DaveTV repo

---

## 9. Anti-patterns observed in DaveTV — do NOT re-introduce

Already purged in waves 14–18, do not bring back:
- Seed catalogs / `mockApi.js` / `catalog.mock.json` / `seedCatalog.js`
- Streaming Quality slider before playback (`MediaDetailPanel.jsx`)
- Picsum stock photos
- iptv-org source picker popup before playback
- "More Like This" rail before playback
- Hardcoded `hermestv.local` fallback URLs

Plus from reference-app audit findings, do NOT adopt:
- NuvioWeb's `MetaDetailsScreen → StreamScreen` (addon × quality picker) popup-before-playback flow
- IPTVnator's per-channel quality picker
- Any "always-green" CI cheat path (e.g. the `hermestv_dev_mock` localStorage flag — see blocker #9)

---

## 10. Quick file index

| Concern | File |
|---------|------|
| Provider truth (env+disk merge) | `services/hermes-tv-api/src/lib/providerRegistry.js` |
| Provider disk persistence | `services/hermes-tv-api/src/lib/providerStore.js` |
| Channel → playable URL | `services/hermes-tv-api/src/lib/streamResolver.js` |
| HLS proxy + cred-bearing rewrite | `services/hermes-tv-api/src/lib/hlsProxy.js` |
| EPG waterfall pure helpers | `services/hermes-tv-api/src/lib/epgWaterfall.js` (106 PASS tests) |
| Cross-provider catalog merge | `services/hermes-tv-api/src/lib/catalogMerge.js` |
| Response sanitization | `services/hermes-tv-api/src/lib/credentialGuard.js` |
| Log redaction | `services/hermes-tv-api/src/lib/sanitizeLog.js` |
| Provider CRUD route | `services/hermes-tv-api/src/routes/providers.js` |
| QR pairing route | `services/hermes-tv-api/src/routes/pairing.js` |
| Setup wizard route | `services/hermes-tv-api/src/routes/setup.js` |
| Play resolution + ticket | `services/hermes-tv-api/src/routes/play.js` |
| EPG waterfall + grid | `services/hermes-tv-api/src/routes/epgGrid.js` |
| Source health aggregator | `services/hermes-tv-api/src/routes/sourceHealth.js` |
| Sanitized proof generator | `tools/test-provider-e2e.js` |
| Empty-state smoke | `tools/test-e2e-smoke.js` |
| Local Xtream fixture (CI) | `tools/xtream-fixture-server.js` |
| Empty-state + live CI gates | `.github/workflows/ci.yml` |
| VPS deploy + post-deploy proof | `.github/workflows/deploy-vps.yml` |
| Web shell entry | `apps/hermes-web-tv/src/App.jsx` |
| API client (web) | `apps/hermes-web-tv/src/api/hermesApi.js` |
| Player modal | `apps/hermes-web-tv/src/components/PlayerModal.jsx` |
| QR onboarding component | `apps/hermes-web-tv/src/components/QROnboarding.jsx` |
| Tizen wrapper (canonical) | `apps/hermes-tv-tizen/` |
| Tizen lifecycle helper | `apps/hermes-web-tv/src/utils/tizenLifecycle.js` |
| Tizen remote keymap | `apps/hermes-web-tv/src/utils/tizenKeyMap.js` |

---

## 11. End-of-shift checklist (each agent, before reporting "done")

1. Cite `file:line` for every change in your PR body.
2. Add or update a test that proves the change works.
3. Verify `cd services/hermes-tv-api && npm test` passes.
4. Verify no credential strings in any file you touched — `git diff | grep -iE 'password|token|api[_-]?key|user='` and confirm only masked values.
5. Update the relevant row in [RELEASE_CHECKLIST.md](audit/RELEASE_CHECKLIST.md) for the clause you closed (PASS / FAIL / PENDING + new evidence).
6. Commit message format: `<type>(<scope>): <short summary>` with a body explaining WHY (not what — the diff is what).
7. If you discovered a new gap, file it: append a row to the appropriate audit doc with `file:line` and proposed fix.

---

## 12. If you are stuck or need to escalate

- **Truth/proof contract ambiguity** → re-read docs/46, 47, 48 + check `tools/test-provider-e2e.js` for the canonical interpretation.
- **License question** → default to "more restrictive" interpretation, ask in PR description, do not paste source until human confirms.
- **Credential anywhere in your output** → STOP, redact, never commit. If already committed, rotate the secret + force-push via human operator.
- **Mom's TV degraded somewhere** → check `isSystemLimited.js` is consulted before any cap; this is binding.
- **Popup before playback** → user feedback `[[feedback_playback_no_popups]]` is binding — strip the popup, ship direct play.

Good luck. Ship truth, prove it, never fake content.
