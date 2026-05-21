# 03 - IPTVnator EPG Data-Access - Pattern Extraction

Generated: 2026-05-20
Agent: 04 of 20 (DaveTV reference-extraction swarm)
Upstream: `G:\Github\IPTV-Apps\iptvnator\libs\epg\data-access\src\lib\` and `apps\electron-backend\src\app\events\epg.events.ts`

## License and Attribution

IPTVnator is **MIT licensed** (`G:\Github\IPTV-Apps\iptvnator\LICENSE.md`, "Copyright 2020-2021"). MIT permits unrestricted use, modification, and sublicensing provided the copyright notice is preserved. This document is **pattern-only** extraction: behavior shapes, event sequences, cache semantics, and mapping data models. No verbatim source blocks exceed 5 lines. Any function ported into HermesTV must carry an inline attribution comment such as:

```
// Pattern adopted from IPTVnator (MIT) libs/epg/data-access.
```

## Contract Banner

Per `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md` Non-Negotiable Truth Rules 1, 5, and 7: this doc maps a reference EPG pipeline. Adopting its progress-event vocabulary into HermesTV does **not** satisfy any truth-gate. Provider-live proof of `/api/epg` (channels + programs > 0 against a real XMLTV source) remains the gate. The Recommended HermesTV API at the bottom is a **proposal**, not a commitment, and must ride through the same gate before it ships.

Also: no real EPG provider URLs appear in this document. Examples use the placeholder `<XMLTV_URL>`.

## 1. Fetch Progress Event Sequence

IPTVnator emits IPC channel `EPG_PROGRESS_UPDATE` from the Electron main process. The Angular renderer (`EpgProgressService`) listens via `window.electron.onEpgProgress(...)` and projects updates into a `signal<Map<url, EpgImportProgress>>`. Each event has the shape:

```ts
interface EpgImportProgress {
  url: string;
  status: 'queued' | 'loading' | 'complete' | 'error';
  stats?: { totalChannels: number; totalPrograms: number };
  error?: string;
  queuePosition?: number;
}
```

The five terminal/transitional states and their emit points (from `apps/electron-backend/src/app/events/epg.events.ts` and `workers/epg-parser.worker.ts`):

| Status | Emitted when | Carrier payload |
| --- | --- | --- |
| `queued` | `handleFetchEpg` after a freshness pre-check decides the URL is stale and worth fetching; one event per URL with `queuePosition = index + 1` because URLs are processed **sequentially** (SQLite write-lock avoidance). | `queuePosition: number` |
| `loading` (READY) | Worker thread posts `READY` after boot; main process echoes `loading` with `stats: { totalChannels: 0, totalPrograms: 0 }`. The renderer flips the row from queued -> loading. | empty stats |
| `loading` (PROGRESS) | Streaming SAX parser flushes a batch (100 channels or 1000 programs) and the worker posts `EPG_PROGRESS` with running totals. Main process forwards as `loading` with the latest `stats`. | `stats: { totalChannels, totalPrograms }` (monotonic) |
| `complete` (EPG_COMPLETE) | Stream ends, SQLite inserts done, worker posts `EPG_COMPLETE`. Main process forwards `complete` with final `stats` and adds the URL to `fetchedUrls` so this session won't refetch. Renderer auto-dismisses the row 5 s later. | final `stats` |
| `error` (EPG_ERROR) | Any of: HTTP non-2xx, gunzip failure, SAX parse failure, `totalChannels === 0` (treated as failure to prevent silent bad caches), worker timeout (5 min), worker exit without complete, worker error event. Renderer auto-dismisses 5 s later but exposes a `retry(url)` action which calls `forceFetchEpg(url)` to re-enqueue. | `error: string` |

Key invariant: the sequence is always `queued -> loading(READY) -> loading(PROGRESS)*N -> {complete | error}`. The renderer treats any of `complete`/`error` as terminal and schedules removal. The `retry` path clears the row first, then re-issues `forceFetchEpg`, so a fresh `queued` event arrives clean rather than overwriting an `error` row.

## 2. Cache Strategy

IPTVnator runs two complementary caches:

**Renderer-side current-program cache** (`libs/epg/data-access/src/lib/epg.service.ts`):

- Storage: `Map<channelId, { program: EpgProgram | null, timestamp: number }>` in memory only.
- Key: `channelId` (the XMLTV `tvg-id` or normalised display name).
- TTL: 60 000 ms (`CACHE_TTL`). On hit-while-fresh: return cached. On miss or stale: round-trip to the Electron backend via `getChannelPrograms` IPC, then write the resolved current program back.
- Null-result caching: when the backend returns no programs, the service still caches `program: null` for 60 s to suppress repeat lookups during a fast-scrolling channel list.
- Eviction: lazy. Entries are overwritten on next miss; `clearCache()` empties the Map (called when an EPG refresh lands).
- Batch path: `getCurrentProgramsForChannels(channelIds)` reads cache for every id, only forwards the cache-misses to the backend, and prefers the single-IPC batch endpoint `getCurrentProgramsBatch` over per-channel `forkJoin` (the legacy fallback).

**Backend-side feed freshness gate** (`apps/electron-backend/src/app/events/epg.events.ts`):

- Storage: SQLite `epg_channels.updated_at` per `source_url` (the XMLTV feed URL), persisted on disk via Drizzle.
- TTL: 12 hours (`maxAgeHours` default in `checkEpgFreshness`). If `updated_at >= now - 12h`, the URL is "fresh" and the fetch is skipped entirely. A session-scoped `fetchedUrls: Set<string>` also blocks a second fetch within the same Electron process lifetime.
- Eviction: stale rows are not actively purged. They are overwritten by the next successful parse, which runs `clearSourceData(sourceUrl)` inside the same SQLite transaction as the first insert batch - so a fetch that yields zero channels does **not** wipe a previously good cache.
- Gzip handling: streaming SAX parser detects gzip via `shouldGunzipEpgResponse(url, response)` (URL extension `.gz` and/or `content-encoding: gzip` / `content-type: gzip`) and pipes through `zlib.createGunzip()` before SAX. Decompression and parse are interleaved with DB inserts so memory stays flat regardless of feed size.

The freshness gate is the on-disk cache; the 60 s map is the in-memory hot path.

## 3. Channel Mapping Wizard

IPTVnator does not expose a single dedicated "wizard route". The mapping flow is built from three smaller surfaces and a per-stream override field:

**Data model.**

- The XMLTV side stores `epg_channels.id` and `epg_channels.display_name` (per `libs/shared/database/src/lib/schema.ts`). Channel IDs are kept verbatim from `<channel id="...">`.
- The Xtream live-stream side carries an `epg_channel_id?: string | null` field on every stream (`libs/shared/interfaces/src/lib/xtream-live-stream.interface.ts`), passed at `enqueue` time as part of `EpgQueueEntry`. This is the override map: stream-id -> XMLTV channel-id.
- Resolution precedence in `handleGetChannelMetadata` and `handleGetChannelPrograms`:
  1. exact `epg_channels.id` match
  2. case-insensitive `epg_channels.id` match (SQLite `COLLATE NOCASE`)
  3. exact `epg_channels.display_name` match
  4. case-insensitive `epg_channels.display_name` match

**Flow.**

1. After an XMLTV feed parses, the renderer can list all channels via `EPG_GET_CHANNELS` and all programs by range via `EPG_GET_CHANNELS_BY_RANGE`.
2. For each Xtream live stream whose `epg_channel_id` is set, `EpgQueueService` pre-fetches the locally parsed XMLTV current-program in a single batched IPC and stores the result in `xmltvPreviewByStreamId`. If the per-stream Xtream API call later returns no programs, the XMLTV pre-fetch is used as a fallback.
3. Unmatched streams are visible to the operator only as channels with no "now/next" rendering. The fix surface in IPTVnator is settings-driven (editing the playlist row's `epg_channel_id` value via the Xtream portal channel list / playlist editor); there is no modal "Fix mapping" wizard exposed at a single route.

**Per-channel override persistence path in IPTVnator.**

The override lives in the playlist row itself (Xtream stream metadata persisted via Drizzle in `apps/electron-backend/src/app/database/operations/content.operations.ts`), not in a separate user-override table. Changing the override is therefore an edit of the playlist's stream rows. This is simpler than a sidecar mapping table but ties the override lifetime to the playlist.

## 4. Gap Analysis vs DaveTV

Against `services/hermes-tv-api/src/lib/epgWaterfall.js`, `src/integrations/xmltv.js`, and `src/routes/epg.js`:

**Progress events not yet emitted by HermesTV.**

DaveTV's `routes/epg.js` issues a synchronous response per `GET /api/epg` request that bundles fetch + parse + map + filter. There is no incremental progress channel: clients see a single JSON body when everything finishes (or `_meta.source = 'no-epg'` when no source is configured). The IPTVnator `queued -> loading(READY) -> loading(PROGRESS) -> complete | error` vocabulary has no counterpart. A long XMLTV feed simply blocks one Express request.

**Mapping wizard not exposed at a route.**

`/api/epg/suggest-channels` exists and returns substring+token-overlap scored matches from the live catalog. `/api/epg/mapping` accepts a `channel_id` + `epg_id` POST and writes to in-memory `EPG_MAPPING`. There is **no** GET endpoint that lists the currently unmatched channels (XMLTV tvg-ids that resolved no playable catalog item, or playable channels with no XMLTV match). The wizard loop "list unmatched, suggest, accept" is broken at the discovery step.

**Per-channel override map persistence path.**

`EPG_MAPPING` in `routes/epg.js` is in-memory only ("resets on restart"). A separate static file `services/hermes-tv-api/src/data/channelMap.json` is loaded by `integrations/xmltv.js#applyChannelMap` and applied as `xmltvId -> hermesCatalogId`. There are two override maps with no shared writer. Persistence path for operator-set overrides is undefined.

## 5. Recommended HermesTV API

Both endpoints honour the existing security contract (no credential URLs ever leave the server) and the empty-state contract (no fake content; honest 0 when no source is configured).

**`GET /api/epg/import-progress` (SSE).** Server-Sent Events stream mirroring the IPTVnator progress vocabulary:

- Content type: `text/event-stream`.
- Event names: `queued`, `loading`, `complete`, `error`. Payload JSON per event matches `EpgImportProgress` minus the renderer-only fields, plus a stable `import_id` so a client reconnecting mid-stream can resume.
- Lifecycle: opens an import for every URL in the registry waterfall (`buildEpgUrlCandidatesFromRegistryRows`). One stream per server boot; multiple clients fan-out.
- Backpressure: events emitted at parse-batch granularity (mirror IPTVnator's CHANNEL_BATCH_SIZE = 100, PROGRAM_BATCH_SIZE = 1000). Heartbeat comment every 15 s to keep the SSE connection alive through corporate proxies.
- Honest empty: if no candidates are configured, the stream opens, emits a single `complete` with `stats: { totalChannels: 0, totalPrograms: 0, message: "no-epg" }`, and closes.

**`/api/epg/mapping-wizard`.** Two methods on the same path:

- `GET /api/epg/mapping-wizard` returns the current unmatched set. Shape:
  ```json
  {
    "unmatched_xmltv_channels": [ { "tvg_id": "...", "display_name": "...", "logo_url": null } ],
    "unmatched_playable_channels": [ { "catalog_item_id": "...", "name": "...", "provider_id": "..." } ],
    "current_overrides": { "<catalog_item_id>": "<tvg_id>" },
    "_meta": { "source": "xmltv-merged", "generated_utc": "..." }
  }
  ```
  Computed by intersecting `epgWaterfall.buildPlayableEpgIndex` against the merged XMLTV result and listing the residuals on both sides.

- `POST /api/epg/mapping-wizard` accepts `{ catalog_item_id, tvg_id, profile_id }` and persists the mapping. Persistence target is a single on-disk JSON file (initially) at `services/hermes-tv-api/src/data/channelMap.user.json`, merged on top of `channelMap.json` at `applyChannelMap` time. This is the unified writer that `EPG_MAPPING` currently lacks. Validation: both ids must exist in the corresponding unmatched lists at request time; otherwise 400.

Once the user overrides land in `channelMap.user.json`, `integrations/xmltv.js` already has the apply path - it just needs to merge user-overrides on top of the static map and bust its `_channelMap = null` cache on POST.

## Sources Cited

- `G:\Github\IPTV-Apps\iptvnator\libs\epg\data-access\src\lib\epg.service.ts`
- `G:\Github\IPTV-Apps\iptvnator\libs\epg\data-access\src\lib\epg-progress.service.ts`
- `G:\Github\IPTV-Apps\iptvnator\libs\epg\data-access\src\lib\epg-program-normalization.util.ts`
- `G:\Github\IPTV-Apps\iptvnator\apps\electron-backend\src\app\events\epg.events.ts`
- `G:\Github\IPTV-Apps\iptvnator\apps\electron-backend\src\app\workers\epg-parser.worker.ts`
- `G:\Github\IPTV-Apps\iptvnator\libs\portal\xtream\data-access\src\lib\services\epg-queue.service.ts`
- `G:\Github\IPTV-Apps\iptvnator\libs\ui\epg\src\lib\epg-progress-panel\epg-progress-panel.component.ts`
- `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\lib\epgWaterfall.js`
- `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\integrations\xmltv.js`
- `G:\Github\HermesTV-Tizen-AI\services\hermes-tv-api\src\routes\epg.js`
