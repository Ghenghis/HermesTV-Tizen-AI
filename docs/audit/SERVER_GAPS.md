# HermesTV API — Server Gaps vs Contracts 46 / 47 / 48

Generated 2026-05-20. Branch `lane-a-provider-registry`. Scope:
`services/hermes-tv-api` + CI/proof tools. Any raw URL, username, password,
token, or paid-provider endpoint is rendered `[REDACTED]`.

---

## 1. Provider Registry (Contract 46 P0 #1, #2; Contract 47 #5)

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 1.1 | `/api/providers` is real registry, not static array | PASS | [providers.js:47-67](services/hermes-tv-api/src/routes/providers.js:47) → [providerRegistry.js:250-263](services/hermes-tv-api/src/lib/providerRegistry.js:250) | — |
| 1.2 | Env + disk merge (single masked shape) | PASS | [providerRegistry.js:64-200](services/hermes-tv-api/src/lib/providerRegistry.js:64) and `source: 'env' \| 'config'` flag at [217-237](services/hermes-tv-api/src/lib/providerRegistry.js:217) | — |
| 1.3 | Saved provider survives restart (durable file) | PASS | [providerStore.js:146-155](services/hermes-tv-api/src/lib/providerStore.js:146) atomic temp+rename → `data/providers.json`; `_load()` reads at [122-144](services/hermes-tv-api/src/lib/providerStore.js:122) | — |
| 1.4 | Masking — no username / password / api_key / raw URL leaks | PASS | [providerRegistry.js:217-237](services/hermes-tv-api/src/lib/providerRegistry.js:217) returns `has_username` / `has_password` / `url_host` only; final res.json guard at [credentialGuard.js:23-69](services/hermes-tv-api/src/middleware/credentialGuard.js:23) | — |
| 1.5 | `/setup/provider/submit` persists durably (was 501) | PASS | [setup.js:293-339](services/hermes-tv-api/src/routes/setup.js:293) routes into `providerStore.add` | — |
| 1.6 | Provider ID drift across codebase (`apollo` vs `apollo_group`, `xtreme` vs `xtremehd`) | PARTIAL | Canonical slugs defined at [providerRegistry.js:44-50](services/hermes-tv-api/src/lib/providerRegistry.js:44); but `routes/sourceHealth.js` still hard-codes a 2-entry list at [sourceHealth.js:37-43](services/hermes-tv-api/src/routes/sourceHealth.js:37) and only knows `apollo_group` / `xtremehd` env vars. Operator-pasted disk providers (`prov-<hex>`) get no per-item probe. | Make `sourceHealth.js` consume `providerRegistry.listFull()` instead of `PROVIDER_ENV_KEYS`. |
| 1.7 | Stalker / Ministra portals (48 §"Provider And Catalog") | FAIL | `providerStore.js` accepts `type: 'stalker'` at [providerStore.js:63](services/hermes-tv-api/src/lib/providerStore.js:63), but [providers.js:158-165](services/hermes-tv-api/src/routes/providers.js:158) returns "not supported yet — paste M3U export URL"; no Stalker client exists in `src/lib/`. | Either implement a stalker portal client or mark the type rejected in `_validateInput` until done. |
| 1.8 | Per-provider user-agent, referrer, backup URLs, failover order (48 §"Provider And Catalog") | FAIL | `providerStore._validateInput` accepts `user_agent` at [providerStore.js:221-225](services/hermes-tv-api/src/lib/providerStore.js:221), but no ingest path consumes it (no grep hit in `m3uClient.js` or `xtreamClient.js`). No `backup_urls`, `failover_priority`, or `referrer` schema field exists. | Wire `row.user_agent` through `m3uClient` / `xtreamClient` fetch headers; add `backup_urls` + `priority` columns and consume them in the resolver. |

## 2. Catalog Truth — No Mocks / Stubs / Seed (Contract 46 P0 #3; Rule 4; 48 §"Provider And Catalog")

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 2.1 | No seed catalog / no synthetic fallback | PASS | [catalog.js:64-72](services/hermes-tv-api/src/routes/catalog.js:64) returns `actors: []`; honest empty enforced at [catalog.js:84-220](services/hermes-tv-api/src/routes/catalog.js:84) via `SRC_NONE = 'no-providers'`. | — |
| 2.2 | One catalog item contract with `providers` + `sources` + `preferred_source` | PARTIAL | `catalogMerge.mergeByTitle` emits `sources[]` (used at [catalog.js:184-204](services/hermes-tv-api/src/routes/catalog.js:184)) and `/api/play` consumes `sources[]` at [play.js:121-164](services/hermes-tv-api/src/routes/play.js:121). But `preferred_source` is not surfaced — the consumer infers priority from array order only. | Add explicit `preferred_source` field (or rename `sources[0]`) so the UI can render a non-positional badge. |
| 2.3 | Hide-providers filter handles both hyphen and underscore variants | PASS | [catalog.js:229-246](services/hermes-tv-api/src/routes/catalog.js:229) | — |
| 2.4 | `_meta.source` distinguishes `jellyfin` / `iptv-org` / `providers` / `merged` / `no-providers` | PASS | [catalog.js:33-39](services/hermes-tv-api/src/routes/catalog.js:33) constants used through [catalog.js:84-220](services/hermes-tv-api/src/routes/catalog.js:84). | — |
| 2.5 | Search hydration → detail → watch path (47 #7) | UNKNOWN | `src/routes/search.js` exists and tests cover `catalogProviders.test.js` for `/api/catalog`, but no dedicated test asserts `search → detail → /api/play` hydration. | Add a service test that POSTs the search result item_id straight to `/api/play` and verifies `200 + ticket + sources[]`. |

## 3. Play Resolution — Xtream, M3U, Jellyfin, IPTV-org (Contract 46 P0 #4; Contract 47 #8, #9, #10)

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 3.1 | M3U ID prefix dispatch (`m3u-*`) | PASS | [streamResolver.js:87-90](services/hermes-tv-api/src/lib/streamResolver.js:87) treats every `m3u-*` as `alwaysCredBearing = true`. | — |
| 3.2 | Xtream ID prefix dispatch (`xtream-*`) | PASS | [streamResolver.js:91-97](services/hermes-tv-api/src/lib/streamResolver.js:91) — uses `xtreamClient.internal.resolveStreamUrl` and forces credential-bearing. | — |
| 3.3 | iptv-org ID prefix dispatch (`iptv-*`) | PASS | [streamResolver.js:98-103](services/hermes-tv-api/src/lib/streamResolver.js:98) — strips prefix, defers to `iptvOrg.internal.resolveStreamUrl`. | — |
| 3.4 | Jellyfin ID prefix dispatch | FAIL | `streamResolver.js` has no `jellyfin-*` branch; `lib/jellyfin.js` exposes `fetchCatalog` but `streamResolver.resolveStreamUrl` returns `null` for jellyfin items → `/api/play` issues `503 no_provider_configured`. Contract 46 §"Definition Of Finished" item 6 explicitly demands Jellyfin works through the same source contract OR is marked unsupported. | Either wire `jellyfin-*` IDs through `streamResolver` to a Jellyfin Playback URL endpoint, or have `lib/jellyfin.js` skip emitting items that cannot be resolved (`sources: []`) so they never reach `/api/play`. |
| 3.5 | Direct byte-stream proxy (.ts not HLS) | PASS | `proxyDirectStream` at [hlsProxy.js:364-468](services/hermes-tv-api/src/lib/hlsProxy.js:364); dispatched from [play.js:482-509](services/hermes-tv-api/src/routes/play.js:482). | — |
| 3.6 | Auto-fallback across `sources[]` | PASS | `_tryNext` walker at [play.js:384-521](services/hermes-tv-api/src/routes/play.js:384), records per-attempt failures. | — |
| 3.7 | Provider ticket never returns raw URL to client | PASS | [play.js:222-258](services/hermes-tv-api/src/routes/play.js:222) — ticket carries `stream_endpoint` only; `streamResolver` is server-internal per [streamResolver.js:23-25](services/hermes-tv-api/src/lib/streamResolver.js:23). | — |
| 3.8 | Friendly 503 on all-sources-fail | PASS | [play.js:385-396](services/hermes-tv-api/src/routes/play.js:385) — `stream_temporarily_unavailable` + `retry_after_seconds`. | — |

## 4. HLS Proxy — Credential-Bearing Rewriting + Range (Contract 46 P0 #4; Contract 48 §"Playback")

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 4.1 | Playlist URL rewriting (absolute + relative segments) | PASS | [hlsProxy.js:196-222](services/hermes-tv-api/src/lib/hlsProxy.js:196) — `_absolutize` + `_proxyPathFor` on every non-tag line. | — |
| 4.2 | URI attribute rewriting on EXT-X-KEY / MAP / MEDIA / PART / PRELOAD-HINT / SESSION-KEY / I-FRAME-STREAM-INF | PASS | TAGS_WITH_URI at [hlsProxy.js:56-65](services/hermes-tv-api/src/lib/hlsProxy.js:56). | — |
| 4.3 | SSRF guard (`http://` / `https://` only) | PASS | [hlsProxy.js:267-270](services/hermes-tv-api/src/lib/hlsProxy.js:267) and [381-385](services/hermes-tv-api/src/lib/hlsProxy.js:381). | — |
| 4.4 | Range header forwarded upstream | PASS | [hlsProxy.js:278-280](services/hermes-tv-api/src/lib/hlsProxy.js:278) (segment); [393-395](services/hermes-tv-api/src/lib/hlsProxy.js:393) (direct). Test asserts at `test/playbackProxy.test.js`. | — |
| 4.5 | Per-channel UA / referrer (48 §"Playback") | FAIL | Hard-coded `User-Agent: 'VLC/3.0.20 LibVLC/3.0.20'` at [hlsProxy.js:172](services/hermes-tv-api/src/lib/hlsProxy.js:172) and [389](services/hermes-tv-api/src/lib/hlsProxy.js:389). No path threads `row.user_agent` / `EXTVLCOPT` user-agent from `m3uClient` parser into the proxy fetch. | Pass per-source UA/referrer down through the ticket; let `hlsProxy.proxyPlaylist({ headers })` override defaults. |
| 4.6 | Master playlist (variant) rewriting | PARTIAL | Doc comment at [hlsProxy.js:28-32](services/hermes-tv-api/src/lib/hlsProxy.js:28) admits master playlists are "not unit-tested below — flagged in the wave-11 report as follow-up". Lines that look like URLs do get rewritten generically, but no test fixture covers `#EXT-X-STREAM-INF` → variant URL → segment chain. | Add a `master.m3u8` fixture in `test/hlsProxy.test.js` and assert variant URLs get the `/api/proxy/...` rewrite. |
| 4.7 | 502 collapses credentials on upstream error | PASS | [hlsProxy.js:295-302](services/hermes-tv-api/src/lib/hlsProxy.js:295). | — |

## 5. EPG Waterfall — override > m3u-header > xtream-default + additional, dedupe, gzip, fuzzy safety (Contract 48 §"EPG And Catchup")

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 5.1 | Priority: override > m3u-header > xtream-default + additional | PASS | [epgWaterfall.js:122-154](services/hermes-tv-api/src/lib/epgWaterfall.js:122) | — |
| 5.2 | `disableProviderEpg` suppresses auto-derived primary, keeps override + additional | PASS | [epgWaterfall.js:124-141](services/hermes-tv-api/src/lib/epgWaterfall.js:124) | — |
| 5.3 | Dedupe across resulting list | PASS | [epgWaterfall.js:108-120](services/hermes-tv-api/src/lib/epgWaterfall.js:108) | — |
| 5.4 | Gzip detection (magic bytes / .gz / content-type / content-disposition) | PASS | [epgWaterfall.js:321-349](services/hermes-tv-api/src/lib/epgWaterfall.js:321) | — |
| 5.5 | Fuzzy channel-name match safety — ambiguous returns "" (no silent guessing) | PASS | [epgWaterfall.js:418-442](services/hermes-tv-api/src/lib/epgWaterfall.js:418) + [444-461](services/hermes-tv-api/src/lib/epgWaterfall.js:444) null-out collisions. | — |
| 5.6 | XMLTV channel → playable catalog ID mapping | PASS | [epgWaterfall.js:597-628](services/hermes-tv-api/src/lib/epgWaterfall.js:597); consumed at [epg.js:164-211](services/hermes-tv-api/src/routes/epg.js:164). | — |
| 5.7 | `/api/epg/refresh` / `/api/epg/clear` / `/api/epg/import-xmltv` durability | PARTIAL | Three endpoints still return `501 not_implemented` ([epg.js:430-490](services/hermes-tv-api/src/routes/epg.js:430)). Contract 46 P1 §"EPG Is Only Partly Connected" says: "Implement refresh/clear/import paths or remove the UI affordance claiming they work." | Either persist EPG snapshots + implement refresh, or remove the buttons from the UI to honor the no-stubs rule. |
| 5.8 | EPG mapping (`/api/epg/mapping`) persistence | FAIL | In-memory only — variable `EPG_MAPPING = {}` at [epg.js:336](services/hermes-tv-api/src/routes/epg.js:336); wiped on restart. | Persist `EPG_MAPPING` to a `data/epgMappings.json` file using the same pattern as `providerStore.js`. |
| 5.9 | EPG settings (`/api/epg/settings`) persistence | FAIL | In-memory only — `EPG_SETTINGS` at [epg.js:344-350](services/hermes-tv-api/src/routes/epg.js:344). | Same fix as 5.8. |
| 5.10 | Catchup program listing (Contract 48 §"EPG And Catchup") | FAIL | [catchup.js:69-101](services/hermes-tv-api/src/routes/catchup.js:69) returns honest empty array but never enumerates from Xtream `get_simple_data_table` / `get_short_epg` (Contract 48 specifically calls these out). | Implement Xtream catchup enumeration in `lib/xtreamClient.js` and surface in `/api/catchup/:channelId`. |
| 5.11 | Catchup playback (`POST /api/catchup/play`) | FAIL | 501 stub at [catchup.js:139-144](services/hermes-tv-api/src/routes/catchup.js:139). | Build a timeshift URL via `xtreamClient.internal.resolveStreamUrl` with the catchup template; route through `hlsProxy.proxyDirectStream`. |

## 6. QR Onboarding (Contract 46 Rule 3; Contract 47 #4)

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 6.1 | `parse-qr` server-side endpoint accepts plain M3U / `xtream://` / JSON / Xtream-export URL | PASS | [providers.js:179-196](services/hermes-tv-api/src/routes/providers.js:179) + `_parseQrText` at [273-384](services/hermes-tv-api/src/routes/providers.js:273). | — |
| 6.2 | QR encodes a real setup URL, not a placeholder | PASS | [pairing.js:105-112](services/hermes-tv-api/src/routes/pairing.js:105) emits `/api/setup/provider?code=HRM-XXXX`. Front-end QROnboarding builds origin-relative URL at [QROnboarding.jsx:61-72](apps/hermes-web-tv/src/components/QROnboarding.jsx:61). | — |
| 6.3 | `POST /api/pair/:code/complete` persists durably | PASS | [pairing.js:276-311](services/hermes-tv-api/src/routes/pairing.js:276) routes through `providerStore.add`. | — |
| 6.4 | Pairing TTL + sweeper | PASS | 10-min TTL + 60-s sweep at [pairing.js:57-58](services/hermes-tv-api/src/routes/pairing.js:57), [188-210](services/hermes-tv-api/src/routes/pairing.js:188). | — |
| 6.5 | Pairing envelope itself is in-memory only (acceptable per contract — short-lived handshake) | PASS | [pairing.js:65](services/hermes-tv-api/src/routes/pairing.js:65), documented at [pairing.js:43-44](services/hermes-tv-api/src/routes/pairing.js:43). | — |

## 7. Proof Artifacts (Contract 46 §"Required Proof Artifacts"; Contract 47 §"Proof Artifact Layout")

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 7.1 | Proof writer redacts URLs / usernames / passwords / tokens | PASS | [test-provider-e2e.js:84-128](tools/test-provider-e2e.js:84) URL_PATTERNS + QUERY_PATTERNS + raw env-value substitution. | — |
| 7.2 | Proof writer recursively scrubs JSON `username` / `password` / `token` keys | PASS | [test-provider-e2e.js:161-190](tools/test-provider-e2e.js:161) `CRED_KEYS` set + `scrub()` walker. | — |
| 7.3 | Live mode fails on empty `/api/catalog` | PASS | [test-provider-e2e.js:418-436](tools/test-provider-e2e.js:418). | — |
| 7.4 | `NO_PROVIDER_EMPTY_STATE=1` allows honest empty | PASS | [test-provider-e2e.js:418-426](tools/test-provider-e2e.js:418) — same block branches on `IS_EMPTY`. | — |
| 7.5 | Artifact set covers all required files | PARTIAL | Writes `environment.redacted.json`, `providers.redacted.json`, `catalog.meta.json`, `play-ticket.redacted.json`, `stream-head.txt`, `stream-get.txt`, `source-health.redacted.json`, `commands.txt`, `summary.md`. Missing optional `epg.meta.json` and `tizen-api-base.txt`. | Add `epg.meta.json` capture when an XMLTV source is configured. |
| 7.6 | Stream `HEAD` + `GET` byte proof | PASS | [test-provider-e2e.js:466-522](tools/test-provider-e2e.js:466). | — |

## 8. CI Gates — Empty-State vs Provider-Live Separation (Contract 46 P0 #6; Contract 47 #16, #17)

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 8.1 | Empty-state job runs with `NO_PROVIDER_EMPTY_STATE=1`; explicitly unsets provider env | PASS | [ci.yml:256-321](.github/workflows/ci.yml:256) — guard block at 281-292 fails the job if any provider env leaks in. | — |
| 8.2 | Empty-state asserts `12 PASS, 0 FAIL` + `NO_PROVIDER_EMPTY_STATE=1` annotation present | PASS | [ci.yml:297-311](.github/workflows/ci.yml:297). | — |
| 8.3 | Provider-live job is gated behind `workflow_dispatch` + `run_provider_live=true` | PASS | [ci.yml:344-353](.github/workflows/ci.yml:344). | — |
| 8.4 | Provider-live job FAILS on skip / 0 PASS | PASS | [ci.yml:394-402](.github/workflows/ci.yml:394) — regex `^=== Results: [1-9][0-9]* PASS, 0 FAIL`. | — |
| 8.5 | Nightly scheduled run against `main` (Contract 47 §"Triggering") | FAIL | No `schedule:` trigger on the workflow — only `pull_request`, `push`, `workflow_dispatch`. The contract calls for "Scheduled nightly (against main) to catch upstream-provider drift". | Add `schedule: - cron: '0 6 * * *'` and gate `provider-live` `if:` to include `github.event_name == 'schedule'`. |
| 8.6 | Deploy smoke cannot mark green from skipped tests | UNKNOWN | `.github/workflows/deploy-vps.yml` not read in this audit. | Audit `deploy-vps.yml` to confirm the provider-live job is a `needs:` of the release step. |

## 9. npm test Coverage

`services/hermes-tv-api/package.json` `npm test` chain runs 16 tests + schema-validate.
Coverage by file: `health.test.js` smoke; `playlists.smoke.js`; `xmltv.smoke.js`;
`hlsProxy.test.js` (4.1–4.4); `playbackProxy.test.js` (3.5 + 4.4);
`catalogMerge.test.js` (2.2); `m3uParser.test.js` (Contract 48 §P0 #4);
`epgWaterfall.test.js` (5.1–5.5); `epgGridMapping.test.js` (5.6);
`epgProviderSources.test.js`; `providerStore.test.js` (1.3);
`providerRegistry.test.js` (1.4); `providers.route.test.js` (6.1);
`providerQrSetup.test.js` (6.2); `catalogProviders.test.js`;
`xtreamFixture.e2e.test.js` (Contract 48 §P0 #1).

**Gaps**:
- No Jellyfin branch test (3.4) — branch does not exist.
- No test asserting `/api/source-health` consumes `providerRegistry.listFull()` (1.6).
- No catchup enumeration (5.10) or playback (5.11) test — both still 501.
- No search → detail → play hydration test (2.5).

## 10. Security — No Secrets In Responses, Redaction (Contract 46 Rule 2; Contract 47 #1)

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 10.1 | `res.json` middleware blocks credential patterns | PASS | [credentialGuard.js:23-69](services/hermes-tv-api/src/middleware/credentialGuard.js:23). | — |
| 10.2 | Log sanitizer strips Xtream URLs, bearer tokens, Azure subscription keys | PASS | [sanitizeLog.js:29-58](services/hermes-tv-api/src/lib/sanitizeLog.js:29). | — |
| 10.3 | CORS restricts to LAN + `tv.daveai.tech` / `hermestv.daveai.tech` | PASS | [index.js:54-71](services/hermes-tv-api/src/index.js:54). | — |
| 10.4 | Request body logger never logs body | PASS | Per comment at [index.js:81-82](services/hermes-tv-api/src/index.js:81); confirm via [middleware/requestLogger.js](services/hermes-tv-api/src/middleware/requestLogger.js). | — |
| 10.5 | CI secret scan with allowlist | PASS | [ci.yml:427-526](.github/workflows/ci.yml:427) — `tools/secret-scan.sh` mirror. | — |
| 10.6 | `data/providers.json` chmod 0600 on POSIX | PASS | [providerStore.js:153-154](services/hermes-tv-api/src/lib/providerStore.js:153). | — |
| 10.7 | Final error handler runs `err.message` through `sanitizeForLog` | PASS | [index.js:133-135](services/hermes-tv-api/src/index.js:133). | — |
| 10.8 | `credentialGuard` pattern list does NOT include `m3u_plus` | FAIL | `credentialGuard.FORBIDDEN_PATTERNS` at [credentialGuard.js:23-33](services/hermes-tv-api/src/middleware/credentialGuard.js:23) lacks `m3u_plus`, while `sanitizeLog.FORBIDDEN_PATTERNS` at [sanitizeLog.js:43](services/hermes-tv-api/src/lib/sanitizeLog.js:43) includes it. A response containing `[REDACTED]&type=m3u_plus` would slip past `credentialGuard` even though the log path would redact. | Add `/m3u_plus/i` to `FORBIDDEN_PATTERNS` in `credentialGuard.js`. |

## 11. Unsupported-Feature Honesty (Contract 47 #7; Contract 48 §"Mainstream")

| # | Clause | Status | Evidence | Gap |
|---|---|---|---|---|
| 11.1 | DVR `POST /api/dvr/schedule` in-memory only | FAIL | [dvr.js:44-46](services/hermes-tv-api/src/routes/dvr.js:44) — `recordings = {}`; Phase 4 admitted at [11-13](services/hermes-tv-api/src/routes/dvr.js:11). | Implement on-disk pipeline or downgrade to 501. |
| 11.2 | Downloads `/api/download` envelope only | FAIL | [downloads.js:12-17](services/hermes-tv-api/src/routes/downloads.js:12); `/file` returns 503. | Same as 11.1. |
| 11.3 | Catchup `POST /api/catchup/play` honest 501 | PASS | [catchup.js:139-144](services/hermes-tv-api/src/routes/catchup.js:139). | — |
| 11.4 | EPG refresh/clear/import-xmltv honest 501 | PASS | [epg.js:430-490](services/hermes-tv-api/src/routes/epg.js:430). | See 5.7 — UI must not claim working. |

---

## Release-Blocking Server Gaps — Top 5

1. **Jellyfin items unplayable** (Gap 3.4) — `streamResolver` has no `jellyfin-*` branch, so any Jellyfin item clicked returns 503. Owner: Lane B/C — add a Jellyfin branch in `lib/streamResolver.js` that resolves to a `/Items/{id}/PlaybackUrl` ticket or drop Jellyfin items from `/api/catalog` until then.
2. **Source-health ignores disk-backed providers** (Gap 1.6) — `routes/sourceHealth.js` still hard-codes `['apollo_group', 'xtremehd']`; operator-pasted `prov-<hex>` rows never get probed. Owner: Lane D — rewrite `sourceHealthAggregator.js` to enumerate `providerRegistry.listFull()`.
3. **`credentialGuard` missing `m3u_plus` pattern** (Gap 10.8) — middleware divergence with `sanitizeLog`; a response containing `[REDACTED]&type=m3u_plus` would not be blocked. Owner: Lane F — add the pattern, add a test in `test/credentialGuard.test.js` that proves both layers reject identical payloads.
4. **EPG mapping / settings are in-memory only** (Gaps 5.8 + 5.9) — Mom remaps a channel, restart wipes it. Owner: Lane D — persist `EPG_MAPPING` and `EPG_SETTINGS` to disk via the same `providerStore` atomic-write pattern.
5. **DVR + Downloads return success envelopes without writing bytes** (Gaps 11.1 + 11.2) — Contract 47 #7 forbids fake success. Owner: Lane F — either ship the real on-disk pipeline or downgrade both endpoints to `501 not_implemented` and remove the UI affordance.
