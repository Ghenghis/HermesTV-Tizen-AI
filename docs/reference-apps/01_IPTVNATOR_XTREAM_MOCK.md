# 01 - IPTVnator Xtream Mock Server - Pattern Extraction

Generated: 2026-05-20
Status: REFERENCE - pattern adoption for `tools/xtream-fixture-server.js`
Upstream: `G:\Github\IPTV-Apps\iptvnator\apps\xtream-mock-server`

## License and Attribution

IPTVnator is **MIT licensed** (`G:\Github\IPTV-Apps\iptvnator\LICENSE.md`, "Copyright 2020-2021"). MIT permits unrestricted use, modification, and sublicensing provided the copyright notice is preserved. **Patterns** (shapes, dispatch model, scenario keying) are adopted here; no large verbatim TypeScript blocks are pasted. Any function ported into HermesTV must carry an inline attribution comment such as:

```
// Pattern adopted from IPTVnator (MIT) apps/xtream-mock-server.
```

## Contract Banner

Per `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md` Non-Negotiable Truth Rules 1 and 5: this fixture server **exists to prove the pipeline** end-to-end (registry to `/api/catalog` to `/api/play` to stream HEAD/GET). It does **not** replace live-provider proof. The fixture is allowed as the honest-empty / honest-edge harness for CI; provider-live jobs and post-deploy smokes remain the gates that prove a real upstream works.

## 1. Endpoint Matrix

IPTVnator exposes a single dispatcher at `GET /player_api.php` that switches on `?action=` plus a PWA proxy at `GET /xtream?url=...&action=...` that wraps the dispatcher output as `{ payload, action }`. Stream playback URLs redirect to a public HLS test stub.

| `?action=`              | Handler file                          | Response shape                                                                                                                                       | Fixture source                              |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| (none) or `get_account_info` | `get-account-info.handler.ts`    | `{ user_info: { username, password, auth: 1, status, exp_date (unix str), is_trial, active_cons, created_at, max_connections, allowed_output_formats: [m3u8, ts, rtmp] }, server_info: { url, port, https_port, server_protocol, rtmp_port, timezone: UTC, timestamp_now, time_now } }` | `scenarios.ts` accountStatus + expiryDate    |
| `get_live_categories`   | `get-categories.handler.ts`           | `[ { category_id: str, category_name: str, parent_id: 0 } ]`                                                                                          | `generators/categories.generator.ts`        |
| `get_vod_categories`    | `get-categories.handler.ts`           | same                                                                                                                                                  | same                                        |
| `get_series_categories` | `get-categories.handler.ts`           | same                                                                                                                                                  | same                                        |
| `get_live_streams`      | `get-streams.handler.ts`              | `[ { num, name, stream_type: live, stream_id, stream_icon, epg_channel_id, added, category_id, custom_sid, direct_source, tv_archive, tv_archive_duration, rating_imdb } ]` filtered by optional `category_id` | `generators/live.generator.ts`              |
| `get_vod_streams`       | `get-streams.handler.ts`              | `[ { num, name, stream_type: movie, stream_id, stream_icon, added, category_id, rating, rating_5based, rating_imdb, container_extension (mkv/mp4/avi), type: movie } ]` | `generators/vod.generator.ts`               |
| `get_series`            | `get-streams.handler.ts`              | `[ { num, name, series_id, cover, plot, cast, director, genre, releaseDate, last_modified, rating, rating_5based, backdrop_path: [], youtube_trailer, episode_run_time, category_id: int } ]` | `generators/series.generator.ts`            |
| `get_vod_info`          | `get-vod-info.handler.ts`             | `{ info: { tmdb_id, name, cover_big, movie_image, releasedate, episode_run_time, director, actors, cast, plot, mpaa_rating, country, genre, backdrop_path: [], duration_secs, duration, video, audio, bitrate, rating, rating_imdb } OR [] (empty-metadata scenario), movie_data: { stream_id, name, added, category_id, container_extension, ... } }` | `generators/vod.generator.ts` + cache       |
| `get_series_info`       | `get-series-info.handler.ts`          | `{ seasons: [ { air_date, episode_count, id, name, overview, season_number, cover, cover_big } ], info: { name, cover, plot, cast, director, genre, releaseDate, rating, rating_5based, backdrop_path: [], episode_run_time, category_id: str }, episodes: { "1": [ { id, episode_num, title, container_extension, info: { tmdb_id, releasedate, plot, duration_secs, duration, movie_image, bitrate, rating }, season, added } ] } }` | `generators/series.generator.ts` + cache    |
| `get_short_epg`         | `get-short-epg.handler.ts`            | `{ epg_listings: [ ...EPG, capped at limit (default 12, max 50), starts from first listing whose stop_timestamp >= now ] }`                            | `data-store.getShortEpgListings`            |
| `get_simple_data_table` (alias `get_simple_date_table`) | `get-full-epg.handler.ts` | `{ epg_listings: [ { id, epg_id, title (base64), lang, start (YYYY-MM-DD HH:mm:ss), end, description (base64), channel_id, start_timestamp (unix str), stop_timestamp (unix str) } ] }` window: 2 days back, 3 days forward, 30-min slots | `generators/live.generator.ts`              |
| **unknown**             | `dispatch.ts` default                 | **HTTP 400** `{ error: "Unknown action: <x>" }`                                                                                                       | n/a                                         |

**Auth shape note.** IPTVnator's mock never returns `auth: 0` - it accepts any credentials and instead distinguishes scenarios via `status: "Disabled"` or expired `exp_date`. HermesTV's current fixture **does** return `auth: 0` on credential mismatch, which is closer to real Xtream panels and should be preserved alongside the IPTVnator scenarios.

**PWA wrapper.** `GET /xtream?url=<serverUrl>&action=<a>&username=u&password=p` - same query is reflected into the dispatcher and the body is rewrapped as `{ payload, action }` to match the IPTVnator PWA client.

**Health and reset.** `GET /health` returns `{ status: ok, server, port }`. `POST /reset` clears all in-memory caches (portal, vodDetails, seriesInfo). Useful for between-test isolation.

## 2. Scenario Matrix

Scenarios are keyed by the **literal `username:password` pair**. Unknown pairs fall through to an `auto` scenario whose seed is a hash of the credentials, so any user gets a deterministic catalog without an explicit entry.

| Key                       | Name                | Trigger                              | Catalog shape                          | Response delta                                                          |
| ------------------------- | ------------------- | ------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| `user1:pass1`             | default             | exact creds                          | 8/8/8 cats x 40 items, 3 seasons x 8 ep | Active, `exp_date=2099-12-31`                                            |
| `large:large`             | large               | exact creds                          | 20/20/20 x 200, 5 x 12                  | Active                                                                  |
| `stress:stress`           | stress              | exact creds                          | 16/16/16 x 120, 4 x 10                  | Active - sized for import/delete CI churn                                |
| `series:series`           | series-heavy        | exact creds                          | 3/4/15 x 30, 6 x 10                     | Active - series-dominant catalog                                         |
| `minimal:minimal`         | minimal             | exact creds                          | 2/2/2 x 5, 1 x 3                        | Active - edge-case empty-ish catalog                                     |
| `epg:epg`                 | epg-fixture         | exact creds                          | 2 live cats x 3 items                   | EPG hand-crafted around current minute and next UTC midnight; archive flag set; channel offsets simulate timezone drift |
| `emptyvod:emptyvod`       | empty-vod-metadata  | exact creds                          | 2/2/2 x 5                               | `get_vod_info` returns `{ info: [] }` for every VOD - tests metadata-absent fallback path |
| `marketing:marketing`     | marketing-demo      | exact creds                          | 4/4/4 x 6                               | Fictional curated names/descriptions, local SVG/PNG artwork via `/assets/marketing/...` |
| `expired:expired`         | expired             | exact creds                          | 4/4/4 x 10                              | `status=Active` but `exp_date=2020-01-01` (past) - tests expiry UI       |
| `inactive:inactive`       | inactive            | exact creds                          | 4/4/4 x 10                              | `status=Disabled` and `exp_date=2020-01-01` - tests disabled-account UI  |
| **anything else**         | auto                | unknown creds                        | 6/6/6 x 30, 3 x 8                       | Active, seed = char-hash of `user:pass` (deterministic per pair)         |

Caches are warm-on-first-request and persist for process lifetime; `POST /reset` clears them between scenarios.

**Notable absences from IPTVnator scenarios.** None of the predefined scenarios model: `auth=0` invalid-credentials, HTTP 5xx provider outage, max-connections exceeded (active_cons hard-coded to "1"), rate-limited 429, partial outage where one category is missing, or empty-catalog (closest is `minimal`, which still has 2 categories). See gap analysis below.

## 3. Stream URL Patterns

IPTVnator handles five stream URL shapes and every one redirects to a single public test HLS URL (no real fixture bytes). HermesTV's current implementation is **stricter** and returns real HLS playlist text + 188-byte TS sync-byte buffers honoring Range headers.

| Pattern                                                           | Verb        | Response                                                                          |
| ----------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `/live/:username/:password/:streamId.m3u8`                        | GET         | 302 -> `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`                          |
| `/live/:username/:password/:streamId.ts`                          | GET         | 302 -> same HLS                                                                    |
| `/movie/:username/:password/:streamId.:ext`                       | GET         | 302 -> same HLS (ext can be `mp4`/`mkv`/`avi`)                                     |
| `/series/:username/:password/:streamId.:ext`                      | GET         | 302 -> same HLS                                                                    |
| `/timeshift/:username/:password/:duration/:start/:streamId.ts`    | ALL         | 302 -> same HLS (catchup form, `start` = `YYYY-MM-DD:HH-mm`, `duration` in min)    |
| `/streaming/timeshift.php`                                        | ALL         | 302 -> same HLS (legacy panel form)                                                |

**Catchup URL form** (used when `tv_archive=1` on a channel and `tv_archive_duration` allows the requested offset): `/timeshift/<u>/<p>/<duration_min>/<YYYY-MM-DD:HH-mm>/<stream_id>.ts`. HermesTV's fixture does **not** yet handle this path.

**Asset stub.** `GET /assets/marketing/:kind/:slug` returns either a cached PNG raster from `apps/xtream-mock-server/public/marketing/<kind>/<slug>.png` or a synthesized SVG at request time (`marketing.generator.ts:renderMarketingAssetSvg`). Used only by the `marketing-demo` scenario.

## 4. Data Generation Patterns

- **Determinism**: every scenario carries a numeric `seed`. The dispatcher calls `faker.seed(scenario.seed)` before any random call, so two requests with the same credentials produce identical catalogs across restarts.
- **Stable ID bases**: live `10_000+`, VOD `20_000+`, series `30_000+`, episode `50_000+`. Category bases: live `101+`, VOD `201+`, series `301+`. Marketing bases shifted into the `52_000`/`62_000`/`72_000`/`82_000` ranges to avoid collision.
- **EPG encoding**: `title` and `description` fields are **base64-encoded**. The `start`/`end` fields use `YYYY-MM-DD HH:mm:ss` (no timezone suffix); `start_timestamp`/`stop_timestamp` are unix seconds as strings.
- **EPG window**: default is 2 days back + 3 days forward, 30-minute slots = 240 listings per stream. The `epg-fixture` scenario hand-crafts 6 listings anchored to `now` and the next UTC midnight to exercise current-program detection and timezone-drift handling.
- **VOD container variation**: streams round-robin through `mkv`/`mp4`/`avi` to test multi-extension URL resolution.
- **Caching**: `portalCache`, `vodDetailsCache`, `seriesInfoCache` are process-scoped Maps. First `get_account_info` warms the catalog; lazy generation for VOD/series detail on first detail-request.

## 5. Gap Analysis - HermesTV vs IPTVnator

Checklist of patterns IPTVnator implements that `tools/xtream-fixture-server.js` does **not** yet implement:

- [ ] **Multiple credential scenarios.** HermesTV accepts only the env-supplied `XTREAM_FIXTURE_USER`/`PASS`; IPTVnator's scenario map covers default/large/stress/series-heavy/minimal/epg/empty-vod/marketing/expired/inactive plus auto-fallback.
- [ ] **Expired-account scenario.** No way to trigger `exp_date in past + status=Active`.
- [ ] **Disabled-account scenario.** No way to trigger `status=Disabled`.
- [ ] **Empty-VOD-metadata scenario.** `get_vod_info` always returns a populated object - need branch that returns `{ info: [] }` to exercise metadata-absent fallback.
- [ ] **Large catalog.** Only 3 channels / 1 VOD / 1 series - cannot stress-test pagination, virtualization, EPG batching.
- [ ] **Stress catalog.** No deterministic CI-sized churn fixture.
- [ ] **EPG timezone fixture.** HermesTV returns a single hard-coded `get_short_epg` with base64 title; no multi-listing window, no UTC midnight boundary, no archive flag, no rawString offset.
- [ ] **Full-day EPG window.** `get_simple_data_table` returns the same single record - no 5-day, 30-minute-slot listing.
- [ ] **Catchup / timeshift URL routes.** `/timeshift/<u>/<p>/<dur>/<start>/<id>.ts` and `/streaming/timeshift.php` are absent.
- [ ] **PWA proxy wrapper.** No `/xtream?url=...` endpoint that returns `{ payload, action }`.
- [ ] **POST /reset.** No way to clear caches between tests programmatically.
- [ ] **Seeded determinism across runs.** HermesTV fixtures are static literals; equivalent and arguably simpler, but does not exercise IPTVnator's `faker.seed`-style generators.
- [ ] **`category_id` filter on streams.** IPTVnator filters when `?category_id=` is present; HermesTV currently returns the full list regardless.
- [ ] **Series with multiple seasons and episode counts driven by scenario.** Only 1 series with 2 single-episode seasons.
- [ ] **Unknown action 400.** HermesTV returns `200 []` for unknown actions; real Xtream panels and IPTVnator return 400 / error - matters for client error-path tests.

Items HermesTV does **better** and should keep:

- Returns real HLS playlist text and 188-byte TS bytes (not a 302 stub) - lets `hlsProxy`/`streamResolver` exercise content-type and range plumbing.
- Honors `Range:` headers with `206 Partial Content`.
- Returns `auth: 0` on credential mismatch (closer to real panels than IPTVnator's "accept everything").
- Serves a working `/get.php` m3u_plus export and `/xmltv.php` XMLTV doc - IPTVnator has neither.

## 6. Recommended HermesTV Follow-Up

File-by-file diff hints for `tools/xtream-fixture-server.js` (and adjacent test code). Adopt only the **shape** of each IPTVnator helper; do not paste TypeScript verbatim.

### `tools/xtream-fixture-server.js`

1. **Add `SCENARIOS` map** near top after fixture constants:
   - Key `username:password`, value `{ name, seed, accountStatus, expDateSec, liveCount, vodCount, seriesCount, vodInfoMode: full | empty, epgMode: single | window | timezone }`.
   - Add `getScenario(user, pass)` with fallback to default + char-hash seed.

2. **Rewrite `authOk`** to return a scenario object rather than a boolean. Pass the scenario through `userInfoBlock` so `status` / `exp_date` come from the scenario, not hard-coded.

3. **New helper `expandCatalog(scenario)`** that, when scenario asks for more than the static 3 channels / 1 VOD / 1 series, programmatically appends extra entries with IDs in the `10_000+` / `20_000+` / `30_000+` ranges. Make it deterministic via a small linear-congruential generator seeded by scenario.seed - **do not** bring in `@faker-js/faker` (Hermes runtime stays dep-free).

4. **Branch `get_vod_info`** on `scenario.vodInfoMode === 'empty'` to return `{ info: [] }`. Add a `vod_id required` 400 branch when the param is missing.

5. **Branch `get_short_epg` / `get_simple_data_table`** on `scenario.epgMode`:
   - `single`: existing behavior.
   - `window`: generate 240 listings, 2 days back to 3 days forward, 30-minute slots, base64 title/desc, `start_timestamp`/`stop_timestamp` as unix string.
   - `timezone`: 6 hand-crafted listings around `Date.now()` and the next UTC midnight, with a `rawStringOffsetSeconds` of `-2 * 3600` applied to the human-readable `start`/`end` to simulate a non-UTC channel header.
   - Honor `?stream_id=` filter and `?limit=` (cap at 50).

6. **Filter streams by `?category_id=`** in `get_live_streams` / `get_vod_streams` / `get_series` when present.

7. **Add catchup / timeshift routes**:
   - `/timeshift/<u>/<p>/<duration>/<start>/<id>.ts` and `/streaming/timeshift.php` - return the same TS bytes as live, optionally with a `X-Hermes-Catchup-Offset` debug header to let tests assert the path was hit.

8. **Add `/xtream` PWA proxy wrapper** - reflect query into the dispatcher and rewrap as `{ payload, action }`. Useful for Tizen / PWA cross-origin testing.

9. **Add `POST /reset`** that clears any cache the scenario expansion path builds.

10. **Return 400 on unknown actions** (`{ error: "Unknown action: <x>" }`) instead of `200 []`. Update any internal tests that currently rely on the lax behavior.

### `services/hermes-tv-api/test/`

11. **Add `test/xtreamScenarios.e2e.test.js`** that starts the fixture once and walks through each scenario credential pair, asserting:
    - default returns >0 categories/streams,
    - `expired` puts `exp_date` in past with `status=Active`,
    - `inactive` returns `status=Disabled`,
    - `emptyvod` returns `{ info: [] }` from `get_vod_info`,
    - `epg-window` returns >=240 EPG listings,
    - unknown action returns 400.

### `docs/46_PROVIDER_TRUTH_PROOF_CONTRACT.md`

12. Add a note that the fixture's `expired`/`inactive` scenarios are recognized **honest-edge** harnesses and remain distinct from live-provider proof.

## Appendix: Short Snippets (Attributed)

Short (<5 line) pattern excerpts retained for clarity, MIT-IPTVnator:

**Credential seed hash** (`scenarios.ts`):

```
return str.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0, 0) >>> 0;
```

**Base64 EPG title** (`live.generator.ts`):

```
title: Buffer.from(title).toString('base64'),
start_timestamp: String(startTimestamp),
```

**Dispatch default** (`dispatch.ts`):

```
default: res.status(400).json({ error: `Unknown action: ${action}` });
```

End of reference extraction.
