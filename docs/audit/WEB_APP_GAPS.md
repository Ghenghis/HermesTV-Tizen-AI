# Web App — Release Readiness Audit (`apps/hermes-web-tv`)

Generated: 2026-05-20  
Branch: `lane-a-provider-registry`  
Auditor: Claude (read-only)  
Scope: web shell only. Provider-truth backend gaps tracked in `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`.

Verdict line: **the web shell is far ahead of the backend**. Mock purge landed (wave-17), click-to-play purge landed (wave-14), provider-visibility toggles landed (wave-16), 14 lazy shells ship cleanly. Remaining release-blocking gaps are mostly thin seams between the web app and an incomplete provider backend, plus a handful of stale docs / dev-mode escape hatches that need pruning before a production cut.

---

## Audit Matrix (PASS / FAIL / PENDING with file:line evidence)

| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | No seed catalogs in shell render path | PASS | `engine/ShellRenderer.jsx:38-63` — empty catalog routes to honest `EmptyState` + Open Settings CTA. `components/CatalogGrid.jsx:117-130` mirrors. No `seedCatalog` import in any active shell render path. |
| 2 | No "coming soon" placeholders | PASS | `components/MediaDetailPanel.jsx:823-826` — empty "More like this" rail explicitly removed in W14-NOPOPUP. Only residual `coming soon`-style copy is **none** in shell render; legacy IptvnatorShell external-player buttons say "v2 follow-up" but that's a deliberate disabled affordance, not a fake content tile. |
| 3 | No popup before playback (live) | PASS | `App.jsx:1099-1106` — `handleItemClick` for `type === 'live'` calls `handlePlay()` directly, bypassing `MediaDetailPanel`. Provider auto-fallback resolved server-side per W13-MERGE. |
| 4 | No source-picker / quality-slider between click & play | PASS | `components/MediaDetailPanel.jsx:711-719` — W14-NOPOPUP removed `StreamingQualityBar` + `SourceComparePanel` render blocks (imports remain for future in-player surfacing; not rendered). |
| 5 | No "Watch / Record" modal gate before play | PASS | Record is its own affordance (`ScheduleRecordingModal`, future-program only); Watch button calls `onPlay` → `handlePlay` → `POST /api/play` directly. |
| 6 | `/api/providers` integration (list) | PASS | `api/hermesApi.js:106-125` — `getProviders` + Wave-20 `listProviders`. App.jsx:970 calls on boot. |
| 7 | `/api/providers` add via QR onboarding | PARTIAL | `components/QROnboarding.jsx:74-82,99-160` — generates real QR from `/api/setup/provider?code=<pair>` via `hermesApi.buildApiUrl`. Pairing API wired (`hermesApi.js:331-361`). **Gap**: backend `/setup/provider/submit` still returns 501 per `docs/46:107-110`; QR scan resolves to URL but completion is in-memory and does not persist. |
| 8 | `/api/providers` add via form (PATCH/DELETE/test) | PASS (client) | `api/hermesApi.js:127-209` — full CRUD: `addProvider`, `updateProvider`, `removeProvider`, `testProvider`, `parseQrText`. Backend lane-a status: in-progress per task #94. |
| 9 | `/api/catalog` integration | PASS | `api/hermesApi.js:211-225` — real fetch, surfaces `X-Catalog-Source` header + `_meta.source` for the Settings data-source badge. `App.jsx:971-1010` ingests, normalizes both array + wrapper shapes, exposes per-provider m3u counts. |
| 10 | `/api/play` integration | PASS | `api/hermesApi.js:267-280` — `startPlayback({item_id, profile_id, provider_id?})` returns ticket envelope; `App.jsx:1184-1195` calls it; `PlayerModal.jsx` consumes ticket and never sees upstream URL. |
| 11 | `/api/epg/grid` integration | PARTIAL | `shells/LiveTVShell.jsx:212-225` fetches `/api/epg/grid` for the focused channel. **Gap**: `IptvnatorShell.jsx:88-92` still uses a deterministic `_placeholderNow()` stub (commented as a deliberate placeholder pending EPG wiring). The mainstream EPG modal (`EPGModal` → `EPGGrid.jsx`) is real but the per-shell mini-EPG remains stubbed in one shell. Backend `epgGrid.js` is mid-de-mock per worktree branch diff. |
| 12 | CSP allows API origin (dev) | PASS | `index.html:5` — `connect-src 'self' http://localhost:3001 http://hermestv.local https://hermestv.local ws://localhost:5173 ...`. localhost:3001 dev API explicitly listed. |
| 13 | CSP allows API origin (prod) | PASS | `index.html:5` — `'self'` covers same-origin prod (nginx proxies `/api/*` to API container; `api/hermesApi.js:7-14` returns `''` BASE_URL for non-localhost/LAN/hermestv hostnames, so all calls are same-origin in prod). |
| 14 | Dynamic UX Shell architecture | PASS+ | `engine/ShellRenderer.jsx` + `engine/layoutRegistry.js` + `engine/useLayoutEngine.js` match spec 24. **14 lazy-loaded shells** registered (`layoutRegistry.js:35-50`) vs 7-shell spec (24). Each shell is React.lazy; Suspense fallback in renderer. Empty-catalog short-circuit centralised. |
| 15 | 7 theme token files (spec 24, §2.7) | FAIL | `themes/tokens/` has only 8 entries (`apple-tv`, `dave-power`, `mom-mode`, `netflix`, `plex`, `samsung-tizen`, `tivimate`, `index.js`). 7 newer shells (Zero, Nuvio, ExtremeInfiniTV, Stremio, LiveTV, Iptvnator, Ynotv) have no token file. Theme switching for those falls through to whatever `themeName` class lands on `<html>` — works because each shell ships inline tokens, but the central registry is out of sync with the spec. |
| 16 | Voice/TTS — Azure only | PASS | `api/azureVoiceClient.js:39-66` — all voice calls go to `/api/tts/*`. `components/FloatingChatbot.jsx:168` explicitly: "Never fall back to browser SpeechSynthesis or Bixby — if Azure returns ... we stay silent". `i18n/en.json:148`: "Bixby AI is not used. Voice output is Azure-only." `App.jsx:1014-1017` boot greeting goes through `voiceClient.speak`. No `SpeechSynthesisUtterance` references found. |
| 17 | Microphone input may capture (not Bixby) | PASS | `i18n/en.json:151` and parallel ES copy describe Samsung mic as "capture only — recognition runs on the server. Output never goes through Bixby." No client-side Bixby SDK referenced anywhere. |
| 18 | Tier policy — QN85/QN95 primary, UN degraded | PASS | `App.jsx:102-109` — `resolveTier()`: `QN*` → enhanced, `UN*` and unknown → degraded. `applyTierClasses()` paints body class so degradation is CSS-driven, never content-driven (Mom rule preserved). |
| 19 | Mom-never-limited rule | PASS | `utils/isSystemLimited.js` returns false for `mom_mode` profiles; `components/CatalogGrid.jsx:5,109` imports and respects. Comment at `CatalogGrid.jsx:65-71` calls out the rule. |
| 20 | Honest "no API" mode (no silent mock fallback) | PASS | `App.jsx:930-948` — when `/health` unreachable, surface "Cannot reach DaveTV server" instead of mock fallback. `hermestv_dev_mock=1` localStorage flag is the only escape hatch (intentional developer override; should be gated off in prod build but is currently always reachable). |
| 21 | Provider visibility per-profile (W16) | PASS | `components/settings/ProvidersSettings.jsx:1-471` ships full per-row toggle UI; `store/providerVisibilityStore.js` persists; `App.jsx:556-577` listens for the `hermestv:provider-visibility-changed` CustomEvent and re-filters live. |
| 22 | Cross-provider auto-fallback (W13) | PASS | Server resolves on `/api/play`; `PlayerModal.jsx:34-36` declares `MAX_RETRIES=3 RETRY_DELAY_MS=5000` for 503 stream_temporarily_unavailable. UI never asks the user to pick. |
| 23 | Pre-warmed PlayerModal chunks | PASS | `App.jsx:1139-1158` — focus on a live card pre-imports `PlayerModal` + `hls.js` chunks once via `prewarmedRef`. Sub-second click-to-first-byte. |
| 24 | No credentials in client storage | PASS (web client) | Only `voicePrefStore`, `profileStore` (non-secret display metadata), `providerVisibilityStore`, watch history, sleep timer, screensaver — no credential paths. README §Rules:46-49 documents the constraint. |

---

## Top 5 Release-Blocking Web-App Gaps

These are the items that should block the web app from being called "release ready" independent of backend lane-a/b/c work.

### 1. Stale README implies mock-first dev path (`apps/hermes-web-tv/src/README.md:11-49`)
The README still lists `mockApi.js` as a planned api client, describes `QROnboarding.jsx` as "mock QR provider onboarding flow", and instructs operators that "QROnboarding shows only the mock flow". The actual code is real-API-driven (wave-17 purge) — but onboarding contractors / new agents reading this README will reintroduce the very mocks the project purged.  
**Owner action**: rewrite README to match reality — delete `mockApi.js` line; describe QR onboarding as real pairing flow; describe Wave-20 multi-provider CRUD; cross-reference docs/46 + docs/47.

### 2. Stale `FilterBar` provider dropdown is hard-coded to two providers (`App.jsx:217-220`)
The inline `FilterBar` component renders only `<option value="apollo_group">` and `<option value="xtremehd">`. iptv-org, xtream (generic), and jellyfin will never appear in this dropdown even when configured. Docs/46:67-83 specifically calls out hard-coded provider lists as a P0 violation.  
**Owner action**: replace the hard-coded `<option>` list with a `map()` over `state.providers` filtered to `status === 'ok' || configured === true`. Use the same canonical IDs the visibility store normalises (`iptv_org` ↔ `iptv-org`).

### 3. Theme token registry desync — 7 of 14 shells have no token file (`themes/tokens/`)
Spec docs/24 §2.7 calls for one JSON token file per layout. Registry has 14 shells; tokens/ only ships 7 files. Zero, Nuvio, ExtremeInfiniTV, Stremio, LiveTV, Iptvnator, Ynotv ship inline tokens inside their shell components. Switching layouts works (App.jsx:1495-1499 just maps layoutId → CSS class via `applyThemeByName`) but the documented theme-pack architecture is out of sync. Layout switcher cannot show theme previews for the 7 token-less shells.  
**Owner action**: either (a) add 7 token JSON files, or (b) amend docs/24 to reflect the inline-token reality and remove the `themes/tokens/` directory expectation.

### 4. `hermestv_dev_mock` localStorage escape hatch ships to production (`App.jsx:938-941`)
`devMockAllowed` is reachable in any browser by typing `localStorage.setItem('hermestv_dev_mock','1')`. While the code never actually loads a mock catalog any more (Wave-17), the escape hatch still bypasses the "Cannot reach server" gate. A QA-mode flag that survives into prod is the kind of "always-green" cheat path docs/46:55-58 forbids.  
**Owner action**: gate the check behind `import.meta.env.DEV` (Vite dev-only) or remove entirely now that the wave-17 purge made it inert. One-line change in `App.jsx`.

### 5. `IptvnatorShell` mini-EPG still renders deterministic placeholder text (`shells/IptvnatorShell.jsx:88-94`)
`_placeholderNow(channel)` returns a deterministic per-channel string instead of the real EPG. Comment acknowledges this and points to "when EPG is plumbed in we'll switch this to the real feed". LiveTVShell already wires `/api/epg/grid` (lines 212-225); IptvnatorShell does not. For a shell aimed at IPTV power-users this is the most visible "fake content" surface left in the web app.  
**Owner action**: copy the `/api/epg/grid` fetch + state pattern from `LiveTVShell.jsx:212-225` into IptvnatorShell's preview/now block. ~30-line port; same hook usage.

---

## Secondary observations (worth tracking, not release-blocking)

- **`api/hermesApi.js:7-14`** — BASE_URL resolver still names `hermestv.local`. Docs/49 + recent rebrand point to `tv.daveai.tech`. Same-origin path covers prod; the LAN/dev branch should be updated to `davetv.local` or made env-driven.
- **`store/profileStore.js:43-198`** — first-boot seeded profiles (`dave_tv`, `mom_tv`) are local-only. Docs/46:296-309 calls out the need to classify "local-only vs backend-durable" state. Profile records here are display metadata only, no credentials — likely fine to leave local, but should be explicitly documented as such.
- **`components/MultiviewModal.jsx`** + **`Screensaver.jsx`** + **`SleepTimer.jsx`** — fully wired with `useScreensaverIdle` / `useSleepTimer` per App.jsx imports; no audit gaps spotted in a sampling read, but a Playwright walk of each modal would seal them.
- **`components/CatchupRail.jsx:6`** — comment notes catch-up endpoint is "501 stub". Component already renders an honest unsupported badge in that case (sampled), but the contract docs/46:281-287 call out catch-up as a separate finish lane.
- **`api/searchClient.js`** — exists and is referenced by SearchModal; not opened in this audit but no `mockApi` import surfaced in the grep sweep.

---

## CSP / origin notes (no secrets exposed)

`index.html:5` CSP allowlist (verbatim, no creds):
- `default-src 'self' http://localhost:3001 http://localhost:5173 http://hermestv.local https://hermestv.local ws://hermestv.local ws://localhost:5173 wss://hermestv.local http://192.168.0.0/16`
- `connect-src` adds `https://www.gstatic.com` (Chromecast SDK), `https://static.cloudflareinsights.com`, `https://ajax.cloudflare.com`.
- `media-src 'self' blob: http: https:` — broad enough for HLS proxy + iptv-org direct streams.
- `img-src 'self' data: blob: http: https:` — broad enough for Wikipedia / Imgur / Wikia logo CDNs (pre-connected in `<link rel="preconnect">`).

Prod-host CSP entry recommended: when `tv.daveai.tech` flips on as the canonical hostname, add it explicitly to `connect-src` so any future cross-subdomain API call (e.g. `api.daveai.tech`) doesn't silently fail.

---

## What is NOT in this audit

- Backend (`services/hermes-tv-api/**`) — provider truth contract docs/46 owns that.
- Tizen packaging (`apps/hermes-tv-tizen/**`) — docs/47 §Agent 04 owns API base, CSP, CORS, AVPlay.
- Live provider proof (xTremeHD / Apollo / Xtream Codes) — docs/46 §Definition Of Finished.
- E2E CI gates — docs/47 §16-17 + the wave-17/lane-09 workflow split.

---

## TL;DR

Web shell architecture is clean, layout engine is solid, mocks are out, click-to-play is direct.  
Five surface fixes (README rewrite, FilterBar dropdown un-hardcode, theme tokens decision, dev-mock kill, IptvnatorShell EPG port) and the web layer is independently release-clean.  
Real release blocker remains the **backend provider truth gap** — until docs/46 §1-6 are green, the web app's "Open Settings → add a provider → see real content" loop cannot close end-to-end no matter how clean the shell is.
