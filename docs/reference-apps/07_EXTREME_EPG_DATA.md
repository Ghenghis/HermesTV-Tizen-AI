# 07 - Extreme-InfiniTV EPG Data Layer - Pattern Extraction

Generated: 2026-05-20
Agent: 08 of 20 (DaveTV reference-extraction swarm)
Upstream: `G:\Github\IPTV-Apps\Extreme-InfiniTV\src\scripts\lib\epg-data.js`, `src\scripts\lib\epg-worker.ts`, `src\scripts\epg\mapping.ts`, `src\scripts\epg\epg.ts`, `src\scripts\lib\preferences.js`, `tests\epg-data.test.ts`

## License and Attribution

Extreme-InfiniTV is **GPL-3.0-or-later**. Per HermesTV's reference-app boundary (`docs/48_REFERENCE_APPS_E2E_ADOPTION_CONTRACT.md` and `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`): this is **PATTERN-ONLY extraction**. No GPL source has been pasted into HermesTV. We re-express external behavior contracts (event names, data shapes, UX flows, resolution order) in fresh CommonJS implementations and fresh tests. Any function ported into HermesTV must be a clean-room re-write and must carry an inline attribution comment such as:

```
// Pattern adopted from Extreme-InfiniTV (GPL-3.0) - PATTERN-ONLY adoption, see docs/48.
```

No real provider URLs, credentials, or operator data appear in this document. Examples use `<XTREAM_HOST>`, `<XMLTV_URL>` placeholders.

## Contract Banner

Adopting Extreme's UI vocabulary into HermesTV does **not** satisfy any truth-gate. Provider-live proof of `/api/epg` and `/api/epg/grid` against a real XMLTV/Xtream source remains the gate. The follow-up proposals below are **proposals**, not commitments, and must ride through the gate before shipping.

## 1. Behaviors DaveTV Already Covers (Priority 3 - 106 PASS cases)

The `services/hermes-tv-api/src/lib/epgWaterfall.js` module already implements - and `services/hermes-tv-api/test/epgWaterfall.test.js` already proves under live Node 20 - the following Extreme behaviors:

| Capability | Extreme source | HermesTV file | Status |
| --- | --- | --- | --- |
| `buildEpgUrlsFromEntry` ordered source list (override -> m3u-header -> xtream-default -> additional) with dedupe and trim | `epg-data.js` `buildEpgUrlsFromEntry` | `epgWaterfall.js` `buildEpgUrlsFromEntry` | PASS |
| `disableProviderEpg` flag suppresses auto-default but keeps overrides + additional | `epg-data.js` | `epgWaterfall.js` | PASS |
| `mergeProgrammeMaps` waterfall: first source wins per tvg-id; later sources fill gaps only | `epg-data.js` `mergeProgrammeMaps` | `epgWaterfall.js` `mergeProgrammeMaps` | PASS |
| `mergeChannelNameMaps` waterfall with empty-name rejection | `epg-data.js` | `epgWaterfall.js` | PASS |
| `detectGzip` via magic bytes (0x1F 0x8B), `.gz` extension, Content-Type, Content-Disposition; query-string ignored | `epg-data.js` `detectGzip` | `epgWaterfall.js` `detectGzip` | PASS |
| `resolveTvgId`: override -> raw tvgId (if present in programmes) -> fuzzy name match | `epg-data.js` `resolveTvgId` | `epgWaterfall.js` `resolveTvgId` | PASS |
| `normaliseChannelName`: lowercase + NFD diacritic strip + quality-suffix strip (HD/FHD/UHD/4K/8K/2K/SD/720p/1080p/2160p) + collapse separators; preserve `+` for Sky+1-style timeshift channels | `epg-data.js` `normaliseChannelName` | `epgWaterfall.js` `normaliseChannelName` | PASS |
| `findBestEpgChannelByName` returns "" on ambiguity (refuses to silently pick) | `epg-data.js` | `epgWaterfall.js` | PASS |
| `buildChannelNameIndex` / `findInChannelNameIndex` for O(1) lookup with collision-null sentinel | `epg-data.js` | `epgWaterfall.js` | PASS |
| Playable catalog/source mapping: `buildPlayableEpgIndex` + `resolvePlayableEpgChannel` with strategies `tvg_id` and `name`; refuses to fabricate IDs | (extension beyond Extreme) | `epgWaterfall.js` | PASS |

Cross-reference: every contract from `tests/epg-data.test.ts` has a corresponding case in `test/epgWaterfall.test.js`. The Hermes test file additionally extends coverage to provider-aware (xtream/m3u) playable mapping which the reference app does not need (no separate provider boundary).

## 2. Per-Channel Override Map - Data Model and Flow

What is **not yet covered** in HermesTV is the operator-facing per-channel override surface. Extreme stores the mapping as a per-playlist Jellyfin-style structure:

```
preferences[playlistId].channelEpgMap : Record<channelIdAsString, tvgId>
```

Key shape contract (extracted from `preferences.js` and `epg-data.js`):

- Keys are stringified channel IDs (so numeric and string IDs share a namespace).
- Values are lowercased tvg-ids. Empty value clears the override.
- The map is `Object.create(null)` so it never inherits prototype keys.
- A change dispatches `xt:channel-epg-changed` with `{ playlistId, channelId, tvgId }`. Consumers debounce-save and re-resolve.
- `resolveTvgId(channel, overrides, programmes, channelNames)` is the **single pure resolution function**; UI code passes the cached override map in and gets back the tvg-id that programmes were keyed by.

Operator-visible badges (the UI projection of resolution outcome):
- `override` - manual map hit.
- `tvg-id` - raw `channel.tvgId` exists in the loaded XMLTV.
- `name` - fuzzy display-name match against a unique XMLTV `<display-name>`.
- `none` - no EPG for this channel.

API surface (described in prose, not implemented here): HermesTV should expose three credential-free endpoints:

- `GET /api/epg/overrides?profile_id=...` - returns the persisted map. No credentials in payload.
- `PUT /api/epg/overrides/:channel_id` body `{ tvg_id }` - sets one override; empty body clears.
- `DELETE /api/epg/overrides` - bulk clear.

Persistence stays server-side under the profile's settings table. The TV client never receives the XMLTV source URL or panel password.

## 3. Mapping Wizard - Surfacing Unmatched Channels

The Extreme wizard lives in `src/scripts/epg/mapping.ts`. Behaviorally:

1. The operator opens the "Map channels" dialog from the EPG page.
2. The dialog hydrates the active playlist's channels + the in-memory EPG state and renders a **virtualized scroll list** (60 px rows, ~6 row overscan, single delegated click listener, `mapSpacer` heightset to `filteredChannels.length * ROW_H`) so 50 k-row playlists do not jank.
3. Each row shows: logo, channel name, current tvg-id (or "no tvg-id"), and a status badge (`override` / `auto` / `auto (name)` / `unmapped`).
4. A filter bar lets the operator slice to one of: `all`, `unmapped`, `auto`, `overridden`.
5. A search input (debounced ~80 ms) token-filters on normalised "name + tvg-id".
6. Clicking a row opens a **picker sub-dialog** seeded with the channel's name as the search query. The picker shows up to 200 ranked XMLTV channels (`getAvailableEpgChannels`), each carrying the live programme count so operators prefer channels with content.
7. Picker scoring favors exact name/id match > prefix > substring; ties broken by programme count.
8. Selecting a row in the picker calls `setChannelEpgOverride(playlistId, channelId, tvgId)` and closes. Extreme briefly flags the row as `just-changed` for ~1.2 s to give visual confirmation.
9. The clear button removes the override and falls back to auto-resolution.
10. The `xt:channel-epg-changed` and `xt:epg-loaded` events both trigger a re-render of the mapping list - so external EPG refreshes or other clients' edits stay reflected.

UX-critical detail: Extreme **never silently picks** on ambiguous fuzzy matches. The mapping wizard exists precisely so operators resolve ambiguity manually. Any HermesTV port must preserve this conservatism - the `name` badge is intentionally a softer "warn" colour so operators understand it is a heuristic.

## 4. EPG Import Progress Events

Extreme emits two DOM events around EPG loading. Pattern (status set per source):

- `xt:epg-source-status` - dispatched once per `loadProgrammes` call with `detail.sources: EpgSourceStatus[]`. Each entry has `{ url, source, kind, status: 'ok' | 'error', count?, cached?, error? }`. Sources are fetched in parallel via `Promise.allSettled`; a single failure does not poison the merged result.
- `xt:epg-loaded` - dispatched when at least one source succeeded and the waterfall produced programmes. Detail: `{ playlistId, offsetMin, offsetIsAuto }`.

For a server-side HermesTV port, a richer progress event vocabulary - inspired by Extreme but extended with the byte-stream stages IPTVnator already documents (see `03_IPTVNATOR_EPG_DATA.md`) - should be:

| Stage | Carried payload | Emitted when |
| --- | --- | --- |
| `queued` | `{ url, source, kind }` | The URL is enqueued after `buildEpgUrlsFromEntry` returns it and the freshness/cache pre-check decides it is worth fetching. |
| `bytes-downloaded` | `{ url, bytes }` | Streaming fetch progress (chunked transfer encoding). Optional; can be coalesced. |
| `parsing` | `{ url }` | After detectGzip + buffer concat completes, before XMLTV stream parse begins. |
| `channels-extracted` | `{ url, count }` | A batch of `<channel>` elements flushed. Monotonic count. |
| `programs-extracted` | `{ url, count }` | A batch of `<programme>` elements flushed. Monotonic count. |
| `mapping` | `{ url }` | After parse completes, before waterfall merge into the global maps. |
| `complete` | `{ url, channels, programs, cached }` | Source finished successfully. `cached=true` if HTTP 304 + cache hit. |
| `error` | `{ url, error }` | Any failure: HTTP non-2xx, decompression, parse, DOCTYPE/ENTITY rejection, timeout (90 s in Extreme), or `channels === 0` (treated as silent failure). |

Sequencing invariant: per URL, the stream is `queued -> (bytes-downloaded*)? -> parsing -> (channels-extracted | programs-extracted)* -> mapping -> {complete | error}`. The aggregate stream emits per-URL state machines in parallel.

The transport for HermesTV should be Server-Sent Events on `/api/epg/progress?profile_id=...` rather than the DOM-event coupling Extreme uses (Extreme is single-process; HermesTV's web TV client lives across the wire).

## 5. Recommended HermesTV Follow-Up (Proposals)

These are **proposals**. Each one must ride through the live-EPG proof gate before merging.

Tests to add:
1. `test/epgOverrides.test.js` - covers the round-trip of `setChannelEpgOverride` / `getChannelEpgOverride` / bulk clear, and verifies that `resolveTvgId` agrees with the persisted map after restart (file-backed or DB-backed; not memory-only).
2. `test/epgProgress.test.js` - fakes a streaming XMLTV reader, asserts the per-URL event sequence above, and verifies that an `error` on one URL does not abort other URLs in the waterfall.
3. `test/epgMappingApi.test.js` - hits the three proposed endpoints with a mock provider registry and asserts: no credential string ever appears in any response body; no XMLTV URL ever appears; override on an unknown channel returns 404.
4. `test/epgMappingPickerScore.test.js` - pure scoring contract for the picker: exact-name > prefix > substring, ties broken by programme count. Pure function so it lives in `lib/epgWaterfall.js`.

Routes to add (proposed, prose only):
- `GET /api/epg/overrides` - profile-scoped override map.
- `PUT /api/epg/overrides/:channel_id` - set one override.
- `DELETE /api/epg/overrides/:channel_id` - clear one.
- `DELETE /api/epg/overrides` - bulk clear.
- `GET /api/epg/channels` - the playable XMLTV channel snapshot the picker dialog uses (display name + tvg-id + programme count). Already partly served by the `epgWaterfall.buildPlayableEpgIndex` machinery; needs the route surface.
- `GET /api/epg/progress` (SSE) - per-source import progress as defined in section 4.

UI flow to add to the web TV shell (and mirror to the Tizen shell): operator-visible "Map channels" affordance on `/epg` that surfaces unmapped/auto-name channels first, with a search-as-you-type picker. The dialog must NOT show any source URL, host, or credential - only display names + tvg-ids + programme counts. Closes the loop the Priority 3 fuzzy/waterfall work opened.

Hard guardrails carried over from CLAUDE memory:
- No mocks / no stubs / no seed channels in the picker - if the EPG has not been loaded, the picker shows an empty state, not synthetic rows.
- No popups before playback - the mapping dialog is reachable only from the EPG page, never from a channel card click on Live TV.
- Mom's TV path stays unlimited; only Dave's TV path carries any per-channel UI caps for the picker.

## Glossary

- **tvg-id**: XMLTV `<channel id>` value (lowercased throughout HermesTV).
- **Waterfall**: ordered merge where the first map's entries win on a key conflict.
- **Override map**: per-playlist `{ channelId -> tvgId }` operator-edited table that wins over auto-resolution.
- **Auto (tvg-id)**: the channel's declared `tvg-id` was found in the loaded XMLTV programmes.
- **Auto (name)**: no tvg-id hit; the channel name uniquely fuzzy-matches an XMLTV display-name.
- **Unmapped**: neither override nor auto resolved a tvg-id.
