# Bug Ledger — Codex Continuation 2026-05-21 02:10 MST

## HANDOFF #1 — Jellyfin Items Unplayable

- Earlier status: **BLOCKED owner=Dave** in
  `docs/proof/overnight-swarm/20260521-0535/release-decision.md`.
- Corrected status: **PARTIAL PASS**.

## Root Cause

Jellyfin was not only missing live credentials:

- `lib/jellyfin.js` emitted raw Jellyfin item IDs with no `jellyfin-*`
  resolver prefix.
- Jellyfin items did not carry `providers[]`, so `catalogMerge` could treat
  them as seed/unknown sources.
- `lib/streamResolver.js` had no Jellyfin dispatch branch.
- Jellyfin poster URLs could embed `api_key` in browser-visible catalog JSON.

## Fix

- `services/hermes-tv-api/src/lib/jellyfin.js`
  - emits `jellyfin-*` catalog IDs.
  - attaches `provider_id=jellyfin` and a `providers[]` source record.
  - exposes an internal server-only stream resolver.
  - returns DaveTV image-proxy paths for poster art.
- `services/hermes-tv-api/src/routes/jellyfin.js`
  - new image proxy that fetches Jellyfin artwork with `X-Emby-Token`
    server-side.
- `services/hermes-tv-api/src/lib/streamResolver.js`
  - dispatches `jellyfin-*` IDs through Jellyfin and marks them
    credential-bearing so `/api/play/:ticket/stream` proxies bytes.
- `services/hermes-tv-api/src/lib/sanitizeLog.js`
  - redacts Jellyfin `api_key` query strings and `X-Emby-Token`.
- `services/hermes-tv-api/src/middleware/credentialGuard.js`
  - blocks the same Jellyfin credential shapes in JSON responses.
- `services/hermes-tv-api/test/jellyfinPlayback.test.js`
  - local Jellyfin-compatible fixture proves catalog → image proxy →
    play ticket → stream proxy, with no credential bytes in responses.
- `services/hermes-tv-api/test/credentialGuardSync.test.js`
  - expanded to cover Jellyfin credential patterns.

## Proof

- `node test/jellyfinPlayback.test.js` → **25 PASS / 0 FAIL**
- `node test/credentialGuardSync.test.js` → **36 PASS / 0 FAIL**
- `npm test --prefix services/hermes-tv-api` → **PASS**
- `npm run audit:secrets` → **2 PASS / 0 FAIL**
- `npm run build:web` → **PASS**

## Remaining

Live Jellyfin proof is still Dave-owned because only Dave has the real
Jellyfin URL/key and hardware/network context. The code path is no longer
an agent blocker.

---

## VIEW-SWARM-001 — Reference View Shells Invented User Data

- Earlier status: open from continuing no-fakes audit.
- Status: **fixed**

## Root Cause

- `StremioShell` rendered a second "Continue Watching" board from the first
  catalog items, which made untouched content look like playback history.
- `YnotvShell` bucketed items with no `release_date` into deterministic
  calendar days, creating fake release dots.
- `YnotvShell` generated deterministic Up Next labels and displayed a fake
  autoplay countdown with no queue/EPG contract behind it.

## Fix

- `apps/hermes-web-tv/src/shells/StremioShell.jsx`
  - removed the fake Continue Watching catalog slice.
  - leaves real history to `ContinueWatchingRail`.
  - changed the user-facing wordmark from Hermes to DaveTV.
- `apps/hermes-web-tv/src/shells/YnotvShell.jsx`
  - release calendar uses only explicit real `release_date` values.
  - Up Next is hidden until real data exists.
  - fake autoplay countdown removed.
- `services/hermes-tv-api/test/viewShellNoFakeRows.test.js`
  - pins these no-fake View contracts.

## Proof

- `node test/viewShellNoFakeRows.test.js` → **15 PASS / 0 FAIL**
- `npm run build:web` → **PASS**
- `npm test --prefix services/hermes-tv-api` → **PASS**

---

## SERIES-PLAYBACK-001 — Series UI Invented Episodes And Played Parent Id

- Earlier status: open from continuing no-fakes audit.
- Status: **fixed**

## Root Cause

- `services/hermes-tv-api/src/routes/series.js` synthesized deterministic
  season/episode rows from catalog metadata instead of reading provider
  episode metadata.
- `apps/hermes-web-tv/src/components/SeriesEpisodesBlock.jsx` invented titles,
  plots, ratings, and episode ids client-side.
- `apps/hermes-web-tv/src/App.jsx` ignored the third `onPlay` argument from
  episode rows, so clicking a series episode still POSTed the parent series
  id to `/api/play`.

## Fix

- `xtreamClient` now exposes provider-backed `get_series_info` episode
  normalization and creates playable episode item ids.
- `/api/series/:seriesId` returns real provider episodes or an honest empty
  metadata state.
- `/api/play` accepts `episode_item_id` and rewrites ticket sources to the
  real episode stream id.
- `SeriesEpisodesBlock` fetches `/api/series/:id`, renders only provider
  episodes, and passes `episode_item_id` into playback.

## Proof

- `node test/xtreamSeriesPlayback.test.js` → **11 PASS / 0 FAIL**
- `node test/viewShellNoFakeRows.test.js` → **15 PASS / 0 FAIL**
- `npm run build:web` → **PASS**

---

## VIEW-SWARM-002 — Category Rows Backfilled With Wrong Content

- Earlier status: found during continuing no-fakes audit.
- Status: **fixed**

## Root Cause

Several View shells used `movies.length > 0 ? movies : filtered.slice(...)`
or similar patterns. Empty category rows were silently filled with unrelated
catalog items, so a Movies row could show live channels or a Series row could
show movies.

## Fix

- Netflix, Samsung, Plex, Apple TV, and Nuvio category rows now receive only
  their true category arrays.
- Empty rows return `null` through the existing row components.
- Iptvnator transport controls now perform real prev/play/next selection; the
  inactive external-player buttons were removed.

## Proof

- `node test/viewShellNoFakeRows.test.js` → **15 PASS / 0 FAIL**
- `npm run build:web` → **PASS**

---

## CONTRACT-001 — Production API Exposed Mock Flags

- Earlier status: found during continuing no-fakes audit.
- Status: **fixed**

## Root Cause

`/api/settings` exposed `mock_mode` and `mock_only`, and source-health used
`mock:true` for an unconfigured provider. Those names are not acceptable in
production contracts because they imply a fake path is part of the runtime
surface.

## Fix

- Removed `mock_mode` and `mock_only` from settings defaults.
- Source-health now returns `configured:false` for a provider that has no
  configured URL.

## Proof

- `node test/noMockContracts.test.js` → **3 PASS / 0 FAIL**
